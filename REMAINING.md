# Gather - Remaining Tasks

## ✅ Completed (This Session)

### Railway Edge Services
- [x] `railway-services/geocoding/` - Express proxy with caching + rate limiting
- [x] `railway-services/routing/` - OSRM Docker container config
- [x] `convex/geocoding.ts` - Requires `RAILWAY_GEOCODING_URL` in production
- [x] `convex/eta.ts` - Requires `RAILWAY_ROUTING_URL` in production

### Waypoint Architecture
- [x] Camera modes (`FOLLOW_SELF`, `FIT_ROUTE`, `FREE_PAN`)
- [x] MapLibre layers (ShapeSource, CircleLayer, SymbolLayer, LineLayer)
- [x] Route recomputation hook (drift >500m, stale >5min)
- [x] DestinationPicker using Convex geocoding

---

## 🔧 Remaining Tasks

### 1. Railway Deployment (Manual)
- [ ] Download OSM extract (india-latest.osm.pbf)
- [ ] Pre-process with osrm-extract, osrm-partition, osrm-customize
- [ ] Create Railway project
- [ ] Deploy geocoding proxy service
- [ ] Deploy OSRM routing service
- [ ] Set environment variables in Convex dashboard:
  - `RAILWAY_GEOCODING_URL`
  - `RAILWAY_ROUTING_URL`

### 2. Testing & Verification
- [ ] Test geocoding search flow end-to-end
- [ ] Test route computation and polyline rendering
- [ ] Test camera mode switching
- [ ] Test group session with multiple participants

### 3. Production Hardening
- [ ] Remove development fallbacks before production deploy
- [ ] Add error boundaries for route failures
- [ ] Add offline/error state UI

---

## Environment Variables Needed

| Variable | Description | Required |
|----------|-------------|----------|
| `RAILWAY_GEOCODING_URL` | Railway geocoding proxy URL | Production |
| `RAILWAY_ROUTING_URL` | Railway OSRM service URL | Production |

---

**Last Updated:** 2026-01-10T20:22:16+05:30
