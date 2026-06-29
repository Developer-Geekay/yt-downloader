/**
 * Start the Node.js backend in development mode.
 * Uses the bundled Node.js binary if available, otherwise falls back to system node.
 *
 * Usage: node scripts/run-backend.js [--port 8000]
 */

const { spawn } = require('child_process');
const path = require('path');
const fs   = require('fs');

const PROJECT_ROOT  = path.join(__dirname, '..');
const BACKEND_SCRIPT = path.join(PROJECT_ROOT, 'backend-node', 'server.js');
const isWin = process.platform === 'win32';

// Prefer bundled Node.js, fall back to the process currently running this script
const bundledNode = path.join(PROJECT_ROOT, 'resources', 'node', isWin ? 'node.exe' : 'node');
const nodeBin = fs.existsSync(bundledNode) ? bundledNode : process.execPath;

console.log(`Using Node.js: ${nodeBin}`);
console.log(`Starting backend: ${BACKEND_SCRIPT}`);

const port = (() => {
  const idx = process.argv.indexOf('--port');
  return idx >= 0 ? process.argv[idx + 1] : '8000';
})();

const proc = spawn(nodeBin, [BACKEND_SCRIPT], {
  env: {
    ...process.env,
    NODE_NO_WARNINGS: '1',
    ELECTRON_PORT: port,
  },
  stdio: 'inherit',
});

proc.on('error', err => {
  console.error('Failed to start backend:', err.message);
  process.exit(1);
});

proc.on('close', code => process.exit(code ?? 0));
