/**
 * BLOCO 1 — Resumo Macro Executivo do cockpit anual.
 * Recebe Bloco1Macro do DTO e renderiza. Zero cálculo.
 */

import { CardComparativo } from '@/v2/components/CardComparativo';
import type { Bloco1Macro } from '@/v2/lib/planejamentoVisaoGeralTypes';

interface Props {
  data: Bloco1Macro;
}

function SecaoTitulo({ children }: { children: React.ReactNode }) {
  return (
    <h3 className="text-xs font-bold uppercase tracking-wider text-foreground/70 mb-2 mt-3">
      {children}
    </h3>
  );
}

export function BlocoMacroExecutivo({ data }: Props) {
  return (
    <section className="bg-card border border-border rounded-lg p-4 mb-4">
      <h2 className="text-base font-bold text-foreground mb-1">Resumo Macro Executivo</h2>
      <p className="text-xs text-muted-foreground mb-3">
        Visão consolidada do ano META. Receitas, saídas, geração e caixa projetado.
      </p>

      <SecaoTitulo>Entradas</SecaoTitulo>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2">
        <CardComparativo titulo="Receitas Pecuária" dado={data.receitasPecuaria} />
        <CardComparativo titulo="Outras Receitas" dado={data.outrasReceitas} />
        <CardComparativo titulo="Entradas Financeiras" dado={data.entradasFinanceiras} />
        <CardComparativo titulo="Total Entradas" dado={data.totalEntradas} className="border-foreground/40" />
      </div>

      <SecaoTitulo>Saídas</SecaoTitulo>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2">
        <CardComparativo titulo="Custeio Pecuária" dado={data.custeioPecuaria} />
        <CardComparativo titulo="Custeio Agricultura" dado={data.custeioAgricultura} />
        <CardComparativo titulo="Investimentos Pec." dado={data.investimentosPecuaria} />
        <CardComparativo titulo="Investimentos Agri." dado={data.investimentosAgricultura} />
        <CardComparativo titulo="Reposição Bovinos" dado={data.reposicaoBovinos} />
        <CardComparativo titulo="Amortizações" dado={data.amortizacoes} />
        <CardComparativo titulo="Dividendos" dado={data.dividendos} />
        <CardComparativo titulo="Total Saídas" dado={data.totalSaidas} className="border-foreground/40" />
      </div>

      <SecaoTitulo>Resultado Executivo</SecaoTitulo>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2">
        <CardComparativo titulo="Geração Operacional" dado={data.geracaoOperacional} />
        <CardComparativo titulo="Geração de Caixa" dado={data.geracaoCaixa} />
        <div className="bg-card border border-border rounded-md p-3 flex flex-col gap-1.5 min-w-0">
          <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground truncate">
            Saldo Inicial
          </div>
          <div className="text-lg font-bold text-foreground tabular-nums truncate">
            {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 }).format(data.saldoInicial)}
          </div>
          <div className="text-[10px] text-muted-foreground font-medium">
            Snapshot Dez ano anterior
          </div>
        </div>
        <CardComparativo titulo="Caixa Final Projetado" dado={data.caixaFinal} className="border-foreground/40" />
      </div>
    </section>
  );
}
