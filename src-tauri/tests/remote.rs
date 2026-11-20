use super::{ProgressCb, Remote};
use crate::state::Profile;
use crate::util::Sink;
use std::path::PathBuf;
use std::sync::Arc;

fn ftp_profile() -> Profile {
    Profile {
        protocol: "ftp".into(),
        host: "127.0.0.1".into(),
        port: Some(2121),
        user: "test".into(),
        password: "test123".into(),
        ..Default::default()
    }
}

fn work_dir() -> PathBuf {
    let dir = std::env::temp_dir().join("nimbusftp-e2e");
    std::fs::create_dir_all(&dir).unwrap();
    dir
}

/// Yerel pyftpdlib sunucusuna karşı gerçek Remote katmanını uçtan uca test eder.
#[tokio::test]
async fn ftp_connect_list_upload_download_rename_delete() {
    let dir = work_dir();
    let src = dir.join("upload.txt");
    let dst = dir.join("downloaded.txt");
    let content = b"nimbusftp test content\n";
    std::fs::write(&src, content).unwrap();
    let _ = std::fs::remove_file(&dst);

    let app = tauri::test::mock_app();
    let sink: Sink = Arc::new(app.handle().clone());
    let mut remote = Remote::new(ftp_profile(), "test", sink, dir.clone());
    remote.connect().await.expect("FTP bağlantısı başarısız");
    assert!(remote.alive(), "connect sonrası alive olmalı");

    let cwd = remote.pwd().await.expect("PWD başarısız");
    assert!(!cwd.is_empty(), "PWD boş döndü");

    remote.mkdir("/e2e").await.expect("MKD başarısız");
    let cb: ProgressCb = Arc::new(|_| {});
    remote
        .upload(&src.to_string_lossy(), "/e2e/upload.txt", cb.clone())
        .await
        .expect("upload başarısız");

    let entries = remote.list("/e2e").await.expect("LIST başarısız");
    assert!(
        entries.iter().any(|e| e.name == "upload.txt" && !e.is_dir),
        "yüklenen dosya listede görünmüyor: {:?}",
        entries.iter().map(|e| &e.name).collect::<Vec<_>>()
    );

    remote
        .download("/e2e/upload.txt", &dst.to_string_lossy(), cb)
        .await
        .expect("download başarısız");
    assert_eq!(std::fs::read(&dst).unwrap(), content, "indirilen içerik farklı");

    remote
        .rename("/e2e/upload.txt", "/e2e/renamed.txt")
        .await
        .expect("RNFR/RNTO başarısız");
    let entries = remote.list("/e2e").await.unwrap();
    assert!(entries.iter().any(|e| e.name == "renamed.txt"));

    remote
        .remove_file("/e2e/renamed.txt")
        .await
        .expect("DELE başarısız");
    remote
        .remove_dir("/e2e")
        .await
        .expect("RMD başarısız");

    let _ = remote.close().await;
}
