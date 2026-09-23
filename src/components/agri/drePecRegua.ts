/**
 * A RÉGUA DA PECUÁRIA — a cascata, as unidades e a coluna, fora da tela que as desenhava.
 *
 * ⚠ CÓDIGO MOVIDO, COPIADO BYTE A BYTE de `src/pages/PecDrePanel.tsx`, onde nasceu. Os comentários
 * abaixo são os de lá, inclusive as medições que os originaram — nada foi reescrito. A única
 * diferença é a palavra `export` nas declarações.
 * ⚠ ELE SAIU DA TELA PORQUE O HISTÓRICO CHEGOU (DRE-HISTORICO-LINHA-01a). O modal do histórico
 * precisa da MESMA conta de R$/ha, R$/cab/mês e R$/@ e da MESMA cascata; importá-las de
 * `PecDrePanel` — que por sua vez monta o modal — fecharia um ciclo de import, e o `madge` acusaria
 * (23 → 24). É a mesma história do `dreGrade`, que nasceu quando a pecuária passou a precisar da
 * régua da lavoura.
 * ⚠ E A ALTERNATIVA ERA PIOR: duplicar `valorNaUnidade` criaria a segunda dona da conta da @, cuja
 * base muda por linha. Duas cópias divergem no primeiro ajuste, e a divergência apareceria como um
 * número diferente na mesma tela.
 * ⚠ O QUE NÃO VEIO: `TITULO_ARROBA`, `TITULO_CAB` e `tituloHa` ficaram na tela — são texto de
 * cabeçalho de sub-coluna, não conta.
 */
import { formatNum } from '@/lib/calculos/formatters';
import { traco, VERDE, VERMELHO, type TomFaixa } from '@/components/agri/dreGrade';
import type {
  ChaveLinhaPec, DrePecLinhas, CentroPec, CenarioPec,
} from '@/hooks/useDrePecuaria';

/**
 * UMA COLUNA DA GRADE — o Total é uma coluna como as outras, só que primeiro e destacada.
 *
 * ⚠ `fazendaId: null` É O TOTAL, e esse `null` viaja até a RPC: `fn_dre_pecuaria_lancamentos`
 * trata `p_fazenda is null` como "todas". A coluna e o filtro falam a mesma língua.
 * ⚠ CADA COLUNA SABE DE ONDE VEIO (`de`, `ate`, `cenario`): é o que faz o clique na coluna de
 * 2024 abrir os lançamentos de 2024, e o da coluna Meta abrir os de meta.
 */
export interface ColunaPec {
  chave: string;
  nome: string;
  /** A segunda linha do cabeçalho do grupo — "6.233 cab", "sem meta", "real − meta". */
  sub: string;
  /**
   * O `sub` por extenso, para o `title` — DRE-UNIDADES-01c.
   *
   * ⚠ ELE EXISTE PORQUE O PISO DESCEU: com o grupo em 104px, "sem meta no período" (100,1px de
   * texto) não cabia e virava reticências. O que se lê na tela encurtou para "sem meta"; a frase
   * inteira não se perdeu, mudou de lugar. Sem isso, encurtar seria apagar.
   */
  subLongo?: string;
  fazendaId: string | null;
  /** `null` = ainda carregando: esqueleto SÓ nesta coluna, a grade não espera por ela. */
  linhas: DrePecLinhas | null;
  /** A primeira coluna: congelada à esquerda, fundo cinza, borda de 2px. */
  total: boolean;
  tipo: 'valor' | 'delta';
  /** A sub-coluna ao lado do R$: por hectare produtivo, percentual do delta, ou nenhuma. */
  unidade: 'ha' | 'pct' | null;
  /** Só no delta: a meta contra a qual `linhas` (o realizado) se compara. `null` = sem meta. */
  ref?: DrePecLinhas | null;
  de: string;
  ate: string;
  cenario: CenarioPec;
  /** Os meses do período DESTA coluna (`periodo.meses` do JSON dela) — o divisor do R$/cab/mês. */
  meses: number;
  /** O realizado do período da tela: só ele abre o modal da VPB e o do rateio (decisão 4). */
  atual: boolean;
  /** A coluna Meta: as linhas de patrimônio saem em "—". */
  semPatrimonio?: boolean;
  /** Ano sem dado ou período sem meta: a coluna inteira em "—" — ela não some. */
  semDado?: boolean;
  /**
   * QUAIS CÉLULAS UMA COLUNA DE Δ MOSTRA — DRE-CASCATA-03b.
   *
   * ⚠ ELA NÃO OBEDECE AOS CHIPS DE UNIDADE, e por isso tem lista própria: "Δ R$" e "Δ %" são
   * outra pergunta (quanto mudou), não outra unidade do mesmo número. Vazia, a coluna de Δ não é
   * montada — é assim que os chips a ligam e desligam.
   */
  deltaSlots?: readonly ('rs' | 'pct')[];
  /**
   * A COLUNA É DE COMPARAÇÃO — a referência (meta/ano) ou o Δ.
   *
   * ⚠ ELA SE LÊ MAIS BAIXO QUE O REALIZADO, de propósito: o número da tela é o do período, e a
   * comparação é apoio. Em 11px, lado a lado, as três disputavam a mesma atenção e o operador
   * tinha de procurar qual era o dado.
   */
  comparacao?: boolean;
}

