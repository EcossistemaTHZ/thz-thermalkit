#![cfg(windows)]

//! # thermal-probe (THZ ThermalKit CLI)
//!
//! Utilitário de linha de comando para Windows focado em diagnóstico, descoberta
//! e impressão direta em impressoras térmicas ESC/POS genéricas (58 mm / 80 mm).
//! Comunica-se diretamente via interface Win32 `usbprint.sys` ou porta serial COM,
//! sem necessidade de drivers de terceiros ou intermediação pelo spooler do Windows.

use image::{imageops::FilterType, DynamicImage, GrayImage, Luma};
use serde::{Deserialize, Serialize};
use std::{
    env,
    ffi::c_void,
    fs::{self, File, OpenOptions},
    io::{self, Write},
    mem,
    path::{Path, PathBuf},
    process::Command,
    ptr,
    time::Duration,
};

// ============================================================================
// Estruturas e Constantes da Windows SetupAPI
// ============================================================================

/// Representação C-compatível de um GUID (Globally Unique Identifier) do Windows.
#[derive(Clone, Copy)]
#[repr(C)]
struct Guid {
    a: u32,
    b: u16,
    c: u16,
    d: [u8; 8],
}

/// GUID de classe de dispositivo para impressoras USB (USBPRINT).
/// {28D78FAD-5A12-11D1-AE5B-00F803A8C2}
const USBPRINT: Guid = Guid {
    a: 0x28d78fad,
    b: 0x5a12,
    c: 0x11d1,
    d: [0xae, 0x5b, 0, 0, 0xf8, 0x03, 0xa8, 0xc2],
};

/// GUID de classe de dispositivo para portas seriais COM.
/// {86E0D1E0-8089-11D0-9CE4-083E301F73}
const COMPORT: Guid = Guid {
    a: 0x86e0d1e0,
    b: 0x8089,
    c: 0x11d0,
    d: [0x9c, 0xe4, 0x08, 0, 0x3e, 0x30, 0x1f, 0x73],
};

/// GUID para enumeração de dispositivos USB genéricos (apenas inventário).
/// {A5DCBF10-6530-11D2-901F-00C04FB951ED}
const USB_DEVICE: Guid = Guid {
    a: 0xa5dcbf10,
    b: 0x6530,
    c: 0x11d2,
    d: [0x90, 0x1f, 0, 0xc0, 0x4f, 0xb9, 0x51, 0xed],
};

/// Flag para listar apenas dispositivos presentes (DIGCF_PRESENT | DIGCF_DEVICEINTERFACE = 0x12).
const PRESENT_INTERFACE: u32 = 0x12;

/// Constante para a propriedade FriendlyName no registro do SetupAPI (SPDRP_FRIENDLYNAME).
const FRIENDLY_NAME: u32 = 12;

/// Constante para os IDs de Hardware no registro do SetupAPI (SPDRP_HARDWAREID).
const HARDWARE_ID: u32 = 1;

/// Constante para a Descrição do Dispositivo no registro do SetupAPI (SPDRP_DEVICEDESC).
const DEVICE_DESC: u32 = 0;

/// Estrutura de dados de interface de dispositivo (SP_DEVICE_INTERFACE_DATA).
#[repr(C)]
struct InterfaceData {
    size: u32,
    class: Guid,
    flags: u32,
    reserved: usize,
}

/// Estrutura de informações do dispositivo (SP_DEVINFO_DATA).
#[repr(C)]
struct DeviceData {
    size: u32,
    class: Guid,
    instance: u32,
    reserved: usize,
}

