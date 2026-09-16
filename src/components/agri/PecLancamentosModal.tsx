/**
 * OS LANÇAMENTOS POR TRÁS DE UMA CÉLULA DO DRE DA PECUÁRIA — PR-DRE-PECUARIA-02 §5.
 *
 * ⚠ A CÉLULA É UM FILTRO, e este modal o torna visível: fazenda (ou Total), bloco e — quando a
 * linha é uma filha — centro de custo. Os três viajam para `fn_dre_pecuaria_lancamentos` como
 * vieram da grade, e é isso que garante que a soma do rodapé bata com o número clicado.
 * ⚠ NENHUMA SOMA NOVA NO FRONT? AQUI HÁ UMA, e ela é deliberada: o rodapé soma os itens da lista
 * para PROVAR que eles explicam a célula. Se o total do rodapé divergir do número da grade, a
 * divergência é a informação — é ela que denuncia um lançamento fora do filtro.
 *
 * ⚠ O CAMINHO DO EDITAR É O DA LAVOURA (PR-05): quem abre recebe o `id` e chama o
 * `buscarLancamentoPorId` do Financeiro com os quatro catálogos já carregados. Um `select`
 * próprio aqui seria a segunda dona do mesmo dado — e foi assim que o "Editar Lançamento" abriu
 * vazio quatro vezes nesta frente.
 */
import { useMemo } from 'react';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { X, Loader2, Pencil } from 'lucide-react';
import { cn } from '@/lib/utils';
import { formatNum, formatMoeda } from '@/lib/calculos/formatters';
import type { LancamentoPec, RecortePec } from '@/hooks/useDrePecuaria';

const TH = 'px-1.5 py-1 text-[9px] font-semibold uppercase tracking-wide text-muted-foreground';
const TD = 'truncate px-1.5 py-0.5 text-[10px]';

