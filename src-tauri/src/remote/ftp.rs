use super::{Entry, ProgressCb};
use crate::state::Profile;
use crate::util::{log_sink, mtime_ms, posix_join, Sink};
use std::str::FromStr;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use suppaftp::async_native_tls::TlsConnector;
use suppaftp::list::File as FtpFile;
use suppaftp::tokio::{AsyncNativeTlsConnector, AsyncNativeTlsFtpStream};
use tokio::io::{AsyncReadExt, AsyncWriteExt};

pub struct FtpRemote {
    p: Profile,
    tag: String,
    sink: Sink,
    c: Option<AsyncNativeTlsFtpStream>,
    dead: Arc<AtomicBool>,
}

impl FtpRemote {
    pub fn new(p: Profile, tag: &str, sink: Sink) -> Self {
        Self {
            p,
            tag: tag.to_string(),
            sink,
            c: None,
            dead: Arc::new(AtomicBool::new(false)),
        }
    }

    pub fn alive(&self) -> bool {
        self.c.is_some() && !self.dead.load(Ordering::SeqCst)
    }

    pub fn abort_flag(&self) -> Arc<AtomicBool> {
        self.dead.clone()
    }

    pub async fn connect(&mut self) -> Result<(), String> {
        let p = self.p.clone();
        let protocol = p.protocol.as_str();
        let port = p.port.unwrap_or(if protocol == "ftps" { 990 } else { 21 });
        let addr = format!("{}:{}", p.host, port);

        // async-native-tls 0.6 configures the connector through consuming
        // builder-style methods (there is no `build()`).
        let mut tls = TlsConnector::new();
        if p.allow_invalid_cert {
            tls = tls
                .danger_accept_invalid_certs(true)
                .danger_accept_invalid_hostnames(true);
        }
        if p.host.parse::<std::net::IpAddr>().is_ok() {
            tls = tls.use_sni(false);
        }
        let connector = AsyncNativeTlsConnector::from(tls);
        let domain = p.host.clone();

        log_sink(
            &self.sink,
            &self.tag,
            format!("FTP {}:{} bağlanılıyor", p.host, port),
        );

        // All three variants resolve to the same concrete stream type
        // (ImplAsyncFtpStream<AsyncNativeTlsStream>), so they can be stored in
        // one field regardless of whether TLS is active.
        let mut c = match protocol {
            "ftps" => AsyncNativeTlsFtpStream::connect_secure_implicit(
                addr.as_str(),
                connector,
                domain.as_str(),
            )
            .await
            .map_err(|e| e.to_string())?,
            "ftpes" => {
                let plain = AsyncNativeTlsFtpStream::connect(addr.as_str())
                    .await
                    .map_err(|e| e.to_string())?;
                plain
                    .into_secure(connector, domain.as_str())
                    .await
                    .map_err(|e| e.to_string())?
            }
            _ => AsyncNativeTlsFtpStream::connect(addr.as_str())
                .await
                .map_err(|e| e.to_string())?,
        };

        let user = if p.anonymous {
            "anonymous"
        } else {
            p.user.as_str()
        };
        let pass = if p.anonymous {
            "anonymous@"
        } else {
            p.password.as_str()
        };
        c.login(user, pass).await.map_err(|e| e.to_string())?;

        self.c = Some(c);
        self.dead.store(false, Ordering::SeqCst);
        log_sink(&self.sink, &self.tag, "FTP oturumu açıldı");
        Ok(())
    }

    pub async fn close(&mut self) -> Result<(), String> {
        self.dead.store(true, Ordering::SeqCst);
        if let Some(mut c) = self.c.take() {
            let _ = c.quit().await;
        }
        Ok(())
    }

    pub async fn abort(&mut self) -> Result<(), String> {
        self.dead.store(true, Ordering::SeqCst);
        self.c.take();
        Ok(())
    }

    pub async fn pwd(&mut self) -> Result<String, String> {
        let c = self
            .c
            .as_mut()
            .ok_or_else(|| "FTP bağlantısı yok".to_string())?;
        c.pwd().await.map_err(|e| e.to_string())
    }

    pub async fn list(&mut self, path: &str) -> Result<Vec<Entry>, String> {
        let c = self
            .c
            .as_mut()
            .ok_or_else(|| "FTP bağlantısı yok".to_string())?;
        let lines = c.list(Some(path)).await.map_err(|e| e.to_string())?;
        let mut out = Vec::new();
        for line in lines {
            let f = match FtpFile::from_str(&line) {
                Ok(f) => f,
                Err(_) => continue,
            };
            let name = f.name().to_string();
            if name == "." || name == ".." {
                continue;
            }
            out.push(Entry {
                name,
                size: f.size() as u64,
                is_dir: f.is_directory() || f.is_symlink(),
                is_link: f.is_symlink(),
                mtime: mtime_ms(f.modified()),
            });
        }
        Ok(out)
    }

