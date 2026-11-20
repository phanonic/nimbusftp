pub mod ftp;
pub mod sftp;

#[cfg(test)]
#[path = "../../tests/remote.rs"]
mod tests;

use crate::state::Profile;
use std::path::PathBuf;
use std::sync::atomic::AtomicBool;
use std::sync::Arc;
use crate::util::Sink;

/// Reports the number of bytes transferred since the previous call.
pub type ProgressCb = Arc<dyn Fn(u64) + Send + Sync>;

#[derive(Clone, Debug)]
pub struct Entry {
    pub name: String,
    pub size: u64,
    pub is_dir: bool,
    pub is_link: bool,
    pub mtime: Option<i64>,
}

pub enum Remote {
    Ftp(ftp::FtpRemote),
    Sftp(sftp::SftpRemote),
}

impl Remote {
    pub fn new(profile: Profile, tag: &str, sink: Sink, data_dir: PathBuf) -> Self {
        if profile.protocol == "sftp" {
            Remote::Sftp(sftp::SftpRemote::new(profile, tag, sink, data_dir))
        } else {
            Remote::Ftp(ftp::FtpRemote::new(profile, tag, sink))
        }
    }

    pub async fn connect(&mut self) -> Result<(), String> {
        match self {
            Remote::Ftp(r) => r.connect().await,
            Remote::Sftp(r) => r.connect().await,
        }
    }

    pub fn alive(&self) -> bool {
        match self {
            Remote::Ftp(r) => r.alive(),
            Remote::Sftp(r) => r.alive(),
        }
    }

    /// Shared flag that transfer loops poll so a cancel takes effect immediately.
    pub fn abort_flag(&self) -> Arc<AtomicBool> {
        match self {
            Remote::Ftp(r) => r.abort_flag(),
            Remote::Sftp(r) => r.abort_flag(),
        }
    }

    pub async fn close(&mut self) -> Result<(), String> {
        match self {
            Remote::Ftp(r) => r.close().await,
            Remote::Sftp(r) => r.close().await,
        }
    }

    pub async fn abort(&mut self) -> Result<(), String> {
        match self {
            Remote::Ftp(r) => r.abort().await,
            Remote::Sftp(r) => r.abort().await,
        }
    }

    pub async fn pwd(&mut self) -> Result<String, String> {
        match self {
            Remote::Ftp(r) => r.pwd().await,
            Remote::Sftp(r) => r.pwd().await,
        }
    }

    pub async fn list(&mut self, path: &str) -> Result<Vec<Entry>, String> {
        match self {
            Remote::Ftp(r) => r.list(path).await,
            Remote::Sftp(r) => r.list(path).await,
        }
    }

    pub async fn mkdir(&mut self, path: &str) -> Result<(), String> {
        match self {
            Remote::Ftp(r) => r.mkdir(path).await,
            Remote::Sftp(r) => r.mkdir(path).await,
        }
    }

    pub async fn rename(&mut self, from: &str, to: &str) -> Result<(), String> {
        match self {
            Remote::Ftp(r) => r.rename(from, to).await,
            Remote::Sftp(r) => r.rename(from, to).await,
        }
    }

    pub async fn remove_file(&mut self, path: &str) -> Result<(), String> {
        match self {
            Remote::Ftp(r) => r.remove_file(path).await,
            Remote::Sftp(r) => r.remove_file(path).await,
        }
    }

    pub async fn remove_dir(&mut self, path: &str) -> Result<(), String> {
        match self {
            Remote::Ftp(r) => r.remove_dir(path).await,
            Remote::Sftp(r) => r.remove_dir(path).await,
        }
    }

    pub async fn upload(
        &mut self,
        local: &str,
        remote: &str,
        cb: ProgressCb,
    ) -> Result<(), String> {
        match self {
            Remote::Ftp(r) => r.upload(local, remote, cb).await,
            Remote::Sftp(r) => r.upload(local, remote, cb).await,
        }
    }

    pub async fn download(
        &mut self,
        remote: &str,
        local: &str,
        cb: ProgressCb,
    ) -> Result<(), String> {
        match self {
            Remote::Ftp(r) => r.download(remote, local, cb).await,
            Remote::Sftp(r) => r.download(remote, local, cb).await,
        }
    }
}
