# Fluxo de Contribuição Git: Feature Branches e Pull Requests (PRs)

Diretriz obrigatória aprendida e fixada para o repositório **THZ ThermalKit** e todos os repositórios do ecossistema **THZ-Lang** (`https://github.com/orgs/THZ-Lang/repositories`):

---

## 1. Princípio Fundamental
Toda nova funcionalidade, alteração de comportamento, suporte a hardware ou correção concebida deve ser enviada aos repositórios remotos exclusivamente por meio de **branches de feature dedicadas** e formalizada através de **Pull Requests (PRs)** no GitHub.

> [!IMPORTANT]
> **Evitar Push Direto na `main`:** Mesmo com permissões de administrador, o envio direto para a branch `main` deve ser evitado. O fluxo por Pull Request é o caminho ótimo estabelecido para garantir:
> - Histórico limpo e rastreabilidade atômica de cada entrega.
> - Auditoria formal e documentação integrada do ciclo de vida da alteração.
> - Verificação e validação isolada antes da consolidação definitiva.

---

## 2. Padrão de Nomenclatura de Branches
As branches devem seguir convenções semânticas claras:
- `feat/<nome-descritivo>`: Novas funcionalidades, novos módulos, adições de sintaxe ou novos drivers.
  - *Exemplo:* `feat/hardware-transport-cabi`, `feat/modern-syntax-grammar-and-config`
- `fix/<nome-descritivo>`: Correções cirúrgicas de bugs, alinhamento de tipos ou correção de geradores.
  - *Exemplo:* `fix/llvm-ir-opaque-pointers`, `fix/syntax-indentation-regex`
- `docs/<nome-descritivo>`: Documentação arquitetural, especificações ou ADRs.
- `refactor/<nome-descritivo>`: Melhorias estruturais sem alteração de comportamento externo.

---

## 3. Padrão de Pull Requests
Ao abrir um Pull Request (utilizando preferencialmente o GitHub CLI `gh pr create`):
1. **Título Padronizado:** Seguir formato Conventional Commits (ex: `feat(hardware): add win32 driverless transport and c-abi string formatting`).
2. **Corpo Informativo e Estruturado:**
   - **Resumo das Alterações:** O que foi adicionado ou corrigido.
   - **Módulos / Arquivos Impactados:** Destaque dos componentes centrais modificados.
   - **Garantia de Qualidade / Testes:** Evidências de testes unitários ou de integração executados com aprovação.
3. **Sincronização com o Registro de Upstream:**
   - Registrar o link do PR aberto no documento de governança [UPSTREAM_THZ_LANG_FIXES.md](file:///c:/Users/lucas/Projetos/thermal-probe/docs/UPSTREAM_THZ_LANG_FIXES.md) para controle centralizado do ecossistema.

---

## 4. Padrão de Mensagens de Commit e Integridade Textual

1. **Formato Conventional Commits Limpo:**
   - Use prefixos padronizados: `feat(...)`, `fix(...)`, `docs(...)`, `refactor(...)`, `perf(...)`.
   - Mensagens claras, técnicas, em português formal ou inglês técnico padronizado.
   - Descreva com exatidão o que foi alterado e o motivo técnico.
2. **Proibição Estrita de Caracteres Corrompidos ou Glitches de Escape:**
   - **NUNCA** inclua caracteres de escape ANSI ou sequências malformadas de terminal (ex: `\e3003`, `/r-X|t`, `^[[...`, artefatos de codificação incorreta).
   - Ao executar comandos `git commit` via PowerShell/terminal, utilize sempre strings literais limpas sem interpolações corrompidas de subshells.
3. **Atomicidade e Rastreabilidade:**
   - Commits devem ser pequenos, atômicos e focados em um único propósito/módulo.
   - Sempre acompanhados de rastreabilidade formal e documentação quando houver impacto arquitetural.

