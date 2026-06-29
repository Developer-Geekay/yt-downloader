# StreamFlow

A self-hosted video downloader with a modern UI, real-time progress tracking, and download history. Runs as a standalone desktop app (Electron) or as a local web app.

Built with **Angular 21**, **Node.js**, and **yt-dlp**. Bundles its own Node.js runtime, yt-dlp, and FFmpeg — no external tools need to be installed.

## Features

- Clean Material Design UI with Tailwind CSS v4
- Paste URL → auto-parse formats → one-click download
- Real-time progress, speed, and ETA
- Download cancellation
- Persisted history with Show in Finder/Explorer
- Each download isolated in its own folder

## Technology Stack

| Layer | Stack |
|---|---|
| Desktop shell | Electron 35 |
| Frontend | Angular 21, Tailwind CSS v4, Signals |
| Backend | Node.js 22 (built-in `node:http`, `node:sqlite`), yt-dlp |
| Bundled tools | Node.js v22, yt-dlp, FFmpeg |

## Prerequisites

Only **Node.js v18+** is required on the host machine. Node.js runtime, yt-dlp, and FFmpeg are all downloaded automatically by the setup script.

- [Download Node.js](https://nodejs.org/)

---

## Development

### First-time setup

```bash
npm install
npm run setup
cd frontend/yt-interface && npm install && cd ../..
```

`npm run setup` downloads Node.js v22, yt-dlp, and FFmpeg into `resources/`. Downloads are cached in `cache/` — subsequent runs are instant.

### Running in dev mode (hot reload)

Open three terminals:

```bash
# Terminal 1 — Node.js backend (http://localhost:8000)
npm run dev:backend

# Terminal 2 — Angular dev server (http://localhost:4200)
npm run dev:frontend

# Terminal 3 — Electron (loads from :4200, hot reloads on frontend changes)
npm run dev:electron:live
```

> Backend changes need a manual restart of Terminal 1. Or kill port 8000 and Electron's BackendManager will auto-restart it.

### Running in web mode (browser only)

```bash
npm run dev:backend    # Terminal 1
npm run dev:frontend   # Terminal 2
```

Open `http://localhost:4200`. Default credentials: `admin` / `change_this_password` (override with `VD_USER` / `VD_PASS` env vars).

### Build frontend then launch Electron

```bash
npm run dev:electron
```

---

## Production Builds

### Releasing a new version

```bash
git tag v1.2.0
git push origin v1.2.0
```

This triggers the GitHub Actions workflow which:
1. Bundles FFmpeg, yt-dlp, and Node.js v22 (correct binary per platform/arch)
2. Builds the Angular frontend
3. Packages with `electron-builder` and publishes to GitHub Releases

### Building locally

```bash
npm run setup         # if not already done
npm run dist:mac      # or dist:win / dist:linux
```

Output goes to `release/`.

### Platform outputs

| Platform | Runner | Output |
|---|---|---|
| Windows | `windows-latest` | `.exe` (NSIS installer) + portable `.exe` |
| macOS | `macos-latest` | `.dmg` |
| Linux | `ubuntu-latest` | `.AppImage` + `.deb` |

### macOS signing and notarization

Without signing, Gatekeeper will warn on install. Users can right-click → Open to bypass. For seamless installs, add these as GitHub repo secrets:

| Secret | Description |
|---|---|
| `CSC_LINK` | Base64-encoded `.p12` certificate: `base64 -i cert.p12` |
| `CSC_KEY_PASSWORD` | Password for the `.p12` |
| `APPLE_ID` | Apple ID email (requires Apple Developer account) |
| `APPLE_APP_SPECIFIC_PASSWORD` | App-specific password from appleid.apple.com |
| `APPLE_TEAM_ID` | 10-character team ID from developer.apple.com |

---

## Configuration

| Variable | Default | Description |
|---|---|---|
| `VD_USER` | `admin` | Basic auth username |
| `VD_PASS` | `change_this_password` | Basic auth password |
| `VD_DOWNLOAD_DIR` | `~/Downloads/VideoDownloader` | Where finished files are stored |
| `VD_TEMP_DIR` | system temp | yt-dlp cache dir |
| `VD_DB_PATH` | `data/app.db` | SQLite database path |

In Electron mode these are configured through the first-run setup wizard and persisted to the OS user-data directory.

---

## Usage

1. Paste a video URL — click **Paste** to auto-fill from clipboard
2. Wait for formats to parse automatically
3. Select a format (Video + Audio, Video Only, or Audio Only) and quality
4. Click **Start Download**
5. Track progress in the Queue view
6. Use the folder icon in History/Library to reveal the file in Finder/Explorer