/**
 * A BASE DO PERCENTUAL É O VBP — decisão do Gabriel, 16/09, e ela tem história.
 *
 * ⚠ A ÂNCORA DO BRIEFING NÃO EXISTIA: o DRE da "Visão Geral" (`BlocoAnaliseEconomica`) NÃO tem
 * "% da receita" — os percentuais dele são DELTAS (Δ ano anterior, Δ meta), por
 * `pctDelta(atual, anterior)`. Não havia ali uma base a copiar.
 * ⚠ O QUE DECIDIU FOI UM DEFEITO MEDIDO, não preferência. Com a receita como base, o Resultado da
 * Atividade deu 203% em janeiro na Santa Rita — porque a variação de estoque entra no NUMERADOR e
 * nunca passou pela receita. A pecuária tem a mesma forma: `vpb_operacional` entra na cascata
 * DEPOIS da receita líquida, então dividir por ela compara coisas de tamanhos diferentes.
 * ⚠ E O VBP JÁ CONTÉM A VARIAÇÃO POR PRODUÇÃO — a RPC o monta como
 * `receita_liquida + vpb_operacional − reposicao`. É por isso que ele é o denominador honesto: o
 * numerador e o denominador passam a falar da mesma produção.
 * ⚠ VBP ≤ 0 DÁ TRAÇO, NUNCA 0% — ver `percentual` abaixo. Desfrute acima da produção é resultado
 * real, e é justamente o que a auditoria procura.
 */
export const BASE_DO_PERCENTUAL: ChaveLinhaPec = 'vbp';
export const ROTULO_DA_BASE = '% do VBP';

/** As linhas que ganham a linha de % logo abaixo. */
export const COM_PERCENTUAL: ReadonlySet<ChaveLinhaPec> = new Set<ChaveLinhaPec>([
  'margem', 'resultado_operacional', 'resultado_com_mercado',
]);

/**
 * AS LINHAS QUE GANHAM O LUCRO POR HECTARE logo abaixo — DRE-CASCATA-03a.
 *
 * ⚠ SÃO DUAS, E NÃO TODAS: o resultado com mercado e o lucro líquido. Hectare é o denominador da
 * TERRA, e só faz pergunta em linha que fecha conta — "quanto esta fazenda rendeu por hectare".
 * Pôr o mesmo denominador embaixo de Vendas ou de Nutrição encheria a grade de números que
 * ninguém compara.
 */
export const COM_POR_HECTARE: ReadonlySet<ChaveLinhaPec> = new Set<ChaveLinhaPec>([
  'resultado_com_mercado', 'lucro_liquido',
]);
export const ROTULO_POR_HECTARE = 'Lucro por hectare';

