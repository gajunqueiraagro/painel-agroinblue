/**
 * BLOCO — Produção Pecuária Realizada (Fechamento do Período).
 *
 * Componente puro: consome DTO buildProducaoRealizadaData(painel, mesAlvo)
 * e renderiza 13 cards via CardComparativo. Sem cálculo aqui.
 *
 * Paletas e estilo de valor espelham BlocoProducaoPecuaria.tsx do
 * Planejamento (consistência visual cross-page).
 */

import { CardComparativo } from '@/v2/components/CardComparativo';
import type { Bloco2ProducaoRealizada } from '@/v2/lib/producaoRealizadaTypes';

interface Props {
  data: Bloco2ProducaoRealizada;
}

// ─── Paletas por contexto econômico — copiadas de BlocoProducaoPecuaria.tsx ──
const PALETA_NEUTRO     = 'bg-orange-50/40 border-orange-100 dark:bg-orange-950/20 dark:border-orange-900/40 hover:bg-orange-50/60 transition-colors';
const PALETA_PATRIMONIO = 'bg-blue-50/40 border-blue-100 dark:bg-blue-950/20 dark:border-blue-900/40 hover:bg-blue-50/60 transition-colors';
const PALETA_CUSTO      = 'bg-red-50/40 border-red-100 dark:bg-red-950/20 dark:border-red-900/40 hover:bg-red-50/60 transition-colors';
const PALETA_RECEITA    = 'bg-blue-50/40 border-blue-100 dark:bg-blue-950/20 dark:border-blue-900/40 hover:bg-blue-50/60 transition-colors';
const PALETA_MARGEM     = 'bg-emerald-50/40 border-emerald-100 dark:bg-emerald-950/20 dark:border-emerald-900/40 hover:bg-emerald-50/60 transition-colors';

const VALOR_CUSTO       = 'text-red-700 dark:text-red-300';
const VALOR_RECEITA     = 'text-blue-800 dark:text-blue-200';
const VALOR_MARGEM      = 'text-emerald-700 dark:text-emerald-300';
const VALOR_PATRIMONIO  = 'text-blue-800 dark:text-blue-200';

function SecaoTitulo({ children }: { children: React.ReactNode }) {
  return (
    <h3 className="text-xs font-bold uppercase tracking-wider text-foreground/70 mb-2 mt-3">
      {children}
    </h3>
  );
}

export function BlocoProducaoPecuariaRealizada({ data }: Props) {
  return (
    <section className="bg-card border border-border rounded-lg p-4 mb-4">
      <div className="flex items-center gap-2 flex-wrap mb-1">
        <h2 className="text-base font-bold text-foreground">Produção Pecuária Realizada</h2>
        <span className="text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded bg-emerald-100 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-200 border border-emerald-200 dark:border-emerald-900/60">
          Operacional
        </span>
      </div>
      <p className="text-xs text-muted-foreground mb-3">
        Indicadores operacionais e econômicos realizados da pecuária • Acumulado/médio Jan→mês do filtro
      </p>

      <SecaoTitulo>Posições</SecaoTitulo>
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-2">
        <CardComparativo titulo="Rebanho Médio"        dado={data.rebanhoMedio}     className={PALETA_NEUTRO}     mostrarVsAnoAnt comparativoLabel="meta" />
        <CardComparativo titulo="Peso Médio (período)" dado={data.pesoMedioPeriodo} className={PALETA_NEUTRO}     mostrarVsAnoAnt comparativoLabel="meta" />
        <CardComparativo titulo="Valor Rebanho"        dado={data.valorRebanho}     className={PALETA_PATRIMONIO} valorClassName={VALOR_PATRIMONIO} mostrarVsAnoAnt comparativoLabel="meta" />
      </div>

      <SecaoTitulo>Produção</SecaoTitulo>
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-2">
        <CardComparativo titulo="@ Produzidas"   dado={data.arrobasProduzidas}  className={PALETA_NEUTRO} mostrarVsAnoAnt comparativoLabel="meta" />
        <CardComparativo titulo="@ Desfrutadas"  dado={data.arrobasDesfrutadas} className={PALETA_NEUTRO} mostrarVsAnoAnt comparativoLabel="meta" />
        <CardComparativo titulo="Desfrute (Cab.)" dado={data.desfrutePct}       className={PALETA_NEUTRO} mostrarVsAnoAnt comparativoLabel="meta" />
      </div>

      <SecaoTitulo>Médias / Taxas</SecaoTitulo>
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-2">
        <CardComparativo titulo="UA/ha Médio"          dado={data.uaHaMedio}          className={PALETA_NEUTRO} mostrarVsAnoAnt comparativoLabel="meta" />
        <CardComparativo titulo="Área Produtiva Média" dado={data.areaProdutivaMedia} className={PALETA_NEUTRO} mostrarVsAnoAnt comparativoLabel="meta" />
        <CardComparativo titulo="GMD Médio"            dado={data.gmdMedio}           className={PALETA_NEUTRO} mostrarVsAnoAnt comparativoLabel="meta" />
      </div>

      <SecaoTitulo>Indicadores Econômicos</SecaoTitulo>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2">
        <CardComparativo titulo="Custo R$/@"       dado={data.custoArr}  className={PALETA_CUSTO}   valorClassName={VALOR_CUSTO}   mostrarVsAnoAnt comparativoLabel="meta" />
        <CardComparativo titulo="Preço R$/@"       dado={data.precoArr}  className={PALETA_RECEITA} valorClassName={VALOR_RECEITA} mostrarVsAnoAnt comparativoLabel="meta" />
        <CardComparativo titulo="Margem R$/@"      dado={data.margemArr} className={PALETA_MARGEM}  valorClassName={VALOR_MARGEM}  mostrarVsAnoAnt comparativoLabel="meta" />
        <CardComparativo titulo="Custo R$/cab.mês" dado={data.custoCab}  className={PALETA_CUSTO}   valorClassName={VALOR_CUSTO}   mostrarVsAnoAnt comparativoLabel="meta" />
      </div>
    </section>
  );
}
