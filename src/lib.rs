#![cfg(windows)]

//! # thermal-core
//!
//! Biblioteca central de comunicação e protocolo do ecossistema THZ ThermalKit.
//! Fornece descoberta de dispositivos Win32 (USB e Bluetooth SPP), manipulação
//! de perfis JSON e codificação de comandos ESC/POS (texto CP860, imagens raster `GS v 0`).

use image::{imageops::FilterType, DynamicImage, GrayImage, Luma};
use serde::{Deserialize, Serialize};
use std::{
    ffi::c_void,
    fs::OpenOptions,
    io::{self, Write},
    mem, ptr,
    time::Duration,
};

// ============================================================================
// Estruturas e Constantes da Windows SetupAPI
// ============================================================================

#[derive(Clone, Copy)]
#[repr(C)]
pub struct Guid {
    pub a: u32,
    pub b: u16,
    pub c: u16,
    pub d: [u8; 8],
}

pub const USBPRINT: Guid = Guid {
    a: 0x28d78fad,
    b: 0x5a12,
    c: 0x11d1,
    d: [0xae, 0x5b, 0, 0, 0xf8, 0x03, 0xa8, 0xc2],
};

pub const COMPORT: Guid = Guid {
    a: 0x86e0d1e0,
    b: 0x8089,
    c: 0x11d0,
    d: [0x9c, 0xe4, 0x08, 0, 0x3e, 0x30, 0x1f, 0x73],
};

pub const USB_DEVICE: Guid = Guid {
    a: 0xa5dcbf10,
    b: 0x6530,
    c: 0x11d2,
    d: [0x90, 0x1f, 0, 0xc0, 0x4f, 0xb9, 0x51, 0xed],
};

pub const PRESENT_INTERFACE: u32 = 0x12;
pub const FRIENDLY_NAME: u32 = 12;
pub const HARDWARE_ID: u32 = 1;
pub const DEVICE_DESC: u32 = 0;

#[repr(C)]
pub struct InterfaceData {
    pub size: u32,
    pub class: Guid,
    pub flags: u32,
    pub reserved: usize,
}

#[repr(C)]
pub struct DeviceData {
    pub size: u32,
    pub class: Guid,
    pub instance: u32,
    pub reserved: usize,
}

#[link(name = "setupapi")]
extern "system" {
    pub fn SetupDiGetClassDevsW(
        class: *const Guid,
        enumerator: *const u16,
        parent: isize,
        flags: u32,
    ) -> isize;
    pub fn SetupDiEnumDeviceInterfaces(
        set: isize,
        dev: *const DeviceData,
        class: *const Guid,
        index: u32,
        data: *mut InterfaceData,
    ) -> i32;
    pub fn SetupDiGetDeviceInterfaceDetailW(
        set: isize,
        interface: *const InterfaceData,
        detail: *mut c_void,
        size: u32,
        required: *mut u32,
        device: *mut DeviceData,
    ) -> i32;
    pub fn SetupDiGetDeviceRegistryPropertyW(
        set: isize,
        device: *const DeviceData,
        property: u32,
        kind: *mut u32,
        buffer: *mut u8,
        size: u32,
        required: *mut u32,
    ) -> i32;
    pub fn SetupDiGetDeviceInstanceIdW(
        set: isize,
        device: *const DeviceData,
        buffer: *mut u16,
        size: u32,
        required: *mut u32,
    ) -> i32;
    pub fn SetupDiDestroyDeviceInfoList(set: isize) -> i32;
}

