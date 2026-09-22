/**
 * O RATEIO ADMINISTRATIVO DA PECUÁRIA — PR-DRE-PECUARIA-02 §5, último parágrafo.
 *
 * ⚠ ELE NÃO TEM LISTA DE LANÇAMENTOS NESTE PR, e é decisão de escopo declarada no briefing. O
 * motivo é honesto: o valor que cada fazenda carrega NÃO é lançamento dela. É uma fatia de um
 * pool administrativo, cortada por cabeças. Abrir uma lista aqui mostraria despesas de escritório
 * numa coluna de fazenda — e o operador concluiria que elas foram lançadas ali.
 * ⚠ O QUE O MODAL MOSTRA É A CONTA: o bruto administrativo do período, o percentual que cabe à
 * pecuária, o pool resultante e como ele se divide. Nenhum número é recalculado — `pool` e
 * `bruto` vêm de `fn_dre_pecuaria.rateio_adm`, e a fatia de cada fazenda é a linha `rateio_adm`
 * da própria coluna.
 */
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { formatNum, formatMoeda } from '@/lib/calculos/formatters';
import { VERMELHO } from '@/components/agri/dreGrade';
import type { DrePecuaria } from '@/hooks/useDrePecuaria';

const TH = 'px-1.5 py-1 text-[9px] font-semibold uppercase tracking-wide text-muted-foreground';
const TD = 'truncate px-1.5 py-0.5 text-[10px] tabular-nums';

export function PecRateioAdmModal({ aberto, dre, periodoRotulo, onFechar }: {
  aberto: boolean;
  dre: DrePecuaria;
  periodoRotulo: string;
  onFechar: () => void;
}) {
  const { pool, bruto, criterio } = dre.rateio_adm;
  /* ⚠ O PESO É POR CABEÇA MÉDIA (DRE-PEC-TELA-01), o mesmo denominador com que a RPC corta o pool
     ('cabecas medias no periodo'). Pesar por `cab_fim` aqui explicaria uma divisão que o banco não
     fez: a fatia ao lado sairia de uma conta e o percentual de outra. O peso é só leitura — a
     fatia continua sendo a `rateio_adm` que a RPC devolve. */
  const cabTotal = dre.total.patrimonio.cab_media;
  /* ⚠ O PERCENTUAL É DERIVADO PARA LEITURA, não para conta: `pool` e `bruto` já vêm prontos, e
     esta razão só diz ao operador QUE FATIA do administrativo a pecuária carrega. Bruto zero dá
     traço — nunca 0%, que afirmaria que a pecuária não carrega nada. */
  const pctPecuaria = bruto > 0 ? (pool / bruto) * 100 : null;

  return (
    <Dialog open={aberto} onOpenChange={o => { if (!o) onFechar(); }}>
      <DialogContent className="max-w-2xl gap-0 overflow-hidden p-0 [&>button.absolute]:hidden">
        <div className="flex items-start justify-between gap-2 bg-primary px-4 py-2.5 text-primary-foreground">
          <div className="min-w-0">
            <h2 className="truncate text-[15px] font-bold leading-tight">Rateio administrativo</h2>
            <div className="mt-0.5 truncate text-[11px] text-primary-foreground/80">{periodoRotulo}</div>
          </div>
          <button type="button" onClick={onFechar} aria-label="Fechar"
            className="shrink-0 text-primary-foreground/80 hover:text-primary-foreground">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="space-y-2 bg-muted/30 p-3">
          <div className="grid gap-2 md:grid-cols-3">
            {([
              { r: 'Administrativo bruto', v: formatMoeda(bruto), t: 'O administrativo do período, antes do rateio entre atividades.' },
              { r: 'Fatia da pecuária', v: pctPecuaria == null ? '—' : `${formatNum(pctPecuaria, 1)} %`, t: 'O percentual cadastrado em agri_rateio_admin para a atividade.' },
              { r: 'Pool rateado', v: formatMoeda(pool), t: 'O que se divide entre as fazendas.' },
            ] as const).map(c => (
              <div key={c.r} className="rounded-md border bg-card px-2 py-1.5" title={c.t}>
                <div className="truncate text-[10px] text-muted-foreground">{c.r}</div>
                <div className="text-[13px] font-medium tabular-nums" style={{ color: VERMELHO }}>{c.v}</div>
              </div>
            ))}
          </div>

          <div className="overflow-auto rounded-md border bg-card">
            <table className="w-full border-collapse">
              <thead>
                <tr className="bg-card shadow-[0_1px_0_0_rgba(0,0,0,.08)]">
                  <th className={cn(TH, 'text-left')}>Fazenda</th>
                  <th className={cn(TH, 'text-right')}>Cabeças (média)</th>
                  <th className={cn(TH, 'text-right')}>Peso</th>
                  <th className={cn(TH, 'text-right')}>Fatia</th>
                </tr>
              </thead>
              <tbody>
                {dre.fazendas.map(f => {
                  const cab = f.linhas.patrimonio.cab_media;
                  const peso = cabTotal > 0 ? (cab / cabTotal) * 100 : null;
                  return (
                    <tr key={f.fazenda_id} className="border-t border-slate-100 odd:bg-[#1e3a5f]/[0.03]">
                      <td className={cn(TD, 'text-left')} title={f.nome}>{f.nome}</td>
                      <td className={cn(TD, 'text-right')}>{formatNum(cab, 0)}</td>
                      <td className={cn(TD, 'text-right text-muted-foreground')}>
                        {peso == null ? '—' : `${formatNum(peso, 1)} %`}
                      </td>
                      <td className={cn(TD, 'text-right')} style={{ color: VERMELHO }}>
                        {formatNum(f.linhas.rateio_adm, 2)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-slate-300 bg-card font-semibold">
                  <td className="px-1.5 py-1 text-[10px]">Total</td>
                  <td className={cn(TD, 'text-right')}>{formatNum(cabTotal, 0)}</td>
                  <td className={cn(TD, 'text-right text-muted-foreground')}>
                    {cabTotal > 0 ? '100,0 %' : '—'}
                  </td>
                  <td className={cn(TD, 'text-right')} style={{ color: VERMELHO }}>
                    {formatNum(dre.total.rateio_adm, 2)}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>

          {/* ⚠ O CRITÉRIO VEM DA RPC, não de uma frase escrita aqui: se ele mudar no banco, a tela
              muda junto. Uma frase fixa continuaria dizendo "cabeças" depois de virar hectare. */}
          <p className="text-[10px] text-muted-foreground">
            Critério: {criterio || '—'}.
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
}
