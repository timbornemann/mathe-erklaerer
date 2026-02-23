#!/bin/sh
set -eu

mkdir -p /app/dist

ESCAPED_KEY=$(printf '%s' "${GEMINI_API_KEY:-}" | sed 's/\\/\\\\/g; s/"/\\"/g')

cat > /app/dist/runtime-config.js <<CONFIG
window.__APP_CONFIG__ = {
  GEMINI_API_KEY: "${ESCAPED_KEY}"
};
CONFIG

exec "$@"
