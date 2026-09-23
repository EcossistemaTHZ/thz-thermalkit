# THZ ThermalKit — Diretrizes para Agentes de IA

Este documento define o contexto, arquitetura e regras fundamentais que qualquer agente de IA deve seguir ao operar no repositório **`thermal-probe` (THZ ThermalKit)**.

---

## 1. Visão do Projeto

O **THZ ThermalKit** é uma suíte de software para Windows de baixo nível focada em comunicação, diagnóstico e impressão direta em impressoras térmicas genéricas **ESC/POS** (bobinas de 58 mm e 80 mm).

### Filosofia Principal: *Driverless & Direct Transport*
- **Sem Spooler do Windows:** Não depende e evita filas de impressão do sistema operacional (`POS-58 driver`), que frequentemente causam travamentos ou deformam impressões.
- **Acesso Direto ao Hardware:**
  - **USB:** Abre o descritor de dispositivo Win32 diretamente via `usbprint.sys`.
  - **COM / Bluetooth SPP:** Acesso direto via `serialport` à porta virtual ou física com timeout e flush síncrono.
- **Perfis Persistentes em JSON:** Parâmetros de cabeçote (largura útil em dots, baud rate, codificação de caracteres) desacoplados do executável em `profiles/*.json`.
- **Acentuação em Português:** Utiliza Code Page 860 (`ESC t 3`) com tabela de mapeamento de caracteres estendidos.

---

## 2. Componentes do Repositório

```text
thermal-probe/
├── src/
│   ├── lib.rs              # thermal_core: FFI Win32 SetupAPI, transporte, CP860, raster GS v 0
│   ├── next.rs             # CLI thermal-probe (discover, probe, width-test, print-text/image/pdf)
│   └── desktop.rs          # GUI clássica nativa em egui (thz-thermalkit)
├── desktop/                # GUI moderna em Tauri v2 + React 19 + TypeScript + Vite
│   ├── src-tauri/          # Ponte Tauri em Rust consumindo thermal_core + db.rs (SQLite WAL)
│   └── src/                # Interface React: ReceiptBuilder, WordEscPos, BusinessTemplates, Onboarding
├── profiles/               # Perfis validados de hardware (ex: TECH CLA58 USB e Bluetooth)
└── .agents/                # Regras e habilidades sob demanda para agentes de IA
```

---

## 3. Diretrizes Críticas para Agentes

1. **Segurança de Hardware (Hardware Safety):**
   - **NUNCA** execute testes com envio físico de bytes para a impressora sem confirmação explícita ou parâmetros isolados.
   - Evite comandos destrutivos ou de avanço infinito de papel (sempre limite a altura máxima de impressão e feeds).
2. **Padrão de Código Rust:**
   - Respeite `cargo fmt` e `cargo clippy`.
   - Na biblioteca `thermal_core` (`src/lib.rs`), trate todos os erros via `io::Result` ou `Result<T, E>`. FFI com `setupapi.dll` deve manter ponteiros seguros e checagem de tamanhos de buffers.
3. **App Desktop (Tauri v2 + React):**
   - Mantenha a separação entre comandos IPC no Rust (`src-tauri`) e o frontend React.
   - Estilização moderna com Tailwind/CSS limpo, dark mode e responsividade.
4. **Consulta às Regras e Habilidades:**
   - Consulte [`.agents/rules/`](./.agents/rules/) para diretrizes específicas de Rust, Tauri e Hardware.
   - Consulte [`.agents/skills/`](./.agents/skills/) para checagem de comandos ESC/POS e operações de diagnóstico.
