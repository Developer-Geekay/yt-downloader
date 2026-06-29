'use strict';
const { spawn }  = require('child_process');
const { randomBytes } = require('crypto');
const fs   = require('fs');
const path = require('path');
const config = require('./config');
const { getDb } = require('./db');

const _activeProcs = new Map();
const _PROGRESS_RE = /\[PROG\](\w+)\|([^|]+)\|([^|]+)\|([^\n]+)/;

// ── Helpers ──────────────────────────────────────────────────────────────────

function clean(msg) {
  return (msg || '')
    .replace(/\x1B\[[0-?]*[ -/]*[@-~]/g, '')   // ANSI codes
    .replace(/^ERROR:\s*/gm, '')                  // yt-dlp "ERROR:" prefix
    .split(/;\s*please report this issue/i)[0]
    .trim();
}

function validateUrl(url) {
  if (!url || url.startsWith('-')) throw new Error('Invalid URL');
  let parsed;
  try { parsed = new URL(url); } catch { throw new Error('Invalid URL'); }
  if (!['http:', 'https:'].includes(parsed.protocol)) {
    throw new Error('Only http/https URLs are supported');
  }
}

function generateId() {
  return randomBytes(16).toString('hex');
}

function baseCmd() {
  const cmd = [config.YTDLP_BINARY];
  if (config.NODE_BINARY && fs.existsSync(config.NODE_BINARY)) {
    cmd.push('--js-runtimes', `node:${config.NODE_BINARY}`);
  }
  return cmd;
}

function runToCompletion(exe, args, timeoutMs = 120_000) {
  return new Promise((resolve) => {
    const proc = spawn(exe, args, { timeout: timeoutMs });
    let stdout = '', stderr = '';
    proc.stdout.on('data', d => { stdout += d; });
    proc.stderr.on('data', d => { stderr += d; });
    proc.on('close', code => resolve({ code, stdout, stderr }));
    proc.on('error', err => resolve({ code: 1, stdout: '', stderr: err.message }));
  });
}

// ── Public API ────────────────────────────────────────────────────────────────

async function getDownloadOptions(url) {
  validateUrl(url);

  const [exe, ...args] = [...baseCmd(), '--dump-json', '--no-playlist', '--quiet', '--no-warnings', '--', url];
  const { code, stdout, stderr } = await runToCompletion(exe, args);

  if (code !== 0) throw new Error(clean(stderr || stdout) || 'Failed to fetch video info');

  const raw = stdout.trim();
  if (!raw) throw new Error('No video info returned — URL may not be supported');

  let info;
  try { info = JSON.parse(raw); } catch { throw new Error('Failed to parse video info'); }


  const optionsId = generateId();
  const db = getDb();
  const insertOpt = db.prepare('INSERT OR IGNORE INTO options VALUES (?, ?, ?)');

  const thumbnail =
    info.thumbnail ||
    (Array.isArray(info.thumbnails) && info.thumbnails.length
      ? info.thumbnails[info.thumbnails.length - 1].url
      : null);

  const response = {
    options_id: optionsId,
    title:       info.title,
    duration:    info.duration,
    thumbnail,
    video_audio: [],
    video_only:  [],
    audio:       [],
  };

  const seen = new Set();
  for (const f of (info.formats || [])) {
    const { format_id: fid, vcodec, acodec, height, abr } = f;
    let key, label, category;

    if (vcodec !== 'none' && acodec !== 'none' && height) {
      key = `va_${height}`;  label = `${height}p`;                    category = 'video_audio';
    } else if (vcodec !== 'none' && acodec === 'none' && height) {
      key = `vo_${height}`;  label = `${height}p`;                    category = 'video_only';
    } else if (vcodec === 'none' && acodec !== 'none') {
      const kbps = Math.round(abr || 0);
      key = `a_${kbps}`;     label = `${kbps} kbps`;                 category = 'audio';
    } else {
      continue;
    }

    if (seen.has(key)) continue;
    seen.add(key);

    response[category].push({ id: key, label });
    insertOpt.run(optionsId, key, fid);
  }

  return response;
}

// Runs in the background — never awaited by the request handler.
async function downloadVideo(jobId, url, formatId) {
  if (!formatId || formatId.startsWith('-')) throw new Error(`Invalid formatId: ${formatId}`);
  validateUrl(url);

  const outdir = path.join(config.DOWNLOAD_DIR, jobId);
  fs.mkdirSync(outdir, { recursive: true });

  const outtmpl = path.join(outdir, '%(title).200s [%(id)s].%(ext)s');

  const [exe, ...args] = [
    ...baseCmd(),
    '--format',            formatId,
    '--output',            outtmpl,
    '--newline',
    '--no-playlist',
    '--restrict-filenames',
    '--windows-filenames',
    '--merge-output-format', 'mp4',
    '--no-continue',
    '--force-overwrites',
    '--ffmpeg-location',   config.FFMPEG_LOCATION,
    '--cache-dir',         config.TEMP_DIR,
    '--no-warnings',
    '--progress-template', '[PROG]%(progress.status)s|%(progress._percent_str)s|%(progress._speed_str)s|%(progress._eta_str)s',
    '--', url,
  ];

  const proc = spawn(exe, args, { stdio: ['ignore', 'pipe', 'pipe'] });
  _activeProcs.set(jobId, proc);

  const db = getDb();
  const updateProgress = db.prepare('UPDATE jobs SET status=?, progress=?, speed=?, eta=? WHERE id=?');
  const getStatus      = db.prepare('SELECT status FROM jobs WHERE id=?');

  // Poll DB once per second for cancellation
  const cancelTimer = setInterval(() => {
    const row = getStatus.get(jobId);
    if (row?.status === 'cancelled') {
      proc.kill('SIGTERM');
      clearInterval(cancelTimer);
    }
  }, 1000);

  const errorLines = [];

  // yt-dlp sends --progress-template output to stderr in recent versions.
  // Parse progress from both stdout and stderr; collect non-progress lines as errors.
  let buf = '';
  function processChunk(chunk) {
    buf += chunk.toString();
    const lines = buf.split('\n');
    buf = lines.pop();
    for (const line of lines) {
      const m = _PROGRESS_RE.exec(line);
      if (m) {
        const [, status, pct, speed, eta] = m;
        if (status === 'downloading') {
          updateProgress.run('downloading', pct.trim(), speed.trim(), eta.trim(), jobId);
        }
      } else if (line.trim() && !line.startsWith('[')) {
        errorLines.push(line.trim());
      }
    }
  }

  proc.stdout.on('data', processChunk);
  proc.stderr.on('data', processChunk);

  await new Promise(resolve => proc.on('close', resolve));
  clearInterval(cancelTimer);
  _activeProcs.delete(jobId);

  const current = getStatus.get(jobId);
  if (current?.status === 'cancelled') return;

  if (proc.exitCode !== 0) {
    const errMsg = clean(errorLines.join('\n')) || 'Download failed';
    db.prepare("UPDATE jobs SET status='error', error=? WHERE id=?").run(errMsg, jobId);
    return;
  }

  // Find the downloaded file (prefer .mp4, fallback to any file)
  let finalFile = null;
  if (fs.existsSync(outdir)) {
    const files = fs.readdirSync(outdir).filter(f => !f.startsWith('.'));
    if (files.length) {
      const mp4s = files.filter(f => f.toLowerCase().endsWith('.mp4'));
      finalFile  = path.join(outdir, mp4s.length ? mp4s[0] : files[0]);
    }
  }

  if (finalFile) {
    const relPath = `${jobId}/${path.basename(finalFile)}`;
    db.prepare("UPDATE jobs SET status='finished', progress='100%', filename=? WHERE id=?").run(relPath, jobId);
  } else {
    db.prepare("UPDATE jobs SET status='error', error='Output file not found' WHERE id=?").run(jobId);
  }
}

module.exports = { getDownloadOptions, downloadVideo };
