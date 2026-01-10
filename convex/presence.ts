import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

/**
 * Presence Service - Waypoint Engine
 * 
 * Handles live location updates and presence tracking.
 * 
 * CRITICAL INVARIANT:
 * The presence table holds ONLY the latest location per participant.
 * This is a SNAPSHOT, not a stream. Always PATCH, never INSERT if exists.
 */

// Thresholds for sanity checks
const MAX_SPEED_MPS = 50;           // ~180 km/h - reject teleporting
const MAX_ACCURACY_METERS = 100;    // Reject very inaccurate GPS
const STALE_THRESHOLD_MS = 60000;   // 60 seconds - mark as inactive
const DELAY_EXPIRY_MS = 15 * 60 * 1000; // 15 minutes - delay auto-expires

/**
 * Calculate distance between two points (Haversine formula)
 */
function haversineDistance(
    lat1: number,
    lng1: number,
    lat2: number,
    lng2: number
): number {
    const R = 6371000; // Earth radius in meters
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
 * Update participant location
 * 
 * This is the core GPS ingestion mutation.
 * Called every 1-3 seconds from mobile clients.
 */
export const updateLocation = mutation({
    args: {
        sessionId: v.id("sessions"),
        deviceId: v.string(),
        latitude: v.number(),
        longitude: v.number(),
        heading: v.optional(v.number()),
        speed: v.optional(v.number()),
        accuracy: v.optional(v.number()),
    },
    handler: async (ctx, args) => {
        const { sessionId, deviceId, latitude, longitude, heading, speed, accuracy } = args;

        // Validate session exists and is active
        const session = await ctx.db.get(sessionId);
        if (!session || session.status !== "active") {
            throw new Error("Session not active");
        }

        // Find participant
        const participant = await ctx.db
            .query("participants")
            .withIndex("by_device_session", (q) =>
                q.eq("deviceId", deviceId).eq("sessionId", sessionId)
            )
            .first();

        if (!participant) {
            throw new Error("Not in session");
        }

        // Sanity check: reject very inaccurate GPS
        if (accuracy !== undefined && accuracy > MAX_ACCURACY_METERS) {
            return { accepted: false, reason: "GPS accuracy too low" };
        }

        const now = Date.now();

        // Get existing presence
        const existingPresence = await ctx.db
            .query("presence")
            .withIndex("by_participant", (q) => q.eq("participantId", participant._id))
            .first();

        if (existingPresence) {
            // Sanity check: reject impossible speed (teleporting)
            const timeDelta = (now - existingPresence.updatedAt) / 1000; // seconds
            if (timeDelta > 0 && existingPresence.latitude !== 0) {
                const distance = haversineDistance(
                    existingPresence.latitude,
                    existingPresence.longitude,
                    latitude,
                    longitude
                );
                const calculatedSpeed = distance / timeDelta;
                if (calculatedSpeed > MAX_SPEED_MPS) {
                    return { accepted: false, reason: "Movement too fast (teleport rejected)" };
                }
            }

            // PATCH existing presence (maintain snapshot invariant)
            await ctx.db.patch(existingPresence._id, {
                latitude,
                longitude,
                heading,
                speed,
                accuracy,
                updatedAt: now,
                // Preserve delay status if not expired
                delayStatus: existingPresence.delayStatus,
            });
        } else {
            // INSERT new presence (first update)
            await ctx.db.insert("presence", {
                participantId: participant._id,
                sessionId,
                latitude,
                longitude,
                heading,
                speed,
                accuracy,
                updatedAt: now,
            });
        }

        // Update lastSeenAt on participant
        await ctx.db.patch(participant._id, { lastSeenAt: now });

        return { accepted: true };
    },
});

/**
 * Report a delay (user-declared, NOT traffic prediction)
 * 
 * This is a COORDINATION SIGNAL - users explicitly state they are delayed.
 * Auto-expires after 15 minutes.
 */
export const reportDelay = mutation({
    args: {
        sessionId: v.id("sessions"),
        deviceId: v.string(),
        type: v.union(
            v.literal("traffic"),
            v.literal("blocked"),
            v.literal("slow"),
            v.literal("other")
        ),
        delayMinutes: v.number(),
    },
    handler: async (ctx, { sessionId, deviceId, type, delayMinutes }) => {
        // Find participant
        const participant = await ctx.db
            .query("participants")
            .withIndex("by_device_session", (q) =>
                q.eq("deviceId", deviceId).eq("sessionId", sessionId)
            )
            .first();

        if (!participant) {
            throw new Error("Not in session");
        }

        // Find presence
        const presence = await ctx.db
            .query("presence")
            .withIndex("by_participant", (q) => q.eq("participantId", participant._id))
            .first();

        if (!presence) {
            throw new Error("No presence record");
        }

        // Update delay status
        await ctx.db.patch(presence._id, {
            delayStatus: {
                type,
                delayMinutes,
                reportedAt: Date.now(),
            },
        });

        return { success: true };
    },
});

/**
 * Clear delay status
 */
export const clearDelay = mutation({
    args: {
        sessionId: v.id("sessions"),
        deviceId: v.string(),
    },
    handler: async (ctx, { sessionId, deviceId }) => {
        const participant = await ctx.db
            .query("participants")
            .withIndex("by_device_session", (q) =>
                q.eq("deviceId", deviceId).eq("sessionId", sessionId)
            )
            .first();

        if (!participant) {
            throw new Error("Not in session");
        }

        const presence = await ctx.db
            .query("presence")
            .withIndex("by_participant", (q) => q.eq("participantId", participant._id))
            .first();

        if (!presence) {
            throw new Error("No presence record");
        }

        await ctx.db.patch(presence._id, {
            delayStatus: undefined,
        });

        return { success: true };
    },
});

/**
 * Get live participants with presence data
 * 
 * This is the MAIN REALTIME SUBSCRIPTION for the map view.
 * Auto-subscribed by Convex - all session participants receive updates.
 * 
 * Filters out:
 * - Stale participants (>60s inactive)
 * - Expired delay signals (>15 min old)
 */
export const getLiveParticipants = query({
    args: {
        sessionId: v.id("sessions"),
    },
    handler: async (ctx, { sessionId }) => {
        const now = Date.now();

        // Get all participants
        const participants = await ctx.db
            .query("participants")
            .withIndex("by_session", (q) => q.eq("sessionId", sessionId))
            .collect();

        // Get all presence data
        const presenceRecords = await ctx.db
            .query("presence")
            .withIndex("by_session", (q) => q.eq("sessionId", sessionId))
            .collect();

        // Build presence map for quick lookup
        const presenceMap = new Map(
            presenceRecords.map((p) => [p.participantId.toString(), p])
        );

        // Combine and filter
        const liveParticipants = participants
            .map((participant) => {
                const presence = presenceMap.get(participant._id.toString());

                // Determine if active (seen within threshold)
                const isActive = now - participant.lastSeenAt < STALE_THRESHOLD_MS;

                // Process delay status (auto-expire)
                let delay = undefined;
                if (presence?.delayStatus) {
                    const isExpired = now - presence.delayStatus.reportedAt > DELAY_EXPIRY_MS;
                    if (!isExpired) {
                        delay = {
                            type: presence.delayStatus.type,
                            minutes: presence.delayStatus.delayMinutes,
                            isExpired: false,
                        };
                    }
                }

                return {
                    id: participant._id,
                    displayName: participant.displayName,
                    color: participant.color,
                    isActive,
                    location: presence
                        ? {
                            latitude: presence.latitude,
                            longitude: presence.longitude,
                            heading: presence.heading,
                            speed: presence.speed,
                            updatedAt: presence.updatedAt,
                        }
                        : null,
                    delay,
                };
            })
            // Filter out stale participants from the map view
            .filter((p) => p.isActive);

        return liveParticipants;
    },
});

/**
 * Get all participants (including inactive, for list view)
 */
export const getAllParticipants = query({
    args: {
        sessionId: v.id("sessions"),
    },
    handler: async (ctx, { sessionId }) => {
        const now = Date.now();

        const participants = await ctx.db
            .query("participants")
            .withIndex("by_session", (q) => q.eq("sessionId", sessionId))
            .collect();

        return participants.map((p) => ({
            id: p._id,
            displayName: p.displayName,
            color: p.color,
            isActive: now - p.lastSeenAt < STALE_THRESHOLD_MS,
            joinedAt: p.joinedAt,
        }));
    },
});
