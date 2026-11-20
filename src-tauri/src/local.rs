use crate::util::{drives, home_dir, mtime_ms};
use serde_json::{json, Value};
use std::path::Path;

pub fn home() -> String {
    home_dir()
}

pub fn list(path: &str) -> Result<Value, String> {
    if path == "::drives" {
        let entries: Vec<Value> = drives()
            .into_iter()
            .map(|d| {
                json!({
                    "name": d,
                    "path": d,
                    "isDir": true,
                    "isDrive": true,
                    "size": 0,
                    "mtime": Value::Null,
                })
            })
            .collect();
        return Ok(json!({ "path": path, "parent": path, "entries": entries }));
    }

    let mut entries = Vec::new();
    let read_dir = std::fs::read_dir(path).map_err(|e| e.to_string())?;
    for entry in read_dir {
        let entry = match entry {
            Ok(e) => e,
            Err(_) => continue,
        };
        let full = entry.path();
        let name = entry.file_name().to_string_lossy().into_owned();
        let (is_dir, size, mtime): (bool, u64, Value) = match std::fs::metadata(&full) {
            Ok(meta) => {
                let mt = meta
                    .modified()
                    .ok()
                    .and_then(mtime_ms)
                    .map(Value::from)
                    .unwrap_or(Value::Null);
                (meta.is_dir(), meta.len(), mt)
            }
            Err(_) => {
                let is_dir = entry.file_type().map(|t| t.is_dir()).unwrap_or(false);
                (is_dir, 0, Value::Null)
            }
        };
        entries.push(json!({
            "name": name,
            "path": full.to_string_lossy(),
            "isDir": is_dir,
            "size": size,
            "mtime": mtime,
        }));
    }

    let here = Path::new(path);
    let parent_path = here.parent().unwrap_or(here);
    let parent = if parent_path.as_os_str().is_empty() || parent_path == here {
        if cfg!(windows) {
            "::drives".to_string()
        } else {
            path.to_string()
        }
    } else {
        parent_path.to_string_lossy().into_owned()
    };

    Ok(json!({ "path": path, "parent": parent, "entries": entries }))
}

pub fn mkdir(path: &str) -> Result<(), String> {
    std::fs::create_dir(path).map_err(|e| e.to_string())
}

pub fn rename(from: &str, to: &str) -> Result<(), String> {
    std::fs::rename(from, to).map_err(|e| e.to_string())
}

pub fn delete(paths: &[String]) -> Result<(), String> {
    for path in paths {
        trash::delete(path).map_err(|e| e.to_string())?;
    }
    Ok(())
}

pub fn open(path: &str) -> Result<(), String> {
    opener::open(path).map_err(|e| e.to_string())
}

pub fn join(a: &str, b: &str) -> String {
    Path::new(a).join(b).to_string_lossy().into_owned()
}
