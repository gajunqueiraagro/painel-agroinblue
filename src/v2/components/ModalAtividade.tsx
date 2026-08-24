/**
 * Modal de ATIVIDADE — varios indicadores, uma leitura por vez.
 *
 * POR QUE NAO E O IndicadorHistoricoModal. Aquele resolve o problema
 * inverso: UM indicador com DUAS leituras lado a lado. Forcar os dois usos
 * num componente so produziria o pior dos dois. O idioma visual e copiado
 * dele — grade 0.15, eixos 0.22, ticks de 8px, DOT_V1, COR_FAZENDA — mas a
 * casca e propria.
 *
 * ⚠ DUAS ARMADILHAS JA PAGAS, ambas no A13 de docs/PADROES-UI.md:
 *  1. `flex-1 min-h-0` cede ate ZERO quando o irmao nao cede. O miolo leva
 *     piso INLINE (`minHeight`), nao so `min-h-0` — foi o colapso a 20px do
 *     PR-26/27.
 *  2. Radix Tabs NAO desmonta o painel inativo e ele divide o espaco ao
 *     meio. Por isso os tres niveis aqui sao BOTOES com estado local: mais
 *     simples e sem a armadilha. Nao trocar por <Tabs> sem `data-[state=
 *     inactive]:hidden`.
 *
 * FONTE UNICA. Este componente NAO chama `usePainelConsultorData`. Sao doze
 * indicadores; se cada card montasse a propria fonte, abrir o modal montaria
 * o painel seis vezes. Tudo chega por prop, da instancia principal do
 * V2Home. A proibicao e do briefing e vale para qualquer indicador novo.
 *
 * As constantes visuais estao duplicadas do IndicadorHistoricoModal porque
 * la elas nao sao exportadas e este PR tem escopo de tres arquivos.
 * Unificar num modulo de idioma e frente propria.
 */
import { useEffect, useState } from 'react';
import {
  ComposedChart, Line, Area, Bar, BarChart, Cell, LabelList, ReferenceLine,
  XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
} from 'recharts';
import { X } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { COR_FAZENDA } from '@/lib/idiomaVisual';

/* ── Idioma visual V1, copiado ─────────────────────────────────────── */
/* Marcadores do idioma V1, copiados. Vazados: o `fill` e a cor do CARD,
   nao a da pagina — dentro de <Card> o fundo e `--card`, e apontar para
   `--background` deixa miolo cinza em card branco. */
const DOT_V1      = { r: 2, strokeWidth: 1.5, fill: 'hsl(var(--card))' };
const DOT_META_V1 = { r: 3, strokeWidth: 1.5, fill: 'hsl(var(--card))' };
/* `COR_ATUAL.stroke` do IndicadorHistoricoModal no ramo padrao. */
const COR_ATUAL   = '#185FA5';
const COR_ANO_ANT = '#B4B2A9';
const COR_META    = '#F97316';
const BAR_ANO_ANT = '#B4B2A9';
/* O Global e AZUL, a mesma cor do realizado, nas DUAS abas — e o mesmo
   numero visto de outro angulo. Ate o PR-IDIOMA-VISUAL-01 ele era cinza
   aqui enquanto a primeira fazenda ficava azul: a mesma cor significando
   "o total" numa aba e "a Pureza" na outra.
   O que distingue agregado de lugar e o TRACEJADO, nao a cor. */
const COR_GLOBAL  = COR_ATUAL;
const CHAVE_GLOBAL = '__global';
const MESES = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];

export type FormatoValor =
  | 'inteiro' | 'decimal1' | 'decimal2' | 'decimal3' | 'moeda' | 'moedaAbreviada';

export type AnoValor = { ano: number; valor: number | null };

export interface SerieFazendaAtiv {
  fazendaId: string;
  nome: string;
  codigo: string;
  mes: Array<number | null>;
  periodo: Array<number | null>;
}

/** Um card do modal. Tudo pronto: o modal nao calcula nem deriva. */
export interface IndicadorAtividade {
  chave: string;
  titulo: string;
  subtitulo: string;
  tituloMes?: string;
  tituloPeriodo?: string;
  unidade?: string;
  formatoValor: FormatoValor;
  /** Onde subir e RUIM, o delta positivo pinta vermelho (PR-14). */
  polaridade?: 'positivoBom' | 'positivoRuim';
  /** 13 posicoes, 1=Jan. Uma por leitura. */
  serieMes: number[];
  seriePeriodo: number[];
  serieAnoAntMes?: number[];
  serieAnoAntPeriodo?: number[];
  serieMetaMes?: number[];
  serieMetaPeriodo?: number[];
  valorMes: number | null;
  valorPeriodo: number | null;
  /* ⚠ INERTES desde o PR-06. Chegam do PC-100 ja COLAPSADOS pelo `viewMode`
   *  do pai (`cabDeltaMeta` le `cabSerie`, que e mes OU periodo conforme o
   *  toggle da Home), entao mostravam o MESMO numero nas duas leituras
   *  enquanto o valor grande trocava. O modal calcula o delta por leitura,
   *  a partir das series que ja recebe. Mantidos no contrato porque o
   *  V2Home os passa; NAO voltar a le-los. */
  deltaMes: number | null;
  deltaAno: number | null;
  deltaMeta: number | null;
  /** `undefined` = sem serie por fazenda; o card mostra "em construção". */
  porFazenda?: SerieFazendaAtiv[];
  /** `undefined` = sem historico; o card mostra "em construção". */
  historico?: { mes: AnoValor[]; periodo: AnoValor[] };
  /* Card INTEIRO em construcao, com o motivo. Diferente dos dois campos
     acima, que declaram a falta de UMA aba: aqui nao ha indicador nenhum,
     e o card so ocupa o lugar dele na grade. As faixas de cima seguem
     sendo desenhadas, entao a altura nao muda. */
  emConstrucao?: string;
}

interface Props {
  open: boolean;
  onClose: () => void;
  mesAtual: number;
  anoAtual: number;
  clienteNome: string;
  indicadores: IndicadorAtividade[];
  /* Assunto MOVIMENTACOES. Prop-bag separado, nao um `indicadores` unico
     filtrado por chave: os dois assuntos tem grades de larguras diferentes e
     ordens proprias, e misturar as chaves faria o `ORDEM_CARDS` de um decidir
     a posicao do outro. */
  indicadoresMovimentacoes?: IndicadorAtividade[];
  codigosFazendas: string[];
  loadingHistorico?: boolean;
}

