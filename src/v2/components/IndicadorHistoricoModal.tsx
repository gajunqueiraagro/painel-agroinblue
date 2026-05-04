import { useEffect, useState } from 'react';
import { X } from 'lucide-react';
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
}: Props) {
  const [historico, setHistorico] = useState<Array<{ ano: number; valor: number | null }>>([]);
  const [loadingHistorico, setLoadingHistorico] = useState(false);

  useEffect(() => {
    if (!open || !clienteId || indicadorKey === 'valorRebanho') return;

    const inicio = anoInicio ?? anoAtual - 6;
    let cancelled = false;

    setLoadingHistorico(true);
    (async () => {
      try {
        let query = supabase
          .from('zoot_mensal_cache')
          .select(`
            ano,
            mes,
            saldo_final,
            peso_total_final,
            producao_biologica,
            saidas_externas,
            gmd,
            fazenda:fazendas!inner(cliente_id)
          `)
          .eq('fazenda.cliente_id', clienteId)
          .eq('cenario', 'realizado')
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

        const porAno: Record<number, any[]> = {};
        for (const r of data as any[]) {
          if (!porAno[r.ano]) porAno[r.ano] = [];
          porAno[r.ano].push(r);
        }

        const resultado: Array<{ ano: number; valor: number | null }> = [];
        for (let a = inicio; a <= anoAtual; a++) {
          const rows = porAno[a] ?? [];
          const rowsMes = rows.filter((r: any) => r.mes === mesAtual);
          const rowsPer = rows;

          let valor: number | null = null;

          if (indicadorKey === 'cabecas') {
            const s = rowsMes.reduce((acc: number, r: any) => acc + (Number(r.saldo_final) || 0), 0);
            valor = s > 0 ? s : null;

          } else if (indicadorKey === 'pesoMedio') {
            const ptf = rowsMes.reduce((acc: number, r: any) => acc + (Number(r.peso_total_final) || 0), 0);
            const sf  = rowsMes.reduce((acc: number, r: any) => acc + (Number(r.saldo_final) || 0), 0);
            valor = sf > 0 ? ptf / sf : null;

          } else if (indicadorKey === 'arrobas') {
            const pb = rowsPer.reduce((acc: number, r: any) => acc + (Number(r.producao_biologica) || 0), 0);
            valor = pb > 0 ? pb / 30 : null;

          } else if (indicadorKey === 'gmd') {
            // TODO: refinar para ponderação por cabeças médias quando disponível
            const vals = rowsPer
              .map((r: any) => Number(r.gmd))
              .filter((v: number) => !isNaN(v) && v > 0);
            valor = vals.length > 0 ? vals.reduce((s: number, v: number) => s + v, 0) / vals.length : null;

          } else if (indicadorKey === 'desfrute') {
            const s = rowsPer.reduce((acc: number, r: any) => acc + (Number(r.saidas_externas) || 0), 0);
            valor = s > 0 ? s : null;
          }

          resultado.push({ ano: a, valor });
        }

        if (!cancelled) setHistorico(resultado);
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

  const safeAt = (arr: number[] | undefined, idx: number): number | null => {
    const v = arr?.[idx];
    return v != null && !isNaN(v) ? v : null;
  };

  const dados = MESES_LABELS.map((mes, idx) => ({
    mes,
    atual:       safeAt(serieAno, idx + 1),
    anoAnterior: safeAt(serieAnoAnt, idx + 1),
    meta:        safeAt(serieMeta, idx + 1),
  }));

  const valorMesSelecionado = safeAt(serieAno, mesAtual);

  const hasAnoAnt = serieAnoAnt != null && serieAnoAnt.some(v => v != null && !isNaN(v));
  const hasMeta = serieMeta != null && serieMeta.some(v => v != null && !isNaN(v));

  // ── Resumo do período (Jan→mesAtual) ──
  const calcResumo = (serie: number[] | undefined): number | null => {
    if (!serie) return null;
    const vals = MESES_LABELS.slice(0, mesAtual)
      .map((_, i) => serie[i + 1])
      .filter(v => v != null && !isNaN(v));
    if (vals.length === 0) return null;
    if (tipoAcumulado === 'soma')  return vals.reduce((s, v) => s + v, 0);
    if (tipoAcumulado === 'media') return vals.reduce((s, v) => s + v, 0) / vals.length;
    if (tipoAcumulado === 'posicao') {
      const v = serie[mesAtual];
      return v != null && !isNaN(v) ? v : null;
    }
    const v = serie[mesAtual];
    return v != null && !isNaN(v) ? v : null;
  };

  const metaVal = calcResumo(serieMeta);

  const labelPer = labelPeriodo ?? `Jan–${MESES_LABELS[mesAtual - 1]}`;

  const barDados = [
    ...historico.map(h => ({
      nome: String(h.ano),
      valor: h.valor,
      cor: h.ano === anoAtual ? '#185FA5' : '#B4B2A9',
    })),
    ...(serieMeta && metaVal != null && !isNaN(metaVal)
      ? [{ nome: `Meta ${anoAtual}`, valor: metaVal, cor: '#F97316' }]
      : []),
  ].filter(b => b.valor != null && !isNaN(b.valor as number));

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
      onClick={onClose}
    >
      <div
        className="w-full max-w-2xl mx-4 rounded-lg border border-border/40 bg-background shadow-xl"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-start justify-between p-5 border-b border-border/30">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Histórico mensal</p>
            <p className="text-base font-medium text-foreground mt-0.5">{titulo}</p>
          </div>
          <button
            onClick={onClose}
            className="rounded-md p-1 hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
            aria-label="Fechar"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Valor em destaque */}
        <div className="px-5 pt-4 pb-2">
          <div className="flex items-baseline gap-2">
            <span className="text-[32px] font-medium tabular-nums text-foreground">{fmtValor(valorMesSelecionado)}</span>
            <span className="text-sm text-muted-foreground">
              {MESES_LABELS[mesAtual - 1]} {anoAtual}
            </span>
          </div>
        </div>

        {/* Legenda */}
        <div className="px-5 pb-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-muted-foreground">
          <span className="flex items-center gap-1.5">
            <span className="inline-block w-4 h-[2px] bg-[#185FA5]" />
            {anoAtual}
          </span>
          {hasAnoAnt && (
            <span className="flex items-center gap-1.5">
              <span className="inline-block w-4 h-[1.5px] border-t-[1.5px] border-dashed border-[#B4B2A9]" />
              {anoAtual - 1}
            </span>
          )}
          {hasMeta && (
            <span className="flex items-center gap-1.5">
              <span className="inline-block w-4 h-[1.5px] border-t-[1.5px] border-dashed border-[#F97316]" />
              Meta {anoAtual}
            </span>
          )}
        </div>

        {/* Gráfico */}
        <div className="px-3 pb-3">
          <ResponsiveContainer width="100%" height={220}>
            <LineChart data={dados} margin={{ top: 8, right: 16, left: 8, bottom: 4 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#E8E6DF" vertical={false} />
              <XAxis dataKey="mes" tick={{ fontSize: 11, fill: '#888780' }} stroke="#E8E6DF" />
              <YAxis tick={{ fontSize: 11, fill: '#888780' }} stroke="#E8E6DF" />
              <Tooltip
                contentStyle={{ fontSize: 12, borderRadius: 6 }}
                formatter={(v: any) => fmtValor(typeof v === 'number' ? v : null)}
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
        </div>

        {/* Resumo do período (histórico multi-ano) */}
        {indicadorKey !== 'valorRebanho' && (
          <div style={{ padding: '0 1.25rem', marginTop: '0.5rem' }}>
            <div style={{
              borderTop: '0.5px solid var(--color-border-tertiary)',
              paddingTop: '0.75rem', marginBottom: '0.25rem'
            }}>
              <p style={{ fontSize: 12, color: 'var(--color-text-secondary)', margin: 0 }}>
                Resumo do período
              </p>
              <p style={{ fontSize: 11, color: 'var(--color-text-tertiary)', margin: 0 }}>
                {labelPer}
              </p>
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
