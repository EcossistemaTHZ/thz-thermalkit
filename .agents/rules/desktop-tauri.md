# Regras de Desenvolvimento Desktop (Tauri v2 + React)

Diretrizes para o aplicativo desktop moderno localizado no diretório `desktop/`.

---

## 1. Arquitetura de Comunicação (IPC)
- **Rust Core via Tauri Commands:** A lógica de enumeração de dispositivos (`discover_printers`), envio de payloads e carregamento de perfis deve residir em comandos Tauri (`#[tauri::command]`) no backend Rust (`desktop/src-tauri/src/lib.rs`), reutilizando o crate `thermal_core`.
- **Tratamento Assíncrono:** Operações de I/O de hardware (especialmente abertura de portas seriais/Bluetooth) devem ser executadas sem travar a thread principal da UI. Utilize tasks assíncronas do Tauri ou channels quando apropriado.
- **Retorno Tipado:** Todos os comandos Tauri devem retornar `Result<T, String>` com mensagens de erro claras e amigáveis para a interface do usuário.

## 2. Frontend React 19 & Vite
- **TypeScript Estrito:** Mantenha tipagens estritas para todos os estados de conexão, dispositivos e opções de impressão.
- **Design & Experiência Visual:**
  - Estética moderna: dark mode refinado, glassmorphism sutil, tipografia moderna e ícones coesos (`lucide-react`).
  - Feedback em tempo real: indicadores visuais claros de status de conexão (USB conectado, Bluetooth pareado, enviando dados, erro).
  - Preview de Bobina Térmica: sempre mostre a prévia visual do recibo/documento antes do disparo.
