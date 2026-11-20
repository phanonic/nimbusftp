use crate::local;
use crate::remote::Remote;
use crate::sites;
use crate::state::{AppState, Profile};
use crate::transfer;
use crate::util::{is_safe_name, log, posix_join};
use serde_json::{json, Value};
use std::sync::Arc;
use tauri::AppHandle;

fn arg<'a>(args: &'a [Value], index: usize) -> Result<&'a Value, String> {
    args.get(index)
        .ok_or_else(|| format!("Eksik argüman: {index}"))
}

fn str_arg(args: &[Value], index: usize) -> Result<String, String> {
    arg(args, index)?
        .as_str()
        .map(|s| s.to_string())
        .ok_or_else(|| format!("Geçersiz metin argümanı: {index}"))
}

fn array_arg(args: &[Value], index: usize) -> Result<&[Value], String> {
    arg(args, index)?
        .as_array()
        .map(|a| a.as_slice())
        .ok_or_else(|| format!("Geçersiz dizi argümanı: {index}"))
}

fn field<'a>(value: &'a Value, key: &str) -> Result<&'a Value, String> {
    value
        .get(key)
        .ok_or_else(|| format!("Eksik alan: {key}"))
}

fn field_str(value: &Value, key: &str) -> Result<String, String> {
    field(value, key)?
        .as_str()
        .map(|s| s.to_string())
        .ok_or_else(|| format!("Geçersiz alan: {key}"))
}

/// Single Tauri command used by the JS bridge. Application errors are always
/// converted into `{ ok: false, error }` so the bridge can throw them.
#[tauri::command]
pub async fn ipc_call(
    channel: String,
    args: Vec<Value>,
    state: tauri::State<'_, Arc<AppState>>,
    app: AppHandle,
) -> Result<Value, String> {
    let st = state.inner().clone();
    let response = match dispatch(&st, &app, &channel, &args).await {
        Ok(data) => json!({ "ok": true, "data": data }),
        Err(error) => json!({ "ok": false, "error": error }),
    };
    Ok(response)
}

