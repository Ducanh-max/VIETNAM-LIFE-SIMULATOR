param(
    [Parameter(Mandatory)][string]$Source,
    [string]$Blender = 'C:\Program Files\Blender Foundation\Blender 5.3\blender.exe',
    [ValidateSet('Inspect', 'Temple', 'Bridge')][string]$Stage = 'Inspect',
    [string]$Working = 'heritage-work/heritage-optimized-working.blend'
)
$ErrorActionPreference = 'Stop'
$repo = (Resolve-Path (Join-Path $PSScriptRoot '../..')).Path
Set-Location -LiteralPath $repo
$sourcePath = (Resolve-Path -LiteralPath $Source).Path
$blenderPath = (Resolve-Path -LiteralPath $Blender).Path
$workDir = New-Item -ItemType Directory -Force (Join-Path $repo 'heritage-work')
$sourceHash = (Get-FileHash -LiteralPath $sourcePath -Algorithm SHA256).Hash
$tower = Join-Path $repo 'public/models/thap-rua-heritage.glb'
$towerHash = (Get-FileHash -LiteralPath $tower -Algorithm SHA256).Hash
function Invoke-Blender([string]$InputFile, [string]$Script) {
    & $blenderPath --background --disable-autoexec $InputFile --python-exit-code 1 --python $Script
    if ($LASTEXITCODE -ne 0) { throw "Blender failed at $Script" }
}
try {
    Invoke-Blender $sourcePath (Join-Path $PSScriptRoot 'analyze.py')
    if ($Stage -ne 'Inspect') {
        $workingPath = (Resolve-Path -LiteralPath $Working).Path
        if ($workingPath -eq $sourcePath) { throw 'Export requires the separate material-split working copy' }
        $script = if ($Stage -eq 'Temple') { 'export-game-temple.py' } else { 'export-game-bridge.py' }
        Invoke-Blender $workingPath (Join-Path $PSScriptRoot $script)
    }
    & $blenderPath --background --factory-startup --disable-autoexec --python-exit-code 1 --python (Join-Path $PSScriptRoot 'verify-glbs.py')
    if ($LASTEXITCODE -ne 0) { throw 'GLB reimport failed' }
} finally {
    if ((Get-FileHash -LiteralPath $sourcePath -Algorithm SHA256).Hash -ne $sourceHash) { throw 'Original source checksum changed' }
    if ((Get-FileHash -LiteralPath $tower -Algorithm SHA256).Hash -ne $towerHash) { throw 'Approved tower checksum changed' }
    @{ source = $sourcePath; sourceSha256 = $sourceHash; towerSha256 = $towerHash; stage = $Stage; timeUtc = [DateTime]::UtcNow.ToString('o') } |
        ConvertTo-Json | Set-Content -Encoding utf8 (Join-Path $workDir 'pipeline-run.json')
}
