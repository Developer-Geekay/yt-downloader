'use strict';
const { spawn } = require('child_process');
const path = require('path');
const net  = require('net');
const http = require('http');
const fs   = require('fs');

class BackendManager {
  constructor() {
    this.process     = null;
    this.port        = null;
    this._stopping   = false;
    this.maxRetries  = 3;
    this.retryCount  = 0;
    this._startConfig = null;
  }

  /** Resolve the project root whether inside an ASAR archive or in dev. */
  _getProjectRoot() {
    if (__dirname.includes('.asar')) {
      return path.join(process.resourcesPath, 'app.asar.unpacked');
    }
    return path.join(__dirname, '..');
  }

  /** Find the bundled Node.js binary. Falls back to the Electron host's node. */
  _findNode(projectRoot) {
    const isWin = process.platform === 'win32';
    const bundled = path.join(projectRoot, 'resources', 'node', isWin ? 'node.exe' : 'node');
    if (fs.existsSync(bundled)) return bundled;
    // Dev fallback: use the node that is running this Electron process
    // (Electron embeds node, but for spawning scripts we need a plain node)
    const systemNode = isWin ? 'node.exe' : 'node';
    return systemNode;
  }

  _findResource(projectRoot, subdir, binaryName, fallback = null) {
    const bundled = path.join(projectRoot, 'resources', subdir, binaryName);
    if (fs.existsSync(bundled)) return bundled;
    const dir = path.join(projectRoot, 'resources', subdir);
    if (fs.existsSync(dir)) {
      const found = this._findInDir(dir, binaryName);
      if (found) return found;
    }
    return fallback;
  }

  _findFFmpeg(projectRoot) {
    const n = process.platform === 'win32' ? 'ffmpeg.exe' : 'ffmpeg';
    return this._findResource(projectRoot, 'ffmpeg', n, 'ffmpeg');
  }

  _findYtdlp(projectRoot) {
    const n = process.platform === 'win32' ? 'yt-dlp.exe' : 'yt-dlp';
    return this._findResource(projectRoot, 'yt-dlp', n, 'yt-dlp');
  }

  _findInDir(dir, name) {
    try {
      for (const entry of fs.readdirSync(dir)) {
        const full = path.join(dir, entry);
        if (fs.statSync(full).isDirectory()) {
          const found = this._findInDir(full, name);
          if (found) return found;
        } else if (entry === name) return full;
      }
    } catch (_) {}
    return null;
  }

  async findAvailablePort(preferred = 8000) {
    return new Promise((resolve, reject) => {
      const server = net.createServer();
      server.listen(preferred, '127.0.0.1', () => {
        const { port } = server.address();
        server.close(() => resolve(port));
      });
      server.on('error', () => {
        preferred < 65535
          ? this.findAvailablePort(preferred + 1).then(resolve).catch(reject)
          : reject(new Error('No available ports'));
      });
    });
  }

  async checkDependencies() {
    const projectRoot = this._getProjectRoot();
    return {
      node:   { found: true,  version: process.version,                              path: this._findNode(projectRoot) },
      ffmpeg: { found: fs.existsSync(this._findFFmpeg(projectRoot)),                 path: this._findFFmpeg(projectRoot) },
      ytdlp:  { found: fs.existsSync(this._findResource(projectRoot, 'yt-dlp',
                  process.platform === 'win32' ? 'yt-dlp.exe' : 'yt-dlp') || ''), path: this._findYtdlp(projectRoot) },
    };
  }

  async start(config = {}) {
    this._startConfig = config;
    this._stopping    = false;
    this.port = await this.findAvailablePort(8000);

    const projectRoot  = this._getProjectRoot();
    const nodeBin      = this._findNode(projectRoot);
    const serverScript = path.join(projectRoot, 'backend-node', 'server.js');
    const ffmpegPath   = this._findFFmpeg(projectRoot);
    const ytdlpPath    = this._findYtdlp(projectRoot);
    const nodePath     = path.join(projectRoot, 'resources', 'node',
                           process.platform === 'win32' ? 'node.exe' : 'node');

    console.log(`Starting backend on port ${this.port}...`);
    console.log(`  Node.js: ${nodeBin}`);
    console.log(`  Script:  ${serverScript}`);
    console.log(`  FFmpeg:  ${ffmpegPath}`);
    console.log(`  yt-dlp:  ${ytdlpPath}`);

    return new Promise((resolve, reject) => {
      this.process = spawn(nodeBin, [serverScript], {
        env: {
          ...process.env,
          NODE_NO_WARNINGS:  '1',
          ELECTRON_MODE:     'true',
          ELECTRON_PORT:     String(this.port),
          FFMPEG_LOCATION:   ffmpegPath,
          YTDLP_BINARY:      ytdlpPath,
          ...(fs.existsSync(nodePath) && { NODE_BINARY: nodePath }),
          ...(config.downloadPath && { VD_DOWNLOAD_DIR: config.downloadPath }),
          ...(config.tempPath     && { VD_TEMP_DIR:     config.tempPath }),
          ...(config.dbPath       && { VD_DB_PATH:      config.dbPath }),
        },
        stdio: ['pipe', 'pipe', 'pipe'],
        shell: false,
      });

      this.process.stdout.on('data', d => console.log(`[backend] ${d.toString().trim()}`));
      this.process.stderr.on('data', d => console.error(`[backend] ${d.toString().trim()}`));

      this.process.on('exit', code => {
        console.log(`Backend exited with code ${code}`);
        if (!this._stopping && this.retryCount < this.maxRetries) {
          this.retryCount++;
          console.log(`Restarting backend (${this.retryCount}/${this.maxRetries})...`);
          this.start(this._startConfig).catch(console.error);
        }
      });

      this.process.on('error', err => {
        console.error('Failed to spawn backend:', err.message);
        reject(err);
      });

      this._waitForHealth(this.port, 30_000)
        .then(() => { this.retryCount = 0; resolve(this.port); })
        .catch(reject);
    });
  }

  _waitForHealth(port, timeoutMs = 30_000) {
    const start = Date.now();
    return new Promise((resolve, reject) => {
      const check = () => {
        if (Date.now() - start > timeoutMs) return reject(new Error('Backend health check timed out'));
        const req = http.get(`http://127.0.0.1:${port}/health`, res => {
          if (res.statusCode === 200) resolve();
          else setTimeout(check, 500);
        });
        req.on('error', () => setTimeout(check, 500));
        req.setTimeout(2000, () => { req.destroy(); setTimeout(check, 500); });
      };
      setTimeout(check, 500);
    });
  }

  stop() {
    this._stopping = true;
    if (this.process) {
      console.log('Stopping backend...');
      if (process.platform === 'win32') {
        spawn('taskkill', ['/pid', String(this.process.pid), '/f', '/t'], { stdio: 'ignore' });
      } else {
        this.process.kill('SIGTERM');
      }
      this.process = null;
    }
  }
}

module.exports = { BackendManager };
