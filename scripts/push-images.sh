#!/bin/bash
set -e

REGISTRY="ghcr.io/eduardovarela0144"

docker build --platform linux/amd64 -t $REGISTRY/sat-api:latest -f infra/docker/prod/Dockerfile.api .
docker push $REGISTRY/sat-api:latest

docker build --platform linux/amd64 -t $REGISTRY/sat-worker:latest -f infra/docker/prod/Dockerfile.worker .
docker push $REGISTRY/sat-worker:latest

echo "✓ Imágenes subidas. Ve a Render y haz redeploy."
