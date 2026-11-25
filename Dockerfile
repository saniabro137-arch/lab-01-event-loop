FROM node:24-alpine AS dependencies
WORKDIR /app
COPY package.json package-lock.json ./
COPY client/package.json ./client/
COPY server/package.json ./server/
COPY shared/package.json ./shared/

FROM dependencies AS build
RUN npm ci
COPY client ./client
COPY shared ./shared
COPY tsconfig.base.json ./
RUN npm run build

FROM dependencies AS production-dependencies
RUN npm ci --omit=dev

FROM node:24-alpine AS runtime
WORKDIR /app
ARG APP_VERSION=dev
ENV NODE_ENV=production \
    PORT=3000 \
    APP_VERSION=$APP_VERSION \
    LOG_DIR=/app/logs

COPY --from=production-dependencies /app/node_modules ./node_modules
COPY package.json ./
COPY client/package.json ./client/
COPY server ./server
COPY shared ./shared
COPY --from=build /app/client/dist ./client/dist

RUN mkdir /app/logs && chown node:node /app/logs
RUN chmod -R a+rX /app/server /app/shared

USER node
EXPOSE 3000
STOPSIGNAL SIGTERM

HEALTHCHECK --interval=5s --timeout=3s --start-period=5s --retries=5 \
  CMD ["node", "-e", "fetch('http://127.0.0.1:3000/health',{signal:AbortSignal.timeout(2000)}).then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"]

CMD ["node", "server/src/index.ts"]