#[link(name = "setupapi")]
extern "system" {
    /// Retorna um handle para um conjunto de informações de dispositivos contendo interfaces solicitadas.
    fn SetupDiGetClassDevsW(
        class: *const Guid,
        enumerator: *const u16,
        parent: isize,
        flags: u32,
    ) -> isize;

    /// Enumera as interfaces de dispositivo contidas no conjunto de informações.
    fn SetupDiEnumDeviceInterfaces(
        set: isize,
        dev: *const DeviceData,
        class: *const Guid,
        index: u32,
        data: *mut InterfaceData,
    ) -> i32;

    /// Obtém detalhes de uma interface, incluindo o caminho de acesso ao dispositivo (DevicePath).
    fn SetupDiGetDeviceInterfaceDetailW(
        set: isize,
        interface: *const InterfaceData,
        detail: *mut c_void,
        size: u32,
        required: *mut u32,
        device: *mut DeviceData,
    ) -> i32;

    /// Recupera uma propriedade especificada do registro do dispositivo (como nome ou IDs de hardware).
    fn SetupDiGetDeviceRegistryPropertyW(
        set: isize,
        device: *const DeviceData,
        property: u32,
        kind: *mut u32,
        buffer: *mut u8,
        size: u32,
        required: *mut u32,
    ) -> i32;

    /// Recupera o identificador da instância do dispositivo (Device Instance ID).
    fn SetupDiGetDeviceInstanceIdW(
        set: isize,
        device: *const DeviceData,
        buffer: *mut u16,
        size: u32,
        required: *mut u32,
    ) -> i32;

    /// Libera o conjunto de informações de dispositivo alocado pelo `SetupDiGetClassDevsW`.
    fn SetupDiDestroyDeviceInfoList(set: isize) -> i32;
}

// ============================================================================
// Modelos de Domínio e Perfis de Impressora
// ============================================================================

/// Representa um dispositivo físico ou interface encontrada no sistema operacional.
#[derive(Clone)]
struct Device {
    /// Tipo de transporte ("USB Printer Class", "COM", ou "USB device (inventory only)").
    transport: &'static str,
    /// Nome amigável ou descrição do dispositivo.
    name: String,
    /// Caminho do dispositivo Win32 (usado para abrir o handle de escrita USB).
    path: String,
    /// ID de instância do dispositivo (ex.: USB\VID_6868&PID_0200\...).
    instance: String,
    /// IDs de hardware reportados pelo dispositivo.
    hardware: String,
    /// Nome da porta serial (ex.: "COM3"), se for interface serial.
    port: Option<String>,
}

/// Perfil de configuração persistente de impressora térmica serializado em JSON.
#[derive(Serialize, Deserialize)]
struct PrinterProfile {
    /// Identificador textual único do perfil (ex.: "generic-tech-cla58-raster").
    id: String,
    /// Nome da impressora configurada.
    name: String,
    /// Detalhes do transporte de conexão (USB ou COM).
    transport: TransportProfile,
    /// Protocolo de controle (padrão: "escpos").
    protocol: String,
    /// Modo de rasterização gráfica suportado (padrão: "gs-v-0").
    raster_mode: String,
    /// Largura útil de impressão em dots (ex.: 384 para bobinas de 58 mm).
    printable_width_dots: u32,
    /// Taxa de transmissão para conexões seriais COM (padrão: 9600).
    #[serde(default = "default_baud")]
    baud: u32,
    /// Tabela de caracteres / code page ESC/POS (padrão: 3 para CP860).
    #[serde(default = "default_code_page")]
    code_page: u8,
}

/// Configurações específicas de transporte dentro do perfil.
#[derive(Serialize, Deserialize)]
struct TransportProfile {
    /// Tipo de transporte: "usb-printer-class" ou "com".
    #[serde(rename = "type")]
    kind: String,
    /// Vendor ID (VID) USB em hexadecimal de 4 dígitos.
    vid: Option<String>,
    /// Product ID (PID) USB em hexadecimal de 4 dígitos.
    pid: Option<String>,
    /// Nome da porta serial COM (opcional).
    port: Option<String>,
}

fn default_baud() -> u32 {
    9600
}

fn default_code_page() -> u8 {
    3
}

// ============================================================================
// Utilitários de Conversão e Descoberta Win32
// ============================================================================

/// Converte uma fatia de caracteres UTF-16 nulos-terminados (Wide String do Windows) em `String`.
fn wide_z(data: &[u16]) -> String {
    String::from_utf16_lossy(&data[..data.iter().position(|&x| x == 0).unwrap_or(data.len())])
}

