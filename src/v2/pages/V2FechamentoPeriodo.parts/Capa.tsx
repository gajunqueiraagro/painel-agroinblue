/**
 * Capa Executiva — Página 1 do Fechamento do Período (Marco 2.5 Fase 3).
 *
 * Narrativa macro limpa: 9 bullets textuais com Total + breakdown Pec/Agri.
 * Sem comparativos vs META aqui — comparativos vivem nos cards/blocos abaixo.
 *
 * Filosofia de fonte:
 *   - Áreas e indicadores financeiros/zoot: painel.<X>Indicador (PC-100 soberano).
 *   - Caixa Final: c.caixaFinal.realizado (DTO Fechamento — fluxo oficial).
 *   - Rebanho médio: painel.cabecasIndicador.valor (média Jan→mesAlvo).
 *   - Rebanho final: dto.movRebanho.resumo.cabecasFinal (fonte oficial do
 *     builder Fechamento; sem cálculo paralelo).
 *
 * NÃO existe receitaAgriIndicador no PC-100 — bullet "Receita Total Caixa"
 * renderiza como "100% Pec" via modo soPec do helper de breakdown.
 */

import logo from '@/assets/logo.png';
import type { FechamentoPeriodoDTO } from '@/v2/types/fechamentoPeriodo';
import type { PainelConsultorDataResult } from '@/hooks/usePainelConsultorData';
import { fmt, formatarPeriodo } from './fmt';

interface Props {
  dto: FechamentoPeriodoDTO;
  nomeCliente?: string;
  nomeFazenda?: string;
  /** PC-100 — fonte soberana dos bullets financeiros/zoot/áreas. */
  painel: PainelConsultorDataResult | null;
}

// ─── Helpers locais de formatação ───────────────────────────────────

function fmtMoedaCurto(v: number | null | undefined): string {
  if (v == null || !Number.isFinite(v)) return '—';
  const abs = Math.abs(v);
  if (abs >= 1e9) return `R$ ${(v / 1e9).toFixed(1).replace('.', ',')}B`;
  if (abs >= 1e6) return `R$ ${(v / 1e6).toFixed(1).replace('.', ',')}M`;
  if (abs >= 1e3) return `R$ ${(v / 1e3).toFixed(0)}K`;
  return `R$ ${fmt(v)}`;
}

// ─── Escopo Pec/Agri (texto da metadata) ─────────────────────────────

function derivarEscopo(painel: PainelConsultorDataResult | null): string {
  const pec = painel?.areaPecuariaRealMes ?? 0;
  const agri = painel?.areaAgriculturaRealMes ?? 0;
  return (
    [pec > 0 && 'Pecuária', agri > 0 && 'Agricultura'].filter(Boolean).join(' + ') ||
    'Pecuária'
  );
}

// ─── Área Produtiva + breakdown ─────────────────────────────────────

function derivarAreaProdutiva(painel: PainelConsultorDataResult | null): {
  total: number | null;
  pctPec: number | null;
  pctAgri: number | null;
} {
  const total = painel?.areaProdutivaRealMes ?? null;
  const pec = painel?.areaPecuariaRealMes ?? null;
  const agri = painel?.areaAgriculturaRealMes ?? null;
  if (total == null || total <= 0 || pec == null || agri == null) {
    return { total, pctPec: null, pctAgri: null };
  }
  const denom = pec + agri;
  if (denom <= 0) return { total, pctPec: null, pctAgri: null };
  return {
    total,
    pctPec: (pec / denom) * 100,
    pctAgri: (agri / denom) * 100,
  };
}

// ─── Breakdown Pec/Agri genérico (Receita, Custeio, Inv, Juros) ─────

type BreakdownModo = 'ambos' | 'soPec' | 'soAgri' | 'vazio';

