# NimbusFTP (Tauri v2)

Modern FTP / FTPES / FTPS / SFTP istemcisi. Arayüz web teknolojileriyle, arka uç Rust ile yazılmıştır.

## Geliştirme ortamı

- Node.js 18+ ve npm
- Rust (stable, `x86_64-pc-windows-msvc`)
- **Visual Studio Build Tools 2022 — "C++ with MSVC v143" iş yükü** (Windows'ta zorunlu)

```powershell
winget install Microsoft.VisualStudio.2022.BuildTools --override "--wait --add Microsoft.VisualStudio.Workload.VCTools --includeRecommended"
```

Rust kurulumu PATH'e eklenmediyse:

```powershell
$p = [Environment]::GetEnvironmentVariable("Path", "User")
[Environment]::SetEnvironmentVariable("Path", "$p;$env:USERPROFILE\.cargo\bin", "User")
```

`cl.exe`/`link.exe` yalnızca PATH'te olmakla çalışmaz; `INCLUDE`/`LIB` değişkenlerinin de ayarlı olması gerekir. Bu yüzden derlemeyi **"x64 Native Tools Command Prompt for VS 2022"** içinde yapın, ya da şu içerikte bir `.bat` kullanın:

```bat
@echo off
call "C:\Program Files (x86)\Microsoft Visual Studio\2022\BuildTools\VC\Auxiliary\Build\vcvars64.bat"
cmd
```

## Komutlar

```bash
npm install          # frontend bağımlılıkları
npm run dev          # Vite geliştirme sunucusu (yalnızca arayüz)
npm run tauri:dev    # Tauri uygulamasını geliştirme modunda açar
npm run build        # arayüzü dist-ui/ içine derler
npm run tauri:build  # NSIS kurulum dosyasını üretir
```

Rust bağımlılıkları `src-tauri/Cargo.lock` ile sabitlenmiştir.

## Yapı

- `src/renderer/` — HTML/CSS/JS arayüz
- `src/renderer/bridge.js` — Tauri `invoke`/`listen` köprüsü (`window.api`)
- `src-tauri/src/` — Rust arka uç (IPC, FTP/SFTP, aktarım kuyruğu, yerel dosya işlemleri)
- `src-tauri/tauri.conf.json` — uygulama ve paketleme ayarları

## Özellikler

- **Dil:** Üst çubuktaki `TR / EN` seçicisi ile arayüz dili anında değişir (varsayılan Türkçe). Tercih `settings.json` içinde saklanır.
- **Notepad'de aç / Klasörde göster:** Yerel panelde bir dosyaya sağ tıklayın. "Notepad uygulamasında aç" `Ayarlar` bölümünde belirttiğiniz editörle (varsayılan: `notepad.exe`) dosyayı açar; "Klasörde göster" dosyayı Explorer'da seçili halde gösterir.
- **Otomatik bağlanma:** Site Yöneticisi'nde bir site için "Başlangıçta bu siteye bağlan" seçeneğini işaretleyin veya hızlı bağlantı çubuğundaki "Otomatik bağlan" kutusunu kullanın. Site seçeneği işaretliyse önceliklidir; ikisi birbirini dışlar. Hızlı bağlantı bilgileri ve parola güvenli şekilde saklanır.

## Notlar

- Windows'ta dağıtım çıktısı **NSIS kurulum dosyası**dır; Tauri portable exe üretmez.
- WebView2 çalışma zamanı gereklidir; Windows 11'de hazır gelir.
- Harici dosya sürükleme (işletim sisteminden panele) henüz desteklenmiyor; paneller arası sürükleme çalışıyor.
- Sunucu günlüğündeki ve bazı hata mesajlarındaki Türkçe metinler çevrilmemiştir; arayüz metinlerinin tamamı TR/EN desteklidir.
