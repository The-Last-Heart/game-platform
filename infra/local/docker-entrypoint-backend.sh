#!/bin/sh
set -eu

# Named volume at /app/content-pack starts empty. Seed once from the image so
# challenge audio/SFX exist, then keep Studio uploads across rebuilds.
if [ ! -f /app/content-pack/manifest.json ]; then
  echo "[backend] seeding content-pack volume from image..."
  mkdir -p /app/content-pack
  cp -a /app/content-pack-seed/. /app/content-pack/
fi
chown -R lh:lh /app/content-pack

echo "[backend] waiting for dependencies and applying migrations..."
ATTEMPTS=0
MAX_ATTEMPTS=60
until setpriv --reuid=lh --regid=lh --clear-groups -- node dist/database/migrate.js; do
  ATTEMPTS=$((ATTEMPTS + 1))
  if [ "$ATTEMPTS" -ge "$MAX_ATTEMPTS" ]; then
    echo "[backend] migrations failed after ${MAX_ATTEMPTS} attempts" >&2
    exit 1
  fi
  echo "[backend] migrate not ready yet (attempt ${ATTEMPTS}/${MAX_ATTEMPTS}); retrying..."
  sleep 2
done

echo "[backend] starting NestJS..."
exec setpriv --reuid=lh --regid=lh --clear-groups -- "$@"
