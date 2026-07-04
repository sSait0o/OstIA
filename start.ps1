# Lancement quotidien du projet OstIA : postgres (Docker) + core (FastAPI) + backend (NestJS) + frontend (Angular)

$root = $PSScriptRoot

Write-Host "== Demarrage de PostgreSQL (Docker) ==" -ForegroundColor Cyan
Push-Location $root
docker-compose up -d postgres
Pop-Location

Write-Host "== Demarrage du core (FastAPI) ==" -ForegroundColor Cyan
Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd '$root\core'; .\venv\Scripts\Activate.ps1; uvicorn app.main:app --reload --port 8001"

Write-Host "== Demarrage du backend (NestJS) ==" -ForegroundColor Cyan
Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd '$root\backend'; npm run start:dev"

Write-Host "== Demarrage du frontend (Angular) ==" -ForegroundColor Cyan
Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd '$root\frontend'; npx ng serve"

Write-Host "`nTout est lance. Frontend disponible sur http://localhost:4200" -ForegroundColor Green
