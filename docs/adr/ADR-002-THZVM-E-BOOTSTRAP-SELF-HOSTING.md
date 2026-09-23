# ADR-002: Fundação da THZVM e Roadmap de Bootstrap Self-Hosting

- **Identificador:** ADR-002
- **Status:** **APROVADO** (Deliberado com o usuário em 23/09/2026)
- **Contexto:** Ecossistema THZ-Lang & THZ ThermalKit
- **Decisores:** Lucas Thomaz (Criador / Arquiteto THZ) & Antigravity (AI Pair Programming Assistant)

---

## 1. Contexto e Motivação

Durante a evolução do projeto **THZ ThermalKit** (`thermal-probe`), surgiram duas questões estruturais fundamentais sobre o futuro e a soberania do ecossistema **THZ-Lang**:

1. **A Necessidade da THZVM (Frente A):**
   Assim como o Java tem a **JVM** (HotSpot) e o JavaScript tem a **V8**, o THZ-LANG necessita de seu próprio motor de execução nativo soberano: a **THZVM**. A THZVM elimina a necessidade de construir "wrappers" ou gambiarras ad-hoc a cada novo projeto ou caso de uso, unificando a alocação de memória (Arenas $O(1)$), a aritmética decimal de precisão bancária (ISO-10967), a verificação de contratos (`EXIGE`/`GARANTE`) e os drivers de hardware direto (USB `usbprint.sys`, Bluetooth SPP serial).
2. **O Processo de Bootstrapping e Self-Hosting (Frente B):**
   Nenhuma linguagem moderna nasce do nada. O Java, o C#, o Go e o Rust nasceram apoiados em linguagens anteriores (C, C++, OCaml) até que atingiram maturidade para **se reescreverem nelas mesmas**. O THZ-LANG já possui seu compilador experimental escrito em THZ (`thz-compiler/*.thz`). O objetivo estratégico é conduzir a linguagem através do processo formal de **Bootstrapping** para que ela se auto-compile, conquistando a independência definitiva e eliminando para sempre o "berço" de transição (Stage 0 na JVM).

---

## 2. Decisões Vinculantes

### Decisão 1: Criação e Formalização da THZVM (Frente A)
- A **THZVM** é adotada formalmente como o motor de tempo de execução nativo da linguagem THZ-LANG.
- A THZVM opera em código de máquina nativo x86_64/ARM64, sem Garbage Collector, baseada em alocação de **Arenas Lineares $O(1)$** (fornecidas por `thz-runtime-rs`).
- A THZVM expõe bindings universais para o sistema operacional através de uma C-ABI limpa:
  - Primitivas de renderização visual (`TELA` / WebView2 nativo).
  - Primitivas de hardware e I/O de impressão térmica ESC/POS direta (`usbprint.sys` e portas seriais virtuais de Bluetooth SPP).

### Decisão 2: O Roadmap de Self-Hosting Bootstrap (Frente B)
- O THZ-LANG seguirá o processo clássico de bootstrap em 3 estágios:
  - **Stage 0 (Berço / Transição):** Compilador hospedeiro JVM (`thz-core-jvm` / `thz-cli-jvm`) usado unicamente para validar a linguagem e compilar o Stage 1.
  - **Stage 1 (Compilador em THZ):** O compilador escrito na própria sintaxe da linguagem (`thz-compiler`: `tokens.thz`, `ast.thz`, `lexer.thz`, `parser.thz`, `codegen.thz`, `driver.thz`).
  - **Stage 2 (Autonomia / Zero JVM):** O compilador do Stage 1 gera o executável nativo soberano `thzc.exe` (ou binário THZVM). Uma vez validada a auto-compilação com identidade de hash, a dependência do Stage 0 é desligada para sempre.

### Decisão 3: O Papel do THZ ThermalKit como Bancada de Validação
- O projeto comercial **THZ ThermalKit** é formalizado como o primeiro grande validador da especificação THZ em produção.
- Todos os gaps, assinaturas faltantes (como `FATIA.*` e `TEXTO.fatia`) e necessidades de I/O de baixo nível descobertos no ThermalKit são transferidos diretamente para os repositórios oficiais da organização (`https://github.com/orgs/THZ-Lang/repositories`), elevando o nível de maturidade do compilador self-hosted.

---

## 3. Consequências e Governança

1. **Fim dos Wrappers Ad-Hoc:** Nenhum projeto cliente do ecossistema THZ deve implementar interpretadores privados paralelos. O motor de execução oficial é a THZVM.
2. **Rastreabilidade e Documentação:** Criados os documentos técnicos de referência:
   - [THZVM_ESPECIFICACAO_TECNICA.md](../THZVM_ESPECIFICACAO_TECNICA.md) (Especificação da THZVM e Drivers)
   - [BOOTSTRAP_SELF_HOSTING_ROADMAP.md](../BOOTSTRAP_SELF_HOSTING_ROADMAP.md) (O Caminho do Bootstrap e Self-Hosting)
3. **Auditoria:** Este registro atende à diretriz formal de governança [decision-audit-trail.md](../../.agents/rules/decision-audit-trail.md).
