import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

/**
 * Destination Service - Waypoint Engine
 * 
 * Manages the shared destination (Waypoint) for a session.
 * All participants navigate toward this single point.
 */

/**
 * Set the session destination (Waypoint)
 * 
 * When destination changes:
 * - All cached routes become stale
 * - ETA will be recomputed for all participants
 */
export const setWaypoint = mutation({
    args: {
        sessionId: v.id("sessions"),
        latitude: v.number(),
        longitude: v.number(),
        name: v.optional(v.string()),
    },
    handler: async (ctx, { sessionId, latitude, longitude, name }) => {
        const session = await ctx.db.get(sessionId);
        if (!session) {
            throw new Error("Session not found");
        }

        if (session.status !== "active") {
            throw new Error("Session not active");
        }

        // Update destination
        await ctx.db.patch(sessionId, {
            destination: {
                latitude,
                longitude,
                name,
                updatedAt: Date.now()
            },
        });

        // Invalidate all cached routes for this session
        // (they need to be recomputed to the new destination)
        const routes = await ctx.db
            .query("routes")
            .withIndex("by_session", (q) => q.eq("sessionId", sessionId))
            .collect();

        for (const route of routes) {
            await ctx.db.delete(route._id);
        }

        return { success: true };
    },
});

/**
 * Clear the session destination
 */
export const clearWaypoint = mutation({
    args: {
        sessionId: v.id("sessions"),
    },
    handler: async (ctx, { sessionId }) => {
        const session = await ctx.db.get(sessionId);
        if (!session) {
            throw new Error("Session not found");
        }

        await ctx.db.patch(sessionId, {
            destination: undefined,
        });

        // Clear all routes
        const routes = await ctx.db
            .query("routes")
            .withIndex("by_session", (q) => q.eq("sessionId", sessionId))
            .collect();

        for (const route of routes) {
            await ctx.db.delete(route._id);
        }

        return { success: true };
    },
});

/**
 * Get the current destination
 */
export const getWaypoint = query({
    args: {
        sessionId: v.id("sessions"),
    },
    handler: async (ctx, { sessionId }) => {
        const session = await ctx.db.get(sessionId);
        if (!session) return null;

        return session.destination ?? null;
    },
});
