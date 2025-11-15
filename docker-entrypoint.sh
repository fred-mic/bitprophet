#!/bin/bash
set -e

# Export environment variables to a file that cron can source
# Cron jobs run with minimal environment, so we need to explicitly pass vars
env | grep -E '^DATABASE_URL=' > /etc/environment

# Also add to crontab environment
echo "DATABASE_URL=${DATABASE_URL}" >> /etc/cron.d/data-ingester

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
