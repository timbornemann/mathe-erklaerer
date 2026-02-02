# Server-Stage
# Wir verwenden ein Nginx-Image, um die statischen Dateien auszuliefern
FROM node:20-alpine AS builder

WORKDIR /app

# Kopiere package files
COPY package.json package-lock.json ./

# Installiere Abhängigkeiten
RUN npm ci

# Kopiere den Rest des Codes
COPY . .

# Baue die App
RUN npm run build

# Production Stage mit Serve
FROM node:20-alpine

WORKDIR /app

# Installiere 'serve' global
RUN npm install -g serve

# Kopiere den Build-Output vom Builder
COPY --from=builder /app/dist ./dist

# Exponiere Port 3012
EXPOSE 3012

# Run as non-root user for security
USER node

# Starte den Server auf Port 3012
CMD ["serve", "-s", "dist", "-l", "3012"]
