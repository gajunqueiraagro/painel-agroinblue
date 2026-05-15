/**
 * BLOCO 2 — Produção Pecuária.
 * Posições, produção, taxas, indicadores econômicos.
 *
 * Paleta executiva por contexto econômico (visual apenas, sem alterar lógica):
 *   • neutros/posição/produção física → laranja muito leve
 *   • custos                          → vermelho suave  + texto vermelho escuro
 *   • receita/venda                   → azul suave      + texto azul escuro
 *   • margem (resultado)              → verde suave     + texto verde escuro
 */

import { CardComparativo } from '@/v2/components/CardComparativo';
import type { Bloco2Producao } from '@/v2/lib/planejamentoVisaoGeralTypes';

interface Props {
  data: Bloco2Producao;
}

// ─── Paletas por contexto econômico ──────────────────────────────────
const PALETA_NEUTRO    = 'bg-orange-50/40 border-orange-100 dark:bg-orange-950/20 dark:border-orange-900/40 hover:bg-orange-50/60 transition-colors';
const PALETA_PATRIMONIO = 'bg-blue-50/40 border-blue-100 dark:bg-blue-950/20 dark:border-blue-900/40 hover:bg-blue-50/60 transition-colors';
const PALETA_CUSTO     = 'bg-red-50/40 border-red-100 dark:bg-red-950/20 dark:border-red-900/40 hover:bg-red-50/60 transition-colors';
const PALETA_RECEITA   = 'bg-blue-50/40 border-blue-100 dark:bg-blue-950/20 dark:border-blue-900/40 hover:bg-blue-50/60 transition-colors';
const PALETA_MARGEM    = 'bg-emerald-50/40 border-emerald-100 dark:bg-emerald-950/20 dark:border-emerald-900/40 hover:bg-emerald-50/60 transition-colors';

const VALOR_CUSTO      = 'text-red-700 dark:text-red-300';
const VALOR_RECEITA    = 'text-blue-800 dark:text-blue-200';
const VALOR_MARGEM     = 'text-emerald-700 dark:text-emerald-300';
const VALOR_PATRIMONIO = 'text-blue-800 dark:text-blue-200';

function SecaoTitulo({ children }: { children: React.ReactNode }) {
  return (
    <h3 className="text-xs font-bold uppercase tracking-wider text-foreground/70 mb-2 mt-3">
      {children}
    </h3>
  );
}

export function BlocoProducaoPecuaria({ data }: Props) {
  return (
    <section className="bg-card border border-border rounded-lg p-4 mb-4">
      <h2 className="text-base font-bold text-foreground mb-1">Produção Pecuária</h2>
      <p className="text-xs text-muted-foreground mb-3">
        Indicadores físicos e econômicos da pecuária projetada.
      </p>

      <SecaoTitulo>Posições</SecaoTitulo>
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-2">
        <CardComparativo titulo="Rebanho Final META"          dado={data.cabecasFinal}        className={PALETA_NEUTRO}     mostrarVsAnoAnt />
        <CardComparativo titulo="Rebanho Médio META"          dado={data.rebanhoMedio}        className={PALETA_NEUTRO}     mostrarVsAnoAnt />
        <CardComparativo titulo="Peso Médio Final META"       dado={data.pesoMedioFinal}      className={PALETA_NEUTRO}     mostrarVsAnoAnt />
        <CardComparativo titulo="Valor do Rebanho Final META" dado={data.valorRebanhoFinal}   className={PALETA_PATRIMONIO} valorClassName={VALOR_PATRIMONIO} mostrarVsAnoAnt />
        <CardComparativo titulo="Área Produtiva Média META - Pecuária" dado={data.areaProdutivaMedia} className={PALETA_NEUTRO} mostrarVsAnoAnt />
      </div>

      <SecaoTitulo>Produção</SecaoTitulo>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2">
        <CardComparativo titulo="Arrobas Produzidas META"   dado={data.arrobasProduzidas}  className={PALETA_NEUTRO} />
        <CardComparativo titulo="Arrobas Desfrutadas META"  dado={data.arrobasDesfrutadas} className={PALETA_NEUTRO} />
        <CardComparativo titulo="Desfrute % META"           dado={data.desfrutePct}        className={PALETA_NEUTRO} />
        <CardComparativo titulo="Lotação Média META"        dado={data.lotacaoMedia}       className={PALETA_NEUTRO} />
      </div>

      <SecaoTitulo>Indicadores Econômicos</SecaoTitulo>
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-2">
        <CardComparativo titulo="Custo R$/@ META"           dado={data.custoArr}    className={PALETA_CUSTO}   valorClassName={VALOR_CUSTO} />
        <CardComparativo titulo="Preço de Venda R$/@ META"  dado={data.precoArr}    className={PALETA_RECEITA} valorClassName={VALOR_RECEITA} />
        <CardComparativo titulo="Margem R$/@ META"          dado={data.margemArr}   className={PALETA_MARGEM}  valorClassName={VALOR_MARGEM} />
        <CardComparativo titulo="Receita/Cab META"          dado={data.receitaCab}  className={PALETA_RECEITA} valorClassName={VALOR_RECEITA} />
        <CardComparativo titulo="Custo/Cab mês META"        dado={data.custoCab}    className={PALETA_CUSTO}   valorClassName={VALOR_CUSTO} />
      </div>
    </section>
  );
}
