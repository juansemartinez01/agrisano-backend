#!/bin/sh
set -e

echo "[deploy] Running seed..."
npm run db:seed

echo "[deploy] Starting application..."
exec node dist/main.js
