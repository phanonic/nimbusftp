(() => {
'use strict';
const $ = (s, r = document) => r.querySelector(s);
const api = window.api;
const call = api.call;
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// ---------- Simgeler ----------
const P = {
  folder: '<path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>',
  file: '<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5"/>',
  drive: '<rect x="3" y="13" width="18" height="7" rx="2"/><path d="M3 13l3-8h12l3 8"/><path d="M7 16.5h.01"/>',
  up: '<path d="M12 19V5"/><path d="m5 12 7-7 7 7"/>',
  refresh: '<path d="M21 12a9 9 0 1 1-3-6.7"/><path d="M21 3v6h-6"/>',
  newdir: '<path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><path d="M12 11v5M9.5 13.5h5"/>',
  upload: '<path d="M12 16V4"/><path d="m6 10 6-6 6 6"/><path d="M4 20h16"/>',
  download: '<path d="M12 4v12"/><path d="m6 10 6 6 6-6"/><path d="M4 20h16"/>',
  trash: '<path d="M4 7h16"/><path d="M10 11v6M14 11v6"/><path d="M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12"/><path d="M9 7V4h6v3"/>',
  edit: '<path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/>',
  server: '<rect x="3" y="4" width="18" height="7" rx="2"/><rect x="3" y="13" width="18" height="7" rx="2"/><path d="M7 7.5h.01M7 16.5h.01"/>',
  x: '<path d="M18 6 6 18M6 6l12 12"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
  moon: '<path d="M21 12.8A9 9 0 1 1 11.2 3 7 7 0 0 0 21 12.8z"/>',
  plug: '<path d="M9 2v6M15 2v6"/><path d="M6 8h12v4a6 6 0 0 1-12 0z"/><path d="M12 18v4"/>',
  open: '<path d="M14 3h7v7"/><path d="M10 14 21 3"/><path d="M21 14v5a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5"/>',
  retry: '<path d="M3 12a9 9 0 1 0 3-6.7"/><path d="M3 3v6h6"/>',
  home: '<path d="m3 11 9-8 9 8"/><path d="M5 10v10h5v-6h4v6h5V10"/>',
};
const ico = (n, cls = '') => `<svg class="i ${cls}" viewBox="0 0 24 24">${P[n]}</svg>`;

// ---------- Durum ----------
const S = {
  local: { path: '', parent: '', entries: [], view: [], sel: new Set(), sort: { k: 'name', d: 1 }, anchor: -1 },
  remote: { path: '', entries: [], view: [], sel: new Set(), sort: { k: 'name', d: 1 }, anchor: -1, connected: false, label: '' },
  active: 'local',
  transfers: [],
  sites: [],
  profile: null,
};
const isWin = api.platform === 'win32';
const side$ = (s) => $(`#pane-${s}`);

// ---------- Yardımcılar ----------
function fmtSize(n) {
  if (n == null) return '';
  const u = ['B', 'KB', 'MB', 'GB', 'TB'];
  let i = 0, v = n;
  while (v >= 1024 && i < u.length - 1) { v /= 1024; i++; }
  return (i ? v.toFixed(v >= 100 ? 0 : 1) : v) + ' ' + u[i];
}
const fmtDate = (t) => (t ? new Date(t).toLocaleString('tr-TR', { dateStyle: 'short', timeStyle: 'short' }) : '');
const fmtSpeed = (n) => (n > 0 ? fmtSize(n) + '/sn' : '');
const pdirname = (p) => { const i = p.replace(/\/+$/, '').lastIndexOf('/'); return i <= 0 ? '/' : p.slice(0, i); };
const pjoin = (a, b) => (a.endsWith('/') ? a + b : a + '/' + b);
function pnorm(base, input) {
  let p = input.startsWith('/') ? input : pjoin(base, input);
  const out = [];
  for (const seg of p.split('/')) { if (!seg || seg === '.') continue; if (seg === '..') out.pop(); else out.push(seg); }
  return '/' + out.join('/');
}

function toast(msg, kind = '') {
  const t = document.createElement('div');
  t.className = 'toast ' + kind;
  t.textContent = msg;
  $('#toasts').appendChild(t);
  setTimeout(() => t.remove(), kind === 'err' ? 7000 : 3500);
}
const setStatus = (t) => { $('#st-left').textContent = t; };

// ---------- Diyaloglar ----------
function modal(html, { cls = '', onMount } = {}) {
  return new Promise((resolve) => {
    const ov = $('#overlay');
    ov.innerHTML = `<div class="modal ${cls}">${html}</div>`;
    ov.classList.remove('hidden');
    const close = (v) => { ov.classList.add('hidden'); ov.innerHTML = ''; document.removeEventListener('keydown', onKey, true); resolve(v); };
    const onKey = (e) => { if (e.key === 'Escape') { e.stopPropagation(); close(null); } };
    document.addEventListener('keydown', onKey, true);
    onMount && onMount(ov.firstElementChild, close);
  });
}
function askInput(title, label, value = '', ok = 'Tamam') {
  return modal(`<h3>${esc(title)}</h3><div class="body">${esc(label)}<input id="m-in" spellcheck="false"></div><div class="foot"><button class="btn" id="m-no">Vazgeç</button><button class="btn primary" id="m-ok">${esc(ok)}</button></div>`, {
    onMount(m, close) {
      const i = $('#m-in', m); i.value = value; i.focus();
      const dot = value.lastIndexOf('.'); i.setSelectionRange(0, dot > 0 ? dot : value.length);
      $('#m-ok', m).onclick = () => close(i.value.trim() || null);
      $('#m-no', m).onclick = () => close(null);
      i.onkeydown = (e) => { if (e.key === 'Enter') close(i.value.trim() || null); };
    },
  });
}
function askConfirm(title, msg, ok = 'Evet', danger = false) {
  return modal(`<h3>${esc(title)}</h3><div class="body">${msg}</div><div class="foot"><button class="btn" id="m-no">Vazgeç</button><button class="btn ${danger ? 'danger' : 'primary'}" id="m-ok">${esc(ok)}</button></div>`, {
    onMount(m, close) {
      $('#m-ok', m).onclick = () => close(true); $('#m-no', m).onclick = () => close(false);
      $('#m-ok', m).focus();
    },
  }).then((v) => !!v);
}

// ---------- Panel çizimi ----------
function buildPane(side) {
  const local = side === 'local';
  side$(side).innerHTML = `
    <div class="pane-head">
      <div class="pane-title">${ico(local ? 'drive' : 'server')} ${local ? 'Bilgisayarım' : 'Sunucu'}</div>
      <span class="pill" id="${side}-pill">${local ? 'Yerel' : 'Bağlı değil'}</span>
      <span class="grow"></span>
      ${local ? '' : `<button class="btn sm" id="remote-disc" title="Bağlantıyı kes">${ico('plug')} Kes</button>`}
      <button class="btn sm primary" data-act="transfer" title="F5">${ico(local ? 'upload' : 'download')} ${local ? 'Yükle' : 'İndir'}</button>
    </div>
    <div class="pane-tools">
      <button class="btn icon ghost" data-act="up" title="Üst klasör (Backspace)">${ico('up')}</button>
      ${local ? `<button class="btn icon ghost" data-act="home" title="Ev dizini">${ico('home')}</button>` : ''}
      <button class="btn icon ghost" data-act="refresh" title="Yenile">${ico('refresh')}</button>
      <button class="btn icon ghost" data-act="mkdir" title="Yeni klasör (F7)">${ico('newdir')}</button>
      <button class="btn icon ghost" data-act="rename" title="Yeniden adlandır (F2)">${ico('edit')}</button>
      <button class="btn icon ghost" data-act="delete" title="Sil (Del)">${ico('trash')}</button>
      <input class="path" spellcheck="false" placeholder="${local ? 'Yerel yol' : 'Uzak yol'}">
    </div>
    <div class="tbl-wrap">
      <table><thead><tr><th data-k="name">Ad</th><th data-k="size" class="s" style="width:90px;text-align:right">Boyut</th><th data-k="mtime" style="width:140px">Değiştirilme</th></tr></thead><tbody></tbody></table>
      <div class="empty hidden"></div>
    </div>
    <div class="pane-foot"><span class="cnt"></span><span class="grow"></span><span class="selinfo"></span></div>`;
}

function sortedEntries(P) {
  const { k, d } = P.sort;
  return [...P.entries].sort((a, b) => {
    if (a.isDir !== b.isDir) return a.isDir ? -1 : 1;
    let r;
    if (k === 'name') r = a.name.localeCompare(b.name, 'tr', { numeric: true, sensitivity: 'base' });
    else r = (a[k] || 0) - (b[k] || 0);
    return r * d || a.name.localeCompare(b.name, 'tr');
  });
}

function render(side) {
  const P = S[side], root = side$(side);
  P.view = sortedEntries(P);
  const tb = $('tbody', root);
  tb.innerHTML = P.view.map((e, i) =>
    `<tr data-i="${i}" draggable="true" class="${e.isDir ? 'dir' : ''} ${e.isDrive ? 'drive' : ''} ${P.sel.has(e.path) ? 'sel' : ''}"><td class="n">${ico(e.isDrive ? 'drive' : e.isDir ? 'folder' : 'file')}<span title="${esc(e.name)}">${esc(e.name)}</span></td><td class="s">${e.isDir ? '' : fmtSize(e.size)}</td><td class="d">${fmtDate(e.mtime)}</td></tr>`).join('');
  root.querySelectorAll('thead th').forEach((th) => {
    th.classList.toggle('sorted', th.dataset.k === P.sort.k);
    th.classList.toggle('desc', th.dataset.k === P.sort.k && P.sort.d < 0);
  });
  const pathInput = $('.path', root);
  if (document.activeElement !== pathInput) pathInput.value = P.path === '::drives' ? 'Bu Bilgisayar' : P.path || '';
  root.classList.toggle('active', S.active === side);
  const dirs = P.entries.filter((e) => e.isDir).length;
  $('.cnt', root).textContent = P.entries.length ? `${dirs} klasör, ${P.entries.length - dirs} dosya` : '';
  const sel = selected(side);
  $('.selinfo', root).textContent = sel.length ? `${sel.length} seçili · ${fmtSize(sel.reduce((a, e) => a + (e.isDir ? 0 : e.size || 0), 0))}` : '';
  const empty = $('.empty', root);
  if (side === 'remote' && !P.connected) {
    empty.classList.remove('hidden');
    empty.innerHTML = `${ico('server').replace('class="i "', 'class="i" style="width:44px;height:44px;opacity:.5"')}<b>Sunucuya bağlı değil</b><span>Üstteki hızlı bağlantı alanını kullanın<br>veya kayıtlı sitelerinizden birini seçin.</span><button class="btn primary" id="empty-sites">Site Yöneticisi'ni aç</button>`;
    $('#empty-sites', empty).onclick = openSites;
  } else if (!P.entries.length) {
    empty.classList.remove('hidden');
    empty.innerHTML = '<span>Bu klasör boş</span>';
  } else empty.classList.add('hidden');
  const pill = $(`#${side}-pill`);
  if (side === 'remote') { pill.textContent = P.connected ? P.label : 'Bağlı değil'; pill.classList.toggle('on', P.connected); $('#remote-disc').classList.toggle('hidden', !P.connected); }
}
const selected = (side) => S[side].view.filter((e) => S[side].sel.has(e.path));

// Seçim değişikliklerinde tabloyu yeniden kurmayız: satırların yerine geçen bir
// innerHTML, çift tıklamanın ikinci tıklamasında hedefi kaybettiriyordu.
function updateSelection(side) {
  const P = S[side], root = side$(side);
  root.querySelectorAll('tbody tr').forEach((tr) => {
    const e = P.view[+tr.dataset.i];
    tr.classList.toggle('sel', !!e && P.sel.has(e.path));
  });
  root.classList.toggle('active', S.active === side);
  const sel = selected(side);
  $('.selinfo', root).textContent = sel.length ? `${sel.length} seçili · ${fmtSize(sel.reduce((a, e) => a + (e.isDir ? 0 : e.size || 0), 0))}` : '';
}

async function load(side, p, keepSel = false) {
  const P = S[side];
  try {
    const r = await call(side === 'local' ? 'local:list' : 'remote:list', p);
    P.path = r.path; P.entries = r.entries;
    if (side === 'local') P.parent = r.parent;
    if (!keepSel) P.sel = new Set(); else { const have = new Set(r.entries.map((e) => e.path)); P.sel = new Set([...P.sel].filter((x) => have.has(x))); }
    P.anchor = -1;
    render(side);
    return true;
  } catch (e) {
    toast(`${p}: ${e.message}`, 'err');
    if (side === 'remote' && /bağlı değil|closed|ECONN|ETIMEDOUT|reset/i.test(e.message)) setStatus('Bağlantı sorunu — yenileyerek tekrar deneyin');
    return false;
  }
}
const refresh = (side) => load(side, S[side].path, true);

function goUp(side) {
  const P = S[side];
  if (side === 'local') { if (P.path === '::drives') return; load('local', P.parent); }
  else if (P.connected && P.path !== '/') load('remote', pdirname(P.path));
}

async function openEntry(side, e) {
  if (e.isDir) await load(side, e.path);
  else if (side === 'local') { S.local.sel = new Set([e.path]); updateSelection('local'); S.remote.connected ? transferSelected('local') : call('local:open', e.path).catch((x) => toast(x.message, 'err')); }
  else { S.remote.sel = new Set([e.path]); updateSelection('remote'); transferSelected('remote'); }
}

// ---------- Bağlantı ----------
async function connect(p) {
  const btn = $('#q-go'); btn.disabled = true;
  setStatus(`${p.host} sunucusuna bağlanılıyor…`);
  try {
    const r = await call('conn:connect', p);
    S.profile = p;
    S.remote.connected = true;
    S.remote.label = `${p.anonymous ? 'anonim' : p.user || ''}@${p.host} · ${p.protocol.toUpperCase()}`;
    S.remote.entries = []; S.remote.sel = new Set();
    S.active = 'remote';
    await load('remote', r.cwd);
    if (p.localDir) load('local', p.localDir);
    setStatus(`Bağlandı: ${p.host}`);
    toast(`${p.host} sunucusuna bağlanıldı`, 'ok');
  } catch (e) {
    S.remote.connected = false; render('remote');
    setStatus('Bağlantı kurulamadı');
    let hint = '';
    if (/self.signed|certificate|CERT_/i.test(e.message)) hint = '\nİpucu: Site Yöneticisi\'nde "Güvenilmeyen sertifikalara izin ver" seçeneğini kullanabilirsiniz.';
    toast(`Bağlantı hatası: ${e.message}${hint}`, 'err');
  } finally { btn.disabled = false; }
}
async function disconnect() {
  await call('conn:disconnect').catch(() => {});
  S.remote = { ...S.remote, connected: false, entries: [], view: [], sel: new Set(), path: '', label: '' };
  render('remote'); setStatus('Bağlantı kesildi');
}

const DEFPORT = { ftp: 21, ftpes: 21, ftps: 990, sftp: 22 };
$('#quick').addEventListener('submit', (e) => {
  e.preventDefault();
  let host = $('#q-host').value.trim(), proto = $('#q-proto').value, port = $('#q-port').value.trim(), user = $('#q-user').value.trim(), pass = $('#q-pass').value, dir = '';
  if (/^[a-z]+:\/\//i.test(host)) {
    try {
      const u = new URL(host);
      proto = { ftp: 'ftp', ftps: 'ftps', sftp: 'sftp', ssh: 'sftp' }[u.protocol.replace(':', '')] || proto;
      host = u.hostname; port = u.port || port; user = decodeURIComponent(u.username) || user; pass = decodeURIComponent(u.password) || pass; dir = decodeURIComponent(u.pathname).replace(/^\/$/, '');
      $('#q-proto').value = proto; $('#q-host').value = host; $('#q-port').value = port; $('#q-user').value = user; $('#q-pass').value = pass;
    } catch { return toast('Geçersiz adres', 'err'); }
  }
  if (!host) return $('#q-host').focus();
  connect({ protocol: proto, host, port: Number(port) || DEFPORT[proto], user, password: pass, anonymous: !user && proto !== 'sftp', remoteDir: dir });
});
$('#q-proto').addEventListener('change', () => { const p = $('#q-port'); if (!p.value || Object.values(DEFPORT).includes(Number(p.value))) p.value = ''; p.placeholder = DEFPORT[$('#q-proto').value]; });
$('#q-port').placeholder = 21;

// ---------- Site Yöneticisi ----------
function openSites() {
  let sites = S.sites.map((s) => ({ ...s }));
  let cur = sites[0] ? sites[0].id : null;
  const blank = () => ({ id: 's' + Date.now().toString(36), name: 'Yeni site', protocol: 'ftp', host: '', port: 21, user: '', password: '', anonymous: false, keyPath: '', passphrase: '', remoteDir: '', localDir: '', allowInvalidCert: false });
  return modal('<h3>Site Yöneticisi</h3><div class="sm-layout"><div class="sm-list"><div class="sm-items"></div><div class="btns"><button class="btn sm primary" id="sm-new">+ Yeni</button><button class="btn sm" id="sm-dup">Çoğalt</button><button class="btn sm" id="sm-del">Sil</button></div></div><div class="sm-form"></div></div><div class="foot"><button class="btn" id="sm-close">Kapat</button><button class="btn" id="sm-save">Kaydet</button><button class="btn primary" id="sm-conn">Kaydet ve bağlan</button></div>', {
    cls: 'wide',
    onMount(m, close) {
      const list = $('.sm-items', m), form = $('.sm-form', m);
      const site = () => sites.find((s) => s.id === cur);
      const drawList = () => {
        list.innerHTML = sites.map((s) => `<div class="sm-item ${s.id === cur ? 'on' : ''}" data-id="${s.id}"><b>${esc(s.name || '(adsız)')}</b><small>${esc(s.protocol.toUpperCase())} · ${esc(s.host || '—')}</small></div>`).join('') || '<div class="sm-empty" style="padding:20px;text-align:center">Henüz site yok</div>';
      };
      const drawForm = () => {
        const s = site();
        if (!s) { form.innerHTML = '<div class="sm-empty">Soldan bir site seçin veya yeni ekleyin.</div>'; return; }
        const sftp = s.protocol === 'sftp';
        form.innerHTML = `
          <label>Site adı<input data-f="name" value="${esc(s.name)}"></label>
          <label>Protokol<select data-f="protocol">${[['ftp', 'FTP'], ['ftpes', 'FTPES — Açık TLS (AUTH TLS)'], ['ftps', 'FTPS — Örtük TLS'], ['sftp', 'SFTP — SSH']].map(([v, t]) => `<option value="${v}" ${s.protocol === v ? 'selected' : ''}>${t}</option>`).join('')}</select></label>
          <label>Sunucu<input data-f="host" value="${esc(s.host)}" spellcheck="false"></label>
          <label>Port<input data-f="port" value="${esc(s.port || '')}" inputmode="numeric"></label>
          ${sftp ? '' : `<label class="chk full"><input type="checkbox" data-f="anonymous" ${s.anonymous ? 'checked' : ''}> Anonim giriş</label>`}
          <label>Kullanıcı adı<input data-f="user" value="${esc(s.user)}" spellcheck="false" ${s.anonymous && !sftp ? 'disabled' : ''}></label>
          <label>Parola<input data-f="password" type="password" value="${esc(s.password)}" ${s.anonymous && !sftp ? 'disabled' : ''}></label>
          ${sftp ? `<label class="full">Özel anahtar dosyası (isteğe bağlı)<span class="row"><input data-f="keyPath" value="${esc(s.keyPath)}" spellcheck="false"><button class="btn" id="pick-key">Gözat…</button></span></label><label class="full">Anahtar parola ifadesi<input data-f="passphrase" type="password" value="${esc(s.passphrase)}"></label>` : ''}
          <label>Uzak başlangıç dizini<input data-f="remoteDir" value="${esc(s.remoteDir)}" placeholder="/" spellcheck="false"></label>
          <label>Yerel başlangıç klasörü<span class="row"><input data-f="localDir" value="${esc(s.localDir)}" spellcheck="false"><button class="btn" id="pick-dir">Gözat…</button></span></label>
          ${sftp ? '' : `<label class="chk full"><input type="checkbox" data-f="allowInvalidCert" ${s.allowInvalidCert ? 'checked' : ''}> Güvenilmeyen / kendinden imzalı sertifikalara izin ver (yalnızca FTPES/FTPS)</label>`}`;
        const pk = $('#pick-key', form); if (pk) pk.onclick = async () => { const f = await call('pick:key'); if (f) { s.keyPath = f; drawForm(); } };
        const pd = $('#pick-dir', form); if (pd) pd.onclick = async () => { const f = await call('pick:dir'); if (f) { s.localDir = f; drawForm(); } };
      };
      form.addEventListener('input', (e) => {
        const f = e.target.dataset.f, s = site(); if (!f || !s) return;
        s[f] = e.target.type === 'checkbox' ? e.target.checked : e.target.value;
        if (f === 'name' || f === 'host') drawList();
        if (f === 'anonymous') drawForm();
      });
      form.addEventListener('change', (e) => {
        const s = site();
        if (e.target.dataset.f === 'protocol' && s) {
          const was = DEFPORT[s.protocol]; s.protocol = e.target.value;
          if (!s.port || Number(s.port) === was) s.port = DEFPORT[s.protocol];
          drawList(); drawForm();
        }
      });
      list.addEventListener('click', (e) => { const it = e.target.closest('.sm-item'); if (it) { cur = it.dataset.id; drawList(); drawForm(); } });
      $('#sm-new', m).onclick = () => { const s = blank(); sites.push(s); cur = s.id; drawList(); drawForm(); };
      $('#sm-dup', m).onclick = () => { const s = site(); if (!s) return; const c = { ...s, id: blank().id, name: s.name + ' (kopya)' }; sites.push(c); cur = c.id; drawList(); drawForm(); };
      $('#sm-del', m).onclick = () => { const s = site(); if (!s) return; sites = sites.filter((x) => x !== s); cur = sites[0] ? sites[0].id : null; drawList(); drawForm(); };
      const save = async () => { await call('sites:save', sites); S.sites = sites.map((s) => ({ ...s })); };
      $('#sm-save', m).onclick = async () => { try { await save(); toast('Siteler kaydedildi', 'ok'); } catch (e) { toast(e.message, 'err'); } };
      $('#sm-close', m).onclick = () => close(null);
      $('#sm-conn', m).onclick = async () => {
        const s = site(); if (!s) return;
        if (!s.host.trim()) return toast('Sunucu adresi gerekli', 'err');
        try { await save(); } catch (e) { return toast(e.message, 'err'); }
        close(null);
        $('#q-proto').value = s.protocol; $('#q-host').value = s.host; $('#q-port').value = s.port || ''; $('#q-user').value = s.user || ''; $('#q-pass').value = s.password || '';
        connect({ ...s, port: Number(s.port) || DEFPORT[s.protocol] });
      };
      drawList(); drawForm();
    },
  });
}
$('#btn-sites').innerHTML = `${ico('server')} Site Yöneticisi`;
$('#btn-sites').onclick = openSites;

// ---------- Dosya işlemleri ----------
async function doMkdir(side) {
  const P = S[side]; if (side === 'remote' && !P.connected) return; if (P.path === '::drives') return;
  const name = await askInput('Yeni klasör', 'Klasör adı:', 'Yeni klasör', 'Oluştur'); if (!name) return;
  try {
    if (side === 'local') await call('local:mkdir', await call('local:join', P.path, name));
    else await call('remote:mkdir', pjoin(P.path, name));
    await refresh(side);
  } catch (e) { toast(e.message, 'err'); }
}
async function doRename(side) {
  const sel = selected(side); if (sel.length !== 1 || sel[0].isDrive) return;
  const e = sel[0];
  const name = await askInput('Yeniden adlandır', `"${e.name}" için yeni ad:`, e.name, 'Adlandır'); if (!name || name === e.name) return;
  try {
    if (side === 'local') await call('local:rename', e.path, await call('local:join', S.local.path, name));
    else await call('remote:rename', e.path, pjoin(S.remote.path, name));
    await refresh(side);
  } catch (x) { toast(x.message, 'err'); }
}
async function doDelete(side) {
  const sel = selected(side).filter((e) => !e.isDrive); if (!sel.length) return;
  const what = sel.length === 1 ? `<b>${esc(sel[0].name)}</b>` : `<b>${sel.length} öğe</b>`;
  const ok = await askConfirm('Silinsin mi?', side === 'local' ? `${what} Geri Dönüşüm Kutusu'na taşınacak.` : `${what} sunucudan <b>kalıcı olarak</b> silinecek.`, 'Sil', true);
  if (!ok) return;
  try {
    if (side === 'local') await call('local:delete', sel.map((e) => e.path));
    else await call('remote:delete', sel.map((e) => ({ path: e.path, isDir: e.isDir, isLink: e.isLink })));
  } catch (e) { toast(e.message, 'err'); }
  refresh(side);
}

async function transferSelected(from) {
  if (!S.remote.connected) return toast('Önce bir sunucuya bağlanın', 'err');
  const sel = selected(from).filter((e) => !e.isDrive);
  if (!sel.length) return toast('Aktarmak için öğe seçin');
  const to = from === 'local' ? 'remote' : 'local';
  const dest = S[to].path;
  if (dest === '::drives') return toast('Önce hedef klasörü açın', 'err');
  const clash = sel.filter((e) => S[to].entries.some((x) => x.name === e.name && !x.isDir && !e.isDir));
  if (clash.length) {
    const ok = await askConfirm('Üzerine yazılsın mı?', `${clash.length === 1 ? `<b>${esc(clash[0].name)}</b>` : `<b>${clash.length} dosya</b>`} hedefte zaten var ve üzerine yazılacak.`, 'Üzerine yaz');
    if (!ok) return;
  }
  try {
    await call('transfer:add', { dir: from === 'local' ? 'up' : 'down', items: sel.map((e) => ({ name: e.name, path: e.path, isDir: e.isDir, size: e.size })), destDir: dest });
    showTab('transfers');
  } catch (e) { toast(e.message, 'err'); }
}

// ---------- Olaylar: paneller ----------
function wirePane(side) {
  const root = side$(side), P = S[side];
  root.addEventListener('mousedown', () => { if (S.active !== side) { S.active = side; updateSelection('local'); updateSelection('remote'); } });
  root.addEventListener('click', (e) => {
    const b = e.target.closest('[data-act]');
    if (b) {
      const a = b.dataset.act;
      if (a === 'up') goUp(side);
      else if (a === 'home') call('local:home').then((h) => load('local', h));
      else if (a === 'refresh') { if (side === 'local' || P.connected) refresh(side); }
      else if (a === 'mkdir') doMkdir(side);
      else if (a === 'rename') doRename(side);
      else if (a === 'delete') doDelete(side);
      else if (a === 'transfer') transferSelected(side);
      return;
    }
    if (e.target.closest('#remote-disc')) return disconnect();
    const th = e.target.closest('thead th');
    if (th) { P.sort = { k: th.dataset.k, d: P.sort.k === th.dataset.k ? -P.sort.d : 1 }; return render(side); }
    const tr = e.target.closest('tbody tr');
    if (!tr) { if (e.target.closest('.tbl-wrap') && !e.ctrlKey) { P.sel = new Set(); updateSelection(side); } return; }
    const i = +tr.dataset.i, en = P.view[i];
    if (e.shiftKey && P.anchor >= 0) {
      const [a, z] = [Math.min(P.anchor, i), Math.max(P.anchor, i)];
      P.sel = new Set(P.view.slice(a, z + 1).map((x) => x.path));
    } else if (e.ctrlKey || e.metaKey) {
      P.sel.has(en.path) ? P.sel.delete(en.path) : P.sel.add(en.path); P.anchor = i;
    } else { P.sel = new Set([en.path]); P.anchor = i; }
    updateSelection(side);
  });
  root.addEventListener('dblclick', (e) => { const tr = e.target.closest('tbody tr'); if (tr) openEntry(side, P.view[+tr.dataset.i]); });
  const pi = $('.path', root);
  pi.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter') return;
    const v = pi.value.trim(); if (!v) return;
    if (side === 'local') load('local', /^bu bilgisayar$/i.test(v) ? '::drives' : v); else if (P.connected) load('remote', pnorm(P.path || '/', v));
    pi.blur();
  });
  pi.addEventListener('blur', () => {
    const P = S[side];
    pi.value = P.path === '::drives' ? 'Bu Bilgisayar' : P.path || '';
  });

  // sağ tık
  root.addEventListener('contextmenu', (e) => {
    e.preventDefault();
    const tr = e.target.closest('tbody tr');
    if (tr) { const en = P.view[+tr.dataset.i]; if (!P.sel.has(en.path)) { P.sel = new Set([en.path]); P.anchor = +tr.dataset.i; updateSelection(side); } }
    const sel = selected(side), one = sel.length === 1 ? sel[0] : null, conn = S.remote.connected;
    const items = [];
    if (one && one.isDir) items.push(['open', 'Aç', () => load(side, one.path), 'Enter']);
    if (sel.length && !sel.some((x) => x.isDrive) && (side === 'local' ? conn : conn)) items.push([side === 'local' ? 'upload' : 'download', side === 'local' ? 'Sunucuya yükle' : 'Bilgisayara indir', () => transferSelected(side), 'F5']);
    if (side === 'local' && one && !one.isDir) items.push(['open', 'Varsayılan uygulamayla aç', () => call('local:open', one.path).catch((x) => toast(x.message, 'err'))]);
    if (items.length) items.push('-');
    if (one && !one.isDrive) items.push(['edit', 'Yeniden adlandır', () => doRename(side), 'F2']);
    if (sel.length && !sel.some((x) => x.isDrive)) items.push(['trash', 'Sil', () => doDelete(side), 'Del', true]);
    if (items.length && items[items.length - 1] !== '-') items.push('-');
    items.push(['newdir', 'Yeni klasör', () => doMkdir(side), 'F7'], ['refresh', 'Yenile', () => refresh(side), '']);
    showCtx(e.clientX, e.clientY, items);
  });

  // sürükle & bırak
  root.addEventListener('dragstart', (e) => {
    const tr = e.target.closest('tbody tr'); if (!tr) return;
    const en = P.view[+tr.dataset.i];
    if (!P.sel.has(en.path)) { P.sel = new Set([en.path]); updateSelection(side); }
    e.dataTransfer.setData('application/x-nimbus', side); e.dataTransfer.effectAllowed = 'copy';
  });
  const accepts = (e) => {
    const t = [...e.dataTransfer.types];
    return (t.includes('application/x-nimbus') && !dragFromSelf) || (side === 'remote' && t.includes('Files') && !t.includes('application/x-nimbus'));
  };
  let dragFromSelf = false;
  root.addEventListener('dragstart', () => { dragFromSelf = true; });
  document.addEventListener('dragend', () => { dragFromSelf = false; root.classList.remove('dropping'); });
  root.addEventListener('dragover', (e) => { const t = [...e.dataTransfer.types]; if (t.includes('application/x-nimbus') && dragFromSelf) return; if (accepts(e)) { e.preventDefault(); root.classList.add('dropping'); } });
  root.addEventListener('dragleave', (e) => { if (!root.contains(e.relatedTarget)) root.classList.remove('dropping'); });
  root.addEventListener('drop', async (e) => {
    root.classList.remove('dropping');
    if (!accepts(e)) return; e.preventDefault();
    const src = e.dataTransfer.getData('application/x-nimbus');
    if (src && src !== side) return transferSelected(src);
    if (side === 'remote' && e.dataTransfer.files.length) {
      if (!S.remote.connected) return toast('Önce bir sunucuya bağlanın', 'err');
      const paths = [...e.dataTransfer.files].map((f) => api.pathForFile(f)).filter(Boolean);
      try { await call('transfer:addPaths', { paths, destDir: S.remote.path }); showTab('transfers'); } catch (x) { toast(x.message, 'err'); }
    }
  });
}

