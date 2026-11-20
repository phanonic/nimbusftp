use crate::remote::ProgressCb;
use crate::state::{AppState, SharedRemote, TransferItem};
use crate::util::{
    log, posix_join, posix_normalize, safe_local_path, safe_remote_path,
};
use serde_json::{json, Value};
use std::path::Path;
use std::sync::atomic::Ordering;
use std::sync::Arc;
use tauri::{AppHandle, Emitter};

const MAX_DEPTH: u32 = 32;

/// Add files/directories to the queue. Mirrors the JS `enqueue`.
pub async fn enqueue(
    st: &Arc<AppState>,
    app: &AppHandle,
    dir: &str,
    items: &[Value],
    dest_dir: &str,
) {
    let mut queue = st.queue.lock().await;
    for item in items {
        let name = item
            .get("name")
            .and_then(|v| v.as_str())
            .unwrap_or("")
            .to_string();
        let src = item
            .get("path")
            .and_then(|v| v.as_str())
            .unwrap_or("")
            .to_string();
        let is_dir = item
            .get("isDir")
            .and_then(|v| v.as_bool())
            .unwrap_or(false);
        let size = item
            .get("size")
            .and_then(|v| v.as_u64())
            .unwrap_or(0);

        let dst = if dir == "up" {
            safe_remote_path(dest_dir, &name)
        } else {
            safe_local_path(dest_dir, &name)
        };
        let dst = match dst {
            Some(d) => d,
            None => {
                log(
                    app,
                    "warn",
                    format!(
                        "Geçersiz dosya adı atlandı: {}",
                        name.chars().take(120).collect::<String>()
                    ),
                );
                continue;
            }
        };

        queue.push(TransferItem {
            id: st.next_id(),
            dir: dir.to_string(),
            name,
            src,
            dst,
            size: if is_dir { 0 } else { size },
            done: 0,
            status: "queued".to_string(),
            error: String::new(),
            is_dir,
            speed: 0.0,
            parent: 0,
            depth: 0,
            cancel: false,
            x: None,
            abort_flag: None,
            t: 0,
            b: 0,
        });
    }
}

/// `transfer:addPaths`: stat the dropped paths and enqueue them as uploads.
pub async fn add_paths(st: &Arc<AppState>, app: &AppHandle, paths: &[String], dest_dir: &str) {
    let mut items = Vec::new();
    for path in paths {
        if let Ok(meta) = tokio::fs::metadata(path).await {
            let name = Path::new(path)
                .file_name()
                .map(|n| n.to_string_lossy().into_owned())
                .unwrap_or_else(|| path.clone());
            items.push(json!({
                "name": name,
                "path": path,
                "isDir": meta.is_dir(),
                "size": meta.len(),
            }));
        }
    }
    enqueue(st, app, "up", &items, dest_dir).await;
}

/// Start the sequential transfer pump (no-op if it is already running).
pub fn start_pump(st: Arc<AppState>, app: AppHandle) {
    if st
        .running
        .compare_exchange(false, true, Ordering::SeqCst, Ordering::SeqCst)
        .is_err()
    {
        return;
    }
    tauri::async_runtime::spawn(async move {
        st.expand_seen.lock().await.clear();
        let mut processed: Vec<i64> = Vec::new();
        loop {
            let next = {
                let queue = st.queue.lock().await;
                match queue.iter().find(|i| i.status == "queued") {
                    Some(item) => item.id,
                    None => break,
                }
            };
            processed.push(next);
            run_item(&st, &app, next).await;
        }
        // Kilidi önce bırak: bu aralıkta gelen yeni bir aktarım kendi pump'ını
        // başlatabilsin, aksi halde kuyrukta sırada kalabilir.
        st.running.store(false, Ordering::SeqCst);
        st.emit_now(&app).await;
        let _ = app.emit("transfer:idle", json!({ "ids": processed }));
    });
}

