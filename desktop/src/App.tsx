import React, { useEffect, useState, useCallback } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { PrinterDto, DocumentPreviewDto, PrintJobRequest } from './types';
import { Header } from './components/Header';
import { Sidebar } from './components/Sidebar';
import { ThermalViewer } from './components/ThermalViewer';
import { ConfirmModal } from './components/ConfirmModal';
import { ReceiptBuilder } from './components/ReceiptBuilder';
import {
  FileUp,
  FileText,
  Type,
  Receipt,
  Trash2,
  Printer,
  CheckCircle2,
  AlertCircle,
  Clock,
  Minus,
  WrapText
} from 'lucide-react';

export const App: React.FC = () => {
  // Estado dos Dispositivos
  const [printers, setPrinters] = useState<PrinterDto[]>([]);
  const [selectedPrinter, setSelectedPrinter] = useState<PrinterDto | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Configurações de Impressão ESC/POS
  const [widthDots, setWidthDots] = useState<number>(384);
  const [codePage, setCodePage] = useState<number>(3); // CP860 Português

  // Modo de Trabalho: Notinha/Caixa, Documento (PDF/IMG/TXT) ou Texto Livre
  const [activeTab, setActiveTab] = useState<'receipt' | 'file' | 'text'>('receipt');

  // Estado da Notinha Interativa (PDV / Caixa)
  const [compiledReceiptText, setCompiledReceiptText] = useState<string>('');

  // Estado do Documento
  const [preview, setPreview] = useState<DocumentPreviewDto | null>(null);
  const [isLoadingDoc, setIsLoadingDoc] = useState(false);

  // Estado do Modo Texto Direto
  const [directText, setDirectText] = useState<string>(
    '================================\n' +
    '        THZ THERMALKIT          \n' +
    '    IMPRESSÃO DIRETA ESC/POS    \n' +
    '================================\n\n' +
    'Item                    Qtd   R$\n' +
    '--------------------------------\n' +
    'Cafe Expresso            1  6,00\n' +
    'Pao na Chapa             1  7,50\n' +
    'Agua Mineral             1  4,00\n' +
    '--------------------------------\n' +
    'TOTAL:                  R$ 17,50\n\n' +
    'Pagamento: PIX / Dinheiro\n\n' +
    'Obrigado pela preferencia!\n' +
    '================================'
  );

  // Modal de Confirmação e Feedback
  const [isConfirmOpen, setIsConfirmOpen] = useState(false);
  const [isPrinting, setIsPrinting] = useState(false);
  const [toast, setToast] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  const showToast = (type: 'success' | 'error', message: string, duration = 4000) => {
    setToast({ type, message });
    setTimeout(() => {
      setToast((current) => (current?.message === message ? null : current));
    }, duration);
  };

  // Busca de Impressoras Conectadas (USB e Bluetooth)
  const refreshPrinters = useCallback(async () => {
    setIsRefreshing(true);
    try {
      const list = await invoke<PrinterDto[]>('list_printers');
      setPrinters(list);

      // Mantém a seleção anterior se ainda existir ou seleciona a primeira
      if (list.length > 0) {
        setSelectedPrinter((current) => {
          if (current) {
            const stillExists = list.find(
              (p) => p.transport_type === current.transport_type && p.target === current.target
            );
            if (stillExists) return stillExists;
          }
          // Prioriza impressora Bluetooth se disponível, senão pega a primeira
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

  // Carrega e gera a prévia térmica do arquivo
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

  // Seleção de Documento via FileDialog nativo (RFD)
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

  // Quando a largura (dots) mudar, atualiza o preview se houver arquivo carregado
  const handleUpdateWidth = (newWidth: number) => {
    setWidthDots(newWidth);
    if (preview && preview.file_path) {
      loadFilePreview(preview.file_path, newWidth);
    }
  };

  // Disparo da Impressão Direta
  const handleExecutePrint = async () => {
    if (!selectedPrinter) {
      showToast('error', 'Selecione uma impressora antes de imprimir.');
      return;
    }

    setIsPrinting(true);
    try {
      const isDirect = activeTab === 'receipt' || activeTab === 'text';
      const textToPrint = activeTab === 'receipt' ? compiledReceiptText : directText;

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
    } catch (err) {
      showToast('error', `Erro na impressão: ${String(err)}`, 6000);
    } finally {
      setIsPrinting(false);
    }
  };

  // Prepara objeto virtual de preview para modo Notinha ou Texto Direto
  const virtualTextPreview: DocumentPreviewDto | null =
    activeTab === 'receipt'
      ? {
          file_name: 'notinha_caixa.txt',
          file_path: '',
          file_size: compiledReceiptText.length,
          kind: 'text',
          text_content: compiledReceiptText,
          preview_image_base64: null,
          page_count: 1,
          width_dots: widthDots,
        }
      : activeTab === 'text'
      ? {
          file_name: 'recibo_direto.txt',
          file_path: '',
          file_size: directText.length,
          kind: 'text',
          text_content: directText,
          preview_image_base64: null,
          page_count: 1,
          width_dots: widthDots,
        }
      : preview;

  const canPrint =
    selectedPrinter !== null &&
    ((activeTab === 'receipt' && compiledReceiptText.trim().length > 0) ||
      (activeTab === 'file' && preview !== null) ||
      (activeTab === 'text' && directText.trim().length > 0));

  // Inserções rápidas no editor de texto
  const maxCols = widthDots === 576 ? 48 : 32;

  const overflowingLines = directText
    .split('\n')
    .map((line, idx) => ({ lineNum: idx + 1, len: line.length, text: line }))
    .filter((x) => x.len > maxCols);

  const autoWrapDirectText = () => {
    const wrapped = directText
      .split('\n')
      .map((line) => {
        if (line.length <= maxCols) return line;
        const chunks: string[] = [];
        for (let i = 0; i < line.length; i += maxCols) {
          chunks.push(line.slice(i, i + maxCols));
        }
        return chunks.join('\n');
      })
      .join('\n');
    setDirectText(wrapped);
    showToast('success', `Texto formatado para o limite de ${maxCols} colunas!`);
  };

  const insertTimestamp = () => {
    const now = new Date();
    const dateStr = now.toLocaleDateString('pt-BR') + ' ' + now.toLocaleTimeString('pt-BR');
    setDirectText((prev) => prev + `\nData/Hora: ${dateStr}\n`);
  };

  const insertDivider = () => {
    setDirectText((prev) => prev + '\n--------------------------------\n');
  };

  return (
    <div className="app-container">
      {/* Toast Notification Banner */}
      {toast && (
        <div className={`toast-banner ${toast.type}`}>
          {toast.type === 'success' ? <CheckCircle2 size={18} /> : <AlertCircle size={18} />}
          <span>{toast.message}</span>
        </div>
      )}

      {/* Header Superior */}
      <Header
        selectedPrinter={selectedPrinter}
        printersCount={printers.length}
        onRefresh={refreshPrinters}
        isRefreshing={isRefreshing}
      />

      {/* Conteúdo Principal Dividido (Sidebar + Área de Bobina Térmica) */}
      <div className="app-content">
        <Sidebar
          printers={printers}
          selectedPrinter={selectedPrinter}
          onSelectPrinter={setSelectedPrinter}
          widthDots={widthDots}
          codePage={codePage}
          onUpdateWidth={handleUpdateWidth}
          onUpdateCodePage={setCodePage}
        />

        <main className="viewer-panel glass-panel">
          {/* Barra Superior da Área de Impressão */}
          <div className="viewer-header">
            {/* Seletor de Modo (Notinha vs Arquivo vs Texto) */}
            <div className="mode-switch-container">
              <button
                className={`mode-tab-btn ${activeTab === 'receipt' ? 'active' : ''}`}
                onClick={() => setActiveTab('receipt')}
              >
                <Receipt size={14} />
                <span>Gerador de Notinha (PDV)</span>
              </button>

              <button
                className={`mode-tab-btn ${activeTab === 'file' ? 'active' : ''}`}
                onClick={() => setActiveTab('file')}
              >
                <FileText size={14} />
                <span>Arquivo (PDF / Img)</span>
              </button>

              <button
                className={`mode-tab-btn ${activeTab === 'text' ? 'active' : ''}`}
                onClick={() => setActiveTab('text')}
              >
                <Type size={14} />
                <span>Texto Livre</span>
              </button>
            </div>

            {/* Ações do Modo Arquivo */}
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

            {/* Ações do Modo Texto Livre */}
            {activeTab === 'text' && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <button
                  className="btn-secondary"
                  style={{
                    padding: '6px 10px',
                    fontSize: '0.75rem',
                    color: overflowingLines.length > 0 ? 'var(--accent-warning)' : 'inherit',
                  }}
                  onClick={autoWrapDirectText}
                  title={`Ajustar linhas longas para caberem em ${maxCols} colunas`}
                >
                  <WrapText size={13} />
                  <span>Ajustar ({maxCols} col)</span>
                </button>

                <button
                  className="btn-secondary"
                  style={{ padding: '6px 10px', fontSize: '0.75rem' }}
                  onClick={insertTimestamp}
                  title="Inserir data e hora atual"
                >
                  <Clock size={13} />
                  <span>Data/Hora</span>
                </button>

                <button
                  className="btn-secondary"
                  style={{ padding: '6px 10px', fontSize: '0.75rem' }}
                  onClick={insertDivider}
                  title="Inserir linha divisória"
                >
                  <Minus size={13} />
                  <span>Linha</span>
                </button>

                <button
                  className="btn-secondary"
                  style={{ padding: '6px 10px', fontSize: '0.75rem', color: 'var(--accent-danger)' }}
                  onClick={() => setDirectText('')}
                  title="Limpar texto"
                >
                  <Trash2 size={13} />
                  <span>Limpar</span>
                </button>
              </div>
            )}
          </div>

          {/* Área Central: Visualizador da Bobina Térmica ou Editor */}
          {activeTab === 'receipt' ? (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 370px', gap: '16px', flex: 1, minHeight: 0, overflow: 'hidden' }}>
              {/* Painel Interativo de Notinha (Caixa / PDV) */}
              <ReceiptBuilder
                widthDots={widthDots}
                onReceiptChange={setCompiledReceiptText}
              />

              {/* Prévia em tempo real na Bobina */}
              <div style={{ overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
                <ThermalViewer preview={virtualTextPreview} widthDots={widthDots} />
              </div>
            </div>
          ) : activeTab === 'file' ? (
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
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 370px', gap: '16px', flex: 1, minHeight: 0 }}>
              {/* Editor de Texto com Contador de Colunas */}
              <div className="direct-text-wrapper">
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                  <span>Editor ESC/POS • Fonte A (12×24)</span>
                  {overflowingLines.length > 0 ? (
                    <span style={{ color: 'var(--accent-warning)', fontWeight: 700 }}>
                      ⚠️ {overflowingLines.length} linha(s) excedem {maxCols} colunas!
                    </span>
                  ) : (
                    <span style={{ color: 'var(--accent-usb)', fontWeight: 700 }}>
                      ✓ 100% alinhado ({maxCols} colunas)
                    </span>
                  )}
                </div>

                <textarea
                  className="direct-textarea"
                  value={directText}
                  onChange={(e) => setDirectText(e.target.value)}
                  placeholder="Digite aqui o texto ou recibo para imprimir na bobina térmica..."
                  spellCheck={false}
                />

                {overflowingLines.length > 0 && (
                  <div
                    style={{
                      padding: '8px 12px',
                      background: 'rgba(245, 158, 11, 0.1)',
                      border: '1px solid rgba(245, 158, 11, 0.3)',
                      borderRadius: 'var(--radius-sm)',
                      fontSize: '0.75rem',
                      color: '#fde68a',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      gap: '8px',
                    }}
                  >
                    <span>
                      ⚠️ Linha {overflowingLines[0].lineNum} possui {overflowingLines[0].len} caracteres (máx: {maxCols}). Na impressora física, o excesso cairá para a linha de baixo!
                    </span>
                    <button
                      className="btn-secondary"
                      style={{ padding: '4px 8px', fontSize: '0.7rem', flexShrink: 0 }}
                      onClick={autoWrapDirectText}
                    >
                      Ajustar automaticamente
                    </button>
                  </div>
                )}
              </div>

              {/* Prévia em tempo real na Bobina */}
              <div style={{ overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
                <ThermalViewer preview={virtualTextPreview} widthDots={widthDots} />
              </div>
            </div>
          )}

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
    </div>
  );
};

export default App;
