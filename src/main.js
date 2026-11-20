'use strict';
const { app, BrowserWindow, ipcMain, dialog, shell, safeStorage, Menu } = require('electron');
const path = require('path');
const fs = require('fs');
const fsp = fs.promises;
const os = require('os');
const { posix } = path;
const remoteLib = require('./remote');

let win = null;

// ---------- Depolama (siteler, bilinen ana makine anahtarları) ----------
const store = (f) => path.join(app.getPath('userData'), f);
function readJSON(f, d) { try { return JSON.parse(fs.readFileSync(store(f), 'utf8')); } catch { return d; } }
function writeJSON(f, v) {
  fs.mkdirSync(app.getPath('userData'), { recursive: true });
  fs.writeFileSync(store(f), JSON.stringify(v, null, 2));
}
const enc = (s) => {
  if (!s) return '';
  return safeStorage.isEncryptionAvailable()
    ? 'enc:' + safeStorage.encryptString(s).toString('base64')
    : 'b64:' + Buffer.from(s).toString('base64');
};
const dec = (s) => {
  if (!s) return '';
  try {
    if (s.startsWith('enc:')) return safeStorage.decryptString(Buffer.from(s.slice(4), 'base64'));
    if (s.startsWith('b64:')) return Buffer.from(s.slice(4), 'base64').toString();
  } catch { return ''; }
  return s;
};

function verifyHost(host, port, hash) {
  const known = readJSON('known_hosts.json', {});
  const key = `${host}:${port}`;
  if (!known[key]) {
    known[key] = hash;
    writeJSON('known_hosts.json', known);
    log('ssh', `Yeni sunucu anahtarı kaydedildi (SHA256 ${hash.slice(0, 16)}…)`);
    return true;
  }
  if (known[key] !== hash) {
    log('ssh', 'UYARI: sunucu anahtarı değişmiş! Bağlantı reddedildi.');
    return false;
  }
  return true;
}

// ---------- Yardımcılar ----------
function send(ch, data) { if (win && !win.isDestroyed()) win.webContents.send(ch, data); }
function log(tag, m) { send('log', { tag, m: String(m).trim(), time: Date.now() }); }

const handle = (ch, fn) =>
  ipcMain.handle(ch, async (_e, ...a) => {
    try { return { ok: true, data: await fn(...a) }; }
    catch (err) { return { ok: false, error: (err && err.message) || String(err) }; }
  });

// ---------- Oturum ----------
let profile = null;
let browse = null; // dizin gezintisi için bağlantı
let xfer = null;   // aktarımlar için ayrı bağlantı
const pending = {};

function mk(tag) {
  return remoteLib.create(profile, { tag, log: (m) => log(tag, m), verifyHost });
}
async function ensure(key, get, set) {
  if (!profile) throw new Error('Sunucuya bağlı değil');
  const cur = get();
  if (cur && cur.alive) return cur;
  if (!pending[key]) {
    pending[key] = (async () => {
      const r = mk(key);
      await r.connect();
      set(r);
      return r;
    })().finally(() => { delete pending[key]; });
  }
  return pending[key];
}
const getBrowse = () => ensure('main', () => browse, (r) => { browse = r; });
const getXfer = () => ensure('xfer', () => xfer, (r) => { xfer = r; });

function closeAll() {
  for (const q of queue) if (q.status === 'queued' || q.status === 'active') { q.cancel = true; q.status = 'cancelled'; }
  if (browse) browse.close();
  if (xfer) xfer.close();
  browse = xfer = null;
  profile = null;
  emit();
}

function normalizeProfile(p) {
  return {
    ...p,
    protocol: p.protocol || 'ftp',
    host: String(p.host || '').trim(),
    port: Number(p.port) || undefined,
  };
}

// Sunucudan gelen bir ad, hedef dizinin dışına çıkamaz: path.join ".." öğelerini çözer.
function isSafeName(name) {
  if (typeof name !== 'string' || !name || name === '.' || name === '..') return false;
  if (name.includes('/') || name.includes('\0')) return false;
  // Windows ayrıcıları, sürücü harfleri ve yok sayılan son nokta/boşluklar.
  if (process.platform === 'win32' && (/[\\:]/.test(name) || /^[ .]+$/.test(name))) return false;
  return true;
}
function safeLocalPath(base, name) {
  if (!isSafeName(name)) return null;
  const full = path.join(base, name);
  const rel = path.relative(base, full);
  if (!rel || rel === '..' || rel.startsWith('..' + path.sep) || path.isAbsolute(rel)) return null;
  return full;
}
function safeRemotePath(base, name) {
  if (!isSafeName(name)) return null;
  const full = posix.join(base, name);
  const rel = posix.relative(base, full);
  if (!rel || rel === '..' || rel.startsWith('../') || posix.isAbsolute(rel)) return null;
  return full;
}

