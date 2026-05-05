import {
  ComposedChart,
  Line,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
  BarChart,
  Bar,
  Cell,
  ReferenceLine,
} from 'recharts';

// REGRA ARQUITETURAL — modal puro de renderização:
// - Modal NÃO calcula
// - Modal NÃO replica fórmula
// - Modal NÃO decide regra de negócio
// - Modal APENAS renderiza séries oficiais vindas do hook (usePainelConsultorData)
//
// Padrão visual dos modais executivos:
// - realizado: parar no mês filtrado
// - ano anterior: completo Jan–Dez
// - meta: completo Jan–Dez (nunca cortar)
// - Area sob ano anterior: cinza claro
// - Area sob realizado: cinza moderado
// - meta: sem Area preenchida
// - corpo do modal rolável abaixo do header
//
// Histórico inferior usa serieAno mês a mês — a série já vem com o modo
// (mês ou período) aplicado pelo hook. Nunca recalcular nada aqui.

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
  /** Cliente — mantido por compatibilidade; não usado na query. */
  clienteId?: string;
  /** Fazenda específica; null = global (somar todas as fazendas do cliente). */
  fazendaId?: string | null;
  /** Fazendas do cliente para modo global (filtro direto sem join). */
  fazendaIds?: string[];
  /** Ano inicial do histórico; default: anoAtual - 6. */
  anoInicio?: number;
  /** Subtítulo opcional exibido abaixo do título. */
  subtitulo?: string;
  /** Variação % vs mês anterior — calculado fora; null oculta a linha. */
  deltaMes?: number | null;
  /** Variação % vs ano anterior — calculado fora; null oculta a linha. */
  deltaAno?: number | null;
  /** Modo de visualização — afeta o cálculo do histórico inferior multi-ano. */
  viewMode?: 'mes' | 'periodo';
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
  fazendaIds,
  anoInicio,
  subtitulo,
  deltaMes,
  deltaAno,
  viewMode: _viewMode = 'mes',
}: Props) {
  // Props de roteamento (clienteId, fazendaId, fazendaIds, anoInicio, viewMode, tipoAcumulado)
  // são aceitas por compatibilidade com V2Home — não usadas aqui pois o modal não consulta banco.
  void clienteId; void fazendaId; void fazendaIds; void anoInicio;
  void tipoAcumulado; void labelPeriodo; void _viewMode;

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

  const deltaMetaInterno = calcDelta(valorAtual, getMesValue(serieMeta, mesAtual));

  const dados = MESES_LABELS.map((mes, idx) => {
    // Realizado: corta no mês atual (Jan→mesAtual)
    const atual       = idx + 1 <= mesAtual ? getMesValue(serieAno, idx + 1) : null;
    // Ano anterior: série completa Jan–Dez
    const anoAnterior = getMesValue(serieAnoAnt, idx + 1);
    // Meta: série completa Jan–Dez (nunca cortar)
    const meta        = getMesValue(serieMeta, idx + 1);
    return {
      mes,
      atual,
      anoAnterior,
      meta,
      // Auxiliares para Areas — mesmos valores, dataKey separado p/ não duplicar no tooltip
      atualArea:       atual,
      anoAnteriorArea: anoAnterior,
    };
  });

  const hasAnoAnt = serieAnoAnt != null && serieAnoAnt.some(v => v != null && !isNaN(v));
  const hasMeta = serieMeta != null && serieMeta.some(v => v != null && !isNaN(v as number));

  // ── Histórico inferior — barras mês a mês de serieAno (Jan→mesAtual) ──
  // serieAno já vem do hook com o modo correto (mês/período) aplicado.
  // Modal NÃO calcula nada aqui.
  const labelPer = labelPeriodo ?? `Jan–${MESES_LABELS[mesAtual - 1]}`;
  const barDados = MESES_LABELS.slice(0, mesAtual).map((mes, idx) => {
    const m = idx + 1;
    return {
      nome: mes,
      valor: getMesValue(serieAno, m),
      cor: m === mesAtual ? '#185FA5' : '#B4B2A9',
    };
  }).filter(b => b.valor != null && !isNaN(b.valor as number));

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
      <div className="rounded-md border border-border/40 bg-background px-3 py-2 shadow-md text-sm">
        <p className="font-medium text-foreground mb-1">{label}</p>
        {entries.map((entry: any, i: number) => (
          <div key={i} className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full" style={{ background: entry.color }} />
            <span className="text-foreground">{fmtValor(entry.value)}</span>
            <span className="text-muted-foreground text-xs">{displayName(entry.dataKey)}</span>
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
        className="w-full max-w-2xl mx-4 rounded-lg border border-border/40 bg-background shadow-xl flex flex-col max-h-[85vh]"
        onClick={e => e.stopPropagation()}
      >
        {/* Header executivo (two-column) — fixo, fora do scroll */}
        <div className="shrink-0 flex items-start justify-between gap-4 px-5 py-3 border-b border-border/40">
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
              <div className={`text-xs font-medium leading-tight flex items-center justify-end gap-1 ${deltaMes >= 0 ? 'text-green-600' : 'text-red-500'}`}>
                <span>{deltaMes >= 0 ? '↗' : '↙'}</span>
                <span>{deltaMes >= 0 ? '+' : ''}{deltaMes.toFixed(1)}% vs mês</span>
              </div>
            )}
            {deltaAno != null && (
              <div className={`text-xs font-medium leading-tight flex items-center justify-end gap-1 ${deltaAno >= 0 ? 'text-green-600' : 'text-red-500'}`}>
                <span>{deltaAno >= 0 ? '↗' : '↙'}</span>
                <span>{deltaAno >= 0 ? '+' : ''}{deltaAno.toFixed(1)}% vs ano ant.</span>
              </div>
            )}
            {deltaMetaInterno != null && (
              <div className={`text-xs font-medium leading-tight flex items-center justify-end gap-1 ${deltaMetaInterno >= 0 ? 'text-green-600' : 'text-red-500'}`}>
                <span>{deltaMetaInterno >= 0 ? '↗' : '↙'}</span>
                <span>{deltaMetaInterno >= 0 ? '+' : ''}{deltaMetaInterno.toFixed(1)}% vs META</span>
              </div>
            )}
          </div>
        </div>

        {/* Corpo rolável — gráfico + histórico + rodapé */}
        <div className="flex-1 overflow-y-auto">

        {/* Gráfico */}
        <div className="px-3 pb-2">
          <ResponsiveContainer width="100%" height={190}>
            <ComposedChart data={dados} margin={{ top: 8, right: 16, left: 8, bottom: 4 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#E8E6DF" vertical={false} />
              <XAxis dataKey="mes" tick={{ fontSize: 11, fill: '#888780' }} stroke="#E8E6DF" />
              <YAxis tick={{ fontSize: 11, fill: '#888780' }} stroke="#E8E6DF" />
              <Tooltip content={<CustomTooltip />} />
              {/* Areas (sob as linhas) — dataKey separado p/ não duplicar no tooltip */}
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
              {/* Lines (por cima das áreas) */}
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
            </ComposedChart>
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
            {barDados.length > 0 ? (
              <ResponsiveContainer width="100%" height={130}>
                <BarChart data={barDados} margin={{ top: 24, right: 8, left: 8, bottom: 0 }} barCategoryGap="25%">
                  <XAxis dataKey="nome" tick={{ fontSize: 10, fill: '#888780' }} axisLine={false} tickLine={false} />
                  <YAxis hide />
                  {(() => {
                    const metaRef = getMesValue(serieMeta, mesAtual);
                    return metaRef != null && !isNaN(metaRef) ? (
                      <ReferenceLine y={metaRef} stroke="#F97316" strokeDasharray="4 3" strokeWidth={1} opacity={0.6} />
                    ) : null;
                  })()}
                  <Bar
                    dataKey="valor"
                    radius={[3, 3, 0, 0]}
                    isAnimationActive={false}
                    label={{
                      position: 'top',
                      fontSize: 10,
                      fill: 'var(--color-text-secondary)',
                      formatter: (v: number) => fmtN(v, formatoValor === 'inteiro' ? 0 : 1),
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
        <div className="px-5 pb-3 pt-2 text-[11px] text-muted-foreground text-center">
          Clique fora para fechar
        </div>

        </div>
      </div>
    </div>
  );
}
