const { spawn } = require('child_process');
const path = require('path');
const net = require('net');
const http = require('http');
const fs = require('fs');

class BackendManager {
  constructor() {
    this.process = null;
    this.port = null;
    this._stopping = false;
    this.maxRetries = 3;
    this.retryCount = 0;
    this._startConfig = null;
  }

  /**
   * Resolve the project root regardless of whether running inside an ASAR archive
   * (packaged app) or directly from source (development).
   */
  _getProjectRoot() {
    // __dirname inside a packaged .asar archive contains '.asar'
    if (__dirname.includes('.asar')) {
      // Unpacked files live alongside app.asar in app.asar.unpacked/
      return path.join(process.resourcesPath, 'app.asar.unpacked');
    }
    // Development: electron/ is one level below the project root
    return path.join(__dirname, '..');
  }

  /**
   * Find the Python executable.
   * Priority: bundled resources/python → project venv → system Python.
   */
  _findPython(projectRoot) {
    const isWin = process.platform === 'win32';

    // 1. Bundled Python (resources/python) — produced by bundle-python.js
    //    python-build-standalone uses 'python3' on unix, 'python.exe' on windows.
    const bundledCandidates = isWin
      ? [path.join(projectRoot, 'resources', 'python', 'python.exe')]
      : [
          path.join(projectRoot, 'resources', 'python', 'bin', 'python3'),
          path.join(projectRoot, 'resources', 'python', 'bin', 'python'),
        ];

    for (const p of bundledCandidates) {
      if (fs.existsSync(p)) return p;
    }

    // 2. Project virtual environments (development fallback)
    const backendDir = path.join(projectRoot, 'backend');
    const venvNames = ['.ytenv', '.venv', 'venv'];
    for (const name of venvNames) {
      const venvPath = isWin
        ? path.join(backendDir, name, 'Scripts', 'python.exe')
        : path.join(backendDir, name, 'bin', 'python');
      if (fs.existsSync(venvPath)) return venvPath;
    }

    // 3. System Python
    return isWin ? 'python' : 'python3';
  }

  /**
   * Find the FFmpeg executable.
   * Priority: bundled resources/ffmpeg → system ffmpeg.
   */
  _findFFmpeg(projectRoot) {
    const isWin = process.platform === 'win32';
    const binaryName = isWin ? 'ffmpeg.exe' : 'ffmpeg';
    const bundledPath = path.join(projectRoot, 'resources', 'ffmpeg', binaryName);
    if (fs.existsSync(bundledPath)) return bundledPath;

    // Recursive search inside resources/ffmpeg (handles subdirectory layouts)
    const ffmpegDir = path.join(projectRoot, 'resources', 'ffmpeg');
    if (fs.existsSync(ffmpegDir)) {
      const found = this._findInDir(ffmpegDir, binaryName);
      if (found) return found;
    }

    return 'ffmpeg'; // system fallback
  }

  _findInDir(dir, name) {
    try {
      for (const entry of fs.readdirSync(dir)) {
        const full = path.join(dir, entry);
        const stat = fs.statSync(full);
        if (stat.isDirectory()) {
          const found = this._findInDir(full, name);
          if (found) return found;
        } else if (entry === name) {
          return full;
        }
      }
    } catch (_) {}
    return null;
  }

  /**
   * Find an available TCP port starting from preferred.
   */
  async findAvailablePort(preferred = 8000) {
    return new Promise((resolve, reject) => {
      const server = net.createServer();
      server.listen(preferred, '127.0.0.1', () => {
        const { port } = server.address();
        server.close(() => resolve(port));
      });
      server.on('error', () => {
        if (preferred < 65535) {
          this.findAvailablePort(preferred + 1).then(resolve).catch(reject);
        } else {
          reject(new Error('No available ports'));
        }
      });
    });
  }

