/**
 * Capa Executiva Macro — Página 1 do Fechamento do Período (Marco 2.5).
 *
 * 3 linhas (~210px total): metadata 1-line + 8 cards macro + insight automático.
 * Frases determinísticas (sem IA, sem semáforo). Cards via CardComparativo
 * (densidade='compacta') para os 5 que têm comparativo vs Meta + 3 simples
 * para os derivados de Área/Composição.
 */

import logo from '@/assets/logo.png';
import { CardComparativo } from '@/v2/components/CardComparativo';
import type { ComparativoDuplo } from '@/v2/lib/planejamentoVisaoGeralTypes';
import type { Comparativo, FechamentoPeriodoDTO } from '@/v2/types/fechamentoPeriodo';
import type { PainelConsultorDataResult } from '@/hooks/usePainelConsultorData';
import { fmt, formatarPeriodo } from './fmt';

interface Props {
  dto: FechamentoPeriodoDTO;
  nomeCliente?: string;
  nomeFazenda?: string;
  /** PC-100 do Fechamento — fornece Áreas Pec/Agri/Produtiva + Valor Rebanho.
   *  Sem queries novas: zero acoplamento adicional. */
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

function fmtMoedaArroba(v: number | null | undefined): string {
  if (v == null || !Number.isFinite(v)) return '—';
  return `R$ ${fmt(v, 0)}/@`;
}

// ─── Insight executivo (função pura) ────────────────────────────────

function gerarInsightExecutivo(dto: FechamentoPeriodoDTO): string {
  const c = dto.cabecalho;
  const partes: string[] = [];

  // Frase 1 — Resultado
  const resPct = c.resultadoPeriodo.desvioMetaPct;
  if (resPct !== null && Number.isFinite(resPct)) {
    if (resPct >= 10) partes.push(`Período fechou **+${Math.round(resPct)}% vs Meta**`);
    else if (resPct <= -10) partes.push(`Período fechou **${Math.round(resPct)}% vs Meta**`);
    else partes.push(`Período **alinhado à Meta**`);
  } else {
    partes.push(`Período em curso`);
  }

  // Frase 2 — Receita
  if (c.receitaPecuaria.realizado != null) {
    partes.push(`receita pec **${fmtMoedaCurto(c.receitaPecuaria.realizado)}**`);
  }

  // Frase 3 — Custos
  const custPct = c.custeioPecuaria.desvioMetaPct;
  if (custPct !== null && Number.isFinite(custPct)) {
    if (custPct <= -10) partes.push(`custos operacionais **${Math.round(custPct)}% vs Meta**`);
    else if (custPct >= 10) partes.push(`custos **+${Math.round(custPct)}% acima da Meta**`);
    else partes.push(`custos **alinhados**`);
  }

  // Frase 4 — Margem R$/@
  if (c.margemRsArroba?.realizado != null) {
    partes.push(`margem **${fmtMoedaArroba(c.margemRsArroba.realizado)}**`);
  }

  return partes.join(', ') + '.';
}

// ─── Composição Pec/Agri derivada de PC-100 ─────────────────────────

function derivarComposicao(painel: PainelConsultorDataResult | null): {
  areaOperacional: number | null;
  pctPec: number | null;
  pctAgri: number | null;
  temPec: boolean;
  temAgri: boolean;
} {
  const pec = painel?.areaPecuariaRealMes ?? 0;
  const agri = painel?.areaAgriculturaRealMes ?? 0;
  const total = pec + agri;
  return {
    areaOperacional: total > 0 ? total : null,
    pctPec: total > 0 ? (pec / total) * 100 : null,
    pctAgri: total > 0 ? (agri / total) * 100 : null,
    temPec: pec > 0,
    temAgri: agri > 0,
  };
}

// ─── Wrapper Comparativo (DTO Fechamento) → ComparativoDuplo (Card) ─

function toComparativoDuplo(
  comp: Comparativo,
  tipoSemantica: 'estoque' | 'acumulado' | 'media' | 'taxa',
  formato: 'moeda' | 'numero' | 'percentual' | 'arrobas' | 'kg' | 'cabecas' | 'hectares' | 'ua_ha' | 'gmd',
): ComparativoDuplo {
  return {
    valor: comp.realizado,
    origem: 'pc100',
    tipoSemantica,
    formato,
    vsAnoFechado: { valor: comp.meta, delta: comp.desvioMetaPct },
    vsMesmoPeriodo: { valor: comp.anoAnterior, delta: comp.desvioAnoAntPct },
  };
}

// ─── CardSimples (3 cards sem comparativo: Áreas + Composição) ───────

function CardSimples({ titulo, valor, unidade }: {
  titulo: string;
  valor: string;
  unidade?: string;
}) {
  return (
    <div className="bg-card border border-border border-l-[3px] border-l-slate-400 dark:border-l-slate-500 rounded-md p-2 flex flex-col gap-0.5 min-w-0">
      <div className="text-[9px] font-semibold uppercase tracking-wide text-muted-foreground truncate">
        {titulo}
      </div>
      <div className="text-base font-bold text-foreground tabular-nums truncate leading-tight">
        {valor}
        {unidade && <span className="text-xs font-normal text-muted-foreground ml-1">{unidade}</span>}
      </div>
    </div>
  );
}

// ─── Componente principal ───────────────────────────────────────────

export default function Capa({ dto, nomeCliente, nomeFazenda, painel }: Props) {
  const c = dto.cabecalho;
  const comp = derivarComposicao(painel);
  const insight = gerarInsightExecutivo(dto);
  const escopoTexto =
    [comp.temPec && 'Pecuária', comp.temAgri && 'Agricultura'].filter(Boolean).join(' + ') ||
    'Pecuária';

  // Render simples de negrito do insight (parse de **...**)
  const renderInsight = (texto: string) => {
    const partes = texto.split(/(\*\*[^*]+\*\*)/);
    return partes.map((p, i) =>
      p.startsWith('**') && p.endsWith('**')
        ? <strong key={i} className="font-semibold text-foreground">{p.slice(2, -2)}</strong>
        : <span key={i}>{p}</span>,
    );
  };

  // Valor Rebanho: Meta não confiável em Global (serieMeta=NaN). Usa deltaMeta
  // pré-calculado do PC-100 quando disponível; senão card mostra "—" vs meta.
  const valorRebanhoDuplo: ComparativoDuplo = {
    valor: painel?.valorRebanhoIndicador?.valor ?? null,
    origem: 'pc100',
    tipoSemantica: 'estoque',
    formato: 'moeda',
    vsAnoFechado: {
      valor: null,
      delta: painel?.valorRebanhoIndicador?.deltaMeta ?? null,
    },
    vsMesmoPeriodo: { valor: null, delta: null },
  };

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

      {/* LINHA 2 — 8 cards macro */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2 mb-3">
        <CardSimples
          titulo="Área Operacional"
          valor={comp.areaOperacional !== null ? fmt(comp.areaOperacional, 0) : '—'}
          unidade="ha"
        />
        <CardSimples
          titulo="Área Produtiva"
          valor={painel?.areaProdutivaRealMes != null ? fmt(painel.areaProdutivaRealMes, 0) : '—'}
          unidade="ha"
        />
        <CardSimples
          titulo="Composição Pec/Agri"
          valor={
            comp.pctPec !== null && comp.pctAgri !== null
              ? `${Math.round(comp.pctPec)}% / ${Math.round(comp.pctAgri)}%`
              : '—'
          }
        />
        <CardComparativo
          titulo="Rebanho Médio"
          dado={toComparativoDuplo(c.cabecasMedias, 'media', 'cabecas')}
          mostrarVsAnoAnt
          comparativoLabel="meta"
          densidade="compacta"
        />
        <CardComparativo
          titulo="Valor Rebanho"
          dado={valorRebanhoDuplo}
          mostrarVsAnoAnt
          comparativoLabel="meta"
          densidade="compacta"
        />
        <CardComparativo
          titulo="Receita Pecuária"
          dado={toComparativoDuplo(c.receitaPecuaria, 'acumulado', 'moeda')}
          mostrarVsAnoAnt
          comparativoLabel="meta"
          densidade="compacta"
        />
        <CardComparativo
          titulo="Resultado Operacional"
          dado={toComparativoDuplo(c.resultadoPeriodo, 'acumulado', 'moeda')}
          mostrarVsAnoAnt
          comparativoLabel="meta"
          densidade="compacta"
        />
        <CardComparativo
          titulo="Caixa Final"
          dado={toComparativoDuplo(c.caixaFinal, 'estoque', 'moeda')}
          mostrarVsAnoAnt
          comparativoLabel="meta"
          densidade="compacta"
        />
      </div>

      {/* LINHA 3 — Insight executivo */}
      <p className="text-sm text-foreground leading-relaxed">
        {renderInsight(insight)}
      </p>
    </section>
  );
}