/**
 * A CASCATA, declarada — e a diferença entre as linhas é DADO.
 *
 * ⚠ A ORDEM É O DRE, e ela mora AQUI: a RPC devolve um objeto de chaves sem ordem, porque JSON
 * não tem ordem. Quem sabe que a margem vem depois do custo variável é a apresentação.
 */
export interface DefPec {
  chave: ChaveLinhaPec;
  rotulo: string;
  tom: 'receita' | 'custo' | 'neutro';
  destaque?: 'subtotal' | 'sub';
  /** A cor sai do próprio número, coluna a coluna. */
  corPorSinal?: boolean;
  etiqueta?: string;
  /** O que a etiqueta curta diz por extenso, ao passar o mouse. */
  tituloEtiqueta?: string;
  /** O rótulo por extenso, quando o da tela precisou encurtar para caber nos 200px. */
  title?: string;
  /**
   * A linha abre em centros de custo (§4).
   *
   * ⚠ NÃO É "TODA LINHA COM BLOCO": `Reposição` e `Juros` têm bloco e NÃO expandem, por decisão do
   * §4 — a reposição é um gesto só (comprar boi) e os juros não se dividem em centro que o
   * produtor reconheça. Elas continuam clicáveis; só não têm filhas.
   */
  expande?: boolean;
  /**
   * O que vai em 9px muted ao lado do nome — DRE-CASCATA-03a.
   *
   * ⚠ NÃO É ETIQUETA: a `Etiqueta` é uma cápsula com borda, para ressalva ("estimado"). Isto é
   * glossário — "VBP" é sigla, e a tela escreve por extenso ao lado dela em vez de exigir que o
   * produtor a decore.
   */
  sufixo?: string;
  /** Abre o modal didático em vez da lista de lançamentos (§6). */
  didatico?: 'vpb' | 'efeito';
  /** Abre o modal do rateio administrativo (§5, último parágrafo). */
  rateio?: boolean;
  /**
   * O TOM DA FAIXA quando a linha é um total — t1 (mais claro) a t4 (azul cheio).
   *
   * ⚠ ELE É DA LINHA, não do `destaque`: "Receita bruta" e "Receita líquida" fecham a primeira
   * parte da conta e dividem o tom mais claro; o lucro líquido, que fecha tudo, fica sozinho no
   * azul cheio. Derivar o tom da posição faria a escala mudar quando uma linha entrasse no meio.
   */
  faixa?: TomFaixa;
  /**
   * A LINHA É A SOMA DE OUTRAS — DRE-CASCATA-03b, e só o modo Resumido a usa.
   *
   * ⚠ NÃO É SUBTOTAL NOVO: as sete linhas "=" continuam vindo prontas da RPC, como sempre. Isto
   * junta duas linhas que o Detalhado mostra separadas — "Variação do estoque" é a variação por
   * produção menos a reposição; "Custo fixo" inclui o rateio administrativo. É apresentação:
   * soma de números que a tela já tem, não uma segunda conta de resultado.
   * ⚠ E É POR ISSO QUE ELE NÃO PODE APARECER NUMA LINHA DE "=": um subtotal composto no front
   * divergiria do da RPC no primeiro arredondamento, e o DRE teria duas verdades.
   */
  compor?: { mais: ChaveLinhaPec[]; menos?: ChaveLinhaPec[] };
}

