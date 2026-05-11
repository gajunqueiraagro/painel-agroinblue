/**
 * EvolucaoOperacao — Página 3 (DRE) do Fechamento do Período.
 * Tabela 3 colunas + gráfico de barras Recharts comparando Realizado vs Previsto.
 */

import { BarChart, Bar, XAxis, YAxis, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import type { FechamentoPeriodoDTO } from '@/v2/types/fechamentoPeriodo';
import { fmt, pct, classeDiferenca } from './fmt';

interface Props { dto: FechamentoPeriodoDTO; }

function safeNum(v: number | null | undefined): number {
  return v != null && Number.isFinite(v) ? v : 0;
}

function safeNullable(v: number | null | undefined): number | null {
  return v != null && Number.isFinite(v) ? v : null;
}

function pctDelta(real: number | null, meta: number | null): number | null {
  if (real == null || meta == null || meta === 0) return null;
  return ((real - meta) / Math.abs(meta)) * 100;
}

export default function EvolucaoOperacao({ dto }: Props) {
  const c = dto.cabecalho;

  const faturamento  = c.receitaPecuaria;
  const custeio      = c.custeioPecuaria;
  const inv          = c.investimentosFazendaPec;
  const juros        = c.jurosFinanciamentoPec;

  // Lucro Bruto = receita - custeio
  const lucroBrutoR = safeNullable(safeNum(faturamento.realizado) - safeNum(custeio.realizado));
  const lucroBrutoM = safeNullable(safeNum(faturamento.meta) - safeNum(custeio.meta));
  const lucroBrutoDif = pctDelta(lucroBrutoR, lucroBrutoM);

  // Lucro Operacional = lucroBruto - inv
  const lucroOpR = safeNullable(safeNum(lucroBrutoR) - safeNum(inv.realizado));
  const lucroOpM = safeNullable(safeNum(lucroBrutoM) - safeNum(inv.meta));
  const lucroOpDif = pctDelta(lucroOpR, lucroOpM);

  // Lucro Líquido = lucroOp - juros
  const lucroLiqR = safeNullable(safeNum(lucroOpR) - safeNum(juros.realizado));
  const lucroLiqM = safeNullable(safeNum(lucroOpM) - safeNum(juros.meta));
  const lucroLiqDif = pctDelta(lucroLiqR, lucroLiqM);

  // Margem = lucro líquido / faturamento (%)
  const margemR = (faturamento.realizado && faturamento.realizado > 0 && lucroLiqR != null)
    ? (lucroLiqR / faturamento.realizado) * 100 : null;
  const margemM = (faturamento.meta && faturamento.meta > 0 && lucroLiqM != null)
    ? (lucroLiqM / faturamento.meta) * 100 : null;

  const linhas = [
    { label: '(+) Faturamento competência', r: faturamento.realizado, m: faturamento.meta, d: faturamento.desvioMetaPct, sinal: '+', dest: false },
    { label: '(−) Custeio Produção',       r: custeio.realizado,     m: custeio.meta,     d: custeio.desvioMetaPct,    sinal: '−', dest: false },
    { label: '(=) Lucro Bruto',            r: lucroBrutoR, m: lucroBrutoM, d: lucroBrutoDif, sinal: '=', dest: true },
    { label: '(−) Investimentos Fazenda',  r: inv.realizado, m: inv.meta, d: inv.desvioMetaPct, sinal: '−', dest: false },
    { label: '(=) Lucro Operacional',      r: lucroOpR, m: lucroOpM, d: lucroOpDif, sinal: '=', dest: true },
    { label: '(−) Juros Financiamento',    r: juros.realizado, m: juros.meta, d: juros.desvioMetaPct, sinal: '−', dest: false },
    { label: '(=) Lucro Líquido',          r: lucroLiqR, m: lucroLiqM, d: lucroLiqDif, sinal: '=', dest: true },
  ];

  const grafico = [
    { nome: 'Faturamento', Realizado: safeNum(faturamento.realizado), Previsto: safeNum(faturamento.meta) },
    { nome: 'Lucro Bruto', Realizado: safeNum(lucroBrutoR), Previsto: safeNum(lucroBrutoM) },
    { nome: 'Lucro Op.', Realizado: safeNum(lucroOpR), Previsto: safeNum(lucroOpM) },
    { nome: 'Lucro Líq.', Realizado: safeNum(lucroLiqR), Previsto: safeNum(lucroLiqM) },
  ];

  return (
    <section className="pagina-fechamento">
      <h2>Evolução da Operação</h2>
      <table className="fechamento-table">
        <thead>
          <tr>
            <th>Indicador</th>
            <th className="num">Realizado</th>
            <th className="num">Previsto</th>
            <th className="num">Diferença %</th>
          </tr>
        </thead>
        <tbody>
          {linhas.map(l => (
            <tr key={l.label} className={l.dest ? 'linha-total' : ''}>
              <td>{l.label}</td>
              <td className="num">R$ {fmt(l.r)}</td>
              <td className="num">R$ {fmt(l.m)}</td>
              <td className={`num ${classeDiferenca(l.d)}`}>{pct(l.d)}</td>
            </tr>
          ))}
          <tr>
            <td>Margem (Lucro/Faturamento)</td>
            <td className="num">{pct(margemR)}</td>
            <td className="num">{pct(margemM)}</td>
            <td className="num">—</td>
          </tr>
        </tbody>
      </table>

      <div style={{ width: '100%', height: 250 }}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={grafico} margin={{ top: 20, right: 24, left: 24, bottom: 12 }}>
            <XAxis dataKey="nome" />
            <YAxis tickFormatter={v => (v / 1000).toFixed(0) + 'k'} />
            <Tooltip formatter={(v: number) => `R$ ${fmt(v)}`} />
            <Legend />
            <Bar dataKey="Realizado" fill="#2563eb" />
            <Bar dataKey="Previsto"  fill="#94a3b8" />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </section>
  );
}
