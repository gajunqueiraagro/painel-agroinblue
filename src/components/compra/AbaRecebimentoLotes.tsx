import { useState } from 'react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Check, Undo2, Lock, FileText, AlertTriangle } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { DatePicker } from '@/components/ui/date-picker';
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

/* Colunas independentes: #, Categoria, Negociado, Recebido, Diferença, Data, Qtd. a receber, Peso méd., Estado, Ações.
   `minmax(0,Nfr)` e nao `Nfr` puro: trilha `fr` tem minimo AUTOMATICO de conteudo,
   entao o mesmo GRID resolvia larguras DIFERENTES no cabecalho e na linha — la a
   trilha era empurrada pela palavra ("NEGOCIADO", "DIFERENÇA"), aqui pelo input e
   pelo DatePicker. Com o minimo em 0 as dez trilhas passam a depender so da largura
   do container, que e' a mesma nos dois, e as colunas coincidem.
   Com o minimo em 0 a trilha deixa de ceder a palavra do cabecalho, e "NEGOCIADO"
   (64px) passava a estourar os 58px que 0.6fr dava. Compensado no proprio peso:
   0.6 -> 0.66 em Negociado e 1.4 -> 1.34 em Data, que sobrava. A SOMA (8.05) nao
   muda, entao nenhuma outra coluna se mexe. */
