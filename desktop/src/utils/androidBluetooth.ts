// Bridge TypeScript para a interface nativa AndroidBluetooth (Bluetooth SPP / RFCOMM + BLE GATT)

export interface BluetoothDevice {
  name: string;
  address: string; // Endereço MAC (ex.: "66:32:8D:19:98:99")
  type: number; // 1 = Classic, 2 = LE, 3 = Dual
  isBle?: boolean;
  bondState?: number;
}

export interface BluetoothPrintResult {
  success: boolean;
  transport?: 'rfcomm' | 'ble_gatt';
  bytesSent?: number;
  error?: string;
}

// Declaração global para window.AndroidBluetooth
declare global {
  interface Window {
    AndroidBluetooth?: {
      isEnabled: () => boolean;
      hasPermissions: () => boolean;
      requestPermissions: () => void;
      listPairedDevices: () => string; // Retorna JSON string
      startBleScan: () => string; // Inicia varredura BLE
      stopBleScan: () => string; // Para varredura BLE
      printRaw: (address: string, base64Payload: string) => string; // Retorna JSON string
    };
  }
}

/**
 * Verifica se o aplicativo está sendo executado no Android com o bridge Bluetooth ativo.
 */
export function isAndroidBluetoothAvailable(): boolean {
  return typeof window !== 'undefined' && typeof window.AndroidBluetooth !== 'undefined';
}

/**
 * Verifica se o adaptador Bluetooth está ligado no dispositivo Android.
 */
export function isBluetoothEnabled(): boolean {
  if (!isAndroidBluetoothAvailable()) return false;
  try {
    return window.AndroidBluetooth!.isEnabled();
  } catch {
    return false;
  }
}

/**
 * Verifica se as permissões de Bluetooth (BLUETOOTH_CONNECT) já foram concedidas no Android 12+.
 */
export function hasBluetoothPermissions(): boolean {
  if (!isAndroidBluetoothAvailable()) return false;
  try {
    return window.AndroidBluetooth!.hasPermissions();
  } catch {
    return false;
  }
}

/**
 * Solicita as permissões de Bluetooth ao usuário em runtime.
 */
export function requestBluetoothPermissions(): void {
  if (!isAndroidBluetoothAvailable()) return;
  try {
    window.AndroidBluetooth!.requestPermissions();
  } catch (err) {
    console.error('Erro ao solicitar permissões Bluetooth:', err);
  }
}

/**
 * Inicia varredura ativa de dispositivos BLE próximos.
 */
export function startBleScan(): boolean {
  if (!isAndroidBluetoothAvailable()) return false;
  try {
    const raw = window.AndroidBluetooth!.startBleScan();
    const parsed = JSON.parse(raw);
    return !!parsed.success;
  } catch (err) {
    console.error('Erro ao iniciar scan BLE:', err);
    return false;
  }
}

/**
 * Para a varredura ativa de dispositivos BLE.
 */
export function stopBleScan(): void {
  if (!isAndroidBluetoothAvailable()) return;
  try {
    window.AndroidBluetooth!.stopBleScan();
  } catch (err) {
    console.error('Erro ao parar scan BLE:', err);
  }
}

/**
 * Lista todos os dispositivos Bluetooth pareados e BLE detectados no Android.
 */
export async function listPairedBluetoothPrinters(): Promise<BluetoothDevice[]> {
  if (!isAndroidBluetoothAvailable()) return [];

  try {
    const rawJson = window.AndroidBluetooth!.listPairedDevices();
    const parsed = JSON.parse(rawJson);

    if (parsed.success && Array.isArray(parsed.devices)) {
      return parsed.devices;
    } else if (parsed.error) {
      console.warn('AndroidBluetooth:', parsed.error);
      if (parsed.error.includes('Permissão')) {
        requestBluetoothPermissions();
      }
    }
    return [];
  } catch (err) {
    console.error('Erro ao listar dispositivos Bluetooth:', err);
    return [];
  }
}

/**
 * Converte um buffer Uint8Array em string Base64.
 */
export function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  const len = bytes.byteLength;
  for (let i = 0; i < len; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return window.btoa(binary);
}

/**
 * Envia bytes ESC/POS crus (codificados em Base64) diretamente para a impressora Bluetooth
 * (usando SPP RFCOMM ou GATT BLE com failover automático).
 *
 * @param address Endereço MAC da impressora pareada
 * @param base64Payload Sequência de bytes ESC/POS em Base64
 */
export async function printRawBluetooth(address: string, base64Payload: string): Promise<BluetoothPrintResult> {
  if (!isAndroidBluetoothAvailable()) {
    return { success: false, error: 'Ponte AndroidBluetooth não disponível neste ambiente' };
  }

  try {
    const rawJson = window.AndroidBluetooth!.printRaw(address, base64Payload);
    const parsed: BluetoothPrintResult = JSON.parse(rawJson);
    return parsed;
  } catch (err: any) {
    return {
      success: false,
      error: err?.message || 'Falha ao comunicar com impressora Bluetooth',
    };
  }
}