// ---------- Bağlam menüsü ----------
function showCtx(x, y, items) {
  const c = $('#ctx');
  c.innerHTML = items.map((it, i) => it === '-' ? '<div class="sep"></div>' : `<div class="it ${it[4] ? 'danger' : ''}" data-i="${i}">${ico(it[0])}<span>${esc(it[1])}</span>${it[3] ? `<kbd>${it[3]}</kbd>` : ''}</div>`).join('');
  c.classList.remove('hidden');
  const w = c.offsetWidth, h = c.offsetHeight;
  c.style.left = Math.min(x, innerWidth - w - 6) + 'px'; c.style.top = Math.min(y, innerHeight - h - 6) + 'px';
  c.onclick = (e) => { const it = e.target.closest('.it'); if (it) { hideCtx(); items[+it.dataset.i][2](); } };
}
const hideCtx = () => $('#ctx').classList.add('hidden');
document.addEventListener('mousedown', (e) => { if (!e.target.closest('#ctx')) hideCtx(); });
window.addEventListener('blur', hideCtx);

// ---------- Klavye ----------
document.addEventListener('keydown', (e) => {
  if (!$('#overlay').classList.contains('hidden')) return;
  const tag = (e.target.tagName || '').toLowerCase();
  if (tag === 'input' || tag === 'select') return;
  const side = S.active, P = S[side];
  if (e.key === 'F5') { e.preventDefault(); transferSelected(side); }
  else if (e.key === 'F2') { e.preventDefault(); doRename(side); }
  else if (e.key === 'F7') { e.preventDefault(); doMkdir(side); }
  else if (e.key === 'Delete') { e.preventDefault(); doDelete(side); }
  else if (e.key === 'Backspace') { e.preventDefault(); goUp(side); }
  else if (e.key === 'Tab') { e.preventDefault(); S.active = side === 'local' ? 'remote' : 'local'; updateSelection('local'); updateSelection('remote'); }
  else if (e.key === 'Enter') { const s = selected(side); if (s.length === 1) openEntry(side, s[0]); }
  else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'a') { e.preventDefault(); P.sel = new Set(P.view.filter((x) => !x.isDrive).map((x) => x.path)); updateSelection(side); }
  else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
    e.preventDefault();
    if (!P.view.length) return;
    const cur = P.view.findIndex((x) => P.sel.has(x.path));
    const n = Math.max(0, Math.min(P.view.length - 1, (cur < 0 ? (e.key === 'ArrowDown' ? -1 : P.view.length) : cur) + (e.key === 'ArrowDown' ? 1 : -1)));
    P.sel = new Set([P.view[n].path]); P.anchor = n; updateSelection(side);
    const row = $(`tbody tr[data-i="${n}"]`, side$(side)); if (row) row.scrollIntoView({ block: 'nearest' });
  }
});

