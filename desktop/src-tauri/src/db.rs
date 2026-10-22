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
    pub pix_key_type: Option<String>,
    pub pix_key: Option<String>,
    pub pix_beneficiary: Option<String>,
    pub pix_city: Option<String>,
    pub tech_warranty_terms: Option<String>,
    pub tech_abandonment_terms: Option<String>,
    pub tech_default_warranty_days: Option<i64>,
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
            pix_key_type: Some("cnpj".to_string()),
            pix_key: None,
            pix_beneficiary: None,
            pix_city: None,
            tech_warranty_terms: Some("Garantia legal de 90 dias sobre pecas e servicos, balcao, mediante este documento. Excluem-se quedas, umidade ou mau uso.".to_string()),
            tech_abandonment_terms: Some("Aparelhos orcados ou finalizados nao retirados em 90 dias serao destinados para descarte ou reciclagem conforme CDC.".to_string()),
            tech_default_warranty_days: Some(90),
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

// ----------------------------------------------------------------------------
// Modelos: Clientes, Produtos, Serviços, Ordem de Serviço, PDV e Caixa
// ----------------------------------------------------------------------------

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct Client {
    pub id: Option<i64>,
    pub name: String,
    pub document: Option<String>,
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
    pub notes: Option<String>,
    pub created_at: Option<String>,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct Product {
    pub id: Option<i64>,
    pub code: String,
    pub description: String,
    pub cost_price_cents: i64,
    pub sale_price_cents: i64,
    pub stock_qty: i64,
    pub min_stock_qty: i64,
    pub unit: String,
    pub category: Option<String>,
    pub created_at: Option<String>,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct ServiceItem {
    pub id: Option<i64>,
    pub name: String,
    pub price_cents: i64,
    pub description: Option<String>,
    pub created_at: Option<String>,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct TechnicalOrder {
    pub id: Option<i64>,
    pub order_number: String,
    pub client_id: Option<i64>,
    pub equipment_type: String, // "smartphone", "notebook", "computador", "tablet", "outro"
    pub brand_model: String,
    pub serial_imei: Option<String>,
    pub device_password: Option<String>,
    pub accessories: Option<String>,
    pub physical_condition: Option<String>,
    pub reported_defect: String,
    pub technical_diagnosis: Option<String>,
    pub solution: Option<String>,
    pub status: String, // "ORCAMENTO", "AGUARDANDO_APROVACAO", "APROVADO", "EM_MANUTENCAO", "AGUARDANDO_PECAS", "PRONTO", "FATURADO_ENTREGUE", "CANCELADO"
    pub warranty_days: i64,
    pub discount_cents: i64,
    pub total_cents: i64,
    pub notes: Option<String>,
    pub created_at: Option<String>,
    pub updated_at: Option<String>,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct OrderItem {
    pub id: Option<i64>,
    pub order_id: Option<i64>,
    pub item_type: String, // "product" | "service"
    pub reference_id: Option<i64>,
    pub description: String,
    pub qty: i64,
    pub unit_price_cents: i64,
    pub total_cents: i64,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct TechnicalOrderWithDetails {
    pub order: TechnicalOrder,
    pub client: Option<Client>,
    pub items: Vec<OrderItem>,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct Sale {
    pub id: Option<i64>,
    pub sale_number: String,
    pub client_id: Option<i64>,
    pub subtotal_cents: i64,
    pub discount_cents: i64,
    pub total_cents: i64,
    pub payment_method: String,
    pub status: String,
    pub created_at: Option<String>,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct SaleItem {
    pub id: Option<i64>,
    pub sale_id: Option<i64>,
    pub product_id: Option<i64>,
    pub description: String,
    pub qty: i64,
    pub unit_price_cents: i64,
    pub total_cents: i64,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct CashMovement {
    pub id: Option<i64>,
    pub movement_type: String, // "ABERTURA", "ENTRADA", "SANGRIA", "SUPRIMENTO", "FECHAMENTO"
    pub amount_cents: i64,
    pub payment_method: Option<String>,
    pub description: Option<String>,
    pub operator: Option<String>,
    pub created_at: Option<String>,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct CashSummary {
    pub total_sales_cents: i64,
    pub total_service_cents: i64,
    pub total_inflow_cents: i64,
    pub total_outflow_cents: i64,
    pub current_balance_cents: i64,
}

// ============================================================================
// Inicialização e Conexão com SQLite
// ============================================================================

use std::sync::OnceLock;

static CUSTOM_APP_DATA_DIR: OnceLock<PathBuf> = OnceLock::new();

/// Define o diretório de dados da aplicação fornecido pelo runtime (Tauri app_data_dir)
pub fn set_app_data_dir(path: PathBuf) {
    let _ = CUSTOM_APP_DATA_DIR.set(path);
}

/// Retorna o caminho do banco de dados na pasta local do app
pub fn get_db_path() -> PathBuf {
    let base_dir = dirs_or_local();
    let data_dir = base_dir.join("thz-thermalkit").join("data");
    if let Err(e) = fs::create_dir_all(&data_dir) {
        eprintln!("Falha ao criar data_dir {:?}: {e}, usando base_dir direto", data_dir);
        if fs::create_dir_all(&base_dir).is_ok() {
            return base_dir.join("app.db");
        }
        let fallback_dir = std::env::temp_dir().join("thz-thermalkit").join("data");
        let _ = fs::create_dir_all(&fallback_dir);
        return fallback_dir.join("app.db");
    }
    data_dir.join("app.db")
}

fn dirs_or_local() -> PathBuf {
    if let Some(custom) = CUSTOM_APP_DATA_DIR.get() {
        return custom.clone();
    }

    #[cfg(target_os = "android")]
    {
        let candidates = [
            PathBuf::from("/data/user/0/com.ecossistemathz.thermalkit/files"),
            PathBuf::from("/data/data/com.ecossistemathz.thermalkit/files"),
            PathBuf::from("/data/user/0/com.ecossistemathz.thermalkit"),
            PathBuf::from("/data/data/com.ecossistemathz.thermalkit"),
        ];
        for c in &candidates {
            if fs::create_dir_all(c).is_ok() {
                return c.clone();
            }
        }
    }

    if let Ok(app_data) = std::env::var("APPDATA") {
        PathBuf::from(app_data)
    } else if let Ok(home) = std::env::var("USERPROFILE") {
        PathBuf::from(home)
    } else if let Ok(home) = std::env::var("HOME") {
        PathBuf::from(home)
    } else {
        std::env::temp_dir()
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
            pix_key_type TEXT DEFAULT 'cnpj',
            pix_key TEXT,
            pix_beneficiary TEXT,
            pix_city TEXT,
            tech_warranty_terms TEXT,
            tech_abandonment_terms TEXT,
            tech_default_warranty_days INTEGER DEFAULT 90,
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

        -- Tabela de Sequenciamento Monotônico com Memória Persistida
        CREATE TABLE IF NOT EXISTS app_sequences (
            sequence_name TEXT PRIMARY KEY,
            last_value INTEGER NOT NULL DEFAULT 1000,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );

        -- ====================================================================
        -- Tabelas Relacionais: Clientes, Produtos, Serviços, O.S. e Vendas
        -- ====================================================================

        CREATE TABLE IF NOT EXISTS clients (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            document TEXT,
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
            notes TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS products (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            code TEXT NOT NULL UNIQUE,
            description TEXT NOT NULL,
            cost_price_cents INTEGER NOT NULL DEFAULT 0,
            sale_price_cents INTEGER NOT NULL DEFAULT 0,
            stock_qty INTEGER NOT NULL DEFAULT 0,
            min_stock_qty INTEGER NOT NULL DEFAULT 0,
            unit TEXT NOT NULL DEFAULT 'UN',
            category TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS services (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            price_cents INTEGER NOT NULL DEFAULT 0,
            description TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS technical_orders (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            order_number TEXT NOT NULL UNIQUE,
            client_id INTEGER REFERENCES clients(id) ON DELETE SET NULL,
            equipment_type TEXT NOT NULL DEFAULT 'smartphone',
            brand_model TEXT NOT NULL,
            serial_imei TEXT,
            device_password TEXT,
            accessories TEXT,
            physical_condition TEXT,
            reported_defect TEXT NOT NULL,
            technical_diagnosis TEXT,
            solution TEXT,
            status TEXT NOT NULL DEFAULT 'ORCAMENTO',
            warranty_days INTEGER NOT NULL DEFAULT 90,
            discount_cents INTEGER NOT NULL DEFAULT 0,
            total_cents INTEGER NOT NULL DEFAULT 0,
            notes TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS order_items (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            order_id INTEGER NOT NULL REFERENCES technical_orders(id) ON DELETE CASCADE,
            item_type TEXT NOT NULL, -- 'product' | 'service'
            reference_id INTEGER,
            description TEXT NOT NULL,
            qty INTEGER NOT NULL DEFAULT 1,
            unit_price_cents INTEGER NOT NULL DEFAULT 0,
            total_cents INTEGER NOT NULL DEFAULT 0
        );

        CREATE TABLE IF NOT EXISTS sales (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            sale_number TEXT NOT NULL UNIQUE,
            client_id INTEGER REFERENCES clients(id) ON DELETE SET NULL,
            subtotal_cents INTEGER NOT NULL DEFAULT 0,
            discount_cents INTEGER NOT NULL DEFAULT 0,
            total_cents INTEGER NOT NULL DEFAULT 0,
            payment_method TEXT NOT NULL DEFAULT 'DINHEIRO',
            status TEXT NOT NULL DEFAULT 'CONCLUIDA',
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS sale_items (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            sale_id INTEGER NOT NULL REFERENCES sales(id) ON DELETE CASCADE,
            product_id INTEGER REFERENCES products(id) ON DELETE SET NULL,
            description TEXT NOT NULL,
            qty INTEGER NOT NULL DEFAULT 1,
            unit_price_cents INTEGER NOT NULL DEFAULT 0,
            total_cents INTEGER NOT NULL DEFAULT 0
        );

        CREATE TABLE IF NOT EXISTS cash_movements (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            movement_type TEXT NOT NULL, -- 'ABERTURA', 'ENTRADA', 'SANGRIA', 'SUPRIMENTO', 'FECHAMENTO'
            amount_cents INTEGER NOT NULL DEFAULT 0,
            payment_method TEXT,
            description TEXT,
            operator TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );
        ",
    )?;

    // Migrações dinâmicas idempotentes para bancos existentes
    let _ = conn.execute("ALTER TABLE store_profile ADD COLUMN pix_key_type TEXT DEFAULT 'cnpj'", []);
    let _ = conn.execute("ALTER TABLE store_profile ADD COLUMN pix_key TEXT", []);
    let _ = conn.execute("ALTER TABLE store_profile ADD COLUMN pix_beneficiary TEXT", []);
    let _ = conn.execute("ALTER TABLE store_profile ADD COLUMN pix_city TEXT", []);
    let _ = conn.execute("ALTER TABLE store_profile ADD COLUMN tech_warranty_terms TEXT", []);
    let _ = conn.execute("ALTER TABLE store_profile ADD COLUMN tech_abandonment_terms TEXT", []);
    let _ = conn.execute("ALTER TABLE store_profile ADD COLUMN tech_default_warranty_days INTEGER DEFAULT 90", []);

    // Inicialização da tabela app_sequences e sementes seguras
    let _ = conn.execute(
        "CREATE TABLE IF NOT EXISTS app_sequences (
            sequence_name TEXT PRIMARY KEY,
            last_value INTEGER NOT NULL DEFAULT 1000,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )",
        [],
    );

    // Se já existem technical_orders, o last_value inicial deve ser >= ao maior número existente
    let max_os: i64 = conn
        .query_row(
            "SELECT IFNULL(MAX(CAST(order_number AS INTEGER)), 1000) FROM technical_orders WHERE order_number GLOB '[0-9]*'",
            [],
            |r| r.get(0),
        )
        .unwrap_or(1000);
    let init_os_seq = std::cmp::max(max_os, 1000);

    let _ = conn.execute(
        "INSERT OR IGNORE INTO app_sequences (sequence_name, last_value) VALUES ('tech_order', ?1)",
        params![init_os_seq],
    );

    // Se já existem receipt_history, o last_value inicial deve ser >= ao maior número existente
    let max_receipt: i64 = conn
        .query_row(
            "SELECT IFNULL(MAX(CAST(order_number AS INTEGER)), 1000) FROM receipt_history WHERE order_number GLOB '[0-9]*'",
            [],
            |r| r.get(0),
        )
        .unwrap_or(1000);
    let init_receipt_seq = std::cmp::max(max_receipt, 1000);

    let _ = conn.execute(
        "INSERT OR IGNORE INTO app_sequences (sequence_name, last_value) VALUES ('pos_receipt', ?1)",
        params![init_receipt_seq],
    );

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
                    neighborhood, city, state, zip, footer_message, onboarding_completed, updated_at,
                    pix_key_type, pix_key, pix_beneficiary, pix_city, tech_warranty_terms,
                    tech_abandonment_terms, tech_default_warranty_days
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
                pix_key_type: row.get(16)?,
                pix_key: row.get(17)?,
                pix_beneficiary: row.get(18)?,
                pix_city: row.get(19)?,
                tech_warranty_terms: row.get(20)?,
                tech_abandonment_terms: row.get(21)?,
                tech_default_warranty_days: row.get(22)?,
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
            neighborhood, city, state, zip, footer_message, onboarding_completed, updated_at,
            pix_key_type, pix_key, pix_beneficiary, pix_city, tech_warranty_terms,
            tech_abandonment_terms, tech_default_warranty_days
        ) VALUES (1, ?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16, ?17, ?18, ?19, ?20, ?21, ?22, ?23)
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
            updated_at = excluded.updated_at,
            pix_key_type = excluded.pix_key_type,
            pix_key = excluded.pix_key,
            pix_beneficiary = excluded.pix_beneficiary,
            pix_city = excluded.pix_city,
            tech_warranty_terms = excluded.tech_warranty_terms,
            tech_abandonment_terms = excluded.tech_abandonment_terms,
            tech_default_warranty_days = excluded.tech_default_warranty_days",
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
            now,
            profile.pix_key_type,
            profile.pix_key,
            profile.pix_beneficiary,
            profile.pix_city,
            profile.tech_warranty_terms,
            profile.tech_abandonment_terms,
            profile.tech_default_warranty_days
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

// ============================================================================
// Módulo de Clientes (Clientes MapOS & PDV)
// ============================================================================

pub fn list_clients_db(search: Option<String>) -> Result<Vec<Client>, String> {
    let conn = open_connection().map_err(|e| e.to_string())?;
    let sql = if let Some(ref s) = search {
        if !s.trim().is_empty() {
            "SELECT id, name, document, phone, whatsapp, email, street, number, complement,
                    neighborhood, city, state, zip, notes, created_at
             FROM clients
             WHERE name LIKE ?1 OR document LIKE ?1 OR phone LIKE ?1 OR whatsapp LIKE ?1
             ORDER BY name ASC LIMIT 100"
        } else {
            "SELECT id, name, document, phone, whatsapp, email, street, number, complement,
                    neighborhood, city, state, zip, notes, created_at
             FROM clients ORDER BY name ASC LIMIT 200"
        }
    } else {
        "SELECT id, name, document, phone, whatsapp, email, street, number, complement,
                neighborhood, city, state, zip, notes, created_at
         FROM clients ORDER BY name ASC LIMIT 200"
    };

    let mut stmt = conn.prepare(sql).map_err(|e| e.to_string())?;
    let param = search.map(|s| format!("%{}%", s.trim())).unwrap_or_default();

    let rows = if !param.is_empty() {
        stmt.query_map(params![param], map_client_row)
    } else {
        stmt.query_map([], map_client_row)
    }
    .map_err(|e| e.to_string())?;

    let mut clients = Vec::new();
    for row in rows {
        if let Ok(c) = row {
            clients.push(c);
        }
    }
    Ok(clients)
}

fn map_client_row(r: &rusqlite::Row) -> rusqlite::Result<Client> {
    Ok(Client {
        id: Some(r.get(0)?),
        name: r.get(1)?,
        document: r.get(2)?,
        phone: r.get(3)?,
        whatsapp: r.get(4)?,
        email: r.get(5)?,
        street: r.get(6)?,
        number: r.get(7)?,
        complement: r.get(8)?,
        neighborhood: r.get(9)?,
        city: r.get(10)?,
        state: r.get(11)?,
        zip: r.get(12)?,
        notes: r.get(13)?,
        created_at: r.get(14)?,
    })
}

pub fn save_client_db(client: &Client) -> Result<i64, String> {
    let conn = open_connection().map_err(|e| e.to_string())?;
    if let Some(id) = client.id {
        conn.execute(
            "UPDATE clients SET
                name = ?1, document = ?2, phone = ?3, whatsapp = ?4, email = ?5,
                street = ?6, number = ?7, complement = ?8, neighborhood = ?9,
                city = ?10, state = ?11, zip = ?12, notes = ?13
             WHERE id = ?14",
            params![
                client.name,
                client.document,
                client.phone,
                client.whatsapp,
                client.email,
                client.street,
                client.number,
                client.complement,
                client.neighborhood,
                client.city,
                client.state,
                client.zip,
                client.notes,
                id
            ],
        )
        .map_err(|e| e.to_string())?;
        Ok(id)
    } else {
        conn.execute(
            "INSERT INTO clients (
                name, document, phone, whatsapp, email, street, number, complement,
                neighborhood, city, state, zip, notes
            ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13)",
            params![
                client.name,
                client.document,
                client.phone,
                client.whatsapp,
                client.email,
                client.street,
                client.number,
                client.complement,
                client.neighborhood,
                client.city,
                client.state,
                client.zip,
                client.notes
            ],
        )
        .map_err(|e| e.to_string())?;
        Ok(conn.last_insert_rowid())
    }
}

pub fn delete_client_db(id: i64) -> Result<(), String> {
    let conn = open_connection().map_err(|e| e.to_string())?;
    conn.execute("DELETE FROM clients WHERE id = ?1", params![id])
        .map_err(|e| e.to_string())?;
    Ok(())
}

// ============================================================================
// Módulo de Produtos & Peças (com Controle de Estoque)
// ============================================================================

pub fn list_products_db(search: Option<String>) -> Result<Vec<Product>, String> {
    let conn = open_connection().map_err(|e| e.to_string())?;
    let sql = if let Some(ref s) = search {
        if !s.trim().is_empty() {
            "SELECT id, code, description, cost_price_cents, sale_price_cents, stock_qty, min_stock_qty, unit, category, created_at
             FROM products
             WHERE description LIKE ?1 OR code LIKE ?1 OR category LIKE ?1
             ORDER BY description ASC LIMIT 100"
        } else {
            "SELECT id, code, description, cost_price_cents, sale_price_cents, stock_qty, min_stock_qty, unit, category, created_at
             FROM products ORDER BY description ASC LIMIT 200"
        }
    } else {
        "SELECT id, code, description, cost_price_cents, sale_price_cents, stock_qty, min_stock_qty, unit, category, created_at
         FROM products ORDER BY description ASC LIMIT 200"
    };

    let mut stmt = conn.prepare(sql).map_err(|e| e.to_string())?;
    let param = search.map(|s| format!("%{}%", s.trim())).unwrap_or_default();

    let rows = if !param.is_empty() {
        stmt.query_map(params![param], map_product_row)
    } else {
        stmt.query_map([], map_product_row)
    }
    .map_err(|e| e.to_string())?;

    let mut prods = Vec::new();
    for row in rows {
        if let Ok(p) = row {
            prods.push(p);
        }
    }
    Ok(prods)
}

fn map_product_row(r: &rusqlite::Row) -> rusqlite::Result<Product> {
    Ok(Product {
        id: Some(r.get(0)?),
        code: r.get(1)?,
        description: r.get(2)?,
        cost_price_cents: r.get(3)?,
        sale_price_cents: r.get(4)?,
        stock_qty: r.get(5)?,
        min_stock_qty: r.get(6)?,
        unit: r.get(7)?,
        category: r.get(8)?,
        created_at: r.get(9)?,
    })
}

pub fn save_product_db(product: &Product) -> Result<i64, String> {
    let conn = open_connection().map_err(|e| e.to_string())?;
    if let Some(id) = product.id {
        conn.execute(
            "UPDATE products SET
                code = ?1, description = ?2, cost_price_cents = ?3, sale_price_cents = ?4,
                stock_qty = ?5, min_stock_qty = ?6, unit = ?7, category = ?8
             WHERE id = ?9",
            params![
                product.code,
                product.description,
                product.cost_price_cents,
                product.sale_price_cents,
                product.stock_qty,
                product.min_stock_qty,
                product.unit,
                product.category,
                id
            ],
        )
        .map_err(|e| e.to_string())?;
        Ok(id)
    } else {
        conn.execute(
            "INSERT INTO products (code, description, cost_price_cents, sale_price_cents, stock_qty, min_stock_qty, unit, category)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
            params![
                product.code,
                product.description,
                product.cost_price_cents,
                product.sale_price_cents,
                product.stock_qty,
                product.min_stock_qty,
                product.unit,
                product.category
            ],
        )
        .map_err(|e| e.to_string())?;
        Ok(conn.last_insert_rowid())
    }
}

pub fn delete_product_db(id: i64) -> Result<(), String> {
    let conn = open_connection().map_err(|e| e.to_string())?;
    conn.execute("DELETE FROM products WHERE id = ?1", params![id])
        .map_err(|e| e.to_string())?;
    Ok(())
}

// ============================================================================
// Módulo de Serviços (Mão de Obra)
// ============================================================================

pub fn list_services_db(search: Option<String>) -> Result<Vec<ServiceItem>, String> {
    let conn = open_connection().map_err(|e| e.to_string())?;
    let sql = if let Some(ref s) = search {
        if !s.trim().is_empty() {
            "SELECT id, name, price_cents, description, created_at FROM services WHERE name LIKE ?1 ORDER BY name ASC LIMIT 100"
        } else {
            "SELECT id, name, price_cents, description, created_at FROM services ORDER BY name ASC LIMIT 200"
        }
    } else {
        "SELECT id, name, price_cents, description, created_at FROM services ORDER BY name ASC LIMIT 200"
    };

    let mut stmt = conn.prepare(sql).map_err(|e| e.to_string())?;
    let param = search.map(|s| format!("%{}%", s.trim())).unwrap_or_default();

    let rows = if !param.is_empty() {
        stmt.query_map(params![param], map_service_row)
    } else {
        stmt.query_map([], map_service_row)
    }
    .map_err(|e| e.to_string())?;

    let mut list = Vec::new();
    for row in rows {
        if let Ok(s) = row {
            list.push(s);
        }
    }
    Ok(list)
}

fn map_service_row(r: &rusqlite::Row) -> rusqlite::Result<ServiceItem> {
    Ok(ServiceItem {
        id: Some(r.get(0)?),
        name: r.get(1)?,
        price_cents: r.get(2)?,
        description: r.get(3)?,
        created_at: r.get(4)?,
    })
}

pub fn save_service_db(service: &ServiceItem) -> Result<i64, String> {
    let conn = open_connection().map_err(|e| e.to_string())?;
    if let Some(id) = service.id {
        conn.execute(
            "UPDATE services SET name = ?1, price_cents = ?2, description = ?3 WHERE id = ?4",
            params![service.name, service.price_cents, service.description, id],
        )
        .map_err(|e| e.to_string())?;
        Ok(id)
    } else {
        conn.execute(
            "INSERT INTO services (name, price_cents, description) VALUES (?1, ?2, ?3)",
            params![service.name, service.price_cents, service.description],
        )
        .map_err(|e| e.to_string())?;
        Ok(conn.last_insert_rowid())
    }
}

pub fn delete_service_db(id: i64) -> Result<(), String> {
    let conn = open_connection().map_err(|e| e.to_string())?;
    conn.execute("DELETE FROM services WHERE id = ?1", params![id])
        .map_err(|e| e.to_string())?;
    Ok(())
}

// ============================================================================
// Módulo de Ordens de Serviço (Assistência Técnica MapOS)
// ============================================================================

pub fn list_technical_orders_db(
    status: Option<String>,
    search: Option<String>,
) -> Result<Vec<TechnicalOrder>, String> {
    let conn = open_connection().map_err(|e| e.to_string())?;

    let mut query = String::from(
        "SELECT id, order_number, client_id, equipment_type, brand_model, serial_imei,
                device_password, accessories, physical_condition, reported_defect,
                technical_diagnosis, solution, status, warranty_days, discount_cents,
                total_cents, notes, created_at, updated_at
         FROM technical_orders WHERE 1=1 ",
    );

    let mut param_values: Vec<String> = Vec::new();

    if let Some(ref st) = status {
        if !st.trim().is_empty() && st != "TODOS" {
            query.push_str("AND status = ? ");
            param_values.push(st.clone());
        }
    }

    if let Some(ref sc) = search {
        if !sc.trim().is_empty() {
            query.push_str("AND (order_number LIKE ? OR brand_model LIKE ? OR serial_imei LIKE ? OR reported_defect LIKE ?) ");
            let s_pattern = format!("%{}%", sc.trim());
            param_values.push(s_pattern.clone());
            param_values.push(s_pattern.clone());
            param_values.push(s_pattern.clone());
            param_values.push(s_pattern);
        }
    }

    query.push_str("ORDER BY id DESC LIMIT 150");

    let mut stmt = conn.prepare(&query).map_err(|e| e.to_string())?;
    let params_slice: Vec<&dyn rusqlite::ToSql> = param_values
        .iter()
        .map(|s| s as &dyn rusqlite::ToSql)
        .collect();

    let rows = stmt
        .query_map(&params_slice[..], |r| map_order_row(r))
        .map_err(|e| e.to_string())?;

    let mut list = Vec::new();
    for row in rows {
        if let Ok(order) = row {
            list.push(order);
        }
    }
    Ok(list)
}

fn map_order_row(r: &rusqlite::Row) -> rusqlite::Result<TechnicalOrder> {
    Ok(TechnicalOrder {
        id: Some(r.get(0)?),
        order_number: r.get(1)?,
        client_id: r.get(2)?,
        equipment_type: r.get(3)?,
        brand_model: r.get(4)?,
        serial_imei: r.get(5)?,
        device_password: r.get(6)?,
        accessories: r.get(7)?,
        physical_condition: r.get(8)?,
        reported_defect: r.get(9)?,
        technical_diagnosis: r.get(10)?,
        solution: r.get(11)?,
        status: r.get(12)?,
        warranty_days: r.get(13)?,
        discount_cents: r.get(14)?,
        total_cents: r.get(15)?,
        notes: r.get(16)?,
        created_at: r.get(17)?,
        updated_at: r.get(18)?,
    })
}

pub fn get_technical_order_db(id: i64) -> Result<TechnicalOrderWithDetails, String> {
    let conn = open_connection().map_err(|e| e.to_string())?;

    let mut stmt = conn
        .prepare(
            "SELECT id, order_number, client_id, equipment_type, brand_model, serial_imei,
                    device_password, accessories, physical_condition, reported_defect,
                    technical_diagnosis, solution, status, warranty_days, discount_cents,
                    total_cents, notes, created_at, updated_at
             FROM technical_orders WHERE id = ?1",
        )
        .map_err(|e| e.to_string())?;

    let order = stmt
        .query_row(params![id], |r| map_order_row(r))
        .map_err(|e| format!("Ordem de serviço {id} não encontrada: {e}"))?;

    // Busca cliente se houver
    let client = if let Some(client_id) = order.client_id {
        let mut cstmt = conn
            .prepare(
                "SELECT id, name, document, phone, whatsapp, email, street, number, complement,
                        neighborhood, city, state, zip, notes, created_at
                 FROM clients WHERE id = ?1",
            )
            .map_err(|e| e.to_string())?;
        cstmt.query_row(params![client_id], |r| map_client_row(r)).ok()
    } else {
        None
    };

    // Busca itens
    let mut istmt = conn
        .prepare(
            "SELECT id, order_id, item_type, reference_id, description, qty, unit_price_cents, total_cents
             FROM order_items WHERE order_id = ?1",
        )
        .map_err(|e| e.to_string())?;

    let item_rows = istmt
        .query_map(params![id], |r| {
            Ok(OrderItem {
                id: Some(r.get(0)?),
                order_id: Some(r.get(1)?),
                item_type: r.get(2)?,
                reference_id: r.get(3)?,
                description: r.get(4)?,
                qty: r.get(5)?,
                unit_price_cents: r.get(6)?,
                total_cents: r.get(7)?,
            })
        })
        .map_err(|e| e.to_string())?;

    let mut items = Vec::new();
    for i in item_rows {
        if let Ok(item) = i {
            items.push(item);
        }
    }

    Ok(TechnicalOrderWithDetails { order, client, items })
}

// ============================================================================
// Sequenciador Monotônico com Saltos Aleatórios & Memória Persistente (O.S. e PDV)
// ============================================================================

/// Gera um salto pseudo-aleatório seguro (1..5) baseado no relógio do sistema em nanos
fn generate_sequence_step(min_step: u32, max_step: u32) -> i64 {
    let now = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default();
    let nanos = now.as_nanos();
    let range = (max_step - min_step + 1) as u128;
    let step = (nanos % range) as u32 + min_step;
    step as i64
}

/// Incrementa de forma atômica e retorna o próximo número da sequência na transação.
/// Sempre cresce (estritamente monotônico crescente, logo nunca se repete).
pub fn generate_next_sequence_tx(
    tx: &rusqlite::Transaction,
    sequence_name: &str,
) -> Result<String, String> {
    let current_val: Option<i64> = tx
        .query_row(
            "SELECT last_value FROM app_sequences WHERE sequence_name = ?1",
            params![sequence_name],
            |r| r.get(0),
        )
        .optional()
        .map_err(|e| e.to_string())?;

    let base_val = current_val.unwrap_or(1000);
    let step = generate_sequence_step(1, 5);
    let next_val = base_val + step;

    tx.execute(
        "INSERT INTO app_sequences (sequence_name, last_value, updated_at)
         VALUES (?1, ?2, CURRENT_TIMESTAMP)
         ON CONFLICT(sequence_name) DO UPDATE SET
            last_value = ?2,
            updated_at = CURRENT_TIMESTAMP",
        params![sequence_name, next_val],
    )
    .map_err(|e| e.to_string())?;

    Ok(format!("{:04}", next_val))
}

/// Incrementa e retorna o próximo número da sequência com memória permanente no SQLite.
pub fn get_next_sequence_db(sequence_name: &str) -> Result<String, String> {
    let mut conn = open_connection().map_err(|e| e.to_string())?;
    let tx = conn.transaction().map_err(|e| e.to_string())?;
    let next_str = generate_next_sequence_tx(&tx, sequence_name)?;
    tx.commit().map_err(|e| e.to_string())?;
    Ok(next_str)
}

/// Consulta o número atual da sequência ou inicializa se ainda não existir.
pub fn get_current_sequence_db(sequence_name: &str) -> Result<String, String> {
    let conn = open_connection().map_err(|e| e.to_string())?;
    let current_val: Option<i64> = conn
        .query_row(
            "SELECT last_value FROM app_sequences WHERE sequence_name = ?1",
            params![sequence_name],
            |r| r.get(0),
        )
        .optional()
        .map_err(|e| e.to_string())?;

    match current_val {
        Some(v) => Ok(format!("{:04}", v)),
        None => get_next_sequence_db(sequence_name),
    }
}

pub fn save_technical_order_db(
    mut order: TechnicalOrder,
    items: Vec<OrderItem>,
) -> Result<i64, String> {
    let mut conn = open_connection().map_err(|e| e.to_string())?;
    let now = Utc::now().to_rfc3339();

    let tx = conn.transaction().map_err(|e| e.to_string())?;

    let order_id = if let Some(id) = order.id {
        tx.execute(
            "UPDATE technical_orders SET
                client_id = ?1, equipment_type = ?2, brand_model = ?3, serial_imei = ?4,
                device_password = ?5, accessories = ?6, physical_condition = ?7,
                reported_defect = ?8, technical_diagnosis = ?9, solution = ?10,
                status = ?11, warranty_days = ?12, discount_cents = ?13,
                total_cents = ?14, notes = ?15, updated_at = ?16
             WHERE id = ?17",
            params![
                order.client_id,
                order.equipment_type,
                order.brand_model,
                order.serial_imei,
                order.device_password,
                order.accessories,
                order.physical_condition,
                order.reported_defect,
                order.technical_diagnosis,
                order.solution,
                order.status,
                order.warranty_days,
                order.discount_cents,
                order.total_cents,
                order.notes,
                now,
                id
            ],
        )
        .map_err(|e| e.to_string())?;

        // Remove itens antigos para reinserção atômica
        tx.execute("DELETE FROM order_items WHERE order_id = ?1", params![id])
            .map_err(|e| e.to_string())?;

        id
    } else {
        // Se order_number for vazio, gera sequencial monotônico com salto aleatório e memória permanente
        if order.order_number.trim().is_empty() {
            order.order_number = generate_next_sequence_tx(&tx, "tech_order")?;
        }

        tx.execute(
            "INSERT INTO technical_orders (
                order_number, client_id, equipment_type, brand_model, serial_imei,
                device_password, accessories, physical_condition, reported_defect,
                technical_diagnosis, solution, status, warranty_days, discount_cents,
                total_cents, notes, created_at, updated_at
            ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16, ?17, ?18)",
            params![
                order.order_number,
                order.client_id,
                order.equipment_type,
                order.brand_model,
                order.serial_imei,
                order.device_password,
                order.accessories,
                order.physical_condition,
                order.reported_defect,
                order.technical_diagnosis,
                order.solution,
                order.status,
                order.warranty_days,
                order.discount_cents,
                order.total_cents,
                order.notes,
                now,
                now
            ],
        )
        .map_err(|e| e.to_string())?;

        tx.last_insert_rowid()
    };

    // Insere itens da O.S.
    for it in items {
        tx.execute(
            "INSERT INTO order_items (order_id, item_type, reference_id, description, qty, unit_price_cents, total_cents)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
            params![
                order_id,
                it.item_type,
                it.reference_id,
                it.description,
                it.qty,
                it.unit_price_cents,
                it.total_cents
            ],
        )
        .map_err(|e| e.to_string())?;
    }

    tx.commit().map_err(|e| e.to_string())?;
    Ok(order_id)
}

pub fn update_order_status_db(id: i64, new_status: &str) -> Result<(), String> {
    let conn = open_connection().map_err(|e| e.to_string())?;
    let now = Utc::now().to_rfc3339();
    conn.execute(
        "UPDATE technical_orders SET status = ?1, updated_at = ?2 WHERE id = ?3",
        params![new_status, now, id],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

// ============================================================================
// Módulo de PDV Universal (Vendas de Balcão e Caixa)
// ============================================================================

pub fn save_sale_db(mut sale: Sale, items: Vec<SaleItem>) -> Result<i64, String> {
    let mut conn = open_connection().map_err(|e| e.to_string())?;
    let now = Utc::now().to_rfc3339();

    let tx = conn.transaction().map_err(|e| e.to_string())?;

    if sale.sale_number.trim().is_empty() {
        let next_num: i64 = tx
            .query_row("SELECT IFNULL(MAX(id), 0) + 1 FROM sales", [], |r| r.get(0))
            .unwrap_or(1);
        sale.sale_number = format!("VD-{:04}", next_num);
    }

    tx.execute(
        "INSERT INTO sales (sale_number, client_id, subtotal_cents, discount_cents, total_cents, payment_method, status, created_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
        params![
            sale.sale_number,
            sale.client_id,
            sale.subtotal_cents,
            sale.discount_cents,
            sale.total_cents,
            sale.payment_method,
            sale.status,
            now
        ],
    )
    .map_err(|e| e.to_string())?;

    let sale_id = tx.last_insert_rowid();

    for it in items {
        tx.execute(
            "INSERT INTO sale_items (sale_id, product_id, description, qty, unit_price_cents, total_cents)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
            params![
                sale_id,
                it.product_id,
                it.description,
                it.qty,
                it.unit_price_cents,
                it.total_cents
            ],
        )
        .map_err(|e| e.to_string())?;

        // Baixa automática de estoque se o produto estiver cadastrado
        if let Some(prod_id) = it.product_id {
            tx.execute(
                "UPDATE products SET stock_qty = stock_qty - ?1 WHERE id = ?2",
                params![it.qty, prod_id],
            )
            .map_err(|e| e.to_string())?;
        }
    }

    // Registra entrada no caixa
    tx.execute(
        "INSERT INTO cash_movements (movement_type, amount_cents, payment_method, description, created_at)
         VALUES ('ENTRADA', ?1, ?2, ?3, ?4)",
        params![
            sale.total_cents,
            sale.payment_method,
            format!("Venda PDV {}", sale.sale_number),
            now
        ],
    )
    .map_err(|e| e.to_string())?;

    tx.commit().map_err(|e| e.to_string())?;
    Ok(sale_id)
}

pub fn list_sales_db(limit: u32) -> Result<Vec<Sale>, String> {
    let conn = open_connection().map_err(|e| e.to_string())?;
    let mut stmt = conn
        .prepare(
            "SELECT id, sale_number, client_id, subtotal_cents, discount_cents, total_cents, payment_method, status, created_at
             FROM sales ORDER BY id DESC LIMIT ?1",
        )
        .map_err(|e| e.to_string())?;

    let rows = stmt
        .query_map(params![limit], |r| {
            Ok(Sale {
                id: Some(r.get(0)?),
                sale_number: r.get(1)?,
                client_id: r.get(2)?,
                subtotal_cents: r.get(3)?,
                discount_cents: r.get(4)?,
                total_cents: r.get(5)?,
                payment_method: r.get(6)?,
                status: r.get(7)?,
                created_at: r.get(8)?,
            })
        })
        .map_err(|e| e.to_string())?;

    let mut list = Vec::new();
    for row in rows {
        if let Ok(s) = row {
            list.push(s);
        }
    }
    Ok(list)
}

pub fn add_cash_movement_db(movement: &CashMovement) -> Result<i64, String> {
    let conn = open_connection().map_err(|e| e.to_string())?;
    let now = Utc::now().to_rfc3339();

    conn.execute(
        "INSERT INTO cash_movements (movement_type, amount_cents, payment_method, description, operator, created_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
        params![
            movement.movement_type,
            movement.amount_cents,
            movement.payment_method,
            movement.description,
            movement.operator,
            now
        ],
    )
    .map_err(|e| e.to_string())?;

    Ok(conn.last_insert_rowid())
}

pub fn list_cash_movements_db(limit: u32) -> Result<Vec<CashMovement>, String> {
    let conn = open_connection().map_err(|e| e.to_string())?;
    let mut stmt = conn
        .prepare(
            "SELECT id, movement_type, amount_cents, payment_method, description, operator, created_at
             FROM cash_movements ORDER BY id DESC LIMIT ?1",
        )
        .map_err(|e| e.to_string())?;

    let rows = stmt
        .query_map(params![limit], |r| {
            Ok(CashMovement {
                id: Some(r.get(0)?),
                movement_type: r.get(1)?,
                amount_cents: r.get(2)?,
                payment_method: r.get(3)?,
                description: r.get(4)?,
                operator: r.get(5)?,
                created_at: r.get(6)?,
            })
        })
        .map_err(|e| e.to_string())?;

    let mut list = Vec::new();
    for row in rows {
        if let Ok(m) = row {
            list.push(m);
        }
    }
    Ok(list)
}

pub fn get_cash_summary_db() -> Result<CashSummary, String> {
    let conn = open_connection().map_err(|e| e.to_string())?;

    let total_sales: i64 = conn
        .query_row("SELECT IFNULL(SUM(total_cents), 0) FROM sales WHERE status = 'CONCLUIDA'", [], |r| r.get(0))
        .unwrap_or(0);

    let total_services: i64 = conn
        .query_row(
            "SELECT IFNULL(SUM(total_cents), 0) FROM technical_orders WHERE status = 'FATURADO_ENTREGUE'",
            [],
            |r| r.get(0),
        )
        .unwrap_or(0);

    let total_inflow: i64 = conn
        .query_row(
            "SELECT IFNULL(SUM(amount_cents), 0) FROM cash_movements WHERE movement_type IN ('ABERTURA', 'ENTRADA', 'SUPRIMENTO')",
            [],
            |r| r.get(0),
        )
        .unwrap_or(0);

    let total_outflow: i64 = conn
        .query_row(
            "SELECT IFNULL(SUM(amount_cents), 0) FROM cash_movements WHERE movement_type IN ('SANGRIA', 'FECHAMENTO')",
            [],
            |r| r.get(0),
        )
        .unwrap_or(0);

    let current_balance = total_inflow - total_outflow;

    Ok(CashSummary {
        total_sales_cents: total_sales,
        total_service_cents: total_services,
        total_inflow_cents: total_inflow,
        total_outflow_cents: total_outflow,
        current_balance_cents: current_balance,
    })
}

