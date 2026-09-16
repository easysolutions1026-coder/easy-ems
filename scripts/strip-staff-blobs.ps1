# Strip inline base64 document bytes from staff.json before Cloud SQL migration.
# Cloud Run's /api/data/<collection> endpoint has a 32 MB response ceiling.
# A raw staff.json full of dataUrl blobs returns 500. Metadata is preserved
# so listings still render; only the dataUrl bytes are removed.
#
# Usage: from the folder containing staff.json:
#   .\scripts\strip-staff-blobs.ps1

$ErrorActionPreference = 'Stop'
$in  = Join-Path (Get-Location) 'staff.json'
$out = Join-Path (Get-Location) 'staff-stripped.json'

if (-not (Test-Path $in)) {
    Write-Host "Input not found: $in"
    Write-Host "  Put staff.json in the current directory, then re-run."
    exit 1
}

$inSize = (Get-Item $in).Length
Write-Host "Reading $in"
Write-Host ('Input size: {0:N2} MB' -f ($inSize / 1MB))

$content = [System.IO.File]::ReadAllText($in, [System.Text.Encoding]::UTF8)

# Strip "dataUrl":"..." in all three positional variants so we never leave
# dangling commas. Order matters: comma-before first is safest.
$patterns = @(
    ',\s*"dataUrl"\s*:\s*"[^"]*"',
    '"dataUrl"\s*:\s*"[^"]*"\s*,',
    '"dataUrl"\s*:\s*"[^"]*"'
)

$totalMatches = 0
$totalBytes = 0
foreach ($pattern in $patterns) {
    $found = [regex]::Matches($content, $pattern)
    $totalMatches += $found.Count
    foreach ($m in $found) { $totalBytes += $m.Length }
    $content = [regex]::Replace($content, $pattern, '')
}

# Defensive: also strip legacy blob field names if any exist
foreach ($fieldName in @('base64', 'content', 'bytes')) {
    $legacyPatterns = @(
        (',\s*"' + $fieldName + '"\s*:\s*"[^"]*"'),
        ('"' + $fieldName + '"\s*:\s*"[^"]*"\s*,'),
        ('"' + $fieldName + '"\s*:\s*"[^"]*"')
    )
    foreach ($lp in $legacyPatterns) {
        $legacy = [regex]::Matches($content, $lp)
        if ($legacy.Count -gt 0) {
            Write-Host ('  - found {0} legacy "{1}" field(s), stripping' -f $legacy.Count, $fieldName)
            $content = [regex]::Replace($content, $lp, '')
        }
    }
}

# Sanity check: result must still be valid JSON
try {
    $null = $content | ConvertFrom-Json -ErrorAction Stop
} catch {
    Write-Host "Result is not valid JSON. Refusing to write output."
    Write-Host "Error: $_"
    exit 1
}

[System.IO.File]::WriteAllText($out, $content, [System.Text.Encoding]::UTF8)
$outSize = (Get-Item $out).Length
$pct = (1 - $outSize / $inSize) * 100

Write-Host ''
Write-Host ('-' * 60)
Write-Host ('dataUrl fields stripped: {0}' -f $totalMatches)
Write-Host ('Bytes removed:           {0:N2} MB' -f ($totalBytes / 1MB))
Write-Host ('-' * 60)
Write-Host "Wrote $out"
Write-Host ('Output size: {0:N3} MB' -f ($outSize / 1MB))
Write-Host ('Reduction:   {0:N1} percent' -f $pct)
Write-Host ''
Write-Host 'Migrate staff-stripped.json instead of staff.json.'
Write-Host 'Keep the original as backup until GCS attachment migration is done.'