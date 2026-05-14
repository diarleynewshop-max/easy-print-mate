# Easy Print Mate — Script de publicação automática
# Uso: .\scripts\publish.ps1
# Ou com versão: .\scripts\publish.ps1 -Version "1.2.0"

param(
    [string]$Version = ""
)

$ErrorActionPreference = "Stop"
$ProjectRoot = Split-Path -Parent $PSScriptRoot
$TokenFile   = "$env:USERPROFILE\.github-token"

# 1. Ler token
if (-not (Test-Path $TokenFile)) {
    Write-Error "Token não encontrado em $TokenFile`nCrie o arquivo com seu GitHub PAT (Contents: Read and write)."
}
$env:GH_TOKEN = (Get-Content $TokenFile -Raw).Trim()
Write-Host "Token carregado." -ForegroundColor Cyan

# 2. Bump de versão (opcional)
$pkgPath = "$ProjectRoot\package.json"
$pkg = Get-Content $pkgPath -Raw | ConvertFrom-Json
$currentVersion = $pkg.version

if ($Version -ne "") {
    $newContent = (Get-Content $pkgPath -Raw) -replace "`"version`": `"$currentVersion`"", "`"version`": `"$Version`""
  [System.IO.File]::WriteAllText($pkgPath, $newContent, [System.Text.UTF8Encoding]::new($false))
    Write-Host "Versão atualizada: $currentVersion → $Version" -ForegroundColor Yellow
    $currentVersion = $Version
} else {
    Write-Host "Publicando versão atual: $currentVersion" -ForegroundColor Yellow
}

# 3. Build + upload para GitHub Releases
Set-Location $ProjectRoot
Write-Host "`nIniciando build e publicação..." -ForegroundColor Cyan
npm run dist:publish
if ($LASTEXITCODE -ne 0) { Write-Error "Falha no dist:publish" }

# 4. Publicar o draft automaticamente
Write-Host "`nPublicando draft release v$currentVersion..." -ForegroundColor Cyan
$headers = @{ Authorization = "Bearer $env:GH_TOKEN"; "Content-Type" = "application/json" }
$releases = Invoke-RestMethod -Uri "https://api.github.com/repos/diarleynewshop-max/easy-print-mate/releases" -Headers $headers
$draft = $releases | Where-Object { $_.draft -eq $true -or $_.tag_name -eq "v$currentVersion" } | Select-Object -First 1

if ($draft) {
    $body = "{`"draft`":false,`"tag_name`":`"v$currentVersion`",`"name`":`"v$currentVersion`",`"prerelease`":false}"
    $result = Invoke-RestMethod -Method Patch -Uri "https://api.github.com/repos/diarleynewshop-max/easy-print-mate/releases/$($draft.id)" -Headers $headers -Body $body
    Write-Host "Release publicado: $($result.html_url)" -ForegroundColor Green
} else {
    Write-Warning "Nenhum draft encontrado para publicar."
}

# 5. Copiar setup para pasta de distribuição
$dest = "C:\Users\diarl\OneDrive\Área de Trabalho\_PROJETOS_E_APPS\Easy Print Mate"
if (Test-Path $dest) {
    Copy-Item "$ProjectRoot\release\Easy Print Mate Setup.exe" -Destination $dest -Force
    Write-Host "Setup copiado para $dest" -ForegroundColor Green
}

Write-Host "`nPronto! v$currentVersion publicado com sucesso." -ForegroundColor Green
