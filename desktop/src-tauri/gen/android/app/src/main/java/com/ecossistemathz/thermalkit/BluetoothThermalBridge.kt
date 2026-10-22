package com.ecossistemathz.thermalkit

import android.app.Activity
import android.bluetooth.BluetoothAdapter
import android.bluetooth.BluetoothDevice
import android.bluetooth.BluetoothGatt
import android.bluetooth.BluetoothGattCallback
import android.bluetooth.BluetoothGattCharacteristic
import android.bluetooth.BluetoothManager
import android.bluetooth.BluetoothProfile
import android.bluetooth.BluetoothSocket
import android.bluetooth.le.ScanCallback
import android.bluetooth.le.ScanResult
import android.content.Context
import android.content.pm.PackageManager
import android.os.Build
import android.util.Base64
import android.util.Log
import android.webkit.JavascriptInterface
import androidx.core.app.ActivityCompat
import androidx.core.content.ContextCompat
import org.json.JSONArray
import org.json.JSONObject
import java.util.UUID
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit

/**
 * Ponte JavaScript universal para comunicação Bluetooth com impressoras térmicas
 * ESC/POS (58mm / 80mm), suportando tanto Bluetooth Clássico (SPP / RFCOMM)
 * quanto Bluetooth Low Energy (BLE GATT).
 */
class BluetoothThermalBridge(private val activity: Activity) {

    companion object {
        private const val TAG = "THZ_BT_Bridge"
        private val SPP_UUID: UUID = UUID.fromString("00001101-0000-1000-8000-00805F9B34FB")
        private const val REQ_CODE_BT_PERMS = 7391

        // UUIDs conhecidos de serviços de escrita ESC/POS em impressoras térmicas BLE
        private val KNOWN_BLE_WRITE_UUIDS = listOf(
            "0000fff2-0000-1000-8000-00805f9b34fb", // GOOJPRT, MPT, Mprinter
            "0000bef7-0000-1000-8000-00805f9b34fb", // Xprinter / POS
            "0000ff02-0000-1000-8000-00805f9b34fb", // Cat / Peripage
            "49535343-8841-43f4-a540-e44f43b8417c"  // Microchip ISSC UART
        )
    }

