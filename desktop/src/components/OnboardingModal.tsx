import React, { useState, useMemo } from 'react';
import { StoreProfileDto } from '../types';
import { formatStoreHeader, formatStoreFooter, divider } from '../utils/receiptFormatter';
import {
  Store,
  CheckCircle2,
  AlertCircle,
  Printer,
  Sparkles,
  Building2,
  Phone,
  MapPin,
  MessageSquare
} from 'lucide-react';

export interface OnboardingScreenProps {
  onSave: (profile: StoreProfileDto) => Promise<void>;
  appName: string;
}

export const OnboardingScreen: React.FC<OnboardingScreenProps> = ({
  onSave,
  appName,
}) => {
  const [profile, setProfile] = useState<StoreProfileDto>({
    name: '',
    legal_name: '',
    doc: '',
    phone: '',
    whatsapp: '',
    email: '',
    street: '',
    number: '',
    complement: '',
    neighborhood: '',
    city: '',
    state: '',
    zip: '',
    footer_message: 'Obrigado pela preferência! Volte sempre.',
    onboarding_completed: true,
  });

  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Prévia da bobina térmica em tempo real (32 colunas / 58 mm)
  const virtualPreview = useMemo(() => {
    const previewStore: StoreProfileDto = {
      ...profile,
      name: profile.name.trim() || 'NOME DO SEU NEGÓCIO',
      doc: profile.doc.trim() || '00.000.000/0001-00',
    };
    const lines: string[] = [];
    lines.push(...formatStoreHeader(previewStore, 32));
    lines.push(divider('-', 32));
    lines.push('       COMPROVANTE EXEMPLO      ');
    lines.push(divider('-', 32));
    lines.push('001  PRODUTO DE TESTE           ');
    lines.push('1,00 UN       R$ 10,00  10,00   ');
    lines.push(divider('-', 32));
    lines.push('TOTAL A PAGAR:          R$ 10,00');
    lines.push(divider('=', 32));
    lines.push(...formatStoreFooter(previewStore, 32));
    lines.push(divider('=', 32));
    return lines.join('\n');
  }, [profile]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!profile.name.trim()) {
      setError('Por favor, informe o Nome Fantasia do seu Estabelecimento.');
      return;
    }
    if (!profile.doc.trim()) {
      setError('Por favor, informe o CNPJ ou CPF do seu estabelecimento.');
      return;
    }

    setError(null);
    setIsSaving(true);
    try {
      await onSave({ ...profile, onboarding_completed: true });
    } catch (err: any) {
      setError(err?.toString() || 'Erro ao salvar dados do estabelecimento.');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div
      style={{
        width: '100vw',
        height: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '24px',
        boxSizing: 'border-box',
        background: 'var(--bg-main)',
        backgroundImage:
          'radial-gradient(circle at 15% 15%, rgba(14, 165, 233, 0.15) 0%, transparent 50%), radial-gradient(circle at 85% 85%, rgba(16, 185, 129, 0.12) 0%, transparent 50%)',
        overflow: 'hidden',
      }}
    >
      <div
        className="glass-panel"
        style={{
          maxWidth: '1080px',
          width: '100%',
          height: '100%',
          maxHeight: '880px',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          boxShadow: '0 25px 60px -15px rgba(0, 0, 0, 0.8), 0 0 0 1px rgba(255, 255, 255, 0.08)',
        }}
      >
        {/* Cabeçalho de Boas-Vindas */}
        <div
          style={{
            padding: '22px 28px',
            borderBottom: '1px solid var(--border-subtle)',
            background: 'linear-gradient(135deg, rgba(14, 165, 233, 0.14), rgba(16, 185, 129, 0.08))',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
            <div
              style={{
                width: '48px',
                height: '48px',
                borderRadius: '14px',
                background: 'linear-gradient(135deg, #0284c7, #059669)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                boxShadow: '0 10px 20px -4px rgba(2, 132, 199, 0.5)',
              }}
            >
              <Store size={26} color="#ffffff" />
            </div>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <h1 style={{ margin: 0, fontSize: '1.35rem', fontWeight: 800, color: '#ffffff', letterSpacing: '-0.02em' }}>
                  Bem-vindo ao {appName}!
                </h1>
                <span
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '4px',
                    padding: '2px 8px',
                    borderRadius: '12px',
                    background: 'rgba(16, 185, 129, 0.18)',
                    border: '1px solid rgba(16, 185, 129, 0.35)',
                    fontSize: '0.7rem',
                    fontWeight: 700,
                    color: '#6ee7b7',
                  }}
                >
                  <Sparkles size={11} />
                  Primeiro Acesso
                </span>
              </div>
              <p style={{ margin: '4px 0 0 0', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                Configure os dados do seu negócio uma única vez. Eles serão usados no cabeçalho e rodapé de todas as impressões térmicas.
              </p>
            </div>
          </div>

          <div
            style={{
              padding: '8px 16px',
              borderRadius: '24px',
              background: 'rgba(14, 165, 233, 0.15)',
              border: '1px solid rgba(14, 165, 233, 0.3)',
              fontSize: '0.75rem',
              fontWeight: 800,
              letterSpacing: '0.05em',
              textTransform: 'uppercase',
              color: '#38bdf8',
            }}
          >
            Passo 1 de 1
          </div>
        </div>

        {/* Corpo: Formulário com scroll à esquerda + Bobina em tempo real à direita */}
        <div style={{ display: 'grid', gridTemplateColumns: '1.25fr 0.95fr', flex: 1, minHeight: 0, overflow: 'hidden' }}>
          {/* Lado Esquerdo: Formulário */}
          <form
            onSubmit={handleSubmit}
            style={{
              padding: '24px 28px',
              overflowY: 'auto',
              display: 'flex',
              flexDirection: 'column',
              gap: '20px',
            }}
          >
            {error && (
              <div
                style={{
                  padding: '12px 16px',
                  borderRadius: 'var(--radius-sm)',
                  background: 'rgba(239, 68, 68, 0.15)',
                  border: '1px solid rgba(239, 68, 68, 0.35)',
                  color: '#fca5a5',
                  fontSize: '0.85rem',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '10px',
                }}
              >
                <AlertCircle size={18} />
                <span>{error}</span>
              </div>
            )}

            {/* Seção 1: Identificação */}
            <div>
              <label
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  fontSize: '0.75rem',
                  fontWeight: 800,
                  color: 'var(--text-secondary)',
                  marginBottom: '10px',
                  textTransform: 'uppercase',
                  letterSpacing: '0.06em',
                }}
              >
                <Building2 size={14} color="var(--accent-bt)" />
                <span>Identificação da Empresa / Estabelecimento</span>
              </label>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '12px' }}>
                <div>
                  <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Nome Fantasia (Aparece em destaque na bobina) *</span>
                  <input
                    type="text"
                    required
                    placeholder="Ex: PADARIA & CONFEITARIA CENTRAL"
                    value={profile.name}
                    onChange={(e) => setProfile({ ...profile, name: e.target.value })}
                    style={{
                      width: '100%',
                      padding: '10px 12px',
                      marginTop: '4px',
                      borderRadius: 'var(--radius-sm)',
                      background: 'var(--bg-input)',
                      border: '1px solid var(--border-subtle)',
                      color: '#ffffff',
                      fontSize: '0.9rem',
                      outline: 'none',
                    }}
                  />
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                  <div>
                    <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>CNPJ ou CPF *</span>
                    <input
                      type="text"
                      required
                      placeholder="Ex: 12.345.678/0001-90"
                      value={profile.doc}
                      onChange={(e) => setProfile({ ...profile, doc: e.target.value })}
                      style={{
                        width: '100%',
                        padding: '10px 12px',
                        marginTop: '4px',
                        borderRadius: 'var(--radius-sm)',
                        background: 'var(--bg-input)',
                        border: '1px solid var(--border-subtle)',
                        color: '#ffffff',
                        fontSize: '0.9rem',
                        outline: 'none',
                      }}
                    />
                  </div>
                  <div>
                    <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Razão Social (Opcional)</span>
                    <input
                      type="text"
                      placeholder="Ex: Silva & Santos Alimentos Ltda"
                      value={profile.legal_name || ''}
                      onChange={(e) => setProfile({ ...profile, legal_name: e.target.value })}
                      style={{
                        width: '100%',
                        padding: '10px 12px',
                        marginTop: '4px',
                        borderRadius: 'var(--radius-sm)',
                        background: 'var(--bg-input)',
                        border: '1px solid var(--border-subtle)',
                        color: '#ffffff',
                        fontSize: '0.9rem',
                        outline: 'none',
                      }}
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* Seção 2: Contatos */}
            <div>
              <label
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  fontSize: '0.75rem',
                  fontWeight: 800,
                  color: 'var(--text-secondary)',
                  marginBottom: '10px',
                  textTransform: 'uppercase',
                  letterSpacing: '0.06em',
                }}
              >
                <Phone size={14} color="var(--accent-usb)" />
                <span>Canais de Atendimento & Contato</span>
              </label>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div>
                  <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Telefone Fixo / Celular</span>
                  <input
                    type="text"
                    placeholder="(11) 3322-1100"
                    value={profile.phone || ''}
                    onChange={(e) => setProfile({ ...profile, phone: e.target.value })}
                    style={{
                      width: '100%',
                      padding: '10px 12px',
                      marginTop: '4px',
                      borderRadius: 'var(--radius-sm)',
                      background: 'var(--bg-input)',
                      border: '1px solid var(--border-subtle)',
                      color: '#ffffff',
                      fontSize: '0.9rem',
                      outline: 'none',
                    }}
                  />
                </div>
                <div>
                  <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>WhatsApp</span>
                  <input
                    type="text"
                    placeholder="(11) 98765-4321"
                    value={profile.whatsapp || ''}
                    onChange={(e) => setProfile({ ...profile, whatsapp: e.target.value })}
                    style={{
                      width: '100%',
                      padding: '10px 12px',
                      marginTop: '4px',
                      borderRadius: 'var(--radius-sm)',
                      background: 'var(--bg-input)',
                      border: '1px solid var(--border-subtle)',
                      color: '#ffffff',
                      fontSize: '0.9rem',
                      outline: 'none',
                    }}
                  />
                </div>
              </div>
              <div style={{ marginTop: '12px' }}>
                <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>E-mail de Contato (Opcional)</span>
                <input
                  type="email"
                  placeholder="contato@seunegocio.com.br"
                  value={profile.email || ''}
                  onChange={(e) => setProfile({ ...profile, email: e.target.value })}
                  style={{
                    width: '100%',
                    padding: '10px 12px',
                    marginTop: '4px',
                    borderRadius: 'var(--radius-sm)',
                    background: 'var(--bg-input)',
                    border: '1px solid var(--border-subtle)',
                    color: '#ffffff',
                    fontSize: '0.9rem',
                    outline: 'none',
                  }}
                />
              </div>
            </div>

            {/* Seção 3: Endereço */}
            <div>
              <label
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  fontSize: '0.75rem',
                  fontWeight: 800,
                  color: 'var(--text-secondary)',
                  marginBottom: '10px',
                  textTransform: 'uppercase',
                  letterSpacing: '0.06em',
                }}
              >
                <MapPin size={14} color="#f59e0b" />
                <span>Endereço Físico (Impresso no cabeçalho)</span>
              </label>
              <div style={{ display: 'grid', gridTemplateColumns: '3fr 1fr', gap: '12px' }}>
                <div>
                  <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Logradouro / Rua</span>
                  <input
                    type="text"
                    placeholder="Av. Paulista"
                    value={profile.street || ''}
                    onChange={(e) => setProfile({ ...profile, street: e.target.value })}
                    style={{
                      width: '100%',
                      padding: '10px 12px',
                      marginTop: '4px',
                      borderRadius: 'var(--radius-sm)',
                      background: 'var(--bg-input)',
                      border: '1px solid var(--border-subtle)',
                      color: '#ffffff',
                      fontSize: '0.9rem',
                      outline: 'none',
                    }}
                  />
                </div>
                <div>
                  <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Número</span>
                  <input
                    type="text"
                    placeholder="1000"
                    value={profile.number || ''}
                    onChange={(e) => setProfile({ ...profile, number: e.target.value })}
                    style={{
                      width: '100%',
                      padding: '10px 12px',
                      marginTop: '4px',
                      borderRadius: 'var(--radius-sm)',
                      background: 'var(--bg-input)',
                      border: '1px solid var(--border-subtle)',
                      color: '#ffffff',
                      fontSize: '0.9rem',
                      outline: 'none',
                    }}
                  />
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginTop: '12px' }}>
                <div>
                  <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Complemento</span>
                  <input
                    type="text"
                    placeholder="Loja 02 / Sala 10"
                    value={profile.complement || ''}
                    onChange={(e) => setProfile({ ...profile, complement: e.target.value })}
                    style={{
                      width: '100%',
                      padding: '10px 12px',
                      marginTop: '4px',
                      borderRadius: 'var(--radius-sm)',
                      background: 'var(--bg-input)',
                      border: '1px solid var(--border-subtle)',
                      color: '#ffffff',
                      fontSize: '0.9rem',
                      outline: 'none',
                    }}
                  />
                </div>
                <div>
                  <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Bairro</span>
                  <input
                    type="text"
                    placeholder="Bela Vista"
                    value={profile.neighborhood || ''}
                    onChange={(e) => setProfile({ ...profile, neighborhood: e.target.value })}
                    style={{
                      width: '100%',
                      padding: '10px 12px',
                      marginTop: '4px',
                      borderRadius: 'var(--radius-sm)',
                      background: 'var(--bg-input)',
                      border: '1px solid var(--border-subtle)',
                      color: '#ffffff',
                      fontSize: '0.9rem',
                      outline: 'none',
                    }}
                  />
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr', gap: '12px', marginTop: '12px' }}>
                <div>
                  <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Cidade</span>
                  <input
                    type="text"
                    placeholder="São Paulo"
                    value={profile.city || ''}
                    onChange={(e) => setProfile({ ...profile, city: e.target.value })}
                    style={{
                      width: '100%',
                      padding: '10px 12px',
                      marginTop: '4px',
                      borderRadius: 'var(--radius-sm)',
                      background: 'var(--bg-input)',
                      border: '1px solid var(--border-subtle)',
                      color: '#ffffff',
                      fontSize: '0.9rem',
                      outline: 'none',
                    }}
                  />
                </div>
                <div>
                  <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>UF</span>
                  <input
                    type="text"
                    maxLength={2}
                    placeholder="SP"
                    value={profile.state || ''}
                    onChange={(e) => setProfile({ ...profile, state: e.target.value.toUpperCase() })}
                    style={{
                      width: '100%',
                      padding: '10px 12px',
                      marginTop: '4px',
                      borderRadius: 'var(--radius-sm)',
                      background: 'var(--bg-input)',
                      border: '1px solid var(--border-subtle)',
                      color: '#ffffff',
                      fontSize: '0.9rem',
                      outline: 'none',
                    }}
                  />
                </div>
                <div>
                  <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>CEP</span>
                  <input
                    type="text"
                    placeholder="01310-100"
                    value={profile.zip || ''}
                    onChange={(e) => setProfile({ ...profile, zip: e.target.value })}
                    style={{
                      width: '100%',
                      padding: '10px 12px',
                      marginTop: '4px',
                      borderRadius: 'var(--radius-sm)',
                      background: 'var(--bg-input)',
                      border: '1px solid var(--border-subtle)',
                      color: '#ffffff',
                      fontSize: '0.9rem',
                      outline: 'none',
                    }}
                  />
                </div>
              </div>
            </div>

            {/* Seção 4: Mensagem de Rodapé */}
            <div>
              <label
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  fontSize: '0.75rem',
                  fontWeight: 800,
                  color: 'var(--text-secondary)',
                  marginBottom: '10px',
                  textTransform: 'uppercase',
                  letterSpacing: '0.06em',
                }}
              >
                <MessageSquare size={14} color="#a855f7" />
                <span>Mensagem de Rodapé da Notinha</span>
              </label>
              <textarea
                rows={2}
                placeholder="Ex: Obrigado pela preferência! Volte sempre."
                value={profile.footer_message || ''}
                onChange={(e) => setProfile({ ...profile, footer_message: e.target.value })}
                style={{
                  width: '100%',
                  padding: '10px 12px',
                  borderRadius: 'var(--radius-sm)',
                  background: 'var(--bg-input)',
                  border: '1px solid var(--border-subtle)',
                  color: '#ffffff',
                  fontSize: '0.9rem',
                  outline: 'none',
                  resize: 'vertical',
                }}
              />
            </div>

            {/* Botão de Conclusão */}
            <div style={{ marginTop: '8px', paddingTop: '12px', borderTop: '1px solid var(--border-subtle)' }}>
              <button
                type="submit"
                className="btn-primary usb"
                disabled={isSaving}
                style={{
                  width: '100%',
                  padding: '14px',
                  fontSize: '1rem',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '10px',
                  cursor: isSaving ? 'wait' : 'pointer',
                }}
              >
                <CheckCircle2 size={20} />
                <span>{isSaving ? 'Salvando no SQLite...' : 'Salvar e Iniciar o Sistema'}</span>
              </button>
            </div>
          </form>

          {/* Lado Direito: Prévia ao Vivo na Bobina */}
          <div
            style={{
              background: 'rgba(5, 8, 15, 0.7)',
              borderLeft: '1px solid var(--border-subtle)',
              padding: '28px',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'flex-start',
              overflowY: 'auto',
            }}
          >
            <div style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.85rem', fontWeight: 800, color: 'var(--text-secondary)' }}>
                <Printer size={16} color="var(--accent-usb)" />
                <span>Prévia ao Vivo na Bobina (58 mm)</span>
              </div>
              <span
                style={{
                  fontSize: '0.7rem',
                  fontWeight: 700,
                  color: 'var(--accent-bt)',
                  background: 'rgba(14, 165, 233, 0.15)',
                  padding: '2px 8px',
                  borderRadius: '10px',
                }}
              >
                32 Colunas
              </span>
            </div>

            {/* Papel Térmico Virtual */}
            <div
              style={{
                width: '304px',
                background: '#f8fafc',
                color: '#0f172a',
                padding: '20px 14px',
                borderRadius: '4px',
                boxShadow: '0 20px 40px rgba(0, 0, 0, 0.7), 0 2px 10px rgba(0, 0, 0, 0.5)',
                fontFamily: 'Consolas, "Courier New", monospace',
                fontSize: '11px',
                lineHeight: '1.28',
                whiteSpace: 'pre-wrap',
                wordBreak: 'break-all',
                position: 'relative',
              }}
            >
              {/* Efeito de Serrilha Superior */}
              <div
                style={{
                  position: 'absolute',
                  top: '-6px',
                  left: 0,
                  right: 0,
                  height: '6px',
                  background: 'radial-gradient(circle, transparent, transparent 50%, #f8fafc 50%, #f8fafc 100%)',
                  backgroundSize: '12px 12px',
                }}
              />
              {virtualPreview}
            </div>

            <p style={{ margin: '20px 0 0 0', fontSize: '0.75rem', color: 'var(--text-muted)', textAlign: 'center', maxWidth: '280px', lineHeight: 1.4 }}>
              💡 Os dados digitados alimentam automaticamente o cabeçalho e rodapé em todos os comprovantes, vendas e utilitários.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

// Export de compatibilidade
export const OnboardingModal = OnboardingScreen;
