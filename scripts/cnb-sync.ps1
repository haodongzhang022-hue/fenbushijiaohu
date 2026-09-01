# cnb-sync.ps1 - 本地↔云端 CNB 同步守护
# 用法: pwsh -File scripts/cnb-sync.ps1 -OneShot ; 循环: -IntervalSec 180
param([int]$IntervalSec = 180, [switch]$OneShot)
$ErrorActionPreference = 'SilentlyContinue'
$nodeExe = 'C:\Users\dongdong\AppData\Local\nvm\v22.20.0\node.exe'
$cnbCli = 'C:\Users\dongdong\AppData\Local\nodejs\node_modules\@cnbcool\cnb-cli\bin\cnb.js'
$repo = 'dongdongxiaozu/fenbushijiaohu'
$stateDir = 'E:\CNBcool\.cloud-sync'
$stateFile = Join-Path $stateDir 'state.json'
$inboxFile = Join-Path $stateDir 'inbox.md'
$jsonFile = Join-Path $stateDir '_issues.json'
New-Item -ItemType Directory -Force -Path $stateDir | Out-Null
function Check-Once {
  $argLine = '"' + $nodeExe + '" "' + $cnbCli + '" issues list-issues --repo "' + $repo + '" --state open --page-size 50'
  cmd /c $argLine 1> $jsonFile 2> (Join-Path $stateDir '_err.txt')
  if ($LASTEXITCODE -ne 0) { Write-Host '[cnb-sync] cnb 调用失败'; return }
  $raw = Get-Content $jsonFile -Raw
  $issues = $raw | ConvertFrom-Json
  if (-not $issues -or -not $issues.data) { Write-Host '[cnb-sync] 响应无 data，跳过'; return }
  $snapshot = @{}
  foreach ($i in $issues.data) { $snapshot[$i.number] = "$($i.title)|$($i.updated_at)|$($i.comment_count)|$($i.state)" }
  $old = @{}
  if (Test-Path $stateFile) {
    $obj = Get-Content $stateFile -Raw | ConvertFrom-Json
    foreach ($p in $obj.PSObject.Properties) { $old[$p.Name] = $p.Value }
  }
  $changed = @()
  foreach ($k in $snapshot.Keys) { if (-not $old.ContainsKey($k) -or $old[$k] -ne $snapshot[$k]) { $changed += $k } }
  foreach ($k in $old.Keys) { if (-not $snapshot.ContainsKey($k)) { $changed += "$k(closed)" } }
  if ($changed.Count -gt 0) {
    $stamp = Get-Date -Format 'yyyy-MM-dd HH:mm:ss'
    $labels = ($changed | Sort-Object | ForEach-Object { "Issue #$_" }) -join ', '
    Add-Content -Path $inboxFile -Value "## $stamp 云端变更: $labels"
    foreach ($k in ($changed | Sort-Object)) { if ($snapshot.ContainsKey($k)) { Add-Content -Path $inboxFile -Value "  - #$k : $($snapshot[$k])" } }
    Write-Host "[cnb-sync] $($changed.Count) 个变化已写入 inbox"
  } else { Write-Host "[cnb-sync] 无变化" }
  $snapshot | ConvertTo-Json -Depth 3 | Set-Content -Path $stateFile
  Remove-Item (Join-Path $stateDir '_err.txt') -ErrorAction SilentlyContinue
}
if ($OneShot) { Check-Once; exit 0 }
while ($true) { Check-Once; Start-Sleep -Seconds $IntervalSec }