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
   * Find the Python executable — prefer project venv over system Python.
   */
  _findPython(backendDir) {
    const fs = require('fs');
    const venvNames = ['.ytenv', '.venv', 'venv'];
    const isWin = process.platform === 'win32';

    for (const name of venvNames) {
      const pythonPath = isWin
        ? path.join(backendDir, name, 'Scripts', 'python.exe')
        : path.join(backendDir, name, 'bin', 'python');
      if (fs.existsSync(pythonPath)) {
        console.log(`Found venv Python: ${pythonPath}`);
        return pythonPath;
      }
    }

    // Fallback to system Python
    return isWin ? 'python' : 'python3';
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
