param(
    [Parameter(Mandatory=$true)]
    [string]$OAuthToken,
    [string]$Backend = 'https://ems-backend-43lhgkm2la-el.a.run.app',
    [string]$MigrationDir = 'C:\Users\pc\Downloads\migration files',
    [switch]$DryRun,
    [string]$Only = ''
)

$ErrorActionPreference = 'Stop'

$ID_FIELDS = @{
    'transactions'           = 'txnID'
    'parties'                = 'partyID'
    'expenses'               = 'expID'
    'bankAccounts'           = 'accountID'
    'staff'                  = 'staffID'
    'projectExpenses'        = @('peID', 'projExpID')
    'workLogs'               = 'wlID'
    'payslips'               = @('payslipID', 'psID')
    'directorExpenses'       = 'deID'
    'fundRequests'           = @('frID', 'requestID')
    'fundPools'              = 'poolID'
    'paymentRequests'        = 'prID'
    'appUsers'               = 'userID'
    'pettyCashOffices'       = 'officeID'
    'pettyCashTransactions'  = 'txnID'
    'pettyCashStatements'    = @('stmtID', 'statementID')
    'gstCashLedgerSnapshots' = 'snapshotID'
    'companyDocuments'       = 'docID'
    'coverLetters'           = 'letterID'
    'returnableToolsLetters' = 'letterID'
    'arInvoices'             = 'arID'
    'bankReconciliations'    = 'reconID'
    'otherIncome'            = 'incomeID'
    'chartOfAccounts'        = 'accountCode'
}

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
        exit 1
    }
    $COLLECTIONS = @($Only)
    Write-Host ('Filtered to single collection: ' + $Only)
}

$mode = if ($DryRun) { 'DRY RUN (no writes)' } else { 'LIVE (writes to Cloud SQL)' }
Write-Host ''
Write-Host ('=' * 60)
Write-Host ('Migration mode: ' + $mode)
Write-Host ('Backend:        ' + $Backend)
Write-Host ('Migration dir:  ' + $MigrationDir)
Write-Host ('Collections:    ' + $COLLECTIONS.Count)
Write-Host ('=' * 60)

$headers = @{
    'Authorization' = ('Bearer ' + $OAuthToken)
    'Content-Type'  = 'application/json'
}

function Get-RecordHash {
    param([Parameter(Mandatory=$true)]$Record)
    $json = $Record | ConvertTo-Json -Depth 20 -Compress
    $bytes = [System.Text.Encoding]::UTF8.GetBytes($json)
    $hash = [System.Security.Cryptography.SHA1]::Create().ComputeHash($bytes)
    return [System.BitConverter]::ToString($hash) -replace '-',''
}

$results = @()

foreach ($col in $COLLECTIONS) {
    Write-Host ''
    Write-Host ('--- ' + $col + ' ---')

    $fileName = if ($col -eq 'staff') { 'staff-stripped.json' } else { ($col + '.json') }
    $localFile = Join-Path $MigrationDir $fileName

    if (-not (Test-Path $localFile)) {
        Write-Host ('  SKIP: file not found (' + $localFile + ')')
        $results += [PSCustomObject]@{
            Collection = $col; Status = 'skip: no file'; Remote = '-'; Local = '-'; Added = 0
        }
        continue
    }

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

    $localText = [System.IO.File]::ReadAllText($localFile, [System.Text.Encoding]::UTF8)
    $local = $localText | ConvertFrom-Json
    if ($null -eq $local) { $local = @() }
    if ($local -isnot [array]) { $local = @($local) }

    Write-Host ('  Remote: ' + $remote.Count + ' records')
    Write-Host ('  Local:  ' + $local.Count + ' records')

    $remoteKeys = @{}
    if ($col -eq 'auditLog') {
        foreach ($r in $remote) {
            $remoteKeys[(Get-RecordHash $r)] = $true
        }
        } 
    else {
        $idFields = @($ID_FIELDS[$col])   # wrap single value or array into array
        if (-not $idFields -or $idFields.Count -eq 0) {
            Write-Host '  SKIP: no ID field mapping'
            $results += [PSCustomObject]@{
                Collection = $col; Status = 'skip: no ID map'; Remote = $remote.Count; Local = $local.Count; Added = 0
            }
            continue
        }
        foreach ($r in $remote) {
            $v = $null
            foreach ($f in $idFields) {
                if ($r.$f -ne $null -and "$($r.$f)".Length -gt 0) { $v = $r.$f; break }
            }
            if ($null -ne $v) { $remoteKeys[[string]$v] = $true }
        }
    }

    $newRecords = @()
    $orphaned = 0
    foreach ($r in $local) {
        if ($col -eq 'auditLog') {
            $key = Get-RecordHash $r
        } else {
            $idFields = @($ID_FIELDS[$col])
            $v = $null
            foreach ($f in $idFields) {
                if ($r.$f -ne $null -and "$($r.$f)".Length -gt 0) { $v = $r.$f; break }
            }
            if ($null -eq $v) { $orphaned++; continue }
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

Write-Host ''
Write-Host ('=' * 60)
Write-Host 'MIGRATION SUMMARY'
Write-Host ('=' * 60)
$results | Format-Table -AutoSize

$totalAdded = ($results | Measure-Object -Property Added -Sum).Sum
$errors = @($results | Where-Object { $_.Status -like 'error*' })

Write-Host ('Total records added: ' + $totalAdded)
if ($DryRun) { Write-Host '(DRY RUN)' }
if ($errors.Count -gt 0) {
    Write-Host ('Errors: ' + $errors.Count) -ForegroundColor Red
    exit 1
}
Write-Host 'Done.'