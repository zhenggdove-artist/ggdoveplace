$src = Split-Path -Parent $MyInvocation.MyCommand.Path
$dst = 'D:\ELY\作品相關\###小遊戲製作GIT\NEW_WEB'

$folders = @('css','js','content','images','admin','.github')
foreach ($f in $folders) {
    $from = Join-Path $src $f
    $to   = Join-Path $dst $f
    if (Test-Path $from) {
        Copy-Item -Path $from -Destination $to -Recurse -Force
        Write-Host "Copied $f"
    }
}

$files = @('index.html','projects.html','exhibition.html','bio.html','contact.html','weapons.html')
foreach ($f in $files) {
    Copy-Item -Path (Join-Path $src $f) -Destination (Join-Path $dst $f) -Force
    Write-Host "Copied $f"
}

Write-Host ""
Write-Host "=== Done! Open GitHub Desktop, commit and push. ==="
