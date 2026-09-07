# ============================================================
# IMSE EASY EMS - Cloud Run Rollback
# Usage: .\scripts\rollback-cloud-run.ps1
# ============================================================

$PROJECT_ID = "easy-ems-507406"
$REGION = "asia-south1"
$SERVICE_NAME = "ems-backend"

Write-Host "============================================================" -ForegroundColor Cyan
Write-Host "Cloud Run Rollback" -ForegroundColor Cyan
Write-Host "============================================================" -ForegroundColor Cyan

# List recent revisions
Write-Host "`nRecent revisions:" -ForegroundColor Yellow
gcloud run revisions list --service $SERVICE_NAME --region $REGION --limit 10

Write-Host ""
$revision = Read-Host "Enter the revision NAME to rollback to (e.g. ems-backend-00003-abc)"

if ([string]::IsNullOrWhiteSpace($revision)) {
    Write-Host "No revision provided. Exiting." -ForegroundColor Red
    exit 1
}

Write-Host "`nRolling back to: $revision" -ForegroundColor Yellow

gcloud run services update-traffic $SERVICE_NAME `
    --region $REGION `
    --to-revisions "$revision=100"

if ($LASTEXITCODE -eq 0) {
    Write-Host "OK Rollback complete" -ForegroundColor Green
    
    $serviceUrl = gcloud run services describe $SERVICE_NAME --region $REGION --format "value(status.url)"
    Write-Host "`nService URL: $serviceUrl"
    Write-Host "Verify with: Invoke-RestMethod $serviceUrl/healthz"
} else {
    Write-Host "FAIL Rollback failed" -ForegroundColor Red
    exit 1
}