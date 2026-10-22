import React, { useState } from 'react';
import {
  PrinterDto,
  StoreProfileDto,
  AppConfigDto,
  DocumentPreviewDto,
} from '../types';
import {
  Wrench,
  ShoppingBag,
  Users,
  FileText,
  Printer,
  Settings,
  Bluetooth,
  Usb,
  RefreshCw,
  X,
  CheckCircle2,
  AlertCircle,
  Eye
} from 'lucide-react';
import { ThermalViewer } from './ThermalViewer';

interface MobileAppLayoutProps {
  appConfig: AppConfigDto;
  storeProfile: StoreProfileDto | null;
  printers: PrinterDto[];
  selectedPrinter: PrinterDto | null;
  onSelectPrinter: (printer: PrinterDto) => void;
  onRefreshPrinters: () => void;
  isRefreshingPrinters: boolean;
  widthDots: number;
  onUpdateWidth: (width: number) => void;
  activeTab: 'tech' | 'registers' | 'receipt' | 'word' | 'templates' | 'preview';
  onChangeTab: (tab: 'tech' | 'registers' | 'receipt' | 'word' | 'templates' | 'preview') => void;
  onOpenSettings: () => void;
  onPrintNow: () => void;
  isPrinting: boolean;
  canPrint: boolean;
  hasCompiledDocument: boolean;
  virtualPreview: DocumentPreviewDto | null;
  children: React.ReactNode;
}

