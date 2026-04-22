/**
 * Bundle Python — Downloads a standalone Python distribution for the current platform.
 * Uses python-build-standalone (https://github.com/indygreg/python-build-standalone)
 * which provides self-contained Python builds requiring no system Python.
 *
 * Supports: macOS arm64 / x64, Linux x64, Windows x64
 * Output:   resources/python/
 *
 * Usage: node scripts/bundle-python.js
 */

const https = require('https');
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const PYTHON_VERSION = '3.12.9';
const RELEASE_DATE = '20250317';

// Maps Node.js platform-arch to python-build-standalone target triple
const TARGETS = {
  'darwin-arm64': 'aarch64-apple-darwin',
  'darwin-x64': 'x86_64-apple-darwin',
  'linux-x64': 'x86_64-unknown-linux-gnu',
  'win32-x64': 'x86_64-pc-windows-msvc',
};

const PROJECT_ROOT = path.join(__dirname, '..');
const RESOURCES_DIR = path.join(PROJECT_ROOT, 'resources');
const PYTHON_DIR = path.join(RESOURCES_DIR, 'python');
const BACKEND_DIR = path.join(PROJECT_ROOT, 'backend');
const CACHE_DIR = path.join(PROJECT_ROOT, 'cache');

function downloadFile(url, dest) {
  const cachePath = path.join(CACHE_DIR, path.basename(dest));

  if (fs.existsSync(cachePath)) {
    console.log(`  Using cached: ${path.basename(cachePath)}`);
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.copyFileSync(cachePath, dest);
    return Promise.resolve();
  }

  return new Promise((resolve, reject) => {
    console.log(`  Downloading: ${url}`);
    fs.mkdirSync(CACHE_DIR, { recursive: true });
    fs.mkdirSync(path.dirname(dest), { recursive: true });

    const file = fs.createWriteStream(dest);

    const request = (u) => {
      https.get(u, (res) => {
        if (res.statusCode === 301 || res.statusCode === 302) {
          file.destroy();
          request(res.headers.location);
          return;
        }
        if (res.statusCode !== 200) {
          file.destroy();
          reject(new Error(`HTTP ${res.statusCode} from ${u}`));
          return;
        }

        const total = parseInt(res.headers['content-length'] || '0', 10);
        let received = 0;
        res.on('data', (chunk) => {
          received += chunk.length;
          if (total) {
            process.stdout.write(
              `\r  ${((received / total) * 100).toFixed(1)}% of ${(total / 1024 / 1024).toFixed(1)} MB`
            );
          }
        });

        res.pipe(file);
        file.on('finish', () => {
          file.close();
          console.log('');
          fs.copyFileSync(dest, cachePath);
          resolve();
        });
        file.on('error', reject);
      }).on('error', reject);
    };

    request(url);
  });
}

function run(cmd, args, opts = {}) {
  const result = spawnSync(cmd, args, { stdio: 'inherit', ...opts });
  if (result.status !== 0) {
    throw new Error(`Command failed: ${cmd} ${args.join(' ')}`);
  }
}

async function main() {
  const platformArch = `${process.platform}-${process.arch}`;
  const target = TARGETS[platformArch];

  if (!target) {
    console.error(`Unsupported platform/arch: ${platformArch}`);
    console.error(`Supported: ${Object.keys(TARGETS).join(', ')}`);
    process.exit(1);
  }

  const archiveName = `cpython-${PYTHON_VERSION}+${RELEASE_DATE}-${target}-install_only_stripped.tar.gz`;
  const url = `https://github.com/indygreg/python-build-standalone/releases/download/${RELEASE_DATE}/${archiveName}`;
  const archivePath = path.join(CACHE_DIR, archiveName);

  console.log(`\nBundling Python ${PYTHON_VERSION} for ${platformArch}...`);

  // Clean any previous install
  if (fs.existsSync(PYTHON_DIR)) {
    console.log('  Removing previous bundled Python...');
    fs.rmSync(PYTHON_DIR, { recursive: true, force: true });
  }
  fs.mkdirSync(RESOURCES_DIR, { recursive: true });

  // Download (uses cached copy after first run)
  await downloadFile(url, archivePath);

  // Extract — python-build-standalone archives contain a top-level python/ dir.
  // Extracting into resources/ places the result at resources/python/.
  console.log('  Extracting...');
  // tar ships with Windows 10+ and handles .tar.gz natively
  run('tar', ['-xzf', archivePath, '-C', RESOURCES_DIR]);

  // Verify binary
  const pythonBin =
    process.platform === 'win32'
      ? path.join(PYTHON_DIR, 'python.exe')
      : path.join(PYTHON_DIR, 'bin', 'python3');

  if (!fs.existsSync(pythonBin)) {
    console.error(`  Python binary not found at expected path: ${pythonBin}`);
    process.exit(1);
  }

  // Ensure executable (tar should preserve bits, but be explicit)
  if (process.platform !== 'win32') {
    fs.chmodSync(pythonBin, 0o755);
  }

  console.log(`  Python binary: ${pythonBin}`);

  // Upgrade pip
  console.log('\nUpgrading pip...');
  run(pythonBin, ['-m', 'pip', 'install', '--upgrade', 'pip', '--quiet', '--no-warn-script-location']);

  // Install backend dependencies into the bundled Python
  console.log('Installing backend dependencies...');
  const requirementsPath = path.join(BACKEND_DIR, 'requirements.txt');
  run(pythonBin, [
    '-m', 'pip', 'install',
    '-r', requirementsPath,
    '--quiet',
    '--no-warn-script-location',
  ]);

  console.log(`\nPython bundled successfully to: ${PYTHON_DIR}`);
}

main().catch((err) => {
  console.error('\nFailed to bundle Python:', err.message);
  process.exit(1);
});
