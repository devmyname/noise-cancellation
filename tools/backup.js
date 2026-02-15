/*
  Creates a zip backup of the project (excluding node_modules)
  and writes it into the project root.

  Usage:
    node tools/backup.js

  Output:
    backup-YYYYMMDD-HHMMSS.zip
*/

const fs = require('fs');
const path = require('path');
const archiver = require('archiver');

function pad2(n) {
  return String(n).padStart(2, '0');
}

function timestampForFilename(date = new Date()) {
  const yyyy = date.getFullYear();
  const mm = pad2(date.getMonth() + 1);
  const dd = pad2(date.getDate());
  const hh = pad2(date.getHours());
  const mi = pad2(date.getMinutes());
  const ss = pad2(date.getSeconds());
  return `${yyyy}${mm}${dd}-${hh}${mi}${ss}`;
}

async function main() {
  const projectRoot = path.resolve(__dirname, '..');
  const outName = `backup-${timestampForFilename()}.zip`;
  const outPath = path.join(projectRoot, outName);

  if (fs.existsSync(outPath)) {
    fs.unlinkSync(outPath);
  }

  const output = fs.createWriteStream(outPath);
  const archive = archiver('zip', { zlib: { level: 9 } });

  const done = new Promise((resolve, reject) => {
    output.on('close', resolve);
    output.on('error', reject);
    archive.on('warning', (err) => {
      // ENOENT: file disappeared during zipping; treat as error to keep backups reliable.
      reject(err);
    });
    archive.on('error', reject);
  });

  archive.pipe(output);

  // Add everything except node_modules.
  // dot: true -> include dotfiles
  // follow: false -> don't chase symlinks
  archive.glob('**/*', {
    cwd: projectRoot,
    dot: true,
    follow: false,
    ignore: ['**/node_modules/**', '**/node_modules', outName, 'backup-*.zip'],
  });

  await archive.finalize();
  await done;

  const bytes = archive.pointer();
  console.log(`[backup] Created: ${outPath}`);
  console.log(`[backup] Size: ${bytes} bytes`);
}

main().catch((err) => {
  console.error('[backup] Failed:', err && err.stack ? err.stack : err);
  process.exit(1);
});
