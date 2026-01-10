import { useEffect, useRef, useCallback } from "react";
import { useAction } from "convex/react";
import { api } from "../convex/_generated/api";
import { Id } from "../convex/_generated/dataModel";

/**
 * useRouteRecomputation Hook
 * 
 * Triggers route recomputation when:
 * 1. Destination changes
 * 2. User moves >500m from route origin
 * 3. Route cache is stale (>5 min)
 * 
 * This is a client-side hook that orchestrates the Convex actions.
 */

const DRIFT_THRESHOLD_M = 500;
const STALE_THRESHOLD_MS = 5 * 60 * 1000; // 5 minutes

interface UseRouteRecomputationOptions {
    sessionId: Id<"sessions">;
    participantId: Id<"participants">;
    userLocation: { latitude: number; longitude: number } | null;
    destination: { latitude: number; longitude: number } | null;
    enabled?: boolean;
}

// Haversine distance calculation
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

export function useRouteRecomputation({
    sessionId,
    participantId,
    userLocation,
    destination,
    enabled = true,
}: UseRouteRecomputationOptions) {
    const computeRoute = useAction(api.eta.computeRoute);

    // Track last computation state
    const lastComputeRef = useRef<{
        destLat: number;
        destLng: number;
        originLat: number;
        originLng: number;
        timestamp: number;
    } | null>(null);

    const isComputing = useRef(false);

    // Recompute route function
    const recompute = useCallback(async () => {
        if (!userLocation || !destination || isComputing.current) return;
        if (userLocation.latitude === 0 && userLocation.longitude === 0) return;

        isComputing.current = true;

        try {
            await computeRoute({
                sessionId,
                participantId,
                originLatitude: userLocation.latitude,
                originLongitude: userLocation.longitude,
                destLatitude: destination.latitude,
                destLongitude: destination.longitude,
            });

            lastComputeRef.current = {
                destLat: destination.latitude,
                destLng: destination.longitude,
                originLat: userLocation.latitude,
                originLng: userLocation.longitude,
                timestamp: Date.now(),
            };
        } catch (error) {
            console.error("Route computation failed:", error);
        } finally {
            isComputing.current = false;
        }
    }, [sessionId, participantId, userLocation, destination, computeRoute]);

    // Effect: Check for recomputation triggers
    useEffect(() => {
        if (!enabled || !userLocation || !destination) return;
        if (userLocation.latitude === 0 && userLocation.longitude === 0) return;

        const last = lastComputeRef.current;

        // Trigger 1: No route computed yet
        if (!last) {
            recompute();
            return;
        }

        // Trigger 2: Destination changed
        if (
            last.destLat !== destination.latitude ||
            last.destLng !== destination.longitude
        ) {
            recompute();
            return;
        }

        // Trigger 3: User drifted >500m from route origin
        const drift = haversineDistance(
            last.originLat,
            last.originLng,
            userLocation.latitude,
            userLocation.longitude
        );
        if (drift > DRIFT_THRESHOLD_M) {
            recompute();
            return;
        }

        // Trigger 4: Route is stale (>5 min)
        if (Date.now() - last.timestamp > STALE_THRESHOLD_MS) {
            recompute();
            return;
        }
    }, [userLocation, destination, enabled, recompute]);

    return { recompute };
}
