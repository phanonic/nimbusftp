use crate::util::{read_json, write_json};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::path::Path;

const SERVICE: &str = "nimbusftp";
const QUICK_ACCOUNT: &str = "quick:password";

/// Quick-connect form saved for "connect automatically on startup".
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(default)]
pub struct QuickConnect {
    pub protocol: String,
    pub host: String,
    pub port: Option<u16>,
    pub user: String,
    pub password: String,
    pub anonymous: bool,
    pub remote_dir: String,
    pub auto_connect: bool,
}

impl Default for QuickConnect {
    fn default() -> Self {
        Self {
            protocol: "ftp".into(),
            host: String::new(),
            port: None,
            user: String::new(),
            password: String::new(),
            anonymous: false,
            remote_dir: String::new(),
            auto_connect: false,
        }
    }
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(default)]
pub struct Settings {
    /// "tr" or "en".
    pub language: String,
    /// Executable used by "Open in editor" (Windows Notepad by default).
    pub editor: String,
    /// Last local (source) folder used in the local pane.
    pub local_path: String,
    pub quick_connect: QuickConnect,
}

impl Default for Settings {
    fn default() -> Self {
        Self {
            language: "tr".into(),
            editor: if cfg!(windows) {
                "notepad.exe".into()
            } else {
                "notepad".into()
            },
            local_path: String::new(),
            quick_connect: QuickConnect::default(),
        }
    }
}

pub fn load(data_dir: &Path) -> Settings {
    let mut s: Settings = serde_json::from_value(read_json(&data_dir.join("settings.json")))
        .unwrap_or_default();
    if s.language != "tr" && s.language != "en" {
        s.language = "tr".into();
    }
    if s.editor.trim().is_empty() {
        s.editor = Settings::default().editor;
    }
    // The password is kept in the OS keyring, not in settings.json.
    if s.quick_connect.password.is_empty() {
        if let Ok(e) = keyring::Entry::new(SERVICE, QUICK_ACCOUNT) {
            if let Ok(pw) = e.get_password() {
                s.quick_connect.password = pw;
            }
        }
    }
    s
}

pub fn save(data_dir: &Path, settings: &Settings) -> Result<(), String> {
    let mut stored = settings.clone();
    let password = stored.quick_connect.password.clone();
    stored.quick_connect.password.clear();
    if !password.is_empty() {
        if let Ok(e) = keyring::Entry::new(SERVICE, QUICK_ACCOUNT) {
            let _ = e.set_password(&password);
        }
    }
    let value: Value = serde_json::to_value(stored).map_err(|e| e.to_string())?;
    write_json(&data_dir.join("settings.json"), &value)
}
