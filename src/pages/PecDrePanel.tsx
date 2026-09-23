/**
 * DRE DA PECUÁRIA — a grade por fazenda, num período de meses.
 *
 * ⚠⚠ NENHUM CÁLCULO AQUI. `fn_dre_pecuaria` devolve cada linha por fazenda e no total; as únicas
 * contas são `valor / producao.ha_medio` e o percentual sobre a base — as duas de APRESENTAÇÃO, a
 * mesma licença que o `/ha` tem na lavoura.
 *
 * ⚠ ELE NÃO É A `Grade` DA LAVOURA, e a razão é estrutural, não preguiça. Aquela grade é feita de
 * grupos expansíveis, centros de custo, ponto de rateio, etiquetas e TRÊS sub-colunas por
 * cultura; esta tem DUAS sub-colunas por fazenda e uma cascata própria. Encaixar as duas num
 * componente só custaria uma dúzia de condicionais numa peça que acabou de estabilizar — e o
 * primeiro ajuste da pecuária mexeria na lavoura sem querer.
 * ⚠ O QUE SE REUSA É A RÉGUA, que é o que não pode divergir: larguras de coluna, altura de linha,
 * cores, `Celula`, `CelulaUnit` e as caixas da faixa vêm todas do módulo `components/agri/dreGrade`.
 * Duas telas do mesmo DRE não podem ter dois cinzas de cabeçalho nem dois vermelhos de saída.
 *
 * ⚠ O TOTAL É A PRIMEIRA COLUNA (§2a). Ele era a última, e a última coluna de uma grade que rola
 * é a que ninguém vê: a pergunta "quanto deu no conjunto" é a primeira que se faz, e a resposta
 * ficava atrás de uma barra de rolagem. À esquerda, ele fica congelado junto da coluna de rótulos
 * e as fazendas passam por baixo dele.
 */
