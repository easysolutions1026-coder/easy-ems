# Incremental migration — appends prod records missing from Cloud SQL
# Existing Cloud SQL entries are never modified. See dedup rules below.
#
# Usage:
#   .\scripts\migrate-from-prod.ps1 -OAuthToken "<token>"
#
# Dry run first (recommended — shows what would happen without writing):
#   .\scripts\migrate-from-prod.ps1 -OAuthToken "<token>" -DryRun
#
# Test one collection first:
#   .\scripts\migrate-from-prod.ps1 -OAuthToken "<token>" -Only directorExpenses
#
# Get the OAuth token:
#   1. Sign in to Cloud Run app
#   2. F12 -> Application -> Session Storage -> the cloudrun URL
#   3. Click _bmsOAuth -> in the right pane, find "token": "..."
#   4. Copy the token value (without quotes)

param(
    [Parameter(Mandatory=$true)]
    [string]$OAuthToken,
    [string]$Backend = 'https://ems-backend-43lhgkm2la-el.a.run.app',
    [string]$MigrationDir = 'C:\Users\pc\Downloads\migration files',
    [switch]$DryRun,
    [string]$Only = ''
)

$ErrorActionPreference = 'Stop'

# Per-collection ID field. Records with no value in this field are skipped
# (they can't be safely deduplicated). Settings and auditLog handled separately.
$ID_FIELDS = @{
    'transactions'           = 'txnID'
    'parties'                = 'partyID'
    'expenses'               = 'expID'
    'bankAccounts'           = 'id'
    'staff'                  = 'staffID'
    'projectExpenses'        = 'expID'
    'workLogs'               = 'workLogID'
    'payslips'               = 'payslipID'
    'directorExpenses'       = 'deID'
    'fundRequests'           = 'frID'
    'fundPools'              = 'fpID'
    'paymentRequests'        = 'prID'
    'appUsers'               = 'userID'
    'pettyCashOffices'       = 'id'
    'pettyCashTransactions'  = 'pcID'
    'pettyCashStatements'    = 'id'
    'gstCashLedgerSnapshots' = 'month'
    'companyDocuments'       = 'id'
    'coverLetters'           = 'id'
    'returnableToolsLetters' = 'id'
    'arInvoices'             = 'invoiceID'
    'bankReconciliations'    = 'id'
    'otherIncome'            = 'incomeID'
    'chartOfAccounts'        = 'id'
}

# Load order roughly matches referential dependency (users, master data,
# then transactional). Not strictly required since dedup works by ID
# regardless of order.
$COLLECTIONS = @(
    'appUsers', 'parties', 'bankAccounts', 'chartOfAccounts',
    'staff', 'projectExpenses', 'workLogs', 'payslips',
    'transactions', 'expenses', 'directorExpenses',
    'arInvoices', 'paymentRequests',
    'fundRequests', 'fundPools',
    'pettyCashOffices', 'pettyCashTransactions', 'pettyCashStatements',
    'gstCashLedgerSnapshots', 'companyDocuments',
    'coverLetters', 'returnableToolsLetters',
    'bankReconciliations', 'otherIncome',
    'auditLog'
)

if ($Only) {
    if ($COLLECTIONS -notcontains $Only) {
        Write-Host "Unknown collection: $Only"
        Write-Host ('Valid options: ' + ($COLLECTIONS -join ', '))
        exit 1
    }
    $COLLECTIONS = @($Only)
    Write-Host ('Filtered to single collection: ' + $Only)
}

$mode = if ($DryRun) { 'DRY RUN (no writes)' } else { 'LIVE (writes to Cloud SQL)' }
Write-Host ''
Write-Host ('============================================================')
Write-Host ('Migration mode: ' + $mode)
Write-Host ('Backend:        ' + $Backend)
Write-Host ('Migration dir:  ' + $MigrationDir)
Write-Host ('Collections:    ' + $COLLECTIONS.Count)
Write-Host ('============================================================')

$headers = @{
    'Authorization' = ('Bearer ' + $OAuthToken)
    'Content-Type'  = 'application/json'
}

function Get-RecordHash {
    param([Parameter(Mandatory=$true)]$Record)
    # Compact JSON of the record, then SHA1 hex. Stable enough for dedup
    # within a single migration run. Depth 20 covers our nested structures.
    $json = $Record | ConvertTo-Json -Depth 20 -Compress
    $bytes = [System.Text.Encoding]::UTF8.GetBytes($json)
    $hash = [System.Security.Cryptography.SHA1]::Create().ComputeHash($bytes)
    return [System.BitConverter]::ToString($hash) -replace '-',''
}

$results = @()

