import { useState, useEffect } from "react";
import {
    View,
    Text,
    TextInput,
    TouchableOpacity,
    StyleSheet,
    KeyboardAvoidingView,
    Platform,
    ActivityIndicator,
} from "react-native";
import { useRouter } from "expo-router";
import { useMutation } from "convex/react";
import { api } from "../convex/_generated/api";
import { getDeviceId } from "../lib/device";

/**
 * Home Screen
 * 
 * Entry point for the Gather app.
 * Users can create a new session or join an existing one.
 */

export default function HomeScreen() {
    const router = useRouter();
    const [displayName, setDisplayName] = useState("");
    const [joinCode, setJoinCode] = useState("");
    const [isCreating, setIsCreating] = useState(false);
    const [isJoining, setIsJoining] = useState(false);
    const [error, setError] = useState<string | null>(null);

    // Convex mutations
    const createSession = useMutation(api.sessions.createSession);
    const joinSession = useMutation(api.sessions.joinSession);

    // Load saved display name
    useEffect(() => {
        // Could load from AsyncStorage if we want persistence
    }, []);

    const handleCreateSession = async () => {
        if (!displayName.trim()) {
            setError("Please enter your name");
            return;
        }

        setIsCreating(true);
        setError(null);

        try {
            const deviceId = await getDeviceId();
            const result = await createSession({
                deviceId,
                displayName: displayName.trim(),
            });

            // Navigate to session
            router.push(`/session/${result.sessionId}`);
        } catch (err) {
            setError(err instanceof Error ? err.message : "Failed to create session");
        } finally {
            setIsCreating(false);
        }
    };

    const handleJoinSession = async () => {
        if (!displayName.trim()) {
            setError("Please enter your name");
            return;
        }
        if (!joinCode.trim()) {
            setError("Please enter a session code");
            return;
        }

        setIsJoining(true);
        setError(null);

        try {
            const deviceId = await getDeviceId();
            const result = await joinSession({
                code: joinCode.trim().toUpperCase(),
                deviceId,
                displayName: displayName.trim(),
            });

            // Navigate to session
            router.push(`/session/${result.sessionId}`);
        } catch (err) {
            setError(err instanceof Error ? err.message : "Failed to join session");
        } finally {
            setIsJoining(false);
        }
    };

    const isLoading = isCreating || isJoining;

    return (
        <KeyboardAvoidingView
            style={styles.container}
            behavior={Platform.OS === "ios" ? "padding" : "height"}
        >
            <View style={styles.content}>
                {/* Logo / Title */}
                <View style={styles.header}>
                    <Text style={styles.logo}>⦿</Text>
                    <Text style={styles.title}>Gather</Text>
                    <Text style={styles.subtitle}>Real-time journey coordination</Text>
                </View>

                {/* Name Input */}
                <View style={styles.section}>
                    <Text style={styles.label}>YOUR NAME</Text>
                    <TextInput
                        style={styles.input}
                        value={displayName}
                        onChangeText={setDisplayName}
                        placeholder="Enter your name"
                        placeholderTextColor="#666"
                        autoCapitalize="words"
                        maxLength={20}
                    />
                </View>

                {/* Create Session */}
                <TouchableOpacity
                    style={[styles.button, styles.primaryButton]}
                    onPress={handleCreateSession}
                    disabled={isLoading}
                >
                    {isCreating ? (
                        <ActivityIndicator color="#fff" />
                    ) : (
                        <Text style={styles.buttonText}>Create a Gather</Text>
                    )}
                </TouchableOpacity>

                {/* Divider */}
                <View style={styles.divider}>
                    <View style={styles.dividerLine} />
                    <Text style={styles.dividerText}>or</Text>
                    <View style={styles.dividerLine} />
                </View>

                {/* Join Session */}
                <View style={styles.section}>
                    <Text style={styles.label}>JOIN CODE</Text>
                    <TextInput
                        style={styles.input}
                        value={joinCode}
                        onChangeText={(text) => setJoinCode(text.toUpperCase())}
                        placeholder="Enter 6-character code"
                        placeholderTextColor="#666"
                        autoCapitalize="characters"
                        maxLength={6}
                    />
                </View>

                <TouchableOpacity
                    style={[styles.button, styles.secondaryButton]}
                    onPress={handleJoinSession}
                    disabled={isLoading}
                >
                    {isJoining ? (
                        <ActivityIndicator color="#34D399" />
                    ) : (
                        <Text style={[styles.buttonText, styles.secondaryButtonText]}>
                            Join Session
                        </Text>
                    )}
                </TouchableOpacity>

                {/* Error Message */}
                {error && (
                    <View style={styles.errorContainer}>
                        <Text style={styles.errorText}>{error}</Text>
                    </View>
                )}
            </View>

            {/* Footer */}
            <View style={styles.footer}>
                <Text style={styles.footerText}>Powered by Waypoint</Text>
            </View>
        </KeyboardAvoidingView>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: "#0a0a0a",
    },
    content: {
        flex: 1,
        justifyContent: "center",
        paddingHorizontal: 24,
        paddingTop: 60,
    },
    header: {
        alignItems: "center",
        marginBottom: 48,
    },
    logo: {
        fontSize: 48,
        color: "#34D399",
        marginBottom: 8,
    },
    title: {
        fontSize: 32,
        fontWeight: "700",
        color: "#fff",
        letterSpacing: -0.5,
    },
    subtitle: {
        fontSize: 14,
        color: "#666",
        marginTop: 4,
    },
    section: {
        marginBottom: 16,
    },
    label: {
        fontSize: 10,
        fontWeight: "600",
        color: "#666",
        letterSpacing: 1,
        marginBottom: 8,
    },
    input: {
        backgroundColor: "#1a1a1a",
        borderRadius: 12,
        borderWidth: 1,
        borderColor: "#333",
        paddingHorizontal: 16,
        paddingVertical: 14,
        fontSize: 16,
        color: "#fff",
    },
    button: {
        borderRadius: 12,
        paddingVertical: 16,
        alignItems: "center",
        justifyContent: "center",
        minHeight: 52,
    },
    primaryButton: {
        backgroundColor: "#34D399",
    },
    secondaryButton: {
        backgroundColor: "transparent",
        borderWidth: 1,
        borderColor: "#34D399",
    },
    buttonText: {
        fontSize: 16,
        fontWeight: "600",
        color: "#fff",
    },
    secondaryButtonText: {
        color: "#34D399",
    },
    divider: {
        flexDirection: "row",
        alignItems: "center",
        marginVertical: 24,
    },
    dividerLine: {
        flex: 1,
        height: 1,
        backgroundColor: "#333",
    },
    dividerText: {
        color: "#666",
        paddingHorizontal: 16,
        fontSize: 12,
    },
    errorContainer: {
        marginTop: 16,
        padding: 12,
        backgroundColor: "rgba(239, 68, 68, 0.1)",
        borderRadius: 8,
        borderWidth: 1,
        borderColor: "rgba(239, 68, 68, 0.3)",
    },
    errorText: {
        color: "#EF4444",
        fontSize: 14,
        textAlign: "center",
    },
    footer: {
        paddingBottom: 32,
        alignItems: "center",
    },
    footerText: {
        fontSize: 12,
        color: "#444",
    },
});
