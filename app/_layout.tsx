import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { ConvexProvider, ConvexReactClient } from "convex/react";
import { useMemo } from "react";
import { View, StyleSheet } from "react-native";

/**
 * Root Layout
 * 
 * Sets up providers and navigation structure for the Gather app.
 */

// Convex client instance
// TODO: Replace with actual deployment URL after `npx convex dev`
const convexUrl = process.env.EXPO_PUBLIC_CONVEX_URL || "https://placeholder.convex.cloud";

export default function RootLayout() {
    // Create Convex client (memoized to prevent recreation)
    const convex = useMemo(() => new ConvexReactClient(convexUrl), []);

    return (
        <ConvexProvider client={convex}>
            <View style={styles.container}>
                <StatusBar style="light" />
                <Stack
                    screenOptions={{
                        headerShown: false,
                        contentStyle: { backgroundColor: "#0a0a0a" },
                        animation: "slide_from_right",
                    }}
                >
                    <Stack.Screen name="index" />
                    <Stack.Screen name="session/[id]" />
                    <Stack.Screen name="join/[code]" />
                </Stack>
            </View>
        </ConvexProvider>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: "#0a0a0a",
    },
});
