# Use the official Node.js runtime as the base image
FROM node:20-alpine AS builder

# Set the working directory in the container
WORKDIR /app

# Upgrade npm to latest version
RUN npm install -g npm@latest

# Copy package files first to leverage Docker layer caching
COPY package*.json ./
COPY .npmrc ./
COPY scripts/check-npm-version.js ./scripts/

# Check npm version and install dependencies
RUN node scripts/check-npm-version.js && npm ci --only=production

# Production stage
FROM node:20-alpine AS production

# Upgrade npm to latest version
RUN npm install -g npm@latest

# Set NODE_ENV to production
ENV NODE_ENV=production

# Create a non-root user for security
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nextjs -u 1001

# Set the working directory
WORKDIR /app

# Copy dependencies from builder stage
COPY --from=builder /app/node_modules ./node_modules

# Copy application code
COPY --chown=nextjs:nodejs . .

# Remove unnecessary files
RUN rm -f start.sh

# Switch to non-root user
USER nextjs

# Expose the port the app runs on
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3000/api/health', (res) => { process.exit(res.statusCode === 200 ? 0 : 1) })"

# Start the application
CMD ["npm", "start"] 