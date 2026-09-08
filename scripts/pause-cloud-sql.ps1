# ============================================================
# IMSE EASY EMS - Pause Cloud SQL to save money
# ============================================================
# When you're not testing, run this to stop the Cloud SQL instance.
# Storage remains (~₹100-200/month) but no compute charges.
# ============================================================

Write-Host "============================================================" -ForegroundColor Cyan
Write-Host "PAUSING Cloud SQL Instance" -ForegroundColor Cyan
Write-Host "============================================================" -ForegroundColor Cyan

Write-Host "`nCurrent status..." -ForegroundColor Yellow
gcloud sql instances describe ems-postgres --format="value(state)"

Write-Host "`nStopping instance..." -ForegroundColor Yellow
gcloud sql instances patch ems-postgres --activation-policy=NEVER --quiet

Write-Host "`nWaiting for state change..." -ForegroundColor Yellow
Start-Sleep -Seconds 5

$state = gcloud sql instances describe ems-postgres --format="value(state)"
Write-Host "New status: $state" -ForegroundColor Green

Write-Host ""
Write-Host "============================================================" -ForegroundColor Cyan
Write-Host "COST SAVINGS:" -ForegroundColor Cyan
Write-Host "  When running: ~₹1,500/month" -ForegroundColor Yellow
Write-Host "  When stopped: ~₹100-200/month (storage only)" -ForegroundColor Green
Write-Host "  Savings:      ~₹1,300/month" -ForegroundColor Green
Write-Host "============================================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "To resume, run: .\scripts\resume-cloud-sql.ps1" -ForegroundColor White
Write-Host "Cloud Run app will show DB error until Cloud SQL is resumed" -ForegroundColor Gray