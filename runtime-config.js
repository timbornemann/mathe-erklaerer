// Entwicklungs-Default für die Laufzeitkonfiguration.
// In Produktion wird diese Datei durch das Docker-Entry-Script im Ordner "dist"
// überschrieben (siehe docker-entrypoint.sh).
window.__APP_CONFIG__ = window.__APP_CONFIG__ || {
  GEMINI_API_KEY: ""
};

