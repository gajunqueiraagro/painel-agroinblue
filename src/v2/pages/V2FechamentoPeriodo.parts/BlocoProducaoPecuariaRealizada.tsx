/**
 * BLOCO — Produção Pecuária Realizada (Fechamento do Período).
 *
 * Componente puro: consome DTO buildProducaoRealizadaData(painel, mesAlvo)
 * e renderiza 13 cards via CardComparativo (densidade='compacta').
 *
 * Layout compacto: 4 linhas × 4 colunas (última com 1 card + 3 vazios).
 * Identidade de grupo via borda esquerda colorida (tom 400/500) — labels
 * textuais de seção removidos para reduzir altura total (~50% menos).
 */

import { CardComparativo } from '@/v2/components/CardComparativo';
import type { Bloco2ProducaoRealizada } from '@/v2/lib/producaoRealizadaTypes';

interface Props {
  data: Bloco2ProducaoRealizada;
}

// ─── Paletas de fundo (contexto econômico) ────────────────────────────
const PALETA_NEUTRO     = 'bg-orange-50/40 border-orange-100 dark:bg-orange-950/20 dark:border-orange-900/40 hover:bg-orange-50/60 transition-colors';
const PALETA_PATRIMONIO = 'bg-blue-50/40 border-blue-100 dark:bg-blue-950/20 dark:border-blue-900/40 hover:bg-blue-50/60 transition-colors';
const PALETA_CUSTO      = 'bg-red-50/40 border-red-100 dark:bg-red-950/20 dark:border-red-900/40 hover:bg-red-50/60 transition-colors';
const PALETA_RECEITA    = 'bg-blue-50/40 border-blue-100 dark:bg-blue-950/20 dark:border-blue-900/40 hover:bg-blue-50/60 transition-colors';
const PALETA_MARGEM     = 'bg-emerald-50/40 border-emerald-100 dark:bg-emerald-950/20 dark:border-emerald-900/40 hover:bg-emerald-50/60 transition-colors';

const VALOR_CUSTO       = 'text-red-700 dark:text-red-300';
const VALOR_RECEITA     = 'text-blue-800 dark:text-blue-200';
const VALOR_MARGEM      = 'text-emerald-700 dark:text-emerald-300';
const VALOR_PATRIMONIO  = 'text-blue-800 dark:text-blue-200';

// ─── Bordas laterais por grupo conceitual ─────────────────────────────
// Identidade visual do grupo (substitui labels textuais "Posições",
// "Produção", etc.). Tom 400 — discreto mas legível em fundos coloridos.
const BORDA_ESTOQUE   = 'border-l-[3px] border-l-slate-400 dark:border-l-slate-500';
const BORDA_PRODUCAO  = 'border-l-[3px] border-l-amber-400 dark:border-l-amber-500';
const BORDA_MEDIAS    = 'border-l-[3px] border-l-violet-400 dark:border-l-violet-500';
const BORDA_ECONOMICO = 'border-l-[3px] border-l-emerald-400 dark:border-l-emerald-500';

export function BlocoProducaoPecuariaRealizada({ data }: Props) {
  return (
    <section className="bg-card border border-border rounded-lg p-4 mb-4">
      <div className="flex items-center gap-2 flex-wrap mb-1">
        <h2 className="text-base font-bold text-foreground">Produção Pecuária Realizada</h2>
        <span className="text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded bg-emerald-100 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-200 border border-emerald-200 dark:border-emerald-900/60">
          Operacional
        </span>
      </div>
      <p className="text-xs text-muted-foreground mb-2">
        Realizado Jan→mês selecionado • vs Meta período
      </p>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2">
        {/* Linha 1: Estoque/Patrimônio (slate) + Área Produtiva (violet) */}
        <CardComparativo titulo="Rebanho Médio"        dado={data.rebanhoMedio}       className={`${PALETA_NEUTRO} ${BORDA_ESTOQUE}`}     densidade="compacta" mostrarVsAnoAnt comparativoLabel="meta" />
        <CardComparativo titulo="Peso Médio (período)" dado={data.pesoMedioPeriodo}   className={`${PALETA_NEUTRO} ${BORDA_ESTOQUE}`}     densidade="compacta" mostrarVsAnoAnt comparativoLabel="meta" />
        <CardComparativo titulo="Valor Rebanho"        dado={data.valorRebanho}       className={`${PALETA_PATRIMONIO} ${BORDA_ESTOQUE}`} valorClassName={VALOR_PATRIMONIO} densidade="compacta" mostrarVsAnoAnt comparativoLabel="meta" />
        <CardComparativo titulo="Área Produtiva Média" dado={data.areaProdutivaMedia} className={`${PALETA_NEUTRO} ${BORDA_MEDIAS}`}      densidade="compacta" mostrarVsAnoAnt comparativoLabel="meta" />

        {/* Linha 2: Produção (amber) + UA/ha (violet) */}
        <CardComparativo titulo="@ Produzidas"    dado={data.arrobasProduzidas}  className={`${PALETA_NEUTRO} ${BORDA_PRODUCAO}`} densidade="compacta" mostrarVsAnoAnt comparativoLabel="meta" />
        <CardComparativo titulo="@ Desfrutadas"   dado={data.arrobasDesfrutadas} className={`${PALETA_NEUTRO} ${BORDA_PRODUCAO}`} densidade="compacta" mostrarVsAnoAnt comparativoLabel="meta" />
        <CardComparativo titulo="Desfrute (Cab.)" dado={data.desfrutePct}        className={`${PALETA_NEUTRO} ${BORDA_PRODUCAO}`} densidade="compacta" mostrarVsAnoAnt comparativoLabel="meta" />
        <CardComparativo titulo="UA/ha Médio"     dado={data.uaHaMedio}          className={`${PALETA_NEUTRO} ${BORDA_MEDIAS}`}   densidade="compacta" mostrarVsAnoAnt comparativoLabel="meta" />

        {/* Linha 3: GMD (violet) + Econômicos parciais (emerald) */}
        <CardComparativo titulo="GMD Médio"  dado={data.gmdMedio}  className={`${PALETA_NEUTRO} ${BORDA_MEDIAS}`}                                          densidade="compacta" mostrarVsAnoAnt comparativoLabel="meta" />
        <CardComparativo titulo="Custo R$/@" dado={data.custoArr}  className={`${PALETA_CUSTO} ${BORDA_ECONOMICO}`}   valorClassName={VALOR_CUSTO}         densidade="compacta" mostrarVsAnoAnt comparativoLabel="meta" />
        <CardComparativo titulo="Preço R$/@" dado={data.precoArr}  className={`${PALETA_RECEITA} ${BORDA_ECONOMICO}`} valorClassName={VALOR_RECEITA}       densidade="compacta" mostrarVsAnoAnt comparativoLabel="meta" />
        <CardComparativo titulo="Margem R$/@" dado={data.margemArr} className={`${PALETA_MARGEM} ${BORDA_ECONOMICO}`}  valorClassName={VALOR_MARGEM}        densidade="compacta" mostrarVsAnoAnt comparativoLabel="meta" />

        {/* Linha 4: Econômicos restante (1 card + 3 espaços vazios) */}
        <CardComparativo titulo="Custo R$/cab.mês" dado={data.custoCab} className={`${PALETA_CUSTO} ${BORDA_ECONOMICO}`} valorClassName={VALOR_CUSTO} densidade="compacta" mostrarVsAnoAnt comparativoLabel="meta" />
      </div>
    </section>
  );
}
