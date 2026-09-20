import React from 'react';
import { PrinterDto } from '../types';
import { Printer, Bluetooth, Usb, RefreshCw } from 'lucide-react';

interface HeaderProps {
  selectedPrinter: PrinterDto | null;
  printersCount: number;
  onRefresh: () => void;
  isRefreshing: boolean;
}

export const Header: React.FC<HeaderProps> = ({
  selectedPrinter,
  printersCount,
  onRefresh,
  isRefreshing,
}) => {
  const isConnected = !!selectedPrinter;
  const isBt = selectedPrinter?.is_bluetooth;

  return (
    <header className="app-header">
      <div className="brand-section">
        <div className="brand-icon-box">
          <Printer size={22} color="#ffffff" />
        </div>
        <div>
          <h1 className="brand-title">THZ ThermalKit</h1>
          <p className="brand-subtitle">Direct ESC/POS Driverless Printing</p>
        </div>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
        <button
          className="btn-secondary"
          onClick={onRefresh}
          disabled={isRefreshing}
          title="Atualizar lista de dispositivos conectados"
        >
          <RefreshCw
            size={15}
            className={isRefreshing ? 'spin-animation' : ''}
          />
          <span>{isRefreshing ? 'Buscando...' : `Atualizar (${printersCount})`}</span>
        </button>

        <div className="header-status-badge">
          <div
            className={`status-indicator-dot ${
              isConnected ? (isBt ? 'bluetooth' : 'usb') : 'disconnected'
            }`}
          />
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            {isConnected ? (
              isBt ? (
                <>
                  <Bluetooth size={15} color="var(--accent-bt)" />
                  <span style={{ color: 'var(--accent-bt)' }}>
                    {selectedPrinter.name} ({selectedPrinter.port || 'Bluetooth'})
                  </span>
                </>
              ) : (
                <>
                  <Usb size={15} color="var(--accent-usb)" />
                  <span style={{ color: 'var(--accent-usb)' }}>
                    {selectedPrinter.name} (USB Direto)
                  </span>
                </>
              )
            ) : (
              <span style={{ color: 'var(--accent-danger)' }}>
                Nenhuma impressora conectada
              </span>
            )}
          </div>
        </div>
      </div>
    </header>
  );
};
