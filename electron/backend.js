const { spawn } = require('child_process');
const path = require('path');
const net = require('net');
const http = require('http');

class BackendManager {
  constructor() {
    this.process = null;
    this.port = null;
    this.maxRetries = 3;
    this.retryCount = 0;
  }

  /**
   * Find an available port starting from the preferred port.
   */
  async findAvailablePort(preferred = 8000) {
    return new Promise((resolve, reject) => {
      const server = net.createServer();
      server.listen(preferred, '127.0.0.1', () => {
        const { port } = server.address();
        server.close(() => resolve(port));
      });
      server.on('error', () => {
        // Port in use, try next
        if (preferred < 65535) {
          this.findAvailablePort(preferred + 1).then(resolve).catch(reject);
        } else {
          reject(new Error('No available ports'));
        }
      });
    });
  }

  /**
   * Find the Python executable — prefer bundled distribution, then project venv, then system Python.
   */
  _findPython(backendDir) {
    const fs = require('fs');
    const isWin = process.platform === 'win32';
    const projectRoot = path.dirname(backendDir);

    // 1. Check bundled Python (resources/python) — highest priority for production (if bundled)
    const bundledPath = isWin
      ? path.join(projectRoot, 'resources', 'python', 'python.exe')
      : path.join(projectRoot, 'resources', 'python', 'bin', 'python');
    if (fs.existsSync(bundledPath)) {
      return bundledPath;
    }

    // 2. Check project virtual environments (for development)
    const venvNames = ['.ytenv', '.venv', 'venv'];
    for (const name of venvNames) {
      const venvPath = isWin
        ? path.join(backendDir, name, 'Scripts', 'python.exe')
        : path.join(backendDir, name, 'bin', 'python');
      if (fs.existsSync(venvPath)) {
        return venvPath;
      }
    }

    // 3. Fallback to system Python
    return isWin ? 'python' : 'python3';
  }

  /**
   * Check if a dependency exists on the system and satisfies version requirements.
   */
  async checkDependencies() {
    const deps = {
      python: { found: false, version: null, path: null },
      ffmpeg: { found: false, version: null, path: null },
      node: { found: true, version: process.version, path: process.execPath }
    };

    // Check Python
    try {
      const backendDir = path.join(__dirname, '..', 'backend');
      const pythonPath = this._findPython(backendDir);
      const { stdout } = await this._execPromise(`${pythonPath} --version`);
      deps.python.found = true;
      deps.python.version = stdout.trim();
      deps.python.path = pythonPath;
    } catch (e) {
      console.warn('Python not found or version check failed:', e.message);
    }

    // Check FFmpeg
    try {
      const { stdout } = await this._execPromise('ffmpeg -version');
      deps.ffmpeg.found = true;
      deps.ffmpeg.version = stdout.split('\n')[0].trim();
      deps.ffmpeg.path = 'ffmpeg';
    } catch (e) {
      // Check bundled fallback
      const projectRoot = path.dirname(path.join(__dirname, '..', 'backend'));
      const bundledFFmpeg = path.join(projectRoot, 'resources', 'ffmpeg', process.platform === 'win32' ? 'ffmpeg.exe' : 'ffmpeg');
      const fs = require('fs');
      if (fs.existsSync(bundledFFmpeg)) {
        deps.ffmpeg.found = true;
        deps.ffmpeg.path = bundledFFmpeg;
        // Could also check version of bundled here if needed
      }
    }

    return deps;
  }

  _execPromise(command) {
    const { exec } = require('child_process');
    return new Promise((resolve, reject) => {
      exec(command, (error, stdout, stderr) => {
        if (error) reject(error);
        else resolve({ stdout, stderr });
      });
    });
  }


  /**
   * Start the Python FastAPI backend as a child process.
   * Returns the port number once the backend is healthy.
   */
  async start() {
    this.port = await this.findAvailablePort(8000);

    const backendDir = path.join(__dirname, '..', 'backend');
    const pythonCmd = this._findPython(backendDir);

    return new Promise((resolve, reject) => {
      console.log(`Starting backend on port ${this.port}...`);

      this.process = spawn(
        pythonCmd,
        [
          '-m', 'uvicorn',
          'app.main:app',
          '--host', '127.0.0.1',
          '--port', String(this.port),
          '--no-access-log',
        ],
        {
          cwd: backendDir,
          env: {
            ...process.env,
            ELECTRON_MODE: 'true',
            ELECTRON_PORT: String(this.port),
            PYTHONUNBUFFERED: '1',
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
          console.log(`Restarting backend (attempt ${this.retryCount}/${this.maxRetries})...`);
          this.start().catch(console.error);
        }
      });

      this.process.on('error', (err) => {
        console.error('Failed to spawn backend:', err.message);
        reject(err);
      });

      // Poll /health until backend is ready
      this._waitForHealth(this.port, 30000)
        .then(() => {
          this.retryCount = 0;
          resolve(this.port);
        })
        .catch(reject);
    });
  }

  /**
   * Poll the /health endpoint until it responds 200.
   */
  _waitForHealth(port, timeoutMs = 30000) {
    const startTime = Date.now();
    const interval = 500;

    return new Promise((resolve, reject) => {
      const check = () => {
        if (Date.now() - startTime > timeoutMs) {
          return reject(new Error('Backend health check timed out'));
        }

        const req = http.get(`http://127.0.0.1:${port}/health`, (res) => {
          if (res.statusCode === 200) {
            resolve();
          } else {
            setTimeout(check, interval);
          }
        });

        req.on('error', () => {
          setTimeout(check, interval);
        });

        req.setTimeout(2000, () => {
          req.destroy();
          setTimeout(check, interval);
        });
      };

      // Give Python a moment to start
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
        // On Windows, use taskkill to ensure child processes are killed
        spawn('taskkill', ['/pid', String(this.process.pid), '/f', '/t'], {
          stdio: 'ignore',
        });
      } else {
        this.process.kill('SIGTERM');
      }
      this.process = null;
    }
  }
}

module.exports = { BackendManager };
