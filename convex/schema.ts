import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

/**
 * Waypoint Backend Schema
 * 
 * Core data models for the Gather real-time session engine.
 * Session-first, backend-authoritative architecture.
 */
export default defineSchema({
    // ============================================
    // SESSIONS - Primary unit of scale
    // ============================================
    sessions: defineTable({
        code: v.string(),                    // 6-char invite code (e.g., "A3K9M2")
        destination: v.optional(v.object({   // Shared waypoint
            lat: v.number(),
            lng: v.number(),
            name: v.optional(v.string()),
        })),
        status: v.union(
            v.literal("active"),
            v.literal("ended")
        ),
        createdAt: v.number(),
        expiresAt: v.number(),               // Auto-expire timestamp (4 hours default)
    })
        .index("by_code", ["code"])
        .index("by_status", ["status"]),

    // ============================================
    // PARTICIPANTS - Session members
    // ============================================
    participants: defineTable({
        sessionId: v.id("sessions"),
        deviceId: v.string(),                // Anonymous device identifier
        displayName: v.string(),
        color: v.string(),                   // Assigned marker color
        joinedAt: v.number(),
        lastSeenAt: v.number(),              // For presence timeout detection
    })
        .index("by_session", ["sessionId"])
        .index("by_device_session", ["deviceId", "sessionId"]),

    // ============================================
    // PRESENCE - Live location snapshots
    // ============================================
    // INVARIANT: One row per participant (NEVER accumulate history)
    // Always PATCH existing rows, never INSERT if row exists
    presence: defineTable({
        participantId: v.id("participants"),
        sessionId: v.id("sessions"),         // Denormalized for query efficiency
        lat: v.number(),
        lng: v.number(),
        heading: v.optional(v.number()),     // Direction of travel (degrees)
        speed: v.optional(v.number()),       // Meters per second
        accuracy: v.optional(v.number()),    // GPS accuracy in meters
        updatedAt: v.number(),
        // USER-DECLARED DELAY SIGNAL (ephemeral, auto-expires after 15 min)
        // This is a COORDINATION signal, NOT traffic prediction
        delayStatus: v.optional(v.object({
            type: v.union(
                v.literal("traffic"),
                v.literal("blocked"),
                v.literal("slow"),
                v.literal("other")
            ),
            delayMinutes: v.number(),          // User-estimated delay
            reportedAt: v.number(),            // Timestamp for auto-expiry
        })),
    })
        .index("by_session", ["sessionId"])
        .index("by_participant", ["participantId"]),

    // ============================================
    // ROUTES - Cached route data for ETA
    // ============================================
    routes: defineTable({
        sessionId: v.id("sessions"),
        participantId: v.id("participants"),
        polyline: v.string(),                // Encoded polyline from OSRM
        distanceMeters: v.number(),
        etaSeconds: v.number(),
        originLat: v.number(),               // Route origin for staleness check
        originLng: v.number(),
        computedAt: v.number(),
    })
        .index("by_session", ["sessionId"])
        .index("by_participant", ["participantId"]),
});
