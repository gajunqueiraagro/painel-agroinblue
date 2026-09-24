/**
 * A VARIAÇÃO DO VALOR DO REBANHO — VARIACAO-REBANHO-MODAL-01-fix2 (mock v14).
 *
 * ⚠ NENHUMA COLUNA DE FICÇÃO, e é o princípio que reprovou o desenho anterior. O fix1 mostrava as
 * MESMAS oito colunas nas três abas e "travava" uma delas em cinza — ou seja, exibia um número que
 * não era o daquela ponta e pedia ao operador que o desconsiderasse. Agora cada aba mostra só o que
 * é real nela: a Produção tem UMA coluna de preço (a do início, a única que ela usa) e o Mercado não
 * tem coluna de início em cabeça nem em arroba, porque o rebanho não muda lá. A palavra "travado"
 * saiu do vocabulário da tela.
 *
 * ⚠ E A SOMA FECHA POR CONSTRUÇÃO: Δ(Produção) + Δ(Mercado) = Δ(Resumo), por categoria, por grupo e
 * no total. Os três saem dos MESMOS três valores do payload — `v0` (início a preço do início),
 * `v1_p0` (fim a preço do início) e `v1_p1` (fim a preço do fim). Sem o valor do MEIO as duas
 * variações seriam indistinguíveis.
 *
 * ⚠ A ARROBA É A DA CASA: `kgToArrobas` (`src/types/cattle.ts`), peso vivo ÷ 30. O ÷15 do
 * repositório é de CARCAÇA (abate) e não se aplica a estoque vivo. O DRE não serve de fonte — as
 * arrobas dele (`at_produzida`, `at_desfrutada`) são de FLUXO; aqui é ESTOQUE.
 *
 * ⚠ R$/@ DE GRUPO E DE TOTAL É PONDERADO (soma do valor ÷ soma das arrobas), nunca a média das
 * categorias: a média simples de preços se mexe quando a MISTURA do rebanho se mexe, e diria que o
 * mercado mudou onde só a composição mudou.
 *
 * ⚠ NÃO HÁ ABA "LANÇAMENTOS", e isso é dado, não omissão: patrimônio não tem lançamento. Ele sai do
 * fechamento do rebanho — a foto do mês.
 */
