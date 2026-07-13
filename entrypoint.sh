#!/bin/sh
set -e
cd /app

echo "[entrypoint] Initialer Scrape + Build..."
node dist/scraper/index.js || echo "[entrypoint] Initialer Scrape fehlgeschlagen — Seite zeigt ggf. keine/alte Daten, der nächtliche Cronjob versucht es erneut."
node dist/site/build.js || echo "[entrypoint] Initialer Site-Build fehlgeschlagen."

echo "[entrypoint] Starte supercronic (nächtlicher Cronjob, 03:00 Europe/Berlin)..."
supercronic /etc/supercronic/crontab &

echo "[entrypoint] Starte nginx..."
exec nginx -g "daemon off;"
