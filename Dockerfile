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

# Copy built artifacts and source from base
COPY --from=base /app/apps/frontend/dist ./apps/frontend/dist
COPY --from=base /app/apps/backend/index.ts ./apps/backend/
COPY --from=base /app/apps/backend/package.json ./apps/backend/
COPY --from=base /app/apps/data-ingester/index.js ./apps/data-ingester/
COPY --from=base /app/apps/data-ingester/package.json ./apps/data-ingester/

# Copy packages, node_modules, and config
COPY --from=base /app/packages ./packages
COPY --from=base /app/node_modules ./node_modules
COPY --from=base /app/package.json ./
COPY --from=base /app/turbo.json ./

# Copy NGINX configuration
COPY nginx.conf /etc/nginx/sites-available/default

# Create cron job
RUN echo "* * * * * cd /app && bun run apps/data-ingester/index.js" > /etc/cron.d/data-ingester && \
    chmod 0644 /etc/cron.d/data-ingester && \
    crontab /etc/cron.d/data-ingester

EXPOSE 80 3001

COPY docker-entrypoint.sh /docker-entrypoint.sh
RUN chmod +x /docker-entrypoint.sh

CMD ["/docker-entrypoint.sh"]