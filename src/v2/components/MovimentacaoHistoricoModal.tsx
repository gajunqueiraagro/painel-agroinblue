/**
 * MovimentacaoHistoricoModal — modal Jan-Dez para os 9 cards de Movimentação
 * da tela Rebanho/Visão Geral (Fase 4 do Marco "9 Cards de Movimentação").
 *
 * Decisão B3 (Gabriel): modal SEPARADO do IndicadorHistoricoModal (V2Home).
 * Visual idêntico, mas:
 *   - SEM indicadorKey (union fechado do modal original não acomoda os 9 tipos novos)
 *   - SEM useHistoricoIndicador interno (modal não consulta banco)
 *   - SEM bloco "Histórico do período" (barras multi-ano) — Fase futura se necessário
 *
 * Séries pré-calculadas chegam via prop pelo useMovimentacoesAgregadas.
 * Modal apenas renderiza.
 */

import {
  ComposedChart, Line, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
} from 'recharts';

export interface MovimentacaoHistoricoModalProps {
  open: boolean;
  onClose: () => void;
  titulo: string;
  subtitulo?: string;
  unidade?: string;
  formatoValor: 'inteiro' | 'decimal1' | 'decimal2' | 'moeda' | 'moedaAbreviada';
  /** Mês selecionado (1-12) — destaca ponto no gráfico, define valor topo. */
  mesAtual: number;
  anoAtual: number;
  /** Série de 13 posições: [0] = Dez ano-1 (zero placeholder), [1..12] = Jan..Dez do ano atual. */
  serieAno: number[];
  serieAnoAnt?: number[];
  serieMeta?: number[];
  /** Metadado — não muda render. Modal não calcula. */
  tipoAcumulado?: 'soma' | 'media';
  /** Cor principal: azul (entradas/desfrute) vs vermelho (custos/mortes). */
  corPrincipal?: 'azul' | 'vermelho';
}

const MESES_LABELS = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];

const fmtN = (v: number | null | undefined, casas: number) =>
  v == null || isNaN(v) ? '—' : v.toLocaleString('pt-BR', { minimumFractionDigits: casas, maximumFractionDigits: casas });

const fmtR = (v: number | null | undefined) =>
  v == null || isNaN(v) ? '—' : v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

const fmtRAbreviado = (v: number | null | undefined): string => {
  if (v == null || isNaN(v)) return '—';
  const abs = Math.abs(v);
  const fmt = (n: number, suf: string) => `R$ ${n.toFixed(1).replace('.', ',')}${suf}`;
  if (abs >= 1e9) return fmt(v / 1e9, 'B');
  if (abs >= 1e6) return fmt(v / 1e6, 'M');
  if (abs >= 1e3) return fmt(v / 1e3, 'K');
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 });
};

