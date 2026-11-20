#!/usr/bin/env node
// OpenCode skill iskeleti olusturma / frontmatter guncelleme araci.
// Kullanim:
//   node skill-manager.js create <id> "<Ad>" "<Aciklama>" [--scope project|global] [--root <dir>] [--force]
//   node skill-manager.js update <id> [--name "<Ad>"] [--description "<Aciklama>"] [--scope ...] [--root <dir>]
const fs = require('fs');
const os = require('os');
const path = require('path');

const ID_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

function parseArgs(argv) {
  const command = argv[0];
  const rest = argv.slice(1);
  // "list" komutunda ID yok; ilk argüman doğrudan seçenek olabilir.
  const id = command === 'list' ? null : rest.shift();
  const opts = { force: false, scope: 'project', root: process.cwd() };
  const positional = [];
  for (let i = 0; i < rest.length; i++) {
    const a = rest[i];
    if (a === '--force') opts.force = true;
    else if (a === '--scope') opts.scope = rest[++i];
    else if (a === '--root') opts.root = rest[++i];
    else positional.push(a);
  }
  return { command, id, positional, opts };
}

function skillsRoot(opts) {
  if (opts.scope === 'global') return path.join(os.homedir(), '.config', 'opencode', 'skills');
  if (opts.scope !== 'project') throw new Error('--scope sadece project|global olabilir');
  return path.join(opts.root, '.opencode', 'skills');
}

function validateId(id) {
  if (!id || !ID_RE.test(id) || id.length > 64) {
    throw new Error(`Gecersiz skill ID: "${id}" (kebab-case, 1-64 karakter olmali)`);
  }
}

function yaml(value) {
  return JSON.stringify(String(value));
}

function create({ id, positional, opts }) {
  validateId(id);
  const [name, description] = positional;
  if (!name || !description) {
    throw new Error('Kullanim: create <id> "<Ad>" "<Aciklama>"');
  }
  const dir = path.join(skillsRoot(opts), id);
  const target = path.join(dir, 'SKILL.md');
  if (fs.existsSync(target) && !opts.force) {
    throw new Error(`${target} zaten var; ustune yazmak icin --force kullan`);
  }
  fs.mkdirSync(path.join(dir, 'scripts'), { recursive: true });
  fs.mkdirSync(path.join(dir, 'references'), { recursive: true });
  fs.mkdirSync(path.join(dir, 'templates'), { recursive: true });

  const templatePath = path.join(__dirname, '..', 'templates', 'SKILL.md');
  const template = fs.existsSync(templatePath)
    ? fs.readFileSync(templatePath, 'utf8')
    : '---\nname: {{NAME}}\ndescription: {{DESCRIPTION}}\n---\n\n# {{NAME}}\n';
  const body = template
    .replaceAll('{{NAME}}', name)
    .replaceAll('{{DESCRIPTION}}', description);
  fs.writeFileSync(target, body);
  console.log('Olusturuldu: ' + target);
}

function update({ id, positional, opts }) {
  validateId(id);
  const target = path.join(skillsRoot(opts), id, 'SKILL.md');
  if (!fs.existsSync(target)) throw new Error('Skill bulunamadi: ' + target);
  const wanted = { name: null, description: null };
  for (let i = 0; i < positional.length; i += 2) {
    const key = positional[i].replace(/^--/, '');
    if (key === 'name' || key === 'description') wanted[key] = positional[i + 1];
    else throw new Error('Bilinmeyen alan: ' + positional[i]);
  }
  if (wanted.name === null && wanted.description === null) {
    throw new Error('Kullanim: update <id> --name "<Ad>" --description "<Aciklama>"');
  }

  const text = fs.readFileSync(target, 'utf8');
  const lines = text.split(/\r?\n/);
  let inFront = false;
  let changed = 0;
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].trim() === '---') {
      if (!inFront) { inFront = true; continue; }
      break;
    }
    if (!inFront) continue;
    for (const key of ['name', 'description']) {
      if (wanted[key] !== null && new RegExp('^' + key + '\\s*:').test(lines[i])) {
        lines[i] = `${key}: ${yaml(wanted[key])}`;
        changed++;
      }
    }
  }
  if (!changed) throw new Error('name/description alani frontmatter icinde bulunamadi');
  fs.writeFileSync(target, lines.join('\n'));
  console.log('Guncellendi: ' + target);
}

function list({ opts }) {
  const root = skillsRoot(opts);
  if (!fs.existsSync(root)) { console.log('Skill yok: ' + root); return; }
  const found = [];
  for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
    if (entry.isDirectory() && fs.existsSync(path.join(root, entry.name, 'SKILL.md'))) found.push(entry.name);
    else if (entry.isFile() && entry.name.endsWith('.md')) found.push(entry.name.slice(0, -3));
  }
  console.log(found.join('\n') || '(bos)');
}

try {
  const { command, id, positional, opts } = parseArgs(process.argv.slice(2));
  if (command === 'create') create({ id, positional, opts });
  else if (command === 'update') update({ id, positional, opts });
  else if (command === 'list') list({ opts });
  else throw new Error('Bilinmeyen komut: ' + command + '\ncreate | update | list');
} catch (err) {
  console.error('Hata: ' + err.message);
  process.exit(1);
}
