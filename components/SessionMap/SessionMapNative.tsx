import React, { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { StyleSheet, View, Text, TouchableOpacity } from "react-native";
import MapLibreGL from "@maplibre/maplibre-react-native";

// Initialize MapLibre
MapLibreGL.setAccessToken(null);

/**
 * Session Map Component (MapLibre Native Implementation)
 * 
 * High-fidelity map rendering using MapLibre GL and OpenStreetMap tiles.
 * Implements Uber-style camera behavior with explicit modes.
 * 
 * Camera Modes:
 * - FOLLOW_SELF: Track user location
 * - FIT_ROUTE: Fit route from user → destination
 * - FREE_PAN: User has manually panned
 */

const MAP_STYLE = "https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json";

// Camera mode enum
export type CameraMode = "FOLLOW_SELF" | "FIT_ROUTE" | "FREE_PAN";

interface Participant {
    id: string;
    displayName: string;
    color: string;
    location?: {
        latitude: number;
        longitude: number;
    };
    delay?: {
        type: string;
        minutes: number;
    };
}

interface Destination {
    latitude: number;
    longitude: number;
    name?: string;
    updatedAt?: number;
}

interface RouteData {
    participantId: string;
    polyline: string; // GeoJSON string
    isStale: boolean;
}

interface SessionMapProps {
    participants: Participant[];
    destination?: Destination | null;
    userLocation?: { latitude: number; longitude: number } | null;
    currentDeviceId?: string;
    routes?: RouteData[];
    onMapPress?: (coordinate: { latitude: number; longitude: number }) => void;
    onCameraModeChange?: (mode: CameraMode) => void;
}

export default function SessionMap({
    participants,
    destination,
    userLocation,
    currentDeviceId,
    routes,
    onMapPress,
    onCameraModeChange,
}: SessionMapProps) {
    const cameraRef = useRef<MapLibreGL.Camera>(null);
    const [cameraMode, setCameraMode] = useState<CameraMode>("FOLLOW_SELF");
    const [isMapReady, setIsMapReady] = useState(false);
    const lastDestinationRef = useRef<string | null>(null);

    // Filter participants with valid locations (not Null Island)
    const validParticipants = useMemo(() =>
        participants.filter((p) =>
            p.location &&
            !(p.location.latitude === 0 && p.location.longitude === 0)
        ),
        [participants]
    );

    // Current user's participant data
    const currentUser = useMemo(() =>
        validParticipants.find(p => p.id === currentDeviceId),
        [validParticipants, currentDeviceId]
    );

    // Build GeoJSON for participant markers (SymbolLayer)
    const participantFeatures = useMemo(() => ({
        type: "FeatureCollection" as const,
        features: validParticipants.map(p => ({
            type: "Feature" as const,
            id: p.id,
            geometry: {
                type: "Point" as const,
                coordinates: [p.location!.longitude, p.location!.latitude],
            },
            properties: {
                id: p.id,
                displayName: p.displayName,
                initials: p.displayName.slice(0, 2).toUpperCase(),
                color: p.color,
                isCurrentUser: p.id === currentDeviceId,
                hasDelay: !!p.delay,
            },
        })),
    }), [validParticipants, currentDeviceId]);

    // Build GeoJSON for destination marker
    const destinationFeature = useMemo(() => {
        if (!destination || isNaN(destination.latitude) || isNaN(destination.longitude)) {
            return null;
        }
        return {
            type: "FeatureCollection" as const,
            features: [{
                type: "Feature" as const,
                id: "destination",
                geometry: {
                    type: "Point" as const,
                    coordinates: [destination.longitude, destination.latitude],
                },
                properties: {
                    name: destination.name || "Meeting Point",
                },
            }],
        };
    }, [destination]);

    // Handle camera mode changes
    const handleCameraModeChange = useCallback((mode: CameraMode) => {
        setCameraMode(mode);
        onCameraModeChange?.(mode);
    }, [onCameraModeChange]);

    // Recenter button handler
    const handleRecenter = useCallback(() => {
        handleCameraModeChange("FOLLOW_SELF");
        if (userLocation && cameraRef.current) {
            cameraRef.current.setCamera({
                centerCoordinate: [userLocation.longitude, userLocation.latitude],
                zoomLevel: 15,
                animationDuration: 1000,
            });
        }
    }, [userLocation, handleCameraModeChange]);

    // Effect: Switch to FIT_ROUTE when destination is set/changed
    useEffect(() => {
        if (!destination || !isMapReady) return;

        const destId = `${destination.latitude.toFixed(6)},${destination.longitude.toFixed(6)},${destination.updatedAt || 0}`;

        if (destId !== lastDestinationRef.current) {
            lastDestinationRef.current = destId;
            handleCameraModeChange("FIT_ROUTE");

            // Calculate bounds to fit user + destination
            if (cameraRef.current) {
                const coordinates: number[][] = [[destination.longitude, destination.latitude]];

                if (userLocation && !(userLocation.latitude === 0 && userLocation.longitude === 0)) {
                    coordinates.push([userLocation.longitude, userLocation.latitude]);
                }

                if (coordinates.length > 1) {
                    // Fit bounds with padding
                    cameraRef.current.fitBounds(
                        coordinates[0] as [number, number],
                        coordinates[1] as [number, number],
                        80, // padding
                        2000 // duration
                    );
                } else {
                    // Just fly to destination
                    cameraRef.current.setCamera({
                        centerCoordinate: [destination.longitude, destination.latitude],
                        zoomLevel: 16,
                        animationDuration: 2000,
                    });
                }
            }
        }
    }, [destination, userLocation, isMapReady, handleCameraModeChange]);

    // Effect: Follow user in FOLLOW_SELF mode
    useEffect(() => {
        if (cameraMode !== "FOLLOW_SELF" || !userLocation || !isMapReady) return;
        if (userLocation.latitude === 0 && userLocation.longitude === 0) return;

        cameraRef.current?.setCamera({
            centerCoordinate: [userLocation.longitude, userLocation.latitude],
            animationDuration: 300,
        });
    }, [userLocation, cameraMode, isMapReady]);

    // Handle map touch (switch to FREE_PAN)
    const handleMapTouch = useCallback(() => {
        if (cameraMode !== "FREE_PAN") {
            handleCameraModeChange("FREE_PAN");
        }
    }, [cameraMode, handleCameraModeChange]);

    // Handle map press for waypoint selection
    const handleMapPress = useCallback((feature: any) => {
        if (onMapPress && feature.geometry?.type === "Point") {
            const [lng, lat] = feature.geometry.coordinates;
            onMapPress({ latitude: lat, longitude: lng });
        }
    }, [onMapPress]);

    // Determine initial center
    const initialCenter = useMemo(() => {
        if (destination) return [destination.longitude, destination.latitude];
        if (userLocation && !(userLocation.latitude === 0 && userLocation.longitude === 0)) {
            return [userLocation.longitude, userLocation.latitude];
        }
        return [0, 0];
    }, []);

    return (
        <View style={styles.container}>
            <MapLibreGL.MapView
                style={styles.map}
                styleURL={MAP_STYLE}
                logoEnabled={false}
                attributionEnabled={false}
                onPress={handleMapPress}
                onTouchStart={handleMapTouch}
                onDidFinishLoadingMap={() => setIsMapReady(true)}
            >
                <MapLibreGL.Camera
                    ref={cameraRef}
                    zoomLevel={14}
                    centerCoordinate={initialCenter as [number, number]}
                />

                {/* Route Polylines (LineLayer) */}
                {routes?.map((route) => {
                    const participant = participants.find(p => p.id === route.participantId);
                    const color = participant?.color || "#34D399";

                    try {
                        const geojson = JSON.parse(route.polyline);
                        return (
                            <MapLibreGL.ShapeSource
                                key={`route-${route.participantId}`}
                                id={`route-${route.participantId}`}
                                shape={geojson}
                            >
                                <MapLibreGL.LineLayer
                                    id={`line-${route.participantId}`}
                                    style={{
                                        lineColor: color,
                                        lineWidth: 5,
                                        lineOpacity: route.isStale ? 0.4 : 0.8,
                                        lineJoin: "round",
                                        lineCap: "round",
                                    }}
                                />
                            </MapLibreGL.ShapeSource>
                        );
                    } catch {
                        return null;
                    }
                })}

                {/* Destination Marker (SymbolLayer) */}
                {destinationFeature && (
                    <MapLibreGL.ShapeSource
                        id="destination-source"
                        shape={destinationFeature}
                    >
                        <MapLibreGL.SymbolLayer
                            id="destination-symbol"
                            style={{
                                iconImage: "📍",
                                iconSize: 1.5,
                                iconAnchor: "bottom",
                                textField: ["get", "name"],
                                textSize: 12,
                                textColor: "#34D399",
                                textHaloColor: "#000",
                                textHaloWidth: 1,
                                textOffset: [0, 0.5],
                                textAnchor: "top",
                            }}
                        />
                    </MapLibreGL.ShapeSource>
                )}

                {/* Participant Markers (SymbolLayer) */}
                <MapLibreGL.ShapeSource
                    id="participants-source"
                    shape={participantFeatures}
                >
                    <MapLibreGL.CircleLayer
                        id="participants-circle"
                        style={{
                            circleRadius: 20,
                            circleColor: ["case",
                                ["get", "isCurrentUser"], "#34D399",
                                "#1a2332"
                            ],
                            circleStrokeWidth: 3,
                            circleStrokeColor: ["get", "color"],
                        }}
                    />
                    <MapLibreGL.SymbolLayer
                        id="participants-label"
                        style={{
                            textField: ["get", "initials"],
                            textSize: 12,
                            textColor: ["case",
                                ["get", "isCurrentUser"], "#000",
                                "#fff"
                            ],
                            textFont: ["Open Sans Bold"],
                        }}
                    />
                </MapLibreGL.ShapeSource>
            </MapLibreGL.MapView>

            {/* Recenter Button (visible when in FREE_PAN mode) */}
            {cameraMode === "FREE_PAN" && (
                <TouchableOpacity style={styles.recenterButton} onPress={handleRecenter}>
                    <Text style={styles.recenterIcon}>◎</Text>
                </TouchableOpacity>
            )}

            {/* Camera Mode Indicator */}
            <View style={styles.cameraIndicator}>
                <Text style={styles.cameraIndicatorText}>
                    {cameraMode === "FOLLOW_SELF" && "📍 Following you"}
                    {cameraMode === "FIT_ROUTE" && "🗺️ Route view"}
                    {cameraMode === "FREE_PAN" && "✋ Free pan"}
                </Text>
            </View>

            {/* Loading Overlay */}
            {(!isMapReady || (validParticipants.length === 0 && !destination)) && (
                <View style={styles.loadingOverlay}>
                    <Text style={styles.loadingText}>🛰️ Searching Signal...</Text>
                </View>
            )}
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: "#0a0a0a",
    },
    map: {
        flex: 1,
    },
    recenterButton: {
        position: "absolute",
        bottom: 100,
        right: 16,
        width: 50,
        height: 50,
        borderRadius: 25,
        backgroundColor: "#1a1a1a",
        justifyContent: "center",
        alignItems: "center",
        borderWidth: 1,
        borderColor: "#333",
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.5,
        shadowRadius: 4,
        elevation: 5,
    },
    recenterIcon: {
        color: "#34D399",
        fontSize: 24,
    },
    cameraIndicator: {
        position: "absolute",
        top: 16,
        left: 16,
        backgroundColor: "rgba(0,0,0,0.7)",
        paddingHorizontal: 12,
        paddingVertical: 6,
        borderRadius: 16,
    },
    cameraIndicatorText: {
        color: "#999",
        fontSize: 12,
        fontWeight: "600",
    },
    loadingOverlay: {
        ...StyleSheet.absoluteFillObject,
        backgroundColor: "rgba(10,10,10,0.9)",
        justifyContent: "center",
        alignItems: "center",
    },
    loadingText: {
        color: "#666",
        fontSize: 14,
        fontWeight: "600",
    },
});
