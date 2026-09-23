# ==============================================================================
# thz.ps1 - Executor 100% Nativo Windows do THZ ThermalKit
# Execucao direta e nativa sem dependencia de Java ou JVM.
# Uso:
#   .\thz.ps1              -> Abre a GUI nativa com abas THZ, Word ESC/POS e Diagnostico
#   .\thz.ps1 gui          -> Abre a GUI nativa
#   .\thz.ps1 discover     -> CLI: Descobre impressoras USB e Bluetooth SPP
#   .\thz.ps1 probe        -> CLI: Envia teste driverless ESC/POS
#   .\thz.ps1 width-test   -> CLI: Teste de bobina e largura em dots
# ==============================================================================

param(
    [Parameter(Position=0)]
    [string]$Comando = "gui",
    [Parameter(ValueFromRemainingArguments=$true)]
    [string[]]$ArgsRest
)

$Raiz = $PSScriptRoot
$BinGui = Join-Path $Raiz "target\release\thz-thermalkit.exe"
$BinCli = Join-Path $Raiz "target\release\thermal-probe.exe"

function Assegurar-Binario([string]$caminho, [string]$binAlvo) {
    if (-not (Test-Path $caminho)) {
        Write-Host "Compilando binario nativo de release ($binAlvo)..." -ForegroundColor Cyan
        cargo build --release --bin $binAlvo
        if ($LASTEXITCODE -ne 0) {
            Write-Error "Falha ao compilar $binAlvo via Cargo/Rust."
            exit $LASTEXITCODE
        }
    }
}

if ($Comando -eq "gui") {
    Assegurar-Binario $BinGui "thz-thermalkit"
    Write-Host "Iniciando THZ ThermalKit GUI Nativo (Zero JVM)..." -ForegroundColor Green
    Start-Process -FilePath $BinGui -ArgumentList $ArgsRest
} elseif ($Comando -eq "run") {
    Assegurar-Binario $BinGui "thz-thermalkit"
    Write-Host "Executando modulo THZ via Runtime Nativo..." -ForegroundColor Green
    Start-Process -FilePath $BinGui -ArgumentList $ArgsRest
} else {
    Assegurar-Binario $BinCli "thermal-probe"
    $cliArgs = @($Comando) + $ArgsRest
    & $BinCli @cliArgs
    exit $LASTEXITCODE
}
