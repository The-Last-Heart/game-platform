#!/bin/sh
set -eu

echo "[backend] waiting for dependencies and applying migrations..."
ATTEMPTS=0
MAX_ATTEMPTS=60
until node dist/database/migrate.js; do
  ATTEMPTS=$((ATTEMPTS + 1))
  if [ "$ATTEMPTS" -ge "$MAX_ATTEMPTS" ]; then
    echo "[backend] migrations failed after ${MAX_ATTEMPTS} attempts" >&2
    exit 1
  fi
  echo "[backend] migrate not ready yet (attempt ${ATTEMPTS}/${MAX_ATTEMPTS}); retrying..."
  sleep 2
done

echo "[backend] starting NestJS..."
exec "$@"
