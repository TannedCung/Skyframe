# Playwright base — ships Chromium for VietJet headless scraping.
# Also installs shared libs required by libcurl-impersonate (used by impers/koffi).
FROM mcr.microsoft.com/playwright:v1.50.1-noble

WORKDIR /app

# Shared libs for libcurl-impersonate-chrome (loaded via koffi FFI by `impers`)
RUN apt-get update \
    && apt-get install -y --no-install-recommends \
        libnghttp2-14 \
        libpsl5 \
        zlib1g \
    && rm -rf /var/lib/apt/lists/*

COPY package*.json ./
RUN npm ci

# Link Playwright's bundled Chromium
RUN npx playwright install chromium

COPY tsconfig.json ./
COPY src/ ./src/

EXPOSE 3000

ENV NODE_ENV=production
ENV PORT=3000

CMD ["npx", "tsx", "src/index.ts"]
