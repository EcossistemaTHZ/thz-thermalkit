/**
 * Utilitários de formatação matemática de texto para bobinas térmicas ESC/POS.
 * Suporta bobinas de 58 mm (32 colunas) e 80 mm (48 colunas).
 * Inclui geradores para:
 * - Comprovante Não Fiscal de Venda
 * - Fechamento de Caixa Diário / Turno
 * - Checagem de Estoque e Inventário
 * - To-Do List e Checklists Operacionais
 * - Vales e Recibos de Pagamento
 * - Comandas e Ordens de Serviço Rápidas
 */

import { StoreProfileDto } from '../types';

export interface ReceiptItem {
  id: string;
  code?: string;
  name: string;
  unit?: string; // UN, PC, KG, LT, etc.
  qty: number;
  unitPrice: number;
}

export interface ConsumerInfo {
  name?: string;
  doc?: string; // CPF / CNPJ
  address?: string;
}

export interface ReceiptData {
  store: StoreProfileDto;
  title?: string;
  orderNumber: string;
  date: string;
  consumer?: ConsumerInfo;
  items: ReceiptItem[];
  paymentMethod: string;
  discount: number;
  otherExpenses?: number; // Taxa de entrega / outras despesas
  cashReceived?: number;
  notes?: string;
}

// ============================================================================
// Modelos de Dados dos Utilitários de Gestão
// ============================================================================

export interface CashClosureData {
  store: StoreProfileDto;
  date: string;
  operator: string;
  shift?: string;
  openingFloat: number; // Fundo de troco inicial
  cashSales: number;
  creditSales: number;
  debitSales: number;
  pixSales: number;
  otherSales: number;
  cashWithdrawals: number; // Sangrias / Retiradas
  cashCounted: number; // Dinheiro contado na gaveta
  notes?: string;
}

export interface InventoryCheckItem {
  code: string;
  name: string;
  systemQty: number;
  unit?: string;
}

export interface InventoryCheckData {
  store: StoreProfileDto;
  date: string;
  sector: string;
  operator: string;
  items: InventoryCheckItem[];
}

export interface TodoListData {
  store: StoreProfileDto;
  date: string;
  title: string;
  assignedTo?: string;
  tasks: { text: string; done?: boolean }[];
}

export interface VoucherData {
  store: StoreProfileDto;
  date: string;
  voucherNumber: string;
  beneficiaryName: string;
  beneficiaryDoc?: string;
  amount: number;
  reason: string;
  authorizedBy?: string;
}

export interface QuickOrderData {
  store: StoreProfileDto;
  date: string;
  orderNumber: string;
  customerName: string;
  customerPhone?: string;
  items: { qty: number; name: string; obs?: string }[];
  deliveryDate?: string;
  totalEstimated?: number;
  notes?: string;
}

// ============================================================================
// Funções Primitivas de Alinhamento e Espaçamento
// ============================================================================

export function sanitizeText(text: string): string {
  return text.trim();
}

export function centerText(text: string, width: number): string {
  const clean = sanitizeText(text);
  if (clean.length >= width) {
    return clean.slice(0, width);
  }
  const totalSpaces = width - clean.length;
  const leftPad = Math.floor(totalSpaces / 2);
  const rightPad = totalSpaces - leftPad;
  return ' '.repeat(leftPad) + clean + ' '.repeat(rightPad);
}

export function wrapCenterText(text: string, width: number): string[] {
  const words = text.trim().split(/\s+/);
  const lines: string[] = [];
  let currentLine = '';

  for (const word of words) {
    if ((currentLine + ' ' + word).trim().length <= width) {
      currentLine = (currentLine + ' ' + word).trim();
    } else {
      if (currentLine) lines.push(centerText(currentLine, width));
      currentLine = word;
    }
  }
  if (currentLine) lines.push(centerText(currentLine, width));
  return lines;
}

export function padLine(left: string, right: string, width: number): string {
  const cleanLeft = left.trim();
  const cleanRight = right.trim();

  const minGap = 1;
  const maxLeftLen = width - cleanRight.length - minGap;

  let finalLeft = cleanLeft;
  if (finalLeft.length > maxLeftLen) {
    finalLeft = finalLeft.slice(0, maxLeftLen);
  }

  const spaceCount = width - finalLeft.length - cleanRight.length;
  return finalLeft + ' '.repeat(Math.max(1, spaceCount)) + cleanRight;
}

