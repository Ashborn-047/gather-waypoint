import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { ConvexProvider, ConvexReactClient } from "convex/react";
import { View, StyleSheet, Platform } from "react-native";

/**
 * Root Layout
 * 
 * Sets up providers and navigation structure for the Gather app.
 */

// Polyfill for React Native - Convex expects browser globals
if (Platform.OS !== "web") {
    // @ts-ignore - Polyfill for Convex client
    if (typeof window !== "undefined" && !window.addEventListener) {
        // @ts-ignore
        window.addEventListener = () => { };
        // @ts-ignore
        window.removeEventListener = () => { };
    }
}

// Convex client instance - created once outside component
const convexUrl = process.env.EXPO_PUBLIC_CONVEX_URL || "https://placeholder.convex.cloud";
const convex = new ConvexReactClient(convexUrl);

export default function RootLayout() {

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
