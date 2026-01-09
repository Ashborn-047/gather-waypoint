import { internalMutation } from "./_generated/server";

/**
 * Session Cleanup - Waypoint Engine
 * 
 * Internal mutations for background cleanup tasks.
 */

/**
 * Expire sessions that have passed their expiresAt timestamp
 */
export const expireStaleSessions = internalMutation({
    args: {},
    handler: async (ctx) => {
        const now = Date.now();

        // Find expired active sessions
        const expiredSessions = await ctx.db
            .query("sessions")
            .withIndex("by_status", (q) => q.eq("status", "active"))
            .filter((q) => q.lt(q.field("expiresAt"), now))
            .collect();

        let cleanedCount = 0;

        for (const session of expiredSessions) {
            // Mark session as ended
            await ctx.db.patch(session._id, { status: "ended" });

            // Clean up participants
            const participants = await ctx.db
                .query("participants")
                .withIndex("by_session", (q) => q.eq("sessionId", session._id))
                .collect();

            for (const participant of participants) {
                // Delete presence
                const presence = await ctx.db
                    .query("presence")
                    .withIndex("by_participant", (q) => q.eq("participantId", participant._id))
                    .first();
                if (presence) {
                    await ctx.db.delete(presence._id);
                }

                // Delete routes
                const route = await ctx.db
                    .query("routes")
                    .withIndex("by_participant", (q) => q.eq("participantId", participant._id))
                    .first();
                if (route) {
                    await ctx.db.delete(route._id);
                }

                // Delete participant
                await ctx.db.delete(participant._id);
            }

            cleanedCount++;
        }

        return { expiredCount: cleanedCount };
    },
});
