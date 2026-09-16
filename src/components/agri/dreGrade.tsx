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
import { cn } from '@/lib/utils';
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
 * ⚠ OS 9px DA FILHA SÃO EXCEÇÃO DECLARADA ao piso de 10px do projeto — a única, registrada no
 * CLAUDE.md. Nenhum outro texto do sistema desce de 10.
 */
export const REGUA_LINHA: Record<TipoLinha,
  { fonte: number; peso: string; altura: number; recuo: number }> = {
  subtotal: { fonte: 12, peso: 'font-medium', altura: 20, recuo: 0 },
  grupo: { fonte: 10, peso: 'font-medium', altura: 16, recuo: 8 },
  simples: { fonte: 10, peso: 'font-normal', altura: 16, recuo: 8 },
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

export const W_RS = 104;      // R$ por cultura
export const W_HA = 76;       // R$/ha
export const W_UN = 60;       // R$/unidade
export const W_RS_TOTAL = 108;

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
export const NAVY_TOTAL = '#2b3750';
export const BORDA_TOTAL = '2px solid #cbd5e1';
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
export function Celula({ valor, cor, destaque, bordaEsquerda, onAbrir, filha, fundo, estilo, total, title, fonte }: {
  valor: number | null; cor: string; destaque?: DestaqueLinha;
  bordaEsquerda?: boolean;
  onAbrir?: () => void; filha?: boolean; fundo?: string; estilo?: CSSProperties;
  /** A coluna Total: cinza claro, borda de 2px e peso 500. */
  total?: boolean;
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
      clicavel && 'cursor-pointer hover:underline hover:decoration-dotted', fundo, cor)}
      style={{
        ...(fonte ? { fontSize: fonte } : {}),
        ...(total ? { backgroundColor: FUNDO_TOTAL } : {}),
        ...estilo,
        ...(total ? { borderLeft: BORDA_TOTAL }
          : bordaEsquerda ? { borderLeft: '1px solid hsl(var(--border) / .6)' } : {}),
      }}>
      {numeroDaCelula(valor)}
    </td>
  );
}

/** A célula de /ha e /unidade — mais clara que a de R$, porque ela é derivada, não lançada. */
export function CelulaUnit({ texto, cor, destaque, filha, fundo, estilo, total, onAbrir, fonte }: {
  texto: string; cor: string; destaque?: DestaqueLinha;
  /** ⚠ O UNITÁRIO FICA UM PONTO ABAIXO DO VALOR, sempre: ele é leitura de apoio. */
  fonte?: number;
  filha?: boolean; fundo?: string; estilo?: CSSProperties;
  total?: boolean;
  /** §5: na raiz, /ha e /sc abrem a mesma lista que a célula de R$ — é a mesma linha. */
  onAbrir?: () => void;
}) {
  const sub = destaque === 'subtotal' || destaque === 'sub';
  const clicavel = !!onAbrir && texto !== traco;
  return (
    <td onClick={clicavel ? onAbrir : undefined}
      title={clicavel ? 'ver os lançamentos' : undefined}
      className={cn('whitespace-nowrap px-[7px] py-px text-right text-[10px] tabular-nums',
      total ? 'font-medium' : sub ? 'bg-muted' : 'bg-muted/40',
      filha ? 'border-t border-dashed border-border/60' : '',
      clicavel && 'cursor-pointer hover:underline hover:decoration-dotted',
      /* ⚠ 70% NAS LINHAS COMUNS, 100% NOS SUBTOTAIS: o unitário é leitura de apoio, e ao lado do
         valor cheio ele tem de ceder. No subtotal ele É o número que se lê. */
      sub ? cor : cor === VERDE ? VERDE_70
        : cor === VERMELHO ? VERMELHO_70 : cor)}
      style={{ ...(fonte ? { fontSize: Math.max(9, fonte - 1) } : {}),
        ...(total ? { backgroundColor: FUNDO_TOTAL } : {}), ...estilo }}>
      {texto}
    </td>
  );
}

export interface CaixaFaixa {
  /** Curto, para caber na janela real. O nome inteiro vai em `titleRotulo`. */
  rotulo: string;
  /** O rótulo por extenso — só onde a abreviação esconde alguma coisa. */
  titleRotulo?: string;
  valor: string;
  /** A unidade sai do valor e vira 10px muted ao lado — "185,00" + "ha". */
  unidade?: string;
  cor?: string;
  title?: string;
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
export function Caixas({ caixas }: { caixas: CaixaFaixa[] }) {
  return (
    <div className="grid gap-1.5" style={{ gridTemplateColumns: 'repeat(6, minmax(0, 1fr))' }}>
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
