/**
 * ResultadoDestaque — Card principal de Lucro Líquido + 3 cards
 * de Receita, Custeio e Caixa Final. Onda A.
 *
 * NOTA: A Variação do Estoque de Gado ainda não está integrada
 * neste cálculo de Lucro Líquido — virá na Onda B junto da DRE.
 * Por ora, usa dto.cabecalho.resultadoPeriodo como aproximação.
 */
import type { FechamentoPeriodoDTO } from '@/v2/types/fechamentoPeriodo';

interface Props { dto: FechamentoPeriodoDTO }

function fmtMoeda(v: number | null | undefined): string {
  if (v == null || Number.isNaN(v)) return '—';
  const abs = Math.abs(v);
  if (abs >= 1_000_000) return `R$ ${(v/1_000_000).toLocaleString('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:2})} mi`;
  if (abs >= 1_000)     return `R$ ${(v/1_000).toLocaleString('pt-BR',{minimumFractionDigits:0,maximumFractionDigits:0})} mil`;
  return `R$ ${v.toLocaleString('pt-BR',{minimumFractionDigits:0,maximumFractionDigits:0})}`;
}

function fmtDelta(pct: number | null | undefined): { label: string; tone: 'good' | 'bad' | 'neutral' } {
  if (pct == null || Number.isNaN(pct)) return { label: '—', tone: 'neutral' };
  const sign = pct >= 0 ? '+' : '';
  return {
    label: `${sign}${pct.toFixed(1).replace('.', ',')}%`,
    tone: pct >= 0 ? 'good' : 'bad',
  };
}

