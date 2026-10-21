# ==============================================================================
# restore-gemini-config.ps1 — Restaura C:\Users\lucas\.gemini\config do Markdown
# ==============================================================================
param(
    [string]$BackupFile = "$PSScriptRoot\..\docs\backup\BACKUP_GEMINI_CONFIG_2026-09-23.md",
    [string]$TargetRoot = "C:\Users\lucas\.gemini\config"
)

$ErrorActionPreference = "Stop"

if (-not (Test-Path $BackupFile)) {
    throw "Arquivo de backup nao encontrado: $BackupFile"
}

Write-Host "Iniciando restauracao a partir de: $BackupFile" -ForegroundColor Cyan
Write-Host "Destino: $TargetRoot" -ForegroundColor Cyan

if (-not (Test-Path $TargetRoot)) {
    New-Item -ItemType Directory -Path $TargetRoot -Force | Out-Null
}

$raw = [System.IO.File]::ReadAllText($BackupFile, [System.Text.Encoding]::UTF8)

# Divide o arquivo pelas seções de cada arquivo: ### Arquivo: `relPath`
$sections = $raw -split '(?m)^### Arquivo:\s+`'

$restored = 0
for ($i = 1; $i -lt $sections.Count; $i++) {
    $sec = $sections[$i]
    $firstLine = ($sec -split '\r?\n')[0]
    $relPath = $firstLine.TrimEnd('`').Trim()
    
    $destFile = Join-Path $TargetRoot $relPath
    $destDir = [System.IO.Path]::GetDirectoryName($destFile)
    
    if (-not (Test-Path $destDir)) {
        New-Item -ItemType Directory -Path $destDir -Force | Out-Null
    }
    
    if ($sec -match '\*\(Arquivo vazio\)\*') {
        [System.IO.File]::WriteAllBytes($destFile, [byte[]]@())
        Write-Host "  -> Restaurado (vazio): $relPath" -ForegroundColor Gray
        $restored++
    } else {
        if ($sec -match '(?s)````[a-zA-Z0-9]*\r?\n(.*?)\r?\n````') {
            $content = $matches[1]
            [System.IO.File]::WriteAllText($destFile, $content, [System.Text.Encoding]::UTF8)
            Write-Host "  -> Restaurado: $relPath ($($content.Length) bytes)" -ForegroundColor Yellow
            $restored++
        } else {
            Write-Host "  -> FALHA AO EXTRAIR CONTEUDO: $relPath" -ForegroundColor Red
        }
    }
}

Write-Host "==============================================================================" -ForegroundColor Green
Write-Host "Total de arquivos restaurados: $restored de $($sections.Count - 1)" -ForegroundColor Green
Write-Host "Destino concluido: $TargetRoot" -ForegroundColor Green
Write-Host "==============================================================================" -ForegroundColor Green
