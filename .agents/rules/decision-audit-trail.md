# Rastreabilidade e Auditoria de Decisões Arquiteturais (ADR / Decision Log)

Diretriz obrigatória aprendida e fixada para o repositório **THZ ThermalKit** e projetos do ecossistema:

---

## 1. Princípio Fundamental
Toda decisão arquitetural relevante, mudança de rumo técnico, adoção ou descarte de tecnologias e alinhamento de requisitos com o usuário deve ser **imediatamente documentada** em um registro formal de decisões (ADR - Architecture Decision Record) e refletida na documentação do projeto (`docs/` ou `.agents/`).

## 2. Critérios de Registro
Qualquer agente ou desenvolvedor que atue no repositório deve documentar:
- **Contexto & Problema:** O que motivou a discussão ou o problema enfrentado.
- **Alternativas Consideradas:** Todas as opções avaliadas, com seus prós, contras e viabilidade técnica.
- **Decisão Tomada:** A opção aprovada pelo usuário/time e a justificativa clara da escolha.
- **Consequências & Impactos:** O que muda na arquitetura, o que é permitido e o que é terminantemente proibido.
- **Histórico Auditável:** Registro temporal para auditoria técnica, rastreabilidade de compliance e acompanhamento evolutivo do software.

## 3. Práticas Obrigatórias
1. **Transparência Absoluta:** Nunca disfarce código de suporte ou wrappers como se fossem a linguagem-alvo. Mantenha separação cristalina entre o motor de execução (runtime/host) e o código da aplicação.
2. **Atualização Contínua do Histórico:** Decisões tomadas em conversas ou alinhamentos devem ser persistidas em arquivos versionados em Git (ex: `docs/adr/` ou `docs/DECISOES_ARQUITETURA.md`).
3. **Consulta Prévia:** Antes de propor alterações arquiteturais, consulte as decisões prévias para não regredir em acordos já estabelecidos.
