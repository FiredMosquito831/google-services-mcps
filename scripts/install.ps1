# google-services-mcps bootstrap installer for Windows PowerShell 5.1 and PowerShell 7.
# It downloads the repository zip from GitHub, replaces the install folder, and runs gsm.mjs with every argument.
#
# One-liners (Windows PowerShell):
#   & ([scriptblock]::Create((irm "https://raw.githubusercontent.com/FiredMosquito831/google-services-mcps/main/scripts/install.ps1"))) install --agent claude --plugin gmail
#   & ([scriptblock]::Create((irm "https://raw.githubusercontent.com/FiredMosquito831/google-services-mcps/main/scripts/install.ps1"))) uninstall --all --yes
#
# Environment (all optional):
#   GSM_ARCHIVE_URL  full URL or file:// URL of a zip archive. Overrides GSM_REF.
#   GSM_REF          branch, tag or commit (default main), used as .../zip/<GSM_REF> on codeload.github.com.
#   GSM_DIR          install folder (default $env:USERPROFILE\google-services-mcps).
#
# With no arguments it prints the usage and exits 0 without downloading.
# There is no param block: the arguments come in $args, so the scriptblock form above passes them through.
# The exit code of node is set in $LASTEXITCODE; a file run (powershell -File) also exits with it.

$ErrorActionPreference = 'Stop'
try { [Net.ServicePointManager]::SecurityProtocol = [Net.ServicePointManager]::SecurityProtocol -bor [Net.SecurityProtocolType]::Tls12 } catch { }

# Captured first. A comma list typed without quotes (--plugin gmail,gcalendar) arrives as an array; rejoin it.
$forward = @($args | ForEach-Object { if ($_ -is [System.Array]) { $_ -join ',' } else { [string]$_ } })
$rc = 0
$tmp = $null
$stage = $null

try {
    if ($forward.Count -eq 0) {
        Write-Host @'
google-services-mcps installer for Windows PowerShell

  Install:    & ([scriptblock]::Create((irm "https://raw.githubusercontent.com/FiredMosquito831/google-services-mcps/main/scripts/install.ps1"))) install --agent claude --plugin gmail
  Uninstall:  & ([scriptblock]::Create((irm "https://raw.githubusercontent.com/FiredMosquito831/google-services-mcps/main/scripts/install.ps1"))) uninstall --all --yes

Run with install, list, uninstall, status, products, doctor or --help
'@
    }
    else {
        # Node.js 20 or newer is required. Nothing is installed automatically.
        $nodeMajor = 0
        $nodeCmd = Get-Command node -CommandType Application -ErrorAction SilentlyContinue | Select-Object -First 1
        if ($nodeCmd) {
            try { $nodeMajor = [int](& $nodeCmd.Source -p "process.versions.node.split('.')[0]" 2>$null) } catch { $nodeMajor = 0 }
        }
        if ($nodeMajor -lt 20) {
            throw "Node.js 20 or newer is required, and node was not found or is older.`nGet it from https://nodejs.org`nOr install it with: winget install OpenJS.NodeJS.LTS"
        }

        $tmp = Join-Path ([IO.Path]::GetTempPath()) ('gsm-install-' + [guid]::NewGuid().ToString('N'))
        New-Item -ItemType Directory -Path $tmp -Force | Out-Null
        $zip = Join-Path $tmp 'source.zip'
        $extract = Join-Path $tmp 'extract'

        $ref = if ($env:GSM_REF) { $env:GSM_REF } else { 'refs/heads/main' }
        $archive = if ($env:GSM_ARCHIVE_URL) { $env:GSM_ARCHIVE_URL } else { "https://codeload.github.com/FiredMosquito831/google-services-mcps/zip/$ref" }

        Write-Host 'Downloading google-services-mcps from GitHub ...'
        # curl.exe, not curl: in Windows PowerShell 5.1 "curl" is an alias of Invoke-WebRequest.
        & curl.exe -fsSL -o $zip $archive
        if ($LASTEXITCODE -ne 0) { throw 'Download failed. Check the network, or the GSM_ARCHIVE_URL setting.' }

        New-Item -ItemType Directory -Path $extract -Force | Out-Null
        Expand-Archive -LiteralPath $zip -DestinationPath $extract -Force

        # The archive has one top folder (google-services-mcps-main). Use the folder that holds gsm.mjs.
        $folders = @($extract) + @(Get-ChildItem -LiteralPath $extract -Directory | ForEach-Object { $_.FullName })
        $src = $folders | Where-Object { Test-Path -LiteralPath (Join-Path $_ 'gsm.mjs') -PathType Leaf } | Select-Object -First 1
        if (-not $src) { throw 'The download does not contain gsm.mjs. Check GSM_REF or GSM_ARCHIVE_URL.' }

        $dir = if ($env:GSM_DIR) { $env:GSM_DIR } else { Join-Path $env:USERPROFILE 'google-services-mcps' }
        $dir = [IO.Path]::GetFullPath($dir)
        # The new copy is staged next to the install folder, then the old folder is removed and the copy renamed into place.
        $stage = "$dir.partial"
        New-Item -ItemType Directory -Path (Split-Path -Parent $dir) -Force | Out-Null
        if (Test-Path -LiteralPath $stage) { Remove-Item -LiteralPath $stage -Recurse -Force }
        Move-Item -LiteralPath $src -Destination $stage
        if (Test-Path -LiteralPath $dir) { Remove-Item -LiteralPath $dir -Recurse -Force }
        Move-Item -LiteralPath $stage -Destination $dir
        $stage = $null

        Write-Host ('Installing with: node gsm.mjs ' + ($forward -join ' '))
        & node (Join-Path $dir 'gsm.mjs') @forward
        $rc = $LASTEXITCODE
    }
}
catch {
    [Console]::Error.WriteLine($_.Exception.Message)
    $rc = 1
}
finally {
    if ($stage -and (Test-Path -LiteralPath $stage)) { Remove-Item -LiteralPath $stage -Recurse -Force -ErrorAction SilentlyContinue }
    if ($tmp -and (Test-Path -LiteralPath $tmp)) { Remove-Item -LiteralPath $tmp -Recurse -Force -ErrorAction SilentlyContinue }
}

# A file run exits with the node code. The scriptblock form must not call exit (that would close an interactive host).
$global:LASTEXITCODE = $rc
if ($PSCommandPath) { exit $rc }
