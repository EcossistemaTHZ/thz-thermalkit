# ADR-004: Sistema Integrado de PDV Universal e Gestão de Assistência Técnica (MapOS + Impressão Térmica Direta)

- **Identificador:** ADR-004
- **Status:** **APROVADO** (Deliberado em 20/10/2026)
- **Contexto:** Repositório `thermal-probe` (THZ ThermalKit) / Desktop App (Tauri v2 + SQLite + ESC/POS)
- **Decisores:** Lucas Thomaz (Usuário) & Antigravity (Pair Programming Agent)
- **Referências:** [MapOS](https://github.com/RamonSilva20/mapos) | [Código de Defesa do Consumidor (Art. 26/50)](https://www.planalto.gov.br/ccivil_03/leis/l8078compilado.htm)

---

## 1. Contexto e Motivação

O **THZ ThermalKit** foi concebido como uma solução de alta performance em baixo nível (Rust + Tauri v2) para resolver o problema crônico de impressão térmica no Windows: comunicação direta com bobinas de 58 mm e 80 mm via descritores Win32 (`usbprint.sys`) e Bluetooth SPP serial, operando **driverless** (sem depender do Spooler de impressão do Windows, que frequentemente deforma layouts, ignora larguras úteis ou trava filas de impressão).

Com a maturidade do motor de impressão, constatou-se a necessidade de evoluir o software de um mero "emissor de cupons e utilitários isolados" para uma **plataforma completa de automação comercial**:
1. **Atendimento Universal a qualquer negócio com PDV:** Venda rápida de balcão, catálogo unificado de produtos e serviços, controle de estoque (com margem e alerta de estoque mínimo), clientes e movimentação de caixa (abertura, sangria, suprimento e fechamento).
2. **Especialização de Ponta a Ponta para Assistência Técnica:** Especialização no ciclo de vida de reparos de computadores, notebooks, celulares e tablets, adotando os fluxos consolidados do **MapOS** (Ordem de Serviço, triagem, laudo, peças aplicadas, mão de obra, termos de garantia legal/balcão e comprovantes impressos na hora).
3. **Módulo de Configuração "Amarradinho":** Parametrização centralizada e persistente dos dados do estabelecimento (cabeçalho, CNPJ, contatos, chave PIX para QRCode na bobina, termos e cláusulas de garantia do CDC).

---

## 2. Alternativas Arquiteturais Analisadas

### Alternativa A: Uso de Módulos Web Isolados / MapOS Original em Servidor Local (PHP/Apache)
- **Prós:** O MapOS possui maturidade de regras e telas prontas em PHP/CodeIgniter.
- **Contras (Inviável):** Dependência de pilha pesada (Apache + MySQL/MariaDB + PHP); perda total da comunicação direta Win32 USB/Bluetooth; necessidade de imprimir via navegador (HTML Print / PDF), resultando em travamentos do Spooler, cortes errados em bobinas de 58 mm e impossibilidade de executar como um aplicativo de desktop leve e portátil.

### Alternativa B: Interface React Apenas em Memória / LocalStorage
- **Prós:** Rápido de prototipar no frontend.
- **Contras (Veto Técnico):** Incompatível com boas práticas de arquitetura e governança. Sem integridade relacional (ACID), dados vulneráveis à limpeza de cache de browser, sem suporte a backups consistentes e incapaz de lidar com históricos de milhares de O.S. e movimentações financeiras.

### Alternativa C: Arquitetura Nativa Integrada (Tauri v2 + SQLite WAL + Core ESC/POS CP860) [APROVADA]
- **Conceito:** 
  - **Camada de Dados:** SQLite nativo com `rusqlite`, operando em modo WAL (*Write-Ahead Logging*), auto-vacuum incremental e chaves estrangeiras ativas em `%APPDATA%\thz-thermalkit\data\app.db`.
  - **Camada de Negócio (Rust / Tauri IPC):** Módulos transacionais para Clientes, Produtos/Estoque, Serviços, Ordens de Serviço (O.S.), Vendas de Balcão e Fechamento de Caixa.
  - **Camada de Apresentação (React 19 + TypeScript + Tailwind):** Interface responsiva, moderna, com dark mode, busca dinâmica e preview em tempo real da bobina térmica de 32 colunas (58 mm) ou 48 colunas (80 mm).
  - **Camada de Hardware (ESC/POS Driverless):** Emissão síncrona de comprovantes de entrada (com canhoto de bancada), orçamentos, termos de saída com garantia e tickets de venda PDV diretamente para o dispositivo.

---

## 3. Decisão

**Adotar a Alternativa C:** Construir o ecossistema completo de **PDV Universal + Gestão Especializada de Assistência Técnica (MapOS inspired)** sobre a arquitetura existente do THZ ThermalKit.

---

## 4. Estrutura do Ciclo de Gestão de Assistência Técnica

A especialização técnica cobre rigorosamente as seguintes etapas:

```
[1. ENTRADA & TRIAGEM]
  ├── Identificação do Cliente (Nome, Documento, WhatsApp)
  ├── Equipamento: Tipo (PC / Notebook / Smartphone / Tablet), Marca, Modelo, Cor
  ├── Identificadores: IMEI / Nº de Série
  ├── Segurança: Senha numérica, padrão gestual ou sem senha
  ├── Checklist de Entrada: Tela trincada, marcas de queda, conectores, parafusos
  ├── Acessórios: Carregador, cabos, fones, capinha, chip/cartão SD
  ├── Defeito Reclamado pelo Cliente
  └── 🖨️ Impressão Instantânea (58mm):
       ├── Via 1: Comprovante do Cliente com dados da triagem e código da OS
       └── Via 2: Canhoto / Etiqueta de identificação para anexar ao aparelho

[2. DIAGNÓSTICO, ORÇAMENTO & APROVAÇÃO]
  ├── Constatação e Laudo Técnico do Especialista
  ├── Vínculo de Peças do Estoque (com reserva automática)
  ├── Vínculo de Serviços (mão de obra)
  ├── Status: 'Aguardando Orçamento' ➔ 'Orçamento Gerado' ➔ 'Aprovado' / 'Cancelado'
  └── Disparo rápido de resumo de aprovação via WhatsApp

[3. EXECUÇÃO EM BANCADA]
  ├── Atribuição do Técnico Responsável
  ├── Apontamento de serviços executados e peças substituídas
  └── Status: 'Em Manutenção' ➔ 'Aguardando Peças' ➔ 'Pronto para Retirada'

[4. FINALIZAÇÃO, PAGAMENTO & SAÍDA (PDV)]
  ├── Integração com o Caixa (Dinheiro, PIX dinâmico, Cartão de Débito/Crédito)
  ├── Baixa definitiva de peças no estoque
  ├── Registro de Garantia Legal (ex: 90 dias balcão, Art. 26 do CDC)
  └── 🖨️ Impressão Térmica de Saída (58mm):
       ├── Detalhamento completo de peças e serviços
       ├── Valores, descontos e forma de pagamento
       ├── Termo de Garantia e Condições de Cobertura
       └── Cláusula de Abandono (CDC) e campo para assinatura do cliente
```

---

## 5. Módulo de Configuração Central ("Amarradinho")

O módulo de configurações consolida:
1. **Dados do Estabelecimento:** Nome Fantasia, Razão Social, CNPJ/CPF, Inscrição, Telefone, WhatsApp, E-mail, Endereço completo com CEP.
2. **Dados Financeiros & PIX:** Tipo de chave, Chave PIX e Titular para geração de QRCode / chave copia-e-cola na bobina.
3. **Parâmetros de Assistência Técnica:** Prazo padrão de garantia (dias), Termo padrão de garantia para bobina térmica e Cláusula de abandono de equipamentos após 90 dias.
4. **Hardware & Bobina:** Seleção de 58 mm (384 dots / 32 colunas) ou 80 mm (576 dots / 48 colunas), densidade de avanço de papel e Code Page CP860.

---

## 6. Consequências e Diretrizes Arquiteturais

1. **Persistência Transacional:** Toda baixa de estoque decorrente de O.S. ou Venda de Balcão deve ocorrer em transação SQLite atômica.
2. **Acentuação e Codificação:** Todos os textos formatados para a impressora 58 mm devem utilizar o mapeamento CP860 implementado no `thermal_core`.
3. **Portabilidade:** Os caminhos do banco de dados e arquivos devem continuar dinâmicos via `%APPDATA%` / `$env:USERPROFILE`, sem hardcodes.
4. **Governança Git:** Todo o desenvolvimento das fases de implementação deve ocorrer em branches de feature (`feat/pdv-universal-assistencia-tecnica`) e ser submetido via PRs formais.
