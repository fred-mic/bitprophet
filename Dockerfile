FROM oven/bun:1.3.1 AS base
WORKDIR /app

# Install dependencies
COPY package.json bun.lock* ./
COPY apps ./apps
COPY packages ./packages
RUN bun install --frozen-lockfile

# Copy source code
COPY . .

# Build all apps
RUN bun run build

# Production stage
FROM oven/bun:1.3.1
WORKDIR /app

# Install NGINX and cron
RUN apt-get update && apt-get install -y nginx cron && rm -rf /var/lib/apt/lists/*

# Copy built artifacts and dependencies
COPY --from=base /app/node_modules ./node_modules
COPY --from=base /app/apps ./apps
COPY --from=base /app/packages ./packages
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
