/**
 * O HISTÓRICO DE UMA LINHA DO DRE DA PECUÁRIA — DRE-HISTORICO-LINHA-01a.
 *
 * ⚠ ELE RESPONDE DUAS PERGUNTAS, e as duas metades da tela são elas: "como esta linha evoluiu?"
 * (as barras, safra a safra, contra a meta) e "quanto ela pesa no todo?" (o donut). Art. 19 da
 * Constituição nº 2 — a leitura vem com os companheiros que a tornam interpretável.
 *
 * ⚠ NENHUMA LEITURA PRÓPRIA. Os anos, o realizado e a meta chegam prontos de quem já os tinha em
 * cache: `useDrePecuariaLista` e `useDrePecuaria`, as MESMAS chaves da visão x Anos. Uma consulta
 * daqui seria a segunda fonte do mesmo número — e a segunda fonte é a que diverge.
 * ⚠ E NENHUMA CONTA DE UNIDADE PRÓPRIA: `valorNaUnidade` e a cascata vêm de `drePecRegua`, o
 * módulo que nasceu deste PR justamente para não haver duas contas de R$/@ na casa.
 */
import { useEffect, useMemo, useState } from 'react';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { X, ChevronLeft } from 'lucide-react';
import { cn } from '@/lib/utils';
import { formatNum } from '@/lib/calculos/formatters';
import { Segmentado } from '@/components/ui/segmentado';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { BarrasCompactas, type BarraCompacta } from '@/components/ui/barras-compactas';
import { Donut, traco, VERDE, VERMELHO } from '@/components/agri/dreGrade';
import {
  LINHAS_PEC, BASE_DO_PERCENTUAL, ROTULO_UNIDADE, UNIDADES_PEC,
  centrosDoBloco, percentual, valorDe, valorNaUnidade,
  type ColunaPec, type UnidadePec, type DefPec,
} from '@/components/agri/drePecRegua';
import {
  BLOCO_DA_LINHA, rotuloCurtoPeriodo,
  type ChaveLinhaPec, type DrePecuaria, type DrePecLinhas,
} from '@/hooks/useDrePecuaria';

/** A linha que o operador clicou — a chave da cascata e, se for filha, o centro dela. */
export interface RecorteHistoricoPec {
  chave: ChaveLinhaPec;
  /** `null` = a própria linha da cascata; preenchido = a filha (centro de custo). */
  centro: string | null;
  /** O rótulo que a grade mostra, inteiro — é o título do modal. */
  rotulo: string;
  fazendaId: string | null;
  fazendaNome: string;
}

/** Um ponto da série — uma safra, o período da tela, ou a meta. */
interface Ponto {
  chave: string;
  /** O que aparece no eixo e no cabeçalho da tabela: o ano, ou a safra. */
  rotulo: string;
  /** O período por extenso — vai para o `title`, onde não custa largura. */
  rotuloLongo: string;
  linhas: DrePecLinhas | null;
  meses: number;
  meta?: boolean;
}

/**
 * AS CORES DA NATUREZA — classes LITERAIS, nunca montadas por interpolação.
 *
 * ⚠ O Tailwind varre o código atrás do nome inteiro da classe: `bg-${cor}-600` não existe no CSS
 * gerado e a barra sairia transparente. Por isso as quatro variantes estão escritas por extenso.
 * ⚠ RESULTADO É RECEITA AQUI, e a razão é a leitura: verde e vermelho neste modal dizem "linha que
 * traz" e "linha que consome". Uma margem negativa aparece com número negativo — o sinal é do
 * número, não da paleta da linha.
 */
const CORES = {
  custo: {
    texto: VERMELHO, barra: 'bg-red-600', barraFraca: 'bg-red-200',
    coluna: 'bg-red-50', fatia: '#dc2626',
  },
  receita: {
    texto: VERDE, barra: 'bg-green-700', barraFraca: 'bg-green-200',
    coluna: 'bg-green-50', fatia: '#15803d',
  },
} as const;
export type Natureza = keyof typeof CORES;

/**
 * A COR DE UM VALOR NEGATIVO INVERTE A NATUREZA — decisão do Gabriel, item B do 01c.
 *
 * ⚠ UM RESULTADO NEGATIVO É VERMELHO, mesmo numa linha "de receita": a natureza diz o que a linha
 * costuma ser, o sinal diz o que ela foi naquele ano. Pintar de verde um prejuízo de 303 mil
 * porque "resultado é linha verde" é o tipo de coerência que mente.
 * ⚠ E UM CUSTO NEGATIVO É VERDE pelo mesmo motivo: custo abaixo de zero é devolução, estorno,
 * crédito — dinheiro que voltou.
 * ⚠ É A MESMA REGRA DA GRADE (`corPorSinal` em `LINHAS_PEC`), não uma segunda: lá as sete linhas
 * de "=" já se pintam pelo próprio número, coluna a coluna.
 */
const coresDoSinal = (v: number | null, natureza: Natureza) =>
  CORES[v != null && v < 0 ? (natureza === 'custo' ? 'receita' : 'custo') : natureza];

/**
 * O DENOMINADOR DE CADA UNIDADE, por extenso — e ele é OBRIGAÇÃO, não cortesia.
 *
 * ⚠ SEM O DIVISOR À MÃO o operador não refaz a conta (Art. 19), e o rodapé que o dizia saiu na
 * homologação de 22/09: a faixa de duas linhas comia a altura do gráfico. O texto não morreu com
 * ela — mudou para o `title` da célula que nomeia a unidade, que é onde a dúvida aparece.
 * ⚠ O DA @ É O MAIS IMPORTANTE DOS TRÊS: a base muda POR LINHA, e é por isso que aquela coluna não
 * soma. Era a única frase que o rodapé tinha de carregar de qualquer jeito.
 */
const DIVISOR_DA_UNIDADE: Record<UnidadePec, string> = {
  rs: 'Reais do período, como a RPC os devolve',
  ha: 'R$ ÷ área média do período (hectare produtivo)',
  cab: 'R$ ÷ cabeça média do período ÷ meses do período',
  arroba: 'Divisor por linha: receita e deduções pela @ vendida, reposição pela @ comprada, '
    + 'demais pela @ produzida. Esta coluna não soma — e a meta costuma vir sem @ produzida, daí o traço.',
};

/**
 * A REFERÊNCIA DA COLUNA Δ — a meta, ou o ano imediatamente anterior.
 *
 * ⚠ SÃO DUAS PERGUNTAS DIFERENTES E AMBAS LEGÍTIMAS: "cumpri o que planejei?" e "estou melhor que
 * no ano passado?". Uma coluna fixa em meta respondia só a primeira, e a segunda exigia ler duas
 * colunas e fazer a conta de cabeça.
 */
export type RefDelta = 'meta' | 'ano';
const ROTULO_REF: Record<RefDelta, string> = { meta: 'Δ meta', ano: 'Δ ano ant.' };

