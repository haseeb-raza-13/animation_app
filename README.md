# Eldritch Spells ✨

> Cast Doctor Strange-style magical spells in real-time using your webcam and hand gestures — no install, no dependencies, pure browser magic.

---

## What It Does

**Eldritch Spells** uses your device camera and [MediaPipe Hand Landmarker](https://ai.google.dev/edge/mediapipe/solutions/vision/hand_landmarker) to track your hands in real-time (21 landmarks per hand, up to 2 hands simultaneously). As you move your hands, the app renders glowing particle effects, spinning mandalas, fire portals, and magical rune drawings directly on a canvas overlay — all at 30–60 FPS with no server, no install, and no framework.

---

## Spells

| Spell | Gesture | Effect |
|---|---|---|
| **Eldritch Shield** | Open palm facing camera | Spinning 3-layer mandala with ancient runes and sacred geometry |
| **Spell Caster** | Point only your index finger | Glowing magical trail that follows your fingertip and fades slowly |
| **Sling Portal** | Both hands visible | Swirling fire portal centered between your two hands; size controlled by hand distance |
| **Cosmic Sparks** | Any hand raised | Glowing star sparks burst from all 5 fingertips continuously |

---

## Controls

### Keyboard Shortcuts
| Key | Action |
|---|---|
| `1` | Switch to Eldritch Shield |
| `2` | Switch to Spell Caster (draw) |
| `3` | Switch to Sling Portal |
| `4` | Switch to Cosmic Sparks |
| `M` | Toggle mirror mode |

### Sidebar Controls
- **Mystic Glow Color** — Switch between Orange, Crimson, Astral Blue, Mirror Purple
- **Shield Size / Line Width** — Scale the spell geometry (0.5× – 2.0×)
- **Rotation / Speed** — Speed up or slow down spinning effects
- **Spark Count** — Control particle density (10% – 100%)
- **Webcam Visibility** — Blend the camera feed from invisible to fully visible
- **Mirror Webcam Feed** — Flip the camera horizontally (on by default)
- **Mystic Sound Synth** — Enable/disable a procedural Web Audio hum + crackle that responds to hand speed and height
- **Gesture Confidence** — Tune MediaPipe's detection sensitivity
- **Clear Active Magic** — Wipe all particles and drawn strokes
- **Capture Spells** — Download a merged PNG snapshot of the camera feed + effects

---

## Tech Stack

| Layer | Technology |
|---|---|
| Hand tracking | [MediaPipe Tasks Vision 0.10.8](https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.8/) via CDN |
| Rendering | Canvas 2D API with `screen` composite for additive glow |
| Audio | Web Audio API — oscillator + bandpass noise synth |
| Fonts | Google Fonts — Orbitron, Cinzel Decorative, Inter |
| Framework | **None** — plain HTML + CSS + ES Modules |
| Build step | **None** — open `index.html` directly or deploy as static files |

---

## Project Structure

```
animation_app/
├── index.html      # Shell, DOM structure, meta tags, favicon
├── index.css       # Dark glassmorphic UI, responsive sidebar, animations
├── app.js          # All logic — hand tracking, effects, audio, UI bindings
└── vercel.json     # COOP/COEP headers for MediaPipe WASM + cache control
```

---

## Running Locally

> **Chrome requires HTTPS or localhost for camera access.** Firefox allows camera on `file://`.

### Option 1 — Python (no install needed on macOS/Linux)
```bash
cd animation_app
python3 -m http.server 8080
# Open http://localhost:8080
```

### Option 2 — Node.js
```bash
cd animation_app
npx serve .
# Open the URL it prints
```

### Option 3 — VS Code Live Server
Install the **Live Server** extension, right-click `index.html` → **Open with Live Server**.

### Option 4 — Firefox directly
Firefox allows `getUserMedia` on `file://` — just double-click `index.html`.

---

## Deploy to Vercel

The app is a **zero-build static site** — Vercel serves `index.html` and the two asset files directly. The `vercel.json` is already configured with the required security headers.

---

### Method 1 — Vercel CLI (fastest, deploy in ~60 seconds)

**1. Install the CLI once:**
```bash
npm install -g vercel
```

**2. Deploy from the project folder:**
```bash
cd animation_app
vercel
```

**3. Answer the prompts:**
```
? Set up and deploy? → Y
? Which scope? → (select your account)
? Link to existing project? → N
? What's your project's name? → eldritch-spells
? In which directory is your code located? → ./
? Want to modify these settings? → N
```

Vercel prints a live URL like `https://eldritch-spells.vercel.app` — you're done.

**Redeploy after any change:**
```bash
vercel --prod
```

---

### Method 2 — GitHub + Vercel Dashboard (recommended for ongoing work)

**Step 1 — Push to GitHub**

```bash
cd animation_app
git init
git add .
git commit -m "Initial commit — Eldritch Spells"
```

Create a new **empty** repository at [github.com/new](https://github.com/new), then:

```bash
git remote add origin https://github.com/YOUR_USERNAME/eldritch-spells.git
git branch -M main
git push -u origin main
```

**Step 2 — Import into Vercel**

1. Go to [vercel.com/new](https://vercel.com/new)
2. Click **Add New Project** → **Import Git Repository**
3. Select your `eldritch-spells` repo and click **Import**
4. On the **Configure Project** screen, use these settings:

   | Setting | Value |
   |---|---|
   | Framework Preset | **Other** |
   | Root Directory | `/` (leave as-is) |
   | Build Command | *(leave empty)* |
   | Output Directory | *(leave empty)* |
   | Install Command | *(leave empty)* |

5. Click **Deploy**

Vercel detects `index.html` at the root, skips all build steps, and serves the files as a static site. Every `git push` to `main` triggers an automatic redeploy.

---

### Why `vercel.json` Is Required

MediaPipe's WASM runtime uses `SharedArrayBuffer` for multi-threaded inference. Browsers only permit this on pages served with these two HTTP headers:

```
Cross-Origin-Opener-Policy: same-origin
Cross-Origin-Embedder-Policy: credentialless
```

`credentialless` (rather than the stricter `require-corp`) is used so the app can still load resources from Google Fonts and the MediaPipe model from Google Cloud Storage — those CDNs don't need to set their own `Cross-Origin-Resource-Policy` headers for this to work.

Vercel applies these headers on every response via `vercel.json`. Without them the model still loads (falls back to single-threaded WASM), but with them you get full multi-core performance.

---

## Browser Support

| Browser | Support | Notes |
|---|---|---|
| Chrome 96+ | ✅ Full | Best performance; GPU inference |
| Edge 96+ | ✅ Full | Chromium-based |
| Firefox 119+ | ✅ Full | |
| Safari 17+ | ✅ Full | iOS Safari supported |
| Safari < 17 | ⚠️ Partial | `credentialless` COEP not supported; graceful fallback |
| Opera / Brave | ✅ Full | Chromium-based |

**Requirements:** HTTPS or `localhost`, camera permission, JavaScript enabled.

---

## Troubleshooting

**"Camera permission denied"**
Click the camera icon in your browser's address bar, allow access, and refresh the page.

**"No camera detected"**
Make sure a webcam is connected. On laptops, verify the camera isn't disabled in Device Manager (Windows) or System Preferences (macOS).

**"Camera is in use by another app"**
Close any other app using the camera (Zoom, Teams, OBS, etc.) and refresh.

**"GPU unavailable — switching to CPU mode"**
Not an error. The app automatically falls back to CPU inference. Performance may be slightly lower (~20–30 FPS vs ~45–60 FPS on GPU).

**Hand not detected / flickering**
Ensure good lighting on your hand. Avoid dark backgrounds or strong backlight. Lower the **Gesture Confidence** slider if detection is missing your hand.

**Eldritch Shield doesn't appear**
Open your palm fully flat toward the camera with fingers spread wide. A partially closed fist won't trigger it.

**Sling Portal doesn't appear**
Switch to the Sling Portal spell first (key `3`), then raise **both hands** into frame simultaneously.

**Running in Chrome from a local file**
Use `python3 -m http.server 8080` and open `http://localhost:8080` — Chrome blocks `getUserMedia` on `file://` URLs.

---

## License

MIT — free to use, modify, and deploy.
