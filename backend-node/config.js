'use strict';
const fs   = require('fs');
const path = require('path');

const PROJECT_ROOT = path.join(__dirname, '..');
const isWin = process.platform === 'win32';

function findBinary(envVar, subdir, binaryName, fallback) {
  const envPath = process.env[envVar];
  if (envPath && fs.existsSync(envPath)) return envPath;

  const bundled = path.join(PROJECT_ROOT, 'resources', subdir, binaryName);
  if (fs.existsSync(bundled)) return bundled;

  // Recursive search inside resources/<subdir> (handles archive subdirs)
  const dir = path.join(PROJECT_ROOT, 'resources', subdir);
  if (fs.existsSync(dir)) {
    const found = walkFind(dir, binaryName);
    if (found) return found;
  }

  return fallback ?? null;
}

function walkFind(dir, name) {
  try {
    for (const entry of fs.readdirSync(dir)) {
      const full = path.join(dir, entry);
      if (fs.statSync(full).isDirectory()) {
        const found = walkFind(full, name);
        if (found) return found;
      } else if (entry === name) {
        return full;
      }
    }
  } catch (_) {}
  return null;
}

const DOWNLOAD_DIR = process.env.VD_DOWNLOAD_DIR || path.join(__dirname, '..', 'backend', 'downloads');
const TEMP_DIR     = process.env.VD_TEMP_DIR     || path.join(__dirname, '..', 'backend', 'temp');
const DB_PATH      = process.env.VD_DB_PATH      || path.join(__dirname, '..', 'backend', 'data', 'app.db');

// Ensure required directories exist
for (const dir of [DOWNLOAD_DIR, TEMP_DIR, path.dirname(DB_PATH)]) {
  fs.mkdirSync(dir, { recursive: true });
}

module.exports = {
  IS_ELECTRON_MODE: process.env.ELECTRON_MODE === 'true',
  AUTH_USER:        process.env.VD_USER || 'admin',
  AUTH_PASS:        process.env.VD_PASS || 'change_this_password',
  PORT:             parseInt(process.env.ELECTRON_PORT || '8000', 10),
  DOWNLOAD_DIR,
  TEMP_DIR,
  DB_PATH,
  FFMPEG_LOCATION: findBinary('FFMPEG_LOCATION', 'ffmpeg', isWin ? 'ffmpeg.exe' : 'ffmpeg', 'ffmpeg'),
  YTDLP_BINARY:    findBinary('YTDLP_BINARY',    'yt-dlp', isWin ? 'yt-dlp.exe' : 'yt-dlp',  'yt-dlp'),
  NODE_BINARY:     findBinary('NODE_BINARY',      'node',   isWin ? 'node.exe'   : 'node',     null),
};
