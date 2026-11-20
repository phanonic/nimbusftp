#[cfg(test)]
mod tests {
    use crate::util::{EventSink, Sink};
    use serde_json::{json, Value};
    use std::sync::Arc;

    struct Collect(std::sync::Mutex<Vec<String>>);
    impl EventSink for Collect {
        fn emit(&self, event: &str, payload: Value) {
            if event == "log" {
                self.0.lock().unwrap().push(
                    payload.get("m").and_then(|m| m.as_str()).unwrap_or("").to_string(),
                );
            }
        }
    }

    #[test]
    fn keyring_roundtrip() {
        let e = keyring::Entry::new("nimbusftp", "test:password").unwrap();
        e.set_password("secret123").unwrap();
        assert_eq!(e.get_password().unwrap(), "secret123");
        // Farklı Entry örneği de aynı değeri okuyabilmeli (kalıcılık testi).
        let e2 = keyring::Entry::new("nimbusftp", "test:password").unwrap();
        assert_eq!(e2.get_password().unwrap(), "secret123");
    }

    /// Kaydet -> sites.json'da bos -> yeniden oku -> parola keyring'den gelsin.
    #[test]
    fn sites_password_roundtrip() {
        let dir = std::env::temp_dir().join(format!("nimbus-sites-test-{}", std::process::id()));
        std::fs::create_dir_all(&dir).unwrap();
        let collector = Arc::new(Collect(std::sync::Mutex::new(Vec::new())));
        let sink: Sink = collector.clone();
        let id = format!("roundtrip-{}", std::process::id());
        let site = json!({
            "id": id, "name": "test", "protocol": "ftp", "host": "127.0.0.1",
            "port": 21, "user": "u", "password": "s3cr3t", "passphrase": "",
            "anonymous": false, "keyPath": "", "remoteDir": "",
            "localDir": "", "allowInvalidCert": false
        });

        crate::sites::save_sites(&dir, &[site], &sink).unwrap();
        let raw = crate::util::read_json(&dir.join("sites.json"));
        assert_eq!(raw[0]["password"], "", "parola sites.json'da acik kalmamali");

        let loaded = crate::sites::load_sites(&dir, &sink);
        assert_eq!(
            loaded[0]["password"], "s3cr3t",
            "parola yeniden acilista keyring'den okunamadi: {:?}",
            collector.0.lock().unwrap()
        );
    }
}