/// Recupera uma propriedade de registro do dispositivo via SetupAPI.
unsafe fn property(set: isize, dev: &DeviceData, key: u32) -> String {
    let mut bytes = [0u8; 4096];
    let mut kind = 0;
    let mut required = 0;
    if SetupDiGetDeviceRegistryPropertyW(
        set,
        dev,
        key,
        &mut kind,
        bytes.as_mut_ptr(),
        bytes.len() as u32,
        &mut required,
    ) == 0
    {
        return String::new();
    }
    wide_z(std::slice::from_raw_parts(
        bytes.as_ptr() as *const u16,
        (required as usize / 2).min(bytes.len() / 2),
    ))
}

/// Tenta extrair a porta serial (ex.: "COM3") a partir do nome amigável do dispositivo.
fn com_from_name(name: &str) -> Option<String> {
    let start = name.rfind("(COM")? + 1;
    let end = name[start..].find(')')? + start;
    let port = &name[start..end];
    (port.len() > 3 && port[3..].chars().all(|c| c.is_ascii_digit())).then(|| port.to_string())
}

/// Enumera todas as interfaces correspondentes a uma classe GUID fornecida via SetupAPI.
fn enumerate(class: &Guid, transport: &'static str) -> io::Result<Vec<Device>> {
    let mut found = Vec::new();
    unsafe {
        let set = SetupDiGetClassDevsW(class, ptr::null(), 0, PRESENT_INTERFACE);
        if set == -1 {
            return Err(io::Error::last_os_error());
        }
        let mut index = 0;
        loop {
            let mut iface = InterfaceData {
                size: mem::size_of::<InterfaceData>() as u32,
                class: *class,
                flags: 0,
                reserved: 0,
            };
            if SetupDiEnumDeviceInterfaces(set, ptr::null(), class, index, &mut iface) == 0 {
                break;
            }
            index += 1;

            // Primeira chamada para obter o tamanho necessário do buffer
            let mut required = 0;
            SetupDiGetDeviceInterfaceDetailW(
                set,
                &iface,
                ptr::null_mut(),
                0,
                &mut required,
                ptr::null_mut(),
            );
            if !(6..=65536).contains(&required) {
                continue;
            }

            // Aloca buffer alinhado para SP_DEVICE_INTERFACE_DETAIL_DATA_W
            let mut detail = vec![0u64; (required as usize).div_ceil(8)];
            let raw = detail.as_mut_ptr() as *mut u8;
            // cbSize deve ser 8 bytes em x64 e 6 bytes (ou 5/6 empacotado) em x86
            *(raw as *mut u32) = if cfg!(target_pointer_width = "64") {
                8
            } else {
                6
            };

            let mut dev = DeviceData {
                size: mem::size_of::<DeviceData>() as u32,
                class: *class,
                instance: 0,
                reserved: 0,
            };

            // Segunda chamada para obter o caminho do dispositivo e devinfo
            if SetupDiGetDeviceInterfaceDetailW(
                set,
                &iface,
                raw.cast(),
                required,
                &mut required,
                &mut dev,
            ) == 0
            {
                continue;
            }

            let path = wide_z(std::slice::from_raw_parts(
                raw.add(4) as *const u16,
                (required as usize - 4) / 2,
            ));

            let mut instance_buf = [0u16; 1024];
            let mut used = 0;
            let instance = if SetupDiGetDeviceInstanceIdW(
                set,
                &dev,
                instance_buf.as_mut_ptr(),
                instance_buf.len() as u32,
                &mut used,
            ) != 0
            {
                wide_z(&instance_buf)
            } else {
                String::new()
            };

            let n = property(set, &dev, FRIENDLY_NAME);
            let name = if n.is_empty() {
                property(set, &dev, DEVICE_DESC)
            } else {
                n
            };

            let hardware = property(set, &dev, HARDWARE_ID);
            let port = if transport == "COM" {
                com_from_name(&name)
            } else {
                None
            };

            let is_bt = transport == "COM"
                && (hardware.to_ascii_uppercase().contains("BTHENUM")
                    || hardware.to_ascii_uppercase().contains("BTH\\")
                    || instance.to_ascii_uppercase().contains("BTHENUM")
                    || name.to_ascii_uppercase().contains("BLUETOOTH"));
            let resolved_transport = if is_bt { "Bluetooth (COM)" } else { transport };

            found.push(Device {
                transport: resolved_transport,
                name,
                path,
                instance,
                hardware,
                port,
            });
        }
        SetupDiDestroyDeviceInfoList(set);
    }
    Ok(found)
}