import { Fragment, useMemo, useState } from 'react';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { X, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { formatNum } from '@/lib/calculos/formatters';
import { kgToArrobas, CATEGORIAS } from '@/types/cattle';
import type { PatrimonioPec, CategoriaPatrimonio } from '@/hooks/useDrePecuaria';
import { PecPonteTabela, PecPonteGrafico } from '@/components/agri/PecPonteAbas';
import type { InsumosDidaticos } from '@/pages/PecDrePanel';

const MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
const rotuloMes = (am: string) => {
  const [a, m] = (am || '').split('-');
  const i = Number(m) - 1;
  return i >= 0 && i < 12 ? `${MESES[i]}/${a.slice(2)}` : (am || '—');
};

/** ⚠ O NOME DE EXIBIÇÃO DA CASA, NUNCA O CÓDIGO: `CATEGORIAS` é a mesma lista dos lançamentos. */
const NOME_CAT = new Map(CATEGORIAS.map(c => [c.value as string, c.label]));
const nomeDe = (cod: string) => NOME_CAT.get(cod) ?? cod;

/** Jovens = mamotes e desmama; adultos = o resto. */
const JOVENS = new Set(['mamotes_m', 'mamotes_f', 'desmama_m', 'desmama_f']);

const NAVY = '#0C447C';
const CAB_TABELA = '#2C3E5C';
const AZUL_CLARO = '#E9EFF6';
const AZUL_FAIXA = '#D3E0ED';
const ZEBRA = '#F6F5F1';
const CINZA_TOTAL = '#D3D1C7';
const DIVISOR = '1px solid #888780';

const VERDE = 'text-emerald-700';
const VERMELHO = 'text-destructive';
const corSinal = (v: number | null) => (v == null || v === 0 ? '' : v > 0 ? VERDE : VERMELHO);

/** ⚠ AUSÊNCIA É TRAÇO, ZERO É NÚMERO — a sentinela do projeto. */
const traco = '—';
const n = (v: number | null | undefined, casas = 2) => (v == null ? '—' : formatNum(v, casas));
const comSinal = (v: number | null, casas = 2) =>
  (v == null ? '—' : `${v > 0 ? '+' : ''}${formatNum(v, casas)}`);
const pctDe = (v: number | null, base: number | null) =>
  (v == null || base == null || base === 0
    ? '—'
    : `${v / base > 0 ? '+' : ''}${formatNum((v / Math.abs(base)) * 100, 1)} %`);

/**
 * AS CINCO ABAS — MODAL-UNICO-01.
 *
 * ⚠ ERAM DOIS MODAIS PARA A MESMA LINHA DO DRE, e qual deles abria dependia do MODO da grade:
 * Resumido dava a ponte de arrobas, Detalhado dava a visão por categoria, e um botão ligava um ao
 * outro. O operador tinha de saber em que modo estava para saber o que ia ver. Agora é um modal
 * só, igual nos dois modos, e o que muda é a aba.
 */
type Aba = 'resumo' | 'producao' | 'mercado' | 'movimentos' | 'grafico';
const ABAS: readonly (readonly [Aba, string])[] = [
  ['resumo', 'Resumo'], ['producao', 'Produção'], ['mercado', 'Mercado'],
  ['movimentos', 'Movimentos'], ['grafico', 'Gráfico'],
];

/** Uma categoria já nas unidades da tela — tudo derivado do payload por soma, subtração e divisão. */
interface Cat {
  cod: string; nome: string; jovem: boolean;
  q0: number; q1: number;
  at0: number; at1: number;
  pk0: number | null; pk1: number | null;
  v0: number; v1p0: number; v1p1: number;
  dProd: number; dMerc: number; dTotal: number;
}

/**
 * @ de uma ponta: cabeças × peso médio, em arrobas da casa.
 *
 * ⚠ ZERO CABEÇAS É ZERO ARROBA, NÃO AUSÊNCIA. Uma categoria que não existia no início vem com
 * `q = 0` e `peso = null`: "não há peso médio de nenhum animal" é verdade, mas o estoque dela é
 * ZERO, e isso se sabe. Tratar como ausência fazia o total propagar `null` e o número grande da aba
 * abrir em "— @" por causa de uma categoria vazia. Medido no NJ jul/22-jun/23, categoria `bois`.
 */
const arrobas = (q: number, pm: number | null) => (q === 0 ? 0 : pm == null ? 0 : kgToArrobas(q * pm));
const porAt = (valor: number, at: number) => (at === 0 ? null : valor / at);

function montar(cats: readonly CategoriaPatrimonio[]): Cat[] {
  return cats.map(c => {
    const at0 = arrobas(c.q0, c.pm0);
    const at1 = arrobas(c.q1, c.pm1);
    return {
      cod: c.categoria, nome: nomeDe(c.categoria), jovem: JOVENS.has(c.categoria),
      q0: c.q0, q1: c.q1, at0, at1,
      /* ⚠ O PREÇO DO INÍCIO TEM DUAS FONTES, nesta ordem: o valor do início dividido pelas @ do
         início; e, quando a categoria NASCEU no período (não havia @ no início), o valor do fim a
         preço do início dividido pelas @ do fim — que é o mesmo preço, aplicado ao rebanho do fim.
         Sem a segunda, a coluna de preço da aba Produção ficaria vazia justamente nas categorias
         que mais produziram. */
      pk0: porAt(c.v0, at0) ?? porAt(c.v1_p0, at1),
      pk1: porAt(c.v1_p1, at1),
      v0: c.v0, v1p0: c.v1_p0, v1p1: c.v1_p1,
      dProd: c.vpb, dMerc: c.efeito, dTotal: c.vpb + c.efeito,
    };
  /* ⚠ CATEGORIA ZERADA NAS DUAS PONTAS SOME: uma linha de zeros não responde pergunta nenhuma e
     empurra para fora da tela as que respondem. */
  }).filter(c => c.q0 !== 0 || c.q1 !== 0);
}

/** A soma de um conjunto — e o R$/@ dela é PONDERADO. */
function somar(cs: readonly Cat[], nome: string): Cat {
  const s = (f: (c: Cat) => number) => cs.reduce((a, c) => a + f(c), 0);
  const at0 = s(c => c.at0); const at1 = s(c => c.at1);
  const v0 = s(c => c.v0); const v1p0 = s(c => c.v1p0); const v1p1 = s(c => c.v1p1);
  return {
    cod: nome, nome, jovem: false,
    q0: s(c => c.q0), q1: s(c => c.q1), at0, at1,
    pk0: porAt(v0, at0) ?? porAt(v1p0, at1), pk1: porAt(v1p1, at1),
    v0, v1p0, v1p1,
    dProd: s(c => c.dProd), dMerc: s(c => c.dMerc), dTotal: s(c => c.dTotal),
  };
}

/**
 * A TABELA DE CATEGORIAS — mock v17c (forma) e v19 (colunas por aba).
 *
 * ⚠ O PRINCÍPIO DO fix2 VOLTOU: NENHUMA COLUNA DE FICÇÃO. O fix6 pôs os mesmos quatro pares nas
 * três abas, e com isso a Produção passou a mostrar o preço do FIM — que ela não usa — e o Mercado
 * a mostrar o rebanho do INÍCIO, que nele não muda. A forma nova (total, grupos fechados, três
 * tons, sublinhas, cabeçalho em duas linhas) fica; o RECORTE volta a ser o da aba.
 *
 * ⚠ O CABEÇALHO TEM DUAS LINHAS PORQUE "Cab dez/20" NÃO CABE EM 52px. Repetir o mês em cada par é
 * o que permite as colunas estreitas: o nome da grandeza sobe para a linha de cima e vale para as
 * de baixo. Uma coluna sozinha (o R$/@ da Produção) ocupa as duas linhas, com o mês embaixo.
 *
 * ⚠ E A DIFERENÇA MORA SOB A COLUNA QUE VARIA, não numa coluna própria: na Produção ela cai sob
 * Cab/@ do fim e sob o valor ao preço do início; no Mercado, sob o R$/@ do fim e o valor ao preço
 * do fim. Onde nada varia — o rebanho do fim no Mercado — a sublinha fica vazia, e é informação.
 *
 * ⚠ AS LARGURAS DO RESUMO SÃO AS MEDIDAS, NÃO AS DO MOCK: o rótulo de 88px cortava "Total do
 * rebanho" (80,7 numa caixa de 76) e as colunas de Valor sobravam 37 e 31. Os 14px foram de onde
 * sobrava para onde faltava e a soma de 640 ficou.
 */
/** ⚠ SÓ AS TRÊS DE CATEGORIA TÊM COLUNA: as duas da ponte desenham a tabela delas. */
type AbaCat = 'resumo' | 'producao' | 'mercado';

interface ParCol {
  /** O título da linha de cima; com `span` 2 ele cobre o par. */
  rot: string;
  span: 1 | 2;
  casas: 0 | 2;
  /** Os rótulos de mês da linha de baixo — um por coluna do par. */
  meses: readonly ('p0' | 'p1')[];
  /** Um valor por coluna. */
  vals: readonly ((c: Cat) => number | null)[];
  /** `true` na coluna que ganha as sublinhas de Dif./Dif. %; a base é a coluna anterior do par. */
  varia?: boolean;
}

const pares = (aba: AbaCat, pkProd: number | null): { larguras: readonly number[]; cols: ParCol[] } => {
  if (aba === 'producao') {
    /* ⚠ UM PREÇO SÓ, O DO INÍCIO, e é o que define a aba: aqui o valor muda APENAS pelas arrobas.
       O título do par de valor carrega o preço para o operador não ter de procurá-lo. */
    return {
      larguras: [102, 52, 52, 66, 66, 58, 82, 82],
      cols: [
        { rot: 'Cabeças', span: 2, casas: 0, meses: ['p0', 'p1'],
          vals: [c => c.q0, c => c.q1], varia: true },
        { rot: 'Arrobas', span: 2, casas: 0, meses: ['p0', 'p1'],
          vals: [c => c.at0, c => c.at1], varia: true },
        { rot: 'R$/@', span: 1, casas: 2, meses: ['p0'], vals: [c => c.pk0] },
        { rot: pkProd == null ? 'Valor' : `Valor a ${formatNum(pkProd, 2)}`, span: 2, casas: 0,
          meses: ['p0', 'p1'], vals: [c => c.v0, c => c.v1p0], varia: true },
      ],
    };
  }
  if (aba === 'mercado') {
    /* ⚠ UM REBANHO SÓ, O DO FIM: no Mercado as arrobas não mudam — o que muda é o preço. Uma
       coluna de início em cabeças ou arrobas repetiria a do fim e afirmaria uma variação que não
       existe nesta conta. */
    return {
      larguras: [102, 66, 58, 58, 98, 98],
      cols: [
        { rot: 'Arrobas', span: 1, casas: 0, meses: ['p1'], vals: [c => c.at1] },
        { rot: 'R$/@', span: 2, casas: 2, meses: ['p0', 'p1'],
          /* ⚠ O R$/@ DO INÍCIO AQUI É O PONDERADO PELO REBANHO DO FIM (o 246,73 do fix5), não o
             245,55 do Resumo: os dois são o preço de P0, sobre misturas de categoria diferentes. É
             ele que multiplicado pelas @ do fim dá o valor da coluna ao lado. */
          vals: [c => (c.at1 === 0 ? null : c.v1p0 / c.at1), c => c.pk1], varia: true },
        { rot: 'Valor do rebanho do fim', span: 2, casas: 0, meses: ['p0', 'p1'],
          vals: [c => c.v1p0, c => c.v1p1], varia: true },
      ],
    };
  }
  return {
    larguras: [102, 52, 52, 66, 66, 58, 58, 93, 93],
    cols: [
      { rot: 'Cabeças', span: 2, casas: 0, meses: ['p0', 'p1'],
        vals: [c => c.q0, c => c.q1], varia: true },
      { rot: 'Arrobas', span: 2, casas: 0, meses: ['p0', 'p1'],
        vals: [c => c.at0, c => c.at1], varia: true },
      { rot: 'R$/@', span: 2, casas: 2, meses: ['p0', 'p1'],
        vals: [c => c.pk0, c => c.pk1], varia: true },
      { rot: 'Valor', span: 2, casas: 0, meses: ['p0', 'p1'],
        vals: [c => c.v0, c => c.v1p1], varia: true },
    ],
  };
};

const BORDA_PAR = '1px solid #BEBCB4';
const FUNDO_TOTAL = '#D6D4CC';
const FUNDO_GRUPO = '#E8E6DF';
const ZEBRA_CAT = '#F5F4F0';

/**
 * A TABELA DO TOPO — mock v16b.
 *
 * ⚠ É UMA TABELA SÓ, NÃO DUAS LADO A LADO, e a diferença é o ponto do desenho: as linhas das duas
 * metades são FISICAMENTE as mesmas, então "Arrobas" à esquerda e "+ Produção" à direita ficam
 * exatamente na mesma altura. Com dois `<table>` irmãos isso só valeria por coincidência de
 * régua — e deixaria de valer no primeiro número que mudasse de altura.
 *
 * ⚠ A METADE DIREITA É UMA CAMINHADA, não um resumo: valia · + produção · + mercado · vale. A
 * coluna "Rebanho" fecha DE CIMA PARA BAIXO e a última linha dela é o mesmo número do "Valor" do
 * fim, à esquerda. É assim que o leigo confere que a conta fecha, sem precisar somar nada.
 *
 * ⚠ E A COLUNA "ARROBAS × R$/@" FECHA NA CALCULADORA — fix5. O preço de cada linha é o DELA:
 * `valor_da_linha / arrobas_da_linha`, e não um preço emprestado de outra. O da Produção é o preço
 * de P0 PONDERADO PELO REBANHO DO FIM (246,73 no SR jan-ago/21) e não o R$/@ de dez/20 da metade
 * esquerda (245,55), que é ponderado pelo rebanho do INÍCIO: são dois preços médios do mesmo mês
 * sobre misturas de categoria diferentes. Emprestar o da esquerda fazia o produto dar 9.634.161
 * contra os 9.680.106 da linha — 45 mil de diferença numa coluna que o operador multiplica.
 */
/**
 * ⚠ AS LARGURAS SÃO AS MEDIDAS, NÃO AS DO MOCK, e a diferença foi medida célula a célula com um
 * `Range` sobre o conteúdo contra o `clientWidth` menos o padding — o método que o CLAUDE.md fixou
 * depois das três calibragens erradas da grade do DRE. As do mock (56/66/74/70/56/8/78/100/64/68)
 * foram desenhadas com números menores; no SR jan-ago/21 quatro colunas estouram:
 *   rótulo esq. "Valor (R$)"      48,2 numa caixa de 44
 *   rótulo dir. "Valia em dez/20" 76,4 numa caixa de 66
 *   Rebanho     "12.031.963"      57,3 numa caixa de 52
 *   Variação    "+1.036.279"      57,3 numa caixa de 56
 * A régua é a mesma da grade: pior texto + 8 de folga + 12 de padding. Soma 726px, contra 1112
 * disponíveis no modal — sobra de 386.
 */
const COLS_TOPO = [70, 72, 78, 78, 62, 8, 98, 104, 78, 78] as const;
const H_CAP = 16, H_CAB = 16, H_LIN = 16;

export function PecPatrimonioModal({
  aberto, fazendaNome, clienteNome, qual, patrimonio, carregando, periodo, insumos,
  onFechar, onCorrigirPrecos,
}: {
  aberto: boolean;
  fazendaNome: string;
  clienteNome: string;
  /**
   * QUAL LINHA DO DRE ABRIU — e agora ela escolhe a ABA INICIAL, não o modal.
   *
   * ⚠ `ponte` É A LINHA COMPOSTA DO RESUMIDO ("Variação do estoque" = variação − reposição), e é a
   * aba Movimentos que a concilia, ao centavo, no rodapé. Abrir no Resumo mostraria a variação
   * pura debaixo de um número que soma a reposição — o desencontro que fez os dois modais
   * existirem. As outras duas abrem no Resumo, como antes.
   */
  qual: 'vpb' | 'efeito' | 'ponte';
  patrimonio: PatrimonioPec | null;
  carregando: boolean;
  /** O período DA COLUNA clicada — ver `onAbrirDidatico` em `PecDrePanel`. */
  periodo: { de: string; ate: string };
  /**
   * OS NÚMEROS DO DRE DA COLUNA CLICADA — só a aba Movimentos os usa.
   *
   * ⚠ ELES VIAJAM COM O CLIQUE em vez de serem lidos de novo: a conciliação e os R$/@ reais têm de
   * bater com o que AQUELA coluna mostra, e uma segunda leitura traria os da tela.
   */
  insumos: InsumosDidaticos;
  onFechar: () => void;
  /**
   * "CORRIGIR PREÇOS DE {ano}" — fecha o modal e vai para a tela Valor do Rebanho naquele ano.
   *
   * ⚠ O ANO É O DE P1, inclusive em período de safra: a tela de destino filtra por ANO CIVIL e o
   * preço que o operador vem corrigir é o do FIM — o que move o efeito de mercado. Passar o de P0
   * o levaria a editar o ano que ele acabou de ver como ponto de partida.
   * ⚠ A FAZENDA NÃO MUDA: ela vem do contexto global (o seletor da sidebar), e trocá-la aqui
   * deixaria a aplicação inteira noutra fazenda depois que ele voltasse.
   * ⚠ OPCIONAL: sem o callback o link não aparece. Quem monta o modal fora do DRE não fica com um
   * atalho que não leva a lugar nenhum.
   */
  onCorrigirPrecos?: (ano: number) => void;
}) {
  const [aba, setAba] = useState<Aba>(qual === 'ponte' ? 'movimentos' : 'resumo');
  /**
   * OS GRUPOS ABREM FECHADOS, e o estado é do MODAL, não da URL.
   *
   * ⚠ FECHADO PORQUE A PERGUNTA É O TOTAL: o operador vem da grade querendo saber quanto o rebanho
   * variou, não quanto cada uma das nove categorias variou. Abrir tudo faria a resposta nascer
   * empurrada para fora da tela pela decomposição.
   * ⚠ E FORA DA URL de propósito: a URL é do que se LINKA (o período, a vista), e "eu tinha aberto
   * Adultos" não é um estado que alguém manda para outra pessoa. Trocar de aba não perde.
   */
  const [abertos, setAbertos] = useState<Record<string, boolean>>({});

  const p0 = patrimonio?.p0 ?? '';
  const p1 = patrimonio?.p1 ?? '';
  /* ⚠ O ANO SAI DE P1 E SÓ EXISTE SE P1 EXISTIR: sem o payload não há ano a corrigir, e o link
     some em vez de apontar para o ano corrente, que não é o do modal. */
  const anoP1 = /^\d{4}-\d{2}$/.test(p1) ? Number(p1.slice(0, 4)) : null;
  const cats = useMemo(() => montar(patrimonio?.categorias ?? []), [patrimonio]);
  const jovens = useMemo(() => cats.filter(c => c.jovem), [cats]);
  const adultos = useMemo(() => cats.filter(c => !c.jovem), [cats]);
  const tJov = useMemo(() => somar(jovens, 'Total jovens'), [jovens]);
  const tAdu = useMemo(() => somar(adultos, 'Total adultos'), [adultos]);
  const T = useMemo(() => somar(cats, 'Total do rebanho'), [cats]);

  const dAt = T.at1 - T.at0;
  /* ⚠ AS VARIAÇÕES POR GRUPO SAÍRAM COM OS TOPOS DE Produção E Mercado (mock v16b): elas só
     alimentavam aqueles dois cards. Os grupos continuam na TABELA, com os totais próprios. */
  const dPk = T.pk1 == null || T.pk0 == null ? null : T.pk1 - T.pk0;

  /* ─── A TABELA DO TOPO — a mesma nas três abas ─── */
  const cor = (v: number | null) => corSinal(v) || undefined;

  /** Uma célula da faixa: 10px, número à direita, cor opcional. */
  const cTopo = (txt: string, corTxt?: string, esq?: boolean, forte?: boolean) => (
    <td className={cn('truncate px-1.5 py-0 text-[10px] leading-none tabular-nums',
      esq ? 'text-left' : 'text-right', forte && 'font-medium', corTxt)}>{txt}</td>
  );
  const vazio = <td className="px-0" />;

  const passos = useMemo(() => caminhadaDoValor(T), [T]);
  const direita = passos.map((p, i) => ({
    rot: i === 0 ? `Valia em ${rotuloMes(p0)}` : i === 3 ? `Vale em ${rotuloMes(p1)}` : p.rot,
    leitura: p.arrobas == null ? traco
      : i === 3 ? pctDe(T.dTotal, T.v0)
        : `${n(p.arrobas, 0)} × ${n(p.preco)}`,
    rebanho: n(p.valor, 0),
    varTxt: p.variacao == null ? '' : comSinal(p.variacao, 0),
    varV: p.variacao,
  }));

  const esquerda: { rot: string; a: string; b: string; d: string; p: string; v: number | null }[] = [
    { rot: 'Cabeças', a: n(T.q0, 0), b: n(T.q1, 0), d: comSinal(T.q1 - T.q0, 0),
      p: pctDe(T.q1 - T.q0, T.q0), v: T.q1 - T.q0 },
    { rot: 'Arrobas', a: n(T.at0, 0), b: n(T.at1, 0), d: comSinal(dAt, 0),
      p: pctDe(dAt, T.at0), v: dAt },
    { rot: 'R$/@', a: n(T.pk0), b: n(T.pk1), d: comSinal(dPk), p: pctDe(dPk, T.pk0), v: dPk },
    { rot: 'Valor (R$)', a: n(T.v0, 0), b: n(T.v1p1, 0), d: comSinal(T.dTotal, 0),
      p: pctDe(T.dTotal, T.v0), v: T.dTotal },
  ];

  const topo = (
    <table className="border-collapse" style={{ tableLayout: 'fixed', width: COLS_TOPO.reduce((a, w) => a + w, 0) }}>
      <colgroup>{COLS_TOPO.map((w, i) => <col key={i} style={{ width: w }} />)}</colgroup>
      <tbody>
        <tr style={{ height: H_CAP }}>
          <td colSpan={5} className="truncate px-1.5 py-0 text-[10px] font-medium leading-none"
            style={{ backgroundColor: AZUL_CLARO, color: NAVY }}>Rebanho</td>
          {vazio}
          <td colSpan={4} className="truncate px-1.5 py-0 text-[10px] font-medium leading-none"
            style={{ backgroundColor: AZUL_CLARO, color: NAVY }}>De onde veio a variação</td>
        </tr>
        <tr style={{ height: H_CAB }}>
          {['', rotuloMes(p0), rotuloMes(p1), 'Dif.', 'Dif. %'].map((r, i) => (
            <th key={i} className={cn('truncate px-1.5 py-0 text-[9px] font-semibold leading-none text-white',
              i === 0 ? 'text-left' : 'text-right')} style={{ backgroundColor: CAB_TABELA }}>{r}</th>
          ))}
          {vazio}
          {['', 'Arrobas × R$/@', 'Rebanho', 'Variação'].map((r, i) => (
            <th key={i} className={cn('truncate px-1.5 py-0 text-[9px] font-semibold leading-none text-white',
              i === 0 ? 'text-left' : 'text-right')} style={{ backgroundColor: CAB_TABELA }}>{r}</th>
          ))}
        </tr>
        {esquerda.map((e, i) => {
          const d = direita[i];
          /* ⚠ A ÚLTIMA LINHA É TOTAL NAS DUAS METADES — é ela que mostra os dois números iguais. */
          const total = i === esquerda.length - 1;
          const fundo = total ? AZUL_CLARO : undefined;
          return (
            <tr key={e.rot} style={{ height: H_LIN, backgroundColor: fundo }}>
              {cTopo(e.rot, undefined, true, total)}
              {cTopo(e.a, undefined, false, total)}
              {cTopo(e.b, undefined, false, total)}
              {cTopo(e.d, cor(e.v), false, total)}
              {cTopo(e.p, cor(e.v), false, total)}
              <td className="px-0" style={{ backgroundColor: undefined }} />
              {cTopo(d.rot, undefined, true, total)}
              {cTopo(d.leitura, total ? cor(T.dTotal) : undefined, false, total)}
              {cTopo(d.rebanho, undefined, false, total)}
              {cTopo(d.varTxt, cor(d.varV), false, total)}
            </tr>
          );
        })}
      </tbody>
    </table>
  );

  const nota = aba === 'resumo'
    ? 'As duas pontas são reais. Produção + Mercado = a variação, ao centavo.'
    : aba === 'producao'
      ? 'Um preço só por categoria, o do início. O valor muda apenas pelas arrobas.'
      : 'O rebanho do fim, valorado ao preço do início e ao do fim. A diferença é só o preço.';


  /* ─── A TABELA DE CATEGORIAS — mock v17c (forma) e v19 (colunas) ─── */
  /* ⚠ O PREÇO DO TÍTULO É O DO TOTAL, não o de uma categoria: é o mesmo `v_fim_p0 / @fim` que a
     caminhada do topo mostra na linha "+ Produção". */
  /* ⚠ AS DUAS ABAS DA PONTE CAEM NO RECORTE DO RESUMO só para o `colsAba` existir; o bloco delas
     nem chega a montar esta tabela. */
  const abaDeCategoria: AbaCat = aba === 'movimentos' || aba === 'grafico' ? 'resumo' : aba;
  const pkProducao = T.at1 === 0 ? null : T.v1p0 / T.at1;
  const { larguras: COLS_CAT, cols: colsAba } = pares(abaDeCategoria, pkProducao);
  /** Cada coluna achatada, com a marca de início de par (a borda) e de variação. */
  const colunas = colsAba.flatMap((p, iPar) => p.vals.map((v, i) => ({
    key: `${iPar}:${i}`, val: v, casas: p.casas, mes: p.meses[i],
    bl: i === 0, varia: !!p.varia && i === p.vals.length - 1,
    base: p.vals[i - 1] ?? null,
  })));

  const cCat = (txt: string, bl: boolean, fs: number, forte: boolean, cor?: string) => (
    <td className={cn('truncate px-1.5 py-0 text-right tabular-nums', forte && 'font-medium', cor)}
      style={{ fontSize: fs, lineHeight: 1, borderLeft: bl ? BORDA_PAR : undefined }}>{txt}</td>
  );

  /**
   * AS DUAS SUBLINHAS DE UM TOTAL — a diferença e o percentual, sob a coluna que VARIA.
   *
   * ⚠ ONDE NADA VARIA A CÉLULA FICA VAZIA, e isso é informação: no Mercado o rebanho do fim é um
   * só, e uma diferença ali afirmaria uma variação que aquela conta não tem.
   */
  const sublinhas = (t: Cat, fundo: string) => ([
    <tr key={`${t.cod}:d`} style={{ height: 12, backgroundColor: fundo }}>
      <td className="truncate py-0 pl-2 pr-1.5 text-left text-muted-foreground"
        style={{ fontSize: 9, lineHeight: 1 }}>Dif.</td>
      {colunas.map(c => {
        const d = !c.varia || !c.base ? null : (() => {
          const x = c.base(t); const y = c.val(t);
          return x == null || y == null ? null : y - x;
        })();
        return cCat(c.varia ? comSinal(d, c.casas) : '', c.bl, 9, false, corSinal(d));
      })}
    </tr>,
    <tr key={`${t.cod}:p`} style={{ height: 12, backgroundColor: fundo }}>
      <td className="truncate py-0 pl-2 pr-1.5 text-left text-muted-foreground"
        style={{ fontSize: 9, lineHeight: 1 }}>Dif. %</td>
      {colunas.map(c => {
        const par = !c.varia || !c.base ? null : { x: c.base(t), y: c.val(t) };
        const d = par == null || par.x == null || par.y == null ? null : par.y - par.x;
        return cCat(c.varia ? pctDe(d, par?.x ?? null) : '', c.bl, 9, false, corSinal(d));
      })}
    </tr>,
  ]);

  /** A linha de um total (o rebanho inteiro ou um grupo), com as duas sublinhas. */
  const linhaTotal = (t: Cat, fundo: string, grupo?: { aberto: boolean; alternar: () => void }) => ([
    <tr key={`${t.cod}:t`} style={{ height: 16, backgroundColor: fundo }}
      className={grupo ? 'cursor-pointer' : undefined} onClick={grupo?.alternar}>
      <td className="truncate px-1.5 py-0 text-left font-medium" style={{ fontSize: 10, lineHeight: 1 }}>
        {grupo && (
          <span className="mr-0.5 inline-block align-[-1px]" style={{ fontSize: 8 }} aria-hidden>
            {grupo.aberto ? '▾' : '▸'}
          </span>
        )}
        {t.nome}
      </td>
      {colunas.map(c => cCat(n(c.val(t), c.casas), c.bl, 10, true))}
    </tr>,
    ...sublinhas(t, fundo),
  ]);

  /** ⚠ GRUPO SEM CATEGORIA SOME INTEIRO. Um bloco de zeros não responde pergunta nenhuma. */
  const grupoDe = (titulo: string, lista: readonly Cat[], total: Cat) => {
    if (lista.length === 0) return null;
    const ab = abertos[titulo] ?? false;
    return (
      <Fragment key={titulo}>
        {linhaTotal({ ...total, nome: titulo }, FUNDO_GRUPO, {
          aberto: ab, alternar: () => setAbertos(x => ({ ...x, [titulo]: !ab })),
        })}
        {ab && lista.map((c, i) => (
          <tr key={c.cod} style={{ height: 13, backgroundColor: i % 2 === 0 ? ZEBRA_CAT : undefined }}>
            <td className="truncate py-0 pr-1.5 text-left" title={c.nome}
              style={{ fontSize: 9, lineHeight: 1, paddingLeft: 16 }}>{c.nome}</td>
            {colunas.map(col => cCat(n(col.val(c), col.casas), col.bl, 9, false))}
          </tr>
        ))}
      </Fragment>
    );
  };

  return (
    <Dialog open={aberto} onOpenChange={o => { if (!o) onFechar(); }}>
      {/* ⚠ ALTURA PELO CONTEÚDO, TETO EM 82vh — fix4. A altura FIXA de 520 no corpo fazia o modal
          medir 606px numa viewport de 579 (105%): ele nascia maior que a tela. Agora quem manda é o
          conteúdo, e só a TABELA rola quando não couber. O `minHeight` do corpo é o que mantém o
          tamanho ESTÁVEL ao trocar de aba — a exigência do fix2 continua valendo. */}
      <DialogContent className="flex max-h-[82vh] max-w-6xl flex-col gap-0 overflow-hidden p-0 [&>button.absolute]:hidden">
        {/* ⚠ AS ABAS MORAM NO CABEÇALHO, à direita — e a ordem é [Resumo][Produção][Mercado], que é a
            ordem da conta: o total primeiro, depois as duas parcelas que o explicam. */}
        {/* ⚠ 44px DE CABEÇALHO, medido: 13px de título sobre 11px de subtítulo, com 5px de folga em
            cima e embaixo. Os 57px de antes vinham de um título de 15px e `py-2.5` — 13px num modal
            cujo corpo inteiro é 10 e 11px era o único texto grande da tela. */}
        <div className="flex items-start justify-between gap-3 px-3 py-[5px] text-white" style={{ backgroundColor: NAVY }}>
          <div className="min-w-0">
            <h2 className="truncate text-[13px] font-semibold leading-[17px]">Variação do valor do rebanho</h2>
            <div className="truncate text-[11px] leading-[15px] text-white/80">
              {[clienteNome, fazendaNome, p0 && p1 ? `${rotuloMes(p0)} → ${rotuloMes(p1)}`
                : `${periodo.de} → ${periodo.ate}`].filter(Boolean).join(' · ')}
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-1">
            {/* ⚠ À ESQUERDA DO SEGMENTADO, e é o lugar certo: ele não é uma aba (não mostra outra
                leitura do mesmo número) — é uma saída da tela. Pô-lo entre as abas o faria parecer
                uma sexta, e o operador clicaria esperando voltar. */}
            {onCorrigirPrecos && anoP1 != null && (
              <button type="button" onClick={() => { onFechar(); onCorrigirPrecos(anoP1); }}
                className="mr-1 shrink-0 text-[10px] underline underline-offset-2 hover:opacity-80"
                style={{ color: '#B5D4F4' }}>
                Corrigir preços de {anoP1}
              </button>
            )}
            {ABAS.map(([v, r]) => (
              <button key={v} type="button" onClick={() => setAba(v)}
                className={cn('rounded px-2 py-0.5 text-[11px] font-medium leading-[18px] transition-colors',
                  aba === v ? 'bg-white text-[#0C447C]' : 'text-white/80 hover:bg-white/10')}>
                {r}
              </button>
            ))}
            <button type="button" onClick={onFechar} aria-label="Fechar"
              className="ml-0.5 text-white/80 hover:text-white">
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* ⚠ AS CINCO ABAS FICAM MONTADAS, SOBREPOSTAS NA MESMA CÉLULA DE GRID, e a escondida só
            perde a visibilidade. É o que dá TAMANHO FIXO ao trocar de aba sem número mágico: a
            altura do grid é a da MAIOR delas, medida pelo próprio navegador. A tabela é o único
            scrollport (A21). */}
        <div className="flex min-h-0 flex-1 flex-col gap-1.5 bg-muted/30 p-2" style={{ minHeight: 300 }}>
          {carregando || !patrimonio ? (
            <div className="flex flex-1 items-center justify-center text-[11px] text-muted-foreground">
              <Loader2 className="mr-1 inline h-3.5 w-3.5 animate-spin align-[-2px]" /> Carregando…
            </div>
          ) : (
            <div className="grid min-h-0 flex-1 [&>*]:col-start-1 [&>*]:row-start-1">
            <div className={cn('flex min-h-0 flex-col gap-1.5',
              aba !== 'resumo' && aba !== 'producao' && aba !== 'mercado'
                && 'invisible pointer-events-none')}>
              {/* ⚠ A MESMA TABELA NAS TRÊS ABAS — mock v16b. Antes cada aba tinha o topo dela, e
                  como elas não tinham a mesma altura o modal PULAVA ao trocar. Um topo só resolve
                  os dois problemas de uma vez: a caminhada do valor é a mesma pergunta em qualquer
                  aba, e a altura deixa de depender de qual está aberta. */}
              <div className="shrink-0">{topo}</div>
              <div className="shrink-0 text-[9px] leading-[12px] text-muted-foreground">
                Produção: as arrobas a mais, ainda ao preço de {rotuloMes(p0)}.
                Mercado: o rebanho do fim, do preço de {rotuloMes(p0)} para o de {rotuloMes(p1)}.
                {' '}R$/@ da Produção: preço de {rotuloMes(p0)} ponderado pelo rebanho de {rotuloMes(p1)}.
              </div>

              {/* ⚠ A FRASE DE LEITURA LONGA SAIU COM OS CARDS, e não é perda: ela repetia em prosa
                  os quatro números que a caminhada agora mostra em coluna, um embaixo do outro. Duas
                  frases e uma tabela para a mesma conta era o que fazia o modal crescer. */}
              <div className="min-h-0 flex-1 overflow-auto rounded-md border bg-card">
                <table className="border-collapse"
                  style={{ tableLayout: 'fixed', width: COLS_CAT.reduce((x, w) => x + w, 0) }}>
                  <colgroup>{COLS_CAT.map((w, i) => <col key={i} style={{ width: w }} />)}</colgroup>
                  <thead>
                    {/* ⚠ DUAS LINHAS DE CABEÇALHO porque "Cab dez/20" não cabe em 52px: a grandeza
                        sobe e o mês fica embaixo, valendo para as duas colunas do par. */}
                    <tr style={{ height: 16 }}>
                      <th className="sticky top-0 z-10" style={{ backgroundColor: CAB_TABELA }} />
                      {colsAba.map(p => (
                        <th key={p.rot} colSpan={p.span}
                          className="sticky top-0 z-10 truncate px-1.5 py-0 text-center font-semibold text-white"
                          style={{ backgroundColor: CAB_TABELA, fontSize: 9, lineHeight: 1,
                            borderLeft: BORDA_PAR }}>
                          {p.rot}
                        </th>
                      ))}
                    </tr>
                    <tr style={{ height: 16 }}>
                      <th className="sticky z-10" style={{ top: 16, backgroundColor: CAB_TABELA }} />
                      {colunas.map(c => (
                        <th key={c.key}
                          className="sticky z-10 truncate px-1.5 py-0 text-right font-semibold text-white"
                          style={{ top: 16, backgroundColor: CAB_TABELA, fontSize: 9, lineHeight: 1,
                            borderLeft: c.bl ? BORDA_PAR : undefined }}>
                          {c.mes === 'p0' ? rotuloMes(p0) : rotuloMes(p1)}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {cats.length === 0 ? (
                      <tr style={{ height: 16 }}>
                        <td colSpan={COLS_CAT.length}
                          className="px-1.5 text-center text-[10px] text-muted-foreground">—</td>
                      </tr>
                    ) : (
                      <>
                        {/* ⚠ O TOTAL VEM PRIMEIRO, como na grade do DRE: a resposta antes da
                            decomposição, e os grupos abrem embaixo dela. */}
                        {linhaTotal(T, FUNDO_TOTAL)}
                        {grupoDe('Jovens', jovens, tJov)}
                        {grupoDe('Adultos', adultos, tAdu)}
                      </>
                    )}
                  </tbody>
                </table>
              </div>

              <div className="shrink-0 px-0.5 text-[9px] leading-[12px] text-muted-foreground">{nota}</div>
            </div>

            {/* ⚠ A PONTE NÃO REPETE O TOPO DA CAMINHADA: ela tem as próprias pontas, na própria
                tabela. Dois blocos com os mesmos quatro números na mesma tela é o que o operador
                soma por engano. */}
            <div className={cn('flex min-h-0 flex-col gap-1.5',
              aba !== 'movimentos' && 'invisible pointer-events-none')}>
              <PecPonteTabela m={patrimonio.movimentos} insumos={insumos}
                efeito={patrimonio.total.efeito} p0={p0} p1={p1} />
            </div>
            <div className={cn('flex min-h-0 flex-col gap-1.5',
              aba !== 'grafico' && 'invisible pointer-events-none')}>
              <PecPonteGrafico m={patrimonio.movimentos} p0={p0} p1={p1} />
            </div>
            </div>
          )}
        </div>

        <div className="shrink-0 truncate px-3 text-[9px] leading-[22px] text-white/80" style={{ backgroundColor: NAVY }}>
          Valores estimados · preços do valor do rebanho de cada mês · arrobas = kg vivo ÷ 30
        </div>
      </DialogContent>
    </Dialog>
  );
}

/**
 * A CAMINHADA DO VALOR — as quatro linhas da metade direita do topo (mock v16b, fix5).
 *
 * ⚠ O PREÇO DE CADA LINHA É O DELA: `valor / arrobas`, e não um preço emprestado de outra. O da
 * Produção é o preço de P0 PONDERADO PELO REBANHO DO FIM e difere do R$/@ do início da metade
 * esquerda, que é ponderado pelo rebanho do INÍCIO — são dois preços médios do mesmo mês sobre
 * misturas de categoria diferentes. Medido no SR jan-ago/21: 246,73 contra 245,55, e emprestar o
 * da esquerda fazia o produto dar 9.634.161 no lugar dos 9.680.106 da linha.
 *
 * ⚠ E É ISSO QUE A COLUNA PROMETE: o operador multiplica o que lê e chega no que lê. O que sobra é
 * só o arredondamento — das duas casas do preço e das zero casas das arrobas.
 */
export interface PassoValor {
  rot: string;
  arrobas: number | null;
  preco: number | null;
  valor: number;
  /** `null` na primeira linha: não há variação antes de começar. */
  variacao: number | null;
}

export function caminhadaDoValor(t: {
  at0: number; at1: number; v0: number; v1p0: number; v1p1: number;
  dProd: number; dMerc: number; dTotal: number;
}): PassoValor[] {
  const preco = (valor: number, at: number) => (at === 0 ? null : valor / at);
  return [
    { rot: 'Valia', arrobas: t.at0 === 0 ? null : t.at0, preco: preco(t.v0, t.at0),
      valor: t.v0, variacao: null },
    { rot: '+ Produção', arrobas: t.at1 === 0 ? null : t.at1, preco: preco(t.v1p0, t.at1),
      valor: t.v1p0, variacao: t.dProd },
    { rot: '+ Mercado', arrobas: t.at1 === 0 ? null : t.at1, preco: preco(t.v1p1, t.at1),
      valor: t.v1p1, variacao: t.dMerc },
    { rot: 'Vale', arrobas: t.at1 === 0 ? null : t.at1, preco: preco(t.v1p1, t.at1),
      valor: t.v1p1, variacao: t.dTotal },
  ];
}
