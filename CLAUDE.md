# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

A self-hosted video downloader desktop app. Three integrated layers:
- **Backend**: Node.js HTTP server + yt-dlp serving a REST API (zero npm dependencies)
- **Frontend**: Angular 21 SPA (Signals-based, Tailwind CSS v4)
- **Electron**: Wraps both into a cross-platform desktop app

## First-time setup (one command)

```bash
npm install
npm run setup
cd frontend/yt-interface && npm install && cd ../..
```

`npm run setup` runs `bundle-ffmpeg.js`, `bundle-ytdlp.js`, and `bundle-node.js`. It downloads:
- A standalone Node.js v22 binary to `resources/node/`
- A standalone yt-dlp binary to `resources/yt-dlp/`
- An FFmpeg static binary to `resources/ffmpeg/`

All cached in `cache/` so subsequent runs are instant. No system Python, pip, or external tools needed.

## Development Commands

### Backend
```bash
npm run dev:backend          # starts backend/server.js on port 8000
```

### Frontend (run from `frontend/yt-interface/`)
```bash
npm start          # dev server at localhost:4200
npm run build      # production build
```

### Electron
```bash
npm run dev:frontend          # terminal 1: Angular at :4200
npm run dev:electron:live     # terminal 2: Electron loads from :4200 (hot reload)

npm run dev:electron          # build frontend then launch Electron
npm run dist:mac              # package for distribution (or dist:win, dist:linux)
```

## Architecture

### Backend (`backend/`)
- `server.js` — pure `node:http` server, all routes, zero npm dependencies
- `config.js` — paths, env vars, binary discovery. Reads `ELECTRON_MODE`, `VD_USER`, `VD_PASS`, `VD_DOWNLOAD_DIR`, `VD_TEMP_DIR`, `VD_DB_PATH`
- `downloader.js` — spawns `resources/yt-dlp/yt-dlp` via `child_process`. `getDownloadOptions()` fetches formats, `downloadVideo()` runs fire-and-forget with DB-polled cancellation
- `db.js` — `node:sqlite` (built-in Node.js 22). Tables: `jobs`, `options`
- `auth.js` — HTTP Basic Auth via env vars

Each download is isolated in `DOWNLOAD_DIR/{job_id}/`. Progress tracked by polling `/api/progress/{job_id}` every 2s from the frontend.

### Frontend (`frontend/yt-interface/src/app/`)
- Angular Signals throughout — no NgRx, no Observables for state
- `core/api.service.ts` — Single HTTP service. Detects Electron via `window.electronAPI?.isElectron` and fetches backend port dynamically via IPC
- `core/auth.interceptor.ts` — Attaches Basic Auth headers
- `pages/downloader/` — Main page: URL input → fetch formats → select → download → progress poll → history
- `pages/settings/` — App settings page

Routes: `/` (downloader), `/setup`, `/settings`

### Electron (`electron/`)
- `main.js` — App lifecycle, BrowserWindow, system tray, IPC handlers
- `backend.js` — `BackendManager`: spawns `resources/node/node backend/server.js`, finds available port starting at 8000, polls `/health` until ready, auto-restarts on crash (up to 3 retries)
- `preload.js` — Context bridge exposing `window.electronAPI` to the renderer (sandboxed)
- `config.js` — `ConfigManager`: persists user config to `userData`

**Binary discovery order** (in `backend/config.js` `findBinary()`):
1. Env var override
2. `resources/<subdir>/<binary>` (bundled)
3. Recursive walk inside `resources/<subdir>/`
4. System PATH fallback

### Two run modes
1. **Web mode**: Backend at `localhost:8000`, Angular dev server at `localhost:4200`. Auth via `VD_USER`/`VD_PASS` env vars (default: `admin`/`change_this_password`).
2. **Electron mode**: `ELECTRON_MODE=true` set by `BackendManager`. CORS opens to `*`. Backend port is dynamic (8000+). Frontend gets port via `window.electronAPI.getBackendPort()`.

## Key Data Flow

1. User pastes URL → `POST /api/options` → yt-dlp `--dump-json` extracts formats → stored in `options` table with `options_id`
2. User selects format → `POST /api/download` → looks up `format_id` from `options` → creates job → spawns yt-dlp in background
3. Frontend polls `GET /api/progress/{job_id}` every 2s → on `finished`, removes from active jobs, refreshes history
4. File revealed via `GET /api/filepath/{job_id}` → `shell.showItemInFolder()` IPC (Electron)

## Key Implementation Notes

- `node:sqlite` (built-in, no npm package) — returns null-prototype objects; `JSON.stringify` handles them fine
- `NODE_NO_WARNINGS=1` suppresses the node:sqlite experimental warning
- yt-dlp 2026.06.09 uses `--force-overwrites` (not `--overwrites`)
- yt-dlp sends `--progress-template` output to **stderr** in recent versions — parse both stdout and stderr
- `--` end-of-options marker before URL prevents argument injection
- Fire-and-forget download: `downloadVideo(...).catch(...)` without await in request handler
- History returns `finished`, `error`, and `cancelled` jobs (all non-active)

## Packaging

`electron-builder` config is in root `package.json`. Output goes to `release/`.

Key config:
- `files` includes `backend/**/*`, `resources/ffmpeg/**/*`, `resources/yt-dlp/**/*`, `resources/node/**/*`
- `asarUnpack` excludes those same paths so binaries run as real files
- In packaged mode `backend.js` resolves from `process.resourcesPath/app.asar.unpacked/`

CI (`build.yml`) runs `bundle-ffmpeg.js` + `bundle-ytdlp.js` + `bundle-node.js` for all platforms.
