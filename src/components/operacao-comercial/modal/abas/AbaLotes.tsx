import { useMemo } from 'react';
import { Info } from 'lucide-react';
import type { ModalOCCtx } from '../tipos';

const fmt = (n: number) => n.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

// Aba 2 — Lotes Comerciais (substitui "Animais"). Hierarquia:
// Operação → Lote 1 → Movimentações → Categorias → Pesos.
export function AbaLotes({ ctx }: { ctx: ModalOCCtx }) {
  const { draft, patch, movsReadonly } = ctx;

  const candidatas = useMemo(
    () => ctx.movs.filter(m => !draft.fazendaScopeId || m.fazendaId === draft.fazendaScopeId),
    [ctx.movs, draft.fazendaScopeId],
  );
  const selecionadas = useMemo(() => ctx.movs.filter(m => draft.movimentacoes.includes(m.id)), [ctx.movs, draft.movimentacoes]);

  const toggle = (id: string) =>
    patch({ movimentacoes: draft.movimentacoes.includes(id) ? draft.movimentacoes.filter(x => x !== id) : [...draft.movimentacoes, id] });

  const qtdTotal = selecionadas.reduce((a, m) => a + m.quantidade, 0);
  const pesoTotal = selecionadas.reduce((a, m) => a + (m.pesoTotalKg ?? 0), 0);
  const pesoMedio = qtdTotal > 0 ? pesoTotal / qtdTotal : 0;

  return (
    <div className="space-y-4">
      <div className="rounded-lg border bg-card p-5">
        <div className="flex items-start justify-between">
          <div>
            <h3 className="font-bold text-lg">Lote 1 (Ordem de Compra)</h3>
            <p className="text-sm text-muted-foreground">Movimentações vinculadas a este lote.</p>
          </div>
        </div>

        {movsReadonly ? (
          <div className="mt-3 rounded-md bg-muted/50 border px-3 py-2 text-xs text-muted-foreground">
            A alteração das movimentações após a criação desta operação ainda não está disponível.
          </div>
        ) : (
          <div className="mt-3">
            <div className="text-xs font-semibold text-muted-foreground mb-1">Selecionar movimentações do rebanho</div>
            <div className="max-h-44 overflow-y-auto rounded-md border divide-y">
              {candidatas.length === 0 && <div className="px-3 py-2 text-xs text-muted-foreground">Nenhuma movimentação candidata para o tipo/fazenda.</div>}
              {candidatas.map(m => (
                <label key={m.id} className="flex items-center gap-2 px-3 py-1.5 text-xs cursor-pointer hover:bg-muted/40">
                  <input type="checkbox" checked={draft.movimentacoes.includes(m.id)} onChange={() => toggle(m.id)} />
                  <span>{m.data} · {m.categoria} · {m.quantidade} cab · {m.pesoTotalKg != null ? `${fmt(m.pesoTotalKg)} kg` : 's/ peso'}{m.fazendaNome ? ` · ${m.fazendaNome}` : ''}</span>
                </label>
              ))}
            </div>
          </div>
        )}

        <div className="mt-4 overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-xs text-muted-foreground">
              <tr className="border-b">
                <th className="text-left py-2 font-medium">Categoria</th>
                <th className="text-left py-2 font-medium">Quantidade</th>
                <th className="text-left py-2 font-medium">Peso total (kg)</th>
                <th className="text-left py-2 font-medium">Peso médio (kg)</th>
                {!movsReadonly && <th className="text-right py-2 font-medium">Ações</th>}
              </tr>
            </thead>
            <tbody>
              {selecionadas.length === 0 && (
                <tr><td colSpan={5} className="py-3 text-center text-xs text-muted-foreground">Nenhuma movimentação selecionada.</td></tr>
              )}
              {selecionadas.map(m => (
                <tr key={m.id} className="border-b">
                  <td className="py-2">{m.categoria}</td>
                  <td className="py-2">{m.quantidade}</td>
                  <td className="py-2">{m.pesoTotalKg != null ? fmt(m.pesoTotalKg) : '—'}</td>
                  <td className="py-2">{m.pesoMedioKg != null ? fmt(m.pesoMedioKg) : '—'}</td>
                  {!movsReadonly && (
                    <td className="py-2 text-right">
                      <button onClick={() => toggle(m.id)} className="text-muted-foreground hover:text-destructive text-xs">remover</button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="rounded-lg border bg-card p-5">
        <h4 className="font-semibold mb-3">Resumo do Lote</h4>
        <div className="grid grid-cols-3 gap-4 text-sm">
          <div><div className="text-muted-foreground text-xs">Quantidade total</div><div className="text-lg font-bold">{qtdTotal}</div><div className="text-xs text-muted-foreground">animais</div></div>
          <div><div className="text-muted-foreground text-xs">Peso total</div><div className="text-lg font-bold">{fmt(pesoTotal)}</div><div className="text-xs text-muted-foreground">kg</div></div>
          <div><div className="text-muted-foreground text-xs">Peso médio</div><div className="text-lg font-bold">{fmt(pesoMedio)}</div><div className="text-xs text-muted-foreground">kg</div></div>
        </div>
      </div>

      <div className="rounded-md bg-blue-50 border border-blue-200 px-3 py-2 text-xs text-blue-700 flex items-center gap-2">
        <Info className="h-4 w-4 shrink-0" /> Quantidades e pesos são registrados para referência do lote. O valor da operação é composto pelas parcelas na aba Financeiro.
      </div>
    </div>
  );
}
