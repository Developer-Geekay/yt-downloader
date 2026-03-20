/**
 * Bundle FFmpeg — Downloads platform-specific FFmpeg binary for bundling.
 *
 * Usage: node scripts/bundle-ffmpeg.js
 *
 * Downloads a minimal FFmpeg build to resources/ffmpeg/
 * The app will reference this bundled FFmpeg at runtime.
 */

const https = require('https');
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// FFmpeg download URLs per platform
const FFMPEG_URLS = {
  win32: 'https://github.com/BtbN/FFmpeg-Builds/releases/download/latest/ffmpeg-master-latest-win64-gpl.zip',
  darwin: 'https://evermeet.cx/ffmpeg/getrelease/zip',
  linux: 'https://johnvansickle.com/ffmpeg/releases/ffmpeg-release-amd64-static.tar.xz',
};

const RESOURCES_DIR = path.join(__dirname, '..', 'resources', 'ffmpeg');
const CACHE_DIR = path.join(__dirname, '..', 'cache');

async function downloadFile(url, dest) {
  // Check if file exists in cache first
  const fileName = path.basename(dest);
  const cachePath = path.join(CACHE_DIR, fileName);

  if (fs.existsSync(cachePath)) {
    console.log(`Using cached file: ${cachePath}`);
    fs.copyFileSync(cachePath, dest);
    return;
  }

  return new Promise((resolve, reject) => {
    console.log(`Downloading from: ${url}`);
    fs.mkdirSync(CACHE_DIR, { recursive: true });
    const file = fs.createWriteStream(dest);

    const request = (url) => {
      https.get(url, (response) => {
        if (response.statusCode === 302 || response.statusCode === 301) {
          request(response.headers.location);
          return;
        }

        const total = parseInt(response.headers['content-length'] || '0', 10);
        let downloaded = 0;

        response.on('data', (chunk) => {
          downloaded += chunk.length;
          if (total) {
            const pct = ((downloaded / total) * 100).toFixed(1);
            process.stdout.write(`\rProgress: ${pct}%`);
          }
        });

        response.pipe(file);
        file.on('finish', () => {
          file.close();
          console.log('\nDownload complete.');
          resolve();
        });
      }).on('error', reject);
    };

    request(url);
  });
}

async function main() {
  const platform = process.platform;
  const url = FFMPEG_URLS[platform];

  if (!url) {
    console.error(`Unsupported platform: ${platform}`);
    process.exit(1);
  }

  // Create resources directory
  fs.mkdirSync(RESOURCES_DIR, { recursive: true });

  const ext = platform === 'linux' ? '.tar.xz' : '.zip';
  const archivePath = path.join(RESOURCES_DIR, `ffmpeg${ext}`);

  // Download
  await downloadFile(url, archivePath);

  // Extract
  console.log('Extracting FFmpeg...');
  if (platform === 'win32') {
    // Use PowerShell to extract on Windows
    execSync(
      `powershell -command "Expand-Archive -Path '${archivePath}' -DestinationPath '${RESOURCES_DIR}' -Force"`,
      { stdio: 'inherit' }
    );
  } else if (platform === 'linux') {
    execSync(`tar xf "${archivePath}" -C "${RESOURCES_DIR}" --strip-components=1`, {
      stdio: 'inherit',
    });
  } else {
    execSync(`unzip -o "${archivePath}" -d "${RESOURCES_DIR}"`, { stdio: 'inherit' });
  }

  // Clean up archive
  fs.unlinkSync(archivePath);

  console.log(`FFmpeg bundled successfully to: ${RESOURCES_DIR}`);
}

main().catch((err) => {
  console.error('Failed to bundle FFmpeg:', err);
  process.exit(1);
});
