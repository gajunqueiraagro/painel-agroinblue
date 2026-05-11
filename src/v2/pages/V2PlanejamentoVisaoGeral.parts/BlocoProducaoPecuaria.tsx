/**
 * BLOCO 2 — Produção Pecuária.
 * Posições, produção, taxas, indicadores econômicos.
 */

import { CardComparativo } from '@/v2/components/CardComparativo';
import type { Bloco2Producao } from '@/v2/lib/planejamentoVisaoGeralTypes';

interface Props {
  data: Bloco2Producao;
}

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
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2">
        <CardComparativo titulo="Cabeças Inicial" dado={data.cabecasInicial} />
        <CardComparativo titulo="Cabeças Final" dado={data.cabecasFinal} />
        <CardComparativo titulo="Peso Médio Final" dado={data.pesoMedioFinal} />
        <CardComparativo titulo="Área Produtiva Média" dado={data.areaProdutivaMedia} />
      </div>

      <SecaoTitulo>Produção</SecaoTitulo>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2">
        <CardComparativo titulo="Arrobas Produzidas" dado={data.arrobasProduzidas} />
        <CardComparativo titulo="Arrobas Desfrutadas" dado={data.arrobasDesfrutadas} />
        <CardComparativo titulo="Desfrute %" dado={data.desfrutePct} />
        <CardComparativo titulo="Lotação Média" dado={data.lotacaoMedia} />
      </div>

      <SecaoTitulo>Indicadores Econômicos</SecaoTitulo>
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-2">
        <CardComparativo titulo="Custo R$/@" dado={data.custoArr} />
        <CardComparativo titulo="Preço R$/@" dado={data.precoArr} />
        <CardComparativo titulo="Margem R$/@" dado={data.margemArr} className="border-foreground/40" />
        <CardComparativo titulo="Receita/Cab" dado={data.receitaCab} />
        <CardComparativo titulo="Custo/Cab" dado={data.custoCab} />
      </div>
    </section>
  );
}
