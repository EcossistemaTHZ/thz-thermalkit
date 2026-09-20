#![cfg(windows)]
#![windows_subsystem = "windows"]

//! # THZ ThermalKit Desktop
//!
//! Aplicativo gráfico nativo para Windows construído com `eframe` / `egui`.
//! Permite visualizar e imprimir documentos (TXT, PNG, JPG, PDF) diretamente em
//! impressoras térmicas ESC/POS de 58 mm através de portas USB (`usbprint.sys`)
//! ou conexões Bluetooth SPP / Serial COM (`BTHENUM`), sem uso do spooler do Windows.

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
    time::Duration,
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

/// GUID para portas seriais COM e portas virtuais Bluetooth SPP.
/// {86E0D1E0-8089-11D0-9CE4-083E301F73}
const COMPORT: Guid = Guid {
    a: 0x86e0d1e0,
    b: 0x8089,
    c: 0x11d0,
    d: [0x9c, 0xe4, 0x08, 0, 0x3e, 0x30, 0x1f, 0x73],
};

/// Flag para enumerar interfaces ativas e presentes (DIGCF_PRESENT | DIGCF_DEVICEINTERFACE).
const FLAGS: u32 = 0x12;

/// Constante para o nome amigável do dispositivo no registro (SPDRP_FRIENDLYNAME).
const FRIENDLY: u32 = 12;

/// Constante para a lista de IDs de hardware no registro (SPDRP_HARDWAREID).
const HARDWARE: u32 = 1;

/// Constante para a descrição do dispositivo no registro (SPDRP_DEVICEDESC).
const DEVICE_DESC: u32 = 0;

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
    /// Informações de transporte (USB, COM ou Bluetooth).
    transport: Transport,
    /// Largura útil de impressão em pontos (ex.: 384 dots).
    printable_width_dots: u32,
    /// Taxa de transmissão para conexões seriais COM (padrão: 9600).
    #[serde(default = "default_baud")]
    baud: u32,
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
    port: Option<String>,
}

fn code_page() -> u8 {
    3
}

fn default_baud() -> u32 {
    9600
}

// ============================================================================
// Descoberta e Comunicação Win32 Direta
// ============================================================================

/// Tipo de transporte ativo resolvido para a impressora.
#[derive(Clone, Debug)]
enum ActiveTransport {
    /// Impressão direta via caminho Win32 USB Printer Class.
    Usb(String),
    /// Impressão direta via porta serial COM (física ou Bluetooth SPP).
    Com {
        port: String,
        baud: u32,
        is_bluetooth: bool,
    },
}

/// Representa o dispositivo descoberto e pronto para comunicação direta.
#[derive(Clone, Debug)]
struct DiscoveredPrinter {
    #[allow(dead_code)]
    name: String,
    transport: ActiveTransport,
    display_info: String,
}

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