    /// `basic-ftp`'s `ensureDir`: create every missing component.
    pub async fn mkdir(&mut self, path: &str) -> Result<(), String> {
        let c = self
            .c
            .as_mut()
            .ok_or_else(|| "FTP bağlantısı yok".to_string())?;
        let mut current = if path.starts_with('/') {
            String::from("/")
        } else {
            String::new()
        };
        for seg in path.split('/').filter(|s| !s.is_empty()) {
            if current.is_empty() || current.ends_with('/') {
                current.push_str(seg);
            } else {
                current.push('/');
                current.push_str(seg);
            }
            // MKD fails when the directory already exists; that is fine.
            let _ = c.mkdir(current.as_str()).await;
        }
        Ok(())
    }

    pub async fn rename(&mut self, from: &str, to: &str) -> Result<(), String> {
        let c = self
            .c
            .as_mut()
            .ok_or_else(|| "FTP bağlantısı yok".to_string())?;
        c.rename(from, to).await.map_err(|e| e.to_string())
    }

    pub async fn remove_file(&mut self, path: &str) -> Result<(), String> {
        let c = self
            .c
            .as_mut()
            .ok_or_else(|| "FTP bağlantısı yok".to_string())?;
        c.rm(path).await.map_err(|e| e.to_string())
    }

    pub async fn remove_dir(&mut self, path: &str) -> Result<(), String> {
        let c = self
            .c
            .as_mut()
            .ok_or_else(|| "FTP bağlantısı yok".to_string())?;
        let mut stack = vec![path.to_string()];
        while let Some(dir) = stack.pop() {
            let lines = c.list(Some(dir.as_str())).await.map_err(|e| e.to_string())?;
            for line in lines {
                let f = match FtpFile::from_str(&line) {
                    Ok(f) => f,
                    Err(_) => continue,
                };
                let name = f.name();
                if name == "." || name == ".." {
                    continue;
                }
                let child = posix_join(&dir, name);
                if f.is_directory() && !f.is_symlink() {
                    stack.push(child);
                } else {
                    c.rm(child.as_str()).await.map_err(|e| e.to_string())?;
                }
            }
        }
        c.rmdir(path).await.map_err(|e| e.to_string())
    }

    pub async fn upload(
        &mut self,
        local: &str,
        remote: &str,
        cb: ProgressCb,
    ) -> Result<(), String> {
        let c = self
            .c
            .as_mut()
            .ok_or_else(|| "FTP bağlantısı yok".to_string())?;
        let mut file = tokio::fs::File::open(local)
            .await
            .map_err(|e| e.to_string())?;
        let mut stream = c
            .put_with_stream(remote)
            .await
            .map_err(|e| e.to_string())?;
        let mut buf = vec![0u8; 64 * 1024];
        loop {
            if self.dead.load(Ordering::SeqCst) {
                return Err("Aktarım iptal edildi".to_string());
            }
            let n = file.read(&mut buf).await.map_err(|e| e.to_string())?;
            if n == 0 {
                break;
            }
            stream.write_all(&buf[..n]).await.map_err(|e| e.to_string())?;
            cb(n as u64);
        }
        stream.finish().await.map_err(|e| e.to_string())?;
        Ok(())
    }

    pub async fn download(
        &mut self,
        remote: &str,
        local: &str,
        cb: ProgressCb,
    ) -> Result<(), String> {
        let c = self
            .c
            .as_mut()
            .ok_or_else(|| "FTP bağlantısı yok".to_string())?;
        let mut stream = c
            .retr_as_stream(remote)
            .await
            .map_err(|e| e.to_string())?;
        let mut file = tokio::fs::File::create(local)
            .await
            .map_err(|e| e.to_string())?;
        let mut buf = vec![0u8; 64 * 1024];
        loop {
            if self.dead.load(Ordering::SeqCst) {
                return Err("Aktarım iptal edildi".to_string());
            }
            let n = stream.read(&mut buf).await.map_err(|e| e.to_string())?;
            if n == 0 {
                break;
            }
            file.write_all(&buf[..n]).await.map_err(|e| e.to_string())?;
            cb(n as u64);
        }
        file.flush().await.map_err(|e| e.to_string())?;
        stream.finish().await.map_err(|e| e.to_string())?;
        Ok(())
    }
}
