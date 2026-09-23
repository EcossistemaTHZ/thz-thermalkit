//! # db.rs — Camada de Banco de Dados SQLite (rusqlite)
//!
//! Gerenciamento transacional com WAL mode, auto-vacuum incremental,
//! Online Backup API, snapshots de configuração, histórico e exportações.

use chrono::Utc;
use rusqlite::{params, Connection, OptionalExtension};
use serde::{Deserialize, Serialize};
use std::{
    fs,
    path::{Path, PathBuf},
};

// ============================================================================
// Modelos e Estruturas de Dados
// ============================================================================

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct StoreProfile {
    pub name: String,
    pub legal_name: Option<String>,
    pub doc: String,
    pub phone: Option<String>,
    pub whatsapp: Option<String>,
    pub email: Option<String>,
    pub street: Option<String>,
    pub number: Option<String>,
    pub complement: Option<String>,
    pub neighborhood: Option<String>,
    pub city: Option<String>,
    pub state: Option<String>,
    pub zip: Option<String>,
    pub footer_message: Option<String>,
    pub onboarding_completed: bool,
    pub updated_at: Option<String>,
}

impl Default for StoreProfile {
    fn default() -> Self {
        Self {
            name: "MEU ESTABELECIMENTO".to_string(),
            legal_name: None,
            doc: "00.000.000/0001-00".to_string(),
            phone: None,
            whatsapp: None,
            email: None,
            street: None,
            number: None,
            complement: None,
            neighborhood: None,
            city: None,
            state: None,
            zip: None,
            footer_message: Some("Obrigado pela preferência! Volte sempre.".to_string()),
            onboarding_completed: false,
            updated_at: None,
        }
    }
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct AppConfig {
    pub app_name: String,
    pub app_subtitle: String,
    pub accent_color: String,
    pub default_width_dots: u32,
    pub default_code_page: u8,
    pub show_file_tab: bool,
    pub show_direct_text_tab: bool,
    pub updated_at: Option<String>,
}

impl Default for AppConfig {
    fn default() -> Self {
        Self {
            app_name: "THZ ThermalKit".to_string(),
            app_subtitle: "Direct ESC/POS Driverless Printing".to_string(),
            accent_color: "#3b82f6".to_string(),
            default_width_dots: 384,
            default_code_page: 3,
            show_file_tab: true,
            show_direct_text_tab: true,
            updated_at: None,
        }
    }
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct ConfigSnapshot {
    pub id: i64,
    pub snapshot_type: String,
    pub payload_json: String,
    pub description: Option<String>,
    pub created_at: String,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct ReceiptHistoryItem {
    pub id: i64,
    pub order_number: Option<String>,
    pub customer_name: Option<String>,
    pub total_cents: i64,
    pub payment_method: Option<String>,
    pub raw_text: String,
    pub created_at: String,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct WhiteLabelBundle {
    pub version: String,
    pub app_config: AppConfig,
    pub store_profile: StoreProfile,
    pub exported_at: String,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct DatabaseStats {
    pub file_path: String,
    pub file_size_bytes: u64,
    pub wal_mode: bool,
    pub total_receipts: i64,
    pub total_snapshots: i64,
}

// ============================================================================
// Inicialização e Conexão com SQLite
// ============================================================================

/// Retorna o caminho do banco de dados na pasta local do app
pub fn get_db_path() -> PathBuf {
    let base_dir = dirs_or_local();
    let data_dir = base_dir.join("thz-thermalkit").join("data");
    if !data_dir.exists() {
        let _ = fs::create_dir_all(&data_dir);
    }
    data_dir.join("app.db")
}

fn dirs_or_local() -> PathBuf {
    if let Ok(app_data) = std::env::var("APPDATA") {
        PathBuf::from(app_data)
    } else if let Ok(home) = std::env::var("USERPROFILE") {
        PathBuf::from(home)
    } else {
        PathBuf::from(".")
    }
}

/// Abre ou cria a conexão SQLite configurando WAL e auto-vacuum
pub fn open_connection() -> Result<Connection, rusqlite::Error> {
    let db_path = get_db_path();
    let conn = Connection::open(db_path)?;

    // Configurações de performance e integridade ACID
    conn.execute_batch(
        "
        PRAGMA journal_mode = WAL;
        PRAGMA auto_vacuum = INCREMENTAL;
        PRAGMA synchronous = NORMAL;
        PRAGMA foreign_keys = ON;
        ",
    )?;

    // DDL das tabelas
    conn.execute_batch(
        "
        CREATE TABLE IF NOT EXISTS store_profile (
            id INTEGER PRIMARY KEY CHECK (id = 1),
            name TEXT NOT NULL,
            legal_name TEXT,
            doc TEXT NOT NULL,
            phone TEXT,
            whatsapp TEXT,
            email TEXT,
            street TEXT,
            number TEXT,
            complement TEXT,
            neighborhood TEXT,
            city TEXT,
            state TEXT,
            zip TEXT,
            footer_message TEXT,
            onboarding_completed INTEGER NOT NULL DEFAULT 0,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS app_config (
            id INTEGER PRIMARY KEY CHECK (id = 1),
            app_name TEXT NOT NULL DEFAULT 'THZ ThermalKit',
            app_subtitle TEXT NOT NULL DEFAULT 'Direct ESC/POS Driverless Printing',
            accent_color TEXT DEFAULT '#3b82f6',
            default_width_dots INTEGER DEFAULT 384,
            default_code_page INTEGER DEFAULT 3,
            show_file_tab INTEGER DEFAULT 1,
            show_direct_text_tab INTEGER DEFAULT 1,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS config_snapshots (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            snapshot_type TEXT NOT NULL,
            payload_json TEXT NOT NULL,
            description TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS receipt_history (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            order_number TEXT,
            customer_name TEXT,
            total_cents INTEGER DEFAULT 0,
            payment_method TEXT,
            raw_text TEXT NOT NULL,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );
        ",
    )?;

    // Insere app_config inicial se não existir
    let count: i64 = conn.query_row(
        "SELECT COUNT(*) FROM app_config WHERE id = 1",
        [],
        |r| r.get(0),
    )?;
    if count == 0 {
        conn.execute(
            "INSERT INTO app_config (id, app_name, app_subtitle, accent_color, default_width_dots, default_code_page, show_file_tab, show_direct_text_tab)
             VALUES (1, 'THZ ThermalKit', 'Direct ESC/POS Driverless Printing', '#3b82f6', 384, 3, 1, 1)",
            [],
        )?;
    }

    Ok(conn)
}

// ============================================================================
// Operações de Negócio: Store Profile & App Config
// ============================================================================

pub fn get_store_profile_db() -> Result<StoreProfile, String> {
    let conn = open_connection().map_err(|e| e.to_string())?;
    let mut stmt = conn
        .prepare(
            "SELECT name, legal_name, doc, phone, whatsapp, email, street, number, complement,
                    neighborhood, city, state, zip, footer_message, onboarding_completed, updated_at
             FROM store_profile WHERE id = 1",
        )
        .map_err(|e| e.to_string())?;

    let profile = stmt
        .query_row([], |row| {
            let onboarding_int: i32 = row.get(14)?;
            Ok(StoreProfile {
                name: row.get(0)?,
                legal_name: row.get(1)?,
                doc: row.get(2)?,
                phone: row.get(3)?,
                whatsapp: row.get(4)?,
                email: row.get(5)?,
                street: row.get(6)?,
                number: row.get(7)?,
                complement: row.get(8)?,
                neighborhood: row.get(9)?,
                city: row.get(10)?,
                state: row.get(11)?,
                zip: row.get(12)?,
                footer_message: row.get(13)?,
                onboarding_completed: onboarding_int != 0,
                updated_at: row.get(15)?,
            })
        })
        .optional()
        .map_err(|e| e.to_string())?;

    Ok(profile.unwrap_or_default())
}

pub fn save_store_profile_db(profile: &StoreProfile) -> Result<(), String> {
    let mut conn = open_connection().map_err(|e| e.to_string())?;
    let now = Utc::now().to_rfc3339();

    let tx = conn.transaction().map_err(|e| e.to_string())?;

    tx.execute(
        "INSERT INTO store_profile (
            id, name, legal_name, doc, phone, whatsapp, email, street, number, complement,
            neighborhood, city, state, zip, footer_message, onboarding_completed, updated_at
        ) VALUES (1, ?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16)
        ON CONFLICT(id) DO UPDATE SET
            name = excluded.name,
            legal_name = excluded.legal_name,
            doc = excluded.doc,
            phone = excluded.phone,
            whatsapp = excluded.whatsapp,
            email = excluded.email,
            street = excluded.street,
            number = excluded.number,
            complement = excluded.complement,
            neighborhood = excluded.neighborhood,
            city = excluded.city,
            state = excluded.state,
            zip = excluded.zip,
            footer_message = excluded.footer_message,
            onboarding_completed = excluded.onboarding_completed,
            updated_at = excluded.updated_at",
        params![
            profile.name,
            profile.legal_name,
            profile.doc,
            profile.phone,
            profile.whatsapp,
            profile.email,
            profile.street,
            profile.number,
            profile.complement,
            profile.neighborhood,
            profile.city,
            profile.state,
            profile.zip,
            profile.footer_message,
            if profile.onboarding_completed { 1 } else { 0 },
            now
        ],
    )
    .map_err(|e| e.to_string())?;

    // Salva snapshot automático
    if let Ok(json_str) = serde_json::to_string(profile) {
        let desc = format!("Salvo perfil do estabelecimento: {}", profile.name);
        let _ = tx.execute(
            "INSERT INTO config_snapshots (snapshot_type, payload_json, description) VALUES ('store', ?1, ?2)",
            params![json_str, desc],
        );
    }

    tx.commit().map_err(|e| e.to_string())?;
    Ok(())
}

pub fn get_app_config_db() -> Result<AppConfig, String> {
    let conn = open_connection().map_err(|e| e.to_string())?;
    let mut stmt = conn
        .prepare(
            "SELECT app_name, app_subtitle, accent_color, default_width_dots, default_code_page,
                    show_file_tab, show_direct_text_tab, updated_at
             FROM app_config WHERE id = 1",
        )
        .map_err(|e| e.to_string())?;

    let config = stmt
        .query_row([], |row| {
            let show_file_int: i32 = row.get(5)?;
            let show_text_int: i32 = row.get(6)?;
            Ok(AppConfig {
                app_name: row.get(0)?,
                app_subtitle: row.get(1)?,
                accent_color: row.get(2)?,
                default_width_dots: row.get(3)?,
                default_code_page: row.get(4)?,
                show_file_tab: show_file_int != 0,
                show_direct_text_tab: show_text_int != 0,
                updated_at: row.get(7)?,
            })
        })
        .optional()
        .map_err(|e| e.to_string())?;

    Ok(config.unwrap_or_default())
}

pub fn save_app_config_db(config: &AppConfig) -> Result<(), String> {
    let mut conn = open_connection().map_err(|e| e.to_string())?;
    let now = Utc::now().to_rfc3339();

    let tx = conn.transaction().map_err(|e| e.to_string())?;

    tx.execute(
        "INSERT INTO app_config (
            id, app_name, app_subtitle, accent_color, default_width_dots, default_code_page,
            show_file_tab, show_direct_text_tab, updated_at
        ) VALUES (1, ?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)
        ON CONFLICT(id) DO UPDATE SET
            app_name = excluded.app_name,
            app_subtitle = excluded.app_subtitle,
            accent_color = excluded.accent_color,
            default_width_dots = excluded.default_width_dots,
            default_code_page = excluded.default_code_page,
            show_file_tab = excluded.show_file_tab,
            show_direct_text_tab = excluded.show_direct_text_tab,
            updated_at = excluded.updated_at",
        params![
            config.app_name,
            config.app_subtitle,
            config.accent_color,
            config.default_width_dots,
            config.default_code_page,
            if config.show_file_tab { 1 } else { 0 },
            if config.show_direct_text_tab { 1 } else { 0 },
            now
        ],
    )
    .map_err(|e| e.to_string())?;

    // Salva snapshot automático
    if let Ok(json_str) = serde_json::to_string(config) {
        let desc = format!("Personalização de marca: {}", config.app_name);
        let _ = tx.execute(
            "INSERT INTO config_snapshots (snapshot_type, payload_json, description) VALUES ('app', ?1, ?2)",
            params![json_str, desc],
        );
    }

    tx.commit().map_err(|e| e.to_string())?;
    Ok(())
}

// ============================================================================
// Compactação & Manutenção
// ============================================================================

pub fn get_database_stats_db() -> Result<DatabaseStats, String> {
    let db_path = get_db_path();
    let conn = open_connection().map_err(|e| e.to_string())?;

    let meta = fs::metadata(&db_path).map_err(|e| e.to_string())?;
    let file_size_bytes = meta.len();

    let total_receipts: i64 = conn
        .query_row("SELECT COUNT(*) FROM receipt_history", [], |r| r.get(0))
        .unwrap_or(0);
    let total_snapshots: i64 = conn
        .query_row("SELECT COUNT(*) FROM config_snapshots", [], |r| r.get(0))
        .unwrap_or(0);

    Ok(DatabaseStats {
        file_path: db_path.to_string_lossy().to_string(),
        file_size_bytes,
        wal_mode: true,
        total_receipts,
        total_snapshots,
    })
}

pub fn vacuum_database_db() -> Result<DatabaseStats, String> {
    let conn = open_connection().map_err(|e| e.to_string())?;

    // Executa incremental vacuum e vacuum completo
    conn.execute_batch(
        "
        PRAGMA incremental_vacuum;
        PRAGMA wal_checkpoint(TRUNCATE);
        VACUUM;
        ",
    )
    .map_err(|e| format!("Erro ao executar VACUUM: {e}"))?;

    get_database_stats_db()
}

// ============================================================================
// Backups Online (rusqlite::backup::Backup) & Snapshots
// ============================================================================

pub fn create_database_backup_db(dest_path_str: &str) -> Result<String, String> {
    let src_conn = open_connection().map_err(|e| e.to_string())?;
    let dest_path = Path::new(dest_path_str);

    if let Some(parent) = dest_path.parent() {
        let _ = fs::create_dir_all(parent);
    }

    let mut dest_conn = Connection::open(dest_path).map_err(|e| format!("Falha ao criar arquivo de destino: {e}"))?;

    // Online Backup API
    let backup = rusqlite::backup::Backup::new(&src_conn, &mut dest_conn)
        .map_err(|e| format!("Falha ao iniciar backup online: {e}"))?;

    // Transfere todas as páginas (-1 = all pages)
    backup
        .run_to_completion(100, std::time::Duration::from_millis(5), None)
        .map_err(|e| format!("Falha ao executar cópia online: {e}"))?;

    Ok(format!("Backup integral concluído com sucesso em: {dest_path_str}"))
}

pub fn create_config_snapshot_db(description: &str) -> Result<i64, String> {
    let conn = open_connection().map_err(|e| e.to_string())?;
    let bundle = export_white_label_bundle_db()?;

    conn.execute(
        "INSERT INTO config_snapshots (snapshot_type, payload_json, description) VALUES ('full', ?1, ?2)",
        params![bundle, description],
    )
    .map_err(|e| e.to_string())?;

    Ok(conn.last_insert_rowid())
}

pub fn list_config_snapshots_db() -> Result<Vec<ConfigSnapshot>, String> {
    let conn = open_connection().map_err(|e| e.to_string())?;
    let mut stmt = conn
        .prepare("SELECT id, snapshot_type, payload_json, description, created_at FROM config_snapshots ORDER BY id DESC LIMIT 50")
        .map_err(|e| e.to_string())?;

    let rows = stmt
        .query_map([], |r| {
            Ok(ConfigSnapshot {
                id: r.get(0)?,
                snapshot_type: r.get(1)?,
                payload_json: r.get(2)?,
                description: r.get(3)?,
                created_at: r.get(4)?,
            })
        })
        .map_err(|e| e.to_string())?;

    let mut snapshots = Vec::new();
    for row in rows {
        if let Ok(s) = row {
            snapshots.push(s);
        }
    }

    Ok(snapshots)
}

pub fn rollback_config_snapshot_db(snapshot_id: i64) -> Result<String, String> {
    let conn = open_connection().map_err(|e| e.to_string())?;
    let (snapshot_type, payload_json): (String, String) = conn
        .query_row(
            "SELECT snapshot_type, payload_json FROM config_snapshots WHERE id = ?1",
            params![snapshot_id],
            |r| Ok((r.get(0)?, r.get(1)?)),
        )
        .map_err(|_| format!("Snapshot ID {snapshot_id} não encontrado"))?;

    match snapshot_type.as_str() {
        "store" => {
            let profile: StoreProfile = serde_json::from_str(&payload_json)
                .map_err(|e| format!("Formato inválido de perfil no snapshot: {e}"))?;
            save_store_profile_db(&profile)?;
            Ok("Perfil do estabelecimento restaurado com sucesso!".into())
        }
        "app" => {
            let config: AppConfig = serde_json::from_str(&payload_json)
                .map_err(|e| format!("Formato inválido de app_config no snapshot: {e}"))?;
            save_app_config_db(&config)?;
            Ok("Personalização White-Label restaurada com sucesso!".into())
        }
        "full" => {
            import_white_label_bundle_db(&payload_json)?;
            Ok("Configuração completa restaurada a partir do snapshot!".into())
        }
        _ => Err("Tipo de snapshot desconhecido".into()),
    }
}

// ============================================================================
// Importação e Exportação: White-Label Bundle (JSON) & Relatório (CSV)
// ============================================================================

pub fn export_white_label_bundle_db() -> Result<String, String> {
    let store = get_store_profile_db()?;
    let app = get_app_config_db()?;

    let bundle = WhiteLabelBundle {
        version: "1.0".to_string(),
        app_config: app,
        store_profile: store,
        exported_at: Utc::now().to_rfc3339(),
    };

    serde_json::to_string_pretty(&bundle).map_err(|e| e.to_string())
}

pub fn import_white_label_bundle_db(json_str: &str) -> Result<(), String> {
    let bundle: WhiteLabelBundle = serde_json::from_str(json_str)
        .map_err(|e| format!("Arquivo de bundle inválido: {e}"))?;

    save_store_profile_db(&bundle.store_profile)?;
    save_app_config_db(&bundle.app_config)?;

    let _ = create_config_snapshot_db("Importação de bundle White-Label externo");

    Ok(())
}

pub fn save_receipt_history_db(
    order_number: Option<&str>,
    customer_name: Option<&str>,
    total_cents: i64,
    payment_method: Option<&str>,
    raw_text: &str,
) -> Result<i64, String> {
    let conn = open_connection().map_err(|e| e.to_string())?;
    conn.execute(
        "INSERT INTO receipt_history (order_number, customer_name, total_cents, payment_method, raw_text)
         VALUES (?1, ?2, ?3, ?4, ?5)",
        params![order_number, customer_name, total_cents, payment_method, raw_text],
    )
    .map_err(|e| e.to_string())?;

    Ok(conn.last_insert_rowid())
}

pub fn list_receipt_history_db(limit: u32) -> Result<Vec<ReceiptHistoryItem>, String> {
    let conn = open_connection().map_err(|e| e.to_string())?;
    let mut stmt = conn
        .prepare(
            "SELECT id, order_number, customer_name, total_cents, payment_method, raw_text, created_at
             FROM receipt_history ORDER BY id DESC LIMIT ?1",
        )
        .map_err(|e| e.to_string())?;

    let rows = stmt
        .query_map(params![limit], |r| {
            Ok(ReceiptHistoryItem {
                id: r.get(0)?,
                order_number: r.get(1)?,
                customer_name: r.get(2)?,
                total_cents: r.get(3)?,
                payment_method: r.get(4)?,
                raw_text: r.get(5)?,
                created_at: r.get(6)?,
            })
        })
        .map_err(|e| e.to_string())?;

    let mut list = Vec::new();
    for row in rows {
        if let Ok(item) = row {
            list.push(item);
        }
    }
    Ok(list)
}

pub fn export_receipts_csv_db() -> Result<String, String> {
    let receipts = list_receipt_history_db(5000)?;
    let mut csv = String::from("ID,Data,Pedido,Cliente,Metodo_Pagamento,Valor_Reais\n");

    for r in receipts {
        let reais = (r.total_cents as f64) / 100.0;
        let line = format!(
            "{},{},\"{}\",\"{}\",\"{}\",\"{:.2}\"\n",
            r.id,
            r.created_at,
            r.order_number.unwrap_or_default(),
            r.customer_name.unwrap_or_default(),
            r.payment_method.unwrap_or_default(),
            reais
        );
        csv.push_str(&line);
    }

    Ok(csv)
}
