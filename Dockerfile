FROM --platform=$BUILDPLATFORM node:20-alpine AS builder

WORKDIR /app

# Kopiere package files
COPY package.json package-lock.json ./

# Installiere Abhaengigkeiten
RUN npm ci --no-audit --fund=false

# Kopiere den Rest des Codes
COPY . .

# Baue die App (architekturunabhaengige statische Assets)
RUN npm run build

# Production Stage mit Serve
FROM --platform=$TARGETPLATFORM node:20-alpine

WORKDIR /app

# Installiere 'serve' global
RUN npm install -g serve --no-audit --fund=false

# Kopiere den Build-Output vom Builder
COPY --from=builder --chown=node:node /app/dist ./dist
COPY --chown=node:node docker-entrypoint.sh ./docker-entrypoint.sh

# Stelle sicher, dass der non-root User schreiben und das Entrypoint-Script ausfuehren kann
RUN chmod +x /app/docker-entrypoint.sh

# Exponiere Port 3012
EXPOSE 3012

# Run as non-root user for security
USER node

# Starte den Server auf Port 3012
ENTRYPOINT ["./docker-entrypoint.sh"]
CMD ["serve", "-s", "dist", "-l", "3012"]
