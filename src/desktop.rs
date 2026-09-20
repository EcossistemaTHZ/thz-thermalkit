#![cfg(windows)]
#![windows_subsystem = "windows"]

//! # THZ ThermalKit Desktop
//!
//! Aplicativo gráfico nativo para Windows construído com `eframe` / `egui`.
//! Permite visualizar e imprimir documentos (TXT, PNG, JPG, PDF) diretamente em
//! impressoras térmicas ESC/POS de 58 mm através de portas USB (`usbprint.sys`),
//! com prévia em tempo real e confirmação de segurança.

use eframe::egui;
use image::{imageops::FilterType, GrayImage};
use rfd::FileDialog;
use serde::Deserialize;
use std::{
    env,
    ffi::c_void,
    fs::{self, File, OpenOptions},
    io::Write,
    mem,
    path::{Path, PathBuf},
    process::Command,
    ptr,
};

// ============================================================================
// Estruturas e Constantes da Windows SetupAPI
// ============================================================================

/// Representação C-compatível de um GUID do Windows.
#[derive(Clone, Copy)]
#[repr(C)]
struct Guid {
    a: u32,
    b: u16,
    c: u16,
    d: [u8; 8],
}

/// GUID para impressoras USB (USBPRINT).
/// {28D78FAD-5A12-11D1-AE5B-00F803A8C2}
const USBPRINT: Guid = Guid {
    a: 0x28d78fad,
    b: 0x5a12,
    c: 0x11d1,
    d: [0xae, 0x5b, 0, 0, 0xf8, 0x03, 0xa8, 0xc2],
};

/// Flag para enumerar interfaces ativas e presentes (DIGCF_PRESENT | DIGCF_DEVICEINTERFACE).
const FLAGS: u32 = 0x12;

/// Constante para o nome amigável do dispositivo no registro (SPDRP_FRIENDLYNAME).
const FRIENDLY: u32 = 12;

/// Constante para a lista de IDs de hardware no registro (SPDRP_HARDWAREID).
const HARDWARE: u32 = 1;

/// Estrutura de dados de interface de dispositivo (SP_DEVICE_INTERFACE_DATA).
#[repr(C)]
struct Iface {
    size: u32,
    class: Guid,
    flags: u32,
    reserved: usize,
}

/// Estrutura de informações do dispositivo (SP_DEVINFO_DATA).
#[repr(C)]
struct Dev {
    size: u32,
    class: Guid,
    instance: u32,
    reserved: usize,
}

#[link(name = "setupapi")]
extern "system" {
    fn SetupDiGetClassDevsW(c: *const Guid, e: *const u16, p: isize, f: u32) -> isize;
    fn SetupDiEnumDeviceInterfaces(
        s: isize,
        d: *const Dev,
        c: *const Guid,
        i: u32,
        v: *mut Iface,
    ) -> i32;
    fn SetupDiGetDeviceInterfaceDetailW(
        s: isize,
        i: *const Iface,
        b: *mut c_void,
        n: u32,
        r: *mut u32,
        d: *mut Dev,
    ) -> i32;
    fn SetupDiGetDeviceRegistryPropertyW(
        s: isize,
        d: *const Dev,
        k: u32,
        t: *mut u32,
        b: *mut u8,
        n: u32,
        r: *mut u32,
    ) -> i32;
    fn SetupDiDestroyDeviceInfoList(s: isize) -> i32;
}

// ============================================================================
// Modelos de Perfil de Impressora
// ============================================================================

/// Configuração de perfil carregada de arquivo JSON.
#[derive(Deserialize, Clone)]
struct Profile {
    /// Nome descritivo da impressora.
    name: String,
    /// Informações de transporte (USB / VID / PID).
    transport: Transport,
    /// Largura útil de impressão em pontos (ex.: 384 dots).
    printable_width_dots: u32,
    /// Tabela de caracteres ESC/POS (padrão: 3 para CP860).
    #[serde(default = "code_page")]
    code_page: u8,
}

#[derive(Deserialize, Clone)]
struct Transport {
    #[serde(rename = "type")]
    kind: String,
    vid: Option<String>,
    pid: Option<String>,
}

fn code_page() -> u8 {
    3
}

// ============================================================================
// Descoberta e Comunicação Win32 Direta
// ============================================================================

