---
name: escpos-thermal-direct
description: >-
  Use esta habilidade ao gerar sequências de bytes ESC/POS, comandos de inicialização,
  seleção de code page (CP860), alinhamento de texto e geração de imagens raster GS v 0.
---

# Especificação de Bytes ESC/POS & Raster GS v 0

Cheatsheet técnico de sequências de comandos ESC/POS utilizadas no ecossistema THZ ThermalKit.

---

## 1. Comandos Essenciais de Inicialização e Texto

| Ação | Mnemônico | Bytes Hexadecimais | Descrição |
| :--- | :--- | :--- | :--- |
| **Inicializar Impressora** | `ESC @` | `1B 40` | Reseta buffers, fontes e alinhamentos aos padrões |
| **Pular Linha (LF)** | `LF` | `0A` | Avança o papel em 1 linha |
| **Selecionar Code Page 860** | `ESC t 3` | `1B 74 03` | Seleciona Português (CP860) |
| **Alinhamento à Esquerda** | `ESC a 0` | `1B 61 00` | Alinha texto à margem esquerda |
| **Alinhamento Centralizado**| `ESC a 1` | `1B 61 01` | Centraliza texto |
| **Alinhamento à Direita** | `ESC a 2` | `1B 61 02` | Alinha texto à margem direita |
| **Negrito Ligado** | `ESC E 1` | `1B 45 01` | Ativa ênfase (negrito) |
| **Negrito Desligado** | `ESC E 0` | `1B 45 00` | Desativa ênfase |
| **Sublinhado 1 Ponto** | `ESC - 1` | `1B 2D 01` | Ativa sublinhado simples |
| **Sublinhado Desligado** | `ESC - 0` | `1B 2D 00` | Desativa sublinhado |

---

## 2. Rasterização Gráfica (`GS v 0`)

O comando raster imprime uma matriz de pontos monocromática.

### Estrutura do Cabeçalho:
```text
1D 76 30 m xL xH yL yH [dados dos pixels...]
```
- `1D 76 30` : Bytes do comando `GS v 0`
- `m` : Modo de densidade (`0` = Normal, `1` = Double-width, `2` = Double-height, `3` = Quadruple)
- `xL, xH`: Largura em bytes por linha (`width_bytes = width_dots.div_ceil(8)`). `xL = width_bytes & 0xFF`, `xH = (width_bytes >> 8) & 0xFF`
- `yL, yH`: Altura em pixels (`height_pixels`). `yL = height & 0xFF`, `yH = (height >> 8) & 0xFF`
- Cada bit `1` representa um ponto queimado (preto); cada bit `0` representa branco.

### Exemplo em Rust (`thermal_core`):
```rust
pub fn gs_v0(image: &GrayImage) -> Result<Vec<u8>, Box<dyn std::error::Error>> {
    let (width, height) = image.dimensions();
    let bytes_per_row = (width as usize).div_ceil(8);
    let mut out = vec![
        0x1d, b'v', b'0', 0,
        bytes_per_row as u8,
        (bytes_per_row >> 8) as u8,
        height as u8,
        (height >> 8) as u8,
    ];
    for y in 0..height {
        for xbyte in 0..bytes_per_row {
            let mut b = 0;
            for bit in 0..8 {
                let x = (xbyte * 8 + bit) as u32;
                if x < width && image.get_pixel(x, y)[0] < 180 {
                    b |= 0x80 >> bit;
                }
            }
            out.push(b);
        }
    }
    Ok(out)
}
```

---

## 3. Mapeamento CP860 para Português

Caracteres comuns em recibos térmicos no Brasil/Portugal:

| Caractere | Byte Hex CP860 | Byte Decimal |
| :---: | :---: | :---: |
| `á` | `0xA0` | 160 |
| `é` | `0x82` | 130 |
| `í` | `0xA1` | 161 |
| `ó` | `0xA2` | 162 |
| `ú` | `0xA3` | 163 |
| `ã` | `0x84` | 132 |
| `õ` | `0x94` | 148 |
| `ç` | `0x87` | 135 |
| `Á` | `0x8F` | 143 |
| `É` | `0x90` | 144 |
| `Í` | `0x8D` | 141 |
| `Ó` | `0x95` | 149 |
| `Ú` | `0x97` | 151 |
| `Ã` | `0x8E` | 142 |
| `Õ` | `0x99` | 153 |
| `Ç` | `0x80` | 128 |