  /**
   * Check installed dependencies (Python, FFmpeg, Node).
   * Used by the setup page to display status.
   */
  async checkDependencies() {
    const projectRoot = this._getProjectRoot();
    const deps = {
      python: { found: false, version: null, path: null },
      ffmpeg: { found: false, version: null, path: null },
      node:   { found: true,  version: process.version, path: process.execPath },
    };

    const pythonPath = this._findPython(projectRoot);
    try {
      const result = spawn(pythonPath, ['--version']);
      const output = await this._readOutput(result);
      deps.python.found = true;
      deps.python.version = output.trim();
      deps.python.path = pythonPath;
    } catch (_) {}

    const ffmpegPath = this._findFFmpeg(projectRoot);
    try {
      const result = spawn(ffmpegPath, ['-version']);
      const output = await this._readOutput(result);
      deps.ffmpeg.found = true;
      deps.ffmpeg.version = output.split('\n')[0].trim();
      deps.ffmpeg.path = ffmpegPath;
    } catch (_) {}

    return deps;
  }

  _readOutput(child) {
    return new Promise((resolve) => {
      let out = '';
      child.stdout?.on('data', (d) => (out += d));
      child.stderr?.on('data', (d) => (out += d));
      child.on('close', () => resolve(out));
      child.on('error', () => resolve(''));
    });
  }

  /**
   * Start the Python FastAPI backend as a child process.
   * @param {object} config - { downloadPath, tempPath, dbPath }
   * @returns {Promise<number>} port the backend is listening on
   */
  async start(config = {}) {
    this._startConfig = config;
    this._stopping = false;
    this.port = await this.findAvailablePort(8000);

    const projectRoot = this._getProjectRoot();
    const backendDir = path.join(projectRoot, 'backend');
    const pythonCmd = this._findPython(projectRoot);
    const ffmpegPath = this._findFFmpeg(projectRoot);

    return new Promise((resolve, reject) => {
      console.log(`Starting backend on port ${this.port}...`);
      console.log(`  Python: ${pythonCmd}`);
      console.log(`  FFmpeg: ${ffmpegPath}`);

      this.process = spawn(
        pythonCmd,
        ['-m', 'uvicorn', 'app.main:app', '--host', '127.0.0.1', '--port', String(this.port), '--no-access-log'],
        {
          cwd: backendDir,
          env: {
            ...process.env,
            ELECTRON_MODE: 'true',
            ELECTRON_PORT: String(this.port),
            PYTHONUNBUFFERED: '1',
            // Pass user-configured paths to the backend
            ...(config.downloadPath && { VD_DOWNLOAD_DIR: config.downloadPath }),
            ...(config.tempPath    && { VD_TEMP_DIR:     config.tempPath }),
            ...(config.dbPath      && { VD_DB_PATH:      config.dbPath }),
            // Tell yt-dlp / backend where bundled FFmpeg lives
            FFMPEG_LOCATION: ffmpegPath,
          },
          stdio: ['pipe', 'pipe', 'pipe'],
          shell: false,
        }
      );

      this.process.stdout.on('data', (data) => {
        console.log(`[backend] ${data.toString().trim()}`);
      });
      this.process.stderr.on('data', (data) => {
        console.error(`[backend] ${data.toString().trim()}`);
      });

      this.process.on('exit', (code) => {
        console.log(`Backend exited with code ${code}`);
        if (!this._stopping && this.retryCount < this.maxRetries) {
          this.retryCount++;
          console.log(`Restarting backend (${this.retryCount}/${this.maxRetries})...`);
          this.start(this._startConfig).catch(console.error);
        }
      });

      this.process.on('error', (err) => {
        console.error('Failed to spawn backend:', err.message);
        reject(err);
      });

      this._waitForHealth(this.port, 30000)
        .then(() => {
          this.retryCount = 0;
          resolve(this.port);
        })
        .catch(reject);
    });
  }

  /**
   * Poll /health until the backend responds 200 or timeout expires.
   */
  _waitForHealth(port, timeoutMs = 30000) {
    const start = Date.now();
    const interval = 500;

    return new Promise((resolve, reject) => {
      const check = () => {
        if (Date.now() - start > timeoutMs) {
          return reject(new Error('Backend health check timed out'));
        }

        const req = http.get(`http://127.0.0.1:${port}/health`, (res) => {
          if (res.statusCode === 200) resolve();
          else setTimeout(check, interval);
        });

        req.on('error', () => setTimeout(check, interval));
        req.setTimeout(2000, () => {
          req.destroy();
          setTimeout(check, interval);
        });
      };

      // Give Python a moment to start before first check
      setTimeout(check, 1000);
    });
  }

  /**
   * Gracefully stop the backend process.
   */
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
