param(
  [Parameter(Mandatory = $true)]
  [string]$Version
)

# Surum: x.y.z  (on ek: v)
$ErrorActionPreference = 'Stop'
if ($Version -notmatch '^\d+\.\d+\.\d+$') {
  throw "Gecersiz surum: $Version (orn: 2.0.5)"
}

$root = Split-Path $PSScriptRoot -Parent
Set-Location $root
$tag = "v$Version"

Write-Host "==> Surum guncelleniyor: $Version"
npm run version:set -- $Version
if ($LASTEXITCODE -ne 0) { throw "version:set basarisiz" }

Write-Host "==> Calisan uygulamalar kapatiliyor"
Get-Process | Where-Object { $_.ProcessName -like '*nimbus*' } | ForEach-Object {
  Stop-Process -Id $_.Id -Force -ErrorAction SilentlyContinue
}

Write-Host "==> Tauri derleniyor"
$bat = Join-Path $env:TEMP "nimbus-build-$([guid]::NewGuid().ToString('N')).bat"
@"
@echo off
call "C:\Program Files (x86)\Microsoft Visual Studio\2022\BuildTools\VC\Auxiliary\Build\vcvars64.bat" >nul 2>&1
set PATH=$env:USERPROFILE\.cargo\bin;%PATH%
cd /d $root
npm run tauri:build
"@ | Set-Content -Encoding ASCII $bat
cmd /c $bat
Remove-Item $bat -Force -ErrorAction SilentlyContinue
if ($LASTEXITCODE -ne 0) { throw "tauri build basarisiz" }

Write-Host "==> Portable paket hazirlaniyor"
$outDir = Join-Path $root "dist-portable"
New-Item -ItemType Directory -Force -Path $outDir | Out-Null
Get-ChildItem $outDir -Filter 'NimbusFTP_*' -File | Remove-Item -Force
$exe = Join-Path $outDir "NimbusFTP_$($Version)_portable.exe"
$zip = Join-Path $outDir "NimbusFTP_$($Version)_portable.zip"
Copy-Item (Join-Path $root "src-tauri\target\release\nimbusftp.exe") $exe -Force
$readme = Join-Path $outDir "README.txt"
@"
NimbusFTP $Version - Portable
Kurulum gerekmez; arayuz dosyalari exe'nin icine gomuludur.
WebView2 Runtime gereklidir (Windows 11'de hazirdir).
"@ | Set-Content -Encoding UTF8 $readme
if (Test-Path $zip) { Remove-Item $zip -Force }
Compress-Archive -Path $exe, $readme -DestinationPath $zip

$setup = Join-Path $root "src-tauri\target\release\bundle\nsis\NimbusFTP_$($Version)_x64-setup.exe"

Write-Host "==> Commit, etiket ve yayin"
git add -A
git commit -m "Release $Version"
if ($LASTEXITCODE -ne 0) { throw "commit basarisiz" }
git push origin main
if ($LASTEXITCODE -ne 0) { throw "push basarisiz" }
git tag -a $tag -m "NimbusFTP $Version"
if ($LASTEXITCODE -ne 0) { throw "tag basarisiz" }
git push origin $tag
if ($LASTEXITCODE -ne 0) { throw "tag push basarisiz" }
gh release create $tag $exe $zip $setup --title "NimbusFTP $Version" --generate-notes
if ($LASTEXITCODE -ne 0) { throw "release basarisiz" }

Write-Host "==> Eski release'lar siliniyor"
$releases = gh release list --json tagName | ConvertFrom-Json
foreach ($r in $releases) {
  if ($r.tagName -ne $tag) {
    Write-Host "  siliniyor: $($r.tagName)"
    gh release delete $r.tagName --yes --cleanup-tag
    if ($LASTEXITCODE -ne 0) { Write-Warning "$($r.tagName) silinemedi" }
  }
}
Write-Host "==> Bitti: $tag"
