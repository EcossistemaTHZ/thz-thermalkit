import React, { useState, useMemo } from 'react';
import { StoreProfileDto } from '../types';
import { ThermalViewer } from './ThermalViewer';
import { formatStoreHeader, formatStoreFooter, divider } from '../utils/receiptFormatter';
import {
  AlignCenter,
  Minus,
  Store,
  Clock,
  WrapText,
  Copy,
  Check,
  Trash2
} from 'lucide-react';

interface WordEscPosProps {
  widthDots: number;
  showPreview?: boolean;
  storeProfile: StoreProfileDto | null;
  onTextChange: (text: string) => void;
}

export const WordEscPos: React.FC<WordEscPosProps> = ({
  widthDots,
  showPreview = true,
  storeProfile,
  onTextChange,
}) => {
  const maxCols = widthDots === 576 ? 48 : 32;

  const [text, setText] = useState<string>(() => {
    return (
      '================================\n' +
      '        COMUNICADO GERAL        \n' +
      '================================\n\n' +
      'Prezados clientes e amigos,\n\n' +
      'Informamos que neste feriado\n' +
      'estaremos atendendo em horario\n' +
      'especial das 08:00 as 14:00.\n\n' +
      'Agradecemos a compreensao!\n\n' +
      '--------------------------------\n' +
      '     VOLTE SEMPRE A VISITAR     \n' +
      '================================'
    );
  });

  const [copied, setCopied] = useState(false);

  // Notifica o App sobre mudanças no texto
  const handleUpdateText = (newText: string) => {
    setText(newText);
    onTextChange(newText);
  };

  // Linhas que excedem a coluna máxima
  const overflowingLines = useMemo(() => {
    return text
      .split('\n')
      .map((line, idx) => ({ lineNum: idx + 1, len: line.length, text: line }))
      .filter((item) => item.len > maxCols);
  }, [text, maxCols]);

  // Função para inserir texto na posição atual ou final
  const insertSnippet = (snippet: string) => {
    const updated = text ? text + '\n' + snippet : snippet;
    handleUpdateText(updated);
  };

  // Inserir cabeçalho da loja
  const handleInsertStoreHeader = () => {
    if (!storeProfile) return;
    const headerLines = formatStoreHeader(storeProfile, maxCols);
    insertSnippet(headerLines.join('\n') + '\n' + divider('=', maxCols));
  };

  // Inserir rodapé da loja
  const handleInsertStoreFooter = () => {
    if (!storeProfile) return;
    const footerLines = formatStoreFooter(storeProfile, maxCols);
    insertSnippet(divider('-', maxCols) + '\n' + footerLines.join('\n') + '\n' + divider('=', maxCols));
  };

  // Inserir data e hora
  const handleInsertDateTime = () => {
    const now = new Date();
    const formatted = now.toLocaleDateString('pt-BR') + ' ' + now.toLocaleTimeString('pt-BR');
    insertSnippet(divider('-', maxCols) + '\nDATA: ' + formatted);
  };

  // Centralizar linha selecionada ou última
  const handleCenterText = () => {
    const lines = text.split('\n');
    const updatedLines = lines.map((l) => {
      const trimmed = l.trim();
      if (!trimmed || trimmed.length >= maxCols) return l;
      const pad = Math.floor((maxCols - trimmed.length) / 2);
      return ' '.repeat(pad) + trimmed;
    });
    handleUpdateText(updatedLines.join('\n'));
  };

  // Auto-Wrap inteligente
  const handleAutoWrap = () => {
    const lines = text.split('\n');
    const wrapped: string[] = [];

    for (const line of lines) {
      if (line.length <= maxCols) {
        wrapped.push(line);
      } else {
        const words = line.split(' ');
        let current = '';
        for (const w of words) {
          if ((current + ' ' + w).trim().length <= maxCols) {
            current = (current + ' ' + w).trim();
          } else {
            if (current) wrapped.push(current);
            current = w;
          }
        }
        if (current) wrapped.push(current);
      }
    }

    handleUpdateText(wrapped.join('\n'));
  };

  // Modelos de Presets Rápidos
  const loadPreset = (presetName: string) => {
    if (presetName === 'promocao') {
      const promo =
        divider('=', maxCols) + '\n' +
        '*** SUPER PROMOCAO DO DIA ***\n' +
        divider('=', maxCols) + '\n\n' +
        'Apresente este cupom no caixa\n' +
        'e ganhe 15% DE DESCONTO em\n' +
        'qualquer compra acima de R$ 50!\n\n' +
        'Valido somente para hoje.\n\n' +
        divider('-', maxCols) + '\n' +
        'CODIGO: PROMO-15-HOJE\n' +
        divider('=', maxCols);
      handleUpdateText(promo);
    } else if (presetName === 'wifi') {
      const wifi =
        divider('=', maxCols) + '\n' +
        '      ACESSO A REDE WI-FI       \n' +
        divider('=', maxCols) + '\n\n' +
        'Rede: ' + (storeProfile?.name ? storeProfile.name.slice(0, 16) : 'CLIENTES_WIFI') + '\n' +
        'Senha: ' + 'visite-nos-sempre' + '\n\n' +
        'Navegue a vontade enquanto aguarda\n' +
        'o seu atendimento!\n\n' +
        divider('=', maxCols);
      handleUpdateText(wifi);
    } else if (presetName === 'aviso') {
      const aviso =
        divider('=', maxCols) + '\n' +
        '        AVISO IMPORTANTE        \n' +
        divider('=', maxCols) + '\n\n' +
        'Pedimos a gentileza de conferir\n' +
        'seu troco e mercadorias antes\n' +
        'de deixar o balcao de atendimento.\n\n' +
        'Nao aceitamos trocas sem este\n' +
        'comprovante de atendimento.\n\n' +
        divider('=', maxCols);
      handleUpdateText(aviso);
    }
  };

  const handleCopy = () => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div style={{ display: 'grid', gridTemplateColumns: showPreview ? '1fr 315px' : '1fr', gap: '16px', height: '100%', minHeight: 0, overflow: 'hidden' }}>
      {/* Editor e Toolbar */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', height: '100%', minHeight: 0 }}>
        {/* Toolbar de Formatação Térmica */}
        <div
          style={{
            padding: '8px 12px',
            background: 'var(--bg-card)',
            border: '1px solid var(--border-color)',
            borderRadius: 'var(--radius-md)',
            display: 'flex',
            flexWrap: 'wrap',
            alignItems: 'center',
            gap: '8px',
          }}
        >
          {/* Botões de Ações Rápidas */}
          <button
            className="btn-secondary"
            style={{ padding: '5px 10px', fontSize: '0.75rem', gap: '6px' }}
            onClick={handleInsertStoreHeader}
            title="Inserir Cabeçalho da Empresa cadastrado no SQLite"
          >
            <Store size={14} color="var(--accent-usb)" />
            <span>+ Cabeçalho Loja</span>
          </button>

          <button
            className="btn-secondary"
            style={{ padding: '5px 10px', fontSize: '0.75rem', gap: '6px' }}
            onClick={() => insertSnippet(divider('-', maxCols))}
            title="Inserir linha divisória simples"
          >
            <Minus size={14} />
            <span>Linha (---)</span>
          </button>

          <button
            className="btn-secondary"
            style={{ padding: '5px 10px', fontSize: '0.75rem', gap: '6px' }}
            onClick={() => insertSnippet(divider('=', maxCols))}
            title="Inserir linha divisória dupla"
          >
            <span>Linha (===)</span>
          </button>

          <button
            className="btn-secondary"
            style={{ padding: '5px 10px', fontSize: '0.75rem', gap: '6px' }}
            onClick={handleInsertDateTime}
            title="Inserir Data e Hora"
          >
            <Clock size={14} />
            <span>+ Data/Hora</span>
          </button>

          <button
            className="btn-secondary"
            style={{ padding: '5px 10px', fontSize: '0.75rem', gap: '6px' }}
            onClick={handleInsertStoreFooter}
            title="Inserir Rodapé com mensagem da loja"
          >
            <span>+ Rodapé</span>
          </button>

          <button
            className="btn-secondary"
            style={{ padding: '5px 10px', fontSize: '0.75rem', gap: '6px' }}
            onClick={handleCenterText}
            title="Centralizar todas as linhas na bobina"
          >
            <AlignCenter size={14} />
            <span>Centralizar</span>
          </button>

          <button
            className="btn-secondary"
            style={{ padding: '5px 10px', fontSize: '0.75rem', gap: '6px' }}
            onClick={handleAutoWrap}
            title="Quebrar linhas longas automaticamente respeitando palavras"
          >
            <WrapText size={14} color="var(--accent-bt)" />
            <span>Auto-Wrap</span>
          </button>

          <div style={{ marginLeft: 'auto', display: 'flex', gap: '6px' }}>
            <button
              className="btn-secondary"
              style={{ padding: '5px 8px', fontSize: '0.75rem' }}
              onClick={() => handleUpdateText('')}
              title="Limpar editor"
            >
              <Trash2 size={13} color="var(--accent-danger)" />
            </button>
            <button
              className="btn-secondary"
              style={{ padding: '5px 8px', fontSize: '0.75rem' }}
              onClick={handleCopy}
              title="Copiar texto"
            >
              {copied ? <Check size={13} color="var(--accent-usb)" /> : <Copy size={13} />}
            </button>
          </div>
        </div>

        {/* Barra de Presets Rápidos */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.75rem', color: 'var(--text-muted)' }}>
          <span>Modelos rápidos:</span>
          <button
            className="btn-secondary"
            style={{ padding: '3px 8px', fontSize: '0.7rem' }}
            onClick={() => loadPreset('promocao')}
          >
            Cupom de Desconto
          </button>
          <button
            className="btn-secondary"
            style={{ padding: '3px 8px', fontSize: '0.7rem' }}
            onClick={() => loadPreset('wifi')}
          >
            Senha do Wi-Fi
          </button>
          <button
            className="btn-secondary"
            style={{ padding: '3px 8px', fontSize: '0.7rem' }}
            onClick={() => loadPreset('aviso')}
          >
            Aviso de Balcão
          </button>
        </div>

        {/* Área de Texto Principal */}
        <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0, position: 'relative' }}>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              fontSize: '0.75rem',
              color: 'var(--text-muted)',
              marginBottom: '6px',
            }}
          >
            <span>Word para ESC/POS • {maxCols} colunas ({widthDots === 576 ? '80 mm' : '58 mm'})</span>
            {overflowingLines.length > 0 ? (
              <span style={{ color: 'var(--accent-warning)', fontWeight: 700 }}>
                ⚠️ {overflowingLines.length} linha(s) ultrapassam {maxCols} colunas
              </span>
            ) : (
              <span style={{ color: 'var(--accent-usb)', fontWeight: 700 }}>
                ✓ Todas as linhas alinhadas à bobina
              </span>
            )}
          </div>

          <textarea
            value={text}
            onChange={(e) => handleUpdateText(e.target.value)}
            spellCheck={false}
            placeholder="Digite aqui o texto que será enviado diretamente para a impressora térmica..."
            style={{
              flex: 1,
              width: '100%',
              padding: '14px',
              borderRadius: 'var(--radius-md)',
              background: 'var(--bg-card)',
              border: overflowingLines.length > 0 ? '1px solid rgba(245, 158, 11, 0.4)' : '1px solid var(--border-color)',
              color: '#ffffff',
              fontFamily: 'Consolas, "Courier New", monospace',
              fontSize: '13px',
              lineHeight: '1.4',
              resize: 'none',
              outline: 'none',
            }}
          />

          {overflowingLines.length > 0 && (
            <div
              style={{
                marginTop: '8px',
                padding: '8px 12px',
                background: 'rgba(245, 158, 11, 0.1)',
                border: '1px solid rgba(245, 158, 11, 0.3)',
                borderRadius: 'var(--radius-sm)',
                fontSize: '0.75rem',
                color: '#fde68a',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: '8px',
              }}
            >
              <span>
                Linha {overflowingLines[0].lineNum} possui {overflowingLines[0].len} colunas (máx: {maxCols}). Na impressora física o excesso irá quebrar para a linha seguinte.
              </span>
              <button
                className="btn-secondary"
                style={{ padding: '4px 8px', fontSize: '0.7rem', flexShrink: 0 }}
                onClick={handleAutoWrap}
              >
                Ajustar Automaticamente
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Prévia ao Vivo na Bobina */}
      {showPreview && (
        <div style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0, overflow: 'hidden' }}>
          <ThermalViewer
            preview={{
              file_name: 'Texto Livre ESC/POS',
              file_path: 'memoria://word_escpos.txt',
              file_size: text.length,
              kind: 'text',
              text_content: text,
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
