FROM oven/bun:1.3.1 AS base
WORKDIR /app

# Copy package files first
COPY package.json bun.lock* ./
COPY apps/*/package.json ./apps/*/

# Copy packages source files (needed for workspace dependencies)
# This includes all package.json files, so we don't need to copy them separately
COPY packages ./packages

# Now install dependencies (workspace packages are now available)
RUN bun install --frozen-lockfile

# Copy only source files needed for build
COPY apps ./apps
COPY turbo.json ./

# Build all apps (this will process Tailwind CSS)
RUN bun run build

# Production stage
FROM oven/bun:1.3.1
WORKDIR /app

# Install NGINX and cron
RUN apt-get update && apt-get install -y nginx cron && rm -rf /var/lib/apt/lists/*

# Copy built frontend dist (includes processed HTML, JS, and CSS)
COPY --from=base /app/apps/frontend/dist ./apps/frontend/dist

# Copy backend source files (needed at runtime)
COPY --from=base /app/apps/backend/index.ts ./apps/backend/
COPY --from=base /app/apps/backend/package.json ./apps/backend/

# Copy data-ingester source files (needed at runtime)
COPY --from=base /app/apps/data-ingester/index.js ./apps/data-ingester/
COPY --from=base /app/apps/data-ingester/package.json ./apps/data-ingester/

# Copy packages (needed for workspace dependencies at runtime)
COPY --from=base /app/packages ./packages

# Copy node_modules and workspace config
COPY --from=base /app/node_modules ./node_modules
COPY --from=base /app/package.json ./
COPY --from=base /app/turbo.json ./

# Copy NGINX configuration
COPY nginx.conf /etc/nginx/sites-available/default

# Create cron job for data ingester
RUN echo "* * * * * cd /app && bun run apps/data-ingester/index.js" > /etc/cron.d/data-ingester && \
    chmod 0644 /etc/cron.d/data-ingester && \
    crontab /etc/cron.d/data-ingester

# Expose ports
EXPOSE 80 3001

# Start script
COPY docker-entrypoint.sh /docker-entrypoint.sh
RUN chmod +x /docker-entrypoint.sh

CMD ["/docker-entrypoint.sh"]
