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
 */

const ROUTE_STALE_MS = 5 * 60 * 1000;      // 5 minutes
const ROUTE_ORIGIN_DRIFT_M = 500;          // Meters before recompute

// OSRM public demo server (for development only)
// TODO: Replace with Railway-hosted instance for production
const OSRM_URL = "https://router.project-osrm.org";

/**
 * Calculate distance between two points (Haversine)
 */
function haversineDistance(
    lat1: number,
    lng1: number,
    lat2: number,
    lng2: number
): number {
    const R = 6371000;
    const dLat = ((lat2 - lat1) * Math.PI) / 180;
    const dLng = ((lng2 - lng1) * Math.PI) / 180;
    const a =
        Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos((lat1 * Math.PI) / 180) *
        Math.cos((lat2 * Math.PI) / 180) *
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
        originLat: v.number(),
        originLng: v.number(),
        destLat: v.number(),
        destLng: v.number(),
    },
    handler: async (ctx, args) => {
        const { sessionId, participantId, originLat, originLng, destLat, destLng } = args;

        try {
            // Call OSRM routing API
            const url = `${OSRM_URL}/route/v1/driving/${originLng},${originLat};${destLng},${destLat}?overview=full&geometries=polyline`;

            const response = await fetch(url);
            if (!response.ok) {
                throw new Error(`OSRM error: ${response.status}`);
            }

            const data = await response.json();

            if (!data.routes || data.routes.length === 0) {
                throw new Error("No route found");
            }

            const route = data.routes[0];
            const polyline = route.geometry;
            const distanceMeters = route.distance;
            const etaSeconds = route.duration;

            // Cache the route in the database
            await ctx.runMutation(internal.eta.cacheRoute, {
                sessionId,
                participantId,
                polyline,
                distanceMeters,
                etaSeconds,
                originLat,
                originLng,
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
        originLat: v.number(),
        originLng: v.number(),
    },
    handler: async (ctx, args) => {
        const { sessionId, participantId, polyline, distanceMeters, etaSeconds, originLat, originLng } = args;

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
                originLat,
                originLng,
                computedAt: now,
            });
        } else {
            await ctx.db.insert("routes", {
                sessionId,
                participantId,
                polyline,
                distanceMeters,
                etaSeconds,
                originLat,
                originLng,
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
                    route.originLat,
                    route.originLng,
                    presence.lat,
                    presence.lng
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
                route.originLat,
                route.originLng,
                presence.lat,
                presence.lng
            );
            if (drift > ROUTE_ORIGIN_DRIFT_M) {
                return { needsCompute: true, reason: "drift" };
            }
        }

        return { needsCompute: false };
    },
});
