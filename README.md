# Private Video Downloader

A self-hosted video downloader with a modern UI, real-time progress tracking, and download history. Runs as a standalone desktop app (Electron) or as a local web app.

Built with **Angular 21**, **FastAPI**, and **yt-dlp**. Bundles its own Python and FFmpeg — no external tools need to be installed by the user.

## Features

- Glassmorphism dark UI with Tailwind CSS v4
- Fetches and deduplicates video/audio format options per URL
- Real-time progress, speed, and ETA
- Download cancellation and file deletion
- Each download isolated in its own folder
- Persisted history with direct file download links

## Technology Stack

| Layer | Stack |
|---|---|
| Desktop shell | Electron 35 |
| Frontend | Angular 21, Tailwind CSS v4, Signals |
| Backend | Python 3.12, FastAPI, uvicorn, yt-dlp, SQLite |
| Bundled tools | Python (python-build-standalone), FFmpeg (ffmpeg-static) |

## Prerequisites

Only **Node.js v18+** is required. Python and FFmpeg are downloaded automatically by the setup script.

- [Download Node.js](https://nodejs.org/)

---

## Development

### First-time setup

Run once from the project root. Downloads Python 3.12 and FFmpeg into `resources/`, installs all backend pip packages inside the bundled Python.

```bash
npm install
npm run setup
```

> Downloads are cached in `cache/` — subsequent runs are instant.

### Running in web mode (browser)

Start the backend and frontend in separate terminals:

```bash
# Terminal 1 — FastAPI backend (http://localhost:8000)
npm run dev:backend

# Terminal 2 — Angular dev server (http://localhost:4200)
npm run dev:frontend
```

Open `http://localhost:4200` in your browser.

Default credentials: `admin` / `change_this_password`
Override with env vars: `VD_USER` and `VD_PASS`

### Running as an Electron desktop app

**Option A — hot reload** (Angular dev server + Electron, frontend changes reflect instantly):

```bash
# Terminal 1
npm run dev:frontend

# Terminal 2 — once Angular is ready at :4200
npm run dev:electron:live
```

**Option B — production build + Electron** (slower start, no hot reload):

```bash
npm run dev:electron
```

---

## Production Builds

Builds are produced by GitHub Actions on every version tag push. All three platforms are built in parallel on native runners — no cross-compilation.

### Releasing a new version

```bash
git tag v1.2.0
git push origin v1.2.0
```

This triggers the workflow which:
1. Downloads and bundles Python 3.12 (standalone, no system Python needed)
2. Bundles FFmpeg via `ffmpeg-static` (correct binary per platform/arch)
3. Builds the Angular frontend
4. Packages with `electron-builder` and publishes to GitHub Releases

### Platform outputs

| Platform | Runner | Output |
|---|---|---|
| Windows | `windows-latest` | `.exe` (NSIS installer) + portable `.exe` |
| macOS | `macos-latest` (Apple Silicon) | `.dmg` |
| Linux | `ubuntu-latest` | `.AppImage` + `.deb` |

### macOS signing and notarization

Without signing, macOS Gatekeeper will show a warning on install. The app still works — users can right-click → Open to bypass it. For seamless installs, add these as GitHub repo secrets (`Settings → Secrets and variables → Actions`):

| Secret | Description |
|---|---|
| `CSC_LINK` | Base64-encoded `.p12` certificate: `base64 -i cert.p12` |
| `CSC_KEY_PASSWORD` | Password for the `.p12` |
| `APPLE_ID` | Apple ID email (requires Apple Developer account) |
| `APPLE_APP_SPECIFIC_PASSWORD` | App-specific password from appleid.apple.com |
| `APPLE_TEAM_ID` | 10-character team ID from developer.apple.com |

The workflow passes these to `electron-builder` automatically. If the secrets are absent, the build succeeds but skips signing and notarization.

### Building locally

```bash
npm run setup           # bundle Python + FFmpeg (if not done already)
npm run dist:mac        # or dist:win / dist:linux
```

Output goes to `release/`.

---

## Configuration

| Variable | Default | Description |
|---|---|---|
| `VD_USER` | `admin` | Basic auth username |
| `VD_PASS` | `change_this_password` | Basic auth password |
| `VD_DOWNLOAD_DIR` | `backend/downloads/` | Where finished files are stored |
| `VD_TEMP_DIR` | `backend/temp/` | yt-dlp cache dir |
| `VD_DB_PATH` | `backend/data/app.db` | SQLite database path |

In Electron mode these are configured through the first-run setup wizard and persisted to the OS user-data directory.

## Usage

1. Paste a video URL and press Enter
2. Select a format from the dropdown (combined video+audio, video only, or audio only)
3. Click **Start Download**
4. Track progress in the active jobs panel
5. Use the download icon to save the file, trash icon to delete it
