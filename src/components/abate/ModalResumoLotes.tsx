/**
 * O resumo dos lotes do abate, em tabela — só leitura.
 *
 * ⚠ É A ÚNICA VISTA QUE COMPARA LOTES LINHA A LINHA. O cartão da grade responde "quanto
 * rendeu este lote" e o modal de negociar mostra a cascata de UM; nenhum dos dois deixa
 * ver por que o lote 3 rendeu R$ 385,27/@ e o lote 10, R$ 372,04. A tabela existe para
 * essa pergunta, e por isso não edita nada: quem negocia é o cartão.
 *
 * ⚠ NENHUM NÚMERO É SOMADO AQUI. Cada linha vem de `buildAbateCalculation` daquele lote e
 * a linha SOMA vem de `totaisDoAbate` — a mesma função que alimenta o bloco de topo da
 * grade. Somar as colunas na tela daria uma segunda resposta para a mesma pergunta, e a
 * primeira divergência de arredondamento seria entre duas partes da mesma aba.
 */
import { useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { X } from 'lucide-react';
import { formatMoeda } from '@/lib/calculos/formatters';
import { buildAbateCalculation, type AbateCalculation } from '@/lib/calculos/abate';
import { paraCalculo, linhaVazia, totaisDoAbate, type LoteAbate } from '@/components/abate/calculoDoLote';
import { temNegociacao } from '@/components/abate/AbaLotesAbate';
import type { LinhaAbate, CenarioAbate } from '@/hooks/useOperacaoAbate';
import type { CompraLotesApi } from '@/hooks/useCompraLotes';

/** Cabeçalho de coluna — 10px, apagado, à direita (a primeira, à esquerda). */
function Th({ children, esquerda }: { children?: React.ReactNode; esquerda?: boolean }) {
  return (
    <th className={`whitespace-nowrap border-b px-2.5 pb-1 pt-1.5 text-[10px] font-normal text-muted-foreground ${
      esquerda ? 'text-left' : 'text-right'}`}>
      {children}
    </th>
  );
}

/** Célula de dinheiro — A19 e A22: sempre formatada, sempre numa linha. */
function Td({ valor, negativo, forte, vazio }: {
  valor: number; negativo?: boolean; forte?: boolean; vazio?: boolean;
}) {
  return (
    <td className={`whitespace-nowrap px-2.5 py-1 text-right tabular-nums ${
      forte ? 'text-[12px] font-semibold' : 'text-[11px]'} ${
      negativo && !vazio ? 'text-destructive' : ''}`}>
      {vazio ? '—' : negativo ? `− ${formatMoeda(Math.abs(valor))}` : formatMoeda(valor)}
    </td>
  );
}

export function ModalResumoLotes({ lotes, linhas, cenario, lotesApi, onFechar }: {
  lotes: LoteAbate[];
  linhas: Map<string, LinhaAbate>;
  cenario: CenarioAbate;
  lotesApi: CompraLotesApi;
  onFechar: () => void;
}) {
  const calculos = useMemo(() => {
    const m = new Map<string, AbateCalculation>();
    lotes.forEach(l => m.set(l.id, buildAbateCalculation(paraCalculo(linhas.get(l.id) ?? linhaVazia(l.id), l))));
    return m;
  }, [lotes, linhas]);
  const t = useMemo(() => totaisDoAbate(lotes, calculos), [lotes, calculos]);

  const porArroba = (v: number) => (t.arrobas > 0 ? formatMoeda(v / t.arrobas) : '—');
  const porCabeca = (v: number) => (t.cabecas > 0 ? formatMoeda(v / t.cabecas) : '—');

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onFechar(); }}>
      <DialogContent className="flex max-h-[85vh] max-w-4xl flex-col p-0 gap-0 overflow-hidden">
        <div className="shrink-0 bg-primary px-4 py-2.5 text-primary-foreground flex items-center justify-between">
          <DialogTitle className="text-[14px] font-semibold">
            Resumo dos lotes · <span className="capitalize">{cenario}</span>
          </DialogTitle>
          <button type="button" onClick={onFechar} title="Fechar" aria-label="Fechar"
            className="text-white/80 hover:text-white"><X className="h-4 w-4" /></button>
        </div>
        <DialogDescription className="sr-only">
          Comparação dos lotes deste abate: base, bônus, descontos, bruto, Funrural e líquido.
        </DialogDescription>

        {/* ⚠ A TABELA ROLA POR DENTRO, nunca a página (A22): com nove colunas ela pode
            passar da largura, e o corpo do modal é que oferece a barra. */}
        <div className="min-h-0 flex-1 overflow-auto">
          <table className="w-full border-collapse">
            <thead className="sticky top-0 bg-card">
              <tr>
                <Th esquerda>Lote</Th>
                <Th>R$ base</Th>
                <Th>(+) Bônus</Th>
                <Th>(−) Descontos</Th>
                <Th>Bruto</Th>
                <Th>(−) Funrural e imp.</Th>
                <Th>Líquido do lote</Th>
                <Th>R$/@</Th>
                <Th>R$/cab</Th>
              </tr>
            </thead>
            <tbody>
              {lotes.map(lote => {
                const c = calculos.get(lote.id)!;
                /* Sem negociação no cenário, a linha inteira é traço — zero diria que o
                   lote foi negociado por nada. */
                const vazio = !temNegociacao(linhas.get(lote.id));
                const obs = lotesApi.lotes.find(l => l.idLocal === lote.id)?.observacao?.trim();
                return (
                  <tr key={lote.id} className="border-b last:border-0">
                    <td className="whitespace-nowrap px-2.5 py-1 text-[12px] font-medium text-foreground">
                      {lote.categoriaLabel} · {lote.quantidade} cab{obs ? ` · ${obs}` : ''}
                    </td>
                    <Td valor={c.valorBase} vazio={vazio} />
                    <Td valor={c.totalBonus} vazio={vazio} />
                    <Td valor={c.totalDescontos} negativo vazio={vazio} />
                    <Td valor={c.valorBruto} vazio={vazio} />
                    <Td valor={c.funruralTotal} negativo vazio={vazio} />
                    <Td valor={c.valorLiquido} forte vazio={vazio} />
                    <td className="whitespace-nowrap px-2.5 py-1 text-right text-[11px] tabular-nums">
                      {vazio ? '—' : formatMoeda(c.liqArroba)}
                    </td>
                    <td className="whitespace-nowrap px-2.5 py-1 text-right text-[11px] tabular-nums">
                      {vazio || lote.quantidade === 0 ? '—' : formatMoeda(c.valorLiquido / lote.quantidade)}
                    </td>
                  </tr>
                );
              })}
              {/* ⚠ A SOMA VEM DE `totaisDoAbate`, a mesma do bloco de topo da grade — se as
                  duas discordarem, é a mesma conta em dois lugares, e não duas contas. */}
              <tr className="border-t-2">
                <td className="whitespace-nowrap px-2.5 py-1 text-[12px] font-semibold text-foreground">
                  SOMA · {lotes.length} {lotes.length === 1 ? 'lote' : 'lotes'} · {t.cabecas} cab
                </td>
                <Td valor={t.base} forte />
                <Td valor={t.bonus} forte />
                <Td valor={t.descontos} negativo forte />
                <Td valor={t.bruto} forte />
                <Td valor={t.funrural} negativo forte />
                <Td valor={t.liquido} forte />
                <td className="whitespace-nowrap px-2.5 py-1 text-right text-[12px] font-semibold tabular-nums">
                  {porArroba(t.liquido)}
                </td>
                <td className="whitespace-nowrap px-2.5 py-1 text-right text-[12px] font-semibold tabular-nums">
                  {porCabeca(t.liquido)}
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        <div className="shrink-0 flex items-center justify-end border-t bg-card px-4 py-2.5">
          <Button type="button" variant="ghost" onClick={onFechar}>Fechar</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
