/**
 * Bundle Python — Sets up an embedded Python distribution for bundling.
 *
 * Usage: node scripts/bundle-python.js
 *
 * Downloads Python embeddable package and installs pip + project dependencies
 * into resources/python/ for inclusion in the Electron app.
 */

const https = require('https');
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const PYTHON_VERSION = '3.12.8';

const PYTHON_URLS = {
  win32: `https://www.python.org/ftp/python/${PYTHON_VERSION}/python-${PYTHON_VERSION}-embed-amd64.zip`,
};

const RESOURCES_DIR = path.join(__dirname, '..', 'resources', 'python');
const BACKEND_DIR = path.join(__dirname, '..', 'backend');
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
    console.log(`Downloading: ${url}`);
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

  if (platform !== 'win32') {
    console.log('Note: Embedded Python is currently set up for Windows.');
    console.log('For macOS/Linux, use the system Python or create a venv at build time.');
    return;
  }

  const url = PYTHON_URLS[platform];
  if (!url) {
    console.error(`No embedded Python URL for platform: ${platform}`);
    process.exit(1);
  }

  // Create resources directory
  fs.mkdirSync(RESOURCES_DIR, { recursive: true });

  const archivePath = path.join(RESOURCES_DIR, 'python-embed.zip');

  // Download embedded Python
  await downloadFile(url, archivePath);

  // Extract
  console.log('Extracting Python...');
  execSync(
    `powershell -command "Expand-Archive -Path '${archivePath}' -DestinationPath '${RESOURCES_DIR}' -Force"`,
    { stdio: 'inherit' }
  );
  fs.unlinkSync(archivePath);

  // Enable pip in embedded Python
  // The embeddable package ships with python312._pth — we need to uncomment "import site"
  const pthFiles = fs.readdirSync(RESOURCES_DIR).filter((f) => f.endsWith('._pth'));
  for (const pthFile of pthFiles) {
    const pthPath = path.join(RESOURCES_DIR, pthFile);
    let content = fs.readFileSync(pthPath, 'utf-8');
    content = content.replace('#import site', 'import site');
    // Add Lib/site-packages for pip
    if (!content.includes('Lib/site-packages')) {
      content += '\nLib/site-packages\n';
    }
    fs.writeFileSync(pthPath, content);
    console.log(`Updated ${pthFile} to enable site-packages`);
  }

  // Install pip
  console.log('Installing pip...');
  const pythonExe = path.join(RESOURCES_DIR, 'python.exe');
  const getPipUrl = 'https://bootstrap.pypa.io/get-pip.py';
  const getPipPath = path.join(RESOURCES_DIR, 'get-pip.py');

  await downloadFile(getPipUrl, getPipPath);
  execSync(`"${pythonExe}" "${getPipPath}" --no-warn-script-location`, {
    stdio: 'inherit',
    cwd: RESOURCES_DIR,
  });
  fs.unlinkSync(getPipPath);

  // Install project dependencies
  console.log('Installing backend dependencies...');
  const requirementsPath = path.join(BACKEND_DIR, 'requirements.txt');
  execSync(
    `"${pythonExe}" -m pip install -r "${requirementsPath}" --no-warn-script-location`,
    { stdio: 'inherit', cwd: RESOURCES_DIR }
  );

  console.log(`\nPython bundled successfully to: ${RESOURCES_DIR}`);
}

main().catch((err) => {
  console.error('Failed to bundle Python:', err);
  process.exit(1);
});