/**
 * AS LINHAS DE RESULTADO — as sete do "=" da cascata.
 *
 * ⚠ ELAS PEDEM OUTRA LEITURA, e é por isso que ganham outra apresentação: um resultado não se
 * divide por hectare nem por arroba para ser entendido (isso é leitura de custo), e não tem
 * composição para um anel mostrar. O que ele pede é a evolução em dinheiro ao lado do PESO no VBP
 * — o companheiro obrigatório do Art. 19, que diz se o número é grande ou só parece.
 * ⚠ O CRITÉRIO É O `destaque` DA CASCATA, não uma segunda lista: quem decide o que é subtotal já é
 * `LINHAS_PEC`, e duplicar os sete nomes aqui criaria a chance de eles divergirem.
 */
const ehLinhaDeResultado = (def: DefPec | null, centro: string | null) =>
  centro === null && !!def?.destaque;

/**
 * AS CORES DAS OUTRAS FATIAS — separadas entre si, nunca cinza.
 *
 * ⚠ CINZA SIGNIFICA "SEM DADO" NESTA CASA (o traço, a barra tracejada). Um pedaço cinza do donut
 * leria como ausência, quando é o irmão que está ali com valor próprio.
 */
const CORES_FATIA = ['#0d9488', '#7c3aed', '#d97706', '#2563eb', '#db2777', '#65a30d'];
const MAX_FATIAS = 5;

/** O escopo da coluna que abriu o modal: o total, ou uma fazenda. */
const linhasDoEscopo = (d: DrePecuaria | null, fazendaId: string | null): DrePecLinhas | null => {
  if (!d) return null;
  if (fazendaId === null) return d.total;
  return d.fazendas.find(f => f.fazenda_id === fazendaId)?.linhas ?? null;
};

/** O valor da linha (ou da filha) num ponto. ⚠ `null` é ausência — nunca zero. */
const valorDoRecorte = (l: DrePecLinhas | null, r: RecorteHistoricoPec): number | null => {
  if (!l) return null;
  if (r.centro === null) return valorDe(l, r.chave);
  const bloco = BLOCO_DA_LINHA[r.chave];
  if (!bloco) return null;
  return centrosDoBloco(l, bloco).find(c => c.centro === r.centro)?.valor ?? null;
};

/**
 * O TEXTO DE UM VALOR NA UNIDADE ESCOLHIDA.
 *
 * ⚠ A COLUNA FALSA É ADAPTAÇÃO DE FORMA, NÃO CONTA NOVA: `valorNaUnidade` pede uma `ColunaPec`
 * porque nasceu na grade, e do contrato dela usa só `linhas` e `meses` — que é exatamente o que um
 * ponto da série tem. Reescrever a função com outra assinatura faria dela a segunda dona da conta
 * da @, cuja base muda por linha; montar a forma que ela pede não muda nenhum número.
 */
const comoColuna = (l: DrePecLinhas | null, meses: number): ColunaPec => ({
  chave: '', nome: '', sub: '', fazendaId: null, linhas: l, total: false,
  tipo: 'valor', unidade: 'ha', de: '', ate: '', cenario: 'realizado', meses, atual: false,
});

/**
 * O NOME DA LINHA SEM O PREFIXO DA CASCATA — fix1 da homologação.
 *
 * ⚠ "(−)" E "=" SÃO GRAMÁTICA DA GRADE, não do nome: ali eles mostram para onde a conta anda. Numa
 * frase ("dentro de Custo variável", "do VBP") viram ruído, e "= Margem de contribuição · histórico"
 * lê como se faltasse o lado esquerdo da igualdade.
 * ⚠ A EXPRESSÃO É A MESMA que a grade já usa para mandar o rótulo ao drill (`PecDrePanel`), não uma
 * segunda: o mesmo nome tem de chegar igual aos dois modais.
 */
export const semPrefixo = (r: string) => r.replace(/^[=(−)\s-]+/, '').trim();

/**
 * O NÚMERO DE VOLTA, a partir do texto que a tela mostra.
 *
 * ⚠ O CAMINHO É ESTE DE PROPÓSITO, e a alternativa era pior: dividir o valor pelos divisores aqui
 * faria deste arquivo a SEGUNDA dona da conta de R$/ha, R$/cab/mês e R$/@ — exatamente o que o
 * módulo `drePecRegua` nasceu para impedir. O que se lê de volta é o número que o operador vê.
 * ⚠ E A PERDA É DE CENTAVO, não de leitura: o texto vem com duas casas, e o que se faz com ele é
 * altura de barra e percentual de variação. Nenhum dos dois muda com a terceira casa.
 */
export const numeroDoTexto = (t: string): number | null => {
  const n = Number(t.replace(/\./g, '').replace(',', '.'));
  return Number.isFinite(n) ? n : null;
};

/**
 * O VALOR ABREVIADO ACIMA DA BARRA — fix1 da homologação (print da Santa Rita, 19:38).
 *
 * ⚠ ELE NASCE DE SOBREPOSIÇÃO MEDIDA: "2.699.794,84" em sete barras de 22px vira uma faixa de
 * números encavalados, e o gráfico deixa de ser legível justamente onde deveria comparar. Abreviado,
 * cada número cabe sobre a sua barra.
 * ⚠ A TABELA CONTINUA INTEIRA (A19): quem quer o centavo olha embaixo, e o `title` da barra traz o
 * número completo. Abreviar é para o olho comparar, nunca para esconder.
 * ⚠ ABAIXO DE MIL NADA MUDA: "971,74" já cabe, e arredondá-lo tiraria precisão sem ganhar espaço.
 * ⚠ O PISO DO "k" É PARÂMETRO, e não há um segundo formatador: a BARRA abrevia a partir de mil
 * (22px de largura não cabem mais que isso), a TABELA só a partir de cem mil, porque ali a coluna
 * tem 72px e "87.430,55" ainda cabe inteiro. Mesma regra, dois espaços diferentes.
 */
export const abreviar = (t: string, pisoK = 1e3): string => {
  const n = numeroDoTexto(t);
  if (n == null) return t;
  const abs = Math.abs(n);
  if (abs >= 1e6) return `${formatNum(n / 1e6, 1)} mi`;
  if (abs >= pisoK) return `${formatNum(n / 1e3, 1)} k`;
  return t;
};

/** O piso do "k" na TABELA do histórico — abaixo dele o centavo cabe e fica. */
export const PISO_K_TABELA = 1e5;

/**
 * O RÓTULO CURTO DO EIXO — só o ano, ou a safra.
 *
 * ⚠ "jul/2025 → jun/2026" DEBAIXO DE UMA BARRA DE 22px não cabe em lugar nenhum: ele truncava em
 * "jul…" e sete colunas ficavam com o mesmo rótulo. O ano de dois dígitos identifica a coluna, e o
 * período inteiro vai para o `title`.
 * ⚠ UM ANO CIVIL É UM NÚMERO, UMA SAFRA SÃO DOIS: o critério não é o modo da tela, é o dado — se o
 * recorte começa e termina no mesmo ano, um número basta; se atravessa, "24/25" é o que o produtor
 * chama aquela safra.
 */
