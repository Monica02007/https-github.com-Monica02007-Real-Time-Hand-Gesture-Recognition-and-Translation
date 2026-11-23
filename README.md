# 🤟 Real-Time ASL Translation App

An American Sign Language (ASL) gesture recognition and translation web application powered by **MediaPipe Hands**, **TypeScript**, **React**, and **Tailwind CSS**.

---

## 💻 How to Export and Run in VS Code

### 1. Prerequisites
- **Node.js**: Version 18, 20, or 22 installed on your computer ([Download Node.js](https://nodejs.org/)).
- **VS Code**: Visual Studio Code installed ([Download VS Code](https://code.visualstudio.com/)).

---

### 2. Export / Download
1. In Google AI Studio, click the **Export** / **Download ZIP** or **Push to GitHub** button.
2. If downloaded as a `.zip` archive, extract the files to a folder on your computer.

---

### 3. Open in VS Code
1. Launch **Visual Studio Code**.
2. Go to **File** → **Open Folder...** (or press `Ctrl+K Ctrl+O` on Windows / `Cmd+O` on macOS).
3. Select the extracted project folder.
4. When prompted by VS Code to install recommended extensions (`Tailwind CSS IntelliSense`, `Prettier`, `ESLint`), click **Install All**.

---

### 4. Install Dependencies
Open the integrated terminal in VS Code (`Ctrl+\`` or **Terminal** → **New Terminal**) and run:

```bash
npm install
```

---

### 5. Start the Development Server
Run the local Vite development server:

```bash
npm run dev
```

You will see output similar to:
```text
  VITE v5.4.2  ready in 250 ms

  ➜  Local:   http://localhost:3000/
  ➜  Network: http://0.0.0.0:3000/
```

Open your browser and navigate to:
**[http://localhost:3000](http://localhost:3000)**

> **Note on Webcam Permissions**: When running locally on `http://localhost:3000`, modern browsers grant camera permissions directly without iframe restrictions. Simply click **"Allow"** when prompted.

---

### 6. Available Scripts

| Command | Description |
| :--- | :--- |
| `npm run dev` | Starts the Vite dev server on port 3000 with hot module reloading. |
| `npm run build` | Type-checks with TypeScript and compiles production build to `/dist`. |
| `npm run preview` | Previews the production build locally. |
| `npm run lint` | Runs TypeScript compiler checks without emitting files. |

---

## 📌 Project Architecture

```
real-time-hand-gesture-recognition/
├── .vscode/
│   ├── settings.json         # Workspace formatting & Tailwind CSS settings
│   ├── extensions.json       # Recommended VS Code extensions
│   └── launch.json           # One-click F5 debugger config
├── src/
│   ├── components/
│   │   ├── CameraStream.tsx       # Live webcam capture & MediaPipe tracking
│   │   ├── SnapshotUpload.tsx     # Image upload & preset gesture testing
│   │   ├── SentenceBuilder.tsx    # Debounced sentence assembly & speech
│   │   ├── MetricsPanel.tsx       # Top-1 badge, confidence bar, top-3 candidates
│   │   ├── ModelTrainingModal.tsx # In-browser PyTorch MLP training simulator
│   │   └── ASLGuideModal.tsx      # Visual ASL gesture reference guide
│   ├── utils/
│   │   ├── landmarks.ts           # 21 3D points, wrist normalization, canvas rendering
│   │   └── model.ts               # ASL classification & synthesis engine
│   ├── App.tsx                    # Main dashboard layout (Theater / Split modes)
│   ├── main.tsx                   # React DOM root entry
│   └── index.css                  # Tailwind styles
├── index.html                     # HTML5 entry with MediaPipe scripts
├── package.json                   # Dependencies and scripts
├── tsconfig.json                  # TypeScript compiler options
├── tailwind.config.js             # Tailwind CSS configuration
└── vite.config.ts                 # Vite bundler configuration
```

---

## 🧠 Landmark Preprocessing & Normalization

Raw hand landmarks captured from MediaPipe Hands vary depending on hand size and distance from the camera. This app applies **Wrist-Relative Scale Normalization** in `src/utils/landmarks.ts`:

1. **Translation**: All 21 3D landmarks are translated relative to the wrist (landmark `0`):
   $$\mathbf{p}_i^{\text{rel}} = \mathbf{p}_i - \mathbf{p}_0 \quad \text{for } i \in [0, 20]$$
   After this step, the wrist is always at $(0, 0, 0)$.

2. **Scale Invariance**: The Euclidean distance from the wrist is calculated for all landmarks, and coordinates are divided by the maximum distance:
   $$d_{\max} = \max_{i} \|\mathbf{p}_i^{\text{rel}}\|_2$$
   $$\mathbf{p}_i^{\text{norm}} = \frac{\mathbf{p}_i^{\text{rel}}}{d_{\max} + \epsilon}$$

3. **Feature Vector**: The 21 normalized points form a consistent **63-dimensional** 1D vector (`(x0, y0, z0, ..., x20, y20, z20)`).

---

## ✨ Features

- **🔴 Live Video Camera Stream**: Real-time hand landmark extraction using MediaPipe Hands at 30+ FPS with mirrored canvas overlays and dynamic bounding box tags.
- **🖥️ Theater & Fullscreen Modes**: Expandable camera layout for an immersive signing experience.
- **📊 Metric Dashboard**: Top-1 predicted character badge with dynamic confidence bar, top-3 ranked candidate probabilities, and feed FPS counter.
- **🔤 Debounced Sentence Builder**:
  - Automatically holds a stable buffer: only appends a sign once sustained for $N$ consecutive frames.
  - Controls: `␣ Space`, `⌫ Del`, `🗑 Clear`, `📋 Copy`, and `🔊 Speak` (Text-to-Speech audio).
- **📸 Snapshot / File Upload Mode**: Instant testing using image uploads or pre-loaded Kaggle ASL landmark signatures (`A`, `B`, `C`, `D`, `E`, `L`, `V`, `W`, `Y`, `SPACE`).
- **⚡ Virtual Hand Tracker Simulator**: Built-in landmark synthesizer to test the full pipeline even when a physical webcam is not attached.
