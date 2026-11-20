---
name: Skill Creator
description: Create new OpenCode agent skills from a template or update an existing skill's name/description; use when the user asks to add, scaffold, generate, or refresh skills.
---

# Skill Creator

OpenCode V2 skill'lerini şablondan oluşturmak veya mevcutları güncellemek için kullanılır. Skill'ler `.opencode/skills/<id>/SKILL.md` (proje) ya da `~/.config/opencode/skills/<id>/SKILL.md` (global) yolunda tutulur.

## Kurallar

1. Skill ID'si dosya yolundan gelir; frontmatter `name` yalnızca görünen addır. ID `^[a-z0-9]+(-[a-z0-9]+)*$` biçiminde, 1–64 karakter olmalı ve dizin adıyla aynı olmalıdır.
2. Modelin skill'i keşfetmesi için `description` alanı zorunludur. Belirli bir durumda kullanılmasını istemiyorsan `metadata.opencode/autoinvoke: false` ekle.
3. Klasör formunu kullan (`<id>/SKILL.md`); yardımcı dosyalar (`scripts/`, `references/`, `templates/`) bu klasörün altına koyulur ve yollar SKILL.md'ye göre çözülür.
4. Aynı ID'ye sahip başka bir kaynak varsa daha sonraki kaynak kazanır. `/opencode` ile mevcut skill'leri kontrol et; çakışma varsa kullanıcıya söyle.
5. Yapılandırma değişiklikleri otomatik yeniden yüklenir; `/reload` yalnızca elle zorla yenileme içindir. Kullanıcıya yeniden başlatma önermeyin.

## Yeni skill oluşturma

`scripts/skill-manager.js` aracını kullan:

```bash
node .opencode/skills/skill-creator/scripts/skill-manager.js create <id> "<Ad>" "<Açıklama>"
```

Seçenekler:
- `--scope project` (varsayılan) veya `--scope global`
- `--root <dizin>` proje kökini açıkça belirt
- `--force` mevcut skill'i üzerine yaz

Script şablonu `templates/SKILL.md`'den kopyalar ve placeholder'ları doldurur. Ardından SKILL.md'nin gövdesini kullanıcının istediği iş akışıyla düzenle; `references/format.md` dosyasındaki kurallara uy.

Örnek:

```bash
node .opencode/skills/skill-creator/scripts/skill-manager.js create nimbus-release "Nimbus Release" "Bump version, build Tauri app and package portable exe"
```

## Mevcut skill'i güncelleme

Frontmatter alanlarını koruyarak güncellemek için:

```bash
node .opencode/skills/skill-creator/scripts/skill-manager.js update <id> --description "Yeni açıklama" --name "Yeni Ad"
```

Gövdeyi (frontmatter dışındaki içeriği) elle düzenle; script yalnızca `name`/`description` satırlarını değiştirir, diğer içeriği korur.

## Doğrulama kontrol listesi

- [ ] Dosya adı tam olarak `SKILL.md` ya da kaynak kökünde `*.md`
- [ ] `description` dolu ve ne zaman kullanılacağını anlatıyor
- [ ] ID kebab-case ve dizin adıyla eşleşiyor
- [ ] Çakışan ID yok (global/compatibility/project kaynakları)
- [ ] Yardımcı dosya yolları skill klasörüne göre doğru

Detaylı V2 kuralları için `references/format.md` dosyasını oku.
