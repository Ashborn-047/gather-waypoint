import React, { useState } from "react";
import {
    View,
    Text,
    TextInput,
    TouchableOpacity,
    StyleSheet,
    Modal,
    ActivityIndicator,
    Alert,
} from "react-native";

/**
 * Destination Picker Component
 * 
 * Modal for setting a destination with:
 * - Text search (placeholder for geocoding)
 * - Current location option
 * - Manual coordinate input
 */

interface DestinationPickerProps {
    visible: boolean;
    onClose: () => void;
    onSelect: (destination: { latitude: number; longitude: number; name: string }) => void;
    currentLocation?: { latitude: number; longitude: number } | null;
}

// Popular places as quick options (for demo)
const QUICK_OPTIONS = [
    { name: "Central Park", latitude: 40.7829, longitude: -73.9654 },
    { name: "Times Square", latitude: 40.7580, longitude: -73.9855 },
    { name: "Brooklyn Bridge", latitude: 40.7061, longitude: -73.9969 },
];

export default function DestinationPicker({
    visible,
    onClose,
    onSelect,
    currentLocation,
}: DestinationPickerProps) {
    const [searchQuery, setSearchQuery] = useState("");
    const [isSearching, setIsSearching] = useState(false);
    const [manualLat, setManualLat] = useState("");
    const [manualLng, setManualLng] = useState("");

    const handleSearch = async () => {
        if (!searchQuery.trim()) return;

        setIsSearching(true);

        // For now, use Nominatim (OpenStreetMap) for geocoding
        try {
            const response = await fetch(
                `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(searchQuery)}&limit=1`,
                {
                    headers: {
                        "User-Agent": "GatherApp/1.0",
                    },
                }
            );

            const results = await response.json();

            if (results && results.length > 0) {
                const place = results[0];
                onSelect({
                    latitude: parseFloat(place.lat),
                    longitude: parseFloat(place.lon),
                    name: place.display_name.split(",")[0],
                });
                onClose();
            } else {
                Alert.alert("Not Found", "Could not find that location. Try a different search.");
            }
        } catch (error) {
            console.error("Geocoding error:", error);
            Alert.alert("Error", "Failed to search for location.");
        } finally {
            setIsSearching(false);
        }
    };

    const handleManualInput = () => {
        const lat = parseFloat(manualLat);
        const lng = parseFloat(manualLng);

        if (isNaN(lat) || isNaN(lng)) {
            Alert.alert("Invalid Coordinates", "Please enter valid latitude and longitude.");
            return;
        }

        if (lat < -90 || lat > 90 || lng < -180 || lng > 180) {
            Alert.alert("Invalid Range", "Latitude must be -90 to 90, Longitude must be -180 to 180.");
            return;
        }

        onSelect({
            latitude: lat,
            longitude: lng,
            name: `${lat.toFixed(4)}, ${lng.toFixed(4)}`,
        });
        onClose();
    };

    const handleQuickOption = (option: typeof QUICK_OPTIONS[0]) => {
        onSelect({
            latitude: option.latitude,
            longitude: option.longitude,
            name: option.name,
        });
        onClose();
    };

    const handleUseCurrentLocation = () => {
        if (!currentLocation) {
            Alert.alert("Location Unavailable", "Your current location is not available yet.");
            return;
        }

        // Set destination slightly ahead of current location (for demo purposes)
        onSelect({
            latitude: currentLocation.latitude + 0.005,
            longitude: currentLocation.longitude + 0.005,
            name: "Near Current Location",
        });
        onClose();
    };

    return (
        <Modal visible={visible} animationType="slide" transparent>
            <View style={styles.overlay}>
                <View style={styles.container}>
                    {/* Header */}
                    <View style={styles.header}>
                        <Text style={styles.title}>Set Destination</Text>
                        <TouchableOpacity onPress={onClose}>
                            <Text style={styles.closeButton}>✕</Text>
                        </TouchableOpacity>
                    </View>

                    {/* Search Input */}
                    <View style={styles.searchContainer}>
                        <TextInput
                            style={styles.searchInput}
                            placeholder="Search for a place..."
                            placeholderTextColor="#666"
                            value={searchQuery}
                            onChangeText={setSearchQuery}
                            onSubmitEditing={handleSearch}
                            returnKeyType="search"
                        />
                        <TouchableOpacity
                            style={styles.searchButton}
                            onPress={handleSearch}
                            disabled={isSearching}
                        >
                            {isSearching ? (
                                <ActivityIndicator size="small" color="#fff" />
                            ) : (
                                <Text style={styles.searchButtonText}>🔍</Text>
                            )}
                        </TouchableOpacity>
                    </View>

                    {/* Quick Options */}
                    <View style={styles.section}>
                        <Text style={styles.sectionTitle}>QUICK OPTIONS</Text>
                        <TouchableOpacity
                            style={styles.optionButton}
                            onPress={handleUseCurrentLocation}
                        >
                            <Text style={styles.optionIcon}>📍</Text>
                            <Text style={styles.optionText}>Use Current Location Area</Text>
                        </TouchableOpacity>
                        {QUICK_OPTIONS.map((option) => (
                            <TouchableOpacity
                                key={option.name}
                                style={styles.optionButton}
                                onPress={() => handleQuickOption(option)}
                            >
                                <Text style={styles.optionIcon}>🏙️</Text>
                                <Text style={styles.optionText}>{option.name}</Text>
                            </TouchableOpacity>
                        ))}
                    </View>

                    {/* Manual Coordinates */}
                    <View style={styles.section}>
                        <Text style={styles.sectionTitle}>MANUAL COORDINATES</Text>
                        <View style={styles.coordRow}>
                            <TextInput
                                style={styles.coordInput}
                                placeholder="Latitude"
                                placeholderTextColor="#666"
                                value={manualLat}
                                onChangeText={setManualLat}
                                keyboardType="numeric"
                            />
                            <TextInput
                                style={styles.coordInput}
                                placeholder="Longitude"
                                placeholderTextColor="#666"
                                value={manualLng}
                                onChangeText={setManualLng}
                                keyboardType="numeric"
                            />
                            <TouchableOpacity
                                style={styles.coordButton}
                                onPress={handleManualInput}
                            >
                                <Text style={styles.coordButtonText}>Set</Text>
                            </TouchableOpacity>
                        </View>
                    </View>
                </View>
            </View>
        </Modal>
    );
}

