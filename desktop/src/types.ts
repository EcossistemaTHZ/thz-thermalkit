export interface PrinterDto {
  name: string;
  display_info: string;
  is_bluetooth: boolean;
  port: string | null;
  transport_type: 'usb' | 'com';
  target: string;
}

export interface DocumentPreviewDto {
  file_name: string;
  file_path: string;
  file_size: number;
  kind: 'text' | 'raster';
  text_content: string | null;
  preview_image_base64: string | null;
  page_count: number;
  width_dots: number;
}

export interface PrintJobRequest {
  file_path?: string | null;
  direct_text?: string | null;
  target_transport: string;
  target_param: string;
  baud?: number | null;
  code_page?: number | null;
  width_dots?: number | null;
}

export interface StoreProfileDto {
  name: string;
  legal_name?: string | null;
  doc: string;
  phone?: string | null;
  whatsapp?: string | null;
  email?: string | null;
  street?: string | null;
  number?: string | null;
  complement?: string | null;
  neighborhood?: string | null;
  city?: string | null;
  state?: string | null;
  zip?: string | null;
  footer_message?: string | null;
  address?: string | null;
  pix_key_type?: string | null;
  pix_key?: string | null;
  pix_beneficiary?: string | null;
  pix_city?: string | null;
  tech_warranty_terms?: string | null;
  tech_abandonment_terms?: string | null;
  tech_default_warranty_days?: number | null;
  onboarding_completed: boolean;
  updated_at?: string | null;
}

export interface AppConfigDto {
  app_name: string;
  app_subtitle: string;
  accent_color: string;
  default_width_dots: number;
  default_code_page: number;
  show_file_tab: boolean;
  show_direct_text_tab: boolean;
  updated_at?: string | null;
}

export interface ConfigSnapshotDto {
  id: number;
  snapshot_type: string;
  payload_json: string;
  description?: string | null;
  created_at: string;
}

export interface DatabaseStatsDto {
  file_path: string;
  file_size_bytes: number;
  wal_mode: boolean;
  total_receipts: number;
  total_snapshots: number;
}

export interface ReceiptHistoryItemDto {
  id: number;
  order_number?: string | null;
  customer_name?: string | null;
  total_cents: number;
  payment_method?: string | null;
  raw_text: string;
  created_at: string;
}

export interface WhiteLabelBundleDto {
  version: string;
  app_config: AppConfigDto;
  store_profile: StoreProfileDto;
  exported_at: string;
}

// ----------------------------------------------------------------------------
// DTOs: Clientes, Produtos, Serviços, O.S., Vendas e Caixa
// ----------------------------------------------------------------------------

export interface ClientDto {
  id?: number | null;
  name: string;
  document?: string | null;
  phone?: string | null;
  whatsapp?: string | null;
  email?: string | null;
  street?: string | null;
  number?: string | null;
  complement?: string | null;
  neighborhood?: string | null;
  city?: string | null;
  state?: string | null;
  zip?: string | null;
  notes?: string | null;
  created_at?: string | null;
}

export interface ProductDto {
  id?: number | null;
  code: string;
  description: string;
  cost_price_cents: number;
  sale_price_cents: number;
  stock_qty: number;
  min_stock_qty: number;
  unit: string;
  category?: string | null;
  created_at?: string | null;
}

export interface ServiceItemDto {
  id?: number | null;
  name: string;
  price_cents: number;
  description?: string | null;
  created_at?: string | null;
}

export type TechnicalOrderStatus =
  | 'ORCAMENTO'
  | 'AGUARDANDO_APROVACAO'
  | 'APROVADO'
  | 'EM_MANUTENCAO'
  | 'AGUARDANDO_PECAS'
  | 'PRONTO'
  | 'FATURADO_ENTREGUE'
  | 'CANCELADO';

export interface TechnicalOrderDto {
  id?: number | null;
  order_number: string;
  client_id?: number | null;
  equipment_type: string;
  brand_model: string;
  serial_imei?: string | null;
  device_password?: string | null;
  accessories?: string | null;
  physical_condition?: string | null;
  reported_defect: string;
  technical_diagnosis?: string | null;
  solution?: string | null;
  status: TechnicalOrderStatus;
  warranty_days: number;
  discount_cents: number;
  total_cents: number;
  notes?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
}

export interface OrderItemDto {
  id?: number | null;
  order_id?: number | null;
  item_type: 'product' | 'service';
  reference_id?: number | null;
  description: string;
  qty: number;
  unit_price_cents: number;
  total_cents: number;
}

export interface TechnicalOrderWithDetailsDto {
  order: TechnicalOrderDto;
  client?: ClientDto | null;
  items: OrderItemDto[];
}

export interface SaleDto {
  id?: number | null;
  sale_number: string;
  client_id?: number | null;
  subtotal_cents: number;
  discount_cents: number;
  total_cents: number;
  payment_method: string;
  status: string;
  created_at?: string | null;
}

export interface SaleItemDto {
  id?: number | null;
  sale_id?: number | null;
  product_id?: number | null;
  description: string;
  qty: number;
  unit_price_cents: number;
  total_cents: number;
}

export interface CashMovementDto {
  id?: number | null;
  movement_type: 'ABERTURA' | 'ENTRADA' | 'SANGRIA' | 'SUPRIMENTO' | 'FECHAMENTO';
  amount_cents: number;
  payment_method?: string | null;
  description?: string | null;
  operator?: string | null;
  created_at?: string | null;
}

export interface CashSummaryDto {
  total_sales_cents: number;
  total_service_cents: number;
  total_inflow_cents: number;
  total_outflow_cents: number;
  current_balance_cents: number;
}

