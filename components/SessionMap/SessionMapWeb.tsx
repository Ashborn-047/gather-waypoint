import React, { useEffect, useMemo, useRef, useState } from "react";
import { StyleSheet, View, Text, ActivityIndicator } from "react-native";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";

/**
 * Session Map Component (Web Implementation)
 * 
 * Uses maplibre-gl directly for the browser.
 * Robustly handles coordinate validation and platform-specific pinpointing.
 */

const MAP_STYLE = "https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json";

interface Participant {
    id: string;
    displayName: string;
    color: string;
    location?: {
        lat: number;
        lng: number;
    };
    delay?: {
        type: string;
        minutes: number;
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

export default function SessionMap({
    participants,
    destination,
    userLocation,
    currentDeviceId,
    onMapPress,
}: SessionMapProps) {
    const mapContainer = useRef<HTMLDivElement>(null);
    const map = useRef<maplibregl.Map | null>(null);
    const markers = useRef<Map<string, maplibregl.Marker>>(new Map());
    const [mapLoaded, setMapLoaded] = useState(false);
    const hasCentered = useRef(false);

    // Initialize map
    useEffect(() => {
        if (!mapContainer.current || map.current) return;

        const initialCenter: [number, number] = (userLocation && !isNaN(userLocation.latitude) && !isNaN(userLocation.longitude))
            ? [userLocation.longitude, userLocation.latitude]
            : [0, 0];

        map.current = new maplibregl.Map({
            container: mapContainer.current,
            style: MAP_STYLE,
            center: initialCenter,
            zoom: initialCenter[0] === 0 ? 1 : 12,
            attributionControl: false,
        });

        map.current.on("load", () => {
            setMapLoaded(true);
        });

        map.current.on("click", (e) => {
            if (onMapPress) {
                onMapPress({ latitude: e.lngLat.lat, longitude: e.lngLat.lng });
            }
        });

        return () => {
            if (map.current) {
                map.current.remove();
                map.current = null;
            }
        };
    }, []);

    // Camera Centering Logic
    useEffect(() => {
        if (!map.current || !mapLoaded || hasCentered.current) return;

        // Try centering on user location first
        if (userLocation && !isNaN(userLocation.latitude) && !isNaN(userLocation.longitude)) {
            map.current.flyTo({
                center: [userLocation.longitude, userLocation.latitude],
                zoom: 14,
                essential: true
            });
            hasCentered.current = true;
            return;
        }

        // Fallback to first participant if user location takes too long
        const timer = setTimeout(() => {
            if (hasCentered.current || !map.current) return;

            if (destination && !isNaN(destination.latitude) && !isNaN(destination.longitude)) {
                map.current.flyTo({ center: [destination.longitude, destination.latitude], zoom: 12 });
                hasCentered.current = true;
            } else if (participants.length > 0 && participants[0].location) {
                const p = participants[0].location;
                if (!isNaN(p.lat) && !isNaN(p.lng)) {
                    map.current.flyTo({ center: [p.lng, p.lat], zoom: 12 });
                    hasCentered.current = true;
                }
            }
        }, 3000);

        return () => clearTimeout(timer);
    }, [userLocation, mapLoaded, destination, participants]);

    // Sync Markers
    useEffect(() => {
        if (!map.current || !mapLoaded) return;

        // 1. Participant Markers
        const activeIds = new Set<string>();
        participants.forEach(p => {
            if (!p.location || isNaN(p.location.lat) || isNaN(p.location.lng)) return;

            const isMe = p.id === currentDeviceId;
            activeIds.add(p.id);

            let marker = markers.current.get(p.id);
            if (!marker) {
                const el = document.createElement('div');
                el.style.width = '40px';
                el.style.height = '40px';
                el.style.borderRadius = '50%';
                el.style.backgroundColor = isMe ? '#34D399' : '#1a2332';
                el.style.border = `3px solid ${isMe ? 'white' : p.color}`;
                el.style.display = 'flex';
                el.style.justifyContent = 'center';
                el.style.alignItems = 'center';
                el.style.color = isMe ? 'black' : 'white';
                el.style.fontSize = '12px';
                el.style.fontWeight = 'bold';
                el.style.boxShadow = '0 2px 10px rgba(0,0,0,0.5)';
                el.style.zIndex = isMe ? '100' : '10';
                el.innerText = isMe ? 'YOU' : p.displayName.slice(0, 2).toUpperCase();

                if (p.delay) {
                    const badge = document.createElement('div');
                    badge.style.position = 'absolute';
                    badge.style.top = '-5px';
                    badge.style.right = '-5px';
                    badge.style.width = '18px';
                    badge.style.height = '18px';
                    badge.style.borderRadius = '50%';
                    badge.style.backgroundColor = '#FCD34D';
                    badge.style.border = '2px solid #1a2332';
                    badge.style.display = 'flex';
                    badge.style.justifyContent = 'center';
                    badge.style.alignItems = 'center';
                    badge.style.fontSize = '12px';
                    badge.innerText = '!';
                    el.appendChild(badge);
                }

                marker = new maplibregl.Marker({ element: el })
                    .setLngLat([p.location.lng, p.location.lat])
                    .addTo(map.current!);
                markers.current.set(p.id, marker);
            } else {
                marker.setLngLat([p.location.lng, p.location.lat]);
            }
        });

        // 2. Clear old participants
        markers.current.forEach((marker, id) => {
            if (id !== 'destination' && !activeIds.has(id)) {
                marker.remove();
                markers.current.delete(id);
            }
        });

        // 3. Destination Marker
        if (destination && !isNaN(destination.latitude) && !isNaN(destination.longitude)) {
            let destMarker = markers.current.get('destination');
            if (!destMarker) {
                const el = document.createElement('div');
                el.style.fontSize = '32px';
                el.innerText = '📍';
                destMarker = new maplibregl.Marker({ element: el })
                    .setLngLat([destination.longitude, destination.latitude])
                    .addTo(map.current!);
                markers.current.set('destination', destMarker);
            } else {
                destMarker.setLngLat([destination.longitude, destination.latitude]);
            }
        } else if (markers.current.has('destination')) {
            markers.current.get('destination')?.remove();
            markers.current.delete('destination');
        }

    }, [participants, destination, mapLoaded, currentDeviceId]);

    return (
        <View style={styles.container}>
            <div
                ref={mapContainer}
                style={{ width: '100%', height: '100%', position: 'absolute' }}
            />
            {!mapLoaded && (
                <View style={styles.loadingOverlay}>
                    <ActivityIndicator size="large" color="#34D399" />
                    <Text style={styles.loadingText}>Locating...</Text>
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
    loadingOverlay: {
        ...StyleSheet.absoluteFillObject,
        backgroundColor: "rgba(10,10,10,0.8)",
        justifyContent: 'center',
        alignItems: 'center',
        zIndex: 10
    },
    loadingText: {
        color: '#999',
        marginTop: 10,
        fontSize: 14
    }
});
