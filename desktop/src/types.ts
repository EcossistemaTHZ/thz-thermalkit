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
