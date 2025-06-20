# Use the official Node.js runtime as the base image
FROM node:20-alpine AS builder

# Set the working directory in the container
WORKDIR /app

# Install curl for downloading external resources
RUN apk add --no-cache curl

# Upgrade npm to latest version
RUN npm install -g npm@latest

# Copy package files first to leverage Docker layer caching
COPY package*.json ./
COPY .npmrc ./
COPY scripts/check-npm-version.js ./scripts/

# Check npm version and install dependencies
RUN node scripts/check-npm-version.js && npm ci --only=production

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

# Note: Admin setup and spam list downloads moved to runtime startup script
# This avoids permission issues during build phase

# Create a simplified startup script for better reliability
RUN echo '#!/bin/sh' > /app/startup.sh && \
    echo 'set -e' >> /app/startup.sh && \
    echo 'echo "🚀 Starting Qopy..."' >> /app/startup.sh && \
    echo '' >> /app/startup.sh && \
    echo '# Basic startup info' >> /app/startup.sh && \
    echo 'echo "User: $(whoami)"' >> /app/startup.sh && \
    echo 'echo "Working Directory: $(pwd)"' >> /app/startup.sh && \
    echo 'echo "Node Version: $(node --version)"' >> /app/startup.sh && \
    echo '' >> /app/startup.sh && \
    echo '# Quick file check' >> /app/startup.sh && \
    echo 'if [ ! -f "server.js" ]; then' >> /app/startup.sh && \
    echo '  echo "❌ ERROR: server.js not found!"' >> /app/startup.sh && \
    echo '  exit 1' >> /app/startup.sh && \
    echo 'fi' >> /app/startup.sh && \
    echo 'echo "✅ Server file found"' >> /app/startup.sh && \
    echo '' >> /app/startup.sh && \
    echo '# Optional admin setup (non-blocking)' >> /app/startup.sh && \
    echo 'if [ ! -f "ADMIN-QUICKSTART.md" ]; then' >> /app/startup.sh && \
    echo '  echo "🎛️ Setting up admin..."' >> /app/startup.sh && \
    echo '  npm run setup-admin || echo "⚠️ Admin setup skipped"' >> /app/startup.sh && \
    echo 'fi' >> /app/startup.sh && \
    echo '' >> /app/startup.sh && \
    echo '# Optional spam lists (non-blocking)' >> /app/startup.sh && \
    echo 'if [ ! -f "data/spam-ips.json" ]; then' >> /app/startup.sh && \
    echo '  echo "📥 Downloading spam lists..."' >> /app/startup.sh && \
    echo '  npm run update-spam-ips || echo "⚠️ Spam lists skipped"' >> /app/startup.sh && \
    echo 'fi' >> /app/startup.sh && \
    echo '' >> /app/startup.sh && \
    echo '# Start server directly with node' >> /app/startup.sh && \
    echo 'echo "🚀 Starting server..."' >> /app/startup.sh && \
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

# Health check with more generous startup time
HEALTHCHECK --interval=30s --timeout=15s --start-period=60s --retries=5 \
  CMD node -e "require('http').get('http://localhost:3000/api/health', (res) => { process.exit(res.statusCode === 200 ? 0 : 1) })" || exit 1

# Start the application with fallback options
# Try startup script first, fallback to direct node start  
CMD ["/bin/sh", "-c", "if [ -x /app/startup.sh ]; then /app/startup.sh; else echo 'Startup script failed, starting directly...'; node server.js; fi"] 