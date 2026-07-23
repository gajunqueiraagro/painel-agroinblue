import { useState } from 'react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Check, Undo2, Lock } from 'lucide-react';
import { parseNumericValue } from '@/lib/calculos/abate';
import type { RecebimentoApi, EstadoRecebimento } from '@/hooks/useOperacaoRecebimento';

// Aba Recebimento (PR-OC-RECEB-01). Lotes negociados aparecem automaticamente; registro/estorno
//   por lote; "Receber todos conforme negociado"; divergência por lote; encerrar recebimento.
//   Peso médio recebido OPCIONAL (compra); peso negociado só referência. Nunca médio+total juntos.
interface Props {
  api: RecebimentoApi;
  operacaoPronta: boolean;      // ocOperacaoId presente
  concluida: boolean;           // status_comercial='fechada' (negociação concluída)
  encerrada: boolean;           // entrega_encerrada
  isCompra: boolean;
  somenteLeitura?: boolean;     // OPEN-01: abertura de operação existente — aba read-only
  onVoltarNegociacao?: () => void;
}

const GRID = 'grid grid-cols-[0.5fr_1.1fr_0.8fr_0.8fr_0.9fr_1fr_0.8fr] gap-2';
const TONE: Record<EstadoRecebimento, string> = {
  nao_iniciado: 'bg-slate-100 text-slate-600',
  parcial: 'bg-amber-100 text-amber-700',
  completo: 'bg-emerald-100 text-emerald-700',
  excedente: 'bg-rose-100 text-rose-700',
};
const LABEL: Record<EstadoRecebimento, string> = {
  nao_iniciado: 'Não iniciado', parcial: 'Parcial', completo: 'Completo', excedente: 'Excedente',
};

