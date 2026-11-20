use super::{Entry, ProgressCb};
use crate::sites::verify_host;
use crate::state::Profile;
use crate::util::{log_sink, Sink};
use sha2::{Digest, Sha256};
use ssh2::{Session, Sftp};
use std::io::{Read, Write};
use std::net::TcpStream;
use std::path::{Component, Path, PathBuf};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
pub struct SftpRemote {
    profile: Profile,
    sink: Sink,
    data_dir: PathBuf,
    tag: String,
    session: Option<Arc<Session>>,
    sftp: Option<Arc<Sftp>>,
    dead: Arc<AtomicBool>,
}

impl SftpRemote {
    pub fn new(profile: Profile, tag: &str, sink: Sink, data_dir: PathBuf) -> Self {
        Self {
            profile,
            sink,
            data_dir,
            tag: tag.to_string(),
            session: None,
            sftp: None,
            dead: Arc::new(AtomicBool::new(false)),
        }
    }

    pub fn alive(&self) -> bool {
        self.sftp.is_some() && !self.dead.load(Ordering::SeqCst)
    }

    pub fn abort_flag(&self) -> Arc<AtomicBool> {
        self.dead.clone()
    }

    pub async fn connect(&mut self) -> Result<(), String> {
        let p = self.profile.clone();
        let sink = self.sink.clone();
        let data_dir = self.data_dir.clone();
        let tag = self.tag.clone();

        let (session, sftp) = tokio::task::spawn_blocking(move || {
            let port = p.port.unwrap_or(22);
            log_sink(
                &sink,
                &tag,
                format!("SFTP {}:{} bağlanılıyor (kullanıcı: {})", p.host, port, p.user),
            );

            let tcp = TcpStream::connect((p.host.as_str(), port)).map_err(|e| e.to_string())?;
            let mut session = Session::new().map_err(|e| e.to_string())?;
            session.set_tcp_stream(tcp);
            session.set_timeout(30_000);
            session.handshake().map_err(|e| e.to_string())?;

            // Trust-on-first-use host key verification (same as the JS client).
            if let Some((raw, _kind)) = session.host_key() {
                let digest = Sha256::digest(raw);
                let hash = hex::encode(digest.as_slice());
                verify_host(&data_dir, &p.host, port, &hash, &sink)?;
            }

            if !p.key_path.is_empty() {
                let passphrase = if p.passphrase.is_empty() {
                    None
                } else {
                    Some(p.passphrase.as_str())
                };
                session
                    .userauth_pubkey_file(
                        &p.user,
                        None,
                        Path::new(&p.key_path),
                        passphrase,
                    )
                    .map_err(|e| e.to_string())?;
            } else if !p.password.is_empty() {
                session
                    .userauth_password(&p.user, &p.password)
                    .map_err(|e| e.to_string())?;
            } else {
                // A SSH_USERAUTH_NONE request; some servers allow it.
                let _ = session.auth_methods(&p.user);
            }
            if !session.authenticated() {
                return Err("SFTP kimlik doğrulaması başarısız".to_string());
            }

            session.set_keepalive(true, 15);
            let sftp = session.sftp().map_err(|e| e.to_string())?;
            Ok::<_, String>((Arc::new(session), Arc::new(sftp)))
        })
        .await
        .map_err(|e| format!("SFTP görevi başarısız: {e}"))??;

        self.session = Some(session);
        self.sftp = Some(sftp);
        self.dead.store(false, Ordering::SeqCst);
        log_sink(&self.sink, &self.tag, "SFTP oturumu açıldı");
        Ok(())
    }

    pub async fn close(&mut self) -> Result<(), String> {
        self.dead.store(true, Ordering::SeqCst);
        let session = self.session.take();
        self.sftp.take();
        if let Some(session) = session {
            let _ = tokio::task::spawn_blocking(move || {
                let _ = session.disconnect(None, "bye", None);
            })
            .await;
        }
        Ok(())
    }

    pub async fn abort(&mut self) -> Result<(), String> {
        self.close().await
    }

    /// Run a blocking libssh2 operation on the blocking pool.
    async fn call_sftp<T, F>(&self, f: F) -> Result<T, String>
    where
        T: Send + 'static,
        F: FnOnce(&Sftp) -> Result<T, String> + Send + 'static,
    {
        let sftp = self
            .sftp
            .clone()
            .ok_or_else(|| "SFTP bağlantısı yok".to_string())?;
        tokio::task::spawn_blocking(move || f(&sftp))
            .await
            .map_err(|e| format!("SFTP görevi başarısız: {e}"))?
    }

    pub async fn pwd(&mut self) -> Result<String, String> {
        self.call_sftp(|sftp| {
            sftp.realpath(Path::new("."))
                .map(|p| p.to_string_lossy().into_owned())
                .map_err(|e| e.to_string())
        })
        .await
    }

