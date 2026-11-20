# OpenCode V2 skill biçimi (özet)

Kaynak: https://opencode.ai/docs/skills/

## Konumlar

| Kapsam | Yol |
|---|---|
| Global | `~/.config/opencode/skills` |
| Global uyumluluk | `~/.claude/skills`, `~/.agents/skills` |
| Proje | `.opencode/skills` |
| Proje uyumluluk | `.claude/skills`, `.agents/skills` |

Proje kaynakları çalışma dizininden proje köküne kadar her seviyede aranır. `node_modules` ve gizli dizinler atlanır; kaynak kökünden 6 seviye aşağı inilir.

## Dosya biçimi

- Kaynak kökünde `review.md` gibi düz `.md`, ya da `<id>/SKILL.md` klasör formu.
- Klasör formu önerilir: `scripts/`, `references/`, `templates/` yanına konur; yollar SKILL.md'ye göredir.
- SKILL.md içeren klasör tek skill'dir; içinde daha fazla skill aranmaz.

## Frontmatter

```markdown
---
name: Git Release
description: Prepare release notes, version bumps, and GitHub releases
metadata:
  opencode/autoinvoke: false
---
```

| Alan | Etki |
|---|---|
| `name` | Görünen ad; yoksa dizin adından üretilir |
| `description` | Modelin skill'i keşfetmesi için gerekli; yoksa advertise edilmez |
| `metadata.opencode/autoinvoke: false` | Model listesinden gizler, elle yüklemeye açık bırakır |
| `disable-model-invocation: true` | Aynı etki (autoinvoke üstünlüğü vardır) |

## ID kuralları

ID dosya yolundan gelir, frontmatter `name`'den değil:

| Dosya | ID |
|---|---|
| `<source>/git-release.md` | `git-release` |
| `<source>/git-release/SKILL.md` | `git-release` |
| `<source>/teams/release/SKILL.md` | `release` |

Önerilen biçim: `^[a-z0-9]+(-[a-z0-9]+)*$`, 1–64 karakter, dizin adıyla aynı.

## Öncelik

Düşükten yükseğe: built-in → global `.claude`/`.agents` → proje `.claude`/`.agents` → `~/.config/opencode/skills` → proje `.opencode/skills` → `opencode.json` içindeki `skills` dizisi. Aynı ID varsa sonraki kaynak yüklenir.

## Yükleme

Model her adımda açıklaması olan ve gizlenmemiş skill'leri (yalnızca ID/ad/açıklama) görür. `skill` aracıyla tam ID çağrılarak gövde yüklenir; yardımcı dosyalar otomatik yüklenmez, ajan okur. Kullanıcı `@skill-id` ile elle yükleyebilir.

## İzinler

```jsonc
{
  "permissions": [
    { "action": "skill", "resource": "*", "effect": "allow" },
    { "action": "skill", "resource": "internal-*", "effect": "deny" }
  ]
}
```

`allow` reload gerektirmez; yapılandırma değişiklikleri otomatik uygulanır. `/reload` yalnızca zorla yenileme içindir.
