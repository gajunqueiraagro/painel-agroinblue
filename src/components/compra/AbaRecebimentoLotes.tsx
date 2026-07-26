import { useState } from 'react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Check, Undo2, Lock, FileText } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { parseNumericValue } from '@/lib/calculos/abate';
import type { RecebimentoApi, EstadoRecebimento, LoteRecebimento } from '@/hooks/useOperacaoRecebimento';
import type { DocumentosApi } from '@/hooks/useOperacaoDocumentos';
import { DocumentoFormOC, FORM_VAZIO } from './DocumentoFormOC';

// Aba Recebimento (PR-OC-RECEB-01). Lotes negociados aparecem automaticamente; registro/estorno
//   por lote; "Receber todos conforme negociado"; divergência por lote; encerrar recebimento.
//   Peso médio recebido OPCIONAL (compra); peso negociado só referência. Nunca médio+total juntos.
interface Props {
  api: RecebimentoApi;
  operacaoPronta: boolean;      // ocOperacaoId presente
  concluida: boolean;           // status_comercial='fechada' (negociação concluída)
  encerrada: boolean;           // entrega_encerrada
  isCompra: boolean;
  categoriasDisponiveis: { value: string; label: string }[];  // catálogo oficial (tradução de slugs)
  documentosApi?: DocumentosApi;   // instância ÚNICA — registro rápido reutiliza a persistência oficial
  somenteLeitura?: boolean;     // OPEN-01: abertura de operação existente — aba read-only
  onVoltarNegociacao?: () => void;
}

// Colunas independentes: #, Categoria, Negociado, Recebido, Diferença, Data, Qtd. a receber, Peso méd., Estado, Ações.
const GRID = 'grid grid-cols-[0.35fr_1.3fr_0.6fr_0.6fr_0.7fr_1.4fr_0.65fr_0.75fr_0.8fr_0.9fr] gap-2';
const TONE: Record<EstadoRecebimento, string> = {
  nao_iniciado: 'bg-slate-100 text-slate-600',
  parcial: 'bg-amber-100 text-amber-700',
  completo: 'bg-emerald-100 text-emerald-700',
  excedente: 'bg-rose-100 text-rose-700',
};
const LABEL: Record<EstadoRecebimento, string> = {
  nao_iniciado: 'Não iniciado', parcial: 'Parcial', completo: 'Completo', excedente: 'Excedente',
};

