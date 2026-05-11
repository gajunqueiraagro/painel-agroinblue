/**
 * BLOCO 4 — Financeiro / Capital.
 * Juros, amortizações, investimentos, dividendos, desembolso total.
 */

import { CardComparativo } from '@/v2/components/CardComparativo';
import type { Bloco4Financeiro } from '@/v2/lib/planejamentoVisaoGeralTypes';

interface Props {
  data: Bloco4Financeiro;
}

export function BlocoFinanceiroCapital({ data }: Props) {
  return (
    <section className="bg-card border border-border rounded-lg p-4 mb-4">
      <h2 className="text-base font-bold text-foreground mb-1">Financeiro / Capital</h2>
      <p className="text-xs text-muted-foreground mb-3">
        Separado da operação. Juros, amortizações, investimentos e dividendos.
      </p>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2">
        <CardComparativo titulo="Juros Pecuária" dado={data.juros} />
        <CardComparativo titulo="Amortizações" dado={data.amortizacoes} />
        <CardComparativo titulo="Investimentos Pec." dado={data.investimentosPecuaria} />
        <CardComparativo titulo="Investimentos Agri." dado={data.investimentosAgricultura} />
        <CardComparativo titulo="Reposição Bovinos" dado={data.reposicaoBovinos} />
        <CardComparativo titulo="Dividendos" dado={data.dividendos} />
        <CardComparativo titulo="Desembolso Total" dado={data.desembolsoTotal} className="border-foreground/40 col-span-2" />
      </div>
    </section>
  );
}
