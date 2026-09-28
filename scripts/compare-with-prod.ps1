# Compare local prod JSON files with Cloud SQL — side-by-side.
# Shows counts and identifies specific records missing from Cloud SQL.
# Read-only — makes NO changes.
#
# Usage:
#   .\scripts\compare-with-prod.ps1 -OAuthToken "ya29..."
#
# Get the OAuth token:
#   1. Sign in to Cloud Run app in browser
#   2. F12 -> Application -> Session Storage -> the URL
#   3. Click _bmsOAuth -> copy "token" value

param(
    [Parameter(Mandatory=$true)][string]$OAuthToken,
    [string]$Backend = 'https://ems-backend-43lhgkm2la-el.a.run.app',
    [string]$MigrationDir = 'C:\Users\pc\Downloads\migration files',
    [int]$ShowMissingUpTo = 10  # cap how many missing IDs to print per collection
)

$ErrorActionPreference = 'Continue'

# ID field names — supports fallbacks for collections where prod uses different names
$ID_FIELDS = @{
    'transactions'           = @('txnID')
    'parties'                = @('partyID')
    'expenses'               = @('expID')
    'bankAccounts'           = @('accountID', 'id')
    'staff'                  = @('staffID')
    'projectExpenses'        = @('peID', 'projExpID')
    'workLogs'               = @('wlID')
    'payslips'               = @('payslipID', 'psID')
    'directorExpenses'       = @('deID')
    'fundRequests'           = @('frID', 'requestID')
    'fundPools'              = @('poolID')
    'paymentRequests'        = @('prID')
    'appUsers'               = @('userID')
    'pettyCashOffices'       = @('officeID')
    'pettyCashTransactions'  = @('txnID', 'pcID')
    'pettyCashStatements'    = @('stmtID', 'statementID')
    'gstCashLedgerSnapshots' = @('snapshotID', 'month')
    'companyDocuments'       = @('docID')
    'coverLetters'           = @('letterID')
    'returnableToolsLetters' = @('letterID')
    'arInvoices'             = @('arID', 'invoiceID')
    'bankReconciliations'    = @('reconID')
    'otherIncome'            = @('incomeID')
    'chartOfAccounts'        = @('accountCode', 'id')
}

$COLLECTIONS = @(
    'appUsers', 'parties', 'bankAccounts', 'staff',
    'projectExpenses', 'workLogs', 'payslips',
    'transactions', 'expenses', 'directorExpenses',
    'arInvoices', 'paymentRequests',
    'fundRequests', 'fundPools',
    'pettyCashOffices', 'pettyCashTransactions', 'pettyCashStatements',
    'gstCashLedgerSnapshots', 'companyDocuments',
    'coverLetters', 'returnableToolsLetters',
    'bankReconciliations', 'otherIncome', 'chartOfAccounts',
    'auditLog'
)

$headers = @{ 'Authorization' = ('Bearer ' + $OAuthToken); 'Content-Type' = 'application/json' }

function Get-RecordId {
    param($Record, $IdFields)
    foreach ($f in $IdFields) {
        $v = $Record.$f
        if ($null -ne $v -and "$v".Length -gt 0) { return [string]$v }
    }
    return $null
}

Write-Host ''
Write-Host ('=' * 78)
Write-Host 'COMPARISON: local prod JSON  vs  Cloud SQL'
Write-Host ('=' * 78)
Write-Host ('{0,-25} {1,10} {2,10} {3,10} {4,10}' -f 'Collection', 'Local', 'Remote', 'Missing', 'Extra')
Write-Host ('-' * 78)

$allDetails = @()

