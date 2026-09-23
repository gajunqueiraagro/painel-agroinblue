/**
 * BARRAS COMPACTAS — o gráfico denso da casa (lei do projeto, PR-PAINEL-SAFRA-C).
 *
 * ⚠ NÃO É RECHARTS, E A ESCOLHA TEM MOTIVO. A casa usa recharts em 36 telas, e ele é o certo para
 * série temporal com eixo, tooltip e legenda. Mas o `ResponsiveContainer` existe para OCUPAR A
 * LARGURA — é o comportamento dele —, e a lei nova pede o contrário: barras estreitas, coladas,
 * num bloco contido que não usa a lateral. Fixar largura no recharts é lutar contra o desenho
 * dele e arrastar SVG, eixos e tooltips para desenhar quatro barras.
 * ⚠ E POR ISSO ELE NASCE COMPARTILHADO, não dentro da tela: a lei vale para a próxima também, e
 * um gráfico compacto escrito duas vezes vira dois gráficos compactos diferentes.
 *
 * ⚠ A BARRA VAZIA É TRACEJADA, NUNCA ZERO PINTADO. Safra sem colheita não tem produtividade —
 * desenhar uma barra de altura zero afirma "produziu nada", e tracejado diz "não há dado". São
 * coisas diferentes, e a segunda é a verdade de uma safra que ainda está no chão.
 */
import { cn } from '@/lib/utils';

export interface BarraCompacta {
  /** O rótulo do eixo — curto, cabe em ~40px. */
  rotulo: string;
  /** `null` = sem dado (barra tracejada). Zero medido é zero e desenha barra rasa. */
  valor: number | null;
  /** O que aparece em cima da barra. Já formatado. */
  texto: string;
  /** Classe de cor da barra. Sem ela, a cor primária. */
  cor?: string;
  /** Uma marca discreta abaixo do rótulo — "venda parcial", por exemplo. */
  nota?: string;
  /**
   * A BARRA DA META — contorno tracejado âmbar, sem preenchimento (opt-in).
   *
   * ⚠ ELA NÃO É A BARRA TRACEJADA DE "SEM DADO", e a diferença é de significado: aquela é cinza,
   * tem 6px fixos e diz "não há número"; esta tem a ALTURA DO VALOR e diz "este número é o
   * planejado, não o realizado". Pintá-la cheia a faria concorrer com as safras; deixá-la fora do
   * gráfico esconderia justamente a linha contra a qual as outras se comparam.
   */
  meta?: boolean;
  /**
   * O rótulo por extenso, para o `title` — opt-in.
   *
   * ⚠ SEM ELE O `title` É O PRÓPRIO RÓTULO, como sempre foi. Ele existe para o eixo poder mostrar
   * "26" e ainda dizer "jul/2025 → jun/2026" ao passar o mouse: o espaço debaixo de uma barra de
   * 22px não cabe um período inteiro, e truncá-lo daria sete colunas com o mesmo texto.
   */
  rotuloLongo?: string;
  /** O que o `title` da BARRA diz — o número completo, quando o de cima está abreviado. */
  title?: string;
  /**
   * A cor do NÚMERO acima da barra. Sem ela, o cinza de sempre.
   *
   * ⚠ ELE ERA SEMPRE `muted`, e num gráfico de UMA linha do DRE isso apaga o sinal: o valor de um
   * custo tem de se ler em vermelho e o de uma receita em verde, como na grade de onde o operador
   * veio. A cor é do consumidor porque a natureza é dele — o componente não sabe o que desenha.
   */
  corTexto?: string;
}

/**
 * UMA COLUNA COM EIXO ZERO — a barra sai da linha do zero, para cima ou para baixo.
 *
 * ⚠ A ESCALA É A MESMA NOS DOIS SENTIDOS: a altura é `|valor| / faixa`, onde a faixa vai do menor
 * negativo ao maior positivo. Escalar cada lado pelo próprio extremo faria uma perda de 100 mil
 * parecer do tamanho de um lucro de 2 milhões.
 * ⚠ O RÓTULO TROCA DE LADO COM O SINAL: em cima da barra positiva, embaixo da negativa. Fixo em
 * cima, ele ficaria sobre a linha do zero, longe da barra que representa.
 */
