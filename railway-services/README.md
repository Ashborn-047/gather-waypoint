# Railway Edge Services

This directory contains the Railway edge services for Gather/Waypoint.

## Services

### 1. Geocoding Proxy (`geocoding/`)

Node.js Express server that proxies geocoding requests to Nominatim with:
- User-Agent header (required by Nominatim policy)
- Rate limiting (1 req/sec to Nominatim)
- Response caching (5 min TTL)
- Error handling

**Endpoints:**
- `GET /search?q={query}&limit=5` - Search by text
- `GET /reverse?lat={lat}&lon={lon}` - Reverse geocode

### 2. OSRM Routing (`routing/`)

Docker container running osrm-backend with pre-processed map data.

**Endpoint:**
- `GET /route/v1/driving/{lon1},{lat1};{lon2},{lat2}?overview=full&geometries=geojson`

---

## Deployment Steps

### 1. Build Geocoding Proxy

```bash
cd geocoding
npm install
npm run build
```

### 2. Pre-process OSRM Data

See `routing/README.md` for detailed instructions.

### 3. Deploy to Railway

1. Create a new Railway project
2. Add the `geocoding` service (Node.js)
3. Add the `routing` service (Docker)
4. Deploy both services

### 4. Configure Convex

After deployment, set these environment variables in the Convex dashboard:

```
RAILWAY_GEOCODING_URL=https://your-geocoding.railway.app
RAILWAY_ROUTING_URL=https://your-routing.railway.app
```

---

## Architecture

```
┌──────────────────────────────────────────────────────┐
│                    CLIENT (Mobile)                    │
└───────────────────────┬──────────────────────────────┘
                        │
                        ▼
┌──────────────────────────────────────────────────────┐
│                    CONVEX (Waypoint)                  │
│                                                       │
│  geocoding.ts → RAILWAY_GEOCODING_URL                │
│  eta.ts       → RAILWAY_ROUTING_URL                  │
└───────────────────────┬──────────────────────────────┘
                        │
          ┌─────────────┴─────────────┐
          ▼                           ▼
┌─────────────────────┐   ┌─────────────────────┐
│  geocoding-proxy    │   │    osrm-routing     │
│  (Railway Node.js)  │   │    (Railway Docker) │
│                     │   │                     │
│  /search            │   │  /route/v1/driving  │
│  /reverse           │   │                     │
└─────────┬───────────┘   └─────────────────────┘
          │
          ▼
┌─────────────────────┐
│     Nominatim       │
│  (OpenStreetMap)    │
└─────────────────────┘
```

---

## Production Requirements

- `RAILWAY_GEOCODING_URL` - Required in production
- `RAILWAY_ROUTING_URL` - Required in production

If these are not set in production, Convex will throw an error.
Development mode falls back to public servers (rate limited).
