# Especificação Técnica da THZVM (THZ Virtual Machine / Native Runtime)

> **Documento Arquitetural Oficial — Frente A.** Este documento define a arquitetura, subsistemas, modelo de memória e extensões de hardware da **THZVM**, a máquina de execução nativa do ecossistema **THZ-LANG**.

---

## 1. Visão Geral da THZVM

A **THZVM** é o motor de execução nativo de alta performance do THZ-LANG. Ela atua para a linguagem THZ exatamente da mesma forma que a **JVM** atua para o Java, a **BEAM** atua para o Erlang ou a **V8** atua para o JavaScript: provendo o ambiente de execução, memória, tipos, governança de contratos e comunicação com o sistema operacional, para que o desenvolvedor escreva **100% em código THZ**, sem wrappers ou firulas intermediárias.

```
┌─────────────────────────────────────────────────────────────────────────┐
│                       PROGRAMAS THZ (.thz / .thzui)                     │
│               • Fechamento de Caixa • Cupons • Telas                    │
└────────────────────────────────────┬────────────────────────────────────┘
                                     │
                                     ▼ Executa
┌─────────────────────────────────────────────────────────────────────────┐
│                                 THZVM                                   │
│                                                                         │
│   ┌───────────────────────────┐     ┌───────────────────────────────┐   │
│   │    Motor de Contratos     │     │      Aritmética Decimal       │   │
│   │    EXIGE / GARANTE        │     │     ISO-10967 (Ponto Fixo)    │   │
│   └───────────────────────────┘     └───────────────────────────────┘   │
│   ┌───────────────────────────┐     ┌───────────────────────────────┐   │
│   │     Arenas de Memória     │     │        Vetorização SIMD       │   │
│   │       Alocador O(1)       │     │       AVX2 / AVX-512 / Neon   │   │
│   └───────────────────────────┘     └───────────────────────────────┘   │
│   ┌─────────────────────────────────────────────────────────────────┐   │
│   │                  Subsistema de I/O e C-ABI                      │   │
│   └────────────────────────────────┬────────────────────────────────┘   │
└────────────────────────────────────┼────────────────────────────────────┘
                                     │ Chamada Direta Win32
                 ┌───────────────────┴───────────────────┐
                 ▼                                       ▼
    ┌──────────────────────────┐            ┌──────────────────────────┐
    │   USB Direct Transport   │            │   Bluetooth SPP (COM)    │
    │     (usbprint.sys)       │            │   (serialport Win32)     │
    └──────────────────────────┘            └──────────────────────────┘
```

---

## 2. Subsistemas Centrais da THZVM

### 2.1 Modelo de Memória: Alocador Linear em Arenas $O(1)$
Diferente da JVM, que utiliza Garbage Collectors com pausas de Stop-the-World e sobrecarga de CPU, a THZVM é construída sobre alocação em **Arenas Contíguas Lineares**:
- **Alocação Instantânea ($O(1)$):** Avanço de ponteiro linear (`bump pointer`).
- **Zero Fragmentação e Zero Pausa:** Memória de requisições, fechamentos de caixa ou emissão de cupons é liberada em bloco ao fim da operação (`thz_arena_free_all`).
- **Implementação Base:** Provida nativamente pela crate `thz-runtime-rs::arena::ThzArena`.

### 2.2 Aritmética Monetária e Decimal Exata (ISO-10967 / ISO-4217)
Linguagens comuns utilizam ponto flutuante IEEE-754 (`double`/`float`), gerando erros clássicos de arredondamento em sistemas de PDV (ex.: `0.1 + 0.2 = 0.30000000000000004`).
- A THZVM opera em **aritmética inteira de ponto fixo** (escala de centavos em 64 bits ou 128 bits).
- Todo cálculo financeiro de desconto, quebra de caixa, acréscimo e troco na THZVM é matematicamente exato e imutável.

### 2.3 Motor de Governança e Design by Contract
A THZVM não delega a validação de contratos a bibliotecas externas; os contratos são primitivas de primeira classe da máquina:
- **`CONTRATO_ENTRADA` (`EXIGE`):** A THZVM avalia os predicados de entrada antes da primeira instrução da operação. Se violado, interrompe a execução com rastreamento formal de linha/coluna (`ViolacaoContratoExige`).
- **`CONTRATO_SAIDA` (`GARANTE`):** Avalia os predicados pós-condição na saída com o valor especial `RESULTADO`.

---

## 3. Extensões de Hardware Térmico (C-ABI)

Para que a THZVM converse diretamente com impressoras fiscais e não-fiscais sem depender de drivers Spooler do Windows (que costumam travar ou reformatar texto), ela expõe funções nativas de C-ABI através de `thz-runtime-rs`:

```c
// Despacho direto para o descritor USB Win32 (usbprint.sys)
int thz_hardware_usb_enviar(const char* device_path, const uint8_t* payload, uint32_t len);

// Despacho direto para a porta serial COM (Bluetooth SPP ou RS-232 física)
int thz_hardware_com_enviar(const char* com_port, uint32_t baud_rate, const uint8_t* payload, uint32_t len);

// Varredura de periféricos Win32 SetupAPI
int thz_hardware_descobrir_dispositivos(char* buffer_saida_json, uint32_t max_len);
```

### Protocolo de Transmissão Térmica Direta:
1. **Reset e Inicialização:** Emite `ESC @` (`0x1B, 0x40`).
2. **Seleção de Code Page:** Emite `ESC t 3` (`0x1B, 0x74, 0x03`) para ativação da página de código **CP860** (Português/Acentuação completa).
3. **Raster de Imagem Direto:** Geração de gráficos através do comando `GS v 0` (`0x1D, 0x76, 0x30, 0x00`).
4. **Flush Síncrono Obrigatório:** Força a gravação no buffer do periférico antes do encerramento da conexão.

---

## 4. Subsistema Gráfico e DSL `TELA`

A THZVM provê o interpretador gráfico para a DSL declarativa `TELA` (`.thzui`):
- Carrega os elementos visuais declarados (`TELA.criarContainer`, `TELA.criarCard`, `TELA.adicionarMetrica`, `TELA.adicionarCampoMoeda`).
- Faz o binding reativo dos botões para invocar diretamente as operações correspondentes nas regras de negócio THZ.
- Exibe uma janela nativa moderna sem dependência de runtimes externos.
