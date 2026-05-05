import { useEffect, useState } from 'react';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
  BarChart,
  Bar,
  Cell,
  ReferenceArea,
} from 'recharts';
import { supabase } from '@/integrations/supabase/client';

interface Props {
  open: boolean;
  onClose: () => void;
  titulo: string;
  unidade?: string;
  formatoValor?: 'inteiro' | 'decimal1' | 'decimal3' | 'moeda';
  /** Mês selecionado (1–12) — usado para destacar o ponto no gráfico. */
  mesAtual: number;
  anoAtual: number;
  /** Série de 13 posições: [0]=Dez ano ant, [1..12]=Jan..Dez do ano. */
  serieAno: number[];
  /** Série de 13 posições do ano anterior. */
  serieAnoAnt?: number[];
  /** Série de 13 posições da meta. */
  serieMeta?: number[];
  /** Como agregar Jan→mesAtual no bloco "Resumo do período". */
  tipoAcumulado?: 'soma' | 'media' | 'posicao';
  /** Sobrescreve o label do período (default: "Jan–{mesAtual}"). */
  labelPeriodo?: string;
  /** Identificador do indicador (gera a query histórica correta). */
  indicadorKey: 'cabecas' | 'pesoMedio' | 'arrobas' | 'gmd' | 'desfrute' | 'valorRebanho';
  /** Cliente — necessário para query histórica. */
  clienteId?: string;
  /** Fazenda específica; null = global (somar todas as fazendas do cliente). */
  fazendaId?: string | null;
  /** Ano inicial do histórico; default: anoAtual - 6. */
  anoInicio?: number;
  /** Subtítulo opcional exibido abaixo do título. */
  subtitulo?: string;
  /** Variação % vs mês anterior — calculado fora; null oculta a linha. */
  deltaMes?: number | null;
  /** Variação % vs ano anterior — calculado fora; null oculta a linha. */
  deltaAno?: number | null;
}

const MESES_LABELS = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];

const fmtN = (v: number | null | undefined, casas: number) =>
  v == null || isNaN(v) ? '—' : v.toLocaleString('pt-BR', { minimumFractionDigits: casas, maximumFractionDigits: casas });

const fmtR = (v: number | null | undefined) =>
  v == null || isNaN(v) ? '—' : v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

