#!/bin/sh
set -e

if [ ! -f "dist/main.js" ]; then
  echo "[deploy] dist/main.js not found — building..."
  npm run build
fi

echo "[deploy] Running seed..."
npm run db:seed

echo "[deploy] Starting application..."
exec node dist/main.js
