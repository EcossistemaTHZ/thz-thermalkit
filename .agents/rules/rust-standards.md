# Regras de Desenvolvimento em Rust (THZ ThermalKit)

Diretrizes obrigatórias para escrita e manutenção de código Rust no workspace (`thermal_core`, `thermal-probe` CLI e `src/desktop.rs`).

---

## 1. Padrões de Código e Compilação
- **Edição Rust:** Rust 2021 (respeitando as dependências declaradas em `Cargo.toml`).
- **Formatação e Linter:** Todo código deve respeitar `cargo fmt` e passar sem advertências relevantes no `cargo clippy`.
- **Target Principal:** Windows (`#![cfg(windows)]` nas bibliotecas dependentes de Win32 SetupAPI).

## 2. Tratamento de Erros e Robustez
- **Sem `unwrap()` / `expect()` em Módulos Críticos:** Na biblioteca central `thermal_core` (`src/lib.rs`), trate erros com `io::Result<T>` ou tipos de erro descritivos.
- **FFI Seguro com Windows SetupAPI:**
  - Valide o retorno das chamadas à `setupapi.dll` (`SetupDiGetClassDevsW`, `SetupDiEnumDeviceInterfaces`, etc.).
  - Sempre inicialize structs com seus respectivos `cbSize` / `size` corretos (`mem::size_of::<InterfaceData>() as u32`).
  - Garanta que buffers alocados para strings nulas (`wide_z`) tenham verificação de limites.

## 3. Manipulação de Imagens e Raster
- **Modo Raster:** Utilize o padrão ESC/POS `GS v 0` para rasterização de imagens.
- **Largura em Bytes:** Garanta que a largura em bytes seja calculada via divisão com arredondamento para cima (`width.div_ceil(8)`).
- **Validação de Limites:** Cheque se a altura em pixels e a largura em bytes cabem nos campos `u16` (`xL, xH` e `yL, yH`) antes de alocar ou transmitir buffers de impressão.

## 4. Comunicação Serial e USB
- **Timeouts de Escrita:** Portas seriais COM (incluindo Bluetooth SPP) devem ser abertas com timeout de escrita e leitura razoáveis (ex: 2 a 5 segundos) para evitar bloqueio indefinido da thread.
- **Flush Mandatório:** Sempre execute `port.flush()` ou force a gravação de buffers no descritor de arquivo antes de fechar a conexão.
