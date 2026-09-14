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
}

export function BarrasCompactas({
  barras, titulo, legenda, larguraMax = 340, altura = 96, preencherLargura = false,
  larguraBarra = 22, fonteValor = 8, distribuir = false,
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
            <div key={`${b.rotulo}-${i}`} className={cn('flex h-full flex-col', colClasse)}
              style={colEstilo}>
              {/* O número fica ACIMA da barra e sempre no fluxo: sem ele reservado, barras altas
                  e baixas alinhariam o texto em alturas diferentes. */}
              <div className="mb-0.5 shrink-0 whitespace-nowrap text-center leading-none tabular-nums text-muted-foreground"
                style={{ fontSize: fonteValor }}>
                {b.texto}
              </div>
              {/* ⚠ A PORCENTAGEM É DESTE TRILHO, NÃO DA COLUNA — e a diferença DISTORCIA O
                  GRÁFICO. Medido em 14/09/2026: com a barra filha direta da coluna, o `height: %`
                  media os 96px cheios, mas o desenho acontecia nos ~86px que sobram depois do
                  texto. A barra de 100% pedia 96 e era ACHATADA para 86; as menores não. Duas
                  safras de 138 e 239 sc/ha apareciam na razão 64% em vez de 58% — o gráfico
                  mentia sobre a comparação que existe para fazer.
                  ⚠ Com `flex-1 min-h-0`, o trilho é exatamente o espaço da barra, e 100% é 100%
                  dele. Nenhuma barra é comprimida. */}
              <div className="flex min-h-0 flex-1 items-end">
                {b.valor == null ? (
                  <div className={cn('rounded-sm border border-dashed border-muted-foreground/40',
                    distribuir ? 'mx-auto' : 'w-full')}
                    style={{ height: 6, width: distribuir ? larguraBarra : undefined }}
                    title="Sem dado" />
                ) : (
                  <div className={cn('rounded-sm', distribuir ? 'mx-auto' : 'w-full',
                    b.cor ?? 'bg-primary')}
                    style={{ height: `${pct}%`, width: distribuir ? larguraBarra : undefined }} />
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
