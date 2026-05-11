/**
 * DesembolsoProducao — Página 6 do Fechamento do Período.
 * Cards + ranking de grupos de custo pecuária (CF + CV).
 * Grupos colapsáveis (default: todos abertos), desce até subcentro.
 */

import { useState } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import type { FechamentoPeriodoDTO, GrupoNode } from '@/v2/types/fechamentoPeriodo';
import { fmt, pct, classeDiferenca } from './fmt';

interface Props { dto: FechamentoPeriodoDTO; }

const GRUPOS_PEC = new Set([
  'Custo Fixo Pecuária',
  'Custo Variável Pecuária',
  'Juros de Financiamento Pecuária',
]);

export default function DesembolsoProducao({ dto }: Props) {
  const c = dto.cabecalho;

  const gruposPec = dto.estruturaCustos.grupos
    .filter(g => GRUPOS_PEC.has(g.grupo_custo))
    .sort((a, b) => (b.realizado ?? 0) - (a.realizado ?? 0));

  // Cards
  const cabMed = c.cabecasMedias.realizado;
  const qtdMeses = dto.meses.length;
  const desembolso = c.desembolsoPecuaria.realizado;

  const cabMesValor = (desembolso != null && cabMed != null && cabMed > 0 && qtdMeses > 0)
    ? desembolso / (cabMed * qtdMeses) : null;

  return (
    <section className="pagina-fechamento">
      <h2>Desembolso da Produção Pecuária</h2>

      <div className="cards-grid">
        <div className="card-mini">
          <div className="card-mini-titulo">Desembolso médio cab/mês</div>
          <div className="card-mini-valor">R$ {fmt(cabMesValor, 2)}</div>
        </div>
        <div className="card-mini">
          <div className="card-mini-titulo">Custo R$/@ produzida</div>
          <div className="card-mini-valor">R$ {fmt(c.custoRsArroba.realizado, 2)}</div>
        </div>
        <div className="card-mini">
          <div className="card-mini-titulo">Desembolso Total</div>
          <div className="card-mini-valor">R$ {fmt(desembolso)}</div>
        </div>
      </div>

      <div>
        {gruposPec.map(g => <GrupoExpansivel key={g.grupo_custo} grupo={g} />)}
      </div>
    </section>
  );
}

function GrupoExpansivel({ grupo }: { grupo: GrupoNode }) {
  const [aberto, setAberto] = useState(true);
  return (
    <div className="subgrupo-rank">
      <div className="subgrupo-rank-header" onClick={() => setAberto(v => !v)}>
        <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          {aberto ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
          {grupo.grupo_custo}
        </span>
        <span>R$ {fmt(grupo.realizado)} <span className={classeDiferenca(grupo.desvioMetaPct)}>({pct(grupo.desvioMetaPct)})</span></span>
      </div>
      {aberto && (
        <table className="fechamento-table" style={{ marginTop: 8 }}>
          <thead>
            <tr>
              <th>Centro / Subcentro</th>
              <th className="num">Realizado</th>
              <th className="num">Meta</th>
              <th className="num">Diferença %</th>
            </tr>
          </thead>
          <tbody>
            {grupo.centros.map(centro => (
              <>
                <tr key={centro.centro_custo}>
                  <td><strong>{centro.centro_custo}</strong></td>
                  <td className="num"><strong>R$ {fmt(centro.realizado)}</strong></td>
                  <td className="num">R$ {fmt(centro.meta)}</td>
                  <td className={`num ${classeDiferenca(centro.desvioMetaPct)}`}>{pct(centro.desvioMetaPct)}</td>
                </tr>
                {centro.subcentros.map(sub => (
                  <tr key={`${centro.centro_custo}-${sub.subcentro}`} className="linha-sub">
                    <td>{sub.subcentro}</td>
                    <td className="num">R$ {fmt(sub.realizado)}</td>
                    <td className="num">R$ {fmt(sub.meta)}</td>
                    <td className={`num ${classeDiferenca(sub.desvioMetaPct)}`}>{pct(sub.desvioMetaPct)}</td>
                  </tr>
                ))}
              </>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
