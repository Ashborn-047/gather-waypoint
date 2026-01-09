import React, { useMemo } from "react";
import { StyleSheet, View, Text, Dimensions } from "react-native";

/**
 * Session Map Component (Expo Go Compatible)
 * 
 * Visual map representation for Expo Go that doesn't use native map modules.
 * MapLibre/Google Maps require a development build - this works everywhere.
 * 
 * All interactions stay IN-APP - no external navigation handoffs.
 * 
 * For production: Switch to MapLibre with `npx expo prebuild`
 */

const { width, height } = Dimensions.get("window");

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
        delayMinutes: number;
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

// Calculate relative positions for participants based on lat/lng
function calculateRelativePositions(
    participants: Array<{ id: string; location: { latitude: number; longitude: number } }>,
    destination: Destination | null | undefined,
    userLocation: { latitude: number; longitude: number } | null | undefined,
    containerWidth: number,
    containerHeight: number
): Map<string, { x: number; y: number }> {
    const positions = new Map<string, { x: number; y: number }>();

    // Collect all points
    const points: Array<{ id: string; lat: number; lng: number }> = [];

    participants.forEach((p) => {
        if (p.location) {
            points.push({ id: p.id, lat: p.location.latitude, lng: p.location.longitude });
        }
    });

    if (destination) {
        points.push({ id: "__destination__", lat: destination.latitude, lng: destination.longitude });
    }

    if (userLocation) {
        points.push({ id: "__user__", lat: userLocation.latitude, lng: userLocation.longitude });
    }

    if (points.length === 0) return positions;

    // Find bounds
    let minLat = points[0].lat, maxLat = points[0].lat;
    let minLng = points[0].lng, maxLng = points[0].lng;

    points.forEach((p) => {
        minLat = Math.min(minLat, p.lat);
        maxLat = Math.max(maxLat, p.lat);
        minLng = Math.min(minLng, p.lng);
        maxLng = Math.max(maxLng, p.lng);
    });

    // Add padding
    const latPadding = (maxLat - minLat) * 0.2 || 0.01;
    const lngPadding = (maxLng - minLng) * 0.2 || 0.01;
    minLat -= latPadding;
    maxLat += latPadding;
    minLng -= lngPadding;
    maxLng += lngPadding;

    // Calculate positions with margins
    const margin = 60;
    const usableWidth = containerWidth - margin * 2;
    const usableHeight = containerHeight - margin * 2;

    points.forEach((p) => {
        const x = margin + ((p.lng - minLng) / (maxLng - minLng)) * usableWidth;
        const y = margin + ((maxLat - p.lat) / (maxLat - minLat)) * usableHeight;
        positions.set(p.id, { x, y });
    });

    return positions;
}