/// Localiza e retorna todos os dispositivos suportados (USBPRINT, COM e inventário USB).
fn all_devices() -> Vec<Device> {
    let mut out = Vec::new();
    for (class, label) in [
        (USBPRINT, "USB Printer Class"),
        (COMPORT, "COM"),
        (USB_DEVICE, "USB device (inventory only)"),
    ] {
        match enumerate(&class, label) {
            Ok(v) => out.extend(v),
            Err(e) => eprintln!("Could not enumerate {label}: {e}"),
        }
    }
    out
}

/// Extrai uma substring hexadecimal de 4 dígitos precedida por uma tag (como "VID_" ou "PID_").
fn field(text: &str, tag: &str) -> Option<String> {
    let text = text.to_ascii_uppercase();
    let start = text.find(tag)? + tag.len();
    let value: String = text[start..]
        .chars()
        .take_while(|c| c.is_ascii_hexdigit())
        .take(4)
        .collect();
    (value.len() == 4).then_some(value)
}

/// Extrai o Vendor ID (VID) e Product ID (PID) do identificador do dispositivo.
fn vid_pid(d: &Device) -> (Option<String>, Option<String>) {
    let ids = format!("{} {} {}", d.instance, d.hardware, d.path);
    (field(&ids, "VID_"), field(&ids, "PID_"))
}

/// Imprime no terminal a lista formatada de interfaces detectadas.
fn print_devices(devices: &[Device]) {
    println!("Connected interfaces: {}", devices.len());
    for (i, d) in devices.iter().enumerate() {
        let (vid, pid) = vid_pid(d);
        println!(
            "\n[{}] {} — {}\n    VID/PID: {}:{}\n    Path: {}",
            i + 1,
            d.transport,
            d.name,
            vid.as_deref().unwrap_or("—"),
            pid.as_deref().unwrap_or("—"),
            d.path
        );
        if let Some(port) = &d.port {
            println!("    Port: {port}");
        }
    }
}

/// Indica se o dispositivo possui transporte que suporta escrita direta de impressão.
fn printable(d: &Device) -> bool {
    d.transport == "USB Printer Class" || (d.transport.contains("COM") && d.port.is_some())
}

/// Solicita ao operador a seleção de um dispositivo da lista ou utiliza o índice fornecido.
fn choose_device(
    devices: &[Device],
    supplied: Option<usize>,
) -> Result<Device, Box<dyn std::error::Error>> {
    let index = if let Some(n) = supplied {
        n.checked_sub(1).ok_or("device number starts at 1")?
    } else {
        print!("Select device number (Enter to quit): ");
        io::stdout().flush()?;
        let mut a = String::new();
        io::stdin().read_line(&mut a)?;
        match a.trim().parse::<usize>() {
            Ok(n) => n.checked_sub(1).ok_or("device number starts at 1")?,
            Err(_) => return Err("cancelled".into()),
        }
    };
    let d = devices.get(index).ok_or("invalid device number")?.clone();
    if !printable(&d) {
        return Err(
            "selected device has no direct USB Printer Class or COM/Bluetooth transport".into(),
        );
    }
    Ok(d)
}

/// Solicita confirmação explícita digitando "PRINT" antes de enviar dados físicos.
fn confirm(device: &Device, description: &str) -> io::Result<bool> {
    println!(
        "\nSelected: {} | {} | {}",
        device.name,
        device.transport,
        device.port.as_deref().unwrap_or(&device.path)
    );
    println!(
        "Will print {description}. No cutter, cash drawer, or configuration commands are sent."
    );
    print!("Type PRINT to confirm physical printing: ");
    io::stdout().flush()?;
    let mut a = String::new();
    io::stdin().read_line(&mut a)?;
    Ok(a.trim() == "PRINT")
}