    private val bluetoothAdapter: BluetoothAdapter? by lazy {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            val manager = activity.getSystemService(Context.BLUETOOTH_SERVICE) as? BluetoothManager
            manager?.adapter
        } else {
            @Suppress("DEPRECATION")
            BluetoothAdapter.getDefaultAdapter()
        }
    }

    // Mapa temporário de dispositivos descobertos por Scan BLE ativo
    private val scannedBleDevices = ConcurrentHashMap<String, BluetoothDevice>()
    private var isScanning = false
    private var scanCallback: ScanCallback? = null

    @JavascriptInterface
    fun isEnabled(): Boolean {
        return bluetoothAdapter?.isEnabled == true
    }

    @JavascriptInterface
    fun hasPermissions(): Boolean {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            return ContextCompat.checkSelfPermission(
                activity,
                android.Manifest.permission.BLUETOOTH_CONNECT
            ) == PackageManager.PERMISSION_GRANTED
        }
        return true
    }

    @JavascriptInterface
    fun requestPermissions() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            val perms = arrayOf(
                android.Manifest.permission.BLUETOOTH_CONNECT,
                android.Manifest.permission.BLUETOOTH_SCAN
            )
            activity.runOnUiThread {
                ActivityCompat.requestPermissions(activity, perms, REQ_CODE_BT_PERMS)
            }
        }
    }

    /**
     * Lista todos os dispositivos Bluetooth pareados/vinculados no Android (Classic + BLE).
     */
    @JavascriptInterface
    fun listPairedDevices(): String {
        val adapter = bluetoothAdapter
            ?: return errorJson("Bluetooth não suportado neste aparelho")

        if (!adapter.isEnabled) {
            return errorJson("Bluetooth está desativado no aparelho")
        }

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            if (ContextCompat.checkSelfPermission(activity, android.Manifest.permission.BLUETOOTH_CONNECT)
                != PackageManager.PERMISSION_GRANTED
            ) {
                requestPermissions()
                return errorJson("Permissão de Dispositivos Próximos (Bluetooth) necessária. Autorize na tela do sistema.")
            }
        }

        return try {
            val paired = adapter.bondedDevices ?: emptySet<BluetoothDevice>()
            val array = JSONArray()

            for (device in paired) {
                val item = JSONObject()
                val devName = try {
                    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
                        device.alias?.takeIf { it.isNotBlank() } ?: device.name
                    } else {
                        device.name
                    }
                } catch (_: Exception) {
                    null
                } ?: "Impressora Térmica (${device.address})"

                item.put("name", devName)
                item.put("address", device.address)
                item.put("type", device.type) // 1=Classic, 2=LE, 3=Dual, 0=Unknown
                item.put("isBle", device.type == BluetoothDevice.DEVICE_TYPE_LE || device.type == BluetoothDevice.DEVICE_TYPE_DUAL)
                item.put("bondState", device.bondState)
                array.put(item)
            }

            // Adiciona também dispositivos BLE encontrados via scan recente que ainda não estejam na lista
            for ((addr, dev) in scannedBleDevices) {
                if (paired.none { it.address.equals(addr, ignoreCase = true) }) {
                    val item = JSONObject()
                    val devName = try {
                        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
                            dev.alias?.takeIf { it.isNotBlank() } ?: dev.name
                        } else {
                            dev.name
                        }
                    } catch (_: Exception) {
                        null
                    } ?: "Impressora BLE (${dev.address})"

                    item.put("name", "$devName (BLE Próxima)")
                    item.put("address", dev.address)
                    item.put("type", dev.type)
                    item.put("isBle", true)
                    item.put("bondState", dev.bondState)
                    array.put(item)
                }
            }

            val result = JSONObject()
            result.put("success", true)
            result.put("devices", array)
            result.toString()
        } catch (e: Exception) {
            errorJson("Falha ao listar dispositivos Bluetooth: ${e.message}")
        }
    }

    /**
     * Inicia varredura ativa de dispositivos Bluetooth Low Energy (BLE) por 10 segundos.
     */
    @JavascriptInterface
    fun startBleScan(): String {
        val adapter = bluetoothAdapter
            ?: return errorJson("Bluetooth não disponível")

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            if (ContextCompat.checkSelfPermission(activity, android.Manifest.permission.BLUETOOTH_SCAN)
                != PackageManager.PERMISSION_GRANTED
            ) {
                requestPermissions()
                return errorJson("Permissão BLUETOOTH_SCAN necessária")
            }
        }

        val scanner = adapter.bluetoothLeScanner
            ?: return errorJson("LeScanner não disponível")

        if (isScanning) {
            return JSONObject().put("success", true).put("scanning", true).toString()
        }

        try {
            scannedBleDevices.clear()
            val cb = object : ScanCallback() {
                override fun onScanResult(callbackType: Int, result: ScanResult?) {
                    result?.device?.let { dev ->
                        scannedBleDevices[dev.address] = dev
                    }
                }
            }
            scanCallback = cb
            scanner.startScan(cb)
            isScanning = true

            // Para o scan automaticamente após 10 segundos
            activity.window.decorView.postDelayed({
                stopBleScanInternal()
            }, 10000)

            val res = JSONObject()
            res.put("success", true)
            res.put("scanning", true)
            return res.toString()
        } catch (e: Exception) {
            return errorJson("Falha ao iniciar varredura BLE: ${e.message}")
        }
    }

    @JavascriptInterface
    fun stopBleScan(): String {
        stopBleScanInternal()
        val res = JSONObject()
        res.put("success", true)
        res.put("scanning", false)
        return res.toString()
    }

    private fun stopBleScanInternal() {
        if (!isScanning) return
        try {
            val scanner = bluetoothAdapter?.bluetoothLeScanner
            scanCallback?.let { scanner?.stopScan(it) }
        } catch (_: Exception) {}
        scanCallback = null
        isScanning = false
    }

    /**
     * Envia bytes ESC/POS crus (codificados em Base64) diretamente para a impressora.
     * Suporta envio via SPP RFCOMM ou GATT BLE automaticamente.
     */
    @JavascriptInterface
    fun printRaw(address: String, base64Payload: String): String {
        val adapter = bluetoothAdapter
            ?: return errorJson("Bluetooth não suportado neste aparelho")

        if (!adapter.isEnabled) {
            return errorJson("Bluetooth está desativado no aparelho")
        }

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            if (ContextCompat.checkSelfPermission(activity, android.Manifest.permission.BLUETOOTH_CONNECT)
                != PackageManager.PERMISSION_GRANTED
            ) {
                requestPermissions()
                return errorJson("Permissão BLUETOOTH_CONNECT não concedida")
            }
        }

        val rawBytes: ByteArray
        try {
            rawBytes = Base64.decode(base64Payload, Base64.DEFAULT)
        } catch (e: Exception) {
            return errorJson("Falha ao decodificar Base64: ${e.message}")
        }

        val device: BluetoothDevice = try {
            adapter.getRemoteDevice(address)
        } catch (e: Exception) {
            return errorJson("Endereço Bluetooth inválido: ${e.message}")
        }

        // Se o dispositivo for puramente BLE, tenta GATT primeiro
        if (device.type == BluetoothDevice.DEVICE_TYPE_LE) {
            val bleResult = printViaGatt(device, rawBytes)
            if (bleResult.getBoolean("success")) {
                return bleResult.toString()
            }
            Log.w(TAG, "Tentativa BLE falhou, tentando fallback RFCOMM...")
        }

        // Tentativa primária: RFCOMM SPP Clássico
        val rfcommResult = printViaRfcomm(adapter, device, rawBytes)
        if (rfcommResult.getBoolean("success")) {
            return rfcommResult.toString()
        }

        // Se RFCOMM falhar (muito comum em dispositivos anunciados como Dual/LE), tenta GATT BLE
        val gattFallback = printViaGatt(device, rawBytes)
        if (gattFallback.getBoolean("success")) {
            return gattFallback.toString()
        }

        // Se ambos falharem, retorna o erro descritivo
        return errorJson("Falha ao comunicar com a impressora ($address): " +
                "RFCOMM: ${rfcommResult.optString("error")}; " +
                "GATT BLE: ${gattFallback.optString("error")}")
    }

    /**
     * Envio via Socket RFCOMM (Bluetooth Clássico SPP).
     */
    private fun printViaRfcomm(adapter: BluetoothAdapter, device: BluetoothDevice, rawBytes: ByteArray): JSONObject {
        var socket: BluetoothSocket? = null
        try {
            if (adapter.isDiscovering) {
                adapter.cancelDiscovery()
            }

            // Tentativa 1: UUID padrão SPP
            var connected = false
            try {
                socket = device.createRfcommSocketToServiceRecord(SPP_UUID)
                socket.connect()
                connected = true
            } catch (_: Exception) {
                try { socket?.close() } catch (_: Exception) {}
            }

            // Tentativa 2: Fallback por reflexão no canal 1
            if (!connected) {
                val createRfcommMethod = device.javaClass.getMethod("createRfcommSocket", Int::class.javaPrimitiveType)
                socket = createRfcommMethod.invoke(device, 1) as BluetoothSocket
                socket.connect()
            }

            val activeSocket = socket ?: return JSONObject().put("success", false).put("error", "Socket nulo")
            val stream = activeSocket.outputStream
            stream.write(rawBytes)
            stream.flush()

            Thread.sleep(250) // Aguarda consumo do buffer

            val ok = JSONObject()
            ok.put("success", true)
            ok.put("transport", "rfcomm")
            ok.put("bytesSent", rawBytes.size)
            return ok
        } catch (e: Exception) {
            val err = JSONObject()
            err.put("success", false)
            err.put("error", e.message ?: "Erro desconhecido")
            return err
        } finally {
            try { socket?.close() } catch (_: Exception) {}
        }
    }

    /**
     * Envio via Bluetooth Low Energy (BLE GATT Write).
     */
    private fun printViaGatt(device: BluetoothDevice, rawBytes: ByteArray): JSONObject {
        val latch = CountDownLatch(1)
        var writeCharacteristic: BluetoothGattCharacteristic? = null
        var gattInstance: BluetoothGatt? = null
        var lastError: String? = null
        var success = false

        val gattCallback = object : BluetoothGattCallback() {
            override fun onConnectionStateChange(gatt: BluetoothGatt, status: Int, newState: Int) {
                if (newState == BluetoothProfile.STATE_CONNECTED) {
                    try {
                        gatt.discoverServices()
                    } catch (e: Exception) {
                        lastError = "Erro ao iniciar descoberta de serviços: ${e.message}"
                        latch.countDown()
                    }
                } else if (newState == BluetoothProfile.STATE_DISCONNECTED) {
                    if (!success) {
                        lastError = "Dispositivo BLE desconectado (status: $status)"
                    }
                    latch.countDown()
                }
            }

            override fun onServicesDiscovered(gatt: BluetoothGatt, status: Int) {
                if (status == BluetoothGatt.GATT_SUCCESS) {
                    // Procura característica de escrita
                    for (service in gatt.services) {
                        for (ch in service.characteristics) {
                            val props = ch.properties
                            val canWrite = (props and BluetoothGattCharacteristic.PROPERTY_WRITE != 0) ||
                                           (props and BluetoothGattCharacteristic.PROPERTY_WRITE_NO_RESPONSE != 0)
                            if (canWrite) {
                                val uuidStr = ch.uuid.toString().lowercase()
                                // Prioriza características conhecidas de ESC/POS
                                if (KNOWN_BLE_WRITE_UUIDS.any { uuidStr.contains(it) }) {
                                    writeCharacteristic = ch
                                    break
                                }
                                if (writeCharacteristic == null) {
                                    writeCharacteristic = ch
                                }
                            }
                        }
                        if (writeCharacteristic != null && KNOWN_BLE_WRITE_UUIDS.any { writeCharacteristic!!.uuid.toString().lowercase().contains(it) }) {
                            break
                        }
                    }

                    if (writeCharacteristic != null) {
                        // Tenta solicitar MTU maior (até 512) para transferência mais rápida
                        try {
                            gatt.requestMtu(247)
                        } catch (_: Exception) {}
                    } else {
                        lastError = "Nenhuma característica de escrita ESC/POS encontrada nos serviços GATT"
                    }
                } else {
                    lastError = "Falha ao descobrir serviços GATT: status $status"
                }
                latch.countDown()
            }

            override fun onMtuChanged(gatt: BluetoothGatt, mtu: Int, status: Int) {
                latch.countDown()
            }
        }

        try {
            gattInstance = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                device.connectGatt(activity, false, gattCallback, BluetoothDevice.TRANSPORT_LE)
            } else {
                device.connectGatt(activity, false, gattCallback)
            }

            // Aguarda conexão e descoberta de serviços (máximo 6 segundos)
            val connectedInTime = latch.await(6, TimeUnit.SECONDS)
            if (!connectedInTime || writeCharacteristic == null) {
                val err = JSONObject()
                err.put("success", false)
                err.put("error", lastError ?: "Timeout na conexão GATT BLE")
                return err
            }

            val targetChar = writeCharacteristic!!
            val chunkSize = 100 // Tamanho seguro de pacote BLE
            var offset = 0

            while (offset < rawBytes.size) {
                val end = minOf(offset + chunkSize, rawBytes.size)
                val chunk = rawBytes.copyOfRange(offset, end)

                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
                    val writeType = if (targetChar.properties and BluetoothGattCharacteristic.PROPERTY_WRITE_NO_RESPONSE != 0) {
                        BluetoothGattCharacteristic.WRITE_TYPE_NO_RESPONSE
                    } else {
                        BluetoothGattCharacteristic.WRITE_TYPE_DEFAULT
                    }
                    gattInstance?.writeCharacteristic(targetChar, chunk, writeType)
                } else {
                    @Suppress("DEPRECATION")
                    targetChar.value = chunk
                    @Suppress("DEPRECATION")
                    targetChar.writeType = if (targetChar.properties and BluetoothGattCharacteristic.PROPERTY_WRITE_NO_RESPONSE != 0) {
                        BluetoothGattCharacteristic.WRITE_TYPE_NO_RESPONSE
                    } else {
                        BluetoothGattCharacteristic.WRITE_TYPE_DEFAULT
                    }
                    @Suppress("DEPRECATION")
                    gattInstance?.writeCharacteristic(targetChar)
                }

                offset += chunkSize
                Thread.sleep(30) // Pequeno intervalo para escoamento do rádio BLE
            }

            success = true
            val ok = JSONObject()
            ok.put("success", true)
            ok.put("transport", "ble_gatt")
            ok.put("bytesSent", rawBytes.size)
            return ok
        } catch (e: Exception) {
            val err = JSONObject()
            err.put("success", false)
            err.put("error", "Exceção no envio BLE GATT: ${e.message}")
            return err
        } finally {
            try {
                gattInstance?.disconnect()
                gattInstance?.close()
            } catch (_: Exception) {}
        }
    }

    private fun errorJson(msg: String): String {
        val err = JSONObject()
        err.put("success", false)
        err.put("error", msg)
        return err.toString()
    }
}