async fn dispatch(
    st: &Arc<AppState>,
    app: &AppHandle,
    channel: &str,
    args: &[Value],
) -> Result<Value, String> {
    match channel {
        "conn:connect" => {
            let mut profile: Profile = serde_json::from_value(arg(args, 0)?.clone())
                .map_err(|e| e.to_string())?;
            profile.host = profile.host.trim().to_string();
            if profile.protocol.is_empty() {
                profile.protocol = "ftp".to_string();
            }
            if profile.port == Some(0) {
                profile.port = None;
            }
            if profile.host.is_empty() {
                return Err("Sunucu adresi gerekli".to_string());
            }
            if profile.protocol == "sftp" && profile.user.trim().is_empty() {
                return Err("SFTP için kullanıcı adı gerekli".to_string());
            }

            st.close_all(app).await;
            *st.profile.lock().await = Some(profile.clone());

            let mut remote = Remote::new(profile.clone(), "main", Arc::new(app.clone()), st.data_dir.clone());
            let outcome: Result<String, String> = async {
                remote.connect().await?;
                if profile.remote_dir.trim().is_empty() {
                    remote.pwd().await
                } else {
                    Ok(profile.remote_dir.clone())
                }
            }
            .await;

            match outcome {
                Ok(cwd) => {
                    *st.browse.lock().await =
                        Some(Arc::new(tokio::sync::Mutex::new(Some(remote))));
                    Ok(json!({ "cwd": cwd }))
                }
                Err(err) => {
                    *st.profile.lock().await = None;
                    *st.browse.lock().await = None;
                    Err(err)
                }
            }
        }

        "conn:disconnect" => {
            st.close_all(app).await;
            Ok(Value::Bool(true))
        }

        "remote:list" => {
            let path = str_arg(args, 0)?;
            let browse = st.get_browse(app).await?;
            let entries = {
                let mut guard = browse.lock().await;
                let remote = guard
                    .as_mut()
                    .ok_or_else(|| "Uzak bağlantı yok".to_string())?;
                remote.list(&path).await?
            };
            let mut out = Vec::new();
            for entry in entries {
                if !is_safe_name(&entry.name) {
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
                out.push(json!({
                    "name": entry.name,
                    "size": entry.size,
                    "isDir": entry.is_dir,
                    "isLink": entry.is_link,
                    "mtime": entry.mtime.map(Value::from).unwrap_or(Value::Null),
                    "path": posix_join(&path, &entry.name),
                }));
            }
            Ok(json!({ "path": path, "entries": out }))
        }

        "remote:mkdir" => {
            let path = str_arg(args, 0)?;
            let browse = st.get_browse(app).await?;
            let mut guard = browse.lock().await;
            let remote = guard
                .as_mut()
                .ok_or_else(|| "Uzak bağlantı yok".to_string())?;
            remote.mkdir(&path).await?;
            Ok(Value::Bool(true))
        }

        "remote:rename" => {
            let from = str_arg(args, 0)?;
            let to = str_arg(args, 1)?;
            let browse = st.get_browse(app).await?;
            let mut guard = browse.lock().await;
            let remote = guard
                .as_mut()
                .ok_or_else(|| "Uzak bağlantı yok".to_string())?;
            remote.rename(&from, &to).await?;
            Ok(Value::Bool(true))
        }

        "remote:delete" => {
            let items = array_arg(args, 0)?.to_vec();
            let browse = st.get_browse(app).await?;
            let mut guard = browse.lock().await;
            let remote = guard
                .as_mut()
                .ok_or_else(|| "Uzak bağlantı yok".to_string())?;
            for item in items {
                let path = field_str(&item, "path")?;
                let is_dir = item.get("isDir").and_then(|v| v.as_bool()).unwrap_or(false);
                let is_link = item.get("isLink").and_then(|v| v.as_bool()).unwrap_or(false);
                if is_dir && !is_link {
                    remote.remove_dir(&path).await?;
                } else {
                    remote.remove_file(&path).await?;
                }
            }
            Ok(Value::Bool(true))
        }

        "local:home" => Ok(Value::String(local::home())),

        "local:list" => {
            let path = str_arg(args, 0)?;
            local::list(&path)
        }

        "local:mkdir" => {
            local::mkdir(&str_arg(args, 0)?)?;
            Ok(Value::Bool(true))
        }

        "local:rename" => {
            let from = str_arg(args, 0)?;
            let to = str_arg(args, 1)?;
            local::rename(&from, &to)?;
            Ok(Value::Bool(true))
        }

        "local:delete" => {
            let paths: Vec<String> = array_arg(args, 0)?
                .iter()
                .filter_map(|v| v.as_str().map(|s| s.to_string()))
                .collect();
            tokio::task::spawn_blocking(move || local::delete(&paths))
                .await
                .map_err(|e| e.to_string())??;
            Ok(Value::Bool(true))
        }

        "local:open" => {
            let path = str_arg(args, 0)?;
            tokio::task::spawn_blocking(move || local::open(&path))
                .await
                .map_err(|e| e.to_string())??;
            Ok(Value::Bool(true))
        }

        "local:join" => Ok(Value::String(local::join(
            &str_arg(args, 0)?,
            &str_arg(args, 1)?,
        ))),

        "pick:key" => {
            let picked = tokio::task::spawn_blocking(|| {
                rfd::FileDialog::new()
                    .set_title("Özel anahtar dosyası seç")
                    .pick_file()
            })
            .await
            .map_err(|e| e.to_string())?;
            Ok(picked
                .map(|p| Value::String(p.to_string_lossy().into_owned()))
                .unwrap_or(Value::Null))
        }

        "pick:dir" => {
            let picked = tokio::task::spawn_blocking(|| {
                rfd::FileDialog::new()
                    .set_title("Klasör seç")
                    .pick_folder()
            })
            .await
            .map_err(|e| e.to_string())?;
            Ok(picked
                .map(|p| Value::String(p.to_string_lossy().into_owned()))
                .unwrap_or(Value::Null))
        }

        "sites:list" => {
            let loaded = sites::load_sites(&st.data_dir, app);
            *st.sites.lock().await = loaded.clone();
            Ok(Value::Array(loaded))
        }

        "sites:save" => {
            let incoming = array_arg(args, 0)?.to_vec();
            sites::save_sites(&st.data_dir, &incoming, app)?;
            *st.sites.lock().await = sites::sanitized(&incoming);
            Ok(Value::Bool(true))
        }

        "transfer:add" => {
            let connected = st.profile.lock().await.is_some();
            if !connected {
                return Err("Sunucuya bağlı değil".to_string());
            }
            let spec = arg(args, 0)?;
            let dir = field_str(spec, "dir")?;
            let dest_dir = field_str(spec, "destDir")?;
            let items = field(spec, "items")?
                .as_array()
                .ok_or_else(|| "Geçersiz items".to_string())?
                .clone();
            transfer::enqueue(st, app, &dir, &items, &dest_dir).await;
            transfer::start_pump(st.clone(), app.clone());
            Ok(Value::Bool(true))
        }

        "transfer:addPaths" => {
            let connected = st.profile.lock().await.is_some();
            if !connected {
                return Err("Sunucuya bağlı değil".to_string());
            }
            let spec = arg(args, 0)?;
            let dest_dir = field_str(spec, "destDir")?;
            let paths: Vec<String> = field(spec, "paths")?
                .as_array()
                .ok_or_else(|| "Geçersiz paths".to_string())?
                .iter()
                .filter_map(|v| v.as_str().map(|s| s.to_string()))
                .collect();
            transfer::add_paths(st, app, &paths, &dest_dir).await;
            transfer::start_pump(st.clone(), app.clone());
            Ok(Value::Bool(true))
        }

        "transfer:cancel" => {
            let id = arg(args, 0)?.as_i64().unwrap_or(0);
            Ok(Value::Bool(transfer::cancel(st, app, id).await))
        }

        "transfer:cancelAll" => {
            transfer::cancel_all(st, app).await;
            Ok(Value::Bool(true))
        }

        "transfer:retry" => {
            let id = arg(args, 0)?.as_i64().unwrap_or(0);
            transfer::retry(st, app, id).await;
            Ok(Value::Bool(true))
        }

        "transfer:clear" => {
            transfer::clear(st, app).await;
            Ok(Value::Bool(true))
        }

        "theme:set" => Ok(Value::Bool(true)),

        other => Err(format!("Bilinmeyen kanal: {other}")),
    }
}
