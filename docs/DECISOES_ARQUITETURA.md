# Registro de Decisões de Arquitetura (ADRs) — THZ ThermalKit & Ecossistema THZ-Lang

Este documento mantém o histórico formal, auditável e cronológico de todas as decisões arquiteturais tomadas no repositório **THZ ThermalKit** e em sua integração com o ecossistema **THZ-Lang**.

---

## Índice de Decisões (ADRs)

| ADR | Data | Título | Status | Resumo do Impacto |
| :---: | :---: | :--- | :---: | :--- |
| **[ADR-001](adr/ADR-001-HOST-NATIVO-RUST-THZ-LANG.md)** | 23/09/2026 | Adoção do Caminho C: Host/Runtime Nativo THZ em Rust | **APROVADO** | Aplicação 100% escrita em THZ-LANG (`.thz`/`.thzui`), executada por um motor/runtime nativo em Rust; eliminação total de Java/JVM em runtime e build-time; integração Win32 direta para impressão térmica ESC/POS driverless. |
| **[ADR-002](adr/ADR-002-THZVM-E-BOOTSTRAP-SELF-HOSTING.md)** | 23/09/2026 | Fundação da THZVM e Roadmap de Bootstrap Self-Hosting | **APROVADO** | Formalização da **THZVM** (Frente A) como motor nativo universal sem Garbage Collector (Arenas $O(1)$) e estabelecimento do roteiro de **Bootstrapping** (Frente B) para que a linguagem atinja a auto-compilação plena via `thz-compiler`. |
| **[ADR-003](adr/ADR-003-AUTO-COMPILACAO-THZC-BOOTSTRAP.md)** | 23/09/2026 | Auto-Compilação Oficial, Bootstrap e Emancipação da THZVM | **EM PROGRESSO** | Diagnóstico real da toolchain: interpretador oficial (`thz run`) executa regras complexas com 100% de integridade; backend AOT LLVM upstream requer maturação de structs/arrays; extensão VS Code/Antigravity instalada com LSP ativo. |
| **[ADR-004](adr/ADR-004-SISTEMA-PDV-UNIVERSAL-E-ASSISTENCIA-TECNICA.md)** | 20/10/2026 | Sistema Integrado de PDV Universal e Gestão de Assistência Técnica (MapOS + Impressão Térmica Direta) | **APROVADO** | Arquitetura de automação comercial e gestão de ordens de serviço (O.S.) de ponta a ponta para assistência técnica (PC, notebook, smartphone, tablet); persistência SQLite WAL (`db.rs`); integração driverless com bobinas de 58 mm e 80 mm (comprovante de entrada com canhoto, saída com termo de garantia CDC e cupom PDV). |

---

## Documentos Técnicos Fundamentais

- 📄 **[ESPECIFICACAO_PDV_E_ASSISTENCIA_TECNICA.md](ESPECIFICACAO_PDV_E_ASSISTENCIA_TECNICA.md)**: Especificação completa do PDV Universal e do ciclo de Assistência Técnica (MapOS inspired), com modelagem relacional SQLite, DDLs, fluxos de estados de O.S. e layouts térmicos ESC/POS 58 mm.
- 📄 **[THZVM_ESPECIFICACAO_TECNICA.md](THZVM_ESPECIFICACAO_TECNICA.md)**: Especificação técnica da THZVM, alocador de arenas, aritmética decimal ISO-10967 e C-ABI de hardware (Win32 USB / Bluetooth SPP).
- 📄 **[BOOTSTRAP_SELF_HOSTING_ROADMAP.md](BOOTSTRAP_SELF_HOSTING_ROADMAP.md)**: Roteiro completo do Bootstrap em 3 estágios (Stage 0 JVM → Stage 1 Self-Hosted THZ → Stage 2 Nativo Autônomo).
- 📄 **[MARCO_AUTONOMIA_THZ_LANG.md](MARCO_AUTONOMIA_THZ_LANG.md)**: Diretrizes de auto-suficiência e eliminação de wrappers no ecossistema oficial.
- 📄 **[UPSTREAM_THZ_LANG_FIXES.md](UPSTREAM_THZ_LANG_FIXES.md)**: Correções cirúrgicas prontas para PR nos repositórios da organização `github.com/THZ-Lang/*`.

---

## Diretrizes de Auditoria e Governança
- Conforme a regra de auditoria [decision-audit-trail.md](../.agents/rules/decision-audit-trail.md), toda decisão relevante é persistida formalmente em Git para fins de compliance e acompanhamento evolutivo.
