# Regras de Segurança de Hardware e Preservação de Insumos

Diretrizes para evitar desperdício de papel térmico, superaquecimento do cabeçote ou travamento físico das impressoras conectadas.

---

## 1. Confirmação Explícita de Impressão Física
- **Nunca Dispare Impressão em Testes Automatizados:** Testes unitários (`cargo test`) ou de integração devem validar a geração de buffers em memória (`Vec<u8>`), e **jamais** abrir caminhos de dispositivo (`usbprint.sys`) ou portas seriais ativas.
- **CLI com Trava de Segurança:** No utilitário `thermal-probe`, qualquer comando de envio físico (como `probe`) deve exigir confirmação explícita do operador (ex: digitação de `PRINT`).
- **Dry-run:** Sempre que possível, forneça modo dry-run / inspeção de payload em hexadecimal para validar os bytes antes do envio.

## 2. Prevenção de Desperdício e Travamentos
- **Limite de Linhas em Branco:** Não envie sequências desnecessárias de `LF` (`0x0A`). O avanço padrão para destaque de papel deve ser de no máximo 3 a 5 linhas.
- **Comandos Destrutivos:** Não envie comandos de corte de papel (`GS V`) ou de acionamento de gaveta de dinheiro (`ESC p`) a menos que expressamente solicitado no perfil ou ação do usuário.
- **Tamanho Máximo de Imagem:** Antes de rasterizar, confira a altura máxima razoável da imagem para evitar consumo descontrolado da bobina de papel.

## 3. Desconexão e Liberação de Recursos
- **Handles de Dispositivo:** Sempre feche os handles de dispositivo USB ou COM após a conclusão da transmissão para não bloquear a porta para outros processos ou para o próprio sistema.
