/**
 * Capa Executiva — Página 1 do Fechamento do Período (Marco 2.5).
 *
 * 2 linhas: metadata 1-line + Resumo Executivo em bullets textuais.
 * Sem cards/grid — texto narrativo executivo. Sem insight automático.
 *
 * REGRA DE FONTES (auditoria pré-implementação):
 *   - Caixa Final → c.caixaFinal.realizado (DTO Fechamento — fluxo oficial),
 *     SEM comparativo vs META (Meta caixa não é soberana neste contexto).
 *   - Demais bullets → painel.<X>Indicador (PC-100 em viewMode='periodo'),
 *     fonte soberana com Meta correta. Substituem c.* do DTO que usava
 *     planFin.buildGrid() BASE (sem extras), gerando deltas inflados
 *     (ex: Receita Pec +287% antes do fix, agora −38% correto).
 *
 * "Resultado do período" foi removido: cálculo Receita Op − Desembolso Pec
 * não interpretável nessa camada — usuário consulta DRE para resultado.
 */

import logo from '@/assets/logo.png';
import type { FechamentoPeriodoDTO } from '@/v2/types/fechamentoPeriodo';
import type { PainelConsultorDataResult } from '@/hooks/usePainelConsultorData';
import { fmt, formatarPeriodo } from './fmt';

interface Props {
  dto: FechamentoPeriodoDTO;
  nomeCliente?: string;
  nomeFazenda?: string;
  /** PC-100 — fonte soberana dos bullets (Receita/Custeio/Inv/Juros/Arrobas/
   *  GMD) e do escopo "Pecuária + Agricultura" na metadata. */
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

function fmtDeltaMeta(d: number | null | undefined): string {
  if (d == null || !Number.isFinite(d)) return '(— vs META)';
  const sign = d > 0 ? '+' : '';
  return `(${sign}${Math.round(d)}% vs META)`;
}

// ─── Escopo Pec/Agri derivado de PC-100 ─────────────────────────────

function derivarEscopo(painel: PainelConsultorDataResult | null): string {
  const pec = painel?.areaPecuariaRealMes ?? 0;
  const agri = painel?.areaAgriculturaRealMes ?? 0;
  return (
    [pec > 0 && 'Pecuária', agri > 0 && 'Agricultura'].filter(Boolean).join(' + ') ||
    'Pecuária'
  );
}

// ─── Área Produtiva + breakdown Pec/Agri ────────────────────────────

function derivarAreaProdutiva(painel: PainelConsultorDataResult | null): {
  total: number | null;
  pctPec: number | null;
  pctAgri: number | null;
} {
  const total = painel?.areaProdutivaRealMes ?? null;
  const pec = painel?.areaPecuariaRealMes ?? null;
  const agri = painel?.areaAgriculturaRealMes ?? null;
  // Breakdown só faz sentido se as 3 estão disponíveis e total > 0.
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

// ─── Componente principal ───────────────────────────────────────────

export default function Capa({ dto, nomeCliente, nomeFazenda, painel }: Props) {
  const c = dto.cabecalho;
  const escopoTexto = derivarEscopo(painel);
  const area = derivarAreaProdutiva(painel);

  // PC-100 soberano — substitui c.* do DTO (que usa planFin.buildGrid() BASE,
  // sem extras lancamentosRebanho/Financiamento/Nutricao/Projetos).
  const receitaPec     = painel?.receitaPecIndicador;
  const custeioPec     = painel?.custeioPecIndicador;
  const investPec      = painel?.investPecIndicador;
  const jurosPec       = painel?.jurosPecIndicador;
  const arrobas        = painel?.arrobasIndicador;
  const gmd            = painel?.gmdIndicador;

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

      {/* LINHA 2 — Resumo Executivo em bullets textuais.
          TODO: reativar Entradas/Saídas Financeiras na Capa quando DTO ganhar
          gridMetaConsolidado (hoje useFechamentoPeriodoData usa
          planFin.buildGrid() base, sem extras — Meta subestimada). */}
      <div>
        <h3 className="text-xs font-bold uppercase tracking-wider text-foreground/70 mb-1.5">
          Resumo Executivo
        </h3>
        <ul className="text-sm text-foreground space-y-1 leading-snug">
          <li>
            Área Produtiva: <strong className="font-semibold">{area.total != null ? `${fmt(area.total, 0)} ha` : '—'}</strong>
            {area.pctPec !== null && area.pctAgri !== null && (
              <span className="text-muted-foreground"> ({Math.round(area.pctPec)}% Pecuária • {Math.round(area.pctAgri)}% Agricultura)</span>
            )}
            {/* Sem breakdown → omitir parêntese; sem total → "—". Área é
                estrutural, sem comparativo vs META. TODO: expor breakdown
                quando areaPec/areaAgri estiverem indisponíveis em modo Global
                + P1 incompleto (hoje cai em "—"). */}
          </li>
          <li>
            Caixa final: <strong className="font-semibold">{fmtMoedaCurto(c.caixaFinal.realizado)}</strong>
          </li>
          <li>
            Receita Pecuária: <strong className="font-semibold">{fmtMoedaCurto(receitaPec?.valor)}</strong>
            <span className="text-muted-foreground"> {fmtDeltaMeta(receitaPec?.deltaMeta)}</span>
          </li>
          <li>
            Custeio Produção Pecuária: <strong className="font-semibold">{fmtMoedaCurto(custeioPec?.valor)}</strong>
            <span className="text-muted-foreground"> {fmtDeltaMeta(custeioPec?.deltaMeta)}</span>
          </li>
          <li>
            Investimentos Fazenda Pecuária: <strong className="font-semibold">{fmtMoedaCurto(investPec?.valor)}</strong>
            <span className="text-muted-foreground"> {fmtDeltaMeta(investPec?.deltaMeta)}</span>
          </li>
          <li>
            Juros Financiamento Pecuária: <strong className="font-semibold">{fmtMoedaCurto(jurosPec?.valor)}</strong>
            <span className="text-muted-foreground"> {fmtDeltaMeta(jurosPec?.deltaMeta)}</span>
          </li>
          <li>
            Arrobas Produzidas: <strong className="font-semibold">{arrobas?.valor != null ? `${fmt(arrobas.valor)} @` : '—'}</strong>
            <span className="text-muted-foreground"> {fmtDeltaMeta(arrobas?.deltaMeta)}</span>
          </li>
          <li>
            GMD médio: <strong className="font-semibold">{gmd?.valor != null ? `${fmt(gmd.valor, 3)} kg/dia` : '—'}</strong>
            <span className="text-muted-foreground"> {fmtDeltaMeta(gmd?.deltaMeta)}</span>
          </li>
        </ul>
      </div>
    </section>
  );
}