export function MovimentacaoHistoricoModal({
  open, onClose,
  titulo, subtitulo, unidade,
  formatoValor,
  mesAtual, anoAtual,
  serieAno, serieAnoAnt, serieMeta,
  tipoAcumulado,
  corPrincipal = 'azul',
}: MovimentacaoHistoricoModalProps) {
  // `tipoAcumulado` é metadata — modal não calcula nada. Aceita prop p/ futuro uso.
  void tipoAcumulado;

  if (!open) return null;

  const COR_ATUAL = corPrincipal === 'vermelho'
    ? { stroke: '#DC2626', dotLight: '#FCA5A5', text: 'text-red-700' }
    : { stroke: '#185FA5', dotLight: '#B5D4F4', text: 'text-primary' };

  const fmtValor = (v: number | null | undefined): string => {
    if (formatoValor === 'inteiro')        return fmtN(v, 0) + (unidade ? ' ' + unidade : '');
    if (formatoValor === 'decimal1')       return fmtN(v, 1) + (unidade ? ' ' + unidade : '');
    if (formatoValor === 'decimal2')       return fmtN(v, 2) + (unidade ? ' ' + unidade : '');
    if (formatoValor === 'moeda')          return fmtR(v);
    if (formatoValor === 'moedaAbreviada') return fmtRAbreviado(v);
    return String(v ?? '—');
  };

  const fmtAxis = (v: number | null | undefined): string => {
    if (v == null || isNaN(v)) return '';
    if (formatoValor === 'decimal1')       return fmtN(v, 1);
    if (formatoValor === 'decimal2')       return fmtN(v, 2);
    if (formatoValor === 'moedaAbreviada') {
      const abs = Math.abs(v);
      if (abs >= 1e9) return (v / 1e9).toFixed(1).replace('.', ',') + 'B';
      if (abs >= 1e6) return (v / 1e6).toFixed(1).replace('.', ',') + 'M';
      if (abs >= 1e3) return (v / 1e3).toFixed(1).replace('.', ',') + 'K';
      return fmtN(v, 0);
    }
    return fmtN(v, 0);
  };

  // Séries: aceita 13 pos (1-based, [1]=Jan) OU 12 pos (0-based, [0]=Jan).
  const getMesValue = (serie: number[] | null | undefined, mes: number): number | null => {
    if (!serie || mes < 1 || mes > 12) return null;
    if (serie.length >= 13) {
      const v = serie[mes];
      return v != null && !isNaN(v) ? v : null;
    }
    const v = serie[mes - 1];
    return v != null && !isNaN(v) ? v : null;
  };

  const valorAtual = getMesValue(serieAno, mesAtual);

  const dados = MESES_LABELS.map((mes, idx) => {
    const atual       = idx + 1 <= mesAtual ? getMesValue(serieAno, idx + 1) : null;
    const anoAnterior = getMesValue(serieAnoAnt, idx + 1);
    const meta        = getMesValue(serieMeta, idx + 1);
    return {
      mes,
      atual,
      anoAnterior,
      meta,
      atualArea: atual,
      anoAnteriorArea: anoAnterior,
    };
  });

  const hasAnoAnt = serieAnoAnt != null && serieAnoAnt.some(v => v != null && !isNaN(v));
  const hasMeta = serieMeta != null && serieMeta.some(v => v != null && !isNaN(v));

  const CustomTooltip = ({ active, payload, label }: any) => {
    if (!active || !payload || !payload.length) return null;
    const order = ['atual', 'anoAnterior', 'meta'];
    const allowedKeys = new Set(order);
    const displayName = (key: string): string => {
      if (key === 'atual')        return String(anoAtual);
      if (key === 'anoAnterior')  return String(anoAtual - 1);
      if (key === 'meta')         return `Meta ${anoAtual}`;
      return key;
    };
    const entries = payload
      .filter((e: any) => allowedKeys.has(String(e.dataKey)) && e.value != null)
      .sort((a: any, b: any) => order.indexOf(a.dataKey) - order.indexOf(b.dataKey));
    return (
      <div className="rounded-sm border border-border/20 bg-background/60 backdrop-blur-[2px] px-2 py-1 text-[11px] leading-tight">
        <p className="font-medium text-foreground/85 text-[10px] mb-0.5">{label}</p>
        {entries.map((entry: any, i: number) => (
          <div key={i} className="flex items-center gap-1.5">
            <div className="w-1.5 h-1.5 rounded-full" style={{ background: entry.color }} />
            <span className="text-foreground/90">{fmtValor(entry.value)}</span>
            <span className="text-muted-foreground/80 text-[10px]">{displayName(entry.dataKey)}</span>
          </div>
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
        className="w-full max-w-2xl mx-4 rounded-lg border border-border/40 bg-background shadow-xl flex flex-col max-h-[94vh]"
        onClick={e => e.stopPropagation()}
      >
        {/* Header executivo */}
        <div className="shrink-0 flex items-start justify-between gap-4 px-5 py-3 border-b border-border/40">
          <div className="flex-1 min-w-0">
            <h2 className="text-base font-semibold text-foreground leading-tight">{titulo}</h2>
            {subtitulo && (
              <p className="text-[11px] font-light text-muted-foreground/70 leading-snug mt-0.5">{subtitulo}</p>
            )}
          </div>

          <div className="text-right shrink-0">
            <div className="flex items-baseline gap-1.5 justify-end">
              <span className={`text-3xl font-bold ${COR_ATUAL.text}`}>{fmtValor(valorAtual)}</span>
              <span className="text-sm text-muted-foreground">
                {MESES_LABELS[mesAtual - 1]} {anoAtual}
              </span>
            </div>
          </div>
        </div>

        {/* Corpo rolável */}
        <div className="flex-1 overflow-y-auto">
          {/* Gráfico Jan-Dez */}
          <div className="px-3 pb-2">
            <ResponsiveContainer width="100%" height={210}>
              <ComposedChart data={dados} margin={{ top: 8, right: 16, left: 8, bottom: 4 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#E8E6DF" vertical={false} />
                <XAxis dataKey="mes" tick={{ fontSize: 10, fill: '#888780' }} stroke="#E8E6DF" />
                <YAxis tick={{ fontSize: 10, fill: '#888780' }} tickFormatter={fmtAxis} stroke="#E8E6DF" width={48} />
                <Tooltip content={<CustomTooltip />} />
                {hasAnoAnt && (
                  <Area
                    type="monotone"
                    dataKey="anoAnteriorArea"
                    stroke="none"
                    fill="#000000"
                    fillOpacity={0.04}
                    isAnimationActive={false}
                    connectNulls={false}
                    legendType="none"
                    activeDot={false}
                  />
                )}
                <Area
                  type="monotone"
                  dataKey="atualArea"
                  stroke="none"
                  fill="#000000"
                  fillOpacity={0.09}
                  isAnimationActive={false}
                  connectNulls={false}
                  legendType="none"
                  activeDot={false}
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
                  stroke={COR_ATUAL.stroke}
                  strokeWidth={2}
                  connectNulls={false}
                  isAnimationActive={false}
                  dot={(props: any) => {
                    const isSel = props.index === mesAtual - 1;
                    return isSel
                      ? <circle key={props.index} cx={props.cx} cy={props.cy} r={6} fill={COR_ATUAL.stroke} />
                      : <circle key={props.index} cx={props.cx} cy={props.cy} r={2} fill={COR_ATUAL.dotLight} />;
                  }}
                />
              </ComposedChart>
            </ResponsiveContainer>

            {/* Legenda */}
            <div className="flex gap-5 px-1 mt-3 flex-wrap">
              <div className="flex items-center gap-1.5">
                <div className="w-6 h-[2px] rounded" style={{ background: COR_ATUAL.stroke }} />
                <span className="text-xs text-muted-foreground">{anoAtual}</span>
              </div>
              {hasAnoAnt && (
                <div className="flex items-center gap-1.5">
                  <svg width="24" height="4"><line x1="0" y1="2" x2="24" y2="2" stroke="#B4B2A9" strokeWidth="2" strokeDasharray="4 3" /></svg>
                  <span className="text-xs text-muted-foreground">{anoAtual - 1}</span>
                </div>
              )}
              {hasMeta && (
                <div className="flex items-center gap-1.5">
                  <svg width="24" height="4"><line x1="0" y1="2" x2="24" y2="2" stroke="#F97316" strokeWidth="2" strokeDasharray="6 3" /></svg>
                  <span className="text-xs text-muted-foreground">Meta {anoAtual}</span>
                </div>
              )}
            </div>
          </div>

          {/* Tabela mensal Jan-Dez */}
          <div className="px-5 pt-4 pb-2">
            <div className="border-t border-border/30 pt-3 mb-2">
              <p className="text-xs font-medium text-muted-foreground">Detalhe mensal</p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-[11px]">
                <thead>
                  <tr className="border-b border-border/40">
                    <th className="text-left py-1.5 font-medium text-muted-foreground">Mês</th>
                    <th className="text-right py-1.5 font-medium" style={{ color: COR_ATUAL.stroke }}>{anoAtual}</th>
                    {hasAnoAnt && (
                      <th className="text-right py-1.5 font-medium text-muted-foreground">{anoAtual - 1}</th>
                    )}
                    {hasMeta && (
                      <th className="text-right py-1.5 font-medium text-orange-600">Meta {anoAtual}</th>
                    )}
                  </tr>
                </thead>
                <tbody>
                  {dados.map((d, idx) => (
                    <tr
                      key={d.mes}
                      className={`border-b border-border/20 ${idx + 1 === mesAtual ? 'bg-muted/30 font-medium' : ''}`}
                    >
                      <td className="py-1.5 text-muted-foreground">{d.mes}</td>
                      <td className="py-1.5 text-right tabular-nums">
                        {d.atual != null ? fmtValor(d.atual) : <span className="text-muted-foreground/50">—</span>}
                      </td>
                      {hasAnoAnt && (
                        <td className="py-1.5 text-right tabular-nums text-muted-foreground">
                          {d.anoAnterior != null ? fmtValor(d.anoAnterior) : <span className="text-muted-foreground/50">—</span>}
                        </td>
                      )}
                      {hasMeta && (
                        <td className="py-1.5 text-right tabular-nums text-orange-600">
                          {d.meta != null ? fmtValor(d.meta) : <span className="text-muted-foreground/50">—</span>}
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Rodapé */}
          <div className="px-5 pb-3 pt-2 text-[11px] text-muted-foreground text-center">
            Clique fora para fechar
          </div>
        </div>
      </div>
    </div>
  );
}
