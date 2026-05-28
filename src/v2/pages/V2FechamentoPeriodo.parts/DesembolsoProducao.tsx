/**
 * DesembolsoProducao — Página 6 do Fechamento do Período.
 * Cards + ranking de grupos de custo pecuária (CF + CV).
 * Grupos colapsáveis (default: todos abertos), desce até subcentro.
 */

import { useState } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import type { FechamentoPeriodoDTO, GrupoNode } from '@/v2/types/fechamentoPeriodo';
import { fmt, pct } from './fmt';

interface Props {
  dto: FechamentoPeriodoDTO;
  /** Totais soberanos do PC-100 (Visão Geral), espelhados nos cards. */
  custoCab: number | null;
  custoArr: number | null;
  custeioAcum: number | null;
}

// Custos Pecuários = Custo Fixo Pec + Custo Variável Pec. Juros e Investimento
// NÃO entram aqui (pertencem a outros blocos do fechamento).
const GRUPOS_PEC = new Set([
  'Custo Fixo Pecuária',
  'Custo Variável Pecuária',
]);

export default function DesembolsoProducao({ dto, custoCab, custoArr, custeioAcum }: Props) {
  const gruposPec = dto.estruturaCustos.grupos
    .filter(g => GRUPOS_PEC.has(g.grupo_custo))
    .sort((a, b) => (b.realizado ?? 0) - (a.realizado ?? 0));

  // Denominador cab×mês back-derivado do PC-100: custeioPec ÷ Custo Cab. período.
  // Mantém o R$/cab/mês das linhas na MESMA base cab×mês dos cards soberanos.
  const denom =
    custeioAcum != null &&
    Number.isFinite(custeioAcum) &&
    custoCab != null &&
    Number.isFinite(custoCab) &&
    custoCab > 0
      ? custeioAcum / custoCab
      : null;

  return (
    <section className="pagina-fechamento bloco-custos">
      <h2>Custos Pecuários Realizados</h2>

      {/* Cards = totais soberanos do PC-100 (Visão Geral). A tabela abaixo é a
          abertura operacional por centro (dto.estruturaCustos) e pode não somar
          exatamente o card — card é total soberano, tabela é detalhe. */}
      <div className="cards-grid">
        <div className="card-mini">
          <div className="card-mini-titulo">Custeio médio cab./mês</div>
          <div className="card-mini-valor">R$ {fmt(custoCab, 2)}</div>
        </div>
        <div className="card-mini">
          <div className="card-mini-titulo">Custo Produtivo R$/@</div>
          <div className="card-mini-valor">R$ {fmt(custoArr, 2)}</div>
        </div>
        <div className="card-mini">
          <div className="card-mini-titulo">Custeio Produção Pecuária acum.</div>
          <div className="card-mini-valor">R$ {fmt(custeioAcum)}</div>
        </div>
      </div>

      <div>
        {gruposPec.map(g => <GrupoExpansivel key={g.grupo_custo} grupo={g} denom={denom} />)}
      </div>
    </section>
  );
}

function GrupoExpansivel({ grupo, denom }: { grupo: GrupoNode; denom: number | null }) {
  const [aberto, setAberto] = useState(true);

  // R$/cab/mês — denominador global (cabMed × qtdMeses), igual a todas as linhas.
  const rsCabMes = (v: number | null | undefined): number | null =>
    (v != null && denom != null && denom > 0) ? v / denom : null;
  // Colunas /cab/mês sem "R$ " repetido (cabeçalho já indica a unidade).
  const fmtRsCabMes = (v: number | null | undefined): string => {
    const r = rsCabMes(v);
    return r != null ? `${fmt(r, 2)}` : '—';
  };
  const difRsCabMes = (real: number | null | undefined, meta: number | null | undefined): number | null => {
    const r = rsCabMes(real);
    const m = rsCabMes(meta);
    return (r != null && m != null) ? r - m : null;
  };
  const fmtDifRsCabMes = (real: number | null | undefined, meta: number | null | undefined): string => {
    const d = difRsCabMes(real, meta);
    return d != null ? `${fmt(d, 2)}` : '—';
  };
  // Cor de custo (sinal invertido vs. receita): custo acima da meta (>0) é
  // ruim → vermelho; abaixo (<0) é economia → verde. NÃO usar classeDiferenca.
  const classeCustoDelta = (v: number | null | undefined): string => {
    if (v == null || !Number.isFinite(v)) return '';
    if (v > 0.05) return 'dif-negativa';   // custo acima da meta → vermelho
    if (v < -0.05) return 'dif-positiva';  // custo abaixo da meta → verde
    return '';
  };

  return (
    <div className="subgrupo-rank">
      <div className="subgrupo-rank-header" onClick={() => setAberto(v => !v)}>
        <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          {aberto ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
          {grupo.grupo_custo}
        </span>
        <span>R$ {fmt(grupo.realizado)} <span className={classeCustoDelta(grupo.desvioMetaPct)}>({pct(grupo.desvioMetaPct)})</span></span>
      </div>
      {aberto && (
        <table className="fechamento-table" style={{ marginTop: 8 }}>
          <thead>
            <tr>
              <th>Centro / Subcentro</th>
              <th className="num">Realizado R$</th>
              <th className="num">Real R$/cab/mês</th>
              <th className="num">Meta R$/cab/mês</th>
              <th className="num">Dif R$/cab/mês</th>
              <th className="num">Dif %</th>
            </tr>
          </thead>
          <tbody>
            {grupo.centros.map(centro => {
              // Meta ausente (null ou 0): não exibir Meta/Dif/% — não calcular contra zero.
              const metaCentroAusente = centro.meta == null || centro.meta === 0;
              return (
                <>
                  <tr key={centro.centro_custo}>
                    <td><strong>{centro.centro_custo}</strong></td>
                    <td className="num"><strong>R$ {fmt(centro.realizado)}</strong></td>
                    <td className="num">{fmtRsCabMes(centro.realizado)}</td>
                    <td className="num">{metaCentroAusente ? '—' : fmtRsCabMes(centro.meta)}</td>
                    <td className={`num ${metaCentroAusente ? '' : classeCustoDelta(centro.desvioMetaPct)}`}>{metaCentroAusente ? '—' : fmtDifRsCabMes(centro.realizado, centro.meta)}</td>
                    <td className={`num ${metaCentroAusente ? '' : classeCustoDelta(centro.desvioMetaPct)}`}>{metaCentroAusente ? '—' : pct(centro.desvioMetaPct)}</td>
                  </tr>
                  {centro.subcentros.map(sub => {
                    const metaSubAusente = sub.meta == null || sub.meta === 0;
                    return (
                      <tr key={`${centro.centro_custo}-${sub.subcentro}`} className="linha-sub">
                        <td>{sub.subcentro}</td>
                        <td className="num">R$ {fmt(sub.realizado)}</td>
                        <td className="num">{fmtRsCabMes(sub.realizado)}</td>
                        <td className="num">{metaSubAusente ? '—' : fmtRsCabMes(sub.meta)}</td>
                        <td className={`num ${metaSubAusente ? '' : classeCustoDelta(sub.desvioMetaPct)}`}>{metaSubAusente ? '—' : fmtDifRsCabMes(sub.realizado, sub.meta)}</td>
                        <td className={`num ${metaSubAusente ? '' : classeCustoDelta(sub.desvioMetaPct)}`}>{metaSubAusente ? '—' : pct(sub.desvioMetaPct)}</td>
                      </tr>
                    );
                  })}
                </>
              );
            })}
          </tbody>
        </table>
      )}
    </div>
  );
}
