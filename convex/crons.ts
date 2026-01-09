import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

/**
 * Cron Jobs - Waypoint Engine
 * 
 * Background tasks for session maintenance.
 */

const crons = cronJobs();

// Run session cleanup every 15 minutes
crons.interval(
    "expire stale sessions",
    { minutes: 15 },
    internal.sessionCleanup.expireStaleSessions
);

export default crons;
