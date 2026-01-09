import { useEffect, useState } from "react";
import { View, Text, StyleSheet, ActivityIndicator } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useMutation } from "convex/react";
import { api } from "../../convex/_generated/api";
import { getDeviceId } from "../../lib/device";

/**
 * Join Screen (Deep Link Handler)
 * 
 * Handles joining a session via a shared code/link.
 * Automatically joins and redirects to the session view.
 */

export default function JoinScreen() {
    const { code } = useLocalSearchParams<{ code: string }>();
    const router = useRouter();

    const [error, setError] = useState<string | null>(null);
    const [isJoining, setIsJoining] = useState(true);

    const joinSession = useMutation(api.sessions.joinSession);

    useEffect(() => {
        async function attemptJoin() {
            if (!code) {
                setError("No session code provided");
                setIsJoining(false);
                return;
            }

            try {
                const deviceId = await getDeviceId();

                // Use a default name for quick join (can be changed later)
                const result = await joinSession({
                    code: code.toUpperCase(),
                    deviceId,
                    displayName: "Guest", // TODO: Prompt for name or use stored name
                });

                // Navigate to session
                router.replace(`/session/${result.sessionId}`);
            } catch (err) {
                setError(err instanceof Error ? err.message : "Failed to join session");
                setIsJoining(false);
            }
        }

        attemptJoin();
    }, [code, joinSession, router]);

    if (error) {
        return (
            <View style={styles.container}>
                <Text style={styles.errorIcon}>❌</Text>
                <Text style={styles.errorTitle}>Unable to Join</Text>
                <Text style={styles.errorMessage}>{error}</Text>
                <Text
                    style={styles.backLink}
                    onPress={() => router.replace("/")}
                >
                    ← Go Home
                </Text>
            </View>
        );
    }

    return (
        <View style={styles.container}>
            <ActivityIndicator size="large" color="#34D399" />
            <Text style={styles.joiningText}>Joining session...</Text>
            <Text style={styles.codeText}>{code?.toUpperCase()}</Text>
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        justifyContent: "center",
        alignItems: "center",
        backgroundColor: "#0a0a0a",
        padding: 24,
    },
    joiningText: {
        marginTop: 24,
        fontSize: 18,
        color: "#fff",
        fontWeight: "500",
    },
    codeText: {
        marginTop: 8,
        fontSize: 24,
        color: "#34D399",
        fontWeight: "700",
        letterSpacing: 4,
    },
    errorIcon: {
        fontSize: 48,
        marginBottom: 16,
    },
    errorTitle: {
        fontSize: 20,
        color: "#fff",
        fontWeight: "600",
        marginBottom: 8,
    },
    errorMessage: {
        fontSize: 14,
        color: "#666",
        textAlign: "center",
        marginBottom: 24,
    },
    backLink: {
        fontSize: 16,
        color: "#34D399",
        fontWeight: "500",
    },
});