const GRID = 'grid grid-cols-[minmax(0,0.35fr)_minmax(0,1.3fr)_minmax(0,0.66fr)_minmax(0,0.6fr)_minmax(0,0.7fr)_minmax(0,1.34fr)_minmax(0,0.65fr)_minmax(0,0.75fr)_minmax(0,0.8fr)_minmax(0,0.9fr)] gap-1.5';
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
  const [encerrarOpen, setEncerrarOpen] = useState(false);
  const [motivoEncerrar, setMotivoEncerrar] = useState('');
  const [reabrirOpen, setReabrirOpen] = useState(false);
  const [motivoReabrir, setMotivoReabrir] = useState('');
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
  // Entrega encerrada tem precedência de exibição sobre a negociação não concluída: uma operação
  //   programada+encerrada mostra os lotes em consulta + "Reabrir recebimento". Só quando NÃO encerrada
  //   e negociação não concluída é que exibimos o aviso de indisponibilidade (estado pós-reabertura).
  if (!concluida && !encerrada) {
    return (
      <div className="rounded-md border border-dashed bg-muted/10 px-3 py-5 text-center space-y-1">
        <div className="text-[12px] font-semibold text-foreground">Recebimento indisponível — negociação ainda não concluída</div>
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

  /* SALDO — nao confundir com o gate de leitura. `readOnly` responde "pode
     escrever?"; isto responde "sobrou o que receber?". Faltava a segunda, e por
     isso uma entrega 29/29 ainda oferecia "Receber".
     Le o MESMO saldo que a linha exibe (Negociado x Recebido), sem derivar de
     outra fonte. `estado === 'completo'` cobre o que a view ja fechou.
     qtdNegociada NULA e' negociado DESCONHECIDO, nao zero: sem saber o alvo nao
     da' para afirmar que nao ha saldo, entao o botao fica. */
  const semSaldo = (l: LoteRecebimento) =>
    l.estado === 'completo' || (l.qtdNegociada != null && l.qtdRecebida >= l.qtdNegociada);
  const algumLoteComSaldo = api.lotes.some(l => !semSaldo(l));

  // Totais soberanos (soma dos lotes) para o dialog de encerramento. Motivo obrigatório quando há
  //   diferença ou zero recebido — a UI torna a consequência explícita; o writer já exige o motivo.
  const totalNegociado = api.lotes.reduce((s, l) => s + (l.qtdNegociada ?? 0), 0);
  const totalRecebido = api.lotes.reduce((s, l) => s + l.qtdRecebida, 0);
  const diferencaTotal = totalNegociado - totalRecebido;
  const zeroRecebido = totalRecebido === 0;
  const motivoEncerrarObrigatorio = diferencaTotal !== 0 || zeroRecebido;
  const podeEncerrar = !api.saving && (!motivoEncerrarObrigatorio || motivoEncerrar.trim() !== '');
  const podeReabrir = !api.saving && motivoReabrir.trim() !== '';

  // Fecha o dialog ANTES de disparar (nunca congela); o hook cuida de toast/refetch/versão.
  const submitEncerrar = () => {
    if (!podeEncerrar) return;
    const m = motivoEncerrar.trim();
    setEncerrarOpen(false); setMotivoEncerrar('');
    void api.encerrar(m || 'encerramento pela aba Recebimento');
  };
  const submitReabrir = () => {
    if (!podeReabrir) return;
    const m = motivoReabrir.trim();
    setReabrirOpen(false); setMotivoReabrir('');
    void api.reabrir(m);
  };

  return (
    <div className="rounded-md border bg-card p-1.5 shadow-sm space-y-1.5 min-w-0">{/* PR-OC-UX-DENSIDADE-01 item 5 — padding/gap reduzidos */}
      <div className="flex items-center justify-between gap-2">
        <div>
          <div className="text-[12px] font-semibold text-foreground">Recebimento por lote</div>
          <div className="text-[11px] text-muted-foreground">
            {encerrada ? 'Recebimento encerrado — somente leitura.' : somenteLeitura ? 'Somente leitura.' : 'Registre a quantidade efetivamente recebida por lote.'}
          </div>
        </div>
        {!readOnly && algumLoteComSaldo && (
          <Button type="button" variant="outline" size="sm" className="h-7 text-[11px] gap-1" disabled={api.saving} onClick={() => void api.receberTodos()}>
            <Check className="h-3 w-3" /> Receber todos conforme negociado
          </Button>
        )}
      </div>

      <div className="overflow-x-auto">
        <div className="min-w-[840px]">
          {/* `border border-transparent` NAO e' decoracao: a LINHA tem `border`, e a
              borda entra na largura da caixa. Sem ela aqui, o conteudo do cabecalho
              comeca 1px antes e distribui as dez colunas sobre 2px a mais que a
              linha — o GRID e' o mesmo, o envoltorio e' que nao era. */}
          <div className={`${GRID} border border-transparent px-1 pb-0.5 text-[10px] font-bold uppercase tracking-wide text-muted-foreground [&>span]:text-center`}>
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
                <DatePicker value={dataReb[l.loteId] ?? hoje} onChange={v => setDataReb(s => ({ ...s, [l.loteId]: v }))}
                  className="h-6 text-[10px]" />
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
                {!readOnly && !semSaldo(l) && (
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
            onClick={() => { setMotivoEncerrar(''); setEncerrarOpen(true); }}>
            <Lock className="h-3 w-3" /> Encerrar recebimento
          </Button>
        </div>
      )}
      {/* Reabertura: só quando a entrega está encerrada e a operação não é somente-leitura (ex.: cancelada).
          Não altera a negociação — se programada, após reabrir volta a "indisponível" pelos gates. */}
      {encerrada && !somenteLeitura && (
        <div className="flex justify-end pt-1">
          <Button type="button" variant="outline" size="sm" className="h-7 text-[11px] gap-1" disabled={api.saving}
            onClick={() => { setMotivoReabrir(''); setReabrirOpen(true); }}>
            <Undo2 className="h-3 w-3" /> Reabrir recebimento
          </Button>
        </div>
      )}

      {/* Encerramento com consequência EXPLÍCITA (substitui a confirmação fraca). Motivo obrigatório quando
          há diferença ou zero recebido; alerta forte + botão destrutivo quando nada foi recebido. */}
      <Dialog open={encerrarOpen} onOpenChange={o => { if (!o) setEncerrarOpen(false); }}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle className="text-[13px]">Encerrar recebimento</DialogTitle></DialogHeader>
          <div className="space-y-2 text-[12px]">
            <div className="grid grid-cols-3 gap-1.5">
              <div className="rounded border bg-muted/30 px-1.5 py-1"><div className="text-[10px] text-muted-foreground">Negociado</div><div className="font-semibold tabular-nums">{totalNegociado}</div></div>
              <div className="rounded border bg-muted/30 px-1.5 py-1"><div className="text-[10px] text-muted-foreground">Recebido</div><div className="font-semibold tabular-nums">{totalRecebido}</div></div>
              <div className={`rounded border px-1.5 py-1 ${diferencaTotal !== 0 ? 'border-amber-500 bg-amber-50 dark:bg-amber-950/30' : 'bg-muted/30'}`}><div className="text-[10px] text-muted-foreground">Diferença</div><div className={`font-semibold tabular-nums ${diferencaTotal !== 0 ? 'text-amber-700 dark:text-amber-300' : ''}`}>{diferencaTotal}</div></div>
            </div>
            {zeroRecebido ? (
              <div className="flex items-start gap-1.5 rounded border border-destructive bg-destructive/10 px-2 py-1.5 text-[11px] text-destructive">
                <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                <span>Nenhum animal foi recebido. Deseja encerrar esta entrega mesmo assim?</span>
              </div>
            ) : (
              <div className="text-[11px] text-muted-foreground">
                Após encerrar, novos recebimentos ficarão bloqueados e a reabertura exigirá justificativa.
              </div>
            )}
            <div>
              <div className="text-[11px] font-medium">Motivo{motivoEncerrarObrigatorio ? ' *' : ' (opcional)'}</div>
              <Textarea value={motivoEncerrar} onChange={e => setMotivoEncerrar(e.target.value)} rows={2}
                className="mt-0.5 text-[12px]" placeholder={motivoEncerrarObrigatorio ? 'Justifique a diferença / ausência de recebimento' : 'Opcional'} />
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" size="sm" onClick={() => setEncerrarOpen(false)}>Cancelar</Button>
            <Button type="button" size="sm" variant={zeroRecebido ? 'destructive' : 'default'} disabled={!podeEncerrar} onClick={submitEncerrar}>
              Encerrar entrega
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Reabertura AUDITADA da entrega (não altera a negociação). Motivo obrigatório. */}
      <Dialog open={reabrirOpen} onOpenChange={o => { if (!o) setReabrirOpen(false); }}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle className="text-[13px]">Reabrir recebimento</DialogTitle></DialogHeader>
          <div className="space-y-2 text-[12px]">
            <div className="text-[11px] text-muted-foreground">
              Esta ação é <b>auditada</b>: reabre a entrega para novos recebimentos e fica registrada com o motivo informado. <b>Não</b> altera a negociação — se a operação estiver programada, o recebimento seguirá indisponível até a negociação ser concluída.
            </div>
            <div>
              <div className="text-[11px] font-medium">Motivo *</div>
              <Textarea value={motivoReabrir} onChange={e => setMotivoReabrir(e.target.value)} rows={2}
                className="mt-0.5 text-[12px]" placeholder="Justifique a reabertura" />
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" size="sm" onClick={() => setReabrirOpen(false)}>Cancelar</Button>
            <Button type="button" size="sm" disabled={!podeReabrir} onClick={submitReabrir}>Reabrir</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

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
