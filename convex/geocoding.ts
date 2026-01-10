import { action } from "./_generated/server";
import { v } from "convex/values";

/**
 * Geocoding Service - Waypoint Engine
 * 
 * Proxies geocoding requests through Railway → Nominatim.
 * Clients MUST NOT call Nominatim directly.
 * 
 * Flow: Client → Convex action → Railway → Nominatim → Convex → Client
 * 
 * PRODUCTION: RAILWAY_GEOCODING_URL is REQUIRED
 * DEVELOPMENT: Falls back to public Nominatim (rate limited)
 */

// Railway geocoding service URL
const RAILWAY_GEOCODING_URL = process.env.RAILWAY_GEOCODING_URL;

// Development fallback (MUST be removed in production)
const DEV_FALLBACK_URL = "https://nominatim.openstreetmap.org";

// Determine if we're in production
const IS_PRODUCTION = process.env.NODE_ENV === "production" ||
    process.env.CONVEX_CLOUD_URL?.includes("convex.cloud");

function getGeocodingUrl(): string {
    if (RAILWAY_GEOCODING_URL) {
        return RAILWAY_GEOCODING_URL;
    }

    if (IS_PRODUCTION) {
        throw new Error(
            "RAILWAY_GEOCODING_URL is required in production. " +
            "Set this environment variable in the Convex dashboard."
        );
    }

    console.warn(
        "⚠️ DEVELOPMENT MODE: Using public Nominatim fallback. " +
        "Set RAILWAY_GEOCODING_URL for production."
    );
    return DEV_FALLBACK_URL;
}

/**
 * Search for locations by query string
 * 
 * Returns normalized results with displayName, lat, lng
 */
export const geocodeSearch = action({
    args: {
        query: v.string(),
        limit: v.optional(v.number()),
        biasLat: v.optional(v.number()),
        biasLng: v.optional(v.number()),
    },
    handler: async (_, { query, limit = 5, biasLat, biasLng }) => {
        if (!query || query.trim().length < 2) {
            return [];
        }

        const baseUrl = getGeocodingUrl();

        try {
            // Build URL with optional bias
            let url = `${baseUrl}/search?q=${encodeURIComponent(query)}&limit=${limit}`;

            // Add format=json for direct Nominatim calls (Railway proxy doesn't need it)
            if (baseUrl === DEV_FALLBACK_URL) {
                url = `${baseUrl}/search?format=json&q=${encodeURIComponent(query)}&limit=${limit}`;
            }

            // Add viewbox bias if coordinates provided
            if (biasLat !== undefined && biasLng !== undefined) {
                const delta = 0.5;
                const viewbox = `${biasLng - delta},${biasLat + delta},${biasLng + delta},${biasLat - delta}`;
                url += `&viewbox=${viewbox}&bounded=0`;
            }

            const response = await fetch(url, {
                headers: {
                    "User-Agent": "GatherWaypoint/1.0 (Convex)",
                },
            });

            if (!response.ok) {
                console.error("Geocoding request failed:", response.status);
                return [];
            }

            const data = await response.json();

            // Normalize to standard format
            return (data as any[]).map((item: any) => ({
                displayName: item.displayName || item.display_name,
                name: (item.name || item.display_name?.split(",")[0]) || "Unknown",
                lat: parseFloat(item.lat),
                lng: parseFloat(item.lng || item.lon),
                type: item.type,
                importance: item.importance,
            }));
        } catch (error) {
            console.error("Geocoding error:", error);
            return [];
        }
    },
});

/**
 * Reverse geocode: coordinates → address
 */
export const reverseGeocode = action({
    args: {
        lat: v.number(),
        lng: v.number(),
    },
    handler: async (_, { lat, lng }) => {
        const baseUrl = getGeocodingUrl();

        try {
            let url = `${baseUrl}/reverse?lat=${lat}&lon=${lng}`;

            // Add format=json for direct Nominatim calls
            if (baseUrl === DEV_FALLBACK_URL) {
                url = `${baseUrl}/reverse?format=json&lat=${lat}&lon=${lng}`;
            }

            const response = await fetch(url, {
                headers: {
                    "User-Agent": "GatherWaypoint/1.0 (Convex)",
                },
            });

            if (!response.ok) {
                return null;
            }

            const data = await response.json() as any;

            if (data.error) {
                return null;
            }

            return {
                displayName: data.displayName || data.display_name,
                name: (data.name || data.display_name?.split(",")[0]) || "Unknown",
                lat: parseFloat(data.lat),
                lng: parseFloat(data.lng || data.lon),
            };
        } catch (error) {
            console.error("Reverse geocoding error:", error);
            return null;
        }
    },
});
