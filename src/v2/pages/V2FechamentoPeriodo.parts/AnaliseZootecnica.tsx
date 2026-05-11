/**
 * AnaliseZootecnica — Página 4 do Fechamento do Período.
 * Tabela única com todos os indicadores zoot (sem histórico 5 anos).
 */

import type { FechamentoPeriodoDTO, IndicadorPecuaria } from '@/v2/types/fechamentoPeriodo';
import { fmt, pct, classeDiferenca } from './fmt';

interface Props { dto: FechamentoPeriodoDTO; }

interface Linha {
  label: string;
  unidade: string;
  ind: IndicadorPecuaria;
  dec?: number;
}

export default function AnaliseZootecnica({ dto }: Props) {
  const a = dto.analisePecuaria;

  const linhas: Linha[] = [
    { label: 'Área Produtiva',              unidade: 'ha',     ind: a.areaProdutivaPec },
    { label: 'Cabeças Médias',              unidade: 'cab',    ind: a.cabecasMedias },
    { label: 'GMD',                         unidade: 'kg/dia', ind: a.gmd, dec: 3 },
    { label: 'Arrobas Produzidas',          unidade: '@',      ind: a.arrobasProduzidas },
    { label: 'Arrobas Desfrutadas',         unidade: '@',      ind: a.arrobasDesfrutadas },
    { label: 'Peso Médio',                  unidade: 'kg',     ind: a.pesoMedioKg, dec: 1 },
    { label: 'Lotação',                     unidade: 'UA/ha',  ind: a.lotacaoUaHa, dec: 2 },
    { label: 'Preço Médio @',               unidade: 'R$/@',   ind: a.precoMedioArroba, dec: 2 },
    { label: 'Custo Arroba Produzida',      unidade: 'R$/@',   ind: a.custoRsArroba, dec: 2 },
    { label: 'Desembolso Pecuária',         unidade: 'R$',     ind: a.desembolsoPecuaria },
    { label: 'Receita Pecuária',            unidade: 'R$',     ind: a.receitaPecuaria },
    { label: 'Margem R$/@',                 unidade: 'R$/@',   ind: a.margemRsArroba, dec: 2 },
    { label: 'Custo/Cabeça/Mês',            unidade: 'R$',     ind: a.custoCabecaMes, dec: 2 },
    { label: 'Receita/Cabeça',              unidade: 'R$',     ind: a.receitaCabeca, dec: 2 },
  ];

  return (
    <section className="pagina-fechamento">
      <h2>Análise Zootécnica</h2>
      <table className="fechamento-table">
        <thead>
          <tr>
            <th>Indicador</th>
            <th>Unidade</th>
            <th className="num">Realizado</th>
            <th className="num">Previsto</th>
            <th className="num">Diferença %</th>
          </tr>
        </thead>
        <tbody>
          {linhas.map(l => (
            <tr key={l.label}>
              <td>{l.label}</td>
              <td>{l.unidade}</td>
              <td className="num">{fmt(l.ind.comparativo.realizado, l.dec ?? 0)}</td>
              <td className="num">{fmt(l.ind.comparativo.meta, l.dec ?? 0)}</td>
              <td className={`num ${classeDiferenca(l.ind.comparativo.desvioMetaPct)}`}>
                {pct(l.ind.comparativo.desvioMetaPct)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
