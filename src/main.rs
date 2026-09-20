#![cfg(windows)]

use std::{
    env,
    ffi::c_void,
    fs::OpenOptions,
    io::{self, Write},
    mem, ptr,
    time::Duration,
};

#[derive(Clone, Copy)]
#[repr(C)]
struct Guid {
    a: u32,
    b: u16,
    c: u16,
    d: [u8; 8],
}
const USBPRINT: Guid = Guid {
    a: 0x28d78fad,
    b: 0x5a12,
    c: 0x11d1,
    d: [0xae, 0x5b, 0, 0, 0xf8, 0x03, 0xa8, 0xc2],
};
const COMPORT: Guid = Guid {
    a: 0x86e0d1e0,
    b: 0x8089,
    c: 0x11d0,
    d: [0x9c, 0xe4, 0x08, 0, 0x3e, 0x30, 0x1f, 0x73],
};
const USB_DEVICE: Guid = Guid {
    a: 0xa5dcbf10,
    b: 0x6530,
    c: 0x11d2,
    d: [0x90, 0x1f, 0, 0xc0, 0x4f, 0xb9, 0x51, 0xed],
};
const PRESENT_INTERFACE: u32 = 0x12;
const FRIENDLY_NAME: u32 = 12;
const HARDWARE_ID: u32 = 1;
const DEVICE_DESC: u32 = 0;

#[repr(C)]
struct InterfaceData {
    size: u32,
    class: Guid,
    flags: u32,
    reserved: usize,
}
#[repr(C)]
struct DeviceData {
    size: u32,
    class: Guid,
    instance: u32,
    reserved: usize,
}

#[link(name = "setupapi")]
extern "system" {
    fn SetupDiGetClassDevsW(
        class: *const Guid,
        enumerator: *const u16,
        parent: isize,
        flags: u32,
    ) -> isize;
    fn SetupDiEnumDeviceInterfaces(
        set: isize,
        dev: *const DeviceData,
        class: *const Guid,
        index: u32,
        data: *mut InterfaceData,
    ) -> i32;
    fn SetupDiGetDeviceInterfaceDetailW(
        set: isize,
        interface: *const InterfaceData,
        detail: *mut c_void,
        size: u32,
        required: *mut u32,
        device: *mut DeviceData,
    ) -> i32;
    fn SetupDiGetDeviceRegistryPropertyW(
        set: isize,
        device: *const DeviceData,
        property: u32,
        kind: *mut u32,
        buffer: *mut u8,
        size: u32,
        required: *mut u32,
    ) -> i32;
    fn SetupDiGetDeviceInstanceIdW(
        set: isize,
        device: *const DeviceData,
        buffer: *mut u16,
        size: u32,
        required: *mut u32,
    ) -> i32;
    fn SetupDiDestroyDeviceInfoList(set: isize) -> i32;
}

#[derive(Clone)]
struct Device {
    transport: &'static str,
    name: String,
    path: String,
    instance: String,
    hardware: String,
    port: Option<String>,
}

fn wide_z(data: &[u16]) -> String {
    String::from_utf16_lossy(&data[..data.iter().position(|&x| x == 0).unwrap_or(data.len())])
}

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
    let units = std::slice::from_raw_parts(
        bytes.as_ptr() as *const u16,
        (required as usize / 2).min(bytes.len() / 2),
    );
    wide_z(units)
}

