import React, { useState } from 'react';
import { PrinterDto } from '../types';
import { Sliders, CheckCircle2, AlertCircle, PlayCircle, Settings2 } from 'lucide-react';
import { invoke } from '@tauri-apps/api/core';

interface SidebarProps {
  printers: PrinterDto[];
  selectedPrinter: PrinterDto | null;
  onSelectPrinter: (printer: PrinterDto) => void;
  widthDots: number;
  codePage: number;
  onUpdateWidth: (width: number) => void;
  onUpdateCodePage: (cp: number) => void;
}

export const Sidebar: React.FC<SidebarProps> = ({
  printers,
  selectedPrinter,
  onSelectPrinter,
  widthDots,
  codePage,
  onUpdateWidth,
  onUpdateCodePage,
}) => {
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<string | null>(null);
  const [testError, setTestError] = useState<string | null>(null);

  const handleTestPrint = async () => {
    if (!selectedPrinter) return;
    setTesting(true);
    setTestResult(null);
    setTestError(null);

    try {
      const msg = await invoke<string>('print_test_probe', {
        targetTransport: selectedPrinter.transport_type,
        targetParam: selectedPrinter.target,
      });
      setTestResult(msg);
      setTimeout(() => setTestResult(null), 4000);
    } catch (err) {
      setTestError(String(err));
      setTimeout(() => setTestError(null), 6000);
    } finally {
      setTesting(false);
    }
  };

  return (
    <aside className="sidebar-panel glass-panel">
      {/* Seção Dispositivo */}
      <div>
        <div className="section-label">
          <Sliders size={13} />
          <span>Dispositivo Ativo</span>
        </div>

        {printers.length > 0 ? (
          <select
            className="custom-select-box"
            value={selectedPrinter ? `${selectedPrinter.transport_type}:${selectedPrinter.target}` : ''}
            onChange={(e) => {
              const found = printers.find(
                (p) => `${p.transport_type}:${p.target}` === e.target.value
              );
              if (found) onSelectPrinter(found);
            }}
          >
            {printers.map((p) => (
              <option
                key={`${p.transport_type}:${p.target}`}
                value={`${p.transport_type}:${p.target}`}
              >
                {p.is_bluetooth ? `[Bluetooth] ${p.name} (${p.port})` : `[USB] ${p.name}`}
              </option>
            ))}
          </select>
        ) : (
          <div
            style={{
              padding: '12px',
              borderRadius: 'var(--radius-sm)',
              background: 'rgba(239, 68, 68, 0.1)',
              border: '1px solid rgba(239, 68, 68, 0.25)',
              fontSize: '0.8rem',
              color: '#fca5a5',
            }}
          >
            Nenhuma impressora ESC/POS detectada. Conecte o cabo USB ou ative o pareamento Bluetooth.
          </div>
        )}
      </div>

      {/* Cartão de Detalhes da Conexão */}
      {selectedPrinter && (
        <div className="glass-card device-card">
          <div className="device-header">
            <span className="device-name">{selectedPrinter.name}</span>
            <span
              className={`device-type-tag ${
                selectedPrinter.is_bluetooth ? 'bt' : 'usb'
              }`}
            >
              {selectedPrinter.is_bluetooth ? 'Bluetooth SPP' : 'USB Direto'}
            </span>
          </div>

          <div className="device-meta">
            <div>
              {selectedPrinter.is_bluetooth ? (
                <>Porta Serial: <strong style={{ color: 'var(--accent-bt)' }}>{selectedPrinter.port}</strong></>
              ) : (
                <>Interface: <strong style={{ color: 'var(--accent-usb)' }}>USBPRINT</strong></>
              )}
            </div>
            <div style={{ marginTop: '2px', color: 'var(--text-muted)' }}>
              Comunicação Driverless (sem spooler)
            </div>
          </div>

          <button
            className="btn-secondary"
            style={{ marginTop: '6px', width: '100%' }}
            onClick={handleTestPrint}
            disabled={testing}
          >
            <PlayCircle size={15} color="var(--accent-bt)" />
            <span>{testing ? 'Transmitindo...' : 'Teste de Impressão'}</span>
          </button>

          {testResult && (
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                fontSize: '0.75rem',
                color: 'var(--accent-usb)',
                marginTop: '4px',
              }}
            >
              <CheckCircle2 size={14} />
              <span>{testResult}</span>
            </div>
          )}

          {testError && (
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                fontSize: '0.75rem',
                color: 'var(--accent-danger)',
                marginTop: '4px',
              }}
            >
              <AlertCircle size={14} />
              <span>{testError}</span>
            </div>
          )}
        </div>
      )}

      {/* Configurações de Impressão */}
      <div style={{ marginTop: '8px' }}>
        <div className="section-label">
          <Settings2 size={13} />
          <span>Configuração ESC/POS</span>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          <div>
            <label style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', display: 'block', marginBottom: '4px' }}>
              Largura Útil do Papel
            </label>
            <select
              className="custom-select-box"
              value={widthDots}
              onChange={(e) => onUpdateWidth(Number(e.target.value))}
            >
              <option value={384}>58 mm (384 dots — Padrão CLA58 / MPT-II)</option>
              <option value={576}>80 mm (576 dots — Padrão POS-80)</option>
            </select>
          </div>

          <div>
            <label style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', display: 'block', marginBottom: '4px' }}>
              Tabela de Caracteres (Code Page)
            </label>
            <select
              className="custom-select-box"
              value={codePage}
              onChange={(e) => onUpdateCodePage(Number(e.target.value))}
            >
              <option value={3}>CP860 (Português — ESC t 3)</option>
              <option value={0}>CP437 (EUA / Padrão — ESC t 0)</option>
              <option value={2}>CP850 (Multilíngue — ESC t 2)</option>
            </select>
          </div>
        </div>
      </div>

      <div style={{ marginTop: 'auto', paddingTop: '16px', borderTop: '1px solid var(--border-subtle)', fontSize: '0.725rem', color: 'var(--text-muted)' }}>
        <div>THZ ThermalKit v0.2.0 Desktop</div>
        <div>Tauri v2 • React • Rust Core</div>
      </div>
    </aside>
  );
};
