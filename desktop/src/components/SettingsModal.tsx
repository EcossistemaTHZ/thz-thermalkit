import React, { useState, useEffect } from 'react';
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
  X,
  RefreshCw,
  FileSpreadsheet,
  Archive
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

type SettingsTab = 'store' | 'branding' | 'backup' | 'vacuum' | 'replication';

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

  // Stats and snapshots
  const [stats, setStats] = useState<DatabaseStatsDto | null>(null);
  const [snapshots, setSnapshots] = useState<ConfigSnapshotDto[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    setStore(storeProfile);
    setConfig(appConfig);
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

  if (!isOpen) return null;

  const handleSaveStore = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    try {
      await onSaveStore(store);
      onNotification('success', 'Dados do estabelecimento salvos com sucesso!');
      loadStatsAndSnapshots();
    } catch (err: any) {
      onNotification('error', err?.toString() || 'Erro ao salvar dados do estabelecimento.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleSaveConfig = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    try {
      await onSaveAppConfig(config);
      onNotification('success', 'Configurações White-Label aplicadas!');
      loadStatsAndSnapshots();
    } catch (err: any) {
      onNotification('error', err?.toString() || 'Erro ao salvar configurações.');
    } finally {
      setIsLoading(false);
    }
  };

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

  return (
    <div className="modal-backdrop" style={{ zIndex: 9998 }}>
      <div
        className="modal-box"
        style={{
          maxWidth: '900px',
          width: '95%',
          maxHeight: '90vh',
          display: 'flex',
          flexDirection: 'column',
          padding: 0,
          overflow: 'hidden',
        }}
      >
        {/* Topo do Modal */}
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
          <button
            className="btn-secondary"
            style={{ padding: '6px' }}
            onClick={onClose}
          >
            <X size={16} />
          </button>
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
            <form onSubmit={handleSaveStore} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
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

              <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '10px' }}>
                <button type="submit" className="btn-primary usb" disabled={isLoading} style={{ gap: '8px' }}>
                  <CheckCircle2 size={16} />
                  <span>{isLoading ? 'Salvando...' : 'Salvar Alterações'}</span>
                </button>
              </div>
            </form>
          )}

          {/* Aba 2: White-Label */}
          {tab === 'branding' && (
            <form onSubmit={handleSaveConfig} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
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

              <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '10px' }}>
                <button type="submit" className="btn-primary usb" disabled={isLoading} style={{ gap: '8px' }}>
                  <CheckCircle2 size={16} />
                  <span>{isLoading ? 'Salvando...' : 'Aplicar Identidade White-Label'}</span>
                </button>
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
    </div>
  );
};