export const MobileAppLayout: React.FC<MobileAppLayoutProps> = ({
  appConfig,
  storeProfile,
  printers,
  selectedPrinter,
  onSelectPrinter,
  onRefreshPrinters,
  isRefreshingPrinters,
  widthDots,
  onUpdateWidth,
  activeTab,
  onChangeTab,
  onOpenSettings,
  onPrintNow,
  isPrinting,
  canPrint,
  hasCompiledDocument,
  virtualPreview,
  children,
}) => {
  const [isPrinterSheetOpen, setIsPrinterSheetOpen] = useState(false);

  return (
    <div className="mobile-app-root">
      {/* 1. Header Nativo Mobile */}
      <header className="mobile-header">
        <div className="mobile-brand">
          <div
            className="mobile-brand-icon"
            style={{
              background: `linear-gradient(135deg, ${appConfig.accent_color}, #1d4ed8)`,
            }}
          >
            <Printer size={18} color="#ffffff" />
          </div>
          <div className="mobile-brand-text">
            <span className="mobile-brand-title">{appConfig.app_name}</span>
            <span className="mobile-brand-sub">
              {storeProfile?.name || 'Móvel & Balcão'}
            </span>
          </div>
        </div>

        <div className="mobile-header-actions">
          {/* Pílula de Status da Impressora (Toque abre seletor) */}
          <button
            type="button"
            className={`mobile-printer-pill ${selectedPrinter ? (selectedPrinter.is_bluetooth ? 'bt' : 'usb') : 'disconnected'}`}
            onClick={() => setIsPrinterSheetOpen(true)}
            title="Selecionar ou Configurar Impressora"
          >
            {selectedPrinter ? (
              <>
                {selectedPrinter.is_bluetooth ? <Bluetooth size={14} /> : <Usb size={14} />}
                <span className="mobile-pill-name">{selectedPrinter.name}</span>
                <span className="mobile-pill-dot" />
              </>
            ) : (
              <>
                <AlertCircle size={14} color="var(--accent-warning)" />
                <span>Sem Impressora</span>
              </>
            )}
          </button>

          {/* Botão de Configurações */}
          <button
            type="button"
            className="mobile-icon-btn"
            onClick={onOpenSettings}
            title="Configurações do Estabelecimento e SQLite"
          >
            <Settings size={20} color="var(--text-secondary)" />
          </button>
        </div>
      </header>

      {/* 2. Área Central de Conteúdo Scrollable */}
      <main className="mobile-content-viewport">
        {activeTab === 'preview' ? (
          <div className="mobile-preview-container">
            <div className="mobile-preview-header">
              <span style={{ fontSize: '0.85rem', fontWeight: 700, color: '#fff' }}>
                Prévia do Cupom Térmico ({widthDots === 576 ? '80mm' : '58mm'})
              </span>
              <div style={{ display: 'flex', gap: '6px' }}>
                <button
                  className={`btn-secondary ${widthDots === 384 ? 'active-toggle' : ''}`}
                  style={{ padding: '4px 8px', fontSize: '0.75rem' }}
                  onClick={() => onUpdateWidth(384)}
                >
                  58mm
                </button>
                <button
                  className={`btn-secondary ${widthDots === 576 ? 'active-toggle' : ''}`}
                  style={{ padding: '4px 8px', fontSize: '0.75rem' }}
                  onClick={() => onUpdateWidth(576)}
                >
                  80mm
                </button>
              </div>
            </div>

            {virtualPreview ? (
              <div style={{ flex: 1, minHeight: 0, overflow: 'auto' }}>
                <ThermalViewer preview={virtualPreview} widthDots={widthDots} />
              </div>
            ) : (
              <div className="mobile-empty-preview">
                <Printer size={36} color="var(--text-muted)" />
                <p>Nenhum comprovante ou cupom compilado no momento.</p>
                <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                  Gere uma venda no PDV ou uma O.S. para visualizar aqui.
                </span>
              </div>
            )}
          </div>
        ) : (
          children
        )}
      </main>

      {/* 3. Botão Flutuante de Disparo de Impressão Rápida (quando houver documento pronto) */}
      {hasCompiledDocument && activeTab !== 'registers' && (
        <div className="mobile-fab-container">
          <button
            type="button"
            className={`mobile-fab-btn ${selectedPrinter?.is_bluetooth ? 'bt' : 'usb'}`}
            disabled={!canPrint || isPrinting}
            onClick={onPrintNow}
          >
            <Printer size={20} />
            <span>{isPrinting ? 'Imprimindo...' : `Imprimir no ${selectedPrinter?.name || 'Dispositivo'}`}</span>
          </button>
        </div>
      )}

      {/* 4. Bottom Navigation Bar Fixa (Navegação com o Polegar) */}
      <nav className="mobile-bottom-nav">
        <button
          type="button"
          className={`mobile-nav-item ${activeTab === 'tech' ? 'active' : ''}`}
          onClick={() => onChangeTab('tech')}
        >
          <div className="mobile-nav-icon-wrapper">
            <Wrench size={20} />
          </div>
          <span>O.S.</span>
        </button>

        <button
          type="button"
          className={`mobile-nav-item ${activeTab === 'receipt' ? 'active' : ''}`}
          onClick={() => onChangeTab('receipt')}
        >
          <div className="mobile-nav-icon-wrapper">
            <ShoppingBag size={20} />
          </div>
          <span>PDV</span>
        </button>

        <button
          type="button"
          className={`mobile-nav-item ${activeTab === 'registers' ? 'active' : ''}`}
          onClick={() => onChangeTab('registers')}
        >
          <div className="mobile-nav-icon-wrapper">
            <Users size={20} />
          </div>
          <span>Cadastros</span>
        </button>

        <button
          type="button"
          className={`mobile-nav-item ${activeTab === 'templates' ? 'active' : ''}`}
          onClick={() => onChangeTab('templates')}
        >
          <div className="mobile-nav-icon-wrapper">
            <FileText size={20} />
          </div>
          <span>Modelos</span>
        </button>

        <button
          type="button"
          className={`mobile-nav-item ${activeTab === 'preview' ? 'active' : ''}`}
          onClick={() => onChangeTab('preview')}
        >
          <div className="mobile-nav-icon-wrapper" style={{ position: 'relative' }}>
            <Eye size={20} />
            {hasCompiledDocument && (
              <span className="mobile-nav-badge" />
            )}
          </div>
          <span>Cupom</span>
        </button>
      </nav>

      {/* 5. Bottom Sheet Deslizante: Seletor de Impressora Térmica */}
      {isPrinterSheetOpen && (
        <div className="mobile-sheet-overlay" onClick={() => setIsPrinterSheetOpen(false)}>
          <div className="mobile-sheet-drawer" onClick={(e) => e.stopPropagation()}>
            <div className="mobile-sheet-handle" />

            <div className="mobile-sheet-header">
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Printer size={18} color="var(--accent-bt)" />
                <h3 style={{ fontSize: '1.05rem', fontWeight: 800, color: '#fff' }}>
                  Impressoras Térmicas
                </h3>
              </div>
              <div style={{ display: 'flex', gap: '6px' }}>
                <button
                  type="button"
                  className="mobile-icon-btn"
                  onClick={onRefreshPrinters}
                  disabled={isRefreshingPrinters}
                  title="Atualizar lista de dispositivos"
                >
                  <RefreshCw size={16} className={isRefreshingPrinters ? 'spin-anim' : ''} />
                </button>
                <button
                  type="button"
                  className="mobile-icon-btn"
                  onClick={() => setIsPrinterSheetOpen(false)}
                >
                  <X size={18} />
                </button>
              </div>
            </div>

            {/* Largura da Bobina */}
            <div className="mobile-sheet-section">
              <span className="mobile-section-label">Largura da Bobina</span>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                <button
                  type="button"
                  className={`btn-secondary ${widthDots === 384 ? 'active-toggle' : ''}`}
                  style={{ padding: '10px', fontSize: '0.85rem', justifyContent: 'center' }}
                  onClick={() => onUpdateWidth(384)}
                >
                  58 mm (384 dots)
                </button>
                <button
                  type="button"
                  className={`btn-secondary ${widthDots === 576 ? 'active-toggle' : ''}`}
                  style={{ padding: '10px', fontSize: '0.85rem', justifyContent: 'center' }}
                  onClick={() => onUpdateWidth(576)}
                >
                  80 mm (576 dots)
                </button>
              </div>
            </div>

            {/* Lista de Dispositivos */}
            <div className="mobile-sheet-section" style={{ flex: 1, minHeight: 0, overflowY: 'auto' }}>
              <span className="mobile-section-label">Dispositivos Detectados ({printers.length})</span>

              {printers.length === 0 ? (
                <div className="mobile-sheet-empty">
                  <Bluetooth size={28} color="var(--text-muted)" />
                  <p>Nenhuma impressora pareada ou conectada.</p>
                  <span>
                    No celular, pareie sua maquininha térmica (POS-58 / TECH CLA58) nas configurações de Bluetooth do Android e toque em Atualizar.
                  </span>
                  <button
                    type="button"
                    className="btn-primary bt"
                    style={{ marginTop: '12px', width: '100%' }}
                    onClick={onRefreshPrinters}
                  >
                    <RefreshCw size={16} />
                    <span>Buscar Dispositivos Pareados</span>
                  </button>
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {printers.map((p) => {
                    const isSelected = selectedPrinter?.target === p.target;
                    return (
                      <div
                        key={p.target}
                        className={`mobile-printer-item ${isSelected ? 'selected' : ''}`}
                        onClick={() => {
                          onSelectPrinter(p);
                          setIsPrinterSheetOpen(false);
                        }}
                      >
                        <div
                          className="mobile-printer-icon"
                          style={{
                            background: p.is_bluetooth
                              ? 'rgba(14, 165, 233, 0.15)'
                              : 'rgba(16, 185, 129, 0.15)',
                            color: p.is_bluetooth ? 'var(--accent-bt)' : 'var(--accent-usb)',
                          }}
                        >
                          {p.is_bluetooth ? <Bluetooth size={18} /> : <Usb size={18} />}
                        </div>

                        <div className="mobile-printer-details">
                          <span className="mobile-printer-name">{p.name}</span>
                          <span className="mobile-printer-port">{p.display_info || p.port}</span>
                        </div>

                        {isSelected && (
                          <div className="mobile-printer-check">
                            <CheckCircle2 size={18} color="var(--accent-usb)" />
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            <button
              type="button"
              className="btn-secondary"
              style={{ width: '100%', padding: '14px', marginTop: '12px' }}
              onClick={() => setIsPrinterSheetOpen(false)}
            >
              Fechar
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
