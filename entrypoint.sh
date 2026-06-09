#!/bin/sh
set -e

if [ ! -f "dist/src/main.js" ]; then
  echo "[deploy] dist/src/main.js not found — building..."
  npm run build
fi

echo "[deploy] Running seed..."
npm run db:seed

echo "[deploy] Starting application..."
exec node dist/src/main.js