fn com_from_name(name: &str) -> Option<String> {
    let start = name.rfind("(COM")? + 1;
    let end = name[start..].find(')')? + start;
    let port = &name[start..end];
    (port[3..].chars().all(|c| c.is_ascii_digit()) && port.len() > 3).then(|| port.to_string())
}

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
            let mut required = 0;
            SetupDiGetDeviceInterfaceDetailW(
                set,
                &iface,
                ptr::null_mut(),
                0,
                &mut required,
                ptr::null_mut(),
            );
            if required < 6 || required > 65536 {
                continue;
            }
            let mut detail = vec![0u64; (required as usize + 7) / 8];
            let raw = detail.as_mut_ptr() as *mut u8;
            // SP_DEVICE_INTERFACE_DETAIL_DATA_W.cbSize is 8 on x64, 6 on x86.
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
            let path_units =
                std::slice::from_raw_parts(raw.add(4) as *const u16, (required as usize - 4) / 2);
            let path = wide_z(path_units);
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
            let name = {
                let n = property(set, &dev, FRIENDLY_NAME);
                if n.is_empty() {
                    property(set, &dev, DEVICE_DESC)
                } else {
                    n
                }
            };
            let hardware = property(set, &dev, HARDWARE_ID);
            let port = if transport == "COM" {
                com_from_name(&name).or_else(|| {
                    serialport::available_ports()
                        .ok()?
                        .into_iter()
                        .find(|p| p.port_name.eq_ignore_ascii_case(&name))
                        .map(|p| p.port_name)
                })
            } else {
                None
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

fn ids(text: &str) -> String {
    let upper = text.to_ascii_uppercase();
    let extract = |tag: &str| {
        upper
            .find(tag)
            .map(|i| upper[i..].chars().take(tag.len() + 4).collect::<String>())
    };
    [extract("VID_"), extract("PID_")]
        .into_iter()
        .flatten()
        .collect::<Vec<_>>()
        .join(" ")
}

fn raster_test() -> Vec<u8> {
    // GS v 0, normal scale, 16 x 16 pixels; a small outlined square.
    let mut out = vec![0x1d, b'v', b'0', 0, 2, 0, 16, 0];
    for row in 0..16 {
        out.extend_from_slice(if row == 0 || row == 15 {
            &[0xff, 0xff]
        } else {
            &[0x80, 0x01]
        });
    }
    out.push(b'\n');
    out
}

fn payload() -> Vec<u8> {
    let mut out = vec![0x1b, b'@'];
    out.extend_from_slice(b"THERMAL PROBE\nASCII OK 0123456789\n\n");
    out.extend_from_slice(&raster_test());
    out.push(b'\n');
    out
}

fn print_to(device: &Device, baud: u32) -> io::Result<()> {
    let bytes = payload();
    if let Some(port) = &device.port {
        let mut stream = serialport::new(port, baud)
            .timeout(Duration::from_secs(5))
            .open()
            .map_err(io::Error::other)?;
        stream.write_all(&bytes)?;
        stream.flush()?;
    } else {
        let mut stream = OpenOptions::new().write(true).open(&device.path)?;
        stream.write_all(&bytes)?;
        stream.flush()?;
    }
    Ok(())
}

fn main() -> Result<(), Box<dyn std::error::Error>> {
    let args: Vec<String> = env::args().skip(1).collect();
    if args.iter().any(|a| a == "--help" || a == "-h") {
        println!("thermal-probe [--baud 9600]\nDiscovers USB Printer Class and COM interfaces; asks before printing. No cut or drawer commands.");
        return Ok(());
    }
    let mut baud = 9600;
    if let Some(pos) = args.iter().position(|a| a == "--baud") {
        baud = args.get(pos + 1).ok_or("missing baud rate")?.parse()?;
    }
    let mut devices = Vec::new();
    for (class, label) in [
        (USBPRINT, "USB Printer Class"),
        (COMPORT, "COM"),
        (USB_DEVICE, "USB device (inventory only)"),
    ] {
        match enumerate(&class, label) {
            Ok(v) => devices.extend(v),
            Err(e) => eprintln!("Could not enumerate {label}: {e}"),
        }
    }
    println!("Connected print-capable interfaces: {}", devices.len());
    for (i, d) in devices.iter().enumerate() {
        println!("\n[{}] {} — {}", i + 1, d.transport, d.name);
        println!("    Instance: {}", d.instance);
        println!("    Hardware: {}", d.hardware);
        println!(
            "    VID/PID: {}",
            ids(&format!("{} {} {}", d.instance, d.hardware, d.path))
        );
        println!("    Path: {}", d.path);
        if let Some(port) = &d.port {
            println!("    Port: {port}");
        }
    }
    if devices.is_empty() {
        println!("No direct USB Printer Class or COM interface found. Check USB connection and Windows Device Manager.");
        return Ok(());
    }
    print!("\nSelect device number (Enter to quit): ");
    io::stdout().flush()?;
    let mut answer = String::new();
    io::stdin().read_line(&mut answer)?;
    let selected: usize = match answer.trim().parse::<usize>() {
        Ok(n) if n > 0 && n <= devices.len() => n - 1,
        _ => return Ok(()),
    };
    let device = &devices[selected];
    if device.transport == "USB device (inventory only)" {
        return Err("Selected USB device has no supported direct print transport; choose its USB Printer Class or COM interface if available".into());
    }
    if device.transport == "COM" && device.port.is_none() {
        return Err("COM interface has no recognized port name".into());
    }
    println!(
        "\nSelected: {} | {} | {}",
        device.name,
        device.transport,
        device.port.as_deref().unwrap_or(&device.path)
    );
    println!("Will send ESC @, ASCII text, line feeds, and a 16x16 raster square. No cutter or cash drawer commands.");
    print!("Type PRINT to confirm physical printing: ");
    io::stdout().flush()?;
    answer.clear();
    io::stdin().read_line(&mut answer)?;
    if answer.trim() != "PRINT" {
        println!("Cancelled; no data sent.");
        return Ok(());
    }
    print_to(device, baud)?;
    println!("Test data sent. Inspect the paper to confirm results.");
    Ok(())
}