// ---------- Aktarımlar ----------
const STATUS = { queued: ['Sırada', ''], active: ['Aktarılıyor', 'st-act'], done: ['Tamamlandı', 'st-ok'], error: ['Hata', 'st-err'], cancelled: ['İptal edildi', ''] };
function renderTransfers() {
  const t = S.transfers, files = t.filter((x) => !x.isDir);
  const act = t.filter((x) => x.status === 'active').length, q = t.filter((x) => x.status === 'queued').length;
  $('#tr-badge').textContent = act + q;
  $('#tr-summary').textContent = t.length ? `${act} etkin · ${q} sırada · ${files.filter((x) => x.status === 'done').length} tamamlandı · ${files.filter((x) => x.status === 'error').length} hatalı` : '';
  $('#tr-empty').classList.toggle('hidden', t.length > 0);
  // Çok büyük kuyruklarda yalnızca ilgili öğeleri göster
  const shown = t.filter((x) => !(x.isDir && x.status === 'done')).slice(-400).reverse().sort((a, b) => (a.status === 'active' ? -1 : 0) - (b.status === 'active' ? -1 : 0));
  $('#tr-body').innerHTML = shown.map((x) => {
    const pct = x.status === 'done' ? 100 : x.size ? Math.min(100, (x.done / x.size) * 100) : 0;
    const [label, cls] = STATUS[x.status];
    return `<tr><td>${ico(x.dir === 'up' ? 'upload' : 'download', x.dir)}</td><td title="${esc(x.dir === 'up' ? x.src + ' → ' + x.dst : x.src + ' → ' + x.dst)}">${x.isDir ? ico('folder') + ' ' : ''}${esc(x.name)}</td><td class="s" style="text-align:left">${x.isDir ? '' : fmtSize(x.size)}</td><td>${x.isDir ? '' : `<div class="bar ${x.status}"><i style="width:${pct}%"></i></div>`}</td><td class="s" style="text-align:left">${x.status === 'active' ? fmtSpeed(x.speed) : ''}</td><td class="${cls}" title="${esc(x.error)}">${label}${x.error ? ': ' + esc(x.error) : ''}</td><td>${x.status === 'active' || x.status === 'queued' ? `<button class="btn icon ghost sm" data-cancel="${x.id}" title="İptal">${ico('x')}</button>` : x.status === 'error' || x.status === 'cancelled' ? `<button class="btn icon ghost sm" data-retry="${x.id}" title="Tekrar dene">${ico('retry')}</button>` : ''}</td></tr>`;
  }).join('');
}
$('#tr-body').addEventListener('click', (e) => {
  const c = e.target.closest('[data-cancel]'), r = e.target.closest('[data-retry]');
  if (c) call('transfer:cancel', +c.dataset.cancel); else if (r) call('transfer:retry', +r.dataset.retry);
});
$('#tr-cancel').onclick = () => call('transfer:cancelAll');
$('#tr-clear').onclick = () => call('transfer:clear');
api.on('transfer:update', (list) => { S.transfers = list; renderTransfers(); });
api.on('transfer:idle', (info) => {
  const ids = info && info.ids;
  const batch = ids ? S.transfers.filter((x) => ids.includes(x.id)) : [];
  const errs = batch.filter((x) => x.status === 'error' && !x.isDir).length;
  const ok = batch.filter((x) => x.status === 'done' && !x.isDir).length;
  if (S.remote.connected) refresh('remote');
  refresh('local');
  if (errs) toast(`${ok} dosya aktarıldı, ${errs} dosyada hata oluştu`, 'err'); else if (ok) toast('Aktarımlar tamamlandı', 'ok');
});

