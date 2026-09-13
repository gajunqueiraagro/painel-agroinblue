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
import { LIMITE_AFLATOXINA, unidadeDaCultura, type TotaisColheita } from '@/lib/agri/colheita';

/** Um elo da cadeia. `destaque` é o fim dela — o que a cooperativa aceitou. */
function Elo({ rotulo, valor, nota, cor, destaque }: {
  rotulo: string; valor: string; nota?: string; cor?: string; destaque?: boolean;
}) {
  return (
    <div className={cn('min-w-0 flex-1 rounded-md border px-2.5 py-1.5',
      destaque ? 'border-primary bg-primary text-primary-foreground' : 'bg-card')}>
      <div className={cn('text-[9px] font-medium uppercase tracking-wide',
        destaque ? 'text-primary-foreground/80' : 'text-muted-foreground')}>{rotulo}</div>
      <div className={cn('mt-0.5 text-[15px] font-medium leading-none tabular-nums',
        destaque ? 'text-primary-foreground' : cor)}>{valor}</div>
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
      <div className={cn('mt-0.5 text-[16px] font-medium leading-none tabular-nums', cor)}>
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
              <Elo rotulo="Peso verde" valor={`${formatNum(totais.verdeKg, 2)} kg`}
                nota={temSaca ? `${traco(totais.verdeEmSacas, 2)} sc · o que arrancou` : 'o que arrancou'} />
              <Seta />
              <Elo rotulo="Peso seco" valor={totais.secoKg > 0 ? `${formatNum(totais.secoKg, 2)} kg` : '—'}
                nota={totais.quebraPct != null ? `−${formatNum(totais.quebraPct, 1)}% na secagem` : 'aguardando a cooperativa'}
                cor={totais.quebraPct != null ? 'text-destructive' : undefined} />
              <Seta />
              <Elo rotulo="Sacas boas" valor={`${formatNum(totais.sacasBoas, 2)} sc`} nota="grão que vale preço" />
              <Seta />
              {/* ⚠ A ROÇA ENTRA NO FINAL, mas em vermelho: ela foi aceita e é refugo ao mesmo
                  tempo. Deixá-la fora faria o "aproveitado" discordar do romaneio. */}
              <Elo rotulo="Grão de roça" valor={`${formatNum(totais.graoRocaSacas, 2)} sc`}
                nota="refugo" cor="text-destructive" />
              <Seta />
              <Elo rotulo="Final aproveitado" valor={`${formatNum(totais.sacasFinais, 2)} sc`}
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

          {/* ── 3. A CLASSIFICAÇÃO ── */}
          <div className="w-full md:w-1/2">
            <div className="mb-1 text-[9px] font-semibold uppercase tracking-wide text-muted-foreground">
              Classificação por qualidade
            </div>
            <table className="w-full border-collapse overflow-hidden rounded-md border text-[10px]">
              <thead>
                {/* ⚠ CABEÇALHO E TOTAL NO MESMO TOM: são as duas bordas da tabela e se lêem
                    como um par — o azul num e o cinza no outro faziam parecer duas tabelas
                    coladas. `bg-muted` nos dois, e o que distingue o total é o negrito. */}
                <tr className="bg-muted">
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
                <tr className="border-t bg-muted font-bold">
                  <td className="px-2 py-1">Total</td>
                  <td className="px-2 py-1 text-right tabular-nums">{formatNum(totais.sacasFinais, 2)}</td>
                  <td className="px-2 py-1 text-right tabular-nums">100,0%</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