export const LINHAS_PEC: DefPec[] = [
  { chave: 'vendas', rotulo: 'Vendas', tom: 'receita', expande: true },
  { chave: 'outras_receitas', rotulo: 'Outras receitas', tom: 'receita', expande: true },
  { chave: 'receita_bruta', rotulo: '= Receita bruta', faixa: 't1', tom: 'receita', destaque: 'sub' },
  { chave: 'deducoes', rotulo: '(−) Deduções', tom: 'custo', expande: true },
  { chave: 'receita_liquida', rotulo: '= Receita líquida', faixa: 't1', tom: 'receita', destaque: 'subtotal' },
  /* ⚠ A VARIAÇÃO POR PRODUÇÃO É O REBANHO QUE MUDOU A PREÇO CONGELADO — pode ser negativa numa
     safra de venda, e negativa aqui não é prejuízo: é boi que saiu da fazenda. Cor pelo sinal. */
  { chave: 'vpb_operacional', rotulo: 'Variação por produção', tom: 'neutro', corPorSinal: true, etiqueta: 'estimado', didatico: 'vpb' },
  { chave: 'reposicao', rotulo: '(−) Reposição', tom: 'custo' },
  { chave: 'vbp', rotulo: '= VBP', sufixo: '(valor bruto de produção)', faixa: 't2', tom: 'neutro', destaque: 'subtotal', corPorSinal: true },
  { chave: 'custo_variavel', rotulo: '(−) Custo variável', tom: 'custo', expande: true },
  { chave: 'margem', rotulo: '= Margem de contribuição', faixa: 't2', tom: 'neutro', destaque: 'subtotal', corPorSinal: true },
  { chave: 'custo_fixo', rotulo: '(−) Custo fixo', tom: 'custo', expande: true },
  { chave: 'rateio_adm', rotulo: '(−) Rateio administrativo', tom: 'custo', etiqueta: 'estimado', rateio: true },
  { chave: 'resultado_operacional', rotulo: '= Resultado operacional', faixa: 't3', tom: 'neutro', destaque: 'subtotal', corPorSinal: true },
  { chave: 'juros', rotulo: '(−) Despesas financeiras', tom: 'custo' },
  { chave: 'resultado_periodo', rotulo: '= Resultado do período', faixa: 't3', tom: 'neutro', destaque: 'subtotal', corPorSinal: true },
  { chave: 'efeito_mercado', rotulo: 'Efeito de mercado', tom: 'neutro', corPorSinal: true, etiqueta: 'estimado', didatico: 'efeito' },
  { chave: 'resultado_com_mercado', rotulo: '= Resultado com mercado', faixa: 't3', tom: 'neutro', destaque: 'subtotal', corPorSinal: true },
  { chave: 'investimento', rotulo: '(−) Investimento no período', tom: 'custo', expande: true },
  /* ⚠ A CASCATA FECHA AQUI — DRE-CASCATA-03a. O investimento deixou de ser nota de rodapé "abaixo
     da linha de caixa" e entrou na conta: o que sobra depois dele é o lucro líquido, e é ele que
     as duas atividades passam a mostrar com o mesmo nome. */
  { chave: 'lucro_liquido', rotulo: '= Lucro líquido', faixa: 't4', tom: 'neutro', destaque: 'subtotal', corPorSinal: true },
];

/**
 * O DRE RESUMIDO — quinze linhas, decisão do Gabriel em 23/09.
 *
 * ⚠ ELE RESPONDE OUTRA PERGUNTA, e é por isso que não é "o mesmo com menos linhas": o Detalhado
 * responde "ONDE o dinheiro entrou e saiu" e precisa das dezenove; o Resumido responde "COMO
 * fechou o período" e precisa caber numa tela sem rolagem, senão a resposta se perde no meio do
 * caminho.
 * ⚠ AS CHAVES SÃO AS MESMAS, e isso é deliberado: o `%` do VBP, o lucro por hectare, o histórico,
 * o drill e as filhas continuam funcionando sem saber em que modo a tela está. O que muda é
 * quais defs a grade percorre.
 * ⚠ AS DUAS LINHAS COMPOSTAS ESTÃO MARCADAS COM `compor`, e nenhuma delas é um "=": "Variação do
 * estoque por produção" junta a variação e a reposição (as duas metades do mesmo fato — o rebanho
 * que ficou), e "(−) Custo fixo" traz o rateio administrativo junto, com o selo dizendo isso.
 */
