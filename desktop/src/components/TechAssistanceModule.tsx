import React, { useState, useEffect, useCallback } from 'react';
import { invoke } from '@tauri-apps/api/core';
import {
  TechnicalOrderDto,
  TechnicalOrderStatus,
  OrderItemDto,
  ClientDto,
  ProductDto,
  ServiceItemDto,
  StoreProfileDto,
  TechnicalOrderWithDetailsDto
} from '../types';
import {
  buildTechnicalOrderEntryText,
  buildTechnicalOrderFinalText
} from '../utils/receiptFormatter';
import {
  Wrench,
  Search,
  Plus,
  Printer,
  Smartphone,
  Laptop,
  Monitor,
  Tablet,
  X,
  Share2,
  Lock,
  Check,
  ChevronRight
} from 'lucide-react';
import { ModalDialog } from './ModalDialog';

interface TechAssistanceModuleProps {
  widthDots: number;
  storeProfile: StoreProfileDto;
  onSendToPrint: (compiledText: string) => void;
  onNotification: (type: 'success' | 'error', msg: string) => void;
}

const STATUS_CONFIG: Record<
  TechnicalOrderStatus,
  { label: string; color: string; bg: string }
> = {
  ORCAMENTO: { label: 'Orçamento', color: '#60a5fa', bg: 'rgba(59, 130, 246, 0.15)' },
  AGUARDANDO_APROVACAO: { label: 'Aguard. Aprovação', color: '#f59e0b', bg: 'rgba(245, 158, 11, 0.15)' },
  APROVADO: { label: 'Aprovado', color: '#10b981', bg: 'rgba(16, 185, 129, 0.15)' },
  EM_MANUTENCAO: { label: 'Em Manutenção', color: '#8b5cf6', bg: 'rgba(139, 92, 246, 0.15)' },
  AGUARDANDO_PECAS: { label: 'Aguard. Peças', color: '#f97316', bg: 'rgba(249, 115, 22, 0.15)' },
  PRONTO: { label: 'Pronto p/ Retirada', color: '#06b6d4', bg: 'rgba(6, 182, 212, 0.15)' },
  FATURADO_ENTREGUE: { label: 'Entregue / Faturado', color: '#22c55e', bg: 'rgba(34, 197, 94, 0.2)' },
  CANCELADO: { label: 'Cancelado', color: '#ef4444', bg: 'rgba(239, 68, 68, 0.15)' },
};

