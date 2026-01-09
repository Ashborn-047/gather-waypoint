import { useEffect, useState, useCallback } from "react";
import {
    View,
    Text,
    TouchableOpacity,
    StyleSheet,
    Share,
    ActivityIndicator,
    Alert,
} from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useQuery, useMutation, useAction } from "convex/react";
import { api } from "../../convex/_generated/api";
import { Id } from "../../convex/_generated/dataModel";
import { getDeviceId } from "../../lib/device";
import { formatDistance, formatETA } from "../../lib/geo";

/**
 * Session Screen
 * 
 * The main session view showing:
 * - Map with participant locations
 * - Destination marker
 * - ETA panel
 * - Share/Leave controls
 */

export default function SessionScreen() {
    const { id } = useLocalSearchParams<{ id: string }>();
    const router = useRouter();
    const sessionId = id as Id<"sessions">;

    const [deviceId, setDeviceId] = useState<string | null>(null);

    // Load device ID
    useEffect(() => {
        getDeviceId().then(setDeviceId);
    }, []);

    // Convex queries (auto-subscribed for real-time updates)
    const session = useQuery(api.sessions.getSession, { sessionId });
    const participants = useQuery(api.presence.getLiveParticipants, { sessionId });
    const etas = useQuery(api.eta.getETAs, { sessionId });

    // Convex mutations
    const leaveSession = useMutation(api.sessions.leaveSession);
    const updateLocation = useMutation(api.presence.updateLocation);
    const reportDelay = useMutation(api.presence.reportDelay);
    const clearDelay = useMutation(api.presence.clearDelay);
    const setWaypoint = useMutation(api.destination.setWaypoint);

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

    // Share session code
    const handleShare = useCallback(async () => {
        if (!session?.code) return;

        try {
            await Share.share({
                message: `Join my Gather session!\n\nCode: ${session.code}\n\nDownload Gather to track our journey together.`,
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

        // Simple delay options
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

    // Loading state
    if (!session || !participants) {
        return (
            <View style={styles.loadingContainer}>
                <ActivityIndicator size="large" color="#34D399" />
                <Text style={styles.loadingText}>Loading session...</Text>
            </View>
        );
    }

    return (
        <View style={styles.container}>
            {/* Header */}
            <View style={styles.header}>
                <View style={styles.headerLeft}>
                    <Text style={styles.sessionCode}>{session.code}</Text>
                    <Text style={styles.participantCount}>
                        {participants.length} participant{participants.length !== 1 ? "s" : ""}
                    </Text>
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

            {/* Map Placeholder */}
            <View style={styles.mapContainer}>
                <View style={styles.mapPlaceholder}>
                    <Text style={styles.mapPlaceholderText}>🗺️</Text>
                    <Text style={styles.mapPlaceholderLabel}>Map View</Text>
                    <Text style={styles.mapPlaceholderSub}>
                        {session.destination
                            ? `Destination: ${session.destination.name || "Set"}`
                            : "No destination set"}
                    </Text>
                </View>

                {/* Participant Markers (Preview) */}
                {participants.map((p, index) => (
                    <View
                        key={p.id}
                        style={[
                            styles.participantMarker,
                            {
                                left: 50 + (index * 30) % 200,
                                top: 100 + (index * 40) % 200,
                                borderColor: p.color,
                            },
                        ]}
                    >
                        <Text style={styles.participantInitials}>
                            {p.displayName.slice(0, 2).toUpperCase()}
                        </Text>
                        {p.delay && (
                            <View style={styles.delayBadge}>
                                <Text style={styles.delayBadgeText}>⚠️</Text>
                            </View>
                        )}
                    </View>
                ))}
            </View>

            {/* ETA Panel */}
            {etas?.hasDestination && (
                <View style={styles.etaPanel}>
                    <Text style={styles.etaPanelTitle}>Estimated Arrivals</Text>
                    {etas.etas.map((eta) => {
                        const participant = participants.find(
                            (p) => p.id === eta.participantId
                        );
                        if (!participant) return null;
                        return (
                            <View key={eta.participantId} style={styles.etaRow}>
                                <View style={styles.etaParticipant}>
                                    <View
                                        style={[styles.etaDot, { backgroundColor: participant.color }]}
                                    />
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
                <TouchableOpacity
                    style={styles.delayButton}
                    onPress={handleReportDelay}
                >
                    <Text style={styles.delayButtonText}>🚨 Running Late</Text>
                </TouchableOpacity>
            </View>
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
        paddingBottom: 16,
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
    participantCount: {
        fontSize: 12,
        color: "#666",
        marginTop: 2,
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
        backgroundColor: "#1a1a1a",
        position: "relative",
    },
    mapPlaceholder: {
        flex: 1,
        justifyContent: "center",
        alignItems: "center",
    },
    mapPlaceholderText: {
        fontSize: 64,
        opacity: 0.3,
    },
    mapPlaceholderLabel: {
        fontSize: 18,
        color: "#444",
        marginTop: 8,
    },
    mapPlaceholderSub: {
        fontSize: 12,
        color: "#333",
        marginTop: 4,
    },
    participantMarker: {
        position: "absolute",
        width: 36,
        height: 36,
        borderRadius: 18,
        backgroundColor: "#1a1a1a",
        borderWidth: 2,
        justifyContent: "center",
        alignItems: "center",
    },
    participantInitials: {
        fontSize: 10,
        fontWeight: "600",
        color: "#fff",
    },
    delayBadge: {
        position: "absolute",
        top: -4,
        right: -4,
        width: 16,
        height: 16,
        borderRadius: 8,
        backgroundColor: "#FCD34D",
        justifyContent: "center",
        alignItems: "center",
    },
    delayBadgeText: {
        fontSize: 8,
    },
    etaPanel: {
        backgroundColor: "#111",
        borderTopWidth: 1,
        borderTopColor: "#222",
        padding: 16,
    },
    etaPanelTitle: {
        fontSize: 10,
        fontWeight: "600",
        color: "#666",
        letterSpacing: 1,
        marginBottom: 12,
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
