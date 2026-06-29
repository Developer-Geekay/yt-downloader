'use strict';
const http = require('http');
const fs   = require('fs');
const path = require('path');
const { randomBytes } = require('crypto');

const config = require('./config');
const { getDb }  = require('./db');
const { checkAuth } = require('./auth');
const { getDownloadOptions, downloadVideo } = require('./downloader');

// ── Helpers ───────────────────────────────────────────────────────────────────

function json(res, status, data) {
  const body = JSON.stringify(data);
  res.writeHead(status, { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) });
  res.end(body);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let raw = '';
    req.on('data', chunk => { raw += chunk; });
    req.on('end', () => {
      if (!raw) return resolve({});
      try { resolve(JSON.parse(raw)); } catch { reject(new Error('Invalid JSON')); }
    });
    req.on('error', reject);
  });
}

const WEB_ORIGIN = 'http://localhost:4200';

function corsHeaders(req) {
  const reqOrigin = req.headers['origin'] || '';

  if (config.IS_ELECTRON_MODE) {
    // Electron: renderer is a local file/localhost — wildcard is safe, no credentials needed
    return {
      'Access-Control-Allow-Origin':  '*',
      'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    };
  }

  // Web mode: only allow the known dev-server origin, never reflect arbitrary origins
  const allowed = reqOrigin === WEB_ORIGIN;
  return {
    'Access-Control-Allow-Origin':      WEB_ORIGIN,
    'Vary':                             'Origin',
    'Access-Control-Allow-Methods':     'GET, POST, DELETE, OPTIONS',
    'Access-Control-Allow-Headers':     'Content-Type, Authorization',
    ...(allowed ? { 'Access-Control-Allow-Credentials': 'true' } : {}),
  };
}

// ── Route handlers ────────────────────────────────────────────────────────────

async function handleHealth(req, res) {
  json(res, 200, { status: 'ok' });
}

async function handleOptions(req, res) {
  const body = await readBody(req);
  if (!body.url) return json(res, 422, { detail: 'url is required' });
  // Clean up stale options from abandoned fetches before inserting new ones
  getDb().prepare('DELETE FROM options WHERE options_id NOT IN (SELECT options_id FROM options ORDER BY rowid DESC LIMIT 5)').run();
  const result = await getDownloadOptions(body.url);
  json(res, 200, result);
}

async function handleDownload(req, res) {
  const body = await readBody(req);
  const { url, options_id, option, title, thumbnail, subtitles } = body;
  if (!url || !options_id || !option) return json(res, 422, { detail: 'url, options_id and option are required' });

  const db = getDb();
  const row = db.prepare('SELECT format_id FROM options WHERE options_id=? AND option_key=?').get(options_id, option);
  if (!row) return json(res, 400, { detail: 'Invalid download option' });

  const formatId = row.format_id;
  const jobId    = randomBytes(16).toString('hex');

  db.prepare("INSERT INTO jobs (id, url, title, thumbnail, status) VALUES (?, ?, ?, ?, 'queued')").run(jobId, url, title || null, thumbnail || null);
  db.prepare('DELETE FROM options WHERE options_id=?').run(options_id);

  // Fire and forget — don't await
  downloadVideo(jobId, url, formatId, !!subtitles).catch(err => {
    try {
      getDb().prepare("UPDATE jobs SET status='error', error=? WHERE id=?").run(err.message, jobId);
    } catch (_) {}
  });

  json(res, 200, { job_id: jobId, status: 'started' });
}

async function handleProgress(req, res, jobId) {
  const db  = getDb();
  const job = db.prepare('SELECT * FROM jobs WHERE id=?').get(jobId);
  if (!job) return json(res, 404, { detail: 'Job not found' });
  json(res, 200, job);
}

async function handleCancel(req, res, jobId) {
  getDb().prepare("UPDATE jobs SET status='cancelled' WHERE id=?").run(jobId);
  json(res, 200, { status: 'cancelled' });
}

async function handleGetFile(req, res, jobId) {
  const db  = getDb();
  const job = db.prepare('SELECT filename FROM jobs WHERE id=?').get(jobId);
  if (!job || !job.filename) return json(res, 404, { detail: 'File not found' });

  const filePath = path.join(config.DOWNLOAD_DIR, job.filename);
  if (!fs.existsSync(filePath)) return json(res, 404, { detail: 'File not found on disk' });

  const stat = fs.statSync(filePath);
  res.writeHead(200, {
    'Content-Type':        'application/octet-stream',
    'Content-Length':      stat.size,
    'Content-Disposition': `attachment; filename="${path.basename(filePath)}"`,
  });
  fs.createReadStream(filePath).pipe(res);
}

async function handleHistory(req, res) {
  const db   = getDb();
  const jobs = db.prepare(
    "SELECT * FROM jobs WHERE status IN ('finished','error','cancelled') ORDER BY created_at DESC"
  ).all();
  json(res, 200, jobs);
}

async function handleActiveJobs(req, res) {
  const db   = getDb();
  const jobs = db.prepare(
    "SELECT * FROM jobs WHERE status IN ('queued','downloading') ORDER BY created_at ASC"
  ).all();
  json(res, 200, jobs);
}

async function handleGetFilePath(req, res, jobId) {
  const db  = getDb();
  const job = db.prepare('SELECT filename FROM jobs WHERE id=?').get(jobId);
  if (!job || !job.filename) return json(res, 404, { detail: 'File not found' });
  const filePath = path.join(config.DOWNLOAD_DIR, job.filename);
  json(res, 200, { path: filePath });
}

async function handleDeleteHistory(req, res) {
  getDb().prepare("DELETE FROM jobs WHERE status IN ('finished','error','cancelled')").run();
  json(res, 200, { status: 'success' });
}

async function handleDeleteJob(req, res, jobId) {
  const db  = getDb();
  const job = db.prepare('SELECT filename FROM jobs WHERE id=?').get(jobId);

  if (job?.filename) {
    const filePath = path.join(config.DOWNLOAD_DIR, job.filename);
    try { if (fs.existsSync(filePath)) fs.unlinkSync(filePath); } catch (_) {}
  }

  db.prepare('DELETE FROM jobs WHERE id=?').run(jobId);
  json(res, 200, { status: 'deleted' });
}

// ── Router ────────────────────────────────────────────────────────────────────

const server = http.createServer(async (req, res) => {
  const cors = corsHeaders(req);

  // Preflight
  if (req.method === 'OPTIONS') {
    res.writeHead(204, cors);
    return res.end();
  }

  // Attach CORS to all responses
  Object.entries(cors).forEach(([k, v]) => res.setHeader(k, v));

  const urlPath = req.url.split('?')[0];
  const method  = req.method;

  try {
    // Public routes (no auth)
    if (method === 'GET'  && urlPath === '/health')                  return await handleHealth(req, res);

    // Capture job-id segment from /api/progress/:id etc.
    const progressMatch  = urlPath.match(/^\/api\/progress\/([a-f0-9]+)$/);
    const fileMatch      = urlPath.match(/^\/api\/file\/([a-f0-9]+)$/);
    const filepathMatch  = urlPath.match(/^\/api\/filepath\/([a-f0-9]+)$/);
    const cancelMatch    = urlPath.match(/^\/api\/cancel\/([a-f0-9]+)$/);
    const jobMatch       = urlPath.match(/^\/api\/job\/([a-f0-9]+)$/);

    if (method === 'GET'  && fileMatch)  return await handleGetFile(req, res, fileMatch[1]);

    // Auth-protected routes
    if (!checkAuth(req)) {
      res.setHeader('WWW-Authenticate', 'Basic realm="Video Downloader"');
      return json(res, 401, { detail: 'Unauthorized' });
    }

    if (method === 'POST'   && urlPath === '/api/options')           return await handleOptions(req, res);
    if (method === 'POST'   && urlPath === '/api/download')          return await handleDownload(req, res);
    if (method === 'GET'    && progressMatch)                        return await handleProgress(req, res, progressMatch[1]);
    if (method === 'GET'    && filepathMatch)                        return await handleGetFilePath(req, res, filepathMatch[1]);
    if (method === 'POST'   && cancelMatch)                          return await handleCancel(req, res, cancelMatch[1]);
    if (method === 'GET'    && urlPath === '/api/history')           return await handleHistory(req, res);
    if (method === 'GET'    && urlPath === '/api/active')            return await handleActiveJobs(req, res);
    if (method === 'DELETE' && urlPath === '/api/history')           return await handleDeleteHistory(req, res);
    if (method === 'DELETE' && jobMatch)                             return await handleDeleteJob(req, res, jobMatch[1]);

    json(res, 404, { detail: 'Not found' });
  } catch (err) {
    json(res, 400, { detail: err.message });
  }
});

const PORT = config.PORT;
server.listen(PORT, '127.0.0.1', () => {
  console.log(`Backend listening on http://127.0.0.1:${PORT}`);
});

server.on('error', (err) => {
  console.error('Server error:', err.message);
  process.exit(1);
});