export default function SessionMap({
    participants,
    destination,
    userLocation,
    onMapPress,
}: SessionMapProps) {
    const participantsWithLocation = useMemo(
        () => participants.filter((p) => p.location) as Array<{ id: string; displayName: string; color: string; location: { latitude: number; longitude: number }; delay?: { type: string; delayMinutes: number } }>,
        [participants]
    );

    // Calculate positions
    const positions = useMemo(
        () => calculateRelativePositions(
            participantsWithLocation,
            destination,
            userLocation,
            width,
            height * 0.5
        ),
        [participantsWithLocation, destination, userLocation]
    );

    return (
        <View style={styles.container}>
            {/* Map Background */}
            <View style={styles.mapBackground}>
                {/* Grid lines */}
                <View style={styles.gridContainer}>
                    {[...Array(12)].map((_, i) => (
                        <View key={`h-${i}`} style={[styles.gridLineH, { top: `${(i + 1) * 8}%` }]} />
                    ))}
                    {[...Array(8)].map((_, i) => (
                        <View key={`v-${i}`} style={[styles.gridLineV, { left: `${(i + 1) * 12}%` }]} />
                    ))}
                </View>

                {/* Roads (decorative) */}
                <View style={[styles.road, styles.roadH1]} />
                <View style={[styles.road, styles.roadH2]} />
                <View style={[styles.road, styles.roadV1]} />
                <View style={[styles.road, styles.roadV2]} />

                {/* Destination Marker */}
                {destination && positions.get("__destination__") && (
                    <View
                        style={[
                            styles.destinationMarker,
                            {
                                left: positions.get("__destination__")!.x - 20,
                                top: positions.get("__destination__")!.y - 40,
                            },
                        ]}
                    >
                        <Text style={styles.destinationIcon}>📍</Text>
                        <Text style={styles.destinationLabel}>
                            {destination.name || "Destination"}
                        </Text>
                    </View>
                )}

                {/* Participant Markers */}
                {participantsWithLocation.map((p) => {
                    const pos = positions.get(p.id);
                    if (!pos) return null;

                    return (
                        <View
                            key={p.id}
                            style={[
                                styles.participantMarker,
                                {
                                    left: pos.x - 22,
                                    top: pos.y - 22,
                                    borderColor: p.color,
                                },
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
                    );
                })}

                {/* Empty State */}
                {participantsWithLocation.length === 0 && !userLocation && (
                    <View style={styles.emptyState}>
                        <Text style={styles.emptyIcon}>📍</Text>
                        <Text style={styles.emptyText}>Acquiring GPS signal...</Text>
                        <Text style={styles.emptySubtext}>
                            Participants will appear once location is shared
                        </Text>
                    </View>
                )}

                {/* Status Badge */}
                <View style={styles.statusBadge}>
                    <View style={styles.statusDot} />
                    <Text style={styles.statusText}>
                        {participantsWithLocation.length} tracking
                    </Text>
                </View>

                {/* Map Label */}
                <View style={styles.mapLabel}>
                    <Text style={styles.mapLabelText}>📡 Live Session Map</Text>
                </View>
            </View>

            {/* Coordinates Display */}
            {userLocation && (
                <View style={styles.coordsBar}>
                    <Text style={styles.coordsText}>
                        📍 {userLocation.latitude.toFixed(5)}, {userLocation.longitude.toFixed(5)}
                    </Text>
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
    mapBackground: {
        flex: 1,
        backgroundColor: "#111418",
        position: "relative",
        overflow: "hidden",
    },
    gridContainer: {
        ...StyleSheet.absoluteFillObject,
    },
    gridLineH: {
        position: "absolute",
        left: 0,
        right: 0,
        height: 1,
        backgroundColor: "rgba(52, 211, 153, 0.05)",
    },
    gridLineV: {
        position: "absolute",
        top: 0,
        bottom: 0,
        width: 1,
        backgroundColor: "rgba(52, 211, 153, 0.05)",
    },
    road: {
        position: "absolute",
        backgroundColor: "rgba(52, 211, 153, 0.12)",
    },
    roadH1: {
        top: "35%",
        left: 0,
        right: 0,
        height: 4,
    },
    roadH2: {
        top: "65%",
        left: 0,
        right: 0,
        height: 3,
    },
    roadV1: {
        left: "30%",
        top: 0,
        bottom: 0,
        width: 4,
    },
    roadV2: {
        left: "70%",
        top: 0,
        bottom: 0,
        width: 3,
    },
    participantMarker: {
        position: "absolute",
        width: 44,
        height: 44,
        borderRadius: 22,
        backgroundColor: "#1a2332",
        borderWidth: 3,
        justifyContent: "center",
        alignItems: "center",
        shadowColor: "#34D399",
        shadowOffset: { width: 0, height: 0 },
        shadowOpacity: 0.4,
        shadowRadius: 8,
        elevation: 8,
    },
    markerText: {
        color: "#fff",
        fontSize: 14,
        fontWeight: "700",
    },
    delayBadge: {
        position: "absolute",
        top: -6,
        right: -6,
        width: 20,
        height: 20,
        borderRadius: 10,
        backgroundColor: "#FCD34D",
        justifyContent: "center",
        alignItems: "center",
        borderWidth: 2,
        borderColor: "#1a2332",
    },
    delayText: {
        color: "#000",
        fontSize: 11,
        fontWeight: "700",
    },
    destinationMarker: {
        position: "absolute",
        alignItems: "center",
    },
    destinationIcon: {
        fontSize: 36,
    },
    destinationLabel: {
        color: "#34D399",
        fontSize: 10,
        marginTop: 2,
        fontWeight: "600",
        backgroundColor: "rgba(0,0,0,0.8)",
        paddingHorizontal: 8,
        paddingVertical: 3,
        borderRadius: 6,
    },
    emptyState: {
        flex: 1,
        justifyContent: "center",
        alignItems: "center",
    },
    emptyIcon: {
        fontSize: 56,
        opacity: 0.3,
    },
    emptyText: {
        color: "#666",
        fontSize: 16,
        marginTop: 16,
    },
    emptySubtext: {
        color: "#444",
        fontSize: 12,
        marginTop: 8,
        textAlign: "center",
        paddingHorizontal: 40,
    },
    statusBadge: {
        position: "absolute",
        bottom: 12,
        left: 12,
        flexDirection: "row",
        alignItems: "center",
        backgroundColor: "rgba(0,0,0,0.7)",
        paddingHorizontal: 12,
        paddingVertical: 6,
        borderRadius: 20,
        gap: 6,
    },
    statusDot: {
        width: 8,
        height: 8,
        borderRadius: 4,
        backgroundColor: "#34D399",
    },
    statusText: {
        color: "#999",
        fontSize: 12,
    },
    mapLabel: {
        position: "absolute",
        top: 12,
        right: 12,
        backgroundColor: "rgba(52, 211, 153, 0.15)",
        paddingHorizontal: 12,
        paddingVertical: 6,
        borderRadius: 12,
    },
    mapLabelText: {
        color: "#34D399",
        fontSize: 11,
        fontWeight: "600",
    },
    coordsBar: {
        paddingVertical: 8,
        paddingHorizontal: 12,
        backgroundColor: "#111",
        borderTopWidth: 1,
        borderTopColor: "#222",
    },
    coordsText: {
        color: "#34D399",
        fontSize: 11,
        fontFamily: "monospace",
        textAlign: "center",
    },
});
