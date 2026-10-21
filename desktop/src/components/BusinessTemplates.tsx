import React, { useState, useMemo } from 'react';
import { invoke } from '@tauri-apps/api/core';
import {
  StoreProfileDto,
  SaleDto,
  CashSummaryDto,
  ProductDto,
  CashMovementDto
} from '../types';
import { ThermalViewer } from './ThermalViewer';
import {
  CashClosureData,
  InventoryCheckData,
  TodoListData,
  VoucherData,
  QuickOrderData,
  buildCashClosureText,
  buildInventoryCheckText,
  buildTodoListText,
  buildVoucherText,
  buildQuickOrderText,
} from '../utils/receiptFormatter';
import {
  Calculator,
  ClipboardList,
  CheckSquare,
  FileCheck,
  Coffee,
  Printer,
  Edit3,
  Plus,
  Trash2,
  Download,
  ArrowDownCircle,
  ArrowUpCircle,
  RefreshCw,
  Check
} from 'lucide-react';

interface BusinessTemplatesProps {
  widthDots: number;
  storeProfile: StoreProfileDto | null;
  onSelectForPrint: (compiledText: string) => void;
  onSendToWord: (text: string) => void;
  showPreview?: boolean;
}

type TemplateTab = 'cash' | 'inventory' | 'todo' | 'voucher' | 'order';