type Assunto  = 'zootecnico' | 'movimentacoes' | 'financeiro' | 'operacional';
type Escopo   = 'global' | 'fazenda';
type Leitura  = 'mes' | 'periodo' | 'historico';
type Comparador = 'meta' | 'mes' | 'anoAnt' | 'noAno';

const ASSUNTOS: Array<{ id: Assunto; rotulo: string }> = [
  { id: 'zootecnico',    rotulo: 'Zootécnico' },
  { id: 'movimentacoes', rotulo: 'Movimentações' },
  { id: 'financeiro',    rotulo: 'Financeiro' },
  { id: 'operacional',   rotulo: 'Operacional' },
];

/* Ordem de leitura da grade — decisao de apresentacao, entao mora aqui e
   nao em quem monta o array. Chave desconhecida vai para o fim, em vez de
   sumir: card que desaparece por causa de um rotulo novo e defeito mudo. */
/* Linha 1 e ESTOQUE — o que a fazenda TEM. Linha 2 e EFICIENCIA e
   PRODUCAO — o que ela FAZ com o estoque. A grade de tres colunas faz a
   divisao coincidir com as linhas. */
/* A grade de Gabriel, lida em Z — tres por linha, quatro linhas:
     Rebanho · Peso Medio · Arrobas em Estoque
     Area Produtiva · UA/ha · Kg vivo/ha
     GMD · @ produzidas/ha · @ produzidas Totais
     R$/@ Estoque · Valor do Rebanho · Valor sem Efeito
   Chave desconhecida vai para o fim (o `99` do sort abaixo). */
const ORDEM_CARDS = [
  'cabecas',         'pesoMedio',    'arrobasEstoque',
  'areaProdutiva',   'uaHa',         'kgHa',
  'gmd',             'arrobasHa',    'arrobas',
  'precoArrEstoque', 'valorRebanho', 'valorRebanhoSemEfeito',
];

/* Indicadores cujo REALIZADO do mes le melhor como coluna: fluxo mensal e
   valor discreto, e a curva liga janeiro a fevereiro como se houvesse
   trajetoria entre meses independentes. Mesma decisao do PR-16 e do PR-32.
   So no nivel "No mes" — periodo e acumulado, e acumulado e curva. */
const COLUNA_NO_MES = ['arrobas', 'gmd', 'arrobasHa'];

/* MOVIMENTACOES — QUATRO por linha, nao tres. Cada LINHA e um tipo de
   movimento e cada COLUNA e uma lente, entao a leitura horizontal conta a
   historia de um movimento: quantos, de que peso, a que preco, por quanto.
   O Zootecnico continua em tres: os doze cards dele foram dimensionados para
   aquela largura, e mudar quebraria o que ja foi homologado.
   ⚠ Em `max-w-7xl` com quatro colunas o card fica em ~280px, e treze rotulos
   de mes so cabem com UMA LETRA. O piso de 8px do A12 continua valendo — se
   colidirem, o caminho e outro, nao fonte menor. */
const ORDEM_CARDS_MOV = [
  'nasc_cab',      'nasc_peso',      'nasc_preco',      'nasc_valor',
  'compra_cab',    'compra_peso',    'compra_preco',    'compra_valor',
  'venda_cab',     'venda_peso',     'venda_preco',     'venda_valor',
  'abate_cab',     'abate_peso',     'abate_preco',     'abate_valor',
  'consumo_cab',   'consumo_peso',   'consumo_preco',   'consumo_valor',
  'morte_cab',     'morte_peso',     'morte_preco',     'morte_valor',
  'desfrute_cab',  'desfrute_peso',  'desfrute_preco',  'desfrute_valor',
];

/* ALTURAS FIXAS DAS FAIXAS DO CARD — o remedio do PR-ATIVIDADE-03.
   O cabecalho tinha altura VARIAVEL: um chip marcado dava dois deltas,
   quatro davam cinco linhas, e como cada card se dimensiona sozinho eles
   desalinhavam entre si e PULAVAM ao marcar. Cada faixa passa a ter altura
   do PIOR CASO, e sobrar branco com menos chips e o comportamento CORRETO —
   e a logica da A7: estabilidade vale mais que compactacao.
   ⚠ O grafico tem altura FIXA, nao `flex-1`. E o oposto do PR-27 e e
   deliberado: la o defeito era colapso, aqui e instabilidade. */
const H_TITULO  = 44;   // duas linhas de titulo + subtitulo
const H_DELTAS  = 44;   // quatro deltas de 11px — o pior caso
const H_CHIPS   = 20;   // uma fileira de chips h-4
const H_GRAFICO = 190;   // 170 -> 190 no PR-05; o mesmo N nos DOZE cards,
                         // senao volta o desalinhamento do PR-03.
const H_LEGENDA = 16;   // reservada SEMPRE: some-la em Global mudaria a
                        // altura do card ao trocar de nivel.
/* Quantas fazendas cabem sob o valor, na aba Por fazenda. O bloco superior
   tem H_TITULO + H_DELTAS = 88; o valor e o respiro comem ~16, e cada linha
   de `text-[10px] leading-tight` mede ~12. Sobram 72, ou seis linhas
   exatas — fico em CINCO e mostro "+N" no lugar da sexta, para nao gastar a
   ultima folga: estourar aqui empurraria o grafico e traria de volta o
   desalinhamento que o PR-03 tirou. */
const MAX_FAZ_CABECALHO = 5;

const fmtN = (v: number | null | undefined, casas: number) =>
  v == null || isNaN(v) ? '—' : v.toLocaleString('pt-BR', { minimumFractionDigits: casas, maximumFractionDigits: casas });

const fmtR = (v: number | null | undefined) =>
  v == null || isNaN(v) ? '—' : v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

const fmtRAbrev = (v: number | null | undefined): string => {
  if (v == null || isNaN(v)) return '—';
  const abs = Math.abs(v);
  const f = (n: number, s: string) => `R$ ${n.toFixed(1).replace('.', ',')}${s}`;
  if (abs >= 1e9) return f(v / 1e9, 'B');
  if (abs >= 1e6) return f(v / 1e6, 'M');
  if (abs >= 1e3) return f(v / 1e3, 'K');
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 });
};

const fmtValor = (v: number | null | undefined, fmt: FormatoValor, unidade?: string) => {
  const suf = unidade ? ' ' + unidade : '';
  if (fmt === 'inteiro')        return fmtN(v, 0) + suf;
  if (fmt === 'decimal1')       return fmtN(v, 1) + suf;
  if (fmt === 'decimal2')       return fmtN(v, 2) + suf;
  if (fmt === 'decimal3')       return fmtN(v, 3) + suf;
  if (fmt === 'moeda')          return fmtR(v);
  return fmtRAbrev(v);
};

