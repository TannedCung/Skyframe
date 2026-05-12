# Use the official Playwright image — comes with Chromium pre-installed
FROM mcr.microsoft.com/playwright:v1.50.1-noble

WORKDIR /app

COPY package*.json ./
RUN npm ci

# Install Playwright's bundled Chromium (already in image but this links it correctly)
RUN npx playwright install chromium

COPY tsconfig.json ./
COPY src/ ./src/

EXPOSE 3001

ENV NODE_ENV=production

CMD ["npx", "tsx", "src/index.ts"]
