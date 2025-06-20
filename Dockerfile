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

# Create a startup script that handles runtime initialization
RUN echo '#!/bin/sh' > /app/startup.sh && \
    echo 'echo "🚀 Starting Qopy with automated setup..."' >> /app/startup.sh && \
    echo '' >> /app/startup.sh && \
    echo '# Debug information' >> /app/startup.sh && \
    echo 'echo "🔍 Debug Information:"' >> /app/startup.sh && \
    echo 'echo "  - Container ID: \$(hostname)"' >> /app/startup.sh && \
    echo 'echo "  - User: \$(whoami)"' >> /app/startup.sh && \
    echo 'echo "  - Working Directory: \$(pwd)"' >> /app/startup.sh && \
    echo 'echo "  - Node Version: \$(node --version)"' >> /app/startup.sh && \
    echo 'echo "  - NPM Version: \$(npm --version)"' >> /app/startup.sh && \
    echo 'echo "  - Memory: \$(free -h | grep Mem | awk '\''{print \$2}'\'')"' >> /app/startup.sh && \
    echo 'echo "  - Debug Mode: \${DEBUG:-false}"' >> /app/startup.sh && \
    echo 'echo "  - Railway Environment: \${RAILWAY_ENVIRONMENT:-unknown}"' >> /app/startup.sh && \
    echo '' >> /app/startup.sh && \
    echo '# Check for required files' >> /app/startup.sh && \
    echo 'echo "📁 Checking required files..."' >> /app/startup.sh && \
    echo 'if [ ! -f "server.js" ]; then' >> /app/startup.sh && \
    echo '  echo "❌ ERROR: server.js not found!"' >> /app/startup.sh && \
    echo '  exit 1' >> /app/startup.sh && \
    echo 'fi' >> /app/startup.sh && \
    echo 'if [ ! -f "public/admin.html" ]; then' >> /app/startup.sh && \
    echo '  echo "⚠️ WARNING: admin.html not found!"' >> /app/startup.sh && \
    echo 'fi' >> /app/startup.sh && \
    echo 'echo "✅ Required files check completed"' >> /app/startup.sh && \
    echo '' >> /app/startup.sh && \
    echo '# Setup admin dashboard if not already done' >> /app/startup.sh && \
    echo 'if [ ! -f "ADMIN-QUICKSTART.md" ]; then' >> /app/startup.sh && \
    echo '  echo "🎛️ Setting up admin dashboard..."' >> /app/startup.sh && \
    echo '  if npm run setup-admin; then' >> /app/startup.sh && \
    echo '    echo "✅ Admin dashboard setup completed"' >> /app/startup.sh && \
    echo '  else' >> /app/startup.sh && \
    echo '    echo "⚠️ Warning: Admin setup failed, continuing without admin files"' >> /app/startup.sh && \
    echo '  fi' >> /app/startup.sh && \
    echo 'else' >> /app/startup.sh && \
    echo '  echo "ℹ️ Admin dashboard already configured"' >> /app/startup.sh && \
    echo 'fi' >> /app/startup.sh && \
    echo '' >> /app/startup.sh && \
    echo '# Try to update spam lists at startup if not already present' >> /app/startup.sh && \
    echo 'if [ ! -f "data/spam-ips.json" ] || [ $(find data/spam-ips.json -mtime +1 2>/dev/null | wc -l) -gt 0 ]; then' >> /app/startup.sh && \
    echo '  echo "📥 Updating spam IP lists..."' >> /app/startup.sh && \
    echo '  if npm run update-spam-ips; then' >> /app/startup.sh && \
    echo '    echo "✅ Spam IP lists updated successfully"' >> /app/startup.sh && \
    echo '  else' >> /app/startup.sh && \
    echo '    echo "⚠️ Warning: Could not update spam lists. Continuing with existing data."' >> /app/startup.sh && \
    echo '  fi' >> /app/startup.sh && \
    echo 'else' >> /app/startup.sh && \
    echo '  echo "ℹ️ Spam IP lists are up to date"' >> /app/startup.sh && \
    echo 'fi' >> /app/startup.sh && \
    echo '' >> /app/startup.sh && \
    echo '# Display admin info' >> /app/startup.sh && \
    echo 'if [ -f "ADMIN-QUICKSTART.md" ]; then' >> /app/startup.sh && \
    echo '  echo "🎛️ Admin Dashboard available at: https://\$RAILWAY_PUBLIC_DOMAIN/admin"' >> /app/startup.sh && \
    echo '  echo "🔑 Check ADMIN-QUICKSTART.md for login token"' >> /app/startup.sh && \
    echo 'else' >> /app/startup.sh && \
    echo '  echo "⚠️ Admin setup not completed"' >> /app/startup.sh && \
    echo 'fi' >> /app/startup.sh && \
    echo '' >> /app/startup.sh && \
    echo '# Signal handling information' >> /app/startup.sh && \
    echo 'echo "📡 Process will handle these signals:"' >> /app/startup.sh && \
    echo 'echo "  - SIGTERM: Graceful shutdown (Railway deployments)"' >> /app/startup.sh && \
    echo 'echo "  - SIGINT: Interrupt signal"' >> /app/startup.sh && \
    echo 'echo "  - SIGHUP: Hangup signal"' >> /app/startup.sh && \
    echo 'if [ "\$DEBUG" = "true" ]; then' >> /app/startup.sh && \
    echo '  echo "🔍 Debug signals available:"' >> /app/startup.sh && \
    echo '  echo "  - SIGUSR1: Debug info dump"' >> /app/startup.sh && \
    echo '  echo "  - SIGUSR2: Force garbage collection"' >> /app/startup.sh && \
    echo 'fi' >> /app/startup.sh && \
    echo '' >> /app/startup.sh && \
    echo '# Start the application with appropriate options' >> /app/startup.sh && \
    echo 'echo "🚀 Starting Qopy server..."' >> /app/startup.sh && \
    echo 'if [ "\$DEBUG" = "true" ]; then' >> /app/startup.sh && \
    echo '  echo "🔍 Starting in DEBUG mode with enhanced logging"' >> /app/startup.sh && \
    echo '  exec node --trace-warnings --expose-gc server.js' >> /app/startup.sh && \
    echo 'else' >> /app/startup.sh && \
    echo '  exec npm start' >> /app/startup.sh && \
    echo 'fi' >> /app/startup.sh && \
    chmod +x /app/startup.sh

# Switch back to root to set final permissions
USER root
RUN chown qopy:nodejs /app/startup.sh
USER qopy

# Expose the port the app runs on
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=10s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3000/api/health', (res) => { process.exit(res.statusCode === 200 ? 0 : 1) })" || exit 1

# Start the application with our custom startup script
CMD ["/app/startup.sh"] 