export function AbaRecebimentoLotes({ api, operacaoPronta, concluida, encerrada, isCompra, categoriasDisponiveis, documentosApi, somenteLeitura, onVoltarNegociacao }: Props) {
  const [qtd, setQtd] = useState<Record<string, string>>({});
  const [peso, setPeso] = useState<Record<string, string>>({});
  const [dataReb, setDataReb] = useState<Record<string, string>>({});
  const [docLoteId, setDocLoteId] = useState<string | null>(null);   // lote-contexto do registro rápido de documento
  const hoje = new Date().toISOString().slice(0, 10);
  // OPEN-01: abertura existente = read-only (equivale ao "encerrada" para fins de escrita/exibição).
  const readOnly = encerrada || somenteLeitura;
  // Tradução slug -> nome oficial (mesmo catálogo usado na Negociação p/ escolher a categoria;
  //   por isso todo slug persistido resolve para um label; nunca exibir slug cru).
  const catLabel = (slug: string | null | undefined) => (slug ? (categoriasDisponiveis.find(c => c.value === slug)?.label ?? slug) : '—');

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

  // Valor INICIAL do input Peso méd. = peso médio negociado oficial do lote (por loteId; nunca por
  //   ordem/categoria/posição). Ausência → vazio (nunca 0). Só inicializa: não persiste sozinho.
  const pesoInicial = (l: LoteRecebimento) =>
    (l.pesoMedioNegociadoKg != null && Number.isFinite(l.pesoMedioNegociadoKg)) ? String(l.pesoMedioNegociadoKg) : '';

  const registrar = (l: LoteRecebimento) => {
    const q = parseNumericValue(qtd[l.loteId] ?? '') || 0;
    if (q <= 0) return;
    // valor efetivo: o que o operador digitou; se não tocou, o negociado que inicializa o campo.
    const pm = parseNumericValue(peso[l.loteId] ?? pesoInicial(l));
    void api.registrar(l.loteId, {
      data: dataReb[l.loteId] || hoje,
      categoria: l.categoria ?? '',
      quantidade: Math.trunc(q),
      pesoMedio: isCompra && pm ? pm : null,
      observacao: '',
    }).then(() => { setQtd(s => ({ ...s, [l.loteId]: '' })); setPeso(s => { const n = { ...s }; delete n[l.loteId]; return n; }); });
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
        <div className="min-w-[840px]">
          <div className={`${GRID} px-1 pb-0.5 text-[10px] font-bold uppercase tracking-wide text-muted-foreground [&>span]:text-center`}>
            <span>#</span><span>Categoria</span><span>Negociado</span>
            <span>Recebido</span><span>Diferença</span><span>Data</span>
            <span>Qtd. a receber</span><span>Peso méd.</span>
            <span>Estado</span><span>Ações</span>
          </div>
          {api.lotes.length === 0 ? (
            <div className="rounded-md border border-dashed bg-muted/10 px-3 py-3 text-center text-[11px] text-muted-foreground">
              {api.loading ? 'Carregando…' : 'Nenhum lote negociado.'}
            </div>
          ) : api.lotes.map(l => (
            <div key={l.loteId} className={`${GRID} items-center rounded-md border bg-muted/20 px-1 py-0.5`}>
              <div className="text-[11px] text-center text-muted-foreground tabular-nums">{l.ordem}</div>
              <div className="text-[11px] break-words">{catLabel(l.categoria)}</div>
              <div className="text-[11px] text-right tabular-nums">{l.qtdNegociada ?? '—'}</div>
              <div className="text-[11px] text-right tabular-nums font-semibold">{l.qtdRecebida}</div>
              <div className={`text-[11px] text-right tabular-nums ${l.diferenca !== 0 ? 'text-amber-600' : ''}`}>{l.diferenca}</div>
              {/* Data (default hoje, editável, enviada no payload existente) */}
              {readOnly ? (
                <div className="text-[11px] text-center text-muted-foreground">—</div>
              ) : (
                <Input type="date" value={dataReb[l.loteId] ?? hoje} onChange={e => setDataReb(s => ({ ...s, [l.loteId]: e.target.value }))}
                  className="h-6 w-full text-[10px] tabular-nums" />
              )}
              {/* Qtd. a receber */}
              {readOnly ? (
                <div className="text-[11px] text-center text-muted-foreground">—</div>
              ) : (
                <Input inputMode="numeric" value={qtd[l.loteId] ?? ''} onChange={e => setQtd(s => ({ ...s, [l.loteId]: e.target.value }))}
                  placeholder="0" className="h-6 w-full text-[11px] text-right tabular-nums" />
              )}
              {/* Peso méd. */}
              {readOnly || !isCompra ? (
                <div className="text-[11px] text-center text-muted-foreground">—</div>
              ) : (
                <Input inputMode="decimal" value={peso[l.loteId] ?? pesoInicial(l)} onChange={e => setPeso(s => ({ ...s, [l.loteId]: e.target.value }))}
                  placeholder="—" className="h-6 w-full text-[11px] text-right tabular-nums" />
              )}
              {/* Estado (coluna própria) */}
              <div className="text-center">
                <span className={`inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-medium ${TONE[l.estado]}`}>{LABEL[l.estado]}</span>
              </div>
              {/* Ações */}
              <div className="flex items-center justify-center gap-1">
                {!readOnly && (
                  <Button type="button" variant="ghost" size="sm" className="h-6 px-2 text-[10px]" disabled={api.saving} onClick={() => registrar(l)}>
                    Receber
                  </Button>
                )}
                {!readOnly && documentosApi && (
                  <Button type="button" variant="ghost" size="sm" className="h-6 px-1.5 text-[10px] gap-1 text-muted-foreground" onClick={() => setDocLoteId(l.loteId)} title="Registrar documento deste lote">
                    <FileText className="h-3 w-3" /> Doc.
                  </Button>
                )}
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
              <span className="tabular-nums">{m.data ? m.data.split('-').reverse().join('/') : '—'} • {catLabel(m.categoria)} • {m.quantidade} cab{m.pesoMedio != null ? ` • ${m.pesoMedio.toLocaleString('pt-BR')} kg` : ''}</span>
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

      {/* Registro rápido de documento no contexto do lote — reutiliza o cadastro OFICIAL (DocumentoFormOC)
          com a instância única documentosApi. Ao salvar: fecha, dados atualizam (mesmo hook) e permanece aqui.
          A aba Documentos segue sendo a tela oficial de consulta/manutenção completa. */}
      {documentosApi && (
        <Dialog open={!!docLoteId} onOpenChange={o => { if (!o) setDocLoteId(null); }}>
          <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="text-[13px]">
                Novo documento{docLoteId ? ` — Lote ${api.lotes.find(l => l.loteId === docLoteId)?.ordem ?? ''}` : ''}
              </DialogTitle>
            </DialogHeader>
            {docLoteId && (
              <DocumentoFormOC
                key={docLoteId}
                api={documentosApi}
                initialForm={{ ...FORM_VAZIO, loteIds: [docLoteId] }}
                hideHeader
                onSaved={() => setDocLoteId(null)}
                onCancel={() => setDocLoteId(null)}
              />
            )}
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}
