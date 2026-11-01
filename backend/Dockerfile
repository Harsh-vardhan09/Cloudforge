# Stage 1: resolve production dependencies only
FROM node:20-alpine AS deps
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev

# Stage 2: runtime
FROM node:20-alpine
ENV NODE_ENV=production
WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY . .

# winston writes here and will not create the directory itself
RUN mkdir -p logs && chown -R node:node /app

USER node
EXPOSE 5000
CMD ["node", "server.js"]
