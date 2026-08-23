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
import { useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';

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

/** Um ponto do historico multi-ano. */
type AnoValor = { ano: number; valor: number | null };

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
  historicoAno?: { mes: AnoValor[]; periodo: AnoValor[] };
  historicoMeta?: { mes: AnoValor[]; periodo: AnoValor[] };
  loadingHistorico?: boolean;
  /**
   * Cor principal do indicador (semântica financeira):
   *   'azul'     → receitas/preços/margem positiva (default)
   *   'vermelho' → custos/margem negativa
   * Aplica à linha do ano atual, dot selecionado, valor topo e legenda.
   * NÃO afeta ano anterior (cinza) nem meta (laranja).
   */
  corPrincipal?: 'azul' | 'vermelho';
  /** Direcao boa do indicador. 'positivoBom' (default): subir e verde.
   *  'positivoRuim': subir e vermelho — custos e despesas.
   *  NAO confundir com `corPrincipal`, que e a cor da SERIE. Sao coisas
   *  diferentes: `margemArr` usa corPrincipal condicional ao valor ser
   *  negativo, e ainda assim subir e BOM. */
  polaridade?: 'positivoBom' | 'positivoRuim';
  /** Forma do grafico da leitura MENSAL. 'linha' (default) ou 'coluna'.
   *  Fluxo mensal le melhor como barra — mes a mes sao valores discretos,
   *  nao uma curva. O grafico do PERIODO segue sempre linha: acumulado e
   *  curva por definicao. */
  tipoGraficoMes?: 'linha' | 'coluna';
  /** Series por fazenda, do useSeriePorFazenda. Quando ausente ou vazio,
   *  a aba "Por Fazenda" NAO e renderizada — aba vazia e proibida.
   *  ⚠ COMPRIMENTO 12, indexado 0=Jan. As series do PC-100 e do
   *  useHistoricoZootCache tem 13, com a posicao 0 reservada a "Dez ano
   *  anterior". `getMesValue` e 1-based e serve AS DE 13 — nunca a estas. */
  seriesPorFazenda?: Array<{
    fazendaId: string;
    nome: string;
    mes: Array<number | null>;
    periodo: Array<number | null>;
  }>;
}

const MESES_LABELS = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];

/* Idioma visual do V1 — copiado do ChartCard, o componente que desenha
   "Rebanho Final do mês (cab)" nas telas V1 (GraficosAnaliseTab.tsx:38-40 e
   :605-613; o mesmo bloco existe identico em ZootecnicoTab e VisaoZooHubTab).
   NAO veio do ResOpDashboard: aquele arquivo nao tem este grafico.

   DOT_V1 e o marcador CIRCULAR ABERTO — o `fill` e a cor do CARD, nao a da
   pagina: desde que os graficos passaram a viver dentro de <Card>, o fundo
   atras deles e `--card` (branco), e apontar para `--background` (cinza 97%)
   deixava um miolo cinza dentro de card branco. E o unico detalhe do idioma
   que nao se descreve por si: sem o fill do fundo o ponto vira bolinha cheia.
   DOT_META_V1 passa a ser vazado tambem — a borda laranja vem do stroke da
   Line. ACTIVE_DOT_V1 fica solido: e o hover. */
const DOT_V1        = { r: 2, strokeWidth: 1.5, fill: 'hsl(var(--card))' };
const DOT_META_V1   = { r: 3, strokeWidth: 1.5, fill: 'hsl(var(--card))' };
const ACTIVE_DOT_V1 = { r: 4, strokeWidth: 2, fill: 'hsl(var(--primary))' };

/* Paleta das COLUNAS — uma so para o grafico do mes e para o
   historico. Ano anterior no mesmo cinza que o historico ja usava;
   meta em laranja SOLIDO e mais claro, para nao competir com o
   realizado.
   NAO vale para as LINHAS: la a meta e vazada (DOT_META_V1) e o traco e
   #F97316 cheio — idioma proprio, preservado. */
const BAR_ANO_ANT = '#B4B2A9';
const BAR_META    = '#FCB27F';   // #F97316 a ~55% sobre branco

/* Identidade de FAZENDA. Uso exclusivo: series onde cada linha e um
   lugar, nao um cenario. NAO reutilizar as cores semanticas
   (realizado/ano anterior/meta) aqui — a mesma cor nao pode significar
   coisas diferentes em duas abas do mesmo modal.
   Seis tons distinguiveis; acima de seis fazendas, ciclo. */