export function IndicadorHistoricoModal({
  open,
  onClose,
  titulo,
  unidade,
  formatoValor = 'decimal1',
  mesAtual,
  anoAtual,
  serieAno,
  serieAnoAnt,
  serieMeta,
  tipoAcumulado,
  labelPeriodo,
  indicadorKey,
  clienteId,
  fazendaId,
  anoInicio,
  subtitulo,
  deltaMes,
  deltaAno,
}: Props) {
  const [historico, setHistorico] = useState<Array<{ ano: number; valor: number | null }>>([]);
  const [historicoMeta, setHistoricoMeta] = useState<Array<{ ano: number; valor: number | null }>>([]);
  const [serieMetaLocal, setSerieMetaLocal] = useState<(number | null)[]>([]);
  const [loadingHistorico, setLoadingHistorico] = useState(false);

  useEffect(() => {
    if (!open || !clienteId || indicadorKey === 'valorRebanho') return;

    const inicio = anoInicio ?? anoAtual - 6;
    let cancelled = false;

    setHistoricoMeta([]);
    setSerieMetaLocal([]);
    setLoadingHistorico(true);

    const calcValorRows = (rowsMes: any[], rowsPer: any[]): number | null => {
      if (indicadorKey === 'cabecas') {
        const s = rowsMes.reduce((acc: number, r: any) => acc + (Number(r.saldo_final) || 0), 0);
        return s > 0 ? s : null;
      } else if (indicadorKey === 'pesoMedio') {
        const ptf = rowsMes.reduce((acc: number, r: any) => acc + (Number(r.peso_total_final) || 0), 0);
        const sf  = rowsMes.reduce((acc: number, r: any) => acc + (Number(r.saldo_final) || 0), 0);
        return sf > 0 ? ptf / sf : null;
      } else if (indicadorKey === 'arrobas') {
        const pb = rowsPer.reduce((acc: number, r: any) => acc + (Number(r.producao_biologica) || 0), 0);
        return pb > 0 ? pb / 30 : null;
      } else if (indicadorKey === 'gmd') {
        const vals = rowsPer.map((r: any) => Number(r.gmd)).filter((v: number) => !isNaN(v) && v > 0);
        return vals.length > 0 ? vals.reduce((s: number, v: number) => s + v, 0) / vals.length : null;
      } else if (indicadorKey === 'desfrute') {
        const s = rowsPer.reduce((acc: number, r: any) => acc + (Number(r.saidas_externas) || 0), 0);
        return s > 0 ? s : null;
      }
      return null;
    };

    (async () => {
      try {
        let query = supabase
          .from('zoot_mensal_cache')
          .select(`
            ano,
            mes,
            cenario,
            saldo_final,
            peso_total_final,
            producao_biologica,
            saidas_externas,
            gmd,
            fazenda:fazendas!inner(cliente_id)
          `)
          .eq('fazenda.cliente_id', clienteId)
          .in('cenario', ['realizado', 'meta'])
          .gte('ano', inicio)
          .lte('ano', anoAtual)
          .lte('mes', mesAtual);

        if (fazendaId) {
          query = query.eq('fazenda_id', fazendaId);
        }

        const { data, error } = await query;
        if (cancelled) return;
        if (error || !data) {
          setHistorico([]);
          return;
        }

        const porAnoRealizado: Record<number, any[]> = {};
        const porAnoMeta: Record<number, any[]> = {};
        for (const r of data as any[]) {
          if ((r as any).cenario === 'meta') {
            if (!porAnoMeta[r.ano]) porAnoMeta[r.ano] = [];
            porAnoMeta[r.ano].push(r);
          } else {
            if (!porAnoRealizado[r.ano]) porAnoRealizado[r.ano] = [];
            porAnoRealizado[r.ano].push(r);
          }
        }

        const resultadoRealizado: Array<{ ano: number; valor: number | null }> = [];
        const resultadoMeta: Array<{ ano: number; valor: number | null }> = [];

        for (let a = inicio; a <= anoAtual; a++) {
          const rowsR = porAnoRealizado[a] ?? [];
          const rowsM = porAnoMeta[a] ?? [];
          const rowsRMes = rowsR.filter((r: any) => r.mes === mesAtual);
          const rowsMMes = rowsM.filter((r: any) => r.mes === mesAtual);

          resultadoRealizado.push({ ano: a, valor: calcValorRows(rowsRMes, rowsR) });
          resultadoMeta.push({ ano: a, valor: calcValorRows(rowsMMes, rowsM) });
        }

        // Série mensal meta do anoAtual — agrupa por mês, correto para indicadores com múltiplas categorias
        const metaDoAnoAtual = porAnoMeta[anoAtual] ?? [];
        const serieMetaNova = Array(13).fill(null) as (number | null)[];
        for (let m = 1; m <= 12; m++) {
          const rowsMes = metaDoAnoAtual.filter((r: any) => r.mes === m);
          const rowsPer = metaDoAnoAtual.filter((r: any) => r.mes <= m);
          serieMetaNova[m] = calcValorRows(rowsMes, rowsPer);
        }

        if (!cancelled) {
          setHistorico(resultadoRealizado);
          setHistoricoMeta(resultadoMeta);
          setSerieMetaLocal(serieMetaNova);
        }
      } finally {
        if (!cancelled) setLoadingHistorico(false);
      }
    })();

    return () => { cancelled = true; };
  }, [open, clienteId, fazendaId, indicadorKey, anoAtual, anoInicio, mesAtual]);

  if (!open) return null;

  const fmtValor = (v: number | null | undefined): string => {
    if (formatoValor === 'inteiro') return fmtN(v, 0) + (unidade ? ' ' + unidade : '');
    if (formatoValor === 'decimal1') return fmtN(v, 1) + (unidade ? ' ' + unidade : '');
    if (formatoValor === 'decimal3') return fmtN(v, 3) + (unidade ? ' ' + unidade : '');
    if (formatoValor === 'moeda') return fmtR(v);
    return String(v ?? '—');
  };

  const getMesValue = (serie: number[] | null | undefined, mes: number): number | null => {
    if (!serie || mes < 1 || mes > 12) return null;

    // se vier com 13 posições, assume padrão 1-based: [1]=Jan
    if (serie.length >= 13) {
      const v = serie[mes];
      return v != null && !isNaN(v) ? v : null;
    }

    // se vier com 12 posições, assume padrão 0-based: [0]=Jan
    const v = serie[mes - 1];
    return v != null && !isNaN(v) ? v : null;
  };

  const valorAtual = getMesValue(serieAno, mesAtual);

  const calcDelta = (a: number | null, b: number | null): number | null => {
    if (a == null || b == null || isNaN(a) || isNaN(b) || b === 0) return null;
    return ((a - b) / b) * 100;
  };

  // META vem de serieMetaLocal (carregada pelo modal sob demanda)
  const metaSerieFinal: number[] | undefined = serieMetaLocal.length > 0
    ? (serieMetaLocal as number[])
    : (serieMeta ?? undefined);

  const deltaMetaInterno = calcDelta(valorAtual, getMesValue(metaSerieFinal, mesAtual));

  const dados = MESES_LABELS.map((mes, idx) => ({
    mes,
    // Realizado: corta no mês atual (Jan→mesAtual)
    atual:       idx + 1 <= mesAtual ? getMesValue(serieAno, idx + 1) : null,
    // Ano anterior: série completa Jan–Dez
    anoAnterior: getMesValue(serieAnoAnt, idx + 1),
    // Meta: corta no mês atual (Jan→mesAtual)
    meta:        idx + 1 <= mesAtual ? getMesValue(metaSerieFinal, idx + 1) : null,
  }));

  const hasAnoAnt = serieAnoAnt != null && serieAnoAnt.some(v => v != null && !isNaN(v));
  const hasMeta = metaSerieFinal != null && metaSerieFinal.some(v => v != null && !isNaN(v as number));

  // ── Resumo do período (Jan→mesAtual) ──
  const calcResumo = (serie: number[] | undefined): number | null => {
    if (!serie) return null;
    const vals = MESES_LABELS.slice(0, mesAtual)
      .map((_, i) => getMesValue(serie, i + 1))
      .filter((v): v is number => v != null && !isNaN(v));
    if (vals.length === 0) return null;
    if (tipoAcumulado === 'soma')  return vals.reduce((s, v) => s + v, 0);
    if (tipoAcumulado === 'media') return vals.reduce((s, v) => s + v, 0) / vals.length;
    if (tipoAcumulado === 'posicao') {
      const v = getMesValue(serie, mesAtual);
      return v != null && !isNaN(v) ? v : null;
    }
    const v = getMesValue(serie, mesAtual);
    return v != null && !isNaN(v) ? v : null;
  };

  const labelPer = labelPeriodo ?? `Jan–${MESES_LABELS[mesAtual - 1]}`;

  // Meta do ano atual: vem de historicoMeta (query do banco) ou fallback do hook
  const metaAnoAtualValor = historicoMeta.find(h => h.ano === anoAtual)?.valor ?? null;
  const metaParaBarra = metaAnoAtualValor ?? (serieMeta ? calcResumo(serieMeta) : null);

  const barDados = [
    ...historico.map(h => ({
      nome: String(h.ano),
      valor: h.valor,
      cor: h.ano === anoAtual ? '#185FA5' : '#B4B2A9',
    })),
    ...(metaParaBarra != null && !isNaN(metaParaBarra)
      ? [{ nome: `Meta ${anoAtual}`, valor: metaParaBarra, cor: '#F97316' }]
      : []),
  ].filter(b => b.valor != null && !isNaN(b.valor as number));

  const CustomTooltip = ({ active, payload, label }: any) => {
    if (!active || !payload || !payload.length) return null;
    return (
      <div className="rounded-md border border-border/40 bg-background px-3 py-2 shadow-md text-sm">
        <p className="font-medium text-foreground mb-1">{label}</p>
        {payload.map((entry: any, i: number) => (
          entry.value != null && (
            <div key={i} className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full" style={{ background: entry.color }} />
              <span className="text-foreground">{fmtValor(entry.value)}</span>
              <span className="text-muted-foreground text-xs">{entry.name}</span>
            </div>
          )
        ))}
      </div>
    );
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
      onClick={onClose}
    >
      <div
        className="w-full max-w-2xl mx-4 rounded-lg border border-border/40 bg-background shadow-xl"
        onClick={e => e.stopPropagation()}
      >
        {/* Header executivo (two-column) */}
        <div className="flex items-start justify-between gap-4 px-5 py-4 border-b border-border/40">
          {/* Esquerda — título + subtítulo */}
          <div className="flex-1 min-w-0">
            <h2 className="text-base font-semibold text-foreground leading-tight">{titulo}</h2>
            {subtitulo && (
              <p className="text-sm text-muted-foreground mt-0.5">{subtitulo}</p>
            )}
          </div>

          {/* Direita — valor + variações */}
          <div className="text-right shrink-0">
            <div className="flex items-baseline gap-1.5 justify-end">
              <span className="text-3xl font-bold text-foreground">{fmtValor(valorAtual)}</span>
              <span className="text-sm text-muted-foreground">
                {MESES_LABELS[mesAtual - 1]} {anoAtual}
              </span>
            </div>
            {deltaMes != null && (
              <div className={`text-sm font-medium flex items-center justify-end gap-1 ${deltaMes >= 0 ? 'text-green-600' : 'text-red-500'}`}>
                <span>{deltaMes >= 0 ? '↗' : '↙'}</span>
                <span>{deltaMes >= 0 ? '+' : ''}{deltaMes.toFixed(1)}% vs mês</span>
              </div>
            )}
            {deltaAno != null && (
              <div className={`text-sm font-medium flex items-center justify-end gap-1 ${deltaAno >= 0 ? 'text-green-600' : 'text-red-500'}`}>
                <span>{deltaAno >= 0 ? '↗' : '↙'}</span>
                <span>{deltaAno >= 0 ? '+' : ''}{deltaAno.toFixed(1)}% vs ano ant.</span>
              </div>
            )}
            {deltaMetaInterno != null && (
              <div className={`text-sm font-medium flex items-center justify-end gap-1 ${deltaMetaInterno >= 0 ? 'text-green-600' : 'text-red-500'}`}>
                <span>{deltaMetaInterno >= 0 ? '↗' : '↙'}</span>
                <span>{deltaMetaInterno >= 0 ? '+' : ''}{deltaMetaInterno.toFixed(1)}% vs META</span>
              </div>
            )}
          </div>
        </div>

        {/* Gráfico */}
        <div className="px-3 pb-3">
          <ResponsiveContainer width="100%" height={220}>
            <LineChart data={dados} margin={{ top: 8, right: 16, left: 8, bottom: 4 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#E8E6DF" vertical={false} />
              <XAxis dataKey="mes" tick={{ fontSize: 11, fill: '#888780' }} stroke="#E8E6DF" />
              <YAxis tick={{ fontSize: 11, fill: '#888780' }} stroke="#E8E6DF" />
              <Tooltip content={<CustomTooltip />} />
              <ReferenceArea
                x1={MESES_LABELS[0]}
                x2={MESES_LABELS[mesAtual - 1]}
                fill="rgba(0,0,0,0.05)"
                strokeOpacity={0}
              />
              {hasAnoAnt && (
                <Line
                  type="monotone"
                  dataKey="anoAnterior"
                  stroke="#B4B2A9"
                  strokeWidth={1.5}
                  strokeDasharray="4 4"
                  dot={{ r: 2, fill: '#B4B2A9' }}
                  connectNulls={false}
                  isAnimationActive={false}
                />
              )}
              {hasMeta && (
                <Line
                  type="monotone"
                  dataKey="meta"
                  stroke="#F97316"
                  strokeWidth={1.5}
                  strokeDasharray="6 3"
                  dot={{ r: 2, fill: '#F97316' }}
                  connectNulls={false}
                  isAnimationActive={false}
                />
              )}
              <Line
                type="monotone"
                dataKey="atual"
                stroke="#185FA5"
                strokeWidth={2}
                connectNulls={false}
                isAnimationActive={false}
                dot={(props: any) => {
                  const isSel = props.index === mesAtual - 1;
                  return isSel
                    ? <circle key={props.index} cx={props.cx} cy={props.cy} r={6} fill="#185FA5" />
                    : <circle key={props.index} cx={props.cx} cy={props.cy} r={2} fill="#B5D4F4" />;
                }}
              />
            </LineChart>
          </ResponsiveContainer>

          {/* Legenda — abaixo do gráfico */}
          <div className="flex gap-5 px-1 mt-3 flex-wrap">
            <div className="flex items-center gap-1.5">
              <div className="w-6 h-[2px] rounded bg-[#185FA5]" />
              <span className="text-xs text-muted-foreground">{anoAtual}</span>
            </div>
            {hasAnoAnt && (
              <div className="flex items-center gap-1.5">
                <svg width="24" height="4"><line x1="0" y1="2" x2="24" y2="2" stroke="#B4B2A9" strokeWidth="2" strokeDasharray="4 3"/></svg>
                <span className="text-xs text-muted-foreground">{anoAtual - 1}</span>
              </div>
            )}
            {hasMeta && (
              <div className="flex items-center gap-1.5">
                <svg width="24" height="4"><line x1="0" y1="2" x2="24" y2="2" stroke="#F97316" strokeWidth="2" strokeDasharray="6 3"/></svg>
                <span className="text-xs text-muted-foreground">Meta {anoAtual}</span>
              </div>
            )}
          </div>
        </div>

        {/* Separador antes do bloco resumo */}
        {indicadorKey !== 'valorRebanho' && (
          <div className="border-t border-border/30 mx-0 mt-4" />
        )}

        {/* Resumo do período (histórico multi-ano) */}
        {indicadorKey !== 'valorRebanho' && (
          <div style={{ padding: '0 1.25rem', marginTop: '0.5rem' }}>
            <div style={{
              borderTop: '0.5px solid var(--color-border-tertiary)',
              paddingTop: '0.75rem', marginBottom: '0.25rem'
            }}>
              <p className="text-xs font-medium text-muted-foreground" style={{ margin: 0 }}>Histórico do período</p>
              <p className="text-xs text-muted-foreground/70" style={{ margin: 0 }}>{labelPer}</p>
            </div>
            {loadingHistorico ? (
              <p style={{ fontSize: 12, color: 'var(--color-text-tertiary)', padding: '1rem 0' }}>Carregando...</p>
            ) : barDados.length > 0 ? (
              <ResponsiveContainer width="100%" height={130}>
                <BarChart data={barDados} margin={{ top: 24, right: 8, left: 8, bottom: 0 }} barCategoryGap="25%">
                  <XAxis dataKey="nome" tick={{ fontSize: 10, fill: '#888780' }} axisLine={false} tickLine={false} />
                  <YAxis hide />
                  <Bar
                    dataKey="valor"
                    radius={[3, 3, 0, 0]}
                    isAnimationActive={false}
                    label={{
                      position: 'top',
                      fontSize: 10,
                      fill: 'var(--color-text-secondary)',
                      formatter: (v: number) => fmtValor(v),
                    }}
                  >
                    {barDados.map((entry, i) => (
                      <Cell key={i} fill={entry.cor} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <p style={{ fontSize: 12, color: 'var(--color-text-tertiary)', padding: '0.5rem 0' }}>Sem dados históricos</p>
            )}
          </div>
        )}

        {/* Rodapé */}
        <div className="px-5 pb-4 text-[12px] text-muted-foreground text-center">
          Clique fora para fechar
        </div>
      </div>
    </div>
  );
}