export const LINHAS_PEC_RESUMIDO: DefPec[] = [
  { chave: 'receita_bruta', rotulo: 'Receita bruta', faixa: 't1', tom: 'receita' },
  { chave: 'deducoes', rotulo: '(−) Deduções', tom: 'custo' },
  { chave: 'receita_liquida', rotulo: '= Receita líquida', faixa: 't1', tom: 'receita', destaque: 'subtotal' },
  /* ⚠ ROTULO CURTO E O INTEIRO NO `title` — homologação de 23/09: "Variação do estoque por
     produção" com o selo "estimado" ao lado não cabe nos 200px da coluna de rótulos, e saía com
     reticências. A coluna não alarga (a largura é a régua das duas abas); o nome é que encurta. */
  { chave: 'vpb_operacional', rotulo: 'Variação do estoque', tom: 'neutro',
    title: 'Variação do estoque por produção = variação por produção − reposição',
    corPorSinal: true, etiqueta: 'estimado', didatico: 'vpb',
    compor: { mais: ['vpb_operacional'], menos: ['reposicao'] } },
  { chave: 'vbp', rotulo: '= VBP', sufixo: '(valor bruto de produção)', faixa: 't2', tom: 'neutro', destaque: 'subtotal', corPorSinal: true },
  { chave: 'custo_variavel', rotulo: '(−) Custo variável', tom: 'custo', expande: true },
  { chave: 'margem', rotulo: '= Margem de contribuição', faixa: 't2', tom: 'neutro', destaque: 'subtotal', corPorSinal: true },
  { chave: 'custo_fixo', rotulo: '(−) Custo fixo', tom: 'custo', expande: true, etiqueta: 'c/ rateio',
    tituloEtiqueta: 'inclui rateio administrativo estimado',
    compor: { mais: ['custo_fixo', 'rateio_adm'] } },
  { chave: 'resultado_operacional', rotulo: '= Resultado operacional', faixa: 't3', tom: 'neutro', destaque: 'subtotal', corPorSinal: true },
  { chave: 'juros', rotulo: '(−) Despesas financeiras', tom: 'custo' },
  { chave: 'resultado_periodo', rotulo: '= Resultado do período', faixa: 't3', tom: 'neutro', destaque: 'subtotal', corPorSinal: true },
  { chave: 'efeito_mercado', rotulo: 'Efeito de mercado', tom: 'neutro', corPorSinal: true, etiqueta: 'estimado', didatico: 'efeito' },
  { chave: 'resultado_com_mercado', rotulo: '= Resultado com mercado', faixa: 't3', tom: 'neutro', destaque: 'subtotal', corPorSinal: true },
  { chave: 'investimento', rotulo: '(−) Investimento no período', tom: 'custo', expande: true },
  { chave: 'lucro_liquido', rotulo: '= Lucro líquido', faixa: 't4', tom: 'neutro', destaque: 'subtotal', corPorSinal: true },
];

export type ModoDre = 'resumido' | 'detalhado';
export const LINHAS_DO_MODO = (m: ModoDre) => (m === 'resumido' ? LINHAS_PEC_RESUMIDO : LINHAS_PEC);

export const corDoTom = (t: DefPec['tom']) => (t === 'receita' ? VERDE : t === 'custo' ? VERMELHO : '');

/** ⚠ `null` É AUSÊNCIA, não zero: fazenda sem fechamento numa das pontas não tem variação. */
export const valorDe = (l: DrePecLinhas, c: ChaveLinhaPec): number | null => {
  const v = l[c];
  return typeof v === 'number' ? v : null;
};