/// Converte fatia UTF-16 nula-terminada em `String`.
fn z(w: &[u16]) -> String {
    String::from_utf16_lossy(&w[..w.iter().position(|x| *x == 0).unwrap_or(w.len())])
}

/// Recupera uma propriedade de texto do dispositivo via SetupAPI.
unsafe fn prop(s: isize, d: &Dev, k: u32) -> String {
    let mut b = [0u8; 4096];
    let (mut t, mut r) = (0, 0);
    if SetupDiGetDeviceRegistryPropertyW(s, d, k, &mut t, b.as_mut_ptr(), b.len() as u32, &mut r)
        == 0
    {
        return String::new();
    }
    z(std::slice::from_raw_parts(
        b.as_ptr() as *const u16,
        (r as usize / 2).min(b.len() / 2),
    ))
}

/// Extrai sequências hexadecimais de 4 caracteres (como VID ou PID) de strings de hardware.
fn field(s: &str, t: &str) -> Option<String> {
    let u = s.to_ascii_uppercase();
    let p = u.find(t)? + t.len();
    let v: String = u[p..]
        .chars()
        .take_while(|c| c.is_ascii_hexdigit())
        .take(4)
        .collect();
    (v.len() == 4).then_some(v)
}

/// Localiza a impressora conectada que corresponde aos parâmetros do perfil (VID/PID).
/// Retorna o caminho direto de acesso ao dispositivo (`path`) e seu nome amigável (`name`).
fn discover(p: &Profile) -> Result<(String, String), String> {
    unsafe {
        let s = SetupDiGetClassDevsW(&USBPRINT, ptr::null(), 0, FLAGS);
        if s == -1 {
            return Err("Windows não encontrou interfaces USB Printer Class".into());
        }
        let mut i = 0;
        loop {
            let mut iface = Iface {
                size: mem::size_of::<Iface>() as u32,
                class: USBPRINT,
                flags: 0,
                reserved: 0,
            };
            if SetupDiEnumDeviceInterfaces(s, ptr::null(), &USBPRINT, i, &mut iface) == 0 {
                break;
            }
            i += 1;
            let mut need = 0;
            SetupDiGetDeviceInterfaceDetailW(
                s,
                &iface,
                ptr::null_mut(),
                0,
                &mut need,
                ptr::null_mut(),
            );
            if need < 6 {
                continue;
            }
            let mut data = vec![0u64; (need as usize + 7) / 8];
            let raw = data.as_mut_ptr() as *mut u8;
            *(raw as *mut u32) = if cfg!(target_pointer_width = "64") {
                8
            } else {
                6
            };
            let mut d = Dev {
                size: mem::size_of::<Dev>() as u32,
                class: USBPRINT,
                instance: 0,
                reserved: 0,
            };
            if SetupDiGetDeviceInterfaceDetailW(s, &iface, raw.cast(), need, &mut need, &mut d) == 0
            {
                continue;
            }
            let name = prop(s, &d, FRIENDLY);
            let hw = prop(s, &d, HARDWARE);
            let vid = field(&hw, "VID_");
            let pid = field(&hw, "PID_");
            if p.transport.kind == "usb-printer-class"
                && p.transport
                    .vid
                    .as_ref()
                    .is_none_or(|v| vid.as_ref().is_some_and(|x| x.eq_ignore_ascii_case(v)))
                && p.transport
                    .pid
                    .as_ref()
                    .is_none_or(|v| pid.as_ref().is_some_and(|x| x.eq_ignore_ascii_case(v)))
            {
                let path = z(std::slice::from_raw_parts(
                    raw.add(4) as *const u16,
                    (need as usize - 4) / 2,
                ));
                SetupDiDestroyDeviceInfoList(s);
                return Ok((path, name));
            }
        }
        SetupDiDestroyDeviceInfoList(s);
        Err("A impressora do perfil não está conectada via USB Printing Port".into())
    }
}

// ============================================================================
// Processamento de Imagens e Protocolo ESC/POS
// ============================================================================

