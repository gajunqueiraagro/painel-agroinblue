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
  formatoValor?: 'inteiro' | 'decimal1' | 'decimal2' | 'decimal3' | 'moeda' | 'moedaAbreviada';
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
  /** Identificador do indicador (gera a query histórica correta).
   *  Indicadores financeiros (receitaPec/desembolsoProd/custoArr/precoArr/custoCab/margemArr)
   *  não têm histórico multi-ano — V2Home não chama useHistoricoIndicador para eles. */
  indicadorKey:
    | 'cabecas' | 'pesoMedio' | 'arrobas' | 'gmd' | 'desfrute' | 'valorRebanho' | 'uaHa' | 'kgHa'
    | 'receitaPec' | 'custeioPec' | 'custoArr' | 'precoArr' | 'custoCab' | 'margemArr'
    | 'areaProdutivaPec';
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
  /* Titulo e subtitulo POR LEITURA. `titulo`/`subtitulo` chegam colapsados
     pelo viewMode do pai (o hook escolhe entre "Rebanho Final do mes" e
     "Rebanho Medio no periodo" em `isPeriodo`), e com os dois graficos na
     tela um deles estaria sempre errado.
     Enquanto o hook nao expuser os dois, os dois cabecalhos caem no `titulo`
     unico e quem distingue os lados e o rotulo do modo acima dele. */
  titulos?: {
    mes:     { titulo: string; subtitulo?: string };
    periodo: { titulo: string; subtitulo?: string };
  };
  /** Variação % vs mês anterior — calculado fora; null oculta a linha. */
  deltaMes?: number | null;
  /** Variação % vs ano anterior — calculado fora; null oculta a linha. */
  deltaAno?: number | null;
  /** Modo de visualização — afeta o cálculo do histórico inferior multi-ano. */
  /* As DUAS leituras, sempre ambas — vem do hook, prontas.
     O modal NAO calcula: a regra de :16-20 existe para ele nunca discordar
     do tile que o abriu, e `serieAno` sozinha nao serve porque ja chega
     escolhida pelo viewMode do pai.
     AUSENTE nos quatro indicadores que NAO existem em usePainelConsultorData
     — alavancagem, endividamento, caixaDisponivel e areaProdutivaPec. Para
     eles os dois graficos caem em `serieAno` e ficam iguais; dar `series` a
     eles exige antes cria-los no hook, e isso e frente propria. */
  series?: {
    mes:     { ano: number[]; anoAnt?: number[]; meta?: number[] };
    periodo: { ano: number[]; anoAnt?: number[]; meta?: number[] };
  };
  viewMode?: 'mes' | 'periodo';
  /** Callback para alternar viewMode dentro do modal (toggle interno).
   *  Quando ausente, o toggle não é renderizado. Estado real vive no pai. */
  onViewModeChange?: (v: 'mes' | 'periodo') => void;
  /**
   * Histórico multi-ano (auxiliar legado de zoot_mensal_cache).
   * Vem de useHistoricoIndicador no V2Home — modal só renderiza.
   * Quando undefined: bloco de histórico fica oculto.
   */
  historicoAno?: Array<{ ano: number; valor: number | null }>;
  historicoMeta?: Array<{ ano: number; valor: number | null }>;
  loadingHistorico?: boolean;
  /**
   * Cor principal do indicador (semântica financeira):
   *   'azul'     → receitas/preços/margem positiva (default)
   *   'vermelho' → custos/margem negativa
   * Aplica à linha do ano atual, dot selecionado, valor topo e legenda.
   * NÃO afeta ano anterior (cinza) nem meta (laranja).
   */
  corPrincipal?: 'azul' | 'vermelho';
}

const MESES_LABELS = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];

/* Idioma visual do V1 — copiado do ChartCard, o componente que desenha
   "Rebanho Final do mês (cab)" nas telas V1 (GraficosAnaliseTab.tsx:38-40 e
   :605-613; o mesmo bloco existe identico em ZootecnicoTab e VisaoZooHubTab).
   NAO veio do ResOpDashboard: aquele arquivo nao tem este grafico.

   DOT_V1 e o marcador CIRCULAR ABERTO — o `fill` e a cor de FUNDO da pagina,
   entao o circulo le como vazado e a borda fica na cor da serie. E o unico
   detalhe do idioma que nao se descreve por si: sem o fill de fundo o ponto
   vira bolinha cheia. */
