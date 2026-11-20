use crate::remote::Remote;
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::collections::{HashMap, HashSet};
use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, AtomicI64, Ordering};
use std::sync::Arc;
use tauri::Emitter;
use tokio::sync::Mutex;

#[derive(Clone, Debug, Default, Serialize, Deserialize)]
#[serde(default)]
pub struct Profile {
    pub protocol: String,
    pub host: String,
    pub port: Option<u16>,
    pub user: String,
    pub password: String,
    pub anonymous: bool,
    #[serde(rename = "allowInvalidCert")]
    pub allow_invalid_cert: bool,
    #[serde(rename = "keyPath")]
    pub key_path: String,
    pub passphrase: String,
    #[serde(rename = "remoteDir")]
    pub remote_dir: String,
    #[serde(rename = "localDir")]
    pub local_dir: String,
}

/// One remote connection (browse or transfer), shared so reconnects can be deduped.
pub type SharedRemote = Arc<Mutex<Option<Remote>>>;

#[derive(Clone)]
pub struct TransferItem {
    pub id: i64,
    pub dir: String,
    pub name: String,
    pub src: String,
    pub dst: String,
    pub size: u64,
    pub done: u64,
    pub status: String,
    pub error: String,
    pub is_dir: bool,
    pub speed: f64,
    pub parent: i64,
    pub depth: u32,
    pub cancel: bool,
    pub x: Option<SharedRemote>,
    /// Lock-free signal used by transfer loops to stop on cancel/disconnect.
    pub abort_flag: Option<Arc<AtomicBool>>,
    /// Progress-window bookkeeping used to compute the smoothed speed.
    pub t: i64,
    pub b: u64,
}

impl TransferItem {
    pub fn snapshot(&self) -> Value {
        json!({
            "id": self.id,
            "dir": self.dir,
            "name": self.name,
            "src": self.src,
            "dst": self.dst,
            "size": self.size,
            "done": self.done,
            "status": self.status,
            "error": self.error,
            "isDir": self.is_dir,
            "speed": self.speed,
        })
    }
}

pub struct AppState {
    pub profile: Mutex<Option<Profile>>,
    pub browse: Mutex<Option<SharedRemote>>,
    pub xfer: Mutex<Option<SharedRemote>>,
    /// Dedupes concurrent reconnects of the same logical connection.
    pub pending: Mutex<HashMap<String, Arc<Mutex<()>>>>,
    pub sites: Mutex<Vec<Value>>,
    pub queue: Mutex<Vec<TransferItem>>,
    pub next_id: AtomicI64,
    pub running: AtomicBool,
    pub expand_seen: Mutex<HashSet<String>>,
    pub last_emit: Mutex<i64>,
    pub data_dir: PathBuf,
}

impl AppState {
    pub fn new(data_dir: PathBuf) -> Self {
        Self {
            profile: Mutex::new(None),
            browse: Mutex::new(None),
            xfer: Mutex::new(None),
            pending: Mutex::new(HashMap::new()),
            sites: Mutex::new(Vec::new()),
            queue: Mutex::new(Vec::new()),
            next_id: AtomicI64::new(1),
            running: AtomicBool::new(false),
            expand_seen: Mutex::new(HashSet::new()),
            last_emit: Mutex::new(0),
            data_dir,
        }
    }

    pub fn next_id(&self) -> i64 {
        self.next_id.fetch_add(1, Ordering::SeqCst)
    }

    pub async fn get_browse(&self, app: &tauri::AppHandle) -> Result<SharedRemote, String> {
        self.ensure("main", &self.browse, app).await
    }

    pub async fn get_xfer(&self, app: &tauri::AppHandle) -> Result<SharedRemote, String> {
        self.ensure("xfer", &self.xfer, app).await
    }

    async fn ensure(
        &self,
        key: &str,
        slot: &Mutex<Option<SharedRemote>>,
        app: &tauri::AppHandle,
    ) -> Result<SharedRemote, String> {
        let profile = self
            .profile
            .lock()
            .await
            .clone()
            .ok_or_else(|| "Sunucuya bağlı değil".to_string())?;

        {
            let guard = slot.lock().await;
            if let Some(shared) = guard.as_ref() {
                let current = shared.lock().await;
                if current.as_ref().map(|r| r.alive()).unwrap_or(false) {
                    return Ok(shared.clone());
                }
            }
        }

        let pending = {
            let mut map = self.pending.lock().await;
            if let Some(p) = map.get(key) {
                p.clone()
            } else {
                let p = Arc::new(Mutex::new(()));
                map.insert(key.to_string(), p.clone());
                p
            }
        };

        let connected = {
            let _gate = pending.lock().await;

            // Another caller may have reconnected while we waited for the gate.
            {
                let guard = slot.lock().await;
                if let Some(shared) = guard.as_ref() {
                    let current = shared.lock().await;
                    if current.as_ref().map(|r| r.alive()).unwrap_or(false) {
                        // Leave the pending entry to its owner; removing it
                        // here while holding the slot lock could invert lock
                        // order.
                        return Ok(shared.clone());
                    }
                }
            }

            async {
                let mut remote = Remote::new(profile, key, app.clone(), self.data_dir.clone());
                remote.connect().await?;
                let shared: SharedRemote = Arc::new(Mutex::new(Some(remote)));
                let mut guard = slot.lock().await;
                *guard = Some(shared.clone());
                Ok::<SharedRemote, String>(shared)
            }
            .await
        };

        self.pending.lock().await.remove(key);
        connected
    }

    /// Disconnect, clear the profile and cancel every pending/active transfer.
    pub async fn close_all(&self, app: &tauri::AppHandle) {
        {
            let mut queue = self.queue.lock().await;
            for item in queue.iter_mut() {
                if item.status == "queued" || item.status == "active" {
                    item.cancel = true;
                    item.status = "cancelled".to_string();
                }
            }
        }
        for slot in [&self.browse, &self.xfer] {
            let shared = slot.lock().await.take();
            if let Some(shared) = shared {
                let mut guard = shared.lock().await;
                if let Some(remote) = guard.as_mut() {
                    let _ = remote.abort().await;
                }
            }
        }
        *self.profile.lock().await = None;
        self.emit_now(app).await;
    }

    pub async fn snapshot(&self) -> Vec<Value> {
        let queue = self.queue.lock().await;
        queue.iter().map(|item| item.snapshot()).collect()
    }

    /// Throttled update (~150 ms); the pump always emits a final snapshot.
    pub async fn emit_update(&self, app: &tauri::AppHandle) {
        let now = crate::util::now_ms();
        {
            let mut last = self.last_emit.lock().await;
            if now.saturating_sub(*last) < 150 {
                return;
            }
            *last = now;
        }
        let snapshot = self.snapshot().await;
        let _ = app.emit("transfer:update", snapshot);
    }

    pub async fn emit_now(&self, app: &tauri::AppHandle) {
        *self.last_emit.lock().await = crate::util::now_ms();
        let snapshot = self.snapshot().await;
        let _ = app.emit("transfer:update", snapshot);
    }
}
