package com.ecossistemathz.thermalkit

import android.content.pm.PackageManager
import android.os.Build
import android.os.Bundle
import android.webkit.WebView
import androidx.activity.enableEdgeToEdge
import androidx.core.app.ActivityCompat
import androidx.core.content.ContextCompat

class MainActivity : TauriActivity() {
  override fun onCreate(savedInstanceState: Bundle?) {
    enableEdgeToEdge()
    super.onCreate(savedInstanceState)
    requestBluetoothPermissionsIfNeeded()
  }

  private fun requestBluetoothPermissionsIfNeeded() {
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
      val needed = mutableListOf<String>()
      if (ContextCompat.checkSelfPermission(this, android.Manifest.permission.BLUETOOTH_CONNECT) != PackageManager.PERMISSION_GRANTED) {
        needed.add(android.Manifest.permission.BLUETOOTH_CONNECT)
      }
      if (ContextCompat.checkSelfPermission(this, android.Manifest.permission.BLUETOOTH_SCAN) != PackageManager.PERMISSION_GRANTED) {
        needed.add(android.Manifest.permission.BLUETOOTH_SCAN)
      }
      if (needed.isNotEmpty()) {
        ActivityCompat.requestPermissions(this, needed.toTypedArray(), 7391)
      }
    }
  }

  override fun onWebViewCreate(webView: WebView) {
    super.onWebViewCreate(webView)
    webView.addJavascriptInterface(BluetoothThermalBridge(this), "AndroidBluetooth")
  }
}