export const TechAssistanceModule: React.FC<TechAssistanceModuleProps> = ({
  widthDots,
  storeProfile,
  onSendToPrint,
  onNotification,
}) => {
  const maxCols = widthDots === 576 ? 48 : 32;

  // Estados de Listagem
  const [orders, setOrders] = useState<TechnicalOrderDto[]>([]);
  const [selectedStatus, setSelectedStatus] = useState<string>('TODOS');
  const [searchQuery, setSearchQuery] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  // Auxiliares para relacionamentos
  const [clients, setClients] = useState<ClientDto[]>([]);
  const [products, setProducts] = useState<ProductDto[]>([]);
  const [services, setServices] = useState<ServiceItemDto[]>([]);

  // Modal de Nova O.S. (Triagem de Entrada)
  const [isNewOrderModalOpen, setIsNewOrderModalOpen] = useState(false);
  const [newOrder, setNewOrder] = useState<Partial<TechnicalOrderDto>>({
    equipment_type: 'smartphone',
    brand_model: '',
    serial_imei: '',
    device_password: '',
    accessories: '',
    physical_condition: '',
    reported_defect: '',
    status: 'ORCAMENTO',
    warranty_days: storeProfile.tech_default_warranty_days || 90,
    discount_cents: 0,
    total_cents: 0,
    notes: '',
  });
  const [selectedClientId, setSelectedClientId] = useState<number | null>(null);

  // Checklist de entrada estético (tags selecionáveis)
  const [checkConditions, setCheckConditions] = useState<string[]>([]);
  const conditionOptions = [
    'Tela trincada / quebrada',
    'Display com manchas / linhas',
    'Carcaça riscada / desgastada',
    'Amassado / marca de queda',
    'Sem parafusos / tampa solta',
    'Não liga / sem sinal',
    'Oxidação ou umidade visível',
    'Conector de carga frouxo',
  ];

  // Checklist de acessórios deixados
  const [checkAccessories, setCheckAccessories] = useState<string[]>([]);
  const accessoryOptions = [
    'Carregador original',
    'Cabo USB',
    'Capa de proteção',
    'Chip SIM deixado',
    'Cartão SD / Memória',
    'Película aplicada',
    'Mochila / Bag',
  ];

  // Modal de Detalhes / Bancada da O.S.
  const [activeOrderDetails, setActiveOrderDetails] = useState<TechnicalOrderWithDetailsDto | null>(null);
  const [isDetailsModalOpen, setIsDetailsModalOpen] = useState(false);

  // Estado para adicionar peças/serviços na O.S.
  const [selectedItemType, setSelectedItemType] = useState<'product' | 'service'>('service');
  const [selectedItemId, setSelectedItemId] = useState<number | null>(null);
  const [itemQty, setItemQty] = useState(1);

  // Carregar dados
  const loadOrders = useCallback(async () => {
    setIsLoading(true);
    try {
      const list = await invoke<TechnicalOrderDto[]>('list_technical_orders', {
        status: selectedStatus === 'TODOS' ? null : selectedStatus,
        search: searchQuery || null,
      });
      setOrders(list);
    } catch (err: any) {
      onNotification('error', `Falha ao listar ordens: ${String(err)}`);
    } finally {
      setIsLoading(false);
    }
  }, [selectedStatus, searchQuery, onNotification]);

  const loadAuxiliaryData = useCallback(async () => {
    try {
      const [cList, pList, sList] = await Promise.all([
        invoke<ClientDto[]>('list_clients', { search: null }),
        invoke<ProductDto[]>('list_products', { search: null }),
        invoke<ServiceItemDto[]>('list_services', { search: null }),
      ]);
      setClients(cList);
      setProducts(pList);
      setServices(sList);
    } catch (err: any) {
      console.error('Falha ao carregar dados auxiliares:', err);
    }
  }, []);

  useEffect(() => {
    loadOrders();
    loadAuxiliaryData();
  }, [loadOrders, loadAuxiliaryData]);

  // Salvar Nova O.S. (Entrada / Triagem)
  const handleCreateOrder = async (printImmediately: boolean = false) => {
    if (!newOrder.brand_model?.trim() || !newOrder.reported_defect?.trim()) {
      onNotification('error', 'Informe o modelo do aparelho e o defeito relatado.');
      return;
    }

    const compiledConditions = checkConditions.join(', ');
    const compiledAccessories = checkAccessories.join(', ');

    const orderToSave: TechnicalOrderDto = {
      order_number: '', // O backend gera sequencial automático se vazio
      client_id: selectedClientId,
      equipment_type: newOrder.equipment_type || 'smartphone',
      brand_model: newOrder.brand_model.trim(),
      serial_imei: newOrder.serial_imei?.trim() || null,
      device_password: newOrder.device_password?.trim() || null,
      accessories: compiledAccessories || newOrder.accessories || null,
      physical_condition: compiledConditions || newOrder.physical_condition || null,
      reported_defect: newOrder.reported_defect.trim(),
      technical_diagnosis: null,
      solution: null,
      status: 'ORCAMENTO',
      warranty_days: newOrder.warranty_days || 90,
      discount_cents: 0,
      total_cents: 0,
      notes: newOrder.notes?.trim() || null,
    };

    try {
      const createdId = await invoke<number>('save_technical_order', {
        order: orderToSave,
        items: [],
      });

      onNotification('success', `Ordem de Serviço #${createdId} aberta com sucesso!`);
      setIsNewOrderModalOpen(false);

      // Se solicitado, já dispara a impressão do comprovante de entrada
      if (printImmediately) {
        const fullDetails = await invoke<TechnicalOrderWithDetailsDto>('get_technical_order', { id: createdId });
        const thermalText = buildTechnicalOrderEntryText(
          fullDetails.order,
          fullDetails.client || null,
          storeProfile,
          maxCols
        );
        onSendToPrint(thermalText);
      }

      // Limpar formulário
      setNewOrder({
        equipment_type: 'smartphone',
        brand_model: '',
        serial_imei: '',
        device_password: '',
        accessories: '',
        physical_condition: '',
        reported_defect: '',
        status: 'ORCAMENTO',
        warranty_days: storeProfile.tech_default_warranty_days || 90,
        discount_cents: 0,
        total_cents: 0,
      });
      setCheckConditions([]);
      setCheckAccessories([]);
      setSelectedClientId(null);
      loadOrders();
    } catch (err: any) {
      onNotification('error', `Erro ao abrir O.S.: ${String(err)}`);
    }
  };

  // Abrir Modal de Detalhes da O.S.
  const handleOpenDetails = async (orderId: number) => {
    try {
      const details = await invoke<TechnicalOrderWithDetailsDto>('get_technical_order', { id: orderId });
      setActiveOrderDetails(details);
      setIsDetailsModalOpen(true);
    } catch (err: any) {
      onNotification('error', `Falha ao carregar detalhes da O.S.: ${String(err)}`);
    }
  };

  // Atualizar Status da O.S.
  const handleUpdateStatus = async (newStatus: TechnicalOrderStatus) => {
    if (!activeOrderDetails?.order.id) return;
    try {
      await invoke('update_order_status', {
        id: activeOrderDetails.order.id,
        newStatus,
      });
      setActiveOrderDetails({
        ...activeOrderDetails,
        order: { ...activeOrderDetails.order, status: newStatus },
      });
      onNotification('success', `Status atualizado para: ${STATUS_CONFIG[newStatus].label}`);
      loadOrders();
    } catch (err: any) {
      onNotification('error', `Erro ao atualizar status: ${String(err)}`);
    }
  };

  // Adicionar Item (Peça ou Serviço) na O.S.
  const handleAddItemToOrder = () => {
    if (!activeOrderDetails || !selectedItemId) {
      onNotification('error', 'Selecione uma peça ou serviço.');
      return;
    }

    let description = '';
    let unitPriceCents = 0;

    if (selectedItemType === 'product') {
      const prod = products.find((p) => p.id === selectedItemId);
      if (!prod) return;
      description = prod.description;
      unitPriceCents = prod.sale_price_cents;
    } else {
      const srv = services.find((s) => s.id === selectedItemId);
      if (!srv) return;
      description = srv.name;
      unitPriceCents = srv.price_cents;
    }

    const newItem: OrderItemDto = {
      order_id: activeOrderDetails.order.id,
      item_type: selectedItemType,
      reference_id: selectedItemId,
      description,
      qty: itemQty,
      unit_price_cents: unitPriceCents,
      total_cents: unitPriceCents * itemQty,
    };

    const updatedItems = [...activeOrderDetails.items, newItem];
    const newSubtotal = updatedItems.reduce((acc, it) => acc + it.total_cents, 0);
    const newTotal = Math.max(0, newSubtotal - activeOrderDetails.order.discount_cents);

    setActiveOrderDetails({
      ...activeOrderDetails,
      items: updatedItems,
      order: {
        ...activeOrderDetails.order,
        total_cents: newTotal,
      },
    });

    setSelectedItemId(null);
    setItemQty(1);
  };

  // Remover Item da O.S.
  const handleRemoveItem = (index: number) => {
    if (!activeOrderDetails) return;
    const updated = [...activeOrderDetails.items];
    updated.splice(index, 1);
    const newSubtotal = updated.reduce((acc, it) => acc + it.total_cents, 0);
    const newTotal = Math.max(0, newSubtotal - activeOrderDetails.order.discount_cents);

    setActiveOrderDetails({
      ...activeOrderDetails,
      items: updated,
      order: { ...activeOrderDetails.order, total_cents: newTotal },
    });
  };

  // Salvar Alterações na O.S. (Laudo, Itens, Desconto)
  const handleSaveOrderChanges = async () => {
    if (!activeOrderDetails?.order.id) return;
    try {
      await invoke('save_technical_order', {
        order: activeOrderDetails.order,
        items: activeOrderDetails.items,
      });
      onNotification('success', 'Ordem de Serviço atualizada com sucesso!');
      loadOrders();
    } catch (err: any) {
      onNotification('error', `Erro ao salvar O.S.: ${String(err)}`);
    }
  };

  // Impressão da Via de Entrada
  const handlePrintEntryTicket = () => {
    if (!activeOrderDetails) return;
    const text = buildTechnicalOrderEntryText(
      activeOrderDetails.order,
      activeOrderDetails.client || null,
      storeProfile,
      maxCols
    );
    onSendToPrint(text);
  };

  // Impressão da Via de Saída / Garantia
  const handlePrintFinalTicket = () => {
    if (!activeOrderDetails) return;
    const text = buildTechnicalOrderFinalText(
      activeOrderDetails.order,
      activeOrderDetails.client || null,
      activeOrderDetails.items,
      storeProfile,
      maxCols
    );
    onSendToPrint(text);
  };

  // Disparo WhatsApp
  const handleSendWhatsApp = () => {
    if (!activeOrderDetails?.client?.whatsapp && !activeOrderDetails?.client?.phone) {
      onNotification('error', 'Cliente não possui WhatsApp ou telefone informado.');
      return;
    }
    const phone = (activeOrderDetails.client.whatsapp || activeOrderDetails.client.phone || '').replace(/\D/g, '');
    const ord = activeOrderDetails.order;
    const total = (ord.total_cents / 100).toFixed(2);

    const message = `Olá ${activeOrderDetails.client.name}! Aqui é da ${storeProfile.name}.\n\nInformamos que sua Ordem de Serviço *#${ord.order_number}* referente ao *${ord.brand_model}* está com status: *${STATUS_CONFIG[ord.status].label.toUpperCase()}*.\nTotal: R$ ${total}.\n\nPara dúvidas ou retirada, entre em contato conosco!`;

    const url = `https://wa.me/55${phone}?text=${encodeURIComponent(message)}`;
    window.open(url, '_blank');
  };

  const getEquipmentIcon = (type: string) => {
    switch (type) {
      case 'smartphone': return <Smartphone size={16} color="var(--accent-usb)" />;
      case 'notebook': return <Laptop size={16} color="#eab308" />;
      case 'computador': return <Monitor size={16} color="#8b5cf6" />;
      case 'tablet': return <Tablet size={16} color="#06b6d4" />;
      default: return <Wrench size={16} color="var(--text-muted)" />;
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', gap: '14px' }}>
      {/* Barra de Filtros e Busca de O.S. */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid var(--border-color)', paddingBottom: '12px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', overflowX: 'auto' }}>
          {['TODOS', 'ORCAMENTO', 'APROVADO', 'EM_MANUTENCAO', 'PRONTO', 'FATURADO_ENTREGUE'].map((st) => {
            const isSelected = selectedStatus === st;
            const label = st === 'TODOS' ? 'Todas as O.S.' : STATUS_CONFIG[st as TechnicalOrderStatus]?.label;
            return (
              <button
                key={st}
                className={`btn-secondary ${isSelected ? 'active-toggle' : ''}`}
                onClick={() => setSelectedStatus(st)}
                style={{
                  fontSize: '0.78rem',
                  padding: '6px 12px',
                  borderRadius: '16px',
                }}
              >
                {label}
              </button>
            );
          })}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <div style={{ position: 'relative', width: '220px' }}>
            <Search size={14} style={{ position: 'absolute', left: '10px', top: '10px', color: 'var(--text-muted)' }} />
            <input
              type="text"
              placeholder="Buscar Nº OS, Modelo, IMEI..."
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

          <button
            className="btn-primary usb"
            onClick={() => setIsNewOrderModalOpen(true)}
            style={{ padding: '8px 14px', fontSize: '0.82rem', gap: '6px' }}
          >
            <Plus size={15} />
            <span>Nova O.S. (Entrada)</span>
          </button>
        </div>
      </div>

      {/* Lista de Ordens de Serviço */}
      <div style={{ flex: 1, overflowY: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.82rem', textAlign: 'left' }}>
          <thead>
            <tr style={{ borderBottom: '1px solid var(--border-color)', color: 'var(--text-muted)' }}>
              <th style={{ padding: '8px' }}>O.S. Nº</th>
              <th style={{ padding: '8px' }}>Equipamento / Modelo</th>
              <th style={{ padding: '8px' }}>Cliente</th>
              <th style={{ padding: '8px' }}>Defeito Reclamado</th>
              <th style={{ padding: '8px', textAlign: 'center' }}>Status</th>
              <th style={{ padding: '8px', textAlign: 'right' }}>Total</th>
              <th style={{ padding: '8px', textAlign: 'right' }}>Ações</th>
            </tr>
          </thead>
          <tbody>
            {orders.length === 0 ? (
              <tr>
                <td colSpan={7} style={{ textAlign: 'center', padding: '36px', color: 'var(--text-muted)' }}>
                  {isLoading ? 'Carregando ordens de serviço...' : 'Nenhuma Ordem de Serviço encontrada para o filtro atual.'}
                </td>
              </tr>
            ) : (
              orders.map((ord) => {
                const clientObj = clients.find((c) => c.id === ord.client_id);
                const statusStyle = STATUS_CONFIG[ord.status] || STATUS_CONFIG.ORCAMENTO;
                return (
                  <tr
                    key={ord.id}
                    style={{
                      borderBottom: '1px solid rgba(255, 255, 255, 0.05)',
                      cursor: 'pointer',
                    }}
                    onClick={() => ord.id && handleOpenDetails(ord.id)}
                  >
                    <td style={{ padding: '10px 8px', fontWeight: 700, fontFamily: 'monospace', color: 'var(--accent-usb)' }}>
                      #{ord.order_number}
                    </td>
                    <td style={{ padding: '10px 8px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontWeight: 600, color: '#fff' }}>
                        {getEquipmentIcon(ord.equipment_type)}
                        <span>{ord.brand_model}</span>
                      </div>
                      {ord.serial_imei && (
                        <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', fontFamily: 'monospace' }}>
                          IMEI: {ord.serial_imei}
                        </div>
                      )}
                    </td>
                    <td style={{ padding: '10px 8px', color: 'var(--text-secondary)' }}>
                      {clientObj?.name || 'Consumidor Balcão'}
                    </td>
                    <td style={{ padding: '10px 8px', color: 'var(--text-secondary)', maxWidth: '200px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {ord.reported_defect}
                    </td>
                    <td style={{ padding: '10px 8px', textAlign: 'center' }}>
                      <span
                        style={{
                          display: 'inline-block',
                          padding: '3px 10px',
                          borderRadius: '12px',
                          fontSize: '0.72rem',
                          fontWeight: 600,
                          background: statusStyle.bg,
                          color: statusStyle.color,
                        }}
                      >
                        {statusStyle.label}
                      </span>
                    </td>
                    <td style={{ padding: '10px 8px', textAlign: 'right', fontWeight: 700, color: '#10b981' }}>
                      R$ {(ord.total_cents / 100).toFixed(2)}
                    </td>
                    <td style={{ padding: '10px 8px', textAlign: 'right' }}>
                      <button
                        className="btn-secondary"
                        style={{ padding: '4px 10px', fontSize: '0.75rem' }}
                        onClick={(e) => {
                          e.stopPropagation();
                          if (ord.id) handleOpenDetails(ord.id);
                        }}
                      >
                        <span>Abrir Bancada</span>
                        <ChevronRight size={12} />
                      </button>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* MODAL 1: Abertura de Nova O.S. (Triagem de Entrada) */}
      <ModalDialog
        isOpen={isNewOrderModalOpen}
        onClose={() => setIsNewOrderModalOpen(false)}
        title="Abertura de Ordem de Serviço (Triagem de Entrada)"
        icon={<Wrench size={18} color="var(--accent-usb)" />}
        maxWidth="820px"
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', marginTop: '6px' }}>
              {/* Cliente */}
              <div>
                <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Vincular Cliente *</span>
                <select
                  value={selectedClientId || ''}
                  onChange={(e) => setSelectedClientId(e.target.value ? parseInt(e.target.value) : null)}
                  style={{ width: '100%', padding: '8px', borderRadius: '4px', background: 'var(--bg-card)', border: '1px solid var(--border-color)', color: '#fff' }}
                >
                  <option value="">-- Consumidor Balcão Avulso --</option>
                  {clients.map((c) => (
                    <option key={c.id} value={c.id || ''}>
                      {c.name} {c.document ? `(${c.document})` : ''} {c.whatsapp ? `- ${c.whatsapp}` : ''}
                    </option>
                  ))}
                </select>
              </div>

              {/* Dados do Equipamento */}
              <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 2fr 1.5fr', gap: '10px' }}>
                <div>
                  <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Tipo de Equipamento *</span>
                  <select
                    value={newOrder.equipment_type || 'smartphone'}
                    onChange={(e) => setNewOrder({ ...newOrder, equipment_type: e.target.value })}
                    style={{ width: '100%', padding: '8px', borderRadius: '4px', background: 'var(--bg-card)', border: '1px solid var(--border-color)', color: '#fff' }}
                  >
                    <option value="smartphone">Smartphone / Celular</option>
                    <option value="notebook">Notebook / Laptop</option>
                    <option value="computador">Computador Desktop</option>
                    <option value="tablet">Tablet / iPad</option>
                    <option value="outro">Outro Equipamento</option>
                  </select>
                </div>
                <div>
                  <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Marca e Modelo do Aparelho *</span>
                  <input
                    type="text"
                    required
                    placeholder="Ex: Samsung Galaxy S22 Preto 128GB"
                    value={newOrder.brand_model || ''}
                    onChange={(e) => setNewOrder({ ...newOrder, brand_model: e.target.value })}
                    style={{ width: '100%', padding: '8px', borderRadius: '4px', background: 'var(--bg-card)', border: '1px solid var(--border-color)', color: '#fff' }}
                  />
                </div>
                <div>
                  <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>IMEI ou Nº de Série</span>
                  <input
                    type="text"
                    placeholder="Ex: 354890123456789"
                    value={newOrder.serial_imei || ''}
                    onChange={(e) => setNewOrder({ ...newOrder, serial_imei: e.target.value })}
                    style={{ width: '100%', padding: '8px', borderRadius: '4px', background: 'var(--bg-card)', border: '1px solid var(--border-color)', color: '#fff' }}
                  />
                </div>
              </div>

              {/* Segurança / Senha */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: '10px' }}>
                <div>
                  <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Senha de Desbloqueio / Padrão</span>
                  <div style={{ position: 'relative' }}>
                    <Lock size={14} style={{ position: 'absolute', left: '10px', top: '10px', color: 'var(--text-muted)' }} />
                    <input
                      type="text"
                      placeholder="Ex: 123456 ou 'L' ou Sem Senha"
                      value={newOrder.device_password || ''}
                      onChange={(e) => setNewOrder({ ...newOrder, device_password: e.target.value })}
                      style={{ width: '100%', padding: '8px 10px 8px 30px', borderRadius: '4px', background: 'var(--bg-card)', border: '1px solid var(--border-color)', color: '#fff' }}
                    />
                  </div>
                </div>
                <div>
                  <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Defeito Reclamado pelo Cliente *</span>
                  <input
                    type="text"
                    required
                    placeholder="Ex: Não carrega e esquenta próximo ao conector Tipo-C"
                    value={newOrder.reported_defect || ''}
                    onChange={(e) => setNewOrder({ ...newOrder, reported_defect: e.target.value })}
                    style={{ width: '100%', padding: '8px', borderRadius: '4px', background: 'var(--bg-card)', border: '1px solid var(--border-color)', color: '#fff' }}
                  />
                </div>
              </div>

              {/* Checklist Estético de Entrada */}
              <div>
                <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '4px', display: 'block' }}>
                  Checklist de Condições Físicas de Entrada:
                </span>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                  {conditionOptions.map((cond) => {
                    const isChecked = checkConditions.includes(cond);
                    return (
                      <button
                        type="button"
                        key={cond}
                        onClick={() => {
                          setCheckConditions((prev) =>
                            isChecked ? prev.filter((c) => c !== cond) : [...prev, cond]
                          );
                        }}
                        style={{
                          padding: '4px 10px',
                          borderRadius: '14px',
                          fontSize: '0.72rem',
                          cursor: 'pointer',
                          background: isChecked ? 'rgba(239, 68, 68, 0.25)' : 'var(--bg-card)',
                          color: isChecked ? '#fca5a5' : 'var(--text-secondary)',
                          border: `1px solid ${isChecked ? '#ef4444' : 'var(--border-color)'}`,
                        }}
                      >
                        {isChecked ? '✓ ' : '+ '} {cond}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Acessórios Deixados */}
              <div>
                <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '4px', display: 'block' }}>
                  Acessórios Deixados na Assistência:
                </span>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                  {accessoryOptions.map((acc) => {
                    const isChecked = checkAccessories.includes(acc);
                    return (
                      <button
                        type="button"
                        key={acc}
                        onClick={() => {
                          setCheckAccessories((prev) =>
                            isChecked ? prev.filter((a) => a !== acc) : [...prev, acc]
                          );
                        }}
                        style={{
                          padding: '4px 10px',
                          borderRadius: '14px',
                          fontSize: '0.72rem',
                          cursor: 'pointer',
                          background: isChecked ? 'rgba(59, 130, 246, 0.25)' : 'var(--bg-card)',
                          color: isChecked ? '#93c5fd' : 'var(--text-secondary)',
                          border: `1px solid ${isChecked ? 'var(--accent-usb)' : 'var(--border-color)'}`,
                        }}
                      >
                        {isChecked ? '✓ ' : '+ '} {acc}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Botões de Ação */}
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '12px' }}>
                <button type="button" className="btn-secondary" onClick={() => setIsNewOrderModalOpen(false)}>
                  Cancelar
                </button>
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={() => handleCreateOrder(false)}
                >
                  Salvar Apenas
                </button>
                <button
                  type="button"
                  className="btn-primary usb"
                  onClick={() => handleCreateOrder(true)}
                  style={{ gap: '6px' }}
                >
                  <Printer size={15} />
                  <span>Salvar e Imprimir Entrada (58mm)</span>
                </button>
              </div>
            </div>
      </ModalDialog>

      {/* MODAL 2: Gestão de Bancada, Peças, Laudo e Faturamento da O.S. */}
      {activeOrderDetails && (
        <ModalDialog
          isOpen={isDetailsModalOpen}
          onClose={() => setIsDetailsModalOpen(false)}
          title={`Ordem de Serviço #${activeOrderDetails.order.order_number}`}
          icon={<Wrench size={18} color="var(--accent-usb)" />}
          maxWidth="920px"
          headerActions={
            <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
              <span
                style={{
                  padding: '3px 10px',
                  borderRadius: '12px',
                  fontSize: '0.75rem',
                  fontWeight: 600,
                  background: STATUS_CONFIG[activeOrderDetails.order.status].bg,
                  color: STATUS_CONFIG[activeOrderDetails.order.status].color,
                }}
              >
                {STATUS_CONFIG[activeOrderDetails.order.status].label}
              </span>
              <button
                className="btn-secondary"
                onClick={handleSendWhatsApp}
                title="Enviar mensagem de status para o cliente no WhatsApp"
                style={{ color: '#22c55e', borderColor: 'rgba(34, 197, 94, 0.4)', padding: '5px 8px', fontSize: '0.75rem', gap: '4px' }}
              >
                <Share2 size={13} />
                <span>WhatsApp</span>
              </button>
              <button
                className="btn-secondary"
                onClick={handlePrintEntryTicket}
                title="Reimprimir Comprovante de Entrada com Canhoto"
                style={{ padding: '5px 8px', fontSize: '0.75rem', gap: '4px' }}
              >
                <Printer size={13} />
                <span>Entrada 58mm</span>
              </button>
              <button
                className="btn-primary usb"
                onClick={handlePrintFinalTicket}
                title="Imprimir Comprovante de Saída e Termo de Garantia CDC"
                style={{ padding: '5px 8px', fontSize: '0.75rem', gap: '4px' }}
              >
                <Printer size={13} />
                <span>Saída / Garantia</span>
              </button>
            </div>
          }
        >
          <div style={{ marginBottom: '10px' }}>
            <p style={{ margin: 0, fontSize: '0.85rem', color: 'var(--text-muted)' }}>
              {activeOrderDetails.order.brand_model} • Cliente: {activeOrderDetails.client?.name || 'Consumidor Balcão'}
            </p>
          </div>

            {/* Mudar Status da O.S. (Pipeline) */}
            <div style={{ background: '#090d16', padding: '10px 14px', borderRadius: '6px', border: '1px solid var(--border-color)', marginBottom: '14px' }}>
              <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                Alterar Etapa da O.S.:
              </span>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginTop: '6px' }}>
                {(Object.keys(STATUS_CONFIG) as TechnicalOrderStatus[]).map((stKey) => {
                  const isCurrent = activeOrderDetails.order.status === stKey;
                  return (
                    <button
                      key={stKey}
                      type="button"
                      onClick={() => handleUpdateStatus(stKey)}
                      style={{
                        padding: '4px 10px',
                        borderRadius: '12px',
                        fontSize: '0.72rem',
                        fontWeight: 600,
                        cursor: 'pointer',
                        background: isCurrent ? STATUS_CONFIG[stKey].bg : 'transparent',
                        color: isCurrent ? STATUS_CONFIG[stKey].color : 'var(--text-muted)',
                        border: `1px solid ${isCurrent ? STATUS_CONFIG[stKey].color : 'rgba(255, 255, 255, 0.1)'}`,
                      }}
                    >
                      {STATUS_CONFIG[stKey].label}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Abas e Edição Técnica (Laudo & Peças/Serviços) */}
            <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: '16px' }}>
              {/* Coluna 1: Diagnóstico e Laudo */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                <div>
                  <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Defeito Reclamado pelo Cliente:</span>
                  <div style={{ background: 'var(--bg-card)', padding: '8px', borderRadius: '4px', fontSize: '0.8rem', color: '#fff', border: '1px solid var(--border-color)' }}>
                    {activeOrderDetails.order.reported_defect}
                  </div>
                </div>

                <div>
                  <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Laudo Técnico / Diagnóstico da Bancada:</span>
                  <textarea
                    rows={3}
                    placeholder="Ex: Conector Tipo-C oxidado, curto-circuito na linha VBUS secundária..."
                    value={activeOrderDetails.order.technical_diagnosis || ''}
                    onChange={(e) =>
                      setActiveOrderDetails({
                        ...activeOrderDetails,
                        order: { ...activeOrderDetails.order, technical_diagnosis: e.target.value },
                      })
                    }
                    style={{ width: '100%', padding: '8px', borderRadius: '4px', background: 'var(--bg-card)', border: '1px solid var(--border-color)', color: '#fff' }}
                  />
                </div>

                <div>
                  <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Solução / Reparo Executado:</span>
                  <textarea
                    rows={2}
                    placeholder="Ex: Substituição da subplaca de carga e limpeza ultrassônica."
                    value={activeOrderDetails.order.solution || ''}
                    onChange={(e) =>
                      setActiveOrderDetails({
                        ...activeOrderDetails,
                        order: { ...activeOrderDetails.order, solution: e.target.value },
                      })
                    }
                    style={{ width: '100%', padding: '8px', borderRadius: '4px', background: 'var(--bg-card)', border: '1px solid var(--border-color)', color: '#fff' }}
                  />
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                  <div>
                    <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Garantia (Dias):</span>
                    <input
                      type="number"
                      value={activeOrderDetails.order.warranty_days}
                      onChange={(e) =>
                        setActiveOrderDetails({
                          ...activeOrderDetails,
                          order: { ...activeOrderDetails.order, warranty_days: parseInt(e.target.value) || 90 },
                        })
                      }
                      style={{ width: '100%', padding: '8px', borderRadius: '4px', background: 'var(--bg-card)', border: '1px solid var(--border-color)', color: '#fff' }}
                    />
                  </div>
                  <div>
                    <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Desconto Comercial (R$):</span>
                    <input
                      type="number"
                      step="0.01"
                      value={(activeOrderDetails.order.discount_cents / 100).toFixed(2)}
                      onChange={(e) => {
                        const descCents = Math.round(parseFloat(e.target.value || '0') * 100);
                        const sub = activeOrderDetails.items.reduce((acc, it) => acc + it.total_cents, 0);
                        setActiveOrderDetails({
                          ...activeOrderDetails,
                          order: {
                            ...activeOrderDetails.order,
                            discount_cents: descCents,
                            total_cents: Math.max(0, sub - descCents),
                          },
                        });
                      }}
                      style={{ width: '100%', padding: '8px', borderRadius: '4px', background: 'var(--bg-card)', border: '1px solid var(--border-color)', color: '#fff' }}
                    />
                  </div>
                </div>
              </div>

              {/* Coluna 2: Peças & Serviços Alocados */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', background: '#090d16', padding: '12px', borderRadius: '6px', border: '1px solid var(--border-color)' }}>
                <span style={{ fontSize: '0.8rem', fontWeight: 600, color: '#fff' }}>Itens da O.S. (Peças & Mão de Obra)</span>

                {/* Seletor para adicionar */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: '8px' }}>
                  <select
                    value={selectedItemType}
                    onChange={(e) => { setSelectedItemType(e.target.value as any); setSelectedItemId(null); }}
                    style={{ padding: '6px', borderRadius: '4px', background: 'var(--bg-card)', border: '1px solid var(--border-color)', color: '#fff', fontSize: '0.78rem' }}
                  >
                    <option value="service">Serviço (Mão de Obra)</option>
                    <option value="product">Peça / Produto</option>
                  </select>

                  <select
                    value={selectedItemId || ''}
                    onChange={(e) => setSelectedItemId(e.target.value ? parseInt(e.target.value) : null)}
                    style={{ padding: '6px', borderRadius: '4px', background: 'var(--bg-card)', border: '1px solid var(--border-color)', color: '#fff', fontSize: '0.78rem' }}
                  >
                    <option value="">-- Selecione o item --</option>
                    {selectedItemType === 'product'
                      ? products.map((p) => (
                          <option key={p.id} value={p.id || ''}>
                            {p.description} - R$ {(p.sale_price_cents / 100).toFixed(2)} (Estoque: {p.stock_qty})
                          </option>
                        ))
                      : services.map((s) => (
                          <option key={s.id} value={s.id || ''}>
                            {s.name} - R$ {(s.price_cents / 100).toFixed(2)}
                          </option>
                        ))}
                  </select>
                </div>

                <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                  <input
                    type="number"
                    min="1"
                    value={itemQty}
                    onChange={(e) => setItemQty(parseInt(e.target.value) || 1)}
                    style={{ width: '60px', padding: '6px', borderRadius: '4px', background: 'var(--bg-card)', border: '1px solid var(--border-color)', color: '#fff', fontSize: '0.78rem' }}
                  />
                  <button
                    type="button"
                    className="btn-secondary"
                    onClick={handleAddItemToOrder}
                    disabled={!selectedItemId}
                    style={{ padding: '6px 12px', fontSize: '0.78rem' }}
                  >
                    <Plus size={12} />
                    <span>Adicionar</span>
                  </button>
                </div>

                {/* Lista dos Itens adicionados */}
                <div style={{ flex: 1, minHeight: '140px', maxHeight: '180px', overflowY: 'auto', border: '1px solid var(--border-color)', borderRadius: '4px', background: 'var(--bg-card)' }}>
                  {activeOrderDetails.items.length === 0 ? (
                    <div style={{ padding: '24px', textAlign: 'center', fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                      Nenhum item adicionado a esta O.S.
                    </div>
                  ) : (
                    activeOrderDetails.items.map((it, idx) => (
                      <div
                        key={idx}
                        style={{
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center',
                          padding: '6px 10px',
                          borderBottom: '1px solid rgba(255, 255, 255, 0.05)',
                          fontSize: '0.75rem',
                        }}
                      >
                        <div>
                          <span style={{ color: it.item_type === 'product' ? '#eab308' : '#10b981', marginRight: '6px', fontWeight: 600 }}>
                            {it.item_type === 'product' ? '[PEÇA]' : '[SERVIÇO]'}
                          </span>
                          <span style={{ color: '#fff' }}>{it.qty}x {it.description}</span>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <span style={{ fontWeight: 600, color: '#10b981' }}>
                            R$ {(it.total_cents / 100).toFixed(2)}
                          </span>
                          <button
                            type="button"
                            onClick={() => handleRemoveItem(idx)}
                            style={{ background: 'transparent', border: 'none', color: 'var(--accent-danger)', cursor: 'pointer', padding: '2px' }}
                          >
                            <X size={12} />
                          </button>
                        </div>
                      </div>
                    ))
                  )}
                </div>

                {/* Resumo Financeiro da O.S. */}
                <div style={{ borderTop: '1px solid var(--border-color)', paddingTop: '8px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                    <span>Subtotal Itens:</span>
                    <span>
                      R$ {(activeOrderDetails.items.reduce((acc, it) => acc + it.total_cents, 0) / 100).toFixed(2)}
                    </span>
                  </div>
                  {activeOrderDetails.order.discount_cents > 0 && (
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem', color: '#ef4444' }}>
                      <span>Desconto:</span>
                      <span>-R$ {(activeOrderDetails.order.discount_cents / 100).toFixed(2)}</span>
                    </div>
                  )}
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.95rem', fontWeight: 700, color: '#10b981', marginTop: '4px' }}>
                    <span>TOTAL DA O.S.:</span>
                    <span>R$ {(activeOrderDetails.order.total_cents / 100).toFixed(2)}</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Footer do Modal */}
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '16px', borderTop: '1px solid var(--border-color)', paddingTop: '12px' }}>
              <button type="button" className="btn-secondary" onClick={() => setIsDetailsModalOpen(false)}>
                Fechar
              </button>
              <button
                type="button"
                className="btn-primary usb"
                onClick={handleSaveOrderChanges}
                style={{ gap: '6px' }}
              >
                <Check size={14} />
                <span>Salvar Alterações da Bancada</span>
              </button>
            </div>
        </ModalDialog>
      )}
    </div>
  );
};