function ColunaEixoZero({ barra, faixa, max, minimo, pctAcima, fonteValor, largura, centrado }: {
  barra: BarraCompacta;
  faixa: number; max: number; minimo: number; pctAcima: number;
  fonteValor: number; largura?: number; centrado?: boolean;
}) {
  const v = barra.valor;
  const negativo = v != null && v < 0;
  /* ⚠ A ALTURA É SOBRE A METADE EM QUE A BARRA MORA: `|v| / max` no lado de cima e `|v| / |min|`
     no de baixo, porque cada metade já tem a altura proporcional à sua parte da faixa. O piso de
     2% continua valendo, e só para quem tem valor. */
  const referencia = negativo ? Math.abs(minimo) : max;
  const pct = v == null || faixa <= 0 || referencia <= 0 ? 0 : Math.max(2, (Math.abs(v) / referencia) * 100);
  const classe = cn('relative rounded-sm', centrado ? 'mx-auto' : 'w-full',
    barra.meta ? 'border border-dashed border-amber-500 bg-transparent' : (barra.cor ?? 'bg-primary'));
  const estilo = { height: `${pct}%`, width: centrado ? largura : undefined };
  const rotulo = (
    <span className={cn('absolute left-1/2 -translate-x-1/2 whitespace-nowrap leading-none tabular-nums',
      negativo ? 'top-full pt-[2px]' : 'bottom-full pb-[2px]', barra.corTexto ?? 'text-muted-foreground')}
      style={{ fontSize: fonteValor }}>{barra.texto}</span>
  );
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {/* ⚠ O `paddingTop`/`paddingBottom` RESERVA O LUGAR DO RÓTULO em cada lado: sem ele, o número
          da barra que bate no extremo sairia por cima do título ou do eixo. */}
      <div className="relative flex items-end" style={{ height: `${pctAcima}%`, paddingTop: fonteValor + 4 }}>
        {v == null ? (
          <div className={cn('relative rounded-sm border border-dashed border-muted-foreground/40',
            centrado ? 'mx-auto' : 'w-full')}
            style={{ height: 6, width: centrado ? largura : undefined }} title="Sem dado">
            <span className="absolute bottom-full left-1/2 -translate-x-1/2 whitespace-nowrap pb-[2px]
              leading-none tabular-nums text-muted-foreground"
              style={{ fontSize: fonteValor }}>{barra.texto}</span>
          </div>
        ) : !negativo ? (
          <div title={barra.title} className={classe} style={estilo}>{rotulo}</div>
        ) : null}
      </div>
      {/* ⚠ A LINHA DO ZERO É VISÍVEL: sem ela, uma barra curta para baixo lê como barra curta para
          cima num gráfico sem referência. */}
      <div className="h-px w-full bg-border" />
      <div className="relative flex items-start"
        style={{ height: `${100 - pctAcima}%`, paddingBottom: fonteValor + 4 }}>
        {negativo && <div title={barra.title} className={classe} style={estilo}>{rotulo}</div>}
      </div>
    </div>
  );
}