/// Converte imagem monocromática no comando de rasterização ESC/POS `GS v 0`.
fn raster(img: &GrayImage) -> Vec<u8> {
    let (w, h) = img.dimensions();
    let bpr = w.div_ceil(8);
    let mut out = vec![
        0x1d,
        b'v',
        b'0',
        0,
        bpr as u8,
        (bpr >> 8) as u8,
        h as u8,
        (h >> 8) as u8,
    ];
    for y in 0..h {
        for xb in 0..bpr {
            let mut b = 0;
            for bit in 0..8 {
                let x = xb * 8 + bit;
                // Pixels mais escuros que 180 são binarizados como preto (1)
                if x < w && img.get_pixel(x, y)[0] < 180 {
                    b |= 0x80 >> bit
                }
            }
            out.push(b)
        }
    }
    out
}

/// Redimensiona proporcionalmente a imagem para a largura útil da bobina em pontos.
fn normalize(img: GrayImage, w: u32) -> GrayImage {
    if img.width() == w {
        return img;
    }
    let h = (img.height().saturating_mul(w) / img.width()).max(1);
    image::imageops::resize(&img, w, h, FilterType::Lanczos3)
}

/// Mapeia caracteres de texto em português para bytes da tabela Code Page 860.
fn cp860(s: &str) -> Vec<u8> {
    s.chars()
        .map(|c| {
            if c.is_ascii() {
                c as u8
            } else {
                match c {
                    'á' => 0xa0,
                    'é' => 0x82,
                    'í' => 0xa1,
                    'ó' => 0xa2,
                    'ú' => 0xa3,
                    'à' => 0x85,
                    'â' => 0x83,
                    'ê' => 0x88,
                    'ô' => 0x93,
                    'ã' => 0x84,
                    'õ' => 0x94,
                    'ç' => 0x87,
                    'Á' => 0x86,
                    'É' => 0x90,
                    'Í' => 0x8b,
                    'Ó' => 0x9f,
                    'Ú' => 0x96,
                    'À' => 0x91,
                    'Â' => 0x8f,
                    'Ê' => 0x89,
                    'Ô' => 0x8c,
                    'Ã' => 0x8e,
                    'Õ' => 0x99,
                    'Ç' => 0x80,
                    _ => b'?',
                }
            }
        })
        .collect()
}

// ============================================================================
// Estado da Aplicação Desktop (App State)
// ============================================================================

/// Representação em memória do documento carregado para impressão.
enum Document {
    None,
    Text(String),
    Rasters(Vec<GrayImage>),
}

/// Estado principal da aplicação desktop em egui.
struct App {
    profile_path: PathBuf,
    profile: Option<Profile>,
    device: String,
    file: Option<PathBuf>,
    doc: Document,
    texture: Option<egui::TextureHandle>,
    message: String,
    confirm: bool,
}

impl App {
    fn new(cc: &eframe::CreationContext<'_>) -> Self {
        let mut a = Self {
            profile_path: PathBuf::from("profiles/tech-cla58.json"),
            profile: None,
            device: String::new(),
            file: None,
            doc: Document::None,
            texture: None,
            message: "Abra um arquivo para começar.".into(),
            confirm: false,
        };
        a.load_profile();
        a.refresh_device();

        // Configura tema escuro estilizado da aplicação
        let mut visuals = egui::Visuals::dark();
        visuals.panel_fill = egui::Color32::from_rgb(18, 24, 31);
        visuals.window_fill = egui::Color32::from_rgb(28, 36, 46);
        visuals.extreme_bg_color = egui::Color32::from_rgb(12, 17, 23);
        visuals.widgets.noninteractive.bg_fill = egui::Color32::from_rgb(28, 36, 46);
        cc.egui_ctx.set_visuals(visuals);
        a
    }

    /// Carrega o perfil JSON apontado por `profile_path`.
    fn load_profile(&mut self) {
        match File::open(&self.profile_path)
            .map_err(|e| e.to_string())
            .and_then(|f| serde_json::from_reader(f).map_err(|e| e.to_string()))
        {
            Ok(p) => {
                self.profile = Some(p);
                self.message = "Perfil carregado.".into()
            }
            Err(e) => self.message = format!("Perfil não carregado: {e}"),
        }
    }

    /// Atualiza o status de detecção da impressora via USB Printer Class.
    fn refresh_device(&mut self) {
        self.device = match &self.profile {
            Some(p) => match discover(p) {
                Ok((_, n)) => format!("Conectada: {n}"),
                Err(e) => format!("Não encontrada: {e}"),
            },
            None => "Nenhum perfil carregado".into(),
        }
    }

