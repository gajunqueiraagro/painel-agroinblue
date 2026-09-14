/**
 * A ANÁLISE DE PRODUÇÃO DA SAFRA — AGRI-COLHEITA-ANALISE-10.
 *
 * ⚠ ZERO CONTA AQUI. Todo número vem do `totaisColheita` que o consolidado da tela já usa —
 * o mesmo objeto, não uma segunda chamada. Recalcular por fora criaria dois "aproveitado" na
 * mesma tela, e seria o de baixo que o produtor levaria para a conversa com a cooperativa.
 * ⚠ A CADEIA CONTA UMA HISTÓRIA, e é por isso que ela é horizontal: o que arrancou perde água
 * na secagem, o que sobra se divide em grão bom e refugo, e a soma dos dois é o que a
 * cooperativa aceitou. Cada seta é uma perda ou uma separação — nenhuma é um total novo.
 * ⚠ VERMELHO ONDE O GRÃO NÃO VALE O PREÇO CHEIO: quebra, roça e acima do corte. O corte é o
 * `LIMITE_AFLATOXINA`, o mesmo que separa as sacas no consolidado.
 */
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { ChevronRight, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { formatNum } from '@/lib/calculos/formatters';
import { labelDaCultura } from '@/lib/agri/areaPlantada';
import {
  LIMITE_AFLATOXINA, unidadeDaCultura, sacasDoPeso, pesoDasSacas, type TotaisColheita,
} from '@/lib/agri/colheita';
import { BarrasCompactas, type BarraCompacta } from '@/components/ui/barras-compactas';

/** Um elo da cadeia. `destaque` é o fim dela — o que a cooperativa aceitou. */
function Elo({ rotulo, valor, nota2, nota, cor, destaque }: {
  rotulo: string; valor: string;
  /**
   * A MESMA grandeza na outra unidade, logo abaixo do número.
   * ⚠ ALTURA RESERVADA SEMPRE: os cinco elos vivem lado a lado, e um com conversão e outro sem
   * teriam alturas diferentes na mesma fila.
   */
  nota2?: string;
  nota?: string; cor?: string; destaque?: boolean;
}) {
  return (
    <div className={cn('min-w-0 flex-1 rounded-md border px-2.5 py-1.5',
      destaque ? 'border-primary bg-primary text-primary-foreground' : 'bg-card')}>
      <div className={cn('text-[9px] font-medium uppercase tracking-wide',
        destaque ? 'text-primary-foreground/80' : 'text-muted-foreground')}>{rotulo}</div>
      <div className={cn('mt-0.5 text-[15px] font-medium leading-none tabular-nums',
        destaque ? 'text-primary-foreground' : cor)}>{valor}</div>
      <div className={cn('mt-0.5 min-h-[11px] text-[10px] leading-none tabular-nums',
        destaque ? 'text-primary-foreground/80' : 'text-muted-foreground')}>{nota2 ?? ''}</div>
      {nota && (
        <div className={cn('mt-0.5 text-[9px] leading-tight',
          destaque ? 'text-primary-foreground/80' : cor ?? 'text-muted-foreground')}>{nota}</div>
      )}
    </div>
  );
}

function Seta() {
  return <ChevronRight className="h-4 w-4 shrink-0 self-center text-muted-foreground/50" />;
}

function Card({ rotulo, valor, sufixo, nota, cor }: {
  rotulo: string; valor: string; sufixo?: string; nota?: string; cor?: string;
}) {
  return (
    <div className="rounded-md border bg-card px-2.5 py-1.5">
      <div className="text-[9px] font-medium uppercase tracking-wide text-muted-foreground">{rotulo}</div>
      {/* ⚠ 20px — item 3c. Produtividade final, líquida e quebra são os três números que o
          produtor leva para a conversa; em 16px disputavam atenção com os elos da cadeia. */}
      <div className={cn('mt-0.5 text-[20px] font-medium leading-none tabular-nums', cor)}>
        {valor}{sufixo && <span className="ml-0.5 text-[10px] text-muted-foreground">{sufixo}</span>}
      </div>
      {nota && <div className="mt-0.5 text-[9px] leading-tight text-muted-foreground">{nota}</div>}
    </div>
  );
}

export function AnaliseProducaoModal({
  aberto, onFechar, totais, cultura, areaHa, safraRotulo, avisoCulturas,
}: {
  aberto: boolean;
  onFechar: () => void;
  /** O MESMO objeto do consolidado da tela. */
  totais: TotaisColheita;
  cultura: string | null;
  /** A área REAL cadastrada — 60,6 e não 61. É ela que divide as duas produtividades. */
  areaHa: number | null;
  safraRotulo: string;
  /** Preenchido quando a safra tem mais de uma cultura: as produtividades não se misturam. */
  avisoCulturas?: string;
}) {
  const unidade = unidadeDaCultura(cultura);
  const temSaca = unidade.kgPorSaca != null;
  const pct = (v: number) => (totais.sacasFinais > 0 ? (v / totais.sacasFinais) * 100 : 0);

  /* ⚠ VAZIO, NÃO ZERO, quando a cultura não tem peso de saca decidido — mesma regra dos cards. */
  const emSc = (kg: number) => {
    const sc = sacasDoPeso(kg, cultura);
    return sc == null ? `${formatNum(kg, 2)} kg` : `${formatNum(sc, 2)} sc`;
  };
  const emKg = (sacas: number) => {
    const kg = pesoDasSacas(sacas, cultura);
    return kg == null ? undefined : `${formatNum(kg, 2)} kg`;
  };

  /**
   * O GRÁFICO DA CADEIA — item 3e.
   *
   * ⚠ QUATRO BARRAS, DUAS LEITURAS: colhido e seco, no total e por hectare. É a mesma perda da
   * secagem vista de dois jeitos — e o por-hectare é o que se compara com outra safra, porque o
   * total depende do tamanho do talhão.
   * ⚠ A RAZÃO ENTRE AS BARRAS É A RAZÃO ENTRE OS NÚMEROS: as duas de total dividem a mesma
   * escala e as duas de hectare também, então a quebra aparece como diferença de altura. Foi o
   * gate que o gráfico do Painel da Safra reprovou na primeira versão.
   */
  const scVerde = sacasDoPeso(totais.verdeKg, cultura);
  const scSeco = sacasDoPeso(totais.secoKg, cultura);
  const porHa = (v: number | null) => (v != null && areaHa && areaHa > 0 ? v / areaHa : null);
  const traco = (v: number | null, casas = 2, sufixo = '') =>
    (v == null ? '—' : `${formatNum(v, casas)}${sufixo}`);

  return (
    <Dialog open={aberto} onOpenChange={o => { if (!o) onFechar(); }}>
      {/* O X do `DialogContent` fica escondido: quem fecha é o do cabeçalho, como nos modais
          de lançamento (o mesmo `[&>button.absolute]:hidden` do CargaModal). */}
      <DialogContent className="max-w-4xl gap-0 overflow-hidden p-0 [&>button.absolute]:hidden">
        <div className="flex items-start justify-between gap-2 bg-primary px-4 py-2.5 text-primary-foreground">
          <div className="min-w-0">
            <h2 className="text-[15px] font-bold leading-tight">Análise de produção</h2>
            <div className="mt-0.5 text-[11px] text-primary-foreground/80">
              {cultura ? labelDaCultura(cultura) : '—'}
              {safraRotulo && ` · Safra ${safraRotulo}`}
              {areaHa != null && ` · ${formatNum(areaHa, 2)} ha`}
            </div>
          </div>
          <button type="button" onClick={onFechar} aria-label="Fechar"
            className="shrink-0 text-primary-foreground/80 hover:text-primary-foreground">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="space-y-3 bg-muted/30 p-4">
          {avisoCulturas && (
            /* ⚠ SAFRA COM DUAS CULTURAS NÃO TEM UMA PRODUTIVIDADE: somar sacas de amendoim com
               tonelada de mandioca por hectare não quer dizer nada. O painel mostra os pesos,
               que somam, e recusa os índices, que não. */
            <p className="rounded-md border border-amber-400 bg-amber-50 px-2.5 py-1.5 text-[10px] leading-snug text-amber-900 dark:bg-amber-950/30 dark:text-amber-200">
              {avisoCulturas}
            </p>
          )}

          {/* ── 1. A CADEIA ── */}
          <div>
            <div className="mb-1 text-[9px] font-semibold uppercase tracking-wide text-muted-foreground">
              Do que arrancou ao que a cooperativa aceitou
            </div>
            <div className="flex items-stretch gap-1.5">
              {/* ⚠ SACA EM CIMA, KG EMBAIXO — invertido em relação aos cards da tela, de
                  propósito: aqui a cadeia inteira é contada em SACAS (verde → seco → boas →
                  final), e pôr o quilo no topo obrigaria o olho a converter a cada elo. O quilo
                  fica como conferência do romaneio. */}
              <Elo rotulo="Peso verde" valor={emSc(totais.verdeKg)} nota2={`${formatNum(totais.verdeKg, 2)} kg`}
                nota={temSaca ? `${traco(totais.verdeEmSacas, 2)} sc · o que arrancou` : 'o que arrancou'} />
              <Seta />
              <Elo rotulo="Peso seco" valor={totais.secoKg > 0 ? emSc(totais.secoKg) : '—'}
                nota2={totais.secoKg > 0 ? `${formatNum(totais.secoKg, 2)} kg` : undefined}
                nota={totais.quebraPct != null ? `−${formatNum(totais.quebraPct, 1)}% na secagem` : 'aguardando a cooperativa'}
                cor={totais.quebraPct != null ? 'text-destructive' : undefined} />
              <Seta />
              <Elo rotulo="Sacas boas" valor={`${formatNum(totais.sacasBoas, 2)} sc`}
                nota2={emKg(totais.sacasBoas)} nota="grão que vale preço" />
              <Seta />
              {/* ⚠ A ROÇA ENTRA NO FINAL, mas em vermelho: ela foi aceita e é refugo ao mesmo
                  tempo. Deixá-la fora faria o "aproveitado" discordar do romaneio. */}
              <Elo rotulo="Grão de roça" valor={`${formatNum(totais.graoRocaSacas, 2)} sc`}
                nota2={emKg(totais.graoRocaSacas)}
                nota="refugo" cor="text-destructive" />
              <Seta />
              <Elo rotulo="Final aproveitado" valor={`${formatNum(totais.sacasFinais, 2)} sc`}
                nota2={emKg(totais.sacasFinais)}
                nota="boas + roça" destaque />
            </div>
          </div>

          {/* ── 2. OS QUATRO NÚMEROS ── */}
          <div className="grid grid-cols-2 gap-1.5 md:grid-cols-4">
            <Card rotulo="Produtividade final"
              valor={traco(totais.produtividadeFinal)}
              sufixo={totais.produtividadeFinal != null ? unidade.unidadeProdutividade : undefined}
              nota="aproveitado (boas + roça)" />
            <Card rotulo="Produtividade líquida"
              valor={traco(totais.produtividade)}
              sufixo={totais.produtividade != null ? unidade.unidadeProdutividade : undefined}
              nota="só sacas boas" />
            <Card rotulo="Quebra de secagem"
              valor={totais.quebraPct != null ? formatNum(totais.quebraPct, 1) : '—'}
              sufixo={totais.quebraPct != null ? '%' : undefined}
              cor="text-destructive"
              nota={totais.secoKg > 0 ? `${formatNum(totais.verdeKg - totais.secoKg, 2)} kg de água` : undefined} />
            <Card rotulo="Secagem paga"
              valor={totais.valorSecagem > 0 ? `R$ ${formatNum(totais.valorSecagem, 2)}` : '—'}
              cor="text-destructive" nota="custo · à cooperativa" />
          </div>

          {/* ── 3. A CLASSIFICAÇÃO + OS GRÁFICOS, LADO A LADO ──
              ⚠⚠ O CONTÊINER DA SEÇÃO É `space-y-3`, NÃO FLEX — e foi isso que eu não vi no PR
              anterior. A tabela e o bloco de gráficos sempre foram dois IRMÃOS EMPILHADOS na
              vertical; nunca estiveram lado a lado. Pôr `md:flex-1` na tabela não a fez dividir
              espaço com ninguém (não havia flex pai onde `flex-1` agisse) — o que esticou foi o
              `md:w-auto` que veio junto, tirando a metade fixa que a segurava.
              ⚠ O CONSERTO É O WRAPPER, não a classe do filho: para dois blocos ficarem lado a
              lado é preciso alguém que os alinhe. `flex-nowrap` garante que nunca quebrem um sob
              o outro, e `items-start` os prende pelo topo — sem ele, a tabela (mais alta)
              esticaria os cards. */}
          <div className="flex flex-row flex-nowrap items-start gap-4">
          <div className="w-full md:w-1/2">
            <div className="mb-1 text-[9px] font-semibold uppercase tracking-wide text-muted-foreground">
              Classificação por qualidade
            </div>
            <table className="w-full border-collapse overflow-hidden rounded-md border text-[10px]">
              <thead>
                {/* ⚠ CABEÇALHO E TOTAL NO MESMO TOM: são as duas bordas da tabela e se lêem como
                    um par — o azul num e o cinza no outro faziam parecer duas tabelas coladas.
                    ⚠ E O TOM SUBIU PARA `bg-muted-foreground/15` (item 3d): o `bg-muted` era quase
                    o fundo do modal, e as duas bordas se perdiam no meio das linhas de dado. O que
                    distingue o total continua sendo o negrito. */}
                <tr className="bg-muted-foreground/15">
                  <th className="px-2 py-1 text-left text-[9px] font-semibold tracking-wide">Faixa</th>
                  <th className="px-2 py-1 text-right text-[9px] font-semibold tracking-wide">Sacas</th>
                  <th className="px-2 py-1 text-right text-[9px] font-semibold tracking-wide">%</th>
                </tr>
              </thead>
              <tbody>
                {([
                  [`até ${LIMITE_AFLATOXINA} ppb`, totais.sacasAteLimite, 'text-success'],
                  [`acima de ${LIMITE_AFLATOXINA} ppb`, totais.sacasAcimaLimite, 'text-destructive'],
                  ['grão de roça', totais.graoRocaSacas, 'text-destructive'],
                ] as const).map(([rotulo, valor, cor]) => (
                  <tr key={rotulo} className="border-t">
                    <td className="px-2 py-1">{rotulo}</td>
                    <td className={cn('px-2 py-1 text-right tabular-nums', cor)}>{formatNum(valor, 2)}</td>
                    <td className={cn('px-2 py-1 text-right tabular-nums', cor)}>{formatNum(pct(valor), 1)}%</td>
                  </tr>
                ))}
                {/* ⚠ SEM LAUDO APARECE SE EXISTIR, e fora das faixas: ela ainda não foi
                    classificada, e somá-la à primeira venderia um número que não existe. */}
                {totais.sacasSemClasse > 0 && (
                  <tr className="border-t">
                    <td className="px-2 py-1 text-amber-700 dark:text-amber-400">sem laudo</td>
                    <td className="px-2 py-1 text-right tabular-nums text-amber-700 dark:text-amber-400">
                      {formatNum(totais.sacasSemClasse, 2)}
                    </td>
                    <td className="px-2 py-1 text-right tabular-nums text-amber-700 dark:text-amber-400">
                      {formatNum(pct(totais.sacasSemClasse), 1)}%
                    </td>
                  </tr>
                )}
                <tr className="border-t bg-muted-foreground/15 font-bold">
                  <td className="px-2 py-1">Total</td>
                  <td className="px-2 py-1 text-right tabular-nums">{formatNum(totais.sacasFinais, 2)}</td>
                  <td className="px-2 py-1 text-right tabular-nums">100,0%</td>
                </tr>
              </tbody>
            </table>
          </div>

          {/* ⚠ O GRÁFICO OCUPA O VAZIO À DIREITA da classificação — item 3e. Bloco contido, não
              largura total: é a lei do gráfico compacto. */}
          {/* ⚠ LADO A LADO E `shrink-0`: eles moram no espaço que a tabela deixa livre, e sem o
              `shrink-0` o flex os espremeria para caber — que é como o rótulo "colhido" volta a
              truncar. Cada um mantém os 230px em que as duas barras desenham inteiras. */}
          <div className="flex shrink-0 flex-row items-start gap-3">
            {/* ⚠ DOIS GRÁFICOS, NÃO UM — e a razão é a escala. Total e por-hectare são ordens de
                grandeza diferentes (9.100 sc contra 150 sc/ha): na mesma escala, as duas barras de
                hectare valeriam 1,6% da altura e apareceriam como risco. Um gráfico em que metade
                das barras some não compara nada.
                ⚠ SEPARADOS, cada par divide a SUA escala, e a quebra da secagem — que é o que se
                quer ver — aparece como diferença de altura nos dois. */}
            {/* ⚠⚠ AS CORES SÃO LITERAIS, NUNCA MONTADAS EM RUNTIME — e foi exatamente aqui que a
                barra "seco" sumiu. Ela vinha de `` `${cor}/50` ``, que produz "bg-primary/50" como
                STRING em tempo de execução; o Tailwind varre o código-fonte ESTATICAMENTE e nunca
                vê essa classe, então não a gera. Conferido no CSS compilado: `bg-primary` e
                `bg-success` existem, `bg-primary/50` e `bg-success/50` têm ZERO ocorrências.
                A barra desenhava — sem cor de fundo, transparente. O gráfico não quebrou nem
                avisou: mostrou uma barra onde havia duas.
                ⚠ REGRA QUE FICA: classe de Tailwind concatenada é classe que não existe. */}
            {([
              ['Total colhido', scVerde, scSeco, 'bg-primary', 'bg-primary/50', 'sacas'],
              ['Por hectare', porHa(scVerde), porHa(scSeco), 'bg-success', 'bg-success/50', 'sc/ha'],
            ] as Array<[string, number | null, number | null, string, string, string]>).map(
              ([titulo, verde, seco, corCheia, corClara, un]) => (
                <BarrasCompactas
                  key={titulo}
                  titulo={titulo}
                  legenda={`colhido × seco, em ${un} — a diferença é a quebra`}
                  larguraMax={230}
                  altura={84}
                  preencherLargura
                  barras={[
                    { rotulo: 'colhido', valor: verde, cor: corCheia,
                      texto: verde == null ? '—' : formatNum(verde, 0) },
                    { rotulo: 'seco', valor: seco, cor: corClara,
                      texto: seco == null ? '—' : formatNum(seco, 0) },
                  ] satisfies BarraCompacta[]}
                />
              ))}
          </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
