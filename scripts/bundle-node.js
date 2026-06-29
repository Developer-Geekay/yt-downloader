/**
 * Bundle Node.js — downloads the Node.js LTS binary for the current platform
 * to be used as the yt-dlp JavaScript runtime (replaces system node dependency).
 *
 * Uses Node.js v22.23.1 (LTS) from nodejs.org.
 * Supports: darwin arm64/x64, linux x64/arm64, win32 x64
 * Output:   resources/node/node  (unix)
 *           resources/node/node.exe  (windows)
 * Cache:    cache/node/
 *
 * Usage: node scripts/bundle-node.js
 */

const https = require('https');
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const NODE_VERSION = 'v22.23.1';
const BASE_URL = `https://nodejs.org/dist/${NODE_VERSION}`;

const ARCHIVE_MAP = {
  'darwin-arm64': { name: `node-${NODE_VERSION}-darwin-arm64.tar.gz`, ext: 'tar.gz' },
  'darwin-x64':   { name: `node-${NODE_VERSION}-darwin-x64.tar.gz`,   ext: 'tar.gz' },
  'linux-x64':    { name: `node-${NODE_VERSION}-linux-x64.tar.xz`,    ext: 'tar.xz' },
  'linux-arm64':  { name: `node-${NODE_VERSION}-linux-arm64.tar.xz`,  ext: 'tar.xz' },
  'win32-x64':    { name: `node-${NODE_VERSION}-win-x64.zip`,         ext: 'zip'    },
};

const PROJECT_ROOT = path.join(__dirname, '..');
const NODE_DIR  = path.join(PROJECT_ROOT, 'resources', 'node');
const CACHE_DIR = path.join(PROJECT_ROOT, 'cache', 'node');

function isValidArchive(filePath) {
  try {
    return fs.existsSync(filePath) && fs.statSync(filePath).size > 1024 * 1024;
  } catch {
    return false;
  }
}

function downloadFile(url, dest) {
  const cacheFile = path.join(CACHE_DIR, path.basename(dest));

  if (isValidArchive(cacheFile)) {
    console.log(`  Using cached: ${path.basename(cacheFile)}`);
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.copyFileSync(cacheFile, dest);
    return Promise.resolve();
  }

  if (fs.existsSync(cacheFile)) fs.unlinkSync(cacheFile);

  return new Promise((resolve, reject) => {
    console.log(`  Downloading: ${url}`);
    fs.mkdirSync(CACHE_DIR, { recursive: true });
    fs.mkdirSync(path.dirname(dest), { recursive: true });

    let received = 0;

    const request = (u) => {
      https.get(u, (res) => {
        if (res.statusCode === 301 || res.statusCode === 302) {
          res.resume();
          request(res.headers.location);
          return;
        }
        if (res.statusCode !== 200) {
          reject(new Error(`HTTP ${res.statusCode} from ${u}`));
          return;
        }

        const total = parseInt(res.headers['content-length'] || '0', 10);
        const file = fs.createWriteStream(dest);

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
          file.close(() => {
            console.log('');
            if (received === 0) {
              reject(new Error('Downloaded file is empty'));
              return;
            }
            fs.copyFileSync(dest, cacheFile);
            resolve();
          });
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
  const isWin = process.platform === 'win32';
  const platformArch = `${process.platform}-${process.arch}`;
  const archive = ARCHIVE_MAP[platformArch];

  if (!archive) {
    console.error(`Unsupported platform/arch: ${platformArch}`);
    console.error(`Supported: ${Object.keys(ARCHIVE_MAP).join(', ')}`);
    process.exit(1);
  }

  const archivePath = path.join(CACHE_DIR, archive.name);
  const url = `${BASE_URL}/${archive.name}`;

  console.log(`\nBundling Node.js ${NODE_VERSION} for ${platformArch}...`);

  fs.mkdirSync(NODE_DIR, { recursive: true });
  fs.mkdirSync(CACHE_DIR, { recursive: true });

  await downloadFile(url, archivePath);

  // Extract the directory name embedded in the archive
  const extractedDirName = archive.name
    .replace('.tar.gz', '')
    .replace('.tar.xz', '')
    .replace('.zip', '');

  const tempDir = path.join(CACHE_DIR, '_extract_tmp');
  if (fs.existsSync(tempDir)) fs.rmSync(tempDir, { recursive: true, force: true });
  fs.mkdirSync(tempDir, { recursive: true });

  console.log('  Extracting node binary...');

  if (archive.ext === 'tar.gz') {
    run('tar', ['-xzf', archivePath, '-C', tempDir, `${extractedDirName}/bin/node`]);
  } else if (archive.ext === 'tar.xz') {
    run('tar', ['-xJf', archivePath, '-C', tempDir, `${extractedDirName}/bin/node`]);
  } else if (archive.ext === 'zip') {
    // Windows: unzip just the node.exe
    run('powershell', [
      '-Command',
      `Expand-Archive -Path '${archivePath}' -DestinationPath '${tempDir}' -Force`,
    ]);
  }

  // Locate and copy binary
  const nodeSrc = isWin
    ? path.join(tempDir, extractedDirName, 'node.exe')
    : path.join(tempDir, extractedDirName, 'bin', 'node');

  if (!fs.existsSync(nodeSrc)) {
    console.error(`  Node binary not found at: ${nodeSrc}`);
    process.exit(1);
  }

  const destName = isWin ? 'node.exe' : 'node';
  const destPath = path.join(NODE_DIR, destName);

  fs.copyFileSync(nodeSrc, destPath);
  if (!isWin) fs.chmodSync(destPath, 0o755);

  // Cleanup temp
  fs.rmSync(tempDir, { recursive: true, force: true });

  const sizeMB = (fs.statSync(destPath).size / 1024 / 1024).toFixed(1);
  console.log(`  Node.js bundled: ${destPath} (${sizeMB} MB)`);
}

main().catch((err) => {
  console.error('\nFailed to bundle Node.js:', err.message);
  process.exit(1);
});