export function AbaRecebimentoLotes({ api, operacaoPronta, concluida, encerrada, isCompra, somenteLeitura, onVoltarNegociacao }: Props) {
  const [qtd, setQtd] = useState<Record<string, string>>({});
  const [peso, setPeso] = useState<Record<string, string>>({});
  // OPEN-01: abertura existente = read-only (equivale ao "encerrada" para fins de escrita/exibição).
  const readOnly = encerrada || somenteLeitura;

  if (!operacaoPronta) {
    return (
      <div className="rounded-md border border-dashed bg-muted/10 px-3 py-5 text-center space-y-2">
        <div className="text-[11px] text-muted-foreground">Salve a operação e informe os lotes na aba Negociação.</div>
        {onVoltarNegociacao && <Button type="button" variant="outline" size="sm" className="h-7 text-[11px]" onClick={onVoltarNegociacao}>Voltar para Negociação</Button>}
      </div>
    );
  }
  if (!concluida) {
    return (
      <div className="rounded-md border border-dashed bg-muted/10 px-3 py-5 text-center space-y-1">
        <div className="text-[12px] font-semibold text-foreground">Recebimento indisponível</div>
        <div className="text-[11px] text-muted-foreground">Conclua a negociação (botão “Concluir negociação”) para registrar o recebimento físico.</div>
      </div>
    );
  }

  const registrar = (loteId: string, categoria: string | null) => {
    const q = parseNumericValue(qtd[loteId] ?? '') || 0;
    if (q <= 0) return;
    const pm = parseNumericValue(peso[loteId] ?? '');
    void api.registrar(loteId, {
      data: new Date().toISOString().slice(0, 10),
      categoria: categoria ?? '',
      quantidade: Math.trunc(q),
      pesoMedio: isCompra && pm ? pm : null,
      observacao: '',
    }).then(() => { setQtd(s => ({ ...s, [loteId]: '' })); setPeso(s => ({ ...s, [loteId]: '' })); });
  };

  const movsAtivas = api.movimentacoes.filter(m => !m.cancelado);

  return (
    <div className="rounded-md border bg-card p-2 shadow-sm space-y-2 min-w-0">
      <div className="flex items-center justify-between gap-2">
        <div>
          <div className="text-[12px] font-semibold text-foreground">Recebimento por lote</div>
          <div className="text-[11px] text-muted-foreground">
            {encerrada ? 'Recebimento encerrado — somente leitura.' : somenteLeitura ? 'Somente leitura.' : 'Registre a quantidade efetivamente recebida por lote.'}
          </div>
        </div>
        {!readOnly && (
          <Button type="button" variant="outline" size="sm" className="h-7 text-[11px] gap-1" disabled={api.saving} onClick={() => void api.receberTodos()}>
            <Check className="h-3 w-3" /> Receber todos conforme negociado
          </Button>
        )}
      </div>

      <div className="overflow-x-auto">
        <div className="min-w-[720px]">
          <div className={`${GRID} px-1 pb-0.5 text-[10px] font-bold uppercase tracking-wide text-muted-foreground`}>
            <span>#</span><span>Categoria</span><span className="text-right">Negociado</span>
            <span className="text-right">Recebido</span><span className="text-right">Diferença</span>
            <span>{readOnly ? 'Estado' : 'Receber (qtd · peso méd.)'}</span><span className="text-center">Ações</span>
          </div>
          {api.lotes.length === 0 ? (
            <div className="rounded-md border border-dashed bg-muted/10 px-3 py-3 text-center text-[11px] text-muted-foreground">
              {api.loading ? 'Carregando…' : 'Nenhum lote negociado.'}
            </div>
          ) : api.lotes.map(l => (
            <div key={l.loteId} className={`${GRID} items-center rounded-md border bg-muted/20 px-1 py-0.5`}>
              <div className="text-[11px] text-muted-foreground">{l.ordem}</div>
              <div className="text-[11px] truncate">{l.categoria ?? '—'}</div>
              <div className="text-[11px] text-right tabular-nums">{l.qtdNegociada ?? '—'}</div>
              <div className="text-[11px] text-right tabular-nums font-semibold">{l.qtdRecebida}</div>
              <div className={`text-[11px] text-right tabular-nums ${l.diferenca !== 0 ? 'text-amber-600' : ''}`}>{l.diferenca}</div>
              {readOnly ? (
                <div><span className={`inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-medium ${TONE[l.estado]}`}>{LABEL[l.estado]}</span></div>
              ) : (
                <div className="flex items-center gap-1">
                  <Input inputMode="numeric" value={qtd[l.loteId] ?? ''} onChange={e => setQtd(s => ({ ...s, [l.loteId]: e.target.value }))}
                    placeholder="qtd" className="h-6 w-16 text-[11px] text-right tabular-nums" />
                  {isCompra && (
                    <Input inputMode="decimal" value={peso[l.loteId] ?? ''} onChange={e => setPeso(s => ({ ...s, [l.loteId]: e.target.value }))}
                      placeholder="peso méd." className="h-6 w-20 text-[11px] text-right tabular-nums" />
                  )}
                </div>
              )}
              <div className="text-center">
                {!readOnly && (
                  <Button type="button" variant="ghost" size="sm" className="h-6 px-2 text-[10px]" disabled={api.saving} onClick={() => registrar(l.loteId, l.categoria)}>
                    Receber
                  </Button>
                )}
                <span className={`ml-1 inline-flex items-center rounded px-1.5 py-0.5 text-[9px] font-medium ${TONE[l.estado]}`}>{LABEL[l.estado]}</span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Movimentações registradas (com estorno antes do encerramento) */}
      {movsAtivas.length > 0 && (
        <div className="space-y-0.5">
          <div className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">Movimentações registradas</div>
          {movsAtivas.map(m => (
            <div key={m.id} className="flex items-center justify-between gap-2 rounded border bg-muted/10 px-2 py-0.5 text-[11px]">
              <span className="tabular-nums">{m.data ? m.data.split('-').reverse().join('/') : '—'} · {m.categoria ?? '—'} · {m.quantidade} cab{m.pesoMedio ? ` · ${m.pesoMedio} kg` : ''}</span>
              {!readOnly && (
                <Button type="button" variant="ghost" size="sm" className="h-5 px-1.5 text-[10px] text-muted-foreground hover:text-destructive gap-1"
                  disabled={api.saving} onClick={() => void api.estornar(m.id, 'estorno pela aba Recebimento')}>
                  <Undo2 className="h-3 w-3" /> Estornar
                </Button>
              )}
            </div>
          ))}
        </div>
      )}

      {!readOnly && (
        <div className="flex justify-end pt-1">
          <Button type="button" variant="outline" size="sm" className="h-7 text-[11px] gap-1" disabled={api.saving}
            onClick={() => void api.encerrar('encerramento pela aba Recebimento')}>
            <Lock className="h-3 w-3" /> Encerrar recebimento
          </Button>
        </div>
      )}
    </div>
  );
}
