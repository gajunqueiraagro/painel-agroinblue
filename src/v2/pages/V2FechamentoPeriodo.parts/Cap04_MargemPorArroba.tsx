/**
 * Cap 04 — "Está vendendo mais caro do que produz?"
 *
 * Capítulo 4 do storytelling de fechamento. Mobile-first.
 * Resposta heroica = margem por arroba (preço médio − custo @).
 * Padrão visual a ser replicado nos outros 7 capítulos.
 *
 * Paths do DTO consumidos:
 *   - dto.analisePecuaria.precoMedioArroba.comparativo  → preço R$/@
 *   - dto.cabecalho.custoRsArroba                       → custo R$/@
 *   - dto.cabecalho.margemRsArroba                      → margem R$/@ (já calculada)
 */
import { useState } from 'react';
import type { FechamentoPeriodoDTO } from '@/v2/types/fechamentoPeriodo';

interface Props { dto: FechamentoPeriodoDTO }

function fmtR(v: number | null | undefined, decimals = 2): string {
  if (v == null || Number.isNaN(v)) return '—';
  return `R$ ${v.toLocaleString('pt-BR', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  })}`;
}

function fmtSinal(v: number | null | undefined): string {
  if (v == null || Number.isNaN(v)) return '—';
  const s = v >= 0 ? '+' : '';
  return `${s}${v.toLocaleString('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:2})}`;
}

