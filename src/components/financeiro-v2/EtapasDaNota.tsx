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

export interface CartaoDoConfirmar { chave: 'vincular' | 'criar' | 'atualizar' | 'anexar'; rotulo: string; valor: string; sub: string }
export interface ChecagemDoConfirmar { tipo: 'ok' | 'aviso' | 'erro'; texto: string }

/** O corpo da etapa 4: os 4 cartões (Vincular · Criar · Atualizar · Anexar) e as checagens, uma por linha (o texto inteiro no title). */
export function ResumoDoConfirmar({ cartoes, checagens, compacto = false }: {
  cartoes: readonly CartaoDoConfirmar[];
  checagens: readonly ChecagemDoConfirmar[];
  /** com o formulário das parcelas a criar embaixo: os cartões numa faixa baixa e as checagens em 2 colunas */
  compacto?: boolean;
}) {
  return (
    <div className="flex shrink-0 flex-col" data-testid="nota-confirmar-resumo">
      <div className={cn('grid grid-cols-4 gap-2', compacto ? 'p-2' : 'p-3')}>
        {cartoes.map((c) => (
          <div key={c.chave} className={cn('min-w-0 rounded-md border', compacto ? 'px-2.5 py-1' : 'px-3 py-2')} data-testid={`nota-confirmar-${c.chave}`}>
            <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{c.rotulo}</div>
            <div className={cn('whitespace-nowrap font-bold text-primary', compacto ? 'text-[12px]' : 'text-[15px]')} data-testid={`nota-confirmar-${c.chave}-valor`}>{c.valor}</div>
            <div className="truncate text-[10.5px] text-muted-foreground" title={c.sub} data-reticencias-com-title="" data-testid={`nota-confirmar-${c.chave}-sub`}>{c.sub}</div>
          </div>
        ))}
      </div>
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
