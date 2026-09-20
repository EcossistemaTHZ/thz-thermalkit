import React, { useState, useEffect, useRef } from 'react';
import {
  ReceiptData,
  ReceiptItem,
  StoreInfo,
  ConsumerInfo,
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
  FileText,
  User,
  Clock,
} from 'lucide-react';

interface ReceiptBuilderProps {
  widthDots: number;
  onReceiptChange: (compiledText: string) => void;
}

const STORAGE_KEY_STORE = 'thz_thermalkit_nonfiscal_store';

export const ReceiptBuilder: React.FC<ReceiptBuilderProps> = ({
  widthDots,
  onReceiptChange,
}) => {
  const maxCols = widthDots === 576 ? 48 : 32;

  // 1. Dados do Estabelecimento (persistidos em LocalStorage)
  const [store, setStore] = useState<StoreInfo>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY_STORE);
      if (saved) return JSON.parse(saved);
    } catch {
      // Ignora erro
    }
    return {
      name: 'PADARIA & CONFEITARIA CENTRAL',
      doc: '12.345.678/0001-90',
      phone: '(11) 98765-4321',
      address: 'Rua das Flores, 120 - Centro - Cidade - UF',
    };
  });

  const [isStoreSaved, setIsStoreSaved] = useState(false);
  const [isStoreExpanded, setIsStoreExpanded] = useState(false);

  // 2. Tipo do Documento Não Fiscal
  const [docTitle, setDocTitle] = useState('COMPROVANTE NÃO FISCAL');

  // 3. Controle / Pedido e Data
  const [orderNumber, setOrderNumber] = useState('1042');
  const [date, setDate] = useState(() => {
    const now = new Date();
    return now.toLocaleDateString('pt-BR') + ' ' + now.toLocaleTimeString('pt-BR');
  });

  // 4. Identificação do Cliente (Opcional)
  const [consumer, setConsumer] = useState<ConsumerInfo>({
    name: '',
    doc: '',
    address: '',
  });
  const [isConsumerExpanded, setIsConsumerExpanded] = useState(false);

  // 5. Lista de Itens do Pedido
  const [items, setItems] = useState<ReceiptItem[]>([
    {
      id: '1',
      code: '001',
      name: 'Cafe Expresso',
      unit: 'UN',
      qty: 2,
      unitPrice: 6.0,
    },
    {
      id: '2',
      code: '002',
      name: 'Pao na Chapa',
      unit: 'UN',
      qty: 1,
      unitPrice: 7.5,
    },
    {
      id: '3',
      code: '003',
      name: 'Agua Mineral',
      unit: 'UN',
      qty: 1,
      unitPrice: 4.0,
    },
  ]);

  // Campos para cadastro de novo item
  const [newItemCode, setNewItemCode] = useState('');
  const [newItemName, setNewItemName] = useState('');
  const [newItemUnit, setNewItemUnit] = useState('UN');
  const [newItemQty, setNewItemQty] = useState('1');
  const [newItemPrice, setNewItemPrice] = useState('');
  const nameInputRef = useRef<HTMLInputElement>(null);

  // 6. Valores e Pagamento
  const [paymentMethod, setPaymentMethod] = useState('PIX');
  const [discount, setDiscount] = useState<number>(0);
  const [otherExpenses, setOtherExpenses] = useState<number>(0);
  const [cashReceived, setCashReceived] = useState<string>('');
  const [notes, setNotes] = useState('Obrigado pela preferencia! Volte sempre.');

  // Salvar dados da loja no localStorage
  const handleSaveStore = () => {
    try {
      localStorage.setItem(STORAGE_KEY_STORE, JSON.stringify(store));
      setIsStoreSaved(true);
      setTimeout(() => setIsStoreSaved(false), 2500);
    } catch {
      // Ignora erro
    }
  };

  // Recalcular texto da notinha sempre que qualquer dado mudar
  useEffect(() => {
    const receiptData: ReceiptData = {
      store,
      title: docTitle,
      orderNumber,
      date,
      consumer: consumer.name || consumer.doc ? consumer : undefined,
      items,
      paymentMethod,
      discount,
      otherExpenses,
      cashReceived: cashReceived ? parseFloat(cashReceived.replace(',', '.')) : undefined,
      notes,
    };

    const compiled = buildReceiptText(receiptData, maxCols);
    onReceiptChange(compiled);
  }, [
    store,
    docTitle,
    orderNumber,
    date,
    consumer,
    items,
    paymentMethod,
    discount,
    otherExpenses,
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
    const qtyNum = parseFloat(newItemQty.replace(',', '.')) || 1;
    const nextCode =
      newItemCode.trim() ||
      (items.length + 1).toString().padStart(3, '0');

    const newItem: ReceiptItem = {
      id: Date.now().toString(),
      code: nextCode,
      name: newItemName.trim(),
      unit: newItemUnit.trim() || 'UN',
      qty: Math.max(0.01, qtyNum),
      unitPrice: priceNum,
    };

    setItems((prev) => [...prev, newItem]);
    setNewItemCode('');
    setNewItemName('');
    setNewItemQty('1');
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

  // Iniciar Novo Pedido (limpa itens e incrementa nº do documento)
  const handleNewOrder = () => {
    setItems([]);
    setCashReceived('');
    setDiscount(0);
    setOtherExpenses(0);
    const num = parseInt(orderNumber, 10);
    if (!isNaN(num)) {
      setOrderNumber(String(num + 1));
    }
    const now = new Date();
    setDate(now.toLocaleDateString('pt-BR') + ' ' + now.toLocaleTimeString('pt-BR'));
    nameInputRef.current?.focus();
  };

  // Restaurar Exemplo de Venda
  const handleLoadExample = () => {
    setItems([
      {
        id: '1',
        code: '001',
        name: 'Cafe Expresso',
        unit: 'UN',
        qty: 2,
        unitPrice: 6.0,
      },
      {
        id: '2',
        code: '002',
        name: 'Pao na Chapa',
        unit: 'UN',
        qty: 1,
        unitPrice: 7.5,
      },
      {
        id: '3',
        code: '003',
        name: 'Agua Mineral',
        unit: 'UN',
        qty: 1,
        unitPrice: 4.0,
      },
    ]);
    setDiscount(0);
    setOtherExpenses(0);
    setPaymentMethod('PIX');
    setCashReceived('');
  };

  // Cálculos de Totais
  const subtotal = items.reduce((acc, it) => acc + it.qty * it.unitPrice, 0);
  const total = Math.max(0, subtotal - discount + (otherExpenses || 0));
  const cashNum = cashReceived ? parseFloat(cashReceived.replace(',', '.')) : 0;
  const change = paymentMethod.includes('Dinheiro') && cashNum > total ? cashNum - total : 0;

  return (
    <div className="receipt-builder-container">
      {/* 1. CABEÇALHO DO ESTABELECIMENTO */}
      <div className="receipt-section-box">
        <div
          className="receipt-section-header"
          onClick={() => setIsStoreExpanded((prev) => !prev)}
          style={{ cursor: 'pointer' }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Store size={16} color="var(--accent-bt)" />
            <span style={{ fontWeight: 700, fontSize: '0.85rem' }}>Identificação do Estabelecimento</span>
            <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
              ({store.name || 'Nome da Loja'})
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
              <label className="pos-label">Nome da Empresa / Fantasia</label>
              <input
                className="pos-input"
                type="text"
                value={store.name}
                onChange={(e) => setStore({ ...store, name: e.target.value })}
                placeholder="Ex: PADARIA & CONFEITARIA CENTRAL"
              />
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: '10px' }}>
              <div>
                <label className="pos-label">CNPJ ou CPF</label>
                <input
                  className="pos-input"
                  type="text"
                  value={store.doc}
                  onChange={(e) => setStore({ ...store, doc: e.target.value })}
                  placeholder="12.345.678/0001-90"
                />
              </div>
              <div>
                <label className="pos-label">Telefone / WhatsApp</label>
                <input
                  className="pos-input"
                  type="text"
                  value={store.phone || ''}
                  onChange={(e) => setStore({ ...store, phone: e.target.value })}
                  placeholder="(11) 98765-4321"
                />
              </div>
            </div>

            <div>
              <label className="pos-label">Endereço Completo</label>
              <input
                className="pos-input"
                type="text"
                value={store.address}
                onChange={(e) => setStore({ ...store, address: e.target.value })}
                placeholder="Rua das Flores, 120 - Centro - Cidade - UF"
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

      {/* 2. DADOS DO COMPROVANTE (NÃO FISCAL) */}
      <div style={{ display: 'grid', gridTemplateColumns: '1.3fr 120px 1fr', gap: '10px' }}>
        <div>
          <label className="pos-label">Tipo de Comprovante</label>
          <select
            className="pos-input"
            value={docTitle}
            onChange={(e) => setDocTitle(e.target.value)}
          >
            <option value="COMPROVANTE NÃO FISCAL">COMPROVANTE NÃO FISCAL</option>
            <option value="COMPROVANTE DE VENDA">COMPROVANTE DE VENDA</option>
            <option value="RECIBO DE PAGAMENTO">RECIBO DE PAGAMENTO</option>
            <option value="PEDIDO / CONTROLE INTERNO">PEDIDO / CONTROLE INTERNO</option>
            <option value="ORDEM DE SERVIÇO">ORDEM DE SERVIÇO</option>
          </select>
        </div>

        <div>
          <label className="pos-label">Nº Pedido / Controle</label>
          <input
            className="pos-input"
            type="text"
            value={orderNumber}
            onChange={(e) => setOrderNumber(e.target.value)}
            placeholder="1042"
          />
        </div>

        <div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '4px' }}>
            <label className="pos-label" style={{ margin: 0 }}>Data & Hora</label>
            <button
              type="button"
              style={{ background: 'transparent', border: 'none', color: 'var(--accent-bt)', fontSize: '0.7rem', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '2px' }}
              onClick={() => {
                const now = new Date();
                setDate(now.toLocaleDateString('pt-BR') + ' ' + now.toLocaleTimeString('pt-BR'));
              }}
            >
              <Clock size={11} /> Agora
            </button>
          </div>
          <input
            className="pos-input"
            type="text"
            value={date}
            onChange={(e) => setDate(e.target.value)}
          />
        </div>
      </div>

      {/* 3. LANÇAMENTO E LISTA DE ITENS */}
      <div className="receipt-section-box">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontWeight: 700, fontSize: '0.85rem' }}>
            <FileText size={15} color="var(--accent-bt)" />
            <span>Itens do Pedido</span>
            <span style={{ fontSize: '0.75rem', color: 'var(--accent-bt)', background: 'rgba(14, 165, 233, 0.15)', padding: '1px 6px', borderRadius: '4px' }}>
              {items.length} item(ns)
            </span>
          </div>

          <div style={{ display: 'flex', gap: '8px' }}>
            <button
              type="button"
              className="btn-secondary"
              style={{ padding: '4px 8px', fontSize: '0.72rem' }}
              onClick={handleLoadExample}
            >
              <Sparkles size={12} color="var(--accent-bt)" />
              <span>Exemplo Padrão</span>
            </button>
            <button
              type="button"
              className="btn-secondary"
              style={{ padding: '4px 8px', fontSize: '0.72rem', color: 'var(--accent-danger)' }}
              onClick={handleNewOrder}
              title="Limpar itens para o próximo atendimento"
            >
              <RotateCcw size={12} />
              <span>Novo Pedido</span>
            </button>
          </div>
        </div>

        {/* Cadastro de Item em 2 Linhas Espaçosas */}
        <form onSubmit={handleAddItem} style={{ background: 'rgba(15, 23, 42, 0.4)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-sm)', padding: '10px', marginBottom: '10px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '100px 1fr', gap: '8px' }}>
            <div>
              <label className="pos-label">Código</label>
              <input
                className="pos-input"
                type="text"
                value={newItemCode}
                onChange={(e) => setNewItemCode(e.target.value)}
                placeholder="Ex: 001"
              />
            </div>

            <div>
              <label className="pos-label">Descrição do Item</label>
              <input
                ref={nameInputRef}
                className="pos-input"
                type="text"
                value={newItemName}
                onChange={(e) => setNewItemName(e.target.value)}
                placeholder="Ex: Café Expresso (Pressione Enter para adicionar)..."
              />
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '75px 65px 110px 1fr', gap: '8px', alignItems: 'flex-end' }}>
            <div>
              <label className="pos-label">Qtd</label>
              <input
                className="pos-input"
                type="text"
                value={newItemQty}
                onChange={(e) => setNewItemQty(e.target.value)}
              />
            </div>

            <div>
              <label className="pos-label">UN</label>
              <input
                className="pos-input"
                type="text"
                value={newItemUnit}
                onChange={(e) => setNewItemUnit(e.target.value)}
                placeholder="UN"
              />
            </div>

            <div>
              <label className="pos-label">Unit R$</label>
              <input
                className="pos-input"
                type="text"
                value={newItemPrice}
                onChange={(e) => setNewItemPrice(e.target.value)}
                placeholder="0,00"
              />
            </div>

            <button
              type="submit"
              className="btn-primary bt"
              style={{ padding: '7px 12px', fontSize: '0.8rem', borderRadius: 'var(--radius-sm)', height: '35px' }}
              disabled={!newItemName.trim()}
            >
              <Plus size={15} />
              <span>Adicionar Item</span>
            </button>
          </div>
        </form>

        {/* Tabela de Itens Adicionados */}
        <div className="pos-items-table">
          {items.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '20px 0', color: 'var(--text-muted)', fontSize: '0.8rem' }}>
              Nenhum item adicionado. Digite os dados acima e pressione Enter.
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
                      <ArrowUp size={11} />
                    </button>
                    <button
                      type="button"
                      className="pos-icon-btn"
                      disabled={idx === items.length - 1}
                      onClick={() => handleMoveItem(idx, 'down')}
                      title="Mover para baixo"
                    >
                      <ArrowDown size={11} />
                    </button>
                  </div>

                  {/* Código + Descrição */}
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>
                      Cód: {it.code || (idx + 1).toString().padStart(3, '0')}
                    </div>
                    <div style={{ fontWeight: 600, fontSize: '0.825rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {it.name}
                    </div>
                  </div>

                  {/* Controle de Quantidade */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: '3px' }}>
                    <button
                      type="button"
                      className="pos-icon-btn"
                      onClick={() => handleUpdateQty(it.id, -1)}
                      disabled={it.qty <= 1}
                    >
                      -
                    </button>
                    <span style={{ minWidth: '32px', textAlign: 'center', fontWeight: 700, fontSize: '0.8rem' }}>
                      {it.qty} {it.unit || 'UN'}
                    </span>
                    <button
                      type="button"
                      className="pos-icon-btn"
                      onClick={() => handleUpdateQty(it.id, 1)}
                    >
                      +
                    </button>
                  </div>

                  {/* Unitário */}
                  <div style={{ textAlign: 'right', fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                    R$ {formatCurrency(it.unitPrice)}
                  </div>

                  {/* Subtotal */}
                  <div style={{ textAlign: 'right', fontWeight: 700, fontSize: '0.825rem', color: 'var(--text-primary)' }}>
                    R$ {formatCurrency(itemTotal)}
                  </div>

                  {/* Excluir */}
                  <button
                    type="button"
                    className="pos-icon-btn danger"
                    onClick={() => handleRemoveItem(it.id)}
                    title="Excluir item"
                  >
                    <Trash2 size={13} />
                  </button>
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* 4. TOTAIS, DESCONTOS, TAXAS E PAGAMENTO */}
      <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: '12px' }}>
        {/* Formas de Pagamento */}
        <div className="receipt-section-box">
          <label className="pos-label" style={{ marginBottom: '8px', display: 'block' }}>
            Forma de Pagamento
          </label>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
            {[
              { label: 'PIX', icon: <QrCode size={13} /> },
              { label: 'Dinheiro', icon: <Banknote size={13} /> },
              { label: 'Cartão Débito', icon: <CreditCard size={13} /> },
              { label: 'Cartão Crédito', icon: <CreditCard size={13} /> },
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

          <div style={{ marginTop: '12px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
            <div>
              <label className="pos-label">Desconto (R$)</label>
              <input
                className="pos-input"
                type="number"
                min="0"
                step="0.01"
                value={discount || ''}
                onChange={(e) => setDiscount(Math.max(0, parseFloat(e.target.value) || 0))}
                placeholder="0,00"
              />
            </div>
            <div>
              <label className="pos-label">Taxa Entrega / Outros (R$)</label>
              <input
                className="pos-input"
                type="number"
                min="0"
                step="0.01"
                value={otherExpenses || ''}
                onChange={(e) => setOtherExpenses(Math.max(0, parseFloat(e.target.value) || 0))}
                placeholder="0,00"
              />
            </div>
          </div>

          {/* Troco para Dinheiro */}
          {paymentMethod.includes('Dinheiro') && (
            <div style={{ marginTop: '10px', padding: '8px', background: 'rgba(255, 255, 255, 0.03)', borderRadius: 'var(--radius-sm)' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', alignItems: 'center' }}>
                <div>
                  <label className="pos-label">Valor Recebido</label>
                  <input
                    className="pos-input"
                    type="text"
                    value={cashReceived}
                    onChange={(e) => setCashReceived(e.target.value)}
                    placeholder={`Ex: ${(total + 5).toFixed(2)}`}
                  />
                </div>
                <div>
                  <label className="pos-label">Troco</label>
                  <div style={{ fontSize: '1.05rem', fontWeight: 800, color: 'var(--accent-usb)' }}>
                    R$ {formatCurrency(change)}
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Card Resumo do Total */}
        <div className="receipt-section-box" style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', fontSize: '0.8rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--text-secondary)' }}>
              <span>Qtd. Itens:</span>
              <strong>{items.length}</strong>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--text-secondary)' }}>
              <span>Valor dos Produtos:</span>
              <span>R$ {formatCurrency(subtotal)}</span>
            </div>
            {discount > 0 && (
              <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--accent-danger)' }}>
                <span>Desconto:</span>
                <span>-R$ {formatCurrency(discount)}</span>
              </div>
            )}
            {otherExpenses > 0 && (
              <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--text-secondary)' }}>
                <span>Taxa / Acréscimo:</span>
                <span>+R$ {formatCurrency(otherExpenses)}</span>
              </div>
            )}
          </div>

          <div className="pos-total-card" style={{ marginTop: '10px' }}>
            <span style={{ fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.05em', color: 'rgba(255,255,255,0.75)' }}>
              Valor Total R$
            </span>
            <span style={{ fontSize: '1.5rem', fontWeight: 800, color: '#ffffff' }}>
              R$ {formatCurrency(total)}
            </span>
          </div>
        </div>
      </div>

      {/* 5. DADOS DO CLIENTE (OPCIONAL) */}
      <div className="receipt-section-box">
        <div
          className="receipt-section-header"
          onClick={() => setIsConsumerExpanded((prev) => !prev)}
          style={{ cursor: 'pointer' }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <User size={15} color="var(--accent-bt)" />
            <span style={{ fontWeight: 700, fontSize: '0.85rem' }}>Identificação do Cliente (Opcional)</span>
            <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
              ({consumer.name || 'Não informado'})
            </span>
          </div>
          <div>{isConsumerExpanded ? <ChevronUp size={15} /> : <ChevronDown size={15} />}</div>
        </div>

        {isConsumerExpanded && (
          <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: '10px', marginTop: '10px' }}>
            <div>
              <label className="pos-label">Nome do Cliente</label>
              <input
                className="pos-input"
                type="text"
                value={consumer.name || ''}
                onChange={(e) => setConsumer({ ...consumer, name: e.target.value })}
                placeholder="Ex: Carlos Eduardo"
              />
            </div>
            <div>
              <label className="pos-label">CPF / Telefone</label>
              <input
                className="pos-input"
                type="text"
                value={consumer.doc || ''}
                onChange={(e) => setConsumer({ ...consumer, doc: e.target.value })}
                placeholder="Ex: 123.456.789-00 ou (11) 98765-4321"
              />
            </div>
          </div>
        )}
      </div>

      {/* 6. MENSAGEM DO RODAPÉ */}
      <div>
        <label className="pos-label">Mensagem do Rodapé</label>
        <input
          className="pos-input"
          type="text"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Obrigado pela preferência! Volte sempre."
        />
      </div>
    </div>
  );
};
