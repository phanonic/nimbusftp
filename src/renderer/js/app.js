import { t, trError, setLang, getLang, applyI18n } from '../i18n/index.js';

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
  settings: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .34 1.88l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.7 1.7 0 0 0-1.88-.34 1.7 1.7 0 0 0-1.03 1.56V21a2 2 0 1 1-4 0v-.1A1.7 1.7 0 0 0 9 19.4a1.7 1.7 0 0 0-1.88.34l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.7 1.7 0 0 0 4.6 15a1.7 1.7 0 0 0-1.56-1.03H3a2 2 0 1 1 0-4h.1A1.7 1.7 0 0 0 4.6 9a1.7 1.7 0 0 0-.34-1.88l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.7 1.7 0 0 0 9 4.6h.08A1.7 1.7 0 0 0 10.1 3V3a2 2 0 1 1 4 0v.1A1.7 1.7 0 0 0 15 4.6a1.7 1.7 0 0 0 1.88-.34l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.7 1.7 0 0 0 19.4 9v.08A1.7 1.7 0 0 0 21 10.1h.1a2 2 0 1 1 0 4H21a1.7 1.7 0 0 0-1.6.9z"/>',
  editor: '<rect x="4" y="3" width="16" height="18" rx="2"/><path d="M8 7h8M8 11h8M8 15h5"/>',
  folderOpen: '<path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v1"/><path d="M3 9h18l-2 9a2 2 0 0 1-2 1.5H5a2 2 0 0 1-2-1.5z"/>',
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
  settings: { language: 'tr', editor: 'notepad.exe', quick_connect: { auto_connect: false } },
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
const fmtDate = (t) => (t ? new Date(t).toLocaleString(getLang() === 'en' ? 'en-US' : 'tr-TR', { dateStyle: 'short', timeStyle: 'short' }) : '');
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
  t.textContent = trError(msg);
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
  return modal(`<h3>${esc(title)}</h3><div class="body">${esc(label)}<input id="m-in" spellcheck="false"></div><div class="foot"><button class="btn" id="m-no">${esc(t('cancel'))}</button><button class="btn primary" id="m-ok">${esc(ok)}</button></div>`, {
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
  return modal(`<h3>${esc(title)}</h3><div class="body">${msg}</div><div class="foot"><button class="btn" id="m-no">${esc(t('cancel'))}</button><button class="btn ${danger ? 'danger' : 'primary'}" id="m-ok">${esc(ok)}</button></div>`, {
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
      <div class="pane-title">${ico(local ? 'drive' : 'server')} <span data-i18n="${local ? 'myComputer' : 'serverPane'}"></span></div>
      <span class="pill" id="${side}-pill">${local ? t('local') : t('notConnected')}</span>
      <span class="grow"></span>
      ${local ? '' : `<button class="btn sm" id="remote-disc" data-i18n-title="disconnect">${ico('plug')} <span data-i18n="disconnectShort"></span></button>`}
      <button class="btn sm primary" data-act="transfer" title="F5">${ico(local ? 'upload' : 'download')} <span data-i18n="${local ? 'upload' : 'download'}"></span></button>
    </div>
    <div class="pane-tools">
      <button class="btn icon ghost" data-act="up" data-i18n-title="parentFolder">${ico('up')}</button>
      ${local ? `<button class="btn icon ghost" data-act="home" data-i18n-title="home">${ico('home')}</button>` : ''}
      ${local ? `<button class="btn icon ghost" data-act="pick-folder" data-i18n-title="chooseSourceFolder">${ico('folder')}</button>` : ''}
      <button class="btn icon ghost" data-act="refresh" data-i18n-title="refresh">${ico('refresh')}</button>
      <button class="btn icon ghost" data-act="mkdir" data-i18n-title="mkdir">${ico('newdir')}</button>
      <button class="btn icon ghost" data-act="rename" data-i18n-title="rename">${ico('edit')}</button>
      <button class="btn icon ghost" data-act="delete" data-i18n-title="delete">${ico('trash')}</button>
      <input class="path" spellcheck="false" data-i18n-placeholder="${local ? 'localPath' : 'remotePath'}">
    </div>
    <div class="tbl-wrap">
      <table><thead><tr><th data-k="name" data-i18n="name"></th><th data-k="size" class="s" style="width:90px;text-align:right" data-i18n="size"></th><th data-k="mtime" style="width:140px" data-i18n="modified"></th></tr></thead><tbody></tbody></table>
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
  if (document.activeElement !== pathInput) pathInput.value = P.path === '::drives' ? t('thisPc') : P.path || '';
  root.classList.toggle('active', S.active === side);
  const dirs = P.entries.filter((e) => e.isDir).length;
  $('.cnt', root).textContent = P.entries.length ? t('folderFileCount', { n: dirs, m: P.entries.length - dirs }) : '';
  const sel = selected(side);
  $('.selinfo', root).textContent = sel.length ? t('selectedInfo', { n: sel.length, size: fmtSize(sel.reduce((a, e) => a + (e.isDir ? 0 : e.size || 0), 0)) }) : '';
  const empty = $('.empty', root);
  if (side === 'remote' && !P.connected) {
    empty.classList.remove('hidden');
    empty.innerHTML = `${ico('server').replace('class="i "', 'class="i" style="width:44px;height:44px;opacity:.5"')}<b>${esc(t('notConnectedTitle'))}</b><span>${t('notConnectedHint')}</span><button class="btn primary" id="empty-sites">${esc(t('openSiteManager'))}</button>`;
    $('#empty-sites', empty).onclick = openSites;
  } else if (!P.entries.length) {
    empty.classList.remove('hidden');
    empty.innerHTML = `<span>${esc(t('emptyFolder'))}</span>`;
  } else empty.classList.add('hidden');
  const pill = $(`#${side}-pill`);
  if (side === 'local') pill.textContent = t('local');
  else { pill.textContent = P.connected ? P.label : t('notConnected'); pill.classList.toggle('on', P.connected); $('#remote-disc').classList.toggle('hidden', !P.connected); }
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
  $('.selinfo', root).textContent = sel.length ? t('selectedInfo', { n: sel.length, size: fmtSize(sel.reduce((a, e) => a + (e.isDir ? 0 : e.size || 0), 0)) }) : '';
}

async function load(side, p, keepSel = false) {
  const P = S[side];
  try {
    const r = await call(side === 'local' ? 'local:list' : 'remote:list', p);
    P.path = r.path; P.entries = r.entries;
    if (side === 'local') { P.parent = r.parent; rememberLocalPath(r.path); }
    if (!keepSel) P.sel = new Set(); else { const have = new Set(r.entries.map((e) => e.path)); P.sel = new Set([...P.sel].filter((x) => have.has(x))); }
    P.anchor = -1;
    render(side);
    return true;
  } catch (e) {
    toast(`${p}: ${e.message}`, 'err');
    if (side === 'remote' && /bağlı değil|closed|ECONN|ETIMEDOUT|reset/i.test(e.message)) setStatus(t('connectionIssue'));
    return false;
  }
}
const refresh = (side) => load(side, S[side].path, true);

function goUp(side) {
  const P = S[side];
  if (side === 'local') { if (P.path === '::drives') return; load('local', P.parent); }
  else if (P.connected && P.path !== '/') load('remote', pdirname(P.path));
}

async function pickLocalFolder() {
  const start = S.local.path === '::drives' ? '' : S.local.path;
  try {
    const picked = await call('pick:dir', start);
    if (picked) await load('local', picked);
  } catch (x) { toast(trError(x.message), 'err'); }
}

async function rememberLocalPath(path) {
  if (!path || path === '::drives' || S.settings.local_path === path) return;
  S.settings.local_path = path;
  try { await call('settings:set', S.settings); } catch {}
}

async function openEntry(side, e) {
  if (e.isDir) await load(side, e.path);
  else if (side === 'local') { S.local.sel = new Set([e.path]); updateSelection('local'); S.remote.connected ? transferSelected('local') : call('local:open', e.path).catch((x) => toast(x.message, 'err')); }
  else { S.remote.sel = new Set([e.path]); updateSelection('remote'); transferSelected('remote'); }
}

// ---------- Bağlantı ----------
async function connect(p) {
  const btn = $('#q-go'); btn.disabled = true;
  setStatus(t('connecting', { host: p.host }));
  try {
    const r = await call('conn:connect', p);
    S.profile = p;
    S.remote.connected = true;
    S.remote.label = `${p.anonymous ? t('anonymousShort') : p.user || ''}@${p.host} · ${p.protocol.toUpperCase()}`;
    S.remote.entries = []; S.remote.sel = new Set();
    S.active = 'remote';
    await load('remote', r.cwd);
    if (p.localDir) load('local', p.localDir);
    setStatus(t('connected', { host: p.host }));
    toast(t('connectedToast', { host: p.host }), 'ok');
  } catch (e) {
    S.remote.connected = false; render('remote');
    setStatus(t('connectFailed'));
    let hint = '';
    if (/self.signed|certificate|CERT_/i.test(e.message)) hint = t('certHint');
    toast(t('connectionError', { msg: trError(e.message) }) + hint, 'err');
  } finally { btn.disabled = false; }
}
async function disconnect() {
  await call('conn:disconnect').catch(() => {});
  S.remote = { ...S.remote, connected: false, entries: [], view: [], sel: new Set(), path: '', label: '' };
  render('remote'); setStatus(t('disconnected'));
}

const DEFPORT = { ftp: 21, ftpes: 21, ftps: 990, sftp: 22 };
$('#quick').addEventListener('submit', async (e) => {
  e.preventDefault();
  let host = $('#q-host').value.trim(), proto = $('#q-proto').value, port = $('#q-port').value.trim(), user = $('#q-user').value.trim(), pass = $('#q-pass').value, dir = '';
  if (/^[a-z]+:\/\//i.test(host)) {
    try {
      const u = new URL(host);
      proto = { ftp: 'ftp', ftps: 'ftps', sftp: 'sftp', ssh: 'sftp' }[u.protocol.replace(':', '')] || proto;
      host = u.hostname; port = u.port || port; user = decodeURIComponent(u.username) || user; pass = decodeURIComponent(u.password) || pass; dir = decodeURIComponent(u.pathname).replace(/^\/$/, '');
      $('#q-proto').value = proto; $('#q-host').value = host; $('#q-port').value = port; $('#q-user').value = user; $('#q-pass').value = pass;
    } catch { return toast(t('invalidAddress'), 'err'); }
  }
  if (!host) return $('#q-host').focus();
  const profile = { protocol: proto, host, port: Number(port) || DEFPORT[proto], user, password: pass, anonymous: !user && proto !== 'sftp', remoteDir: dir };

  // The quick form's "auto-connect" checkbox owns the single startup target:
  // setting it clears every site's autoConnect flag.
  const auto = $('#q-auto').checked;
  S.settings.quick_connect = { ...profile, remote_dir: dir, auto_connect: auto };
  if (auto) for (const s of S.sites) s.autoConnect = false;
  try {
    await Promise.all([
      call('settings:set', S.settings),
      call('sites:save', S.sites),
    ]);
  } catch (x) { toast(trError(x.message), 'err'); }
  connect(profile);
});
$('#q-proto').addEventListener('change', () => { const p = $('#q-port'); if (!p.value || Object.values(DEFPORT).includes(Number(p.value))) p.value = ''; p.placeholder = DEFPORT[$('#q-proto').value]; });
$('#q-port').placeholder = 21;

// ---------- Site Yöneticisi ----------
function openSites() {
  let sites = S.sites.map((s) => ({ ...s }));
  let cur = sites[0] ? sites[0].id : null;
  const blank = () => ({ id: 's' + Date.now().toString(36), name: t('newSite'), protocol: 'ftp', host: '', port: 21, user: '', password: '', anonymous: false, keyPath: '', passphrase: '', remoteDir: '', localDir: '', allowInvalidCert: false, autoConnect: false });
  return modal(`<h3>${esc(t('siteManager'))}</h3><div class="sm-layout"><div class="sm-list"><div class="sm-items"></div><div class="btns"><button class="btn sm primary" id="sm-new">${esc(t('newButton'))}</button><button class="btn sm" id="sm-dup">${esc(t('duplicate'))}</button><button class="btn sm" id="sm-del">${esc(t('deleteButton'))}</button></div></div><div class="sm-form"></div></div><div class="foot"><button class="btn" id="sm-close">${esc(t('close'))}</button><button class="btn" id="sm-save">${esc(t('save'))}</button><button class="btn primary" id="sm-conn">${esc(t('saveAndConnect'))}</button></div>`, {
    cls: 'wide',
    onMount(m, close) {
      const list = $('.sm-items', m), form = $('.sm-form', m);
      const site = () => sites.find((s) => s.id === cur);
      const drawList = () => {
        list.innerHTML = sites.map((s) => `<div class="sm-item ${s.id === cur ? 'on' : ''}" data-id="${s.id}"><b>${esc(s.name || t('unnamed'))}${s.autoConnect ? `<span class="auto-dot" title="${esc(t('siteAutoConnect'))}">●</span>` : ''}</b><small>${esc(s.protocol.toUpperCase())} · ${esc(s.host || '—')}</small></div>`).join('') || `<div class="sm-empty" style="padding:20px;text-align:center">${esc(t('noSites'))}</div>`;
      };
      const drawForm = () => {
        const s = site();
        if (!s) { form.innerHTML = `<div class="sm-empty">${esc(t('selectSite'))}</div>`; return; }
        const sftp = s.protocol === 'sftp';
        form.innerHTML = `
          <label>${esc(t('siteName'))}<input data-f="name" value="${esc(s.name)}"></label>
          <label>${esc(t('protocol'))}<select data-f="protocol">${[['ftp', 'FTP'], ['ftpes', t('ftpExplicit')], ['ftps', t('ftpImplicit')], ['sftp', 'SFTP (SSH)']].map(([v, lbl]) => `<option value="${v}" ${s.protocol === v ? 'selected' : ''}>${esc(lbl)}</option>`).join('')}</select></label>
          <label>${esc(t('hostLabel'))}<input data-f="host" value="${esc(s.host)}" spellcheck="false"></label>
          <label>${esc(t('port'))}<input data-f="port" value="${esc(s.port || '')}" inputmode="numeric"></label>
          ${sftp ? '' : `<label class="chk full"><input type="checkbox" data-f="anonymous" ${s.anonymous ? 'checked' : ''}> ${esc(t('anonymous'))}</label>`}
          <label>${esc(t('username'))}<input data-f="user" value="${esc(s.user)}" spellcheck="false" ${s.anonymous && !sftp ? 'disabled' : ''}></label>
          <label>${esc(t('password'))}<input data-f="password" type="password" value="${esc(s.password)}" ${s.anonymous && !sftp ? 'disabled' : ''}></label>
          ${sftp ? `<label class="full">${esc(t('keyPath'))}<span class="row"><input data-f="keyPath" value="${esc(s.keyPath)}" spellcheck="false"><button class="btn" id="pick-key">${esc(t('browse'))}</button></span></label><label class="full">${esc(t('passphrase'))}<input data-f="passphrase" type="password" value="${esc(s.passphrase)}"></label>` : ''}
          <label>${esc(t('remoteStartDir'))}<input data-f="remoteDir" value="${esc(s.remoteDir)}" placeholder="/" spellcheck="false"></label>
          <label>${esc(t('localStartFolder'))}<span class="row"><input data-f="localDir" value="${esc(s.localDir)}" spellcheck="false"><button class="btn" id="pick-dir">${esc(t('browse'))}</button></span></label>
          ${sftp ? '' : `<label class="chk full"><input type="checkbox" data-f="allowInvalidCert" ${s.allowInvalidCert ? 'checked' : ''}> ${esc(t('allowInvalidCert'))}</label>`}
          <label class="chk full"><input type="checkbox" data-f="autoConnect" ${s.autoConnect ? 'checked' : ''}> ${esc(t('siteAutoConnect'))}</label>`;
        const pk = $('#pick-key', form); if (pk) pk.onclick = async () => { const f = await call('pick:key'); if (f) { s.keyPath = f; drawForm(); } };
        const pd = $('#pick-dir', form); if (pd) pd.onclick = async () => { const f = await call('pick:dir'); if (f) { s.localDir = f; drawForm(); } };
      };
      form.addEventListener('input', (e) => {
        const f = e.target.dataset.f, s = site(); if (!f || !s) return;
        s[f] = e.target.type === 'checkbox' ? e.target.checked : e.target.value;
        if (f === 'autoConnect' && s.autoConnect) for (const other of sites) if (other !== s) other.autoConnect = false;
        if (f === 'name' || f === 'host' || f === 'autoConnect') drawList();
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
      $('#sm-dup', m).onclick = () => { const s = site(); if (!s) return; const c = { ...s, id: blank().id, name: s.name + t('copySuffix') }; sites.push(c); cur = c.id; drawList(); drawForm(); };
      $('#sm-del', m).onclick = () => { const s = site(); if (!s) return; sites = sites.filter((x) => x !== s); cur = sites[0] ? sites[0].id : null; drawList(); drawForm(); };
      const save = async () => {
        // A site auto-connect and the quick-form auto-connect are mutually exclusive.
        if (sites.some((s) => s.autoConnect)) S.settings.quick_connect.auto_connect = false;
        await Promise.all([
          call('sites:save', sites),
          call('settings:set', S.settings),
        ]);
        S.sites = sites.map((s) => ({ ...s }));
      };
      $('#sm-save', m).onclick = async () => { try { await save(); toast(t('saved'), 'ok'); } catch (e) { toast(trError(e.message), 'err'); } };
      $('#sm-close', m).onclick = () => close(null);
      $('#sm-conn', m).onclick = async () => {
        const s = site(); if (!s) return;
        if (!s.host.trim()) return toast(t('serverRequired'), 'err');
        try { await save(); } catch (e) { return toast(trError(e.message), 'err'); }
        close(null);
        $('#q-proto').value = s.protocol; $('#q-host').value = s.host; $('#q-port').value = s.port || ''; $('#q-user').value = s.user || ''; $('#q-pass').value = s.password || ''; $('#q-auto').checked = !!S.settings.quick_connect.auto_connect;
        connect({ ...s, port: Number(s.port) || DEFPORT[s.protocol] });
      };
      drawList(); drawForm();
    },
  });
}
$('#btn-sites').innerHTML = `${ico('server')} ${esc(t('siteManager'))}`;
$('#btn-sites').onclick = openSites;

// ---------- Ayarlar ----------
function openSettings() {
  return modal(`<h3>${esc(t('settingsTitle'))}</h3><div class="body"><label>${esc(t('editorPath'))}<span class="row"><input id="set-editor" spellcheck="false" placeholder="notepad.exe"><button class="btn" id="set-browse" type="button">${esc(t('browse'))}</button></span><span class="hint">${esc(t('editorPathHint'))}</span></label></div><div class="foot"><button class="btn" id="set-reset">${esc(t('resetDefault'))}</button><span class="grow"></span><button class="btn" id="set-cancel">${esc(t('cancel'))}</button><button class="btn primary" id="set-save">${esc(t('save'))}</button></div>`, {
    onMount(m, close) {
      const input = $('#set-editor', m);
      input.value = S.settings.editor || 'notepad.exe';
      $('#set-browse', m).onclick = async () => {
        const current = input.value.trim();
        const sep = Math.max(current.lastIndexOf('\\'), current.lastIndexOf('/'));
        const start = sep > 0 ? current.slice(0, sep) : '';
        try {
          const picked = await call('pick:editor', start);
          if (picked) input.value = picked;
        } catch (e) { toast(trError(e.message), 'err'); }
      };
      $('#set-reset', m).onclick = () => { input.value = 'notepad.exe'; };
      $('#set-cancel', m).onclick = () => close(null);
      $('#set-save', m).onclick = async () => {
        S.settings.editor = input.value.trim() || 'notepad.exe';
        try { await call('settings:set', S.settings); toast(t('savedSettings'), 'ok'); close(null); }
        catch (e) { toast(trError(e.message), 'err'); }
      };
    },
  });
}
$('#btn-settings').innerHTML = ico('settings');
$('#btn-settings').onclick = openSettings;

async function openInEditor(entry) {
  const editor = (S.settings.editor || '').trim() || 'notepad.exe';
  const size = entry.size || 0;
  if (size > 20 * 1024 * 1024) {
    const ok = await askConfirm(t('largeFileTitle'), t('largeFileMsg', { name: esc(entry.name), size: fmtSize(size) }), t('viewInEditor'));
    if (!ok) return;
  }
  try {
    await call('local:openWith', entry.path, editor);
    toast(t('editorOpened', { name: entry.name }), 'ok');
  } catch (e) { toast(trError(e.message), 'err'); }
}
async function revealInExplorer(entry) {
  try { await call('local:reveal', entry.path); }
  catch (e) { toast(trError(e.message), 'err'); }
}

// ---------- Dosya işlemleri ----------
async function doMkdir(side) {
  const P = S[side]; if (side === 'remote' && !P.connected) return; if (P.path === '::drives') return;
  const name = await askInput(t('newFolderTitle'), t('folderName'), t('newFolderTitle'), t('create')); if (!name) return;
  try {
    if (side === 'local') await call('local:mkdir', await call('local:join', P.path, name));
    else await call('remote:mkdir', pjoin(P.path, name));
    await refresh(side);
  } catch (e) { toast(trError(e.message), 'err'); }
}
async function doRename(side) {
  const sel = selected(side); if (sel.length !== 1 || sel[0].isDrive) return;
  const e = sel[0];
  const name = await askInput(t('renameTitle'), t('newNameFor', { name: e.name }), e.name, t('renameOk')); if (!name || name === e.name) return;
  try {
    if (side === 'local') await call('local:rename', e.path, await call('local:join', S.local.path, name));
    else await call('remote:rename', e.path, pjoin(S.remote.path, name));
    await refresh(side);
  } catch (x) { toast(trError(x.message), 'err'); }
}
async function doDelete(side) {
  const sel = selected(side).filter((e) => !e.isDrive); if (!sel.length) return;
  const what = sel.length === 1 ? t('oneItem', { name: esc(sel[0].name) }) : t('manyItems', { n: sel.length });
  const msg = side === 'local' ? t('deleteLocalMsg', { what }) : t('deleteRemoteMsg', { what, perm: t('permanently') });
  const ok = await askConfirm(t('deleteTitle'), msg, t('deleteOk'), true);
  if (!ok) return;
  try {
    if (side === 'local') await call('local:delete', sel.map((e) => e.path));
    else await call('remote:delete', sel.map((e) => ({ path: e.path, isDir: e.isDir, isLink: e.isLink })));
  } catch (e) { toast(trError(e.message), 'err'); }
  refresh(side);
}

async function transferSelected(from) {
  if (!S.remote.connected) return toast(t('connectFirst'), 'err');
  const sel = selected(from).filter((e) => !e.isDrive);
  if (!sel.length) return toast(t('selectItem'));
  const to = from === 'local' ? 'remote' : 'local';
  const dest = S[to].path;
  if (dest === '::drives') return toast(t('openTargetFolder'), 'err');
  const clash = sel.filter((e) => S[to].entries.some((x) => x.name === e.name && !x.isDir && !e.isDir));
  if (clash.length) {
    const what = clash.length === 1 ? t('oneItem', { name: esc(clash[0].name) }) : t('manyItems', { n: clash.length });
    const ok = await askConfirm(t('overwriteTitle'), t('overwriteMsg', { what }), t('overwriteOk'));
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
      else if (a === 'pick-folder') pickLocalFolder();
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
    if (side === 'local') load('local', /^(bu bilgisayar|this pc)$/i.test(v) ? '::drives' : v); else if (P.connected) load('remote', pnorm(P.path || '/', v));
    pi.blur();
  });
  pi.addEventListener('blur', () => {
    const P = S[side];
    pi.value = P.path === '::drives' ? t('thisPc') : P.path || '';
  });

  // sağ tık
  root.addEventListener('contextmenu', (e) => {
    e.preventDefault();
    const tr = e.target.closest('tbody tr');
    if (tr) { const en = P.view[+tr.dataset.i]; if (!P.sel.has(en.path)) { P.sel = new Set([en.path]); P.anchor = +tr.dataset.i; updateSelection(side); } }
    const sel = selected(side), one = sel.length === 1 ? sel[0] : null, conn = S.remote.connected;
    const items = [];
    if (one && one.isDir) items.push(['open', t('open'), () => load(side, one.path), 'Enter']);
    if (sel.length && !sel.some((x) => x.isDrive) && conn) items.push([side === 'local' ? 'upload' : 'download', side === 'local' ? t('uploadToServer') : t('downloadToPc'), () => transferSelected(side), 'F5']);
    if (side === 'local' && one && !one.isDir) items.push(['open', t('openWithApp'), () => call('local:open', one.path).catch((x) => toast(x.message, 'err'))]);
    if (side === 'local' && one && !one.isDrive && !one.isDir) items.push(['editor', t('viewInEditor'), () => openInEditor(one)]);
    if (side === 'local' && one && !one.isDrive) items.push(['folderOpen', t('openFolder'), () => revealInExplorer(one)]);
    if (items.length) items.push('-');
    if (one && !one.isDrive) items.push(['edit', t('rename'), () => doRename(side), 'F2']);
    if (sel.length && !sel.some((x) => x.isDrive)) items.push(['trash', t('deleteButton'), () => doDelete(side), 'Del', true]);
    if (items.length && items[items.length - 1] !== '-') items.push('-');
    items.push(['newdir', t('mkdir').replace(' (F7)', ''), () => doMkdir(side), 'F7'], ['refresh', t('refresh'), () => refresh(side), '']);
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
      if (!S.remote.connected) return toast(t('connectFirst'), 'err');
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
const STATUS_CLS = { active: 'st-act', done: 'st-ok', error: 'st-err' };
function renderTransfers() {
  const list = S.transfers, files = list.filter((x) => !x.isDir);
  const act = list.filter((x) => x.status === 'active').length, q = list.filter((x) => x.status === 'queued').length;
  $('#tr-badge').textContent = act + q;
  $('#tr-summary').textContent = list.length ? t('transferSummary', {
    a: act, q,
    d: files.filter((x) => x.status === 'done').length,
    e: files.filter((x) => x.status === 'error').length,
  }) : '';
  $('#tr-empty').classList.toggle('hidden', list.length > 0);
  // Çok büyük kuyruklarda yalnızca ilgili öğeleri göster
  const shown = list.filter((x) => !(x.isDir && x.status === 'done')).slice(-400).reverse().sort((a, b) => (a.status === 'active' ? -1 : 0) - (b.status === 'active' ? -1 : 0));
  $('#tr-body').innerHTML = shown.map((x) => {
    const pct = x.status === 'done' ? 100 : x.size ? Math.min(100, (x.done / x.size) * 100) : 0;
    const label = t(x.status), cls = STATUS_CLS[x.status] || '';
    const statusText = x.error ? esc(t('errorWithMsg', { label, msg: trError(x.error) })) : esc(label);
    return `<tr><td>${ico(x.dir === 'up' ? 'upload' : 'download', x.dir)}</td><td title="${esc(x.dir === 'up' ? x.src + ' → ' + x.dst : x.src + ' → ' + x.dst)}">${x.isDir ? ico('folder') + ' ' : ''}${esc(x.name)}</td><td class="s" style="text-align:left">${x.isDir ? '' : fmtSize(x.size)}</td><td>${x.isDir ? '' : `<div class="bar ${x.status}"><i style="width:${pct}%"></i></div>`}</td><td class="s" style="text-align:left">${x.status === 'active' ? fmtSpeed(x.speed) : ''}</td><td class="${cls}" title="${esc(x.error)}">${statusText}</td><td>${x.status === 'active' || x.status === 'queued' ? `<button class="btn icon ghost sm" data-cancel="${x.id}" title="${esc(t('cancelShort'))}">${ico('x')}</button>` : x.status === 'error' || x.status === 'cancelled' ? `<button class="btn icon ghost sm" data-retry="${x.id}" title="${esc(t('retry'))}">${ico('retry')}</button>` : ''}</td></tr>`;
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
  if (errs) toast(t('transferSummaryErr', { ok, err: errs }), 'err'); else if (ok) toast(t('transferDone'), 'ok');
});

// ---------- Günlük ----------
const logEl = $('#log');
const fmtLogTime = (t) => {
  const d = new Date(t || Date.now());
  const p = (n, w = 2) => String(n).padStart(w, '0');
  return `${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}.${p(d.getMilliseconds(), 3)}`;
};
api.on('log', ({ tag, m, time }) => {
  const ts = fmtLogTime(time);
  for (const line of m.split(/\r?\n/)) {
    if (!line) continue;
    const d = document.createElement('div');
    const cls = line.startsWith('>') ? 'out' : line.startsWith('<') ? 'in' : /hata|error|fail|UYARI/i.test(line) ? 'err' : '';
    d.innerHTML = `<span class="ts">${esc(ts)}</span> <span class="t">[${esc(tag)}]</span> <span class="${cls}">${esc(line)}</span>`;
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
function fillQuick(p) {
  if (!p) return;
  if (p.protocol) $('#q-proto').value = p.protocol;
  $('#q-host').value = p.host || '';
  $('#q-port').value = p.port || '';
  $('#q-user').value = p.user || '';
  $('#q-pass').value = p.password || '';
}

(async function init() {
  buildPane('local'); buildPane('remote');
  wirePane('local'); wirePane('remote');
  let theme = 'dark'; try { theme = localStorage.getItem('theme') || 'dark'; } catch {}
  applyTheme(theme);

  try { S.settings = await call('settings:get') || S.settings; } catch {}
  setLang(S.settings.language || 'tr');
  $('#lang').value = getLang();
  $('#q-auto').checked = !!(S.settings.quick_connect && S.settings.quick_connect.auto_connect);
  applyI18n();
  $('#btn-sites').innerHTML = `${ico('server')} ${esc(t('siteManager'))}`;
  $('#lang').onchange = async () => {
    setLang($('#lang').value);
    S.settings.language = getLang();
    applyI18n();
    $('#btn-sites').innerHTML = `${ico('server')} ${esc(t('siteManager'))}`;
    render('local'); render('remote'); renderTransfers(); setStatus(t('ready'));
    try { await call('settings:set', S.settings); } catch {}
  };

  render('remote');
  try { $('#st-right').textContent = 'NimbusFTP ' + await call('app:version'); } catch {}
  try { S.sites = await call('sites:list'); } catch {}
  const savedLocal = (S.settings.local_path || '').trim();
  let restored = savedLocal ? await load('local', savedLocal) : false;
  if (!restored) {
    try { await load('local', await call('local:home')); } catch (e) { toast(e.message, 'err'); }
  }
  renderTransfers();

  // Connect automatically on startup: a flagged site takes precedence over
  // the quick-connect form, so there is only ever one startup target.
  const autoSite = S.sites.find((s) => s.autoConnect && s.host);
  const quick = S.settings.quick_connect;
  if (autoSite) {
    fillQuick(autoSite);
    connect({ ...autoSite, port: Number(autoSite.port) || DEFPORT[autoSite.protocol] });
  } else if (quick && quick.auto_connect && quick.host) {
    fillQuick(quick);
    connect({ ...quick, remoteDir: quick.remote_dir || '', port: Number(quick.port) || DEFPORT[quick.protocol] });
  }
})();
})();
