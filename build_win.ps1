<#
.SYNOPSIS
    Build ClashApp into a Windows NSIS installer locally, mirroring the
    GitHub Actions "Build" workflow (.github/workflows/build.yml).

.DESCRIPTION
    Reproduces the CI steps that produce "ClashApp_<arch>-setup.exe":
        1. pnpm install (with the auto-prepare lifecycle hook skipped)
        2. pnpm prepare --<arch>   (downloads mihomo cores, geo data, runner, 7za, ...)
        3. pnpm build:win <format> --<arch>

    Output lands in: dist\ClashApp_<arch>-setup.exe   (for the nsis format)
    The product name is read from branding.json, so a fork only edits that file.

.PARAMETER Arch
    Target architecture: x64 (default), arm64, or ia32.

.PARAMETER Format
    electron-builder target: nsis (installer, default), 7z (portable), or all.

.PARAMETER SkipInstall
    Skip "pnpm install" (use when node_modules is already up to date).

.PARAMETER SkipPrepare
    Skip "pnpm prepare" (use when extra/ binaries are already downloaded).

.EXAMPLE
    .\build_win.ps1
    Builds the x64 NSIS installer from scratch.

.EXAMPLE
    .\build_win.ps1 -Format 7z
    Builds the x64 portable 7z archive.

.EXAMPLE
    .\build_win.ps1 -SkipInstall -SkipPrepare
    Rebuilds the installer reusing existing node_modules and extra/ binaries.
#>
[CmdletBinding()]
param(
    [ValidateSet('x64', 'arm64', 'ia32')]
    [string]$Arch = 'x64',

    [ValidateSet('nsis', '7z', 'all')]
    [string]$Format = 'nsis',

    [switch]$SkipInstall,

    [switch]$SkipPrepare
)

$ErrorActionPreference = 'Stop'

# Run from the script's directory so relative paths resolve regardless of CWD.
$root = $PSScriptRoot
Push-Location $root

function Write-Step($msg) {
    Write-Host ""
    Write-Host "==> $msg" -ForegroundColor Cyan
}

try {
    # --- Ensure pnpm is available (matches packageManager in package.json) ---
    if (-not (Get-Command pnpm -ErrorAction SilentlyContinue)) {
        Write-Step "pnpm not found - activating via corepack"
        if (-not (Get-Command corepack -ErrorAction SilentlyContinue)) {
            Write-Step "corepack not found - installing via npm"
            npm install -g corepack
            if ($LASTEXITCODE -ne 0) { throw "npm install -g corepack failed (exit $LASTEXITCODE)" }
        }
        corepack enable
        corepack prepare pnpm@10.33.0 --activate
    }

    # --- 1. Install dependencies, skipping the auto-prepare lifecycle hook ---
    # CI sets SKIP_PREPARE=1 here so prepare can run separately with an explicit arch.
    if (-not $SkipInstall) {
        Write-Step "Installing dependencies (pnpm install, prepare hook skipped)"
        $env:SKIP_PREPARE = '1'
        pnpm install
        if ($LASTEXITCODE -ne 0) { throw "pnpm install failed (exit $LASTEXITCODE)" }
        Remove-Item Env:SKIP_PREPARE -ErrorAction SilentlyContinue
    }
    else {
        Write-Step "Skipping pnpm install (-SkipInstall)"
    }

    # --- 2. Prepare: download bundled cores / geo data / resources for the arch ---
    if (-not $SkipPrepare) {
        Write-Step "Preparing resources (pnpm prepare --$Arch) - downloads from GitHub releases"
        pnpm prepare --$Arch
        if ($LASTEXITCODE -ne 0) { throw "pnpm prepare failed (exit $LASTEXITCODE)" }
    }
    else {
        Write-Step "Skipping pnpm prepare (-SkipPrepare)"
    }

    # --- 3. Build: electron-vite build + electron-builder (NSIS / 7z) ---
    # CSC_IDENTITY_AUTO_DISCOVERY=false disables code-sign auto-discovery, like CI.
    $env:CSC_IDENTITY_AUTO_DISCOVERY = 'false'

    $targetArg = if ($Format -eq 'all') { '' } else { $Format }
    Write-Step "Building (pnpm build:win $targetArg --$Arch)"
    if ($Format -eq 'all') {
        # No explicit target -> electron-builder uses the win.target list (nsis + 7z).
        pnpm build:win --$Arch
    }
    else {
        pnpm build:win $Format --$Arch
    }
    if ($LASTEXITCODE -ne 0) { throw "build:win failed (exit $LASTEXITCODE)" }

    # --- Report produced artifacts (productName comes from branding.json) ---
    $productName = (Get-Content (Join-Path $root 'branding.json') -Raw | ConvertFrom-Json).productName
    Write-Step "Build complete. Artifacts in dist\:"
    Get-ChildItem -Path (Join-Path $root 'dist') -Filter "$productName*" -ErrorAction SilentlyContinue |
        ForEach-Object { Write-Host "    $($_.Name)" -ForegroundColor Green }
}
finally {
    # Clean up env vars we set so repeated runs in the same shell stay clean.
    Remove-Item Env:SKIP_PREPARE -ErrorAction SilentlyContinue
    Remove-Item Env:CSC_IDENTITY_AUTO_DISCOVERY -ErrorAction SilentlyContinue
    Pop-Location
}
