---
name: thermal-hardware-ops
description: >-
  Use esta habilidade ao operar, diagnosticar, testar ou criar perfis para impressoras térmicas
  no Windows usando a CLI thermal-probe, egui ou Tauri Desktop (USB, Bluetooth SPP e COM).
---

# Operações de Hardware e Diagnóstico — THZ ThermalKit

Guia prático para comandos de diagnóstico, calibração e envio de testes no ambiente Windows.

---

## 1. Descoberta de Dispositivos (Inventory & Probe)

O utilitário CLI lista impressoras conectadas diretamente:

```powershell
# Listar interfaces disponíveis (USB Printer Class, portas COM e Bluetooth SPP)
cargo run -- discover
```

### Identificação de Transporte:
- **USB:** Identificado pela classe `USBPRINT` (`{28D78FAD-5A12-11D1-AE5B-00F803A8C2}`) e VID/PID no hardware ID.
- **Bluetooth SPP:** Identificado sob `COMPORT` contendo o enumerador `BTHENUM` e UUID `00001101-0000-1000-8000-00805F9B34FB`.
- **Serial Pura:** Portas COM físicas ou adaptadores USB-Serial convencionais.

---

## 2. Testes de Calibração e Largura

### Teste de Dispositivo Conectado (`probe`)
Envia sequência de inicialização (`ESC @`), texto explicativo e um quadrado raster 16x16:
```powershell
cargo run -- probe --device 0
```
> [!IMPORTANT]
> O programa solicitará a confirmação digitando `PRINT` antes de enviar dados físicos à impressora.

### Teste de Régua de Largura (`width-test`)
Gera uma régua milimetrada graduada para aferir se a bobina útil é de 384 dots (58 mm) ou 576 dots (80 mm):
```powershell
cargo run -- width-test --device 0 --width 384
```

### Teste de Tabela de Caracteres (`charset-test`)
Valida se a acentuação em português na CP860 está sendo impressa corretamente:
```powershell
cargo run -- charset-test --device 0
```

---

## 3. Gestão de Perfis JSON (`profiles/`)

Para salvar um perfil definitivo da impressora:
```powershell
cargo run -- profile create --device 0 --name "TECH CLA58" --output profiles/tech-cla58.json
```

Formato do perfil gerado:
```json
{
  "id": "generic-tech-cla58-raster",
  "name": "TECH CLA58",
  "transport": {
    "type": "usb-printer-class",
    "vid": "6868",
    "pid": "0200",
    "port": null
  },
  "protocol": "escpos",
  "raster_mode": "gs-v-0",
  "printable_width_dots": 384,
  "baud": 9600,
  "code_page": 3
}
```

---

## 4. Impressão Direta com Perfil

```powershell
# Imprimir texto puro com acentuação
cargo run -- print-text --profile profiles/tech-cla58.json recibo.txt

# Imprimir imagem redimensionada
cargo run -- print-image --profile profiles/tech-cla58.json logotipo.png

# Imprimir PDF (renderizado a 203 DPI via Poppler pdftoppm)
cargo run -- print-pdf --profile profiles/tech-cla58.json documento.pdf
```
