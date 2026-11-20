//! Pencere konum/boyut kalıcılığı — ayar dosyası yerine HKCU kayıt defteri.
use std::sync::atomic::{AtomicU64, Ordering};
use std::time::{SystemTime, UNIX_EPOCH};
use tauri::{PhysicalPosition, PhysicalSize, WebviewWindow, WindowEvent};
use winreg::enums::HKEY_CURRENT_USER;
use winreg::RegKey;

const KEY: &str = r"Software\NimbusFTP\Window";
const MIN_W: u32 = 1020;
const MIN_H: u32 = 620;
static LAST_SAVE: AtomicU64 = AtomicU64::new(0);

fn now_ms() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0)
}

/// Kaydedilmiş geometriyi uygular; geçersiz/e krandan taşmış değerleri yok sayar.
pub fn restore(window: &WebviewWindow) {
    let key = match RegKey::predef(HKEY_CURRENT_USER).open_subkey(KEY) {
        Ok(k) => k,
        Err(_) => return,
    };
    let get_num = |name: &str| -> Option<i64> {
        key.get_value::<String, _>(name)
            .ok()
            .and_then(|s| s.trim().parse::<i64>().ok())
    };

    if let (Some(w), Some(h)) = (get_num("W"), get_num("H")) {
        if w >= MIN_W as i64 && h >= MIN_H as i64 && w <= 8192 && h <= 8192 {
            let _ = window.set_size(PhysicalSize::new(w as u32, h as u32));
        }
    }

    if let (Some(x), Some(y)) = (get_num("X"), get_num("Y")) {
        let monitors = window.available_monitors().unwrap_or_default();
        let on_screen = monitors.iter().any(|m| {
            let mp = m.position();
            let ms = m.size();
            x >= mp.x as i64
                && y >= mp.y as i64
                && x < mp.x as i64 + ms.width as i64
                && y < mp.y as i64 + ms.height as i64
        });
        if monitors.is_empty() || on_screen {
            let _ = window.set_position(PhysicalPosition::new(x as i32, y as i32));
        }
    }

    if get_num("Maximized") == Some(1) {
        let _ = window.maximize();
    }
}

/// Sürükleme sırasında her olayda yazma yapmamak için ~500 ms kısıtlama.
pub fn schedule_save(window: &WebviewWindow) {
    let now = now_ms();
    let prev = LAST_SAVE.swap(now, Ordering::Relaxed);
    if now.saturating_sub(prev) >= 500 {
        save(window);
    }
}

pub fn save(window: &WebviewWindow) {
    let key = match RegKey::predef(HKEY_CURRENT_USER).create_subkey(KEY) {
        Ok((k, _)) => k,
        Err(_) => return,
    };

    let maximized = window.is_maximized().unwrap_or(false)
        || window.is_fullscreen().unwrap_or(false);
    let minimized = window.is_minimized().unwrap_or(false);
    let _ = key.set_value("Maximized", &if maximized { "1" } else { "0" });

    // Maksimize/minimize durumdayken normal geometri bozulmasın; mevcut değerleri koru.
    if maximized || minimized {
        return;
    }
    let pos = match window.outer_position() {
        Ok(p) => p,
        Err(_) => return,
    };
    // set_size() iç alan boyutunu ayarlar; outer_size() kaydedilirse her
    // açılışta başlık çubuğu/kernel kalınlığı kadar büyür.
    let size = match window.inner_size() {
        Ok(s) => s,
        Err(_) => return,
    };
    let _ = key.set_value("X", &pos.x.to_string());
    let _ = key.set_value("Y", &pos.y.to_string());
    let _ = key.set_value("W", &size.width.to_string());
    let _ = key.set_value("H", &size.height.to_string());
}

/// Pencere olaylarını kalıcılığa bağlar.
pub fn wire(window: &WebviewWindow) {
    let w = window.clone();
    window.on_window_event(move |event| match event {
        WindowEvent::Moved(_) | WindowEvent::Resized(_) => schedule_save(&w),
        WindowEvent::CloseRequested { .. } | WindowEvent::Destroyed => save(&w),
        _ => {}
    });
}
