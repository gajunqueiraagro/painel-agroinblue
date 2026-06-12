/**
 * AnaliseZootecnica — Página 4 do Fechamento do Período.
 * Tabela única com todos os indicadores zoot (sem histórico 5 anos).
 */

import type { FechamentoPeriodoDTO, IndicadorPecuaria } from '@/v2/types/fechamentoPeriodo';
import { fmt, pct, classeDiferenca } from './fmt';
import { BoletimContainer } from './boletim/BoletimContainer';

interface Props { dto: FechamentoPeriodoDTO; gmdSoberano?: number | null; subtitulo: string; }

interface Linha {
  label: string;
  unidade: string;
  ind: IndicadorPecuaria;
  dec?: number;
}

export default function AnaliseZootecnica({ dto, gmdSoberano = null, subtitulo }: Props) {
  const a = dto.analisePecuaria;

  const linhas: Linha[] = [
    { label: 'Área Produtiva',              unidade: 'ha',     ind: a.areaProdutivaPec },
    { label: 'Cabeças Médias',              unidade: 'cab',    ind: a.cabecasMedias },
    { label: 'GMD', unidade: 'kg/dia', dec: 3, ind: {
        label: 'GMD', unidade: 'kg/dia', serie: a.gmd.serie,
        comparativo: {
          realizado: gmdSoberano,
          meta: null, anoAnterior: null,
          desvioMeta: null, desvioMetaPct: null,
          desvioAnoAnt: null, desvioAnoAntPct: null,
        },
    } },
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
    // pagina-fechamento preservado como marcador, neutralizado (display:contents)
    // p/ não duplicar card — chrome oficial vem do BoletimContainer. Os seletores
    // descendentes (.pagina-fechamento table) seguem válidos com display:contents.
    <div className="pagina-fechamento" style={{ display: 'contents' }}>
      <BoletimContainer titulo="Análise Zootécnica" subtitulo={subtitulo} badge="OPERACIONAL" tone="operacional">
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
      </BoletimContainer>
    </div>
  );
}
