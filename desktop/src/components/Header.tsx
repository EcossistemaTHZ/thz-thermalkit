import React from 'react';
import { PrinterDto, AppConfigDto } from '../types';
import {
  Printer,
  Bluetooth,
  Usb,
  RefreshCw,
  PanelLeftClose,
  PanelLeftOpen,
  Eye,
  EyeOff,
  ChevronsDown,
  Settings
} from 'lucide-react';

interface HeaderProps {
  appConfig: AppConfigDto;
  selectedPrinter: PrinterDto | null;
  printersCount: number;
  onRefresh: () => void;
  isRefreshing: boolean;
  showSidebar: boolean;
  onToggleSidebar: () => void;
  showPreview: boolean;
  onTogglePreview: () => void;
  onFeedPaper: () => void;
  isFeeding: boolean;
  onOpenSettings: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  appConfig,
  selectedPrinter,
  printersCount,
  onRefresh,
  isRefreshing,
  showSidebar,
  onToggleSidebar,
  showPreview,
  onTogglePreview,
  onFeedPaper,
  isFeeding,
  onOpenSettings,
}) => {
  const isConnected = !!selectedPrinter;
  const isBt = selectedPrinter?.is_bluetooth;

  return (
    <header className="app-header">
      <div className="brand-section">
        <div
          className="brand-icon-box"
          style={{
            background: `linear-gradient(135deg, ${appConfig.accent_color}, #1d4ed8)`,
            boxShadow: `0 8px 16px ${appConfig.accent_color}40`,
          }}
        >
          <Printer size={22} color="#ffffff" />
        </div>
        <div>
          <h1 className="brand-title">{appConfig.app_name}</h1>
          <p className="brand-subtitle">{appConfig.app_subtitle}</p>
        </div>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
        {/* Botão de Configurações e White-Label */}
        <button
          className="btn-secondary"
          onClick={onOpenSettings}
          title="Configurações do Estabelecimento, White-Label, Backups e Compactação"
          style={{ borderColor: 'rgba(59, 130, 246, 0.4)' }}
        >
          <Settings size={15} color="var(--accent-usb)" />
          <span>Configurações</span>
        </button>

        {/* Toggle Painel Lateral */}
        <button
          className={`btn-secondary ${showSidebar ? 'active-toggle' : ''}`}
          onClick={onToggleSidebar}
          title={showSidebar ? 'Ocultar painel lateral da impressora' : 'Exibir painel lateral da impressora'}
        >
          {showSidebar ? (
            <PanelLeftClose size={15} color="var(--accent-bt)" />
          ) : (
            <PanelLeftOpen size={15} />
          )}
          <span>{showSidebar ? 'Ocultar Lateral' : 'Ver Lateral'}</span>
        </button>

        {/* Toggle Prévia da Bobina */}
        <button
          className={`btn-secondary ${showPreview ? 'active-toggle' : ''}`}
          onClick={onTogglePreview}
          title={showPreview ? 'Ocultar prévia da bobina térmica' : 'Exibir prévia da bobina térmica'}
        >
          {showPreview ? <EyeOff size={14} /> : <Eye size={14} color="var(--accent-usb)" />}
          <span>{showPreview ? 'Ocultar Bobina' : 'Ver Bobina'}</span>
        </button>

        {/* Botão Feed / Avançar Papel */}
        <button
          className="btn-secondary"
          onClick={onFeedPaper}
          disabled={!selectedPrinter || isFeeding}
          title={selectedPrinter ? 'Avançar bobina na impressora física (Feed)' : 'Conecte uma impressora para avançar papel'}
          style={{
            borderColor: selectedPrinter ? 'rgba(56, 189, 248, 0.35)' : undefined,
          }}
        >
          <ChevronsDown
            size={15}
            color={selectedPrinter ? 'var(--accent-bt)' : 'var(--text-muted)'}
          />
          <span>{isFeeding ? 'Avançando...' : 'Avançar'}</span>
        </button>

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
