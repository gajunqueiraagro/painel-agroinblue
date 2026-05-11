/**
 * ResumoGlobal — Página 9 do Fechamento do Período.
 * 3 cards textuais determinísticos.
 */

import type { FechamentoPeriodoDTO } from '@/v2/types/fechamentoPeriodo';
import { fmt, pct } from './fmt';

interface Props { dto: FechamentoPeriodoDTO; }

function safeNum(v: number | null | undefined): number {
  return v != null && Number.isFinite(v) ? v : 0;
}

export default function ResumoGlobal({ dto }: Props) {
  const c = dto.cabecalho;
  const rm = dto.resumoMacro;

  const lucroLiquido = safeNum(c.receitaPecuaria.realizado)
    - safeNum(c.custeioPecuaria.realizado)
    - safeNum(c.investimentosFazendaPec.realizado)
    - safeNum(c.jurosFinanciamentoPec.realizado);

  const margem = (c.receitaPecuaria.realizado && c.receitaPecuaria.realizado > 0)
    ? (lucroLiquido / c.receitaPecuaria.realizado) * 100 : null;

  // Maior desvio positivo e negativo entre grupos da estrutura de custos
  let maxPosLabel = '—'; let maxPosValor: number | null = null;
  let maxNegLabel = '—'; let maxNegValor: number | null = null;
  for (const g of dto.estruturaCustos.grupos) {
    if (g.desvioMetaPct == null) continue;
    if (maxPosValor == null || g.desvioMetaPct > maxPosValor) {
      maxPosValor = g.desvioMetaPct; maxPosLabel = g.grupo_custo;
    }
    if (maxNegValor == null || g.desvioMetaPct < maxNegValor) {
      maxNegValor = g.desvioMetaPct; maxNegLabel = g.grupo_custo;
    }
  }

  return (
    <section className="pagina-fechamento">
      <h2>Resumo Global</h2>
      <div className="cards-resumo-global">
        <div className="card-resumo">
          <h3>Fechamento Operacional</h3>
          <p>Lucro líquido: <strong>R$ {fmt(lucroLiquido)}</strong></p>
          <p>Margem operacional: <strong>{pct(margem)}</strong></p>
          <p>Maior desvio positivo vs META: <strong>{maxPosLabel}</strong> ({pct(maxPosValor)})</p>
          <p>Maior desvio negativo vs META: <strong>{maxNegLabel}</strong> ({pct(maxNegValor)})</p>
        </div>

        <div className="card-resumo">
          <h3>Fluxo de Caixa</h3>
          <p>Entradas totais: <strong>R$ {fmt(rm.totalEntradas.realizado)}</strong></p>
          <p>Saídas totais: <strong>R$ {fmt(rm.totalSaidas.realizado)}</strong></p>
          <p>Resultado líquido: <strong>R$ {fmt(rm.resultadoLiquido.realizado)}</strong></p>
          <p>Caixa final do período: <strong>R$ {fmt(c.caixaFinal.realizado)}</strong></p>
        </div>

        <div className="card-resumo">
          <h3>Evolução Patrimonial</h3>
          <p style={{ color: '#6b7280', fontStyle: 'italic' }}>
            Dados patrimoniais detalhados estarão disponíveis em versão futura.
          </p>
        </div>
      </div>
    </section>
  );
}