/// Envia bytes para o dispositivo via porta serial COM ou abertura direta do caminho USB.
fn write_to(device: &Device, baud: u32, bytes: &[u8]) -> io::Result<()> {
    if let Some(port) = &device.port {
        let mut s = serialport::new(port, baud)
            .timeout(Duration::from_secs(10))
            .open()
            .map_err(io::Error::other)?;
        s.write_all(bytes)?;
        s.flush()?;
    } else {
        let mut s = OpenOptions::new().write(true).open(&device.path)?;
        s.write_all(bytes)?;
        s.flush()?;
    }
    Ok(())
}

// ============================================================================
// Geração e Mapeamento de Comandos ESC/POS
// ============================================================================

/// Converte uma imagem em escala de cinza no comando ESC/POS raster bitonal `GS v 0`.
///
/// Estrutura do comando:
/// `0x1D 0x76 0x30 0x00 xL xH yL yH [dados...]`
/// - xL, xH: Largura em bytes (width / 8).
/// - yL, yH: Altura em pixels.
fn gs_v0(image: &GrayImage) -> Result<Vec<u8>, Box<dyn std::error::Error>> {
    let (width, height) = image.dimensions();
    let bytes_per_row = width.div_ceil(8);
    if bytes_per_row > u16::MAX as u32 || height > u16::MAX as u32 {
        return Err("image is too large for a single ESC/POS raster command".into());
    }
    let mut out = vec![
        0x1d,
        b'v',
        b'0',
        0,
        bytes_per_row as u8,
        (bytes_per_row >> 8) as u8,
        height as u8,
        (height >> 8) as u8,
    ];
    for y in 0..height {
        for xbyte in 0..bytes_per_row {
            let mut b = 0;
            for bit in 0..8 {
                let x = xbyte * 8 + bit;
                // Pixels com luminosidade abaixo de 180 são considerados pretos (bits ativados)
                if x < width && image.get_pixel(x, y)[0] < 180 {
                    b |= 0x80 >> bit;
                }
            }
            out.push(b);
        }
    }
    Ok(out)
}

/// Redimensiona uma imagem dinâmica para a largura útil do perfil e gera o payload raster.
fn image_payload(img: DynamicImage, width: u32) -> Result<Vec<u8>, Box<dyn std::error::Error>> {
    if width == 0 || width > 4096 {
        return Err("profile width must be between 1 and 4096 dots".into());
    }
    let gray = img.to_luma8();
    let target = if gray.width() > width {
        image::imageops::resize(
            &gray,
            width,
            (gray.height().saturating_mul(width) / gray.width()).max(1),
            FilterType::Lanczos3,
        )
    } else {
        gray
    };
    let mut out = vec![0x1b, b'@']; // ESC @ (Reset de sessão)
    out.extend(gs_v0(&target)?);
    out.extend_from_slice(b"\n\n");
    Ok(out)
}

/// Gera payload de teste de diagnóstico com texto ASCII e um quadrado raster 16x16.
fn probe_payload() -> Vec<u8> {
    let mut out = vec![0x1b, b'@'];
    out.extend_from_slice(b"THERMAL PROBE\nASCII OK 0123456789\n\n");
    let mut square = GrayImage::from_pixel(16, 16, Luma([255]));
    for p in 0..16 {
        square.put_pixel(p, 0, Luma([0]));
        square.put_pixel(p, 15, Luma([0]));
        square.put_pixel(0, p, Luma([0]));
        square.put_pixel(15, p, Luma([0]));
    }
    out.extend(gs_v0(&square).expect("fixed raster"));
    out.extend_from_slice(b"\n\n");
    out
}

