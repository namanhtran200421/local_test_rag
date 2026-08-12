FROM node:24-alpine AS dependencies
WORKDIR /app
COPY package*.json ./
RUN npm ci

FROM dependencies AS build
COPY tsconfig.json ./
COPY src ./src
RUN npm run build && npm prune --omit=dev

FROM node:24-alpine AS runtime
ENV NODE_ENV=production
WORKDIR /app
RUN addgroup -S tan && adduser -S tan -G tan
COPY --from=build --chown=tan:tan /app/node_modules ./node_modules
COPY --from=build --chown=tan:tan /app/dist ./dist
COPY --chown=tan:tan database ./database
COPY --chown=tan:tan package.json ./package.json
USER tan
EXPOSE 1010
HEALTHCHECK --interval=30s --timeout=3s --retries=3 CMD wget -qO- http://127.0.0.1:1010/health/live || exit 1
CMD ["node", "dist/server.js"]
