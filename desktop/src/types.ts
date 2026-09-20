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
