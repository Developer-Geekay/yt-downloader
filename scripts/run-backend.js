/**
 * Run the FastAPI backend using the bundled Python distribution.
 * Falls back to project venvs or system Python if bundled Python is absent.
 *
 * Usage: node scripts/run-backend.js [uvicorn args...]
 *   e.g. node scripts/run-backend.js --reload --port 8000
 */

const { spawnSync } = require('child_process');
const path = require('path');
const fs = require('fs');

const PROJECT_ROOT = path.join(__dirname, '..');
const isWin = process.platform === 'win32';

// Candidate Python binaries in priority order
const candidates = isWin
  ? [
      path.join(PROJECT_ROOT, 'resources', 'python', 'python.exe'),
    ]
  : [
      path.join(PROJECT_ROOT, 'resources', 'python', 'bin', 'python3'),
      path.join(PROJECT_ROOT, 'resources', 'python', 'bin', 'python'),
      path.join(PROJECT_ROOT, 'backend', '.ytenv', 'bin', 'python'),
      path.join(PROJECT_ROOT, 'backend', '.venv', 'bin', 'python'),
    ];

const pythonBin = candidates.find((p) => fs.existsSync(p)) || (isWin ? 'python' : 'python3');

const extraArgs = process.argv.slice(2);
const uvicornArgs = ['--reload', '--port', '8000', ...extraArgs];

console.log(`Using Python: ${pythonBin}`);
console.log(`Starting uvicorn on port ${uvicornArgs[uvicornArgs.indexOf('--port') + 1] || 8000}...`);

const result = spawnSync(
  pythonBin,
  ['-m', 'uvicorn', 'app.main:app', ...uvicornArgs],
  {
    stdio: 'inherit',
    cwd: path.join(PROJECT_ROOT, 'backend'),
    env: { ...process.env, PYTHONUNBUFFERED: '1' },
  }
);

process.exit(result.status ?? 1);