export const rotuloCurtoDoAno = (de: string, ate: string): string => {
  const aa = (am: string) => am.slice(2, 4);
  return de.slice(0, 4) === ate.slice(0, 4) ? aa(de) : `${aa(de)}/${aa(ate)}`;
};

/** ⚠ O R$ NÃO PASSA POR `valorNaUnidade` — ele é a célula de dinheiro, com milhar e 2 casas (A19). */
const texto = (u: UnidadePec, v: number | null, p: Ponto, chave: ChaveLinhaPec): string => {
  if (!p.linhas) return traco;
  if (u === 'rs') return v == null ? traco : formatNum(v, 2);
  return valorNaUnidade(u, v, comoColuna(p.linhas, p.meses), chave);
};

/** ⚠ O TEXTO DO PERCENTUAL VEM COM " %" COLADO; para virar número, ele sai. */
const soNumeroPct = (t: string) => t.replace(' %', '');

/**
 * O Δ DE UM PERCENTUAL É EM PONTOS, NÃO EM POR CENTO.
 *
 * ⚠ 40 % CONTRA 20 % NÃO É "100 % A MAIS" NESTA LEITURA: são 20 pontos percentuais. A variação
 * relativa de uma razão é matematicamente correta e engana quem compara margens — o operador lê
 * "dobrou" onde a margem subiu vinte pontos. A cor segue a natureza, como no outro Δ.
 */
export function deltaEmPontos(atual: number | null, ref: number | null, natureza: Natureza) {
  if (atual == null || ref == null) return null;
  const pp = atual - ref;
  if (pp === 0) return { texto: '0,0 pp', cor: '' };
  const ruim = natureza === 'custo' ? pp > 0 : pp < 0;
  return {
    texto: `${pp > 0 ? '▲' : '▼'} ${formatNum(Math.abs(pp), 1)} pp`,
    cor: ruim ? VERMELHO : VERDE,
  };
}

/**
 * UMA LINHA DA TABELA — o mesmo desenho para as unidades e para o modo resultado.
 *
 * ⚠ ELA EXISTE PARA NÃO HAVER DUAS TABELAS: o cabeçalho, as larguras, a coluna da safra escolhida e
 * o Δ são os mesmos nos dois modos, e só o conteúdo das linhas muda.
 */
function LinhaDaTabela({
  rotulo, pontos, escolhida, cores, valor, delta, forte, referencia, title, abreviarValor, natureza,
}: {
  rotulo: string;
  pontos: readonly Ponto[];
  escolhida: string;
  cores: typeof CORES[Natureza];
  valor: (p: Ponto) => string;
  delta: { texto: string; cor: string } | null;
  /** A linha principal do modo: 9,5px e peso 500, como a unidade escolhida no outro modo. */
  forte?: boolean;
  natureza: Natureza;
  /** Linha de referência (o VBP): cinza e sem Δ — ela não é o assunto, é o denominador. */
  referencia?: boolean;
  /** Linha em R$: abrevia a partir de cem mil e guarda o valor inteiro no `title`. */
  abreviarValor?: boolean;
  title?: string;
}) {
  return (
    <tr style={{ height: 16 }} className={cn('border-t border-border/60', referencia && 'bg-muted/40')}>
      <td title={title} className={cn('truncate px-[7px] text-[9px]',
        forte ? 'font-medium' : 'text-muted-foreground')}>{rotulo}</td>
      {pontos.map(p => {
        const completo = valor(p);
        /* ⚠ ABREVIA NA CÉLULA, GUARDA O INTEIRO NO `title` — adendo do 01c: "2.588.458,09" não cabe
           em 72px e saía cortado, que é pior que abreviado (o operador não sabe o que falta). O
           centavo continua a um hover de distância, e na GRADE do DRE ele segue na tela (A19). */
        const mostrado = abreviarValor ? abreviar(completo, PISO_K_TABELA) : completo;
        /* ⚠ A CÉLULA SEGUE O SINAL, como a barra e como a grade: um número negativo numa linha de
           resultado sai em vermelho ainda que a linha seja "verde". */
        const corDaCelula = coresDoSinal(numeroDoTexto(completo), natureza).texto;
        return (
          <td key={p.chave} title={mostrado === completo ? undefined : completo}
            className={cn('truncate px-[7px] text-right tabular-nums',
              forte ? 'text-[9.5px] font-medium' : 'text-[9px] font-normal',
              referencia ? 'text-muted-foreground' : p.meta ? 'text-amber-600' : corDaCelula,
              p.chave === escolhida && !p.meta && cores.coluna)}>
            {mostrado}
          </td>
        );
      })}
      <td className="truncate px-[7px] text-right text-[9px] tabular-nums text-muted-foreground">
        {delta ? <span className={delta.cor}>{delta.texto}</span> : (referencia ? '' : traco)}
      </td>
    </tr>
  );
}

/**
 * O Δ CONTRA A META — e o sinal da COR depende da natureza, não do sinal do número.
 *
 * ⚠ GASTAR MAIS QUE O PLANEJADO É VERMELHO; FATURAR MAIS É VERDE. O mesmo "+12%" é boa notícia numa
 * linha de venda e má notícia numa de nutrição. Pintar pelo sinal do número diria o contrário em
 * metade da cascata.
 * ⚠ E BASE NULA DÁ TRAÇO, nunca 0%: meta ausente não é meta zerada.
 */
export function deltaMeta(atual: number | null, meta: number | null, natureza: Natureza) {
  if (atual == null || meta == null || !(Math.abs(meta) > 0)) return null;
  const pct = ((atual - meta) / Math.abs(meta)) * 100;
  const acima = pct > 0;
  const ruim = natureza === 'custo' ? acima : !acima;
  return {
    texto: `${acima ? '▲' : '▼'} ${formatNum(Math.abs(pct), 1)} %`,
    cor: ruim ? VERMELHO : VERDE,
  };
}


/** O que o anel mostra e contra o que o centro mede. */
export interface BaseDonut {
  /** O nome da base — o pai da filha, ou "= VBP". */
  rotuloBase: string;
  total: number;
  valorLinha: number | null;
  /**
   * ⚠ O `centro` VIAJA CRU ao lado do nome exibido, e não é redundância: "(sem)" aparece como
   * "sem centro" na tela, e é o valor CRU que a navegação e a RPC entendem. Sem ele, quem clicasse
   * na fatia teria de desfazer a tradução — e a tradução passaria a existir em dois lugares.
   */
  fatias: Array<{ nome: string; valor: number; centro?: string }>;
  /** A fatia que É a linha clicada — pintada na cor da natureza. */
  destaque: string | null;
}

/**
 * O QUE O DONUT MOSTRA — três bases, uma por tipo de linha (decisão do Gabriel):
 *   filha  → ela contra as IRMÃS (o peso dentro do bloco do pai);
 *   grupo  → a composição das próprias filhas;
 *   "=" e topo sem pai → ela contra o RESTANTE DO VBP.
 *
 * ⚠ O CENTRO RESPONDE SEMPRE A MESMA PERGUNTA: quanto ESTA linha pesa na base dela. No grupo, o
 * anel mostra as filhas e o centro continua dizendo o peso do grupo no VBP — senão o número do
 * meio seria 100% e não diria nada.
 * ⚠ FUNÇÃO PURA E EXPORTADA, não um `useMemo` escondido no render: é a regra que decide a leitura
 * inteira do modal, e dentro do JSX ela só seria testável montando a tela com cinco anos de dado.
 * ⚠ VALOR ABSOLUTO NAS FATIAS: um anel não desenha número negativo, e um centro com valor negativo
 * (reposição, dedução) faria a fatia sumir em vez de pesar.
 */
