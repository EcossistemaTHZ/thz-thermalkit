# Correções Identificadas no THZ-LANG para Repositório Upstream

Este documento registra com precisão cirúrgica todas as correções identificadas durante os testes na toolchain oficial do **THZ-LANG** (`thz-core-jvm` e `thz-cli-jvm`), para que possam ser aplicadas diretamente nos repositórios oficiais da organização (`github.com/THZ-Lang/*`).

---

## 🚀 Pull Requests Oficiais Abertos no GitHub

| Repositório | PR | Branch | Status | Resumo |
| :--- | :---: | :---: | :---: | :--- |
| **`thz-runtime-rs`** | **[#1](https://github.com/THZ-Lang/thz-runtime-rs/pull/1)** | `feat/hardware-transport-cabi` | **OPEN** | Transporte de hardware driverless (Win32 `usbprint.sys`, COM/Bluetooth) e C-ABI de strings/decimais. |
| **`thz-core-jvm`** | **[#1](https://github.com/THZ-Lang/thz-core-jvm/pull/1)** | `feat/llvm-ir-opaque-pointers-and-decimal` | **OPEN** | Suporte a opaque pointers LLVM 15+, promoção `i128` (ISO-10967) e lowering de stdlib `TEXTO.*`. |
| **`thz-vscode`** | **[#1](https://github.com/THZ-Lang/thz-vscode/pull/1)** | `feat/modern-syntax-grammar-and-config` | **OPEN** | Suporte na gramática TextMate à sintaxe moderna enxuta (`:=`, `->`, `campo: TIPO`, palavras-chave minúsculas, etc.). |
| **`thz-config-backup`** | **[#1](https://github.com/THZ-Lang/thz-config-backup/pull/1)** | `feat/backup-restore-tooling` | **OPEN** | Ferramenta oficial para backup auditável em Markdown e restauração automática do diretório de configurações dos agentes. |

---

## 1. `thz-core-jvm` — Assinaturas Semânticas da Stdlib (`FATIA.*`)

### Arquivo
`toolchain/thz-core-jvm/src/main/java/thz/lang/semantico/AssinaturasStdlib.java`

### Problema Identificado
O interpretador runtime (`BibliotecaColecao.java`) implementa e registra na biblioteca padrão as funções:
- `FATIA.tamanho`
- `FATIA.adicionar`
- `FATIA.primeiro`
- `FATIA.ultimo`
- `FATIA.vazia`

Porém, a tabela estática de validação semântica em `AssinaturasStdlib.java` **não continha** o registro do domínio `FATIA.*`. Como resultado, qualquer código válido em THZ-LANG que utilize `FATIA.tamanho(lista)` falhava na checagem semântica com o erro:
```text
[Erro][Linha X:Y] Chamada desconhecida: 'FATIA.tamanho'.
```

### Correção Proposta (Patch)
```diff
--- a/src/main/java/thz/lang/semantico/AssinaturasStdlib.java
+++ b/src/main/java/thz/lang/semantico/AssinaturasStdlib.java
@@ -52,6 +52,20 @@ public final class AssinaturasStdlib {
         m.put("TEXTO.deDecimal", new Assinatura(1, 1, TIPO_TEXTO));
         m.put("TEXTO.deInteiro", new Assinatura(1, 1, TIPO_TEXTO));
         m.put("TEXTO.deLogico", new Assinatura(1, 1, TIPO_TEXTO));
+        m.put("TEXTO.fatia", new Assinatura(2, 3, TIPO_TEXTO));
+
+        // ---- FATIA ----
+        m.put("FATIA.tamanho", new Assinatura(1, 1, TIPO_INTEIRO_GENERICO));
+        m.put("FATIA.adicionar", new Assinatura(2, 2, (Function<List<TipoThz>, TipoThz>) args -> args.get(0)));
+        m.put("FATIA.primeiro", new Assinatura(1, 1, (Function<List<TipoThz>, TipoThz>) args -> {
+            String interno = !args.isEmpty() && args.get(0) != null ? args.get(0).interno() : null;
+            return interno != null ? new TipoThz(interno, CategoriaTipo.REGISTRO) : TIPO_TEXTO;
+        }));
+        m.put("FATIA.ultimo", new Assinatura(1, 1, (Function<List<TipoThz>, TipoThz>) args -> {
+            String interno = !args.isEmpty() && args.get(0) != null ? args.get(0).interno() : null;
+            return interno != null ? new TipoThz(interno, CategoriaTipo.REGISTRO) : TIPO_TEXTO;
+        }));
+        m.put("FATIA.vazia", new Assinatura(1, 1, TIPO_LOGICO));
 
         // ---- MATEMATICA ----
         m.put("MATEMATICA.abs", new Assinatura(1, 1, (Function<List<TipoThz>, TipoThz>) args -> Tipos.ehInteiro(args.get(0)) ? TIPO_INTEIRO_GENERICO : args.get(0)));
```

---

## 2. `thz-core-jvm` — Alias `TEXTO.fatia` para `TEXTO.subtexto`

### Arquivo
`toolchain/thz-core-jvm/src/main/java/thz/lang/interpretador/BibliotecaTexto.java`

### Problema Identificado
A stdlib possui `TEXTO.subtexto`, mas em código idiomático em português o termo `TEXTO.fatia(texto, inicio, fim)` é altamente intuitivo. Para evitar erros sintáticos ao fatiar strings, foi adicionado um registro público apontando para o mesmo `StdlibHelper.sliceTexto`.

### Correção Proposta (Patch)
```diff
--- a/src/main/java/thz/lang/interpretador/BibliotecaTexto.java
+++ b/src/main/java/thz/lang/interpretador/BibliotecaTexto.java
@@ -53,6 +53,15 @@ public final class BibliotecaTexto {
             String texto = ((ValorThz.Texto) args.get(0)).valor();
             return ValorThz.TEXTO(StdlibHelper.sliceTexto(texto, ini, fim));
         });
+        BibliotecaPadrao.registrarPublico(m, "TEXTO.fatia", (args, ctx) -> {
+            if (args.size() < 2 || args.size() > 3)
+                throw new ErroExecucao("[Erro de Execução][Linha " + ctx.linha() + ":" + ctx.coluna() + "] TEXTO.fatia exige 2 ou 3 args (texto, inicio, [fim])");
+            StdlibHelper.exigirClasse("TEXTO.fatia", args.get(0), "TEXTO", ctx);
+            int ini = StdlibHelper.comoInteiroArg(args.get(1), ctx).intValue();
+            Integer fim = args.size() == 3 ? StdlibHelper.comoInteiroArg(args.get(2), ctx).intValue() : null;
+            String texto = ((ValorThz.Texto) args.get(0)).valor();
+            return ValorThz.TEXTO(StdlibHelper.sliceTexto(texto, ini, fim));
+        });
         BibliotecaPadrao.registrarPublico(m, "TEXTO.substituir", (args, ctx) -> {
             StdlibHelper.exigirAridade("TEXTO.substituir", args, 3, ctx);
             StdlibHelper.exigirClasse("TEXTO.substituir", args.get(0), "TEXTO", ctx);
```

---

## 3. `thz-cli-jvm` — Tratamento de Erro ao Executar AST Nula

### Arquivo
`toolchain/thz-cli-jvm/src/main/java/thz/lang/cli/comandos/ComandoRun.java`

### Problema Identificado
No método `ComandoRun.executar()`, o código fazia:
```java
ProgramaAst ast = ThzCompilerFacade.parseAst(fonte);
boolean ehArquivoUi = ... (ast.tipoModulo() == ...)
```
Quando o arquivo possuía algum erro sintático, `ThzCompilerFacade.parseAst(fonte)` capturava a exceção internamente e retornava `null`. Ao tentar acessar `ast.tipoModulo()`, a JVM disparava uma exceção não tratada:
```text
Exception in thread "main" java.lang.NullPointerException: Cannot invoke "thz.lang.ast.ProgramaAst.tipoModulo()" because "ast" is null
```
Ao invés de exibir a mensagem amigável com a linha e coluna do erro sintático.

### Correção Proposta (Patch)
```diff
--- a/src/main/java/thz/lang/cli/comandos/ComandoRun.java
+++ b/src/main/java/thz/lang/cli/comandos/ComandoRun.java
@@ -46,7 +46,15 @@ public class ComandoRun implements ComandoCli {
         }
 
         String fonte = Files.readString(Path.of(arquivo), StandardCharsets.UTF_8);
-        ProgramaAst ast = ThzCompilerFacade.parseAst(fonte);
+        var analise = ThzCompilerFacade.analisar(fonte, false);
+        if (analise.temErros() || analise.ast() == null) {
+            for (String bloco : analise.textoDiagnosticos()) {
+                CliLogger.erro(bloco + "\n");
+            }
+            CliErros.statusComandoCheck(analise.diagnosticos().size());
+            return;
+        }
+        ProgramaAst ast = analise.ast();
 
         boolean ehArquivoUi = arquivo.toLowerCase().endsWith(".thzui")
                 || (ast.tipoModulo() == thz.lang.ast.TipoModulo.TELA)
```

---

## 4. `thz-core-jvm` — Emissor LLVM IR AOT (`GeradorIr.java`)

### Arquivo
`toolchain/thz-core-jvm/src/main/java/thz/lang/ir/GeradorIr.java`

### Problemas Identificados e Corrigidos
1. **Opaque Pointer Type Mismatch (`store ptr 0`):**
   - O LLVM 15+ rejeita `store ptr 0, ptr %var` com o erro:
     `error: integer/byte constant must have integer/byte type`.
   - **Correção:** Quando o tipo é `ptr`, inicializações e retornos numéricos `0` ou vazios são emitidos como `null` (`store ptr null, ptr %var` e `ret ptr null`).
2. **Lowering de `ExprAst.CriarRegistro` e `ExprAst.Nulo`:**
   - Anteriormente caíam no `default` retornando `("0", "i64")`.
   - **Correção:** `ExprAst.Nulo` emite `("null", "ptr")`; `ExprAst.CriarRegistro` aloca o tipo estruturado `%struct.<Nome>` e retorna seu ponteiro.
3. **Concatenação de Strings (`thz_str_concat`):**
   - Em operações binárias com `ptr`, o emissor tentava emitir `add ptr %a, %b`, inválido no LLVM.
   - **Correção:** Declarada e invocada a função nativa `@thz_str_concat(ptr %a, ptr %b)`.
4. **Promoção Aritmética e Decimal ISO-10967 (`i128`):**
   - Expressões binárias promoviam apenas entre `i32` e `i64`. Variáveis do tipo `DECIMAL` (`i128`) recebiam atribuições incompatíveis com `i64`.
   - **Correção:** Adicionada promoção com extensão de sinal `sext` para `i128` em `OpBinaria`, `DeclVariavel` e `Atribuicao`.
5. **Resolução de Operações Qualificadas e Membros de Enum:**
   - Chamadas entre operações da mesma regra (`calcularSaldoEsperado`) e membros diretos de enumerações (`PIX_INSTANTANEO`) emitiam registradores SSA indefinidos (ex: `%PIX_INSTANTANEO`).
   - **Correção:** Resolvido o prefixo da regra e emitido o ordinal `i32` do membro enum.
6. **Stdlib de Texto e UI Nativa:**
   - Adicionadas declarações de runtime e mapeamentos para:
     - `TEXTO.subtexto` -> `@thz_substring`
     - `TEXTO.comprimento` -> `@thz_tamanho_str`
     - `TEXTO.deDecimal` -> `@thz_decimal_para_str`
     - `TEXTO.deInteiro` -> `@thz_i64_para_str`
     - `TELA.renderizarFormulario` -> `@thz_tela_renderizar_formulario`

---

## 5. `thz-runtime-rs` — Módulo de Transporte de Hardware C-ABI e Strings

### Arquivos
- `toolchain/thz-runtime-rs/src/hardware.rs`
- `toolchain/thz-runtime-rs/src/lib.rs`
- `toolchain/thz-runtime-rs/Cargo.toml`

### Melhorias Implementadas
1. **Transporte Driverless Win32 sem Spooler:**
   - `thz_hardware_usb_enviar(caminho, payload, len)`: Acesso direto via Win32 descritor USB (`usbprint.sys`).
   - `thz_hardware_com_enviar(porta, baud, payload, len)`: Acesso serial direkt COM / Bluetooth SPP via `serialport` com flush síncrono e timeout de 10s.
   - `thz_hardware_descobrir_dispositivos(buffer, max_len)`: Enumeração serial de portas disponíveis em JSON.
   - `thz_hardware_imprimir_cupom(tipo, destino, payload, len)`: Roteamento direto USB vs COM/Bluetooth.
2. **Funções de Suporte a Strings e Decimal:**
   - `thz_str_concat(a, b)`: Concatenação segura de C-strings.
   - `thz_decimal_para_str(val, scale)`: Formatação com precisão arbitrária decimal sem perdas de ponto flutuante.
   - `thz_i64_para_str(val)`: Conversão de inteiro para C-string.
   - `thz_tela_renderizar_formulario(form, titulo)`: Stub de ponte para renderização de telas declarativas.

---

## 6. Scripts Oficiais de Bootstrap e Compilação

### Arquivos
- `scripts/bootstrap-selfhost.ps1`: Executa o pipeline de bootstrap em 3 estágios com verificação de identidade de hash SHA-256 entre Stage 1 e Stage 2.
- `thzc.ps1` e `thzc.cmd`: Compilador nativo independente AOT. Transforma arquivos `.thz` diretamente em `.exe` nativos usando o compilador e a THZVM nativa.
