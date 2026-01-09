# Dockerfile for Cloud Run deployment
FROM node:20-alpine

WORKDIR /app

# Install dependencies first (for better caching)
COPY package*.json ./
RUN npm ci --omit=dev

# Install TypeScript temporarily for build
RUN npm install typescript

# Copy source code and config
COPY tsconfig.json ./
COPY src ./src

# Build TypeScript
RUN npm run build

# Remove TypeScript after build
RUN npm uninstall typescript

# Create data directory for SQLite
RUN mkdir -p /app/data

# Cloud Run sets PORT env var, default to 8080 if not set
ENV PORT=8080
ENV DB_PATH=/app/data/sessions.db
ENV NODE_ENV=production

# Expose port (Cloud Run will use PORT env var)
EXPOSE 8080

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD node -e "require('http').get('http://localhost:' + (process.env.PORT || 8080) + '/health', (r) => { process.exit(r.statusCode === 200 ? 0 : 1); });" || exit 1

# Start the relay server
CMD ["node", "dist/server/relay.js"]
