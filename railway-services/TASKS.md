# Railway Edge Services - Deployment Tasks

> **Priority:** Complete before production deployment
> **Last Updated:** 2026-01-11

---

## Pre-Deployment

- [ ] **Download OSM Extract**
  ```bash
  wget https://download.geofabrik.de/asia/india-latest.osm.pbf
  ```

- [ ] **Pre-process OSRM Data**
  ```bash
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

- [ ] **Build Geocoding Proxy**
  ```bash
  cd railway-services/geocoding
  npm install
  npm run build
  ```

---

## Railway Deployment

- [ ] Create Railway project
- [ ] Add `geocoding` service (Node.js)
- [ ] Add `routing` service (Docker)
- [ ] Deploy both services
- [ ] Copy public URLs

---

## Convex Configuration

- [ ] Set `RAILWAY_GEOCODING_URL` in Convex dashboard
- [ ] Set `RAILWAY_ROUTING_URL` in Convex dashboard
- [ ] Redeploy Convex functions

---

## Verification

- [ ] Test geocoding search
- [ ] Test route computation
- [ ] Test polyline rendering on map
- [ ] Test camera mode switching
- [ ] Test with multiple participants

---

## Post-Deployment

- [ ] Remove/guard development fallbacks
- [ ] Monitor Railway service logs
- [ ] Set up error alerts
