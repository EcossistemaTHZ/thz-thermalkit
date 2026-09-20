#![cfg_attr(mobile, tauri::mobile_entry_point)]

//! # THZ ThermalKit Desktop Backend (Tauri v2)
//!
//! Fornece comandos IPC assíncronos para a interface React, conectando o frontend
//! à biblioteca central `thermal_core` para controle direto de impressoras ESC/POS via USB e Bluetooth SPP.

use base64::Engine;
use image::{DynamicImage, ImageFormat};
use rfd::FileDialog;
use serde::{Deserialize, Serialize};
use std::{
    env,
    fs,
    io::Cursor,
    path::PathBuf,
    process::Command,
};
use thermal_core::{
    discover_printers, image_payload, normalize_image, probe_payload, text_bytes,
    write_payload, ActiveTransport,
};

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct PrinterDto {
    pub name: String,
    pub display_info: String,
    pub is_bluetooth: bool,
    pub port: Option<String>,
    pub transport_type: String,
    pub target: String,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct DocumentPreviewDto {
    pub file_name: String,
    pub file_path: String,
    pub file_size: u64,
    pub kind: String, // "text" | "raster"
    pub text_content: Option<String>,
    pub preview_image_base64: Option<String>,
    pub page_count: usize,
    pub width_dots: u32,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct PrintJobRequest {
    pub file_path: Option<String>,
    pub direct_text: Option<String>,
    pub target_transport: String, // "usb" | "com" | "bluetooth"
    pub target_param: String,     // USB path ou COM port (ex: "COM6")
    pub baud: Option<u32>,
    pub code_page: Option<u8>,
    pub width_dots: Option<u32>,
}

#[tauri::command]
fn list_printers() -> Result<Vec<PrinterDto>, String> {
    let discovered = discover_printers();
    let mut dtos = Vec::new();

    for p in discovered {
        let (transport_type, target) = match &p.transport {
            ActiveTransport::Usb(path) => ("usb".to_string(), path.clone()),
            ActiveTransport::Com { port, .. } => ("com".to_string(), port.clone()),
        };

        dtos.push(PrinterDto {
            name: p.name,
            display_info: p.display_info,
            is_bluetooth: p.is_bluetooth,
            port: p.port,
            transport_type,
            target,
        });
    }

    Ok(dtos)
}

#[tauri::command]
fn pick_document() -> Result<Option<String>, String> {
    let file = FileDialog::new()
        .add_filter("Documentos", &["txt", "png", "jpg", "jpeg", "pdf"])
        .pick_file();

    Ok(file.map(|p| p.to_string_lossy().to_string()))
}

#[tauri::command]
fn preview_file(path_str: String, width_dots: Option<u32>) -> Result<DocumentPreviewDto, String> {
    let path = PathBuf::from(&path_str);
    if !path.exists() {
        return Err(format!("Arquivo não encontrado: {path_str}"));
    }

    let meta = fs::metadata(&path).map_err(|e| e.to_string())?;
    let file_name = path
        .file_name()
        .unwrap_or_default()
        .to_string_lossy()
        .to_string();
    let width = width_dots.unwrap_or(384);
    let ext = path
        .extension()
        .and_then(|x| x.to_str())
        .unwrap_or("")
        .to_ascii_lowercase();

    if ext == "txt" {
        let raw = fs::read_to_string(&path).map_err(|e| e.to_string())?;
        let clean = raw.strip_prefix('\u{feff}').unwrap_or(&raw).replace('\r', "");
        return Ok(DocumentPreviewDto {
            file_name,
            file_path: path_str,
            file_size: meta.len(),
            kind: "text".into(),
            text_content: Some(clean),
            preview_image_base64: None,
            page_count: 1,
            width_dots: width,
        });
    }

    // Processamento de imagem ou PDF
    if ext == "pdf" {
        let temp_dir = env::temp_dir().join(format!("thermalkit-tauri-{}", std::process::id()));
        fs::create_dir_all(&temp_dir).map_err(|e| e.to_string())?;
        let prefix = temp_dir.join("page");

        let status = Command::new("pdftoppm")
            .args([
                "-png",
                "-r",
                "203",
                path.to_str().ok_or("Caminho PDF inválido")?,
                prefix.to_str().ok_or("Caminho temporário inválido")?,
            ])
            .status()
            .map_err(|_| {
                "pdftoppm não encontrado. Certifique-se de que o Poppler está instalado no Windows.".to_string()
            })?;

        if !status.success() {
            return Err("Falha ao renderizar as páginas do PDF com pdftoppm".into());
        }

        let mut files: Vec<_> = fs::read_dir(&temp_dir)
            .map_err(|e| e.to_string())?
            .filter_map(Result::ok)
            .map(|x| x.path())
            .filter(|p| p.extension().is_some_and(|e| e.eq_ignore_ascii_case("png")))
            .collect();
        files.sort();

        let page_count = files.len();
        let first_page_path = files
            .first()
            .ok_or_else(|| "O PDF não produziu páginas".to_string())?;
        let img = image::open(first_page_path).map_err(|e| e.to_string())?;
        let gray = normalize_image(&img.to_luma8(), width);

        let mut png_bytes = Vec::new();
        DynamicImage::ImageLuma8(gray)
            .write_to(&mut Cursor::new(&mut png_bytes), ImageFormat::Png)
            .map_err(|e| e.to_string())?;

        let b64 = base64::engine::general_purpose::STANDARD.encode(&png_bytes);

        return Ok(DocumentPreviewDto {
            file_name,
            file_path: path_str,
            file_size: meta.len(),
            kind: "raster".into(),
            text_content: None,
            preview_image_base64: Some(b64),
            page_count,
            width_dots: width,
        });
    }

    // Imagem comum (PNG, JPG)
    let img = image::open(&path).map_err(|e| e.to_string())?;
    let gray = normalize_image(&img.to_luma8(), width);
    let mut png_bytes = Vec::new();
    DynamicImage::ImageLuma8(gray)
        .write_to(&mut Cursor::new(&mut png_bytes), ImageFormat::Png)
        .map_err(|e| e.to_string())?;

    let b64 = base64::engine::general_purpose::STANDARD.encode(&png_bytes);

    Ok(DocumentPreviewDto {
        file_name,
        file_path: path_str,
        file_size: meta.len(),
        kind: "raster".into(),
        text_content: None,
        preview_image_base64: Some(b64),
        page_count: 1,
        width_dots: width,
    })
}

#[tauri::command]
fn print_job(req: PrintJobRequest) -> Result<String, String> {
    let width = req.width_dots.unwrap_or(384);
    let baud = req.baud.unwrap_or(9600);
    let code_page = req.code_page.unwrap_or(3);

    // Monta o meio de transporte ativo
    let transport = match req.target_transport.as_str() {
        "usb" => ActiveTransport::Usb(req.target_param.clone()),
        "com" | "bluetooth" => ActiveTransport::Com {
            port: req.target_param.clone(),
            baud,
            is_bluetooth: req.target_transport == "bluetooth" || req.target_param.contains("COM"),
        },
        _ => return Err("Tipo de transporte desconhecido".into()),
    };

    let mut bytes = vec![0x1b, b'@']; // Reset ESC @

    if let Some(text) = req.direct_text {
        bytes.extend_from_slice(&[0x1b, b't', code_page]);
        bytes.extend(text_bytes(&text));
        if !bytes.ends_with(b"\n") {
            bytes.push(b'\n');
        }
    } else if let Some(path_str) = req.file_path {
        let path = PathBuf::from(&path_str);
        let ext = path
            .extension()
            .and_then(|x| x.to_str())
            .unwrap_or("")
            .to_ascii_lowercase();

        if ext == "txt" {
            let raw = fs::read_to_string(&path).map_err(|e| e.to_string())?;
            let clean = raw.strip_prefix('\u{feff}').unwrap_or(&raw).replace('\r', "");
            bytes.extend_from_slice(&[0x1b, b't', code_page]);
            bytes.extend(text_bytes(&clean));
            if !bytes.ends_with(b"\n") {
                bytes.push(b'\n');
            }
        } else if ext == "pdf" {
            let temp_dir =
                env::temp_dir().join(format!("thermalkit-tauri-job-{}", std::process::id()));
            fs::create_dir_all(&temp_dir).map_err(|e| e.to_string())?;
            let prefix = temp_dir.join("page");

            let status = Command::new("pdftoppm")
                .args([
                    "-png",
                    "-r",
                    "203",
                    path.to_str().ok_or("Caminho PDF inválido")?,
                    prefix.to_str().ok_or("Caminho temporário inválido")?,
                ])
                .status()
                .map_err(|_| "pdftoppm não encontrado no PATH".to_string())?;

            if !status.success() {
                return Err("Falha na renderização do PDF".into());
            }

            let mut files: Vec<_> = fs::read_dir(&temp_dir)
                .map_err(|e| e.to_string())?
                .filter_map(Result::ok)
                .map(|x| x.path())
                .filter(|p| p.extension().is_some_and(|e| e.eq_ignore_ascii_case("png")))
                .collect();
            files.sort();

            for f in files {
                let img = image::open(&f).map_err(|e| e.to_string())?;
                bytes.extend(image_payload(img, width).map_err(|e| e.to_string())?);
            }
        } else {
            let img = image::open(&path).map_err(|e| e.to_string())?;
            bytes.extend(image_payload(img, width).map_err(|e| e.to_string())?);
        }
    } else {
        return Err("Nenhum arquivo ou texto fornecido para impressão".into());
    }

    // Avança o papel automaticamente ao final de cada impressão (mesmo comando do botão Feed)
    // para que o comprovante ultrapasse a barra serrilhada de corte da maquininha
    bytes.extend_from_slice(&[0x1b, b'd', 4, b'\n']);

    write_payload(&transport, &bytes).map_err(|e| format!("Erro de comunicação física: {e}"))?;

    Ok("Impressão enviada com sucesso!".into())
}

#[tauri::command]
fn print_test_probe(target_transport: String, target_param: String) -> Result<String, String> {
    let transport = match target_transport.as_str() {
        "usb" => ActiveTransport::Usb(target_param),
        "com" | "bluetooth" => ActiveTransport::Com {
            port: target_param,
            baud: 9600,
            is_bluetooth: true,
        },
        _ => return Err("Transporte inválido".into()),
    };

    let mut bytes = probe_payload();
    bytes.extend_from_slice(&[0x1b, b'd', 4, b'\n']);
    write_payload(&transport, &bytes).map_err(|e| format!("Erro no teste de probe: {e}"))?;

    Ok("Teste de diagnóstico ESC/POS enviado com sucesso!".into())
}

#[tauri::command]
fn feed_paper(target_transport: String, target_param: String, lines: Option<u8>) -> Result<String, String> {
    let transport = match target_transport.as_str() {
        "usb" => ActiveTransport::Usb(target_param),
        "com" | "bluetooth" => ActiveTransport::Com {
            port: target_param,
            baud: 9600,
            is_bluetooth: true,
        },
        _ => return Err("Transporte inválido".into()),
    };

    let count = lines.unwrap_or(4);
    // ESC d <count> (Print and feed n lines) seguido de \n
    let bytes = vec![0x1b, b'd', count, b'\n'];

    write_payload(&transport, &bytes).map_err(|e| format!("Erro ao avançar papel: {e}"))?;

    Ok("Papel avançado!".into())
}

pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![
            list_printers,
            pick_document,
            preview_file,
            print_job,
            print_test_probe,
            feed_paper
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
