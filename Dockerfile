# Railway-optimized Dockerfile for Qopy with PostgreSQL
FROM node:20-alpine AS builder

# Set the working directory
WORKDIR /app

# Install curl for downloading external resources
RUN apk add --no-cache curl

# Copy package files first to leverage Docker layer caching
COPY package*.json ./
COPY .npmrc ./

# Install dependencies (without package-lock.json)
RUN rm -f package-lock.json && \
    npm install

# Copy scripts directory
COPY scripts/ ./scripts/

# Copy public directory for frontend build
COPY public/ ./public/

# Build minified frontend assets
RUN node scripts/build-frontend.js

# Create data directory for spam IP lists
RUN mkdir -p data

# Production stage
FROM node:20-alpine AS production

# Install curl and other utilities needed for runtime
RUN apk add --no-cache curl wget

# Set NODE_ENV to production
ENV NODE_ENV=production

# Create a non-root user for security
RUN addgroup -g 1001 -S nodejs && \
    adduser -S qopy -u 1001

# Set the working directory
WORKDIR /app

# Copy dependencies from builder stage
COPY --from=builder /app/node_modules ./node_modules

# Copy minified frontend assets from builder
COPY --from=builder /app/public/dist ./public/dist

# Copy application code with proper ownership
COPY --chown=qopy:nodejs . .

# Create necessary directories with proper permissions
RUN mkdir -p data logs uploads/files uploads/chunks uploads/temp && \
    chown -R qopy:nodejs data logs uploads && \
    chmod -R 775 data logs uploads

# Remove unnecessary files but keep scripts
RUN rm -f start.sh

# Ensure qopy user owns the entire app directory and can write
RUN chown -R qopy:nodejs /app && \
    chmod -R 755 /app && \
    chmod -R 775 data logs

# Switch to non-root user for setup
USER qopy

# Create startup script
RUN echo '#!/bin/sh' > /app/startup.sh && \
    echo 'set -e' >> /app/startup.sh && \
    echo 'exec node server.js' >> /app/startup.sh && \
    chmod +x /app/startup.sh

# Switch back to root to set final permissions
USER root
RUN chown qopy:nodejs /app/startup.sh
USER qopy

# Expose the port the app runs on
EXPOSE 8080

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
  CMD curl -f http://localhost:${PORT:-8080}/health || exit 1

# Start the application with database initialization
CMD ["/app/startup.sh"]
