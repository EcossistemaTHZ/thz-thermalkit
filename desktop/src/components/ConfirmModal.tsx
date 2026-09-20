import React from 'react';
import { PrinterDto, DocumentPreviewDto } from '../types';
import { Bluetooth, Usb, AlertTriangle, Printer, X } from 'lucide-react';

interface ConfirmModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  printer: PrinterDto;
  preview: DocumentPreviewDto | null;
  isPrinting: boolean;
}

export const ConfirmModal: React.FC<ConfirmModalProps> = ({
  isOpen,
  onClose,
  onConfirm,
  printer,
  preview,
  isPrinting,
}) => {
  if (!isOpen) return null;

  const isBt = printer.is_bluetooth;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-card" onClick={(e) => e.stopPropagation()}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div
              style={{
                width: '38px',
                height: '38px',
                borderRadius: 'var(--radius-md)',
                background: isBt ? 'rgba(14, 165, 233, 0.15)' : 'rgba(16, 185, 129, 0.15)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Printer size={20} color={isBt ? 'var(--accent-bt)' : 'var(--accent-usb)'} />
            </div>
            <div>
              <h2 style={{ fontSize: '1.1rem', fontWeight: 800 }}>Confirmar Impressão</h2>
              <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                Envio direto sem spooler do Windows
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            style={{
              background: 'transparent',
              border: 'none',
              color: 'var(--text-muted)',
              cursor: 'pointer',
              padding: '4px',
            }}
          >
            <X size={18} />
          </button>
        </div>

        {/* Detalhes do Dispositivo */}
        <div
          style={{
            padding: '14px',
            borderRadius: 'var(--radius-sm)',
            background: 'rgba(255, 255, 255, 0.03)',
            border: '1px solid var(--border-subtle)',
            fontSize: '0.85rem',
            display: 'flex',
            flexDirection: 'column',
            gap: '8px',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            {isBt ? (
              <Bluetooth size={16} color="var(--accent-bt)" />
            ) : (
              <Usb size={16} color="var(--accent-usb)" />
            )}
            <span>
              Destino: <strong>{printer.name}</strong> ({isBt ? printer.port : 'USB'})
            </span>
          </div>

          {preview && (
            <div style={{ color: 'var(--text-secondary)', fontSize: '0.8rem' }}>
              Arquivo: <strong>{preview.file_name}</strong> ({preview.page_count} pág.)
            </div>
          )}
        </div>

        <div
          style={{
            display: 'flex',
            alignItems: 'flex-start',
            gap: '8px',
            fontSize: '0.75rem',
            color: 'var(--text-muted)',
            lineHeight: '1.4',
          }}
        >
          <AlertTriangle size={15} color="var(--accent-warning)" style={{ flexShrink: 0, marginTop: '2px' }} />
          <span>
            Os bytes ESC/POS serão transmitidos diretamente para a porta de impressão. Nenhum comando de corte ou abertura de gaveta será executado.
          </span>
        </div>

        {/* Botões de Ação */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '10px', marginTop: '8px' }}>
          <button className="btn-secondary" onClick={onClose} disabled={isPrinting}>
            Cancelar
          </button>

          <button
            className={`btn-primary ${isBt ? 'bt' : 'usb'}`}
            style={{
              padding: '10px 20px',
              fontSize: '0.9rem',
              color: '#0b0f17',
              fontWeight: 800,
            }}
            onClick={onConfirm}
            disabled={isPrinting}
          >
            {isPrinting ? 'Imprimindo...' : 'Confirmar e Imprimir'}
          </button>
        </div>
      </div>
    </div>
  );
};
