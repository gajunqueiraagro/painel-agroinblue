/**
 * DesembolsoProducao — Página 6 do Fechamento do Período.
 * Bloco "Custos Pecuários Realizados" (modelo novo):
 *   cards enriquecidos + 3 gráficos (R$/cab, R$/@, R$ acumulado) +
 *   tabela Resumo por Centro/Subcentro (header Rebanho Médio) + donut Composição.
 *
 * REGRA: zero fórmula nova. Tudo vem do PC-100 (séries/deltas) e do DTO
 * (estruturaCustos). Cores do design system. Sem mock, sem "fazer número bater".
 */

import { useState } from 'react';
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
              <th className="num">R$ médio Período</th>
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
                    <td className="num">{rsMedioPeriodo(centro.realizado) != null ? `R$ ${fmt(rsMedioPeriodo(centro.realizado))}` : '—'}</td>
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
                        <td className="num">{rsMedioPeriodo(sub.realizado) != null ? `R$ ${fmt(rsMedioPeriodo(sub.realizado))}` : '—'}</td>
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
