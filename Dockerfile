# Vigil CLM — API + scheduler. Build from the repository root:
#   docker build -t vigil-clm .
#   docker run --name vigil -p 4180:4180 -v vigil-data:/data vigil-clm
#
# First start writes /data/secret.key and prints a one-time admin password
# in the container logs. Set VIGIL_SECRET_KEY in the environment for production.

FROM node:20-bookworm-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
COPY server/package.json server/
COPY web/package.json web/
RUN npm ci
COPY server server
RUN npm run build -w server

FROM node:20-bookworm-slim
RUN apt-get update \
  && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY package.json package-lock.json ./
COPY server/package.json server/
COPY web/package.json web/
RUN npm ci --omit=dev
COPY --from=build /app/server/dist server/dist
ENV NODE_ENV=production \
    VIGIL_AUTH=1 \
    VIGIL_DATA_DIR=/data \
    PORT=4180
EXPOSE 4180
VOLUME ["/data"]
HEALTHCHECK --interval=30s --timeout=3s --start-period=15s \
  CMD node -e "fetch('http://127.0.0.1:4180/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "server/dist/index.js"]
