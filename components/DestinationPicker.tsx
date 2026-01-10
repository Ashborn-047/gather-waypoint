import React, { useState, useCallback } from "react";
import {
    View,
    Text,
    TextInput,
    TouchableOpacity,
    StyleSheet,
    Modal,
    ActivityIndicator,
    Alert,
    ScrollView,
} from "react-native";
import { useAction } from "convex/react";
import { api } from "../convex/_generated/api";

/**
 * Destination Picker Component
 * 
 * Modal for setting a destination with:
 * - Text search via Convex → Railway → Nominatim
 * - Current location option
 * - Manual coordinate input
 * 
 * Flow: Search → Convex geocodeSearch → Select → onSelect callback
 */

interface DestinationPickerProps {
    visible: boolean;
    onClose: () => void;
    onSelect: (destination: { latitude: number; longitude: number; name: string }) => void;
    currentLocation?: { latitude: number; longitude: number } | null;
}

interface SearchResult {
    name: string;
    displayName: string;
    lat: number;
    lng: number;
}

export default function DestinationPicker({
    visible,
    onClose,
    onSelect,
    currentLocation,
}: DestinationPickerProps) {
    const [searchQuery, setSearchQuery] = useState("");
    const [isSearching, setIsSearching] = useState(false);
    const [results, setResults] = useState<SearchResult[]>([]);
    const [manualLat, setManualLat] = useState("");
    const [manualLng, setManualLng] = useState("");

    // Convex geocoding action
    const geocodeSearch = useAction(api.geocoding.geocodeSearch);

    const handleSearch = useCallback(async () => {
        if (!searchQuery.trim() || searchQuery.trim().length < 2) return;

        setIsSearching(true);
        setResults([]);

        try {
            // Call Convex action (which proxies to Railway → Nominatim)
            const searchResults = await geocodeSearch({
                query: searchQuery,
                limit: 5,
                biasLat: currentLocation?.latitude,
                biasLng: currentLocation?.longitude,
            });

            setResults(searchResults || []);
        } catch (error) {
            console.error("Geocoding error:", error);
            Alert.alert("Error", "Failed to search for location.");
        } finally {
            setIsSearching(false);
        }
    }, [searchQuery, currentLocation, geocodeSearch]);

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

    const handleSelectResult = (result: SearchResult) => {
        onSelect({
            latitude: result.lat,
            longitude: result.lng,
            name: result.name,
        });
        onClose();
    };

    const handleUseCurrentLocation = () => {
        if (!currentLocation) {
            Alert.alert("Location Unavailable", "Your current location is not available yet.");
            return;
        }

        onSelect({
            latitude: currentLocation.latitude,
            longitude: currentLocation.longitude,
            name: "Current Location",
        });
        onClose();
    };

    const handleClose = () => {
        setSearchQuery("");
        setResults([]);
        setManualLat("");
        setManualLng("");
        onClose();
    };

    return (
        <Modal visible={visible} animationType="slide" transparent>
            <View style={styles.overlay}>
                <View style={styles.container}>
                    {/* Header */}
                    <View style={styles.header}>
                        <Text style={styles.title}>Set Meeting Point</Text>
                        <TouchableOpacity onPress={handleClose} style={styles.closeButton}>
                            <Text style={styles.closeText}>✕</Text>
                        </TouchableOpacity>
                    </View>

                    <ScrollView style={styles.content} keyboardShouldPersistTaps="handled">
                        {/* Search Input & Results Group */}
                        <View style={styles.searchSection}>
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

                            {/* Results or Quick Options */}
                            <View style={styles.resultsList}>
                                {(results.length > 0 || searchQuery) && (
                                    <Text style={styles.sectionTitle}>
                                        {results.length > 0 ? "SEARCH RESULTS" : isSearching ? "SEARCHING..." : "NO RESULTS"}
                                    </Text>
                                )}

                                {!searchQuery && (
                                    <>
                                        <Text style={styles.sectionTitle}>QUICK OPTIONS</Text>
                                        <TouchableOpacity
                                            style={styles.optionButton}
                                            onPress={handleUseCurrentLocation}
                                        >
                                            <Text style={styles.optionIcon}>📍</Text>
                                            <Text style={styles.optionText}>Use Current Location Area</Text>
                                        </TouchableOpacity>
                                    </>
                                )}

                                {results.map((result, index) => (
                                    <TouchableOpacity
                                        key={`${result.lat}-${result.lng}-${index}`}
                                        style={styles.optionButton}
                                        onPress={() => handleSelectResult(result)}
                                    >
                                        <View style={styles.resultInfo}>
                                            <Text style={styles.optionText}>{result.name}</Text>
                                            <Text style={styles.descriptionText} numberOfLines={1}>
                                                {result.displayName?.split(",").slice(1, 3).join(",").trim()}
                                            </Text>
                                        </View>
                                        <Text style={styles.optionIcon}>➜</Text>
                                    </TouchableOpacity>
                                ))}
                            </View>
                        </View>

                        {/* Manual Coordinates */}
                        <View style={styles.section}>
                            <Text style={styles.sectionTitle}>MANUAL COORDINATES</Text>
                            <View style={styles.coordRow}>
                                <TextInput
                                    style={[styles.coordInput, { flex: 1.5 }]}
                                    placeholder="Latitude"
                                    placeholderTextColor="#666"
                                    value={manualLat}
                                    onChangeText={setManualLat}
                                    keyboardType="numeric"
                                />
                                <TextInput
                                    style={[styles.coordInput, { flex: 1.5 }]}
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
                    </ScrollView>
                </View>
            </View>
        </Modal>
    );
}