handle('conn:connect', async (p) => {
  closeAll();
  const np = normalizeProfile(p);
  if (!np.host) throw new Error('Sunucu adresi gerekli');
  if (np.protocol === 'sftp' && !np.user) throw new Error('SFTP için kullanıcı adı gerekli');
  profile = np;
  try {
    const b = mk('main');
    await b.connect();
    browse = b;
    const cwd = np.remoteDir || (await b.pwd());
    return { cwd };
  } catch (e) {
    profile = null;
    browse = null;
    throw e;
  }
});
handle('conn:disconnect', async () => { closeAll(); return true; });

// ---------- Uzak işlemler ----------
handle('remote:list', async (p) => {
  const b = await getBrowse();
  const list = await b.list(p);
  const entries = [];
  for (const e of list) {
    if (!isSafeName(e.name)) {
      log('warn', `Geçersiz uzak dosya adı atlandı: ${String(e.name).slice(0, 120)}`);
      continue;
    }
    entries.push({ ...e, path: posix.join(p, e.name) });
  }
  return { path: p, entries };
});
handle('remote:mkdir', async (p) => { await (await getBrowse()).mkdir(p); return true; });
handle('remote:rename', async (a, b) => { await (await getBrowse()).rename(a, b); return true; });
handle('remote:delete', async (items) => {
  const b = await getBrowse();
  for (const it of items) {
    if (it.isDir && !it.isLink) await b.removeDir(it.path);
    else await b.removeFile(it.path);
  }
  return true;
});

// ---------- Yerel işlemler ----------
function drives() {
  const out = [];
  for (let c = 65; c <= 90; c++) {
    const d = String.fromCharCode(c) + ':\\';
    try { fs.accessSync(d); out.push(d); } catch {}
  }
  return out;
}
handle('local:home', async () => os.homedir());
handle('local:list', async (p) => {
  if (p === '::drives') {
    return {
      path: p, parent: p,
      entries: drives().map((d) => ({ name: d, path: d, isDir: true, isDrive: true, size: 0, mtime: null })),
    };
  }
  const ents = await fsp.readdir(p, { withFileTypes: true });
  const entries = (
    await Promise.all(
      ents.map(async (d) => {
        const full = path.join(p, d.name);
        try {
          const st = await fsp.stat(full);
          return { name: d.name, path: full, isDir: st.isDirectory(), size: st.size, mtime: st.mtimeMs };
        } catch {
          return { name: d.name, path: full, isDir: d.isDirectory(), size: 0, mtime: null };
        }
      })
    )
  );
  const par = path.dirname(p);
  const parent = par === p ? (process.platform === 'win32' ? '::drives' : p) : par;
  return { path: p, parent, entries };
});
handle('local:mkdir', async (p) => { await fsp.mkdir(p, { recursive: false }); return true; });
handle('local:rename', async (a, b) => { await fsp.rename(a, b); return true; });
handle('local:delete', async (paths) => { for (const p of paths) await shell.trashItem(p); return true; });
handle('local:open', async (p) => { const r = await shell.openPath(p); if (r) throw new Error(r); return true; });
handle('local:join', async (a, b) => path.join(a, b));
handle('pick:key', async () => {
  const r = await dialog.showOpenDialog(win, { title: 'Özel anahtar dosyası seç', properties: ['openFile', 'showHiddenFiles'] });
  return r.canceled ? null : r.filePaths[0];
});
handle('pick:dir', async () => {
  const r = await dialog.showOpenDialog(win, { title: 'Klasör seç', properties: ['openDirectory'] });
  return r.canceled ? null : r.filePaths[0];
});

// ---------- Siteler ----------
handle('sites:list', async () =>
  readJSON('sites.json', []).map((s) => ({ ...s, password: dec(s.password), passphrase: dec(s.passphrase) })));