export function baseDoDonut(
  l: DrePecLinhas | null, recorte: RecorteHistoricoPec | null, def: DefPec | null,
): BaseDonut | null {
  {
    if (!recorte || !l) return null;
    const bloco = BLOCO_DA_LINHA[recorte.chave];
    const vbp = valorDe(l, BASE_DO_PERCENTUAL);
    const mostrarFilhas = recorte.centro === null && !!def?.expande && !!bloco;

    if (recorte.centro !== null && bloco) {
      const irmas = centrosDoBloco(l, bloco);
      const minha = irmas.find(c => c.centro === recorte.centro)?.valor ?? null;
      const total = irmas.reduce((a, c) => a + Math.abs(c.valor), 0);
      return {
        rotuloBase: def?.rotulo ?? '', total,
        valorLinha: minha,
        fatias: irmas.map(c => ({
          nome: c.centro === '(sem)' ? 'sem centro' : c.centro, valor: Math.abs(c.valor), centro: c.centro,
        })),
        destaque: recorte.centro === '(sem)' ? 'sem centro' : recorte.centro,
      };
    }
    if (mostrarFilhas && bloco) {
      const filhas = centrosDoBloco(l, bloco);
      const total = filhas.reduce((a, c) => a + Math.abs(c.valor), 0);
      return {
        rotuloBase: '= VBP', total: vbp == null ? 0 : Math.abs(vbp),
        valorLinha: valorDe(l, recorte.chave),
        fatias: filhas.map(c => ({
          nome: c.centro === '(sem)' ? 'sem centro' : c.centro, valor: Math.abs(c.valor), centro: c.centro,
        })),
        destaque: null,
      };
    }
    const v = valorDe(l, recorte.chave);
    const base = vbp == null ? 0 : Math.abs(vbp);
    const resto = Math.max(0, base - Math.abs(v ?? 0));
    return {
      rotuloBase: '= VBP', total: base, valorLinha: v,
      fatias: [{ nome: recorte.rotulo, valor: Math.abs(v ?? 0) }, { nome: 'restante do VBP', valor: resto }],
      destaque: recorte.rotulo,
    };
  }
}

