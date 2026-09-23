/**
 * A RÉGUA DA GRADE DO DRE — larguras, cores, células e as caixas da faixa.
 *
 * ⚠ CÓDIGO MOVIDO, COPIADO BYTE A BYTE de `AgriDreLavouraTab.tsx`, onde nasceu. Os comentários
 * abaixo são os de lá, inclusive as medições que os originaram — nada foi reescrito.
 * ⚠ ELE SAIU DA PÁGINA PORQUE A PECUÁRIA CHEGOU. Enquanto havia uma grade só, a régua podia
 * morar com ela; com duas, `PecDrePanel` passou a importar da página e a página a importar o
 * painel — ciclo de import, e o `madge` acusou (23 → 24). Um módulo neutro no meio quebra o
 * ciclo e diz a verdade sobre a peça: ela é DAS DUAS telas, não de uma.
 * ⚠ O QUE NÃO VEIO: `corDoTom` e `dinheiro` ficaram na página. O primeiro depende de `DefLinha`,
 * que é a cascata da lavoura; o segundo só a faixa usa.
 */
import type { CSSProperties, ReactNode } from 'react';
import { Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
/* ⚠ RECHARTS ENTRA AQUI COM O `Donut` — DRE-HISTORICO-LINHA-01a. Ele já era dependência da casa
   (36 telas) e já desenhava ESTE donut no `RateioDetalheModal`; o que muda é o endereço. */
import { PieChart, Pie, Cell } from 'recharts';
import { formatNum, formatMoeda } from '@/lib/calculos/formatters';

/** O destaque de uma linha — subtotal, sub, ou nenhum. */
export type DestaqueLinha = 'subtotal' | 'sub' | null;

/** Os quatro papéis de uma linha na cascata do DRE. */
export type TipoLinha = 'subtotal' | 'grupo' | 'simples' | 'filha';

/**
 * A HIERARQUIA TIPOGRÁFICA DA GRADE — variante B, aprovada em 16/09.
 *
 * ⚠ ELA EXISTE PORQUE TUDO TINHA O MESMO TAMANHO: com 11px do subtotal à filha, a cascata virava
 * uma lista de dezoito linhas iguais e o olho tinha de LER para achar onde a conta fecha. Agora o
 * tamanho e o recuo dizem o papel antes da leitura — subtotal grande e sem recuo, filha pequena e
 * com dois recuos.
 * ⚠ AS ALTURAS FORAM CORRIGIDAS DEPOIS DA MEDIÇÃO, e vale registrar por quê. A primeira versão
 * (22/18/18/16) mantinha as fontes deste mock e fazia a grade CRESCER: nenhum tipo encolhia —
 * subtotal +4, filha +1, o resto igual —, e a raiz ia de 287 para 307px. O alvo era o contrário.
 * As fontes e os recuos ficaram como o mock aprovou; só as alturas desceram (20/16/16/14), e aí a
 * mesma hierarquia passa a caber em MENOS espaço que a grade uniforme de 18px que havia antes.
 * ⚠ O ESPAÇO SOBRA PORQUE `leading-none` DEIXA A ALTURA MANDAR: um subtotal de 12px ocupa 14px
 * com o padding, e cabe folgado em 20; a filha de 9px ocupa 12 com a borda tracejada, e cabe em
 * 14. Encurtar mais bateria no conteúdo — é o piso, não uma escolha de gosto.
 * ⚠ A RÉGUA DESCEU UM PONTO EM 22/09/2026 — DRE-PADRAO-01a, decisão do Gabriel. Subtotal 12→11,
 * grupo e simples 10→9, filha inalterada em 9, e a sub-coluna passou a 9,5 (ver `CelulaUnit`). O
 * alvo era duplo: aproximar a densidade das duas abas do DRE e fazer a visão x Anos caber em 1440
 * sem rolagem lateral — com as larguras de 96/64 abaixo, seis colunas somam exatamente 1200, que
 * é o container a 1440.
 * ⚠ AS ALTURAS NÃO MUDARAM (20/16/16/14), e isso é deliberado: a fonte menor sobra dentro delas
 * (`leading-none` deixa a altura mandar), então a grade não encolhe nem cresce — o que muda é a
 * respiração de cada linha, não o tamanho da tabela.
 * ⚠ O DRE INTEIRO DESCE DO PISO DE 10px, e é exceção declarada por decisão do Gabriel, não
 * descuido: antes só a filha (9px) era exceção. Fora do DRE, 10px continua sendo o piso — e
 * 9,5px, o da casa desde 17/09. Está registrado no CLAUDE.md com esta data.
 */
export const REGUA_LINHA: Record<TipoLinha,
  { fonte: number; peso: string; altura: number; recuo: number }> = {
  subtotal: { fonte: 11, peso: 'font-medium', altura: 20, recuo: 0 },
  grupo: { fonte: 9, peso: 'font-medium', altura: 16, recuo: 8 },
  simples: { fonte: 9, peso: 'font-normal', altura: 16, recuo: 8 },
  filha: { fonte: 9, peso: 'font-normal', altura: 14, recuo: 16 },
};

/**
 * O FUNDO DE UMA LINHA — e ele faz parte da RÉGUA DO SUBTOTAL, não é decoração à parte.
 *
 * ⚠ `'sub'` E `'subtotal'` PINTAM IGUAL desde o PR-11, e foi medição que mandou. Os cinco
 * subtotais da lavoura já saíam com 12px/500/20px idênticos — conferido nos cinco. O que fazia
 * "= Custo variável" parecer MAIOR que "= Margem de contribuição" era o fundo: `bg-muted/40`
 * contra `bg-muted`. Vermelho sobre quase-branco lê mais pesado que verde sobre a faixa cinza,
 * e o olho traduz contraste em tamanho.
 * ⚠ O `'sub'` CONTINUA NO TIPO porque ele é um FATO da cascata — "Custo variável" e "Receita
 * bruta" são somas parciais, não o fecho de um bloco. O que deixou de existir foi a diferença
 * VISUAL entre os dois; a distinção semântica fica, para o dia em que ela voltar a significar
 * algo na tela.
 */
export const fundoDaLinha = (d?: DestaqueLinha) => (d ? 'bg-muted' : 'bg-card');

/** O papel de uma linha: o destaque manda, depois o grupo, senão é simples. */
export const tipoDaLinha = (destaque?: DestaqueLinha, temBloco?: boolean): TipoLinha =>
  (destaque ? 'subtotal' : temBloco ? 'grupo' : 'simples');

/**
 * O PONTO ÂMBAR — e desde o PR-10 ele mora na coluna do NOME, não na célula de valor.
 *
 * ⚠ DENTRO DA CÉLULA ELE EMPURRAVA O NÚMERO: a coluna é alinhada à direita, e uma linha com ponto
 * ficava 7px mais curta que a de cima. Numa grade cuja função é comparar colunas de número, isso
 * é o pior lugar possível para um enfeite. Ao lado do nome ele diz a mesma coisa e não desloca
 * nada — a célula de valor volta a ter só o número.
 */
export function PontoRateio({ title = 'tem rateio dentro' }: { title?: string }) {
  return (
    <span title={title}
      className="ml-1 inline-block h-[6px] w-[6px] shrink-0 rounded-full align-middle"
      style={{ backgroundColor: AMBAR }} />
  );
}

/* AS LARGURAS SÃO O PIOR NÚMERO MEDIDO + 8 DE FOLGA + 14 DE PADDING — fix6 (23/09/2026).
   ⚠ AS DE ANTES ESTAVAM CALIBRADAS PARA O NÚMERO ERRADO. O DRE-PADRAO-01a (22/09) as mediu com
   "9.998.280,79" — sem sinal e sem marcador —, e no mesmo dia entraram a faixa t4 (67a79233) e o
   marcador ▲/▼ (204b2cc4), nenhum deles recalculando nada. O "= Lucro líquido" da Lavoura 25/26
   media 90,2px de texto numa caixa de 82 e invadia a coluna vizinha.
   ⚠ E O R$/ha JÁ ESTOURAVA SEM MARCADOR: "15.628,42" na Receita líquida media 50,7 numa caixa de
   50. O marcador agravou um defeito que a calibragem da coluna R$ não tinha visto na de R$/ha.
   ⚠ O PIOR CASO INCLUI O SLOT DO MARCADOR, que hoje é reservado em toda célula de valor (ver
   `L_MARCADOR`): uma coluna precisa caber o maior entre "número com marcador" e "número sem
   marcador + o slot vazio".
   ⚠ CUSTO ACEITO, decisão do Gabriel de 23/09: a x Anos da pecuária com cinco anos anteriores
   passa de 1080 para 1313 e rola na horizontal a 1440 (container de 1200). Quatro anos dão 1131 e
   todas as outras visões cabem. A conta antiga registrada aqui — 240 + 6 × (96+64) = 1200 — já
   estava desatualizada: o rótulo é 200 desde o 01a e a coluna de comparação é `W_REFERENCIA`. */
export const W_RS = 114;      // R$ por cultura
export const W_HA = 90;       // R$/ha
export const W_UN = 74;       // R$/unidade
export const W_RS_TOTAL = 114;

/**
 * A LARGURA MÍNIMA DE UM GRUPO DE COLUNA — DRE-UNIDADES-01b.
 *
 * ⚠ O GRUPO É O CABEÇALHO, NÃO A UNIDADE: quem manda na largura é o nome que fica por cima
 * (a fazenda, a cultura, o ano, o cenário), e ele não encolhe quando o produtor desmarca um
 * chip. Medido a 1126 com só o R$/@ marcado: o grupo caía a 64px, sobravam 49px de caixa de
 * texto e "Faz. Sto. Expedito" mede 85,9px a 10px/500 — o nome saía cortado em toda coluna.
 * ⚠ O PISO É O TÍTULO MAIS LONGO, NÃO O PADRÃO DE ABERTURA. Começou em 160 (96 + 64, a largura
 * de R$ + R$/ha) e desceu a 104 na homologação do Gabriel, 22/09 18:38: com um chip só, 160
 * deixava a coluna larga demais para o número que ela mostra, e a grade ficava rala. 104 são os
 * 85,9px de "Faz. Sto. Expedito" (o nome mais longo medido, a 10px/500) mais os 14 de padding e
 * uma folga de 4 — o piso é o que o CABEÇALHO precisa, e o número se acomoda nele.
 * ⚠ E A SOBRA SE DIVIDE POR IGUAL entre as colunas do grupo, nunca encostada numa só, com o
 * resto inteiro na primeira. Com 104 isso quase nunca acontece: duas unidades de 64 já somam
 * 128 e ficam como são. A regra vale para o grupo de coluna única.
 */
export const W_GRUPO_MIN = 104;

export function larguraDoGrupo(cols: readonly number[]): number[] {
  const soma = cols.reduce((a, b) => a + b, 0);
  if (cols.length === 0 || soma >= W_GRUPO_MIN) return [...cols];
  const base = Math.floor(W_GRUPO_MIN / cols.length);
  const resto = W_GRUPO_MIN - base * cols.length;
  return cols.map((_, i) => base + (i < resto ? 1 : 0));
}

/**
 * O VERDE DOS VALORES POSITIVOS — e ele NÃO é `text-success`.
 *
 * ⚠ MEDIDO: `--success` é hsl(145 63% 42%) = rgb(40,175,96), um verde claro que, em 11px sobre
 * `bg-card`, lê como cinza-esverdeado ao lado do vermelho. `green-700` (#15803d) é o verde que a
 * Conciliação usa para o mesmo significado — dinheiro que entrou —, e as duas telas passam a
 * dizer a mesma coisa com a mesma cor.
 * ⚠ `--success` CONTINUA VÁLIDO NA CASA e não foi tocado: a troca é desta grade, onde o tamanho
 * da fonte é o problema, não do token.
 */
/**
 * AS FAIXAS DOS TOTAIS — azul progressivo, DRE-CASCATA-03b.
 *
 * ⚠ A CASCATA TEM DEGRAUS, e a faixa os mostra sem precisar ler: quanto mais fundo na conta, mais
 * escuro o azul, até o lucro líquido em azul cheio. Antes os oito subtotais dividiam um `bg-muted`
 * só e o olho tinha de LER para saber onde a conta fecha.
 * ⚠ SÃO TONS SÓLIDOS, NÃO `bg-primary/10`, e a razão é o `sticky`: a coluna de rótulos e a do
 * Total flutuam sobre as outras ao rolar, e a regra permanente do CLAUDE.md exige fundo OPACO ali
 * — com 10% de opacidade o conteúdo passa por baixo do número que se está conferindo. As três
 * primeiras são o navy do `--primary` (213 52% 24%) clareado em L, calculado uma vez e escrito
 * como hex, no mesmo idioma de `NAVY_TOTAL` e `FUNDO_TOTAL`, que já são hex por este motivo.
 * ⚠ O ÚLTIMO É O `bg-primary` DE VERDADE (opaco, sem alfa) e inverte o texto: navy cheio com
 * texto escuro não se lê.
 */
export const FAIXA_TOTAL: Record<'t1' | 't2' | 't3' | 't4',
  { fundo: string; texto?: string; positivo?: string; negativo?: string }> = {
  t1: { fundo: 'bg-[#e9eff6]' },
  t2: { fundo: 'bg-[#d3e0ed]' },
  t3: { fundo: 'bg-[#b6cade]' },
  /**
   * ⚠ NO AZUL CHEIO O NÚMERO É BRANCO, SEMPRE — item 13, e ele substitui duas tentativas anteriores.
   * A primeira deixou o número preto (a faixa "já destaca"): um prejuízo de 6,2 milhões saía da
   * mesma cor de um lucro. A segunda pintou o sinal em tom claro: `text-red-300` sobre o navy dá
   * contraste baixo e o número mais importante da tela ficava o mais difícil de ler. Branco tem o
   * contraste máximo que esta faixa permite, e o sinal passou a ser um MARCADOR ao lado do número
   * (ver `marcadorDoTotal`) — um glifo colorido não precisa ser lido, só visto.
   */
  t4: { fundo: 'bg-primary', texto: 'text-primary-foreground' },
};

/** ⚠ O POSITIVO DE UM TOTAL É AZUL ESCURO, não verde (item 12): o verde é a cor da NATUREZA
    "receita" nas linhas comuns, e usá-lo também para "deu lucro" faria a mesma cor responder a duas
    perguntas na mesma coluna. */
export const AZUL_TOTAL = 'text-primary';
/** Os dois tons claros do marcador do t4 — literais, e é sobre o navy que eles foram escolhidos. */
export const MARCADOR_POSITIVO = '#8AE0B5';
export const MARCADOR_NEGATIVO = '#F4A9A9';

/**
 * A COR DE UM TOTAL — pelo SINAL, em qualquer faixa (03b-fix1, itens 12 e 13).
 *
 * ⚠ ELES ESTAVAM PRETOS, e era decisão minha: achei que a faixa bastava para destacar e neutralizei
 * o número. A homologação mostrou o custo disso — o "= Resultado com mercado" de −1,4 milhão do
 * Agnaldo saía na mesma cor de um resultado positivo, e a linha mais importante da tela deixava de
 * dizer a única coisa que ela precisa dizer de longe: deu ou não deu.
 */
export function corDoTotal(faixa: keyof typeof FAIXA_TOTAL, v: number | null): string {
  const f = FAIXA_TOTAL[faixa];
  if (f.texto) return f.texto;
  return v != null && v < 0 ? VERMELHO : AZUL_TOTAL;
}

/**
 * O MARCADOR DE SINAL DO AZUL CHEIO — ▲ ou ▼ à frente do número (item 13).
 *
 * ⚠ SÓ NO t4, e só ali porque só ali o número não pode mudar de cor. Nas outras faixas o próprio
 * número é azul ou vermelho, e um glifo a mais seria o mesmo recado duas vezes.
 * ⚠ ZERO E AUSÊNCIA NÃO TÊM MARCADOR: "não deu nem perdeu" e "não sei" não são sinal.
 */
export function marcadorDoTotal(faixa: keyof typeof FAIXA_TOTAL, v: number | null | undefined) {
  if (faixa !== 't4' || v == null || v === 0) return undefined;
  return v < 0 ? { glifo: '▼', cor: MARCADOR_NEGATIVO } : { glifo: '▲', cor: MARCADOR_POSITIVO };
}

/**
 * A LARGURA DO SLOT DO MARCADOR — fix6.
 *
 * ⚠ ELE É RESERVADO, NÃO ACRESCENTADO. Medido no preview, o glifo a 9px mais os 3px de respiro dão
 * 10,1px; sem reserva, esses 10px saíam do número justamente na linha do Lucro líquido, que é a
 * mais comprida da grade. Com o slot fixo, o número tem a MESMA caixa em toda linha da coluna —
 * com marcador, sem marcador ou em traço — e a largura da coluna pode ser calculada uma vez.
 */
export const L_MARCADOR = 10;

/**
 * O marcador desenhado — 9px, à frente do número, sem participar do alinhamento do tabular-nums.
 *
 * ⚠ O SLOT FICA VAZIO onde o marcador não veio, e essa é a REGRA, não a exceção: numa coluna de
 * valor todas as linhas o reservam e só as de t4 o preenchem. Por isso o padrão é reservar e quem
 * não quer pede `semSlot` — a coluna de Δ é a única: ali o marcador nunca existe em linha nenhuma,
 * e 10px de vão seriam espaço comprado e não usado.
 */
export function Marcador({ marcador, semSlot }: {
  marcador?: { glifo: string; cor: string };
  semSlot?: boolean;
}) {
  if (!marcador && semSlot) return null;
  return (
    <span aria-hidden className="inline-block text-center align-[1px]"
      style={{ fontSize: 9, width: L_MARCADOR, color: marcador?.cor }}>
      {marcador?.glifo ?? ''}
    </span>
  );
}
export type TomFaixa = keyof typeof FAIXA_TOTAL;

export const VERDE = 'text-green-700';
export const VERDE_70 = 'text-green-700/70';
/* ⚠ `text-red-600` E NÃO `text-destructive`: o token da casa é o vermelho de ERRO, e aqui o
   vermelho significa saída de caixa — um fato, não um alarme. Em 11px o destructive puxa para o
   laranja ao lado do verde novo; o par red-600/green-700 é o que a Conciliação já usa. */
export const VERMELHO = 'text-red-600';
export const VERMELHO_70 = 'text-red-600/70';

/** ⚠ A COR DO SUBTOTAL VEM DO PRÓPRIO NÚMERO, célula a célula: numa safra o amendoim pode fechar
    positivo e a mandioca negativa, e uma cor só para a linha mentiria sobre uma das duas. */
export const corDoSinal = (v: number | null) =>
  (v == null ? '' : v < 0 ? VERMELHO : VERDE);

export const traco = '—';
/** Com "R$" — para a faixa, os títulos e os `title`, onde não há cabeçalho declarando a unidade. */
const dinheiro = (v: number | null | undefined) => (v == null ? traco : formatMoeda(v));
/**
 * SEM "R$" — só dentro da grade, e a razão é a régua, medida no harness.
 *
 * ⚠ A UNIDADE JÁ ESTÁ NO CABEÇALHO: a segunda linha do thead é literalmente "R$ | R$/ha | R$/sc".
 * Repeti-la em cada célula não acrescenta informação e custa 17px por número — e a coluna tem
 * 104px, dos quais 90 são úteis. Medido: "R$ 2.925.162,25" ocupa 90,1px (estoura por 0,1px já no
 * dado real do NJ) e "R$ 12.345.678,90" ocupa 97,3px. Sem o prefixo, os mesmos números dão 73,1 e
 * 80,2 — e até 123.456.789,01 cabe, com 87,3. A régua de 104px do briefing só fecha assim.
 * ⚠ E ISTO NÃO É "NÚMERO CRU" (A19): dinheiro sem unidade é o que a regra proíbe, e aqui a
 * unidade é declarada uma vez, no alto da coluna, em vez de repetida mil vezes embaixo dela.
 */
export const numeroDaCelula = (v: number | null | undefined) => (v == null ? traco : formatNum(v, 2));
/** ⚠ DIVISÃO É A ÚNICA CONTA QUE O CONTRATO DEIXA AQUI. Denominador zero vira traço, não Infinity. */
export const porUnidade = (v: number | null | undefined, den: number) =>
  (v == null || !(den > 0) ? traco : formatNum(v / den, 2));

/* ⚠ A COLUNA TOTAL GANHA PESO PRÓPRIO (§9): cabeçalho um tom mais escuro que o navy das culturas,
   célula em cinza claro e uma borda de 2px à esquerda. Ela é a resposta da safra inteira e estava
   se lendo como só mais um grupo de cultura. O cinza é claro de propósito — a zebra e os fundos
   de subtotal continuam passando por cima. */
/**
 * A COR DAS LINHAS DE APOIO — "% do VBP" e "Lucro por hectare", nas duas telas (item 12).
 *
 * ⚠ ELAS DEIXARAM DE SER CINZA, e a razão é que elas deixaram de ser um rodapé: agora moram DENTRO
 * da faixa do total a que pertencem, como a segunda linha dele. Cinza dentro de uma faixa azul lê
 * como texto desligado — e o "Lucro por hectare" é justamente o número que o produtor procura
 * primeiro. Quem continua cinza é o RÓTULO; o valor segue o sinal, como o total acima dele.
 * ⚠ NO t4 A COR É A DA FAIXA (branco), e o sinal vem pelo marcador — ver `marcadorDoTotal`.
 */
export const corDoApoio = (v: number | null | undefined, faixa?: keyof typeof FAIXA_TOTAL) => {
  if (faixa && FAIXA_TOTAL[faixa].texto) return FAIXA_TOTAL[faixa].texto as string;
  return v != null && v < 0 ? VERMELHO : AZUL_TOTAL;
};

export const NAVY_TOTAL = '#2b3750';
/**
 * ⚠ A BORDA DO TOTAL VOLTOU A SER A DIVISÓRIA DA CASA (03b-fix1), de `2px solid #cbd5e1` para a
 * mesma `border-border/60` que separa todo grupo de coluna. A razão é de posição, não de gosto: no
 * §9 o Total era a ÚLTIMA coluna e os 2px marcavam o fim da grade; desde a §2a ele é a PRIMEIRA, e
 * a borda passou a encostar na `border-r` da coluna de rótulos — duas linhas somando 3px, mais
 * grossa e mais escura que qualquer outra divisória da tela, no lugar mais visível dela.
 * O peso próprio do Total continua existindo: fundo `FUNDO_TOTAL`, cabeçalho em navy escuro e
 * `font-medium`. Era a borda que sobrava.
 */
export const BORDA_TOTAL = '1px solid hsl(var(--border) / .6)';
/** A mesma divisória, do lado de dentro do cabeçalho navy — ali o que se lê é branco a 22%. */
export const BORDA_TOTAL_CAB = '1px solid rgba(255,255,255,.22)';
export const FUNDO_TOTAL = '#f1f5f9';

/**
 * Etiqueta pequena ao lado do rótulo — "estimado", "rateio".
 *
 * ⚠ 8px E `padding: 0 4px` DESDE O PR-06, e foi medição que mandou: com "inclui rateio" a 9px, as
 * linhas "(−) Custo fixo da lavoura" e "Investimento no período" passavam dos 210px da coluna
 * Cultura e a etiqueta quebrava para uma segunda linha, estourando a altura de 18px da linha.
 * O texto encolheu para "rateio" e a frase inteira foi para o `title`.
 */
export function Etiqueta({ texto, cor, title }: { texto: string; cor?: string; title?: string }) {
  return (
    <span title={title}
      className="ml-1 whitespace-nowrap rounded-[3px] border text-[8px] leading-[11px]"
      style={{ borderColor: cor ?? 'currentColor', color: cor, padding: '0 4px' }}>
      {texto}
    </span>
  );
}

export const AMBAR = '#b45309';

/**
 * A célula de R$.
 *
 * ⚠ SEM `overflow: hidden` e com `nowrap`: a coluna é FIXA em px, e o que não coubesse seria
 * cortado no meio do número — um "3.009.508," que parece um valor menor. Sobrando, o número
 * transborda e é visível; faltando, o operador vê e a régua se ajusta. Só a coluna Cultura
 * trunca, porque ali o corte tem `title` para desfazer.
 */
export function Celula({ valor, cor, destaque, bordaEsquerda, onAbrir, filha, fundo, estilo, total, title, fonte, faixa, marcador, semSlotMarcador }: {
  valor: number | null; cor: string; destaque?: DestaqueLinha;
  bordaEsquerda?: boolean;
  onAbrir?: () => void; filha?: boolean; fundo?: string; estilo?: CSSProperties;
  /**
   * A CLASSE DE FUNDO DA FAIXA, quando a linha é um total — e ela VENCE o fundo da célula
   * (03b-fix1/adendo item 10).
   *
   * ⚠ NASCE DE UMA FAIXA PELA METADE: o azul parava na coluna Total, que fica branca, porque o
   * `FUNDO_TOTAL` é `backgroundColor` INLINE e não há classe que ganhe de estilo inline. A linha do
   * Lucro líquido saía azul até a penúltima célula — justamente a coluna que responde pela safra
   * inteira ficava de fora da faixa que a marca.
   * ⚠ NÃO DÁ PARA RESOLVER PELA ORDEM DAS CLASSES: `bg-muted` e `bg-[#e9eff6]` têm a mesma
   * especificidade, e quem vence é a que o Tailwind emitiu por último no CSS — a ordem no atributo
   * `class` não decide nada. Por isso a faixa SUBSTITUI o fundo, em vez de tentar cobri-lo.
   */
  faixa?: string;
  /** A coluna Total: cinza claro, a divisória da casa à esquerda e peso 500. */
  total?: boolean;
  /** O ▲/▼ do azul cheio — ver `marcadorDoTotal`. */
  marcador?: { glifo: string; cor: string };
  /** ⚠ DESLIGA O SLOT DO MARCADOR — ver `Marcador`. Só a coluna de Δ, e por coluna inteira. */
  semSlotMarcador?: boolean;
  /** Um porquê para a célula — "sem fechamento" na pecuária. Só quando há o que dizer. */
  title?: string;
  /** ⚠ O VALOR SEGUE A FONTE DA LINHA (PR-10): subtotal em 12, filha em 9. Um número de 11px ao
      lado de um rótulo de 9 desmontaria a hierarquia que o rótulo acabou de declarar. */
  fonte?: number;
}) {
  const clicavel = !!onAbrir && valor != null;
  return (
    /* ⚠ O CLIQUE É DO `td`, NÃO DO `span` de dentro — e isso foi defeito de verdade: com o
       handler no span, o alvo era só a largura do texto, e os 7px de padding de cada lado não
       respondiam. Pior, o `CelulaUnit` já o tinha no `td`: duas células vizinhas da mesma linha
       com áreas de clique diferentes. Agora a célula inteira é o alvo, nas duas. */
    <td onClick={clicavel ? onAbrir : undefined}
      title={title ?? (clicavel ? 'ver os lançamentos' : undefined)}
      className={cn('whitespace-nowrap px-[7px] py-px text-right tabular-nums',
      filha ? 'border-t border-dashed border-border/60' : '',
      total && 'font-medium',
      clicavel && 'cursor-pointer hover:underline hover:decoration-dotted', faixa ?? fundo, cor)}
      style={{
        ...(fonte ? { fontSize: fonte } : {}),
        ...(total && !faixa ? { backgroundColor: FUNDO_TOTAL } : {}),
        ...estilo,
        ...(total ? { borderLeft: BORDA_TOTAL }
          : bordaEsquerda ? { borderLeft: '1px solid hsl(var(--border) / .6)' } : {}),
      }}>
      {/* ⚠ TRAÇO NÃO TEM SETA — fix6. A célula sem valor mostra "—", e um ▼ ao lado dele afirmaria
          a direção de um dado que não se sabe: é a sentinela do CLAUDE.md ("— significa ausente")
          contrariada por um glifo. O slot continua reservado, vazio. */}
      <Marcador marcador={valor == null ? undefined : marcador} semSlot={semSlotMarcador} />
      {numeroDaCelula(valor)}
    </td>
  );
}

/** A célula de /ha e /unidade — mais clara que a de R$, porque ela é derivada, não lançada. */
export function CelulaUnit({ texto, cor, destaque, filha, fundo, estilo, total, bordaEsquerda, onAbrir, fonte, title, faixa, marcador, semSlotMarcador }: {
  texto: string; cor: string; destaque?: DestaqueLinha;
  /** ⚠ O UNITÁRIO FICA UM PONTO ABAIXO DO VALOR, sempre: ele é leitura de apoio. */
  fonte?: number;
  filha?: boolean; fundo?: string; estilo?: CSSProperties;
  total?: boolean;
  /**
   * ⚠ A DIVISA DO GRUPO DE COLUNAS — DRE-UNIDADES-01. Ela morava só na célula de R$, que era
   * sempre a primeira; com os chips, o R$ pode estar desmarcado e a primeira célula da cultura
   * passa a ser uma unidade. Sem isso, as colunas de duas culturas encostariam sem divisa.
   */
  bordaEsquerda?: boolean;
  /** §5: na raiz, /ha e /sc abrem a mesma lista que a célula de R$ — é a mesma linha. */
  onAbrir?: () => void;
  /**
   * O porquê de um traço — DRE-UNIDADES-01c.
   *
   * ⚠ ELE NUNCA GANHA DE "ver os lançamentos": a célula que abre lista tem número; a que precisa
   * se explicar está em traço e não abre nada. Os dois nunca disputam a mesma célula.
   */
  title?: string;
  /** A classe de fundo da faixa — vence o `bg-muted/40` da sub-coluna e o `FUNDO_TOTAL` inline.
      Ver a nota em `Celula`; aqui o fundo próprio é CLASSE, e por isso ele é substituído, não
      sobreposto. */
  faixa?: string;
  /** O ▲/▼ do azul cheio — ver `marcadorDoTotal`. */
  marcador?: { glifo: string; cor: string };
  /** ⚠ DESLIGA O SLOT DO MARCADOR — ver `Marcador`. Só a coluna de Δ, e por coluna inteira. */
  semSlotMarcador?: boolean;
}) {
  const sub = destaque === 'subtotal' || destaque === 'sub';
  const clicavel = !!onAbrir && texto !== traco;
  return (
    <td onClick={clicavel ? onAbrir : undefined}
      title={clicavel ? 'ver os lançamentos' : title}
      className={cn('whitespace-nowrap px-[7px] py-px text-right text-[10px] tabular-nums',
      total && 'font-medium',
      faixa ?? (total ? '' : sub ? 'bg-muted' : 'bg-muted/40'),
      bordaEsquerda && !total && 'border-l border-border/60',
      filha ? 'border-t border-dashed border-border/60' : '',
      clicavel && 'cursor-pointer hover:underline hover:decoration-dotted',
      /* ⚠ 70% NAS LINHAS COMUNS, 100% NOS SUBTOTAIS: o unitário é leitura de apoio, e ao lado do
         valor cheio ele tem de ceder. No subtotal ele É o número que se lê. */
      sub ? cor : cor === VERDE ? VERDE_70
        : cor === VERMELHO ? VERMELHO_70 : cor)}
      /* ⚠ A SUB-COLUNA VAI A 9,5px — DRE-PADRAO-01a: com a régua nova, `fonte - 1` levaria a
         linha comum (9px) para 8, abaixo de qualquer piso. O piso passa a ser 9,5, e o subtotal
         (11px) segue um ponto abaixo do valor, em 10. */
      style={{ ...(fonte ? { fontSize: Math.max(9.5, fonte - 1) } : {}),
        ...(total && !faixa ? { backgroundColor: FUNDO_TOTAL } : {}), ...estilo }}>
      {/* ⚠ TRAÇO NÃO TEM SETA — fix6, e foi AQUI que o defeito aparecia: a x Anos mostrava
          "▼—" porque o marcador se decide pelo valor em R$ e a sub-coluna cai em traço quando
          falta o divisor. A seta afirmava a direção de um número que a célula nem exibe. */}
      <Marcador marcador={texto === traco || texto === '' ? undefined : marcador}
        semSlot={semSlotMarcador} />
      {texto}
    </td>
  );
}

/**
 * OS CHIPS DE UNIDADE — DRE-UNIDADES-01, e são os mesmos nas duas abas do DRE.
 *
 * ⚠ SELEÇÃO MÚLTIPLA, COM UM PISO DE UM: cada chip marcado é uma coluna por grupo, e clicar no
 * ÚLTIMO marcado não faz nada — uma grade sem nenhuma unidade não é leitura de coisa alguma. O
 * botão não fica desabilitado de propósito: desabilitado ensina "aqui não se clica", e o que se
 * quer ensinar é "este é o último". Quem explica é o `title`.
 * ⚠ A MARCAÇÃO É O NAVY DA CASA (regra permanente do CLAUDE.md), e não o cinza do `ToggleGroup`
 * do shadcn: selecionado = `bg-primary` + texto branco, como o `Segmentado` e o item ativo do
 * menu. O componente é o do shadcn; só a marcação veste a régua daqui.
 */
export function ChipsUnidade<T extends string>({
  valor, onEscolher, opcoes, permiteVazio = false, desabilitado, titleDesabilitado,
}: {
  valor: readonly T[];
  onEscolher: (v: readonly T[]) => void;
  opcoes: readonly { valor: T; rotulo: string }[];
  /**
   * DESMARCAR TODOS É PERMITIDO — opt-in, DRE-CASCATA-03b.
   *
   * ⚠ O PISO DE UM CHIP EXISTE PARA AS UNIDADES: uma grade sem nenhuma unidade não mostra número
   * nenhum. Os chips de Δ são outra coisa — eles LIGAM colunas de comparação, e "nenhuma" é o
   * estado normal da tela. Sem esta porta, o operador não conseguiria desligar o que ligou.
   */
  permiteVazio?: boolean;
  /**
   * APAGADO E VISÍVEL — DRE-CASCATA-03b-fix4.
   *
   * ⚠ ESCONDER SERIA PIOR: o Δ depende da referência escolhida no card, e um chip que some ensina
   * que ele não existe nesta tela. Apagado, com o porquê no `title`, ele ensina que a porta está
   * ali e qual é a chave.
   */
  desabilitado?: boolean;
  /** O porquê do apagado — obrigatório na prática: um controle inerte sem explicação é um defeito. */
  titleDesabilitado?: string;
}) {
  return (
    <ToggleGroup type="multiple" className="gap-1" value={[...valor]} disabled={desabilitado}
      onValueChange={(v: string[]) => {
        /* ⚠ O RADIX JÁ DEVOLVE A LISTA NOVA: se ela vier vazia, o clique foi no último marcado e
           a resposta é não mexer em nada. */
        if (v.length === 0 && !permiteVazio) return;
        const ordenada = opcoes.map(o => o.valor).filter(u => v.includes(u));
        onEscolher(ordenada);
      }}>
      {opcoes.map(o => {
        const marcado = valor.includes(o.valor);
        const ultimo = marcado && valor.length === 1;
        return (
          <ToggleGroupItem key={o.valor} value={o.valor} aria-label={o.rotulo}
            /* ⚠ O AVISO DO ÚLTIMO CHIP É DA REGRA DO PISO, e só vale onde o piso existe: com
               `permiteVazio` o chip PODE ser desmarcado, e dizer "ao menos uma unidade fica
               visível" sobre um Δ ligado era o controle mentindo sobre o que ele faz. Medido na
               tela em 23/09, no fix4. */
            title={desabilitado ? titleDesabilitado
              : ultimo && !permiteVazio ? 'Ao menos uma unidade fica visível' : o.rotulo}
            className={cn('h-[22px] rounded-md border border-border/60 px-1.5 text-[10px] font-normal',
              'data-[state=on]:bg-primary data-[state=on]:text-primary-foreground',
              'data-[state=off]:bg-card data-[state=off]:text-muted-foreground hover:bg-muted',
              desabilitado && 'cursor-default opacity-50 hover:bg-card')}>
            {o.rotulo}
          </ToggleGroupItem>
        );
      })}
    </ToggleGroup>
  );
}

export interface CaixaFaixa {
  /**
   * UM CONTROLE NO LUGAR DO NÚMERO — DRE-CASCATA-03b-fix4.
   *
   * ⚠ O CARD "Comparação" NÃO TEM NÚMERO: ele carrega a PERGUNTA (comparado com o quê?), e a
   * resposta está na grade dez pixels abaixo. Com `conteudo`, a caixa deixa de ser um `<button>` e
   * vira um `<div role="button">` — botão dentro de botão é HTML inválido, e o seletor de
   * referência é feito de botões.
   */
  conteudo?: ReactNode;
  /** Curto, para caber na janela real. O nome inteiro vai em `titleRotulo`. */
  rotulo: string;
  /** O rótulo por extenso — só onde a abreviação esconde alguma coisa. */
  titleRotulo?: string;
  valor: string;
  /** A unidade sai do valor e vira 10px muted ao lado — "185,00" + "ha". */
  unidade?: string;
  cor?: string;
  title?: string;
  /** A chave da caixa quando ela é SELETOR (DRE-PEC-TELA-02). Sem `onEscolher`, ignorada. */
  chave?: string;
  /**
   * UMA SEGUNDA LINHA, 9px muted, sob o número — DRE-CASCATA-03b/adendo.
   *
   * ⚠ ELA NASCEU COM A SAÍDA DO CARD "× Meta": o Δ contra a meta deixou de ter card próprio e
   * passou a viver sob o resultado do Global, que é o número que ele compara. Sem ela, ligar o Δ
   * na grade não teria eco na faixa e o operador perderia o total da comparação.
   */
  nota?: string;
  /** O número ainda não chegou: spinner no lugar dele — nunca "—", que é dado ausente. */
  carregando?: boolean;
}

/**
 * As seis caixas, desenhadas uma vez só — a raiz e o drill mudam o conteúdo, nunca a régua.
 *
 * ⚠ SEM "R$" NA CAIXA, e a razão é a mesma da grade, por outro caminho: lá a unidade está no
 * cabeçalho da coluna; aqui está no RÓTULO ("Receita líquida" não precisa dizer que é dinheiro).
 * O prefixo custava 17px por número em caixas que, a 1168px, têm ~180px — e era ele que fazia
 * "Custo operacional efetivo" truncar.
 * ⚠ E O QUE EXPLICA VAI PARA O `title`: "a pagar 136.277,79" dentro da caixa disputava espaço com
 * o número que a caixa existe para mostrar.
 */
export function Caixas({ caixas, colunas = 6, selecionada, onEscolher, grande, extra }: {
  caixas: CaixaFaixa[];
  /** Quantas por linha. A lavoura usa 6; os seletores de visão da pecuária, 4. */
  colunas?: number;
  /**
   * OS CONTROLES DA GRADE, NAS COLUNAS QUE SOBRAM — DRE-CASCATA-03b-fix2.
   *
   * ⚠ ELES MORAVAM NUMA LINHA PRÓPRIA E SUMIAM DA TELA. A régua de controles media 1068px num
   * contêiner de 887: o grupo "Comparar" começava em x=1105 e ficava FORA da área visível — para o
   * operador, ele não existia. Aqui eles ocupam o espaço que a faixa de cards já reservava vazio
   * (a pecuária tem 3 cards numa grade de 6), a linha de 28px deixa de existir e a tabela sobe.
   * ⚠ E O LUGAR NÃO É ARBITRÁRIO: o card "Por fazenda" e os chips de unidade respondem à mesma
   * pergunta — o que a grade mostra. Separá-los por uma linha em branco era o que os fazia
   * parecer dois assuntos.
   */
  extra?: ReactNode;
  /**
   * ⚠ CAIXA SELETORA — DRE-PEC-TELA-02. Com `onEscolher`, cada caixa vira um botão e a de `chave`
   * igual a `selecionada` fica em navy com texto branco: a mesma resposta visual do `Segmentado`
   * para a mesma pergunta ("qual está aberta?"). Sem `onEscolher`, a caixa é a de sempre, e é
   * assim que a lavoura continua a vê-la.
   */
  selecionada?: string;
  onEscolher?: (chave: string) => void;
  /**
   * RÓTULO 11px E NÚMERO 20px, ALTURA FIXA DE 52px — a régua dos seletores. ⚠ Fixa, não mínima:
   * um número que demora, um "sem meta no período" ou um spinner não podem mexer na altura da
   * faixa (lei de estabilidade).
   */
  grande?: boolean;
}) {
  /* ⚠ A LINHA DA NOTA SÓ EXISTE SE ALGUÉM A USA — fix7 item A. Ela era reservada SEMPRE, e a
     reserva custava 13px por card (11 de linha + 2 de gap) numa faixa em que NENHUM card tem nota:
     o `nota` nasceu para o card "Global", que o fix4 apagou, e hoje não há um só chamador de
     `Caixas` que o passe (conferido por grep em 23/09). O card media 63px e passa a medir 50.
     ⚠ A LEI DE ESTABILIDADE CONTINUA VALENDO, e é por isso que a decisão é POR FAIXA e não por
     card: se um card tiver nota, TODOS reservam a linha, e ligar o Δ não pode mudar quem tem nota
     dentro da mesma faixa. O que sai é a reserva para o caso que não existe. */
  const temNota = caixas.some(c => c.nota !== undefined);
  if (onEscolher) {
    return (
      <div className="grid gap-1.5" style={{ gridTemplateColumns: `repeat(${colunas}, minmax(0, 1fr))` }}>
        {caixas.map(c => {
          const chave = c.chave ?? c.rotulo;
          const ativa = chave === selecionada;
          /* ⚠ COM CONTROLE DENTRO, A CAIXA NÃO É UM BOTÃO: `<button>` dentro de `<button>` é HTML
             inválido, e o navegador desaninha a árvore — o seletor de referência sairia FORA do
             card. `div` com `role="button"` mantém o clique no card inteiro (escolher a referência
             já seleciona a visão) sem aninhar nada. */
          const Caixa = (c.conteudo ? 'div' : 'button') as 'div';
          return (
            <Caixa key={chave} {...(c.conteudo ? { role: 'button' } : { type: 'button' as const })}
              aria-pressed={ativa} title={c.title}
              onClick={() => onEscolher(chave)}
              className={cn('flex min-w-0 cursor-pointer flex-col items-center justify-center gap-[2px] rounded-md border',
                'transition-colors',
                ativa ? 'border-primary bg-primary text-primary-foreground'
                  : 'border-border/60 bg-card hover:bg-muted')}
              style={{ padding: '6px 8px', height: grande ? 52 : undefined }}>
              <div className={cn('w-full truncate text-center', grande ? 'text-[11px]' : 'text-[10px]',
                ativa ? 'text-primary-foreground' : 'text-muted-foreground')}
                style={{ lineHeight: 1.2 }} title={c.titleRotulo}>
                {c.rotulo}
              </div>
              <div className="flex max-w-full items-baseline gap-1 whitespace-nowrap" style={{ lineHeight: 1.2 }}>
                {/* ⚠ O CONTROLE NÃO DEIXA O CLIQUE SUBIR: sem isto, escolher uma referência
                    disparava TAMBÉM o `onClick` do card, e as duas escritas de URL caíam no mesmo
                    tique do React — a segunda se perdia e clicar em "Meta" não fazia nada. Quem
                    seleciona a visão ao escolher a referência é o handler da referência, na
                    página; o clique no RESTO do card segue selecionando. */}
                {c.conteudo
                  ? <span onClick={ev => ev.stopPropagation()}>{c.conteudo}</span>
                  : (c.carregando ? (
                  <Loader2 className={cn('animate-spin', grande ? 'h-4 w-4' : 'h-3 w-3',
                    ativa ? 'text-primary-foreground' : 'text-muted-foreground')} />
                ) : (
                  <>
                    <span className={cn('truncate font-medium tabular-nums', grande ? 'text-[20px]' : 'text-[13px]',
                      ativa ? 'text-primary-foreground' : c.cor)}>{c.valor}</span>
                    {c.unidade && (
                      <span className={cn('truncate text-[10px]',
                        ativa ? 'text-primary-foreground/80' : 'text-muted-foreground')}>{c.unidade}</span>
                    )}
                  </>
                  ))}
              </div>
              {/* ⚠ ALTURA RESERVADA QUANDO ALGUÉM NA FAIXA TEM NOTA: aí a linha existe em TODOS os
                  cards, com ou sem nota, senão ligar o Δ faria a faixa crescer e a tabela descer
                  (lei de estabilidade). Sem nota nenhuma na faixa, ela não é desenhada. */}
              {temNota && (
                <div className={cn('w-full truncate text-center text-[9px] leading-[11px]',
                  ativa ? 'text-primary-foreground/80' : 'text-muted-foreground')}
                  style={{ minHeight: 11 }}>
                  {c.nota ?? '\u00a0'}
                </div>
              )}
            </Caixa>
          );
        })}
        {/* ⚠ ELE OCUPA TODAS AS COLUNAS QUE SOBRAM, não uma: com `span` fixo, acrescentar um card
            um dia deixaria os controles por cima dele. E fica ALINHADO À DIREITA, encostado na
            borda do cartão, que é onde a régua de controles sempre esteve. */}
        {extra && (
          <div className="flex min-w-0 items-center justify-end gap-2"
            style={{ gridColumn: `span ${Math.max(1, colunas - caixas.length)}` }}>
            {extra}
          </div>
        )}
      </div>
    );
  }
  return (
    <div className="grid gap-1.5" style={{ gridTemplateColumns: `repeat(${colunas}, minmax(0, 1fr))` }}>
      {caixas.map(c => (
        /* ⚠ SEM ALTURA FIXA (§2), e é conserto de corte: 32px não cabem rótulo de 9px mais valor
           de 13px com entrelinha de verdade (1,2 → 10,8 + 15,6 = 26,4) somados a 12px de padding
           = 38,4. Com `height: 32` e `leading-none` o texto era espremido e as bordas cortavam o
           topo do rótulo e a base do valor. Agora a caixa mede o que o conteúdo pede.
           ⚠ E `leading-none` SAIU: era ele que fazia o 13px caber num espaço de 13px, sem lugar
           para acentos e cedilhas. */
        <div key={c.rotulo}
          className="flex min-w-0 flex-col items-center justify-center gap-[2px] rounded-md border border-border/60 bg-card"
          style={{ padding: '6px 8px' }} title={c.title}>
          {/* ⚠ 10px E SEM CAIXA ALTA (§3a). O uppercase é ~12% mais largo que o mesmo texto em
              minúsculas, e a medição a 1168px — que aprovou o 9px no PR-04 — era larga demais: a
              janela real tem ~900px de conteúdo, e ali "CUSTO OPERACIONAL EFETIVO" virava
              "CUSTO OPERACIONAL EFETI…". Medir no limiar errado é não medir. */}
          <div className="w-full truncate text-center text-[10px] text-muted-foreground"
            style={{ lineHeight: 1.2 }} title={c.titleRotulo}>
            {c.rotulo}
          </div>
          {/* ⚠ UM ESPAÇO DE VERDADE ENTRE VALOR E UNIDADE (§2b): "234,80 ha", não "234,80ha". */}
          <div className="flex max-w-full items-baseline gap-1 whitespace-nowrap"
            style={{ lineHeight: 1.2 }}>
            <span className={cn('text-[13px] font-medium tabular-nums', c.cor)}>{c.valor}</span>
            {c.unidade && <span className="truncate text-[9px] text-muted-foreground">{c.unidade}</span>}
          </div>
        </div>
      ))}
    </div>
  );
}

/**
 * O DONUT DO DRE — CÓDIGO MOVIDO, COPIADO BYTE A BYTE de `RateioDetalheModal.tsx`, onde nasceu.
 *
 * ⚠ ELE SAIU DE LÁ PORQUE VIROU O SEGUNDO: o modal do histórico da linha (DRE-HISTORICO-LINHA-01a)
 * desenha o mesmo donut com a mesma caixa fixa, e um donut escrito duas vezes vira dois donuts
 * diferentes no primeiro ajuste. A lei do gráfico compacto e a escolha por `recharts` estão
 * explicadas no cabeçalho do arquivo de origem e continuam valendo aqui.
 * ⚠ O CORPO NÃO FOI TOCADO NO MOVIMENTO. A prop `centro` foi acrescentada DEPOIS, em edição
 * separada e opcional: sem ela, o centro é o de sempre (rótulo + valor em R$), e o modal do rateio
 * não muda um pixel.
 */
export function Donut({ dados, cor, total, rotuloTotal, tamanho = 150, centro }: {
  dados: Array<{ nome: string; valor: number }>;
  cor: (i: number, nome: string) => string;
  total: number;
  rotuloTotal: string;
  tamanho?: number;
  /**
   * O QUE VAI NO BURACO DO DONUT — opt-in, DRE-HISTORICO-LINHA-01a.
   *
   * ⚠ SEM ELE NADA MUDA: o centro segue sendo rótulo + valor em R$, que é o que o modal do rateio
   * mostra desde a F1. Com ele, o histórico põe o PERCENTUAL ali — a pergunta daquele modal é
   * "quanto esta linha pesa", e o peso é o número que tem de estar no meio da figura.
   */
  centro?: ReactNode;
}) {
  return (
    <div className="relative shrink-0 [&_*]:outline-none"
      style={{ width: tamanho, height: tamanho }}>
      <PieChart width={tamanho} height={tamanho}>
        <Pie data={dados} dataKey="valor" nameKey="nome" cx="50%" cy="50%"
          innerRadius={tamanho * 0.31} outerRadius={tamanho * 0.47}
          paddingAngle={1} isAnimationActive={false} rootTabIndex={-1}>
          {dados.map((d, i) => (
            <Cell key={d.nome} fill={cor(i, d.nome)} stroke="#fff" strokeWidth={1} />
          ))}
        </Pie>
      </PieChart>
      {/* ⚠ `pointer-events-none` PARA O TEXTO NÃO ROUBAR O HOVER do donut atrás dele. */}
      <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
        {centro ?? <>
          <span className="text-[9px] uppercase tracking-wide text-muted-foreground">{rotuloTotal}</span>
          <span className="text-[12px] font-bold leading-tight tabular-nums">{formatMoeda(total)}</span>
        </>}
      </div>
    </div>
  );
}