    /// Carrega a textura para a área de prévia visual da tela.
    fn set_preview(&mut self, ctx: &egui::Context, img: &GrayImage) {
        let pixels = img.as_raw();
        let color =
            egui::ColorImage::from_gray([img.width() as usize, img.height() as usize], pixels);
        self.texture = Some(ctx.load_texture("preview", color, egui::TextureOptions::NEAREST));
    }

    /// Abre e processa um arquivo de texto, imagem ou PDF.
    fn open(&mut self, ctx: &egui::Context, path: PathBuf) {
        let ext = path
            .extension()
            .and_then(|x| x.to_str())
            .unwrap_or("")
            .to_ascii_lowercase();
        let width = self
            .profile
            .as_ref()
            .map(|p| p.printable_width_dots)
            .unwrap_or(384);
        let result = if ext == "txt" {
            fs::read_to_string(&path)
                .map_err(|e| e.to_string())
                .map(|s| {
                    let t = s.strip_prefix('\u{feff}').unwrap_or(&s).replace('\r', "");
                    self.doc = Document::Text(t);
                    self.texture = None;
                })
        } else if ext == "pdf" {
            self.render_pdf(&path, width, ctx)
        } else {
            image::open(&path).map_err(|e| e.to_string()).map(|i| {
                let g = normalize(i.to_luma8(), width);
                self.set_preview(ctx, &g);
                self.doc = Document::Rasters(vec![g]);
            })
        };
        match result {
            Ok(_) => {
                self.file = Some(path);
                self.message = "Arquivo pronto para impressão.".into()
            }
            Err(e) => self.message = format!("Não foi possível abrir: {e}"),
        }
    }

    /// Renderiza as páginas de um PDF em arquivos PNG a 203 DPI usando o pdftoppm.
    fn render_pdf(&mut self, path: &Path, width: u32, ctx: &egui::Context) -> Result<(), String> {
        let dir = env::temp_dir().join(format!("thermalkit-{}", std::process::id()));
        fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
        let prefix = dir.join("page");
        let status = Command::new("pdftoppm")
            .args([
                "-png",
                "-r",
                "203",
                path.to_str().ok_or("caminho inválido")?,
                prefix.to_str().ok_or("caminho temporário inválido")?,
            ])
            .status()
            .map_err(|_| {
                "pdftoppm não foi encontrado. Instale o Poppler e abra outro PowerShell."
                    .to_string()
            })?;
        if !status.success() {
            return Err("O Poppler não conseguiu renderizar este PDF".into());
        }
        let mut files: Vec<_> = fs::read_dir(&dir)
            .map_err(|e| e.to_string())?
            .filter_map(Result::ok)
            .map(|x| x.path())
            .filter(|p| p.extension().is_some_and(|e| e.eq_ignore_ascii_case("png")))
            .collect();
        files.sort();
        let pages: Result<Vec<_>, _> = files
            .iter()
            .map(|p| {
                image::open(p)
                    .map(|i| normalize(i.to_luma8(), width))
                    .map_err(|e| e.to_string())
            })
            .collect();
        let pages = pages?;
        let first = pages
            .first()
            .ok_or("O PDF não tem páginas renderizáveis")?
            .clone();
        self.set_preview(ctx, &first);
        self.doc = Document::Rasters(pages);
        Ok(())
    }

    /// Envia o documento processado diretamente para o dispositivo USB da impressora.
    fn print(&mut self) {
        let p = match &self.profile {
            Some(p) => p.clone(),
            None => {
                self.message = "Carregue um perfil.".into();
                return;
            }
        };
        let path = match discover(&p) {
            Ok((x, _)) => x,
            Err(e) => {
                self.message = e;
                return;
            }
        };
        let mut bytes = vec![0x1b, b'@']; // Reset de sessão ESC @
        match &self.doc {
            Document::Text(t) => {
                bytes.extend_from_slice(&[0x1b, b't', p.code_page]); // ESC t <codepage>
                bytes.extend(cp860(t));
                if !bytes.ends_with(b"\n") {
                    bytes.push(b'\n')
                }
            }
            Document::Rasters(pages) => {
                for page in pages {
                    bytes.extend(raster(page));
                    bytes.extend_from_slice(b"\n\n")
                }
            }
            Document::None => {
                self.message = "Abra um arquivo antes de imprimir.".into();
                return;
            }
        }
        match OpenOptions::new().write(true).open(path).and_then(|mut f| {
            f.write_all(&bytes)?;
            f.flush()
        }) {
            Ok(_) => self.message = "Enviado para a impressora.".into(),
            Err(e) => self.message = format!("Falha ao imprimir: {e}"),
        }
    }
}

