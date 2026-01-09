/**
 * Convex Client Configuration
 * 
 * Setup for the Convex real-time backend.
 */

// The Convex deployment URL
// This will be set during `npx convex dev` or from environment
export const CONVEX_URL = process.env.EXPO_PUBLIC_CONVEX_URL || "";

// Re-export Convex React hooks
export { ConvexProvider, ConvexReactClient } from "convex/react";
