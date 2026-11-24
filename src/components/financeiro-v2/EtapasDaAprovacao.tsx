/**
 * BPO-FUNCIONAR-01 (mock aprovado) — as ETAPAS no topo da CPR, quando a aprovação está ligada: Tudo · Para aprovar (N · R$) · Para pagar ·
 * Agendados · Pagos. São recortes da MESMA lista (as linhas que a CPR já leu); a etapa ativa é navy, "Para aprovar" com algo é âmbar.
 * À direita: "Aprovação ligada · aprova <nome>" com a regra inteira no ⓘ. Largura de cada contador reservada (nada se desloca).
 */
import { formatMoeda } from '@/lib/calculos/formatters';
import { ETAPAS, ROTULO_DA_ETAPA, type ContagemDaEtapa, type EtapaCpr } from '@/lib/financeiro/aprovacaoNaCpr';
import { cn } from '@/lib/utils';

export function regraDaAprovacao(desde: string | null, limite: number | null): string {
  const d = desde ? `${desde.slice(8, 10)}/${desde.slice(5, 7)}/${desde.slice(0, 4)}` : '—';
  return `Entra sozinho: toda saída a pagar com vencimento a partir de ${d}.`
    + (limite ? ` Abaixo de ${formatMoeda(limite)} aprova pela regra.` : '')
    + ' Quem lançou não aprova. Mudou valor, vencimento, fornecedor ou destino depois de aprovado: volta para "Para aprovar".';
}

export function EtapasDaAprovacao({ etapa, onEtapa, contagens, aprovadores, desde, limite, compacto = false }: {
  etapa: EtapaCpr; onEtapa: (e: EtapaCpr) => void; contagens: Record<EtapaCpr, ContagemDaEtapa>;
  aprovadores: readonly string[]; desde: string | null; limite: number | null; compacto?: boolean;
}) {
  return (
    /* estreito (< 1000 px): as etapas QUEBRAM linha (a faixa não tem altura fixa) e o "Aprovação ligada · aprova…" vai para o title */
    <div className={cn('flex shrink-0 items-center gap-1.5', compacto ? 'flex-wrap py-0.5' : 'h-[30px] flex-nowrap whitespace-nowrap')} data-testid="cpr-etapas"
      title={compacto ? `Aprova: ${aprovadores.length ? aprovadores.join(', ') : 'ninguém marcado'}. ${regraDaAprovacao(desde, limite)}` : undefined}>
      {ETAPAS.map((e) => {
        const c = contagens[e];
        const ativa = e === etapa;
        const ambar = e === 'aprovar' && c.n > 0;
        return (
          <button key={e} type="button" onClick={() => onEtapa(e)} data-testid={`cpr-etapa-${e}`} aria-pressed={ativa}
            className={cn('flex h-[24px] shrink-0 items-center gap-1 rounded-full border px-2.5 text-[11px]',
              ativa ? (ambar ? 'border-amber-600 bg-amber-600 text-white' : 'border-primary bg-primary text-primary-foreground')
                : ambar ? 'border-amber-300 bg-amber-50 text-amber-800' : 'border-border text-muted-foreground hover:bg-muted')}>
            <span>{ROTULO_DA_ETAPA[e]}</span>
            <b className="tabular-nums">{e === 'aprovar' && !compacto ? `${c.n} · ${formatMoeda(c.total)}` : c.n}</b>
          </button>
        );
      })}
      {!compacto && (
        <span className="ml-auto shrink-0 text-[11px] text-muted-foreground" data-testid="cpr-aprovacao-ligada"
          title={`Aprova: ${aprovadores.length ? aprovadores.join(', ') : 'ninguém marcado'}. ${regraDaAprovacao(desde, limite)}`}>
          Aprovação ligada · aprova {aprovadores.length ? (aprovadores[0] ?? '').split(/[\s@]+/)[0] : '—'}{aprovadores.length > 1 ? ` +${aprovadores.length - 1}` : ''} ⓘ
        </span>
      )}
    </div>
  );
}