async fn run_item(st: &Arc<AppState>, app: &AppHandle, id: i64) {
    let item = {
        let queue = st.queue.lock().await;
        match queue.iter().find(|i| i.id == id) {
            Some(i) => i.clone(),
            None => return,
        }
    };
    {
        let mut queue = st.queue.lock().await;
        if let Some(current) = queue.iter_mut().find(|i| i.id == id) {
            current.status = "active".to_string();
            current.error.clear();
        }
    }
    st.emit_update(app).await;

    let result: Result<(), String> = async {
        let x = st.get_xfer(app).await?;
        let abort_flag = {
            let guard = x.lock().await;
            guard.as_ref().map(|r| r.abort_flag())
        };
        {
            let mut queue = st.queue.lock().await;
            if let Some(current) = queue.iter_mut().find(|i| i.id == id) {
                current.x = Some(x.clone());
                current.abort_flag = abort_flag;
            }
        }

        if item.is_dir {
            expand(st, app, &item, &x).await?;
        } else if item.dir == "up" {
            let cb = progress_callback(st.clone(), app.clone(), id);
            let mut guard = x.lock().await;
            let remote = guard
                .as_mut()
                .ok_or_else(|| "Aktarım bağlantısı yok".to_string())?;
            remote.upload(&item.src, &item.dst, cb).await?;
        } else {
            if let Some(parent) = Path::new(&item.dst).parent() {
                tokio::fs::create_dir_all(parent)
                    .await
                    .map_err(|e| e.to_string())?;
            }
            let cb = progress_callback(st.clone(), app.clone(), id);
            let mut guard = x.lock().await;
            let remote = guard
                .as_mut()
                .ok_or_else(|| "Aktarım bağlantısı yok".to_string())?;
            remote.download(&item.src, &item.dst, cb).await?;
        }
        Ok(())
    }
    .await;

    let cancelled = {
        let queue = st.queue.lock().await;
        queue
            .iter()
            .find(|i| i.id == id)
            .map(|i| i.cancel)
            .unwrap_or(false)
    };
    let mut remove_partial = false;
    {
        let mut queue = st.queue.lock().await;
        if let Some(current) = queue.iter_mut().find(|i| i.id == id) {
            current.x = None;
            current.speed = 0.0;
            match result {
                Ok(()) if cancelled => current.status = "cancelled".to_string(),
                Ok(()) => {
                    current.status = "done".to_string();
                    if current.size > 0 {
                        current.done = current.size;
                    }
                }
                Err(_) if cancelled => {
                    current.status = "cancelled".to_string();
                    current.error.clear();
                }
                Err(err) => {
                    current.status = "error".to_string();
                    current.error = err;
                }
            }
            remove_partial =
                item.dir == "down" && !item.is_dir && current.status != "done";
        }
    }
    if remove_partial {
        let _ = tokio::fs::remove_file(&item.dst).await;
    }
    st.emit_update(app).await;
}

/// Expand a directory item and splice its children in right after the parent.
async fn expand(
    st: &Arc<AppState>,
    app: &AppHandle,
    item: &TransferItem,
    x: &SharedRemote,
) -> Result<(), String> {
    if item.depth >= MAX_DEPTH {
        log(
            app,
            "warn",
            format!("Klasör derinliği sınırına ulaşıldı: {}", item.src),
        );
        return Ok(());
    }

    let key = if item.dir == "up" {
        std::fs::canonicalize(&item.src)
            .map(|p| p.to_string_lossy().into_owned())
            .unwrap_or_else(|_| item.src.clone())
    } else {
        posix_normalize(&item.src)
    };
    {
        let mut seen = st.expand_seen.lock().await;
        if seen.contains(&key) {
            log(
                app,
                "warn",
                format!("Yinelenen klasör atlandı: {}", item.src),
            );
            return Ok(());
        }
        seen.insert(key);
    }

    let mut children: Vec<TransferItem> = Vec::new();
    if item.dir == "up" {
        {
            let mut guard = x.lock().await;
            let remote = guard
                .as_mut()
                .ok_or_else(|| "Aktarım bağlantısı yok".to_string())?;
            remote.mkdir(&item.dst).await?;
        }
        let mut read_dir = tokio::fs::read_dir(&item.src)
            .await
            .map_err(|e| e.to_string())?;
        while let Some(entry) = read_dir.next_entry().await.map_err(|e| e.to_string())? {
            let name = entry.file_name().to_string_lossy().into_owned();
            let src = entry.path().to_string_lossy().into_owned();
            let meta = match tokio::fs::metadata(&src).await {
                Ok(m) => m,
                Err(_) => continue,
            };
            let dst = match safe_remote_path(&item.dst, &name) {
                Some(d) => d,
                None => {
                    log(
                        app,
                        "warn",
                        format!(
                            "Geçersiz yerel dosya adı atlandı: {}",
                            name.chars().take(120).collect::<String>()
                        ),
                    );
                    continue;
                }
            };
            children.push(TransferItem {
                id: st.next_id(),
                dir: "up".to_string(),
                name,
                src,
                dst,
                size: if meta.is_dir() { 0 } else { meta.len() },
                done: 0,
                status: "queued".to_string(),
                error: String::new(),
                is_dir: meta.is_dir(),
                speed: 0.0,
                parent: item.id,
                depth: item.depth + 1,
                cancel: false,
                x: None,
                abort_flag: None,
                t: 0,
                b: 0,
            });
        }
    } else {
        tokio::fs::create_dir_all(&item.dst)
            .await
            .map_err(|e| e.to_string())?;
        let entries = {
            let mut guard = x.lock().await;
            let remote = guard
                .as_mut()
                .ok_or_else(|| "Aktarım bağlantısı yok".to_string())?;
            remote.list(&item.src).await?
        };
        for entry in entries {
            if entry.is_link {
                continue;
            }
            let dst = match safe_local_path(&item.dst, &entry.name) {
                Some(d) => d,
                None => {
                    log(
                        app,
                        "warn",
                        format!(
                            "Geçersiz uzak dosya adı atlandı: {}",
                            entry.name.chars().take(120).collect::<String>()
                        ),
                    );
                    continue;
                }
            };
            children.push(TransferItem {
                id: st.next_id(),
                dir: "down".to_string(),
                name: entry.name.clone(),
                src: posix_join(&item.src, &entry.name),
                dst,
                size: if entry.is_dir { 0 } else { entry.size },
                done: 0,
                status: "queued".to_string(),
                error: String::new(),
                is_dir: entry.is_dir,
                speed: 0.0,
                parent: item.id,
                depth: item.depth + 1,
                cancel: false,
                x: None,
                abort_flag: None,
                t: 0,
                b: 0,
            });
        }
    }

    let mut queue = st.queue.lock().await;
    if let Some(pos) = queue.iter().position(|i| i.id == item.id) {
        queue.splice(pos + 1..pos + 1, children);
    }
    Ok(())
}