const DOT_V1        = { r: 2, strokeWidth: 1.5, fill: 'hsl(var(--background))' };
const DOT_META_V1   = { r: 3, strokeWidth: 1.5, fill: '#f97316' };
const ACTIVE_DOT_V1 = { r: 4, strokeWidth: 2, fill: 'hsl(var(--primary))' };
/* strokeWidth por serie no V1: atual 2.5, meta 2, ano anterior 1.5.
   Tracejado SO no ano anterior ('4 2', opacidade 0.55) — a meta e CHEIA. */

const fmtN = (v: number | null | undefined, casas: number) =>
  v == null || isNaN(v) ? '—' : v.toLocaleString('pt-BR', { minimumFractionDigits: casas, maximumFractionDigits: casas });

const fmtR = (v: number | null | undefined) =>
  v == null || isNaN(v) ? '—' : v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

// R$ 22.300.000 → "R$ 22,3M". Sem alterar cálculo do valor.
const fmtRAbreviado = (v: number | null | undefined): string => {
  if (v == null || isNaN(v)) return '—';
  const abs = Math.abs(v);
  const fmt = (n: number, suf: string) => `R$ ${n.toFixed(1).replace('.', ',')}${suf}`;
  if (abs >= 1e9) return fmt(v / 1e9, 'B');
  if (abs >= 1e6) return fmt(v / 1e6, 'M');
  if (abs >= 1e3) return fmt(v / 1e3, 'K');
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 });
};

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
  titulos,
  deltaMes,
  deltaAno,
  series,
  viewMode = 'mes',
  onViewModeChange,
  historicoAno,
  historicoMeta,
  loadingHistorico = false,
  corPrincipal = 'azul',
}: Props) {
  // Paleta da linha/valor do ano atual — ano anterior e meta ficam intocados.
  const COR_ATUAL = corPrincipal === 'vermelho'
    ? { stroke: '#DC2626', dotLight: '#FCA5A5', text: 'text-red-700' }
    : { stroke: '#185FA5', dotLight: '#B5D4F4', text: 'text-primary' };
  // Props de roteamento (clienteId, fazendaId, fazendaIds, anoInicio, viewMode, tipoAcumulado)
  // são aceitas por compatibilidade com V2Home — não usadas aqui pois o modal não consulta banco.
  void clienteId; void fazendaId; void fazendaIds; void anoInicio;
  void tipoAcumulado; void indicadorKey;
  /* deltaMes/deltaAno vinham prontos do V2Home para o cabecalho unico, ja
     colapsados pelo viewMode. Cada cabecalho agora calcula os SEUS tres com
     a mesma formula do hook — ver `deltasDoTrio`. As props ficam por
     compatibilidade com os 12 call sites do V2Home.
     viewMode/onViewModeChange: o toggle saiu daqui. Ele continua na Home
     (V2Home.tsx:1656-1677), entao nenhum controle se perdeu. */
  void deltaMes; void deltaAno; void viewMode; void onViewModeChange;
  // labelPeriodo é usado abaixo no bloco de histórico inferior

  if (!open) return null;

  const fmtValor = (v: number | null | undefined): string => {
    if (formatoValor === 'inteiro')         return fmtN(v, 0) + (unidade ? ' ' + unidade : '');
    if (formatoValor === 'decimal1')        return fmtN(v, 1) + (unidade ? ' ' + unidade : '');
    if (formatoValor === 'decimal2')        return fmtN(v, 2) + (unidade ? ' ' + unidade : '');
    if (formatoValor === 'decimal3')        return fmtN(v, 3) + (unidade ? ' ' + unidade : '');
    if (formatoValor === 'moeda')           return fmtR(v);
    if (formatoValor === 'moedaAbreviada')  return fmtRAbreviado(v);
    return String(v ?? '—');
  };

  // Formatação compacta para eixo Y / labels do gráfico — sem prefixo R$ e
  // abreviação K/M/B em moedaAbreviada para não estourar o eixo.
  const fmtAxis = (v: number | null | undefined): string => {
    if (v == null || isNaN(v)) return '';
    if (formatoValor === 'decimal1')       return fmtN(v, 1);
    if (formatoValor === 'decimal2')       return fmtN(v, 2);
    if (formatoValor === 'decimal3')       return fmtN(v, 3);
    if (formatoValor === 'moedaAbreviada') {
      const abs = Math.abs(v);
      if (abs >= 1e9) return (v / 1e9).toFixed(1).replace('.', ',') + 'B';
      if (abs >= 1e6) return (v / 1e6).toFixed(1).replace('.', ',') + 'M';
      if (abs >= 1e3) return (v / 1e3).toFixed(1).replace('.', ',') + 'K';
      return fmtN(v, 0);
    }
    // inteiro, moeda e fallback: separador de milhar, sem casas decimais
    return fmtN(v, 0);
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

  const calcDelta = (a: number | null, b: number | null): number | null => {
    if (a == null || b == null || isNaN(a) || isNaN(b) || b === 0) return null;
    return ((a - b) / b) * 100;
  };

  /* Os TRES deltas de UMA leitura. Formula reaproveitada, nao inventada: e a
     mesma do hook — ((curr - ref) / ref) * 100 no ponto `mesAtual`, com guarda
     de nulo/NaN/zero (usePainelConsultorData.ts:1723, :1765 e :1797 para
     cabecas; os demais indicadores repetem o mesmo bloco).
     `vs mes` compara com o mes anterior da PROPRIA serie; o `mesIdx <= 1` do
     hook fica implicito porque getMesValue devolve null para mes < 1. */
  const deltasDoTrio = (trio: { ano: number[]; anoAnt?: number[]; meta?: number[] }) => {
    const valor = getMesValue(trio.ano, mesAtual);
    return {
      valor,
      mes:  calcDelta(valor, getMesValue(trio.ano, mesAtual - 1)),
      ano:  calcDelta(valor, getMesValue(trio.anoAnt, mesAtual)),
      meta: calcDelta(valor, getMesValue(trio.meta, mesAtual)),
    };
  };

  /* Um `dados` por MODO, com a MESMA forma do original — so muda de qual
     trio de series ele parte. Nada aqui calcula: as duas leituras chegam
     prontas em `series`. Sem `series`, ambos caem em `serieAno`. */
  const montaDados = (
    sAno: number[] | undefined,
    sAnt: number[] | undefined,
    sMeta: number[] | undefined,
  ) => MESES_LABELS.map((mes, idx) => {
    const atual       = idx + 1 <= mesAtual ? getMesValue(sAno, idx + 1) : null;
    const anoAnterior = getMesValue(sAnt, idx + 1);
    const meta        = getMesValue(sMeta, idx + 1);
    return { mes, atual, anoAnterior, meta, atualArea: atual, anoAnteriorArea: anoAnterior };
  });
  /* Os dois trios, nomeados uma vez so: o grafico e o cabecalho de cada lado
     leem exatamente a MESMA serie, entao o numero grande nunca pode discordar
     da curva embaixo dele. */
  const trioMes = {
    ano:    series?.mes.ano    ?? serieAno,
    anoAnt: series?.mes.anoAnt ?? serieAnoAnt,
    meta:   series?.mes.meta   ?? serieMeta,
  };
  const trioPeriodo = {
    ano:    series?.periodo.ano    ?? serieAno,
    anoAnt: series?.periodo.anoAnt ?? serieAnoAnt,
    meta:   series?.periodo.meta   ?? serieMeta,
  };
  const dadosMes     = montaDados(trioMes.ano,     trioMes.anoAnt,     trioMes.meta);
  const dadosPeriodo = montaDados(trioPeriodo.ano, trioPeriodo.anoAnt, trioPeriodo.meta);

  /* O `dados` unico saiu: ele lia `serieAno`, que muda com o viewMode do
     pai, e era exatamente o que impedia os dois graficos de coexistir.
     Deixa-lo aqui sem consumidor convidaria alguem a religa-lo. */

  const hasAnoAnt = serieAnoAnt != null && serieAnoAnt.some(v => v != null && !isNaN(v));
  const hasMeta = serieMeta != null && serieMeta.some(v => v != null && !isNaN(v as number));

  // ── Histórico inferior — barras multi-ano (legado, auxiliar) ──
  // Dados vêm prontos via prop historicoAno/historicoMeta de useHistoricoIndicador.
  // Modal NÃO calcula nada aqui. Bloco fica oculto se historicoAno for undefined.
  const labelPer = labelPeriodo ?? `Jan–${MESES_LABELS[mesAtual - 1]}`;
  const metaAtualValor = historicoMeta?.find(h => h.ano === anoAtual)?.valor ?? null;
  const refValAnoAtual = historicoAno?.find(h => h.ano === anoAtual)?.valor ?? null;
  const barDados = historicoAno != null
    ? [
        ...historicoAno.map(h => ({
          nome: String(h.ano),
          valor: h.valor,
          cor: h.ano === anoAtual ? COR_ATUAL.stroke : '#B4B2A9',
        })),
        ...(metaAtualValor != null && !isNaN(metaAtualValor)
          ? [{ nome: `Meta ${anoAtual}`, valor: metaAtualValor, cor: '#F97316' }]
          : []),
      ].filter(b => b.valor != null && !isNaN(b.valor as number))
    : [];

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

  /* Um cabecalho por grafico: com as duas leituras visiveis ao mesmo
     tempo, um titulo unico teria de mentir sobre uma delas. Os dois trios
     de serie ja chegam pelo `series`. */
  const linhaDelta = (v: number | null, rotulo: string) =>
    v == null ? null : (
      <div className={`text-[10px] font-normal leading-[1.2] flex items-center gap-0.5 ${v >= 0 ? 'text-green-600' : 'text-red-500'}`}>
        <span>{v >= 0 ? '↗' : '↙'}</span>
        <span>{v >= 0 ? '+' : ''}{v.toFixed(1)}% {rotulo}</span>
      </div>
    );

  const cabecalhoLeitura = (
    modoLabel: string,
    t: { titulo: string; subtitulo?: string },
    trio: { ano: number[]; anoAnt?: number[]; meta?: number[] },
  ) => {
    const d = deltasDoTrio(trio);
    return (
      <div className="px-1 pb-1 mb-1 border-b border-border/30">
        <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground/70 leading-tight">{modoLabel}</p>
        <h3 className="text-xs font-semibold text-foreground leading-tight mt-0.5">{t.titulo}</h3>
        {t.subtitulo && (
          <p className="text-[11px] font-light text-muted-foreground/70 leading-snug">{t.subtitulo}</p>
        )}
        <div className="flex items-baseline gap-1.5 mt-1">
          <span className={`text-xl font-bold leading-none ${COR_ATUAL.text}`}>{fmtValor(d.valor)}</span>
          <span className="text-[11px] text-muted-foreground">
            · {MESES_LABELS[mesAtual - 1]} {anoAtual}
          </span>
        </div>
        {/* Os tres deltas numa linha so — cada linhaDelta e um flex item. */}
        <div className="mt-0.5 flex flex-wrap items-center gap-x-2">
          {linhaDelta(d.mes,  'vs mês')}
          {linhaDelta(d.ano,  'vs ano ant.')}
          {linhaDelta(d.meta, 'vs META')}
        </div>
      </div>
    );
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
      onClick={onClose}
    >
      <div
        className="w-full max-w-4xl mx-4 rounded-lg border border-border/40 bg-background shadow-xl flex flex-col max-h-[92vh]"
        onClick={e => e.stopPropagation()}
      >
        {/* O cabecalho unico do topo saiu inteiro: um titulo, um numero e um
           trio de deltas nao conseguem descrever duas leituras ao mesmo tempo.
           Foi para dentro de cada coluna, em `cabecalhoLeitura`.
           O toggle "No mes / No periodo" saiu junto — ele era `setViewMode` do
           pai e governa a aplicacao inteira; conferido antes de remover que
           ele CONTINUA na Home, em V2Home.tsx:1656-1677, logo abaixo da regua
           de meses. Nenhum controle se perdeu.
           Fechar continua sendo o clique fora, anunciado no rodape — nao havia
           botao de fechar aqui para preservar.  */}

        {/* Corpo rolável — gráfico + histórico + rodapé */}
        <div className="flex-1 min-h-0 flex flex-col overflow-y-auto">

        {/* Gráfico — DOIS de linha, lado a lado.
            Esquerda le SEMPRE a serie mensal; direita, SEMPRE a do periodo.
            Nenhum dos dois olha `serieAno`, que muda com o viewMode do pai —
            e por isso alternar o toggle NAO troca os graficos entre si.
            O idioma (Line + Area, #B4B2A9 tracejado, strokeWidth 1.5, dot r=2,
            CartesianGrid "3 3") e o que ja existia no ramo periodo deste arquivo.
            A legenda abaixo e UMA SO e serve os dois. */}
        <div className="px-4 pb-2 flex-1 min-h-0 flex flex-col">
          <div className="grid grid-cols-2 gap-3 flex-1 min-h-0">
            <div className="flex flex-col min-h-0">
              {cabecalhoLeitura('No mês', titulos?.mes ?? { titulo, subtitulo }, trioMes)}
              {/* Altura DERIVADA: literal nao cabe em todo viewport. Piso 140px
                  mantem os 12 rotulos de mes legiveis; teto 200px impede o
                  grafico de inchar em tela grande. */}
              <div className="flex-1" style={{ minHeight: 140, maxHeight: 200 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <ComposedChart data={dadosMes} margin={{ top: 6, right: 8, left: 4, bottom: 2 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#E8E6DF" vertical={false} />
                    <XAxis dataKey="mes" tick={{ fontSize: 9, fill: '#888780' }} stroke="#E8E6DF" />
                    <YAxis tick={{ fontSize: 9, fill: '#888780' }} tickFormatter={fmtAxis} stroke="#E8E6DF" width={40} />
                    <Tooltip content={<CustomTooltip />} />
                    {/* Areas (sob as linhas) — dataKey separado p/ não duplicar no tooltip */}
                    {hasAnoAnt && (
                      <Area
                        type="monotone"
                        dataKey="anoAnteriorArea"
                        stroke="none"
                        fill="#000000"
                        fillOpacity={0.03}
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
                      fillOpacity={0.16}
                      isAnimationActive={false}
                      connectNulls={false}
                      legendType="none"
                      activeDot={false}
                    />
                    {/* Lines (por cima das áreas).
                        As duas areas acima separam PASSADO de FUTURO sem legenda:
                        `atualArea` so existe ate `mesAtual` (a serie do ano corrente
                        para ali), entao ela e o passado — 0.16. `anoAnteriorArea`
                        cobre Jan–Dez, entao depois do mes atual ela fica sozinha —
                        0.03. O contraste subiu de 0.09/0.04 para 0.16/0.03.
                        Este par NAO veio do V1: la as duas opacidades separam SERIES
                        (0.3 atual, 0.1 ano anterior), nao tempo. Valores escolhidos
                        aqui; a estrutura de duas Areas ja existia. */}
                    {hasAnoAnt && (
                      <Line
                        type="monotone"
                        dataKey="anoAnterior"
                        stroke="#B4B2A9"
                        strokeWidth={1.5}
                        strokeDasharray="4 2"
                        strokeOpacity={0.55}
                        dot={DOT_V1}
                        activeDot={ACTIVE_DOT_V1}
                        connectNulls={false}
                        isAnimationActive={false}
                      />
                    )}
                    {hasMeta && (
                      <Line
                        type="monotone"
                        dataKey="meta"
                        stroke="#F97316"
                        strokeWidth={2}
                        dot={DOT_META_V1}
                        activeDot={ACTIVE_DOT_V1}
                        connectNulls={false}
                        isAnimationActive={false}
                      />
                    )}
                    <Line
                      type="monotone"
                      dataKey="atual"
                      stroke={COR_ATUAL.stroke}
                      strokeWidth={2.5}
                      connectNulls={false}
                      isAnimationActive={false}
                      dot={(props: any) => {
                        /* O mes selecionado continua cheio e maior — e a unica
                           marca que o V1 nao tem, e ela diz qual mes o painel
                           esta olhando. Os demais viram circulo ABERTO. */
                        const isSel = props.index === mesAtual - 1;
                        return isSel
                          ? <circle key={props.index} cx={props.cx} cy={props.cy} r={6} fill={COR_ATUAL.stroke} />
                          : <circle key={props.index} cx={props.cx} cy={props.cy} r={2}
                                    fill="hsl(var(--background))" stroke={COR_ATUAL.stroke} strokeWidth={1.5} />;
                      }}
                    />
                  </ComposedChart>
                </ResponsiveContainer>
              </div>
            </div>
            <div className="flex flex-col min-h-0">
              {cabecalhoLeitura('Média no período', titulos?.periodo ?? { titulo, subtitulo }, trioPeriodo)}
              {/* Altura DERIVADA: literal nao cabe em todo viewport. Piso 140px
                  mantem os 12 rotulos de mes legiveis; teto 200px impede o
                  grafico de inchar em tela grande. */}
              <div className="flex-1" style={{ minHeight: 140, maxHeight: 200 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <ComposedChart data={dadosPeriodo} margin={{ top: 6, right: 8, left: 4, bottom: 2 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#E8E6DF" vertical={false} />
                    <XAxis dataKey="mes" tick={{ fontSize: 9, fill: '#888780' }} stroke="#E8E6DF" />
                    <YAxis tick={{ fontSize: 9, fill: '#888780' }} tickFormatter={fmtAxis} stroke="#E8E6DF" width={40} />
                    <Tooltip content={<CustomTooltip />} />
                    {/* Areas (sob as linhas) — dataKey separado p/ não duplicar no tooltip */}
                    {hasAnoAnt && (
                      <Area
                        type="monotone"
                        dataKey="anoAnteriorArea"
                        stroke="none"
                        fill="#000000"
                        fillOpacity={0.03}
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
                      fillOpacity={0.16}
                      isAnimationActive={false}
                      connectNulls={false}
                      legendType="none"
                      activeDot={false}
                    />
                    {/* Lines (por cima das áreas).
                        As duas areas acima separam PASSADO de FUTURO sem legenda:
                        `atualArea` so existe ate `mesAtual` (a serie do ano corrente
                        para ali), entao ela e o passado — 0.16. `anoAnteriorArea`
                        cobre Jan–Dez, entao depois do mes atual ela fica sozinha —
                        0.03. O contraste subiu de 0.09/0.04 para 0.16/0.03.
                        Este par NAO veio do V1: la as duas opacidades separam SERIES
                        (0.3 atual, 0.1 ano anterior), nao tempo. Valores escolhidos
                        aqui; a estrutura de duas Areas ja existia. */}
                    {hasAnoAnt && (
                      <Line
                        type="monotone"
                        dataKey="anoAnterior"
                        stroke="#B4B2A9"
                        strokeWidth={1.5}
                        strokeDasharray="4 2"
                        strokeOpacity={0.55}
                        dot={DOT_V1}
                        activeDot={ACTIVE_DOT_V1}
                        connectNulls={false}
                        isAnimationActive={false}
                      />
                    )}
                    {hasMeta && (
                      <Line
                        type="monotone"
                        dataKey="meta"
                        stroke="#F97316"
                        strokeWidth={2}
                        dot={DOT_META_V1}
                        activeDot={ACTIVE_DOT_V1}
                        connectNulls={false}
                        isAnimationActive={false}
                      />
                    )}
                    <Line
                      type="monotone"
                      dataKey="atual"
                      stroke={COR_ATUAL.stroke}
                      strokeWidth={2.5}
                      connectNulls={false}
                      isAnimationActive={false}
                      dot={(props: any) => {
                        /* O mes selecionado continua cheio e maior — e a unica
                           marca que o V1 nao tem, e ela diz qual mes o painel
                           esta olhando. Os demais viram circulo ABERTO. */
                        const isSel = props.index === mesAtual - 1;
                        return isSel
                          ? <circle key={props.index} cx={props.cx} cy={props.cy} r={6} fill={COR_ATUAL.stroke} />
                          : <circle key={props.index} cx={props.cx} cy={props.cy} r={2}
                                    fill="hsl(var(--background))" stroke={COR_ATUAL.stroke} strokeWidth={1.5} />;
                      }}
                    />
                  </ComposedChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>

          {/* Legenda — abaixo do gráfico */}
          <div className="flex gap-4 px-1 mt-2 flex-wrap">
            <div className="flex items-center gap-1.5">
              <div className="w-6 h-[2px] rounded" style={{ background: COR_ATUAL.stroke }} />
              <span className="text-[11px] text-muted-foreground">{anoAtual}</span>
            </div>
            {hasAnoAnt && (
              <div className="flex items-center gap-1.5">
                <svg width="24" height="4"><line x1="0" y1="2" x2="24" y2="2" stroke="#B4B2A9" strokeWidth="2" strokeDasharray="4 3"/></svg>
                <span className="text-[11px] text-muted-foreground">{anoAtual - 1}</span>
              </div>
            )}
            {hasMeta && (
              <div className="flex items-center gap-1.5">
                <svg width="24" height="4"><line x1="0" y1="2" x2="24" y2="2" stroke="#F97316" strokeWidth="2" strokeDasharray="6 3"/></svg>
                <span className="text-[11px] text-muted-foreground">Meta {anoAtual}</span>
              </div>
            )}
          </div>
        </div>

        {/* Separador antes do bloco resumo */}
        {historicoAno != null && (
          <div className="border-t border-border/30 mx-0 mt-2" />
        )}

        {/* Resumo do período (histórico multi-ano — auxiliar legado de zoot_mensal_cache) */}
        {historicoAno != null && (
          <div style={{ padding: '0 1rem', marginTop: '0.375rem' }}>
            <div style={{
              borderTop: '0.5px solid var(--color-border-tertiary)',
              paddingTop: '0.5rem', marginBottom: '0.25rem'
            }}>
              <p className="text-xs font-medium text-muted-foreground" style={{ margin: 0 }}>Histórico do período</p>
              <p className="text-xs text-muted-foreground/70" style={{ margin: 0 }}>{labelPer}</p>
            </div>
            {loadingHistorico ? (
              <p style={{ fontSize: 12, color: 'var(--color-text-tertiary)', padding: '1rem 0' }}>Carregando...</p>
            ) : barDados.length > 0 ? (
              <ResponsiveContainer width="100%" height={96}>
                <BarChart data={barDados} margin={{ top: 18, right: 8, left: 8, bottom: 0 }} barCategoryGap="25%">
                  <XAxis dataKey="nome" tick={{ fontSize: 9, fill: '#888780' }} axisLine={false} tickLine={false} />
                  <YAxis hide />
                  {refValAnoAtual != null && !isNaN(refValAnoAtual) && (
                    <ReferenceLine y={refValAnoAtual} stroke={COR_ATUAL.stroke} strokeDasharray="4 3" strokeWidth={1} opacity={0.5} />
                  )}
                  <Bar
                    dataKey="valor"
                    radius={[3, 3, 0, 0]}
                    isAnimationActive={false}
                    label={{
                      position: 'top',
                      fontSize: 9,
                      fill: 'var(--color-text-secondary)',
                      formatter: (v: number) => fmtAxis(v),
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
        <div className="px-4 pb-2 pt-1.5 text-[10px] text-muted-foreground text-center">
          Clique fora para fechar
        </div>

        </div>
      </div>
    </div>
  );
}
