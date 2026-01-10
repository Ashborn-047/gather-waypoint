import { useState, useEffect, useCallback, useRef } from "react";
import * as Location from "expo-location";
import { useMutation } from "convex/react";
import { api } from "../convex/_generated/api";
import { Id } from "../convex/_generated/dataModel";

/**
 * Location Tracking Hook
 * 
 * Handles GPS tracking and sends updates to Convex backend.
 * Implements battery-efficient tracking with configurable intervals.
 */

interface LocationState {
    latitude: number;
    longitude: number;
    accuracy: number | null;
    heading: number | null;
    speed: number | null;
    timestamp: number;
}

interface UseLocationOptions {
    sessionId: Id<"sessions">;
    deviceId: string;
    enabled?: boolean;
    interval?: number; // Update interval in ms
}

interface UseLocationResult {
    location: LocationState | null;
    error: string | null;
    isTracking: boolean;
    permissionStatus: Location.PermissionStatus | null;
    requestPermission: () => Promise<boolean>;
    startTracking: () => Promise<void>;
    stopTracking: () => void;
}

export function useLocation({
    sessionId,
    deviceId,
    enabled = true,
    interval = 3000, // 3 seconds default
}: UseLocationOptions): UseLocationResult {
    const [location, setLocation] = useState<LocationState | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [isTracking, setIsTracking] = useState(false);
    const [permissionStatus, setPermissionStatus] = useState<Location.PermissionStatus | null>(null);

    const watchSubscription = useRef<Location.LocationSubscription | null>(null);
    const updateLocation = useMutation(api.presence.updateLocation);

    // Request location permission
    const requestPermission = useCallback(async (): Promise<boolean> => {
        try {
            const { status } = await Location.requestForegroundPermissionsAsync();
            setPermissionStatus(status);
            return status === "granted";
        } catch (err) {
            setError("Failed to request location permission");
            return false;
        }
    }, []);

    // Check current permission status
    useEffect(() => {
        (async () => {
            const { status } = await Location.getForegroundPermissionsAsync();
            setPermissionStatus(status);
        })();
    }, []);

    // Start location tracking
    const startTracking = useCallback(async () => {
        if (isTracking) return;

        // Check permission
        if (permissionStatus !== "granted") {
            const granted = await requestPermission();
            if (!granted) {
                setError("Location permission not granted");
                return;
            }
        }

        try {
            setError(null);
            setIsTracking(true);

            // Get initial location
            const initialLocation = await Location.getCurrentPositionAsync({
                accuracy: Location.Accuracy.High,
            });

            const initialState: LocationState = {
                latitude: initialLocation.coords.latitude,
                longitude: initialLocation.coords.longitude,
                accuracy: initialLocation.coords.accuracy,
                heading: initialLocation.coords.heading,
                speed: initialLocation.coords.speed,
                timestamp: initialLocation.timestamp,
            };

            setLocation(initialState);

            // Send initial location to backend
            try {
                await updateLocation({
                    sessionId,
                    deviceId,
                    latitude: initialState.latitude,
                    longitude: initialState.longitude,
                    accuracy: initialState.accuracy ?? undefined,
                    heading: initialState.heading ?? undefined,
                    speed: initialState.speed ?? undefined,
                });
            } catch (err) {
                console.error("Failed to send initial location:", err);
            }

            // Start watching location
            watchSubscription.current = await Location.watchPositionAsync(
                {
                    accuracy: Location.Accuracy.High,
                    timeInterval: interval,
                    distanceInterval: 5, // Minimum 5 meters movement
                },
                (newLocation) => {
                    const newState: LocationState = {
                        latitude: newLocation.coords.latitude,
                        longitude: newLocation.coords.longitude,
                        accuracy: newLocation.coords.accuracy,
                        heading: newLocation.coords.heading,
                        speed: newLocation.coords.speed,
                        timestamp: newLocation.timestamp,
                    };

                    setLocation(newState);

                    // Send update to backend
                    updateLocation({
                        sessionId,
                        deviceId,
                        latitude: newState.latitude,
                        longitude: newState.longitude,
                        accuracy: newState.accuracy ?? undefined,
                        heading: newState.heading ?? undefined,
                        speed: newState.speed ?? undefined,
                    }).catch((err) => {
                        console.error("Failed to send location update:", err);
                    });
                }
            );
        } catch (err) {
            setError("Failed to start location tracking");
            setIsTracking(false);
            console.error("Location tracking error:", err);
        }
    }, [isTracking, permissionStatus, requestPermission, sessionId, deviceId, interval, updateLocation]);

    // Stop location tracking
    const stopTracking = useCallback(() => {
        if (watchSubscription.current) {
            watchSubscription.current.remove();
            watchSubscription.current = null;
        }
        setIsTracking(false);
    }, []);

    // Auto-start tracking when enabled
    useEffect(() => {
        if (enabled && deviceId && sessionId && permissionStatus === "granted") {
            startTracking();
        }

        return () => {
            stopTracking();
        };
    }, [enabled, deviceId, sessionId, permissionStatus]);

    return {
        location,
        error,
        isTracking,
        permissionStatus,
        requestPermission,
        startTracking,
        stopTracking,
    };
}
