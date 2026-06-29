/**
 * Bundle yt-dlp — downloads the standalone yt-dlp binary for the current platform
 * from the official GitHub release (2026.06.09).
 *
 * Supports: darwin (universal), linux x64, linux arm64, win32 x64
 * Output:   resources/yt-dlp/yt-dlp  (unix)
 *           resources/yt-dlp/yt-dlp.exe  (windows)
 * Cache:    cache/yt-dlp/
 *
 * Usage: node scripts/bundle-ytdlp.js
 */

const https = require('https');
const fs = require('fs');
const path = require('path');

const YTDLP_VERSION = '2026.06.09';
const BASE_URL = `https://github.com/yt-dlp/yt-dlp/releases/download/${YTDLP_VERSION}`;

// macOS universal binary works for both arm64 and x64
const BINARY_MAP = {
  'darwin-arm64': 'yt-dlp_macos',
  'darwin-x64':   'yt-dlp_macos',
  'linux-x64':    'yt-dlp_linux',
  'linux-arm64':  'yt-dlp_linux_aarch64',
  'win32-x64':    'yt-dlp.exe',
};

const PROJECT_ROOT = path.join(__dirname, '..');
const YTDLP_DIR  = path.join(PROJECT_ROOT, 'resources', 'yt-dlp');
const CACHE_DIR  = path.join(PROJECT_ROOT, 'cache', 'yt-dlp');

function downloadFile(url, dest) {
  const cacheFile = path.join(CACHE_DIR, path.basename(url));

  if (fs.existsSync(cacheFile) && fs.statSync(cacheFile).size > 1024) {
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

async function main() {
  const isWin = process.platform === 'win32';
  const platformArch = `${process.platform}-${process.arch}`;
  const remoteName = BINARY_MAP[platformArch];

  if (!remoteName) {
    console.error(`Unsupported platform/arch: ${platformArch}`);
    console.error(`Supported: ${Object.keys(BINARY_MAP).join(', ')}`);
    process.exit(1);
  }

  const destName = isWin ? 'yt-dlp.exe' : 'yt-dlp';
  const destPath = path.join(YTDLP_DIR, destName);
  const url = `${BASE_URL}/${remoteName}`;

  console.log(`\nBundling yt-dlp ${YTDLP_VERSION} for ${platformArch}...`);

  fs.mkdirSync(YTDLP_DIR, { recursive: true });

  await downloadFile(url, destPath);

  if (!isWin) fs.chmodSync(destPath, 0o755);

  const sizeMB = (fs.statSync(destPath).size / 1024 / 1024).toFixed(1);
  console.log(`  yt-dlp bundled: ${destPath} (${sizeMB} MB)`);
}

main().catch((err) => {
  console.error('\nFailed to bundle yt-dlp:', err.message);
  process.exit(1);
});