// ============================================================================
// Renderização da Interface Gráfica (egui::App)
// ============================================================================

impl eframe::App for App {
    fn update(&mut self, ctx: &egui::Context, _: &mut eframe::Frame) {
        ctx.style_mut(|style| {
            style.spacing.item_spacing = egui::vec2(10.0, 10.0);
            style.spacing.button_padding = egui::vec2(12.0, 8.0);
        });
        let connected = self.device.starts_with("Conectada");
        let accent = egui::Color32::from_rgb(51, 211, 153);

        // Barra Superior: Título e Status de Conexão
        egui::TopBottomPanel::top("top")
            .exact_height(76.0)
            .show(ctx, |ui| {
                ui.horizontal_centered(|ui| {
                    ui.add_space(8.0);
                    ui.vertical(|ui| {
                        ui.add_space(10.0);
                        ui.heading(egui::RichText::new("THZ ThermalKit").size(27.0).strong());
                        ui.label(
                            egui::RichText::new("Impressão térmica direta")
                                .color(egui::Color32::GRAY),
                        );
                    });
                    ui.with_layout(egui::Layout::right_to_left(egui::Align::Center), |ui| {
                        ui.add_space(12.0);
                        let color = if connected {
                            accent
                        } else {
                            egui::Color32::from_rgb(244, 114, 94)
                        };
                        ui.horizontal(|ui| {
                            ui.label(
                                egui::RichText::new(if connected {
                                    "CLA58 conectada"
                                } else {
                                    "Impressora não encontrada"
                                })
                                .color(color)
                                .strong(),
                            );
                            let (rect, _) = ui
                                .allocate_exact_size(egui::vec2(12.0, 12.0), egui::Sense::hover());
                            ui.painter().circle_filled(rect.center(), 4.0, color);
                        });
                    });
                });
            });

        // Painel Esquerdo: Controles, Perfil, Arquivo e Ação de Imprimir
        egui::SidePanel::left("controls")
            .min_width(290.0)
            .max_width(320.0)
            .show(ctx, |ui| {
                ui.add_space(12.0);
                ui.heading("Preparar impressão");
                ui.label(egui::RichText::new("Perfil e documento").color(egui::Color32::GRAY));
                ui.add_space(8.0);

                // Seção Impressora e Perfil
                ui.group(|ui| {
                    ui.set_min_height(112.0);
                    ui.label(
                        egui::RichText::new("IMPRESSORA")
                            .small()
                            .color(egui::Color32::GRAY),
                    );
                    ui.label(
                        self.profile
                            .as_ref()
                            .map(|p| p.name.as_str())
                            .unwrap_or("Nenhum perfil"),
                    );
                    ui.label(egui::RichText::new(&self.device).color(if connected {
                        accent
                    } else {
                        egui::Color32::LIGHT_RED
                    }));
                    ui.horizontal(|ui| {
                        if ui.button("Atualizar").clicked() {
                            self.refresh_device()
                        }
                        if ui.button("Trocar perfil").clicked() {
                            if let Some(p) = FileDialog::new()
                                .add_filter("Perfil", &["json"])
                                .pick_file()
                            {
                                self.profile_path = p;
                                self.load_profile();
                                self.refresh_device()
                            }
                        }
                    });
                });

                ui.add_space(10.0);

                // Seção Documento
                ui.group(|ui| {
                    ui.set_min_height(112.0);
                    ui.label(
                        egui::RichText::new("DOCUMENTO")
                            .small()
                            .color(egui::Color32::GRAY),
                    );
                    if ui
                        .add_sized(
                            [250.0, 42.0],
                            egui::Button::new("Abrir PDF, imagem ou texto"),
                        )
                        .clicked()
                    {
                        if let Some(p) = FileDialog::new()
                            .add_filter("Documentos", &["txt", "png", "jpg", "jpeg", "pdf"])
                            .pick_file()
                        {
                            self.open(ctx, p)
                        }
                    }
                    if let Some(f) = &self.file {
                        ui.add_space(4.0);
                        ui.label(
                            egui::RichText::new(
                                f.file_name().unwrap_or_default().to_string_lossy(),
                            )
                            .strong(),
                        );
                    } else {
                        ui.label(
                            egui::RichText::new("Nenhum arquivo selecionado")
                                .color(egui::Color32::GRAY),
                        );
                    }
                });

                ui.add_space(10.0);

                // Botão de Disparo da Impressão
                let ready =
                    !matches!(self.doc, Document::None) && self.profile.is_some() && connected;
                if ui
                    .add_enabled(
                        ready,
                        egui::Button::new(egui::RichText::new("Imprimir").size(18.0).strong())
                            .fill(accent)
                            .min_size(egui::vec2(250.0, 46.0)),
                    )
                    .clicked()
                {
                    self.confirm = true
                }
                ui.add_space(4.0);
                ui.label(egui::RichText::new(&self.message).color(egui::Color32::LIGHT_GRAY));

                ui.with_layout(egui::Layout::bottom_up(egui::Align::LEFT), |ui| {
                    ui.label(
                        egui::RichText::new("USB direto • ESC/POS • 384 dots • CP860")
                            .small()
                            .color(egui::Color32::DARK_GRAY),
                    );
                });
            });

        // Painel Central: Prévia Visual do Documento em 58 mm
        egui::CentralPanel::default().show(ctx, |ui| {
            ui.add_space(12.0);
            ui.horizontal(|ui| {
                ui.heading("Prévia");
                ui.label(egui::RichText::new("58 mm").color(accent).strong());
            });
            ui.separator();
            ui.add_space(8.0);
            egui::ScrollArea::vertical()
                .auto_shrink([false, false])
                .show(ui, |ui| match &self.doc {
                    Document::Text(t) => {
                        ui.label(egui::RichText::new("TEXTO").small().color(egui::Color32::GRAY));
                        ui.add_space(6.0);
                        ui.monospace(t);
                    }
                    Document::Rasters(pages) => {
                        ui.label(
                            egui::RichText::new(format!("{} página(s)", pages.len()))
                                .color(egui::Color32::GRAY),
                        );
                        ui.add_space(6.0);
                        if let Some(tex) = &self.texture {
                            let size = tex.size_vec2();
                            let scale = (ui.available_width() / size.x).min(1.45);
                            ui.image((tex.id(), size * scale));
                        }
                    }
                    Document::None => {
                        ui.add_space(80.0);
                        ui.vertical_centered(|ui| {
                            ui.heading("Seu documento aparece aqui");
                            ui.label(
                                egui::RichText::new(
                                    "Abra um PDF, imagem ou arquivo de texto para gerar a prévia térmica.",
                                )
                                .color(egui::Color32::GRAY),
                            );
                        });
                    }
                });
        });

        // Modal de Confirmação de Impressão Física
        if self.confirm {
            egui::Window::new("Confirmar impressão")
                .collapsible(false)
                .resizable(false)
                .anchor(egui::Align2::CENTER_CENTER, [0.0, 0.0])
                .show(ctx, |ui| {
                    ui.set_min_width(330.0);
                    ui.label("O documento será enviado para a CLA58 conectada.");
                    ui.label(
                        egui::RichText::new("Sem corte, gaveta ou comandos de configuração.")
                            .color(egui::Color32::GRAY),
                    );
                    ui.add_space(12.0);
                    ui.horizontal(|ui| {
                        if ui.button("Cancelar").clicked() {
                            self.confirm = false
                        }
                        if ui
                            .add(egui::Button::new("Confirmar e imprimir").fill(accent))
                            .clicked()
                        {
                            self.confirm = false;
                            self.print()
                        }
                    });
                });
        }
    }
}

// ============================================================================
// Ponto de Entrada da Interface Desktop (GUI Entrypoint)
// ============================================================================

fn main() -> eframe::Result<()> {
    eframe::run_native(
        "THZ ThermalKit",
        eframe::NativeOptions {
            viewport: egui::ViewportBuilder::default().with_inner_size([1000.0, 720.0]),
            ..Default::default()
        },
        Box::new(|cc| Ok(Box::new(App::new(cc)))),
    )
}