const dataBR = (iso: string | null) => (iso && iso.length >= 10
  ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}` : '—');

/**
 * ⚠ "PROGRAMADO" É ÂMBAR, NÃO VERMELHO — a mesma regra da lista de cargas: um compromisso ainda
 * não pago não é erro. Vermelho aqui mandaria o operador procurar um defeito que não existe.
 */
function Status({ s }: { s: string | null }) {
  if (!s) return <span className="text-muted-foreground">—</span>;
  const realizado = s === 'realizado';
  return (
    <span className={cn('inline-block whitespace-nowrap rounded-[3px] border px-1 text-[9px] leading-[12px]',
      realizado ? 'border-green-700 text-green-700' : 'border-amber-600 text-amber-700')}>
      {realizado ? 'Realizado' : 'Programado'}
    </span>
  );
}

export function PecLancamentosModal({
  aberto, recorte, lancamentos, carregando, periodoRotulo, onFechar, onAbrirLancamento,
}: {
  aberto: boolean;
  recorte: RecortePec | null;
  lancamentos: readonly LancamentoPec[];
  carregando: boolean;
  /** "Safra 25/26" ou "set/26" — o mesmo recorte que o cabeçalho da tela mostra. */
  periodoRotulo: string;
  onFechar: () => void;
  onAbrirLancamento?: (id: string) => void;
}) {
  const total = useMemo(
    () => lancamentos.reduce((a, l) => a + l.valor, 0), [lancamentos]);

  if (!recorte) return null;

  return (
    <Dialog open={aberto} onOpenChange={o => { if (!o) onFechar(); }}>
      <DialogContent className="max-w-4xl gap-0 overflow-hidden p-0 [&>button.absolute]:hidden">
        {/* ⚠ O CABEÇALHO ECOA A CÉLULA CLICADA, e é o que evita o modal órfão: quem abriu quatro
            listas seguidas precisa saber qual está lendo sem fechar para conferir. */}
        <div className="flex items-start justify-between gap-2 bg-primary px-4 py-2.5 text-primary-foreground">
          <div className="min-w-0">
            <h2 className="truncate text-[15px] font-bold leading-tight">{recorte.rotulo}</h2>
            <div className="mt-0.5 truncate text-[11px] text-primary-foreground/80">
              {[recorte.fazendaNome, periodoRotulo].filter(Boolean).join(' · ')}
            </div>
          </div>
          <button type="button" onClick={onFechar} aria-label="Fechar"
            className="shrink-0 text-primary-foreground/80 hover:text-primary-foreground">
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* ⚠ CABEÇALHO FIXO, SÓ O CORPO ROLA (A21) — e o scrollport é este `div`, não a página. */}
        <div className="max-h-[60vh] overflow-auto bg-muted/30">
          <table className="w-full border-collapse">
            <thead>
              <tr className="sticky top-0 z-10 bg-card shadow-[0_1px_0_0_rgba(0,0,0,.08)]">
                <th className={cn(TH, 'text-left')}>Data</th>
                <th className={cn(TH, 'text-left')}>Descrição</th>
                <th className={cn(TH, 'text-left')}>Favorecido</th>
                <th className={cn(TH, 'text-left')}>Fazenda</th>
                <th className={cn(TH, 'text-right')}>Valor</th>
                <th className={cn(TH, 'text-left')}>Status</th>
                <th className={TH} />
              </tr>
            </thead>
            <tbody>
              {carregando && (
                <tr><td colSpan={7} className="px-2 py-6 text-center text-[11px] text-muted-foreground">
                  <Loader2 className="mr-1 inline h-3.5 w-3.5 animate-spin align-[-2px]" /> Carregando…
                </td></tr>
              )}
              {!carregando && lancamentos.length === 0 && (
                <tr><td colSpan={7} className="px-2 py-6 text-center text-[11px] text-muted-foreground">
                  Nenhum lançamento neste recorte.
                </td></tr>
              )}
              {lancamentos.map(l => (
                <tr key={l.id} className="border-t border-slate-100 bg-card odd:bg-[#1e3a5f]/[0.03]">
                  <td className={cn(TD, 'whitespace-nowrap tabular-nums')}>{dataBR(l.data)}</td>
                  <td className={TD} title={l.descricao ?? undefined}>{l.descricao || '—'}</td>
                  <td className={TD} title={l.favorecido ?? undefined}>{l.favorecido || '—'}</td>
                  {/* ⚠ A FAZENDA APARECE MESMO NA COLUNA DE UMA FAZENDA SÓ: é ela que o Gabriel
                      vem corrigir quando o valor caiu na coluna errada, e vê-la na lista é o que
                      confirma o diagnóstico antes de abrir o lançamento. */}
                  <td className={TD} title={l.fazenda ?? undefined}>{l.fazenda || '—'}</td>
                  <td className={cn(TD, 'text-right tabular-nums')} title={formatMoeda(l.valor)}>
                    {formatNum(l.valor, 2)}
                  </td>
                  <td className={TD}><Status s={l.status} /></td>
                  <td className={cn(TD, 'text-right')}>
                    {onAbrirLancamento && (
                      <button type="button" title="Abrir o lançamento para corrigir"
                        className="rounded p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground"
                        onClick={() => onAbrirLancamento(l.id)}>
                        <Pencil className="h-3 w-3" />
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
            {/* ⚠ O RODAPÉ TAMBÉM É FIXO, e pelo mesmo motivo do cabeçalho: o total é o que se veio
                conferir, e ele não pode sumir ao rolar uma lista de trezentas linhas. */}
            <tfoot className="sticky bottom-0 z-10">
              <tr className="border-t-2 border-slate-300 bg-card font-semibold">
                <td className="px-1.5 py-1 text-[10px]" colSpan={4}>
                  {lancamentos.length} lançamento{lancamentos.length === 1 ? '' : 's'}
                </td>
                <td className="px-1.5 py-1 text-right text-[10px] tabular-nums"
                  title={formatMoeda(total)}>{formatNum(total, 2)}</td>
                <td colSpan={2} />
              </tr>
            </tfoot>
          </table>
        </div>
      </DialogContent>
    </Dialog>
  );
}
