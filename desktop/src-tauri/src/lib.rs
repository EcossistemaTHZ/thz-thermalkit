//! # THZ ThermalKit Desktop Backend (Tauri v2)
//!
//! Fornece comandos IPC assíncronos para a interface React, conectando o frontend
//! à biblioteca central `thermal_core` para controle direto de impressoras ESC/POS via USB e Bluetooth SPP.

use base64::Engine;
use image::{DynamicImage, ImageFormat};
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

mod db;
use db::{
    add_cash_movement_db, create_config_snapshot_db, create_database_backup_db,
    delete_client_db, delete_product_db, delete_service_db, export_receipts_csv_db,
    export_white_label_bundle_db, get_app_config_db, get_cash_summary_db,
    get_database_stats_db, get_store_profile_db, get_technical_order_db,
    get_current_sequence_db, get_next_sequence_db, import_white_label_bundle_db,
    list_cash_movements_db, list_clients_db, list_config_snapshots_db,
    list_products_db, list_receipt_history_db, list_sales_db, list_services_db,
    list_technical_orders_db, rollback_config_snapshot_db, save_app_config_db,
    save_client_db, save_product_db, save_receipt_history_db,
    save_sale_db, save_service_db, save_store_profile_db, save_technical_order_db,
    update_order_status_db, vacuum_database_db, AppConfig, CashMovement, CashSummary,
    Client, ConfigSnapshot, DatabaseStats, OrderItem, Product, ReceiptHistoryItem,
    Sale, SaleItem, ServiceItem, StoreProfile, TechnicalOrder, TechnicalOrderWithDetails,
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
    #[cfg(windows)]
    {
        let file = rfd::FileDialog::new()
            .add_filter("Documentos", &["txt", "png", "jpg", "jpeg", "pdf"])
            .pick_file();
        Ok(file.map(|p| p.to_string_lossy().to_string()))
    }
    #[cfg(not(windows))]
    {
        Ok(None)
    }
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

    if let Some(ref text) = req.direct_text {
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

    if let Some(text) = &req.direct_text {
        let _ = save_receipt_history_db(None, None, 0, None, text);
    }

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

#[tauri::command]
fn get_store_profile() -> Result<StoreProfile, String> {
    get_store_profile_db()
}

#[tauri::command]
fn save_store_profile(profile: StoreProfile) -> Result<(), String> {
    save_store_profile_db(&profile)
}

#[tauri::command]
fn get_app_config() -> Result<AppConfig, String> {
    get_app_config_db()
}

#[tauri::command]
fn save_app_config(config: AppConfig) -> Result<(), String> {
    save_app_config_db(&config)
}

#[tauri::command]
fn get_database_stats() -> Result<DatabaseStats, String> {
    get_database_stats_db()
}

#[tauri::command]
fn vacuum_database() -> Result<DatabaseStats, String> {
    vacuum_database_db()
}

#[tauri::command]
fn create_database_backup(destination: Option<String>) -> Result<String, String> {
    let path = match destination {
        Some(d) => d,
        None => {
            #[cfg(windows)]
            {
                let file = rfd::FileDialog::new()
                    .set_title("Salvar Backup do Banco de Dados (.db)")
                    .set_file_name(&format!("backup_thz_thermal_{}.db", chrono::Local::now().format("%Y%m%d_%H%M%S")))
                    .add_filter("SQLite Database", &["db", "sqlite"])
                    .save_file();
                match file {
                    Some(p) => p.to_string_lossy().to_string(),
                    None => return Err("Operação de backup cancelada".into()),
                }
            }
            #[cfg(not(windows))]
            {
                format!("backup_thz_thermal_{}.db", chrono::Local::now().format("%Y%m%d_%H%M%S"))
            }
        }
    };
    create_database_backup_db(&path)
}

#[tauri::command]
fn create_config_snapshot(description: String) -> Result<i64, String> {
    create_config_snapshot_db(&description)
}

#[tauri::command]
fn list_config_snapshots() -> Result<Vec<ConfigSnapshot>, String> {
    list_config_snapshots_db()
}

#[tauri::command]
fn rollback_config_snapshot(snapshot_id: i64) -> Result<String, String> {
    rollback_config_snapshot_db(snapshot_id)
}

#[tauri::command]
fn export_white_label_bundle() -> Result<String, String> {
    export_white_label_bundle_db()
}

#[tauri::command]
fn import_white_label_bundle(json_str: String) -> Result<(), String> {
    import_white_label_bundle_db(&json_str)
}

#[tauri::command]
fn save_receipt_history(
    order_number: Option<String>,
    customer_name: Option<String>,
    total_cents: i64,
    payment_method: Option<String>,
    raw_text: String,
) -> Result<i64, String> {
    save_receipt_history_db(
        order_number.as_deref(),
        customer_name.as_deref(),
        total_cents,
        payment_method.as_deref(),
        &raw_text,
    )
}

#[tauri::command]
fn list_receipt_history(limit: Option<u32>) -> Result<Vec<ReceiptHistoryItem>, String> {
    list_receipt_history_db(limit.unwrap_or(100))
}

#[tauri::command]
fn export_receipts_csv() -> Result<String, String> {
    export_receipts_csv_db()
}

#[tauri::command]
fn get_next_sequence(sequence_name: String) -> Result<String, String> {
    get_next_sequence_db(&sequence_name)
}

#[tauri::command]
fn get_current_sequence(sequence_name: String) -> Result<String, String> {
    get_current_sequence_db(&sequence_name)
}

#[tauri::command]
fn compile_escpos_bytes(direct_text: String, code_page: Option<u8>) -> Result<String, String> {
    use base64::Engine;
    let cp = code_page.unwrap_or(3);
    let mut bytes = vec![0x1b, b'@'];
    bytes.extend_from_slice(&[0x1b, b't', cp]);
    bytes.extend(text_bytes(&direct_text));
    if !bytes.ends_with(b"\n") {
        bytes.push(b'\n');
    }
    bytes.extend_from_slice(&[0x1b, b'd', 4, b'\n']);
    Ok(base64::engine::general_purpose::STANDARD.encode(&bytes))
}

// ============================================================================
// Novos Comandos IPC: Clientes, Produtos, Serviços, O.S., Vendas e Caixa
// ============================================================================

#[tauri::command]
fn list_clients(search: Option<String>) -> Result<Vec<Client>, String> {
    list_clients_db(search)
}

#[tauri::command]
fn save_client(client: Client) -> Result<i64, String> {
    save_client_db(&client)
}

#[tauri::command]
fn delete_client(id: i64) -> Result<(), String> {
    delete_client_db(id)
}

#[tauri::command]
fn list_products(search: Option<String>) -> Result<Vec<Product>, String> {
    list_products_db(search)
}

#[tauri::command]
fn save_product(product: Product) -> Result<i64, String> {
    save_product_db(&product)
}

#[tauri::command]
fn delete_product(id: i64) -> Result<(), String> {
    delete_product_db(id)
}

#[tauri::command]
fn list_services(search: Option<String>) -> Result<Vec<ServiceItem>, String> {
    list_services_db(search)
}

#[tauri::command]
fn save_service(service: ServiceItem) -> Result<i64, String> {
    save_service_db(&service)
}

#[tauri::command]
fn delete_service(id: i64) -> Result<(), String> {
    delete_service_db(id)
}

#[tauri::command]
fn list_technical_orders(
    status: Option<String>,
    search: Option<String>,
) -> Result<Vec<TechnicalOrder>, String> {
    list_technical_orders_db(status, search)
}

#[tauri::command]
fn get_technical_order(id: i64) -> Result<TechnicalOrderWithDetails, String> {
    get_technical_order_db(id)
}

#[tauri::command]
fn save_technical_order(
    order: TechnicalOrder,
    items: Vec<OrderItem>,
) -> Result<i64, String> {
    save_technical_order_db(order, items)
}

#[tauri::command]
fn update_order_status(id: i64, new_status: String) -> Result<(), String> {
    update_order_status_db(id, &new_status)
}

#[tauri::command]
fn save_sale(sale: Sale, items: Vec<SaleItem>) -> Result<i64, String> {
    save_sale_db(sale, items)
}

#[tauri::command]
fn list_sales(limit: Option<u32>) -> Result<Vec<Sale>, String> {
    list_sales_db(limit.unwrap_or(100))
}

#[tauri::command]
fn add_cash_movement(movement: CashMovement) -> Result<i64, String> {
    add_cash_movement_db(&movement)
}

#[tauri::command]
fn list_cash_movements(limit: Option<u32>) -> Result<Vec<CashMovement>, String> {
    list_cash_movements_db(limit.unwrap_or(100))
}

#[tauri::command]
fn get_cash_summary() -> Result<CashSummary, String> {
    get_cash_summary_db()
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .setup(|app| {
            use tauri::Manager;
            if let Ok(data_dir) = app.path().app_data_dir() {
                let _ = std::fs::create_dir_all(&data_dir);
                db::set_app_data_dir(data_dir);
            }
            Ok(())
        })
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![
            list_printers,
            pick_document,
            preview_file,
            print_job,
            print_test_probe,
            feed_paper,
            get_store_profile,
            save_store_profile,
            get_app_config,
            save_app_config,
            get_database_stats,
            vacuum_database,
            create_database_backup,
            create_config_snapshot,
            list_config_snapshots,
            rollback_config_snapshot,
            export_white_label_bundle,
            import_white_label_bundle,
            save_receipt_history,
            list_receipt_history,
            export_receipts_csv,
            get_next_sequence,
            get_current_sequence,
            compile_escpos_bytes,
            list_clients,
            save_client,
            delete_client,
            list_products,
            save_product,
            delete_product,
            list_services,
            save_service,
            delete_service,
            list_technical_orders,
            get_technical_order,
            save_technical_order,
            update_order_status,
            save_sale,
            list_sales,
            add_cash_movement,
            list_cash_movements,
            get_cash_summary
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
