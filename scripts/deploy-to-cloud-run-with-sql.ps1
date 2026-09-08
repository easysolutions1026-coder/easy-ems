# ============================================================
# IMSE EASY EMS - Cloud Run Deployment (with Cloud SQL + Secret Manager)
# ============================================================

$ErrorActionPreference = "Stop"

# --- Configuration ---
$PROJECT_ID = "easy-ems-507406"
$PROJECT_NUMBER = "446056303892"
$REGION = "asia-south1"
$SERVICE_NAME = "ems-backend"
$IMAGE_NAME = "gcr.io/$PROJECT_ID/$SERVICE_NAME"
$CLOUD_SQL_INSTANCE = "easy-ems-507406:asia-south1:ems-postgres"
$SECRET_NAME = "cloud-sql-password"

Write-Host "============================================================" -ForegroundColor Cyan
Write-Host "IMSE EASY EMS - Cloud Run Deployment (Cloud SQL + Secret)" -ForegroundColor Cyan
Write-Host "============================================================" -ForegroundColor Cyan
Write-Host "Project:      $PROJECT_ID"
Write-Host "Region:       $REGION"
Write-Host "Cloud SQL:    $CLOUD_SQL_INSTANCE"
Write-Host ""

# --- Pre-flight checks ---
Write-Host "[1/5] Pre-flight checks..." -ForegroundColor Yellow
$account = gcloud config get-value account 2>$null
if ($account -eq "imseindia@gmail.com") {
    Write-Host "  OK Authenticated" -ForegroundColor Green
} else {
    Write-Host "  FAIL Not authenticated" -ForegroundColor Red
    exit 1
}

# --- Build the Docker image ---
Write-Host "`n[2/5] Building Docker image (3-5 min)..." -ForegroundColor Yellow
gcloud builds submit --config cloudbuild.yaml --timeout=15m .
if ($LASTEXITCODE -ne 0) {
    Write-Host "  FAIL Build failed" -ForegroundColor Red
    exit 1
}
Write-Host "  OK Build succeeded" -ForegroundColor Green

# --- Deploy to Cloud Run with Cloud SQL + Secret ---
Write-Host "`n[3/5] Deploying to Cloud Run with Cloud SQL..." -ForegroundColor Yellow

# The trick: use $$ to escape the $ in URL (PowerShell won't expand)
# DATABASE_URL will be constructed AT DEPLOY TIME with password from secret
$dbUrl = 'postgresql://ems_user:$$DB_PASSWORD@localhost/ems?host=/cloudsql/' + $CLOUD_SQL_INSTANCE

gcloud run deploy $SERVICE_NAME `
    --image $IMAGE_NAME `
    --region $REGION `
    --platform managed `
    --allow-unauthenticated `
    --port 8080 `
    --memory 512Mi `
    --cpu 1 `
    --min-instances 0 `
    --max-instances 3 `
    --timeout 300 `
    --concurrency 80 `
    --add-cloudsql-instances $CLOUD_SQL_INSTANCE `
    --set-env-vars "NODE_ENV=production" `
    --set-env-vars "GOOGLE_OAUTH_CLIENT_ID=446056303892-lcuj4rf9hv047sujfklb2vacqtd93k45.apps.googleusercontent.com" `
    --set-env-vars "GOOGLE_WORKSPACE_DOMAIN=" `
    --update-secrets="DB_PASSWORD=cloud-sql-password:latest"

if ($LASTEXITCODE -ne 0) {
    Write-Host "  FAIL Deployment failed" -ForegroundColor Red
    exit 1
}
Write-Host "  OK Deployed" -ForegroundColor Green

# --- Get the service URL ---
Write-Host "`n[4/5] Getting service URL..." -ForegroundColor Yellow
$serviceUrl = gcloud run services describe $SERVICE_NAME --region $REGION --format "value(status.url)"
Write-Host "  URL: $serviceUrl" -ForegroundColor Green

# --- Health check ---
Write-Host "`n[5/5] Health check (30 sec cold start)..." -ForegroundColor Yellow
Start-Sleep -Seconds 30
try {
    $response = Invoke-WebRequest "$serviceUrl/" -UseBasicParsing -TimeoutSec 30
    if ($response.StatusCode -eq 200) {
        Write-Host "  OK App responds: HTTP 200" -ForegroundColor Green
    }
} catch {
    Write-Host "  WARN Check logs: gcloud run services logs read $SERVICE_NAME --region $REGION" -ForegroundColor Yellow
}

Write-Host ""
Write-Host "============================================================" -ForegroundColor Cyan
Write-Host "DEPLOYMENT COMPLETE - Using Cloud SQL Postgres" -ForegroundColor Cyan
Write-Host "============================================================" -ForegroundColor Cyan
Write-Host "URL: $serviceUrl" -ForegroundColor White