export const BusinessTemplates: React.FC<BusinessTemplatesProps> = ({
  widthDots,
  storeProfile,
  onSelectForPrint,
  onSendToWord,
  showPreview = true,
}) => {
  const maxCols = widthDots === 576 ? 48 : 32;
  const [activeTab, setActiveTab] = useState<TemplateTab>('cash');

  const defaultStore: StoreProfileDto = useMemo(() => {
    return (
      storeProfile || {
        name: 'MEU ESTABELECIMENTO',
        doc: '00.000.000/0001-00',
        onboarding_completed: true,
      }
    );
  }, [storeProfile]);

  // 1. Estado do Fechamento de Caixa
  const [cashData, setCashData] = useState<CashClosureData>(() => ({
    store: defaultStore,
    date: new Date().toLocaleDateString('pt-BR') + ' ' + new Date().toLocaleTimeString('pt-BR'),
    operator: 'Operador 01',
    shift: 'Turno Tarde',
    openingFloat: 100.0,
    cashSales: 450.0,
    creditSales: 620.0,
    debitSales: 310.0,
    pixSales: 280.0,
    otherSales: 0.0,
    cashWithdrawals: 200.0,
    cashCounted: 350.0,
    notes: 'Malote conferido e lacrado.',
  }));

  // 2. Estado de Checagem de Estoque
  const [invData, setInvData] = useState<InventoryCheckData>(() => ({
    store: defaultStore,
    date: new Date().toLocaleDateString('pt-BR'),
    sector: 'Balcão / Bebidas',
    operator: 'Conferente Lucas',
    items: [
      { code: '001', name: 'Coca-Cola Lata 350ml', systemQty: 24, unit: 'UN' },
      { code: '002', name: 'Agua Mineral 500ml', systemQty: 48, unit: 'UN' },
      { code: '003', name: 'Suco de Laranja 300ml', systemQty: 12, unit: 'UN' },
      { code: '004', name: 'Cerveja Long Neck', systemQty: 30, unit: 'UN' },
    ],
  }));

  // 3. Estado do Checklist / To-Do List
  const [todoData, setTodoData] = useState<TodoListData>(() => ({
    store: defaultStore,
    date: new Date().toLocaleDateString('pt-BR'),
    title: 'Checklist Abertura de Loja',
    assignedTo: 'Equipe Manhã',
    tasks: [
      { text: 'Ligar luzes e disjuntores gerais', done: false },
      { text: 'Ligar computadores e impressoras térmicas', done: false },
      { text: 'Conferir bobina de papel sobressalente', done: false },
      { text: 'Contar fundo de troco inicial da gaveta', done: false },
      { text: 'Higienizar balcão de atendimento e mesas', done: false },
      { text: 'Verificar produtos na vitrine e validade', done: false },
    ],
  }));

  // 4. Estado de Vale / Recibo
  const [voucherData, setVoucherData] = useState<VoucherData>(() => ({
    store: defaultStore,
    date: new Date().toLocaleDateString('pt-BR'),
    voucherNumber: '084',
    beneficiaryName: 'Carlos Silva',
    beneficiaryDoc: '123.456.789-00',
    amount: 150.0,
    reason: 'Adiantamento semanal de transporte e alimentacao',
    authorizedBy: 'Gerencia',
  }));

  // 5. Estado de Comanda / OS Rápida
  const [orderData, setOrderData] = useState<QuickOrderData>(() => ({
    store: defaultStore,
    date: new Date().toLocaleDateString('pt-BR') + ' ' + new Date().toLocaleTimeString('pt-BR'),
    orderNumber: '52',
    customerName: 'Mariana Souza',
    customerPhone: '(11) 98888-7777',
    deliveryDate: 'Hoje as 18:30',
    totalEstimated: 65.0,
    items: [
      { qty: 1, name: 'Bolo de Chocolate Pequeno', obs: 'Sem nozes' },
      { qty: 2, name: 'Salgados Fritos Variados', obs: 'Entregar quentinho' },
    ],
    notes: 'Retirada no balcao.',
  }));

  // Sincronização com SQLite
  const [isSyncingCash, setIsSyncingCash] = useState(false);
  const [syncCashSuccess, setSyncCashSuccess] = useState(false);

  // Modal de Movimentação Rápida de Caixa (Sangria / Suprimento)
  const [showMovementModal, setShowMovementModal] = useState(false);
  const [movType, setMovType] = useState<'SANGRIA' | 'SUPRIMENTO'>('SANGRIA');
  const [movAmount, setMovAmount] = useState('');
  const [movDesc, setMovDesc] = useState('');

  // 1. Sincronizar dados de Vendas e Caixa do SQLite
  const handleSyncCashWithDb = async () => {
    setIsSyncingCash(true);
    try {
      const [sales, summary] = await Promise.all([
        invoke<SaleDto[]>('list_sales', { search: null }),
        invoke<CashSummaryDto>('get_cash_summary'),
      ]);

      let cashSum = 0;
      let creditSum = 0;
      let debitSum = 0;
      let pixSum = 0;
      let otherSum = 0;

      sales.forEach((s) => {
        const total = s.total_cents / 100;
        const method = (s.payment_method || '').toLowerCase();
        if (method.includes('dinheiro')) cashSum += total;
        else if (method.includes('crédito') || method.includes('credito')) creditSum += total;
        else if (method.includes('débito') || method.includes('debito')) debitSum += total;
        else if (method.includes('pix')) pixSum += total;
        else otherSum += total;
      });

      const withdrawals = summary.total_outflow_cents / 100;

      setCashData((prev) => ({
        ...prev,
        cashSales: Number(cashSum.toFixed(2)),
        creditSales: Number(creditSum.toFixed(2)),
        debitSales: Number(debitSum.toFixed(2)),
        pixSales: Number(pixSum.toFixed(2)),
        otherSales: Number(otherSum.toFixed(2)),
        cashWithdrawals: Number(withdrawals.toFixed(2)),
        date: new Date().toLocaleDateString('pt-BR') + ' ' + new Date().toLocaleTimeString('pt-BR'),
      }));

      setSyncCashSuccess(true);
      setTimeout(() => setSyncCashSuccess(false), 3000);
    } catch (err: any) {
      alert(`Falha ao sincronizar caixa com SQLite: ${String(err)}`);
    } finally {
      setIsSyncingCash(false);
    }
  };

  // 2. Salvar Sangria ou Suprimento no SQLite
  const handleSaveMovement = async () => {
    const val = parseFloat(movAmount.replace(',', '.'));
    if (isNaN(val) || val <= 0) {
      alert('Informe um valor monetário válido maior que zero.');
      return;
    }

    try {
      const movement: CashMovementDto = {
        movement_type: movType,
        amount_cents: Math.round(val * 100),
        payment_method: 'DINHEIRO',
        description: movDesc || (movType === 'SANGRIA' ? 'Retirada de Caixa' : 'Aporte de Troco'),
        operator: cashData.operator,
      };

      await invoke<number>('add_cash_movement', { movement });
      setShowMovementModal(false);
      setMovAmount('');
      setMovDesc('');
      await handleSyncCashWithDb();
    } catch (err: any) {
      alert(`Erro ao registrar ${movType}: ${String(err)}`);
    }
  };

  // 3. Importar Catálogo do SQLite para Checagem de Estoque
  const handleLoadInventoryFromDb = async () => {
    try {
      const prods = await invoke<ProductDto[]>('list_products', { search: null });
      if (prods.length === 0) {
        alert('Nenhum produto cadastrado no banco de dados para importar.');
        return;
      }

      setInvData((prev) => ({
        ...prev,
        items: prods.map((p) => ({
          code: p.code,
          name: p.description,
          systemQty: p.stock_qty,
          unit: p.unit || 'UN',
        })),
      }));
    } catch (err: any) {
      alert(`Falha ao carregar produtos do SQLite: ${String(err)}`);
    }
  };

  // Compilação do texto conforme a aba ativa
  const compiledText = useMemo(() => {
    const store = defaultStore;
    switch (activeTab) {
      case 'cash':
        return buildCashClosureText({ ...cashData, store }, maxCols);
      case 'inventory':
        return buildInventoryCheckText({ ...invData, store }, maxCols);
      case 'todo':
        return buildTodoListText({ ...todoData, store }, maxCols);
      case 'voucher':
        return buildVoucherText({ ...voucherData, store }, maxCols);
      case 'order':
        return buildQuickOrderText({ ...orderData, store }, maxCols);
      default:
        return '';
    }
  }, [activeTab, cashData, invData, todoData, voucherData, orderData, defaultStore, maxCols]);

  return (
    <div style={{ display: 'grid', gridTemplateColumns: showPreview ? '1fr 315px' : '1fr', gap: '16px', height: '100%', minHeight: 0, overflow: 'hidden' }}>
      {/* Lado Esquerdo: Formulários dos Utilitários */}
      <div style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0, gap: '12px' }}>
        {/* Navegação entre Templates */}
        <div
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            gap: '8px',
            padding: '6px',
            background: 'var(--bg-card)',
            border: '1px solid var(--border-color)',
            borderRadius: 'var(--radius-md)',
          }}
        >
          <button
            className={`btn-secondary ${activeTab === 'cash' ? 'active-toggle' : ''}`}
            onClick={() => setActiveTab('cash')}
            style={{ padding: '6px 12px', fontSize: '0.8rem', gap: '6px' }}
          >
            <Calculator size={14} />
            <span>Fechamento Caixa</span>
          </button>
          <button
            className={`btn-secondary ${activeTab === 'inventory' ? 'active-toggle' : ''}`}
            onClick={() => setActiveTab('inventory')}
            style={{ padding: '6px 12px', fontSize: '0.8rem', gap: '6px' }}
          >
            <ClipboardList size={14} />
            <span>Estoque / Inventário</span>
          </button>
          <button
            className={`btn-secondary ${activeTab === 'todo' ? 'active-toggle' : ''}`}
            onClick={() => setActiveTab('todo')}
            style={{ padding: '6px 12px', fontSize: '0.8rem', gap: '6px' }}
          >
            <CheckSquare size={14} />
            <span>To-Do List / Checklist</span>
          </button>
          <button
            className={`btn-secondary ${activeTab === 'voucher' ? 'active-toggle' : ''}`}
            onClick={() => setActiveTab('voucher')}
            style={{ padding: '6px 12px', fontSize: '0.8rem', gap: '6px' }}
          >
            <FileCheck size={14} />
            <span>Vale / Recibo</span>
          </button>
          <button
            className={`btn-secondary ${activeTab === 'order' ? 'active-toggle' : ''}`}
            onClick={() => setActiveTab('order')}
            style={{ padding: '6px 12px', fontSize: '0.8rem', gap: '6px' }}
          >
            <Coffee size={14} />
            <span>Comanda / OS</span>
          </button>
        </div>

        {/* Formulário do Template Ativo */}
        <div
          style={{
            flex: 1,
            minHeight: 0,
            overflowY: 'auto',
            background: 'var(--bg-card)',
            border: '1px solid var(--border-color)',
            borderRadius: 'var(--radius-md)',
            padding: '16px',
            display: 'flex',
            flexDirection: 'column',
            gap: '14px',
          }}
        >
          {/* Aba: Fechamento de Caixa */}
          {activeTab === 'cash' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '8px' }}>
                <h3 style={{ margin: 0, fontSize: '0.95rem', color: 'var(--accent-usb)', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <Calculator size={16} />
                  <span>Conferência de Caixa Diário / Turno</span>
                </h3>

                <div style={{ display: 'flex', gap: '8px' }}>
                  <button
                    type="button"
                    className="btn-secondary"
                    style={{
                      padding: '5px 10px',
                      fontSize: '0.75rem',
                      gap: '5px',
                      color: syncCashSuccess ? 'var(--accent-usb)' : 'var(--accent-bt)',
                    }}
                    onClick={handleSyncCashWithDb}
                    disabled={isSyncingCash}
                    title="Puxa os valores acumulados de vendas e sangrias do banco de dados SQLite"
                  >
                    {syncCashSuccess ? (
                      <>
                        <Check size={13} />
                        <span>Sincronizado!</span>
                      </>
                    ) : (
                      <>
                        <RefreshCw size={13} className={isSyncingCash ? 'spin' : ''} />
                        <span>Puxar do SQLite</span>
                      </>
                    )}
                  </button>

                  <button
                    type="button"
                    className="btn-secondary"
                    style={{ padding: '5px 10px', fontSize: '0.75rem', gap: '5px' }}
                    onClick={() => {
                      setMovType('SANGRIA');
                      setShowMovementModal(true);
                    }}
                  >
                    <ArrowDownCircle size={13} color="var(--accent-danger)" />
                    <span>Sangria</span>
                  </button>

                  <button
                    type="button"
                    className="btn-secondary"
                    style={{ padding: '5px 10px', fontSize: '0.75rem', gap: '5px' }}
                    onClick={() => {
                      setMovType('SUPRIMENTO');
                      setShowMovementModal(true);
                    }}
                  >
                    <ArrowUpCircle size={13} color="var(--accent-usb)" />
                    <span>Suprimento</span>
                  </button>
                </div>
              </div>

              {/* Modal Inline de Sangria / Suprimento */}
              {showMovementModal && (
                <div
                  style={{
                    padding: '12px',
                    borderRadius: 'var(--radius-sm)',
                    background: 'rgba(255, 255, 255, 0.04)',
                    border: '1px solid var(--accent-bt)',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '10px',
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontWeight: 700, fontSize: '0.82rem', color: movType === 'SANGRIA' ? 'var(--accent-danger)' : 'var(--accent-usb)' }}>
                      Registrar {movType === 'SANGRIA' ? 'Sangria (Retirada de Dinheiro)' : 'Suprimento (Aporte de Troco)'}
                    </span>
                    <button
                      type="button"
                      onClick={() => setShowMovementModal(false)}
                      style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: '0.8rem' }}
                    >
                      ✕
                    </button>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: '120px 1fr auto', gap: '10px', alignItems: 'center' }}>
                    <div>
                      <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>Valor (R$)</span>
                      <input
                        type="number"
                        step="0.01"
                        placeholder="50,00"
                        value={movAmount}
                        onChange={(e) => setMovAmount(e.target.value)}
                        style={{ width: '100%', padding: '6px', borderRadius: '4px', background: '#090d16', border: '1px solid var(--border-color)', color: '#fff', fontSize: '0.85rem' }}
                      />
                    </div>
                    <div>
                      <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>Motivo / Descrição</span>
                      <input
                        type="text"
                        placeholder={movType === 'SANGRIA' ? 'Ex: Pagamento Fornecedor Pão' : 'Ex: Fundo de troco da manhã'}
                        value={movDesc}
                        onChange={(e) => setMovDesc(e.target.value)}
                        style={{ width: '100%', padding: '6px', borderRadius: '4px', background: '#090d16', border: '1px solid var(--border-color)', color: '#fff', fontSize: '0.85rem' }}
                      />
                    </div>
                    <button
                      type="button"
                      className="btn-primary"
                      style={{ padding: '7px 14px', fontSize: '0.8rem', alignSelf: 'flex-end' }}
                      onClick={handleSaveMovement}
                    >
                      Confirmar
                    </button>
                  </div>
                </div>
              )}

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                <div>
                  <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Operador de Caixa</span>
                  <input
                    type="text"
                    value={cashData.operator}
                    onChange={(e) => setCashData({ ...cashData, operator: e.target.value })}
                    style={{ width: '100%', padding: '8px', borderRadius: '4px', background: '#090d16', border: '1px solid var(--border-color)', color: '#fff' }}
                  />
                </div>
                <div>
                  <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Turno</span>
                  <input
                    type="text"
                    value={cashData.shift || ''}
                    onChange={(e) => setCashData({ ...cashData, shift: e.target.value })}
                    style={{ width: '100%', padding: '8px', borderRadius: '4px', background: '#090d16', border: '1px solid var(--border-color)', color: '#fff' }}
                  />
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '10px' }}>
                <div>
                  <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Troco Inicial (R$)</span>
                  <input
                    type="number"
                    step="0.01"
                    value={cashData.openingFloat}
                    onChange={(e) => setCashData({ ...cashData, openingFloat: parseFloat(e.target.value) || 0 })}
                    style={{ width: '100%', padding: '8px', borderRadius: '4px', background: '#090d16', border: '1px solid var(--border-color)', color: '#fff' }}
                  />
                </div>
                <div>
                  <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Vendas Dinheiro (R$)</span>
                  <input
                    type="number"
                    step="0.01"
                    value={cashData.cashSales}
                    onChange={(e) => setCashData({ ...cashData, cashSales: parseFloat(e.target.value) || 0 })}
                    style={{ width: '100%', padding: '8px', borderRadius: '4px', background: '#090d16', border: '1px solid var(--border-color)', color: '#fff' }}
                  />
                </div>
                <div>
                  <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Vendas Cartão Crédito (R$)</span>
                  <input
                    type="number"
                    step="0.01"
                    value={cashData.creditSales}
                    onChange={(e) => setCashData({ ...cashData, creditSales: parseFloat(e.target.value) || 0 })}
                    style={{ width: '100%', padding: '8px', borderRadius: '4px', background: '#090d16', border: '1px solid var(--border-color)', color: '#fff' }}
                  />
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '10px' }}>
                <div>
                  <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Vendas Cartão Débito (R$)</span>
                  <input
                    type="number"
                    step="0.01"
                    value={cashData.debitSales}
                    onChange={(e) => setCashData({ ...cashData, debitSales: parseFloat(e.target.value) || 0 })}
                    style={{ width: '100%', padding: '8px', borderRadius: '4px', background: '#090d16', border: '1px solid var(--border-color)', color: '#fff' }}
                  />
                </div>
                <div>
                  <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Vendas PIX (R$)</span>
                  <input
                    type="number"
                    step="0.01"
                    value={cashData.pixSales}
                    onChange={(e) => setCashData({ ...cashData, pixSales: parseFloat(e.target.value) || 0 })}
                    style={{ width: '100%', padding: '8px', borderRadius: '4px', background: '#090d16', border: '1px solid var(--border-color)', color: '#fff' }}
                  />
                </div>
                <div>
                  <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Sangrias / Retiradas (R$)</span>
                  <input
                    type="number"
                    step="0.01"
                    value={cashData.cashWithdrawals}
                    onChange={(e) => setCashData({ ...cashData, cashWithdrawals: parseFloat(e.target.value) || 0 })}
                    style={{ width: '100%', padding: '8px', borderRadius: '4px', background: '#090d16', border: '1px solid var(--border-color)', color: '#fff' }}
                  />
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                <div>
                  <span style={{ fontSize: '0.75rem', color: 'var(--accent-warning)', fontWeight: 700 }}>Dinheiro Físico Contado na Gaveta (R$)</span>
                  <input
                    type="number"
                    step="0.01"
                    value={cashData.cashCounted}
                    onChange={(e) => setCashData({ ...cashData, cashCounted: parseFloat(e.target.value) || 0 })}
                    style={{ width: '100%', padding: '8px', borderRadius: '4px', background: '#090d16', border: '1px solid var(--accent-warning)', color: '#fff', fontWeight: 700 }}
                  />
                </div>
                <div>
                  <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Observação</span>
                  <input
                    type="text"
                    value={cashData.notes || ''}
                    onChange={(e) => setCashData({ ...cashData, notes: e.target.value })}
                    style={{ width: '100%', padding: '8px', borderRadius: '4px', background: '#090d16', border: '1px solid var(--border-color)', color: '#fff' }}
                  />
                </div>
              </div>
            </div>
          )}

          {/* Aba: Estoque / Inventário */}
          {activeTab === 'inventory' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '8px' }}>
                <h3 style={{ margin: 0, fontSize: '0.95rem', color: 'var(--accent-usb)', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <ClipboardList size={16} />
                  <span>Lista de Contagem e Auditoria de Estoque</span>
                </h3>

                <button
                  type="button"
                  className="btn-secondary"
                  style={{ padding: '5px 10px', fontSize: '0.75rem', gap: '5px', color: 'var(--accent-bt)' }}
                  onClick={handleLoadInventoryFromDb}
                  title="Importa todos os produtos cadastrados com seus saldos de estoque atuais"
                >
                  <Download size={13} />
                  <span>Importar Produtos do Banco</span>
                </button>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                <div>
                  <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Setor / Corredor</span>
                  <input
                    type="text"
                    value={invData.sector}
                    onChange={(e) => setInvData({ ...invData, sector: e.target.value })}
                    style={{ width: '100%', padding: '8px', borderRadius: '4px', background: '#090d16', border: '1px solid var(--border-color)', color: '#fff' }}
                  />
                </div>
                <div>
                  <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Conferente</span>
                  <input
                    type="text"
                    value={invData.operator}
                    onChange={(e) => setInvData({ ...invData, operator: e.target.value })}
                    style={{ width: '100%', padding: '8px', borderRadius: '4px', background: '#090d16', border: '1px solid var(--border-color)', color: '#fff' }}
                  />
                </div>
              </div>

              {/* Itens */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: '6px' }}>
                <span style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--text-secondary)' }}>Itens do Setor</span>
                <button
                  className="btn-secondary"
                  style={{ padding: '4px 8px', fontSize: '0.75rem', gap: '4px' }}
                  onClick={() => {
                    setInvData({
                      ...invData,
                      items: [
                        ...invData.items,
                        { code: `00${invData.items.length + 1}`, name: 'Novo Item', systemQty: 10, unit: 'UN' },
                      ],
                    });
                  }}
                >
                  <Plus size={12} />
                  <span>+ Item</span>
                </button>
              </div>

              {invData.items.map((it, idx) => (
                <div key={idx} style={{ display: 'grid', gridTemplateColumns: '80px 1fr 90px 32px', gap: '8px', alignItems: 'center' }}>
                  <input
                    type="text"
                    value={it.code}
                    onChange={(e) => {
                      const updated = [...invData.items];
                      updated[idx].code = e.target.value;
                      setInvData({ ...invData, items: updated });
                    }}
                    placeholder="Código"
                    style={{ padding: '6px', borderRadius: '4px', background: '#090d16', border: '1px solid var(--border-color)', color: '#fff', fontSize: '0.8rem' }}
                  />
                  <input
                    type="text"
                    value={it.name}
                    onChange={(e) => {
                      const updated = [...invData.items];
                      updated[idx].name = e.target.value;
                      setInvData({ ...invData, items: updated });
                    }}
                    placeholder="Descrição do produto"
                    style={{ padding: '6px', borderRadius: '4px', background: '#090d16', border: '1px solid var(--border-color)', color: '#fff', fontSize: '0.8rem' }}
                  />
                  <input
                    type="number"
                    value={it.systemQty}
                    onChange={(e) => {
                      const updated = [...invData.items];
                      updated[idx].systemQty = parseFloat(e.target.value) || 0;
                      setInvData({ ...invData, items: updated });
                    }}
                    placeholder="Qtd Sist"
                    style={{ padding: '6px', borderRadius: '4px', background: '#090d16', border: '1px solid var(--border-color)', color: '#fff', fontSize: '0.8rem' }}
                  />
                  <button
                    className="btn-secondary"
                    style={{ padding: '6px', color: 'var(--accent-danger)' }}
                    onClick={() => {
                      const updated = invData.items.filter((_, i) => i !== idx);
                      setInvData({ ...invData, items: updated });
                    }}
                  >
                    <Trash2 size={12} />
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* Aba: To-Do List / Checklist */}
          {activeTab === 'todo' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <h3 style={{ margin: 0, fontSize: '0.95rem', color: 'var(--accent-usb)', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <CheckSquare size={16} />
                <span>Checklist Operacional e Tarefas Diárias</span>
              </h3>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                <div>
                  <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Título da Lista</span>
                  <input
                    type="text"
                    value={todoData.title}
                    onChange={(e) => setTodoData({ ...todoData, title: e.target.value })}
                    style={{ width: '100%', padding: '8px', borderRadius: '4px', background: '#090d16', border: '1px solid var(--border-color)', color: '#fff' }}
                  />
                </div>
                <div>
                  <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Responsável</span>
                  <input
                    type="text"
                    value={todoData.assignedTo || ''}
                    onChange={(e) => setTodoData({ ...todoData, assignedTo: e.target.value })}
                    style={{ width: '100%', padding: '8px', borderRadius: '4px', background: '#090d16', border: '1px solid var(--border-color)', color: '#fff' }}
                  />
                </div>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: '6px' }}>
                <span style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--text-secondary)' }}>Tarefas da Lista</span>
                <button
                  className="btn-secondary"
                  style={{ padding: '4px 8px', fontSize: '0.75rem', gap: '4px' }}
                  onClick={() => {
                    setTodoData({
                      ...todoData,
                      tasks: [...todoData.tasks, { text: 'Nova tarefa', done: false }],
                    });
                  }}
                >
                  <Plus size={12} />
                  <span>+ Tarefa</span>
                </button>
              </div>

              {todoData.tasks.map((t, idx) => (
                <div key={idx} style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                  <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)', width: '24px' }}>{idx + 1}.</span>
                  <input
                    type="text"
                    value={t.text}
                    onChange={(e) => {
                      const updated = [...todoData.tasks];
                      updated[idx].text = e.target.value;
                      setTodoData({ ...todoData, tasks: updated });
                    }}
                    style={{ flex: 1, padding: '6px 8px', borderRadius: '4px', background: '#090d16', border: '1px solid var(--border-color)', color: '#fff', fontSize: '0.8rem' }}
                  />
                  <button
                    className="btn-secondary"
                    style={{ padding: '6px', color: 'var(--accent-danger)' }}
                    onClick={() => {
                      const updated = todoData.tasks.filter((_, i) => i !== idx);
                      setTodoData({ ...todoData, tasks: updated });
                    }}
                  >
                    <Trash2 size={12} />
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* Aba: Vale / Recibo */}
          {activeTab === 'voucher' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <h3 style={{ margin: 0, fontSize: '0.95rem', color: 'var(--accent-usb)', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <FileCheck size={16} />
                <span>Recibo Simples / Vale Adiantamento</span>
              </h3>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                <div>
                  <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Nome do Favorecido</span>
                  <input
                    type="text"
                    value={voucherData.beneficiaryName}
                    onChange={(e) => setVoucherData({ ...voucherData, beneficiaryName: e.target.value })}
                    style={{ width: '100%', padding: '8px', borderRadius: '4px', background: '#090d16', border: '1px solid var(--border-color)', color: '#fff' }}
                  />
                </div>
                <div>
                  <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>CPF / Documento</span>
                  <input
                    type="text"
                    value={voucherData.beneficiaryDoc || ''}
                    onChange={(e) => setVoucherData({ ...voucherData, beneficiaryDoc: e.target.value })}
                    style={{ width: '100%', padding: '8px', borderRadius: '4px', background: '#090d16', border: '1px solid var(--border-color)', color: '#fff' }}
                  />
                </div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                <div>
                  <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Valor (R$)</span>
                  <input
                    type="number"
                    step="0.01"
                    value={voucherData.amount}
                    onChange={(e) => setVoucherData({ ...voucherData, amount: parseFloat(e.target.value) || 0 })}
                    style={{ width: '100%', padding: '8px', borderRadius: '4px', background: '#090d16', border: '1px solid var(--border-color)', color: '#fff' }}
                  />
                </div>
                <div>
                  <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Nº do Vale</span>
                  <input
                    type="text"
                    value={voucherData.voucherNumber}
                    onChange={(e) => setVoucherData({ ...voucherData, voucherNumber: e.target.value })}
                    style={{ width: '100%', padding: '8px', borderRadius: '4px', background: '#090d16', border: '1px solid var(--border-color)', color: '#fff' }}
                  />
                </div>
              </div>
              <div>
                <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Referente a</span>
                <textarea
                  rows={2}
                  value={voucherData.reason}
                  onChange={(e) => setVoucherData({ ...voucherData, reason: e.target.value })}
                  style={{ width: '100%', padding: '8px', borderRadius: '4px', background: '#090d16', border: '1px solid var(--border-color)', color: '#fff', resize: 'none' }}
                />
              </div>
              <div>
                <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Autorizado por (Opcional)</span>
                <input
                  type="text"
                  value={voucherData.authorizedBy || ''}
                  onChange={(e) => setVoucherData({ ...voucherData, authorizedBy: e.target.value })}
                  style={{ width: '100%', padding: '8px', borderRadius: '4px', background: '#090d16', border: '1px solid var(--border-color)', color: '#fff' }}
                />
              </div>
            </div>
          )}

          {/* Aba: Comanda / OS */}
          {activeTab === 'order' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <h3 style={{ margin: 0, fontSize: '0.95rem', color: 'var(--accent-usb)', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Coffee size={16} />
                <span>Comanda / Ordem de Serviço Rápida</span>
              </h3>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                <div>
                  <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Nº Comanda / Pedido</span>
                  <input
                    type="text"
                    value={orderData.orderNumber}
                    onChange={(e) => setOrderData({ ...orderData, orderNumber: e.target.value })}
                    style={{ width: '100%', padding: '8px', borderRadius: '4px', background: '#090d16', border: '1px solid var(--border-color)', color: '#fff' }}
                  />
                </div>
                <div>
                  <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Nome do Cliente</span>
                  <input
                    type="text"
                    value={orderData.customerName}
                    onChange={(e) => setOrderData({ ...orderData, customerName: e.target.value })}
                    style={{ width: '100%', padding: '8px', borderRadius: '4px', background: '#090d16', border: '1px solid var(--border-color)', color: '#fff' }}
                  />
                </div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                <div>
                  <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Contato / WhatsApp</span>
                  <input
                    type="text"
                    value={orderData.customerPhone || ''}
                    onChange={(e) => setOrderData({ ...orderData, customerPhone: e.target.value })}
                    style={{ width: '100%', padding: '8px', borderRadius: '4px', background: '#090d16', border: '1px solid var(--border-color)', color: '#fff' }}
                  />
                </div>
                <div>
                  <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Previsão de Entrega</span>
                  <input
                    type="text"
                    value={orderData.deliveryDate || ''}
                    onChange={(e) => setOrderData({ ...orderData, deliveryDate: e.target.value })}
                    style={{ width: '100%', padding: '8px', borderRadius: '4px', background: '#090d16', border: '1px solid var(--border-color)', color: '#fff' }}
                  />
                </div>
              </div>
              <div>
                <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Observações de Preparo</span>
                <input
                  type="text"
                  value={orderData.notes || ''}
                  onChange={(e) => setOrderData({ ...orderData, notes: e.target.value })}
                  style={{ width: '100%', padding: '8px', borderRadius: '4px', background: '#090d16', border: '1px solid var(--border-color)', color: '#fff' }}
                />
              </div>
            </div>
          )}
        </div>

        {/* Botões de Ação na Base do Formulário */}
        <div style={{ display: 'flex', gap: '10px' }}>
          <button
            className="btn-primary usb"
            style={{ flex: 1, padding: '10px', fontSize: '0.9rem', gap: '8px' }}
            onClick={() => onSelectForPrint(compiledText)}
          >
            <Printer size={16} />
            <span>Imprimir Diretamente</span>
          </button>
          <button
            className="btn-secondary"
            style={{ flex: 1, padding: '10px', fontSize: '0.9rem', gap: '8px' }}
            onClick={() => onSendToWord(compiledText)}
          >
            <Edit3 size={16} color="var(--accent-bt)" />
            <span>Ajustar no Word ESC/POS</span>
          </button>
        </div>
      </div>

      {/* Lado Direito: Prévia Fiel na Bobina */}
      {showPreview && (
        <div style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0, overflow: 'hidden' }}>
          <ThermalViewer
            preview={{
              file_name: 'Template de Gestão',
              file_path: 'memoria://template.txt',
              file_size: compiledText.length,
              kind: 'text',
              text_content: compiledText,
              preview_image_base64: null,
              page_count: 1,
              width_dots: widthDots,
            }}
            widthDots={widthDots}
          />
        </div>
      )}
    </div>
  );
};
