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
  const colClasse = preencherLargura ? 'min-w-0 flex-1' : 'w-[22px] shrink-0';

  return (
    <div className="rounded-md border bg-card p-2" style={{ maxWidth: larguraMax }}>
      <div className="text-[9px] font-bold uppercase tracking-wide text-muted-foreground">{titulo}</div>
      {/* ⚠ ALTURA FIXA NO TRILHO, não no conteúdo: a barra cresce de baixo para cima dentro de um
          espaço que não muda. Sem isso, trocar de cultura faria o bloco inteiro pular. */}
      <div className="mt-1.5 flex items-end gap-1.5" style={{ height: altura }}>
        {barras.map((b, i) => {
          const pct = b.valor != null && max > 0 ? Math.max(2, (b.valor / max) * 100) : 0;
          return (
            <div key={`${b.rotulo}-${i}`} className={cn('flex h-full flex-col', colClasse)}>
              {/* O número fica ACIMA da barra e sempre no fluxo: sem ele reservado, barras altas
                  e baixas alinhariam o texto em alturas diferentes. */}
              <div className="mb-0.5 shrink-0 whitespace-nowrap text-center text-[8px] leading-none tabular-nums text-muted-foreground">
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
                  <div className="w-full rounded-sm border border-dashed border-muted-foreground/40"
                    style={{ height: 6 }} title="Sem dado" />
                ) : (
                  <div className={cn('w-full rounded-sm', b.cor ?? 'bg-primary')}
                    style={{ height: `${pct}%` }} />
                )}
              </div>
            </div>
          );
        })}
      </div>
      <div className="mt-1 flex gap-1.5">
        {barras.map((b, i) => (
          <div key={`r-${b.rotulo}-${i}`} className={cn('text-center', colClasse)}>
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
