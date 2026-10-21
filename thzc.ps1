# ==============================================================================
# thzc.ps1 — Compilador Nativo AOT THZ-LANG (Zero JVM / Zero Rust em Runtime)
# ==============================================================================
param(
    [Parameter(Position=0, Mandatory=$false)]
    [string]$ArquivoFonte
)

$ErrorActionPreference = "Stop"

if (-not $ArquivoFonte) {
    Write-Host "==============================================================================" -ForegroundColor Cyan
    Write-Host "   THZC - Compilador Nativo AOT THZ-LANG (Zero JVM / Zero Rust em Runtime)    " -ForegroundColor Cyan
    Write-Host "==============================================================================" -ForegroundColor Cyan
    Write-Host 'Uso: .\thzc.ps1 caminho/para/arquivo.thz'
    Write-Host 'Exemplo: .\thzc.ps1 thz/fechamento_caixa_enxuto.thz'
    Write-Host "==============================================================================" -ForegroundColor Cyan
    exit 1
}

$Raiz = (Resolve-Path $PSScriptRoot).Path
$FonteAbs = (Resolve-Path $ArquivoFonte).Path
$BaseNome = [System.IO.Path]::GetFileNameWithoutExtension($FonteAbs)

$BinDir = Join-Path $Raiz "bin"
if (-not (Test-Path $BinDir)) {
    New-Item -ItemType Directory -Path $BinDir -Force | Out-Null
}

$RuntimeLib = Join-Path $Raiz "toolchain\thz-runtime-rs\target\release\thz_runtime.lib"
if (-not (Test-Path $RuntimeLib)) {
    Write-Host "[THZC] Compilando microkernel da THZVM nativa..." -ForegroundColor Yellow
    Push-Location (Join-Path $Raiz "toolchain\thz-runtime-rs")
    cargo build --release
    Pop-Location
}

$ToolchainDir = Join-Path $Raiz "toolchain\thz-lang"
Write-Host "[THZC] Compilando $BaseNome.thz para LLVM IR..." -ForegroundColor Cyan

Push-Location $ToolchainDir
& .\thz.cmd compile $FonteAbs --saida dist
if ($LASTEXITCODE -ne 0) {
    Pop-Location
    throw "Falha ao compilar $ArquivoFonte para LLVM IR."
}
Pop-Location

$LlFile = Join-Path $ToolchainDir "dist\llvm\$BaseNome.ll"
if (-not (Test-Path $LlFile)) {
    $LlFile = Join-Path $Raiz "dist\llvm\$BaseNome.ll"
}

if (-not (Test-Path $LlFile)) {
    throw "Arquivo LLVM IR nao encontrado para $BaseNome em $LlFile"
}

$ExeOut = Join-Path $BinDir "$BaseNome.exe"
Write-Host "[THZC] Gerando executavel nativo independente em: $ExeOut" -ForegroundColor Yellow

clang -O2 -o $ExeOut $LlFile $RuntimeLib -luserenv -lws2_32 -lntdll -ladvapi32 -lbcrypt
if ($LASTEXITCODE -ne 0) {
    throw "Falha na linkagem nativa via Clang."
}

Write-Host "==============================================================================" -ForegroundColor Green
Write-Host "[THZC SUCESSO] Executavel nativo gerado com exito:" -ForegroundColor Green
Write-Host "  -> $ExeOut" -ForegroundColor White
Write-Host "==============================================================================" -ForegroundColor Green