export default function ResultadoDestaque({ dto }: Props) {
  const c = dto.cabecalho;
  const lucro = c.resultadoPeriodo;
  const receita = c.receitaPecuaria;
  const custeio = c.custeioPecuaria;
  const caixa = c.caixaFinal;

  const deltaLucro = fmtDelta(lucro?.desvioMetaPct);
  const deltaReceita = fmtDelta(receita?.desvioMetaPct);
  const deltaCusteio = fmtDelta(custeio?.desvioMetaPct);
  // Custeio: acima da meta = ruim, então invertemos o tom
  const deltaCusteioInv = {
    label: deltaCusteio.label,
    tone: deltaCusteio.tone === 'good' ? 'bad' : (deltaCusteio.tone === 'bad' ? 'good' : 'neutral'),
  } as const;

  return (
    <section className="fp-destaque">
      <style>{`
        .fp-destaque {
          --ink: #1F1B16;
          --ink-muted: #8A8076;
          --cream: #FAF7EE;
          --surface: #FFFFFF;
          --rule: rgba(31,27,22,0.08);
          --fire: #C84B2C;
          --warm: #D97B3F;
          --good: #2D7A3F;
          --bad:  #C8312A;
          background: var(--cream);
          padding: 56px 64px;
          font-family: 'Manrope', system-ui, sans-serif;
          color: var(--ink);
          page-break-after: always;
          break-after: page;
        }
        .fp-destaque__eyebrow {
          font-family: 'IBM Plex Mono', monospace;
          font-size: 11px;
          letter-spacing: 0.18em;
          text-transform: uppercase;
          color: var(--fire);
          margin: 0 0 12px;
          font-weight: 500;
        }
        .fp-destaque__hero {
          background: var(--surface);
          border-radius: 4px;
          padding: 48px 48px 56px;
          border: 1px solid var(--rule);
          margin-bottom: 24px;
          position: relative;
          overflow: hidden;
        }
        .fp-destaque__hero::before {
          content: '';
          position: absolute;
          top: 0; left: 0;
          width: 4px; height: 100%;
          background: var(--fire);
        }
        .fp-destaque__hero-label {
          font-size: 14px;
          font-weight: 600;
          color: var(--ink-muted);
          text-transform: uppercase;
          letter-spacing: 0.08em;
          margin: 0 0 24px;
        }
        .fp-destaque__hero-row {
          display: flex;
          align-items: baseline;
          gap: 24px;
          flex-wrap: wrap;
        }
        .fp-destaque__hero-valor {
          font-family: 'Fraunces', Georgia, serif;
          font-weight: 500;
          font-size: 64px;
          line-height: 1;
          letter-spacing: -0.02em;
          color: var(--ink);
          margin: 0;
        }
        .fp-destaque__badge {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          font-family: 'IBM Plex Mono', monospace;
          font-size: 14px;
          font-weight: 500;
          padding: 6px 14px;
          border-radius: 999px;
          background: transparent;
        }
        .fp-destaque__badge--good {
          color: var(--good);
          background: rgba(45,122,63,0.08);
        }
        .fp-destaque__badge--bad {
          color: var(--bad);
          background: rgba(200,49,42,0.08);
        }
        .fp-destaque__badge--neutral {
          color: var(--ink-muted);
          background: rgba(0,0,0,0.04);
        }
        .fp-destaque__nota {
          font-size: 12px;
          color: var(--ink-muted);
          margin: 28px 0 0;
          font-style: italic;
          line-height: 1.5;
          max-width: 580px;
        }
        .fp-destaque__grid {
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          gap: 16px;
        }
        .fp-destaque__card {
          background: var(--surface);
          border: 1px solid var(--rule);
          border-radius: 4px;
          padding: 28px 28px 32px;
        }
        .fp-destaque__card-label {
          font-family: 'IBM Plex Mono', monospace;
          font-size: 10px;
          letter-spacing: 0.16em;
          text-transform: uppercase;
          color: var(--ink-muted);
          margin: 0 0 16px;
          font-weight: 500;
        }
        .fp-destaque__card-valor {
          font-family: 'Fraunces', Georgia, serif;
          font-weight: 500;
          font-size: 32px;
          line-height: 1.1;
          letter-spacing: -0.015em;
          color: var(--ink);
          margin: 0 0 12px;
        }
        @media print {
          .fp-destaque { min-height: 100vh; }
        }
      `}</style>

      <p className="fp-destaque__eyebrow">Resultado em Destaque</p>

      <div className="fp-destaque__hero">
        <h3 className="fp-destaque__hero-label">Lucro Líquido do Período</h3>
        <div className="fp-destaque__hero-row">
          <p className="fp-destaque__hero-valor">{fmtMoeda(lucro?.realizado)}</p>
          <span className={`fp-destaque__badge fp-destaque__badge--${deltaLucro.tone}`}>
            {deltaLucro.label} vs Meta
          </span>
        </div>
        <p className="fp-destaque__nota">
          * Cálculo atual baseado em Receita − Custos − Investimentos − Juros.
          A <strong>Variação do Estoque de Gado</strong> (valor patrimonial P2)
          será incorporada na próxima entrega, junto da DRE completa.
        </p>
      </div>

      <div className="fp-destaque__grid">
        <div className="fp-destaque__card">
          <p className="fp-destaque__card-label">Receita Pecuária</p>
          <p className="fp-destaque__card-valor">{fmtMoeda(receita?.realizado)}</p>
          <span className={`fp-destaque__badge fp-destaque__badge--${deltaReceita.tone}`}>
            {deltaReceita.label} vs Meta
          </span>
        </div>
        <div className="fp-destaque__card">
          <p className="fp-destaque__card-label">Custeio de Produção</p>
          <p className="fp-destaque__card-valor">{fmtMoeda(custeio?.realizado)}</p>
          <span className={`fp-destaque__badge fp-destaque__badge--${deltaCusteioInv.tone}`}>
            {deltaCusteioInv.label} vs Meta
          </span>
        </div>
        <div className="fp-destaque__card">
          <p className="fp-destaque__card-label">Caixa Final do Período</p>
          <p className="fp-destaque__card-valor">{fmtMoeda(caixa?.realizado)}</p>
          <span className="fp-destaque__badge fp-destaque__badge--neutral">
            Posição encerramento
          </span>
        </div>
      </div>
    </section>
  );
}