foreach ($col in $COLLECTIONS) {
    Write-Host ''
    Write-Host ('--- ' + $col + ' ---')

    # Locate local file (staff uses stripped variant)
    $fileName = if ($col -eq 'staff') { 'staff-stripped.json' } else { ($col + '.json') }
    $localFile = Join-Path $MigrationDir $fileName

    if (-not (Test-Path $localFile)) {
        Write-Host ('  SKIP: file not found (' + $localFile + ')')
        $results += [PSCustomObject]@{
            Collection = $col; Status = 'skip: no file'; Remote = '-'; Local = '-'; Added = 0
        }
        continue
    }

    # 1. Fetch current Cloud SQL contents
    try {
        $remoteJson = Invoke-WebRequest -Uri ($Backend + '/api/data/' + $col) `
                                        -Headers $headers -Method Get -UseBasicParsing
        $remote = $remoteJson.Content | ConvertFrom-Json
        if ($null -eq $remote) { $remote = @() }
        if ($remote -isnot [array]) { $remote = @($remote) }
    } catch {
        Write-Host ('  ERROR fetching remote: ' + $_.Exception.Message)
        $results += [PSCustomObject]@{
            Collection = $col; Status = 'error: fetch'; Remote = '-'; Local = '-'; Added = 0
        }
        continue
    }

    # 2. Load local file
    $localText = [System.IO.File]::ReadAllText($localFile, [System.Text.Encoding]::UTF8)
    $local = $localText | ConvertFrom-Json
    if ($null -eq $local) { $local = @() }
    if ($local -isnot [array]) { $local = @($local) }

    Write-Host ('  Remote: ' + $remote.Count + ' records')
    Write-Host ('  Local:  ' + $local.Count + ' records')

    # 3. Compute set of remote records for dedup
    $remoteKeys = @{}
    if ($col -eq 'auditLog') {
        # Composite dedup — audit entries have no reliable unique ID field
        foreach ($r in $remote) {
            $remoteKeys[(Get-RecordHash $r)] = $true
        }
    } else {
        $idField = $ID_FIELDS[$col]
        if (-not $idField) {
            Write-Host '  SKIP: no ID field mapping'
            $results += [PSCustomObject]@{
                Collection = $col; Status = 'skip: no ID map'; Remote = $remote.Count; Local = $local.Count; Added = 0
            }
            continue
        }
        foreach ($r in $remote) {
            $v = $r.$idField
            if ($null -ne $v -and "$v".Length -gt 0) { $remoteKeys[[string]$v] = $true }
        }
    }

    # 4. Find new records in local
    $newRecords = @()
    $orphaned = 0
    foreach ($r in $local) {
        if ($col -eq 'auditLog') {
            $key = Get-RecordHash $r
        } else {
            $v = $r.($ID_FIELDS[$col])
            if ($null -eq $v -or "$v".Length -eq 0) { $orphaned++; continue }
            $key = [string]$v
        }
        if (-not $remoteKeys.ContainsKey($key)) {
            $newRecords += $r
        }
    }

    Write-Host ('  New to add:    ' + $newRecords.Count)
    if ($orphaned -gt 0) {
        Write-Host ('  Skipped (no ID field): ' + $orphaned)
    }

    if ($newRecords.Count -eq 0) {
        $results += [PSCustomObject]@{
            Collection = $col; Status = 'no new'; Remote = $remote.Count; Local = $local.Count; Added = 0
        }
        continue
    }

    if ($DryRun) {
        Write-Host '  DRY RUN: skipping write'
        $results += [PSCustomObject]@{
            Collection = $col; Status = 'would add'; Remote = $remote.Count; Local = $local.Count; Added = $newRecords.Count
        }
        continue
    }

    # 5. Merge and POST full array back
    $merged = @($remote) + $newRecords
    $body = $merged | ConvertTo-Json -Depth 20 -Compress
    $bodySizeMB = [Math]::Round(([System.Text.Encoding]::UTF8.GetByteCount($body) / 1MB), 2)
    Write-Host ('  Payload size: ' + $bodySizeMB + ' MB')

    try {
        $null = Invoke-WebRequest -Uri ($Backend + '/api/data/' + $col) `
                                  -Headers $headers -Method Post -Body $body `
                                  -UseBasicParsing -TimeoutSec 120
        Write-Host ('  OK: added ' + $newRecords.Count + ' records')
        $results += [PSCustomObject]@{
            Collection = $col; Status = 'ok'; Remote = $remote.Count; Local = $local.Count; Added = $newRecords.Count
        }
    } catch {
        Write-Host ('  ERROR posting: ' + $_.Exception.Message)
        $results += [PSCustomObject]@{
            Collection = $col; Status = 'error: post'; Remote = $remote.Count; Local = $local.Count; Added = 0
        }
    }
}

# Summary
Write-Host ''
Write-Host ('============================================================')
Write-Host 'MIGRATION SUMMARY'
Write-Host ('============================================================')
$results | Format-Table -AutoSize

$totalAdded = ($results | Measure-Object -Property Added -Sum).Sum
$errors = @($results | Where-Object { $_.Status -like 'error*' })

Write-Host ('Total records added: ' + $totalAdded)
if ($DryRun) { Write-Host '(DRY RUN — no writes performed)' }
if ($errors.Count -gt 0) {
    Write-Host ('Errors: ' + $errors.Count) -ForegroundColor Red
    exit 1
}
Write-Host 'Done.'