export function BarrasCompactas({
  barras, titulo, legenda, larguraMax = 340, altura = 96, preencherLargura = false,
  larguraBarra = 22, fonteValor = 8, distribuir = false, onClickBarra, eixoZero = false,
}: {
  barras: readonly BarraCompacta[];
  titulo: string;
  /** A linha que explica como ler — "quanto menor, melhor". */
  legenda?: string;
  larguraMax?: number;
  altura?: number;
  /**
   * As barras DIVIDEM a largura do bloco em vez de ficarem em 22px fixos.
   *
   * ⚠ OPT-IN, E CONTRARIA O DEFAULT DA LEI DE PROPÓSITO. A lei do gráfico compacto existe para
   * o gráfico não se espalhar pela tela; ela pressupõe um bloco largo com poucas barras
   * estreitas. Num card ESTREITO com DUAS barras, os mesmos 22px deixam três quartos da largura
   * vazios e o rótulo "colhido" trunca em "col…" — o compacto vira apertado.
   * ⚠ NADA MUDA PARA QUEM NÃO PEDIR: sem a prop, largura fixa de 22px, como antes. É por isso
   * que ela nasce booleana e default `false`, em vez de a lei ser reescrita para todos.
   */
  preencherLargura?: boolean;
  /**
   * A largura de cada barra, em px. Default 22 — a medida da lei.
   * ⚠ MENOR SE JUSTIFICA QUANDO HÁ MAIS BARRAS no mesmo bloco: três em 22px num card de 230px
   * ficam largas e o gráfico perde a leitura de proporção que é a razão de existir dele.
   */
  larguraBarra?: number;
  /**
   * O tamanho do número acima da barra, em px. Default 8.
   * ⚠ ELE É O DADO, não legenda: em 8px o valor que se quer comparar some ao lado da barra que o
   * representa. Sobe quando o bloco permite.
   */
  fonteValor?: number;
  /**
   * As colunas se DISTRIBUEM na largura do bloco, e cada coluna tem a largura do seu VALOR —
   * a barra fica centrada dentro dela.
   *
   * ⚠ É A DIFERENÇA ESTRUTURAL QUE FAZIA OS NÚMEROS SE AMONTOAREM. No modo normal a coluna tem
   * a largura da BARRA (22px) e o valor, maior que ela, transborda para os lados; com três
   * colunas coladas por `gap`, os três valores se encostam e viram "9.100 7.747 621" numa fila
   * só, longe das barras que representam.
   * ⚠ Aqui a coluna não tem largura declarada: ela cresce com o texto, `justify-around` reparte
   * o espaço entre as três, e a barra recebe `larguraBarra` com margem automática. Cada número
   * fica centrado sobre a SUA barra, e nenhum encosta no vizinho.
   * ⚠ OPT-IN, como as outras: sem a prop, nada muda para quem já usa.
   */
  distribuir?: boolean;
  /**
   * CLICAR NUMA BARRA ESCOLHE AQUELA COLUNA — opt-in, DRE-HISTORICO-LINHA-01a.
   *
   * ⚠ SEM ELA O GRÁFICO NÃO RESPONDE A CLIQUE, como sempre foi: o cursor só vira mão onde há
   * alguém para ouvir. Um gráfico que parece clicável e não é vale menos que um que não parece.
   * ⚠ A ÁREA CLICÁVEL É A COLUNA INTEIRA, barra e rótulo, não o retângulo pintado: a barra de um
   * valor pequeno tem poucos pixels de altura, e mirar nela seria trabalho de precisão.
   */
  onClickBarra?: (i: number) => void;
  /**
   * O EIXO ZERO — opt-in, DRE-HISTORICO-LINHA-01c.
   *
   * ⚠ SEM ELE O COMPONENTE NÃO SABE NEGATIVO, e não sabia calado: a escala é `Math.max(…, 0)` e o
   * piso de 2% transformava qualquer valor negativo numa barrinha PARA CIMA de 2% — um prejuízo
   * desenhado como lucro pequeno. Isso nunca apareceu porque os consumidores até hoje só tinham
   * produção e custo, que não descem de zero; o resultado do DRE desce.
   * ⚠ COM ELE A LINHA DO ZERO FICA ONDE OS DADOS PEDEM: sem negativos, na base (idêntico ao de
   * hoje); com negativos, na proporção entre o maior positivo e o menor negativo. A barra cresce a
   * partir dela, para cima ou para baixo, e o rótulo acompanha o lado.
   * ⚠ A RAZÃO CONTINUA SENDO A LEI: a altura é proporcional ao MÓDULO do valor sobre a mesma
   * escala; o sinal decide o sentido, nunca o tamanho.
   */
  eixoZero?: boolean;
}) {
  /**
   * ⚠ A ESCALA IGNORA OS NULOS e nunca é zero: com todas as barras sem dado, ou com um único
   * valor zero, `max` daria 0 e a divisão viraria NaN — que o CSS renderiza como altura cheia.
   * Uma barra cheia num gráfico sem dado é a pior leitura possível.
   */
  const valores = barras.map(b => b.valor).filter((v): v is number => v != null);
  const max = valores.length > 0 ? Math.max(...valores, 0) : 0;
  /* ⚠ A FAIXA DO EIXO ZERO vai do menor negativo ao maior positivo, e o zero entra sempre: sem
     negativos ela é [0, max] e a linha do zero cai na base — o desenho de hoje, sem exceção. */
  const minimo = valores.length > 0 ? Math.min(...valores, 0) : 0;
  const faixa = max - minimo;
  const pctAcima = faixa > 0 ? (max / faixa) * 100 : 100;

  /* ⚠ UMA CLASSE SÓ PARA OS DOIS TRILHOS — o da barra e o do rótulo. Se divergirem, o rótulo
     deixa de ficar embaixo da sua barra, que é o defeito mais silencioso que um gráfico pode ter. */
  const colEstilo = distribuir ? undefined
    : preencherLargura ? undefined : { width: larguraBarra };
  const colClasse = distribuir ? 'shrink-0 text-center'
    : preencherLargura ? 'min-w-0 flex-1' : 'shrink-0';
  /* ⚠ `space-around` reparte a folga ANTES, ENTRE e DEPOIS das colunas — é o que tira o recuo
     à esquerda e a sobra à direita de uma vez. Com `gap`, a folga fica toda no fim. */
  const trilhoClasse = distribuir ? 'justify-around' : 'gap-1.5';

  /*
   * ⚠ NO MODO DISTRIBUÍDO A LARGURA É FIXA, não teto. Com `max-width` o card encolhe até o
   * conteúdo — medido: 134px em vez dos 158 pedidos —, e aí os três valores de 15px somam mais
   * do que a folga e ENCOSTAM um no outro. É a largura declarada que cria o espaço entre eles.
   */
  return (
    <div className="rounded-md border bg-card p-2"
      style={distribuir ? { width: larguraMax, maxWidth: larguraMax } : { maxWidth: larguraMax }}>
      <div className="text-[9px] font-bold uppercase tracking-wide text-muted-foreground">{titulo}</div>
      {/* ⚠ ALTURA FIXA NO TRILHO, não no conteúdo: a barra cresce de baixo para cima dentro de um
          espaço que não muda. Sem isso, trocar de cultura faria o bloco inteiro pular. */}
      <div className={cn('mt-1.5 flex items-end', trilhoClasse)} style={{ height: altura }}>
        {barras.map((b, i) => {
          const pct = b.valor != null && max > 0 ? Math.max(2, (b.valor / max) * 100) : 0;
          return (
            <div key={`${b.rotulo}-${i}`}
              className={cn('flex h-full flex-col', colClasse, onClickBarra && 'cursor-pointer')}
              onClick={onClickBarra ? () => onClickBarra(i) : undefined}
              style={colEstilo}>
              {/* ⚠ O NÚMERO ACOMPANHA A ALTURA DA BARRA — ele fica ANCORADO NO TOPO DELA, não
                  numa linha fixa no alto do card. Antes, o valor da roça (barra de 7%) aparecia
                  lá em cima enquanto a barra ficava rente ao chão: o olho não ligava um ao outro.
                  ⚠ E ELE É `absolute`, FORA DO FLUXO, de propósito. Em fluxo ele ocuparia altura
                  DENTRO do trilho, e a barra de 100% pediria mais espaço do que sobra — que é
                  exatamente o achatamento medido em 14/09: as barras altas comprimiam e as baixas
                  não, e a razão entre elas deixava de ser a razão entre os números.
                  ⚠ O `paddingTop` do trilho reserva o lugar do número mais alto: sem ele, o valor
                  da barra de 100% sairia por cima do título do card. */}
              {eixoZero ? (
                /* ⚠ DUAS METADES E UMA LINHA ENTRE ELAS: a de cima cresce para cima a partir do
                    zero, a de baixo para baixo. Elas dividem a altura na proporção da faixa, e é
                    isso que põe a linha do zero onde os dados pedem. */
                <ColunaEixoZero barra={b} faixa={faixa} max={max} minimo={minimo}
                  pctAcima={pctAcima} fonteValor={fonteValor}
                  largura={distribuir ? larguraBarra : undefined} centrado={distribuir} />
              ) : (
              <div className="relative flex min-h-0 flex-1 items-end"
                style={{ paddingTop: fonteValor + 4 }}>
                {b.valor == null ? (
                  <div className={cn('relative rounded-sm border border-dashed border-muted-foreground/40',
                    distribuir ? 'mx-auto' : 'w-full')}
                    style={{ height: 6, width: distribuir ? larguraBarra : undefined }}
                    title="Sem dado">
                    <span className="absolute bottom-full left-1/2 -translate-x-1/2 whitespace-nowrap
                      pb-[2px] leading-none tabular-nums text-muted-foreground"
                      style={{ fontSize: fonteValor }}>{b.texto}</span>
                  </div>
                ) : (
                  /* ⚠ A META É CONTORNO, NÃO PREENCHIMENTO — e a classe é literal, nunca montada
                     por interpolação: o Tailwind varre o código em busca do nome inteiro, e
                     `border-${cor}` não existe no CSS gerado. */
                  <div title={b.title}
                    className={cn('relative rounded-sm', distribuir ? 'mx-auto' : 'w-full',
                    b.meta ? 'border border-dashed border-amber-500 bg-transparent'
                      : (b.cor ?? 'bg-primary'))}
                    style={{ height: `${pct}%`, width: distribuir ? larguraBarra : undefined }}>
                    <span className={cn(`absolute bottom-full left-1/2 -translate-x-1/2 whitespace-nowrap
                      pb-[2px] leading-none tabular-nums`, b.corTexto ?? 'text-muted-foreground')}
                      style={{ fontSize: fonteValor }}>{b.texto}</span>
                  </div>
                )}
              </div>
              )}
            </div>
          );
        })}
      </div>
      <div className={cn('mt-1 flex', trilhoClasse)}>
        {barras.map((b, i) => (
          <div key={`r-${b.rotulo}-${i}`} className={cn('text-center', colClasse)} style={colEstilo}>
            <div className="truncate text-[8px] leading-tight text-muted-foreground"
              title={b.rotuloLongo ?? b.rotulo}>
              {b.rotulo}
            </div>
            {/* ⚠ A NOTA OCUPA ALTURA SEMPRE, com ou sem texto: uma safra marcada e outra não
                desalinhariam os rótulos entre si. */}
            <div className="min-h-[9px] truncate text-[7px] leading-tight text-amber-600" title={b.nota}>
              {b.nota ?? ''}
            </div>
          </div>
        ))}
      </div>
      {legenda && (
        <div className="mt-1 text-[9px] leading-snug text-muted-foreground">{legenda}</div>
      )}
    </div>
  );
}
