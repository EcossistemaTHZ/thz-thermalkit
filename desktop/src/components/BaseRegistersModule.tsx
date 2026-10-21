import React, { useState, useEffect, useCallback } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { ClientDto, ProductDto, ServiceItemDto } from '../types';
import {
  Users,
  Package,
  Wrench,
  Search,
  Plus,
  Trash2,
  Edit2,
  AlertTriangle,
  X
} from 'lucide-react';

interface BaseRegistersModuleProps {
  onNotification: (type: 'success' | 'error', msg: string) => void;
}

type RegisterTab = 'clients' | 'products' | 'services';

export const BaseRegistersModule: React.FC<BaseRegistersModuleProps> = ({
  onNotification,
}) => {
  const [activeTab, setActiveTab] = useState<RegisterTab>('clients');

  // Estados dos Cadastros
  const [clients, setClients] = useState<ClientDto[]>([]);
  const [products, setProducts] = useState<ProductDto[]>([]);
  const [services, setServices] = useState<ServiceItemDto[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  // Modais de Criação / Edição
  const [isClientModalOpen, setIsClientModalOpen] = useState(false);
  const [editingClient, setEditingClient] = useState<ClientDto | null>(null);

  const [isProductModalOpen, setIsProductModalOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<ProductDto | null>(null);

  const [isServiceModalOpen, setIsServiceModalOpen] = useState(false);
  const [editingService, setEditingService] = useState<ServiceItemDto | null>(null);

  // Carregar dados
  const loadData = useCallback(async () => {
    setIsLoading(true);
    try {
      if (activeTab === 'clients') {
        const list = await invoke<ClientDto[]>('list_clients', { search: searchQuery || null });
        setClients(list);
      } else if (activeTab === 'products') {
        const list = await invoke<ProductDto[]>('list_products', { search: searchQuery || null });
        setProducts(list);
      } else if (activeTab === 'services') {
        const list = await invoke<ServiceItemDto[]>('list_services', { search: searchQuery || null });
        setServices(list);
      }
    } catch (err: any) {
      onNotification('error', `Falha ao carregar dados: ${String(err)}`);
    } finally {
      setIsLoading(false);
    }
  }, [activeTab, searchQuery, onNotification]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Ações de Clientes
  const handleSaveClient = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingClient || !editingClient.name.trim()) {
      onNotification('error', 'O nome do cliente é obrigatório.');
      return;
    }
    try {
      await invoke('save_client', { client: editingClient });
      onNotification('success', 'Cliente salvo com sucesso!');
      setIsClientModalOpen(false);
      setEditingClient(null);
      loadData();
    } catch (err: any) {
      onNotification('error', `Erro ao salvar cliente: ${String(err)}`);
    }
  };

  const handleDeleteClient = async (id: number) => {
    if (!window.confirm('Deseja realmente remover este cliente?')) return;
    try {
      await invoke('delete_client', { id });
      onNotification('success', 'Cliente removido.');
      loadData();
    } catch (err: any) {
      onNotification('error', `Erro ao remover cliente: ${String(err)}`);
    }
  };

  // Ações de Produtos
  const handleSaveProduct = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingProduct || !editingProduct.description.trim() || !editingProduct.code.trim()) {
      onNotification('error', 'Código e descrição são obrigatórios.');
      return;
    }
    try {
      await invoke('save_product', { product: editingProduct });
      onNotification('success', 'Produto/Peça salva com sucesso!');
      setIsProductModalOpen(false);
      setEditingProduct(null);
      loadData();
    } catch (err: any) {
      onNotification('error', `Erro ao salvar produto: ${String(err)}`);
    }
  };

  const handleDeleteProduct = async (id: number) => {
    if (!window.confirm('Deseja realmente excluir este item?')) return;
    try {
      await invoke('delete_product', { id });
      onNotification('success', 'Produto removido.');
      loadData();
    } catch (err: any) {
      onNotification('error', `Erro ao remover produto: ${String(err)}`);
    }
  };

  // Ações de Serviços
  const handleSaveService = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingService || !editingService.name.trim()) {
      onNotification('error', 'O nome do serviço é obrigatório.');
      return;
    }
    try {
      await invoke('save_service', { service: editingService });
      onNotification('success', 'Serviço salvo com sucesso!');
      setIsServiceModalOpen(false);
      setEditingService(null);
      loadData();
    } catch (err: any) {
      onNotification('error', `Erro ao salvar serviço: ${String(err)}`);
    }
  };

  const handleDeleteService = async (id: number) => {
    if (!window.confirm('Deseja realmente remover este serviço?')) return;
    try {
      await invoke('delete_service', { id });
      onNotification('success', 'Serviço removido.');
      loadData();
    } catch (err: any) {
      onNotification('error', `Erro ao remover serviço: ${String(err)}`);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', gap: '16px' }}>
      {/* Barra de Sub-Navegação dos Cadastros */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid var(--border-color)', paddingBottom: '12px' }}>
        <div style={{ display: 'flex', gap: '8px' }}>
          <button
            className={`btn-secondary ${activeTab === 'clients' ? 'active-toggle' : ''}`}
            onClick={() => { setActiveTab('clients'); setSearchQuery(''); }}
          >
            <Users size={15} color="var(--accent-usb)" />
            <span>Clientes ({clients.length})</span>
          </button>
          <button
            className={`btn-secondary ${activeTab === 'products' ? 'active-toggle' : ''}`}
            onClick={() => { setActiveTab('products'); setSearchQuery(''); }}
          >
            <Package size={15} color="#eab308" />
            <span>Peças & Produtos ({products.length})</span>
          </button>
          <button
            className={`btn-secondary ${activeTab === 'services' ? 'active-toggle' : ''}`}
            onClick={() => { setActiveTab('services'); setSearchQuery(''); }}
          >
            <Wrench size={15} color="#10b981" />
            <span>Serviços / Mão de Obra ({services.length})</span>
          </button>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <div style={{ position: 'relative', width: '220px' }}>
            <Search size={14} style={{ position: 'absolute', left: '10px', top: '10px', color: 'var(--text-muted)' }} />
            <input
              type="text"
              placeholder="Buscar..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              style={{
                width: '100%',
                padding: '6px 10px 6px 30px',
                borderRadius: '4px',
                background: 'var(--bg-card)',
                border: '1px solid var(--border-color)',
                color: '#fff',
                fontSize: '0.8rem',
              }}
            />
          </div>

          {activeTab === 'clients' && (
            <button
              className="btn-primary usb"
              style={{ padding: '6px 14px', fontSize: '0.8rem' }}
              onClick={() => {
                setEditingClient({
                  name: '',
                  document: '',
                  phone: '',
                  whatsapp: '',
                  email: '',
                  street: '',
                  number: '',
                  neighborhood: '',
                  city: '',
                  state: '',
                  zip: '',
                  notes: '',
                });
                setIsClientModalOpen(true);
              }}
            >
              <Plus size={14} />
              <span>Novo Cliente</span>
            </button>
          )}

          {activeTab === 'products' && (
            <button
              className="btn-primary usb"
              style={{ padding: '6px 14px', fontSize: '0.8rem', background: '#eab308', borderColor: '#eab308' }}
              onClick={() => {
                const nextCode = `P-${(products.length + 1).toString().padStart(3, '0')}`;
                setEditingProduct({
                  code: nextCode,
                  description: '',
                  cost_price_cents: 0,
                  sale_price_cents: 0,
                  stock_qty: 0,
                  min_stock_qty: 2,
                  unit: 'UN',
                  category: 'Geral',
                });
                setIsProductModalOpen(true);
              }}
            >
              <Plus size={14} />
              <span>Novo Produto / Peça</span>
            </button>
          )}

          {activeTab === 'services' && (
            <button
              className="btn-primary usb"
              style={{ padding: '6px 14px', fontSize: '0.8rem', background: '#10b981', borderColor: '#10b981' }}
              onClick={() => {
                setEditingService({
                  name: '',
                  price_cents: 0,
                  description: '',
                });
                setIsServiceModalOpen(true);
              }}
            >
              <Plus size={14} />
              <span>Novo Serviço</span>
            </button>
          )}
        </div>
      </div>

      {/* Tabela de Clientes */}
      {activeTab === 'clients' && (
        <div style={{ flex: 1, overflowY: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.82rem', textAlign: 'left' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border-color)', color: 'var(--text-muted)' }}>
                <th style={{ padding: '8px' }}>Nome / Razão</th>
                <th style={{ padding: '8px' }}>Documento</th>
                <th style={{ padding: '8px' }}>Contato (Zap / Tel)</th>
                <th style={{ padding: '8px' }}>Cidade / Bairro</th>
                <th style={{ padding: '8px', textAlign: 'right' }}>Ações</th>
              </tr>
            </thead>
            <tbody>
              {clients.length === 0 ? (
                <tr>
                  <td colSpan={5} style={{ textAlign: 'center', padding: '32px', color: 'var(--text-muted)' }}>
                    {isLoading ? 'Carregando clientes...' : 'Nenhum cliente cadastrado.'}
                  </td>
                </tr>
              ) : (
                clients.map((c) => (
                  <tr key={c.id} style={{ borderBottom: '1px solid rgba(255, 255, 255, 0.05)' }}>
                    <td style={{ padding: '8px', fontWeight: 600, color: '#fff' }}>{c.name}</td>
                    <td style={{ padding: '8px', color: 'var(--text-secondary)' }}>{c.document || '—'}</td>
                    <td style={{ padding: '8px', color: 'var(--text-secondary)' }}>{c.whatsapp || c.phone || '—'}</td>
                    <td style={{ padding: '8px', color: 'var(--text-secondary)' }}>
                      {[c.neighborhood, c.city].filter(Boolean).join(' - ') || '—'}
                    </td>
                    <td style={{ padding: '8px', textAlign: 'right' }}>
                      <button
                        className="btn-secondary"
                        style={{ padding: '4px 8px', marginRight: '6px' }}
                        onClick={() => { setEditingClient(c); setIsClientModalOpen(true); }}
                      >
                        <Edit2 size={12} />
                      </button>
                      <button
                        className="btn-secondary"
                        style={{ padding: '4px 8px', color: 'var(--accent-danger)' }}
                        onClick={() => c.id && handleDeleteClient(c.id)}
                      >
                        <Trash2 size={12} />
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* Tabela de Produtos / Peças */}
      {activeTab === 'products' && (
        <div style={{ flex: 1, overflowY: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.82rem', textAlign: 'left' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border-color)', color: 'var(--text-muted)' }}>
                <th style={{ padding: '8px' }}>Código</th>
                <th style={{ padding: '8px' }}>Descrição da Peça / Produto</th>
                <th style={{ padding: '8px' }}>Categoria</th>
                <th style={{ padding: '8px', textAlign: 'right' }}>Preço Venda</th>
                <th style={{ padding: '8px', textAlign: 'center' }}>Estoque Atual</th>
                <th style={{ padding: '8px', textAlign: 'right' }}>Ações</th>
              </tr>
            </thead>
            <tbody>
              {products.length === 0 ? (
                <tr>
                  <td colSpan={6} style={{ textAlign: 'center', padding: '32px', color: 'var(--text-muted)' }}>
                    {isLoading ? 'Carregando produtos...' : 'Nenhum produto cadastrado.'}
                  </td>
                </tr>
              ) : (
                products.map((p) => {
                  const isLowStock = p.stock_qty <= p.min_stock_qty;
                  return (
                    <tr key={p.id} style={{ borderBottom: '1px solid rgba(255, 255, 255, 0.05)' }}>
                      <td style={{ padding: '8px', fontFamily: 'monospace', color: 'var(--accent-usb)' }}>{p.code}</td>
                      <td style={{ padding: '8px', fontWeight: 600, color: '#fff' }}>{p.description}</td>
                      <td style={{ padding: '8px', color: 'var(--text-secondary)' }}>{p.category || 'Geral'}</td>
                      <td style={{ padding: '8px', textAlign: 'right', fontWeight: 600, color: '#10b981' }}>
                        R$ {(p.sale_price_cents / 100).toFixed(2)}
                      </td>
                      <td style={{ padding: '8px', textAlign: 'center' }}>
                        <span
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '4px',
                            padding: '2px 8px',
                            borderRadius: '12px',
                            fontSize: '0.75rem',
                            fontWeight: 600,
                            background: isLowStock ? 'rgba(239, 68, 68, 0.15)' : 'rgba(16, 185, 129, 0.15)',
                            color: isLowStock ? '#ef4444' : '#10b981',
                          }}
                        >
                          {isLowStock && <AlertTriangle size={12} />}
                          {p.stock_qty} {p.unit}
                        </span>
                      </td>
                      <td style={{ padding: '8px', textAlign: 'right' }}>
                        <button
                          className="btn-secondary"
                          style={{ padding: '4px 8px', marginRight: '6px' }}
                          onClick={() => { setEditingProduct(p); setIsProductModalOpen(true); }}
                        >
                          <Edit2 size={12} />
                        </button>
                        <button
                          className="btn-secondary"
                          style={{ padding: '4px 8px', color: 'var(--accent-danger)' }}
                          onClick={() => p.id && handleDeleteProduct(p.id)}
                        >
                          <Trash2 size={12} />
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* Tabela de Serviços */}
      {activeTab === 'services' && (
        <div style={{ flex: 1, overflowY: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.82rem', textAlign: 'left' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border-color)', color: 'var(--text-muted)' }}>
                <th style={{ padding: '8px' }}>Nome do Serviço (Mão de Obra)</th>
                <th style={{ padding: '8px' }}>Descrição dos Procedimentos</th>
                <th style={{ padding: '8px', textAlign: 'right' }}>Valor Padrão</th>
                <th style={{ padding: '8px', textAlign: 'right' }}>Ações</th>
              </tr>
            </thead>
            <tbody>
              {services.length === 0 ? (
                <tr>
                  <td colSpan={4} style={{ textAlign: 'center', padding: '32px', color: 'var(--text-muted)' }}>
                    {isLoading ? 'Carregando serviços...' : 'Nenhum serviço cadastrado.'}
                  </td>
                </tr>
              ) : (
                services.map((s) => (
                  <tr key={s.id} style={{ borderBottom: '1px solid rgba(255, 255, 255, 0.05)' }}>
                    <td style={{ padding: '8px', fontWeight: 600, color: '#fff' }}>{s.name}</td>
                    <td style={{ padding: '8px', color: 'var(--text-secondary)' }}>{s.description || '—'}</td>
                    <td style={{ padding: '8px', textAlign: 'right', fontWeight: 600, color: '#10b981' }}>
                      R$ {(s.price_cents / 100).toFixed(2)}
                    </td>
                    <td style={{ padding: '8px', textAlign: 'right' }}>
                      <button
                        className="btn-secondary"
                        style={{ padding: '4px 8px', marginRight: '6px' }}
                        onClick={() => { setEditingService(s); setIsServiceModalOpen(true); }}
                      >
                        <Edit2 size={12} />
                      </button>
                      <button
                        className="btn-secondary"
                        style={{ padding: '4px 8px', color: 'var(--accent-danger)' }}
                        onClick={() => s.id && handleDeleteService(s.id)}
                      >
                        <Trash2 size={12} />
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* Modal de Criação / Edição de Cliente */}
      {isClientModalOpen && editingClient && (
        <div className="modal-backdrop" style={{ zIndex: 9999 }}>
          <div className="modal-box" style={{ maxWidth: '600px', width: '90%' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <h3 style={{ margin: 0, fontSize: '1rem', color: '#fff' }}>
                {editingClient.id ? 'Editar Cliente' : 'Novo Cliente'}
              </h3>
              <button className="btn-secondary" style={{ padding: '4px' }} onClick={() => setIsClientModalOpen(false)}>
                <X size={16} />
              </button>
            </div>
            <form onSubmit={handleSaveClient} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '10px' }}>
                <div>
                  <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Nome Completo *</span>
                  <input
                    type="text"
                    required
                    value={editingClient.name}
                    onChange={(e) => setEditingClient({ ...editingClient, name: e.target.value })}
                    style={{ width: '100%', padding: '8px', borderRadius: '4px', background: 'var(--bg-card)', border: '1px solid var(--border-color)', color: '#fff' }}
                  />
                </div>
                <div>
                  <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>CPF / CNPJ</span>
                  <input
                    type="text"
                    value={editingClient.document || ''}
                    onChange={(e) => setEditingClient({ ...editingClient, document: e.target.value })}
                    style={{ width: '100%', padding: '8px', borderRadius: '4px', background: 'var(--bg-card)', border: '1px solid var(--border-color)', color: '#fff' }}
                  />
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                <div>
                  <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>WhatsApp</span>
                  <input
                    type="text"
                    value={editingClient.whatsapp || ''}
                    onChange={(e) => setEditingClient({ ...editingClient, whatsapp: e.target.value })}
                    style={{ width: '100%', padding: '8px', borderRadius: '4px', background: 'var(--bg-card)', border: '1px solid var(--border-color)', color: '#fff' }}
                  />
                </div>
                <div>
                  <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Telefone Fixo</span>
                  <input
                    type="text"
                    value={editingClient.phone || ''}
                    onChange={(e) => setEditingClient({ ...editingClient, phone: e.target.value })}
                    style={{ width: '100%', padding: '8px', borderRadius: '4px', background: 'var(--bg-card)', border: '1px solid var(--border-color)', color: '#fff' }}
                  />
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '10px' }}>
                <div>
                  <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Rua / Endereço</span>
                  <input
                    type="text"
                    value={editingClient.street || ''}
                    onChange={(e) => setEditingClient({ ...editingClient, street: e.target.value })}
                    style={{ width: '100%', padding: '8px', borderRadius: '4px', background: 'var(--bg-card)', border: '1px solid var(--border-color)', color: '#fff' }}
                  />
                </div>
                <div>
                  <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Bairro</span>
                  <input
                    type="text"
                    value={editingClient.neighborhood || ''}
                    onChange={(e) => setEditingClient({ ...editingClient, neighborhood: e.target.value })}
                    style={{ width: '100%', padding: '8px', borderRadius: '4px', background: 'var(--bg-card)', border: '1px solid var(--border-color)', color: '#fff' }}
                  />
                </div>
              </div>

              <div>
                <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Observações</span>
                <textarea
                  rows={2}
                  value={editingClient.notes || ''}
                  onChange={(e) => setEditingClient({ ...editingClient, notes: e.target.value })}
                  style={{ width: '100%', padding: '8px', borderRadius: '4px', background: 'var(--bg-card)', border: '1px solid var(--border-color)', color: '#fff' }}
                />
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '10px' }}>
                <button type="button" className="btn-secondary" onClick={() => setIsClientModalOpen(false)}>Cancelar</button>
                <button type="submit" className="btn-primary usb">Salvar Cliente</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal de Criação / Edição de Produto */}
      {isProductModalOpen && editingProduct && (
        <div className="modal-backdrop" style={{ zIndex: 9999 }}>
          <div className="modal-box" style={{ maxWidth: '600px', width: '90%' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <h3 style={{ margin: 0, fontSize: '1rem', color: '#fff' }}>
                {editingProduct.id ? 'Editar Produto / Peça' : 'Novo Produto / Peça'}
              </h3>
              <button className="btn-secondary" style={{ padding: '4px' }} onClick={() => setIsProductModalOpen(false)}>
                <X size={16} />
              </button>
            </div>
            <form onSubmit={handleSaveProduct} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: '10px' }}>
                <div>
                  <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Código *</span>
                  <input
                    type="text"
                    required
                    value={editingProduct.code}
                    onChange={(e) => setEditingProduct({ ...editingProduct, code: e.target.value.toUpperCase() })}
                    style={{ width: '100%', padding: '8px', borderRadius: '4px', background: 'var(--bg-card)', border: '1px solid var(--border-color)', color: '#fff' }}
                  />
                </div>
                <div>
                  <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Descrição do Item *</span>
                  <input
                    type="text"
                    required
                    value={editingProduct.description}
                    onChange={(e) => setEditingProduct({ ...editingProduct, description: e.target.value })}
                    style={{ width: '100%', padding: '8px', borderRadius: '4px', background: 'var(--bg-card)', border: '1px solid var(--border-color)', color: '#fff' }}
                  />
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '10px' }}>
                <div>
                  <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Preço Custo (R$)</span>
                  <input
                    type="number"
                    step="0.01"
                    value={(editingProduct.cost_price_cents / 100).toFixed(2)}
                    onChange={(e) => setEditingProduct({ ...editingProduct, cost_price_cents: Math.round(parseFloat(e.target.value || '0') * 100) })}
                    style={{ width: '100%', padding: '8px', borderRadius: '4px', background: 'var(--bg-card)', border: '1px solid var(--border-color)', color: '#fff' }}
                  />
                </div>
                <div>
                  <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Preço Venda (R$) *</span>
                  <input
                    type="number"
                    step="0.01"
                    required
                    value={(editingProduct.sale_price_cents / 100).toFixed(2)}
                    onChange={(e) => setEditingProduct({ ...editingProduct, sale_price_cents: Math.round(parseFloat(e.target.value || '0') * 100) })}
                    style={{ width: '100%', padding: '8px', borderRadius: '4px', background: 'var(--bg-card)', border: '1px solid var(--border-color)', color: '#fff' }}
                  />
                </div>
                <div>
                  <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Categoria</span>
                  <input
                    type="text"
                    value={editingProduct.category || ''}
                    onChange={(e) => setEditingProduct({ ...editingProduct, category: e.target.value })}
                    style={{ width: '100%', padding: '8px', borderRadius: '4px', background: 'var(--bg-card)', border: '1px solid var(--border-color)', color: '#fff' }}
                  />
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '10px' }}>
                <div>
                  <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Estoque Atual</span>
                  <input
                    type="number"
                    value={editingProduct.stock_qty}
                    onChange={(e) => setEditingProduct({ ...editingProduct, stock_qty: parseInt(e.target.value) || 0 })}
                    style={{ width: '100%', padding: '8px', borderRadius: '4px', background: 'var(--bg-card)', border: '1px solid var(--border-color)', color: '#fff' }}
                  />
                </div>
                <div>
                  <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Estoque Mínimo</span>
                  <input
                    type="number"
                    value={editingProduct.min_stock_qty}
                    onChange={(e) => setEditingProduct({ ...editingProduct, min_stock_qty: parseInt(e.target.value) || 0 })}
                    style={{ width: '100%', padding: '8px', borderRadius: '4px', background: 'var(--bg-card)', border: '1px solid var(--border-color)', color: '#fff' }}
                  />
                </div>
                <div>
                  <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Unidade</span>
                  <input
                    type="text"
                    value={editingProduct.unit}
                    onChange={(e) => setEditingProduct({ ...editingProduct, unit: e.target.value.toUpperCase() })}
                    style={{ width: '100%', padding: '8px', borderRadius: '4px', background: 'var(--bg-card)', border: '1px solid var(--border-color)', color: '#fff' }}
                  />
                </div>
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '10px' }}>
                <button type="button" className="btn-secondary" onClick={() => setIsProductModalOpen(false)}>Cancelar</button>
                <button type="submit" className="btn-primary usb">Salvar Produto</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal de Criação / Edição de Serviço */}
      {isServiceModalOpen && editingService && (
        <div className="modal-backdrop" style={{ zIndex: 9999 }}>
          <div className="modal-box" style={{ maxWidth: '500px', width: '90%' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <h3 style={{ margin: 0, fontSize: '1rem', color: '#fff' }}>
                {editingService.id ? 'Editar Serviço' : 'Novo Serviço'}
              </h3>
              <button className="btn-secondary" style={{ padding: '4px' }} onClick={() => setIsServiceModalOpen(false)}>
                <X size={16} />
              </button>
            </div>
            <form onSubmit={handleSaveService} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <div>
                <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Nome do Serviço *</span>
                <input
                  type="text"
                  required
                  placeholder="Ex: Troca de Conector de Carga Tipo-C"
                  value={editingService.name}
                  onChange={(e) => setEditingService({ ...editingService, name: e.target.value })}
                  style={{ width: '100%', padding: '8px', borderRadius: '4px', background: 'var(--bg-card)', border: '1px solid var(--border-color)', color: '#fff' }}
                />
              </div>

              <div>
                <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Valor Padrão da Mão de Obra (R$) *</span>
                <input
                  type="number"
                  step="0.01"
                  required
                  value={(editingService.price_cents / 100).toFixed(2)}
                  onChange={(e) => setEditingService({ ...editingService, price_cents: Math.round(parseFloat(e.target.value || '0') * 100) })}
                  style={{ width: '100%', padding: '8px', borderRadius: '4px', background: 'var(--bg-card)', border: '1px solid var(--border-color)', color: '#fff' }}
                />
              </div>

              <div>
                <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Descrição do Procedimento</span>
                <textarea
                  rows={2}
                  placeholder="Detalhes ou passos do serviço..."
                  value={editingService.description || ''}
                  onChange={(e) => setEditingService({ ...editingService, description: e.target.value })}
                  style={{ width: '100%', padding: '8px', borderRadius: '4px', background: 'var(--bg-card)', border: '1px solid var(--border-color)', color: '#fff' }}
                />
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '10px' }}>
                <button type="button" className="btn-secondary" onClick={() => setIsServiceModalOpen(false)}>Cancelar</button>
                <button type="submit" className="btn-primary usb">Salvar Serviço</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