/* Eixo: acima de mil sem decimal — "50.000,0" nao cabe na canaleta. */
const fmtEixo = (v: number | null | undefined, fmt: FormatoValor): string => {
  if (v == null || isNaN(v)) return '';
  if (fmt === 'moedaAbreviada') return fmtRAbrev(v).replace('R$ ', '');
  if (Math.abs(v) >= 1000) return fmtN(v, 0);
  if (fmt === 'decimal3') return fmtN(v, 3);
  if (fmt === 'decimal2') return fmtN(v, 2);
  if (fmt === 'decimal1') return fmtN(v, 1);
  return fmtN(v, 0);
};

/* Mesma formula do hook: ((curr - ref) / ref) * 100, com guarda de
   nulo/NaN/zero. Nao e regra nova — e a que o PC-100 ja aplica. */
const calcDelta = (a: number | null, b: number | null): number | null =>
  a == null || b == null || isNaN(a) || isNaN(b) || b === 0 ? null : ((a - b) / b) * 100;

/** 13 posicoes, 1=Jan; 12 posicoes, 0=Jan. Decide pelo comprimento. */
const valorDoMes = (serie: number[] | undefined, mes: number): number | null => {
  if (!serie || mes < 1 || mes > 12) return null;
  const v = serie.length >= 13 ? serie[mes] : serie[mes - 1];
  return v != null && !isNaN(v) ? v : null;
};

const btn = (ativo: boolean, tamanho: 'g' | 'p') =>
  [
    tamanho === 'g' ? 'px-3 h-7 text-[11px]' : 'px-2.5 h-6 text-[10px]',
    'rounded-md border transition-colors whitespace-nowrap',
    ativo
      ? 'bg-primary text-primary-foreground border-primary font-medium'
      : 'bg-card text-muted-foreground border-border/50 hover:bg-muted/50',
  ].join(' ');

/* Ocupa exatamente o mesmo espaco do grafico mais a legenda: card que
   encolhe por falta de dado desalinha a grade e faz o buraco parecer erro
   de layout, nao ausencia declarada. */
const EmConstrucao = ({ motivo }: { motivo: string }) => (
  <div className="flex items-center justify-center" style={{ height: H_GRAFICO + H_LEGENDA }}>
    <p className="text-[10px] text-muted-foreground/70 italic text-center px-4">
      em construção<br />
      <span className="text-[9px] not-italic">{motivo}</span>
    </p>
  </div>
);

/* ─────────────────────────────────────────────────────────────────────
   COMPONENTES E HELPERS NO NIVEL DE MODULO — nao mover para dentro.

   Ate o PR-07 `CardIndicador`, `Deltas` e `CustomTooltip` eram declarados
   DENTRO do corpo de `ModalAtividade`. A cada render eles viravam funcoes
   NOVAS, e o React reconcilia comparando `element.type` por REFERENCIA:
   tipo diferente nao e atualizado, e desmontado e remontado. A `key` nao
   salva — ela so desempata entre irmaos do MESMO tipo.

   Como o estado dos chips mora em `ModalAtividade`, cada clique remontava
   os cards inteiros. O miolo rolavel ficava sem filhos por um
   instante, o `scrollHeight` colapsava, o navegador clampava o `scrollTop`
   para zero — e a tela saltava para o topo.

   `EmConstrucao` sempre esteve aqui fora e nunca teve o problema; foi o
   contraste que fechou o diagnostico.

   O preco de morar aqui e receber por PROP o que antes vinha do closure.
   E o preco certo: componente que se recria a cada render tambem perde o
   estado interno dos graficos e paga render a toa.
   ───────────────────────────────────────────────────────────────────── */

/* Uma linha por mes, colunas por serie. `atual` para em `mesAtual`; meta e
   ano anterior seguem Jan–Dez, que e o padrao dos modais executivos. */
const serieAtual = (ind: IndicadorAtividade, leitura: Leitura) =>
  leitura === 'periodo' ? ind.seriePeriodo : ind.serieMes;

/* A FOTO DO INICIO DO ANO. O hook publica o inicial na posicao 0 das
   series de 13, e SO no realizado de `cabecas` e `pesoMedio`
   (`comInicial`, usePainelConsultorData:1850). Onde ela e finita, o card
   ganha a categoria "Ini" e a horizontal; onde nao, segue com doze
   categorias, sem slot vazio. Um teste serve as duas coisas — e ao chip
   `no ano`, que compara contra esse mesmo ponto. */
const inicial = (ind: IndicadorAtividade, leitura: Leitura): number | null => {
  const s = serieAtual(ind, leitura);
  return s && s.length >= 13 && Number.isFinite(s[0]) ? s[0] : null;
};

const dadosGlobal = (ind: IndicadorAtividade, leitura: Leitura, mesAtual: number) => {
  const sAtual = serieAtual(ind, leitura);
  const sAnt   = leitura === 'periodo' ? ind.serieAnoAntPeriodo : ind.serieAnoAntMes;
  const sMeta  = leitura === 'periodo' ? ind.serieMetaPeriodo : ind.serieMetaMes;
  const meses = MESES.map((m, idx) => ({
    mes: m,
    atual:       idx + 1 <= mesAtual ? valorDoMes(sAtual, idx + 1) : null,
    anoAnterior: valorDoMes(sAnt, idx + 1),
    meta:        valorDoMes(sMeta, idx + 1),
  }));
  const ini = inicial(ind, leitura);
  if (ini == null) return meses;
  /* `anoAnterior` e `meta` ficam nulos de proposito: para o ano anterior o
     inicial seria dezembro de dois anos atras, que nao existe. */
  return [{ mes: 'Ini', atual: ini, anoAnterior: null, meta: null }, ...meses];
};

/* Series por fazenda tem 12 posicoes, 0=Jan — leitura por indice DIRETO.
   O Global entra como coluna propria, tracejado por cima. */
const dadosFazenda = (ind: IndicadorAtividade, leitura: Leitura, mesAtual: number) => {
  const campo = leitura === 'periodo' ? 'periodo' : 'mes';
  const sGlobal = leitura === 'periodo' ? ind.seriePeriodo : ind.serieMes;
  return MESES.map((m, idx) => {
    const linha: Record<string, string | number | null> = { mes: m };
    for (const f of ind.porFazenda ?? []) {
      const v = f[campo][idx];
      linha[f.codigo] = typeof v === 'number' && Number.isFinite(v) ? v : null;
    }
    linha[CHAVE_GLOBAL] = idx + 1 <= mesAtual ? valorDoMes(sGlobal, idx + 1) : null;
    return linha;
  });
};

