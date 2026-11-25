/**
 * DA-NOTA-ETAPAS-01 (Gabriel 19/11 07:51, mock v2 `ui-validar/da-nota-etapas-01-ref/mock.html`) — o "+ Da nota" com a nota JÁ NO SISTEMA em
 * 4 ETAPAS numeradas: 1 O que já existe → 2 Como vai ficar → 3 Itens da nota → 4 Confirmar. Aqui moram só as duas peças de desenho:
 * a barra das etapas (número/✓ + nome + contador, na mesma linha; clicar leva à etapa) e o corpo da etapa 4 (o resumo do que o Aplicar grava
 * e as checagens). O que cada etapa mostra e o que o Aplicar grava continuam no `NotaFiscalDialog` (nada de regra aqui).
 */
import { cn } from '@/lib/utils';

export interface EtapaDaNota<T extends string> {
  valor: T;
  nome: string;
  /** o contador à direita ("1 achado", "3 mudanças", "1 item", "vincular 1"); vazio = nada */
  detalhe: string;
}

/** A barra das etapas. `data-testid="nota-abas-ja"` (o mesmo das abas de antes: os gates acham a barra pelo nome). */
export function BarraDeEtapas<T extends string>({ etapas, atual, onEscolher, procurando = false }: {
  etapas: readonly EtapaDaNota<T>[];
  atual: T;
  onEscolher: (v: T) => void;
  /** enquanto a busca "já lançada?" roda: a barra DESENHADA e desabilitada (nada focável que vá sumir) */
  procurando?: boolean;
}) {
  const i = Math.max(0, etapas.findIndex((e) => e.valor === atual));
  return (
    <div className={cn('flex h-[34px] shrink-0 overflow-hidden rounded-md border bg-card', procurando && 'opacity-60')}
      data-testid={procurando ? 'nota-abas-procurando' : 'nota-abas-ja'} role="tablist">
      {etapas.map((e, k) => {
        const on = k === i;
        const feita = !procurando && k < i;
        return (
          <button key={e.valor} type="button" role="tab" aria-selected={on} disabled={procurando}
            className={cn('flex min-w-0 flex-1 items-center gap-2 whitespace-nowrap border-r px-3 text-[11px] last:border-r-0',
              on ? 'bg-blue-50 font-semibold text-primary shadow-[inset_0_-3px_0_hsl(var(--primary))]' : feita ? 'text-foreground' : 'text-muted-foreground')}
            onClick={() => onEscolher(e.valor)} data-testid={`nota-etapa-${e.valor}`} data-feita={feita ? '' : undefined}>
            <b className={cn('flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-[1.5px] text-[10.5px] font-bold',
              on ? 'border-primary bg-primary text-primary-foreground' : feita ? 'border-emerald-300 bg-emerald-50 text-emerald-700' : 'border-slate-300 bg-card')}>
              {feita ? '✓' : k + 1}</b>
            <span className="shrink-0">{e.nome}</span>
            <span className="ml-auto min-w-0 truncate text-[10px] font-normal text-muted-foreground" title={e.detalhe || undefined} data-reticencias-com-title="" data-testid={`nota-etapa-${e.valor}-detalhe`}>{e.detalhe}</span>
          </button>
        );
      })}
    </div>
  );
}

/** NOTA-ENTREGA-FUTURA-01 (3, mock aprovado 25/11 07:24) — o Confirmar diz SÓ O QUE ACONTECE: um item por coisa que o Aplicar faz (o ícone,
 *  a frase em negrito e o detalhe), nunca um cartão com zero e nunca em caixa alta. Quem monta a lista põe só o que acontece. */
export interface CartaoDoConfirmar { chave: string; icone: 'atualizar' | 'anexar' | 'criar' | 'vincular' | 'nada'; titulo: string; sub: string }
export interface ChecagemDoConfirmar { tipo: 'ok' | 'aviso' | 'erro'; texto: string }

const ICONE: Record<CartaoDoConfirmar['icone'], { sinal: string; classe: string }> = {
  atualizar: { sinal: '↻', classe: 'bg-blue-50 text-blue-700' }, vincular: { sinal: '↔', classe: 'bg-blue-50 text-blue-700' },
  anexar: { sinal: '📎', classe: 'bg-emerald-50 text-emerald-700' }, criar: { sinal: '+', classe: 'bg-orange-50 text-orange-700' },
  nada: { sinal: '✓', classe: 'bg-slate-100 text-slate-500' },
};

/** O corpo da etapa 4: o que acontece (um item por linha, o detalhe inteiro no title) e as checagens, uma por linha. */
export function ResumoDoConfirmar({ cartoes, checagens, compacto = false }: {
  cartoes: readonly CartaoDoConfirmar[];
  checagens: readonly ChecagemDoConfirmar[];
  /** com o formulário das parcelas a criar embaixo: itens mais baixos e as checagens em 2 colunas */
  compacto?: boolean;
}) {
  return (
    <div className="flex shrink-0 flex-col" data-testid="nota-confirmar-resumo">
      {/* compacto (com o formulário das parcelas embaixo): uma linha só, como os cartões de antes — a frase sai (o rodapé já diz "nada é gravado antes") */}
      {!compacto && <p className="px-3 pt-2 text-[11px] text-muted-foreground">Ao clicar em <b className="text-foreground">Aplicar</b>, o sistema faz isto. Nada é gravado antes.</p>}
      <ul className={cn(compacto ? 'grid grid-cols-4 gap-1.5 p-2' : 'flex max-w-[900px] flex-col gap-1 px-3 py-2')}>
        {cartoes.map((c) => (
          <li key={c.chave} className="flex h-[28px] min-w-0 items-center gap-2.5 rounded-md border px-2.5" data-testid={`nota-confirmar-${c.chave}`}>
            <span aria-hidden className={cn('flex h-5 w-5 shrink-0 items-center justify-center rounded text-[11px]', ICONE[c.icone].classe)}>{ICONE[c.icone].sinal}</span>
            {/* uma linha: o que acontece em negrito e o detalhe ao lado (corta com "…", o inteiro no title) */}
            <span className="flex min-w-0 items-baseline gap-2">
              <b className="shrink-0 whitespace-nowrap text-[11px] font-semibold" data-testid={`nota-confirmar-${c.chave}-valor`}>{c.titulo}</b>
              {c.sub && <span className="min-w-0 truncate text-[10px] text-muted-foreground" title={c.sub} data-reticencias-com-title="" data-testid={`nota-confirmar-${c.chave}-sub`}>{c.sub}</span>}
            </span>
          </li>
        ))}
      </ul>
      <ul className={cn(compacto ? 'grid grid-cols-2 gap-x-4 px-2 pb-1' : 'px-3 pb-3')} data-testid="nota-confirmar-checagens">
        {checagens.map((x, k) => (
          <li key={k} className="flex h-[24px] min-w-0 items-center gap-2 border-t border-border/50 text-[11px] first:border-t-0" data-testid="nota-confirmar-checagem" data-tipo={x.tipo}>
            <em className={cn('w-4 shrink-0 text-center font-bold not-italic', x.tipo === 'ok' ? 'text-emerald-600' : x.tipo === 'aviso' ? 'text-amber-600' : 'text-destructive')}>
              {x.tipo === 'ok' ? '✓' : '!'}</em>
            <span className="min-w-0 truncate" title={x.texto} data-reticencias-com-title="">{x.texto}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
