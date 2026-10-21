# ==============================================================================
# backup-gemini-config.ps1 — Backup Completo de C:\Users\lucas\.gemini\config
# ==============================================================================
param(
    [string]$ConfigRoot = "C:\Users\lucas\.gemini\config",
    [string]$OutputFile = "$PSScriptRoot\..\docs\backup\BACKUP_GEMINI_CONFIG_2026-09-23.md"
)

$ErrorActionPreference = "Stop"

$OutDir = [System.IO.Path]::GetDirectoryName($OutputFile)
if (-not (Test-Path $OutDir)) {
    New-Item -ItemType Directory -Path $OutDir -Force | Out-Null
}

$timestamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"

$lines = [System.Collections.Generic.List[string]]::new()
$lines.Add("# Backup Completo de Configuracao: ``C:\Users\lucas\.gemini\config``")
$lines.Add("")
$lines.Add("- **Data do Backup:** $timestamp")
$lines.Add("- **Origem:** ``$ConfigRoot``")
$lines.Add("- **Finalidade:** Preservacao integral em formato Markdown para auditoria e restauracao futura.")
$lines.Add("")
$lines.Add("---")
$lines.Add("")
$lines.Add("## Indice de Arquivos Incluidos")
$lines.Add("")
$lines.Add("| Arquivo Relativo | Tamanho | Tipo |")
$lines.Add("| :--- | :---: | :--- |")

$files = Get-ChildItem -Path $ConfigRoot -Recurse -File | Sort-Object FullName
foreach ($file in $files) {
    $rel = $file.FullName.Substring($ConfigRoot.Length).TrimStart('\', '/')
    $size = "$($file.Length) bytes"
    $ext = $file.Extension
    if (-not $ext) { $ext = "(sem extensao)" }
    $lines.Add("| ``$rel`` | $size | ``$ext`` |")
}

$lines.Add("")
$lines.Add("---")
$lines.Add("")
$lines.Add("## Conteudo Integral dos Arquivos")
$lines.Add("")

$fenceOpen = [string]::new('`', 4)
$fenceClose = [string]::new('`', 4)

foreach ($file in $files) {
    $rel = $file.FullName.Substring($ConfigRoot.Length).TrimStart('\', '/')
    $lines.Add("### Arquivo: ``$rel``")
    $lines.Add("")
    $lines.Add("- **Caminho Absoluto:** ``$($file.FullName)``")
    $lines.Add("- **Tamanho:** $($file.Length) bytes")
    $lines.Add("")

    if ($file.Length -eq 0) {
        $lines.Add("*(Arquivo vazio)*")
        $lines.Add("")
    } else {
        $content = [System.IO.File]::ReadAllText($file.FullName, [System.Text.Encoding]::UTF8)
        $codeLang = "text"
        if ($file.Extension -eq ".json") { $codeLang = "json" }
        elseif ($file.Extension -eq ".md") { $codeLang = "markdown" }
        
        $lines.Add($fenceOpen + $codeLang)
        $lines.Add($content.TrimEnd())
        $lines.Add($fenceClose)
        $lines.Add("")
    }
    $lines.Add("---")
    $lines.Add("")
}

$lines.Add("## Guia de Restauracao Automatica")
$lines.Add("")
$lines.Add("Para restaurar todos os arquivos deste backup automaticamente no destino original ``C:\Users\lucas\.gemini\config``, execute:")
$lines.Add("")
$lines.Add($fenceOpen + "powershell")
$lines.Add('# Executar a partir da raiz do repositorio thermal-probe:')
$lines.Add('powershell -ExecutionPolicy Bypass -File scripts\restore-gemini-config.ps1')
$lines.Add($fenceClose)
$lines.Add("")

[System.IO.File]::WriteAllLines($OutputFile, $lines, [System.Text.Encoding]::UTF8)

Write-Host "Backup Markdown gerado com sucesso em: $OutputFile" -ForegroundColor Green
Write-Host "Total de arquivos incluidos: $($files.Count)" -ForegroundColor Cyan
Write-Host "Tamanho total do backup: $((Get-Item $OutputFile).Length) bytes" -ForegroundColor Yellow
