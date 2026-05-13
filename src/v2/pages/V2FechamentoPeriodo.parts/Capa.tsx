/**
 * Capa — Cabeçalho editorial do Fechamento do Período
 * Refeita em V2 Onda A: identidade visual nova (paleta + tipografia).
 */
import type { FechamentoPeriodoDTO } from '@/v2/types/fechamentoPeriodo';
import { formatarPeriodo } from './fmt';

interface Props {
  dto: FechamentoPeriodoDTO;
  nomeCliente?: string;
  nomeFazenda?: string;
}

export default function Capa({ dto, nomeCliente, nomeFazenda }: Props) {
  const dataGeracao = new Date(dto.geradoEm).toLocaleDateString('pt-BR', {
    day: '2-digit', month: 'long', year: 'numeric',
  });
  const escopo = nomeFazenda ?? 'Global';

  return (
    <section className="fp-capa">
      <style>{`
        .fp-capa {
          --ink: #1F1B16;
          --ink-muted: #8A8076;
          --cream: #FAF7EE;
          --rule: rgba(31,27,22,0.10);
          --fire: #C84B2C;
          background: var(--cream);
          color: var(--ink);
          padding: 72px 64px 56px;
          font-family: 'Manrope', system-ui, sans-serif;
          page-break-after: always;
          break-after: page;
        }
        .fp-capa__eyebrow {
          font-family: 'IBM Plex Mono', monospace;
          font-size: 11px;
          letter-spacing: 0.18em;
          text-transform: uppercase;
          color: var(--fire);
          margin: 0 0 32px;
          font-weight: 500;
        }
        .fp-capa__cliente {
          font-family: 'Fraunces', Georgia, serif;
          font-weight: 500;
          font-size: 56px;
          line-height: 1.05;
          letter-spacing: -0.02em;
          margin: 0 0 24px;
          color: var(--ink);
        }
        .fp-capa__sub {
          font-size: 18px;
          font-weight: 500;
          color: var(--ink);
          margin: 0 0 4px;
        }
        .fp-capa__sub strong { font-weight: 700; }
        .fp-capa__rule {
          height: 1px;
          background: var(--rule);
          margin: 32px 0 16px;
        }
        .fp-capa__footer {
          display: flex;
          justify-content: space-between;
          align-items: baseline;
          font-family: 'IBM Plex Mono', monospace;
          font-size: 11px;
          letter-spacing: 0.08em;
          color: var(--ink-muted);
          text-transform: uppercase;
        }
        @media print {
          .fp-capa { min-height: 100vh; }
        }
      `}</style>

      <p className="fp-capa__eyebrow">Fechamento do Período</p>

      <h1 className="fp-capa__cliente">{nomeCliente ?? '—'}</h1>

      <p className="fp-capa__sub">
        <strong>{formatarPeriodo(dto.periodoInicio, dto.periodoFim)}</strong>
        {' · '}
        Modo <strong>{escopo}</strong>
      </p>

      <div className="fp-capa__rule" />

      <div className="fp-capa__footer">
        <span>Emitido em {dataGeracao}</span>
        <span>Agroinblue · Gestão Rural</span>
      </div>
    </section>
  );
}
