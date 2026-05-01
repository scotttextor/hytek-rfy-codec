$pairs = @()
# Focus on HG260012 (large project with many plans)
$projDir = 'Y:\(17) 2026 HYTEK PROJECTS\AKAM CONSTRUCTIONS\HG260012 23 SPRINGWOOD ST TOWNHOUSES'
$xmlDir = Join-Path $projDir '03 DETAILING\03 FRAMECAD DETAILER\01 XML OUTPUT'
$mfgDir = Join-Path $projDir '06 MANUFACTURING'

if (Test-Path $xmlDir) {
  $xmls = Get-ChildItem $xmlDir -Filter '*.xml' -ErrorAction SilentlyContinue
  $rfys = Get-ChildItem $mfgDir -Recurse -Filter '*.rfy' -ErrorAction SilentlyContinue
  Write-Host "Found $($xmls.Count) XMLs and $($rfys.Count) RFYs in HG260012"
  foreach ($x in $xmls) {
    if ($x.Name -match '([\w]+-(GF|1F|2F|TH\d+|R\d+)-\w+-(70|75|78|89|90|104)\.\d+)\.xml$') {
      $plan = $matches[1]
      $rfy = $rfys | Where-Object { $_.Name -match [regex]::Escape($plan) } | Select-Object -First 1
      if ($rfy) {
        $pairs += [pscustomobject]@{ xml = $x.FullName; rfy = $rfy.FullName; plan = $plan }
      }
    }
  }
}
$pairs | ConvertTo-Json -Depth 3 -Compress
