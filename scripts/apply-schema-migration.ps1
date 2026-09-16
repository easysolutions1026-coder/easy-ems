# Apply Prisma schema migration for the backend.
# Layout: schema.prisma is at <repo-root>/prisma/schema.prisma,
# Node code is at <repo-root>/backend/. We run prisma from backend/
# (so it picks up the correct node_modules) but pass --schema to
# point at the parent-folder schema.
#
# Usage:
#   .\scripts\apply-schema-migration.ps1
#   .\scripts\apply-schema-migration.ps1 -Name add_something_else

param(
    [string]$Name = 'add_other_income_and_letters'
)

$ErrorActionPreference = 'Stop'

$scriptDir  = Split-Path -Parent $MyInvocation.MyCommand.Path
$repoRoot   = Split-Path -Parent $scriptDir
$backendDir = Join-Path $repoRoot 'backend'
$schemaFile = Join-Path $repoRoot 'prisma\schema.prisma'
# Relative path from backendDir to schemaFile, since npx prisma runs from backendDir
$schemaRel  = '..\prisma\schema.prisma'

foreach ($p in @($backendDir, $schemaFile)) {
    if (-not (Test-Path $p)) {
        Write-Host ('ERROR: not found: ' + $p) -ForegroundColor Red
        exit 1
    }
}

Write-Host ''
Write-Host ('=' * 60)
Write-Host 'Prisma Migration'
Write-Host ('=' * 60)
Write-Host ('Backend dir:    ' + $backendDir)
Write-Host ('Schema file:    ' + $schemaFile)
Write-Host ('Migration name: ' + $Name)
Write-Host ''

Push-Location $backendDir
try {
    Write-Host '--- Applying migration ---' -ForegroundColor Cyan
    & npx prisma migrate dev --schema $schemaRel --name $Name
    if ($LASTEXITCODE -ne 0) {
        Write-Host ''
        Write-Host 'Migration FAILED. See errors above.' -ForegroundColor Red
        Write-Host 'Common causes:'
        Write-Host '  - DATABASE_URL env var not set or wrong'
        Write-Host '  - Dev DB not reachable'
        Write-Host '  - Schema has a syntax error'
        Write-Host '  - Migration with same name already exists'
        exit 1
    }
    Write-Host ''

    Write-Host '--- Regenerating Prisma Client ---' -ForegroundColor Cyan
    & npx prisma generate --schema $schemaRel
    if ($LASTEXITCODE -ne 0) {
        Write-Host 'Prisma generate FAILED.' -ForegroundColor Red
        exit 1
    }
    Write-Host ''

    Write-Host ('=' * 60) -ForegroundColor Green
    Write-Host 'Migration applied successfully.' -ForegroundColor Green
    Write-Host ('=' * 60) -ForegroundColor Green
    Write-Host ''
    Write-Host 'Next steps:'
    Write-Host '  1. Deploy to Cloud Run: .\scripts\deploy-to-cloud-run-with-sql.ps1'
    Write-Host '     (your existing deploy script wires the Cloud SQL secret)'
    Write-Host '  2. Re-run migration for the three new collections:'
    Write-Host '     .\scripts\migrate-from-prod.ps1 -OAuthToken "<token>"'

} finally {
    Pop-Location
}