export function divider(char: string = '-', width: number = 32): string {
  return char.repeat(width);
}

export function formatCurrency(value: number): string {
  return value.toLocaleString('pt-BR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

export function formatThermalText(rawText: string, maxCols: number): string {
  return rawText
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
}

// ============================================================================
// Cabeçalho e Rodapé Dinâmicos da Loja
// ============================================================================

export function formatStoreHeader(store: StoreProfileDto, width: number = 32): string[] {
  const lines: string[] = [];

  if (store.name) {
    lines.push(...wrapCenterText(store.name.toUpperCase(), width));
  }
  if (store.legal_name && store.legal_name !== store.name) {
    lines.push(...wrapCenterText(store.legal_name.toUpperCase(), width));
  }

  const docClean = store.doc ? `CNPJ/CPF: ${store.doc}` : '';
  const phoneClean = store.phone ? `TEL: ${store.phone}` : (store.whatsapp ? `ZAP: ${store.whatsapp}` : '');
  if (docClean || phoneClean) {
    const infoLine = [docClean, phoneClean].filter(Boolean).join(' ');
    lines.push(...wrapCenterText(infoLine, width));
  }

  if (store.email) {
    lines.push(...wrapCenterText(store.email.toLowerCase(), width));
  }

  // Endereço completo formatado
  const addressParts: string[] = [];
  if (store.street) {
    let addrStr = store.street;
    if (store.number) addrStr += `, ${store.number}`;
    if (store.complement) addrStr += ` - ${store.complement}`;
    addressParts.push(addrStr);
  }
  if (store.neighborhood) addressParts.push(store.neighborhood);
  if (store.city) {
    const cityUf = store.state ? `${store.city} - ${store.state}` : store.city;
    addressParts.push(cityUf);
  }
  if (store.zip) addressParts.push(`CEP: ${store.zip}`);

  if (addressParts.length > 0) {
    const fullAddress = addressParts.join(' | ');
    lines.push(...wrapCenterText(fullAddress.toUpperCase(), width));
  }

  return lines;
}

export function formatStoreFooter(store: StoreProfileDto, width: number = 32): string[] {
  const lines: string[] = [];
  const msg = store.footer_message || 'Obrigado pela preferência! Volte sempre.';
  lines.push(...wrapCenterText(msg, width));
  return lines;
}

// ============================================================================
// 1. Recibo de Venda / Comprovante Não Fiscal
// ============================================================================

export function buildReceiptText(data: ReceiptData, width: number = 32): string {
  const lines: string[] = [];

  // 1. Cabeçalho
  lines.push(...formatStoreHeader(data.store, width));
  lines.push(divider('-', width));

  // 2. Título
  const docTitle = data.title || 'COMPROVANTE NÃO FISCAL';
  for (const part of docTitle.split('\n')) {
    lines.push(...wrapCenterText(part.toUpperCase(), width));
  }
  lines.push(divider('-', width));

  // 3. Detalhe dos Itens
  lines.push(centerText('DETALHE DO PEDIDO', width));

  if (width === 32) {
    lines.push(padLine('CODIGO', 'DESCRICAO', width));
    lines.push(padLine('QUANT.  UN', 'VAL UNIT    VAL TOT', width));
  } else {
    lines.push(padLine('CODIGO   DESCRICAO', 'QTD  UN   VAL UNIT   VAL TOT', width));
  }

  lines.push(divider('-', width));

  let subtotal = 0;
  data.items.forEach((item, index) => {
    const itemTotal = item.qty * item.unitPrice;
    subtotal += itemTotal;

    const codeStr = item.code || (index + 1).toString().padStart(3, '0');
    const unitStr = (item.unit || 'UN').toUpperCase();
    const qtyStr = item.qty.toLocaleString('pt-BR', { minimumFractionDigits: 2 });
    const unitPriceStr = formatCurrency(item.unitPrice);
    const totalStr = formatCurrency(itemTotal);

    if (width === 32) {
      lines.push(padLine(codeStr, item.name.toUpperCase(), width));
      lines.push(padLine(`${qtyStr} ${unitStr}`, `${unitPriceStr}  ${totalStr}`, width));
    } else {
      const leftPart = `${codeStr.padEnd(8)} ${item.name.toUpperCase()}`;
      const rightPart = `${qtyStr} ${unitStr}  ${unitPriceStr}  ${totalStr}`;
      lines.push(padLine(leftPart, rightPart, width));
    }
  });

  lines.push(divider('-', width));

  // 4. Totais
  const totalGeral = Math.max(0, subtotal - (data.discount || 0) + (data.otherExpenses || 0));
  lines.push(padLine('SUBTOTAL:', `R$ ${formatCurrency(subtotal)}`, width));

  if (data.discount && data.discount > 0) {
    lines.push(padLine('DESCONTO:', `-R$ ${formatCurrency(data.discount)}`, width));
  }
  if (data.otherExpenses && data.otherExpenses > 0) {
    lines.push(padLine('TAXA ENTREGA / OUTROS:', `+R$ ${formatCurrency(data.otherExpenses)}`, width));
  }

  lines.push(divider('=', width));
  lines.push(padLine('TOTAL A PAGAR:', `R$ ${formatCurrency(totalGeral)}`, width));
  lines.push(divider('=', width));

  // 5. Pagamento
  lines.push(padLine('FORMA DE PAGAMENTO:', (data.paymentMethod || 'DINHEIRO').toUpperCase(), width));
  if (data.cashReceived && data.cashReceived > totalGeral) {
    const troco = data.cashReceived - totalGeral;
    lines.push(padLine('VALOR RECEBIDO:', `R$ ${formatCurrency(data.cashReceived)}`, width));
    lines.push(padLine('TROCO:', `R$ ${formatCurrency(troco)}`, width));
  }

  // 6. Dados do Cliente
  if (data.consumer?.name || data.consumer?.doc) {
    lines.push(divider('-', width));
    lines.push(centerText('CONSUMIDOR', width));
    if (data.consumer.name) lines.push(padLine('NOME:', data.consumer.name.toUpperCase(), width));
    if (data.consumer.doc) lines.push(padLine('CPF/CNPJ:', data.consumer.doc, width));
    if (data.consumer.address) lines.push(...wrapCenterText(`END: ${data.consumer.address.toUpperCase()}`, width));
  }

  // 7. Controle e Data
  lines.push(divider('-', width));
  lines.push(padLine(`PEDIDO: #${data.orderNumber}`, data.date, width));

  // 8. Observações
  if (data.notes) {
    lines.push(divider('-', width));
    lines.push(...wrapCenterText(`OBS: ${data.notes}`, width));
  }

  // 9. Rodapé
  lines.push(divider('-', width));
  lines.push(...formatStoreFooter(data.store, width));
  lines.push(divider('=', width));

  return lines.join('\n') + '\n\n';
}

// ============================================================================
// 2. Fechamento de Caixa Diário / Turno
// ============================================================================

export function buildCashClosureText(data: CashClosureData, width: number = 32): string {
  const lines: string[] = [];

  lines.push(...formatStoreHeader(data.store, width));
  lines.push(divider('=', width));
  lines.push(centerText('FECHAMENTO DE CAIXA', width));
  if (data.shift) lines.push(centerText(`TURNO: ${data.shift.toUpperCase()}`, width));
  lines.push(divider('=', width));

  lines.push(padLine('DATA/HORA:', data.date, width));
  lines.push(padLine('OPERADOR:', data.operator.toUpperCase(), width));
  lines.push(divider('-', width));

  // Entradas
  lines.push(centerText('RESUMO DAS ENTRADAS', width));
  lines.push(padLine('FUNDO DE TROCO INICIAL:', `R$ ${formatCurrency(data.openingFloat)}`, width));
  lines.push(padLine('VENDAS EM DINHEIRO:', `R$ ${formatCurrency(data.cashSales)}`, width));
  lines.push(padLine('CARTAO DE CREDITO:', `R$ ${formatCurrency(data.creditSales)}`, width));
  lines.push(padLine('CARTAO DE DEBITO:', `R$ ${formatCurrency(data.debitSales)}`, width));
  lines.push(padLine('PAGAMENTOS PIX:', `R$ ${formatCurrency(data.pixSales)}`, width));
  if (data.otherSales > 0) {
    lines.push(padLine('OUTRAS FORMAS:', `R$ ${formatCurrency(data.otherSales)}`, width));
  }

  const totalVendas = data.cashSales + data.creditSales + data.debitSales + data.pixSales + data.otherSales;
  lines.push(divider('-', width));
  lines.push(padLine('TOTAL GERAL VENDAS:', `R$ ${formatCurrency(totalVendas)}`, width));

  // Saídas / Sangrias
  lines.push(divider('-', width));
  lines.push(centerText('SAIDAS / SANGRIAS', width));
  lines.push(padLine('SANGRIA / RETIRADAS:', `-R$ ${formatCurrency(data.cashWithdrawals)}`, width));

  // Balanço de Dinheiro Físico na Gaveta
  const saldoEsperadoGaveta = data.openingFloat + data.cashSales - data.cashWithdrawals;
  const diferenca = data.cashCounted - saldoEsperadoGaveta;

  lines.push(divider('=', width));
  lines.push(centerText('CONFERENCIA DE GAVETA', width));
  lines.push(padLine('DINHEIRO ESPERADO:', `R$ ${formatCurrency(saldoEsperadoGaveta)}`, width));
  lines.push(padLine('DINHEIRO CONTADO:', `R$ ${formatCurrency(data.cashCounted)}`, width));

  if (diferenca === 0) {
    lines.push(padLine('DIFERENCA:', 'R$ 0,00 (EXATO)', width));
  } else if (diferenca > 0) {
    lines.push(padLine('DIFERENCA:', `+R$ ${formatCurrency(diferenca)} (SOBRA)`, width));
  } else {
    lines.push(padLine('DIFERENCA:', `-R$ ${formatCurrency(Math.abs(diferenca))} (FALTA)`, width));
  }

  if (data.notes) {
    lines.push(divider('-', width));
    lines.push(...wrapCenterText(`OBS: ${data.notes}`, width));
  }

  // Linhas para Assinatura
  lines.push(divider('-', width));
  lines.push('');
  lines.push(centerText('_______________________________', width));
  lines.push(centerText('ASSINATURA DO OPERADOR', width));
  lines.push('');
  lines.push(centerText('_______________________________', width));
  lines.push(centerText('VISTO DA GERENCIA / SUPERVISAO', width));
  lines.push(divider('=', width));

  return lines.join('\n') + '\n\n';
}

// ============================================================================
// 3. Checagem de Estoque e Inventário
// ============================================================================

export function buildInventoryCheckText(data: InventoryCheckData, width: number = 32): string {
  const lines: string[] = [];

  lines.push(...formatStoreHeader(data.store, width));
  lines.push(divider('=', width));
  lines.push(centerText('CONFERENCIA DE ESTOQUE', width));
  lines.push(centerText(`SETOR: ${data.sector.toUpperCase()}`, width));
  lines.push(divider('=', width));

  lines.push(padLine('DATA:', data.date, width));
  lines.push(padLine('CONFERENTE:', data.operator.toUpperCase(), width));
  lines.push(divider('-', width));

  if (width === 32) {
    lines.push(padLine('PRODUTO / CODIGO', 'SISTEMA | FISICO', width));
  } else {
    lines.push(padLine('COD  DESCRICAO DO ITEM', 'SISTEMA    CONTAGEM FISICA', width));
  }
  lines.push(divider('-', width));

  data.items.forEach((item, index) => {
    const idx = (index + 1).toString().padStart(2, '0');
    const unit = item.unit || 'UN';

    if (width === 32) {
      lines.push(`${idx}. [${item.code}] ${item.name.toUpperCase()}`);
      lines.push(padLine(`Sist: ${item.systemQty} ${unit}`, 'Fis: [      ]', width));
    } else {
      const left = `${idx}. [${item.code.padEnd(6)}] ${item.name.toUpperCase()}`;
      const right = `${item.systemQty.toString().padStart(4)} ${unit}  [        ]`;
      lines.push(padLine(left, right, width));
    }
  });

  lines.push(divider('-', width));
  lines.push(padLine(`TOTAL ITENS: ${data.items.length}`, 'CONFERIDO: [  ]', width));
  lines.push('');
  lines.push(centerText('_______________________________', width));
  lines.push(centerText('ASSINATURA DO RESPONSAVEL', width));
  lines.push(divider('=', width));

  return lines.join('\n') + '\n\n';
}

// ============================================================================
// 4. To-Do List / Checklist Operacional
// ============================================================================

export function buildTodoListText(data: TodoListData, width: number = 32): string {
  const lines: string[] = [];

  lines.push(...formatStoreHeader(data.store, width));
  lines.push(divider('=', width));
  lines.push(centerText(data.title.toUpperCase(), width));
  lines.push(divider('=', width));

  lines.push(padLine('DATA:', data.date, width));
  if (data.assignedTo) {
    lines.push(padLine('RESPONSAVEL:', data.assignedTo.toUpperCase(), width));
  }
  lines.push(divider('-', width));

  data.tasks.forEach((task, index) => {
    const num = (index + 1).toString().padStart(2, '0');
    const check = task.done ? '[X]' : '[ ]';
    const textLines = wrapCenterText(task.text.toUpperCase(), width - 7);

    lines.push(`${check} ${num}. ${textLines[0] || ''}`);
    for (let i = 1; i < textLines.length; i++) {
      lines.push(`       ${textLines[i]}`);
    }
  });

  lines.push(divider('-', width));
  lines.push('');
  lines.push(centerText('_______________________________', width));
  lines.push(centerText('VISTO / CONFIRMACAO', width));
  lines.push(divider('=', width));

  return lines.join('\n') + '\n\n';
}

// ============================================================================
// 5. Vale / Recibo Simples de Adiantamento
// ============================================================================

export function buildVoucherText(data: VoucherData, width: number = 32): string {
  const lines: string[] = [];

  lines.push(...formatStoreHeader(data.store, width));
  lines.push(divider('=', width));
  lines.push(centerText('VALE / RECIBO DE PAGAMENTO', width));
  lines.push(centerText(`NUMERO: #${data.voucherNumber}`, width));
  lines.push(divider('=', width));

  lines.push(padLine('DATA:', data.date, width));
  lines.push(divider('-', width));

  lines.push(padLine('VALOR:', `R$ ${formatCurrency(data.amount)}`, width));
  lines.push(divider('-', width));

  lines.push(centerText('BENEFICIARIO / FAVORECIDO', width));
  lines.push(...wrapCenterText(data.beneficiaryName.toUpperCase(), width));
  if (data.beneficiaryDoc) {
    lines.push(centerText(`DOC: ${data.beneficiaryDoc}`, width));
  }

  lines.push(divider('-', width));
  lines.push(centerText('REFERENTE A:', width));
  lines.push(...wrapCenterText(data.reason.toUpperCase(), width));

  lines.push(divider('-', width));
  lines.push(...wrapCenterText('DECLARO QUE RECEBI O VALOR ACIMA ESPECIFICADO.', width));
  lines.push('');
  lines.push('');
  lines.push(centerText('_______________________________', width));
  lines.push(centerText(data.beneficiaryName.toUpperCase(), width));

  if (data.authorizedBy) {
    lines.push('');
    lines.push(centerText('_______________________________', width));
    lines.push(centerText(`AUTORIZADO POR: ${data.authorizedBy.toUpperCase()}`, width));
  }

  lines.push(divider('=', width));
  return lines.join('\n') + '\n\n';
}

// ============================================================================
// 6. Comanda / Ordem de Serviço Rápida
// ============================================================================

export function buildQuickOrderText(data: QuickOrderData, width: number = 32): string {
  const lines: string[] = [];

  lines.push(...formatStoreHeader(data.store, width));
  lines.push(divider('=', width));
  lines.push(centerText(`COMANDA / PEDIDO #${data.orderNumber}`, width));
  lines.push(divider('=', width));

  lines.push(padLine('EMISSAO:', data.date, width));
  lines.push(padLine('CLIENTE:', data.customerName.toUpperCase(), width));
  if (data.customerPhone) {
    lines.push(padLine('CONTATO:', data.customerPhone, width));
  }
  if (data.deliveryDate) {
    lines.push(padLine('PREVISAO:', data.deliveryDate, width));
  }
  lines.push(divider('-', width));

  lines.push(centerText('ITENS / SOLICITACOES', width));
  lines.push(divider('-', width));

  data.items.forEach((item, index) => {
    const num = (index + 1).toString().padStart(2, '0');
    lines.push(padLine(`${num}. ${item.qty}x ${item.name.toUpperCase()}`, '[  ]', width));
    if (item.obs) {
      lines.push(`   Obs: ${item.obs.toUpperCase()}`);
    }
  });

  if (data.totalEstimated && data.totalEstimated > 0) {
    lines.push(divider('-', width));
    lines.push(padLine('TOTAL ESTIMADO:', `R$ ${formatCurrency(data.totalEstimated)}`, width));
  }

  if (data.notes) {
    lines.push(divider('-', width));
    lines.push(...wrapCenterText(`OBS: ${data.notes}`, width));
  }

  lines.push(divider('=', width));
  lines.push(...formatStoreFooter(data.store, width));
  lines.push(divider('=', width));

  return lines.join('\n') + '\n\n';
}
