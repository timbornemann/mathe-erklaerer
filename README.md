# MatheGenius AI 🧮🤖

**MatheGenius AI** ist dein persönlicher Schritt-für-Schritt Mathe-Tutor, basierend auf der Google Gemini 3 API.

Die Anwendung löst mathematische Aufgaben extrem detailliert und verständlich. Du kannst Aufgaben entweder als Text eingeben oder einfach ein Foto davon hochladen.

## 🚀 Features

*   **📷 Foto-Analyse**: lade einfach ein Bild deiner Matheaufgabe hoch.
*   **✍️ Text-Eingabe**: Gib Formeln oder Textaufgaben direkt ein.
*   **🧠 Schritt-für-Schritt Lösungen**: Erhalte nicht nur das Ergebnis, sondern verstehe den Weg dorthin mit ausführlichen Erklärungen und Formeln (LaTeX gerendert).
*   **🔑 Eigener API Key**: Nutze deinen eigenen Google API Key (kostenlos via AI Studio). Dieser wird sicher nur in deinem Browser gespeichert.
*   **📜 Verlauf**: Deine gelösten Aufgaben werden lokal gespeichert, sodass du später darauf zurückgreifen kannst.
*   **📱 Responsive & Modern**: Funktioniert auf Desktop, Tablet und Mobile.

---

## 🛠 Nutzung

Es gibt drei Wege, MatheGenius AI zu nutzen:

### 1. Schnellstart mit dem fertigen Docker-Image (empfohlen) 🐳

Wenn du nicht lokal bauen möchtest, kannst du das bereits bereitgestellte Docker-Image aus der GitHub Container Registry nutzen:

```bash
docker pull ghcr.io/timbornemann/mathe-erklaerer:latest
docker run -d --name mathe-erklaerer -p 3012:3012 \
  -e GEMINI_API_KEY=dein_google_api_key \
  ghcr.io/timbornemann/mathe-erklaerer:latest
```

Die Anwendung ist danach unter **http://localhost:3012** erreichbar.

Optional kannst du den Key auch weglassen und später im Browser hinterlegen.
Mit `GEMINI_API_KEY` ist der Key jedoch direkt für alle Geräte verfügbar, die auf den Container zugreifen.


### 2. Docker Compose (Lokal bauen) 🏗️

Wenn du den Code hast und die Anwendung lokal containerisiert starten willst:

```bash
# optional: in .env setzen
# GEMINI_API_KEY=dein_google_api_key
docker-compose up --build
```
Die App ist unter **http://localhost:3012** erreichbar.

### 3. Lokale Entwicklung (Node.js) 💻

1.  Repository klonen.
2.  Abhängigkeiten installieren:
    ```bash
    npm install
    ```
3.  Entwicklungsserver starten:
    ```bash
    npm run dev
    ```
4.  Browser öffnet sich (standardmäßig auf Port 3012).

---

## 🔑 API Key Einrichtung

### Containerweiter API Key (optional, empfohlen bei Docker)

Wenn du die App in Docker betreibst, kannst du den API Key als Umgebungsvariable `GEMINI_API_KEY` setzen.
Dann ist der Key automatisch in der App verfügbar – auch von anderen Geräten im Netzwerk, solange sie auf denselben Container zugreifen.
Ein lokal im Browser gesetzter Key hat weiterhin Vorrang.

Beim ersten Start siehst du oben rechts im Header ein **Schlüssel-Symbol**.
1. Klicke darauf.
2. Gib deinen **Google Gemini API Key** ein.
   (Falls du keinen hast: [Hier kostenlos erstellen](https://aistudio.google.com/)).
3. Der Key wird **lokal in deinem Browser** gespeichert. Er wird niemals an uns oder andere Server gesendet, sondern direkt für die Anfrage an Google genutzt.

---

## Technischer Stack

*   **Frontend**: React, TypeScript, Vite
*   **AI**: Google Gemini API (@google/genai)
*   **Styling**: TailwindCSS (via CDN), Lucide Icons
*   **Rendering**: KaTeX für mathematische Formeln
*   **Deployment**: Docker, GitHub Packages (GHCR)