/**
 * ⚠ A ÚNICA DIVISÃO DE UNIDADE, e é de apresentação. Sem área, traço — nunca Infinity.
 *
 * ⚠ O R$/cab/mês SAIU DAQUI — TELA-03a, decisão do Gabriel em 22/09. A sub-coluna do DRE passa a
 * ser R$/ha e só ela; o por cabeça vai para a tela de análise (ANALISE-PEC-01), onde convive com
 * @ e outras unidades. Uma grade de dezoito linhas responde a uma pergunta por vez.
 * ⚠ O DENOMINADOR É `producao.ha_medio` DA PRÓPRIA COLUNA: a RPC o monta por cenário — realizado
 * pela área dos fechamentos de pasto, meta pela `planejamento_area_meta` — e cada coluna traz o
 * seu. Medido em 22/09 na NJ 2026: 4.824,3 ha no realizado e 4.813,6 na meta. Dividir a meta pela
 * área do realizado faria o R$/ha da meta falar de outro pedaço de terra.
 * ⚠ E É NO PERÍODO, NÃO POR MÊS, ao contrário do que o R$/cab fazia: hectare não se consome mês a
 * mês como cabeça, e a pergunta é quanto aquela terra rendeu no recorte inteiro. Dividir também
 * pelos meses responderia outra coisa.
 * ⚠ ÁREA NULA DÁ TRAÇO, e zero também: `null` é "não sei" e zero dividiria por nada. Coluna sem
 * área não pega emprestada a da vizinha.
 */
export const porHectare = (v: number | null, ha: number | null) =>
  (v == null || ha == null || !(ha > 0) ? traco : formatNum(v / ha, 2));

/**
 * AS UNIDADES QUE O DRE SABE MOSTRAR — DRE-UNIDADES-01.
 *
 * ⚠ A ORDEM É FIXA e é esta: o R$ primeiro, depois as unidades da mais geral para a mais
 * específica. Deixar o operador reordenar faria a mesma tela ter duas leituras.
 */
export const UNIDADES_PEC = ['rs', 'ha', 'cab', 'arroba'] as const;
export type UnidadePec = typeof UNIDADES_PEC[number];

export const ROTULO_UNIDADE: Record<UnidadePec, string> = {
  rs: 'R$', ha: 'R$/ha', cab: 'R$/cab/mês', arroba: 'R$/@',
};

/**
 * AS UNIDADES QUE A GRADE OFERECE — 03b-fix1/adendo item 7.
 *
 * ⚠ DUAS, NÃO QUATRO: R$/cab/mês e R$/@ saíram dos chips da grade. Elas não deixaram de existir —
 * o módulo continua calculando as duas, o modal de histórico continua oferecendo as quatro, e é lá
 * que elas respondem alguma coisa: uma unidade de PRODUÇÃO se lê comparando períodos, não lendo a
 * cascata de um só. Na grade, cada chip marcado é uma coluna a mais em CADA fazenda, e as duas
 * dobravam a largura para uma leitura que ninguém fazia ali.
 * ⚠ A LISTA É SEPARADA de `UNIDADES_PEC` de propósito: o tipo, a ordem e os rótulos continuam
 * sendo um só, e o dia em que a grade voltar a oferecer as quatro é uma linha, não uma frente.
 */
export const UNIDADES_PEC_GRADE = ['rs', 'ha'] as const satisfies readonly UnidadePec[];

/**
 * R$ POR CABEÇA MÉDIA, POR MÊS — o cálculo que saiu no TELA-03a e volta aqui como chip.
 *
 * ⚠ O CORPO É O DE ANTES, palavra por palavra (`git show e91ff15a`): cabeça MÉDIA (não a do fim do
 * período — a Pureza fechou agosto/26 com 5.661 e teve 4.968 de média) e dividido pelos MESES da
 * coluna, que é a regra do PC-100. Sem os meses, oito meses de Nutrição do Agnaldo davam 165 por
 * cabeça, um número que só se compara com outro período de exatamente oito meses.
 */
export const porCabeca = (v: number | null, cab: number, meses: number) =>
  (v == null || !(cab > 0) || !(meses > 0) ? traco : formatNum(v / cab / meses, 2));

