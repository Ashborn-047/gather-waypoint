import express, { Request, Response, NextFunction } from "express";
import NodeCache from "node-cache";
import rateLimit from "express-rate-limit";

/**
 * Gather Geocoding Proxy
 * 
 * Proxies all geocoding requests to Nominatim with:
 * - User-Agent header (MANDATORY for Nominatim policy)
 * - Rate limiting (1 req/sec to Nominatim)
 * - Response caching (5 min TTL)
 * - Error handling
 */

const app = express();
const PORT = process.env.PORT || 3000;

// User-Agent for Nominatim (MANDATORY)
const USER_AGENT = "GatherApp/1.0 (contact: dev@gather.app)";

// Nominatim base URL
const NOMINATIM_URL = "https://nominatim.openstreetmap.org";

// Cache: 5 minute TTL
const cache = new NodeCache({ stdTTL: 300, checkperiod: 60 });

// Rate limiter: 1 request per second to Nominatim
let lastNominatimRequest = 0;
const NOMINATIM_RATE_MS = 1000; // 1 second between requests

async function rateLimitedFetch(url: string): Promise<Response> {
    const now = Date.now();
    const timeSinceLast = now - lastNominatimRequest;

    if (timeSinceLast < NOMINATIM_RATE_MS) {
        await new Promise(resolve => setTimeout(resolve, NOMINATIM_RATE_MS - timeSinceLast));
    }

    lastNominatimRequest = Date.now();

    const response = await fetch(url, {
        headers: {
            "User-Agent": USER_AGENT,
            "Accept": "application/json",
        },
    });

    return response;
}

// Request rate limiter (per client)
const clientLimiter = rateLimit({
    windowMs: 1000, // 1 second
    max: 5, // 5 requests per second per client
    message: { error: "Too many requests, please slow down" },
    standardHeaders: true,
    legacyHeaders: false,
});

app.use(clientLimiter);
app.use(express.json());

// Health check
app.get("/health", (req: Request, res: Response) => {
    res.json({ status: "ok", service: "geocoding-proxy" });
});

/**
 * GET /search
 * 
 * Search for locations by query string
 * Query params: q (required), limit (optional, default 5)
 */
app.get("/search", async (req: Request, res: Response) => {
    const query = req.query.q as string;
    const limit = parseInt(req.query.limit as string) || 5;
    const viewbox = req.query.viewbox as string;

    if (!query || query.trim().length < 2) {
        res.status(400).json({ error: "Query 'q' is required and must be at least 2 characters" });
        return;
    }

    // Build cache key
    const cacheKey = `search:${query}:${limit}:${viewbox || ""}`;

    // Check cache
    const cached = cache.get(cacheKey);
    if (cached) {
        res.json(cached);
        return;
    }

    try {
        // Build Nominatim URL
        let url = `${NOMINATIM_URL}/search?format=json&q=${encodeURIComponent(query)}&limit=${limit}`;
        if (viewbox) {
            url += `&viewbox=${viewbox}&bounded=0`;
        }

        const response = await rateLimitedFetch(url);

        if (!response.ok) {
            console.error(`Nominatim error: ${response.status} ${response.statusText}`);
            res.status(502).json({ error: "Geocoding service unavailable" });
            return;
        }

        const data = await response.json();

        // Normalize response
        const results = (data as any[]).map(item => ({
            displayName: item.display_name,
            name: item.display_name.split(",")[0],
            lat: parseFloat(item.lat),
            lng: parseFloat(item.lon),
            type: item.type,
            importance: item.importance,
        }));

        // Cache result
        cache.set(cacheKey, results);

        res.json(results);
    } catch (error) {
        console.error("Search error:", error);
        res.status(500).json({ error: "Internal server error" });
    }
});

/**
 * GET /reverse
 * 
 * Reverse geocode: coordinates → address
 * Query params: lat (required), lon (required)
 */
app.get("/reverse", async (req: Request, res: Response) => {
    const lat = parseFloat(req.query.lat as string);
    const lon = parseFloat(req.query.lon as string);

    if (isNaN(lat) || isNaN(lon)) {
        res.status(400).json({ error: "Valid 'lat' and 'lon' are required" });
        return;
    }

    // Build cache key
    const cacheKey = `reverse:${lat.toFixed(6)}:${lon.toFixed(6)}`;

    // Check cache
    const cached = cache.get(cacheKey);
    if (cached) {
        res.json(cached);
        return;
    }

    try {
        const url = `${NOMINATIM_URL}/reverse?format=json&lat=${lat}&lon=${lon}`;

        const response = await rateLimitedFetch(url);

        if (!response.ok) {
            console.error(`Nominatim error: ${response.status} ${response.statusText}`);
            res.status(502).json({ error: "Geocoding service unavailable" });
            return;
        }

        const data = await response.json() as any;

        if (data.error) {
            res.status(404).json({ error: "Location not found" });
            return;
        }

        // Normalize response
        const result = {
            displayName: data.display_name,
            name: data.display_name?.split(",")[0] || "Unknown",
            lat: parseFloat(data.lat),
            lng: parseFloat(data.lon),
        };

        // Cache result
        cache.set(cacheKey, result);

        res.json(result);
    } catch (error) {
        console.error("Reverse geocode error:", error);
        res.status(500).json({ error: "Internal server error" });
    }
});

// Start server
app.listen(PORT, () => {
    console.log(`🌍 Geocoding proxy running on port ${PORT}`);
    console.log(`   User-Agent: ${USER_AGENT}`);
});
