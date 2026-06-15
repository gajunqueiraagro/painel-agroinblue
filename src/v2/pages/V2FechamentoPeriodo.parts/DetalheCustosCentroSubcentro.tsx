/**
 * DetalheCustosCentroSubcentro — box de detalhamento CENTRO-ONLY de Custos
 * (PR-BOLETIM-2.2C), um por grupo (Variável / Fixo). Layout em linha:
 * tabela centro-only (compactada) + TOTAL à esquerda; donut de composição do
 * grupo à direita. Sem subcentros, sem histórico, sem cards/insights.
 * Helpers/cores duplicados do nível centro do GrupoExpansivel (DRY no fim).
 *
 * NOTE: nome do arquivo/componente mantém "...CentroSubcentro" de propósito
 * (sem cleanup agora); hoje é centro-only.
 */
import { Fragment, type CSSProperties } from 'react';
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from 'recharts';
import type { FechamentoPeriodoDTO } from '@/v2/types/fechamentoPeriodo';
import { fmt, pct } from './fmt';
import { BoletimContainer } from './boletim/BoletimContainer';

// Paleta do donut — espelhada do DesembolsoProducao (design system).
const CORES_DONUT = ['#dc2626', '#f97316', '#0ea5e9', '#8b5cf6', '#10b981', '#eab308', '#ec4899', '#14b8a6', '#6366f1', '#f43f5e'];
const COR_OUTROS = '#cbd5e1';
const TOP_DONUT = 6;

// Cor de custo (sinal invertido vs. receita): custo acima da meta (>0) é ruim →
// vermelho; abaixo (<0) é economia → verde. Duplicado de DesembolsoProducao.
function classeCustoDelta(v: number | null | undefined): string {
  if (v == null || !Number.isFinite(v)) return '';
  if (v > 0.05) return 'dif-negativa';
  if (v < -0.05) return 'dif-positiva';
  return '';
}

