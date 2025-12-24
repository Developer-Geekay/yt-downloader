# 🎥 Private Video Downloader

A premium, self-hosted video downloader application featuring a modern Glassmorphism UI, progress tracking, and history management. Built with **Angular 21** and **FastAPI**.

## ✨ Features

- **Modern & Responsive UI**: Glassmorphism design with dark mode, animations, and Tailwind CSS v4.
- **Smart Options**: Fetches and deduplicates video/audio formats.
- **Progress Tracking**: Real-time download progress, speed, and ETA without ANSI clutter.
- **History Management**: 
  - Persists downloaded files list.
  - Automatically moves finished downloads to history.
  - Scrollable history view.
- **Robust File Handling**:
  - **Cancellation**: Cancel active downloads instantly.
  - **Deletion**: Delete files from disk and history (removes isolated job folders).
  - **Isolation**: Each download is sandboxed in its own folder to prevent conflicts.
- **File Serving**: Direct download link for finished files.

## 🛠️ Technology Stack

- **Frontend**: Angular v21, Tailwind CSS v4.1, Signals.
- **Backend**: Python 3.10+, FastAPI, yt-dlp, SQLite.

## 📋 Prerequisites

Before running the application, ensure you have the following installed:

1.  **Node.js** (v18+): [Download Here](https://nodejs.org/)
2.  **Python** (v3.10+): [Download Here](https://www.python.org/)
3.  **FFmpeg**: Required for merging video and audio.
    - **Windows**: [Download & Add to Path](https://ffmpeg.org/download.html)
    - **Linux**: `sudo apt install ffmpeg`
    - **MacOS**: `brew install ffmpeg`

## 🚀 Installation & Setup

### 1. Backend Setup

Navigate to the `backend` directory:

```bash
cd backend
```

Create a virtual environment:

```bash
# Windows
python -m venv .venv
.venv\Scripts\activate

# Linux/Mac
python3 -m venv .venv
source .venv/bin/activate
```

Install dependencies:

```bash
pip install -r requirements.txt
```

*(Note: If `requirements.txt` is missing, install manually: `pip install fastapi uvicorn yt-dlp`)*

### 2. Frontend Setup

Navigate to the `frontend/yt-interface` directory:

```bash
cd ../frontend/yt-interface
```

Install dependencies:

```bash
npm install
```

## ▶️ Running the Application

### 1. Start Support Backend

From the `backend` directory (with venv activated):

```bash
uvicorn app.main:app --reload --port 8000
```
*The backend API will run at `http://localhost:8000`*

### 2. Start Frontend

From the `frontend/yt-interface` directory:

```bash
npm start
```
*The application will run at `http://localhost:4200`*

## 📖 Usage Guide

1.  **Paste URL**: Enter a YouTube (or other supported) video URL.
2.  **Fetch Options**: Press Enter or click the fetch button.
3.  **Select Format**: Choose your desired quality from the dropdown.
4.  **Download**: Click "Start Download".
5.  **Manage**:
    - **Cancel**: Click the red X to stop an active download.
    - **Save**: Click the green download icon to save the file to your device.
    - **Delete**: Click the trash icon to remove the file and history entry.

## 🔒 Configuration

- **Download Directory**: Default is `backend/downloads/`.
- **Database**: Local SQLite DB at `backend/data/app.db`.
- **Authentication**: Usage of `VD_USER` and `VD_PASS` env variables is supported (default: `admin` / `change_this_password`).