const styles = StyleSheet.create({
    overlay: {
        flex: 1,
        backgroundColor: "rgba(0, 0, 0, 0.7)",
        justifyContent: "flex-end",
    },
    container: {
        backgroundColor: "#111",
        borderTopLeftRadius: 24,
        borderTopRightRadius: 24,
        paddingBottom: 40,
        maxHeight: "80%",
    },
    header: {
        flexDirection: "row",
        justifyContent: "space-between",
        alignItems: "center",
        padding: 20,
        borderBottomWidth: 1,
        borderBottomColor: "#222",
    },
    title: {
        fontSize: 18,
        fontWeight: "600",
        color: "#fff",
    },
    closeButton: {
        fontSize: 24,
        color: "#666",
    },
    searchContainer: {
        flexDirection: "row",
        margin: 16,
        gap: 8,
    },
    searchInput: {
        flex: 1,
        backgroundColor: "#1a1a1a",
        borderRadius: 12,
        paddingHorizontal: 16,
        paddingVertical: 12,
        color: "#fff",
        fontSize: 16,
    },
    searchButton: {
        backgroundColor: "#34D399",
        borderRadius: 12,
        width: 48,
        justifyContent: "center",
        alignItems: "center",
    },
    searchButtonText: {
        fontSize: 20,
    },
    section: {
        paddingHorizontal: 16,
        marginTop: 16,
    },
    sectionTitle: {
        fontSize: 10,
        fontWeight: "600",
        color: "#666",
        letterSpacing: 1,
        marginBottom: 12,
    },
    optionButton: {
        flexDirection: "row",
        alignItems: "center",
        backgroundColor: "#1a1a1a",
        borderRadius: 12,
        padding: 14,
        marginBottom: 8,
        gap: 12,
    },
    optionIcon: {
        fontSize: 20,
    },
    optionText: {
        color: "#fff",
        fontSize: 15,
    },
    coordRow: {
        flexDirection: "row",
        gap: 8,
    },
    coordInput: {
        flex: 1,
        backgroundColor: "#1a1a1a",
        borderRadius: 12,
        paddingHorizontal: 12,
        paddingVertical: 12,
        color: "#fff",
        fontSize: 14,
    },
    coordButton: {
        backgroundColor: "#34D399",
        borderRadius: 12,
        paddingHorizontal: 20,
        justifyContent: "center",
        alignItems: "center",
    },
    coordButtonText: {
        color: "#000",
        fontSize: 14,
        fontWeight: "600",
    },
});
