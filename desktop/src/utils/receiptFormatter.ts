/**
 * Utilitários de formatação matemática de texto para bobinas térmicas ESC/POS.
 * Garante alinhamento milimétrico em 32 colunas (58 mm) ou 48 colunas (80 mm).
 */

export interface ReceiptItem {
  id: string;
  name: string;
  qty: number;
  unitPrice: number;
}

export interface StoreInfo {
  name: string;
  doc: string; // CNPJ / CPF
  phone: string;
  address: string;
}

export interface ReceiptData {
  store: StoreInfo;
  orderNumber: string;
  date: string;
  customerName?: string;
  items: ReceiptItem[];
  paymentMethod: string;
  discount: number;
  cashReceived?: number;
  notes?: string;
}

/**
 * Remove acentos conflitantes se necessário ou mantém caracteres seguros para CP860
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
 * Alinha texto à esquerda e texto à direita preenchendo o miolo com espaços.
 * Se o texto esquerdo for longo demais, abrevia ou ajusta mantendo o valor direito visível.
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
 * Cria linha divisória com o caractere desejado ('=' ou '-').
 */
export function divider(char: string, width: number): string {
  return char.repeat(width);
}

/**
 * Formata um número para moeda brasileira (ex: "12,50").
 */
export function formatCurrency(value: number): string {
  return value.toLocaleString('pt-BR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

/**
 * Compila todos os dados do formulário de notinha em uma string ESC/POS estritamente alinhada.
 */
export function buildReceiptText(data: ReceiptData, width: number = 32): string {
  const lines: string[] = [];

  // Linha superior de destaque
  lines.push(divider('=', width));

  // Nome do estabelecimento centralizado
  if (data.store.name) {
    // Se o nome for maior que a largura, quebra em linhas centralizadas
    const words = data.store.name.split(' ');
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
  }

  // Endereço e documento se existirem
  if (data.store.doc) {
    lines.push(centerText(data.store.doc, width));
  }
  if (data.store.phone) {
    lines.push(centerText(data.store.phone, width));
  }
  if (data.store.address) {
    lines.push(centerText(data.store.address, width));
  }

  // Linha divisória após cabeçalho
  lines.push(divider('=', width));

  // Número do pedido e data/hora
  if (data.orderNumber) {
    lines.push(padLine(`PEDIDO #${data.orderNumber}`, data.date, width));
  } else {
    lines.push(centerText(data.date, width));
  }

  if (data.customerName && data.customerName.trim()) {
    lines.push(padLine('Cliente:', data.customerName.trim(), width));
  }

  lines.push(divider('-', width));

  // Cabeçalho da tabela de itens
  if (width === 32) {
    // Em 32 colunas: "Item                 Qtd   Total"
    lines.push(padLine('Item', 'Qtd    Total', width));
  } else {
    // Em 48 colunas: "Item                             Qtd  Unit     Total"
    lines.push(padLine('Item', 'Qtd   Unit      Total', width));
  }
  lines.push(divider('-', width));

  // Lista de itens
  let subtotal = 0;
  for (const item of data.items) {
    const itemTotal = item.qty * item.unitPrice;
    subtotal += itemTotal;

    const formattedTotal = `R$ ${formatCurrency(itemTotal)}`;
    const formattedQty = `${item.qty}`;

    if (width === 32) {
      // Ex: "Cafe Expresso          2  R$ 12,00"
      const rightCol = `${formattedQty.padStart(2, ' ')} ${formattedTotal.padStart(9, ' ')}`;
      lines.push(padLine(item.name, rightCol, width));
    } else {
      // 48 colunas
      const formattedUnit = formatCurrency(item.unitPrice);
      const rightCol = `${formattedQty.padStart(3, ' ')}  ${formattedUnit.padStart(7, ' ')} ${formattedTotal.padStart(10, ' ')}`;
      lines.push(padLine(item.name, rightCol, width));
    }
  }

  lines.push(divider('-', width));

  // Totais
  const total = Math.max(0, subtotal - (data.discount || 0));

  if (data.discount && data.discount > 0) {
    lines.push(padLine('Subtotal:', `R$ ${formatCurrency(subtotal)}`, width));
    lines.push(padLine('Desconto:', `-R$ ${formatCurrency(data.discount)}`, width));
  }

  lines.push(padLine('TOTAL A PAGAR:', `R$ ${formatCurrency(total)}`, width));

  // Forma de pagamento
  if (data.paymentMethod) {
    lines.push(padLine('Forma de Pagto:', data.paymentMethod, width));
  }

  // Troco se dinheiro
  if (
    data.paymentMethod.toLowerCase().includes('dinheiro') &&
    data.cashReceived &&
    data.cashReceived > total
  ) {
    const troco = data.cashReceived - total;
    lines.push(padLine('Valor Recebido:', `R$ ${formatCurrency(data.cashReceived)}`, width));
    lines.push(padLine('TROCO:', `R$ ${formatCurrency(troco)}`, width));
  }

  // Rodapé e observações
  lines.push(divider('=', width));

  if (data.notes && data.notes.trim()) {
    lines.push(centerText(data.notes.trim(), width));
  } else {
    lines.push(centerText('Obrigado pela preferencia!', width));
    lines.push(centerText('Volte Sempre!', width));
  }

  lines.push(centerText('*** NAO E DOCUMENTO FISCAL ***', width));
  lines.push(divider('=', width));

  return lines.join('\n');
}
