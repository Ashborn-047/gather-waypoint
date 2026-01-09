import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Crypto from "expo-crypto";

/**
 * Device Identity Service
 * 
 * Generates and persists a unique device ID for anonymous authentication.
 * The device ID is stable across app restarts but unique per device.
 */

const DEVICE_ID_KEY = "@gather/device_id";

let cachedDeviceId: string | null = null;

/**
 * Generate a unique device ID using cryptographic random bytes
 */
async function generateDeviceId(): Promise<string> {
    const randomBytes = await Crypto.getRandomBytesAsync(16);
    const hex = Array.from(randomBytes)
        .map((b) => b.toString(16).padStart(2, "0"))
        .join("");
    return `device_${hex}`;
}

/**
 * Get or create a persistent device ID
 */
export async function getDeviceId(): Promise<string> {
    // Return cached value if available
    if (cachedDeviceId) {
        return cachedDeviceId;
    }

    try {
        // Try to load from storage
        const stored = await AsyncStorage.getItem(DEVICE_ID_KEY);
        if (stored) {
            cachedDeviceId = stored;
            return stored;
        }

        // Generate new ID
        const newId = await generateDeviceId();
        await AsyncStorage.setItem(DEVICE_ID_KEY, newId);
        cachedDeviceId = newId;
        return newId;
    } catch (error) {
        console.error("Failed to get/create device ID:", error);
        // Fallback to in-memory ID (will change on restart)
        const fallback = await generateDeviceId();
        cachedDeviceId = fallback;
        return fallback;
    }
}

/**
 * Clear device ID (for testing/debugging)
 */
export async function clearDeviceId(): Promise<void> {
    cachedDeviceId = null;
    await AsyncStorage.removeItem(DEVICE_ID_KEY);
}