export function PecHistoricoLinhaModal({
  aberto, recorte, atual, meta, anos, periodoRotulo, clienteNome, unidadeInicial, onFechar,
}: {
  aberto: boolean;
  recorte: RecorteHistoricoPec | null;
  /** O realizado do período da tela — a coluna "atual" da série. */
  atual: DrePecuaria | null;
  meta: DrePecuaria | null;
  /** Os anteriores, do MAIS RECENTE ao mais antigo — como `useDrePecuariaLista` devolve. */
  anos: readonly { de: string; ate: string; dre: DrePecuaria | null; carregando: boolean }[];
  periodoRotulo: string;
  clienteNome: string;
  /** A primeira unidade marcada nos chips do DRE — o modal abre nela. */
  unidadeInicial: UnidadePec;
  onFechar: () => void;
}) {
  /* ⚠ TODOS OS HOOKS ANTES DE QUALQUER `return` — o modal tem saída antecipada (`!recorte`), e um
     `useMemo` abaixo dela é o React #310 que derrubou duas telas em 21/09. */
  const [unidade, setUnidade] = useState<UnidadePec>(unidadeInicial);
  const [selecionada, setSelecionada] = useState<string | null>(null);
  /**
   * A LINHA QUE O MODAL ESTÁ MOSTRANDO, que pode não ser a que a grade abriu — item 11.
   *
   * ⚠ NAVEGAR É TROCAR DE ESTADO, NÃO DE MODAL: clicar numa fatia do donut abre a filha AQUI, com
   * a mesma leitura já em memória. Um segundo modal por cima custaria uma remontagem, perderia a
   * unidade e a safra escolhidas e empilharia caixas sobre caixas.
   * ⚠ E A PROFUNDIDADE É A DA GRADE: grupo › filha, nunca mais. Uma filha não tem filhas.
   */
  const [navegado, setNavegado] = useState<RecorteHistoricoPec | null>(null);
  const alvo = navegado ?? recorte;
  /**
   * CONTRA O QUE A ÚLTIMA COLUNA COMPARA — DRE-HISTORICO-LINHA-01c.
   *
   * ⚠ O SELETOR MORA NO CABEÇALHO DA PRÓPRIA COLUNA, não numa barra de controles: a pergunta
   * "comparado com o quê?" nasce olhando aquele número, e um controle longe dali faria o operador
   * procurar o que ele acabou de ler.
   * ⚠ E A ESCOLHA ATRAVESSA A NAVEGAÇÃO: quem está comparando filhas contra o ano anterior quer
   * seguir comparando ao trocar de irmã. Ela volta a "meta" quando o modal abre de novo.
   */
  const [refDelta, setRefDelta] = useState<RefDelta>('meta');

  /* ⚠ ABRIR É RECOMEÇAR: a unidade volta à do DRE, a safra ao período da tela e o caminho à linha
     que a grade clicou. Sem isso, o modal da segunda linha abriria onde o operador parou na
     primeira. */
  useEffect(() => {
    if (aberto) { setUnidade(unidadeInicial); setSelecionada(null); setNavegado(null); setRefDelta('meta'); }
  }, [aberto, unidadeInicial, recorte?.chave, recorte?.centro]);

  const def = useMemo(
    () => LINHAS_PEC.find(d => d.chave === alvo?.chave) ?? null, [alvo?.chave]);
  const natureza: Natureza = def?.tom === 'custo' ? 'custo' : 'receita';
  const cores = CORES[natureza];

  /** A série, em ORDEM CRONOLÓGICA: o mais antigo à esquerda, o período da tela, a meta por último. */
  const pontos = useMemo((): Ponto[] => {
    const anteriores = [...anos].reverse().map((a, i): Ponto => ({
      chave: `ano-${i}`,
      rotulo: rotuloCurtoDoAno(a.de, a.ate),
      rotuloLongo: rotuloCurtoPeriodo(a.de, a.ate),
      linhas: linhasDoEscopo(a.dre, alvo?.fazendaId ?? null),
      meses: a.dre?.periodo.meses ?? 0,
    }));
    /* ⚠ O EIXO DO PERÍODO DA TELA SAI DO `periodo` DA RPC, não do rótulo que a página escreveu: é o
       mesmo par (de, ate) que gerou as colunas anteriores, então as sete colunas falam a mesma
       língua. O rótulo bonito da página vira o `title`. */
    const doAtual: Ponto = {
      chave: 'atual',
      rotulo: atual ? rotuloCurtoDoAno(atual.periodo.de, atual.periodo.ate) : periodoRotulo,
      rotuloLongo: periodoRotulo,
      linhas: linhasDoEscopo(atual, alvo?.fazendaId ?? null),
      meses: atual?.periodo.meses ?? 0,
    };
    const daMeta: Ponto = {
      chave: 'meta', rotulo: 'Meta', rotuloLongo: `Meta · ${periodoRotulo}`,
      linhas: linhasDoEscopo(meta, alvo?.fazendaId ?? null),
      meses: meta?.periodo.meses ?? doAtual.meses, meta: true,
    };
    return [...anteriores, doAtual, daMeta];
  }, [anos, atual, meta, periodoRotulo, alvo?.fazendaId]);

  const escolhida = selecionada ?? 'atual';
  const pontoEscolhido = useMemo(
    () => pontos.find(p => p.chave === escolhida) ?? null, [pontos, escolhida]);

  const donut = useMemo(
    () => baseDoDonut(pontoEscolhido?.linhas ?? null, alvo, def),
    [pontoEscolhido, alvo, def]);


  /** As fatias desenhadas: as 5 maiores mais "Outros" — um anel de vinte fatias não se lê. */
  const fatias = useMemo(() => {
    if (!donut) return [];
    const ordenadas = [...donut.fatias].filter(f => f.valor > 0).sort((a, b) => b.valor - a.valor);
    if (ordenadas.length <= MAX_FATIAS + 1) return ordenadas;
    const cabeca = ordenadas.slice(0, MAX_FATIAS);
    const cauda = ordenadas.slice(MAX_FATIAS).reduce((a, f) => a + f.valor, 0);
    /* ⚠ A FATIA CLICADA NUNCA VAI PARA "Outros": ela é o motivo do modal estar aberto. */
    const destaqueFora = donut.destaque && !cabeca.some(f => f.nome === donut.destaque)
      ? ordenadas.find(f => f.nome === donut.destaque) : null;
    const base = destaqueFora ? [...cabeca.slice(0, MAX_FATIAS - 1), destaqueFora] : cabeca;
    const somaCauda = ordenadas.filter(f => !base.includes(f)).reduce((a, f) => a + f.valor, 0);
    return [...base, { nome: 'Outros', valor: destaqueFora ? somaCauda : cauda }];
  }, [donut]);

  if (!aberto || !alvo) return null;

  const chave = alvo.chave;
  /* ⚠ DENTRO DO MODAL OS NOMES SÃO NOMES: sem "(−)" e sem "=", que são gramática da cascata. */
  const nomeDaLinha = semPrefixo(alvo.rotulo);
  const ehResultado = ehLinhaDeResultado(def, alvo.centro);
  const paiRotulo = alvo.centro !== null ? semPrefixo(def?.rotulo ?? '') : null;
  /** O caminho: só a linha, ou "pai › filha" — e o pai é clicável, que é a volta. */
  const voltarAoPai = alvo.centro !== null && def
    ? () => setNavegado({ ...alvo, centro: null, rotulo: def.rotulo })
    : null;
  /**
   * QUEM NAVEGA É QUEM TEM CENTROS — o grupo E as filhas dele.
   *
   * ⚠ A REGRA ANTERIOR ("só o grupo desce; andar de lado não navega") ERA MINHA E ESTAVA ERRADA,
   * e a homologação de 23/09 mostrou onde: dentro de Nutrição a legenda lista Sanidade e Pastagem,
   * com o nome escrito e a cor ao lado, e clicar nelas não fazia nada. Quem está comparando centros
   * quer ir de um a outro — obrigá-lo a subir ao pai e descer de novo é fazer duas viagens onde o
   * dado já está em memória. Legenda que mostra um nome navegável navega.
   * ⚠ O QUE CONTINUA SEM CLIQUE é o anel que não lista linha nenhuma da cascata: o do subtotal e o
   * do topo sem filhas mostram o VBP, e "restante do VBP" não é lugar nenhum. Ali a fatia não tem
   * `centro`, e é isso — não o tipo da linha — que decide. O cursor só vira mão onde há para onde
   * ir; um ponteiro que não leva a lugar nenhum é promessa quebrada.
   */
  const podeNavegar = !!def?.expande;
  const abrirFilha = (centro: string | undefined) => {
    if (!podeNavegar || !centro) return;
    setNavegado({
      chave: alvo.chave, centro,
      rotulo: centro === '(sem)' ? 'sem centro' : centro,
      fazendaId: alvo.fazendaId, fazendaNome: alvo.fazendaNome,
    });
  };

  /**
   * ⚠ A ALTURA DA BARRA É O NÚMERO QUE ESTÁ ESCRITO NELA, não o R$ por trás dele — e isto era um
   * defeito: a altura vinha de `v` (sempre reais) enquanto o rótulo mostrava R$/ha. Como cada ano
   * tem a sua área, a proporção das barras não era a proporção dos números em nenhuma unidade
   * senão o R$. Agora as duas saem do mesmo texto.
   */
  /* ⚠ UMA FÁBRICA SÓ PARA AS DUAS METADES: a barra de R$ e a de % do VBP diferem no TEXTO, não na
     regra — mesma cor, mesma seleção, mesmo tracejado de meta, mesma razão. Duas listas escritas à
     mão divergiriam no primeiro ajuste. */
  const fazerBarras = (
    valor: (p: Ponto) => string, sufixo: string, abreviarTexto = true,
  ): BarraCompacta[] => pontos.map(p => {
    const t = valor(p);
    const n = t === traco ? null : numeroDoTexto(t);
    const c = coresDoSinal(n, natureza);
    return {
      rotulo: p.rotulo,
      rotuloLongo: p.rotuloLongo,
      valor: n,
      texto: abreviarTexto ? abreviar(t) : t,
      title: t === traco ? 'sem dado' : `${p.rotuloLongo} · ${sufixo} ${t}`,
      meta: p.meta,
      cor: p.meta ? undefined : (p.chave === escolhida ? c.barra : c.barraFraca),
      corTexto: p.meta ? 'text-amber-600' : c.texto,
    };
  });

  const barras = fazerBarras(
    p => texto(unidade, valorDoRecorte(p.linhas, alvo), p, chave), ROTULO_UNIDADE[unidade]);

  /* ⚠ O % DO VBP VEM DA MESMA CONTA DA GRADE (`percentual`, do módulo neutro), não de uma divisão
     escrita aqui: é a linha "% do VBP" que o DRE já mostra embaixo dos subtotais. */
  const pctDoVbp = (p: Ponto): string => {
    if (!p.linhas) return traco;
    const v = valorDoRecorte(p.linhas, alvo);
    const base = valorDe(p.linhas, BASE_DO_PERCENTUAL);
    return v == null || base == null ? traco : percentual(v, base);
  };
  /* ⚠ O TEXTO DO PERCENTUAL VEM COM " %" COLADO, e o número de volta tem de vir sem ele — senão a
     barra não tem altura e o gráfico inteiro fica raso. */
  /* ⚠ O NÚMERO VAI PARA A ALTURA, O SÍMBOLO VOLTA PARA O RÓTULO: sem tirar o " %", a barra não
     tem altura (o texto não vira número); sem devolvê-lo, o gráfico mostra "57,3" e o operador não
     sabe se é percentual, reais ou arroba. */
  const barrasPct = fazerBarras(p => soNumeroPct(pctDoVbp(p)), '% do VBP', false)
    .map(b => ({ ...b, texto: b.valor == null ? traco : `${b.texto} %` }));
  const barrasRs = fazerBarras(
    p => texto('rs', valorDoRecorte(p.linhas, alvo), p, chave), 'R$');

  const valorDonut = donut?.valorLinha ?? null;
  const pctDonut = donut && donut.total > 0 && valorDonut != null
    ? percentual(Math.abs(valorDonut), donut.total) : traco;
  const corDaFatia = (_i: number, nome: string) => {
    if (donut?.destaque && nome === donut.destaque) return cores.fatia;
    const i = fatias.findIndex(f => f.nome === nome);
    return CORES_FATIA[i % CORES_FATIA.length];
  };

  return (
    <Dialog open={aberto} onOpenChange={o => { if (!o) onFechar(); }}>
      {/* ⚠ LARGURA FIXA: trocar unidade ou safra não pode mexer no tamanho de nada — o operador
          compara números, e uma caixa que respira a cada clique desfaz a comparação. */}
      <DialogContent className="max-w-3xl gap-0 overflow-hidden p-0 [&>button.absolute]:hidden">
        {/* ⚠ O CABEÇALHO AZUL É O DO `PecLancamentosModal`, o vizinho desta mesma tela. */}
        <div className="flex items-start justify-between gap-2 bg-primary px-4 py-2.5 text-primary-foreground">
          <div className="min-w-0">
            {/* ⚠ O TÍTULO É O CAMINHO, e o pai é um botão — mas ELE NÃO PARECIA UM, e foi isso que a
                homologação de 23/09 pegou. Medido na tela: o alvo tinha 60×15px, mesma cor e mesmo
                peso do resto do título, sublinhado só no hover. O clique FUNCIONAVA em cima do
                texto; fora dele, nada — e um controle que só existe depois que o ponteiro o
                encontra é, para quem usa, um controle que não existe.
                ⚠ AGORA ELE SE ANUNCIA: sublinhado pontilhado em repouso, sólido no hover, e o alvo
                cresce com `px-1 py-0.5` puxado de volta por `-mx-1`, para o texto não andar. O "›"
                segue sendo separador, não alvo. */}
            <h2 className="flex items-center gap-1 truncate text-[13px] font-medium leading-tight">
              {voltarAoPai && (
                <>
                  {/* ⚠ E UM BOTÃO "‹ Voltar" AO LADO, com o chevron da casa: quem volta não deveria
                      precisar mirar no nome do pai. Os dois fazem a mesma coisa; o que muda é que
                      este se acha sem procurar. */}
                  <button type="button" onClick={voltarAoPai}
                    aria-label={`Voltar para ${paiRotulo}`} title={`Voltar para ${paiRotulo}`}
                    className="-ml-1 flex shrink-0 items-center gap-0.5 rounded px-1 py-0.5 text-[11px]
                      font-normal text-primary-foreground/80 hover:bg-white/10 hover:text-primary-foreground">
                    <ChevronLeft className="h-3 w-3" /> Voltar
                  </button>
                  <button type="button" onClick={voltarAoPai}
                    aria-label={`Voltar para ${paiRotulo}`} title={`Voltar para ${paiRotulo}`}
                    className="-mx-1 shrink-0 rounded px-1 py-0.5 underline decoration-dotted
                      underline-offset-2 hover:bg-white/10 hover:decoration-solid">
                    {paiRotulo}
                  </button>
                  <span className="shrink-0 text-primary-foreground/70">›</span>
                </>
              )}
              <span className="truncate">{nomeDaLinha} · histórico</span>
            </h2>
            <div className="mt-0.5 truncate text-[11px] text-primary-foreground/80">
              {[clienteNome, alvo.fazendaId === null ? 'Global' : alvo.fazendaNome,
                paiRotulo ? `dentro de ${paiRotulo}` : null].filter(Boolean).join(' · ')}
            </div>
          </div>
          <button type="button" onClick={onFechar} aria-label="Fechar"
            className="shrink-0 text-primary-foreground/80 hover:text-primary-foreground">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="max-h-[75vh] overflow-auto px-4 py-3">
          {/* ⚠ SEM CHIPS NO MODO RESULTADO: um resultado não se lê por hectare nem por arroba — essa
              é leitura de custo. O espaço fica reservado para a altura não mudar entre os dois
              modos do mesmo modal. */}
          <div className="mb-2 flex items-center justify-between gap-2" style={{ minHeight: 22 }}>
            {!ehResultado && (
              <Segmentado altura={22} valor={unidade} onEscolher={setUnidade}
                opcoes={UNIDADES_PEC.map(u => ({ valor: u, rotulo: ROTULO_UNIDADE[u] }))} />
            )}
          </div>

          {/* ⚠ DUAS METADES IGUAIS, topo alinhado: elas respondem perguntas diferentes sobre a MESMA
              linha, e nenhuma manda na outra. No modo resultado são dinheiro e peso no VBP; nos
              demais, a evolução e a composição. */}
          {ehResultado ? (
            <div className="grid grid-cols-2 items-start gap-3">
              {/* ⚠ EIXO ZERO NAS DUAS: um resultado desce abaixo de zero, e desenhar isso como
                  barra curta para cima seria mostrar prejuízo como lucro pequeno. */}
              <BarrasCompactas barras={barrasRs} titulo={`${nomeDaLinha} · R$`}
                altura={150} larguraMax={330} preencherLargura larguraBarra={22} fonteValor={9}
                eixoZero onClickBarra={i => setSelecionada(pontos[i]?.chave ?? null)}
                legenda={`${pontoEscolhido?.rotuloLongo ?? ''} · R$ ${texto('rs', valorDoRecorte(pontoEscolhido?.linhas ?? null, alvo), pontoEscolhido ?? pontos[0], chave)}`} />
              <BarrasCompactas barras={barrasPct} titulo={`${nomeDaLinha} · % do VBP`}
                altura={150} larguraMax={330} preencherLargura larguraBarra={22} fonteValor={9}
                eixoZero onClickBarra={i => setSelecionada(pontos[i]?.chave ?? null)}
                legenda={`${pontoEscolhido?.rotuloLongo ?? ''} · ${pontoEscolhido ? pctDoVbp(pontoEscolhido) : traco}`} />
            </div>
          ) : (
          <div className="grid grid-cols-2 items-start gap-3">
            <BarrasCompactas barras={barras} titulo={`${nomeDaLinha} · ${ROTULO_UNIDADE[unidade]}`}
              altura={150} larguraMax={330} preencherLargura larguraBarra={22} fonteValor={9}
              onClickBarra={i => setSelecionada(pontos[i]?.chave ?? null)} />

            <div className="flex flex-col gap-1">
              <div className="flex items-baseline justify-between gap-2">
                {/* ⚠ O SÍMBOLO VEM ANTES DO NÚMERO E A UNIDADE DEPOIS, colada: "R$ 33,73/cab/mês".
                    Era "Custo fixo R$/cab/mês 33,73" — o denominador no meio separava o nome do
                    número que ele qualifica. `ROTULO_UNIDADE` já traz "R$/cab/mês"; o que vai
                    adiante é o que vem depois do "R$". */}
                <span className={cn('truncate text-[13px] font-medium', cores.texto)}>
                  {nomeDaLinha} · R$ {texto(unidade, valorDonut, pontoEscolhido ?? pontos[0], chave)}
                  <span className="text-[11px] font-normal">{ROTULO_UNIDADE[unidade].slice(2)}</span>
                </span>
                <span className="shrink-0 text-[11px] text-muted-foreground"
                  title={pontoEscolhido?.rotuloLongo ?? ''}>{pontoEscolhido?.rotuloLongo ?? ''}</span>
              </div>
              <div className="flex items-center gap-2">
                {/* ⚠ O ANEL INTEIRO É A PORTA quando há filhas: clicar numa fatia abre aquela linha
                    aqui mesmo. O `recharts` não devolve qual fatia foi clicada sem um `onClick` por
                    `Cell`, e o `Donut` é compartilhado — então quem navega é a LEGENDA, que tem o
                    nome escrito e é onde o dedo vai. A fatia segue mostrando a cor e a proporção. */}
                <Donut dados={fatias} cor={corDaFatia} total={donut?.total ?? 0} rotuloTotal=""
                  tamanho={140}
                  centro={<span className="text-[15px] font-medium tabular-nums">{pctDonut}</span>} />
                {/* ⚠ LEGENDA DE LARGURA FIXA E UMA LINHA POR ITEM: um nome de centro comprido
                    quebraria a linha e empurraria o donut para cima — o modal mudaria de altura ao
                    trocar de safra, que é o oposto do que se pede dele. */}
                <div className="flex w-[130px] shrink-0 flex-col gap-0.5">
                  {fatias.map((f, i) => {
                    const navegavel = podeNavegar && !!f.centro;
                    return (
                      <div key={f.nome}
                        className={cn('flex items-center gap-1 text-[9px] leading-[12px]',
                          navegavel && 'cursor-pointer hover:underline')}
                        onClick={navegavel ? () => abrirFilha(f.centro) : undefined}>
                        <span className="h-[7px] w-[7px] shrink-0 rounded-[2px]"
                          style={{ backgroundColor: corDaFatia(i, f.nome) }} />
                        {/* ⚠ SEM O "=" TAMBÉM AQUI: era o resíduo do item 5 do fix1 — a fatia da
                            própria linha, num subtotal, entrava na legenda com o prefixo da
                            cascata ("= Margem de contribuição"). O dado guarda o rótulo como a
                            grade o escreve; quem tira o sinal é a apresentação. */}
                        <span className="truncate whitespace-nowrap"
                          title={navegavel ? `ver o histórico de ${semPrefixo(f.nome)}` : semPrefixo(f.nome)}>
                          {semPrefixo(f.nome)}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>
          )}

          <TabelaHistorico pontos={pontos} recorte={alvo} chave={chave} escolhida={escolhida}
            unidade={unidade} cores={cores} natureza={natureza}
            paiRotulo={donut?.rotuloBase ?? null}
            modo={ehResultado ? 'resultado' : 'unidades'}
            refDelta={refDelta} onRefDelta={setRefDelta} />
        </div>

        {/* ⚠ O RODAPÉ AZUL SAIU (homologação de 22/09, item 9): uma faixa de duas linhas para
            declarar três divisores comia a altura do gráfico que se veio ver. A DECLARAÇÃO NÃO SAIU
            COM ELE — ela mudou de lugar: cada linha de unidade da tabela leva o seu divisor no
            `title`, que é onde a pergunta nasce (Art. 19). */}
      </DialogContent>
    </Dialog>
  );
}

/* ⚠ A TABELA É A PROVA DO GRÁFICO: as quatro unidades do mesmo número, safra a safra. Quem
   desconfiar da barra confere aqui — e é ela que leva o Δ contra a meta. */
function TabelaHistorico({
  pontos, recorte, chave, escolhida, unidade, cores, natureza, paiRotulo,
  modo, refDelta, onRefDelta,
}: {
  pontos: readonly Ponto[];
  recorte: RecorteHistoricoPec;
  chave: ChaveLinhaPec;
  escolhida: string;
  unidade: UnidadePec;
  cores: typeof CORES[Natureza];
  natureza: Natureza;
  paiRotulo: string | null;
  /** `'resultado'` troca as quatro unidades por R$ · % do VBP · VBP. */
  modo: 'unidades' | 'resultado';
  refDelta: RefDelta;
  onRefDelta: (r: RefDelta) => void;
}) {
  /* ⚠ LARGURAS DECLARADAS, e a primeira cabe "R$/cab/mês" com folga: com `table-layout: fixed` o
     `<colgroup>` é a única autoridade, e um cabeçalho truncado ali é dado escondido. */
  const W_UNIDADE = 88;
  const W_PONTO = 72;
  const W_DELTA = 78;
  const doPonto = (chavePonto: string, u: UnidadePec) => {
    const p = pontos.find(x => x.chave === chavePonto);
    return p ? texto(u, valorDoRecorte(p.linhas, recorte), p, chave) : traco;
  };
  /**
   * ⚠ O ANO ANTERIOR É O VIZINHO DA ESQUERDA, não "o primeiro da lista": com a série em ordem
   * cronológica, o que vem imediatamente antes do período da tela é o ano anterior — e é assim que
   * ele continua certo se o número de anos mudar.
   */
  const iAtual = pontos.findIndex(p => p.chave === 'atual');
  const chaveRef = refDelta === 'meta' ? 'meta' : (pontos[iAtual - 1]?.chave ?? '');
  const pctDoPontoPorChave = (chavePonto: string) => {
    const p = pontos.find(x => x.chave === chavePonto);
    return p ? pctDoVbp(p) : traco;
  };
  const pctDoVbp = (p: Ponto): string => {
    if (!p.linhas) return traco;
    const v = valorDoRecorte(p.linhas, recorte);
    const base = valorDe(p.linhas, BASE_DO_PERCENTUAL);
    return v == null || base == null ? traco : percentual(v, base);
  };
  const vbpDoPonto = (p: Ponto) => {
    const b = p.linhas ? valorDe(p.linhas, BASE_DO_PERCENTUAL) : null;
    return b == null ? traco : formatNum(b, 2);
  };
  /**
   * ⚠ O Δ É DE CADA UNIDADE, não o do R$ repetido — fix1 da homologação. Ele muda de linha para
   * linha porque a meta tem os DIVISORES dela: 4.813,6 ha contra 4.824,3 do realizado na NJ 2026.
   * Mostrar o Δ do R$ na linha do R$/ha afirmaria uma variação que aquela divisão não produz.
   */
  const deltaDaUnidade = (u: UnidadePec) => deltaMeta(
    numeroDoTexto(doPonto('atual', u)), numeroDoTexto(doPonto(chaveRef, u)), natureza);
  const semMeta = pontos.find(p => p.chave === 'meta');
  const largura = W_UNIDADE + pontos.length * W_PONTO + W_DELTA;

  /** A linha de percentual: o peso da linha na base, ponto a ponto. */
  const pctDoPonto = (p: Ponto) => {
    if (!p.linhas) return traco;
    const v = valorDoRecorte(p.linhas, recorte);
    const bloco = BLOCO_DA_LINHA[chave];
    const base = recorte.centro !== null && bloco
      ? centrosDoBloco(p.linhas, bloco).reduce((a, c) => a + Math.abs(c.valor), 0)
      : Math.abs(valorDe(p.linhas, BASE_DO_PERCENTUAL) ?? 0);
    return v == null ? traco : percentual(Math.abs(v), base);
  };

  return (
    <div className="mt-3 overflow-x-auto">
      <table className="border-collapse text-[11px] leading-none" style={{ tableLayout: 'fixed', width: largura }}>
        <colgroup>
          <col style={{ width: W_UNIDADE }} />
          {pontos.map(p => <col key={p.chave} style={{ width: W_PONTO }} />)}
          <col style={{ width: W_DELTA }} />
        </colgroup>
        <thead>
          <tr style={{ height: 18 }} className="bg-muted">
            <th className="truncate whitespace-nowrap px-[7px] text-left text-[9px] font-medium text-muted-foreground">Unidade</th>
            {pontos.map(p => (
              <th key={p.chave}
                className={cn('truncate px-[7px] text-right text-[9px] font-medium',
                  p.meta ? 'text-amber-600' : 'text-muted-foreground',
                  p.chave === escolhida && !p.meta && cores.coluna)}
                title={p.rotuloLongo}>
                {p.rotulo}
              </th>
            ))}
            {/* ⚠ O CABEÇALHO É O CONTROLE — DRE-HISTORICO-LINHA-01c: a pergunta "comparado com o
                quê?" nasce olhando a coluna, e um seletor noutro canto faria procurar o que se
                acabou de ler. O menu é o `DropdownMenu` da casa; nada novo foi desenhado. */}
            <th className="truncate px-[7px] text-right text-[9px] font-medium text-muted-foreground">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button type="button"
                    title={refDelta === 'meta'
                      ? 'o período da tela contra a meta — clique para trocar a referência'
                      : 'o período da tela contra o ano anterior — clique para trocar a referência'}
                    className="rounded px-0.5 underline decoration-dotted underline-offset-2
                      hover:bg-muted hover:decoration-solid">
                    {ROTULO_REF[refDelta]} ▾
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="min-w-[128px]">
                  <DropdownMenuItem className="text-[10px]" onClick={() => onRefDelta('meta')}>
                    {ROTULO_REF.meta}
                  </DropdownMenuItem>
                  <DropdownMenuItem className="text-[10px]" onClick={() => onRefDelta('ano')}>
                    {ROTULO_REF.ano}
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </th>
          </tr>
        </thead>
        <tbody>
          {/* ⚠ O MODO RESULTADO TROCA AS LINHAS, NÃO A TABELA: o cabeçalho, as larguras, o seletor
              de Δ e a coluna da safra escolhida são os mesmos — o que muda é o que cada linha diz.
              Duas tabelas escritas à parte divergiriam na primeira mudança de régua. */}
          {modo === 'resultado' && <>
            <LinhaDaTabela rotulo="R$" forte abreviarValor pontos={pontos} escolhida={escolhida} cores={cores} natureza={natureza}
              valor={p => texto('rs', valorDoRecorte(p.linhas, recorte), p, chave)}
              delta={deltaMeta(numeroDoTexto(doPonto('atual', 'rs')), numeroDoTexto(doPonto(chaveRef, 'rs')), natureza)} />
            {/* ⚠ O Δ DE UM PERCENTUAL É EM PONTOS PERCENTUAIS, e por isso ele não passa por
                `deltaMeta`: 40 % contra 20 % não é "100 % a mais" nesta leitura — são 20 pontos. A
                variação relativa de uma razão engana quem compara margens. */}
            <LinhaDaTabela rotulo="% do VBP" pontos={pontos} escolhida={escolhida} cores={cores} natureza={natureza}
              title="quanto esta linha pesa no Valor Bruto da Produção do mesmo período"
              valor={pctDoVbp}
              delta={deltaEmPontos(
                numeroDoTexto(soNumeroPct(pctDoPontoPorChave('atual'))),
                numeroDoTexto(soNumeroPct(pctDoPontoPorChave(chaveRef))), natureza)} />
            {/* ⚠ O VBP ENTRA COMO REFERÊNCIA, sem Δ: ele é o denominador da linha de cima, e sem
                ele o percentual não se refaz (Art. 19). Comparar o denominador com a meta seria
                outra pergunta, de outra linha do DRE. */}
            <LinhaDaTabela rotulo="VBP" referencia abreviarValor pontos={pontos} escolhida={escolhida} cores={cores} natureza={natureza}
              title="o denominador do percentual acima — o VBP daquele período"
              valor={vbpDoPonto} delta={null} />
          </>}
          {/* ⚠ AS QUATRO UNIDADES USAM A MESMA LINHA DO MODO RESULTADO — o divisor no `title` da
              primeira célula (Art. 19, desde que o rodapé saiu), o Δ de CADA uma e a abreviação só
              na de R$, que é a única que chega aos milhões. */}
          {modo === 'unidades' && UNIDADES_PEC.map(u => (
            <LinhaDaTabela key={u} rotulo={ROTULO_UNIDADE[u]} title={DIVISOR_DA_UNIDADE[u]}
              forte={u === unidade} abreviarValor={u === 'rs'}
              pontos={pontos} escolhida={escolhida} cores={cores} natureza={natureza}
              valor={p => texto(u, valorDoRecorte(p.linhas, recorte), p, chave)}
              delta={deltaDaUnidade(u)} />
          ))}
          {/* ⚠ A ÚLTIMA LINHA É O PESO, e ela fecha a pergunta do modal: a evolução acima, o peso
              aqui, na mesma tabela e safra a safra. No modo resultado ela já é a linha do meio. */}
          {modo === 'unidades' && (
          <tr style={{ height: 16 }} className="border-t border-border/60 bg-muted/40">
            <td className="truncate px-[7px] text-[9px] text-muted-foreground"
              title={paiRotulo ?? undefined}>
              % do {recorte.centro !== null ? 'bloco' : 'VBP'}
            </td>
            {pontos.map(p => (
              <td key={p.chave}
                className={cn('truncate px-[7px] text-right text-[9px] tabular-nums text-muted-foreground',
                  p.chave === escolhida && !p.meta && cores.coluna)}>
                {pctDoPonto(p)}
              </td>
            ))}
            <td />
          </tr>
          )}
        </tbody>
      </table>
      {!semMeta && <div className="mt-1 text-[9px] text-muted-foreground">sem meta no período</div>}
    </div>
  );
}
