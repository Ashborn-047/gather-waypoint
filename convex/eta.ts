import { action, query, internalMutation } from "./_generated/server";
import { v } from "convex/values";
import { internal } from "./_generated/api";

/**
 * ETA Service - Waypoint Engine
 * 
 * Computes routes and ETAs via OSRM routing service.
 * Routes are cached and recomputed only when:
 * - Destination changes
 * - Participant moves >500m from route origin
 * - Route is older than 5 minutes
 * 
 * PRODUCTION: RAILWAY_ROUTING_URL is REQUIRED
 * DEVELOPMENT: Falls back to public OSRM (not for production)
 */

const ROUTE_STALE_MS = 5 * 60 * 1000;      // 5 minutes
const ROUTE_ORIGIN_DRIFT_M = 500;          // Meters before recompute

// Railway OSRM routing service URL
const RAILWAY_ROUTING_URL = process.env.RAILWAY_ROUTING_URL;

// Development fallback (MUST be removed in production)
const DEV_FALLBACK_URL = "https://router.project-osrm.org";

// Determine if we're in production
const IS_PRODUCTION = process.env.NODE_ENV === "production" ||
    process.env.CONVEX_CLOUD_URL?.includes("convex.cloud");

function getRoutingUrl(): string {
    if (RAILWAY_ROUTING_URL) {
        return RAILWAY_ROUTING_URL;
    }

    if (IS_PRODUCTION) {
        throw new Error(
            "RAILWAY_ROUTING_URL is required in production. " +
            "Set this environment variable in the Convex dashboard."
        );
    }

    console.warn(
        "⚠️ DEVELOPMENT MODE: Using public OSRM fallback. " +
        "Set RAILWAY_ROUTING_URL for production."
    );
    return DEV_FALLBACK_URL;
}

/**
 * Calculate distance between two points (Haversine)
 */