function calcBreakdownPecAgri(
  valorPec: number | null | undefined,
  valorAgri: number | null | undefined,
): { total: number | null; pctPec: number | null; pctAgri: number | null; modo: BreakdownModo } {
  const pec = valorPec != null && Number.isFinite(valorPec) ? valorPec : 0;
  const agri = valorAgri != null && Number.isFinite(valorAgri) ? valorAgri : 0;
  const total = pec + agri;
  if (total === 0) return { total: null, pctPec: null, pctAgri: null, modo: 'vazio' };
  if (pec > 0 && agri > 0) {
    const pctPec = Math.round((pec / total) * 100);
    const pctAgri = 100 - pctPec;
    return { total, pctPec, pctAgri, modo: 'ambos' };
  }
  if (pec > 0) return { total, pctPec: 100, pctAgri: 0, modo: 'soPec' };
  if (agri > 0) return { total, pctPec: 0, pctAgri: 100, modo: 'soAgri' };
  return { total: null, pctPec: null, pctAgri: null, modo: 'vazio' };
}

// Sub-componente: texto do parêntese de breakdown (font menor + muted).
function BreakdownPctSpan({ modo, pctPec, pctAgri }: {
  modo: BreakdownModo;
  pctPec: number | null;
  pctAgri: number | null;
}) {
  if (modo === 'vazio') return null;
  if (modo === 'soPec') return <span className="text-xs text-muted-foreground"> (100% Pec)</span>;
  if (modo === 'soAgri') return <span className="text-xs text-muted-foreground"> (100% Agri)</span>;
  return <span className="text-xs text-muted-foreground"> ({pctPec}% Pec • {pctAgri}% Agri)</span>;
}

// ─── Rebanho composto (médio + final) ───────────────────────────────

function derivarRebanho(
  painel: PainelConsultorDataResult | null,
  dto: FechamentoPeriodoDTO,
): { medio: number | null; final: number | null } {
  const medioRaw = painel?.cabecasIndicador?.valor;
  const medio = medioRaw != null && Number.isFinite(medioRaw) ? medioRaw : null;
  // dto.movRebanho.resumo.cabecasFinal — fonte oficial buildFechamentoPeriodoData
  // (L1208: agFinal?.cabecas via agregaRebanhoMes). Sem cálculo paralelo.
  const finalRaw = dto.movRebanho?.resumo?.cabecasFinal;
  const final = finalRaw != null && Number.isFinite(finalRaw) ? finalRaw : null;
  return { medio, final };
}

// ─── Componente principal ───────────────────────────────────────────

