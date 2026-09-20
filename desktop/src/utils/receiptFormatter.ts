/**
 * Utilitários de formatação matemática de texto para bobinas térmicas ESC/POS.
 * Módulo de Comprovante Não Fiscal / Recibo de Venda para operadores de caixa.
 * Garante alinhamento milimétrico em 32 colunas (58 mm) ou 48 colunas (80 mm).
 */

export interface ReceiptItem {
  id: string;
  code?: string;
  name: string;
  unit?: string; // UN, PC, KG, LT, etc.
  qty: number;
  unitPrice: number;
}

export interface StoreInfo {
  name: string; // Nome da Loja / Fantasia
  doc: string;  // CNPJ ou CPF
  phone?: string;
  address: string;
}

export interface ConsumerInfo {
  name?: string;
  doc?: string; // CPF / CNPJ
  address?: string;
}

export interface ReceiptData {
  store: StoreInfo;
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

/**
 * Remove acentos conflitantes mantendo caracteres seguros para CP860
 */
export function sanitizeText(text: string): string {
  return text.trim();
}

/**
 * Centraliza um texto na largura máxima da bobina.
 */
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

/**
 * Quebra um texto longo em múltiplas linhas centralizadas
 */
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

/**
 * Alinha texto à esquerda e texto à direita preenchendo o miolo com espaços.
 * Se o texto esquerdo for longo demais, abrevia mantendo o valor direito visível.
 */
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

/**
 * Cria linha divisória com o caractere desejado ('-' padrão de comprovante).
 */
export function divider(char: string = '-', width: number = 32): string {
  return char.repeat(width);
}

/**
 * Formata um número para moeda brasileira (ex: "12,00").
 */
export function formatCurrency(value: number): string {
  return value.toLocaleString('pt-BR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

/**
 * Simula a quebra física de hardware ESC/POS linha a linha
 */
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

/**
 * Compila a notinha no formato de COMPROVANTE NÃO FISCAL de venda/atendimento.
 * Totalmente descaracterizado de NFC-e ou terminologia fiscal.
 */
export function buildReceiptText(data: ReceiptData, width: number = 32): string {
  const lines: string[] = [];

  // ==========================================
  // 1. CABEÇALHO DO ESTABELECIMENTO
  // ==========================================
  if (data.store.name) {
    lines.push(...wrapCenterText(data.store.name.toUpperCase(), width));
  }

  // CNPJ/CPF e Telefone
  const docClean = data.store.doc ? `CNPJ/CPF: ${data.store.doc}` : '';
  const phoneClean = data.store.phone ? `TEL: ${data.store.phone}` : '';
  if (docClean || phoneClean) {
    const infoLine = [docClean, phoneClean].filter(Boolean).join(' ');
    lines.push(...wrapCenterText(infoLine, width));
  }

  // Endereço
  if (data.store.address) {
    lines.push(...wrapCenterText(data.store.address.toUpperCase(), width));
  }

  lines.push(divider('-', width));

  // ==========================================
  // 2. TÍTULO DO COMPROVANTE NÃO FISCAL
  // ==========================================
  const docTitle = data.title || 'COMPROVANTE NÃO FISCAL';
  for (const part of docTitle.split('\n')) {
    lines.push(...wrapCenterText(part.toUpperCase(), width));
  }

  lines.push(divider('-', width));

  // ==========================================
  // 3. DETALHE DOS ITENS DO PEDIDO
  // ==========================================
  lines.push(centerText('DETALHE DO PEDIDO', width));

  if (width === 32) {
    lines.push(padLine('CODIGO', 'DESCRICAO', width));
    lines.push(padLine('QUANT.  UN', 'VAL UNIT    VAL TOT', width));
  } else {
    // 48 colunas
    lines.push(padLine('CODIGO   DESCRICAO', 'QTD  UN   VAL UNIT   VAL TOT', width));
  }

  lines.push(divider('-', width));

  let subtotal = 0;
  data.items.forEach((item, index) => {
    const itemTotal = item.qty * item.unitPrice;
    subtotal += itemTotal;

    const codeStr = item.code || (index + 1).toString().padStart(3, '0');
    const unitStr = (item.unit || 'UN').toUpperCase();
    const qtyStr = item.qty.toLocaleString('pt-BR', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
    const unitPriceStr = formatCurrency(item.unitPrice);
    const totalStr = formatCurrency(itemTotal);

    if (width === 32) {
      // Linha 1: Código + Descrição
      const headerLine = `${codeStr} ${item.name.toUpperCase()}`;
      if (headerLine.length <= width) {
        lines.push(headerLine);
      } else {
        lines.push(headerLine.slice(0, width));
        const rest = headerLine.slice(width);
        if (rest.trim()) lines.push(rest.slice(0, width));
      }

      // Linha 2: Quantidade, Unidade, X, Unitário e Total alinhados
      const leftCol = `${qtyStr.padStart(5, ' ')}  ${unitStr.padEnd(2, ' ')} X ${unitPriceStr}`;
      lines.push(padLine(leftCol, totalStr, width));
    } else {
      // 48 colunas
      const leftCol = `${codeStr} ${item.name.slice(0, 20).toUpperCase()}`;
      const rightCol = `${qtyStr} ${unitStr} X ${unitPriceStr}  ${totalStr}`;
      lines.push(padLine(leftCol, rightCol, width));
    }
  });

  lines.push(divider('-', width));

  // ==========================================
  // 4. TOTAIS E VALORES
  // ==========================================
  lines.push(padLine('QTD. TOTAL DE ITENS', data.items.length.toString(), width));
  lines.push(padLine('VALOR DOS PRODUTOS', formatCurrency(subtotal), width));

  if (data.discount && data.discount > 0) {
    lines.push(padLine('DESCONTO', formatCurrency(data.discount), width));
  }

  if (data.otherExpenses && data.otherExpenses > 0) {
    lines.push(padLine('TAXA DE ENTREGA / OUTROS', formatCurrency(data.otherExpenses), width));
  }

  const total = Math.max(0, subtotal - (data.discount || 0) + (data.otherExpenses || 0));
  lines.push(padLine('VALOR TOTAL R$', formatCurrency(total), width));

  lines.push(divider('-', width));

  // ==========================================
  // 5. FORMAS DE PAGAMENTO
  // ==========================================
  lines.push(padLine('FORMAS DE PAGAMENTO', 'Valor Pago', width));

  const paidAmount = data.cashReceived && data.cashReceived > 0 ? data.cashReceived : total;
  lines.push(padLine(data.paymentMethod, formatCurrency(paidAmount), width));

  // Troco se dinheiro
  if (
    data.paymentMethod.toLowerCase().includes('dinheiro') &&
    data.cashReceived &&
    data.cashReceived > total
  ) {
    const troco = data.cashReceived - total;
    lines.push(padLine('Troco', formatCurrency(troco), width));
  }

  lines.push(divider('-', width));

  // ==========================================
  // 6. DADOS DO CLIENTE
  // ==========================================
  if (data.consumer?.name && data.consumer.name.trim()) {
    lines.push(centerText('DADOS DO CLIENTE', width));
    lines.push(padLine('NOME:', data.consumer.name.toUpperCase(), width));
    if (data.consumer.doc) {
      lines.push(padLine('CPF/CNPJ:', data.consumer.doc, width));
    }
    if (data.consumer.address) {
      lines.push(...wrapCenterText(data.consumer.address.toUpperCase(), width));
    }
    lines.push(divider('-', width));
  }

  // ==========================================
  // 7. CONTROLE / ATENDIMENTO
  // ==========================================
  lines.push(centerText(`PEDIDO / CONTROLE Nº ${data.orderNumber}`, width));
  lines.push(centerText(`${data.date} - 1ª Via`, width));

  lines.push(divider('-', width));

  // ==========================================
  // 8. RODAPÉ
  // ==========================================
  if (data.notes && data.notes.trim()) {
    lines.push(...wrapCenterText(data.notes.toUpperCase(), width));
  } else {
    lines.push(centerText('OBRIGADO PELA PREFERENCIA!', width));
    lines.push(centerText('VOLTE SEMPRE!', width));
  }

  lines.push(centerText('*** NAO E DOCUMENTO FISCAL ***', width));

  return lines.join('\n');
}
