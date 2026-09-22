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
   * A cor do NÚMERO acima da barra. Sem ela, o cinza de sempre.
   *
   * ⚠ ELE ERA SEMPRE `muted`, e num gráfico de UMA linha do DRE isso apaga o sinal: o valor de um
   * custo tem de se ler em vermelho e o de uma receita em verde, como na grade de onde o operador
   * veio. A cor é do consumidor porque a natureza é dele — o componente não sabe o que desenha.
   */
  corTexto?: string;
}

export function BarrasCompactas({
  barras, titulo, legenda, larguraMax = 340, altura = 96, preencherLargura = false,
  larguraBarra = 22, fonteValor = 8, distribuir = false, onClickBarra,
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
}) {
  /**
   * ⚠ A ESCALA IGNORA OS NULOS e nunca é zero: com todas as barras sem dado, ou com um único
   * valor zero, `max` daria 0 e a divisão viraria NaN — que o CSS renderiza como altura cheia.
   * Uma barra cheia num gráfico sem dado é a pior leitura possível.
   */
  const valores = barras.map(b => b.valor).filter((v): v is number => v != null);
  const max = valores.length > 0 ? Math.max(...valores, 0) : 0;

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
                  <div className={cn('relative rounded-sm', distribuir ? 'mx-auto' : 'w-full',
                    b.meta ? 'border border-dashed border-amber-500 bg-transparent'
                      : (b.cor ?? 'bg-primary'))}
                    style={{ height: `${pct}%`, width: distribuir ? larguraBarra : undefined }}>
                    <span className={cn(`absolute bottom-full left-1/2 -translate-x-1/2 whitespace-nowrap
                      pb-[2px] leading-none tabular-nums`, b.corTexto ?? 'text-muted-foreground')}
                      style={{ fontSize: fonteValor }}>{b.texto}</span>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
      <div className={cn('mt-1 flex', trilhoClasse)}>
        {barras.map((b, i) => (
          <div key={`r-${b.rotulo}-${i}`} className={cn('text-center', colClasse)} style={colEstilo}>
            <div className="truncate text-[8px] leading-tight text-muted-foreground" title={b.rotulo}>
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
