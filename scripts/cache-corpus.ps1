param([string]$out = "C:\Users\Scott\CLAUDE CODE\hytek-rfy-codec\test-corpus\HG260012")
$pairs = Get-Content "C:\Users\Scott\CLAUDE CODE\hytek-rfy-codec\scripts\pairs.json" -Encoding UTF8 | ConvertFrom-Json
foreach ($p in $pairs) {
  $planSafe = $p.plan -replace '[^A-Za-z0-9._-]','_'
  Copy-Item $p.xml -Destination (Join-Path $out "$planSafe.xml") -Force
  Copy-Item $p.rfy -Destination (Join-Path $out "$planSafe.rfy") -Force
}
Write-Host "Cached $($pairs.Count) pairs to $out"
