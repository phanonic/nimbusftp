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

/// Open a local file in a user-configured editor (Windows Notepad by default).
pub fn open_with(path: &str, editor: &str) -> Result<(), String> {
    let file = Path::new(path);
    if !file.exists() {
        return Err(format!("Dosya bulunamadı: {path}"));
    }
    // Windows Notepad reads the whole file to detect its encoding. Very large
    // files make it hang or fail silently, so refuse them with a clear error.
    const MAX_EDITOR_BYTES: u64 = 100 * 1024 * 1024;
    if let Ok(meta) = std::fs::metadata(file) {
        if meta.is_file() && meta.len() > MAX_EDITOR_BYTES {
            return Err(format!(
                "Dosya çok büyük ({:.0} MB); Notepad ile açılamaz. Başka bir editör seçin.",
                meta.len() as f64 / (1024.0 * 1024.0)
            ));
        }
    }
    let editor = editor.trim().trim_matches('"');
    if editor.is_empty() {
        return Err("Editör uygulaması ayarlanmadı".to_string());
    }

    #[cfg(windows)]
    {
        // ShellExecuteW is the supported way to hand a document to an
        // application on Windows. A raw Command::new("notepad.exe").spawn()
        // depends on PATH resolution and the Win11 Store-app execution alias,
        // which can silently drop the document argument.
        use std::ffi::OsStr;
        use std::os::windows::ffi::OsStrExt;
        use std::os::windows::raw::HANDLE;

        #[link(name = "shell32")]
        extern "system" {
            fn ShellExecuteW(
                hwnd: HANDLE,
                operation: *const u16,
                file: *const u16,
                parameters: *const u16,
                directory: *const u16,
                show_cmd: i32,
            ) -> HANDLE;
        }
        fn wide(s: &str) -> Vec<u16> {
            OsStr::new(s).encode_wide().chain(std::iter::once(0)).collect()
        }

        let operation = wide("open");
        let application = wide(editor);
        // Quote the path so editors handle spaces and Turkish characters.
        let quoted = format!("\"{}\"", file.to_string_lossy());
        let parameters = wide(&quoted);
        let result = unsafe {
            ShellExecuteW(
                std::ptr::null_mut(),
                operation.as_ptr(),
                application.as_ptr(),
                parameters.as_ptr(),
                std::ptr::null(),
                1, // SW_SHOWNORMAL
            )
        };
        let code = result as isize;
        if code <= 32 {
            // A stale/invalid custom editor must not break the action: fall
            // back to Windows Notepad and surface a warning in the log.
            if !editor.eq_ignore_ascii_case("notepad.exe") && !editor.eq_ignore_ascii_case("notepad") {
                let fallback = wide("notepad.exe");
                let retry = unsafe {
                    ShellExecuteW(
                        std::ptr::null_mut(),
                        operation.as_ptr(),
                        fallback.as_ptr(),
                        parameters.as_ptr(),
                        std::ptr::null(),
                        1,
                    )
                };
                if retry as isize > 32 {
                    return Ok(());
                }
            }
            return Err(format!("Dosya editörde açılamadı (hata kodu {code})"));
        }
    }
    #[cfg(not(windows))]
    {
        let mut command = std::process::Command::new(editor);
        command.arg(file).spawn().map_err(|e| e.to_string())?;
    }
    Ok(())
}

/// Reveal a local file/folder in Explorer (or the system file manager).
pub fn reveal(path: &str) -> Result<(), String> {
    if !Path::new(path).exists() {
        return Err(format!("Yol bulunamadı: {path}"));
    }
    #[cfg(windows)]
    {
        std::process::Command::new("explorer.exe")
            .arg(format!("/select,{}", path))
            .spawn()
            .map_err(|e| e.to_string())?;
    }
    #[cfg(not(windows))]
    {
        opener::open(path).map_err(|e| e.to_string())?;
    }
    Ok(())
}

pub fn join(a: &str, b: &str) -> String {
    Path::new(a).join(b).to_string_lossy().into_owned()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn open_with_rejects_files_too_large_for_notepad() {
        let dir = std::env::temp_dir().join("nimbusftp-editor-size-test");
        let _ = std::fs::create_dir_all(&dir);
        let path = dir.join("huge.txt");
        let file = std::fs::File::create(&path).unwrap();
        file.set_len(101 * 1024 * 1024).unwrap();
        drop(file);

        let err = open_with(path.to_str().unwrap(), "notepad.exe").unwrap_err();
        assert!(
            err.contains("Dosya çok büyük"),
            "unexpected error: {err}"
        );

        let _ = std::fs::remove_file(&path);
    }
}