handle('sites:save', async (sites) => {
  writeJSON('sites.json', sites.map((s) => ({ ...s, password: enc(s.password), passphrase: enc(s.passphrase) })));
  return true;
});

// ---------- Aktarım kuyruğu ----------
const queue = [];
let nextId = 1;
let running = false;
let timer = null;
let expandSeen = new Set();
const MAX_DEPTH = 32;

function mkItem(o) {
  return { id: nextId++, status: 'queued', done: 0, size: 0, speed: 0, error: '', depth: 0, ...o };
}
function snapshot() {
  return queue.map((q) => ({
    id: q.id, dir: q.dir, name: q.name, src: q.src, dst: q.dst, size: q.size,
    done: q.done, status: q.status, error: q.error, isDir: q.isDir, speed: q.speed,
  }));
}
function emit() {
  if (timer) return;
  timer = setTimeout(() => { timer = null; send('transfer:update', snapshot()); }, 150);
}
function progress(it, bytes) {
  it.done = bytes;
  const now = Date.now();
  if (!it._t) { it._t = now; it._b = 0; }
  if (now - it._t >= 500) {
    const inst = ((bytes - it._b) * 1000) / (now - it._t);
    it.speed = it.speed ? it.speed * 0.6 + inst * 0.4 : inst;
    it._t = now;
    it._b = bytes;
  }
  emit();
}
function insertAfter(it, kids) {
  const i = queue.indexOf(it);
  queue.splice(i + 1, 0, ...kids);
}

async function expand(it, x) {
  // Korumalı sembolik bağlantılar aynı dizine sonsuz dönüş yapabilir; derinlik ve
  // ziyaret edilen yol sınırı kuyruğun sınırsız büyümesini engeller.
  if (it.depth >= MAX_DEPTH) {
    log('warn', `Klasör derinliği sınırına ulaşıldı: ${it.src}`);
    return;
  }
  const key = it.dir === 'up' ? path.resolve(it.src) : posix.normalize(it.src);
  if (expandSeen.has(key)) {
    log('warn', `Yinelenen klasör atlandı: ${it.src}`);
    return;
  }
  expandSeen.add(key);
  if (it.dir === 'up') {
    await x.mkdir(it.dst);
    const ents = await fsp.readdir(it.src, { withFileTypes: true });
    const kids = [];
    for (const d of ents) {
      const sp = path.join(it.src, d.name);
      const st = await fsp.stat(sp).catch(() => null);
      if (!st) continue;
      const dst = safeRemotePath(it.dst, d.name);
      if (!dst) { log('warn', `Geçersiz yerel dosya adı atlandı: ${String(d.name).slice(0, 120)}`); continue; }
      kids.push(mkItem({ dir: 'up', name: d.name, src: sp, dst, isDir: st.isDirectory(), size: st.isDirectory() ? 0 : st.size, parent: it.id, depth: it.depth + 1 }));
    }
    insertAfter(it, kids);
  } else {
    await fsp.mkdir(it.dst, { recursive: true });
    const l = await x.list(it.src);
    const kids = [];
    for (const e of l) {
      if (e.isLink) continue;
      const dst = safeLocalPath(it.dst, e.name);
      if (!dst) { log('warn', `Geçersiz uzak dosya adı atlandı: ${String(e.name).slice(0, 120)}`); continue; }
      kids.push(mkItem({ dir: 'down', name: e.name, src: posix.join(it.src, e.name), dst, isDir: e.isDir, size: e.isDir ? 0 : e.size || 0, parent: it.id, depth: it.depth + 1 }));
    }
    insertAfter(it, kids);
  }
}

async function runItem(it) {
  it.status = 'active';
  emit();
  try {
    const x = await getXfer();
    it.x = x;
    if (it.isDir) {
      await expand(it, x);
    } else {
      const cb = (b) => progress(it, b);
      if (it.dir === 'up') await x.upload(it.src, it.dst, cb);
      else {
        await fsp.mkdir(path.dirname(it.dst), { recursive: true });
        await x.download(it.src, it.dst, cb);
      }
      if (it.size) it.done = it.size;
    }
    if (it.cancel) throw new Error('iptal');
    it.status = 'done';
  } catch (e) {
    if (it.cancel) { it.status = 'cancelled'; it.error = ''; }
    else { it.status = 'error'; it.error = (e && e.message) || String(e); }
    if (it.dir === 'down' && !it.isDir) fsp.rm(it.dst, { force: true }).catch(() => {});
  } finally {
    delete it.x;
    it.speed = 0;
    emit();
  }
}