export default function Cap04_MargemPorArroba({ dto }: Props) {
  const [aberto, setAberto] = useState(false);

  // Paths reais do DTO — tipados via FechamentoPeriodoDTO (Comparativo)
  const preco = dto.analisePecuaria.precoMedioArroba.comparativo;
  const custo = dto.cabecalho.custoRsArroba;
  const margemCmp = dto.cabecalho.margemRsArroba;

  const precoR = preco.realizado;
  const custoR = custo.realizado;
  // Margem realizada vem direto do DTO (calculada pelo builder)
  const margem = margemCmp.realizado;

  // Margem ano anterior — preferir o pré-calculado; fallback manual se null
  const precoA = preco.anoAnterior;
  const custoA = custo.anoAnterior;
  const margemA = margemCmp.anoAnterior
    ?? ((precoA != null && custoA != null) ? precoA - custoA : null);

  // Margem meta para a tabela detalhada
  const margemMeta = margemCmp.meta
    ?? ((preco.meta != null && custo.meta != null) ? preco.meta - custo.meta : null);

  const deltaMargem = (margem != null && margemA != null) ? margem - margemA : null;

  // Largura proporcional das barras (0–100%)
  const maxRef = Math.max(precoR ?? 0, custoR ?? 0, 1);
  const wCusto = custoR != null ? (custoR / maxRef) * 100 : 0;
  const wPreco = precoR != null ? (precoR / maxRef) * 100 : 0;

  return (
    <section className="cap04">
      <style>{`
        .cap04 {
          --ink: #1F1B16;
          --muted: #8A8076;
          --surface: #FAFAF8;
          --card: #FFFFFF;
          --rule: rgba(31,27,22,0.08);
          --accent: #C84B2C;
          --good: #2D7A3F;
          --good-soft: rgba(45,122,63,0.10);
          --bad: #C8312A;
          --bad-soft: rgba(200,49,42,0.10);
          background: var(--surface);
          color: var(--ink);
          font-family: 'Plus Jakarta Sans', system-ui, sans-serif;
          padding: 48px 24px 56px;
          page-break-after: always;
          break-after: page;
        }
        .cap04__inner {
          max-width: 520px;
          margin: 0 auto;
        }
        .cap04__eyebrow {
          font-family: 'JetBrains Mono', monospace;
          font-size: 11px;
          letter-spacing: 0.16em;
          text-transform: uppercase;
          color: var(--accent);
          margin: 0 0 16px;
          font-weight: 500;
        }
        .cap04__pergunta {
          font-family: 'Plus Jakarta Sans', sans-serif;
          font-weight: 700;
          font-size: 30px;
          line-height: 1.22;
          letter-spacing: -0.015em;
          color: var(--ink);
          margin: 0 0 40px;
        }
        .cap04__hero {
          display: flex;
          align-items: baseline;
          gap: 10px;
          margin: 0 0 8px;
        }
        .cap04__hero-valor {
          font-family: 'JetBrains Mono', monospace;
          font-variant-numeric: tabular-nums;
          font-size: 56px;
          font-weight: 600;
          line-height: 1;
          letter-spacing: -0.02em;
          color: var(--ink);
          margin: 0;
        }
        .cap04__hero-unit {
          font-family: 'Plus Jakarta Sans', sans-serif;
          font-size: 18px;
          font-weight: 500;
          color: var(--muted);
        }
        .cap04__hero-legenda {
          font-size: 14px;
          color: var(--muted);
          margin: 0 0 12px;
        }
        .cap04__delta {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          font-family: 'JetBrains Mono', monospace;
          font-size: 12px;
          font-weight: 500;
          padding: 4px 10px;
          border-radius: 999px;
        }
        .cap04__delta--good { color: var(--good); background: var(--good-soft); }
        .cap04__delta--bad  { color: var(--bad);  background: var(--bad-soft); }
        .cap04__delta--neutral { color: var(--muted); background: rgba(0,0,0,0.04); }
        .cap04__rule {
          height: 1px;
          background: var(--rule);
          margin: 36px 0;
          border: 0;
        }
        .cap04__didatica {
          font-size: 16px;
          line-height: 1.55;
          color: var(--ink);
          margin: 0 0 32px;
        }
        .cap04__didatica strong {
          color: var(--accent);
          font-weight: 600;
        }
        .cap04__bars {
          display: flex;
          flex-direction: column;
          gap: 18px;
          margin: 0 0 36px;
        }
        .cap04__bar {
          display: flex;
          flex-direction: column;
          gap: 8px;
        }
        .cap04__bar-head {
          display: flex;
          justify-content: space-between;
          align-items: baseline;
        }
        .cap04__bar-label {
          font-family: 'JetBrains Mono', monospace;
          font-size: 11px;
          letter-spacing: 0.14em;
          text-transform: uppercase;
          color: var(--muted);
          font-weight: 500;
        }
        .cap04__bar-valor {
          font-family: 'JetBrains Mono', monospace;
          font-variant-numeric: tabular-nums;
          font-size: 15px;
          font-weight: 600;
          color: var(--ink);
        }
        .cap04__bar-track {
          height: 12px;
          background: rgba(31,27,22,0.05);
          border-radius: 2px;
          overflow: hidden;
        }
        .cap04__bar-fill {
          height: 100%;
          transition: width 0.6s ease;
        }
        .cap04__bar-fill--custo { background: var(--ink); opacity: 0.7; }
        .cap04__bar-fill--preco { background: var(--accent); }
        .cap04__details {
          margin-top: 8px;
          border-top: 1px solid var(--rule);
          padding-top: 20px;
        }
        .cap04__details-summary {
          font-family: 'JetBrains Mono', monospace;
          font-size: 11px;
          letter-spacing: 0.16em;
          text-transform: uppercase;
          color: var(--muted);
          font-weight: 500;
          cursor: pointer;
          list-style: none;
          display: flex;
          align-items: center;
          gap: 8px;
          user-select: none;
        }
        .cap04__details-summary::-webkit-details-marker { display: none; }
        .cap04__details-summary::after {
          content: '+';
          font-size: 14px;
          color: var(--muted);
          margin-left: auto;
          transition: transform 0.2s ease;
        }
        .cap04__details[open] .cap04__details-summary::after {
          content: '−';
        }
        .cap04__tabela {
          margin-top: 18px;
          width: 100%;
          border-collapse: collapse;
          font-size: 13px;
        }
        .cap04__tabela th, .cap04__tabela td {
          padding: 10px 0;
          text-align: right;
          font-variant-numeric: tabular-nums;
          font-family: 'JetBrains Mono', monospace;
        }
        .cap04__tabela th:first-child, .cap04__tabela td:first-child {
          text-align: left;
          font-family: 'Plus Jakarta Sans', sans-serif;
          color: var(--ink);
          font-weight: 500;
        }
        .cap04__tabela th {
          font-family: 'JetBrains Mono', monospace;
          font-size: 10px;
          letter-spacing: 0.14em;
          text-transform: uppercase;
          color: var(--muted);
          font-weight: 500;
          border-bottom: 1px solid var(--rule);
          padding-bottom: 12px;
        }
        .cap04__tabela td {
          border-bottom: 1px solid var(--rule);
          color: var(--ink);
        }
        .cap04__tabela tr:last-child td { border-bottom: 0; }

        @media (min-width: 720px) {
          .cap04 { padding: 64px 32px 72px; }
          .cap04__pergunta { font-size: 38px; }
          .cap04__hero-valor { font-size: 72px; }
        }
        @media print {
          .cap04 { min-height: 100vh; }
          .cap04__details[open] .cap04__details-summary::after { content: ''; }
        }
      `}</style>

      <div className="cap04__inner">
        <p className="cap04__eyebrow">Cap 04 de 08</p>
        <h2 className="cap04__pergunta">
          Está vendendo mais caro<br/>do que produz?
        </h2>

        <div className="cap04__hero">
          <p className="cap04__hero-valor">{fmtR(margem)}</p>
          <span className="cap04__hero-unit">/ arroba</span>
        </div>
        <p className="cap04__hero-legenda">Margem por arroba — sobra antes dos gastos fixos</p>

        {deltaMargem != null && (
          <span className={`cap04__delta cap04__delta--${deltaMargem >= 0 ? 'good' : 'bad'}`}>
            {fmtSinal(deltaMargem)} vs ano passado
          </span>
        )}

        <hr className="cap04__rule" />

        <p className="cap04__didatica">
          Cada arroba sai por <strong>{fmtR(custoR)}</strong> para produzir
          {' '}e é vendida por <strong>{fmtR(precoR)}</strong>.
          A diferença é o que sobra antes dos gastos fixos da fazenda,
          dos juros e dos investimentos.
        </p>

        <div className="cap04__bars">
          <div className="cap04__bar">
            <div className="cap04__bar-head">
              <span className="cap04__bar-label">Custo por @ produzida</span>
              <span className="cap04__bar-valor">{fmtR(custoR)}</span>
            </div>
            <div className="cap04__bar-track">
              <div className="cap04__bar-fill cap04__bar-fill--custo" style={{ width: `${wCusto}%` }} />
            </div>
          </div>

          <div className="cap04__bar">
            <div className="cap04__bar-head">
              <span className="cap04__bar-label">Preço médio de venda @</span>
              <span className="cap04__bar-valor">{fmtR(precoR)}</span>
            </div>
            <div className="cap04__bar-track">
              <div className="cap04__bar-fill cap04__bar-fill--preco" style={{ width: `${wPreco}%` }} />
            </div>
          </div>
        </div>

        <details
          className="cap04__details"
          open={aberto}
          onToggle={(e) => setAberto((e.target as HTMLDetailsElement).open)}
        >
          <summary className="cap04__details-summary">
            Para o gestor — números detalhados
          </summary>
          <table className="cap04__tabela">
            <thead>
              <tr>
                <th>Indicador</th>
                <th>Realizado</th>
                <th>Meta</th>
                <th>Ano Ant.</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>Preço médio @</td>
                <td>{fmtR(preco.realizado)}</td>
                <td>{fmtR(preco.meta)}</td>
                <td>{fmtR(preco.anoAnterior)}</td>
              </tr>
              <tr>
                <td>Custo @ produzida</td>
                <td>{fmtR(custo.realizado)}</td>
                <td>{fmtR(custo.meta)}</td>
                <td>{fmtR(custo.anoAnterior)}</td>
              </tr>
              <tr>
                <td>Margem por @</td>
                <td>{fmtR(margem)}</td>
                <td>{fmtR(margemMeta)}</td>
                <td>{fmtR(margemA)}</td>
              </tr>
            </tbody>
          </table>
        </details>
      </div>
    </section>
  );
}
