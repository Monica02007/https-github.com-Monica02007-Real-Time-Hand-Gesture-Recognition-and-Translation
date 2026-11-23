# 🤟 Real-Time ASL Translation App

An American Sign Language (ASL) gesture recognition and translation web application built with **HTML5**, **CSS3**, **Vanilla JavaScript**, and **MediaPipe Hands** — zero build step required for GitHub Pages.

---

## 🌐 Deploying to GitHub Pages

Because this project uses pure **HTML, CSS, and JavaScript** (`index.html`, `styles.css`, `js/*.js`), it works directly on GitHub Pages:

1. Push all files (`index.html`, `styles.css`, `js/`) to your GitHub repository.
2. Go to **Settings → Pages**.
3. Choose **Deploy from a branch** (`main` / `/(root)`) **or** **GitHub Actions**.
4. Open your published `https://<username>.github.io/<repo-name>/` link (HTTPS enables webcam permissions automatically).

---

## 💻 Running Locally in VS Code

### Option A: Live Server / Static HTTP Server
1. Open the folder in **Visual Studio Code**.
2. Right-click `index.html` → **Open with Live Server** (or run `npx serve .`).

### Option B: Vite Dev Server (Port 3000)
```bash
npm install
npm run dev
```
Open **[http://localhost:3000](http://localhost:3000)**.

---

## 📌 Project Structure

```
real-time-hand-gesture-recognition/
├── .github/workflows/deploy.yml  # Optional GitHub Pages build/deploy workflow
├── .vscode/                      # VS Code settings, extensions, and launch config
├── js/
│   ├── app.js                    # UI controller, webcam, simulator, modals & autocomplete
│   ├── landmarks.js              # Wrist-relative normalization & Canvas mesh rendering
│   └── model.js                  # 28-class ASL classifier & 3D landmark synthesizer
├── index.html                    # Semantic HTML5 application entry point
├── styles.css                    # Standalone responsive CSS3 stylesheet
└── package.json                  # Optional dev/build/lint scripts
```

---

## ✨ Features

- **28 Static ASL Signs**: Recognizes 24 static alphabet letters (`A–Y`, omitting motion `J`/`Z`) plus `SPACE`, `ILY` ("I Love You"), `GOOD`, and `NO`.
- **🔴 Live Video Camera Stream**: Real-time hand landmark tracking via MediaPipe Hands with mirror toggle, device switcher, Theater Mode, and Fullscreen.
- **⚡ Virtual Hand Tracker Simulator**: Test all 28 signs even when no physical webcam is connected.
- **🔤 Debounced Sentence Builder + Word Autocomplete**: Sustains signs cleanly across frames, suggests common words (`HELLO`, `THANK YOU`, `PLEASE`, etc.), and supports clipboard copy + Text-to-Speech.
- **📸 Snapshot / Upload Test**: Upload hand gesture photos or inspect any of the 28 preset ASL landmark signatures.