// ============================================================================
// Modelos de Dispositivos e Perfis
// ============================================================================

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct Device {
    pub transport: String,
    pub name: String,
    pub path: String,
    pub instance: String,
    pub hardware: String,
    pub port: Option<String>,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub enum ActiveTransport {
    Usb(String),
    Com {
        port: String,
        baud: u32,
        is_bluetooth: bool,
    },
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct DiscoveredPrinter {
    pub name: String,
    pub transport: ActiveTransport,
    pub display_info: String,
    pub is_bluetooth: bool,
    pub port: Option<String>,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct PrinterProfile {
    pub id: String,
    pub name: String,
    pub transport: TransportProfile,
    pub protocol: String,
    pub raster_mode: String,
    pub printable_width_dots: u32,
    #[serde(default = "default_baud")]
    pub baud: u32,
    #[serde(default = "default_code_page")]
    pub code_page: u8,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct TransportProfile {
    #[serde(rename = "type")]
    pub kind: String,
    pub vid: Option<String>,
    pub pid: Option<String>,
    pub port: Option<String>,
}

pub fn default_baud() -> u32 {
    9600
}

pub fn default_code_page() -> u8 {
    3
}

// ============================================================================
// Utilitários de Descoberta Win32
// ============================================================================

pub fn wide_z(data: &[u16]) -> String {
    String::from_utf16_lossy(&data[..data.iter().position(|&x| x == 0).unwrap_or(data.len())])
}

pub unsafe fn property(set: isize, dev: &DeviceData, key: u32) -> String {
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

pub fn com_from_name(name: &str) -> Option<String> {
    let start = name.rfind("(COM")? + 1;
    let end = name[start..].find(')')? + start;
    let port = &name[start..end];
    (port.len() > 3 && port[3..].chars().all(|c| c.is_ascii_digit())).then(|| port.to_string())
}

pub fn field(text: &str, tag: &str) -> Option<String> {
    let text = text.to_ascii_uppercase();
    let start = text.find(tag)? + tag.len();
    let value: String = text[start..]
        .chars()
        .take_while(|c| c.is_ascii_hexdigit())
        .take(4)
        .collect();
    (value.len() == 4).then_some(value)
}

pub fn vid_pid(d: &Device) -> (Option<String>, Option<String>) {
    let ids = format!("{} {} {}", d.instance, d.hardware, d.path);
    (field(&ids, "VID_"), field(&ids, "PID_"))
}

pub fn enumerate(class: &Guid, base_transport: &'static str) -> io::Result<Vec<Device>> {
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

            let mut detail = vec![0u64; (required as usize).div_ceil(8)];
            let raw = detail.as_mut_ptr() as *mut u8;
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
            let port = if base_transport == "COM" {
                com_from_name(&name)
            } else {
                None
            };

            let is_bt = base_transport == "COM"
                && (hardware.to_ascii_uppercase().contains("BTHENUM")
                    || hardware.to_ascii_uppercase().contains("BTH\\")
                    || path.to_ascii_uppercase().contains("BTHENUM")
                    || instance.to_ascii_uppercase().contains("BTHENUM")
                    || name.to_ascii_uppercase().contains("BLUETOOTH"));

            let transport = if is_bt {
                "Bluetooth (COM)".to_string()
            } else {
                base_transport.to_string()
            };

            found.push(Device {
                transport,
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

pub fn all_devices() -> Vec<Device> {
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

pub fn discover_printers() -> Vec<DiscoveredPrinter> {
    let devices = all_devices();
    let mut printers = Vec::new();

    for d in devices {
        if d.transport == "USB Printer Class" {
            printers.push(DiscoveredPrinter {
                name: d.name.clone(),
                transport: ActiveTransport::Usb(d.path.clone()),
                display_info: format!("USB: {}", d.name),
                is_bluetooth: false,
                port: None,
            });
        } else if d.transport.contains("COM") {
            let is_bt = d.transport.starts_with("Bluetooth");
            let name_upper = d.name.to_ascii_uppercase();
            let hw_upper = d.hardware.to_ascii_uppercase();
            let path_upper = d.path.to_ascii_uppercase();

            // Identifica se é dispositivo de impressão térmica
            let is_printer = name_upper.contains("MPT")
                || name_upper.contains("CLA58")
                || name_upper.contains("POS")
                || name_upper.contains("PRINTER")
                || path_upper.contains("DC0D51597B0C")
                || hw_upper.contains("DC0D51597B0C");

            if let Some(port_name) = d.port.clone() {
                if is_bt && is_printer {
                    let clean_name = if !name_upper.contains("SERIAL PADR") {
                        d.name.clone()
                    } else {
                        "TECH CLA58 / MPT-II".to_string()
                    };
                    printers.push(DiscoveredPrinter {
                        name: clean_name.clone(),
                        transport: ActiveTransport::Com {
                            port: port_name.clone(),
                            baud: 9600,
                            is_bluetooth: true,
                        },
                        display_info: format!("Bluetooth: {clean_name} ({port_name})"),
                        is_bluetooth: true,
                        port: Some(port_name),
                    });
                } else if !is_bt {
                    printers.push(DiscoveredPrinter {
                        name: d.name.clone(),
                        transport: ActiveTransport::Com {
                            port: port_name.clone(),
                            baud: 9600,
                            is_bluetooth: false,
                        },
                        display_info: format!("Serial COM: {} ({port_name})", d.name),
                        is_bluetooth: false,
                        port: Some(port_name),
                    });
                }
            }
        }
    }
    printers
}

// ============================================================================
// Codificação e Protocolo ESC/POS
// ============================================================================

pub fn gs_v0(image: &GrayImage) -> Result<Vec<u8>, Box<dyn std::error::Error>> {
    let (width, height) = image.dimensions();
    let bytes_per_row = (width as usize).div_ceil(8);
    if bytes_per_row > u16::MAX as usize || height > u16::MAX as u32 {
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
                let x = (xbyte * 8 + bit) as u32;
                if x < width && image.get_pixel(x, y)[0] < 180 {
                    b |= 0x80 >> bit;
                }
            }
            out.push(b);
        }
    }
    Ok(out)
}

pub fn normalize_image(img: &GrayImage, width: u32) -> GrayImage {
    if img.width() == width {
        return img.clone();
    }
    let height = (img.height().saturating_mul(width) / img.width()).max(1);
    image::imageops::resize(img, width, height, FilterType::Lanczos3)
}

pub fn image_payload(img: DynamicImage, width: u32) -> Result<Vec<u8>, Box<dyn std::error::Error>> {
    if width == 0 || width > 4096 {
        return Err("profile width must be between 1 and 4096 dots".into());
    }
    let gray = img.to_luma8();
    let target = normalize_image(&gray, width);
    let mut out = vec![0x1b, b'@'];
    out.extend(gs_v0(&target)?);
    out.extend_from_slice(b"\n\n");
    Ok(out)
}

pub fn text_bytes(text: &str) -> Vec<u8> {
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

pub fn probe_payload() -> Vec<u8> {
    let mut out = vec![0x1b, b'@'];
    out.extend_from_slice(b"THZ THERMALKIT\nDirect ESC/POS Driverless OK\n0123456789\n\n");
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

pub fn write_payload(transport: &ActiveTransport, bytes: &[u8]) -> io::Result<()> {
    match transport {
        ActiveTransport::Usb(path) => {
            let mut file = OpenOptions::new().write(true).open(path)?;
            file.write_all(bytes)?;
            file.flush()
        }
        ActiveTransport::Com { port, baud, .. } => {
            let mut port = serialport::new(port, *baud)
                .timeout(Duration::from_secs(10))
                .open()
                .map_err(io::Error::other)?;
            port.write_all(bytes)?;
            port.flush()
        }
    }
}
