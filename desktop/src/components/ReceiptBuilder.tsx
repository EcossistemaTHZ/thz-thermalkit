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

const STORAGE_KEY_STORE = 'thz_thermalkit_danfe_store';

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
      // Ignora erro
    }
    return {
      name: 'RAZAO SOCIAL',
      doc: '99.999.999/9999-99',
      ie: '12345678',
      address: 'RUA PRINCIPAL, 123 - CENTRO - CAPITAL - RS',
    };
  });

  const [isStoreSaved, setIsStoreSaved] = useState(false);
  const [isStoreExpanded, setIsStoreExpanded] = useState(false);

  // 2. Título do Documento
  const [docTitle, setDocTitle] = useState(
    'DANFE NFC-e - Documento Auxiliar\nda Nota Fiscal Eletrônica para Consumidor'
  );

  // 3. Dados da Emissão e Consumidor
  const [orderNumber, setOrderNumber] = useState('1234');
  const [serie, setSerie] = useState('0');
  const [date, setDate] = useState(() => {
    const now = new Date();
    return now.toLocaleDateString('pt-BR') + ' ' + now.toLocaleTimeString('pt-BR');
  });

  const [consumer, setConsumer] = useState<ConsumerInfo>({
    name: 'DESTINATARIO TESTE',
    doc: '99.999.999/9999-99',
    address: 'RUA PRINCIPAL, 123, CENTRO, CAPITAL - RS',
  });
  const [isConsumerExpanded, setIsConsumerExpanded] = useState(false);

  // 4. Lista de Itens do Pedido (padrão igual ao modelo fornecido)
  const [items, setItems] = useState<ReceiptItem[]>([
    {
      id: '1',
      code: '1111111111111',
      name: 'TESTE IMPRESSAO',
      unit: 'PC',
      qty: 1,
      unitPrice: 12.0,
    },
    {
      id: '2',
      code: '2222222222222',
      name: 'ITEM COM DESCRICAO MUITO LONGA',
      unit: 'PC',
      qty: 100,
      unitPrice: 0.01,
    },
  ]);

  // Campos para novo item
  const [newItemCode, setNewItemCode] = useState('');
  const [newItemName, setNewItemName] = useState('');
  const [newItemUnit, setNewItemUnit] = useState('UN');
  const [newItemQty, setNewItemQty] = useState('1');
  const [newItemPrice, setNewItemPrice] = useState('');
  const nameInputRef = useRef<HTMLInputElement>(null);

  // 5. Totais e Pagamento
  const [paymentMethod, setPaymentMethod] = useState('Cartão de Crédito - Visa');
  const [discount, setDiscount] = useState<number>(0.06);
  const [otherExpenses, setOtherExpenses] = useState<number>(8.0);
  const [cashReceived, setCashReceived] = useState<string>('21,00');
  const [notes, setNotes] = useState('NFC-E EMITIDO PARA TESTE DE IMPRESSAO');

  // Salvar dados da empresa no localStorage
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
      serie,
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
    serie,
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
      (items.length + 1).toString().padStart(6, '0');

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

  // Restaurar Exemplo DANFE NFC-e
  const handleLoadExample = () => {
    setItems([
      {
        id: '1',
        code: '1111111111111',
        name: 'TESTE IMPRESSAO',
        unit: 'PC',
        qty: 1,
        unitPrice: 12.0,
      },
      {
        id: '2',
        code: '2222222222222',
        name: 'ITEM COM DESCRICAO MUITO LONGA',
        unit: 'PC',
        qty: 100,
        unitPrice: 0.01,
      },
    ]);
    setDiscount(0.06);
    setOtherExpenses(8.0);
    setPaymentMethod('Cartão de Crédito - Visa');
    setCashReceived('21,00');
  };

  // Cálculos de Totais
  const subtotal = items.reduce((acc, it) => acc + it.qty * it.unitPrice, 0);
  const total = Math.max(0, subtotal - discount + (otherExpenses || 0));
  const cashNum = cashReceived ? parseFloat(cashReceived.replace(',', '.')) : 0;
  const change = paymentMethod.includes('Dinheiro') && cashNum > total ? cashNum - total : 0;

  return (
    <div className="receipt-builder-container">
      {/* 1. SEÇÃO DO EMISSOR / EMPRESA */}
      <div className="receipt-section-box">
        <div
          className="receipt-section-header"
          onClick={() => setIsStoreExpanded((prev) => !prev)}
          style={{ cursor: 'pointer' }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Store size={16} color="var(--accent-bt)" />
            <span style={{ fontWeight: 700, fontSize: '0.875rem' }}>Empresa / Razão Social</span>
            <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
              ({store.name || 'RAZAO SOCIAL'})
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
              <label className="pos-label">Razão Social</label>
              <input
                className="pos-input"
                type="text"
                value={store.name}
                onChange={(e) => setStore({ ...store, name: e.target.value })}
                placeholder="Ex: RAZAO SOCIAL DA EMPRESA"
              />
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: '10px' }}>
              <div>
                <label className="pos-label">CNPJ</label>
                <input
                  className="pos-input"
                  type="text"
                  value={store.doc}
                  onChange={(e) => setStore({ ...store, doc: e.target.value })}
                  placeholder="99.999.999/9999-99"
                />
              </div>
              <div>
                <label className="pos-label">Inscrição Estadual (IE)</label>
                <input
                  className="pos-input"
                  type="text"
                  value={store.ie || ''}
                  onChange={(e) => setStore({ ...store, ie: e.target.value })}
                  placeholder="Ex: 123456789"
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
                placeholder="RUA PRINCIPAL, 123 - CENTRO - CIDADE - UF"
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

      {/* 2. DADOS DO DOCUMENTO E SÉRIE */}
      <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 100px 70px 1.2fr', gap: '10px' }}>
        <div>
          <label className="pos-label">Tipo de Documento</label>
          <select
            className="pos-input"
            value={docTitle}
            onChange={(e) => setDocTitle(e.target.value)}
          >
            <option value="DANFE NFC-e - Documento Auxiliar&#10;da Nota Fiscal Eletrônica para Consumidor">
              DANFE NFC-e - Documento Auxiliar
            </option>
            <option value="DOCUMENTO AUXILIAR DE VENDA&#10;NÃO É DOCUMENTO FISCAL">
              Documento Auxiliar de Venda
            </option>
            <option value="COMPROVANTE DE VENDA A CONSUMIDOR&#10;NÃO FISCAL">
              Comprovante de Venda a Consumidor
            </option>
          </select>
        </div>

        <div>
          <label className="pos-label">Nº Doc</label>
          <input
            className="pos-input"
            type="text"
            value={orderNumber}
            onChange={(e) => setOrderNumber(e.target.value)}
            placeholder="1234"
          />
        </div>

        <div>
          <label className="pos-label">Série</label>
          <input
            className="pos-input"
            type="text"
            value={serie}
            onChange={(e) => setSerie(e.target.value)}
            placeholder="0"
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

      {/* 3. LANÇAMENTO E LISTA DE ITENS (DETALHE DA VENDA) */}
      <div className="receipt-section-box">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontWeight: 700, fontSize: '0.875rem' }}>
            <FileText size={15} color="var(--accent-bt)" />
            <span>Detalhe da Venda (Itens)</span>
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
              <span>Modelo NFC-e Exemplo</span>
            </button>
            <button
              type="button"
              className="btn-secondary"
              style={{ padding: '4px 8px', fontSize: '0.72rem', color: 'var(--accent-danger)' }}
              onClick={handleNewOrder}
              title="Limpar itens para o próximo cliente"
            >
              <RotateCcw size={12} />
              <span>Limpar</span>
            </button>
          </div>
        </div>

        {/* Linha de Cadastro Rápido de Item */}
        <form onSubmit={handleAddItem} className="pos-add-item-form">
          <div style={{ width: '100px' }}>
            <input
              className="pos-input"
              type="text"
              value={newItemCode}
              onChange={(e) => setNewItemCode(e.target.value)}
              placeholder="Código"
              title="Código do produto"
            />
          </div>

          <div style={{ flex: 3 }}>
            <input
              ref={nameInputRef}
              className="pos-input"
              type="text"
              value={newItemName}
              onChange={(e) => setNewItemName(e.target.value)}
              placeholder="Descrição do produto..."
            />
          </div>

          <div style={{ width: '60px' }}>
            <input
              className="pos-input"
              type="text"
              value={newItemUnit}
              onChange={(e) => setNewItemUnit(e.target.value)}
              placeholder="UN"
              title="Unidade (UN, PC, KG)"
            />
          </div>

          <div style={{ width: '70px' }}>
            <input
              className="pos-input"
              type="text"
              value={newItemQty}
              onChange={(e) => setNewItemQty(e.target.value)}
              placeholder="Qtd"
              title="Quantidade"
            />
          </div>

          <div style={{ width: '90px' }}>
            <input
              className="pos-input"
              type="text"
              value={newItemPrice}
              onChange={(e) => setNewItemPrice(e.target.value)}
              placeholder="Unit R$"
            />
          </div>

          <button
            type="submit"
            className="btn-primary bt"
            style={{ padding: '8px 12px', fontSize: '0.8rem', borderRadius: 'var(--radius-sm)' }}
            disabled={!newItemName.trim()}
          >
            <Plus size={16} />
            <span>Adicionar</span>
          </button>
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

                  {/* Código + Nome */}
                  <div style={{ flex: 1, minWidth: 0 }}>
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
                  <div style={{ width: '75px', textAlign: 'right', fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                    R$ {formatCurrency(it.unitPrice)}
                  </div>

                  {/* Subtotal */}
                  <div style={{ width: '85px', textAlign: 'right', fontWeight: 700, fontSize: '0.825rem', color: 'var(--text-primary)' }}>
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

      {/* 4. TOTAIS, DESCONTOS, DESPESAS E PAGAMENTO */}
      <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: '12px' }}>
        {/* Formas de Pagamento */}
        <div className="receipt-section-box">
          <label className="pos-label" style={{ marginBottom: '8px', display: 'block' }}>
            Forma de Pagamento
          </label>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
            {[
              { label: 'Cartão de Crédito - Visa', icon: <CreditCard size={13} /> },
              { label: 'Cartão de Débito', icon: <CreditCard size={13} /> },
              { label: 'PIX', icon: <QrCode size={13} /> },
              { label: 'Dinheiro', icon: <Banknote size={13} /> },
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
              <label className="pos-label">Outras Despesas (R$)</label>
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
                <span>Outras Despesas:</span>
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

      {/* 5. CONSUMIDOR (OPCIONAL) */}
      <div className="receipt-section-box">
        <div
          className="receipt-section-header"
          onClick={() => setIsConsumerExpanded((prev) => !prev)}
          style={{ cursor: 'pointer' }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <User size={15} color="var(--accent-bt)" />
            <span style={{ fontWeight: 700, fontSize: '0.85rem' }}>Identificação do Consumidor</span>
            <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
              ({consumer.name || 'Não identificado'})
            </span>
          </div>
          <div>{isConsumerExpanded ? <ChevronUp size={15} /> : <ChevronDown size={15} />}</div>
        </div>

        {isConsumerExpanded && (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginTop: '10px' }}>
            <div>
              <label className="pos-label">Nome do Consumidor</label>
              <input
                className="pos-input"
                type="text"
                value={consumer.name || ''}
                onChange={(e) => setConsumer({ ...consumer, name: e.target.value })}
                placeholder="DESTINATARIO TESTE"
              />
            </div>
            <div>
              <label className="pos-label">CPF / CNPJ</label>
              <input
                className="pos-input"
                type="text"
                value={consumer.doc || ''}
                onChange={(e) => setConsumer({ ...consumer, doc: e.target.value })}
                placeholder="99.999.999/9999-99"
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
          placeholder="NFC-E EMITIDO PARA TESTE DE IMPRESSAO"
        />
      </div>
    </div>
  );
};
