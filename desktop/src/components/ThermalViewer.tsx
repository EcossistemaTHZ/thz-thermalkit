import React from 'react';
import { DocumentPreviewDto } from '../types';
import { FileText, Scissors } from 'lucide-react';

interface ThermalViewerProps {
  preview: DocumentPreviewDto | null;
  widthDots: number;
}

export const ThermalViewer: React.FC<ThermalViewerProps> = ({
  preview,
  widthDots,
}) => {
  return (
    <div className="roll-stage-container">
      <div
        className="thermal-paper"
        style={{
          width: widthDots === 576 ? '480px' : '384px',
        }}
      >
        {/* Serrilha superior de corte manual */}
        <div className="thermal-paper-tear-top" />

        {/* Cabeçalho impresso na bobina */}
        <div
          style={{
            borderBottom: '1px dashed rgba(24, 24, 27, 0.25)',
            paddingBottom: '12px',
            marginBottom: '16px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            fontSize: '0.7rem',
            color: '#71717a',
            letterSpacing: '0.05em',
            textTransform: 'uppercase',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
            <Scissors size={12} />
            <span>58 mm / {widthDots} Dots</span>
          </div>
          <div>
            {preview ? (
              <span>{preview.page_count} página(s)</span>
            ) : (
              <span>Pronto para alimentar</span>
            )}
          </div>
        </div>

        {/* Conteúdo do Documento */}
        {preview ? (
          <div>
            {preview.kind === 'text' && preview.text_content ? (
              <pre
                style={{
                  whiteSpace: 'pre-wrap',
                  wordBreak: 'break-word',
                  fontFamily: 'var(--font-mono)',
                  fontSize: '0.8rem',
                  lineHeight: '1.4',
                  color: 'var(--paper-text)',
                }}
              >
                {preview.text_content}
              </pre>
            ) : preview.preview_image_base64 ? (
              <div>
                <img
                  src={`data:image/png;base64,${preview.preview_image_base64}`}
                  alt="Prévia de impressão térmica"
                  className="thermal-paper-image"
                />
                {preview.page_count > 1 && (
                  <div
                    style={{
                      marginTop: '12px',
                      padding: '8px',
                      background: 'rgba(0, 0, 0, 0.05)',
                      borderRadius: '4px',
                      fontSize: '0.7rem',
                      textAlign: 'center',
                      color: '#52525b',
                    }}
                  >
                    Exibindo 1ª página de {preview.page_count}. Todas as páginas serão impressas em sequência.
                  </div>
                )}
              </div>
            ) : null}
          </div>
        ) : (
          <div className="thermal-paper-empty">
            <div
              style={{
                width: '56px',
                height: '56px',
                borderRadius: '50%',
                background: 'rgba(0, 0, 0, 0.04)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <FileText size={28} color="#a1a1aa" />
            </div>
            <div style={{ fontWeight: 700, fontSize: '0.95rem', color: '#3f3f46' }}>
              Nenhum documento carregado
            </div>
            <div style={{ fontSize: '0.8rem', maxWidth: '240px', lineHeight: '1.4' }}>
              Abra um arquivo PDF, imagem ou texto para visualizar a simulação térmica exata de 58 mm.
            </div>
          </div>
        )}

        {/* Rodapé da bobina */}
        <div
          style={{
            marginTop: '24px',
            paddingTop: '12px',
            borderTop: '1px dashed rgba(24, 24, 27, 0.25)',
            textAlign: 'center',
            fontSize: '0.65rem',
            color: '#a1a1aa',
            letterSpacing: '0.08em',
          }}
        >
          *** THZ THERMALKIT DIRECT PRINT ***
        </div>
      </div>
    </div>
  );
};