/* O nivel 3 SUBSTITUI mes/periodo, entao nao ha leitura selecionada aqui.
   As barras usam a serie do MES — "quanto foi julho de cada ano" — que e a
   comparacao que o historico responde. A serie do periodo chega no mesmo
   objeto e fica sem consumidor: se o quarto botao ("Histórico acumulado")
   existir um dia, e so ela. */
const barrasHistorico = (ind: IndicadorAtividade, anoAtual: number) => {
  const lista = ind.historico?.mes;
  return (lista ?? [])
    .filter(p => p.valor != null && !isNaN(p.valor))
    .map(p => ({ nome: String(p.ano), valor: p.valor as number, atual: p.ano === anoAtual }));
};

/* Tooltip proprio, COPIADO do `IndicadorHistoricoModal` — nao e um
   terceiro desenho. Nao foi extraido para lib porque aquele arquivo esta
   em homologacao (PR-31/32) e mexer nele arriscaria uma regressao que so
   apareceria ao abrir o outro modal. Unificar tooltip, cores e
   formatadores num modulo de idioma e a mesma frente ja registrada.
   Resolve os dois defeitos do default do recharts: o tamanho, e a
   DUPLICATA — Area e Line da mesma chave entram as duas no payload, e o
   filtro por chave conhecida deixa passar uma so. */
const CustomTooltip = ({ active, payload, label, ind, escopo, anoAtual }: {
  active?: boolean;
  payload?: Array<{ dataKey?: string | number; value?: number; color?: string }>;
  label?: string;
  ind: IndicadorAtividade;
  escopo: Escopo;
  anoAtual: number;
}) => {
  if (!active || !payload || payload.length === 0) return null;

  type Ln = { rotulo: string; cor: string; valor: number; tracejado: boolean };
  const linhas: Ln[] = [];
  const vistos = new Set<string>();
  const push = (chave: string, rotulo: string, tracejado: boolean) => {
    if (vistos.has(chave)) return;
    const e = payload.find(x => String(x.dataKey) === chave);
    if (!e || e.value == null) return;
    vistos.add(chave);
    linhas.push({ rotulo, cor: e.color ?? COR_ATUAL, valor: e.value, tracejado });
  };

  if (escopo === 'fazenda') {
    /* Global PRIMEIRO, com o rotulo legivel — `__global` e chave interna e
       nunca aparece na UI. Depois as fazendas, na ordem das series. */
    push(CHAVE_GLOBAL, 'Global', true);
    for (const f of ind.porFazenda ?? []) push(f.codigo, f.codigo, false);
  } else {
    /* Ordem 2026 · 2025 · Meta, e rotulo pelo ANO — nunca o nome cru da
       chave. */
    push('atual', String(anoAtual), false);
    push('anoAnterior', String(anoAtual - 1), true);
    push('meta', `Meta ${anoAtual}`, false);
  }
  if (linhas.length === 0) return null;

  return (
    <div className="rounded-sm border border-border/20 bg-background/60 backdrop-blur-[2px] px-1.5 py-0.5 text-[9px] leading-tight">
      <p className="font-medium text-foreground/85 text-[9px] mb-0.5">{label}</p>
      {linhas.map((l, i) => (
        <div key={i} className="flex items-center gap-1">
          {l.tracejado
            ? <div className="w-2 border-t-[2px] border-dashed" style={{ borderColor: l.cor }} />
            : <div className="w-1 h-1 rounded-full" style={{ background: l.cor }} />}
          <span className="text-foreground/90">{fmtValor(l.valor, ind.formatoValor, ind.unidade)}</span>
          <span className="text-muted-foreground/80 text-[8px]">{l.rotulo}</span>
        </div>
      ))}
    </div>
  );
};

/* Um delta por comparador MARCADO, empilhados. `mes` compara com o mes
   anterior da propria serie — e um ponto, nao uma serie, por isso ele
   entra aqui e NAO desenha linha no grafico. */
const Deltas = ({ ind, sel, leitura, mesAtual }: {
  ind: IndicadorAtividade; sel: Comparador[]; leitura: Leitura; mesAtual: number;
}) => {
  /* DELTAS POR LEITURA. Os `ind.delta*` que chegam do hook vem colapsados
     pelo `viewMode` do pai e davam o MESMO numero em "No mes" e "No
     periodo" — mesma classe do 6.281 duplicado que o e6706153 corrigiu:
     dois recortes mostrando um numero so.
     A formula e a do hook, ((curr - ref) / ref) * 100 no ponto `mesAtual`;
     o que muda e a serie de onde ela le. */
  const sAtual = serieAtual(ind, leitura);
  const sMeta  = leitura === 'periodo' ? ind.serieMetaPeriodo   : ind.serieMetaMes;
  const sAnt   = leitura === 'periodo' ? ind.serieAnoAntPeriodo : ind.serieAnoAntMes;
  const val    = valorDoMes(sAtual, mesAtual);
  const TODOS: Array<{ op: Comparador; rot: string; d: number | null }> = [
    { op: 'meta',   rot: 'meta',     d: calcDelta(val, valorDoMes(sMeta, mesAtual)) },
    /* `mes` compara com o mes ANTERIOR da propria serie — por isso ele nao
       desenha linha: e um ponto, nao uma serie. */
    { op: 'mes',    rot: 'mês',      d: calcDelta(val, valorDoMes(sAtual, mesAtual - 1)) },
    { op: 'anoAnt', rot: 'ano ant.', d: calcDelta(val, valorDoMes(sAnt, mesAtual)) },
    /* `no ano` compara com a foto do inicio do ano — os dois pontos ja
       estao aqui, entao nao ha prop nova nem fonte nova. */
    { op: 'noAno',  rot: 'no ano',   d: calcDelta(val, inicial(ind, leitura)) },
  ];
  const itens = TODOS.filter(x => sel.includes(x.op));
  if (itens.length === 0) return null;
  return (
    <div className="flex flex-col items-end gap-0">
      {itens.map(({ op, rot, d }) => {
        if (d == null || isNaN(d)) {
          return <span key={op} className="text-[9px] text-muted-foreground/60">— {rot}</span>;
        }
        const bom = ind.polaridade === 'positivoRuim' ? d < 0 : d > 0;
        /* A SETA E DIRECAO, NAO QUALIDADE (A14): numero que subiu aponta
           para cima mesmo quando subir e ruim. Quem carrega o juizo e a
           COR. */
        return (
          <span key={op} className={`text-[9px] font-medium ${bom ? 'text-emerald-600' : 'text-red-600'}`}>
            {d >= 0 ? '↗' : '↙'} {d > 0 ? '+' : ''}{d.toFixed(1)}%
            <span className="text-muted-foreground/60 font-normal"> {rot}</span>
          </span>
        );
      })}
    </div>
  );
};

