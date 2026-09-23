# ADR-001: Adoção do Caminho C — Host/Runtime Nativo THZ em Rust

- **Identificador:** ADR-001
- **Status:** **APROVADO** (Alinhado e deliberado com o usuário em 23/09/2026)
- **Contexto:** Repositório `thermal-probe` (THZ ThermalKit) / Ecossistema THZ-Lang
- **Decisores:** Lucas Thomaz (Usuário) & Antigravity (Pair Programming Agent)

---

## 1. Contexto e Motivação

O **THZ ThermalKit** é uma suíte de software para Windows de baixo nível focada em automação comercial, fechamento de caixa, emissão de cupons e impressão direta em impressoras térmicas ESC/POS (58 mm e 80 mm) via `usbprint.sys` e Bluetooth SPP COM.

O objetivo do projeto é que a nova versão da aplicação seja **escrita e orientada 100% em THZ-LANG** (`.thz` e `.thzui`), demonstrando o poder da linguagem em regras de negócio com aritmética exata, Design by Contract (`EXIGE`/`GARANTE`) e interfaces declarativas (`TELA`).

### Tentativas Anteriores e Problemas Identificados:
1. **Tentativa 1 (Execução via JVM / Gradle):** O wrapper executava o interpretador sobre a JVM HotSpot através do Gradle daemon. O usuário **vetou categoricamente o uso de Java**: tempo de startup inaceitável (5 a 10s), consumo excessivo de memória (~500 MB) e dependência de um runtime Java externo que quebra a promessa de independência nativa.
2. **Tentativa 2 (Wrapper Mock Hardcoded em Rust):** Foi criado um arquivo `src/thz_engine.rs` que continha a lógica de fechamento de caixa e cupom reescrita manualmente em Rust. O usuário identificou imediatamente que se tratava de uma **simulação/gambiarra**, pois os arquivos `.thz` eram ignorados em tempo de execução e a aplicação real não estava rodando sobre a linguagem THZ-Lang.

---

## 2. Alternativas Arquiteturais Analisadas

Três caminhos foram propostos e debatidos tecnicamente:

### Alternativa A: Compilação AOT do Toolchain via GraalVM `native-image` (`thz.exe` / `thz-gui.exe`)
- **Prós:** Gera executável Windows PE standalone (~15 MB) sem JVM em runtime; utiliza a AST e analisador semântico oficiais existentes em Java.
- **Contras:** Continua dependendo da stack Java/Gradle no tempo de compilação (build-time); o suporte a Swing/FlatLaf em GraalVM Native Image no Windows (`-Djava.awt.headless=false`) é frágil e propenso a falhas de metadados JNI/reflection em SubstrateVM.

### Alternativa B: Compilação AOT via LLVM / Clang (`.thz` → `.ll` → `.exe`)
- **Prós:** Compilação direta para código de máquina puro via Clang 22; velocidade bruta máxima.
- **Contras (Bloqueador):** O `GeradorIr` atual do THZ-LANG só emite representação intermediária para cálculos e laços numéricos; ele **não possui suporte à emissão de código para a DSL visual `TELA` / componentes gráficos**.

### Alternativa C: Host / Runtime Nativo da Linguagem THZ-Lang em Rust (Aprovado)
- **Conceito:** Construir um motor/host nativo em Rust que implementa o parser léxico/sintático e o avaliador de AST da linguagem THZ-LANG.
- **Divisão de Responsabilidades:**
  - **O Rust é o Motor:** Atua estritamente como a Máquina Virtual / Interpretador (da mesma forma que CPython em C executa scripts Python, ou V8 em C++ executa JavaScript).
  - **A Aplicação é 100% THZ-Lang:** Os arquivos `thz/fechamento_caixa.thz`, `thz/cupom_venda.thz` e `thz/ui/app_thermal.thzui` contêm todo o código de negócio, estruturas, contratos e telas. Esses arquivos são lidos, validados e executados dinamicamente pelo motor. Qualquer alteração no arquivo `.thz` altera a execução sem necessidade de recompilar o binário Rust.
  - **Zero Dependência de Java:** 100% independente de Java em runtime e em build-time.
  - **Integração de Baixo Nível:** Consome a crate oficial `thz-runtime-rs` para memória linear e provê bindings diretos com Win32 `setupapi.dll`, `usbprint.sys` e Bluetooth SPP serial.

---

## 3. Decisão

**Adotar integralmente o Caminho C (Host/Runtime Nativo THZ em Rust).**

Toda a lógica de negócios e as telas serão codificadas nos arquivos `.thz` e `.thzui`, e o motor nativo em Rust fornecerá a execução real dessas instruções, validação de contratos e renderização visual.

---

## 4. Regras e Consequências Decorrentes da Decisão

1. **Proibição de Simulação / Hardcode:** É expressamente proibido hardcodear regras de negócio em Rust fingindo que são THZ. Se uma operação calcula quebra de caixa, ela deve ser executada pelo avaliador de AST a partir das instruções do arquivo `fechamento_caixa.thz`.
2. **Gramática e Contratos:** O parser nativo deve reconhecer a sintaxe formal de THZ-LANG:
   - `PROGRAMA`, `METADADOS_ARQUITETURA`, `ESTRUTURA`, `REGRA_NEGOCIO`, `OPERACAO`, `PROCEDIMENTO`
   - Contratos `CONTRATO_ENTRADA` (`EXIGE`), `CONTRATO_SAIDA` (`GARANTE`)
   - Tipagem monetária e decimal exata (centavos sem float IEEE-754)
   - DSL `TELA` e `.thzui` (`TELA.criarContainer`, `TELA.criarCard`, `TELA.adicionarCampoTexto`, `TELA.adicionarCampoMoeda`, `TELA.adicionarBotao`)
3. **Hardware Sem Spooler:** As operações de impressão acionadas pela aplicação THZ despacham bytes ESC/POS diretamente para os endpoints Win32 (`\\?\usb#...` e portas COM virtuais de Bluetooth SPP).
4. **Histórico e Auditoria:** Este documento e os testes automatizados correspondentes servem como evidência primária de compliance com as diretrizes do usuário.