const styles = StyleSheet.create({
    overlay: {
        flex: 1,
        backgroundColor: "rgba(0,0,0,0.8)",
        justifyContent: "flex-end",
    },
    container: {
        backgroundColor: "#1a1a1a",
        borderTopLeftRadius: 20,
        borderTopRightRadius: 20,
        maxHeight: "80%",
    },
    header: {
        flexDirection: "row",
        justifyContent: "space-between",
        alignItems: "center",
        padding: 16,
        borderBottomWidth: 1,
        borderBottomColor: "#333",
    },
    title: {
        color: "#fff",
        fontSize: 18,
        fontWeight: "700",
    },
    closeButton: {
        padding: 8,
    },
    closeText: {
        color: "#888",
        fontSize: 20,
    },
    content: {
        padding: 16,
    },
    searchSection: {
        marginBottom: 16,
    },
    searchContainer: {
        flexDirection: "row",
        marginBottom: 12,
    },
    searchInput: {
        flex: 1,
        backgroundColor: "#2a2a2a",
        borderRadius: 8,
        paddingHorizontal: 16,
        paddingVertical: 12,
        color: "#fff",
        fontSize: 16,
        marginRight: 8,
    },
    searchButton: {
        backgroundColor: "#34D399",
        borderRadius: 8,
        paddingHorizontal: 16,
        justifyContent: "center",
        alignItems: "center",
    },
    searchButtonText: {
        fontSize: 18,
    },
    resultsList: {
        backgroundColor: "#252525",
        borderRadius: 12,
        overflow: "hidden",
    },
    section: {
        marginBottom: 16,
    },
    sectionTitle: {
        color: "#666",
        fontSize: 11,
        fontWeight: "600",
        letterSpacing: 1,
        marginBottom: 8,
        marginTop: 8,
        paddingHorizontal: 12,
    },
    optionButton: {
        flexDirection: "row",
        alignItems: "center",
        backgroundColor: "#2a2a2a",
        padding: 14,
        borderRadius: 8,
        marginBottom: 1,
    },
    optionIcon: {
        fontSize: 20,
        marginRight: 12,
    },
    optionText: {
        color: "#fff",
        fontSize: 15,
        fontWeight: "500",
        flex: 1,
    },
    resultInfo: {
        flex: 1,
    },
    descriptionText: {
        color: "#888",
        fontSize: 12,
        marginTop: 2,
    },
    coordRow: {
        flexDirection: "row",
        gap: 8,
    },
    coordInput: {
        backgroundColor: "#2a2a2a",
        borderRadius: 8,
        paddingHorizontal: 12,
        paddingVertical: 10,
        color: "#fff",
        fontSize: 14,
    },
    coordButton: {
        backgroundColor: "#34D399",
        borderRadius: 8,
        paddingHorizontal: 16,
        justifyContent: "center",
        alignItems: "center",
    },
    coordButtonText: {
        color: "#000",
        fontWeight: "600",
    },
});
