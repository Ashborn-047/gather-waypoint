import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

/**
 * Session Service - Waypoint Engine
 * 
 * Handles session lifecycle: create, join, leave, end.
 * Sessions are the PRIMARY UNIT OF SCALE in Waypoint.
 */

// Participant color palette
const COLORS = [
    "#34D399", // Emerald (creator)
    "#60A5FA", // Blue
    "#F472B6", // Pink
    "#FBBF24", // Amber
    "#A78BFA", // Purple
    "#FB923C", // Orange
    "#14B8A6", // Teal
    "#EC4899", // Fuchsia
];

// Generate a 6-char alphanumeric code (no ambiguous chars)
function generateCode(): string {
    const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    let code = "";
    for (let i = 0; i < 6; i++) {
        code += chars[Math.floor(Math.random() * chars.length)];
    }
    return code;
}

// Session TTL: 4 hours
const SESSION_TTL_MS = 4 * 60 * 60 * 1000;

/**
 * Create a new Gather session
 */
export const createSession = mutation({
    args: {
        deviceId: v.string(),
        displayName: v.string(),
    },
    handler: async (ctx, { deviceId, displayName }) => {
        // Generate unique code
        let code = generateCode();
        let existing = await ctx.db
            .query("sessions")
            .withIndex("by_code", (q) => q.eq("code", code))
            .first();

        // Ensure uniqueness (retry if collision)
        let attempts = 0;
        while (existing && attempts < 10) {
            code = generateCode();
            existing = await ctx.db
                .query("sessions")
                .withIndex("by_code", (q) => q.eq("code", code))
                .first();
            attempts++;
        }

        const now = Date.now();

        // Create session
        const sessionId = await ctx.db.insert("sessions", {
            code,
            destination: undefined,
            status: "active",
            createdAt: now,
            expiresAt: now + SESSION_TTL_MS,
        });

        // Auto-add creator as first participant
        const participantId = await ctx.db.insert("participants", {
            sessionId,
            deviceId,
            displayName,
            color: COLORS[0], // Creator gets emerald
            joinedAt: now,
            lastSeenAt: now,
        });

        // Initialize empty presence for creator
        await ctx.db.insert("presence", {
            participantId,
            sessionId,
            latitude: 0,
            longitude: 0,
            updatedAt: now,
        });

        return {
            sessionId,
            code,
            participantId,
        };
    },
});

/**
 * Join an existing session by code
 */
export const joinSession = mutation({
    args: {
        code: v.string(),
        deviceId: v.string(),
        displayName: v.string(),
    },
    handler: async (ctx, { code, deviceId, displayName }) => {
        // Find session by code (case-insensitive)
        const session = await ctx.db
            .query("sessions")
            .withIndex("by_code", (q) => q.eq("code", code.toUpperCase()))
            .first();

        if (!session) {
            throw new Error("Session not found");
        }

        if (session.status !== "active") {
            throw new Error("Session has ended");
        }

        if (Date.now() > session.expiresAt) {
            throw new Error("Session has expired");
        }

        // Check if already joined
        const existing = await ctx.db
            .query("participants")
            .withIndex("by_device_session", (q) =>
                q.eq("deviceId", deviceId).eq("sessionId", session._id)
            )
            .first();

        if (existing) {
            // Already in session, just return existing info
            return {
                sessionId: session._id,
                participantId: existing._id,
                alreadyJoined: true,
            };
        }

        // Get current participant count for color assignment
        const participants = await ctx.db
            .query("participants")
            .withIndex("by_session", (q) => q.eq("sessionId", session._id))
            .collect();

        const color = COLORS[participants.length % COLORS.length];
        const now = Date.now();

        // Add new participant
        const participantId = await ctx.db.insert("participants", {
            sessionId: session._id,
            deviceId,
            displayName,
            color,
            joinedAt: now,
            lastSeenAt: now,
        });

        // Initialize empty presence
        await ctx.db.insert("presence", {
            participantId,
            sessionId: session._id,
            latitude: 0,
            longitude: 0,
            updatedAt: now,
        });

        return {
            sessionId: session._id,
            participantId,
            alreadyJoined: false,
        };
    },
});

/**
 * Leave a session
 */
export const leaveSession = mutation({
    args: {
        sessionId: v.id("sessions"),
        deviceId: v.string(),
    },
    handler: async (ctx, { sessionId, deviceId }) => {
        // Find participant
        const participant = await ctx.db
            .query("participants")
            .withIndex("by_device_session", (q) =>
                q.eq("deviceId", deviceId).eq("sessionId", sessionId)
            )
            .first();

        if (!participant) {
            return { success: false, reason: "Not in session" };
        }

        // Delete presence
        const presence = await ctx.db
            .query("presence")
            .withIndex("by_participant", (q) => q.eq("participantId", participant._id))
            .first();

        if (presence) {
            await ctx.db.delete(presence._id);
        }

        // Delete route cache
        const route = await ctx.db
            .query("routes")
            .withIndex("by_participant", (q) => q.eq("participantId", participant._id))
            .first();

        if (route) {
            await ctx.db.delete(route._id);
        }

        // Delete participant
        await ctx.db.delete(participant._id);

        // Check if session is now empty
        const remaining = await ctx.db
            .query("participants")
            .withIndex("by_session", (q) => q.eq("sessionId", sessionId))
            .first();

        if (!remaining) {
            // End empty session
            await ctx.db.patch(sessionId, { status: "ended" });
        }

        return { success: true };
    },
});

/**
 * End a session (mark as ended)
 */
export const endSession = mutation({
    args: {
        sessionId: v.id("sessions"),
    },
    handler: async (ctx, { sessionId }) => {
        const session = await ctx.db.get(sessionId);
        if (!session) {
            throw new Error("Session not found");
        }

        await ctx.db.patch(sessionId, { status: "ended" });
        return { success: true };
    },
});

/**
 * Get session details
 */
export const getSession = query({
    args: {
        sessionId: v.id("sessions"),
    },
    handler: async (ctx, { sessionId }) => {
        const session = await ctx.db.get(sessionId);
        if (!session) return null;

        return {
            id: session._id,
            code: session.code,
            status: session.status,
            destination: session.destination,
            createdAt: session.createdAt,
            expiresAt: session.expiresAt,
        };
    },
});

/**
 * Get session by code
 */
export const getSessionByCode = query({
    args: {
        code: v.string(),
    },
    handler: async (ctx, { code }) => {
        const session = await ctx.db
            .query("sessions")
            .withIndex("by_code", (q) => q.eq("code", code.toUpperCase()))
            .first();

        if (!session) return null;

        return {
            id: session._id,
            code: session.code,
            status: session.status,
            destination: session.destination,
            createdAt: session.createdAt,
            expiresAt: session.expiresAt,
        };
    },
});
