import React, { useEffect, useMemo, useRef } from "react";
import { StyleSheet, View, Text } from "react-native";
import MapLibreGL from "@maplibre/maplibre-react-native";

// Initialize MapLibre
// No access token required for standard OSM usage, but the library requires the call
MapLibreGL.setAccessToken(null);

/**
 * Session Map Component (MapLibre Implementation)
 * 
 * High-fidelity map rendering using MapLibre GL and OpenStreetMap tiles.
 * All map interactions stay IN-APP.
 * 
 * NOTE: Requires a development build (npx expo prebuild) to run on device.
 */

// CartoDB Dark Matter style JSON
const MAP_STYLE = "https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json";

interface Participant {
    id: string;
    displayName: string;
    color: string;
    location?: {
        lat: number;
        lng: number;
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
}

interface SessionMapProps {
    participants: Participant[];
    destination?: Destination | null;
    userLocation?: { latitude: number; longitude: number } | null;
    currentDeviceId?: string;
    onMapPress?: (coordinate: { latitude: number; longitude: number }) => void;
}

export default function SessionMap({
    participants,
    destination,
    userLocation,
    onMapPress,
}: SessionMapProps) {
    const cameraRef = useRef<any>(null);

    // Filter participants with valid locations
    const participantsWithLocation = useMemo(
        () => participants.filter((p) => p.location),
        [participants]
    );

    // Auto-fit bounds logic
    useEffect(() => {
        if (!cameraRef.current) return;

        const coordinates: number[][] = [];

        participantsWithLocation.forEach(p => {
            if (p.location) coordinates.push([p.location.lng, p.location.lat]);
        });

        if (destination) {
            coordinates.push([destination.longitude, destination.latitude]);
        }

        if (coordinates.length > 0) {
            cameraRef.current.fitBounds(
                coordinates[0],
                coordinates[coordinates.length - 1], // Simple bounds for now, can be improved to use all points
                50, // padding
                1000 // duration
            );
        }
    }, [participantsWithLocation.length, destination]);

    return (
        <View style={styles.container}>
            <MapLibreGL.MapView
                {...({
                    style: styles.map,
                    styleURL: MAP_STYLE,
                    logoEnabled: false,
                    attributionEnabled: true,
                    onPress: (feature: any) => {
                        if (onMapPress && feature.geometry.type === 'Point') {
                            const [lng, lat] = (feature.geometry as any).coordinates;
                            onMapPress({ latitude: lat, longitude: lng });
                        }
                    }
                } as any)}
            >
                <MapLibreGL.Camera
                    ref={cameraRef}
                    zoomLevel={12}
                    centerCoordinate={
                        userLocation
                            ? [userLocation.longitude, userLocation.latitude]
                            : [0, 0]
                    }
                />

                {/* Destination Marker */}
                {destination && (
                    <MapLibreGL.MarkerView
                        id="destination"
                        coordinate={[destination.longitude, destination.latitude]}
                    >
                        <View style={styles.destinationMarker}>
                            <Text style={styles.destinationIcon}>📍</Text>
                            <View style={styles.destinationLabelContainer}>
                                <Text style={styles.destinationLabel}>
                                    {destination.name || "Meeting Point"}
                                </Text>
                            </View>
                        </View>
                    </MapLibreGL.MarkerView>
                )}

                {/* Participant Markers */}
                {participantsWithLocation.map((p) => (
                    <MapLibreGL.MarkerView
                        key={p.id}
                        id={p.id}
                        coordinate={[p.location!.lng, p.location!.lat]}
                    >
                        <View
                            style={[
                                styles.participantMarker,
                                { borderColor: p.color },
                            ]}
                        >
                            <Text style={styles.markerText}>
                                {p.displayName.slice(0, 2).toUpperCase()}
                            </Text>
                            {p.delay && (
                                <View style={styles.delayBadge}>
                                    <Text style={styles.delayText}>!</Text>
                                </View>
                            )}
                        </View>
                    </MapLibreGL.MarkerView>
                ))}
            </MapLibreGL.MapView>

            <View style={styles.overlay}>
                {participantsWithLocation.length === 0 && !userLocation && (
                    <View style={styles.noLocationPanel}>
                        <Text style={styles.noLocationText}>🛰️ Searching Signal...</Text>
                    </View>
                )}
            </View>
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
    participantMarker: {
        width: 44,
        height: 44,
        borderRadius: 22,
        backgroundColor: "#1a2332",
        borderWidth: 3,
        justifyContent: "center",
        alignItems: "center",
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.5,
        shadowRadius: 4,
        elevation: 5,
    },
    markerText: {
        color: "#fff",
        fontSize: 14,
        fontWeight: "700",
    },
    delayBadge: {
        position: "absolute",
        top: -4,
        right: -4,
        width: 18,
        height: 18,
        borderRadius: 9,
        backgroundColor: "#FCD34D",
        justifyContent: "center",
        alignItems: "center",
        borderWidth: 2,
        borderColor: "#1a2332",
    },
    delayText: {
        color: "#000",
        fontSize: 10,
        fontWeight: "900",
    },
    destinationMarker: {
        alignItems: "center",
    },
    destinationIcon: {
        fontSize: 32,
    },
    destinationLabelContainer: {
        backgroundColor: "rgba(0,0,0,0.8)",
        paddingHorizontal: 8,
        paddingVertical: 2,
        borderRadius: 4,
        marginTop: 2,
    },
    destinationLabel: {
        color: "#34D399",
        fontSize: 10,
        fontWeight: "600",
    },
    overlay: {
        position: "absolute",
        top: 20,
        left: 0,
        right: 0,
        alignItems: "center",
        pointerEvents: "none",
    },
    noLocationPanel: {
        backgroundColor: "rgba(0,0,0,0.8)",
        paddingHorizontal: 16,
        paddingVertical: 8,
        borderRadius: 20,
        borderWidth: 1,
        borderColor: "#333",
    },
    noLocationText: {
        color: "#999",
        fontSize: 12,
        fontWeight: "600",
    },
});