import { Fragment, useMemo, useState, type CSSProperties, type ReactNode } from 'react';
import { ChevronRight, BarChart3 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { CINZA_CABECALHO } from '@/lib/idiomaVisual';
import { formatNum } from '@/lib/calculos/formatters';
import {
  W_RS, W_HA, W_RS_TOTAL, larguraDoGrupo, FAIXA_TOTAL, VERDE, VERDE_70, VERMELHO, VERMELHO_70, NAVY_TOTAL, BORDA_TOTAL, BORDA_TOTAL_CAB, FUNDO_TOTAL, traco,
  corDoSinal, corDoTotal, corDoApoio, marcadorDoTotal, Marcador, numeroDaCelula, Celula, CelulaUnit, Etiqueta, Caixas, REGUA_LINHA, tipoDaLinha,
  fundoDaLinha,
  type CaixaFaixa,
} from '@/components/agri/dreGrade';
import { Segmentado } from '@/components/ui/segmentado';
/* ⚠ A RÉGUA DA PECUÁRIA SAIU DAQUI — DRE-HISTORICO-LINHA-01a. A cascata, a conta das unidades e o
   tipo da coluna moram em `drePecRegua`, porque o modal do histórico precisa das MESMAS, e ele é
   montado por esta tela: importar de volta fecharia um ciclo. Nada mudou de corpo. */
import {
  LINHAS_DO_MODO, COM_PERCENTUAL, COM_POR_HECTARE, ROTULO_POR_HECTARE, BASE_DO_PERCENTUAL, ROTULO_DA_BASE, corDoTom, valorDe,
  valorNaUnidade, percentual, centrosDoBloco, UNIDADES_PEC, ROTULO_UNIDADE,
  type DefPec, type ColunaPec, type UnidadePec, type ModoDre,
} from '@/components/agri/drePecRegua';
import type { RecorteHistoricoPec } from '@/components/agri/PecHistoricoLinhaModal';
import {
  BLOCO_DA_LINHA, rotuloCurtoPeriodo,
  type DrePecuaria, type DrePecLinhas, type ChaveLinhaPec, type CentroPec, type RecortePec,
  type CenarioPec,
} from '@/hooks/useDrePecuaria';

/* ⚠ 200px NO RÓTULO — DRE-PADRAO-01a-2: a mesma largura da coluna de rótulos da lavoura, para as
   duas abas começarem a tabela no mesmo x. Era 190 antes do 01a, subiu a 240 e desceu a 200 na
   homologação do Gabriel — com a régua de 9px o rótulo mais longo cabe, e os 40px voltam para as
   colunas de número. */
const W_FAZENDA = 200;
/** A sub-coluna R$/ha — a mesma largura da lavoura (`W_HA`), que desceu a 64 no DRE-PADRAO-01a. */
const W_SUB = W_HA;





const TITULO_ARROBA = 'Divisor por linha: receita e deduções pela @ vendida, reposição pela @ comprada, '
  + 'demais pela @ produzida. Esta coluna não soma.';
const TITULO_CAB = 'R$ por cabeça média do período, por mês';

/** O que o cabeçalho da sub-coluna explica: a unidade, o período e a ÁREA que dividiu. */
const tituloHa = (c: ColunaPec) => {
  const ha = c.linhas?.producao.ha_medio;
  return `R$ por hectare produtivo no período${ha != null && ha > 0 ? ` · área média ${formatNum(ha, 2)} ha` : ' · sem área no período'}`;
};



/* ══════════════ AS QUATRO VISÕES — DRE-PEC-TELA-02 ══════════════ */

/**
 * AS DUAS PERGUNTAS DA GRADE, uma por card (Art. 19 da Constituição nº 2):
 *   comparacao — contra o que este período se lê? (a meta, ou N anos anteriores)
 *   fazenda    — qual fazenda carrega o resultado?
 *
 * ⚠ ERAM QUATRO, E TRÊS ERAM A MESMA — DRE-CASCATA-03b-fix4, decisão do Gabriel: "Global",
 * "× Meta" e "× Anos" respondiam todas "comparado com o quê?", e cada uma tinha o seu controle em
 * lugar diferente (chips de Δ no Global, card próprio na Meta, seletor de anos no × Anos). O
 * operador trocava de VISÃO para trocar de REFERÊNCIA, e perdia o número que estava lendo.
 * A referência virou um seletor DENTRO do card, e a visão passou a ser só onde a grade se corta:
 * por período (comparação) ou por fazenda.
 */
export type VisaoPec = 'comparacao' | 'fazenda';
const VISOES: readonly VisaoPec[] = ['comparacao', 'fazenda'];

/**
 * CONTRA O QUE O PERÍODO DA TELA SE LÊ — 'meta' ou quantos anos anteriores entram.
 *
 * ⚠ UM NÚMERO, NÃO UMA LISTA: 1 é "o ano anterior", 3 é "os três anteriores, em ordem". Ele é o
 * mesmo `f_anos` de sempre, agora com o papel explícito de referência.
 */
export type ReferenciaPec = 'meta' | number;

/**
 * ⚠ OS TRÊS VALORES ANTIGOS DE `f_visao` CONTINUAM VALENDO, e cada um cai onde a pergunta dele
 * virou: 'global' e 'anos' viram a comparação por anos (o n sai de `f_anos`), e 'meta' vira a
 * comparação com a meta — ela deixou de ser visão e virou referência, mas o link antigo pedia
 * exatamente isso. 'fazenda' não mudou.
 */
const VISOES_URL: readonly string[] = ['comparacao', 'global', 'meta', 'anos', 'fazenda'];

/**
 * O QUE `f_visao` GUARDA — a visão E, quando ela é a comparação com o planejado, a referência.
 *
 * ⚠ 'meta' É UM VALOR DE `f_visao`, e é o que torna a referência linkável sem inventar parâmetro:
 * com ela na barra, `f_anos` segue sendo só o n. E não por acaso: 'meta' já era um valor válido
 * antes do fix4, quando a comparação com o planejado era uma VISÃO — o link antigo continua abrindo
 * exatamente a tela que pedia.
 */
export type VisaoUrlPec = 'comparacao' | 'meta' | 'fazenda';

/** `f_visao` na URL. ⚠ Constantes de módulo: o `useFiltroUrl` as usa nas dependências. */
export const lerVisaoPec = (bruto: string): VisaoUrlPec =>
  (bruto === 'fazenda' ? 'fazenda' : bruto === 'meta' ? 'meta' : 'comparacao');
export const escreverVisaoPec = (v: VisaoUrlPec): string => v;
/** A visão que a grade monta — 'meta' é comparação, com outra referência. */
export const visaoDaUrl = (v: VisaoUrlPec): VisaoPec => (v === 'fazenda' ? 'fazenda' : 'comparacao');
/** O link antigo pedia a comparação com a meta COM o Δ à vista — a página liga os chips ao ver isto. */
export const ehVisaoMetaLegada = (bruto: string | null) => bruto === 'meta';
export { VISOES_URL };
/** `f_anos` na URL — de 1 a 5, padrão 1. Fora da faixa volta ao padrão, nunca quebra a tela.
    ⚠ ERA 3 ATÉ O fix4: agora ele É a referência, e a tela abre comparando com o ano anterior. */
export const N_ANOS_PADRAO = 1;
export const lerNAnosPec = (bruto: string): number => {
  const n = Number(bruto);
  return Number.isInteger(n) && n >= 1 && n <= 5 ? n : N_ANOS_PADRAO;
};
export const escreverNAnosPec = (n: number): string => String(n);

/**
 * AS LINHAS QUE NÃO TÊM META — patrimônio não tem cenário.
 *
 * ⚠ A RPC NÃO FILTRA O PATRIMÔNIO POR CENÁRIO (rebanho é fato): a leitura em 'meta' devolve a MESMA
 * variação de rebanho do realizado. Mostrá-la na coluna Meta faria parecer que existe meta de
 * patrimônio. A coluna diz "—" e o delta também.
 */
const SEM_META: ReadonlySet<ChaveLinhaPec> = new Set<ChaveLinhaPec>([
  'vpb_operacional', 'efeito_mercado', 'resultado_com_mercado',
]);

const CHAVES_FINANCEIRAS: readonly ChaveLinhaPec[] = [
  'vendas', 'outras_receitas', 'deducoes', 'reposicao', 'custo_variavel', 'custo_fixo', 'juros', 'investimento',
];

/**
 * "SEM META NO PERÍODO" — nenhum lançamento de meta em linha nenhuma, e nenhum pool de meta.
 *
 * ⚠ NÃO É "sem fazenda": a lista de fazendas da RPC entra por fechamento de rebanho, que não tem
 * cenário — a leitura em meta de um cliente com gado SEMPRE traz fazendas. Olhar só as fazendas
 * faria o aviso nunca aparecer.
 */
export function semMovimento(d: DrePecuaria): boolean {
  return d.rateio_adm.pool === 0
    && CHAVES_FINANCEIRAS.every(k => { const v = valorDe(d.total, k); return v == null || v === 0; });
}



export interface EntradaVisoes {
  visao: VisaoPec;
  de: string;
  ate: string;
  real: DrePecuaria;
  meta: DrePecuaria | null;
  carregandoMeta: boolean;
  /** Os anos anteriores, do mais recente ao mais antigo (k = 1..N). */
  anos: readonly { de: string; ate: string; dre: DrePecuaria | null; carregando: boolean }[];
  /**
   * OS CHIPS DE Δ — DRE-CASCATA-03b. Vazio (o padrão) = nenhuma coluna de comparação.
   *
   * ⚠ A COMPARAÇÃO É SEMPRE CONTRA O PERÍODO DA TELA: cada ano anterior (ou a Meta) ganha, à
   * DIREITA, o quanto mudou até hoje. Pôr o Δ à esquerda faria ler a diferença antes do número
   * que a produziu.
   */
  deltas?: readonly ('rs' | 'pct')[];
  /**
   * CONTRA O QUE ESTE PERÍODO SE LÊ — 'meta' ou o número de anos anteriores (fix4).
   *
   * ⚠ ELE ABSORVEU O `refDelta` E A VISÃO 'anos': eram dois controles para a mesma escolha, em
   * lugares diferentes da tela. Agora é um só, e ele mora no card "Comparação".
   */
  referencia?: ReferenciaPec;
}

/**
 * ⚠ O "N cab med." SAIU DO CABEÇALHO — 03b-fix1/adendo item 9. Ele custava uma LINHA INTEIRA de
 * cabeçalho em toda coluna para responder uma pergunta que não é a do DRE: quantas cabeças a
 * fazenda teve em média. Quem precisa do número o tem no PC-100, no modal de rateio (é o critério)
 * e no modal de histórico; `cab_media` continua sendo lida nos três — o que saiu foi o subtítulo.
 * ⚠ E A LINHA DOS SUBTÍTULOS AGORA SÓ EXISTE QUANDO ALGUÉM A USA (ver `temSub`): sem o "cab med.",
 * na leitura mais comum — Global, sem Δ — nenhuma coluna tem subtítulo, e a linha desaparece com
 * ele. Onde o subtítulo EXPLICA a coluna ("real − meta", "sem meta"), ela volta: apagá-lo ali
 * deixaria um "Δ" sem dizer de quê.
 */

/**
 * AS COLUNAS DA GRADE — uma montagem só, por (visão, referência, Δ). DRE-CASCATA-03b-fix4.
 *
 * ⚠ ERAM QUATRO MONTAGENS PARALELAS ('global', 'meta', 'anos', 'fazenda'), e três delas montavam a
 * MESMA coisa com regras ligeiramente diferentes: a 'global' punha a referência à esquerda e o Δ
 * depois do atual; a 'anos' punha o Δ ENTRE as colunas, colado ao ano que ele compara; a 'meta'
 * chamava a coluna do período de "Realizado" e as outras de "Total". Três respostas visuais para a
 * mesma pergunta, e a do meio era defeito: com UM ano anterior, o Δ nascia no meio da grade.
 * ⚠ Nenhuma conta aqui: cada coluna é um JSON da RPC inteiro; a única aritmética da tela é o
 * delta, e ela mora na célula.
 */
export function colunasDaVisao(e: EntradaVisoes): ColunaPec[] {
  const { real, de, ate } = e;
  const meses = real.periodo.meses;
  const totalReal: ColunaPec = {
    chave: '__total__', nome: 'Total', sub: '', fazendaId: null, linhas: real.total,
    total: true, tipo: 'valor', unidade: 'ha', de, ate, cenario: 'realizado', meses, atual: true,
  };

  if (e.visao === 'fazenda') {
    /* ⚠ O TOTAL ENTRA NA FRENTE (§2a). A RPC devolve as fazendas e o total separados; quem os
       ordena é a tela, e é aqui que a decisão fica visível. */
    return [totalReal, ...real.fazendas.map((f): ColunaPec => ({
      chave: f.fazenda_id, nome: f.nome, sub: '', fazendaId: f.fazenda_id,
      linhas: f.linhas, total: false, tipo: 'valor', unidade: 'ha', de, ate, cenario: 'realizado',
      meses, atual: true,
    }))];
  }

  const ref = e.referencia ?? 1;
  const deltas = e.deltas ?? [];

  /* ⚠ META NUNCA SE SOMA AO REALIZADO: dois JSONs, duas colunas, e o delta é a diferença.
     ⚠ E A COLUNA DE META TEM DIVISOR PRÓPRIO — TELA-03a: o `producao.ha_medio` do JSON DELA
     (4.813,6 ha contra 4.824,3 do realizado, na NJ 2026). Quando a meta não existe, `semDado` apaga
     a coluna inteira — então o `?? real.total` nunca vira número na tela; é esqueleto de layout,
     não empréstimo de dado. */
  if (ref === 'meta') {
    const semMeta = !e.carregandoMeta && (!e.meta || semMovimento(e.meta));
    const referencia: ColunaPec = {
      chave: '__meta__', nome: 'Meta', sub: semMeta ? 'sem meta' : '',
      subLongo: semMeta ? 'sem meta no período' : undefined, fazendaId: null,
      linhas: e.carregandoMeta ? null : (e.meta?.total ?? real.total),
      total: false, tipo: 'valor', unidade: 'ha', de, ate, cenario: 'meta',
      meses: e.meta?.periodo.meses ?? meses, atual: false,
      semPatrimonio: true, semDado: semMeta, comparacao: true,
    };
    /* ⚠ A REFERÊNCIA FICA À ESQUERDA DO ATUAL — a mesma lei do A28: o tempo corre da esquerda para
       a direita e a comparação vem DEPOIS do que compara. Com a meta à direita, o olho lia a
       diferença antes do número que a produziu. */
    const cols: ColunaPec[] = [referencia, { ...totalReal, nome: 'Atual' }];
    if (deltas.length > 0) {
      /* ⚠ SEM NOME E SEM SUB — fix7 item B. O cabeçalho da coluna trazia três linhas
         ("Δ" / "real − meta" / "Δ R$"), e as duas primeiras repetiam o que as colunas ao lado já
         dizem: elas se chamam "Meta" e "Atual". O rótulo do slot ("Δ R$", "Δ %") basta, e é ele
         que nomeia a célula que o operador lê.
         ⚠ E ISSO ENCOLHE O CABEÇALHO INTEIRO: `temSub` é verdadeiro quando QUALQUER coluna tem
         sub, e nesta visão só o Δ tinha — sem ele a primeira linha do thead cai de 26 para 14.
         O aviso "sem meta" continua sendo sub da coluna Meta e continua segurando os 26 quando
         faz falta. */
      cols.push({
        ...totalReal, chave: '__delta__', nome: '', sub: '',
        total: false, tipo: 'delta', unidade: 'pct',
        ref: semMeta ? null : (e.meta?.total ?? null), deltaSlots: deltas, comparacao: true,
        /* ⚠ AQUI O TRAÇO DO PATRIMÔNIO É CERTO: a meta não tem variação de rebanho. */
        refSemPatrimonio: true,
      });
    }
    return cols;
  }

  /* ⚠ ORDEM CRONOLÓGICA — DRE-PERIODO-01, decisão do Gabriel: o mais antigo à ESQUERDA e o período
     da tela à DIREITA, como o modal de histórico já fazia e como se lê uma série temporal.
     ⚠ OS DADOS NÃO MUDARAM: `e.anos` chega do mais recente para o mais antigo, como
     `useDrePecuariaLista` devolve; quem inverte é a APRESENTAÇÃO. E o `__ano{k}__` segue nomeando a
     distância em anos (1 = o anterior), não a posição na tela.
     ⚠ CADA ANO COM O DIVISOR DELE — TELA-03a: o hectare do JSON de cada ano; usar o do ano corrente
     compararia 2024 com a área de 2026. */
  const anos = [...e.anos].slice(0, Math.max(1, ref)).reverse();
  const colunasAno = anos.map((a, i): ColunaPec => ({
    chave: `__ano${anos.length - i}__`, nome: rotuloCurtoPeriodo(a.de, a.ate), sub: '', fazendaId: null,
    linhas: a.carregando ? null : (a.dre?.total ?? real.total), total: false, tipo: 'valor',
    unidade: 'ha', de: a.de, ate: a.ate, cenario: 'realizado', meses: a.dre?.periodo.meses ?? meses,
    atual: false, comparacao: true,
    /* ⚠ ANO SEM DADO É COLUNA DE "—", não coluna escondida: sumir faria "2023" parecer igual a
       "nunca houve 2023". Sem fazenda na resposta = nem fechamento nem lançamento naquele ano. */
    semDado: !a.carregando && (!a.dre || a.dre.fazendas.length === 0),
  }));
  const atual: ColunaPec = { ...totalReal, nome: rotuloCurtoPeriodo(de, ate), sub: '' };

  /* ⚠ O Δ SÓ EXISTE COM UMA REFERÊNCIA SÓ — fix4. Com dois ou mais anos na tela, "a diferença" não
     tem sujeito: seriam N colunas de Δ, uma por ano, e foi assim que o Δ passou a nascer no MEIO da
     grade. Os chips ficam desabilitados lá, e a tela diz por quê. */
  if (ref > 1 || deltas.length === 0) return [...colunasAno, atual];
  const anterior = colunasAno[0];
  return [anterior, atual, {
    ...totalReal, chave: '__delta__', nome: '', sub: '',
    total: false, tipo: 'delta', unidade: 'pct',
    ref: anterior.semDado ? null : anterior.linhas, deltaSlots: deltas, comparacao: true,
    /* ⚠ E AQUI NÃO: os dois lados são realizado, o patrimônio existe nos dois e o Δ é uma
       subtração comum. Ver `refSemPatrimonio` em `drePecRegua.ts`. */
  }];
}

/** O valor de uma linha numa coluna — ou o delta, se a coluna é o delta. */
function valorNaColuna(col: ColunaPec, chave: ChaveLinhaPec): number | null {
  if (!col.linhas || col.semDado) return null;
  if (col.tipo === 'delta') {
    /* ⚠ `SEM_META` SÓ VALE CONTRA A META — fix7 item C. Contra o ano anterior os dois lados são
       realizado, e a variação de rebanho é subtraível como qualquer outra linha. */
    if ((col.refSemPatrimonio && SEM_META.has(chave)) || !col.ref) return null;
    const r = valorDe(col.linhas, chave);
    const m = valorDe(col.ref, chave);
    return r == null || m == null ? null : r - m;
  }
  if (col.semPatrimonio && SEM_META.has(chave)) return null;
  return valorDe(col.linhas, chave);
}

/**
 * O VALOR DE UMA LINHA — com a composição do modo Resumido, quando houver.
 *
 * ⚠ SOMA DE NÚMEROS JÁ LIDOS, não conta nova: as parcelas são chaves que a RPC devolveu, e o
 * resultado é o que o Detalhado mostra em duas linhas. Se qualquer parcela for ausente, o todo é
 * ausente — somar tratando `null` como zero afirmaria um total que não se sabe.
 */
function valorDaLinha(col: ColunaPec, def: DefPec): number | null {
  if (!def.compor) return valorNaColuna(col, def.chave);
  const parcelas = [
    ...def.compor.mais.map(k => ({ k, sinal: 1 })),
    ...(def.compor.menos ?? []).map(k => ({ k, sinal: -1 })),
  ];
  let total = 0;
  for (const p of parcelas) {
    const v = valorNaColuna(col, p.k);
    if (v == null) return null;
    total += v * p.sinal;
  }
  return total;
}

/**
 * O PERCENTUAL DO DELTA — delta ÷ |meta|. ⚠ Meta zero dá traço (não há do que ser percentual).
 * ⚠ O MÓDULO NO DENOMINADOR: com meta negativa (um resultado planejado de prejuízo), dividir pelo
 * valor com sinal inverteria o sentido — melhorar sobre a meta apareceria como percentual negativo.
 */
const pctDelta = (delta: number | null, meta: number | null): string =>
  (delta == null || meta == null || meta === 0 ? traco : `${formatNum((delta / Math.abs(meta)) * 100, 1)} %`);

/**
 * A COR DO DELTA É O SINAL DO NÚMERO, NÃO JUÍZO — mas o sinal de "bom" depende da linha: em receita
 * e resultado, acima da meta é verde; em custo, gastar MENOS que a meta é verde.
 */
/**
 * ⚠ O Δ SE PINTA EM TOM APAGADO (70%) — DRE-CASCATA-03b/adendo: ele é apoio, e no mesmo verde do
 * número da tela as duas colunas disputariam a mesma atenção. A regra do SINAL não muda: custo que
 * sobe é vermelho, receita que sobe é verde.
 */
const corDoDelta = (def: DefPec, v: number | null): string => {
  if (v == null || v === 0) return '';
  const bom = def.tom === 'custo' ? v < 0 : v > 0;
  return bom ? VERDE_70 : VERMELHO_70;
};

/**
 * O TÍTULO DA COLUNA DE RÓTULOS — DRE-PADRAO-01a-2, decisão do Gabriel.
 *
 * ⚠ "FAZENDA" SÓ ERA VERDADE NUMA DAS QUATRO VISÕES. Nas outras, a coluna lista cenários (Realizado
 * e Meta), períodos (2026, 2025, 2024) ou uma linha só de consolidado — chamar tudo de "Fazenda"
 * fazia o cabeçalho descrever a exceção. O nome sai das colunas que a visão montou, não de um
 * estado à parte: é o mesmo dado que desenha a grade.
 */
function tituloDaPrimeiraColuna(colunas: readonly ColunaPec[]): string {
  if (colunas.some(c => c.chave === '__meta__')) return 'Cenário';
  if (colunas.some(c => c.fazendaId !== null)) return 'Fazenda';
  /* ⚠ 'Período' É O PADRÃO DA COMPARAÇÃO desde o fix4: a grade se corta por período em toda
     referência que não seja a meta, mesmo quando só o período da tela está na tela. O 'Global' que
     havia aqui nomeava um card que não existe mais. */
  return 'Período';
}

/** As larguras de cada coluna — fixas por TIPO, nunca pelo dado. */
const larguraRs = (c: ColunaPec) => (c.total ? W_RS_TOTAL : W_RS);
const larguraUn = (c: ColunaPec) => (c.total ? W_HA : W_SUB);

/**
 * AS CÉLULAS DE UMA COLUNA — DRE-UNIDADES-01.
 *
 * ⚠ CADA CHIP MARCADO É UMA CÉLULA, na ordem fixa de `UNIDADES_PEC`, e o R$ é um chip como os
 * outros: desmarcá-lo deixa a coluna só com as unidades. O delta não entra nessa conta — ele é
 * "Δ R$ + Δ %" e sempre foi.
 */
type SlotPec = UnidadePec | 'pct';
const slotsDaColuna = (c: ColunaPec, unidades: readonly UnidadePec[]): readonly SlotPec[] =>
  (c.tipo === 'delta' ? (c.deltaSlots ?? ['rs', 'pct']) : c.unidade === null ? ['rs'] : unidades);
/* ⚠ A COLUNA DE Δ TEM LARGURA PRÓPRIA: ela carrega "▲ 12,3 %" ou um valor abreviado, nunca os
   milhões de uma coluna de R$ — mas a premissa de que ela é sempre menor ESTAVA ERRADA. Medido no
   fix6: o Δ do Lucro líquido é "-13.899.298,16", 71,4px numa caixa de 64, e o Δ é a diferença de
   dois números grandes — ele pode ser MAIOR que qualquer um deles. Os 78 vêm de 94, e é a única
   coluna que não reserva o slot do marcador: o Δ nunca o teve (`marcadorDoTotal` só decide sobre
   uma coluna de valor), e reservá-lo ali custaria 10px em toda linha para nada. */
const W_DELTA_RS = 94;
const W_DELTA_PCT = 70;
const W_REFERENCIA = 98;
const larguraSlot = (s: SlotPec, c: ColunaPec) => {
  if (c.tipo === 'delta') return s === 'pct' ? W_DELTA_PCT : W_DELTA_RS;
  if (c.comparacao) return s === 'rs' ? W_REFERENCIA : larguraUn(c);
  return s === 'rs' ? larguraRs(c) : larguraUn(c);
};
const rotuloSlot = (s: SlotPec, c: ColunaPec) =>
  (s === 'pct' ? 'Δ %' : s === 'rs' ? (c.tipo === 'delta' ? 'Δ R$' : 'R$') : ROTULO_UNIDADE[s]);

/**
 * A COLUNA META SE MARCA PELA FORMA, NÃO PELA COR — fix5, decisão do Gabriel de 23/09.
 *
 * ⚠ TRACEJADO PORQUE COR NENHUMA SOBREVIVE ÀS QUATRO FAIXAS. O contorno atravessa sete fundos (o
 * cabeçalho `#3a4864`, a linha branca, o `bg-muted` e as faixas t1..t4), e a medição da FASE 0
 * mostrou que nenhum laranja passa dos 3:1 em todos: o t3 (`#b6cade`) apaga os tons claros e o
 * cabeçalho e o t4 apagam os escuros. O `--meta` fica em 3,78 sobre branco e 2,25 sobre o t3 —
 * é o traço que o olho pega ali, não o contraste.
 * ⚠ E A COR É A DA CASA: `--meta` é o token do A11 (`docs/PADROES-UI.md:182-193`), laranja escuro
 * com nome semântico. Não se abre uma quarta convenção de Meta neste PR.
 */
const BORDA_META = '2px dashed hsl(var(--meta))';
/**
 * ⚠ A RESERVA É O QUE SEGURA A LEI DA ESTABILIDADE. As laterais não precisam dela — com
 * `table-layout: fixed` a largura vem do `<colgroup>` e a borda é desenhada PARA DENTRO, então 1px
 * de divisória e 2px de tracejado ocupam a mesma coluna. As horizontais precisam: um `borderTop` de
 * 2px numa tabela `border-collapse` cresce a altura, e ela sumiria ao trocar [Meta] por [1]. Por
 * isso a primeira coluna reserva topo e base TRANSPARENTES em toda referência, e só a cor muda.
 */
const BORDA_RESERVA = '2px dashed transparent';
const ehMeta = (c: ColunaPec) => c.chave === '__meta__';

/**
 * O QUE O P0 DA ESTREIA É — VPB-INICIO-01, e a frase diz as três coisas que o operador precisa para
 * refazer a conta: de onde veio a quantidade, de onde veio o preço e o que foi simplificado.
 */
const TITULO_INICIO_CADASTRO = 'Início sem fechamento anterior: o estoque de partida é o rebanho '
  + 'cadastrado no primeiro mês; preço do primeiro fechamento.';
const TITULO_INICIO_ZERO = 'Início sem gado: o período começa com estoque zero.';
const TITULO_FIM_ZERO = 'Fim sem gado: o período termina com estoque zero.';

/**
 * As bordas de uma célula da coluna Meta — laterais na primeira e na última sub-coluna, topo e base
 * nas pontas da grade. `base` só é verdadeiro na ÚLTIMA linha renderizada — quem a escolhe é o
 * objeto `base` montado no `tbody`.
 */
const bordaDaMeta = (col: ColunaPec, i: number, n: number,
  pontas?: { topo?: boolean; base?: boolean }): CSSProperties => {
  const meta = ehMeta(col);
  /* ⚠ A PONTA SÓ EXISTE ONDE O CHAMADOR DIZ QUE EXISTE: `topo` só é declarado no cabeçalho e `base`
     só na última linha. Declarada, ela vira tracejado na Meta e reserva transparente em toda outra
     referência — é a igualdade entre os estados que a lei da estabilidade cobra.
     ⚠ E A PONTA VALE PARA TODA SUB-COLUNA, não só a primeira: com os chips R$ e R$/ha marcados a
     Meta ocupa duas células por linha, e fechar só a de R$ deixava a base tracejada na metade
     esquerda da coluna — medido no preview antes de existir este parágrafo. */
  const ponta = (v: boolean | undefined) =>
    (v === undefined ? undefined : v && meta ? BORDA_META : BORDA_RESERVA);
  const topo = ponta(pontas?.topo);
  const base = ponta(pontas?.base);
  return {
    ...(topo ? { borderTop: topo } : {}),
    ...(base ? { borderBottom: base } : {}),
    ...(meta && i === 0 ? { borderLeft: BORDA_META } : {}),
    ...(meta && i === n - 1 ? { borderRight: BORDA_META } : {}),
  };
};

/**
 * A PALAVRA "META" EM LARANJA CLARO — fix5, item B.
 *
 * ⚠ CLARO, E NÃO O `--meta`: estes rótulos são brancos sobre `CINZA_CABECALHO` (`#3a4864`), e ali o
 * `--meta` dá 2,42:1 — abaixo de qualquer piso para texto de 10px. O `amber-400` dá 5,49:1 sobre o
 * mesmo fundo. O token não tem variante clara (`--meta-foreground` é branco, a cor de texto SOBRE o
 * laranja, não um laranja claro), por isso a classe é literal — e literal ESTÁTICA, que é o que o
 * Tailwind consegue emitir.
 * ⚠ SÓ A PALAVRA: "real − meta" fica branco com "meta" em âmbar, como o pedido diz.
 */
const MetaRealcada = ({ texto }: { texto: string }) => (
  <>
    {texto.split(/(meta)/i).map((p, i) => (/^meta$/i.test(p)
      ? <span key={i} className="text-amber-400">{p}</span>
      : <Fragment key={i}>{p}</Fragment>))}
  </>
);

/**
 * CONGELA-SE A PRIMEIRA COLUNA, NÃO "A DO TOTAL" — DRE-PERIODO-01.
 *
 * ⚠ ATÉ AQUI OS DOIS ERAM A MESMA COISA: o Total abria a grade em todas as visões, e `c.total`
 * respondia por duas perguntas ao mesmo tempo — "é a coluna de referência?" (navy, fundo, borda) e
 * "ela gruda à esquerda?". Com a x Anos em ordem cronológica o período da tela passou a ser a
 * ÚLTIMA coluna, e grudar a última à esquerda a faria cobrir as primeiras ao rolar.
 * ⚠ O DESTAQUE CONTINUA SENDO DO TOTAL, onde quer que ele esteja; o congelamento passa a ser da
 * POSIÇÃO. São duas perguntas diferentes, e agora têm duas respostas.
 */
const congelada = (col: ColunaPec, colunas: readonly ColunaPec[]) => col.total && colunas[0] === col;

/**
 * AS LARGURAS DE UMA COLUNA JÁ COM O PISO DO GRUPO — DRE-UNIDADES-01b.
 *
 * ⚠ É FUNÇÃO PURA DE (coluna, chips) DE PROPÓSITO, e não um valor calculado no topo e passado
 * para baixo: as três linhas da grade (a comum, a de %, a da filha) precisam da MESMA conta para
 * congelar o Total no lugar certo, e três componentes recebendo um número por prop é três lugares
 * onde ele pode chegar velho. Aqui todos chamam a mesma função com o que já têm em mãos.
 */
const largurasDaColuna = (c: ColunaPec, unidades: readonly UnidadePec[]): number[] =>
  larguraDoGrupo(slotsDaColuna(c, unidades).map(sl => larguraSlot(sl, c)));

/**
 * As duas células congeladas do Total, na régua da linha.
 *
 * ⚠ O SEGUNDO `left` NÃO É MAIS `W_RS_TOTAL`: com o piso de grupo, a primeira célula do Total
 * mede 160 quando há um chip só e 80 quando há duas unidades de 64 — o offset tem de ser a
 * largura que o `<colgroup>` deu àquela célula, senão a segunda coluna congelada cobre a
 * primeira (ou deixa uma fresta) exatamente na coluna que se veio conferir.
 */
const estiloTotalRs = { position: 'sticky' as const, left: W_FAZENDA, zIndex: 20 };
const estiloTotalCab = (c: ColunaPec, unidades: readonly UnidadePec[]) =>
  ({ position: 'sticky' as const, left: W_FAZENDA + largurasDaColuna(c, unidades)[0], zIndex: 20 });

/**
 * O ÍCONE DO HISTÓRICO — DRE-HISTORICO-LINHA-01a.
 *
 * ⚠ ELE FICA NA FRENTE DO NOME, ANTES DA SETA, e ocupa lugar em TODA linha: com o espaço
 * reservado, abrir um grupo não faz os nomes das filhas andarem para o lado. Uma grade que se
 * desalinha ao expandir obriga o olho a reencontrar a coluna a cada clique.
 * ⚠ E ELE NÃO ROUBA O CLIQUE DA SETA: a seta abre as filhas, o nome abre o rateio onde há, e o
 * ícone abre o histórico. Três gestos, três alvos — `stopPropagation` garante que o clique no
 * ícone não alterna o grupo por baixo.
 */
/**
 * A COLUNA DO ÍCONE — 14px na borda esquerda da célula de rótulo (adendo do 03b-fix1, item 6).
 *
 * ⚠ TODA LINHA A RESERVA, tenha ícone ou não: a filha, o "% do VBP" e o "Lucro por hectare" não
 * abrem histórico, e sem a reserva o nome deles começaria 14px à esquerda do nome das outras — três
 * réguas diferentes na mesma coluna. Os 7px de antes continuam sendo o padding da célula; o que
 * mudou é que o recuo da hierarquia passou a valer depois do ícone, não antes.
 */
const RECUO_ICONE = 7;
const L_ICONE = 14;

function BotaoHistorico({ onAbrir }: { onAbrir?: () => void }) {
  return (
    <button type="button" title="Ver histórico" aria-label="Ver histórico"
      aria-hidden={!onAbrir} tabIndex={onAbrir ? undefined : -1}
      onClick={onAbrir ? e => { e.stopPropagation(); onAbrir(); } : undefined}
      /* ⚠ O GLIFO DESCEU A 10px E A CAIXA FICOU EM 12 — homologação de 22/09, item 8.
         ⚠ E A CAIXA VIROU UMA COLUNA DE 14px NA BORDA ESQUERDA — 03b-fix1/adendo item 6. Antes o
         ícone vinha DEPOIS do recuo da linha, então ele andava com o nome: 7px no subtotal, 15 no
         grupo, 23 na filha. A coluna de ícones ficava serrilhada justamente onde o olho desce
         procurando o próximo histórico. Agora o recuo é do CONTEÚDO (ver `RECUO`), e o ícone tem x
         fixo; 12 + os 2 do `mr-0.5` de antes dão os mesmos 14, então o nome do subtotal não se
         moveu um pixel. */
      className={cn('inline-block w-[14px] text-center align-[-2px] text-muted-foreground hover:text-primary',
        !onAbrir && 'invisible')}>
      <BarChart3 className="inline h-2.5 w-2.5" />
    </button>
  );
}

/** A célula que ainda não chegou: um traço pulsando, só nela — a grade não espera. */
function CelulaCarregando({ total, fundo, estilo }: { total?: boolean; fundo?: string; estilo?: CSSProperties }) {
  return (
    <td className={cn('px-[7px] py-px', fundo)}
      style={{ ...(total ? { backgroundColor: FUNDO_TOTAL } : {}), ...estilo }}>
      <div className="ml-auto h-[8px] w-3/4 animate-pulse rounded bg-muted-foreground/20" />
    </td>
  );
}



export function PecDrePanel({ colunas: colunasCruas, alturaCartao, cartaoRef,
  unidades = ['rs', 'ha'], modo = 'detalhado', abertos, onAbertos,
  onAbrirLista, onAbrirDidatico, onAbrirRateio, onAbrirHistorico }: {
  colunas: readonly ColunaPec[];
  /** ⚠ AS UNIDADES MARCADAS, na ordem de `UNIDADES_PEC`. O padrão é o que a tela abre: R$ e R$/ha. */
  unidades?: readonly UnidadePec[];
  alturaCartao: number | null;
  cartaoRef: React.RefObject<HTMLDivElement>;
  onAbrirLista?: (r: RecortePec) => void;
  onAbrirDidatico?: (fazendaId: string | null, fazendaNome: string, qual: 'vpb' | 'efeito') => void;
  onAbrirRateio?: () => void;
  /** ⚠ A GRADE NÃO MONTA O MODAL: ela avisa QUAL linha, e quem lê os cinco anos é a página. */
  onAbrirHistorico?: (r: RecorteHistoricoPec) => void;
  /**
   * RESUMIDO OU DETALHADO — DRE-CASCATA-03b.
   *
   * ⚠ SÃO DUAS PERGUNTAS: "como fechou o período" (quinze linhas, cabe na tela) e "onde o dinheiro
   * entrou e saiu" (as dezenove de sempre).
   * ⚠ O PADRÃO AQUI É `detalhado`, E QUEM ABRE EM RESUMIDO É A TELA. A grade não tem opinião sobre
   * com qual pergunta o operador começa — ela desenha a lista que lhe derem. Fosse o contrário,
   * montar `<PecDrePanel>` num teste traria um modo escolhido por outra camada.
   */
  modo?: ModoDre;
  /**
   * QUAIS GRUPOS ESTÃO ABERTOS — agora de fora, DRE-CASCATA-03b.
   *
   * ⚠ ELE SUBIU PARA A PÁGINA porque o "abrir tudo" mora na linha dos chips, que é dela: com o
   * estado aqui dentro, o botão lá fora não teria o que alternar. Sem as props, a grade continua
   * guardando o seu — é o que mantém os testes montando `<PecDrePanel>` sozinho.
   */
  abertos?: Record<string, boolean>;
  onAbertos?: (f: (a: Record<string, boolean>) => Record<string, boolean>) => void;
}) {
  const colunas = colunasCruas;
  const larguras = useMemo(() => {
    const cols: number[] = [W_FAZENDA];
    colunas.forEach(c => largurasDaColuna(c, unidades).forEach(w => cols.push(w)));
    return cols;
  }, [colunas, unidades]);
  const larguraMin = larguras.reduce((a, b) => a + b, 0);
  /* ⚠ A LINHA DOS SUBTÍTULOS É CONDICIONAL — item 9. Ela some quando NENHUMA coluna tem o que
     dizer, e o cabeçalho passa de 40px para 28: 26+14 vira 14+14. O `top` da segunda linha
     acompanha, senão o `sticky` dela grudaria 12px abaixo de onde ela está. */
  const temSub = colunas.some(c => !!c.sub);
  const ALTURA_NOME = temSub ? 26 : 14;
  const primeira = colunas[0];
  /* ⚠ O REALCE É DA REFERÊNCIA, NÃO DA COLUNA: quem cita a meta é o cabeçalho dela E o "real − meta"
     do Δ, que é outra coluna. Por isso a pergunta é feita à grade inteira, uma vez. */
  const temMeta = colunas.some(ehMeta);

  /** Quais grupos estão abertos. Fechados por padrão (§4) — e o estado pode vir de fora. */
  const [abertosLocal, setAbertosLocal] = useState<Record<string, boolean>>({});
  const expandidos = abertos ?? abertosLocal;
  const alternar = (c: ChaveLinhaPec) => {
    const f = (a: Record<string, boolean>) => ({ ...a, [c]: !a[c] });
    if (onAbertos) onAbertos(f); else setAbertosLocal(f);
  };

  return (
    /* ⚠ A ROLAGEM HORIZONTAL É DESTE CARTÃO, NUNCA DA PÁGINA (§2b). `min-w-0` é o que garante
       isso: sem ele, um filho de largura intrínseca grande EMPURRA o contêiner flex/grid pai, a
       página inteira ganha barra lateral e, ao rolar, o cabeçalho da tela e a faixa de caixas
       saem de vista. `overflow-auto` sozinho não basta — ele só age depois que o pai aceita
       encolher. */
    <div ref={cartaoRef}
      className="min-w-0 max-w-full overflow-auto rounded-lg border border-border/60 bg-card"
      style={alturaCartao ? { maxHeight: alturaCartao } : undefined}>
      {/* ⚠ A MESMA RÉGUA DA LAVOURA: `leading-none`, px fixos e largura igual à soma das colunas.
          Ver a nota no `AgriDreLavouraTab` — foi ela que fez as alturas declaradas valerem. */}
      <table className="border-collapse text-[11px] leading-none"
        style={{ tableLayout: 'fixed', width: larguraMin }}>
        <colgroup>{larguras.map((w, i) => <col key={i} style={{ width: w }} />)}</colgroup>

        <thead>
          <tr style={{ height: temSub ? 26 : 14 }}>
            <th rowSpan={2}
              className={cn(CINZA_CABECALHO, 'sticky left-0 top-0 z-40 px-[7px] text-left',
                'text-[10px] font-medium text-white')}>
              {tituloDaPrimeiraColuna(colunas)}
            </th>
            {/* ⚠ O TOTAL GRUDA À ESQUERDA QUANDO É A PRIMEIRA COLUNA, colado na de rótulos: ele é a
                referência contra a qual cada coluna se lê, e rolar para comparar obrigaria a
                decorá-lo. Na x Anos, em ordem cronológica, ele é a ÚLTIMA — ali o destaque fica e o
                congelamento sai (ver `congelada`). */}
            {colunas.map(c => (
              <th key={c.chave} colSpan={slotsDaColuna(c, unidades).length}
                className={cn(!c.total && CINZA_CABECALHO, 'sticky top-0 px-[7px] text-center align-middle text-white',
                  c.total ? 'z-40' : 'z-20')}
                style={c.total
                  ? { ...(congelada(c, colunas) ? { left: W_FAZENDA } : {}),
                      backgroundColor: NAVY_TOTAL, borderLeft: BORDA_TOTAL_CAB }
                  : { borderLeft: '1px solid rgba(255,255,255,.22)',
                      /* ⚠ O `colSpan` JÁ COBRE A COLUNA INTEIRA: aqui o topo do contorno fecha de
                         uma vez, e por isso a chamada é (0, 1) — uma célula só. */
                      ...bordaDaMeta(c, 0, 1, { topo: true }) }}>
                <div className="truncate text-[10px] font-medium leading-[12px]" title={c.nome}>
                  {temMeta ? <MetaRealcada texto={c.nome} /> : c.nome}
                </div>
                {temSub && (
                  <div className="truncate whitespace-nowrap text-[10px] font-normal leading-[12px] text-white"
                    title={c.subLongo || c.sub || undefined}>
                    {c.sub ? (temMeta ? <MetaRealcada texto={c.sub} /> : c.sub) : '\u00a0'}
                  </div>
                )}
              </th>
            ))}
          </tr>
          <tr style={{ height: 14 }}>
            {colunas.map(c => (
              <Fragment key={c.chave}>
                {slotsDaColuna(c, unidades).map((sl, i) => (
                  /* ⚠ O `title` DIZ O DIVISOR, e é ele que torna a sub-coluna auditável: sem o
                     denominador à mão, o operador não tem como refazer a conta (Art. 19). O R$/@
                     avisa ali que muda de base por linha e que a coluna NÃO SOMA.
                     ⚠ SÓ AS DUAS PRIMEIRAS CÉLULAS DO TOTAL CONGELAM, como antes: congelar as
                     quatro comeria 288px da largura visível, e a coluna Total viraria a tela. */
                  <th key={sl}
                    className={cn(!c.total && CINZA_CABECALHO, 'sticky px-[7px] text-right text-[10px] font-normal text-white',
                      c.total ? 'z-40' : 'z-20')}
                    title={sl === 'ha' ? tituloHa(c) : sl === 'arroba' ? TITULO_ARROBA : sl === 'cab' ? TITULO_CAB : undefined}
                    style={c.total
                      ? { top: ALTURA_NOME, backgroundColor: NAVY_TOTAL,
                          ...(i === 0 ? { borderLeft: BORDA_TOTAL_CAB } : {}),
                          ...(congelada(c, colunas)
                            ? (i === 0 ? { left: W_FAZENDA }
                              : i === 1 ? { left: W_FAZENDA + largurasDaColuna(c, unidades)[0] } : {})
                            : {}) }
                      : { top: ALTURA_NOME, ...(i === 0 ? { borderLeft: '1px solid rgba(255,255,255,.22)' } : {}),
                          ...bordaDaMeta(c, i, slotsDaColuna(c, unidades).length) }}>
                    {rotuloSlot(sl, c)}
                  </th>
                ))}
              </Fragment>
            ))}
          </tr>
        </thead>

        <tbody>
          {LINHAS_DO_MODO(modo).map((def, iDef, defs) => {
            const bloco = BLOCO_DA_LINHA[def.chave];
            const aberto = !!expandidos[def.chave];
            /* ⚠ AS FILHAS SÃO A UNIÃO DAS COLUNAS DE TOTAL, e é ela que manda: um centro que só
               existe numa fazenda (ou só na meta, ou só em 2024) tem de aparecer para todas, senão a
               linha some conforme a coluna que se olha. As colunas de fazenda não entram na união:
               o Total delas já é a união por construção — a RPC o monta agrupando `finc` inteiro.
               ⚠ OS JUROS TÊM LISTA PRÓPRIA (`centros_juros`, DRE-PEC-RPC-02). Hoje a linha de juros
               não expande (§4); a leitura fica certa para o dia em que expandir. */
            const centros: CentroPec[] = [];
            if (def.expande && bloco) {
              const vistos = new Set<string>();
              colunas.forEach(c => {
                if (c.fazendaId !== null || c.tipo !== 'valor' || !c.linhas || c.semDado) return;
                centrosDoBloco(c.linhas, bloco).forEach(x => {
                  if (!vistos.has(x.centro)) { vistos.add(x.centro); centros.push(x); }
                });
              });
              /* ⚠ NO RESUMIDO O RATEIO ADMINISTRATIVO É A ÚLTIMA FILHA DO CUSTO FIXO — DRE-CASCATA-03b.
                 Ele não é um centro de custo: é uma parcela estimada que a linha composta já soma,
                 e escondê-la faria o total do custo fixo não bater com a soma das filhas visíveis. */
              if (def.compor?.mais.includes('rateio_adm')) {
                centros.push({ bloco: 'rateio_adm', centro: 'Rateio administrativo', valor: 0, a_pagar: 0 });
              }
            }
            /* ⚠ QUEM FECHA A GRADE NÃO É SEMPRE A ÚLTIMA `def` — é a última linha RENDERIZADA dela, e
               a ordem de render manda: filhas > Lucro por hectare > % do VBP > a própria linha. No
               `lucro_liquido`, que hoje encerra os dois modos, a base pula para o "Lucro por hectare"
               quando o chip R$/ha está desmarcado, porque é ele que aparece embaixo. */
            const ultima = iDef === defs.length - 1;
            const comPercentual = COM_PERCENTUAL.has(def.chave);
            const comPorHectare = COM_POR_HECTARE.has(def.chave) && !unidades.includes('ha');
            const comFilhas = aberto && centros.length > 0;
            const base = {
              filha: ultima && comFilhas,
              porHectare: ultima && !comFilhas && comPorHectare,
              percentual: ultima && !comFilhas && !comPorHectare && comPercentual,
              linha: ultima && !comFilhas && !comPorHectare && !comPercentual,
            };
            return (
              <Fragment key={def.chave}>
                <LinhaPec def={def} colunas={colunas} centros={centros} unidades={unidades}
                  aberto={aberto} onAlternar={() => alternar(def.chave)} base={base.linha}
                  onAbrirLista={onAbrirLista} onAbrirDidatico={onAbrirDidatico}
                  onAbrirRateio={onAbrirRateio} onAbrirHistorico={onAbrirHistorico} />

                {/* ⚠ A LINHA DE % VEM LOGO ABAIXO e é leitura de apoio: 9px, muted, sem recuo,
                    altura 14. Ela não é uma linha do DRE — é a mesma linha vista noutra unidade,
                    e por isso não ganha nem cor de sinal nem clique. */}
                {comPercentual && (
                  <LinhaPercentual def={def} colunas={colunas} unidades={unidades} base={base.percentual} />
                )}

                {/* ⚠ O LUCRO POR HECTARE É LEITURA DE APOIO, como o % do VBP: mesma régua (9px,
                    muted, altura 14), sem cor de sinal e sem clique. Ele some quando o chip R$/ha
                    está marcado — ali a sub-coluna já responde, e repetir a mesma conta duas vezes
                    na mesma linha é ruído. */}
                {comPorHectare && (
                  <LinhaPorHectare def={def} colunas={colunas} unidades={unidades} base={base.porHectare} />
                )}

                {/* As filhas: um centro por linha, na régua `filha` (9px/14px, recuo 16). */}
                {aberto && centros.map((c, iC) => (
                  <LinhaCentro key={`${def.chave}-${c.centro}`} def={def} centro={c} unidades={unidades}
                    colunas={colunas} bloco={bloco ?? ''} onAbrirLista={onAbrirLista}
                    base={base.filha && iC === centros.length - 1} />
                ))}
              </Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function LinhaPec({ def, colunas, centros, aberto, unidades, base, onAlternar, onAbrirLista, onAbrirDidatico, onAbrirRateio, onAbrirHistorico }: {
  def: DefPec;
  colunas: readonly ColunaPec[];
  centros: readonly CentroPec[];
  aberto: boolean;
  unidades: readonly UnidadePec[];
  /** ⚠ A ÚLTIMA LINHA DA GRADE FECHA O CONTORNO DA META embaixo — ver `bordaDaMeta`. */
  base?: boolean;
  onAlternar: () => void;
  onAbrirLista?: (r: RecortePec) => void;
  onAbrirDidatico?: (fazendaId: string | null, fazendaNome: string, qual: 'vpb' | 'efeito') => void;
  onAbrirRateio?: () => void;
  onAbrirHistorico?: (r: RecorteHistoricoPec) => void;
}) {
  /* ⚠ A FAIXA MANDA NO FUNDO; A COR, NÃO — e este parágrafo já disse o contrário (03b). A regra
     antiga era "num total o destaque é a faixa, e pintar o número de verde ou vermelho por cima
     dela seria dois sinais para a mesma coisa". A homologação mostrou o custo: o `= Resultado com
     mercado` de −1,4 milhão do Agnaldo 22/23 saía na mesma cor de um resultado positivo, e a faixa
     — que marca a IMPORTÂNCIA da linha, não o sinal dela — é igual nos dois casos. Deu e não deu
     passaram a ter a mesma cara justamente na linha que existe para responder isso.
     A cor do sinal agora vale em TODA faixa; é `corDoTotal` que a escolhe, porque no azul cheio ela
     precisa de um tom claro para se ler. */
  const daFaixa = def.faixa ? FAIXA_TOTAL[def.faixa] : null;
  const fundo = daFaixa ? daFaixa.fundo : fundoDaLinha(def.destaque);
  const corLinha = daFaixa ? (daFaixa.texto ?? '') : corDoTom(def.tom);
  const bloco = BLOCO_DA_LINHA[def.chave];
  const temFilhas = def.expande && centros.length > 0;
  /* ⚠ O RATEADO DA PRIMEIRA COLUNA manda no selo: é ela que a linha de rótulo descreve (o Total
     nas visões globais, a fazenda na visão por fazenda), e é dela que sai o número do `title`. */
  const jurosRateados = colunas[0]?.linhas?.juros_rateado ?? 0;
  /* ⚠ A MESMA RÉGUA DA LAVOURA (PR-10): o papel de grupo entra quando a linha expande, e é ela
     que traz o peso 500 sem mudar o tamanho. O mapa é um só de propósito: o dia em que o subtotal
     mudar de tamanho, ele muda nas duas telas. */
  const regua = REGUA_LINHA[tipoDaLinha(def.destaque, temFilhas)];
  /* ⚠ O RÓTULO DO RATEIO ABRE O MODAL (DRE-PEC-TELA-02b): a frase que explicava o rateio acima da
     grade saiu, e o selo "estimado" é a porta para a explicação — pool, critério e a fatia da
     pecuária. Só quando a primeira coluna é o realizado do período da tela, o único que o modal lê. */
  const abrirRateioDoRotulo = def.rateio && onAbrirRateio && colunas[0]?.atual ? onAbrirRateio : undefined;
  /* ⚠ SÓ NAS DUAS LINHAS QUE O P0 PRODUZ: o selo explica de onde saiu a variação de patrimônio, e
     pendurá-lo numa linha de venda ou de custo diria que o rebanho de partida a influenciou. */
  const daVariacaoNaLinha = def.chave === 'vpb_operacional' || def.chave === 'efeito_mercado';
  /* ⚠ O SELO DIZ QUE A PONTA NÃO VEIO DE FECHAMENTO — VPB-REGRA-UNICA-01, e isso é INFORMAÇÃO, não
     aviso de falta: o número existe e está certo. "início" quando o P0 é cadastro ou zero; "fim"
     quando o P1 é zero. */
  const fonteP0 = !daVariacaoNaLinha ? null
    : colunas.find(c => c.tipo === 'valor' && !c.semDado
        && (c.linhas?.p0_fonte === 'cadastro' || c.linhas?.p0_fonte === 'zero'))?.linhas?.p0_fonte ?? null;
  const inicioNaLinha = fonteP0 !== null;
  /* ⚠ A PONTA FINAL NÃO DISPUTA COM A INICIAL: com as duas fora do fechamento, quem manda é a de
     início — é ela que explica de onde a variação partiu. */
  const fimNaLinha = daVariacaoNaLinha && !inicioNaLinha
    && colunas.some(c => c.tipo === 'valor' && !c.semDado && c.linhas?.p1_fonte === 'zero');
  /* ⚠ O MARCADOR É DO VALOR, NÃO DO Δ (item 13): a diferença tem sinal próprio e uma seta ali diria
     "lucro" onde se lê "variação". Fora do azul cheio ele não existe — lá o número já é colorido. */
  const marcador = (col: ColunaPec, v: number | null) =>
    (def.faixa && col.tipo !== 'delta' ? marcadorDoTotal(def.faixa, v) : undefined);

  /**
   * O QUE ACONTECE AO CLICAR NUMA CÉLULA — §5.
   *
   * ⚠ TRÊS DESTINOS, E O DA LINHA DECIDE: as duas variações de patrimônio abrem o modal didático
   * (não há lançamento por trás delas — são fechamentos de rebanho); o rateio administrativo abre
   * o modal do pool (o valor é rateado, não lançado nesta fazenda); o resto abre a lista.
   * ⚠ LINHA DE SOMA NÃO ABRE NADA. `= Receita bruta`, `= VBP`, `= Margem` e os resultados não têm
   * lançamento próprio: eles são a conta das linhas de cima, e abrir uma lista ali teria de
   * inventar qual dos termos mostrar.
   * ⚠ DELTA NÃO ABRE NADA (é derivado), e os dois modais só abrem no realizado do período da tela
   * (`atual`): eles leem o período da tela, e abri-los na coluna de 2024 mostraria outro ano.
   */
  const abrirDaColuna = (col: ColunaPec) => {
    if (!col.linhas || col.semDado || col.tipo === 'delta') return undefined;
    /* ⚠ JUROS NUMA FAZENDA NÃO ABRE NADA: a RPC não os divide por fazenda, a célula é "—" e uma
       lista ali mostraria os juros que o lançamento carimbou na fazenda — justamente a divisão que
       a RPC deixou de fazer. No Total, abre como sempre (`p_fazenda` nulo traz todos). */
    if (def.chave === 'juros' && col.fazendaId !== null) return undefined;
    if (def.didatico) {
      return col.atual && onAbrirDidatico ? () => onAbrirDidatico(col.fazendaId, col.nome, def.didatico!) : undefined;
    }
    if (def.rateio) return col.atual ? onAbrirRateio : undefined;
    if (!bloco || !onAbrirLista) return undefined;
    return () => onAbrirLista({
      fazendaId: col.fazendaId,
      fazendaNome: col.nome,
      bloco,
      centro: null,
      rotulo: def.rotulo.replace(/^[=(−)\s-]+/, '').trim(),
      de: col.de, ate: col.ate, cenario: col.cenario,
    });
  };

  return (
    <tr className={cn(fundo, regua.peso)} style={{ height: regua.altura }}>
      <td className={cn('sticky left-0 z-30 truncate py-px', fundo,
        'border-r border-border/60', corLinha, (temFilhas || abrirRateioDoRotulo) && 'cursor-pointer')}
        title={def.title ?? (abrirRateioDoRotulo ? 'ver como o rateio foi feito' : def.rotulo)}
        onClick={temFilhas ? onAlternar : abrirRateioDoRotulo}
        style={{ fontSize: regua.fonte, paddingLeft: RECUO_ICONE, paddingRight: 7 }}>
        {/* ⚠ O ESCOPO É O DA PRIMEIRA COLUNA — o Total nas visões globais, a fazenda na visão por
            fazenda. É a mesma coluna que o clique na célula usa para abrir a lista. */}
        <BotaoHistorico onAbrir={onAbrirHistorico && colunas[0]
          ? () => onAbrirHistorico({
            chave: def.chave, centro: null, rotulo: def.rotulo,
            fazendaId: colunas[0].fazendaId, fazendaNome: colunas[0].nome,
          }) : undefined} />
        {/* ⚠ O RECUO DA HIERARQUIA É DAQUI PARA A DIREITA — item 6: ele continua sendo o mesmo de
            `REGUA_LINHA`, só deixou de empurrar o ícone junto. */}
        <span style={{ marginLeft: regua.recuo }}>
          {temFilhas && (
            <ChevronRight className={cn('mr-0.5 inline h-3 w-3 align-[-2px] transition-transform',
              aberto && 'rotate-90')} />
          )}
          {def.rotulo}
          {def.sufixo && (
            <span className="ml-1 font-normal text-muted-foreground" style={{ fontSize: 9 }}>{def.sufixo}</span>
          )}
          {/* ⚠ UM SELO SÓ, E NA ESTREIA ELE É O DA ESTREIA — VPB-INICIO-01, e foi medido: estas duas
              linhas já carregam "estimado", e um segundo selo estoura os 200px da coluna de rótulo
              (192px de texto numa caixa de 186 com "início"; com "início do histórico", muito
              mais). O rótulo sairia cortado — exatamente o que o fix6 acabou de tirar da grade.
              ⚠ NADA SE PERDE: o `title` acumula as duas frases, e é dele que o operador tira a
              conta. É o mesmo remédio do PR-06, quando "inclui rateio compartilhado" virou
              "rateio" e a frase inteira foi para o `title`. */}
          {inicioNaLinha
            ? <Etiqueta texto="início" title={`${def.tituloEtiqueta ? def.tituloEtiqueta + ' ' : ''}${fonteP0 === 'cadastro' ? TITULO_INICIO_CADASTRO : TITULO_INICIO_ZERO}`} />
            : fimNaLinha
              /* ⚠ AQUI A PALAVRA INTEIRA CABE, e foi medido antes de escolher: "encerrada" deixa 14px
                 de folga no pior caso (Detalhado, "Variação por produção") e 24 no Resumido. O
                 selo da estreia teve de encurtar para "início" porque ele CONVIVIA com o
                 "estimado"; este o substitui, e a largura sobra. */
              ? <Etiqueta texto="fim" title={`${def.tituloEtiqueta ? def.tituloEtiqueta + ' ' : ''}${TITULO_FIM_ZERO}`} />
              : def.etiqueta && <Etiqueta texto={def.etiqueta} title={def.tituloEtiqueta} />}
          {/* ⚠ O SELO DOS JUROS É CONDICIONAL AO DADO, não à linha: ele só aparece quando há parcela
              rateada, e o `title` diz quanto e por qual critério. Numa fazenda cujos juros são todos
              próprios, marcar "estimado" seria mentir sobre um número exato. */}
          {def.chave === 'juros' && jurosRateados > 0 && (
            <Etiqueta texto="estimado"
              title={`inclui ${formatNum(jurosRateados, 2)} rateados do Administrativo por cabeça média`} />
          )}
        </span>
      </td>

      {colunas.map(col => {
        const slots = slotsDaColuna(col, unidades);
        /* ⚠ NUMA LINHA DE FAIXA O CINZA DO TOTAL SAI DE CENA: ele é um `backgroundColor` inline e
           cobriria o azul justamente na coluna de referência. `undefined` remove a propriedade —
           o React a omite —, e a classe da faixa, que é opaca, fica valendo. */
        const estiloDoSlot = (i: number): CSSProperties => {
          const fixo = !congelada(col, colunas) ? undefined
            : i === 0 ? estiloTotalRs : i === 1 ? estiloTotalCab(col, unidades) : undefined;
          const sem = daFaixa ? { ...(fixo ?? {}), backgroundColor: undefined } : fixo;
          return { ...(sem ?? {}), ...bordaDaMeta(col, i, slots.length, base ? { base: true } : undefined) };
        };
        if (!col.linhas) {
          return (
            <Fragment key={col.chave}>
              {slots.map((sl, i) => (
                <CelulaCarregando key={sl} total={col.total} fundo={fundo} estilo={estiloDoSlot(i)} />
              ))}
            </Fragment>
          );
        }
        const v = valorDaLinha(col, def);
        /* ⚠ O Δ FICA FORA DISSO, dentro ou fora de faixa: a cor dele já é orientada pelo que a
           linha quer (cair um custo é verde), e `corDoTotal` leria o sinal cru da diferença. */
        const cor = col.tipo === 'delta' ? (daFaixa ? corLinha : corDoDelta(def, v))
          : def.faixa ? corDoTotal(def.faixa, v)
            : def.corPorSinal ? corDoSinal(v) : corLinha;
        /* ⚠ JUROS DE FAZENDA: "—" no R$ (é ausência, não zero) e nada nas unidades. */
        const jurosDeFazenda = def.chave === 'juros' && col.fazendaId !== null;
        /* ⚠ A CÉLULA DIZ DE ONDE VEIO A PONTA — VPB-REGRA-UNICA-01. O `title` deixou de explicar um
           TRAÇO (que não existe mais em realizado) e passou a explicar um NÚMERO: quando uma das
           pontas não veio de fechamento, o operador precisa saber disso para ler a variação. */
        const daVariacao = def.chave === 'vpb_operacional' || def.chave === 'efeito_mercado';
        const porqueDoTraco = col.tipo !== 'valor' || col.semDado || !daVariacao ? undefined
          : col.linhas.p0_fonte === 'cadastro' ? TITULO_INICIO_CADASTRO
            : col.linhas.p0_fonte === 'zero' ? TITULO_INICIO_ZERO
              : col.linhas.p1_fonte === 'zero' ? TITULO_FIM_ZERO : undefined;
        const abrir = abrirDaColuna(col);
        return (
          <Fragment key={col.chave}>
            {slots.map((sl, i) => (sl === 'rs' ? (
              <Celula key={sl} valor={v} cor={col.comparacao && !daFaixa ? 'text-muted-foreground' : cor}
                destaque={def.destaque} fonte={col.comparacao ? REGUA_LINHA.simples.fonte : regua.fonte}
                /* ⚠ A DIVISÓRIA DE 1px SAI ONDE O TRACEJADO ENTRA: na `Celula` o bloco de borda é
                   aplicado DEPOIS do `estilo`, então os dois disputariam o mesmo `borderLeft` e o
                   1px venceria. Aqui a coluna Meta abre mão dela e recebe a sua por `estiloDoSlot`. */
                bordaEsquerda={!col.total && i === 0 && !ehMeta(col)} total={col.total} fundo={fundo}
                faixa={daFaixa?.fundo} marcador={marcador(col, v)}
                semSlotMarcador={col.tipo === 'delta'}
                onAbrir={abrir}
                estilo={estiloDoSlot(i)}
                title={porqueDoTraco} />
            ) : (
              <CelulaUnit key={sl}
                texto={sl === 'pct' ? pctDelta(v, col.ref ? valorDe(col.ref, def.chave) : null)
                  : jurosDeFazenda ? '' : valorNaUnidade(sl, v, col, def.chave)}
                cor={cor} destaque={def.destaque}
                fonte={regua.fonte} total={col.total} fundo={fundo}
                faixa={daFaixa?.fundo} marcador={sl === 'pct' ? undefined : marcador(col, v)}
                semSlotMarcador={col.tipo === 'delta'}
                onAbrir={abrir}
                estilo={estiloDoSlot(i)} />
            )))}
          </Fragment>
        );
      })}
    </tr>
  );
}

/**
 * A FAIXA DE UMA LINHA DE APOIO — "% do VBP" e "Lucro por hectare" (03b-fix1/adendo item 12).
 *
 * ⚠ ELAS ENTRARAM NA FAIXA DO TOTAL A QUE PERTENCEM, e isso é o que elas sempre foram: a mesma
 * linha dita noutra unidade. Fora da faixa, o "Lucro por hectare" ficava numa tira branca logo
 * abaixo do azul do Lucro líquido — lia-se como uma linha NOVA da cascata, e o olho parava nela
 * procurando de que conta ela é a soma. Dentro, é a segunda linha do mesmo total.
 * ⚠ O FUNDO DA COLUNA TOTAL TEM DE SAIR JUNTO: ele é `backgroundColor` inline e ganharia da faixa,
 * deixando a tira azul com um retângulo branco no meio — o mesmo defeito do item 10, uma linha
 * abaixo. `semFundo` o remove passando `undefined`, que o React omite.
 */
function faixaDoApoio(def: DefPec) {
  const da = def.faixa ? FAIXA_TOTAL[def.faixa] : null;
  return {
    fundo: da ? da.fundo : fundoDaLinha(def.destaque),
    /* ⚠ O RÓTULO CONTINUA SENDO O TEXTO DE APOIO — muted fora do azul, e uma versão suave do branco
       dentro dele: quem manda na linha é o valor. */
    corRotulo: da?.texto ? 'text-primary-foreground/80' : 'text-muted-foreground',
    corValor: (v: number | null | undefined) => corDoApoio(v, def.faixa),
    marcador: (v: number | null | undefined) => (def.faixa ? marcadorDoTotal(def.faixa, v) : undefined),
    semFundo: (e: CSSProperties): CSSProperties => (da ? { ...e, backgroundColor: undefined } : e),
  };
}

/**
 * A LINHA DE PERCENTUAL — §3.
 *
 * ⚠ ELA NÃO É UMA LINHA DO DRE. Não entra em soma nenhuma e não abre lista: é a linha de cima dita
 * em outra unidade. De cor ela só tem o vermelho do negativo (ver `corDoApoio`). Por isso a régua dela é a de `filha` (9px, altura 14),
 * mas SEM recuo — recuar sugeriria que ela é um item dentro do subtotal, e ela não é.
 * ⚠ NO DELTA ELA FICA VAZIA: "% do VBP" de uma diferença não é leitura de nada.
 */
function LinhaPercentual({ def, colunas, unidades, base }: {
  def: DefPec; colunas: readonly ColunaPec[]; unidades: readonly UnidadePec[]; base?: boolean;
}) {
  const apoio = faixaDoApoio(def);
  return (
    <tr className={cn(apoio.fundo, 'font-normal')} style={{ height: 14 }}>
      <td className={cn('sticky left-0 z-30 truncate border-r border-border/60 py-px', apoio.corRotulo, apoio.fundo)}
        style={{ fontSize: 9, paddingLeft: RECUO_ICONE + L_ICONE, paddingRight: 7 }}
        title={`${def.rotulo} em ${ROTULO_DA_BASE}`}>
        {ROTULO_DA_BASE}
      </td>
      {colunas.map(col => {
        const bruto = col.linhas && col.tipo !== 'delta' ? valorNaColuna(col, def.chave) : null;
        const texto = !col.linhas || col.tipo === 'delta' ? ''
          : percentual(bruto, valorNaColuna(col, BASE_DO_PERCENTUAL) ?? 0);
        return (
          <Fragment key={col.chave}>
            <td className={cn('truncate px-[7px] text-right tabular-nums', apoio.corValor(bruto), apoio.fundo)}
              style={{
                fontSize: 9,
                ...(col.total ? { ...apoio.semFundo({ backgroundColor: FUNDO_TOTAL }), borderLeft: BORDA_TOTAL } : {}),
                ...(congelada(col, colunas) ? apoio.semFundo(estiloTotalRs) : {}),
                ...bordaDaMeta(col, 0, slotsDaColuna(col, unidades).length, base ? { base: true } : undefined),
              }}>
              {/* ⚠ MESMO SLOT DA LINHA DE CIMA — o "% do VBP" divide a coluna com o total que ele
                  descreve, e o percentual desalinhado do número faria a coluna parecer torta. */}
              {texto !== '' && <Marcador semSlot={col.tipo === 'delta'} />}
              {texto}
            </td>
            {/* ⚠ AS CÉLULAS DE UNIDADE FICAM VAZIAS: um percentual não se divide por hectare, por
                cabeça nem por arroba — ele já é a linha de cima noutra unidade. Vazias, não
                ausentes: a coluna não pode encolher só nesta linha. */}
            {slotsDaColuna(col, unidades).slice(1).map((sl, i) => (
              <td key={sl} className={cn(apoio.fundo)}
                style={{
                  ...(col.total && i === 0
                    ? apoio.semFundo({ ...(congelada(col, colunas) ? estiloTotalCab(col, unidades) : {}), backgroundColor: FUNDO_TOTAL })
                    : {}),
                  ...bordaDaMeta(col, i + 1, slotsDaColuna(col, unidades).length, base ? { base: true } : undefined),
                }} />
            ))}
          </Fragment>
        );
      })}
    </tr>
  );
}

/**
 * O LUCRO POR HECTARE — DRE-CASCATA-03a.
 *
 * ⚠ ELE É A MESMA LINHA DE CIMA NOUTRA UNIDADE, como o "% do VBP": não entra em soma nenhuma e não
 * abre lista. Por isso reusa a régua da `LinhaPercentual` — 9px, muted, altura 14, sem recuo — e o
 * mesmo `corDoApoio`, que só marca o negativo; não vira uma linha da cascata.
 * ⚠ O DIVISOR É O `ha_medio` DA PRÓPRIA COLUNA, o mesmo do chip R$/ha: cada fazenda tem a sua
 * área, e usar a do Total faria a coluna da Pureza falar do hectare do conjunto.
 * ⚠ SEM ÁREA, TRAÇO — nunca zero: fazenda sem fechamento de área não tem lucro por hectare, e
 * "R$ 0,00/ha" afirmaria que ela não lucrou.
 */
function LinhaPorHectare({ def, colunas, unidades, base }: {
  def: DefPec; colunas: readonly ColunaPec[]; unidades: readonly UnidadePec[]; base?: boolean;
}) {
  const apoio = faixaDoApoio(def);
  return (
    <tr className={cn(apoio.fundo, 'font-normal')} style={{ height: 14 }}>
      <td className={cn('sticky left-0 z-30 truncate border-r border-border/60 py-px', apoio.corRotulo, apoio.fundo)}
        style={{ fontSize: 9, paddingLeft: RECUO_ICONE + L_ICONE, paddingRight: 7 }}
        title={`${def.rotulo} dividido pela área produtiva média do período`}>
        {ROTULO_POR_HECTARE}
      </td>
      {colunas.map(col => {
        const v = col.linhas && col.tipo !== 'delta' ? valorNaColuna(col, def.chave) : null;
        const ha = col.linhas?.producao.ha_medio ?? null;
        const texto = !col.linhas || col.tipo === 'delta' ? ''
          : v == null || ha == null || !(ha > 0) ? traco : `R$ ${formatNum(v / ha, 2)}/ha`;
        return (
          <Fragment key={col.chave}>
            <td className={cn('truncate px-[7px] text-right tabular-nums', apoio.corValor(v), apoio.fundo)}
              style={{
                fontSize: 9,
                ...(col.total ? { ...apoio.semFundo({ backgroundColor: FUNDO_TOTAL }), borderLeft: BORDA_TOTAL } : {}),
                ...(congelada(col, colunas) ? apoio.semFundo(estiloTotalRs) : {}),
                ...bordaDaMeta(col, 0, slotsDaColuna(col, unidades).length, base ? { base: true } : undefined),
              }}>
              {/* ⚠ A LINHA DE APOIO RESERVA O SLOT COMO AS OUTRAS: ela mora na MESMA coluna do
                  Lucro líquido, e sem a reserva o "Lucro por hectare" ficaria 10px à direita do
                  número que ele explica. No traço o slot fica vazio, como em toda parte. */}
              {texto !== '' && <Marcador marcador={texto === traco ? undefined : apoio.marcador(v)}
                semSlot={col.tipo === 'delta'} />}
              {texto}
            </td>
            {slotsDaColuna(col, unidades).slice(1).map((sl, i) => (
              <td key={sl} className={cn(apoio.fundo)}
                style={{
                  ...(col.total && i === 0
                    ? apoio.semFundo({ ...(congelada(col, colunas) ? estiloTotalCab(col, unidades) : {}), backgroundColor: FUNDO_TOTAL })
                    : {}),
                  ...bordaDaMeta(col, i + 1, slotsDaColuna(col, unidades).length, base ? { base: true } : undefined),
                }} />
            ))}
          </Fragment>
        );
      })}
    </tr>
  );
}

/**
 * UMA FILHA — o centro de custo dentro do bloco.
 *
 * ⚠ O VALOR DA FILHA VEM DOS `centros` DAQUELA COLUNA, não do Total repetido: cada fazenda tem os
 * seus, e um centro que ela não tem mostra "—" em vez de herdar o número do conjunto. No delta, os
 * dois lados precisam ter o centro — faltando um, é "—".
 * ⚠ E O `'(sem)'` VIAJA INTEIRO ATÉ A RPC — ele é um centro de verdade ("lançamento sem centro"),
 * não ausência. Mandar `null` no lugar dele traria o bloco todo.
 */
function LinhaCentro({ def, centro, colunas, bloco, unidades, base, onAbrirLista }: {
  def: DefPec;
  centro: CentroPec;
  colunas: readonly ColunaPec[];
  bloco: string;
  unidades: readonly UnidadePec[];
  base?: boolean;
  onAbrirLista?: (r: RecortePec) => void;
}) {
  const regua = REGUA_LINHA.filha;
  const corLinha = corDoTom(def.tom);
  /* ⚠ A FILHA DO RATEIO NÃO VEM DE `centros`: ela é a linha `rateio_adm` da própria coluna, posta
     como filha do Custo fixo no modo Resumido. Procurá-la entre os centros devolveria nulo. */
  const achar = (l: DrePecLinhas | null | undefined) => {
    if (!l) return null;
    if (centro.bloco === 'rateio_adm') return valorDe(l, 'rateio_adm');
    return centrosDoBloco(l, bloco).find(c => c.centro === centro.centro)?.valor ?? null;
  };
  return (
    <tr className={cn('bg-card', regua.peso)} style={{ height: regua.altura }}>
      <td className="sticky left-0 z-30 truncate border-r border-border/60 bg-card py-px"
        style={{ fontSize: regua.fonte, paddingLeft: RECUO_ICONE + L_ICONE + regua.recuo, paddingRight: 7 }}
        title={centro.centro}>
        {/* ⚠ A FILHA NÃO TEM ÍCONE — DRE-CASCATA-03b. Numa grade aberta eram dezenas de ícones
            repetidos na coluna de rótulos, e o que eles abrem já se alcança de dentro do modal: a
            legenda do donut do pai navega para cada filha, e entre irmãs. O ícone fica onde a
            pergunta nasce — no grupo, no total e nas linhas soltas de topo. */}
        {centro.centro === '(sem)' ? 'sem centro' : centro.centro}
      </td>
      {colunas.map(col => {
        const slots = slotsDaColuna(col, unidades);
        const estiloDoSlot = (i: number): CSSProperties => ({
          ...(!congelada(col, colunas) ? {}
            : i === 0 ? estiloTotalRs : i === 1 ? estiloTotalCab(col, unidades) : {}),
          ...bordaDaMeta(col, i, slots.length, base ? { base: true } : undefined),
        });
        if (!col.linhas) {
          return (
            <Fragment key={col.chave}>
              {slots.map((sl, i) => (
                <CelulaCarregando key={sl} total={col.total} fundo="bg-card" estilo={estiloDoSlot(i)} />
              ))}
            </Fragment>
          );
        }
        let v: number | null;
        let m: number | null = null;
        if (col.semDado) v = null;
        else if (col.tipo === 'delta') {
          const r = achar(col.linhas);
          m = achar(col.ref);
          v = r == null || m == null ? null : r - m;
        } else v = achar(col.linhas);
        const cor = col.tipo === 'delta' ? corDoDelta(def, v) : corLinha;
        const abrir = onAbrirLista && col.tipo === 'valor' && !col.semDado
          ? () => onAbrirLista({
            fazendaId: col.fazendaId, fazendaNome: col.nome, bloco,
            centro: centro.centro,
            rotulo: centro.centro === '(sem)' ? 'sem centro' : centro.centro,
            de: col.de, ate: col.ate, cenario: col.cenario,
          })
          : undefined;
        /* ⚠ A FILHA SEGUE OS MESMOS CHIPS DA MÃE, e o R$/@ dela usa a base da LINHA (o bloco a
           que o centro pertence): um centro de custo variável se lê pela arroba produzida, como o
           subtotal acima dele. */
        return (
          <Fragment key={col.chave}>
            {slots.map((sl, i) => (sl === 'rs' ? (
              <Celula key={sl} valor={v} cor={cor} fonte={regua.fonte} filha
                bordaEsquerda={!col.total && i === 0 && !ehMeta(col)} total={col.total} fundo="bg-card" onAbrir={abrir}
                semSlotMarcador={col.tipo === 'delta'}
                estilo={estiloDoSlot(i)} />
            ) : (
              <CelulaUnit key={sl}
                texto={sl === 'pct' ? pctDelta(v, m) : valorNaUnidade(sl, v, col, def.chave)}
                cor={cor} fonte={regua.fonte} filha
                total={col.total} fundo="bg-card" onAbrir={abrir}
                semSlotMarcador={col.tipo === 'delta'}
                estilo={estiloDoSlot(i)} />
            )))}
          </Fragment>
        );
      })}
    </tr>
  );
}

/**
 * OS QUATRO CARDS DE VISÃO — DRE-PEC-TELA-02. Substituem a faixa de seis caixas: Cabeças, Receita
 * líquida, VBP, Efeito de mercado e Patrimônio saíram do topo porque já estão na grade.
 *
 * ⚠ CADA CARD MOSTRA UM NÚMERO SÓ, e o de "x Meta" e "x Anos" é o DELTA do resultado do período —
 * a resposta curta à pergunta do card. Enquanto o número não chegou, spinner: "—" diria que o dado
 * não existe (decisão 2).
 * ⚠ O SELETOR DE ANOS OCUPA O LUGAR SEMPRE, invisível fora da visão x Anos: aparecendo e sumindo,
 * ele encolheria os quatro cards a cada troca — a lei de estabilidade.
 */
export function FaixaVisoesPec({ visao, onVisao, real, meta, carregandoMeta, anoAnterior,
  carregandoAnoAnterior, referencia, onReferencia, controles }: {
  visao: VisaoPec;
  onVisao: (v: VisaoPec) => void;
  real: DrePecuaria;
  meta: DrePecuaria | null;
  carregandoMeta: boolean;
  anoAnterior: DrePecuaria | null;
  carregandoAnoAnterior: boolean;
  /** A referência escolhida — 'meta' ou 1..5 anos. Ela mora DENTRO do card, no lugar do número. */
  referencia: ReferenciaPec;
  onReferencia: (r: ReferenciaPec) => void;
  /** Os controles da grade — ver `Caixas.extra`. Eles entram nas colunas vazias. */
  controles?: ReactNode;
}) {
  const nFaz = real.fazendas.length;
  const semMeta = !carregandoMeta && (!meta || semMovimento(meta));
  const semAno = !carregandoAnoAnterior && (!anoAnterior || anoAnterior.fazendas.length === 0);
  /* ⚠ O CARD DE COMPARAÇÃO NÃO TEM NÚMERO, e é o que ele tem de melhor: os três cards que ele
     substituiu mostravam três números — o resultado, o Δ meta e o Δ ano —, e nenhum deles era a
     resposta da tela; a resposta está na GRADE, que fica dez pixels abaixo. Aqui mora a pergunta
     ("comparado com o quê?"), e a grade responde.
     ⚠ E O `title` DE CADA OPÇÃO DIZ QUANDO ELA NÃO TEM DADO: 'Meta' sem meta no período e o ano
     anterior sem fechamento continuam clicáveis — a coluna aparece em traço, que é o sentinela
     certo para "não sei", e some-la esconderia a pergunta junto com a resposta. */
  const opcoesRef = [
    { valor: 'meta', rotulo: 'Meta',
      title: semMeta ? 'sem meta no período' : 'Comparar com a meta do período' },
    ...['1', '2', '3', '4', '5'].map(n => ({
      valor: n,
      rotulo: n,
      title: n === '1' && semAno ? 'sem ano anterior'
        : `Comparar com ${n === '1' ? 'o ano anterior' : `os ${n} anos anteriores`}`,
    })),
  ];
  const caixas: CaixaFaixa[] = [
    {
      chave: 'comparacao', rotulo: 'Comparação', valor: '',
      title: 'Contra o que este período se lê.',
      conteudo: (
        <Segmentado altura={20} fonte={9}
          valor={referencia === 'meta' ? 'meta' : String(referencia)}
          /* ⚠ UM GESTO, UM ESCRITOR: escolher a referência JÁ seleciona a comparação — quem o faz é
             `escolherReferencia`, na página. Chamar `onVisao` aqui também punha dois `setParams` no
             mesmo tique do React, e a segunda escrita se perdia: clicar em "Meta" não fazia nada.
             Medido na tela em 23/09. */
          onEscolher={v => onReferencia(v === 'meta' ? 'meta' : Number(v))}
          opcoes={opcoesRef} />
      ),
    },
    { chave: 'fazenda', rotulo: 'Por fazenda', valor: String(nFaz), unidade: nFaz === 1 ? 'fazenda' : 'fazendas',
      title: 'Qual fazenda carrega o resultado?' },
  ];
  /* ⚠ SEIS COLUNAS E A RÉGUA DA LAVOURA — DRE-PADRAO-01a: a grade é de 6 e as colunas que sobram
     ficam com os controles (ver `Caixas.extra`). Com dois cards em vez de três, sobram quatro. */
  return (
    <Caixas caixas={caixas} colunas={6} selecionada={visao} extra={controles}
      onEscolher={ch => { const v = VISOES.find(x => x === ch); if (v) onVisao(v); }} />
  );
}

