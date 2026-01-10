# OSRM Routing Service

This directory contains the OSRM routing service configuration for Gather.

## Pre-processing Map Data (Required Before Deployment)

OSRM requires pre-processed OpenStreetMap data. Follow these steps:

### 1. Download OSM Extract

Download the region you need from [Geofabrik](https://download.geofabrik.de/):

```bash
# Example: India
wget https://download.geofabrik.de/asia/india-latest.osm.pbf

# Example: Karnataka state only (smaller)
wget https://download.geofabrik.de/asia/india/karnataka-latest.osm.pbf
```

### 2. Pre-process the Data

```bash
# Extract
docker run -t -v "${PWD}:/data" ghcr.io/project-osrm/osrm-backend \
  osrm-extract -p /opt/car.lua /data/india-latest.osm.pbf

# Partition (for MLD algorithm)
docker run -t -v "${PWD}:/data" ghcr.io/project-osrm/osrm-backend \
  osrm-partition /data/india-latest.osrm

# Customize
docker run -t -v "${PWD}:/data" ghcr.io/project-osrm/osrm-backend \
  osrm-customize /data/india-latest.osrm
```

### 3. Deploy to Railway

After pre-processing, you'll have these files:
- `india-latest.osrm`
- `india-latest.osrm.cell_metrics`
- `india-latest.osrm.cells`
- `india-latest.osrm.cnbg`
- `india-latest.osrm.cnbg_to_ebg`
- `india-latest.osrm.datasource_names`
- `india-latest.osrm.ebg`
- `india-latest.osrm.ebg_nodes`
- `india-latest.osrm.edges`
- `india-latest.osrm.enw`
- `india-latest.osrm.fileIndex`
- `india-latest.osrm.geometry`
- `india-latest.osrm.icd`
- `india-latest.osrm.maneuver_overrides`
- `india-latest.osrm.mldgr`
- `india-latest.osrm.names`
- `india-latest.osrm.nbg_nodes`
- `india-latest.osrm.partition`
- `india-latest.osrm.properties`
- `india-latest.osrm.ramIndex`
- `india-latest.osrm.restrictions`
- `india-latest.osrm.timestamp`
- `india-latest.osrm.tld`
- `india-latest.osrm.tls`
- `india-latest.osrm.turn_duration_penalties`
- `india-latest.osrm.turn_penalties_index`
- `india-latest.osrm.turn_weight_penalties`

Copy these to this directory, then deploy.

## API Endpoint

After deployment, OSRM exposes:

```
GET /route/v1/driving/{lon1},{lat1};{lon2},{lat2}?overview=full&geometries=geojson
```

## Region Limitation

Routes requested outside the loaded region will fail with an error.
This is expected behavior - do NOT fallback to public OSRM in production.
