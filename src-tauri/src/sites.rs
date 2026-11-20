use crate::util::{log_sink, read_json, write_json, Sink};
use serde_json::Value;
use std::collections::HashMap;
use std::path::Path;
const SERVICE: &str = "nimbusftp";

fn account(site_id: &str, field: &str) -> String {
    format!("{}:{}", site_id, field)
}

fn entry(site_id: &str, field: &str) -> Result<keyring::Entry, String> {
    keyring::Entry::new(SERVICE, &account(site_id, field)).map_err(|e| e.to_string())
}

/// Read sites.json, restoring secrets from the OS keyring.
pub fn load_sites(data_dir: &Path, sink: &Sink) -> Vec<Value> {
    let raw = read_json(&data_dir.join("sites.json"));
    let mut sites: Vec<Value> = match raw {
        Value::Array(a) => a,
        _ => Vec::new(),
    };
    for site in sites.iter_mut() {
        let obj = match site.as_object_mut() {
            Some(o) => o,
            None => continue,
        };
        let id = obj
            .get("id")
            .and_then(|v| v.as_str())
            .unwrap_or("")
            .to_string();
        if id.is_empty() {
            continue;
        }
        for field in ["password", "passphrase"] {
            let empty = obj
                .get(field)
                .and_then(|v| v.as_str())
                .map(|s| s.is_empty())
                .unwrap_or(true);
            if empty {
                if let Ok(e) = entry(&id, field) {
                    if let Ok(secret) = e.get_password() {
                        obj.insert(field.to_string(), Value::String(secret));
                    }
                } else {
                    log_sink(sink, "warn", format!("Keyring okunamadı ({field})"));
                }
            }
        }
    }
    sites
}

/// Persist sites.json with secret fields blanked out and stored in the keyring.
pub fn save_sites(data_dir: &Path, sites: &[Value], sink: &Sink) -> Result<(), String> {
    let mut stored = Vec::new();
    for site in sites {
        let mut obj = match site.as_object() {
            Some(o) => o.clone(),
            None => continue,
        };
        let id = obj
            .get("id")
            .and_then(|v| v.as_str())
            .unwrap_or("")
            .to_string();
        for field in ["password", "passphrase"] {
            let value = obj
                .get(field)
                .and_then(|v| v.as_str())
                .unwrap_or("")
                .to_string();
            if !value.is_empty() && !id.is_empty() {
                match entry(&id, field) {
                    Ok(e) => {
                        if let Err(err) = e.set_password(&value) {
                            log_sink(sink, "warn", format!("Keyring yazılamadı ({field}): {err}"));
                        }
                    }
                    Err(err) => log_sink(sink, "warn", format!("Keyring açılamadı: {err}")),
                }
            }
            obj.insert(field.to_string(), Value::String(String::new()));
        }
        stored.push(Value::Object(obj));
    }
    write_json(&data_dir.join("sites.json"), &Value::Array(stored))
}

/// TOFU host key check, keyed by "host:port" in known_hosts.json.
pub fn verify_host(
    data_dir: &Path,
    host: &str,
    port: u16,
    hash: &str,
    sink: &Sink,
) -> Result<(), String> {
    let path = data_dir.join("known_hosts.json");
    let mut known: HashMap<String, String> = match read_json(&path) {
        Value::Object(map) => map
            .into_iter()
            .filter_map(|(k, v)| v.as_str().map(|s| (k, s.to_string())))
            .collect(),
        _ => HashMap::new(),
    };
    let key = format!("{}:{}", host, port);
    if let Some(old) = known.get(&key) {
        if old == hash {
            return Ok(());
        }
        log_sink(
            sink,
            "ssh",
            "UYARI: sunucu anahtarı değişmiş! Bağlantı reddedildi.",
        );
        return Err("Sunucu anahtarı değişti; bağlantı reddedildi".to_string());
    }

    known.insert(key, hash.to_string());
    let value = Value::Object(
        known
            .into_iter()
            .map(|(k, v)| (k, Value::String(v)))
            .collect(),
    );
    write_json(&path, &value)?;
    let short: String = hash.chars().take(16).collect();
    log_sink(
        sink,
        "ssh",
        format!("Yeni sunucu anahtarı kaydedildi (SHA256 {}…)", short),
    );
    Ok(())
}

/// Sanitized copy kept in memory (mirrors what sites.json holds).
pub fn sanitized(sites: &[Value]) -> Vec<Value> {
    sites
        .iter()
        .map(|site| {
            let mut obj = site.as_object().cloned().unwrap_or_default();
            for field in ["password", "passphrase"] {
                obj.insert(field.to_string(), Value::String(String::new()));
            }
            Value::Object(obj)
        })
        .collect()
}
