import fs from 'fs';
import path from 'path';
import JSZip from 'jszip';

const zip = new JSZip();
const rootDir = process.cwd();

// Directories and files to exclude
const EXCLUDE_DIRS = new Set(['node_modules', 'dist', '.git', '.cache', '__pycache__', 'workspace', '.pytest_cache']);
const EXCLUDE_FILES = new Set(['.DS_Store', 'project.zip', 'real-time-hand-gesture-recognition.zip']);

function addDirectoryToZip(dirPath, zipFolder) {
  const items = fs.readdirSync(dirPath);

  for (const item of items) {
    if (EXCLUDE_DIRS.has(item) || EXCLUDE_FILES.has(item)) {
      continue;
    }

    const fullPath = path.join(dirPath, item);
    const stat = fs.statSync(fullPath);

    if (stat.isDirectory()) {
      const nestedFolder = zipFolder.folder(item);
      addDirectoryToZip(fullPath, nestedFolder);
    } else if (stat.isFile()) {
      const fileData = fs.readFileSync(fullPath);
      zipFolder.file(item, fileData);
    }
  }
}

async function createZip() {
  console.log('Packaging project into ZIP archive...');
  addDirectoryToZip(rootDir, zip);

  const publicDir = path.join(rootDir, 'public');
  if (!fs.existsSync(publicDir)) {
    fs.mkdirSync(publicDir, { recursive: true });
  }

  const outputPath = path.join(publicDir, 'real-time-hand-gesture-recognition.zip');
  const rootOutputPath = path.join(rootDir, 'real-time-hand-gesture-recognition.zip');

  const content = await zip.generateAsync({
    type: 'nodebuffer',
    compression: 'DEFLATE',
    compressionOptions: { level: 9 },
  });

  fs.writeFileSync(outputPath, content);
  fs.writeFileSync(rootOutputPath, content);

  console.log(`Successfully created ZIP archive: ${outputPath} (${(content.length / 1024).toFixed(1)} KB)`);
}

createZip().catch((err) => {
  console.error('Error generating zip:', err);
  process.exit(1);
});
