import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { invoke } from '@tauri-apps/api/core';
import {
  StoreProfileDto,
  AppConfigDto,
  ConfigSnapshotDto,
  DatabaseStatsDto
} from '../types';
import {
  Store,
  Palette,
  HardDrive,
  Database,
  Download,
  Upload,
  RotateCcw,
  CheckCircle2,
  AlertCircle,
  X,
  RefreshCw,
  FileSpreadsheet,
  Archive,
  QrCode,
  Wrench
} from 'lucide-react';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  storeProfile: StoreProfileDto;
  appConfig: AppConfigDto;
  onSaveStore: (profile: StoreProfileDto) => Promise<void>;
  onSaveAppConfig: (config: AppConfigDto) => Promise<void>;
  onNotification: (type: 'success' | 'error', msg: string) => void;
}

type SettingsTab = 'store' | 'pix' | 'tech' | 'branding' | 'backup' | 'vacuum' | 'replication';

export const SettingsModal: React.FC<SettingsModalProps> = ({
  isOpen,
  onClose,
  storeProfile,
  appConfig,
  onSaveStore,
  onSaveAppConfig,
  onNotification,
}) => {
  const [tab, setTab] = useState<SettingsTab>('store');

  // Form states
  const [store, setStore] = useState<StoreProfileDto>(storeProfile);
  const [config, setConfig] = useState<AppConfigDto>(appConfig);

  // Auto-save feedback states
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [statusMessage, setStatusMessage] = useState<string>('');

  // Refs de controle de sincronismo e debounce
  const lastSavedStoreRef = useRef<string>(JSON.stringify(storeProfile));
  const lastSavedConfigRef = useRef<string>(JSON.stringify(appConfig));
  const storeTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const configTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Stats and snapshots
  const [stats, setStats] = useState<DatabaseStatsDto | null>(null);
  const [snapshots, setSnapshots] = useState<ConfigSnapshotDto[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  // Atualiza estados quando modal abre ou props mudam
  useEffect(() => {
    if (isOpen) {
      setStore(storeProfile);
      setConfig(appConfig);
      lastSavedStoreRef.current = JSON.stringify(storeProfile);
      lastSavedConfigRef.current = JSON.stringify(appConfig);
      setSaveStatus('idle');
    }
  }, [storeProfile, appConfig, isOpen]);

  const loadStatsAndSnapshots = async () => {
    try {
      const dbStats = await invoke<DatabaseStatsDto>('get_database_stats');
      setStats(dbStats);
      const snapList = await invoke<ConfigSnapshotDto[]>('list_config_snapshots');
      setSnapshots(snapList);
    } catch (err: any) {
      console.error(err);
    }
  };

  useEffect(() => {
    if (isOpen) {
      loadStatsAndSnapshots();
    }
  }, [isOpen]);

  // Auto-Save de Dados da Loja (Abas 'store', 'pix' e 'tech') via Debounce 750ms
  useEffect(() => {
    if (!isOpen) return;
    const currentJson = JSON.stringify(store);
    if (currentJson === lastSavedStoreRef.current) return;

    setSaveStatus('saving');
    setStatusMessage('Salvando...');

    if (storeTimeoutRef.current) clearTimeout(storeTimeoutRef.current);
    storeTimeoutRef.current = setTimeout(async () => {
      try {
        await onSaveStore(store);
        lastSavedStoreRef.current = currentJson;
        setSaveStatus('saved');
        setStatusMessage('Salvo no SQLite');
        loadStatsAndSnapshots();
        setTimeout(() => {
          setSaveStatus((prev) => (prev === 'saved' ? 'idle' : prev));
        }, 2500);
      } catch (err: any) {
        setSaveStatus('error');
        setStatusMessage('Erro ao salvar');
        onNotification('error', err?.toString() || 'Erro ao salvar alterações no banco.');
      }
    }, 750);

    return () => {
      if (storeTimeoutRef.current) clearTimeout(storeTimeoutRef.current);
    };
  }, [store, isOpen, onSaveStore, onNotification]);

  // Auto-Save de White-Label (Aba 'branding') via Debounce 750ms
  useEffect(() => {
    if (!isOpen) return;
    const currentJson = JSON.stringify(config);
    if (currentJson === lastSavedConfigRef.current) return;

    setSaveStatus('saving');
    setStatusMessage('Aplicando marca...');

    if (configTimeoutRef.current) clearTimeout(configTimeoutRef.current);
    configTimeoutRef.current = setTimeout(async () => {
      try {
        await onSaveAppConfig(config);
        lastSavedConfigRef.current = currentJson;
        setSaveStatus('saved');
        setStatusMessage('Identidade aplicada');
        loadStatsAndSnapshots();
        setTimeout(() => {
          setSaveStatus((prev) => (prev === 'saved' ? 'idle' : prev));
        }, 2500);
      } catch (err: any) {
        setSaveStatus('error');
        setStatusMessage('Erro ao salvar marca');
        onNotification('error', err?.toString() || 'Erro ao aplicar identidade White-Label.');
      }
    }, 750);

    return () => {
      if (configTimeoutRef.current) clearTimeout(configTimeoutRef.current);
    };
  }, [config, isOpen, onSaveAppConfig, onNotification]);

  // Fechamento seguro com Flush imediato de qualquer alteração pendente
  const handleCloseWithFlush = async () => {
    const storeJson = JSON.stringify(store);
    if (storeJson !== lastSavedStoreRef.current) {
      if (storeTimeoutRef.current) clearTimeout(storeTimeoutRef.current);
      try {
        await onSaveStore(store);
        lastSavedStoreRef.current = storeJson;
      } catch (err) {
        console.error('Erro no flush de store:', err);
      }
    }

    const configJson = JSON.stringify(config);
    if (configJson !== lastSavedConfigRef.current) {
      if (configTimeoutRef.current) clearTimeout(configTimeoutRef.current);
      try {
        await onSaveAppConfig(config);
        lastSavedConfigRef.current = configJson;
      } catch (err) {
        console.error('Erro no flush de config:', err);
      }
    }

    onClose();
  };

  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') handleCloseWithFlush();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, store, config]);

  const handleCreateBackup = async () => {
    setIsLoading(true);
    try {
      const res = await invoke<string>('create_database_backup', { destination: null });
      onNotification('success', res);
      loadStatsAndSnapshots();
    } catch (err: any) {
      onNotification('error', err?.toString() || 'Operação de backup cancelada.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleVacuum = async () => {
    setIsLoading(true);
    try {
      const newStats = await invoke<DatabaseStatsDto>('vacuum_database');
      setStats(newStats);
      onNotification('success', 'Banco de dados otimizado e compactado via VACUUM!');
    } catch (err: any) {
      onNotification('error', err?.toString() || 'Erro ao compactar banco.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleRollbackSnapshot = async (id: number) => {
    if (!confirm('Deseja realmente restaurar esta versão da configuração?')) return;
    setIsLoading(true);
    try {
      const res = await invoke<string>('rollback_config_snapshot', { snapshotId: id });
      onNotification('success', res);
      // Recarrega
      const updatedStore = await invoke<StoreProfileDto>('get_store_profile');
      const updatedConfig = await invoke<AppConfigDto>('get_app_config');
      setStore(updatedStore);
      setConfig(updatedConfig);
      await onSaveStore(updatedStore);
      await onSaveAppConfig(updatedConfig);
      loadStatsAndSnapshots();
    } catch (err: any) {
      onNotification('error', err?.toString() || 'Erro ao restaurar snapshot.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleExportBundle = async () => {
    try {
      const jsonStr = await invoke<string>('export_white_label_bundle');
      const blob = new Blob([jsonStr], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `whitelabel_bundle_${Date.now()}.json`;
      a.click();
      URL.revokeObjectURL(url);
      onNotification('success', 'Bundle White-Label exportado com sucesso!');
    } catch (err: any) {
      onNotification('error', 'Erro ao exportar bundle: ' + err);
    }
  };

  const handleImportBundleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (event) => {
      try {
        const content = event.target?.result as string;
        await invoke('import_white_label_bundle', { jsonStr: content });
        onNotification('success', 'Bundle White-Label importado e aplicado com sucesso!');
        const updatedStore = await invoke<StoreProfileDto>('get_store_profile');
        const updatedConfig = await invoke<AppConfigDto>('get_app_config');
        setStore(updatedStore);
        setConfig(updatedConfig);
        await onSaveStore(updatedStore);
        await onSaveAppConfig(updatedConfig);
        loadStatsAndSnapshots();
      } catch (err: any) {
        onNotification('error', 'Erro ao importar bundle: ' + err);
      }
    };
    reader.readAsText(file);
  };

  const handleExportCsv = async () => {
    try {
      const csv = await invoke<string>('export_receipts_csv');
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `historico_comprovantes_${Date.now()}.csv`;
      a.click();
      URL.revokeObjectURL(url);
      onNotification('success', 'Relatório CSV exportado com sucesso!');
    } catch (err: any) {
      onNotification('error', 'Erro ao exportar CSV: ' + err);
    }
  };

  if (!isOpen) return null;

  return createPortal(
    <div className="modal-backdrop" onClick={handleCloseWithFlush} style={{ zIndex: 99998 }}>
      <div
        className="modal-box"
        onClick={(e) => e.stopPropagation()}
        style={{
          maxWidth: '920px',
          width: '95%',
          maxHeight: '90vh',
          display: 'flex',
          flexDirection: 'column',
          padding: 0,
          overflow: 'hidden',
        }}
      >
        {/* Topo do Modal com Indicador de Auto-Save */}
        <div
          style={{
            padding: '16px 20px',
            borderBottom: '1px solid var(--border-color)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            background: 'var(--bg-card)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <Database size={20} color="var(--accent-usb)" />
            <h2 style={{ margin: 0, fontSize: '1.15rem', color: '#fff' }}>
              Painel de Configurações & White-Label
            </h2>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            {saveStatus === 'saving' && (
              <div className="autosave-pill saving">
                <RefreshCw size={12} className="spin-animation" />
                <span>{statusMessage || 'Salvando alterações...'}</span>
              </div>
            )}
            {saveStatus === 'saved' && (
              <div className="autosave-pill saved">
                <CheckCircle2 size={12} />
                <span>{statusMessage || 'Salvo no SQLite'}</span>
              </div>
            )}
            {saveStatus === 'error' && (
              <div className="autosave-pill error">
                <AlertCircle size={12} />
                <span>{statusMessage || 'Erro ao salvar'}</span>
              </div>
            )}
            {saveStatus === 'idle' && (
              <div className="autosave-pill idle" title="Salvamento contínuo no banco SQLite">
                <CheckCircle2 size={12} color="var(--accent-usb)" />
                <span>Auto-save ativo</span>
              </div>
            )}

            <button
              className="btn-secondary"
              style={{ padding: '6px' }}
              onClick={handleCloseWithFlush}
              title="Fechar (Esc)"
            >
              <X size={16} />
            </button>
          </div>
        </div>

        {/* Abas */}
        <div
          style={{
            display: 'flex',
            borderBottom: '1px solid var(--border-color)',
            background: '#090d16',
            padding: '0 16px',
            gap: '8px',
            overflowX: 'auto',
          }}
        >
          <button
            className={`btn-secondary ${tab === 'store' ? 'active-toggle' : ''}`}
            onClick={() => setTab('store')}
            style={{ borderRadius: '0', borderBottom: tab === 'store' ? '2px solid var(--accent-usb)' : 'none', padding: '12px 14px', background: 'transparent' }}
          >
            <Store size={15} />
            <span>Meu Estabelecimento</span>
          </button>

          <button
            className={`btn-secondary ${tab === 'pix' ? 'active-toggle' : ''}`}
            onClick={() => setTab('pix')}
            style={{ borderRadius: '0', borderBottom: tab === 'pix' ? '2px solid var(--accent-usb)' : 'none', padding: '12px 14px', background: 'transparent' }}
          >
            <QrCode size={15} />
            <span>Chave PIX & Pagamentos</span>
          </button>

          <button
            className={`btn-secondary ${tab === 'tech' ? 'active-toggle' : ''}`}
            onClick={() => setTab('tech')}
            style={{ borderRadius: '0', borderBottom: tab === 'tech' ? '2px solid var(--accent-usb)' : 'none', padding: '12px 14px', background: 'transparent' }}
          >
            <Wrench size={15} />
            <span>Assistência Técnica & CDC</span>
          </button>

          <button
            className={`btn-secondary ${tab === 'branding' ? 'active-toggle' : ''}`}
            onClick={() => setTab('branding')}
            style={{ borderRadius: '0', borderBottom: tab === 'branding' ? '2px solid var(--accent-usb)' : 'none', padding: '12px 14px', background: 'transparent' }}
          >
            <Palette size={15} />
            <span>White-Label & Marca</span>
          </button>

          <button
            className={`btn-secondary ${tab === 'backup' ? 'active-toggle' : ''}`}
            onClick={() => setTab('backup')}
            style={{ borderRadius: '0', borderBottom: tab === 'backup' ? '2px solid var(--accent-usb)' : 'none', padding: '12px 14px', background: 'transparent' }}
          >
            <HardDrive size={15} />
            <span>Backups & Snapshots</span>
          </button>

          <button
            className={`btn-secondary ${tab === 'vacuum' ? 'active-toggle' : ''}`}
            onClick={() => setTab('vacuum')}
            style={{ borderRadius: '0', borderBottom: tab === 'vacuum' ? '2px solid var(--accent-usb)' : 'none', padding: '12px 14px', background: 'transparent' }}
          >
            <RefreshCw size={15} />
            <span>Compactação & Banco</span>
          </button>

          <button
            className={`btn-secondary ${tab === 'replication' ? 'active-toggle' : ''}`}
            onClick={() => setTab('replication')}
            style={{ borderRadius: '0', borderBottom: tab === 'replication' ? '2px solid var(--accent-usb)' : 'none', padding: '12px 14px', background: 'transparent' }}
          >
            <Archive size={15} />
            <span>Importar / Exportar</span>
          </button>
        </div>

        {/* Conteúdo da Aba */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '20px' }}>
          {/* Aba 1: Estabelecimento */}
          {tab === 'store' && (
            <form onSubmit={(e) => e.preventDefault()} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1.5fr 1fr', gap: '12px' }}>
                <div>
                  <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Nome Fantasia *</span>
                  <input
                    type="text"
                    required
                    value={store.name}
                    onChange={(e) => setStore({ ...store, name: e.target.value })}
                    style={{ width: '100%', padding: '8px 12px', borderRadius: '4px', background: 'var(--bg-card)', border: '1px solid var(--border-color)', color: '#fff' }}
                  />
                </div>
                <div>
                  <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>CNPJ ou CPF *</span>
                  <input
                    type="text"
                    required
                    value={store.doc}
                    onChange={(e) => setStore({ ...store, doc: e.target.value })}
                    style={{ width: '100%', padding: '8px 12px', borderRadius: '4px', background: 'var(--bg-card)', border: '1px solid var(--border-color)', color: '#fff' }}
                  />
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div>
                  <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Razão Social</span>
                  <input
                    type="text"
                    value={store.legal_name || ''}
                    onChange={(e) => setStore({ ...store, legal_name: e.target.value })}
                    style={{ width: '100%', padding: '8px 12px', borderRadius: '4px', background: 'var(--bg-card)', border: '1px solid var(--border-color)', color: '#fff' }}
                  />
                </div>
                <div>
                  <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Telefone</span>
                  <input
                    type="text"
                    value={store.phone || ''}
                    onChange={(e) => setStore({ ...store, phone: e.target.value })}
                    style={{ width: '100%', padding: '8px 12px', borderRadius: '4px', background: 'var(--bg-card)', border: '1px solid var(--border-color)', color: '#fff' }}
                  />
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div>
                  <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>WhatsApp</span>
                  <input
                    type="text"
                    value={store.whatsapp || ''}
                    onChange={(e) => setStore({ ...store, whatsapp: e.target.value })}
                    style={{ width: '100%', padding: '8px 12px', borderRadius: '4px', background: 'var(--bg-card)', border: '1px solid var(--border-color)', color: '#fff' }}
                  />
                </div>
                <div>
                  <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>E-mail</span>
                  <input
                    type="email"
                    value={store.email || ''}
                    onChange={(e) => setStore({ ...store, email: e.target.value })}
                    style={{ width: '100%', padding: '8px 12px', borderRadius: '4px', background: 'var(--bg-card)', border: '1px solid var(--border-color)', color: '#fff' }}
                  />
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '12px' }}>
                <div>
                  <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Rua / Logradouro</span>
                  <input
                    type="text"
                    value={store.street || ''}
                    onChange={(e) => setStore({ ...store, street: e.target.value })}
                    style={{ width: '100%', padding: '8px 12px', borderRadius: '4px', background: 'var(--bg-card)', border: '1px solid var(--border-color)', color: '#fff' }}
                  />
                </div>
                <div>
                  <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Número</span>
                  <input
                    type="text"
                    value={store.number || ''}
                    onChange={(e) => setStore({ ...store, number: e.target.value })}
                    style={{ width: '100%', padding: '8px 12px', borderRadius: '4px', background: 'var(--bg-card)', border: '1px solid var(--border-color)', color: '#fff' }}
                  />
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.5fr 0.6fr 1fr', gap: '12px' }}>
                <div>
                  <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Bairro</span>
                  <input
                    type="text"
                    value={store.neighborhood || ''}
                    onChange={(e) => setStore({ ...store, neighborhood: e.target.value })}
                    style={{ width: '100%', padding: '8px 12px', borderRadius: '4px', background: 'var(--bg-card)', border: '1px solid var(--border-color)', color: '#fff' }}
                  />
                </div>
                <div>
                  <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Cidade</span>
                  <input
                    type="text"
                    value={store.city || ''}
                    onChange={(e) => setStore({ ...store, city: e.target.value })}
                    style={{ width: '100%', padding: '8px 12px', borderRadius: '4px', background: 'var(--bg-card)', border: '1px solid var(--border-color)', color: '#fff' }}
                  />
                </div>
                <div>
                  <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>UF</span>
                  <input
                    type="text"
                    maxLength={2}
                    value={store.state || ''}
                    onChange={(e) => setStore({ ...store, state: e.target.value.toUpperCase() })}
                    style={{ width: '100%', padding: '8px 12px', borderRadius: '4px', background: 'var(--bg-card)', border: '1px solid var(--border-color)', color: '#fff' }}
                  />
                </div>
                <div>
                  <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>CEP</span>
                  <input
                    type="text"
                    value={store.zip || ''}
                    onChange={(e) => setStore({ ...store, zip: e.target.value })}
                    style={{ width: '100%', padding: '8px 12px', borderRadius: '4px', background: 'var(--bg-card)', border: '1px solid var(--border-color)', color: '#fff' }}
                  />
                </div>
              </div>

              <div>
                <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Mensagem de Rodapé</span>
                <textarea
                  rows={2}
                  value={store.footer_message || ''}
                  onChange={(e) => setStore({ ...store, footer_message: e.target.value })}
                  style={{ width: '100%', padding: '8px 12px', borderRadius: '4px', background: 'var(--bg-card)', border: '1px solid var(--border-color)', color: '#fff', resize: 'vertical' }}
                />
              </div>

              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  padding: '10px 14px',
                  background: 'rgba(255, 255, 255, 0.02)',
                  borderRadius: 'var(--radius-sm)',
                  border: '1px solid var(--border-subtle)',
                  marginTop: '8px',
                }}
              >
                <CheckCircle2 size={14} color="var(--accent-usb)" />
                <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                  Auto-save ativo: Dados cadastrais da empresa sincronizados continuamente no banco SQLite.
                </span>
              </div>
            </form>
          )}

          {/* Aba PIX: Pagamentos & QRCode */}
          {tab === 'pix' && (
            <form onSubmit={(e) => e.preventDefault()} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div
                style={{
                  padding: '12px 16px',
                  borderRadius: '6px',
                  background: 'rgba(59, 130, 246, 0.08)',
                  border: '1px solid rgba(59, 130, 246, 0.25)',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '12px',
                }}
              >
                <QrCode size={24} color="var(--accent-usb)" />
                <div>
                  <h4 style={{ margin: 0, fontSize: '0.9rem', color: '#fff' }}>Recebimento Instantâneo via PIX</h4>
                  <p style={{ margin: '2px 0 0 0', fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                    Estes dados são utilizados automaticamente nas impressões térmicas de PDV e nos comprovantes de Ordens de Serviço.
                  </p>
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: '12px' }}>
                <div>
                  <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Tipo de Chave PIX *</span>
                  <select
                    value={store.pix_key_type || 'cnpj'}
                    onChange={(e) => setStore({ ...store, pix_key_type: e.target.value })}
                    style={{ width: '100%', padding: '8px 12px', borderRadius: '4px', background: 'var(--bg-card)', border: '1px solid var(--border-color)', color: '#fff' }}
                  >
                    <option value="cnpj">CNPJ</option>
                    <option value="cpf">CPF</option>
                    <option value="email">E-mail</option>
                    <option value="phone">Telefone / Celular</option>
                    <option value="random">Chave Aleatória (EVP)</option>
                  </select>
                </div>
                <div>
                  <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Chave PIX *</span>
                  <input
                    type="text"
                    placeholder="Ex: 16.843.110/0001-71 ou chave aleatória..."
                    value={store.pix_key || ''}
                    onChange={(e) => setStore({ ...store, pix_key: e.target.value })}
                    style={{ width: '100%', padding: '8px 12px', borderRadius: '4px', background: 'var(--bg-card)', border: '1px solid var(--border-color)', color: '#fff' }}
                  />
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1.5fr 1fr', gap: '12px' }}>
                <div>
                  <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Nome do Beneficiário / Titular da Conta</span>
                  <input
                    type="text"
                    placeholder="Ex: Lucas Thomaz / THZ InfoCell"
                    value={store.pix_beneficiary || ''}
                    onChange={(e) => setStore({ ...store, pix_beneficiary: e.target.value })}
                    style={{ width: '100%', padding: '8px 12px', borderRadius: '4px', background: 'var(--bg-card)', border: '1px solid var(--border-color)', color: '#fff' }}
                  />
                </div>
                <div>
                  <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Cidade do Titular</span>
                  <input
                    type="text"
                    placeholder="Ex: Nova Iguaçu"
                    value={store.pix_city || ''}
                    onChange={(e) => setStore({ ...store, pix_city: e.target.value })}
                    style={{ width: '100%', padding: '8px 12px', borderRadius: '4px', background: 'var(--bg-card)', border: '1px solid var(--border-color)', color: '#fff' }}
                  />
                </div>
              </div>

              {/* Preview na Bobina */}
              <div style={{ background: '#090d16', padding: '12px', borderRadius: '6px', border: '1px solid var(--border-color)' }}>
                <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                  Prévia no Rodapé da Bobina Térmica (58mm):
                </span>
                <div style={{ fontFamily: 'monospace', fontSize: '0.8rem', color: '#a0aec0', marginTop: '6px', whiteSpace: 'pre-wrap', lineHeight: '1.4' }}>
                  {`--------------------------------\nPAGAMENTO VIA PIX\nCHAVE: ${store.pix_key || '[NÃO CONFIGURADA]'}\nTITULAR: ${store.pix_beneficiary || store.name}\n--------------------------------`}
                </div>
              </div>

              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  padding: '10px 14px',
                  background: 'rgba(255, 255, 255, 0.02)',
                  borderRadius: 'var(--radius-sm)',
                  border: '1px solid var(--border-subtle)',
                  marginTop: '8px',
                }}
              >
                <CheckCircle2 size={14} color="var(--accent-usb)" />
                <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                  Auto-save ativo: Chave PIX e dados do recebedor sincronizados automaticamente para emissão e QR Code.
                </span>
              </div>
            </form>
          )}

          {/* Aba Assistência Técnica: Prazos e CDC */}
          {tab === 'tech' && (
            <form onSubmit={(e) => e.preventDefault()} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div
                style={{
                  padding: '12px 16px',
                  borderRadius: '6px',
                  background: 'rgba(234, 179, 8, 0.08)',
                  border: '1px solid rgba(234, 179, 8, 0.25)',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '12px',
                }}
              >
                <Wrench size={24} color="#eab308" />
                <div>
                  <h4 style={{ margin: 0, fontSize: '0.9rem', color: '#fff' }}>Parâmetros da Assistência Técnica (MapOS inspired)</h4>
                  <p style={{ margin: '2px 0 0 0', fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                    Defina prazos de garantia balcão e cláusulas legais impressas nos comprovantes de entrada e saída de equipamentos.
                  </p>
                </div>
              </div>

              <div>
                <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Prazo Padrão de Garantia Legal (em dias) *</span>
                <input
                  type="number"
                  min="0"
                  max="365"
                  value={store.tech_default_warranty_days || 90}
                  onChange={(e) => setStore({ ...store, tech_default_warranty_days: parseInt(e.target.value) || 90 })}
                  style={{ width: '160px', padding: '8px 12px', borderRadius: '4px', background: 'var(--bg-card)', border: '1px solid var(--border-color)', color: '#fff' }}
                />
              </div>

              <div>
                <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                  Termo Padrão de Garantia (Impresso no comprovante de saída / entrega)
                </span>
                <textarea
                  rows={3}
                  value={store.tech_warranty_terms || ''}
                  onChange={(e) => setStore({ ...store, tech_warranty_terms: e.target.value })}
                  style={{ width: '100%', padding: '8px 12px', borderRadius: '4px', background: 'var(--bg-card)', border: '1px solid var(--border-color)', color: '#fff', resize: 'vertical' }}
                />
              </div>

              <div>
                <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                  Cláusula de Guarda e Abandono de Aparelhos (Artigo do CDC - Impresso na via de entrada)
                </span>
                <textarea
                  rows={3}
                  value={store.tech_abandonment_terms || ''}
                  onChange={(e) => setStore({ ...store, tech_abandonment_terms: e.target.value })}
                  style={{ width: '100%', padding: '8px 12px', borderRadius: '4px', background: 'var(--bg-card)', border: '1px solid var(--border-color)', color: '#fff', resize: 'vertical' }}
                />
              </div>

              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  padding: '10px 14px',
                  background: 'rgba(255, 255, 255, 0.02)',
                  borderRadius: 'var(--radius-sm)',
                  border: '1px solid var(--border-subtle)',
                  marginTop: '8px',
                }}
              >
                <CheckCircle2 size={14} color="var(--accent-usb)" />
                <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                  Auto-save ativo: Prazos de garantia e cláusulas legais do CDC gravados para as vias térmicas.
                </span>
              </div>
            </form>
          )}

          {/* Aba White-Label */}
          {tab === 'branding' && (
            <form onSubmit={(e) => e.preventDefault()} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div>
                  <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Título da Aplicação (App Name)</span>
                  <input
                    type="text"
                    required
                    value={config.app_name}
                    onChange={(e) => setConfig({ ...config, app_name: e.target.value })}
                    style={{ width: '100%', padding: '8px 12px', borderRadius: '4px', background: 'var(--bg-card)', border: '1px solid var(--border-color)', color: '#fff' }}
                  />
                </div>
                <div>
                  <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Subtítulo / Slogan da Marca</span>
                  <input
                    type="text"
                    value={config.app_subtitle}
                    onChange={(e) => setConfig({ ...config, app_subtitle: e.target.value })}
                    style={{ width: '100%', padding: '8px 12px', borderRadius: '4px', background: 'var(--bg-card)', border: '1px solid var(--border-color)', color: '#fff' }}
                  />
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div>
                  <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Cor de Destaque da Marca</span>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginTop: '4px' }}>
                    <input
                      type="color"
                      value={config.accent_color}
                      onChange={(e) => setConfig({ ...config, accent_color: e.target.value })}
                      style={{ width: '40px', height: '36px', borderRadius: '4px', border: 'none', cursor: 'pointer', background: 'none' }}
                    />
                    <input
                      type="text"
                      value={config.accent_color}
                      onChange={(e) => setConfig({ ...config, accent_color: e.target.value })}
                      style={{ flex: 1, padding: '8px 12px', borderRadius: '4px', background: 'var(--bg-card)', border: '1px solid var(--border-color)', color: '#fff' }}
                    />
                  </div>
                </div>

                <div>
                  <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Largura Padrão da Bobina</span>
                  <select
                    value={config.default_width_dots}
                    onChange={(e) => setConfig({ ...config, default_width_dots: parseInt(e.target.value) || 384 })}
                    style={{ width: '100%', marginTop: '4px', padding: '9px 12px', borderRadius: '4px', background: 'var(--bg-card)', border: '1px solid var(--border-color)', color: '#fff' }}
                  >
                    <option value={384}>58 mm (384 dots / 32 colunas)</option>
                    <option value={576}>80 mm (576 dots / 48 colunas)</option>
                  </select>
                </div>
              </div>

              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  padding: '10px 14px',
                  background: 'rgba(255, 255, 255, 0.02)',
                  borderRadius: 'var(--radius-sm)',
                  border: '1px solid var(--border-subtle)',
                  marginTop: '8px',
                }}
              >
                <CheckCircle2 size={14} color="var(--accent-usb)" />
                <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                  Auto-save ativo: Identidade da marca, paleta de cores e largura da bobina atualizadas em tempo real.
                </span>
              </div>
            </form>
          )}

          {/* Aba 3: Backups & Snapshots */}
          {tab === 'backup' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px', background: 'var(--bg-card)', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-color)' }}>
                <div>
                  <h4 style={{ margin: 0, fontSize: '0.95rem', color: '#fff' }}>Backup Integral Online (.db)</h4>
                  <p style={{ margin: '4px 0 0 0', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                    Gera uma cópia exata e consistente do banco SQLite sem congelar a tela nem parar impressões.
                  </p>
                </div>
                <button className="btn-primary usb" onClick={handleCreateBackup} disabled={isLoading} style={{ gap: '8px' }}>
                  <Download size={15} />
                  <span>Gerar Backup Agora</span>
                </button>
              </div>

              <div>
                <h4 style={{ margin: '0 0 10px 0', fontSize: '0.9rem', color: 'var(--text-secondary)' }}>
                  Snapshots de Configuração com Rollback
                </h4>
                {snapshots.length === 0 ? (
                  <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Nenhum snapshot registrado ainda.</p>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', maxHeight: '250px', overflowY: 'auto' }}>
                    {snapshots.map((s) => (
                      <div
                        key={s.id}
                        style={{
                          padding: '10px 14px',
                          background: 'var(--bg-card)',
                          border: '1px solid var(--border-color)',
                          borderRadius: 'var(--radius-sm)',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                        }}
                      >
                        <div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <span style={{ fontSize: '0.8rem', fontWeight: 700, color: '#fff' }}>
                              #{s.id} {s.description || 'Snapshot de Configuração'}
                            </span>
                            <span style={{ fontSize: '0.7rem', padding: '2px 6px', borderRadius: '4px', background: 'rgba(59, 130, 246, 0.2)', color: '#93c5fd' }}>
                              {s.snapshot_type}
                            </span>
                          </div>
                          <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                            {new Date(s.created_at).toLocaleString('pt-BR')}
                          </span>
                        </div>
                        <button
                          className="btn-secondary"
                          style={{ padding: '5px 10px', fontSize: '0.75rem', gap: '6px' }}
                          onClick={() => handleRollbackSnapshot(s.id)}
                          disabled={isLoading}
                        >
                          <RotateCcw size={13} color="var(--accent-bt)" />
                          <span>Restaurar</span>
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Aba 4: Compactação & Manutenção */}
          {tab === 'vacuum' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              {stats && (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '12px' }}>
                  <div style={{ padding: '14px', background: 'var(--bg-card)', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-color)' }}>
                    <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Tamanho em Disco</span>
                    <h3 style={{ margin: '4px 0 0 0', fontSize: '1.2rem', color: 'var(--accent-usb)' }}>
                      {(stats.file_size_bytes / 1024).toFixed(1)} KB
                    </h3>
                  </div>
                  <div style={{ padding: '14px', background: 'var(--bg-card)', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-color)' }}>
                    <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Comprovantes Registrados</span>
                    <h3 style={{ margin: '4px 0 0 0', fontSize: '1.2rem', color: '#fff' }}>
                      {stats.total_receipts}
                    </h3>
                  </div>
                  <div style={{ padding: '14px', background: 'var(--bg-card)', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-color)' }}>
                    <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Modo de Escrita</span>
                    <h3 style={{ margin: '4px 0 0 0', fontSize: '1.2rem', color: 'var(--accent-bt)' }}>
                      WAL Mode (Ativo)
                    </h3>
                  </div>
                </div>
              )}

              <div style={{ padding: '16px', background: 'var(--bg-card)', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-color)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div>
                  <h4 style={{ margin: 0, fontSize: '0.95rem', color: '#fff' }}>Otimizar e Desfragmentar Banco (VACUUM)</h4>
                  <p style={{ margin: '4px 0 0 0', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                    Executa <code style={{ color: 'var(--accent-usb)' }}>PRAGMA incremental_vacuum; VACUUM;</code> liberando espaço de páginas vazias no disco.
                  </p>
                </div>
                <button className="btn-secondary" onClick={handleVacuum} disabled={isLoading} style={{ gap: '8px' }}>
                  <RefreshCw size={14} />
                  <span>Executar VACUUM</span>
                </button>
              </div>

              {stats && (
                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', wordBreak: 'break-all' }}>
                  Caminho do Banco: <code>{stats.file_path}</code>
                </div>
              )}
            </div>
          )}

          {/* Aba 5: Importar / Exportar */}
          {tab === 'replication' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              {/* White-Label Bundle */}
              <div style={{ padding: '16px', background: 'var(--bg-card)', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-color)' }}>
                <h4 style={{ margin: 0, fontSize: '0.95rem', color: '#fff' }}>Replicação White-Label (Bundle JSON)</h4>
                <p style={{ margin: '4px 0 12px 0', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                  Exporte ou importe um arquivo com todos os dados cadastrais e personalizações visuais para clonar caixas em 1 clique.
                </p>
                <div style={{ display: 'flex', gap: '10px' }}>
                  <button className="btn-primary usb" onClick={handleExportBundle} style={{ gap: '8px' }}>
                    <Download size={14} />
                    <span>Exportar Bundle (.json)</span>
                  </button>

                  <label className="btn-secondary" style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <Upload size={14} />
                    <span>Importar Bundle (.json)</span>
                    <input
                      type="file"
                      accept=".json"
                      onChange={handleImportBundleFile}
                      style={{ display: 'none' }}
                    />
                  </label>
                </div>
              </div>

              {/* Relatório CSV */}
              <div style={{ padding: '16px', background: 'var(--bg-card)', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-color)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div>
                  <h4 style={{ margin: 0, fontSize: '0.95rem', color: '#fff' }}>Exportar Histórico em Planilha (.csv)</h4>
                  <p style={{ margin: '4px 0 0 0', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                    Exporta o log de comprovantes emitidos com datas, valores e métodos de pagamento para abertura no Excel.
                  </p>
                </div>
                <button className="btn-secondary" onClick={handleExportCsv} style={{ gap: '8px' }}>
                  <FileSpreadsheet size={15} color="var(--accent-usb)" />
                  <span>Baixar CSV</span>
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
};
