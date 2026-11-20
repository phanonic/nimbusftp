// Kullanim: npm run version:set -- 2.0.1
// Surumu package.json, src-tauri/tauri.conf.json ve src-tauri/Cargo.toml
// dosyalarinda senkronize eder. Cargo.lock sonraki derlemede guncellenir.
const fs = require('fs');
const path = require('path');

const version = process.argv[2];
if (!/^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/.test(version || '')) {
  console.error('Gecersiz surum. Ornek: npm run version:set -- 2.0.1');
  process.exit(1);
}

const root = path.resolve(__dirname, '..');
const targets = [
  ['package.json', /"version"\s*:\s*"\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?"/],
  ['src-tauri/tauri.conf.json', /"version"\s*:\s*"\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?"/],
  ['src-tauri/Cargo.toml', /version\s*=\s*"\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?"/],
];

for (const [rel, re] of targets) {
  const file = path.join(root, rel);
  const text = fs.readFileSync(file, 'utf8');
  const updated = text.replace(re, (match) => match.replace(/\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?/, version));
  if (updated === text) throw new Error('Surum alanı bulunamadı: ' + rel);
  fs.writeFileSync(file, updated);
  console.log(rel + ' -> ' + version);
}
