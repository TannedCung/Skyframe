# Node 22 on Debian slim — `impers` ships prebuilt linux_x64 libcurl-impersonate
# bindings via `koffi`. Debian (glibc) is the safest base for the FFI dlopen.
FROM node:22-bookworm-slim

WORKDIR /app

# libcurl-impersonate is loaded via koffi's FFI. Install the small set of shared
# libs the curl-impersonate-chrome binary dynamically links against on Debian.
RUN apt-get update \
    && apt-get install -y --no-install-recommends \
        ca-certificates \
        libnghttp2-14 \
        libpsl5 \
        libssl3 \
        zlib1g \
    && rm -rf /var/lib/apt/lists/*

COPY package*.json ./
RUN npm ci

COPY tsconfig.json ./
COPY src/ ./src/

EXPOSE 3002

ENV NODE_ENV=production
ENV PORT=3002

CMD ["npx", "tsx", "src/index.ts"]
