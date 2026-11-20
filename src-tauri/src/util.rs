use serde_json::Value;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicI64, Ordering};
use std::time::{SystemTime, UNIX_EPOCH};
use tauri::Emitter;
use std::sync::Arc;

/// Uzak katmanın olay göndermek için kullandığı runtime-bağımsız arayüz.
/// Testlerde MockRuntime AppHandle, üretimde Wry AppHandle verilebilir.
pub trait EventSink: Send + Sync {
    fn emit(&self, event: &str, payload: Value);
}
impl<R: tauri::Runtime> EventSink for tauri::AppHandle<R> {
    fn emit(&self, event: &str, payload: Value) {
        let _ = tauri::Emitter::emit(self, event, payload);
    }
}
pub type Sink = Arc<dyn EventSink>;

static LAST_TS: AtomicI64 = AtomicI64::new(0);

/// Monotonically increasing millisecond timestamp (Date.now() equivalent).
pub fn now_ms() -> i64 {
    let now = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis() as i64)
        .unwrap_or(0);
    let mut prev = LAST_TS.load(Ordering::Relaxed);
    loop {
        let next = if now > prev { now } else { prev + 1 };
        match LAST_TS.compare_exchange_weak(prev, next, Ordering::SeqCst, Ordering::Relaxed) {
            Ok(_) => return next,
            Err(p) => prev = p,
        }
    }
}

pub fn mtime_ms(t: SystemTime) -> Option<i64> {
    t.duration_since(UNIX_EPOCH)
        .ok()
        .map(|d| d.as_millis() as i64)
}

/// Emit a "log" event with the same shape the Electron bridge produced.
pub fn log(app: &tauri::AppHandle, tag: &str, m: impl AsRef<str>) {
    let payload = serde_json::json!({
        "tag": tag,
        "m": m.as_ref().trim(),
        "time": now_ms(),
    });
    let _ = Emitter::emit(app, "log", payload);
}

pub fn log_sink(sink: &Sink, tag: &str, m: impl AsRef<str>) {
    let payload = serde_json::json!({
        "tag": tag,
        "m": m.as_ref().trim(),
        "time": now_ms(),
    });
    sink.emit("log", payload);
}

pub fn read_json(path: &Path) -> Value {
    match std::fs::read_to_string(path) {
        Ok(s) => serde_json::from_str::<Value>(&s).unwrap_or(Value::Null),
        Err(_) => Value::Null,
    }
}

pub fn write_json(path: &Path, value: &Value) -> Result<(), String> {
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    let text = serde_json::to_string_pretty(value).map_err(|e| e.to_string())?;
    std::fs::write(path, text).map_err(|e| e.to_string())
}

/// Port of the JavaScript `isSafeName`: a name arriving from the other side
/// must never be able to escape its destination directory.
pub fn is_safe_name(name: &str) -> bool {
    if name.is_empty() || name == "." || name == ".." {
        return false;
    }
    if name.contains('/') || name.contains('\\') || name.contains(':') || name.contains('\0') {
        return false;
    }
    // /^[ .]+$/ — Windows silently strips trailing dots and spaces.
    let mut only_dots_and_spaces = true;
    for c in name.chars() {
        if c != ' ' && c != '.' {
            only_dots_and_spaces = false;
            break;
        }
    }
    !only_dots_and_spaces
}

pub fn safe_local_path(base: &str, name: &str) -> Option<String> {
    if !is_safe_name(name) {
        return None;
    }
    let base_path = Path::new(base);
    let full = base_path.join(name);
    let rel = full.strip_prefix(base_path).ok()?;
    if rel.as_os_str().is_empty() || rel.is_absolute() {
        return None;
    }
    Some(full.to_string_lossy().into_owned())
}

pub fn posix_join(base: &str, name: &str) -> String {
    let b = base.trim_end_matches('/');
    let n = name.trim_start_matches('/');
    if b.is_empty() {
        format!("/{}", n)
    } else {
        format!("{}/{}", b, n)
    }
}

pub fn safe_remote_path(base: &str, name: &str) -> Option<String> {
    if !is_safe_name(name) {
        return None;
    }
    let full = posix_join(base, name);
    let base = if base.is_empty() { "/" } else { base };
    let rel = full.strip_prefix(base)?;
    if rel.is_empty() || rel.starts_with('/') || rel.split('/').any(|s| s == "..") {
        return None;
    }
    Some(full)
}

pub fn posix_normalize(p: &str) -> String {
    let mut out: Vec<&str> = Vec::new();
    for seg in p.split('/') {
        if seg.is_empty() || seg == "." {
            continue;
        }
        if seg == ".." {
            out.pop();
        } else {
            out.push(seg);
        }
    }
    format!("/{}", out.join("/"))
}

pub fn home_dir() -> String {
    #[cfg(windows)]
    {
        if let Ok(v) = std::env::var("USERPROFILE") {
            if !v.is_empty() {
                return v;
            }
        }
        let drive = std::env::var("HOMEDRIVE").unwrap_or_default();
        let path = std::env::var("HOMEPATH").unwrap_or_default();
        if !drive.is_empty() && !path.is_empty() {
            return format!("{}{}", drive, path);
        }
    }
    if let Ok(v) = std::env::var("HOME") {
        if !v.is_empty() {
            return v;
        }
    }
    std::env::current_dir()
        .map(|p| p.to_string_lossy().into_owned())
        .unwrap_or_else(|_| ".".to_string())
}

#[cfg(windows)]
pub fn drives() -> Vec<String> {
    (b'A'..=b'Z')
        .filter_map(|c| {
            let d = format!("{}:\\", c as char);
            if Path::new(&d).exists() {
                Some(d)
            } else {
                None
            }
        })
        .collect()
}

#[cfg(not(windows))]
pub fn drives() -> Vec<String> {
    Vec::new()
}

pub fn data_file(data_dir: &Path, name: &str) -> PathBuf {
    data_dir.join(name)
}