/* O rotulo do valor SO sobre o ponto/barra do mes filtrado — em todos os
   meses, treze numeros de 9px em ~450px de plotagem se sobrepoem.
   ⚠ O offset vem do PROPRIO array: prepender "Ini" desloca todos os
   indices em um, e fixar o numero e a armadilha do A12. */
const rotuloDoMes = (ind: IndicadorAtividade, leitura: Leitura, mesAtual: number) =>
  (props: { index?: number; x?: number | string; y?: number | string; width?: number | string; value?: number | string }) => {
    const off = dadosGlobal(ind, leitura, mesAtual).length > 12 ? 1 : 0;
    if (props.index !== mesAtual - 1 + off) return null;
    const v = typeof props.value === 'number' ? props.value : null;
    if (v == null) return null;
    /* Na barra o `x` e a borda esquerda e vem `width`; na linha, o proprio
       ponto. Centralizar exige somar meia largura quando ela existe. */
    const cx = Number(props.x) + (props.width != null ? Number(props.width) / 2 : 0);
    return (
      <text x={cx} y={Number(props.y) - 6} fontSize={9}
            fill="hsl(var(--foreground))" textAnchor="middle">
        {fmtValor(v, ind.formatoValor, ind.unidade)}
      </text>
    );
  };

const CardIndicador = ({
  ind, escopo, leitura, mesAtual, anoAtual, rotuloMes, rotuloPer, sel, alterna,
}: {
  ind: IndicadorAtividade;
  escopo: Escopo;
  leitura: Leitura;
  mesAtual: number;
  anoAtual: number;
  rotuloMes: string;
  rotuloPer: string;
  sel: Comparador[];
  alterna: (chave: string, op: Comparador) => void;
}) => {
  const titulo = leitura === 'periodo'
    ? (ind.tituloPeriodo ?? ind.titulo)
    : (ind.tituloMes ?? ind.titulo);
  /* No historico o recorte de cada barra continua sendo o do nivel
     anterior — mas o nivel 3 substitui mes/periodo, entao o subtitulo
     declara a janela de anos, nao o mes. */
  const sub = leitura === 'historico'
    ? `${anoAtual - 5}–${anoAtual}`
    : leitura === 'periodo' ? rotuloPer : rotuloMes;
  const valor = leitura === 'periodo' ? ind.valorPeriodo : ind.valorMes;
  const colunaRealizado =
    escopo === 'global' && leitura === 'mes' && COLUNA_NO_MES.includes(ind.chave);
  /* Chip DESABILITADO, nunca invisivel, quando a serie nao existe: sumir
     com o controle esconde a ausencia; desabilitar declara. O motivo vai
     no `title`. `mes` nunca desabilita — o mes anterior sai da propria
     serie do realizado. */
  const temSerie = (op: Comparador) =>
    op === 'mes'   ? true
    : op === 'noAno' ? inicial(ind, leitura) != null
    : op === 'meta'
      ? !!(leitura === 'periodo' ? ind.serieMetaPeriodo : ind.serieMetaMes)
      : !!(leitura === 'periodo' ? ind.serieAnoAntPeriodo : ind.serieAnoAntMes);
  const mostra = (op: Comparador) => sel.includes(op) && temSerie(op);

  return (
    <Card>
      <CardContent className="p-3">
        {/* BLOCO SUPERIOR — duas COLUNAS, nao duas faixas empilhadas.
            O vao que aparecia entre o valor e o primeiro delta nascia aqui:
            o valor era irmao do titulo numa faixa de altura fixa
            dimensionada pelo pior caso do TITULO (duas linhas), e ancorado
            no topo. Com titulo de uma linha sobravam ~30px MORTOS abaixo do
            valor, e os deltas so comecavam depois deles.
            Agora valor e deltas sao a MESMA coluna: os deltas encostam no
            valor por construcao e o branco reservado sobra no FIM, onde nao
            se ve.
            A altura total continua FIXA — H_TITULO + H_DELTAS — e igual nos
            doze cards. Foi o que o PR-03 estabeleceu e o que impede o pulo
            ao marcar chip; se ela passar a depender do conteudo, e
            regressao, nao ajuste. */}
        <div className="flex items-start justify-between gap-2 overflow-hidden"
             style={{ height: H_TITULO + H_DELTAS }}>
          {/* Coluna esquerda: o titulo agora tem a largura inteira dela —
              ate duas linhas, sem truncar, em `text-xs`. */}
          <div className="min-w-0">
            <p className="text-xs font-bold text-foreground leading-tight">{titulo}</p>
            <p className="text-[10px] text-muted-foreground/70 leading-snug">{sub}</p>
          </div>
          {/* Coluna direita: valor no topo, deltas colados abaixo. */}
          <div className="flex flex-col items-end justify-start shrink-0">
            <span className="text-sm font-bold text-foreground leading-none tabular-nums">
              {fmtValor(valor, ind.formatoValor, ind.unidade)}
            </span>
            <div className="mt-0.5">
              {escopo === 'global' && leitura !== 'historico' && <Deltas ind={ind} sel={sel} leitura={leitura} mesAtual={mesAtual} />}
              {/* Na aba Por fazenda o espaco sob o valor global recebe os
                  numeros de cada fazenda — a mesma informacao que o E5
                  tentaria por rotulo no grafico, mas aqui garantidamente
                  legivel. Ordem de CADASTRO, para a cor e a posicao serem
                  as mesmas em todo grafico e em toda sessao. */}
              {escopo === 'fazenda' && leitura !== 'historico' && (ind.porFazenda?.length ?? 0) > 0 && (
                <div className="flex flex-col items-end">
                  {(ind.porFazenda ?? []).slice(0, MAX_FAZ_CABECALHO).map((f, i) => {
                    const v = (leitura === 'periodo' ? f.periodo : f.mes)[mesAtual - 1];
                    return (
                      <span key={f.fazendaId} className="flex items-center gap-1 text-[10px] leading-tight">
                        <span className="w-1.5 h-1.5 rounded-full shrink-0"
                              style={{ background: COR_FAZENDA[i % COR_FAZENDA.length] }} />
                        <span className="text-muted-foreground/70">{f.codigo}</span>
                        <span className="text-foreground/90 tabular-nums">
                          {typeof v === 'number' && Number.isFinite(v)
                            ? fmtValor(v, ind.formatoValor, undefined)
                            : '—'}
                        </span>
                      </span>
                    );
                  })}
                  {(ind.porFazenda?.length ?? 0) > MAX_FAZ_CABECALHO && (
                    <span className="text-[10px] leading-tight text-muted-foreground/60">
                      +{(ind.porFazenda?.length ?? 0) - MAX_FAZ_CABECALHO}
                    </span>
                  )}
                </div>
              )}
          </div>
        </div>
        </div>

        {/* FAIXA 3 — os chips, logo acima do grafico e a DIREITA: valor,
            deltas e chips sao a mesma coluna de leitura — o numero, a
            comparacao, e o controle da comparacao. Alinhados a direita o
            olho desce uma coluna so; a esquerda ele volta atras.
            SO no Global: na aba Por fazenda as series sao LUGARES, nao
            cenarios, e comparar com meta ali seria outra pergunta. */}
        <div className="flex items-center justify-end overflow-hidden" style={{ height: H_CHIPS }}>
          {escopo === 'global' && leitura !== 'historico' && (
                <div className="flex gap-0.5">
                  {(['meta', 'mes', 'anoAnt', 'noAno'] as Comparador[]).map(op => {
                    const ok = temSerie(op);
                    const on = sel.includes(op);
                    return (
                      <button
                        key={op}
                        disabled={!ok}
                        title={ok
                          ? undefined
                          : op === 'meta'  ? 'sem série de meta para este indicador'
                          : op === 'noAno' ? 'sem foto do início do ano para este indicador'
                                           : 'sem série de ano anterior para este indicador'}
                        onClick={() => alterna(ind.chave, op)}
                        className={`px-1 h-4 rounded text-[8px] border ${
                          !ok
                            ? 'bg-transparent text-muted-foreground/30 border-transparent line-through cursor-not-allowed'
                            : on
                              ? 'bg-muted text-foreground border-border'
                              : 'bg-transparent text-muted-foreground/60 border-transparent hover:bg-muted/40'
                        }`}
                      >
                        {op === 'meta' ? 'meta' : op === 'mes' ? 'mês'
                          : op === 'anoAnt' ? 'ano ant.' : 'no ano'}
                      </button>
                    );
                  })}
                </div>
          )}
        </div>

        {ind.emConstrucao ? (
          <EmConstrucao motivo={ind.emConstrucao} />
        ) : escopo === 'fazenda' && !ind.porFazenda ? (
          <EmConstrucao motivo="sem série por fazenda" />
        ) : leitura === 'historico' && !ind.historico ? (
          <EmConstrucao motivo="sem histórico multi-ano" />
        ) : leitura === 'historico' && escopo === 'fazenda' ? (
          <EmConstrucao motivo="histórico por fazenda ainda não existe" />
        ) : (
          <>
            {/* Altura FIXA, nao `flex-1`: e o `flex-1` que faz o grafico
                ceder e crescer conforme o irmao, e era ele que movia a base
                dos cards. Com N igual nos doze, a grade alinha em cima
                (faixas fixas) e embaixo (grafico fixo). */}
            <div style={{ height: H_GRAFICO }}>
            <ResponsiveContainer width="100%" height="100%">
              {leitura === 'historico' ? (
                <BarChart data={barrasHistorico(ind, anoAtual)}
                          margin={{ top: 16, right: 8, left: 8, bottom: 0 }} barCategoryGap="14%">
                  <XAxis dataKey="nome" tick={{ fontSize: 8, fill: '#888780' }} axisLine={false} tickLine={false} />
                  <YAxis hide />
                  <Bar dataKey="valor" radius={[3, 3, 0, 0]} isAnimationActive={false}>
                    {barrasHistorico(ind, anoAtual).map((e, i) => (
                      <Cell key={i} fill={e.atual ? COR_ATUAL : BAR_ANO_ANT} />
                    ))}
                  </Bar>
                </BarChart>
              ) : escopo === 'fazenda' ? (
                <ComposedChart data={dadosFazenda(ind, leitura, mesAtual)} margin={{ top: 6, right: 8, left: 4, bottom: 2 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--muted-foreground) / 0.15)" />
                  <XAxis dataKey="mes" tick={{ fontSize: 8, fill: '#888780' }} stroke="hsl(var(--muted-foreground) / 0.22)" />
                  <YAxis tick={{ fontSize: 8, fill: '#888780' }} width={46}
                         tickFormatter={v => fmtEixo(v, ind.formatoValor)}
                         stroke="hsl(var(--muted-foreground) / 0.22)" />
                  <Tooltip content={<CustomTooltip ind={ind} escopo={escopo} anoAtual={anoAtual} />} />
                  {/* Por `map`, NUNCA em fragmento: o recharts inspeciona
                      filhos por tipo e nao acha o que estiver embrulhado. */}
                  {(ind.porFazenda ?? []).map((f, i) => (
                    <Line key={f.fazendaId} type="monotone" dataKey={f.codigo}
                          stroke={COR_FAZENDA[i % COR_FAZENDA.length]} strokeWidth={2}
                          dot={DOT_V1} connectNulls={false} isAnimationActive={false} />
                  ))}
                  {/* Global DEPOIS, para ficar por cima. Tracejado porque e
                      referencia, nao mais um lugar. */}
                  <Line type="monotone" dataKey={CHAVE_GLOBAL} stroke={COR_GLOBAL}
                        strokeWidth={2.5} strokeDasharray="4 2" dot={DOT_V1}
                        connectNulls={false} isAnimationActive={false} />
                </ComposedChart>
              ) : (
                <ComposedChart data={dadosGlobal(ind, leitura, mesAtual)} margin={{ top: 14, right: 8, left: 4, bottom: 2 }}
                               barCategoryGap="18%">
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--muted-foreground) / 0.15)" />
                  {/* A horizontal na altura do inicial: da para ler de
                      relance se o ano esta acima ou abaixo de onde comecou. */}
                  {inicial(ind, leitura) != null && (
                    <ReferenceLine y={inicial(ind, leitura) as number} stroke={COR_ATUAL}
                                   strokeDasharray="4 3" strokeWidth={1} opacity={0.5} />
                  )}
                  <XAxis dataKey="mes" tick={{ fontSize: 8, fill: '#888780' }} stroke="hsl(var(--muted-foreground) / 0.22)" />
                  <YAxis tick={{ fontSize: 8, fill: '#888780' }} width={46}
                         tickFormatter={v => fmtEixo(v, ind.formatoValor)}
                         stroke="hsl(var(--muted-foreground) / 0.22)" />
                  <Tooltip content={<CustomTooltip ind={ind} escopo={escopo} anoAtual={anoAtual} />} />
                  {/* Os chips governam O GRAFICO, nao so o numero do delta.
                      `mes` NAO aparece aqui de proposito: o mes anterior e um
                      PONTO da propria serie do realizado, nao uma serie —
                      ele move o delta e nao desenha linha. */}
                  {mostra('anoAnt') && (
                    <Area type="monotone" dataKey="anoAnterior" stroke="none"
                          fill={COR_ANO_ANT} fillOpacity={0.12} isAnimationActive={false} />
                  )}
                  {mostra('anoAnt') && (
                    <Line type="monotone" dataKey="anoAnterior" stroke={COR_ANO_ANT}
                          strokeWidth={1.5} strokeDasharray="4 2" dot={DOT_V1}
                          connectNulls={false} isAnimationActive={false} />
                  )}
                  {mostra('meta') && (
                    <Line type="monotone" dataKey="meta" stroke={COR_META}
                          strokeWidth={2} dot={DOT_META_V1} connectNulls={false}
                          isAnimationActive={false} />
                  )}
                  {/* O REALIZADO nunca e condicional: ele e o assunto do
                      card. Com zero chips marcados sobra so ele, e isso e
                      leitura legitima.
                      Em `arrobas` e `gmd` ele vira BARRA no nivel do mes —
                      meta e ano anterior seguem linha, por cima.
                      Condicionais INDIVIDUAIS, nunca um fragmento: o
                      recharts inspeciona filhos por tipo e nao acha <Bar>
                      embrulhado. */}
                  {colunaRealizado && (
                    <Bar dataKey="atual" fill={COR_ATUAL} radius={[2, 2, 0, 0]}
                         isAnimationActive={false}>
                      {/* Com o realizado em barra o rotulo do mes filtrado
                          muda de ancora: a LabelList vive na <Bar>, nao na
                          <Line>, senao ela apontaria para uma serie que nao
                          esta desenhada. */}
                      <LabelList dataKey="atual" content={rotuloDoMes(ind, leitura, mesAtual)} />
                    </Bar>
                  )}
                  {!colunaRealizado && (
                    <Area type="monotone" dataKey="atual" stroke="none"
                          fill={COR_ATUAL} fillOpacity={0.10} isAnimationActive={false} />
                  )}
                  {!colunaRealizado && (
                  <Line type="monotone" dataKey="atual" stroke={COR_ATUAL}
                        strokeWidth={2.5} dot={DOT_V1} connectNulls={false} isAnimationActive={false}>
                    {/* E11 — o valor SO sobre o ponto do mes filtrado. Em
                        todos os meses poluiria: treze rotulos de 9px em
                        ~450px de plotagem se sobrepoem.
                        ⚠ O offset vem do PROPRIO array. Prepender "Ini"
                        desloca todos os indices em um, e fixar o numero e a
                        armadilha do A12 — ja cobrou uma vez. */}
                    <LabelList dataKey="atual" content={rotuloDoMes(ind, leitura, mesAtual)} />
                  </Line>
                  )}
                </ComposedChart>
              )}
            </ResponsiveContainer>
            </div>
            {/* Legenda com AMOSTRA: sem o tracinho o codigo nao liga a
                linha nenhuma. O piso do grafico cai de 150 para 132 quando
                ela aparece, entao o card NAO cresce — a legenda entra no
                espaco que ja existia. */}
            {/* Faixa da legenda RESERVADA sempre: escondida em Global ela
                encolheria o card ao trocar de nivel, que e o mesmo pulo que
                este PR esta tirando. */}
            <div className="overflow-hidden" style={{ height: H_LEGENDA }}>
            {escopo === 'fazenda' && leitura !== 'historico' && (
              <div className="flex justify-center gap-2.5 px-0 mt-0.5 flex-wrap">
                <div className="flex items-center gap-1.5">
                  <div className="w-3 border-t-[2px] border-dashed" style={{ borderColor: COR_GLOBAL }} />
                  <span className="text-[9px] text-muted-foreground">Global</span>
                </div>
                {(ind.porFazenda ?? []).map((f, i) => (
                  <div key={f.fazendaId} className="flex items-center gap-1.5">
                    <div className="w-3 h-[2px] rounded"
                         style={{ background: COR_FAZENDA[i % COR_FAZENDA.length] }} />
                    <span className="text-[9px] text-muted-foreground">{f.codigo}</span>
                  </div>
                ))}
              </div>
            )}
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
};

export function ModalAtividade({
  open, onClose, mesAtual, anoAtual, clienteNome, indicadores, codigosFazendas,
  loadingHistorico, indicadoresMovimentacoes,
}: Props) {
  const [assunto, setAssunto] = useState<Assunto>('zootecnico');
  const [escopo,  setEscopo]  = useState<Escopo>('global');
  const [leitura, setLeitura] = useState<Leitura>('mes');
  /* MULTI-selecao por GRAFICO — nao por modal. O seletor nao troca so o
     numero do delta: ele decide QUAIS COMPARADORES aparecem no grafico.
     Qualquer combinacao vale, inclusive NENHUMA: sem nada marcado o card
     mostra so a linha do realizado, que e leitura legitima e nao estado
     invalido. O realizado nunca some — ele e o assunto, nao um comparador. */
  const [comparadores, setComparadores] = useState<Record<string, Comparador[]>>({});
  const marcados = (chave: string) => comparadores[chave] ?? ['meta'];
  const alterna = (chave: string, op: Comparador) =>
    setComparadores(s => {
      const atual = s[chave] ?? ['meta'];
      return { ...s, [chave]: atual.includes(op) ? atual.filter(c => c !== op) : [...atual, op] };
    });

  /* Estado reiniciado a cada abertura: reabrir num nivel que ficou de uma
     sessao anterior desorienta — o modal sempre comeca no mesmo lugar. */
  useEffect(() => {
    if (open) {
      setAssunto('zootecnico');
      setEscopo('global');
      setLeitura('mes');
      setComparadores({});
    }
  }, [open]);

  if (!open) return null;

  const yy = String(anoAtual).slice(-2);
  const rotuloMes = `${MESES[mesAtual - 1]}/${yy}`;
  const rotuloPer = `Jan–${MESES[mesAtual - 1]}/${yy}`;


  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={onClose}>
      <div
        className="w-full max-w-7xl mx-4 rounded-lg border border-border/40 bg-background shadow-xl flex flex-col h-[92vh] max-h-[92vh]"
        onClick={e => e.stopPropagation()}
      >
        {/* CABECALHO congelado. `shrink-0` explicito: sem ele o cabecalho
            cederia altura para o miolo em viewport curto (A13). */}
        <div className="shrink-0 px-4 pt-3 pb-2 border-b border-border/40 space-y-2">
          <div className="flex items-start gap-2">
            <div className="flex flex-wrap gap-1.5">
              {ASSUNTOS.map(a => (
                <button key={a.id} onClick={() => setAssunto(a.id)} className={btn(assunto === a.id, 'g')}>
                  {a.rotulo}
                </button>
              ))}
            </div>
            {/* O clique fora CONTINUA fechando — o botao acrescenta, nao
                substitui. Num modal deste tamanho a borda fica longe do
                cursor, e "clique fora" vira instrucao em vez de gesto. */}
            <button
              onClick={onClose}
              aria-label="Fechar"
              className="ml-auto shrink-0 h-7 w-7 rounded-md border border-border/50 text-muted-foreground
                         hover:bg-muted/50 flex items-center justify-center"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex gap-1">
              {(['global', 'fazenda'] as Escopo[]).map(e => (
                <button key={e} onClick={() => setEscopo(e)} className={btn(escopo === e, 'p')}>
                  {e === 'global' ? 'Global' : 'Por fazenda'}
                </button>
              ))}
            </div>
            <div className="flex gap-1">
              {(['mes', 'periodo', 'historico'] as Leitura[]).map(l => (
                <button key={l} onClick={() => setLeitura(l)} className={btn(leitura === l, 'p')}>
                  {l === 'mes' ? 'No mês' : l === 'periodo' ? 'No período' : 'Histórico'}
                </button>
              ))}
            </div>
            {/* O contexto ocupa a largura livre a direita e SEGUE o nivel: em
                "No período" mostra o intervalo, em "Histórico" a faixa de
                anos. O escopo tambem muda, porque "Global" e "Por fazenda"
                respondem perguntas diferentes sobre o mesmo mes. */}
            <span className="ml-auto text-[11px] text-muted-foreground text-right">
              {clienteNome} · {escopo === 'global' ? 'Global' : 'Por fazenda'} ·{' '}
              {leitura === 'historico' ? `${anoAtual - 5}–${anoAtual}`
                : leitura === 'periodo' ? rotuloPer : rotuloMes}
            </span>
          </div>
        </div>

        {/* MIOLO — o unico que rola. Piso INLINE, nao so `min-h-0`: irmao que
            nao cede empurra este a zero e o conteudo transborda (A13). */}
        <div className="flex-1 min-h-0 overflow-y-auto px-4 py-3" style={{ minHeight: 200 }}>
          {assunto !== 'zootecnico' && assunto !== 'movimentacoes' ? (
            <div className="h-full flex items-center justify-center">
              <p className="text-xs text-muted-foreground/70 italic">
                em construção — este assunto entra num PR próprio
              </p>
            </div>
          ) : assunto === 'movimentacoes' ? (
            /* QUATRO colunas — ver `ORDEM_CARDS_MOV`. Mesma casca de card, mesma
               altura, mesmos chips: muda a largura da grade e o conjunto de
               cards, nao a forma do card. */
            <div className="grid grid-cols-4 gap-3">
              {[...(indicadoresMovimentacoes ?? [])]
                .sort((a, b) => {
                  const ia = ORDEM_CARDS_MOV.indexOf(a.chave);
                  const ib = ORDEM_CARDS_MOV.indexOf(b.chave);
                  return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib);
                })
                .map(ind => (
                  <CardIndicador
                    key={ind.chave}
                    ind={ind}
                    escopo={escopo}
                    leitura={leitura}
                    mesAtual={mesAtual}
                    anoAtual={anoAtual}
                    rotuloMes={rotuloMes}
                    rotuloPer={rotuloPer}
                    sel={marcados(ind.chave)}
                    alterna={alterna}
                  />
                ))}
            </div>
          ) : loadingHistorico && leitura === 'historico' ? (
            <p className="text-[10px] text-muted-foreground/70 py-2">Carregando...</p>
          ) : (
            /* Grade IGUAL nas duas abas: muda o conteudo do grafico, nao a
               forma da tela. */
            /* Tres por linha. Em `max-w-6xl` cada card teria ~370px e treze
               rotulos de mes nao caberiam — o mesmo calculo que barrou rotulo
               sobre barra no PR-16. Em 7xl volta a ~450px. */
            <div className="grid grid-cols-3 gap-3">
              {[...indicadores]
                .sort((a, b) => {
                  const ia = ORDEM_CARDS.indexOf(a.chave);
                  const ib = ORDEM_CARDS.indexOf(b.chave);
                  return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib);
                })
                .map(ind => (
                  <CardIndicador
                    key={ind.chave}
                    ind={ind}
                    escopo={escopo}
                    leitura={leitura}
                    mesAtual={mesAtual}
                    anoAtual={anoAtual}
                    rotuloMes={rotuloMes}
                    rotuloPer={rotuloPer}
                    sel={marcados(ind.chave)}
                    alterna={alterna}
                  />
                ))}
            </div>
          )}
        </div>

        {/* RODAPE congelado. Os codigos tornam a ausencia legivel: fazenda
            sem linha no cache nao entra na aba Por fazenda, e quem some da
            lista some declaradamente (Art. 19, item 9). */}
        <div className="shrink-0 px-4 pb-2 pt-1.5 border-t border-border/40 flex items-center justify-between text-[10px] text-muted-foreground">
          {/* Cliente, escopo e recorte subiram para o cabecalho no E4 —
              repetir aqui seria a mesma frase duas vezes na mesma tela. O
              rodape fica com o que o cabecalho NAO diz: quais fazendas estao
              na base. Fazenda sem linha no cache nao entra, e por isso a
              lista e a forma de a ausencia ser legivel (C2, Art. 19.9). */}
          <span>
            {codigosFazendas.length > 0
              ? `Fazendas: ${codigosFazendas.join(' · ')}`
              : ''}
          </span>
          <span>Clique fora para fechar</span>
        </div>
      </div>
    </div>
  );
}
