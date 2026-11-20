'use strict';
// Uzak sunucu soyutlaması: FTP / FTPES (açık TLS) / FTPS (örtük TLS) ve SFTP için ortak arayüz.
const ftp = require('basic-ftp');
const SFTP = require('ssh2-sftp-client');
const fs = require('fs');
const net = require('net');

class Base {
  constructor(profile, opts = {}) {
    this.p = profile;
    this.tag = opts.tag || '';
    this.log = opts.log || (() => {});
    this.verifyHost = opts.verifyHost;
    this.chain = Promise.resolve();
  }
  // Bir bağlantı üzerinde işlemleri sıraya sokar (FTP denetim kanalı eşzamanlı komut kabul etmez).
  run(fn) {
    const r = this.chain.then(fn);
    this.chain = r.catch(() => {});
    return r;
  }
}

class FtpRemote extends Base {
  get alive() { return !!this.c && !this.c.closed; }

  async connect() {
    const p = this.p;
    const c = new ftp.Client(30000);
    c.ftp.verbose = true;
    c.ftp.log = (m) => this.log(String(m));
    const secure = p.protocol === 'ftps' ? 'implicit' : p.protocol === 'ftpes' ? true : false;
    const secureOptions = { rejectUnauthorized: !p.allowInvalidCert };
    if (!net.isIP(p.host)) secureOptions.servername = p.host;
    try {
      await c.access({
        host: p.host,
        port: Number(p.port) || (p.protocol === 'ftps' ? 990 : 21),
        user: p.anonymous ? 'anonymous' : p.user || 'anonymous',
        password: p.anonymous ? 'anonymous@' : p.password || '',
        secure,
        secureOptions,
      });
    } catch (e) {
      c.close();
      throw e;
    }
    this.c = c;
  }

  abort() { if (this.c) this.c.close(); }
  close() { this.abort(); }
  pwd() { return this.run(() => this.c.pwd()); }

  list(p) {
    return this.run(async () => {
      const l = await this.c.list(p);
      return l
        .filter((x) => x.name !== '.' && x.name !== '..')
        .map((x) => ({
          name: x.name,
          size: x.size,
          isDir: x.isDirectory || x.isSymbolicLink,
          isLink: x.isSymbolicLink,
          mtime: x.modifiedAt ? x.modifiedAt.getTime() : null,
        }));
    });
  }
  mkdir(p) { return this.run(() => this.c.ensureDir(p)); }
  rename(a, b) { return this.run(() => this.c.rename(a, b)); }
  removeFile(p) { return this.run(() => this.c.remove(p)); }
  removeDir(p) { return this.run(() => this.c.removeDir(p)); }

  upload(local, remote, cb) {
    return this.run(async () => {
      this.c.trackProgress((i) => cb(i.bytes));
      try { await this.c.uploadFrom(local, remote); } finally { this.c.trackProgress(); }
    });
  }
  download(remote, local, cb) {
    return this.run(async () => {
      this.c.trackProgress((i) => cb(i.bytes));
      try { await this.c.downloadTo(local, remote); } finally { this.c.trackProgress(); }
    });
  }
}

class SftpRemote extends Base {
  get alive() { return !!this.s && !this.dead; }

  async connect() {
    const p = this.p;
    const s = new SFTP('nimbus-' + this.tag);
    const port = Number(p.port) || 22;
    const cfg = {
      host: p.host,
      port,
      username: p.user,
      readyTimeout: 30000,
      keepaliveInterval: 15000,
      hostHash: 'sha256',
      hostVerifier: (h) => (this.verifyHost ? this.verifyHost(p.host, port, h) : true),
    };
    if (p.keyPath) {
      cfg.privateKey = fs.readFileSync(p.keyPath);
      if (p.passphrase) cfg.passphrase = p.passphrase;
    }
    if (p.password) cfg.password = p.password;
    this.dead = false;
    s.on('close', () => { this.dead = true; });
    s.on('end', () => { this.dead = true; });
    this.log(`SFTP ${p.host}:${port} bağlanılıyor (kullanıcı: ${p.user})`);
    try {
      await s.connect(cfg);
    } catch (e) {
      try { await s.end(); } catch {}
      throw e;
    }
    this.s = s;
    this.log('SFTP oturumu açıldı');
  }

  abort() { if (this.s) { this.dead = true; this.s.end().catch(() => {}); } }
  close() { this.abort(); }
  pwd() { return this.run(() => this.s.realPath('.')); }

  list(p) {
    return this.run(async () => {
      const l = await this.s.list(p);
      const out = [];
      for (const x of l) {
        let isDir = x.type === 'd';
        const isLink = x.type === 'l';
        if (isLink) {
          try { isDir = (await this.s.stat(p.replace(/\/$/, '') + '/' + x.name)).isDirectory; } catch {}
        }
        out.push({ name: x.name, size: x.size, isDir, isLink, mtime: x.modifyTime || null });
      }
      return out;
    });
  }
  mkdir(p) { return this.run(() => this.s.mkdir(p, true)); }
  rename(a, b) { return this.run(() => this.s.rename(a, b)); }
  removeFile(p) { return this.run(() => this.s.delete(p)); }
  removeDir(p) { return this.run(() => this.s.rmdir(p, true)); }
  upload(local, remote, cb) {
    return this.run(() => this.s.fastPut(local, remote, { step: (t) => cb(t) }));
  }
  download(remote, local, cb) {
    return this.run(() => this.s.fastGet(remote, local, { step: (t) => cb(t) }));
  }
}

function create(profile, opts) {
  return profile.protocol === 'sftp' ? new SftpRemote(profile, opts) : new FtpRemote(profile, opts);
}

module.exports = { create, FtpRemote, SftpRemote };
