# Marco de Autonomia e Auto-Suficiência do THZ-LANG (Zero Wrappers)

> **Documento de Auditoria e Roadmap Técnico.** Este relatório consolida os aprendizados, gargalos e especificações exatas para que a organização **THZ-Lang** (`https://github.com/orgs/THZ-Lang/repositories`) atinja a maturidade plena de **auto-suficiência e self-hosting**, eliminando a necessidade de wrappers pontuais, reescritas e adaptações ad-hoc em projetos clientes.

---

## 1. O Princípio da Auto-Suficiência

Uma linguagem de programação corporativa moderna deve ser capaz de:
1. **Auto-Compilação (Self-Hosting):** Seu compilador deve ser escrito na própria sintaxe da linguagem (`thz-compiler/*.thz`).
2. **Auto-Suficiência em Projetos Reais:** Projetos clientes (como o `thermal-probe` / THZ ThermalKit) devem apenas escrever código `.thz` e `.thzui`, sem necessidade de construir interpretadores paralelos ou wrappers em outras linguagens para suprir lacunas da toolchain.
3. **Independência de Ambiente (Zero Vendor Lock-in):** A linguagem deve ser compilável para binário nativo autônomo sem exigir JVM, Node.js ou dependências externas em tempo de execução.

---

## 2. Diagnóstico nos Repositórios Oficiais do THZ-Lang

Durante os testes reais de emissão de cupons térmicos e fechamento de caixa, mapeamos com exatidão o estado e as lacunas nos repositórios da organização:

### 2.1 `thz-compiler` (`https://github.com/THZ-Lang/thz-compiler`)
- **Estado Atual:** Possui `tokens.thz`, `ast.thz`, `lexer.thz`, `parser.thz`, `codegen.thz` e `driver.thz`.
- **Gargalo para o Marco:** O pipeline de bootstrap ainda depende do Host JVM para a etapa inicial (Stage 0). O `parser.thz` precisa de suporte completo a `FATIA` tipada e laços `PARA` com acesso indexado para que o compilador consiga compilar a si mesmo de forma autônoma.

### 2.2 `thz-core-jvm` (`https://github.com/THZ-Lang/thz-core-jvm`)
- **Correções Imediatas Requeridas:**
  1. **Assinaturas Semânticas de Coleções:** `AssinaturasStdlib.java` não possui o domínio `FATIA.*` registrado (`FATIA.tamanho`, `FATIA.adicionar`, `FATIA.primeiro`, `FATIA.ultimo`, `FATIA.vazia`), embora a implementação exista em `BibliotecaColecao.java`. Isso causa falso-positivo de compilação em códigos que usam arrays.
  2. **Alias de Fatiamento de Texto:** Falta registrar `TEXTO.fatia` apontando para `TEXTO.subtexto` para suportar código idiomático.
  3. **DSL Visual em Modo CLI:** `thz check` falha ao validar chamadas `TELA.*` em arquivos `.thzui` porque `BibliotecaTela` só está registrada no módulo `thz-gui-jvm`. A tabela de assinaturas de `TELA.*` deve ser conhecida estaticamente pelo validador do core.

### 2.3 `thz-runtime-rs` (`https://github.com/THZ-Lang/thz-runtime-rs`)
- **Estado Atual:** Excelente desempenho em alocação de Arena $O(1)$, SIMD vetorial e criptografia.
- **Evolução Necessária:** Deve expor oficialmente funções de I/O de baixo nível e transporte de bytes (Serial COM e USB Direct) através da C-ABI nativa, para que qualquer programa `.thz` possa interagir com periféricos industriais e impressoras térmicas via bloco FFI padrão, sem wrappers ad-hoc.

---

## 3. Especificação do Pipeline Unificado (Zero Adaptações)

Para que o THZ-LANG opere sem "adaptações para que funcione", o fluxo oficial deve ser:

```
[ Código THZ do Usuário ]
  • fechamento_caixa.thz (Aritmética Exata + Contratos)
  • app_thermal.thzui    (Interface Visual Declarativa)
             │
             ▼
    [ Compilador THZ ] ───▶ Checagem de Sintaxe, AST e Contratos (EXIGE / GARANTE)
             │
             ├──────────────────────────┬──────────────────────────┐
             ▼                          ▼                          ▼
     [ Modo Interpretação ]     [ Modo UI / WebView ]      [ Modo AOT Nativo ]
     • Execução direta em dev   • Renderiza TELA.*         • Compila via Clang/LLVM
     • Testes e validação       • Janela nativa instantânea • Binário .exe sem JVM
```

---

## 4. Plano de Ação para Upstream nos Repositórios Originais

| Repositório | Ação de Upstream | Impacto no Ecossistema |
| :--- | :--- | :--- |
| **`thz-core-jvm`** | Aplicar patches de `AssinaturasStdlib.java` (`FATIA.*`, `TELA.*`, `TEXTO.fatia`) | Elimina erros de compilação de fatias e DSL de telas |
| **`thz-cli-jvm`** | Implementar `nativeCompile` estável no CI para gerar `thz.exe` nativo | Distribuição oficial sem necessidade de Java no cliente |
| **`thz-runtime-rs`** | Integrar bindings C-ABI para transporte direto (Win32 USB / Serial) | I/O industrial padronizado para toda a linguagem |
| **`thz-compiler`** | Concluir o Stage 1 do bootstrap com testes de auto-compilação | **Marco Histórico de Self-Hosting Concluído** |
