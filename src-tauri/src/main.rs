#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod ipc;
mod local;
mod remote;
mod sites;
mod state;
mod transfer;
mod util;
mod window_state;

use std::sync::Arc;
use tauri::Manager;

fn main() {
    tauri::Builder::default()
        .setup(|app| {
            let data_dir = app
                .path()
                .app_data_dir()
                .unwrap_or_else(|_| std::env::temp_dir().join("nimbusftp"));
            app.manage(Arc::new(state::AppState::new(data_dir)));

            let window = app
                .get_webview_window("main")
                .expect("main penceresi bulunamadı");
            window_state::restore(&window);
            let _ = window.show();
            window_state::wire(&window);
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![ipc::ipc_call])
        .run(tauri::generate_context!())
        .expect("error while running NimbusFTP");
}
