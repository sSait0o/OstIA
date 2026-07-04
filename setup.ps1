# Premiere installation du projet OstIA (a lancer une seule fois, ou apres ajout de dependances)

$ErrorActionPreference = "Stop"
$root = $PSScriptRoot

function Test-Command($name) {
    return [bool](Get-Command $name -ErrorAction SilentlyContinue)
}

Write-Host "== Verification des prerequis ==" -ForegroundColor Cyan
foreach ($cmd in @("node", "npm", "python", "docker")) {
    if (Test-Command $cmd) {
        Write-Host "  [OK] $cmd" -ForegroundColor Green
    } else {
        Write-Host "  [MANQUANT] $cmd" -ForegroundColor Red
    }
}

Write-Host "`n== Fichiers .env ==" -ForegroundColor Cyan
foreach ($dir in @("backend", "core")) {
    $envPath = Join-Path $root "$dir\.env"
    $examplePath = Join-Path $root "$dir\.env.example"
    if (-not (Test-Path $envPath)) {
        if (Test-Path $examplePath) {
            Copy-Item $examplePath $envPath
            Write-Host "  Cree $dir\.env depuis .env.example (a completer !)" -ForegroundColor Yellow
        }
    } else {
        Write-Host "  $dir\.env existe deja" -ForegroundColor Green
    }
}

Write-Host "`n== Backend (NestJS) ==" -ForegroundColor Cyan
Push-Location (Join-Path $root "backend")
npm install
Pop-Location

Write-Host "`n== Frontend (Angular) ==" -ForegroundColor Cyan
Push-Location (Join-Path $root "frontend")
npm install
Pop-Location

Write-Host "`n== Core (FastAPI) ==" -ForegroundColor Cyan
Push-Location (Join-Path $root "core")
if (-not (Test-Path "venv")) {
    python -m venv venv
}
& ".\venv\Scripts\pip.exe" install -r requirements.txt
Pop-Location

Write-Host "`n== Base de donnees (Docker) ==" -ForegroundColor Cyan
Push-Location $root
docker-compose up -d postgres
Pop-Location

Write-Host "`nInstallation terminee." -ForegroundColor Green
Write-Host "Pense a completer backend\.env et core\.env si besoin, puis lance .\start.ps1" -ForegroundColor Yellow
