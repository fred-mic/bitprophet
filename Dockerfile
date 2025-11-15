FROM oven/bun:1.3.1 AS base
WORKDIR /app

# Copy ALL package.json files and lockfile at once
COPY package.json bun.lock ./
COPY packages ./packages
COPY apps ./apps
COPY turbo.json ./

# Now install dependencies with the complete workspace structure
RUN bun install --frozen-lockfile

# Build all apps
RUN bun run build

# Production stage
FROM oven/bun:1.3.1
WORKDIR /app

# Install NGINX and cron
RUN apt-get update && apt-get install -y nginx cron && rm -rf /var/lib/apt/lists/*

# Copy workspace structure and lockfile (needed for Bun to resolve dependencies)
COPY --from=base /app/package.json ./
COPY --from=base /app/bun.lock ./
COPY --from=base /app/packages ./packages
COPY --from=base /app/turbo.json ./

# Copy built artifacts and source files
COPY --from=base /app/apps/frontend/dist ./apps/frontend/dist
COPY --from=base /app/apps/backend ./apps/backend
COPY --from=base /app/apps/data-ingester ./apps/data-ingester

# Copy node_modules LAST (after workspace structure is in place)
# This ensures workspace symlinks are preserved
COPY --from=base /app/node_modules ./node_modules

# Copy NGINX configuration
COPY nginx.conf /etc/nginx/sites-available/default

# Copy wrapper script for data ingester
COPY apps/data-ingester/run.sh /usr/local/bin/run-data-ingester.sh
RUN chmod +x /usr/local/bin/run-data-ingester.sh

# Create cron job that sources environment and runs wrapper
# Note: Cron will read environment from /etc/environment or we'll set it in docker-entrypoint.sh
RUN echo "* * * * * root /usr/local/bin/run-data-ingester.sh >> /var/log/data-ingester.log 2>&1" > /etc/cron.d/data-ingester && \
    chmod 0644 /etc/cron.d/data-ingester

EXPOSE 80 3001

COPY docker-entrypoint.sh /docker-entrypoint.sh
RUN chmod +x /docker-entrypoint.sh

CMD ["/docker-entrypoint.sh"]