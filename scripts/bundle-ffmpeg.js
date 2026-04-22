/**
 * Bundle FFmpeg — copies the platform-correct FFmpeg binary from the
 * ffmpeg-static npm package (installed as a devDependency) into resources/ffmpeg/.
 *
 * ffmpeg-static automatically downloads the right binary for the current
 * platform/arch at `npm install` time:
 *   darwin  x64   ✓
 *   darwin  arm64 ✓
 *   linux   x64   ✓
 *   linux   arm64 ✓
 *   win32   x64   ✓
 *
 * Usage: node scripts/bundle-ffmpeg.js
 * Output: resources/ffmpeg/ffmpeg  (unix)
 *         resources/ffmpeg/ffmpeg.exe  (windows)
 */

const fs = require('fs');
const path = require('path');

let ffmpegSrc;
try {
  ffmpegSrc = require('ffmpeg-static');
} catch {
  console.error('ffmpeg-static not found. Run `npm install` first.');
  process.exit(1);
}

if (!ffmpegSrc || !fs.existsSync(ffmpegSrc)) {
  console.error(`ffmpeg-static binary not found at: ${ffmpegSrc}`);
  console.error('Try: npm install');
  process.exit(1);
}

const isWin = process.platform === 'win32';
const destDir = path.join(__dirname, '..', 'resources', 'ffmpeg');
const destName = isWin ? 'ffmpeg.exe' : 'ffmpeg';
const destPath = path.join(destDir, destName);

fs.mkdirSync(destDir, { recursive: true });
fs.copyFileSync(ffmpegSrc, destPath);
if (!isWin) fs.chmodSync(destPath, 0o755);

console.log(`FFmpeg bundled for ${process.platform}-${process.arch}`);
console.log(`  Source: ${ffmpegSrc}`);
console.log(`  Dest:   ${destPath}`);
