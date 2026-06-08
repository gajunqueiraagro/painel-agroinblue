/**
 * DesembolsoProducao — Página 6 do Fechamento do Período.
 * Bloco "Custos Pecuários Realizados" (modelo novo):
 *   cards enriquecidos + 3 gráficos (R$/cab, R$/@, R$ acumulado) +
 *   tabela Resumo por Centro/Subcentro (header Rebanho Médio) + donut Composição.
 *
 * REGRA: zero fórmula nova. Tudo vem do PC-100 (séries/deltas) e do DTO
 * (estruturaCustos). Cores do design system. Sem mock, sem "fazer número bater".
 */

import { Fragment, useState, type CSSProperties } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import {
  Bar,
  Line,
  ComposedChart,
  LineChart,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
} from 'recharts';
import type { FechamentoPeriodoDTO, GrupoNode } from '@/v2/types/fechamentoPeriodo';
import { fmt, pct } from './fmt';

// ── Cores (design system — espelhadas de BlocoMovimentacoesRebanhoFechamento) ──
const COR_REAL = '#dc2626';    // vermelho — Realizado
const COR_META = '#f97316';    // laranja — Meta (linha pontilhada)
const COR_ANOANT = '#9ca3af';  // cinza — Ano anterior
const COR_BARRA = '#cbd5e1';   // cinza claro — barras (valor do mês)
const CORES_DONUT = ['#dc2626', '#f97316', '#0ea5e9', '#8b5cf6', '#10b981', '#eab308', '#ec4899', '#14b8a6', '#6366f1', '#f43f5e'];

const MESES_CURTOS = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];

// Custos Pecuários = Custo Fixo Pec + Custo Variável Pec. Juros e Investimento
// NÃO entram aqui (pertencem a outros blocos do fechamento).
const GRUPOS_PEC = new Set([
  'Custo Fixo Pecuária',
  'Custo Variável Pecuária',
]);

// Cor de custo (sinal invertido vs. receita): custo acima da meta (>0) é
// ruim → vermelho; abaixo (<0) é economia → verde. NÃO usar classeDiferenca.
function classeCustoDelta(v: number | null | undefined): string {
  if (v == null || !Number.isFinite(v)) return '';
  if (v > 0.05) return 'dif-negativa';   // custo acima da meta → vermelho
  if (v < -0.05) return 'dif-positiva';  // custo abaixo da meta → verde
  return '';
}

/** Valor de uma série 1..12 num índice; null se ausente/não-finito (nunca zero falso). */
function at(arr: number[] | undefined, i: number): number | null {
  if (!arr) return null;
  const v = arr[i];
  return Number.isFinite(v) ? v : null;
}

/** true se a série tem ao menos um ponto finito no período (senão a linha some). */
function temSerie(arr: number[] | undefined, meses: number[]): boolean {
  return !!arr && meses.some(mi => Number.isFinite(arr[mi]));
}

interface Props {
  dto: FechamentoPeriodoDTO;
  /** Totais soberanos do PC-100 (Visão Geral), espelhados nos cards. */
  custoCab: number | null;
  custoArr: number | null;
  custeioAcum: number | null;

  // ── Gráfico 1 (R$/cab) ──
  custoCabSerieMes: number[];        // .serieMensal  (valor do mês)
  custoCabSerieAcum: number[];       // .serieAno     (período = média acumulada)
  custoCabSerieMeta?: number[];      // .serieMeta
  custoCabSerieAnoAnt?: number[];    // .serieAnoAnt
  custoCabDeltaMeta: number | null;  // .deltaMeta (% — oficial, não recalcular)
  custoCabDeltaAno: number | null;   // .deltaAno  (%)

  // ── Gráfico 2 (R$/@) ──
  custoArrSerieMes: number[];        // .serieMensal
  custoArrSerieAcum: number[];       // .serieAno
  custoArrSerieMeta?: number[];      // .serieMeta
  custoArrSerieAnoAnt?: number[];    // .serieAnoAnt
  custoArrDeltaMeta: number | null;  // .deltaMeta (%)
  custoArrDeltaAno: number | null;   // .deltaAno  (%)

  // ── Gráfico 3 (R$ acumulado — SÓ LINHAS) ──
  custeioSerieAcum: number[];        // .serieAno (período = cumsum R$)
  custeioSerieMeta?: number[];       // .serieMeta
  custeioSerieAnoAnt?: number[];     // .serieAnoAnt
  custeioDeltaMeta: number | null;   // .deltaMeta (%)
  custeioDeltaAno: number | null;    // .deltaAno  (%)

