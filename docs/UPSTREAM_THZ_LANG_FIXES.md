# Correções Identificadas no THZ-LANG para Repositório Upstream

Este documento registra com precisão cirúrgica todas as correções identificadas durante os testes na toolchain oficial do **THZ-LANG** (`thz-core-jvm` e `thz-cli-jvm`), para que possam ser aplicadas diretamente nos repositórios oficiais da organização (`github.com/THZ-Lang/*`).

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
