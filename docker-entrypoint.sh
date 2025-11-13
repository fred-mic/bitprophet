#!/bin/bash
set -e

# Start cron
service cron start

# Start backend from workspace root (so Bun can resolve workspace dependencies)
cd /app
PORT=3001 bun run apps/backend/index.ts &
BACKEND_PID=$!

# Start NGINX (runs as root, can bind to port 80)
nginx -g "daemon off;" &
NGINX_PID=$!

# Wait for all background processes
wait $BACKEND_PID $NGINX_PID