/// Converte texto em bytes compatíveis com a tabela Code Page 860 (Português).
/// Caracteres ASCII são mantidos inalterados; acentos do português são traduzidos
/// para seus códigos CP860, e caracteres desconhecidos são substituídos por '?'.
fn text_bytes(text: &str) -> Vec<u8> {
    text.chars()
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

/// Gera payload de teste para verificação da acentuação na CP860 (`ESC t 3`).
fn charset_payload() -> Vec<u8> {
    let sample = "Português: Olá, ação, órgão, café\n";
    let mut out = vec![0x1b, b'@'];
    out.extend_from_slice(b"CP860 (ESC t 3)\n");
    out.extend_from_slice(&[0x1b, b't', 3]); // ESC t 3 -> Seleciona tabela CP860
    out.extend(text_bytes(sample));
    out.push(b'\n');
    out
}

/// Gera uma régua milimétrica graduada em raster para aferir a largura útil da bobina.
fn width_payload(width: u32) -> Result<Vec<u8>, Box<dyn std::error::Error>> {
    let h = 72;
    let mut ruler = GrayImage::from_pixel(width, h, Luma([255]));
    for x in 0..width {
        ruler.put_pixel(x, 0, Luma([0]));
        ruler.put_pixel(x, h - 1, Luma([0]));
        if x % 8 == 0 {
            for y in 0..if x % 64 == 0 { 36 } else { 18 } {
                ruler.put_pixel(x, y, Luma([0]));
            }
        }
    }
    for y in 0..h {
        ruler.put_pixel(0, y, Luma([0]));
        ruler.put_pixel(width - 1, y, Luma([0]));
    }
    let mut out = vec![0x1b, b'@'];
    out.extend_from_slice(
        format!("WIDTH TEST: {width} dots\nEach small mark = 8 dots\n").as_bytes(),
    );
    out.extend(gs_v0(&ruler)?);
    out.extend_from_slice(b"\n\n");
    Ok(out)
}

// ============================================================================
// Manipulação de Perfis e Argumentos CLI
// ============================================================================

/// Extrai o valor de uma flag de string da lista de argumentos (ex.: `--profile path`).
fn option_string(args: &[String], flag: &str) -> Option<String> {
    args.iter()
        .position(|a| a == flag)
        .and_then(|i| args.get(i + 1))
        .cloned()
}

/// Extrai o valor de uma flag numérica da lista de argumentos (ex.: `--width 384`).
fn option_usize(args: &[String], flag: &str) -> Option<usize> {
    option_string(args, flag).and_then(|v| v.parse().ok())
}

/// Carrega e desserializa um perfil de impressora a partir de um arquivo JSON.
fn load_profile(path: &Path) -> Result<PrinterProfile, Box<dyn std::error::Error>> {
    Ok(serde_json::from_reader(File::open(path)?)?)
}

/// Procura entre os dispositivos conectados aquele que coincide com os critérios do perfil (VID/PID/Porta).
fn device_for_profile(
    p: &PrinterProfile,
    ds: &[Device],
) -> Result<Device, Box<dyn std::error::Error>> {
    ds.iter()
        .find(|d| {
            let (v, pid) = vid_pid(d);
            let is_usb =
                p.transport.kind == "usb-printer-class" && d.transport == "USB Printer Class";
            let is_com = (p.transport.kind == "com"
                || p.transport.kind == "bluetooth"
                || p.transport.kind == "bluetooth-spp")
                && d.transport.contains("COM");
            (is_usb || is_com)
                && p.transport
                    .vid
                    .as_ref()
                    .is_none_or(|x| v.as_ref().is_some_and(|a| a.eq_ignore_ascii_case(x)))
                && p.transport
                    .pid
                    .as_ref()
                    .is_none_or(|x| pid.as_ref().is_some_and(|a| a.eq_ignore_ascii_case(x)))
                && p.transport
                    .port
                    .as_ref()
                    .is_none_or(|x| d.port.as_ref().is_some_and(|a| a.eq_ignore_ascii_case(x)))
        })
        .cloned()
        .ok_or_else(|| "no connected device matches this profile".into())
}

/// Sanitiza um nome para uso seguro em caminhos de arquivos do sistema operacional.
fn safe_name(name: &str) -> String {
    name.to_lowercase()
        .chars()
        .map(|c| if c.is_ascii_alphanumeric() { c } else { '-' })
        .collect()
}

/// Cria interativamente e salva um novo arquivo de perfil JSON a partir de um dispositivo conectado.
fn create_profile(ds: &[Device], args: &[String]) -> Result<(), Box<dyn std::error::Error>> {
    let d = choose_device(ds, option_usize(args, "--device"))?;
    let width = option_usize(args, "--width").unwrap_or(384) as u32;
    let (vid, pid) = vid_pid(&d);
    let output = option_string(args, "--output").unwrap_or_else(|| {
        format!(
            "profiles/{}-{}.json",
            safe_name(&d.name),
            vid.clone().unwrap_or_else(|| "device".into())
        )
    });
    let p = PrinterProfile {
        id: option_string(args, "--id")
            .unwrap_or_else(|| format!("generic-{}-raster", safe_name(&d.name))),
        name: d.name.clone(),
        transport: TransportProfile {
            kind: if d.transport.contains("COM") {
                if d.transport.starts_with("Bluetooth") {
                    "bluetooth".into()
                } else {
                    "com".into()
                }
            } else {
                "usb-printer-class".into()
            },
            vid,
            pid,
            port: d.port,
        },
        protocol: "escpos".into(),
        raster_mode: "gs-v-0".into(),
        printable_width_dots: width,
        baud: option_usize(args, "--baud").unwrap_or(9600) as u32,
        code_page: option_usize(args, "--code-page").unwrap_or(3) as u8,
    };
    let path = PathBuf::from(output);
    if let Some(parent) = path.parent().filter(|p| !p.as_os_str().is_empty()) {
        fs::create_dir_all(parent)?;
    }
    serde_json::to_writer_pretty(File::create(&path)?, &p)?;
    println!("Saved profile: {}", path.display());
    Ok(())
}

/// Executa um trabalho de impressão (texto, imagem ou PDF) utilizando o perfil especificado.
fn print_job(
    profile_path: &Path,
    input: &Path,
    kind: &str,
) -> Result<(), Box<dyn std::error::Error>> {
    let p = load_profile(profile_path)?;
    let d = device_for_profile(&p, &all_devices())?;

    // Impressão de arquivo de texto simples
    if kind == "text" {
        let text = fs::read_to_string(input)?;
        let text = text
            .strip_prefix('\u{feff}')
            .unwrap_or(&text)
            .replace('\r', "");
        let mut bytes = vec![0x1b, b'@', 0x1b, b't', p.code_page];
        bytes.extend(text_bytes(&text));
        if !bytes.ends_with(b"\n") {
            bytes.push(b'\n');
        }
        if confirm(
            &d,
            &format!("the text file using ESC/POS code page {}", p.code_page),
        )? {
            write_to(&d, p.baud, &bytes)?;
            println!("Text sent.");
        } else {
            println!("Cancelled; no data sent.");
        }
        return Ok(());
    }

    // Impressão gráfica (imagem ou páginas renderizadas de PDF)
    let mut pages = Vec::new();
    if kind == "image" {
        pages.push(image::open(input)?);
    } else {
        // Renderização de PDF invocando o pdftoppm (Poppler for Windows) a 203 DPI
        let prefix = env::temp_dir().join(format!("thermal-probe-{}", std::process::id()));
        let s = Command::new("pdftoppm")
            .args([
                "-png",
                "-r",
                "203",
                input.to_str().ok_or("PDF path is not valid UTF-8")?,
                prefix.to_str().ok_or("temporary path is not valid UTF-8")?,
            ])
            .status();
        match s {
            Ok(x) if x.success() => {}
            Ok(_) => return Err("pdftoppm could not render the PDF".into()),
            Err(_) => {
                return Err(
                    "PDF printing requires pdftoppm from Poppler in PATH. Install Poppler for Windows, then run again.".into()
                )
            }
        }
        let parent = prefix.parent().ok_or("missing temporary directory")?;
        let stem = prefix
            .file_name()
            .ok_or("missing temporary name")?
            .to_string_lossy()
            .to_string();
        let mut files: Vec<PathBuf> = fs::read_dir(parent)?
            .filter_map(Result::ok)
            .map(|e| e.path())
            .filter(|f| {
                f.file_name()
                    .is_some_and(|n| n.to_string_lossy().starts_with(&stem))
                    && f.extension().is_some_and(|e| e.eq_ignore_ascii_case("png"))
            })
            .collect();
        files.sort();
        for f in files {
            pages.push(image::open(f)?);
        }
        if pages.is_empty() {
            return Err("PDF renderer produced no pages".into());
        }
    }

    let payloads: Result<Vec<_>, _> = pages
        .into_iter()
        .map(|x| image_payload(x, p.printable_width_dots))
        .collect();
    let payloads = payloads?;
    if confirm(
        &d,
        &format!(
            "{} {} page(s) at {} dots wide",
            kind,
            payloads.len(),
            p.printable_width_dots
        ),
    )? {
        for bytes in payloads {
            write_to(&d, p.baud, &bytes)?;
        }
        println!("Print job sent.");
    } else {
        println!("Cancelled; no data sent.");
    }
    Ok(())
}

/// Exibe o menu de ajuda com a lista de comandos e opções da CLI.
fn help() {
    println!(
        "thermal-probe — direct ESC/POS thermal printing for Windows\n\n\
Commands:\n  \
  discover\n  \
  probe [--device N] [--baud N]\n  \
  width-test [--device N] [--width 384] [--baud N]\n  \
  charset-test [--device N] [--baud N]\n  \
  profile create [--device N] [--width 384] [--code-page 3] [--output profiles/name.json]\n  \
  print-text --profile profiles/name.json receipt.txt\n  \
  print-image --profile profiles/name.json picture.png\n  \
  print-pdf --profile profiles/name.json document.pdf\n\n\
Every command that sends print data asks you to type PRINT. No cut or drawer commands are implemented."
    );
}

// ============================================================================
// Ponto de Entrada da Linha de Comando (CLI Entrypoint)
// ============================================================================

fn main() -> Result<(), Box<dyn std::error::Error>> {
    let args: Vec<String> = env::args().skip(1).collect();
    let command = args.first().map(String::as_str).unwrap_or("probe");

    if matches!(command, "--help" | "-h" | "help") {
        help();
        return Ok(());
    }

    let ds = all_devices();

    if command == "charset-test" {
        print_devices(&ds);
        let d = choose_device(&ds, option_usize(&args, "--device"))?;
        let b = option_usize(&args, "--baud").unwrap_or(9600) as u32;
        if confirm(&d, "the ESC/POS character-set sample")? {
            write_to(&d, b, &charset_payload())?;
            println!("Character-set test sent.");
        } else {
            println!("Cancelled; no data sent.");
        }
        return Ok(());
    }

    match command {
        "discover" => {
            print_devices(&ds);
            Ok(())
        }
        "probe" => {
            print_devices(&ds);
            let d = choose_device(&ds, option_usize(&args, "--device"))?;
            let baud = option_usize(&args, "--baud").unwrap_or(9600) as u32;
            if confirm(
                &d,
                "ESC @, ASCII text, line feeds, and a 16x16 raster square",
            )? {
                write_to(&d, baud, &probe_payload())?;
                println!("Test data sent.");
            } else {
                println!("Cancelled; no data sent.");
            }
            Ok(())
        }
        "width-test" => {
            print_devices(&ds);
            let d = choose_device(&ds, option_usize(&args, "--device"))?;
            let w = option_usize(&args, "--width").unwrap_or(384) as u32;
            let b = option_usize(&args, "--baud").unwrap_or(9600) as u32;
            if confirm(&d, &format!("a {w}-dot width ruler"))? {
                write_to(&d, b, &width_payload(w)?)?;
                println!("Width test sent.");
            } else {
                println!("Cancelled; no data sent.");
            }
            Ok(())
        }
        "profile" if args.get(1).is_some_and(|a| a == "create") => create_profile(&ds, &args),
        "print-text" | "print-image" | "print-pdf" => {
            let pp = option_string(&args, "--profile").ok_or("missing --profile path")?;
            let input = args
                .iter()
                .rev()
                .find(|a| {
                    !a.starts_with("--") && a.as_str() != command && a.as_str() != pp.as_str()
                })
                .ok_or("missing input file")?;
            print_job(Path::new(&pp), Path::new(input.as_str()), &command[6..])
        }
        _ => {
            help();
            Err("unknown command".into())
        }
    }
}
