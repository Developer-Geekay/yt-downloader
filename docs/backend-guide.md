# Backend Guide — Private Video Downloader

## Overview

The backend is a **Python FastAPI** application that wraps **yt-dlp** to provide a REST API for fetching video metadata, downloading media, tracking progress, and managing download history. Data is persisted in a local **SQLite** database.

---

## Technology Stack

| Technology | Version | Purpose |
|---|---|---|
| Python | 3.10+ | Runtime |
| FastAPI | 0.126.0 | REST API framework |
| Uvicorn | 0.38.0 | ASGI server |
| yt-dlp | 2025.12.8 | Video extraction & download engine |
| SQLite | Built-in | Local database |
| Pydantic | 2.12.5 | Request/response validation |

---

## Project Structure

```
backend/
├── app/
│   ├── main.py              # FastAPI app, routes, CORS, startup
│   ├── downloader.py         # yt-dlp integration (options + download)
│   ├── config.py             # App constants & environment variables
│   ├── db.py                 # SQLite connection & schema initialization
│   ├── auth.py               # HTTP Basic Authentication
│   ├── models.py             # Pydantic request models
│   ├── jobs.py               # In-memory job store (legacy, unused)
│   └── supported_sites.py    # yt-dlp supported site extraction
├── data/                     # SQLite database (app.db)
├── downloads/                # Downloaded files storage
├── .ytenv/                   # Virtual environment
└── requirements.txt          # Python dependencies
```

---

## Configuration (`config.py`)

| Variable | Env Var | Default | Description |
|---|---|---|---|
| `APP_NAME` | — | `Private Video Downloader` | Application display name |
| `BASIC_AUTH_USERNAME` | `VD_USER` | `admin` | HTTP Basic Auth username |
| `BASIC_AUTH_PASSWORD` | `VD_PASS` | `change_this_password` | HTTP Basic Auth password |
| `MAX_VIDEO_DURATION_SEC` | — | `7200` (2 hours) | Max allowed video duration |
| `DB_PATH` | — | `data/app.db` | SQLite database file path |
| `DOWNLOAD_DIR` | — | `downloads` | Root directory for saved files |

---

## Database Schema (`db.py`)

### `jobs` Table
| Column | Type | Description |
|---|---|---|
| `id` | TEXT (PK) | UUID hex string |
| `url` | TEXT | Source video URL |
| `status` | TEXT | `queued` / `downloading` / `finished` / `error` / `cancelled` |
| `progress` | TEXT | Download percentage (e.g. `45.2%`) |
| `speed` | TEXT | Download speed (e.g. `1.2MiB/s`) |
| `eta` | TEXT | Estimated time remaining |
| `error` | TEXT | Error message if failed |
| `cancelled` | INTEGER | Legacy cancellation flag |
| `filename` | TEXT | Relative path to downloaded file |
| `created_at` | DATETIME | Auto-generated timestamp |

### `options` Table
| Column | Type | Description |
|---|---|---|
| `options_id` | TEXT (PK) | Groups options for one fetch request |
| `option_key` | TEXT (PK) | Deduplicated format key (e.g. `va_1080`) |
| `format_id` | TEXT | yt-dlp internal format identifier |

---

## Authentication (`auth.py`)

- Uses **HTTP Basic Authentication** via FastAPI's `HTTPBasic` security scheme.
- Credentials are compared using `secrets.compare_digest` (timing-safe).
- All API endpoints (except `/health` and `/api/file/{job_id}`) require authentication.

---

## API Endpoints (`main.py`)

### `GET /health`
Health check. Returns `{"status": "ok"}`. **No auth required.**

### `POST /api/options`
Fetches available download formats for a given URL.
- **Body**: `{ "url": "https://..." }`
- **Returns**: `{ options_id, title, duration, video_audio[], video_only[], audio[] }`
- **Logic**: Validates URL, extracts info via yt-dlp, deduplicates formats by resolution/bitrate, stores mappings in `options` table.

### `POST /api/download`
Starts a background download job.
- **Body**: `{ "url": "...", "options_id": "...", "option": "va_1080" }`
- **Returns**: `{ "job_id": "...", "status": "started" }`
- **Logic**: Looks up real `format_id` from options table, creates job record, cleans up options, launches background task.

### `GET /api/progress/{job_id}`
Returns current status of a download job.
- **Returns**: Full job row as JSON (status, progress, speed, eta, error, filename).

### `POST /api/cancel/{job_id}`
Cancels an active download by setting status to `cancelled`.
- The download hook checks for cancellation on each progress update and raises an exception to stop yt-dlp.

### `GET /api/file/{job_id}`
Serves the downloaded file. **No auth required** (direct download link).
- Returns file as `application/octet-stream` with proper filename header.

### `GET /api/history`
Returns all finished jobs ordered by ID descending.

### `DELETE /api/job/{job_id}`
Deletes a job and its associated file from disk.
- Tries to remove the isolated job directory first (`downloads/{job_id}/`).
- Falls back to removing individual file for legacy flat-structure downloads.

---

## Download Engine (`downloader.py`)

### Format Fetching
1. Validates URL against all yt-dlp extractors.
2. Extracts video info without downloading.
3. Enforces max duration limit (2 hours).
4. Categorizes formats into three groups:
   - **Video + Audio** (`va_{height}`) — combined streams
   - **Video Only** (`vo_{height}`) — video-only streams
   - **Audio Only** (`a_{bitrate}`) — audio-only streams
5. Deduplicates by resolution/bitrate key.

### Download Process
1. Each download is **sandboxed** in its own folder: `downloads/{job_id}/`.
2. Uses `restrictfilenames` and `windowsfilenames` for cross-platform safety.
3. Forces `mp4` output via `merge_output_format`.
4. Progress hook updates SQLite with percentage, speed, and ETA (ANSI codes stripped).
5. Hook checks for cancellation on each update — raises exception to abort.
6. On completion, stores relative path `{job_id}/{filename}.mp4` in database.
7. On error, preserves `cancelled` status if user-initiated.

---

## Features Summary

- ✅ URL validation against all yt-dlp supported sites
- ✅ Smart format deduplication (video+audio, video-only, audio-only)
- ✅ Background downloads with real-time progress tracking
- ✅ Download cancellation support
- ✅ Isolated download directories (no file conflicts)
- ✅ File serving for browser download
- ✅ Download history with persistence
- ✅ File deletion with disk cleanup
- ✅ HTTP Basic Authentication
- ✅ CORS configured for local Angular dev server
- ✅ ANSI code stripping from yt-dlp output
- ✅ Max video duration enforcement (2 hours)

---

## Running the Backend

```bash
cd backend
python -m venv .venv
.venv\Scripts\activate          # Windows
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
```

The API will be available at `http://localhost:8000`. Interactive docs at `/docs`.
