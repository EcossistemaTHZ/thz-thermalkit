# Customizações do Agente (.agents) — THZ ThermalKit

Esta pasta armazena as configurações, regras de desenvolvimento e habilidades operacionais para agentes de IA atuando no **THZ ThermalKit**.

---

## Estrutura do Diretório

```text
.agents/
├── README.md                           # Este guia de referência
├── rules/                              # Diretrizes e restrições ativas continuamente
│   ├── rust-standards.md               # Boas práticas Rust, segurança de FFI Win32 e tratamento de erros
│   ├── hardware-safety.md              # Princípios de segurança de hardware, confirmação física e economia de bobina
│   └── desktop-tauri.md                # Padrões para o frontend React 19 e backend Tauri v2
└── skills/                             # Habilidades e runbooks sob demanda
    ├── thermal-hardware-ops/           # Operações de diagnóstico, calibração e perfis de hardware
    │   └── SKILL.md
    └── escpos-thermal-direct/          # Especificação de bytes ESC/POS, raster GS v 0 e codificação CP860
        └── SKILL.md
```

---

## Como Estender

- **Nova Regra:** Adicione um arquivo `.md` em `rules/`. O agente incorporará automaticamente as diretrizes nos turnos de trabalho.
- **Nova Habilidade:** Crie uma subpasta em `skills/<nome-da-habilidade>/` contendo um `SKILL.md` com cabeçalho YAML (`name` e `description`).
