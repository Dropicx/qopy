# Railway-optimized Dockerfile for Qopy with PostgreSQL
FROM node:20-alpine AS builder

# Set the working directory
WORKDIR /app

# Install curl for downloading external resources
RUN apk add --no-cache curl

# Upgrade npm to latest version
RUN npm install -g npm@latest

# Copy package files first to leverage Docker layer caching
COPY package*.json ./
COPY .npmrc ./
COPY scripts/npm-check.js ./scripts/

# Check npm version and install dependencies (without package-lock.json)
RUN node scripts/npm-check.js && \
    rm -f package-lock.json && \
    npm install

# Copy all scripts needed for setup
COPY scripts/ ./scripts/

# Create data directory for spam IP lists
RUN mkdir -p data

# Production stage
FROM node:20-alpine AS production

# Install curl and other utilities needed for runtime
RUN apk add --no-cache curl wget

# Upgrade npm to latest version
RUN npm install -g npm@latest

# Set NODE_ENV to production
ENV NODE_ENV=production

# Create a non-root user for security
RUN addgroup -g 1001 -S nodejs && \
    adduser -S qopy -u 1001

# Set the working directory
WORKDIR /app

# Copy dependencies from builder stage
COPY --from=builder /app/node_modules ./node_modules

# Copy application code with proper ownership
COPY --chown=qopy:nodejs . .

# Create necessary directories with proper permissions
RUN mkdir -p data logs && \
    chown -R qopy:nodejs data logs

# Remove unnecessary files but keep scripts
RUN rm -f start.sh

# Ensure qopy user owns the entire app directory and can write
RUN chown -R qopy:nodejs /app && \
    chmod -R 755 /app && \
    chmod -R 775 data logs

# Switch to non-root user for setup
USER qopy

# Create a Railway-optimized startup script
RUN echo '#!/bin/sh' > /app/startup.sh && \
    echo 'set -e' >> /app/startup.sh && \
    echo 'echo "🚀 Starting Qopy with PostgreSQL..."' >> /app/startup.sh && \
    echo '' >> /app/startup.sh && \
    echo '# Basic startup info' >> /app/startup.sh && \
    echo 'echo "User: $(whoami)"' >> /app/startup.sh && \
    echo 'echo "Working Directory: $(pwd)"' >> /app/startup.sh && \
    echo 'echo "Node Version: $(node --version)"' >> /app/startup.sh && \
    echo 'echo "Railway Environment: $RAILWAY_ENVIRONMENT"' >> /app/startup.sh && \
    echo '' >> /app/startup.sh && \
    echo '# Check for server file' >> /app/startup.sh && \
    echo 'if [ ! -f "server.js" ]; then' >> /app/startup.sh && \
    echo '  echo "❌ ERROR: server.js not found!"' >> /app/startup.sh && \
    echo '  exit 1' >> /app/startup.sh && \
    echo 'fi' >> /app/startup.sh && \
    echo 'echo "✅ Server file found"' >> /app/startup.sh && \
    echo '' >> /app/startup.sh && \
    echo '# Initialize PostgreSQL database' >> /app/startup.sh && \
    echo 'echo "🗄️ Initializing PostgreSQL database..."' >> /app/startup.sh && \
    echo 'node scripts/db-init.js || echo "⚠️ Database init skipped"' >> /app/startup.sh && \
    echo '' >> /app/startup.sh && \
    echo '# Start server' >> /app/startup.sh && \
    echo 'echo "🚀 Starting Qopy server..."' >> /app/startup.sh && \
    echo 'if [ "$DEBUG" = "true" ]; then' >> /app/startup.sh && \
    echo '  exec node --trace-warnings --expose-gc server.js' >> /app/startup.sh && \
    echo 'else' >> /app/startup.sh && \
    echo '  exec node server.js' >> /app/startup.sh && \
    echo 'fi' >> /app/startup.sh && \
    chmod +x /app/startup.sh

# Switch back to root to set final permissions
USER root
RUN chown qopy:nodejs /app/startup.sh
USER qopy

# Expose the port the app runs on
EXPOSE 3000

# Start the application
CMD ["node", "server.js"] 