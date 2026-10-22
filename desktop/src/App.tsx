import React, { useEffect, useState, useCallback, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { invoke } from '@tauri-apps/api/core';
import {
  PrinterDto,
  DocumentPreviewDto,
  PrintJobRequest,
  StoreProfileDto,
  AppConfigDto
} from './types';
import { Header } from './components/Header';
import { Sidebar } from './components/Sidebar';
import { ThermalViewer } from './components/ThermalViewer';
import { ConfirmModal } from './components/ConfirmModal';
import { ReceiptBuilder } from './components/ReceiptBuilder';
import { WordEscPos } from './components/WordEscPos';
import { BusinessTemplates } from './components/BusinessTemplates';
import { TechAssistanceModule } from './components/TechAssistanceModule';
import { BaseRegistersModule } from './components/BaseRegistersModule';
import { OnboardingScreen } from './components/OnboardingModal';
import { SettingsModal } from './components/SettingsModal';
import { MobileAppLayout } from './components/MobileAppLayout';
import {
  isAndroidBluetoothAvailable,
  listPairedBluetoothPrinters,
  printRawBluetooth,
  startBleScan,
} from './utils/androidBluetooth';
import {
  FileUp,
  FileText,
  Type,
  Receipt,
  Trash2,
  Printer,
  CheckCircle2,
  AlertCircle,
  Info,
  X,
  Briefcase,
  Wrench,
  Users
} from 'lucide-react';

export const App: React.FC = () => {
  // Estado dos Dispositivos
  const [printers, setPrinters] = useState<PrinterDto[]>([]);
  const [selectedPrinter, setSelectedPrinter] = useState<PrinterDto | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Configurações do SQLite: Estabelecimento e White-Label
  const [storeProfile, setStoreProfile] = useState<StoreProfileDto | null>(null);
  const [isLoadingProfile, setIsLoadingProfile] = useState(true);
  const [appConfig, setAppConfig] = useState<AppConfigDto>({
    app_name: 'THZ ThermalKit',
    app_subtitle: 'Direct ESC/POS Driverless Printing',
    accent_color: '#3b82f6',
    default_width_dots: 384,
    default_code_page: 3,
    show_file_tab: true,
    show_direct_text_tab: true,
  });

  // Modal de Configurações
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);

  // Configurações de Impressão ESC/POS
  const [widthDots, setWidthDots] = useState<number>(384);
  const [codePage, setCodePage] = useState<number>(3); // CP860 Português

  // Abas: 'tech' (Assistência Técnica O.S.), 'registers' (Cadastros Base), 'receipt' (PDV Balcão), 'word' (Word ESC/POS), 'templates', 'file' ou 'preview'
  const [activeTab, setActiveTab] = useState<'tech' | 'registers' | 'receipt' | 'word' | 'templates' | 'file' | 'preview'>('tech');

  // Detecção e alternância dinâmica Mobile / Desktop
  const [isMobile, setIsMobile] = useState(() => {
    if (typeof window === 'undefined') return false;
    return window.innerWidth < 850 || isAndroidBluetoothAvailable();
  });

  useEffect(() => {
    const handleResize = () => {
      setIsMobile(window.innerWidth < 850 || isAndroidBluetoothAvailable());
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Textos compilados de cada aba
  const [compiledTechText, setCompiledTechText] = useState<string>('');
  const [compiledReceiptText, setCompiledReceiptText] = useState<string>('');
  const [wordEscPosText, setWordEscPosText] = useState<string>('');
  const [templateText, setTemplateText] = useState<string>('');

  // Estados de Exibição Responsiva (Painel Lateral e Prévia Térmica)
  const [showSidebar, setShowSidebar] = useState(() => window.innerWidth >= 1350);
  const [showPreview, setShowPreview] = useState(true);

  // Estado do Documento Externo
  const [preview, setPreview] = useState<DocumentPreviewDto | null>(null);
  const [isLoadingDoc, setIsLoadingDoc] = useState(false);

  // Modal de Confirmação e Feedback
  const [isConfirmOpen, setIsConfirmOpen] = useState(false);
  const [isPrinting, setIsPrinting] = useState(false);
  const [toast, setToast] = useState<{ type: 'success' | 'error' | 'info'; message: string } | null>(null);

  const showToast = (type: 'success' | 'error' | 'info', message: string, duration = 3500) => {
    setToast({ type, message });
    setTimeout(() => {
      setToast((current) => (current?.message === message ? null : current));
    }, duration);
  };

  // Inicialização do SQLite (Store Profile e App Config)
  useEffect(() => {
    const initAppData = async () => {
      try {
        const profile = await invoke<StoreProfileDto>('get_store_profile');
        setStoreProfile(profile);

        const config = await invoke<AppConfigDto>('get_app_config');
        setAppConfig(config);
        setWidthDots(config.default_width_dots || 384);
        setCodePage(config.default_code_page || 3);

        // Aplica título da janela e cor de destaque
        document.title = config.app_name;
        if (config.accent_color) {
          document.documentElement.style.setProperty('--accent-usb', config.accent_color);
        }
      } catch (err) {
        console.error('Falha ao carregar configurações do SQLite:', err);
      } finally {
        setIsLoadingProfile(false);
      }
    };

    initAppData();
  }, []);

  // Salvar perfil do estabelecimento
  const handleSaveStoreProfile = async (profile: StoreProfileDto) => {
    await invoke('save_store_profile', { profile });
    setStoreProfile(profile);
    showToast('success', 'Dados do estabelecimento salvos com sucesso!');
  };

  // Salvar configuração White-Label
  const handleSaveAppConfig = async (config: AppConfigDto) => {
    await invoke('save_app_config', { config });
    setAppConfig(config);
    setWidthDots(config.default_width_dots);
    setCodePage(config.default_code_page);
    document.title = config.app_name;
    if (config.accent_color) {
      document.documentElement.style.setProperty('--accent-usb', config.accent_color);
    }
  };

  // Busca de Impressoras Conectadas (USB e Bluetooth)
  const refreshPrinters = useCallback(async () => {
    setIsRefreshing(true);
    try {
      let list: PrinterDto[] = [];
      try {
        list = await invoke<PrinterDto[]>('list_printers');
      } catch (_e) {
        // Ignora caso list_printers seja Windows-only
      }

      if (isAndroidBluetoothAvailable()) {
        try {
          let btDevices = await listPairedBluetoothPrinters();

          // Se não encontrou de imediato ou para varrer BLE próximo, inicia scan breve
          if (btDevices.length === 0) {
            startBleScan();
            await new Promise((r) => setTimeout(r, 1500));
            btDevices = await listPairedBluetoothPrinters();
          }

          const btPrinters: PrinterDto[] = btDevices.map((d) => ({
            name: d.name,
            display_info: d.isBle ? `Bluetooth BLE (${d.address})` : `Bluetooth SPP (${d.address})`,
            is_bluetooth: true,
            port: d.address,
            transport_type: 'bluetooth',
            target: d.address,
          }));
          list = [...btPrinters, ...list];
        } catch (btErr) {
          console.error('Falha ao listar Bluetooth no Android:', btErr);
        }
      }

      setPrinters(list);

      if (list.length > 0) {
        setSelectedPrinter((current) => {
          if (current) {
            const stillExists = list.find(
              (p) => p.transport_type === current.transport_type && p.target === current.target
            );
            if (stillExists) return stillExists;
          }
          const btPrinter = list.find((p) => p.is_bluetooth);
          return btPrinter || list[0];
        });
      } else {
        setSelectedPrinter(null);
      }
    } catch (err) {
      showToast('error', `Falha ao buscar impressoras: ${String(err)}`);
    } finally {
      setIsRefreshing(false);
    }
  }, []);

  useEffect(() => {
    refreshPrinters();
  }, [refreshPrinters]);

  // Carrega e gera a prévia térmica do arquivo externo
  const loadFilePreview = async (path: string, currentWidth = widthDots) => {
    setIsLoadingDoc(true);
    try {
      const data = await invoke<DocumentPreviewDto>('preview_file', {
        pathStr: path,
        widthDots: currentWidth,
      });
      setPreview(data);
    } catch (err) {
      showToast('error', `Erro ao carregar documento: ${String(err)}`);
    } finally {
      setIsLoadingDoc(false);
    }
  };

  // Seleção de Documento via FileDialog nativo
  const handlePickFile = async () => {
    try {
      const filePath = await invoke<string | null>('pick_document');
      if (filePath) {
        await loadFilePreview(filePath);
      }
    } catch (err) {
      showToast('error', `Falha ao abrir seletor: ${String(err)}`);
    }
  };

  // Atualização da largura (dots)
  const handleUpdateWidth = (newWidth: number) => {
    setWidthDots(newWidth);
    if (preview && preview.file_path) {
      loadFilePreview(preview.file_path, newWidth);
    }
  };

  // Enviar texto de template para o Word ESC/POS
  const handleSendTemplateToWord = (textToSend: string) => {
    setWordEscPosText(textToSend);
    setActiveTab('word');
    showToast('success', 'Template carregado no editor Word ESC/POS para personalização!');
  };

  // Texto ativo a ser impresso
  const currentActiveText = useMemo(() => {
    if (activeTab === 'tech') return compiledTechText;
    if (activeTab === 'receipt') return compiledReceiptText;
    if (activeTab === 'word') return wordEscPosText;
    if (activeTab === 'templates') return templateText;
    return '';
  }, [activeTab, compiledTechText, compiledReceiptText, wordEscPosText, templateText]);

  // Disparo da Impressão Direta
  const handleExecutePrint = async () => {
    if (!selectedPrinter) {
      showToast('error', 'Selecione uma impressora antes de imprimir.');
      return;
    }

    setIsPrinting(true);
    try {
      const isDirect = activeTab !== 'file';
      const textToPrint = currentActiveText;

      if (selectedPrinter.is_bluetooth && isAndroidBluetoothAvailable()) {
        const base64Bytes = await invoke<string>('compile_escpos_bytes', {
          directText: textToPrint,
          codePage,
        });
        const res = await printRawBluetooth(selectedPrinter.target, base64Bytes);
        if (res.success) {
          showToast('success', `Impresso com sucesso via Bluetooth na ${selectedPrinter.name}!`);
          setIsConfirmOpen(false);
        } else {
          showToast('error', `Erro Bluetooth: ${res.error || 'Falha de comunicação'}`, 6000);
        }
      } else {
        const req: PrintJobRequest = {
          file_path: activeTab === 'file' ? preview?.file_path || null : null,
          direct_text: isDirect ? textToPrint : null,
          target_transport: selectedPrinter.transport_type,
          target_param: selectedPrinter.target,
          code_page: codePage,
          width_dots: widthDots,
        };

        const result = await invoke<string>('print_job', { req });
        showToast('success', result);
        setIsConfirmOpen(false);
      }
    } catch (err) {
      showToast('error', `Erro na impressão: ${String(err)}`, 6000);
    } finally {
      setIsPrinting(false);
    }
  };

  // Objeto virtual de preview para a confirmação
  const virtualTextPreview: DocumentPreviewDto | null = useMemo(() => {
    if (activeTab === 'file') return preview;
    const fileName =
      activeTab === 'tech'
        ? 'ordem_servico.txt'
        : activeTab === 'receipt'
        ? 'comprovante.txt'
        : activeTab === 'word'
        ? 'word_escpos.txt'
        : 'template.txt';

    return {
      file_name: fileName,
      file_path: '',
      file_size: currentActiveText.length,
      kind: 'text',
      text_content: currentActiveText,
      preview_image_base64: null,
      page_count: 1,
      width_dots: widthDots,
    };
  }, [activeTab, preview, currentActiveText, widthDots]);

  // Avanço físico de papel (Feed)
  const [isFeeding, setIsFeeding] = useState(false);
  const handleFeedPaper = async () => {
    if (!selectedPrinter) return;
    setIsFeeding(true);
    try {
      const res = await invoke<string>('feed_paper', {
        targetTransport: selectedPrinter.transport_type,
        targetParam: selectedPrinter.target,
        lines: 4,
      });
      showToast('success', res);
    } catch (err) {
      showToast('error', `Falha no Feed: ${String(err)}`);
    } finally {
      setIsFeeding(false);
    }
  };

  const canPrint = Boolean(
    selectedPrinter &&
      ((activeTab === 'file' && preview) ||
        (activeTab !== 'file' && currentActiveText.trim().length > 0))
  );

  // Splash de carregamento inicial
  if (isLoadingProfile) {
    return (
      <div
        className="app-container"
        style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', width: '100vw' }}
      >
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '16px' }}>
          <div className="brand-icon-box" style={{ width: '56px', height: '56px' }}>
            <Printer size={30} color="#ffffff" />
          </div>
          <div style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', fontWeight: 600 }}>
            Iniciando ecossistema térmico...
          </div>
        </div>
      </div>
    );
  }

  // Primeiro Uso: Renderiza EXCLUSIVAMENTE a tela de configuração inicial do negócio
  if (!storeProfile?.onboarding_completed) {
    return (
      <div className="app-container" style={{ height: '100vh', width: '100vw', overflow: 'hidden' }}>
        {toast && (
          <div className={`toast-banner ${toast.type}`}>
            {toast.type === 'success' ? <CheckCircle2 size={16} /> : <AlertCircle size={16} />}
            <span>{toast.message}</span>
          </div>
        )}
        <OnboardingScreen
          appName={appConfig.app_name}
          onSave={handleSaveStoreProfile}
        />
      </div>
    );
  }

  return (
    <>
      {isMobile ? (
        <MobileAppLayout
          appConfig={appConfig}
          storeProfile={storeProfile}
          printers={printers}
          selectedPrinter={selectedPrinter}
          onSelectPrinter={setSelectedPrinter}
          onRefreshPrinters={refreshPrinters}
          isRefreshingPrinters={isRefreshing}
          widthDots={widthDots}
          onUpdateWidth={handleUpdateWidth}
          activeTab={activeTab === 'file' ? 'preview' : activeTab}
          onChangeTab={(tab) => setActiveTab(tab)}
          onOpenSettings={() => setIsSettingsOpen(true)}
          onPrintNow={() => setIsConfirmOpen(true)}
          isPrinting={isPrinting}
          canPrint={canPrint}
          hasCompiledDocument={!!currentActiveText}
          virtualPreview={virtualTextPreview}
        >
          {activeTab === 'tech' ? (
            <TechAssistanceModule
              widthDots={widthDots}
              storeProfile={storeProfile}
              onSendToPrint={(compiled) => {
                setCompiledTechText(compiled);
                setIsConfirmOpen(true);
              }}
              onNotification={showToast}
            />
          ) : activeTab === 'registers' ? (
            <BaseRegistersModule onNotification={showToast} />
          ) : activeTab === 'receipt' ? (
            <ReceiptBuilder
              widthDots={widthDots}
              storeProfile={storeProfile}
              onReceiptChange={setCompiledReceiptText}
              onOpenSettings={() => setIsSettingsOpen(true)}
            />
          ) : activeTab === 'templates' ? (
            <BusinessTemplates
              widthDots={widthDots}
              storeProfile={storeProfile}
              onSelectForPrint={(compiled) => {
                setTemplateText(compiled);
                setIsConfirmOpen(true);
              }}
              onSendToWord={handleSendTemplateToWord}
              showPreview={false}
            />
          ) : (
            <WordEscPos
              widthDots={widthDots}
              storeProfile={storeProfile}
              onTextChange={setWordEscPosText}
              showPreview={false}
            />
          )}
        </MobileAppLayout>
      ) : (
        <div className="app-container">
          {/* Toast de Notificação */}
          {toast && (
            <div className={`toast-banner ${toast.type}`}>
              {toast.type === 'success' ? <CheckCircle2 size={16} /> : <AlertCircle size={16} />}
              <span>{toast.message}</span>
            </div>
          )}

      {/* Cabeçalho Superior com Branding White-Label e Botão de Configurações */}
      <Header
        appConfig={appConfig}
        selectedPrinter={selectedPrinter}
        printersCount={printers.length}
        onRefresh={refreshPrinters}
        isRefreshing={isRefreshing}
        showSidebar={showSidebar}
        onToggleSidebar={() => setShowSidebar((prev) => !prev)}
        showPreview={showPreview}
        onTogglePreview={() => setShowPreview((prev) => !prev)}
        onFeedPaper={handleFeedPaper}
        isFeeding={isFeeding}
        onOpenSettings={() => setIsSettingsOpen(true)}
      />

      {/* Conteúdo Principal Dividido (Sidebar + Área de Bobina Térmica) */}
      <div className={`app-content ${!showSidebar ? 'no-sidebar' : ''}`}>
        {/* Painel Lateral da Impressora */}
        {showSidebar && (
          <Sidebar
            printers={printers}
            selectedPrinter={selectedPrinter}
            onSelectPrinter={setSelectedPrinter}
            widthDots={widthDots}
            onUpdateWidth={handleUpdateWidth}
            codePage={codePage}
            onUpdateCodePage={setCodePage}
          />
        )}

        {/* Área Principal de Conteúdo */}
        <main className="viewer-panel glass-panel">
          {/* Barra Superior da Área de Impressão */}
          <div className="viewer-header">
            {/* Seletor de Modo (Assistência Técnica vs Cadastros vs PDV vs Word vs Utilitários vs Arquivo) */}
            <div className="mode-switch-container">
              <button
                className={`mode-tab-btn ${activeTab === 'tech' ? 'active' : ''}`}
                onClick={() => setActiveTab('tech')}
              >
                <Wrench size={14} color="var(--accent-usb)" />
                <span>Assistência Técnica (O.S.)</span>
              </button>

              <button
                className={`mode-tab-btn ${activeTab === 'registers' ? 'active' : ''}`}
                onClick={() => setActiveTab('registers')}
              >
                <Users size={14} color="#10b981" />
                <span>Cadastros & Base</span>
              </button>

              <button
                className={`mode-tab-btn ${activeTab === 'receipt' ? 'active' : ''}`}
                onClick={() => setActiveTab('receipt')}
              >
                <Receipt size={14} />
                <span>PDV Balcão / Recibo</span>
              </button>

              <button
                className={`mode-tab-btn ${activeTab === 'word' ? 'active' : ''}`}
                onClick={() => setActiveTab('word')}
              >
                <Type size={14} />
                <span>Word para ESC/POS</span>
              </button>

              <button
                className={`mode-tab-btn ${activeTab === 'templates' ? 'active' : ''}`}
                onClick={() => setActiveTab('templates')}
              >
                <Briefcase size={14} />
                <span>Utilitários & Gestão</span>
              </button>

              <button
                className={`mode-tab-btn ${activeTab === 'file' ? 'active' : ''}`}
                onClick={() => setActiveTab('file')}
              >
                <FileText size={14} />
                <span>Arquivo (PDF / Img)</span>
              </button>
            </div>

            {/* Ações contextuais de cada aba */}
            {activeTab === 'file' && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                {preview && (
                  <button
                    className="btn-secondary"
                    style={{ padding: '8px 12px', fontSize: '0.8rem', color: 'var(--accent-danger)' }}
                    onClick={() => setPreview(null)}
                    title="Remover documento carregado"
                  >
                    <Trash2 size={14} />
                    <span>Limpar</span>
                  </button>
                )}

                <button
                  className="btn-secondary"
                  style={{ padding: '8px 14px', fontSize: '0.8rem' }}
                  onClick={handlePickFile}
                  disabled={isLoadingDoc}
                >
                  <FileUp size={15} color="var(--accent-bt)" />
                  <span>{isLoadingDoc ? 'Processando...' : 'Abrir Arquivo...'}</span>
                </button>
              </div>
            )}
          </div>

          {/* Área Central: Renderização de cada Aba */}
          <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
            {activeTab === 'tech' ? (
              <div style={{ display: 'grid', gridTemplateColumns: showPreview && compiledTechText ? '1fr 315px' : '1fr', gap: '16px', flex: 1, minHeight: 0, overflow: 'hidden' }}>
                <TechAssistanceModule
                  widthDots={widthDots}
                  storeProfile={storeProfile}
                  onSendToPrint={(compiled) => {
                    setCompiledTechText(compiled);
                    setIsConfirmOpen(true);
                  }}
                  onNotification={showToast}
                />
                {showPreview && compiledTechText && (
                  <div style={{ overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
                    <ThermalViewer preview={virtualTextPreview} widthDots={widthDots} />
                  </div>
                )}
              </div>
            ) : activeTab === 'registers' ? (
              <BaseRegistersModule onNotification={showToast} />
            ) : activeTab === 'receipt' ? (
              <div style={{ display: 'grid', gridTemplateColumns: showPreview ? '1fr 315px' : '1fr', gap: '16px', flex: 1, minHeight: 0, overflow: 'hidden' }}>
                <ReceiptBuilder
                  widthDots={widthDots}
                  storeProfile={storeProfile}
                  onReceiptChange={setCompiledReceiptText}
                  onOpenSettings={() => setIsSettingsOpen(true)}
                />
                {showPreview && (
                  <div style={{ overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
                    <ThermalViewer preview={virtualTextPreview} widthDots={widthDots} />
                  </div>
                )}
              </div>
            ) : activeTab === 'word' ? (
              <WordEscPos
                widthDots={widthDots}
                storeProfile={storeProfile}
                onTextChange={setWordEscPosText}
                showPreview={showPreview}
              />
            ) : activeTab === 'templates' ? (
              <BusinessTemplates
                widthDots={widthDots}
                storeProfile={storeProfile}
                onSelectForPrint={(compiled) => {
                  setTemplateText(compiled);
                  setIsConfirmOpen(true);
                }}
                onSendToWord={handleSendTemplateToWord}
                showPreview={showPreview}
              />
            ) : (
              preview ? (
                <ThermalViewer preview={preview} widthDots={widthDots} />
              ) : (
                <div
                  className="roll-stage-container"
                  style={{ alignItems: 'center', justifyContent: 'center' }}
                >
                  <div
                    className="dropzone-container"
                    style={{ width: '420px', padding: '40px 24px' }}
                    onClick={handlePickFile}
                  >
                    <div className="dropzone-icon-circle">
                      <FileUp size={24} />
                    </div>
                    <div className="dropzone-title">Selecione um documento</div>
                    <div className="dropzone-desc">
                      Suporte nativo a PDFs, Imagens (PNG/JPG) e arquivos de texto (.txt).
                      Clique para navegar ou escolha um arquivo.
                    </div>
                    <button
                      className="btn-secondary"
                      style={{ marginTop: '12px' }}
                      onClick={(e) => {
                        e.stopPropagation();
                        handlePickFile();
                      }}
                    >
                      Escolher do Computador
                    </button>
                  </div>
                </div>
              )
            )}
          </div>

          {/* Rodapé de Ação e Disparo */}
          <div className="viewer-action-footer">
            <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
              {selectedPrinter ? (
                <span>
                  Pronto para imprimir via{' '}
                  <strong style={{ color: selectedPrinter.is_bluetooth ? 'var(--accent-bt)' : 'var(--accent-usb)' }}>
                    {selectedPrinter.name}
                  </strong>{' '}
                  ({selectedPrinter.is_bluetooth ? selectedPrinter.port : 'USB Direto'})
                </span>
              ) : (
                <span style={{ color: 'var(--accent-danger)' }}>
                  Nenhuma impressora selecionada no painel esquerdo.
                </span>
              )}
            </div>

            <button
              className={`btn-primary ${selectedPrinter?.is_bluetooth ? 'bt' : 'usb'}`}
              disabled={!canPrint}
              onClick={() => setIsConfirmOpen(true)}
            >
              <Printer size={18} />
              <span>Imprimir Agora</span>
            </button>
          </div>
        </main>
      </div>
    </div>
  )}

  {/* Modal de Configurações, White-Label e Backups */}
  <SettingsModal
    isOpen={isSettingsOpen}
    onClose={() => setIsSettingsOpen(false)}
    storeProfile={storeProfile || { name: 'MEU ESTABELECIMENTO', doc: '00.000.000/0001-00', onboarding_completed: false }}
    appConfig={appConfig}
    onSaveStore={handleSaveStoreProfile}
    onSaveAppConfig={handleSaveAppConfig}
    onNotification={showToast}
  />

  {/* Modal de Confirmação Pré-impressão */}
  {selectedPrinter && (
    <ConfirmModal
      isOpen={isConfirmOpen}
      onClose={() => setIsConfirmOpen(false)}
      onConfirm={handleExecutePrint}
      printer={selectedPrinter}
      preview={virtualTextPreview}
      isPrinting={isPrinting}
    />
  )}

  {/* Toast Global Flutuante de Feedback */}
  {toast && createPortal(
    <div className={`global-toast-container ${toast.type}`}>
      <div className="global-toast-icon">
        {toast.type === 'success' && <CheckCircle2 size={18} color="var(--accent-usb)" />}
        {toast.type === 'error' && <AlertCircle size={18} color="var(--accent-danger)" />}
        {toast.type === 'info' && <Info size={18} color="var(--accent-bt)" />}
      </div>
      <div className="global-toast-message">{toast.message}</div>
      <button
        className="global-toast-close"
        onClick={() => setToast(null)}
        title="Fechar notificação"
      >
        <X size={14} />
      </button>
    </div>,
    document.body
  )}
</>
  );
};

export default App;