export const COR_FAZENDA = [
  '#185FA5', '#0E9F6E', '#D97706', '#7C3AED', '#DB2777', '#0891B2',
] as const;
/* strokeWidth por serie no V1: atual 2.5, meta 2, ano anterior 1.5.
   Tracejado SO no ano anterior ('4 2') — a meta e CHEIA. A opacidade 0.55 que
   havia no ano anterior saiu: o V1 nao usa nenhuma, e com #B4B2A9 (68% de
   luminosidade) a 0.55 a linha ficava quase invisivel. Agora a cor e
   `--muted-foreground` cheia, como em ZootecnicoTab:613. */

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
  polaridade = 'positivoBom',
  tipoGraficoMes = 'linha',
  seriesPorFazenda,
}: Props) {
  const modoColuna = tipoGraficoMes === 'coluna';
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

  /* Estado local, reiniciado por `key={indicadorKey}` no <Tabs>: abrir outro
     indicador nao deve cair na aba que ficou aberta no anterior.
     Declarado ANTES do early return — hook nao pode ficar depois de um
     return condicional. */
  const [aba, setAba] = useState<'global' | 'fazenda'>('global');
  const temPorFazenda = (seriesPorFazenda?.length ?? 0) > 0;

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

  /* Formatador do EIXO Y. Difere de `fmtAxis` num ponto so: acima de mil,
     sem casa decimal — "50.000,0" tem oito caracteres e nao cabe na
     canaleta. Abaixo de mil, delega a `fmtAxis`, porque e onde a decimal
     significa alguma coisa (GMD 0,403). `moedaAbreviada` tambem delega:
     ela ja abrevia em K/M/B e nunca estoura. */
  const fmtEixo = (v: number | null | undefined): string => {
    if (v == null || isNaN(v)) return '';
    if (formatoValor === 'moedaAbreviada') return fmtAxis(v);
    if (Math.abs(v) >= 1000) return fmtN(v, 0);
    return fmtAxis(v);
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
  ) => {
    const meses = MESES_LABELS.map((mes, idx) => {
      const atual       = idx + 1 <= mesAtual ? getMesValue(sAno, idx + 1) : null;
      const anoAnterior = getMesValue(sAnt, idx + 1);
      const meta        = getMesValue(sMeta, idx + 1);
      return { mes, atual, anoAnterior, meta, atualArea: atual, anoAnteriorArea: anoAnterior };
    });
    /* Categoria "Ini" — o rebanho inicial do ano, publicado pelo hook na
       posicao 0 da serie do realizado. Prependada SO quando essa posicao
       existe e e finita: os outros indicadores seguem com doze categorias,
       sem slot vazio. `anoAnterior` e `meta` ficam nulos de proposito — para
       o ano anterior o inicial seria Dez/ano-2, que nao existe. */
    const ini = sAno && sAno.length >= 13 && Number.isFinite(sAno[0]) ? sAno[0] : null;
    if (ini == null) return meses;
    return [
      { mes: 'Ini', atual: ini, anoAnterior: null, meta: null,
        atualArea: ini, anoAnteriorArea: null },
      ...meses,
    ];
  };
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

  /* Com a categoria "Ini" prependada os indices andam UM. O dot custom marca
     o mes selecionado por indice, entao sem este offset o ponto grande cairia
     no mes errado. Zero quando nao ha inicial. */
  const offMes     = dadosMes.length     > 12 ? 1 : 0;
  const offPeriodo = dadosPeriodo.length > 12 ? 1 : 0;
  /* Valor do inicial, para a linha de referencia horizontal. Sem cast: o
     `atual` do item prependado e sempre `number`, mas o tipo do array e o da
     uniao com os meses, entao a checagem explicita e o que estreita. */
  const iniAtualMes     = offMes     ? dadosMes[0].atual     : null;
  const iniMes          = typeof iniAtualMes     === 'number' ? iniAtualMes     : null;
  const iniAtualPeriodo = offPeriodo ? dadosPeriodo[0].atual : null;
  const iniPeriodo      = typeof iniAtualPeriodo === 'number' ? iniAtualPeriodo : null;

  /* Uma linha por MES, com uma coluna por fazenda — a forma que o recharts
     espera para varias <Line> no mesmo grafico. As series de fazenda tem 12
     posicoes indexadas 0=Jan: leitura por indice DIRETO, `[idx]`, nunca por
     `getMesValue`, que e 1-based e serve as series de 13 do PC-100. */
  const dadosFazenda = (campo: 'mes' | 'periodo') =>
    MESES_LABELS.map((rotulo, idx) => {
      const linha: Record<string, string | number | null> = { mes: rotulo };
      for (const f of seriesPorFazenda ?? []) {
        const v = f[campo][idx];
        linha[f.nome] = typeof v === 'number' && Number.isFinite(v) ? v : null;
      }
      return linha;
    });

  /* O `dados` unico saiu: ele lia `serieAno`, que muda com o viewMode do
     pai, e era exatamente o que impedia os dois graficos de coexistir.
     Deixa-lo aqui sem consumidor convidaria alguem a religa-lo. */

  const hasAnoAnt = serieAnoAnt != null && serieAnoAnt.some(v => v != null && !isNaN(v));
  const hasMeta = serieMeta != null && serieMeta.some(v => v != null && !isNaN(v as number));

  // ── Histórico inferior — barras multi-ano (legado, auxiliar) ──
  // Dados vêm prontos via prop historicoAno/historicoMeta de useHistoricoIndicador.
  // Modal NÃO calcula nada aqui. Bloco fica oculto se historicoAno for undefined.
  const labelPer = labelPeriodo ?? `Jan–${MESES_LABELS[mesAtual - 1]}`;
  /* Ano curto para os dois cabecalhos. NAO reaproveitar `labelPer`: ele pode
     vir sobrescrito pela prop `labelPeriodo` e serve ao bloco de historico. */
  const yy = String(anoAtual).slice(-2);
  /* Uma barra por ano, por LEITURA. A logica e a mesma de antes — barra do
     ano atual em COR_ATUAL, demais em BAR_ANO_ANT, "Meta {ano}" ao final,
     filtro de nulos. So passou a receber o historico do modo em vez do
     historico unico, que chegava ja colapsado pelo viewMode do pai. */
  const montaBarras = (hist?: AnoValor[], metaHist?: AnoValor[]) => {
    if (hist == null) return [];
    const metaAtual = metaHist?.find(h => h.ano === anoAtual)?.valor ?? null;
    return [
      ...hist.map(h => ({
        nome: String(h.ano),
        valor: h.valor,
        cor: h.ano === anoAtual ? COR_ATUAL.stroke : BAR_ANO_ANT,
      })),
      ...(metaAtual != null && !isNaN(metaAtual)
        ? [{ nome: `Meta ${anoAtual}`, valor: metaAtual, cor: BAR_META }]
        : []),
    ];
    /* O filtro de nulos saiu: o slot do ano FICA no eixo, com o rotulo, e o
       recharts simplesmente nao desenha barra para valor nulo — o rotulo
       numerico acima tambem some, porque `fmtAxis` devolve string vazia.
       PROIBIDO trocar nulo por zero: barra de altura zero afirmaria "foi
       zero naquele ano", e ausencia nao e zero — a regra do travessao do
       PC-100. */
  };
  const barDadosMes     = montaBarras(historicoAno?.mes,     historicoMeta?.mes);
  const barDadosPeriodo = montaBarras(historicoAno?.periodo, historicoMeta?.periodo);
  /* `.length > 0` deixou de distinguir "tem dado" de "so tem slots vazios",
     porque agora os slots nulos permanecem no array. */
  const temDadoMes     = barDadosMes.some(b => b.valor != null && !isNaN(b.valor as number));
  const temDadoPeriodo = barDadosPeriodo.some(b => b.valor != null && !isNaN(b.valor as number));
  const refAnoAtualMes     = historicoAno?.mes?.find(h => h.ano === anoAtual)?.valor ?? null;
  const refAnoAtualPeriodo = historicoAno?.periodo?.find(h => h.ano === anoAtual)?.valor ?? null;

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
      <div className="rounded-sm border border-border/20 bg-background/60 backdrop-blur-[2px] px-1.5 py-0.5 text-[9px] leading-tight">
        <p className="font-medium text-foreground/85 text-[9px] mb-0.5">{label}</p>
        {entries.map((entry: any, i: number) => (
          <div key={i} className="flex items-center gap-1">
            <div className="w-1 h-1 rounded-full" style={{ background: entry.color }} />
            <span className="text-foreground/90">{fmtValor(entry.value)}</span>
            <span className="text-muted-foreground/80 text-[8px]">{displayName(entry.dataKey)}</span>
          </div>
        ))}
      </div>
    );
  };

  /* Um cabecalho por grafico: com as duas leituras visiveis ao mesmo
     tempo, um titulo unico teria de mentir sobre uma delas. Os dois trios
     de serie ja chegam pelo `series`. */
  const linhaDelta = (v: number | null, rotulo: string) => {
    if (v == null) return null;
    /* A COR diz qualidade; a SETA diz direcao. Em indicador de custo, subir
       e ruim — mas o numero subiu, e a seta tem de dizer isso. Inverter a
       seta esconderia o fato. */
    const bom = polaridade === 'positivoRuim' ? v < 0 : v >= 0;
    return (
      <div className={`text-[9px] font-normal leading-[1.2] flex items-center gap-0.5 ${bom ? 'text-green-600' : 'text-red-500'}`}>
        <span>{v >= 0 ? '↗' : '↙'}</span>
        <span>{v >= 0 ? '+' : ''}{v.toFixed(1)}% {rotulo}</span>
      </div>
    );
  };

  /* Padrao do ChartCard V1 (ZootecnicoTab.tsx:664-679): titulo/subtitulo a
     esquerda, numero + data + deltas numa coluna a direita, na mesma linha.
     O rotulo de modo ("NO MES" / "MEDIA NO PERIODO") saiu — os proprios
     titulos ja distinguem os lados. A separacao agora e a borda do Card.
     Unico desvio do V1: numero em text-lg (la e text-sm, porque e card de
     dashboard; aqui e modal). */
  const cabecalhoLeitura = (
    t: { titulo: string; subtitulo?: string },
    trio: { ano: number[]; anoAnt?: number[]; meta?: number[] },
    dataLabel: string,
  ) => {
    const d = deltasDoTrio(trio);
    return (
      <div className="flex items-start justify-between gap-2 mb-1">
        <div className="min-w-0">
          <p className="text-xs font-bold text-foreground mb-0.5 leading-tight">{t.titulo}</p>
          {t.subtitulo && (
            <p className="text-[10px] text-muted-foreground/70 leading-snug">{t.subtitulo}</p>
          )}
        </div>
        <div className="flex flex-col items-end gap-0.5 shrink-0 ml-2">
          <span className={`text-lg font-bold leading-none ${COR_ATUAL.text}`}>{fmtValor(d.valor)}</span>
          <span className="text-[10px] text-muted-foreground leading-none">
            {dataLabel}
          </span>
          {linhaDelta(d.meta, 'vs META')}
          {linhaDelta(d.mes,  'vs mês')}
          {linhaDelta(d.ano,  'vs ano ant.')}
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
        className="w-full max-w-4xl mx-4 rounded-lg border border-border/40 bg-background shadow-xl flex flex-col h-[92vh] max-h-[92vh]"
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
        <div className="flex-1 min-h-0 flex flex-col overflow-hidden">

          <Tabs value={aba}
                onValueChange={v => setAba(v === 'fazenda' ? 'fazenda' : 'global')}
                key={indicadorKey}
                className="flex-1 min-h-0 flex flex-col">
            <TabsList className="mx-4 mt-3 h-7 w-fit">
              <TabsTrigger value="global" className="text-[11px] px-3 h-6">Global</TabsTrigger>
              {/* Aba vazia e proibida: catorze dos dezoito indicadores nao
                  recebem `seriesPorFazenda` e nao mostram este gatilho. */}
              {temPorFazenda && (
                <TabsTrigger value="fazenda" className="text-[11px] px-3 h-6">Por Fazenda</TabsTrigger>
              )}
            </TabsList>

            <TabsContent value="global" className="flex-1 min-h-0 flex flex-col mt-0">
            {/* Gráfico — DOIS de linha, lado a lado.
                Esquerda le SEMPRE a serie mensal; direita, SEMPRE a do periodo.
                Nenhum dos dois olha `serieAno`, que muda com o viewMode do pai —
                e por isso alternar o toggle NAO troca os graficos entre si.
                O idioma (Line + Area, #B4B2A9 tracejado, strokeWidth 1.5, dot r=2,
                CartesianGrid "3 3") e o que ja existia no ramo periodo deste arquivo.
                A legenda abaixo e UMA SO e serve os dois. */}
            <div className="px-4 pt-3 pb-2 flex-1 min-h-0 flex flex-col">
              <div className="grid grid-cols-2 gap-3 flex-1 min-h-0">
                <Card className="flex flex-col min-h-0">
                  <CardContent className="p-3 flex flex-col flex-1 min-h-0">
                    {cabecalhoLeitura(titulos?.mes ?? { titulo, subtitulo }, trioMes,
                        `${MESES_LABELS[mesAtual - 1]}/${yy}`)}
                    {/* Altura DERIVADA: literal nao cabe em todo viewport. Piso 140px
                        mantem os 12 rotulos de mes legiveis; teto 240px impede o
                        grafico de inchar em tela grande. */}
                    <div className="flex-1" style={{ minHeight: 140, maxHeight: 240 }}>
                      <ResponsiveContainer width="100%" height="100%">
                        <ComposedChart data={dadosMes} margin={{ top: 6, right: 8, left: 4, bottom: 2 }}
                                       barCategoryGap="18%" barGap={1}>
                          <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--muted-foreground) / 0.15)" />
                          {iniMes != null && (
                            <ReferenceLine y={iniMes} stroke={COR_ATUAL.stroke} strokeDasharray="4 3"
                                           strokeWidth={1} opacity={0.4} />
                          )}
                          <XAxis dataKey="mes" tick={{ fontSize: 8, fill: '#888780' }} stroke="hsl(var(--muted-foreground) / 0.22)" />
                          <YAxis tick={{ fontSize: 8, fill: '#888780' }} tickFormatter={fmtEixo} stroke="hsl(var(--muted-foreground) / 0.22)" width={46} />
                          <Tooltip content={<CustomTooltip />} />
                          {/* Areas (sob as linhas) — dataKey separado p/ não duplicar no tooltip */}
                          {!modoColuna && hasAnoAnt && (
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
                          {!modoColuna && (
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
                          )}
                          {/* Lines (por cima das áreas).
                              As duas areas acima separam PASSADO de FUTURO sem legenda:
                              `atualArea` so existe ate `mesAtual` (a serie do ano corrente
                              para ali), entao ela e o passado — 0.16. `anoAnteriorArea`
                              cobre Jan–Dez, entao depois do mes atual ela fica sozinha —
                              0.03. O contraste subiu de 0.09/0.04 para 0.16/0.03.
                              Este par NAO veio do V1: la as duas opacidades separam SERIES
                              (0.3 atual, 0.1 ano anterior), nao tempo. Valores escolhidos
                              aqui; a estrutura de duas Areas ja existia. */}
                          {!modoColuna && hasAnoAnt && (
                            <Line
                              type="monotone"
                              dataKey="anoAnterior"
                              stroke="hsl(var(--muted-foreground))"
                              strokeWidth={1.5}
                              strokeDasharray="4 2"
                              dot={DOT_V1}
                              activeDot={ACTIVE_DOT_V1}
                              connectNulls={false}
                              isAnimationActive={false}
                            />
                          )}
                          {!modoColuna && hasMeta && (
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
                          {!modoColuna && (
                            <Line
                              type="monotone"
                              dataKey="atual"
                              stroke={COR_ATUAL.stroke}
                              strokeWidth={2.5}
                              connectNulls={false}
                              isAnimationActive={false}
                              dot={(props: any) => {
                                /* Guard de nulo. `montaDados` devolve `atual: null` para
                                   mes > mesAtual, mas o dot custom era chamado para TODO
                                   indice: sem `cy` valido o <circle> ia para o topo e o
                                   clip cortava a metade de cima — as cinco marcas azuis
                                   sobre Ago–Dez. <g/> vazio, nunca null: a assinatura do
                                   dot do recharts espera ReactElement. */
                                if (props.value == null || !Number.isFinite(props.cy)) {
                                  return <g key={props.index} />;
                                }
                                /* O mes selecionado continua cheio e maior — e a unica
                                   marca que o V1 nao tem, e ela diz qual mes o painel
                                   esta olhando. Os demais viram circulo ABERTO. */
                                const isSel = props.index === mesAtual - 1 + offMes;
                                return isSel
                                  ? <circle key={props.index} cx={props.cx} cy={props.cy} r={6} fill={COR_ATUAL.stroke} />
                                  : <circle key={props.index} cx={props.cx} cy={props.cy} r={2}
                                            fill="hsl(var(--card))" stroke={COR_ATUAL.stroke} strokeWidth={1.5} />;
                              }}
                            />
                          )}
                          {/* Colunas agrupadas — fluxo mensal le melhor como barra:
                              mes a mes sao valores discretos, nao uma curva.
                              Ordem 2025 · 2026 · Meta, a mesma em que aparecem lado
                              a lado. Tres condicionais INDEPENDENTES: o recharts
                              inspeciona os filhos por TIPO e pode nao detectar
                              <Bar> dentro de Fragment.
                              Meta VAZADA — repete o idioma do marcador de meta, que
                              virou circulo aberto no PR-IDIOMA-03: meta nunca e massa.
                              SEM rotulo em cima: `max-w-4xl` da ~350px de plotagem por
                              card, e 12 meses x 3 barras sao ~9px por barra. Trinta e
                              seis numeros de 9px se sobrepoem — a leitura e pelo
                              Tooltip, que ja lista as tres series. */}
                          {modoColuna && hasAnoAnt && (
                            <Bar dataKey="anoAnterior" fill={BAR_ANO_ANT}
                                 radius={[2, 2, 0, 0]} isAnimationActive={false} />
                          )}
                          {modoColuna && (
                            <Bar dataKey="atual" fill={COR_ATUAL.stroke}
                                 radius={[2, 2, 0, 0]} isAnimationActive={false} />
                          )}
                          {modoColuna && hasMeta && (
                            <Bar dataKey="meta" fill={BAR_META}
                                 radius={[2, 2, 0, 0]} isAnimationActive={false} />
                          )}
                        </ComposedChart>
                      </ResponsiveContainer>
                    </div>
                    {/* Legenda — uma por card, como no ChartCard V1. Duplicada de
                        proposito: cada card e autonomo. O card NAO cresce — quem
                        cede altura e o grafico (flex-1, piso 140). */}
                    <div className="flex justify-center gap-2.5 px-0 mt-1.5 flex-wrap">
                      <div className="flex items-center gap-1.5">
                        <div className="w-3 h-[2px] rounded" style={{ background: COR_ATUAL.stroke }} />
                        <span className="text-[9px] text-muted-foreground">{anoAtual}</span>
                      </div>
                      {hasAnoAnt && (
                        <div className="flex items-center gap-1.5">
                          <svg width="14" height="4"><line x1="0" y1="2" x2="14" y2="2" stroke="hsl(var(--muted-foreground))" strokeWidth="2" strokeDasharray="4 3"/></svg>
                          <span className="text-[9px] text-muted-foreground">{anoAtual - 1}</span>
                        </div>
                      )}
                      {hasMeta && (
                        <div className="flex items-center gap-1.5">
                          <svg width="14" height="4"><line x1="0" y1="2" x2="14" y2="2" stroke="#F97316" strokeWidth="2" strokeDasharray="6 3"/></svg>
                          <span className="text-[9px] text-muted-foreground">Meta {anoAtual}</span>
                        </div>
                      )}
                    </div>
                  </CardContent>
                </Card>
                <Card className="flex flex-col min-h-0">
                  <CardContent className="p-3 flex flex-col flex-1 min-h-0">
                    {cabecalhoLeitura(titulos?.periodo ?? { titulo, subtitulo }, trioPeriodo,
                        `Jan–${MESES_LABELS[mesAtual - 1]}/${yy}`)}
                    {/* Altura DERIVADA: literal nao cabe em todo viewport. Piso 140px
                        mantem os 12 rotulos de mes legiveis; teto 240px impede o
                        grafico de inchar em tela grande. */}
                    <div className="flex-1" style={{ minHeight: 140, maxHeight: 240 }}>
                      <ResponsiveContainer width="100%" height="100%">
                        <ComposedChart data={dadosPeriodo} margin={{ top: 6, right: 8, left: 4, bottom: 2 }}>
                          <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--muted-foreground) / 0.15)" />
                          {iniPeriodo != null && (
                            <ReferenceLine y={iniPeriodo} stroke={COR_ATUAL.stroke} strokeDasharray="4 3"
                                           strokeWidth={1} opacity={0.4} />
                          )}
                          <XAxis dataKey="mes" tick={{ fontSize: 8, fill: '#888780' }} stroke="hsl(var(--muted-foreground) / 0.22)" />
                          <YAxis tick={{ fontSize: 8, fill: '#888780' }} tickFormatter={fmtEixo} stroke="hsl(var(--muted-foreground) / 0.22)" width={46} />
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
                              stroke="hsl(var(--muted-foreground))"
                              strokeWidth={1.5}
                              strokeDasharray="4 2"
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
                              /* Guard de nulo. `montaDados` devolve `atual: null` para
                                 mes > mesAtual, mas o dot custom era chamado para TODO
                                 indice: sem `cy` valido o <circle> ia para o topo e o
                                 clip cortava a metade de cima — as cinco marcas azuis
                                 sobre Ago–Dez. <g/> vazio, nunca null: a assinatura do
                                 dot do recharts espera ReactElement. */
                              if (props.value == null || !Number.isFinite(props.cy)) {
                                return <g key={props.index} />;
                              }
                              /* O mes selecionado continua cheio e maior — e a unica
                                 marca que o V1 nao tem, e ela diz qual mes o painel
                                 esta olhando. Os demais viram circulo ABERTO. */
                              const isSel = props.index === mesAtual - 1 + offPeriodo;
                              return isSel
                                ? <circle key={props.index} cx={props.cx} cy={props.cy} r={6} fill={COR_ATUAL.stroke} />
                                : <circle key={props.index} cx={props.cx} cy={props.cy} r={2}
                                          fill="hsl(var(--card))" stroke={COR_ATUAL.stroke} strokeWidth={1.5} />;
                            }}
                          />
                        </ComposedChart>
                      </ResponsiveContainer>
                    </div>
                    {/* Legenda — uma por card, como no ChartCard V1. Duplicada de
                        proposito: cada card e autonomo. O card NAO cresce — quem
                        cede altura e o grafico (flex-1, piso 140). */}
                    <div className="flex justify-center gap-2.5 px-0 mt-1.5 flex-wrap">
                      <div className="flex items-center gap-1.5">
                        <div className="w-3 h-[2px] rounded" style={{ background: COR_ATUAL.stroke }} />
                        <span className="text-[9px] text-muted-foreground">{anoAtual}</span>
                      </div>
                      {hasAnoAnt && (
                        <div className="flex items-center gap-1.5">
                          <svg width="14" height="4"><line x1="0" y1="2" x2="14" y2="2" stroke="hsl(var(--muted-foreground))" strokeWidth="2" strokeDasharray="4 3"/></svg>
                          <span className="text-[9px] text-muted-foreground">{anoAtual - 1}</span>
                        </div>
                      )}
                      {hasMeta && (
                        <div className="flex items-center gap-1.5">
                          <svg width="14" height="4"><line x1="0" y1="2" x2="14" y2="2" stroke="#F97316" strokeWidth="2" strokeDasharray="6 3"/></svg>
                          <span className="text-[9px] text-muted-foreground">Meta {anoAtual}</span>
                        </div>
                      )}
                    </div>
                  </CardContent>
                </Card>
              </div>
            </div>

            {/* Resumo do período (histórico multi-ano — auxiliar legado de zoot_mensal_cache).
                DOIS paineis, um por leitura: o historico chegava colapsado pelo
                viewMode do pai, entao duplicar o bloco sem duplicar o dado
                repetiria o defeito do 6.281 que o PR e6706153 corrigiu.
                Altura 96px inalterada neste PR. */}
            {historicoAno != null && (
              <div className="px-4 pb-2">
                <div className="grid grid-cols-2 gap-3">
                  <Card>
                    <CardContent className="p-3">
                      <p className="text-xs font-bold text-foreground mb-0.5 leading-tight">Histórico no mês</p>
                      <p className="text-[10px] text-muted-foreground/70 leading-snug">{`${MESES_LABELS[mesAtual - 1]}/${yy}`}</p>
                    {loadingHistorico ? (
                      <p className="text-[10px] text-muted-foreground/70 py-2">Carregando...</p>
                    ) : temDadoMes ? (
                      <ResponsiveContainer width="100%" height={160}>
                        <BarChart data={barDadosMes} margin={{ top: 18, right: 8, left: 8, bottom: 0 }} barCategoryGap="10%">
                          <XAxis dataKey="nome" tick={{ fontSize: 8, fill: '#888780' }} axisLine={false} tickLine={false} />
                          <YAxis hide />
                          {refAnoAtualMes != null && !isNaN(refAnoAtualMes) && (
                            <ReferenceLine y={refAnoAtualMes} stroke={COR_ATUAL.stroke} strokeDasharray="4 3" strokeWidth={1} opacity={0.5} />
                          )}
                          <Bar
                            dataKey="valor"
                            radius={[3, 3, 0, 0]}
                            isAnimationActive={false}
                            label={{
                              position: 'top',
                              fontSize: 9,
                              fill: 'hsl(var(--muted-foreground))',
                              formatter: (v: number) => fmtAxis(v),
                            }}
                          >
                            {barDadosMes.map((entry, i) => (
                              <Cell key={i} fill={entry.cor} />
                            ))}
                          </Bar>
                        </BarChart>
                      </ResponsiveContainer>
                    ) : (
                      <p className="text-[10px] text-muted-foreground/70 py-2">Sem dados históricos</p>
                    )}
                    </CardContent>
                  </Card>
                  <Card>
                    <CardContent className="p-3">
                      <p className="text-xs font-bold text-foreground mb-0.5 leading-tight">Histórico do período</p>
                      <p className="text-[10px] text-muted-foreground/70 leading-snug">{`Jan–${MESES_LABELS[mesAtual - 1]}/${yy}`}</p>
                    {loadingHistorico ? (
                      <p className="text-[10px] text-muted-foreground/70 py-2">Carregando...</p>
                    ) : temDadoPeriodo ? (
                      <ResponsiveContainer width="100%" height={160}>
                        <BarChart data={barDadosPeriodo} margin={{ top: 18, right: 8, left: 8, bottom: 0 }} barCategoryGap="10%">
                          <XAxis dataKey="nome" tick={{ fontSize: 8, fill: '#888780' }} axisLine={false} tickLine={false} />
                          <YAxis hide />
                          {refAnoAtualPeriodo != null && !isNaN(refAnoAtualPeriodo) && (
                            <ReferenceLine y={refAnoAtualPeriodo} stroke={COR_ATUAL.stroke} strokeDasharray="4 3" strokeWidth={1} opacity={0.5} />
                          )}
                          <Bar
                            dataKey="valor"
                            radius={[3, 3, 0, 0]}
                            isAnimationActive={false}
                            label={{
                              position: 'top',
                              fontSize: 9,
                              fill: 'hsl(var(--muted-foreground))',
                              formatter: (v: number) => fmtAxis(v),
                            }}
                          >
                            {barDadosPeriodo.map((entry, i) => (
                              <Cell key={i} fill={entry.cor} />
                            ))}
                          </Bar>
                        </BarChart>
                      </ResponsiveContainer>
                    ) : (
                      <p className="text-[10px] text-muted-foreground/70 py-2">Sem dados históricos</p>
                    )}
                    </CardContent>
                  </Card>
                </div>
              </div>
            )}
            </TabsContent>

            <TabsContent value="fazenda" className="flex-1 min-h-0 flex flex-col mt-0">
              {/* Por fazenda: 2x2 tambem, mesma grade e mesmo wrapper dos de
                  cima. SEM meta e SEM ano anterior — a aba Global responde
                  "como estou contra o planejado"; esta responde "quem esta
                  puxando". Para ver a meta de uma fazenda, o seletor do
                  cabecalho do app.
                  SEM historico: "como este ano se compara com os anteriores"
                  nao muda ao olhar por fazenda, e N x 6 barras seria ilegivel.
                  Sao dois cards, nao quatro — o espaco vazio embaixo e o preco
                  da altura constante (A7), e e o comportamento CORRETO.
                  ⚠ Estas series tem 12 posicoes, 0=Jan. Leitura por indice
                  direto `[mes - 1]`; `getMesValue` e 1-based e serve as de 13. */}
              <div className="px-4 pb-2 flex-1 min-h-0 flex flex-col">
                <div className="grid grid-cols-2 gap-3 flex-1 min-h-0">
                  <Card className="flex flex-col min-h-0">
                    <CardContent className="p-3 flex flex-col flex-1 min-h-0">
                      <p className="text-xs font-bold text-foreground mb-0.5 leading-tight">Por fazenda · no mês</p>
                      <p className="text-[10px] text-muted-foreground/70 leading-snug">{`${MESES_LABELS[mesAtual - 1]}/${yy}`}</p>
                      <div className="flex-1" style={{ minHeight: 140, maxHeight: 240 }}>
                        <ResponsiveContainer width="100%" height="100%">
                          <ComposedChart data={dadosFazenda('mes')} margin={{ top: 6, right: 8, left: 4, bottom: 2 }}>
                            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--muted-foreground) / 0.15)" />
                            <XAxis dataKey="mes" tick={{ fontSize: 8, fill: '#888780' }} stroke="hsl(var(--muted-foreground) / 0.22)" />
                            <YAxis tick={{ fontSize: 8, fill: '#888780' }} tickFormatter={fmtEixo} stroke="hsl(var(--muted-foreground) / 0.22)" width={46} />
                            <Tooltip content={<CustomTooltip />} />
                            {(seriesPorFazenda ?? []).map((f, i) => (
                              <Line
                                key={f.fazendaId}
                                type="monotone"
                                dataKey={f.nome}
                                stroke={COR_FAZENDA[i % COR_FAZENDA.length]}
                                strokeWidth={2}
                                dot={DOT_V1}
                                connectNulls={false}
                                isAnimationActive={false}
                              />
                            ))}
                          </ComposedChart>
                        </ResponsiveContainer>
                      </div>
                    </CardContent>
                  </Card>
                  <Card className="flex flex-col min-h-0">
                    <CardContent className="p-3 flex flex-col flex-1 min-h-0">
                      <p className="text-xs font-bold text-foreground mb-0.5 leading-tight">Por fazenda · no período</p>
                      <p className="text-[10px] text-muted-foreground/70 leading-snug">{`Jan–${MESES_LABELS[mesAtual - 1]}/${yy}`}</p>
                      <div className="flex-1" style={{ minHeight: 140, maxHeight: 240 }}>
                        <ResponsiveContainer width="100%" height="100%">
                          <ComposedChart data={dadosFazenda('periodo')} margin={{ top: 6, right: 8, left: 4, bottom: 2 }}>
                            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--muted-foreground) / 0.15)" />
                            <XAxis dataKey="mes" tick={{ fontSize: 8, fill: '#888780' }} stroke="hsl(var(--muted-foreground) / 0.22)" />
                            <YAxis tick={{ fontSize: 8, fill: '#888780' }} tickFormatter={fmtEixo} stroke="hsl(var(--muted-foreground) / 0.22)" width={46} />
                            <Tooltip content={<CustomTooltip />} />
                            {(seriesPorFazenda ?? []).map((f, i) => (
                              <Line
                                key={f.fazendaId}
                                type="monotone"
                                dataKey={f.nome}
                                stroke={COR_FAZENDA[i % COR_FAZENDA.length]}
                                strokeWidth={2}
                                dot={DOT_V1}
                                connectNulls={false}
                                isAnimationActive={false}
                              />
                            ))}
                          </ComposedChart>
                        </ResponsiveContainer>
                      </div>
                    </CardContent>
                  </Card>
                </div>
                {/* Legenda propria — uma so, serve os dois cards. */}
                <div className="flex justify-center gap-2.5 px-0 mt-1.5 flex-wrap">
                  {(seriesPorFazenda ?? []).map((f, i) => (
                    <div key={f.fazendaId} className="flex items-center gap-1.5">
                      <div className="w-3 h-[2px] rounded"
                           style={{ background: COR_FAZENDA[i % COR_FAZENDA.length] }} />
                      <span className="text-[10px] text-muted-foreground">{f.nome}</span>
                    </div>
                  ))}
                </div>
              </div>
            </TabsContent>
          </Tabs>


        {/* Rodapé */}
        <div className="px-4 pb-2 pt-1.5 text-[10px] text-muted-foreground text-center">
          Clique fora para fechar
        </div>

        </div>
      </div>
    </div>
  );
}
