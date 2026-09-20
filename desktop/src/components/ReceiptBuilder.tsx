import React, { useState, useEffect, useRef } from 'react';
import {
  ReceiptData,
  ReceiptItem,
  StoreInfo,
  buildReceiptText,
  formatCurrency,
} from '../utils/receiptFormatter';
import {
  Plus,
  Trash2,
  ArrowUp,
  ArrowDown,
  Store,
  CreditCard,
  Banknote,
  QrCode,
  RotateCcw,
  Save,
  Check,
  ChevronDown,
  ChevronUp,
  Sparkles,
} from 'lucide-react';

interface ReceiptBuilderProps {
  widthDots: number;
  onReceiptChange: (compiledText: string) => void;
}

const STORAGE_KEY_STORE = 'thz_thermalkit_store_info';

export const ReceiptBuilder: React.FC<ReceiptBuilderProps> = ({
  widthDots,
  onReceiptChange,
}) => {
  const maxCols = widthDots === 576 ? 48 : 32;

  // 1. Dados do Estabelecimento (com persistência em LocalStorage)
  const [store, setStore] = useState<StoreInfo>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY_STORE);
      if (saved) return JSON.parse(saved);
    } catch {
      // Ignora erro de storage
    }
    return {
      name: 'PADARIA & CONFEITARIA CENTRAL',
      doc: 'CNPJ: 12.345.678/0001-90',
      phone: 'Tel/Whats: (11) 98765-4321',
      address: 'Rua das Flores, 120 - Centro',
    };
  });

  const [isStoreSaved, setIsStoreSaved] = useState(false);
  const [isStoreExpanded, setIsStoreExpanded] = useState(false);

  // 2. Dados do Pedido / Caixa
  const [orderNumber, setOrderNumber] = useState('1042');
  const [date, setDate] = useState(() => {
    const now = new Date();
    return now.toLocaleDateString('pt-BR') + ' ' + now.toLocaleTimeString('pt-BR').slice(0, 5);
  });
  const [customerName, setCustomerName] = useState('');

  // 3. Lista de Itens do Pedido
  const [items, setItems] = useState<ReceiptItem[]>([
    { id: '1', name: 'Cafe Expresso', qty: 2, unitPrice: 6.0 },
    { id: '2', name: 'Pao na Chapa', qty: 1, unitPrice: 7.5 },
    { id: '3', name: 'Agua Mineral', qty: 1, unitPrice: 4.0 },
  ]);

  // Campos para novo item
  const [newItemName, setNewItemName] = useState('');
  const [newItemQty, setNewItemQty] = useState(1);
  const [newItemPrice, setNewItemPrice] = useState('');
  const nameInputRef = useRef<HTMLInputElement>(null);

  // 4. Totais e Pagamento
  const [paymentMethod, setPaymentMethod] = useState('PIX');
  const [discount, setDiscount] = useState<number>(0);
  const [cashReceived, setCashReceived] = useState<string>('');
  const [notes, setNotes] = useState('Obrigado pela preferencia! Volte sempre.');

  // Salvar dados da loja no localStorage
  const handleSaveStore = () => {
    try {
      localStorage.setItem(STORAGE_KEY_STORE, JSON.stringify(store));
      setIsStoreSaved(true);
      setTimeout(() => setIsStoreSaved(false), 2500);
    } catch {
      // Erro silencioso
    }
  };

  // Recalcular texto da notinha sempre que qualquer dado mudar
  useEffect(() => {
    const receiptData: ReceiptData = {
      store,
      orderNumber,
      date,
      customerName,
      items,
      paymentMethod,
      discount,
      cashReceived: cashReceived ? parseFloat(cashReceived.replace(',', '.')) : undefined,
      notes,
    };

    const compiled = buildReceiptText(receiptData, maxCols);
    onReceiptChange(compiled);
  }, [
    store,
    orderNumber,
    date,
    customerName,
    items,
    paymentMethod,
    discount,
    cashReceived,
    notes,
    maxCols,
    onReceiptChange,
  ]);

  // Adicionar novo item
  const handleAddItem = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!newItemName.trim()) return;

    const priceNum = parseFloat(newItemPrice.replace(',', '.')) || 0;
    const newItem: ReceiptItem = {
      id: Date.now().toString(),
      name: newItemName.trim(),
      qty: Math.max(1, newItemQty),
      unitPrice: priceNum,
    };

    setItems((prev) => [...prev, newItem]);
    setNewItemName('');
    setNewItemQty(1);
    setNewItemPrice('');
    nameInputRef.current?.focus();
  };

  // Alterar quantidade de um item
  const handleUpdateQty = (id: string, delta: number) => {
    setItems((prev) =>
      prev.map((it) => (it.id === id ? { ...it, qty: Math.max(1, it.qty + delta) } : it))
    );
  };

  // Remover item
  const handleRemoveItem = (id: string) => {
    setItems((prev) => prev.filter((it) => it.id !== id));
  };

  // Reordenar item
  const handleMoveItem = (index: number, direction: 'up' | 'down') => {
    const newItems = [...items];
    const targetIdx = direction === 'up' ? index - 1 : index + 1;
    if (targetIdx < 0 || targetIdx >= newItems.length) return;
    const temp = newItems[index];
    newItems[index] = newItems[targetIdx];
    newItems[targetIdx] = temp;
    setItems(newItems);
  };

  // Iniciar Novo Pedido (limpa itens para o próximo cliente e incrementa o pedido)
  const handleNewOrder = () => {
    setItems([]);
    setCustomerName('');
    setCashReceived('');
    setDiscount(0);
    const num = parseInt(orderNumber, 10);
    if (!isNaN(num)) {
      setOrderNumber(String(num + 1));
    }
    const now = new Date();
    setDate(now.toLocaleDateString('pt-BR') + ' ' + now.toLocaleTimeString('pt-BR').slice(0, 5));
    nameInputRef.current?.focus();
  };

  // Carregar Exemplo Rápido
  const handleLoadExample = () => {
    setItems([
      { id: '1', name: 'Cafe Expresso', qty: 2, unitPrice: 6.0 },
      { id: '2', name: 'Pao na Chapa', qty: 1, unitPrice: 7.5 },
      { id: '3', name: 'Agua Mineral', qty: 1, unitPrice: 4.0 },
    ]);
  };

  // Cálculos de Totais
  const subtotal = items.reduce((acc, it) => acc + it.qty * it.unitPrice, 0);
  const total = Math.max(0, subtotal - discount);
  const cashNum = cashReceived ? parseFloat(cashReceived.replace(',', '.')) : 0;
  const change = paymentMethod.includes('Dinheiro') && cashNum > total ? cashNum - total : 0;

  return (
    <div className="receipt-builder-container">
      {/* 1. SEÇÃO DO ESTABELECIMENTO */}
      <div className="receipt-section-box">
        <div
          className="receipt-section-header"
          onClick={() => setIsStoreExpanded((prev) => !prev)}
          style={{ cursor: 'pointer' }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Store size={16} color="var(--accent-bt)" />
            <span style={{ fontWeight: 700, fontSize: '0.875rem' }}>Dados do Estabelecimento</span>
            <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
              ({store.name || 'Sem nome'})
            </span>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            {isStoreSaved && (
              <span style={{ fontSize: '0.7rem', color: 'var(--accent-usb)', display: 'flex', alignItems: 'center', gap: '4px' }}>
                <Check size={12} /> Salvo!
              </span>
            )}
            {isStoreExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
          </div>
        </div>

        {isStoreExpanded && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginTop: '12px' }}>
            <div>
              <label className="pos-label">Nome da Loja / Fantasia</label>
              <input
                className="pos-input"
                type="text"
                value={store.name}
                onChange={(e) => setStore({ ...store, name: e.target.value })}
                placeholder="Ex: PADARIA & LANCHONETE CENTRAL"
              />
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
              <div>
                <label className="pos-label">CNPJ ou CPF (Opcional)</label>
                <input
                  className="pos-input"
                  type="text"
                  value={store.doc}
                  onChange={(e) => setStore({ ...store, doc: e.target.value })}
                  placeholder="Ex: CNPJ: 12.345.678/0001-90"
                />
              </div>
              <div>
                <label className="pos-label">Telefone / WhatsApp</label>
                <input
                  className="pos-input"
                  type="text"
                  value={store.phone}
                  onChange={(e) => setStore({ ...store, phone: e.target.value })}
                  placeholder="Ex: Tel: (11) 98765-4321"
                />
              </div>
            </div>

            <div>
              <label className="pos-label">Endereço (Opcional)</label>
              <input
                className="pos-input"
                type="text"
                value={store.address}
                onChange={(e) => setStore({ ...store, address: e.target.value })}
                placeholder="Ex: Rua das Flores, 120 - Centro"
              />
            </div>

            <button
              type="button"
              className="btn-secondary"
              style={{ alignSelf: 'flex-start', padding: '6px 12px', fontSize: '0.75rem', marginTop: '4px' }}
              onClick={handleSaveStore}
            >
              <Save size={13} color="var(--accent-usb)" />
              <span>Salvar Dados como Padrão</span>
            </button>
          </div>
        )}
      </div>

      {/* 2. DADOS DO ATENDIMENTO / COMANDA */}
      <div style={{ display: 'grid', gridTemplateColumns: '120px 1fr 1fr', gap: '10px' }}>
        <div>
          <label className="pos-label">Comanda/Pedido</label>
          <input
            className="pos-input"
            type="text"
            value={orderNumber}
            onChange={(e) => setOrderNumber(e.target.value)}
            placeholder="101"
          />
        </div>

        <div>
          <label className="pos-label">Data & Hora</label>
          <input
            className="pos-input"
            type="text"
            value={date}
            onChange={(e) => setDate(e.target.value)}
          />
        </div>

        <div>
          <label className="pos-label">Nome do Cliente (Opcional)</label>
          <input
            className="pos-input"
            type="text"
            value={customerName}
            onChange={(e) => setCustomerName(e.target.value)}
            placeholder="Ex: João da Silva"
          />
        </div>
      </div>

      {/* 3. LANÇAMENTO E LISTA DE ITENS */}
      <div className="receipt-section-box">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontWeight: 700, fontSize: '0.875rem' }}>
            <span>Itens da Venda</span>
            <span style={{ fontSize: '0.75rem', color: 'var(--accent-bt)', background: 'rgba(14, 165, 233, 0.15)', padding: '1px 6px', borderRadius: '4px' }}>
              {items.length} item(ns)
            </span>
          </div>

          <div style={{ display: 'flex', gap: '8px' }}>
            {items.length === 0 && (
              <button
                type="button"
                className="btn-secondary"
                style={{ padding: '4px 8px', fontSize: '0.72rem' }}
                onClick={handleLoadExample}
              >
                <Sparkles size={12} color="var(--accent-bt)" />
                <span>Carregar Exemplo</span>
              </button>
            )}
            <button
              type="button"
              className="btn-secondary"
              style={{ padding: '4px 8px', fontSize: '0.72rem', color: 'var(--accent-danger)' }}
              onClick={handleNewOrder}
              title="Limpar todos os itens para o próximo atendimento"
            >
              <RotateCcw size={12} />
              <span>Novo Pedido</span>
            </button>
          </div>
        </div>

        {/* Linha de Cadastro Rápido de Item */}
        <form onSubmit={handleAddItem} className="pos-add-item-form">
          <div style={{ flex: 3 }}>
            <input
              ref={nameInputRef}
              className="pos-input"
              type="text"
              value={newItemName}
              onChange={(e) => setNewItemName(e.target.value)}
              placeholder="Nome do produto ou serviço (Enter para adicionar)..."
              autoFocus
            />
          </div>

          <div style={{ width: '80px' }}>
            <input
              className="pos-input"
              type="number"
              min="1"
              value={newItemQty}
              onChange={(e) => setNewItemQty(Math.max(1, parseInt(e.target.value, 10) || 1))}
              title="Quantidade"
            />
          </div>

          <div style={{ width: '110px' }}>
            <input
              className="pos-input"
              type="text"
              value={newItemPrice}
              onChange={(e) => setNewItemPrice(e.target.value)}
              placeholder="R$ 0,00"
            />
          </div>

          <button
            type="submit"
            className="btn-primary bt"
            style={{ padding: '8px 14px', fontSize: '0.8rem', borderRadius: 'var(--radius-sm)' }}
            disabled={!newItemName.trim()}
          >
            <Plus size={16} />
            <span>Adicionar</span>
          </button>
        </form>

        {/* Tabela de Itens Adicionados */}
        <div className="pos-items-table">
          {items.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '24px 0', color: 'var(--text-muted)', fontSize: '0.8rem' }}>
              Nenhum item adicionado. Digite o nome do produto acima e pressione Enter.
            </div>
          ) : (
            items.map((it, idx) => {
              const itemTotal = it.qty * it.unitPrice;
              return (
                <div key={it.id} className="pos-item-row">
                  {/* Reordenação */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                    <button
                      type="button"
                      className="pos-icon-btn"
                      disabled={idx === 0}
                      onClick={() => handleMoveItem(idx, 'up')}
                      title="Mover para cima"
                    >
                      <ArrowUp size={12} />
                    </button>
                    <button
                      type="button"
                      className="pos-icon-btn"
                      disabled={idx === items.length - 1}
                      onClick={() => handleMoveItem(idx, 'down')}
                      title="Mover para baixo"
                    >
                      <ArrowDown size={12} />
                    </button>
                  </div>

                  {/* Nome do Item */}
                  <div style={{ flex: 1, fontWeight: 600, fontSize: '0.85rem' }}>
                    {it.name}
                  </div>

                  {/* Controle de Quantidade */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                    <button
                      type="button"
                      className="pos-icon-btn"
                      onClick={() => handleUpdateQty(it.id, -1)}
                      disabled={it.qty <= 1}
                    >
                      -
                    </button>
                    <span style={{ minWidth: '24px', textAlign: 'center', fontWeight: 700, fontSize: '0.85rem' }}>
                      {it.qty}
                    </span>
                    <button
                      type="button"
                      className="pos-icon-btn"
                      onClick={() => handleUpdateQty(it.id, 1)}
                    >
                      +
                    </button>
                  </div>

                  {/* Preço Unitário */}
                  <div style={{ width: '90px', textAlign: 'right', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                    R$ {formatCurrency(it.unitPrice)}
                  </div>

                  {/* Subtotal do Item */}
                  <div style={{ width: '95px', textAlign: 'right', fontWeight: 700, fontSize: '0.85rem', color: 'var(--text-primary)' }}>
                    R$ {formatCurrency(itemTotal)}
                  </div>

                  {/* Excluir */}
                  <button
                    type="button"
                    className="pos-icon-btn danger"
                    onClick={() => handleRemoveItem(it.id)}
                    title="Excluir item"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* 4. PAGAMENTO E TOTAIS */}
      <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: '14px' }}>
        {/* Formas de Pagamento */}
        <div className="receipt-section-box">
          <label className="pos-label" style={{ marginBottom: '8px', display: 'block' }}>
            Forma de Pagamento
          </label>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
            {[
              { label: 'PIX', icon: <QrCode size={14} /> },
              { label: 'Dinheiro', icon: <Banknote size={14} /> },
              { label: 'Cartão Débito', icon: <CreditCard size={14} /> },
              { label: 'Cartão Crédito', icon: <CreditCard size={14} /> },
              { label: 'Outro', icon: null },
            ].map((method) => (
              <button
                key={method.label}
                type="button"
                className={`pos-pill-btn ${paymentMethod === method.label ? 'active' : ''}`}
                onClick={() => setPaymentMethod(method.label)}
              >
                {method.icon}
                <span>{method.label}</span>
              </button>
            ))}
          </div>

          {/* Seletor de Troco para Dinheiro */}
          {paymentMethod.includes('Dinheiro') && (
            <div style={{ marginTop: '12px', padding: '10px', background: 'rgba(255, 255, 255, 0.03)', borderRadius: 'var(--radius-sm)' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', alignItems: 'center' }}>
                <div>
                  <label className="pos-label">Valor Recebido (R$)</label>
                  <input
                    className="pos-input"
                    type="text"
                    value={cashReceived}
                    onChange={(e) => setCashReceived(e.target.value)}
                    placeholder={`Ex: ${(total + 5).toFixed(2)}`}
                  />
                </div>
                <div>
                  <label className="pos-label">Troco a Devolver</label>
                  <div style={{ fontSize: '1.1rem', fontWeight: 800, color: 'var(--accent-usb)' }}>
                    R$ {formatCurrency(change)}
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Resumo do Total a Pagar */}
        <div className="receipt-section-box" style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '4px' }}>
              <span>Subtotal:</span>
              <span>R$ {formatCurrency(subtotal)}</span>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
              <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Desconto (R$):</span>
              <input
                className="pos-input"
                style={{ width: '80px', padding: '4px 8px', textAlign: 'right', fontSize: '0.8rem' }}
                type="number"
                min="0"
                step="0.5"
                value={discount || ''}
                onChange={(e) => setDiscount(Math.max(0, parseFloat(e.target.value) || 0))}
                placeholder="0,00"
              />
            </div>
          </div>

          {/* Destaque do Total */}
          <div className="pos-total-card">
            <span style={{ fontSize: '0.8rem', textTransform: 'uppercase', letterSpacing: '0.05em', color: 'rgba(255,255,255,0.7)' }}>
              Total a Pagar
            </span>
            <span style={{ fontSize: '1.6rem', fontWeight: 800, color: '#ffffff' }}>
              R$ {formatCurrency(total)}
            </span>
          </div>
        </div>
      </div>

      {/* 5. MENSAGEM FINAL / RODAPÉ */}
      <div>
        <label className="pos-label">Mensagem do Rodapé (Agradecimento)</label>
        <input
          className="pos-input"
          type="text"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Ex: Obrigado pela preferencia! Volte sempre."
        />
      </div>
    </div>
  );
};