/// Extrai o identificador da porta serial (ex.: "COM4") a partir do nome do dispositivo.
fn com_from_name(name: &str) -> Option<String> {
    let start = name.rfind("(COM")? + 1;
    let end = name[start..].find(')')? + start;
    let port = &name[start..end];
    (port.len() > 3 && port[3..].chars().all(|c| c.is_ascii_digit())).then(|| port.to_string())
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

/// Localiza a impressora conectada que corresponde aos parâmetros do perfil (via USB ou Bluetooth/COM).
fn discover(p: &Profile) -> Result<DiscoveredPrinter, String> {
    // 1. Tentar localizar via USB Printer Class
    if p.transport.kind == "usb-printer-class" {
        unsafe {
            let s = SetupDiGetClassDevsW(&USBPRINT, ptr::null(), 0, FLAGS);
            if s != -1 {
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
                    let mut data = vec![0u64; (need as usize).div_ceil(8)];
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
                    if SetupDiGetDeviceInterfaceDetailW(
                        s,
                        &iface,
                        raw.cast(),
                        need,
                        &mut need,
                        &mut d,
                    ) == 0
                    {
                        continue;
                    }
                    let n = prop(s, &d, FRIENDLY);
                    let name = if n.is_empty() {
                        prop(s, &d, DEVICE_DESC)
                    } else {
                        n
                    };
                    let hw = prop(s, &d, HARDWARE);
                    let vid = field(&hw, "VID_");
                    let pid = field(&hw, "PID_");

                    if p.transport
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
                        return Ok(DiscoveredPrinter {
                            name: if name.is_empty() {
                                p.name.clone()
                            } else {
                                name
                            },
                            transport: ActiveTransport::Usb(path),
                            display_info: format!("Conectada via USB ({})", p.name),
                        });
                    }
                }
                SetupDiDestroyDeviceInfoList(s);
            }
        }
    }

    // 2. Tentar localizar via portas COM (incluindo Bluetooth SPP do BTHENUM)
    unsafe {
        let s = SetupDiGetClassDevsW(&COMPORT, ptr::null(), 0, FLAGS);
        if s != -1 {
            let mut i = 0;
            loop {
                let mut iface = Iface {
                    size: mem::size_of::<Iface>() as u32,
                    class: COMPORT,
                    flags: 0,
                    reserved: 0,
                };
                if SetupDiEnumDeviceInterfaces(s, ptr::null(), &COMPORT, i, &mut iface) == 0 {
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
                let mut data = vec![0u64; (need as usize).div_ceil(8)];
                let raw = data.as_mut_ptr() as *mut u8;
                *(raw as *mut u32) = if cfg!(target_pointer_width = "64") {
                    8
                } else {
                    6
                };
                let mut d = Dev {
                    size: mem::size_of::<Dev>() as u32,
                    class: COMPORT,
                    instance: 0,
                    reserved: 0,
                };
                if SetupDiGetDeviceInterfaceDetailW(s, &iface, raw.cast(), need, &mut need, &mut d)
                    == 0
                {
                    continue;
                }
                let path = z(std::slice::from_raw_parts(
                    raw.add(4) as *const u16,
                    (need as usize - 4) / 2,
                ));
                let path_upper = path.to_ascii_uppercase();
                let n = prop(s, &d, FRIENDLY);
                let name = if n.is_empty() {
                    prop(s, &d, DEVICE_DESC)
                } else {
                    n
                };
                let hw = prop(s, &d, HARDWARE);
                let port = com_from_name(&name);

                // Dispositivos Bluetooth SPP possuem IDs com BTHENUM ou BTH\
                let hw_upper = hw.to_ascii_uppercase();
                let name_upper = name.to_ascii_uppercase();
                let is_bluetooth = hw_upper.contains("BTHENUM")
                    || hw_upper.contains("BTH\\")
                    || path_upper.contains("BTHENUM")
                    || name_upper.contains("BLUETOOTH");

                let matches_configured_port = p.transport.port.as_ref().is_some_and(|configured| {
                    port.as_ref()
                        .is_some_and(|p| p.eq_ignore_ascii_case(configured))
                });

                // Só considera correspondência se:
                // 1. A porta bater exatamente com a porta configurada no perfil (ex.: "COM6"); OU
                // 2. O perfil for "bluetooth" ou "com" e o nome do dispositivo ou porta coincidir com o perfil; OU
                // 3. O dispositivo Bluetooth contiver identificadores de impressora térmica (MPT, CLA58, POS, PRINTER, ou MAC da MPT-II).
                let is_printer_name = name_upper.contains("MPT")
                    || name_upper.contains("CLA58")
                    || name_upper.contains("POS")
                    || name_upper.contains("PRINTER")
                    || name_upper.contains(&p.name.to_ascii_uppercase())
                    || path_upper.contains("DC0D51597B0C")
                    || hw_upper.contains("DC0D51597B0C"); // MAC da impressora MPT-II

                let is_matching_device = if p.transport.port.is_some() {
                    matches_configured_port
                } else if p.transport.kind == "bluetooth" {
                    is_bluetooth && is_printer_name
                } else if p.transport.kind == "com" {
                    matches_configured_port || is_printer_name
                } else {
                    // Perfil USB: só aceita fallback Bluetooth se o dispositivo for comprovadamente a impressora térmica
                    is_bluetooth && is_printer_name
                };

                if let Some(port_name) = port {
                    if is_matching_device {
                        SetupDiDestroyDeviceInfoList(s);
                        let display_label = if is_bluetooth {
                            let clean_name =
                                if is_printer_name && !name_upper.contains("SERIAL PADR") {
                                    name.as_str()
                                } else {
                                    "TECH CLA58 / MPT-II"
                                };
                            format!("Conectada via Bluetooth: {clean_name} ({port_name})")
                        } else {
                            format!("Conectada via Porta Serial ({port_name})")
                        };
                        return Ok(DiscoveredPrinter {
                            name: if name.is_empty() {
                                p.name.clone()
                            } else {
                                name
                            },
                            transport: ActiveTransport::Com {
                                port: port_name,
                                baud: p.baud,
                                is_bluetooth,
                            },
                            display_info: display_label,
                        });
                    }
                }
            }
            SetupDiDestroyDeviceInfoList(s);
        }
    }

    Err("Impressora não encontrada via USB ou Bluetooth/COM. Verifique o pareamento Bluetooth ou a conexão do cabo USB.".into())
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

    /// Atualiza o status de detecção da impressora via USB Printer Class ou Bluetooth/COM.
    fn refresh_device(&mut self) {
        self.device = match &self.profile {
            Some(p) => match discover(p) {
                Ok(d) => d.display_info,
                Err(e) => format!("Não encontrada: {e}"),
            },
            None => "Nenhum perfil carregado".into(),
        };
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

    /// Envia o documento processado diretamente para o dispositivo da impressora (USB ou Bluetooth/COM).
    fn print(&mut self) {
        let p = match &self.profile {
            Some(p) => p.clone(),
            None => {
                self.message = "Carregue um perfil.".into();
                return;
            }
        };
        let discovered = match discover(&p) {
            Ok(d) => d,
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

        match &discovered.transport {
            ActiveTransport::Usb(path) => {
                match OpenOptions::new().write(true).open(path).and_then(|mut f| {
                    f.write_all(&bytes)?;
                    f.flush()
                }) {
                    Ok(_) => self.message = "Enviado com sucesso via USB.".into(),
                    Err(e) => self.message = format!("Falha ao imprimir via USB: {e}"),
                }
            }
            ActiveTransport::Com {
                port,
                baud,
                is_bluetooth,
            } => {
                let label = if *is_bluetooth {
                    "Bluetooth"
                } else {
                    "Porta Serial COM"
                };
                match serialport::new(port, *baud)
                    .timeout(Duration::from_secs(10))
                    .open()
                    .map_err(|e| std::io::Error::other(e.to_string()))
                    .and_then(|mut s| {
                        s.write_all(&bytes)?;
                        s.flush()
                    }) {
                    Ok(_) => {
                        self.message = format!("Enviado com sucesso via {label} ({port}).");
                    }
                    Err(e) => {
                        self.message = format!("Falha ao comunicar via {label} ({port}): {e}");
                    }
                }
            }
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
        let is_bluetooth = self.device.contains("Bluetooth");

        // Cores temáticas: Azul céu para Bluetooth, Verde Esmeralda para USB, Vermelho para desconectado
        let accent = if is_bluetooth {
            egui::Color32::from_rgb(56, 189, 248)
        } else {
            egui::Color32::from_rgb(51, 211, 153)
        };

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
                            egui::RichText::new("Impressão térmica direta (USB & Bluetooth SPP)")
                                .color(egui::Color32::GRAY),
                        );
                    });
                    ui.with_layout(egui::Layout::right_to_left(egui::Align::Center), |ui| {
                        ui.add_space(12.0);
                        let indicator_color = if connected {
                            accent
                        } else {
                            egui::Color32::from_rgb(244, 114, 94)
                        };
                        ui.horizontal(|ui| {
                            ui.label(
                                egui::RichText::new(if connected {
                                    if is_bluetooth {
                                        "Conectada via Bluetooth"
                                    } else {
                                        "Conectada via USB"
                                    }
                                } else {
                                    "Impressora não encontrada"
                                })
                                .color(indicator_color)
                                .strong(),
                            );
                            let (rect, _) = ui
                                .allocate_exact_size(egui::vec2(12.0, 12.0), egui::Sense::hover());
                            ui.painter()
                                .circle_filled(rect.center(), 4.0, indicator_color);
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
                let print_btn_text = egui::RichText::new("Imprimir")
                    .size(18.0)
                    .color(if ready {
                        egui::Color32::from_rgb(12, 17, 23)
                    } else {
                        egui::Color32::GRAY
                    })
                    .strong();
                if ui
                    .add_enabled(
                        ready,
                        egui::Button::new(print_btn_text)
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
                        egui::RichText::new(
                            "USB & Bluetooth SPP direto • ESC/POS • 384 dots • CP860",
                        )
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
                    let target_info = if self.device.starts_with("Conectada via ") {
                        &self.device["Conectada via ".len()..]
                    } else {
                        &self.device
                    };
                    ui.label(format!("O documento será enviado via {target_info}."));
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
                            .add(
                                egui::Button::new(
                                    egui::RichText::new("Confirmar e imprimir")
                                        .color(egui::Color32::from_rgb(12, 17, 23))
                                        .strong(),
                                )
                                .fill(accent),
                            )
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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_discover_bluetooth_com6() {
        let profile = Profile {
            name: "TECH CLA58".into(),
            transport: Transport {
                kind: "bluetooth".into(),
                vid: None,
                pid: None,
                port: Some("COM6".into()),
            },
            printable_width_dots: 384,
            baud: 9600,
            code_page: 3,
        };
        let res = discover(&profile);
        assert!(
            res.is_ok(),
            "Falha ao descobrir impressora na COM6: {:?}",
            res
        );
        if let Ok(d) = res {
            match d.transport {
                ActiveTransport::Com {
                    port, is_bluetooth, ..
                } => {
                    assert_eq!(port, "COM6");
                    assert!(is_bluetooth);
                }
                _ => panic!("Esperado transporte COM"),
            }
        }
    }

    #[test]
    fn test_discover_fallback_to_mpt_ii() {
        let profile = Profile {
            name: "TECH CLA58".into(),
            transport: Transport {
                kind: "usb-printer-class".into(),
                vid: Some("9999".into()), // VID inexistente para simular USB desconectado
                pid: Some("9999".into()),
                port: None,
            },
            printable_width_dots: 384,
            baud: 9600,
            code_page: 3,
        };
        let res = discover(&profile);
        assert!(res.is_ok(), "Falha no fallback para MPT-II: {:?}", res);
        if let Ok(d) = res {
            match d.transport {
                ActiveTransport::Com {
                    port, is_bluetooth, ..
                } => {
                    assert_eq!(
                        port, "COM6",
                        "Deveria selecionar COM6 (MPT-II) e ignorar COM3 (caixa de som)"
                    );
                    assert!(is_bluetooth);
                }
                _ => panic!("Esperado fallback para Bluetooth na COM6"),
            }
        }
    }
}