foreach ($col in $COLLECTIONS) {
    $fileName = if ($col -eq 'staff') { 'staff-stripped.json' } else { ($col + '.json') }
    $localFile = Join-Path $MigrationDir $fileName

    $localCount  = 0
    $remoteCount = 0
    $missing     = @()
    $extra       = @()
    $note        = ''

    # Load local
    if (Test-Path $localFile) {
        try {
            $localText = [System.IO.File]::ReadAllText($localFile, [System.Text.Encoding]::UTF8)
            $local = $localText | ConvertFrom-Json
            if ($null -eq $local) { $local = @() }
            if ($local -isnot [array]) { $local = @($local) }
            $localCount = $local.Count
        } catch { $note = 'local: parse error' }
    } else {
        $note = 'local: no file'
        $local = @()
    }

    # Load remote
    try {
        $r = Invoke-WebRequest -Uri ($Backend + '/api/data/' + $col) `
                                -Headers $headers -Method Get -UseBasicParsing -ErrorAction Stop
        $remote = $r.Content | ConvertFrom-Json
        if ($null -eq $remote) { $remote = @() }
        if ($remote -isnot [array]) { $remote = @($remote) }
        $remoteCount = $remote.Count
    } catch {
        $status = $_.Exception.Response.StatusCode.value__
        $note = "remote: HTTP $status"
        $remote = @()
    }

    # If both loaded, compare by ID
    if ($localCount -gt 0 -and $note -eq '') {
        $idFields = $ID_FIELDS[$col]
        if ($idFields) {
            if ($col -eq 'auditLog') {
                # Audit log — no reliable ID, compare on ts+action+recordId
                $remoteKeys = @{}
                foreach ($rr in $remote) {
                    $k = "$($rr.ts)|$($rr.action)|$($rr.recordId)"
                    $remoteKeys[$k] = $true
                }
                foreach ($lr in $local) {
                    $k = "$($lr.ts)|$($lr.action)|$($lr.recordId)"
                    if (-not $remoteKeys.ContainsKey($k)) { $missing += $k }
                }
            } else {
                $remoteKeys = @{}
                foreach ($rr in $remote) {
                    $id = Get-RecordId $rr $idFields
                    if ($id) { $remoteKeys[$id] = $true }
                }
                $localKeys = @{}
                foreach ($lr in $local) {
                    $id = Get-RecordId $lr $idFields
                    if ($id) {
                        $localKeys[$id] = $true
                        if (-not $remoteKeys.ContainsKey($id)) { $missing += $id }
                    }
                }
                # Extra in Cloud SQL that isn't in prod
                foreach ($rid in $remoteKeys.Keys) {
                    if (-not $localKeys.ContainsKey($rid)) { $extra += $rid }
                }
            }
        }
    }

    # Print summary row
    $status = if ($note) { $note } 
              elseif ($missing.Count -eq 0 -and $extra.Count -eq 0) { 'match' } 
              else { '' }
    Write-Host ('{0,-25} {1,10} {2,10} {3,10} {4,10}  {5}' -f $col, $localCount, $remoteCount, $missing.Count, $extra.Count, $status)

    $allDetails += [PSCustomObject]@{
        Collection = $col
        Local      = $localCount
        Remote     = $remoteCount
        Missing    = $missing
        Extra      = $extra
        Note       = $note
    }
}

Write-Host ('=' * 78)

# Show missing IDs per collection
$anyMissing = $false
foreach ($d in $allDetails) {
    if ($d.Missing.Count -gt 0) {
        if (-not $anyMissing) {
            Write-Host ''
            Write-Host ('MISSING FROM CLOUD SQL (in prod but not migrated)') -ForegroundColor Yellow
            Write-Host ('=' * 78)
            $anyMissing = $true
        }
        Write-Host ''
        Write-Host ("--- $($d.Collection) — $($d.Missing.Count) missing ---") -ForegroundColor Yellow
        $showCount = [Math]::Min($d.Missing.Count, $ShowMissingUpTo)
        for ($i = 0; $i -lt $showCount; $i++) {
            Write-Host ("  " + $d.Missing[$i])
        }
        if ($d.Missing.Count -gt $ShowMissingUpTo) {
            Write-Host ("  ... and $($d.Missing.Count - $ShowMissingUpTo) more")
        }
    }
}

# Show extras (records in Cloud SQL that aren't in prod)
$anyExtra = $false
foreach ($d in $allDetails) {
    if ($d.Extra.Count -gt 0) {
        if (-not $anyExtra) {
            Write-Host ''
            Write-Host ('EXTRA IN CLOUD SQL (not in prod)') -ForegroundColor Cyan
            Write-Host ('=' * 78)
            $anyExtra = $true
        }
        Write-Host ''
        Write-Host ("--- $($d.Collection) — $($d.Extra.Count) extra ---") -ForegroundColor Cyan
        $showCount = [Math]::Min($d.Extra.Count, $ShowMissingUpTo)
        for ($i = 0; $i -lt $showCount; $i++) {
            Write-Host ("  " + $d.Extra[$i])
        }
        if ($d.Extra.Count -gt $ShowMissingUpTo) {
            Write-Host ("  ... and $($d.Extra.Count - $ShowMissingUpTo) more")
        }
    }
}

Write-Host ''
Write-Host ('Done. Summary object saved to $Global:comparison for further inspection.')
$Global:comparison = $allDetails