    pub async fn list(&mut self, path: &str) -> Result<Vec<Entry>, String> {
        let path = path.to_string();
        self.call_sftp(move |sftp| {
            let entries = sftp
                .readdir(Path::new(&path))
                .map_err(|e| e.to_string())?;
            let mut out = Vec::new();
            for (full, stat) in entries {
                let name = full
                    .file_name()
                    .map(|n| n.to_string_lossy().into_owned())
                    .unwrap_or_default();
                if name.is_empty() || name == "." || name == ".." {
                    continue;
                }
                let is_link = stat.file_type().is_symlink();
                let mut is_dir = stat.file_type().is_dir();
                if is_link {
                    if let Ok(target) = sftp.stat(&full) {
                        is_dir = target.file_type().is_dir();
                    }
                }
                out.push(Entry {
                    name,
                    size: stat.size.unwrap_or(0),
                    is_dir,
                    is_link,
                    mtime: stat.mtime.map(|m| m as i64),
                });
            }
            Ok(out)
        })
        .await
    }

    pub async fn mkdir(&mut self, path: &str) -> Result<(), String> {
        let path = path.to_string();
        self.call_sftp(move |sftp| {
            let mut current = PathBuf::new();
            for comp in Path::new(&path).components() {
                match comp {
                    Component::RootDir => current.push("/"),
                    Component::Normal(part) => {
                        current.push(part);
                        // Mkdir fails when the directory already exists.
                        let _ = sftp.mkdir(&current, 0o755);
                    }
                    _ => {}
                }
            }
            Ok(())
        })
        .await
    }

    pub async fn rename(&mut self, from: &str, to: &str) -> Result<(), String> {
        let from = from.to_string();
        let to = to.to_string();
        self.call_sftp(move |sftp| {
            sftp.rename(Path::new(&from), Path::new(&to), None)
                .map_err(|e| e.to_string())
        })
        .await
    }

    pub async fn remove_file(&mut self, path: &str) -> Result<(), String> {
        let path = path.to_string();
        self.call_sftp(move |sftp| {
            sftp.unlink(Path::new(&path)).map_err(|e| e.to_string())
        })
        .await
    }

    pub async fn remove_dir(&mut self, path: &str) -> Result<(), String> {
        let path = path.to_string();
        self.call_sftp(move |sftp| {
            fn rmdir_recursive(sftp: &Sftp, dir: &Path) -> Result<(), String> {
                let children = sftp.readdir(dir).map_err(|e| e.to_string())?;
                for (child, stat) in children {
                    if stat.file_type().is_dir() {
                        rmdir_recursive(sftp, &child)?;
                    } else {
                        sftp.unlink(&child).map_err(|e| e.to_string())?;
                    }
                }
                sftp.rmdir(dir).map_err(|e| e.to_string())
            }
            rmdir_recursive(sftp, Path::new(&path))
        })
        .await
    }

    pub async fn upload(
        &mut self,
        local: &str,
        remote: &str,
        cb: ProgressCb,
    ) -> Result<(), String> {
        let local = local.to_string();
        let remote = remote.to_string();
        let dead = self.dead.clone();
        self.call_sftp(move |sftp| {
            let mut source = std::fs::File::open(&local).map_err(|e| e.to_string())?;
            let mut target = sftp.create(Path::new(&remote)).map_err(|e| e.to_string())?;
            let mut buf = vec![0u8; 64 * 1024];
            loop {
                if dead.load(Ordering::SeqCst) {
                    return Err("Aktarım iptal edildi".to_string());
                }
                let n = source.read(&mut buf).map_err(|e| e.to_string())?;
                if n == 0 {
                    break;
                }
                target
                    .write_all(&buf[..n])
                    .map_err(|e| e.to_string())?;
                cb(n as u64);
            }
            Ok(())
        })
        .await
    }

    pub async fn download(
        &mut self,
        remote: &str,
        local: &str,
        cb: ProgressCb,
    ) -> Result<(), String> {
        let remote = remote.to_string();
        let local = local.to_string();
        let dead = self.dead.clone();
        self.call_sftp(move |sftp| {
            let mut source = sftp.open(Path::new(&remote)).map_err(|e| e.to_string())?;
            let mut target = std::fs::File::create(&local).map_err(|e| e.to_string())?;
            let mut buf = vec![0u8; 64 * 1024];
            loop {
                if dead.load(Ordering::SeqCst) {
                    return Err("Aktarım iptal edildi".to_string());
                }
                let n = source.read(&mut buf).map_err(|e| e.to_string())?;
                if n == 0 {
                    break;
                }
                target
                    .write_all(&buf[..n])
                    .map_err(|e| e.to_string())?;
                cb(n as u64);
            }
            Ok(())
        })
        .await
    }
}
