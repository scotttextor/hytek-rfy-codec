$pairs = @()
$xmls = Get-ChildItem 'Y:\(17) 2026 HYTEK PROJECTS' -Recurse -Filter '*.xml' -ErrorAction SilentlyContinue | Where-Object { $_.FullName -match 'XML OUTPUT' -and $_.Name -match '\.075\.xml$|\.095\.xml$' }
foreach ($x in $xmls) {
  if ($x.Name -match '([\w]+-(GF|1F|2F|TH\d+|R\d+)-\w+-(70|75|78|89|90|104)\.\d+)\.xml$') {
    $plan = $matches[1]
    $projDir = Split-Path (Split-Path (Split-Path $x.FullName -Parent) -Parent) -Parent
    $rfy = Get-ChildItem $projDir -Recurse -Filter '*.rfy' -ErrorAction SilentlyContinue | Where-Object { $_.Name -match [regex]::Escape($plan) -and $_.FullName -notmatch 'TEKLA' } | Select-Object -First 1
    if ($rfy) {
      $pairs += [pscustomobject]@{ xml = $x.FullName; rfy = $rfy.FullName; plan = $plan }
    }
  }
}
$pairs | ConvertTo-Json -Depth 3 -Compress
