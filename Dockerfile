FROM node:18-alpine

# Install build tools (cho bcrypt, sharp, etc.)
RUN apk add --no-cache python3 make g++

WORKDIR /app

# COPY ĐÚNG package.json + package-lock.json
COPY backend/package*.json ./

# CHỈ CÀI 1 LẦN
RUN npm ci --omit=dev

# COPY SOURCE CODE
COPY backend/ .

# Create necessary directories
RUN mkdir -p logs uploads data

ENV NODE_ENV=production
ENV PORT=3000

# Create non-root user
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001 && \
    chown -R nodejs:nodejs /app

USER nodejs

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3000/health', r => { if (r.statusCode !== 200) process.exit(1) })"

CMD ["node", "server.js"]