/**
 * A BASE DO R$/@ MUDA POR LINHA, e por isso ela é declarada aqui, linha a linha.
 *
 * ⚠ NÃO HÁ LINHA SEM BASE: receita e deduções se leem pela arroba VENDIDA (foi ela que gerou o
 * dinheiro), a reposição pela COMPRADA (foi ela que o consumiu) e todo o resto pela PRODUZIDA (o
 * que a fazenda fabricou no período). Uma linha sem entrada aqui viraria traço silencioso.
 * ⚠ E POR ISSO A COLUNA NÃO SOMA: três divisores diferentes na mesma coluna significam que somar
 * duas células dela não dá a terceira. O `title` do cabeçalho diz isso ao operador.
 */
export type BaseArroba = 'vendida' | 'comprada' | 'produzida';
export const BASE_DO_ARROBA: Record<ChaveLinhaPec, BaseArroba> = {
  vendas: 'vendida', outras_receitas: 'vendida', receita_bruta: 'vendida',
  deducoes: 'vendida', receita_liquida: 'vendida',
  reposicao: 'comprada',
  vpb_operacional: 'produzida', vbp: 'produzida', custo_variavel: 'produzida',
  margem: 'produzida', custo_fixo: 'produzida', rateio_adm: 'produzida',
  resultado_operacional: 'produzida', juros: 'produzida', resultado_periodo: 'produzida',
  efeito_mercado: 'produzida', resultado_com_mercado: 'produzida', investimento: 'produzida',
  lucro_liquido: 'produzida', juros_proprio: 'produzida', juros_rateado: 'produzida',
  /* As chaves que não são linha da cascata — nunca chegam a pedir base, mas o Record as exige. */
  patrimonio: 'produzida', producao: 'produzida', sem_p0: 'produzida', sem_p1: 'produzida',
  p0_origem: 'produzida', p1_origem: 'produzida', p1_divergencia_cab: 'produzida',
  centros: 'produzida', centros_juros: 'produzida', a_pagar: 'produzida',
};

export const arrobaDaBase = (l: DrePecLinhas, b: BaseArroba): number | null =>
  (b === 'vendida' ? l.producao.at_desfrutada
    : b === 'comprada' ? l.producao.at_comprada
      : l.producao.at_produzida);

/** ⚠ BASE NULA OU ZERO DÁ TRAÇO: a @ produzida da meta vem nula da RPC, e emprestar a do realizado
    faria o custo da meta se ler por uma produção que não é dela. */
export const porArroba = (v: number | null, l: DrePecLinhas, chave: ChaveLinhaPec) => {
  const base = arrobaDaBase(l, BASE_DO_ARROBA[chave]);
  return (v == null || base == null || !(base > 0) ? traco : formatNum(v / base, 2));
};

/** O valor de uma célula na unidade pedida — `rs` não passa por aqui (é a célula de dinheiro). */
export const valorNaUnidade = (u: UnidadePec, v: number | null, col: ColunaPec, chave: ChaveLinhaPec): string => {
  const l = col.linhas;
  if (!l) return traco;
  if (u === 'ha') return porHectare(v, l.producao.ha_medio);
  if (u === 'cab') return porCabeca(v, l.patrimonio.cab_media, col.meses);
  return porArroba(v, l, chave);
};

/**
 * ⚠ BASE ZERO OU NEGATIVA DÁ TRAÇO, NUNCA 0% — a regra do VBP ≤ 0 do DRE gerencial, trazida
 * inteira. Uma fazenda cujo VBP não é positivo não tem "0% de margem": ela não tem percentual
 * nenhum. E com VBP negativo o sinal do percentual se inverteria — uma margem positiva sobre um
 * VBP negativo apareceria como percentual negativo, que é o oposto do que aconteceu.
 */
export const percentual = (v: number | null, base: number): string => {
  if (v == null || !(base > 0)) return traco;
  return `${formatNum((v / base) * 100, 1)} %`;
};

/** Os centros de um bloco numa coluna. ⚠ Juros têm lista própria (`centros_juros`). */
export const centrosDoBloco = (l: DrePecLinhas, bloco: string): readonly CentroPec[] =>
  (bloco === 'juros' ? l.centros_juros : l.centros.filter(c => c.bloco === bloco));
