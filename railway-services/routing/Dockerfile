# OSRM Routing Service
#
# Uses official osrm-backend image with pre-processed map data.
# Region-scoped: Only routes within loaded region will work.
#
# To build:
# 1. Download OSM extract: wget https://download.geofabrik.de/asia/india-latest.osm.pbf
# 2. Pre-process: docker run -t -v "${PWD}:/data" ghcr.io/project-osrm/osrm-backend osrm-extract -p /opt/car.lua /data/india-latest.osm.pbf
# 3. Partition: docker run -t -v "${PWD}:/data" ghcr.io/project-osrm/osrm-backend osrm-partition /data/india-latest.osrm
# 4. Customize: docker run -t -v "${PWD}:/data" ghcr.io/project-osrm/osrm-backend osrm-customize /data/india-latest.osrm
# 5. Copy *.osrm* files to this directory

FROM ghcr.io/project-osrm/osrm-backend:latest

# Copy pre-processed map data
# NOTE: You must pre-process the data locally before building
COPY *.osrm* /data/

# Expose OSRM port
EXPOSE 5000

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=30s --retries=3 \
    CMD curl -f http://localhost:5000/route/v1/driving/0,0;1,1 || exit 1

# Start OSRM with MLD algorithm (fastest)
CMD ["osrm-routed", "--algorithm=mld", "--max-table-size=1000", "/data/india-latest.osrm"]