export function DetalheCustosCentroSubcentro({
  dto,
  custeioAcum,
  custoCab,
  subtitulo,
  grupoAlvo,
}: {
  dto: FechamentoPeriodoDTO;
  custeioAcum: number | null;
  custoCab: number | null;
  subtitulo: string;
  grupoAlvo: 'Custo Variável Pecuária' | 'Custo Fixo Pecuária';
}) {
  // denom: idêntico ao DesembolsoProducao (base cab×mês soberana, custeioAcum/custoCab).
  const denom =
    custeioAcum != null &&
    Number.isFinite(custeioAcum) &&
    custoCab != null &&
    Number.isFinite(custoCab) &&
    custoCab > 0
      ? custeioAcum / custoCab
      : null;
  const numMeses = dto.meses.length;
  const grupos = dto.estruturaCustos.grupos.filter((g) => g.grupo_custo === grupoAlvo);
  const titulo =
    grupoAlvo === 'Custo Variável Pecuária'
      ? 'Detalhamento — Custo Variável (Centro de Custo)'
      : 'Detalhamento — Custo Fixo (Centro de Custo)';

  // ── Helpers (duplicados do nível centro do GrupoExpansivel; fecham sobre denom/numMeses) ──
  const rsCabMes = (v: number | null | undefined): number | null =>
    v != null && denom != null && denom > 0 ? v / denom : null;
  const rsMedioPeriodo = (v: number | null | undefined): number | null =>
    v != null && numMeses > 0 ? v / numMeses : null;
  const fmtRsCabMes = (v: number | null | undefined): string => {
    const r = rsCabMes(v);
    return r != null ? `${fmt(r, 2)}` : '—';
  };
  const difRsCabMes = (
    real: number | null | undefined,
    meta: number | null | undefined,
  ): number | null => {
    const r = rsCabMes(real);
    const m = rsCabMes(meta);
    return r != null && m != null ? r - m : null;
  };
  const fmtDifRsCabMes = (
    real: number | null | undefined,
    meta: number | null | undefined,
  ): string => {
    const d = difRsCabMes(real, meta);
    return d != null ? `${fmt(d, 2)}` : '—';
  };
  const fmtMediaMensal = (v: number | null | undefined): string => {
    const r = rsMedioPeriodo(v);
    return r != null ? `R$ ${fmt(r)}` : '—';
  };

  // ── Estilos locais (duplicados; padding comprimido p/ caber em ~60% de largura) ──
  const cell: CSSProperties = { padding: '2px 6px', borderBottom: '1px solid #eef0f3' };
  const cellNum: CSSProperties = {
    ...cell,
    textAlign: 'right',
    fontVariantNumeric: 'tabular-nums',
    whiteSpace: 'nowrap',
  };
  const cellNome: CSSProperties = {
    ...cell,
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    maxWidth: 0,
  };
  const COR_REAL_COL = '#dc2626'; // coluna Real sempre vermelho
  const COR_META_COL = '#f97316'; // coluna Meta sempre laranja
  const bordaGrupo = '1px solid #cbd5e1';
  const thBase: CSSProperties = {
    padding: '4px 6px',
    textAlign: 'right',
    fontWeight: 700,
    borderBottom: '2px solid #94a3b8',
  };

  // ── Donut de composição (do próprio grupo): participação dos centros no realizado ──
  const grupo = grupos[0] ?? null;
  const totalReal = grupo?.realizado ?? 0;
  const totalRealRsCabMes = grupo != null ? rsCabMes(grupo.realizado) : null;
  const baseDonut = (grupo?.centros ?? [])
    .filter((c) => c.realizado != null && c.realizado > 0)
    .sort((a, b) => (b.realizado ?? 0) - (a.realizado ?? 0));
  const topN = baseDonut.slice(0, TOP_DONUT);
  const resto = baseDonut.slice(TOP_DONUT);
  const restoSoma = resto.reduce((s, c) => s + (c.realizado ?? 0), 0);
  const slices =
    denom != null
      ? [
          ...topN.map((c, i) => ({
            nome: c.centro_custo,
            real: c.realizado ?? 0,
            valor: (c.realizado ?? 0) / denom,
            cor: CORES_DONUT[i % CORES_DONUT.length],
          })),
          ...(restoSoma > 0
            ? [{ nome: 'Outros', real: restoSoma, valor: restoSoma / denom, cor: COR_OUTROS }]
            : []),
        ]
      : [];
  const partPct = (real: number) => pct((real / (totalReal || 1)) * 100);

  return (
    <BoletimContainer titulo={titulo} subtitulo={subtitulo} badge="FINANCEIRO" tone="financeiro">
      {grupos.length === 0 ? (
        <div
          style={{
            padding: '24px 8px',
            textAlign: 'center',
            fontSize: 11,
            color: '#9ca3af',
            fontStyle: 'italic',
          }}
        >
          Sem dados para este grupo de custo.
        </div>
      ) : (
        <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
          {/* ── ESQUERDA: tabela centro-only (~60%) ── */}
          <div style={{ flex: '0 0 60%', maxWidth: '60%' }}>
            <div
              style={{
                margin: '10px 0',
                border: '1px solid #e5e7eb',
                borderRadius: 6,
                overflow: 'hidden',
              }}
            >
              <table
                style={{
                  width: '100%',
                  borderCollapse: 'collapse',
                  tableLayout: 'fixed',
                  fontSize: 10,
                  color: '#111',
                }}
              >
                <colgroup>
                  <col style={{ width: '40%' }} />
                  <col style={{ width: '16%' }} />
                  <col style={{ width: '11%' }} />
                  <col style={{ width: '11%' }} />
                  <col style={{ width: '11%' }} />
                  <col style={{ width: '11%' }} />
                </colgroup>
                <thead>
                  <tr
                    style={{
                      background: '#cbd5e1',
                      color: '#1f2937',
                      fontSize: 9,
                      textTransform: 'uppercase',
                      letterSpacing: 0.3,
                    }}
                  >
                    <th style={{ ...thBase, textAlign: 'left' }}>Centro de Custo</th>
                    <th style={thBase}>Média Mensal (R$)</th>
                    <th style={thBase}>Real</th>
                    <th style={thBase}>Meta</th>
                    <th style={thBase}>Δ R$</th>
                    <th style={thBase}>Δ %</th>
                  </tr>
                </thead>
                <tbody>
                  {grupos.map((g) => {
                    const centros = g.centros ?? [];
                    const metaGrupoAusente = g.meta == null || g.meta === 0;
                    return (
                      <Fragment key={g.grupo_custo}>
                        {centros.map((centro) => {
                          // Meta ausente (null ou 0): não exibir Meta/Dif/% — não calcular contra zero.
                          const metaCentroAusente = centro.meta == null || centro.meta === 0;
                          return (
                            <tr key={centro.centro_custo} style={{ background: '#f1f5f9' }}>
                              <td title={centro.centro_custo} style={{ ...cellNome, fontWeight: 600 }}>
                                {centro.centro_custo}
                              </td>
                              <td style={{ ...cellNum, fontWeight: 600 }}>
                                {fmtMediaMensal(centro.realizado)}
                              </td>
                              <td style={{ ...cellNum, fontWeight: 600, color: COR_REAL_COL }}>
                                {fmtRsCabMes(centro.realizado)}
                              </td>
                              <td style={{ ...cellNum, fontWeight: 600, color: COR_META_COL }}>
                                {metaCentroAusente ? '—' : fmtRsCabMes(centro.meta)}
                              </td>
                              <td
                                className={metaCentroAusente ? '' : classeCustoDelta(centro.desvioMetaPct)}
                                style={{ ...cellNum, fontWeight: 600 }}
                              >
                                {metaCentroAusente ? '—' : fmtDifRsCabMes(centro.realizado, centro.meta)}
                              </td>
                              <td
                                className={metaCentroAusente ? '' : classeCustoDelta(centro.desvioMetaPct)}
                                style={{ ...cellNum, fontWeight: 600 }}
                              >
                                {metaCentroAusente ? '—' : pct(centro.desvioMetaPct)}
                              </td>
                            </tr>
                          );
                        })}
                        {/* ── TOTAL do grupo (nó grupo) ── */}
                        <tr style={{ background: '#e2e8f0' }}>
                          <td style={{ ...cellNome, fontWeight: 700, fontSize: 12, borderTop: bordaGrupo }}>
                            TOTAL
                          </td>
                          <td style={{ ...cellNum, fontWeight: 700, borderTop: bordaGrupo }}>
                            {fmtMediaMensal(g.realizado)}
                          </td>
                          <td style={{ ...cellNum, fontWeight: 700, color: COR_REAL_COL, borderTop: bordaGrupo }}>
                            {fmtRsCabMes(g.realizado)}
                          </td>
                          <td style={{ ...cellNum, fontWeight: 700, color: COR_META_COL, borderTop: bordaGrupo }}>
                            {metaGrupoAusente ? '—' : fmtRsCabMes(g.meta)}
                          </td>
                          <td
                            className={metaGrupoAusente ? '' : classeCustoDelta(g.desvioMetaPct)}
                            style={{ ...cellNum, fontWeight: 700, borderTop: bordaGrupo }}
                          >
                            {metaGrupoAusente ? '—' : fmtDifRsCabMes(g.realizado, g.meta)}
                          </td>
                          <td
                            className={metaGrupoAusente ? '' : classeCustoDelta(g.desvioMetaPct)}
                            style={{ ...cellNum, fontWeight: 700, borderTop: bordaGrupo }}
                          >
                            {metaGrupoAusente ? '—' : pct(g.desvioMetaPct)}
                          </td>
                        </tr>
                      </Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* ── DIREITA: donut de composição do grupo (~40%) ── */}
          <div style={{ flex: '1 1 40%', minWidth: 0, paddingTop: 10 }}>
            <div style={{ position: 'relative', width: '100%', height: 150 }}>
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={slices}
                    dataKey="valor"
                    nameKey="nome"
                    cx="50%"
                    cy="50%"
                    innerRadius={40}
                    outerRadius={62}
                    stroke="none"
                    isAnimationActive={false}
                  >
                    {slices.map((d, i) => (
                      <Cell key={i} fill={d.cor} />
                    ))}
                  </Pie>
                  <Tooltip
                    formatter={(_v: number, name: string, entry: { payload?: { valor?: number; real?: number } }) => {
                      const p = entry?.payload ?? {};
                      return [`${fmt(p.valor ?? 0, 2)} R$/cab/mês (${partPct(p.real ?? 0)})`, name];
                    }}
                    contentStyle={{ fontSize: 11 }}
                  />
                </PieChart>
              </ResponsiveContainer>
              <div
                style={{
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  width: '100%',
                  height: '100%',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  pointerEvents: 'none',
                }}
              >
                <div style={{ fontSize: 9, color: '#6b7280', textTransform: 'uppercase', letterSpacing: 0.3 }}>
                  Total
                </div>
                <div style={{ fontSize: 16, fontWeight: 700, color: '#111' }}>
                  {totalRealRsCabMes != null ? fmt(totalRealRsCabMes, 2) : '—'}
                </div>
                <div style={{ fontSize: 9, color: '#6b7280' }}>R$/cab/mês</div>
              </div>
            </div>
            {/* legenda: centro + participação */}
            <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 2 }}>
              {slices.map((d, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 9 }}>
                  <span style={{ width: 8, height: 8, borderRadius: 2, background: d.cor, flexShrink: 0 }} />
                  <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {d.nome}
                  </span>
                  <span style={{ fontVariantNumeric: 'tabular-nums', color: '#374151' }}>{partPct(d.real)}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </BoletimContainer>
  );
}
