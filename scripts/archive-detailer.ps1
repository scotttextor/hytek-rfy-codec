# Archives FrameCAD Detailer install + licences for post-EOL recovery.
# Run as: powershell -ExecutionPolicy Bypass -File scripts/archive-detailer.ps1

$ErrorActionPreference = "Stop"

$archiveRoot = "C:\Users\ScottTextor\OneDrive - Textor Metal Industries\DETAILER_ARCHIVE"
$installSrc = "C:\Program Files (x86)\FRAMECAD\Detailer\Version 5"
$appDataSrc = "C:\Users\$env:USERNAME\AppData\Roaming\FRAMECAD"

Write-Host "Archiving Detailer install from $installSrc..."
robocopy $installSrc "$archiveRoot\install" /MIR /R:2 /W:5 /NP

Write-Host "Archiving Detailer AppData from $appDataSrc..."
if (Test-Path $appDataSrc) {
    robocopy $appDataSrc "$archiveRoot\appdata-roaming" /MIR /R:2 /W:5 /NP
}

Write-Host "Searching for licence files..."
Get-ChildItem -Path $installSrc, $appDataSrc -Recurse -Include *.lic, *.license, *.key -ErrorAction SilentlyContinue | ForEach-Object {
    Copy-Item $_.FullName -Destination "$archiveRoot\licences" -Force
    Write-Host "  Copied $($_.FullName)"
}

Write-Host "Computing SHA256 of archive contents..."
Get-ChildItem -Path "$archiveRoot\install" -Recurse -File | Get-FileHash -Algorithm SHA256 | Export-Csv "$archiveRoot\install-hashes.csv" -NoTypeInformation

Write-Host "Archive complete. Total size:"
Get-ChildItem $archiveRoot -Recurse -File | Measure-Object -Property Length -Sum | Select-Object @{N="SizeMB";E={[math]::Round($_.Sum/1MB,2)}}
