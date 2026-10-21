# ADR-003: Auto-Compilação Oficial, Bootstrap e Emancipação da THZVM

- **Status:** Em Progresso (Diagnóstico de Backend AOT vs Interpretador Oficial)
- **Data:** 2026-09-23
- **Decisor:** Lucas Thomaz & Antigravity IDE

---

## 1. Contexto e Motivação

O objetivo primordial do THZ-LANG é atingir a **Auto-Compilação (Self-Hosting)** e autonomia completa:
1. Arquivos de aplicação e regras de negócio escritos 100% em THZ-LANG (`.thz`).
2. O compilador (`thz-compiler`) escrito em THZ-LANG compila programas `.thz` diretamente.
3. O executável final roda sobre o microkernel de runtime nativo **THZVM** (`thz_runtime.lib` / `.dll`).
4. **Sem Rust e sem Java no ciclo final do desenvolvedor:** Uma vez concluído o bootstrap do compilador (`thzc.exe`), o programador não precisa compilar nem tocar em Rust para gerar binários ou rodar novas regras.

---

## 2. Decisão Arquitetural

Adota-se a arquitetura clássica de Auto-Compilação em 3 Passos:

### Passo 1: A Consolidação da THZVM Nativa (C-ABI e Hardware)
- Adição de módulo direto Win32 sem spooler em `toolchain/thz-runtime-rs/src/hardware.rs`:
  - `thz_hardware_usb_enviar(caminho, payload, len)` via Win32 `usbprint.sys`.
  - `thz_hardware_com_enviar(porta, baud, payload, len)` via `serialport` com timeout de 10s.
  - `thz_hardware_descobrir_dispositivos(buffer, max_len)` para enumeração serial em JSON.
  - `thz_hardware_imprimir_cupom(tipo, destino, payload, len)` para despacho direto.
- Adição de suporte a operações de texto e formatação nativa:
  - `thz_str_concat(a, b)`
  - `thz_decimal_para_str(val, scale)`
  - `thz_i64_para_str(val)`
  - `thz_tela_renderizar_formulario(form, titulo)`
- Compilação estática de alta performance para `target/release/thz_runtime.lib` e `thz_runtime.dll`.

### Passo 2: Lowering Completo da Aplicação e Sintaxe Moderna
- Correção no emissor AOT LLVM IR (`GeradorIr.java`):
  - Opaque pointers compatíveis com LLVM 15+ (`store ptr null` em vez de `store ptr 0`).
  - Promoção de tipos numéricos e suporte a `DECIMAL(12,2)` / ISO-10967 em 128 bits (`i128`).
  - Lowering de `CriarRegistro` (`alloca %struct`) e `Nulo` (`null`).
  - Lowering de operações binárias de strings via `@thz_str_concat`.
  - Resolução de operações qualificadas e membros de enumeração para seus ordinais `i32`.

### Passo 3: Execução do Bootstrap do Compilador e Ferramenta `thzc`
- **Stage 0 -> Stage 1:** O código-fonte de `toolchain/thz-compiler/driver.thz` é transformado em LLVM IR e linkado com `thz_runtime.lib` via Clang, gerando `bin/thzc_stage1.exe`.
- **Stage 1 -> Stage 2:** `bin/thzc_stage1.exe` executa e auto-compila o compilador Stage 2.
- **Identidade de Hash:** O teste de determinismo confirma a equivalência exata dos binários.
- **Ferramenta `thzc.cmd` / `thzc.ps1`:** Disponibilizada na raiz do repositório para compilar qualquer arquivo `.thz` em `.exe` nativo independente com um único comando.

---

## 3. Consequências

### O Papel do Rust Após o Passo 3
- **Para o Desenvolvedor THZ-LANG:** O Rust **NÃO** é mais necessário no fluxo diário. Toda compilação e execução de novos programas `.thz` é realizada pelo `thzc.exe` e pela THZVM.
- **Papel da THZVM:** A THZVM (`thz_runtime.lib` / `.dll`) atua como a fundação de baixo nível (equivalente ao motor em C da JVM ou do V8), fornecendo alocador Arena $O(1)$, precisão decimal ISO-10967 e I/O Win32. Nenhuma alteração em regras de negócio exige reabrir o código Rust.
