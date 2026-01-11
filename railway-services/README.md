# Railway Edge Services

**Gather/Waypoint Infrastructure Layer**

This directory contains the Railway edge services that power Gather's location intelligence. These services proxy external APIs (Nominatim, OSRM) with caching, rate limiting, and error handling.

---

## Overview

| Service | Technology | Purpose |
|---------|------------|---------|
| **geocoding** | Node.js + Express | Address search & reverse geocoding via Nominatim |
| **routing** | Docker + OSRM | Road-based route computation |

---

## Service 1: Geocoding Proxy

**Path:** `geocoding/`

A lightweight Express server that proxies all geocoding requests to OpenStreetMap's Nominatim service.

### Features

| Feature | Description |
|---------|-------------|
| **User-Agent Compliance** | Sends proper User-Agent header (required by Nominatim TOS) |
| **Rate Limiting** | Enforces 1 req/sec to Nominatim to avoid bans |
| **Response Caching** | 5-minute TTL cache to reduce duplicate requests |
| **Error Handling** | Returns clear 5xx errors on upstream failures |
| **Normalized Output** | Consistent `{ displayName, name, lat, lng }` format |

### Endpoints

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/health` | Health check |
| `GET` | `/search?q={query}&limit=5` | Forward geocoding (text → coordinates) |
| `GET` | `/reverse?lat={lat}&lon={lon}` | Reverse geocoding (coordinates → address) |

### Example Request

```bash
curl "https://your-geocoding.railway.app/search?q=Koramangala%20Bangalore&limit=3"
```

### Example Response

```json
[
  {
    "displayName": "Koramangala, Bengaluru, Karnataka, India",
    "name": "Koramangala",
    "lat": 12.9352,
    "lng": 77.6245,
    "type": "suburb",
    "importance": 0.65
  }
]
```

### Local Development

```bash
cd geocoding
npm install
npm run dev    # Runs on http://localhost:3000
```

### Production Build

```bash
npm run build  # Compiles TypeScript to dist/
npm start      # Runs production server
```

---

## Service 2: OSRM Routing

**Path:** `routing/`

A Docker container running the official OSRM backend with pre-processed OpenStreetMap road data.

### Features

| Feature | Description |
|---------|-------------|
| **MLD Algorithm** | Multi-Level Dijkstra for fast routing |
| **GeoJSON Output** | Returns route geometry as GeoJSON for easy map rendering |
| **Region-Scoped** | Only routes within loaded map region work |
| **Stateless** | No session tracking, pure route computation |

### Endpoint

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/route/v1/driving/{lon1},{lat1};{lon2},{lat2}` | Compute driving route |

### Query Parameters

| Parameter | Values | Description |
|-----------|--------|-------------|
| `overview` | `full`, `simplified`, `false` | Route geometry detail level |
| `geometries` | `geojson`, `polyline`, `polyline6` | Geometry encoding format |

### Example Request

```bash
curl "https://your-routing.railway.app/route/v1/driving/77.6245,12.9352;77.5946,12.9716?overview=full&geometries=geojson"
```

### Example Response

```json
{
  "code": "Ok",
  "routes": [
    {
      "geometry": {
        "type": "LineString",
        "coordinates": [[77.6245, 12.9352], [77.6201, 12.9401], ...]
      },
      "duration": 1234.5,
      "distance": 8523.2
    }
  ]
}
```

### Pre-processing Map Data

OSRM requires pre-processed OSM data. See `routing/README.md` for detailed instructions.

**Quick Start:**

```bash
# Download OSM extract
wget https://download.geofabrik.de/asia/india-latest.osm.pbf

# Extract
docker run -t -v "${PWD}:/data" ghcr.io/project-osrm/osrm-backend \
  osrm-extract -p /opt/car.lua /data/india-latest.osm.pbf

# Partition
docker run -t -v "${PWD}:/data" ghcr.io/project-osrm/osrm-backend \
  osrm-partition /data/india-latest.osrm

# Customize
docker run -t -v "${PWD}:/data" ghcr.io/project-osrm/osrm-backend \
  osrm-customize /data/india-latest.osrm
```

---

## Architecture

```
                            ┌─────────────────┐
                            │  Mobile Client  │
                            │   (React Native)│
                            └────────┬────────┘
                                     │
                                     ▼
                            ┌─────────────────┐
                            │     CONVEX      │
                            │    (Waypoint)   │
                            │                 │
                            │ geocoding.ts    │
                            │ eta.ts          │
                            └────────┬────────┘
                                     │
                    ┌────────────────┴────────────────┐
                    │                                 │
                    ▼                                 ▼
           ┌────────────────┐                ┌────────────────┐
           │   GEOCODING    │                │    ROUTING     │
           │     PROXY      │                │     (OSRM)     │
           │                │                │                │
           │  /search       │                │ /route/v1/     │
           │  /reverse      │                │   driving      │
           └───────┬────────┘                └────────────────┘
                   │
                   ▼
           ┌────────────────┐
           │   NOMINATIM    │
           │ (OpenStreetMap)│
           └────────────────┘
```

---

## Deployment Guide

### Step 1: Prepare Services Locally

```bash
# Build geocoding proxy
cd geocoding && npm install && npm run build

# Pre-process OSRM data (see routing/README.md)
cd ../routing
# ... follow pre-processing steps
```

### Step 2: Create Railway Project

1. Go to [railway.app](https://railway.app)
2. Create new project
3. Add service from GitHub → select `railway-services/geocoding`
4. Add service from Dockerfile → select `railway-services/routing`

### Step 3: Configure Environment

No environment variables needed for Railway services themselves.

### Step 4: Deploy

Railway auto-deploys on push. Verify via health check:

```bash
curl https://your-geocoding.railway.app/health
# Expected: {"status":"ok","service":"geocoding-proxy"}
```

### Step 5: Configure Convex

Set in Convex Dashboard → Settings → Environment Variables:

| Variable | Value |
|----------|-------|
| `RAILWAY_GEOCODING_URL` | `https://your-geocoding.railway.app` |
| `RAILWAY_ROUTING_URL` | `https://your-routing.railway.app` |

---

## Production Checklist

- [ ] Both Railway services deployed and healthy
- [ ] Convex environment variables set
- [ ] Convex functions redeployed
- [ ] Search → destination → route → camera flow tested
- [ ] Error handling verified (disable one service, check graceful failure)

---

## Troubleshooting

| Issue | Cause | Solution |
|-------|-------|----------|
| "Geocoding service unavailable" | Railway geocoding down | Check Railway logs |
| "OSRM error" | Railway routing down or route outside region | Check Railway logs, verify coordinates |
| Empty search results | Query too short or Nominatim rate limited | Wait 1 second, try again |
| Route fails silently | Coordinates outside pre-processed region | Use larger OSM extract |

---

## Cost Estimation

| Service | Railway Tier | Expected Cost |
|---------|--------------|---------------|
| Geocoding Proxy | Hobby | ~$5/month |
| OSRM Routing | Hobby | ~$5-10/month (depends on data size) |

---

## Security Notes

- **No Auth Required**: These services are stateless proxies
- **Rate Limited**: Built-in protection against abuse
- **No Secrets Stored**: All configuration via Convex env vars
- **Nominatim TOS**: Compliant via proper User-Agent header