  // ── Eixo / período ──
  mesAlvoIdx: number;                // 1..12 (= mesAlvo)
  labelsMeses: string[];             // dto.meses ("YYYY-MM")
  numMeses: number;                  // dto.meses.length

  // ── Rebanho médio (header da tabela) — período, viewMode='periodo' ──
  rebanhoMedioReal: number | null;   // cabecasIndicador.valor
  rebanhoMedioMeta: number | null;   // cabecasIndicador.serieMetaIndicador?.[mesAlvo]
}

export default function DesembolsoProducao({
  dto,
  custoCab,
  custoArr,
  custeioAcum,
  custoCabSerieMes,
  custoCabSerieAcum,
  custoCabSerieMeta,
  custoCabSerieAnoAnt,
  custoCabDeltaMeta,
  custoCabDeltaAno,
  custoArrSerieMes,
  custoArrSerieAcum,
  custoArrSerieMeta,
  custoArrSerieAnoAnt,
  custoArrDeltaMeta,
  custoArrDeltaAno,
  custeioSerieAcum,
  custeioSerieMeta,
  custeioSerieAnoAnt,
  custeioDeltaMeta,
  custeioDeltaAno,
  mesAlvoIdx,
  labelsMeses,
  numMeses,
  rebanhoMedioReal,
  rebanhoMedioMeta,
}: Props) {
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

  // Meses do período → índices absolutos 1..12 ("2026-03" → 3). As séries do
  // PC-100 são indexadas por mês absoluto; mapeamos label + valor por aqui.
  const mesesIdx = labelsMeses.map(ym => parseInt(ym.split('-')[1], 10));

  // ── Dados dos 3 gráficos ──
  const dataG1 = mesesIdx.map(mi => ({
    mes: MESES_CURTOS[mi - 1],
    barra: at(custoCabSerieMes, mi),
    real: at(custoCabSerieAcum, mi),
    meta: at(custoCabSerieMeta, mi),
    anoAnt: at(custoCabSerieAnoAnt, mi),
  }));
  const dataG2 = mesesIdx.map(mi => ({
    mes: MESES_CURTOS[mi - 1],
    barra: at(custoArrSerieMes, mi),
    real: at(custoArrSerieAcum, mi),
    meta: at(custoArrSerieMeta, mi),
    anoAnt: at(custoArrSerieAnoAnt, mi),
  }));
  const dataG3 = mesesIdx.map(mi => ({
    mes: MESES_CURTOS[mi - 1],
    real: at(custeioSerieAcum, mi),
    meta: at(custeioSerieMeta, mi),
    anoAnt: at(custeioSerieAnoAnt, mi),
  }));

  const g1HasMeta = temSerie(custoCabSerieMeta, mesesIdx);
  const g1HasAnoAnt = temSerie(custoCabSerieAnoAnt, mesesIdx);
  const g2HasMeta = temSerie(custoArrSerieMeta, mesesIdx);
  const g2HasAnoAnt = temSerie(custoArrSerieAnoAnt, mesesIdx);
  const g3HasMeta = temSerie(custeioSerieMeta, mesesIdx);
  const g3HasAnoAnt = temSerie(custeioSerieAnoAnt, mesesIdx);

  // ── Cards enriquecidos ──
  const cards = [
    {
      titulo: 'Custeio médio cab./mês',
      dec: 2,
      valor: custoCab,
      mes: at(custoCabSerieMes, mesAlvoIdx),
      meta: at(custoCabSerieMeta, mesAlvoIdx),
      anoAnt: at(custoCabSerieAnoAnt, mesAlvoIdx),
      deltaMeta: custoCabDeltaMeta,
      deltaAno: custoCabDeltaAno,
    },
    {
      titulo: 'Custo Produtivo R$/@',
      dec: 2,
      valor: custoArr,
      mes: at(custoArrSerieMes, mesAlvoIdx),
      meta: at(custoArrSerieMeta, mesAlvoIdx),
      anoAnt: at(custoArrSerieAnoAnt, mesAlvoIdx),
      deltaMeta: custoArrDeltaMeta,
      deltaAno: custoArrDeltaAno,
    },
    {
      titulo: 'Custeio Produção Pecuária acum.',
      dec: 0,
      valor: custeioAcum,
      mes: null, // custeio não expõe série mensal (decisão do Sub-PR A)
      meta: at(custeioSerieMeta, mesAlvoIdx),
      anoAnt: at(custeioSerieAnoAnt, mesAlvoIdx),
      deltaMeta: custeioDeltaMeta,
      deltaAno: custeioDeltaAno,
    },
  ];

  // ── Donut "Composição do Custeio" — por CENTRO (agrega centros dos 2 grupos
  //    Pec), MESMA fonte e MESMO denom da tabela. Σ fatias = custoCab; cada
  //    fatia = centro.realizado / denom → bate linha↔donut por construção. ──
  const donutData = denom != null
    ? gruposPec
        .flatMap(g => g.centros)
        .filter(c => c.realizado != null && c.realizado > 0)
        .sort((a, b) => (b.realizado ?? 0) - (a.realizado ?? 0))
        .map((c, i) => ({
          nome: c.centro_custo,
          valor: (c.realizado ?? 0) / denom,
          cor: CORES_DONUT[i % CORES_DONUT.length],
        }))
    : [];

  const tipR$cab = (v: number | number[]) => `R$ ${fmt(Array.isArray(v) ? v[0] : v, 2)}`;
  const tipR$ = (v: number | number[]) => `R$ ${fmt(Array.isArray(v) ? v[0] : v, 0)}`;

  return (
    <section className="pagina-fechamento bloco-custos">
      <h2>Custos Pecuários Realizados</h2>

      {/* ── CARDS enriquecidos = totais soberanos do PC-100 (Visão Geral) ── */}
      <div className="cards-grid">
        {cards.map(c => (
          <div className="card-mini" key={c.titulo}>
            <div className="card-mini-titulo">{c.titulo}</div>
            <div className="card-mini-valor">R$ {fmt(c.valor, c.dec)}</div>
            <div style={{ fontSize: 9, color: '#6b7280', marginTop: 4, lineHeight: 1.5 }}>
              {c.mes != null && <div>Mês: R$ {fmt(c.mes, c.dec)}</div>}
              <div>Meta: {c.meta != null ? `R$ ${fmt(c.meta, c.dec)}` : '—'}</div>
              <div>Ano ant.: {c.anoAnt != null ? `R$ ${fmt(c.anoAnt, c.dec)}` : '—'}</div>
              <div>
                Var. vs meta:{' '}
                <span className={classeCustoDelta(c.deltaMeta)}>{pct(c.deltaMeta)}</span>
              </div>
              <div>
                Var. vs ano ant.:{' '}
                <span className={classeCustoDelta(c.deltaAno)}>{pct(c.deltaAno)}</span>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* ── 3 GRÁFICOS (grid 3-col na tela) ── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16, margin: '12px 0' }}>
        {/* Gráfico 1 — R$/cab */}
        <div style={{ border: '1px solid #e5e7eb', borderRadius: 4, padding: 8 }}>
          <div style={{ fontSize: 10, fontWeight: 600, color: '#374151', marginBottom: 4 }}>
            Custeio Médio Cab./Mês (R$/cab.)
          </div>
          <div style={{ width: '100%', height: 200 }}>
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={dataG1} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                <XAxis dataKey="mes" tick={{ fontSize: 10 }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 9 }} axisLine={false} tickLine={false} width={36} />
                <Tooltip formatter={tipR$cab} contentStyle={{ fontSize: 11 }} />
                <Legend wrapperStyle={{ fontSize: 10 }} />
                <Bar dataKey="barra" name="Mês" fill={COR_BARRA} radius={[3, 3, 0, 0]} isAnimationActive={false} />
                <Line dataKey="real" name="Realizado" stroke={COR_REAL} strokeWidth={2} dot={false} isAnimationActive={false} connectNulls={false} />
                {g1HasMeta && (
                  <Line dataKey="meta" name="Meta" stroke={COR_META} strokeWidth={2} strokeDasharray="4 3" dot={false} isAnimationActive={false} connectNulls={false} />
                )}
                {g1HasAnoAnt && (
                  <Line dataKey="anoAnt" name="Ano ant." stroke={COR_ANOANT} strokeWidth={2} dot={false} isAnimationActive={false} connectNulls={false} />
                )}
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Gráfico 2 — R$/@ */}
        <div style={{ border: '1px solid #e5e7eb', borderRadius: 4, padding: 8 }}>
          <div style={{ fontSize: 10, fontWeight: 600, color: '#374151', marginBottom: 4 }}>
            Custo Produtivo (R$/@)
          </div>
          <div style={{ width: '100%', height: 200 }}>
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={dataG2} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                <XAxis dataKey="mes" tick={{ fontSize: 10 }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 9 }} axisLine={false} tickLine={false} width={36} />
                <Tooltip formatter={tipR$cab} contentStyle={{ fontSize: 11 }} />
                <Legend wrapperStyle={{ fontSize: 10 }} />
                <Bar dataKey="barra" name="Mês" fill={COR_BARRA} radius={[3, 3, 0, 0]} isAnimationActive={false} />
                <Line dataKey="real" name="Realizado" stroke={COR_REAL} strokeWidth={2} dot={false} isAnimationActive={false} connectNulls={false} />
                {g2HasMeta && (
                  <Line dataKey="meta" name="Meta" stroke={COR_META} strokeWidth={2} strokeDasharray="4 3" dot={false} isAnimationActive={false} connectNulls={false} />
                )}
                {g2HasAnoAnt && (
                  <Line dataKey="anoAnt" name="Ano ant." stroke={COR_ANOANT} strokeWidth={2} dot={false} isAnimationActive={false} connectNulls={false} />
                )}
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Gráfico 3 — R$ acumulado (SÓ LINHAS, sem barras) */}
        <div style={{ border: '1px solid #e5e7eb', borderRadius: 4, padding: 8 }}>
          <div style={{ fontSize: 10, fontWeight: 600, color: '#374151', marginBottom: 4 }}>
            Custeio Produção Pecuária Acumulado (R$)
          </div>
          <div style={{ width: '100%', height: 200 }}>
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={dataG3} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                <XAxis dataKey="mes" tick={{ fontSize: 10 }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 9 }} axisLine={false} tickLine={false} width={44} />
                <Tooltip formatter={tipR$} contentStyle={{ fontSize: 11 }} />
                <Legend wrapperStyle={{ fontSize: 10 }} />
                <Line dataKey="real" name="Realizado" stroke={COR_REAL} strokeWidth={2} dot={false} isAnimationActive={false} connectNulls={false} />
                {g3HasMeta && (
                  <Line dataKey="meta" name="Meta" stroke={COR_META} strokeWidth={2} strokeDasharray="4 3" dot={false} isAnimationActive={false} connectNulls={false} />
                )}
                {g3HasAnoAnt && (
                  <Line dataKey="anoAnt" name="Ano ant." stroke={COR_ANOANT} strokeWidth={2} dot={false} isAnimationActive={false} connectNulls={false} />
                )}
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* ── TABELA (Resumo por Centro/Subcentro) + DONUT (linha de baixo) ── */}
      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 16, alignItems: 'start' }}>
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
            <h3 style={{ margin: 0 }}>Resumo por Centro / Subcentro</h3>
            <div style={{ fontSize: 10, color: '#374151', textAlign: 'right' }}>
              <span>Rebanho Médio Real: <strong>{fmt(rebanhoMedioReal, 0)}</strong></span>
              {rebanhoMedioMeta != null && (
                <span style={{ marginLeft: 12 }}>Rebanho Médio Meta: <strong>{fmt(rebanhoMedioMeta, 0)}</strong></span>
              )}
            </div>
          </div>
          {gruposPec.map(g => (
            <GrupoExpansivel key={g.grupo_custo} grupo={g} denom={denom} numMeses={numMeses} />
          ))}
        </div>

        {/* Donut Composição do Custeio */}
        <div style={{ border: '1px solid #e5e7eb', borderRadius: 4, padding: 8 }}>
          <div style={{ fontSize: 10, fontWeight: 600, color: '#374151', marginBottom: 4 }}>
            Composição do Custeio (R$/cab/mês)
          </div>
          {donutData.length > 0 && custoCab != null && custoCab > 0 ? (
            <>
              <div style={{ position: 'relative', width: '100%', height: 160 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={donutData}
                      dataKey="valor"
                      nameKey="nome"
                      cx="50%"
                      cy="50%"
                      innerRadius={42}
                      outerRadius={64}
                      stroke="none"
                      isAnimationActive={false}
                    >
                      {donutData.map((d, i) => <Cell key={i} fill={d.cor} />)}
                    </Pie>
                    <Tooltip
                      formatter={(v: number, name: string) => [`R$ ${fmt(v, 2)} (${pct((v / custoCab) * 100)})`, name]}
                      contentStyle={{ fontSize: 11 }}
                    />
                  </PieChart>
                </ResponsiveContainer>
                <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', pointerEvents: 'none' }}>
                  <span style={{ fontSize: 12, fontWeight: 700 }}>R$ {fmt(custoCab, 2)}</span>
                  <span style={{ fontSize: 8, color: '#6b7280' }}>R$/cab/mês</span>
                </div>
              </div>
              <div style={{ fontSize: 10, lineHeight: 1.6, marginTop: 4 }}>
                {donutData.map(d => (
                  <div key={d.nome} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                    <span style={{ width: 8, height: 8, borderRadius: 2, background: d.cor, display: 'inline-block', flexShrink: 0 }} />
                    <span style={{ flex: 1, minWidth: 0 }}>{d.nome}</span>
                    <span style={{ color: '#6b7280', whiteSpace: 'nowrap' }}>R$ {fmt(d.valor, 2)} · {pct((d.valor / custoCab) * 100)}</span>
                  </div>
                ))}
              </div>
            </>
          ) : (
            <div style={{ height: 160, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, color: '#9ca3af', fontStyle: 'italic' }}>
              Sem dados
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

function GrupoExpansivel({ grupo, denom, numMeses }: { grupo: GrupoNode; denom: number | null; numMeses: number }) {
  const [aberto, setAberto] = useState(true);

  // R$/cab/mês — denominador global (cabMed × qtdMeses), igual a todas as linhas.
  const rsCabMes = (v: number | null | undefined): number | null =>
    (v != null && denom != null && denom > 0) ? v / denom : null;
  // R$ médio do período = realizado / numMeses (numMeses = dto.meses.length).
  const rsMedioPeriodo = (v: number | null | undefined): number | null =>
    (v != null && numMeses > 0) ? v / numMeses : null;
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
  const fmtMedioPeriodo = (v: number | null | undefined): string => {
    const r = rsMedioPeriodo(v);
    return r != null ? `R$ ${fmt(r)}` : '—';
  };

  // ── Estilos locais (inline) — refinamento visual sem tocar printStyles.css ──
  const cell: CSSProperties = { padding: '3px 8px', borderBottom: '1px solid #eef0f3' };
  const cellNum: CSSProperties = { ...cell, textAlign: 'right', fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' };
  // Nome (Centro/Subcentro): uma linha, ellipsis quando longo. maxWidth:0 faz o
  // ellipsis respeitar a largura do <col> sob table-layout:fixed.
  const cellNome: CSSProperties = { ...cell, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 0 };
  const cellSubNome: CSSProperties = { ...cellNome, paddingTop: 1, paddingBottom: 1 };
  const COR_REAL_COL = '#dc2626'; // coluna Real sempre vermelho
  const COR_META_COL = '#f97316'; // coluna Meta sempre laranja
  const bordaGrupo = '1px solid #cbd5e1';

  // Nível 1 — agregado do próprio nó grupo (NÃO somar centros).
  const metaGrupoAusente = grupo.meta == null || grupo.meta === 0;

  return (
    <div style={{ margin: '10px 0', border: '1px solid #e5e7eb', borderRadius: 6, overflow: 'hidden' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', tableLayout: 'fixed', fontSize: 10, color: '#111' }}>
        <colgroup>
          <col style={{ width: '40%' }} />
          <col style={{ width: '16%' }} />
          <col style={{ width: '11%' }} />
          <col style={{ width: '11%' }} />
          <col style={{ width: '11%' }} />
          <col style={{ width: '11%' }} />
        </colgroup>
        <tbody>
          {/* ── NÍVEL 1 — Grupo macro: faixa forte, clicável, linha completa ── */}
          <tr onClick={() => setAberto(v => !v)} style={{ cursor: 'pointer', background: '#e2e8f0' }}>
            <td title={grupo.grupo_custo} style={{ ...cellNome, fontWeight: 700, fontSize: 12, borderBottom: bordaGrupo }}>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
                {aberto ? <ChevronDown size={14} style={{ flexShrink: 0 }} /> : <ChevronRight size={14} style={{ flexShrink: 0 }} />}
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{grupo.grupo_custo}</span>
              </span>
            </td>
            <td style={{ ...cellNum, fontWeight: 700, borderBottom: bordaGrupo }}>{fmtMedioPeriodo(grupo.realizado)}</td>
            <td style={{ ...cellNum, fontWeight: 700, color: COR_REAL_COL, borderBottom: bordaGrupo }}>{fmtRsCabMes(grupo.realizado)}</td>
            <td style={{ ...cellNum, fontWeight: 700, color: COR_META_COL, borderBottom: bordaGrupo }}>{metaGrupoAusente ? '—' : fmtRsCabMes(grupo.meta)}</td>
            <td className={metaGrupoAusente ? '' : classeCustoDelta(grupo.desvioMetaPct)} style={{ ...cellNum, fontWeight: 700, borderBottom: bordaGrupo }}>{metaGrupoAusente ? '—' : fmtDifRsCabMes(grupo.realizado, grupo.meta)}</td>
            <td className={metaGrupoAusente ? '' : classeCustoDelta(grupo.desvioMetaPct)} style={{ ...cellNum, fontWeight: 700, borderBottom: bordaGrupo }}>{metaGrupoAusente ? '—' : pct(grupo.desvioMetaPct)}</td>
          </tr>

          {/* Rótulos das colunas (sutis) — só quando aberto */}
          {aberto && (
            <tr style={{ background: '#f8fafc', color: '#6b7280', fontSize: 9, textTransform: 'uppercase', letterSpacing: 0.3 }}>
              <td style={{ ...cell, fontWeight: 600 }}>Centro / Subcentro</td>
              <td style={{ ...cellNum, fontWeight: 600 }}>Média Período</td>
              <td style={{ ...cellNum, fontWeight: 600 }}>Real</td>
              <td style={{ ...cellNum, fontWeight: 600 }}>Meta</td>
              <td style={{ ...cellNum, fontWeight: 600 }}>Δ R$</td>
              <td style={{ ...cellNum, fontWeight: 600 }}>Δ %</td>
            </tr>
          )}

          {aberto && grupo.centros.map(centro => {
            // Meta ausente (null ou 0): não exibir Meta/Dif/% — não calcular contra zero.
            const metaCentroAusente = centro.meta == null || centro.meta === 0;
            return (
              <Fragment key={centro.centro_custo}>
                {/* ── NÍVEL 2 — Centro: fundo evidente, bold ── */}
                <tr style={{ background: '#f1f5f9' }}>
                  <td title={centro.centro_custo} style={{ ...cellNome, fontWeight: 600 }}>{centro.centro_custo}</td>
                  <td style={{ ...cellNum, fontWeight: 600 }}>{fmtMedioPeriodo(centro.realizado)}</td>
                  <td style={{ ...cellNum, fontWeight: 600, color: COR_REAL_COL }}>{fmtRsCabMes(centro.realizado)}</td>
                  <td style={{ ...cellNum, fontWeight: 600, color: COR_META_COL }}>{metaCentroAusente ? '—' : fmtRsCabMes(centro.meta)}</td>
                  <td className={metaCentroAusente ? '' : classeCustoDelta(centro.desvioMetaPct)} style={{ ...cellNum, fontWeight: 600 }}>{metaCentroAusente ? '—' : fmtDifRsCabMes(centro.realizado, centro.meta)}</td>
                  <td className={metaCentroAusente ? '' : classeCustoDelta(centro.desvioMetaPct)} style={{ ...cellNum, fontWeight: 600 }}>{metaCentroAusente ? '—' : pct(centro.desvioMetaPct)}</td>
                </tr>
                {/* ── NÍVEL 3 — Subcentro: recuado, menor, fundo branco ── */}
                {centro.subcentros.map(sub => {
                  const metaSubAusente = sub.meta == null || sub.meta === 0;
                  return (
                    <tr key={`${centro.centro_custo}-${sub.subcentro}`} style={{ background: '#fff' }}>
                      <td title={sub.subcentro} style={{ ...cellSubNome, paddingLeft: 28, color: '#4b5563', fontSize: 9 }}>{sub.subcentro}</td>
                      <td style={{ ...cellNum, fontSize: 9 }}>{fmtMedioPeriodo(sub.realizado)}</td>
                      <td style={{ ...cellNum, fontSize: 9, color: COR_REAL_COL }}>{fmtRsCabMes(sub.realizado)}</td>
                      <td style={{ ...cellNum, fontSize: 9, color: COR_META_COL }}>{metaSubAusente ? '—' : fmtRsCabMes(sub.meta)}</td>
                      <td className={metaSubAusente ? '' : classeCustoDelta(sub.desvioMetaPct)} style={{ ...cellNum, fontSize: 9 }}>{metaSubAusente ? '—' : fmtDifRsCabMes(sub.realizado, sub.meta)}</td>
                      <td className={metaSubAusente ? '' : classeCustoDelta(sub.desvioMetaPct)} style={{ ...cellNum, fontSize: 9 }}>{metaSubAusente ? '—' : pct(sub.desvioMetaPct)}</td>
                    </tr>
                  );
                })}
              </Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
