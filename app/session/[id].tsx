import { useEffect, useState, useCallback } from "react";
import {
    View,
    Text,
    TouchableOpacity,
    StyleSheet,
    Share,
    ActivityIndicator,
    Alert,
    Linking,
} from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useQuery, useMutation } from "convex/react";
import { api } from "../../convex/_generated/api";
import { Id } from "../../convex/_generated/dataModel";
import { getDeviceId } from "../../lib/device";
import { formatDistance, formatETA } from "../../lib/geo";
import { useLocation } from "../../hooks/useLocation";
import { useRouteRecomputation } from "../../hooks/useRouteRecomputation";
import SessionMap from "../../components/SessionMap";
import DestinationPicker from "../../components/DestinationPicker";

/**
 * Session Screen
 * 
 * The main session view showing:
 * - Interactive map with participant locations
 * - Destination marker
 * - ETA panel
 * - Share/Leave controls
 * - Location tracking
 */

// App deep link scheme (configure in app.json)
const APP_SCHEME = "gather";

export default function SessionScreen() {
    const { id } = useLocalSearchParams<{ id: string }>();
    const router = useRouter();
    const sessionId = id as Id<"sessions">;

    const [deviceId, setDeviceId] = useState<string | null>(null);
    const [showDestinationPicker, setShowDestinationPicker] = useState(false);

    // Load device ID
    useEffect(() => {
        getDeviceId().then(setDeviceId);
    }, []);

    // Location tracking hook
    const {
        location: userLocation,
        error: locationError,
        isTracking,
        permissionStatus,
        requestPermission,
        startTracking,
    } = useLocation({
        sessionId,
        deviceId: deviceId || "",
        enabled: !!deviceId,
        interval: 3000,
    });

    // Convex queries (auto-subscribed for real-time updates)
    const session = useQuery(api.sessions.getSession, { sessionId });
    const participants = useQuery(api.presence.getLiveParticipants, { sessionId });
    const etas = useQuery(api.eta.getETAs, { sessionId });

    // Convex mutations
    const leaveSession = useMutation(api.sessions.leaveSession);
    const reportDelay = useMutation(api.presence.reportDelay);
    const setWaypoint = useMutation(api.destination.setWaypoint);

    // Find current participant ID for route recomputation
    const currentParticipant = participants?.find(p => p.id === deviceId) || participants?.[0];

    // Route recomputation hook (auto-triggers on destination change, drift, stale)
    const mapDestination = session?.destination ? {
        latitude: (session.destination as any).latitude ?? (session.destination as any).lat,
        longitude: (session.destination as any).longitude ?? (session.destination as any).lng ?? (session.destination as any).lon,
    } : null;

    useRouteRecomputation({
        sessionId,
        participantId: currentParticipant?.participantId as any,
        userLocation,
        destination: mapDestination,
        enabled: !!currentParticipant && !!mapDestination,
    });

    // Handle session not found or ended
    useEffect(() => {
        if (session === null) {
            Alert.alert("Session Not Found", "This session no longer exists.", [
                { text: "OK", onPress: () => router.replace("/") },
            ]);
        } else if (session?.status === "ended") {
            Alert.alert("Session Ended", "This session has ended.", [
                { text: "OK", onPress: () => router.replace("/") },
            ]);
        }
    }, [session, router]);

    // Request location permission on mount
    useEffect(() => {
        if (permissionStatus === null) {
            requestPermission();
        }
    }, [permissionStatus, requestPermission]);

    // Share session code with deep link
    const handleShare = useCallback(async () => {
        if (!session?.code) return;

        const deepLink = `${APP_SCHEME}://join/${session.code}`;
        const webFallback = `https://gather.app/join/${session.code}`; // Placeholder for web app

        try {
            await Share.share({
                message: `Join my Gather session!\n\n🎯 Code: ${session.code}\n\n📱 Open in app: ${deepLink}\n\n🌐 Or visit: ${webFallback}\n\nTrack our journey together in real-time!`,
                title: "Join my Gather session",
            });
        } catch (error) {
            console.error("Share failed:", error);
        }
    }, [session?.code]);

    // Leave session
    const handleLeave = useCallback(async () => {
        if (!deviceId) return;

        Alert.alert("Leave Session", "Are you sure you want to leave?", [
            { text: "Cancel", style: "cancel" },
            {
                text: "Leave",
                style: "destructive",
                onPress: async () => {
                    try {
                        await leaveSession({ sessionId, deviceId });
                        router.replace("/");
                    } catch (error) {
                        console.error("Failed to leave:", error);
                    }
                },
            },
        ]);
    }, [deviceId, sessionId, leaveSession, router]);

    // Report delay
    const handleReportDelay = useCallback(async () => {
        if (!deviceId) return;

        Alert.alert("Report Delay", "How long will you be delayed?", [
            {
                text: "5 minutes",
                onPress: () =>
                    reportDelay({
                        sessionId,
                        deviceId,
                        type: "traffic",
                        delayMinutes: 5,
                    }),
            },
            {
                text: "10 minutes",
                onPress: () =>
                    reportDelay({
                        sessionId,
                        deviceId,
                        type: "traffic",
                        delayMinutes: 10,
                    }),
            },
            {
                text: "15+ minutes",
                onPress: () =>
                    reportDelay({
                        sessionId,
                        deviceId,
                        type: "blocked",
                        delayMinutes: 15,
                    }),
            },
            { text: "Cancel", style: "cancel" },
        ]);
    }, [deviceId, sessionId, reportDelay]);

    // Set destination
    const handleSetDestination = useCallback(
        async (destination: { latitude: number; longitude: number; name: string }) => {
            try {
                await setWaypoint({
                    sessionId,
                    latitude: destination.latitude,
                    longitude: destination.longitude,
                    name: destination.name,
                });
            } catch (error) {
                console.error("Failed to set destination:", error);
                Alert.alert("Error", "Failed to set destination. Please try again.");
            }
        },
        [sessionId, setWaypoint]
    );

    // Handle map tap to set destination
    const handleMapPress = useCallback(
        (coordinate: { latitude: number; longitude: number }) => {
            if (!session?.destination) {
                // If no destination set, prompt to set one
                Alert.alert("Set Destination", "Set this location as the meeting point?", [
                    { text: "Cancel", style: "cancel" },
                    {
                        text: "Set",
                        onPress: () =>
                            handleSetDestination({
                                latitude: coordinate.latitude,
                                longitude: coordinate.longitude,
                                name: "Meeting Point",
                            }),
                    },
                ]);
            }
        },
        [session?.destination, handleSetDestination]
    );

    // Transform participants for map
    const mapParticipants = (participants || []).map((p) => {
        // ULTRA-DEFENSIVE: Handle latitude/longitude, lat/lng, and lat/lon
        const loc = p.location;
        const latitude = loc?.latitude ?? (loc as any)?.lat ?? 0;
        const longitude = loc?.longitude ?? (loc as any)?.lng ?? (loc as any)?.lon ?? 0;

        return {
            id: p.id,
            displayName: p.displayName,
            color: p.color,
            location: loc ? { latitude, longitude } : undefined,
            delay: p.delay,
        };
    });

    // ULTRA-DEFENSIVE: Map destination from any possible naming convention
    const mapDestination = session?.destination ? {
        latitude: (session.destination as any).latitude ?? (session.destination as any).lat,
        longitude: (session.destination as any).longitude ?? (session.destination as any).lng ?? (session.destination as any).lon,
        name: session.destination.name,
        updatedAt: (session.destination as any).updatedAt // Required for resetting camera on "search same"
    } : null;

    // Loading state: Wait for session, participants, and VALID user location
    const hasValidLocation = userLocation && userLocation.latitude !== 0 && userLocation.longitude !== 0;

    if (!session || !participants || !hasValidLocation) {
        return (
            <View style={styles.loadingContainer}>
                <ActivityIndicator size="large" color="#34D399" />
                <Text style={styles.loadingText}>🛰️ Searching for GPS signal...</Text>
            </View>
        );
    }

    return (
        <View style={styles.container}>
            {/* Header */}
            <View style={styles.header}>
                <View style={styles.headerLeft}>
                    <Text style={styles.sessionCode}>{session.code}</Text>
                    <View style={styles.statusRow}>
                        <Text style={styles.participantCount}>
                            {participants.length} participant{participants.length !== 1 ? "s" : ""}
                        </Text>
                        {isTracking && (
                            <View style={styles.trackingBadge}>
                                <Text style={styles.trackingDot}>●</Text>
                                <Text style={styles.trackingText}>GPS</Text>
                            </View>
                        )}
                    </View>
                </View>
                <View style={styles.headerRight}>
                    <TouchableOpacity style={styles.headerButton} onPress={handleShare}>
                        <Text style={styles.headerButtonText}>Share</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                        style={[styles.headerButton, styles.dangerButton]}
                        onPress={handleLeave}
                    >
                        <Text style={[styles.headerButtonText, styles.dangerText]}>Leave</Text>
                    </TouchableOpacity>
                </View>
            </View>

            {/* Map View */}
            <View style={styles.mapContainer}>
                <SessionMap
                    participants={mapParticipants}
                    destination={mapDestination}
                    userLocation={userLocation}
                    currentDeviceId={deviceId || undefined}
                    routes={etas?.etas}
                    onMapPress={handleMapPress}
                />

                {/* Set Destination Button */}
                {!session.destination && (
                    <TouchableOpacity
                        style={styles.setDestinationButton}
                        onPress={() => setShowDestinationPicker(true)}
                    >
                        <Text style={styles.setDestinationText}>📍 Set Meeting Point</Text>
                    </TouchableOpacity>
                )}

                {/* Location Error Banner */}
                {locationError && (
                    <View style={styles.errorBanner}>
                        <Text style={styles.errorText}>⚠️ {locationError}</Text>
                        <TouchableOpacity onPress={startTracking}>
                            <Text style={styles.retryText}>Retry</Text>
                        </TouchableOpacity>
                    </View>
                )}
            </View>

            {/* ETA Panel */}
            {etas?.hasDestination && (
                <View style={styles.etaPanel}>
                    <View style={styles.etaHeader}>
                        <Text style={styles.etaPanelTitle}>ARRIVALS</Text>
                        {session.destination?.name && (
                            <Text style={styles.destinationName}>📍 {session.destination.name}</Text>
                        )}
                    </View>
                    {etas.etas.map((eta) => {
                        const participant = participants.find((p) => p.id === eta.participantId);
                        if (!participant) return null;
                        return (
                            <View key={eta.participantId} style={styles.etaRow}>
                                <View style={styles.etaParticipant}>
                                    <View style={[styles.etaDot, { backgroundColor: participant.color }]} />
                                    <Text style={styles.etaName}>{participant.displayName}</Text>
                                    {participant.delay && (
                                        <Text style={styles.etaDelayed}>delayed</Text>
                                    )}
                                </View>
                                <View style={styles.etaValues}>
                                    <Text style={styles.etaTime}>{formatETA(eta.etaSeconds)}</Text>
                                    <Text style={styles.etaDistance}>
                                        {formatDistance(eta.distanceMeters)}
                                    </Text>
                                </View>
                            </View>
                        );
                    })}
                </View>
            )}

            {/* Bottom Controls */}
            <View style={styles.bottomControls}>
                <TouchableOpacity style={styles.delayButton} onPress={handleReportDelay}>
                    <Text style={styles.delayButtonText}>🚨 Running Late</Text>
                </TouchableOpacity>
            </View>

            {/* Destination Picker Modal */}
            <DestinationPicker
                visible={showDestinationPicker}
                onClose={() => setShowDestinationPicker(false)}
                onSelect={handleSetDestination}
                currentLocation={userLocation}
            />
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: "#0a0a0a",
    },
    loadingContainer: {
        flex: 1,
        justifyContent: "center",
        alignItems: "center",
        backgroundColor: "#0a0a0a",
    },
    loadingText: {
        marginTop: 16,
        color: "#666",
        fontSize: 14,
    },
    header: {
        flexDirection: "row",
        justifyContent: "space-between",
        alignItems: "center",
        paddingHorizontal: 16,
        paddingTop: 60,
        paddingBottom: 12,
        backgroundColor: "#111",
        borderBottomWidth: 1,
        borderBottomColor: "#222",
    },
    headerLeft: {},
    headerRight: {
        flexDirection: "row",
        gap: 8,
    },
    sessionCode: {
        fontSize: 24,
        fontWeight: "700",
        color: "#fff",
        letterSpacing: 2,
    },
    statusRow: {
        flexDirection: "row",
        alignItems: "center",
        gap: 8,
        marginTop: 2,
    },
    participantCount: {
        fontSize: 12,
        color: "#666",
    },
    trackingBadge: {
        flexDirection: "row",
        alignItems: "center",
        gap: 4,
        backgroundColor: "rgba(52, 211, 153, 0.15)",
        paddingHorizontal: 8,
        paddingVertical: 2,
        borderRadius: 10,
    },
    trackingDot: {
        color: "#34D399",
        fontSize: 8,
    },
    trackingText: {
        color: "#34D399",
        fontSize: 10,
        fontWeight: "600",
    },
    headerButton: {
        paddingHorizontal: 16,
        paddingVertical: 8,
        backgroundColor: "#222",
        borderRadius: 8,
    },
    headerButtonText: {
        color: "#fff",
        fontSize: 14,
        fontWeight: "500",
    },
    dangerButton: {
        backgroundColor: "rgba(239, 68, 68, 0.1)",
    },
    dangerText: {
        color: "#EF4444",
    },
    mapContainer: {
        flex: 1,
        position: "relative",
    },
    setDestinationButton: {
        position: "absolute",
        top: 16,
        alignSelf: "center",
        backgroundColor: "#34D399",
        paddingHorizontal: 20,
        paddingVertical: 12,
        borderRadius: 24,
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.3,
        shadowRadius: 4,
        elevation: 5,
    },
    setDestinationText: {
        color: "#000",
        fontSize: 14,
        fontWeight: "600",
    },
    errorBanner: {
        position: "absolute",
        bottom: 16,
        left: 16,
        right: 16,
        backgroundColor: "rgba(239, 68, 68, 0.9)",
        borderRadius: 12,
        padding: 12,
        flexDirection: "row",
        justifyContent: "space-between",
        alignItems: "center",
    },
    errorText: {
        color: "#fff",
        fontSize: 13,
    },
    retryText: {
        color: "#fff",
        fontSize: 13,
        fontWeight: "600",
        textDecorationLine: "underline",
    },
    etaPanel: {
        backgroundColor: "#111",
        borderTopWidth: 1,
        borderTopColor: "#222",
        padding: 16,
    },
    etaHeader: {
        flexDirection: "row",
        justifyContent: "space-between",
        alignItems: "center",
        marginBottom: 12,
    },
    etaPanelTitle: {
        fontSize: 10,
        fontWeight: "600",
        color: "#666",
        letterSpacing: 1,
    },
    destinationName: {
        fontSize: 12,
        color: "#34D399",
    },
    etaRow: {
        flexDirection: "row",
        justifyContent: "space-between",
        alignItems: "center",
        paddingVertical: 8,
    },
    etaParticipant: {
        flexDirection: "row",
        alignItems: "center",
        gap: 8,
    },
    etaDot: {
        width: 8,
        height: 8,
        borderRadius: 4,
    },
    etaName: {
        color: "#fff",
        fontSize: 14,
    },
    etaDelayed: {
        fontSize: 10,
        color: "#FCD34D",
        backgroundColor: "rgba(252, 211, 77, 0.1)",
        paddingHorizontal: 6,
        paddingVertical: 2,
        borderRadius: 4,
        overflow: "hidden",
    },
    etaValues: {
        alignItems: "flex-end",
    },
    etaTime: {
        color: "#34D399",
        fontSize: 16,
        fontWeight: "600",
    },
    etaDistance: {
        color: "#666",
        fontSize: 12,
    },
    bottomControls: {
        padding: 16,
        paddingBottom: 32,
        backgroundColor: "#111",
        borderTopWidth: 1,
        borderTopColor: "#222",
    },
    delayButton: {
        backgroundColor: "rgba(252, 211, 77, 0.1)",
        borderWidth: 1,
        borderColor: "#FCD34D",
        borderRadius: 12,
        paddingVertical: 14,
        alignItems: "center",
    },
    delayButtonText: {
        color: "#FCD34D",
        fontSize: 16,
        fontWeight: "600",
    },
});
