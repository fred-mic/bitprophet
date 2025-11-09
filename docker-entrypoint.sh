#!/bin/bash
set -e

# Start cron
service cron start

# Start backend in background
cd /app/apps/backend
PORT=3001 bun run index.ts &
BACKEND_PID=$!

# Start NGINX (runs as root, can bind to port 80)
nginx -g "daemon off;" &
NGINX_PID=$!

# Wait for all background processes
wait $BACKEND_PID $NGINX_PID