export default function Capa({ dto, nomeCliente, nomeFazenda, painel }: Props) {
  const c = dto.cabecalho;
  const escopoTexto = derivarEscopo(painel);
  const area = derivarAreaProdutiva(painel);
  const rebanho = derivarRebanho(painel, dto);

  // PC-100 soberano — Pec
  const receitaPec = painel?.receitaPecIndicador?.valor;
  const custeioPec = painel?.custeioPecIndicador?.valor;
  const investPec  = painel?.investPecIndicador?.valor;
  const jurosPec   = painel?.jurosPecIndicador?.valor;
  const arrobas    = painel?.arrobasIndicador?.valor;
  const gmd        = painel?.gmdIndicador?.valor;

  // PC-100 soberano — Agri (não existe receitaAgriIndicador; só custos).
  // TODO: adicionar breakdown Agri em Receita Total Caixa quando PC-100
  // expor receitaAgriIndicador.
  const custeioAgri = painel?.custeioAgriIndicador?.valor;
  const investAgri  = painel?.investAgriIndicador?.valor;
  const jurosAgri   = painel?.jurosAgriIndicador?.valor;

  // Breakdowns por bullet
  const breakReceita = calcBreakdownPecAgri(receitaPec, null); // sem Agri
  const breakCusteio = calcBreakdownPecAgri(custeioPec, custeioAgri);
  const breakInvest  = calcBreakdownPecAgri(investPec, investAgri);
  const breakJuros   = calcBreakdownPecAgri(jurosPec, jurosAgri);

  return (
    <section className="pagina-fechamento bg-card border border-border rounded-lg p-4 mb-4">
      {/* LINHA 1 — Metadata + logo */}
      <header className="flex items-center justify-between gap-3 mb-3 pb-2 border-b border-border">
        <div className="text-xs text-muted-foreground truncate">
          <span className="font-semibold text-foreground">{nomeCliente ?? '—'}</span>
          {nomeFazenda && <> • <span className="font-semibold text-foreground">{nomeFazenda}</span></>}
          {' • '}{formatarPeriodo(dto.periodoInicio, dto.periodoFim)}
          {' • '}{escopoTexto}
        </div>
        <img src={logo} alt="Agroinblue" className="h-8 shrink-0" />
      </header>

      {/* LINHA 2 — Resumo Executivo (9 bullets, sem % vs META).
          TODO: reativar Entradas/Saídas Financeiras totais quando DTO ganhar
          gridMetaConsolidado (hoje useFechamentoPeriodoData usa
          planFin.buildGrid() base, sem extras). */}
      <div>
        <h3 className="text-xs font-bold uppercase tracking-wider text-foreground/70 mb-1.5">
          Resumo Executivo
        </h3>
        <ul className="text-sm text-foreground space-y-1 leading-snug">
          {/* 1. Área Produtiva */}
          <li>
            Área Produtiva: <strong className="font-semibold">{area.total != null ? `${fmt(area.total, 0)} ha` : '—'}</strong>
            {area.pctPec !== null && area.pctAgri !== null && (
              <span className="text-xs text-muted-foreground"> ({Math.round(area.pctPec)}% Pec • {Math.round(area.pctAgri)}% Agri)</span>
            )}
          </li>
          {/* 2. Rebanho (médio + final) */}
          <li>
            Rebanho:{' '}
            médio: <strong className="font-semibold">{rebanho.medio != null ? `${fmt(rebanho.medio, 0)} cab` : '—'}</strong>
            <span className="text-xs text-muted-foreground"> | </span>
            final: <strong className="font-semibold">{rebanho.final != null ? `${fmt(rebanho.final, 0)} cab` : '—'}</strong>
          </li>
          {/* 3. Caixa Final (sem breakdown, sem delta) */}
          <li>
            Caixa Final: <strong className="font-semibold">{fmtMoedaCurto(c.caixaFinal.realizado)}</strong>
          </li>
          {/* 4. Receita Total Caixa */}
          <li>
            Receita Total Caixa: <strong className="font-semibold">{fmtMoedaCurto(breakReceita.total)}</strong>
            <BreakdownPctSpan modo={breakReceita.modo} pctPec={breakReceita.pctPec} pctAgri={breakReceita.pctAgri} />
          </li>
          {/* 5. Custeio Produção */}
          <li>
            Custeio Produção: <strong className="font-semibold">{fmtMoedaCurto(breakCusteio.total)}</strong>
            <BreakdownPctSpan modo={breakCusteio.modo} pctPec={breakCusteio.pctPec} pctAgri={breakCusteio.pctAgri} />
          </li>
          {/* 6. Investimentos Fazenda */}
          <li>
            Investimentos Fazenda: <strong className="font-semibold">{fmtMoedaCurto(breakInvest.total)}</strong>
            <BreakdownPctSpan modo={breakInvest.modo} pctPec={breakInvest.pctPec} pctAgri={breakInvest.pctAgri} />
          </li>
          {/* 7. Juros Financiamento */}
          <li>
            Juros Financiamento: <strong className="font-semibold">{fmtMoedaCurto(breakJuros.total)}</strong>
            <BreakdownPctSpan modo={breakJuros.modo} pctPec={breakJuros.pctPec} pctAgri={breakJuros.pctAgri} />
          </li>
          {/* 8. Arrobas Produzidas (sem breakdown) */}
          <li>
            Arrobas Produzidas: <strong className="font-semibold">{arrobas != null ? `${fmt(arrobas)} @` : '—'}</strong>
          </li>
          {/* 9. GMD médio (sem breakdown) */}
          <li>
            GMD médio: <strong className="font-semibold">{gmd != null ? `${fmt(gmd, 3)} kg/dia` : '—'}</strong>
          </li>
        </ul>
      </div>
    </section>
  );
}