function haversineDistance(
    latitude1: number,
    longitude1: number,
    latitude2: number,
    longitude2: number
): number {
    const R = 6371000;
    const dLat = ((latitude2 - latitude1) * Math.PI) / 180;
    const dLng = ((longitude2 - longitude1) * Math.PI) / 180;
    const a =
        Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos((latitude1 * Math.PI) / 180) *
        Math.cos((latitude2 * Math.PI) / 180) *
        Math.sin(dLng / 2) *
        Math.sin(dLng / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
}

/**
 * Compute route for a participant (Convex action)
 * 
 * This calls the external OSRM API and caches the result.
 */
export const computeRoute = action({
    args: {
        sessionId: v.id("sessions"),
        participantId: v.id("participants"),
        originLatitude: v.number(),
        originLongitude: v.number(),
        destLatitude: v.number(),
        destLongitude: v.number(),
    },
    handler: async (ctx, args) => {
        const { sessionId, participantId, originLatitude, originLongitude, destLatitude, destLongitude } = args;

        try {
            // Call OSRM routing API - Use GeoJSON for easier map rendering
            const osrmUrl = getRoutingUrl();
            const url = `${osrmUrl}/route/v1/driving/${originLongitude},${originLatitude};${destLongitude},${destLatitude}?overview=full&geometries=geojson`;

            const response = await fetch(url);
            if (!response.ok) {
                throw new Error(`OSRM error: ${response.status}`);
            }

            const data = await response.json();

            if (!data.routes || data.routes.length === 0) {
                throw new Error("No route found");
            }

            const route = data.routes[0];
            const polyline = JSON.stringify(route.geometry); // Store GeoJSON as string
            const distanceMeters = route.distance;
            const etaSeconds = route.duration;

            // Cache the route in the database
            await ctx.runMutation(internal.eta.cacheRoute, {
                sessionId,
                participantId,
                polyline,
                distanceMeters,
                etaSeconds,
                originLatitude,
                originLongitude,
            });

            return {
                success: true,
                polyline,
                distanceMeters,
                etaSeconds,
            };
        } catch (error) {
            console.error("Route computation failed:", error);
            return {
                success: false,
                error: String(error),
            };
        }
    },
});

/**
 * Internal mutation to cache route data
 */
export const cacheRoute = internalMutation({
    args: {
        sessionId: v.id("sessions"),
        participantId: v.id("participants"),
        polyline: v.string(),
        distanceMeters: v.number(),
        etaSeconds: v.number(),
        originLatitude: v.number(),
        originLongitude: v.number(),
    },
    handler: async (ctx, args) => {
        const { sessionId, participantId, polyline, distanceMeters, etaSeconds, originLatitude, originLongitude } = args;

        // Check for existing route
        const existing = await ctx.db
            .query("routes")
            .withIndex("by_participant", (q) => q.eq("participantId", participantId))
            .first();

        const now = Date.now();

        if (existing) {
            await ctx.db.patch(existing._id, {
                polyline,
                distanceMeters,
                etaSeconds,
                originLatitude,
                originLongitude,
                computedAt: now,
            });
        } else {
            await ctx.db.insert("routes", {
                sessionId,
                participantId,
                polyline,
                distanceMeters,
                etaSeconds,
                originLatitude,
                originLongitude,
                computedAt: now,
            });
        }
    },
});

/**
 * Get ETAs for all participants in a session
 * 
 * Returns cached ETA data. Clients should trigger route recomputation
 * when data is stale (via computeRoute action).
 */
export const getETAs = query({
    args: {
        sessionId: v.id("sessions"),
    },
    handler: async (ctx, { sessionId }) => {
        const now = Date.now();

        // Get session destination
        const session = await ctx.db.get(sessionId);
        if (!session?.destination) {
            return { hasDestination: false, etas: [] };
        }

        // Get all routes
        const routes = await ctx.db
            .query("routes")
            .withIndex("by_session", (q) => q.eq("sessionId", sessionId))
            .collect();

        // Get all presence data for drift detection
        const presenceRecords = await ctx.db
            .query("presence")
            .withIndex("by_session", (q) => q.eq("sessionId", sessionId))
            .collect();

        const presenceMap = new Map(
            presenceRecords.map((p) => [p.participantId.toString(), p])
        );

        // Build ETA response
        const etas = routes.map((route) => {
            const presence = presenceMap.get(route.participantId.toString());

            // Determine if route is stale
            const isTimeStale = now - route.computedAt > ROUTE_STALE_MS;
            const isDriftStale = presence
                ? haversineDistance(
                    route.originLatitude,
                    route.originLongitude,
                    presence.latitude,
                    presence.longitude
                ) > ROUTE_ORIGIN_DRIFT_M
                : false;

            return {
                participantId: route.participantId,
                polyline: route.polyline,
                distanceMeters: route.distanceMeters,
                etaSeconds: route.etaSeconds,
                computedAt: route.computedAt,
                isStale: isTimeStale || isDriftStale,
            };
        });

        return {
            hasDestination: true,
            destination: session.destination,
            etas,
        };
    },
});

/**
 * Check if a participant's route needs recomputation
 */
export const checkRouteStale = query({
    args: {
        participantId: v.id("participants"),
    },
    handler: async (ctx, { participantId }) => {
        const now = Date.now();

        const route = await ctx.db
            .query("routes")
            .withIndex("by_participant", (q) => q.eq("participantId", participantId))
            .first();

        if (!route) {
            return { needsCompute: true, reason: "no_route" };
        }

        // Check time staleness
        if (now - route.computedAt > ROUTE_STALE_MS) {
            return { needsCompute: true, reason: "time_stale" };
        }

        // Check drift
        const presence = await ctx.db
            .query("presence")
            .withIndex("by_participant", (q) => q.eq("participantId", participantId))
            .first();

        if (presence) {
            const drift = haversineDistance(
                route.originLatitude,
                route.originLongitude,
                presence.latitude,
                presence.longitude
            );
            if (drift > ROUTE_ORIGIN_DRIFT_M) {
                return { needsCompute: true, reason: "drift" };
            }
        }

        return { needsCompute: false };
    },
});
