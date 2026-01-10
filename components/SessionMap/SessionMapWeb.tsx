import React, { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { StyleSheet, View, Text, ActivityIndicator, TouchableOpacity } from "react-native";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";

/**
 * Session Map Component (Web Implementation)
 * 
 * Uses maplibre-gl directly for the browser.
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
    polyline: string;
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
    const mapContainer = useRef<HTMLDivElement>(null);
    const map = useRef<maplibregl.Map | null>(null);
    const markers = useRef<Map<string, maplibregl.Marker>>(new Map());
    const [mapLoaded, setMapLoaded] = useState(false);
    const [cameraMode, setCameraMode] = useState<CameraMode>("FOLLOW_SELF");
    const lastDestinationRef = useRef<string | null>(null);

    // Valid user location (not Null Island)
    const isUserLocationValid = useMemo(() =>
        userLocation &&
        !isNaN(userLocation.latitude) &&
        !isNaN(userLocation.longitude) &&
        !(userLocation.latitude === 0 && userLocation.longitude === 0),
        [userLocation]
    );

    // Handle camera mode changes
    const handleCameraModeChange = useCallback((mode: CameraMode) => {
        setCameraMode(mode);
        onCameraModeChange?.(mode);
    }, [onCameraModeChange]);

    // Recenter handler
    const handleRecenter = useCallback(() => {
        handleCameraModeChange("FOLLOW_SELF");
        if (isUserLocationValid && map.current) {
            map.current.flyTo({
                center: [userLocation!.longitude, userLocation!.latitude],
                zoom: 15,
                duration: 1000,
            });
        }
    }, [isUserLocationValid, userLocation, handleCameraModeChange]);

    // Initialize map
    useEffect(() => {
        if (!mapContainer.current || map.current) return;

        const initialCenter: [number, number] = isUserLocationValid
            ? [userLocation!.longitude, userLocation!.latitude]
            : [0, 0];

        map.current = new maplibregl.Map({
            container: mapContainer.current,
            style: MAP_STYLE,
            center: initialCenter,
            zoom: initialCenter[0] === 0 ? 2 : 14,
            attributionControl: false,
        });

        map.current.on("load", () => {
            setMapLoaded(true);
        });

        map.current.on("click", (e) => {
            if (onMapPress) {
                onMapPress({ latitude: e.lngLat.lat, longitude: e.lngLat.lng });
            }
        });

        // Detect manual pan → switch to FREE_PAN
        map.current.on("dragstart", () => {
            if (cameraMode !== "FREE_PAN") {
                handleCameraModeChange("FREE_PAN");
            }
        });

        return () => {
            if (map.current) {
                map.current.remove();
                map.current = null;
            }
        };
    }, []);

    // Effect: Handle destination changes → FIT_ROUTE mode
    useEffect(() => {
        if (!map.current || !mapLoaded || !destination) return;
        if (isNaN(destination.latitude) || isNaN(destination.longitude)) return;

        const destId = `${destination.latitude.toFixed(6)},${destination.longitude.toFixed(6)},${destination.updatedAt || 0}`;

        if (destId !== lastDestinationRef.current) {
            lastDestinationRef.current = destId;
            handleCameraModeChange("FIT_ROUTE");

            // Fit bounds: user + destination
            if (isUserLocationValid) {
                const bounds = new maplibregl.LngLatBounds()
                    .extend([userLocation!.longitude, userLocation!.latitude])
                    .extend([destination.longitude, destination.latitude]);

                map.current.fitBounds(bounds, {
                    padding: 100,
                    duration: 2000,
                    maxZoom: 16,
                });
            } else {
                map.current.flyTo({
                    center: [destination.longitude, destination.latitude],
                    zoom: 16,
                    duration: 2000,
                });
            }
        }
    }, [destination, isUserLocationValid, userLocation, mapLoaded, handleCameraModeChange]);

    // Effect: Follow user in FOLLOW_SELF mode
    useEffect(() => {
        if (!map.current || !mapLoaded || cameraMode !== "FOLLOW_SELF") return;
        if (!isUserLocationValid) return;

        map.current.easeTo({
            center: [userLocation!.longitude, userLocation!.latitude],
            duration: 300,
        });
    }, [userLocation, cameraMode, mapLoaded, isUserLocationValid]);

    // Sync Markers & Routes
    useEffect(() => {
        if (!map.current || !mapLoaded) return;

        // 1. Participant Markers
        const activeIds = new Set<string>();
        participants.forEach(p => {
            if (!p.location ||
                isNaN(p.location.latitude) ||
                isNaN(p.location.longitude) ||
                (p.location.latitude === 0 && p.location.longitude === 0)
            ) return;

            const isMe = p.id === currentDeviceId;
            activeIds.add(p.id);

            let marker = markers.current.get(p.id);
            if (!marker) {
                const el = document.createElement("div");
                el.style.width = "40px";
                el.style.height = "40px";
                el.style.borderRadius = "50%";
                el.style.backgroundColor = isMe ? "#34D399" : "#1a2332";
                el.style.border = `3px solid ${isMe ? "white" : p.color}`;
                el.style.display = "flex";
                el.style.justifyContent = "center";
                el.style.alignItems = "center";
                el.style.color = isMe ? "black" : "white";
                el.style.fontSize = "12px";
                el.style.fontWeight = "bold";
                el.style.boxShadow = "0 2px 10px rgba(0,0,0,0.5)";
                el.style.zIndex = isMe ? "100" : "10";
                el.innerText = isMe ? "YOU" : p.displayName.slice(0, 2).toUpperCase();

                if (p.delay) {
                    const badge = document.createElement("div");
                    badge.style.position = "absolute";
                    badge.style.top = "-5px";
                    badge.style.right = "-5px";
                    badge.style.width = "18px";
                    badge.style.height = "18px";
                    badge.style.borderRadius = "50%";
                    badge.style.backgroundColor = "#FCD34D";
                    badge.style.fontSize = "10px";
                    badge.style.fontWeight = "900";
                    badge.innerText = "!";
                    el.appendChild(badge);
                }

                marker = new maplibregl.Marker({ element: el })
                    .setLngLat([p.location.longitude, p.location.latitude])
                    .addTo(map.current!);
                markers.current.set(p.id, marker);
            } else {
                marker.setLngLat([p.location.longitude, p.location.latitude]);
            }
        });

        // Clear inactive markers
        markers.current.forEach((marker, id) => {
            if (id !== "destination" && !activeIds.has(id)) {
                marker.remove();
                markers.current.delete(id);
            }
        });

        // 2. Destination Marker
        if (destination && !isNaN(destination.latitude) && !isNaN(destination.longitude)) {
            let destMarker = markers.current.get("destination");
            if (!destMarker) {
                const el = document.createElement("div");
                el.style.fontSize = "32px";
                el.style.cursor = "pointer";
                el.innerText = "📍";

                destMarker = new maplibregl.Marker({ element: el, anchor: "bottom" })
                    .setLngLat([destination.longitude, destination.latitude])
                    .addTo(map.current!);
                markers.current.set("destination", destMarker);
            } else {
                destMarker.setLngLat([destination.longitude, destination.latitude]);
            }
        } else if (markers.current.has("destination")) {
            markers.current.get("destination")?.remove();
            markers.current.delete("destination");
        }
    }, [participants, destination, mapLoaded, currentDeviceId]);

    // Sync Routes (Polylines)
    useEffect(() => {
        if (!map.current || !mapLoaded || !routes) return;

        routes.forEach(route => {
            const sourceId = `route-${route.participantId}`;
            const layerId = `layer-${route.participantId}`;
            const participant = participants.find(p => p.id === route.participantId);
            const color = participant?.color || "#34D399";

            try {
                const geojson = JSON.parse(route.polyline);
                const source = map.current!.getSource(sourceId) as maplibregl.GeoJSONSource;

                if (source) {
                    source.setData(geojson);
                } else {
                    map.current!.addSource(sourceId, {
                        type: "geojson",
                        data: geojson,
                    });

                    map.current!.addLayer({
                        id: layerId,
                        type: "line",
                        source: sourceId,
                        layout: {
                            "line-join": "round",
                            "line-cap": "round",
                        },
                        paint: {
                            "line-color": color,
                            "line-width": 5,
                            "line-opacity": route.isStale ? 0.4 : 0.8,
                        },
                    });
                }
            } catch (err) {
                console.error("Failed to render route:", err);
            }
        });

        // Cleanup old routes
        const activeRouteIds = new Set(routes.map(r => `layer-${r.participantId}`));
        const layers = map.current!.getStyle()?.layers || [];
        layers.forEach(layer => {
            if (layer.id.startsWith("layer-") && !activeRouteIds.has(layer.id)) {
                map.current!.removeLayer(layer.id);
                map.current!.removeSource(layer.id.replace("layer-", "route-"));
            }
        });
    }, [routes, mapLoaded, participants]);

    return (
        <View style={styles.container}>
            <div
                ref={mapContainer}
                style={{ width: "100%", height: "100%", position: "absolute" }}
            />

            {/* Recenter Button */}
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
            {(!mapLoaded || !isUserLocationValid) && (
                <View style={styles.loadingOverlay}>
                    <ActivityIndicator size="large" color="#34D399" />
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
        zIndex: 10,
    },
    loadingText: {
        color: "#666",
        marginTop: 10,
        fontSize: 14,
    },
});