fn progress_callback(st: Arc<AppState>, app: AppHandle, id: i64) -> ProgressCb {
    Arc::new(move |bytes: u64| {
        let st = st.clone();
        let app = app.clone();
        let _ = tauri::async_runtime::spawn(async move {
            progress(&st, &app, id, bytes).await;
        });
    })
}

async fn progress(st: &Arc<AppState>, app: &AppHandle, id: i64, bytes: u64) {
    let now = crate::util::now_ms();
    {
        let mut queue = st.queue.lock().await;
        if let Some(item) = queue.iter_mut().find(|i| i.id == id) {
            // ProgressCb reports a per-chunk delta, not a running total.
            item.done = item.done.saturating_add(bytes);
            if item.t == 0 {
                item.t = now;
                item.b = 0;
            }
            if now - item.t >= 500 {
                let elapsed = (now - item.t) as f64;
                let instantaneous =
                    (item.done.saturating_sub(item.b) as f64 * 1000.0) / elapsed;
                item.speed = if item.speed > 0.0 {
                    item.speed * 0.6 + instantaneous * 0.4
                } else {
                    instantaneous
                };
                item.t = now;
                item.b = item.done;
            }
        }
    }
    st.emit_update(app).await;
}

fn cancel_tree(queue: &mut [TransferItem], id: i64) {
    let children: Vec<i64> = queue
        .iter()
        .filter(|i| i.parent == id)
        .map(|i| i.id)
        .collect();
    for child in children {
        cancel_tree(queue, child);
    }
    if let Some(item) = queue.iter_mut().find(|i| i.id == id) {
        if item.status == "queued" {
            item.status = "cancelled".to_string();
        } else if item.status == "active" {
            item.cancel = true;
            if let Some(flag) = &item.abort_flag {
                flag.store(true, Ordering::SeqCst);
            }
        }
    }
}

fn retry_tree(queue: &mut [TransferItem], id: i64) {
    let children: Vec<i64> = queue
        .iter()
        .filter(|i| i.parent == id)
        .map(|i| i.id)
        .collect();
    if let Some(item) = queue.iter_mut().find(|i| i.id == id) {
        if item.status == "error" || item.status == "cancelled" {
            item.status = "queued".to_string();
            item.done = 0;
            item.error.clear();
            item.cancel = false;
            item.speed = 0.0;
            item.t = 0;
            item.b = 0;
        }
    }
    for child in children {
        retry_tree(queue, child);
    }
}

pub async fn cancel(st: &Arc<AppState>, app: &AppHandle, id: i64) -> bool {
    {
        let mut queue = st.queue.lock().await;
        if !queue.iter().any(|i| i.id == id) {
            return false;
        }
        cancel_tree(&mut queue, id);
    }
    st.emit_update(app).await;
    true
}

pub async fn cancel_all(st: &Arc<AppState>, app: &AppHandle) {
    {
        let mut queue = st.queue.lock().await;
        for item in queue.iter_mut() {
            if item.status == "queued" {
                item.status = "cancelled".to_string();
            } else if item.status == "active" {
                item.cancel = true;
                if let Some(flag) = &item.abort_flag {
                    flag.store(true, Ordering::SeqCst);
                }
            }
        }
    }
    st.emit_update(app).await;
}

pub async fn retry(st: &Arc<AppState>, app: &AppHandle, id: i64) {
    {
        let mut queue = st.queue.lock().await;
        let eligible = queue
            .iter()
            .find(|i| i.id == id)
            .map(|i| i.status == "error" || i.status == "cancelled")
            .unwrap_or(false);
        if eligible {
            retry_tree(&mut queue, id);
        }
    }
    st.emit_update(app).await;
    start_pump(st.clone(), app.clone());
}

pub async fn clear(st: &Arc<AppState>, app: &AppHandle) {
    {
        let mut queue = st.queue.lock().await;
        queue.retain(|i| i.status != "done" && i.status != "cancelled");
    }
    st.emit_update(app).await;
}