async function pump() {
  if (running) return;
  running = true;
  expandSeen.clear();
  const processed = [];
  try {
    let did = false;
    for (;;) {
      const it = queue.find((q) => q.status === 'queued');
      if (!it) break;
      did = true;
      processed.push(it.id);
      await runItem(it);
    }
    if (did) { send('transfer:update', snapshot()); send('transfer:idle', { ids: processed }); }
  } finally { running = false; }
}

function enqueue(dir, items, destDir) {
  for (const it of items) {
    const dst = dir === 'up' ? safeRemotePath(destDir, it.name) : safeLocalPath(destDir, it.name);
    if (!dst) { log('warn', `Geçersiz dosya adı atlandı: ${String(it.name).slice(0, 120)}`); continue; }
    queue.push(mkItem({ dir, name: it.name, src: it.path, dst, isDir: !!it.isDir, size: it.isDir ? 0 : it.size || 0 }));
  }
  emit();
  pump();
}

handle('transfer:add', async ({ dir, items, destDir }) => {
  if (!profile) throw new Error('Sunucuya bağlı değil');
  enqueue(dir, items, destDir);
  return true;
});
handle('transfer:addPaths', async ({ paths, destDir }) => {
  if (!profile) throw new Error('Sunucuya bağlı değil');
  const items = [];
  for (const p of paths) {
    const st = await fsp.stat(p).catch(() => null);
    if (st) items.push({ name: path.basename(p), path: p, isDir: st.isDirectory(), size: st.size });
  }
  enqueue('up', items, destDir);
  return true;
});
function cancelTree(it) {
  for (const c of queue) if (c.parent === it.id) cancelTree(c);
  if (it.status === 'queued') { it.status = 'cancelled'; }
  else if (it.status === 'active') { it.cancel = true; if (it.x) it.x.abort(); }
}
handle('transfer:cancel', async (id) => {
  const it = queue.find((q) => q.id === id);
  if (!it) return false;
  cancelTree(it);
  emit();
  return true;
});
handle('transfer:cancelAll', async () => {
  for (const it of queue) {
    if (it.status === 'queued') it.status = 'cancelled';
    else if (it.status === 'active') { it.cancel = true; if (it.x) it.x.abort(); }
  }
  emit();
  return true;
});
function retryTree(it) {
  if (it.status === 'error' || it.status === 'cancelled') {
    Object.assign(it, { status: 'queued', done: 0, error: '', cancel: false, speed: 0, _t: 0 });
  }
  for (const c of queue) if (c.parent === it.id) retryTree(c);
}
handle('transfer:retry', async (id) => {
  const it = queue.find((q) => q.id === id);
  if (it && (it.status === 'error' || it.status === 'cancelled')) {
    retryTree(it);
    emit();
    pump();
  }
  return true;
});
handle('transfer:clear', async () => {
  for (let i = queue.length - 1; i >= 0; i--) if (['done', 'cancelled'].includes(queue[i].status)) queue.splice(i, 1);
  emit();
  return true;
});

// ---------- Pencere ----------
const THEMES = {
  dark: { color: '#0f131b', symbolColor: '#c9d1e0' },
  light: { color: '#eef1f7', symbolColor: '#2b3445' },
};
handle('theme:set', async (t) => {
  const c = THEMES[t] || THEMES.dark;
  if (win && process.platform === 'win32') win.setTitleBarOverlay({ ...c, height: 44 });
  if (win) win.setBackgroundColor(c.color);
  return true;
});

function createWindow() {
  win = new BrowserWindow({
    width: 1360,
    height: 840,
    minWidth: 1020,
    minHeight: 620,
    backgroundColor: THEMES.dark.color,
    title: 'NimbusFTP',
    show: false,
    titleBarStyle: 'hidden',
    titleBarOverlay: { ...THEMES.dark, height: 44 },
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  win.once('ready-to-show', () => win.show());
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  win.webContents.on('will-navigate', (e) => e.preventDefault());
  win.loadFile(path.join(__dirname, 'renderer', 'index.html'));
}

app.whenReady().then(() => {
  Menu.setApplicationMenu(null);
  createWindow();
});
app.on('window-all-closed', () => { closeAll(); app.quit(); });