// ---------- Günlük ----------
const logEl = $('#log');
api.on('log', ({ tag, m }) => {
  for (const line of m.split(/\r?\n/)) {
    if (!line) continue;
    const d = document.createElement('div');
    const cls = line.startsWith('>') ? 'out' : line.startsWith('<') ? 'in' : /hata|error|fail|UYARI/i.test(line) ? 'err' : '';
    d.innerHTML = `<span class="t">[${esc(tag)}]</span> <span class="${cls}">${esc(line)}</span>`;
    logEl.appendChild(d);
  }
  while (logEl.childElementCount > 600) logEl.firstChild.remove();
  logEl.scrollTop = logEl.scrollHeight;
});

// ---------- Sekmeler / bölücü / tema ----------
function showTab(t) {
  document.querySelectorAll('.tab').forEach((b) => b.classList.toggle('active', b.dataset.tab === t));
  $('#tab-transfers').classList.toggle('hidden', t !== 'transfers');
  $('#tab-log').classList.toggle('hidden', t !== 'log');
}
document.querySelectorAll('.tab').forEach((b) => (b.onclick = () => showTab(b.dataset.tab)));
$('#splitter').addEventListener('mousedown', (e) => {
  e.preventDefault();
  const move = (ev) => { const h = Math.max(110, Math.min(innerHeight - 330, innerHeight - ev.clientY - 26)); document.documentElement.style.setProperty('--bottom-h', h + 'px'); };
  const up = () => { removeEventListener('mousemove', move); removeEventListener('mouseup', up); };
  addEventListener('mousemove', move); addEventListener('mouseup', up);
});
function applyTheme(t) {
  document.documentElement.dataset.theme = t;
  $('#btn-theme').innerHTML = ico(t === 'dark' ? 'sun' : 'moon');
  try { localStorage.setItem('theme', t); } catch {}
  call('theme:set', t).catch(() => {});
}
$('#btn-theme').onclick = () => applyTheme(document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark');

// ---------- Başlangıç ----------
(async function init() {
  buildPane('local'); buildPane('remote');
  wirePane('local'); wirePane('remote');
  let t = 'dark'; try { t = localStorage.getItem('theme') || 'dark'; } catch {}
  applyTheme(t);
  render('remote');
  try { $('#st-right').textContent = 'NimbusFTP ' + await call('app:version'); } catch {}
  try { S.sites = await call('sites:list'); } catch {}
  try { await load('local', await call('local:home')); } catch (e) { toast(e.message, 'err'); }
  renderTransfers();
})();
})();
