#!/bin/bash
# Source environment variables (cron doesn't inherit them)
if [ -f /etc/environment ]; then
  export $(cat /etc/environment | xargs)
fi

cd /app
/usr/local/bin/bun run apps/data-ingester/index.js
