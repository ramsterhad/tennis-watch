# Builder: compile TypeScript
FROM node:20-bookworm-slim AS builder
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY tsconfig.json ./
COPY src ./src
RUN npm run build

# Runtime: Playwright's own image ships every OS dependency Chromium needs,
# pinned to match the npm "playwright" version exactly (see package.json).
FROM mcr.microsoft.com/playwright:v1.61.1-jammy AS runtime
WORKDIR /app

ENV DEBIAN_FRONTEND=noninteractive TZ=Europe/Berlin
RUN apt-get update \
  && apt-get install -y --no-install-recommends nginx curl ca-certificates tzdata \
  && rm -rf /var/lib/apt/lists/*

# supercronic: a cron daemon that behaves well in containers (logs to
# stdout/stderr, no syslog dependency) — runs our nightly scrape+build job.
ENV SUPERCRONIC_VERSION=v0.2.33
RUN curl -fsSLo /usr/local/bin/supercronic \
  "https://github.com/aptible/supercronic/releases/download/${SUPERCRONIC_VERSION}/supercronic-linux-amd64" \
  && chmod +x /usr/local/bin/supercronic

COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY --from=builder /app/dist ./dist
COPY src/config ./src/config
COPY src/site/template.html src/site/style.css ./src/site/
COPY crontab /etc/supercronic/crontab
COPY entrypoint.sh /entrypoint.sh
COPY nginx.conf /etc/nginx/sites-enabled/default
RUN chmod +x /entrypoint.sh

RUN mkdir -p /app/data /app/public/images

EXPOSE 8080
ENTRYPOINT ["/entrypoint.sh"]
