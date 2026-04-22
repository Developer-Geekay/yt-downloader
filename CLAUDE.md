# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

A self-hosted video downloader desktop app. Three integrated layers:
- **Backend**: Python FastAPI + yt-dlp serving a REST API
- **Frontend**: Angular 21 SPA (Signals-based, Tailwind CSS v4)
- **Electron**: Wraps both into a cross-platform desktop app

## First-time setup (one command, no external installs)

```bash
# Install Node deps, then download bundled Python + FFmpeg into resources/
npm install
npm run setup
```

`npm run setup` runs `scripts/bundle-ffmpeg.js` then `scripts/bundle-python.js`. It downloads:
- A standalone Python 3.12 distribution (python-build-standalone) to `resources/python/`
- pip-installs all `backend/requirements.txt` packages into that Python
- An FFmpeg static binary to `resources/ffmpeg/`

Both are cached in `cache/` so subsequent runs are instant. After setup, no system Python, pip, or FFmpeg is needed.

## Development Commands

### Backend
```bash
npm run dev:backend          # uses resources/python automatically; port 8000
```

### Frontend (run from `frontend/yt-interface/`)
```bash
npm install
npm start          # dev server at localhost:4200
npm run build      # production build
ng test            # run tests (uses Vitest)
```

### Electron (run from repo root)
```bash
npm install && npm run setup  # first time only

# Live dev (Angular dev server + Electron, hot reload)
npm run dev:frontend          # terminal 1: Angular at :4200
npm run dev:electron:live     # terminal 2: Electron loads from :4200

# Build frontend then launch Electron
npm run dev:electron

# Package for distribution
npm run dist:mac   # or dist:win, dist:linux
```

## Architecture

### Backend (`backend/app/`)
- `main.py` — FastAPI app, all routes defined here
- `config.py` — Central config: paths, env vars, Electron mode detection. Reads `ELECTRON_MODE`, `VD_USER`, `VD_PASS`, `VD_DOWNLOAD_DIR`, `VD_TEMP_DIR`, `VD_DB_PATH`
- `downloader.py` — yt-dlp integration: `get_download_options()` fetches formats, `download_video()` runs in a background task with a DB-polled cancellation hook
- `db.py` — SQLite (raw sqlite3, no ORM). Tables: `jobs`, `options`
- `auth.py` — HTTP Basic Auth via env vars
- `jobs.py` — Job model helpers

Each download is isolated in `DOWNLOAD_DIR/{job_id}/`. Progress is tracked by polling `/api/progress/{job_id}` every 2 seconds from the frontend.

### Frontend (`frontend/yt-interface/src/app/`)
- Angular Signals throughout — no NgRx, no Observables for state
- `core/api.service.ts` — Single HTTP service. Detects Electron via `window.electronAPI?.isElectron` and fetches the backend port dynamically via IPC
- `core/auth.interceptor.ts` — Attaches Basic Auth headers
- `pages/downloader/` — Main page: URL input → fetch formats → select → download → progress poll → history
- `pages/setup/` — First-run wizard (Electron only) for configuring download paths
- `pages/settings/` — App settings page

Routes: `/` (downloader), `/setup`, `/settings`

### Electron (`electron/`)
- `main.js` — App lifecycle, BrowserWindow, system tray, IPC handlers
- `backend.js` — `BackendManager`: spawns uvicorn as a child process, finds available port starting at 8000, polls `/health` until ready, auto-restarts on crash (up to 3 retries)
- `preload.js` — Context bridge exposing `window.electronAPI` to the renderer (sandboxed)
- `config.js` — `ConfigManager`: persists user config (download path, etc.) to disk

**Python discovery order** (in `BackendManager._findPython`): bundled `resources/python` → project venvs (`.ytenv`, `.venv`, `venv`) → system Python.

**FFmpeg discovery order** (in `config.py:find_binary`): bundled `resources/ffmpeg` → system PATH.

### Two run modes
1. **Web mode**: Backend at `localhost:8000`, Angular dev server at `localhost:4200`. Auth credentials via `VD_USER`/`VD_PASS` env vars (default: `admin`/`change_this_password`).
2. **Electron mode**: `ELECTRON_MODE=true` env var is set by `BackendManager`. CORS opens to `*`. Backend port is dynamic (8000+). Frontend gets port via `window.electronAPI.getBackendPort()`.

## Key Data Flow

1. User pastes URL → `POST /api/options` → backend calls `yt-dlp` to extract formats → stores format→format_id map in `options` table with `options_id`
2. User selects format → `POST /api/download` → looks up `format_id` from `options` table → creates job in `jobs` table → spawns background task
3. Frontend polls `GET /api/progress/{job_id}` every 2s → on `finished`, removes from active jobs, refreshes history
4. File served via `GET /api/file/{job_id}` (no auth required)

## Packaging

`electron-builder` config is in root `package.json`. Output goes to `release/`.

Key config:
- `files` includes `resources/ffmpeg/**` and `resources/python/**` (populated by `npm run setup`)
- `asarUnpack` excludes `backend/` and `resources/` from the ASAR archive so Python can execute them as real files
- In packaged mode `backend.js` detects the `.asar` path and resolves from `process.resourcesPath/app.asar.unpacked/`

CI (`build.yml`) runs `bundle-ffmpeg.js` + `bundle-python.js` for all platforms; no system Python is used.
