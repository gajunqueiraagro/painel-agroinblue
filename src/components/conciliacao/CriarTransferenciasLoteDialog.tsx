/**
 * CriarTransferenciasLoteDialog — P139: várias linhas do extrato sem par viram transferências de uma vez, cada uma com a SUA outra conta.
 * A prévia é a do banco (`fn_transferencias_do_extrato_lote` com `p_simular`): a ação de cada linha, o espelho que concilia junto (cada
 * espelho serve a uma linha só) e a gêmea. A gravação é TUDO OU NADA — uma linha recusada desfaz o lote inteiro, e a frase do banco
 * aparece no rodapé (nunca toast).
 */
import { useEffect, useMemo, useState } from 'react';
import { X } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { CorpoFormulario, BlocoFormulario } from '@/components/ui/bloco-formulario';
import { ContaBancariaSelect } from '@/components/shared/ContaBancariaSelect';
import { useContasBancariasLeves } from '@/hooks/useContasBancariasLeves';
import { formatMoeda } from '@/lib/calculos/formatters';
import { cn } from '@/lib/utils';
import { loteDeTransferencias, type SimulacaoDaTransferencia, type SugestaoDeTransferencia } from '@/lib/conciliacao/transferenciaDoExtrato';
import type { MovimentoParaTransferencia } from '@/components/conciliacao/CriarTransferenciaDialog';

const dataBr = (iso: string | null | undefined) => (iso ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}` : '—');

/** O lote pode gravar? Cada linha com ação definida e a gêmea confirmada. Uma regra só para o botão e o rodapé. */
export function loteProntoParaGravar(sims: readonly SimulacaoDaTransferencia[] | null, n: number, confirmadas: ReadonlySet<string>):
  { pode: boolean; motivo: string } {
  if (!sims || sims.length !== n) return { pode: false, motivo: 'prevendo…' };
  const semConta = sims.filter((s) => s.acao === 'escolher_conta').length;
  if (semConta) return { pode: false, motivo: `escolha a outra conta de ${semConta} linha${semConta === 1 ? '' : 's'}` };
  const gemeas = sims.filter((s) => s.gemeas.length > 0 && !confirmadas.has(s.extratoId)).length;
  if (gemeas) return { pode: false, motivo: `${gemeas} linha${gemeas === 1 ? '' : 's'} com movimento igual de outra importação: confirme` };
  return { pode: true, motivo: '' };
}

export function CriarTransferenciasLoteDialog({ aberto, clienteId, movimentos, sugestoes, onFechar, onGravado }: {
  aberto: boolean;
  clienteId: string | null;
  movimentos: readonly MovimentoParaTransferencia[];
  sugestoes: ReadonlyMap<string, SugestaoDeTransferencia>;
  onFechar: () => void;
  onGravado: () => void;
}) {
  const { contas } = useContasBancariasLeves(aberto ? clienteId : null);
  const [outra, setOutra] = useState<ReadonlyMap<string, string>>(new Map());
  const [confirmadas, setConfirmadas] = useState<ReadonlySet<string>>(new Set());
  const [sims, setSims] = useState<SimulacaoDaTransferencia[] | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [gravando, setGravando] = useState(false);
  const chave = movimentos.map((m) => m.extrato_id).join(',');

  useEffect(() => {
    if (!aberto) return;
    const m = new Map<string, string>();
    for (const mv of movimentos) { const s = sugestoes.get(mv.extrato_id); if (s?.contaSugerida) m.set(mv.extrato_id, s.contaSugerida); }
    setOutra(m); setConfirmadas(new Set()); setSims(null); setErro(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reabrir com OUTRAS linhas recomeça; a lista conta pelos ids
  }, [aberto, chave]);

  const itens = useMemo(() => movimentos.map((m) => ({ extratoId: m.extrato_id, outraConta: outra.get(m.extrato_id) ?? null,
    confirmarGemea: confirmadas.has(m.extrato_id) })), [movimentos, outra, confirmadas]);

  useEffect(() => {
    if (!aberto || itens.length === 0) return;
    let vivo = true;
    void loteDeTransferencias(itens, true).then((r) => {
      if (!vivo) return;
      if ('erro' in r) { setSims(null); setErro(r.erro); } else { setSims(r.sims); setErro(null); }
    });
    return () => { vivo = false; };
  }, [aberto, itens]);

  const simDe = useMemo(() => new Map((sims ?? []).map((s) => [s.extratoId, s])), [sims]);
  const estado = loteProntoParaGravar(sims, movimentos.length, confirmadas);
  const nEspelhos = (sims ?? []).filter((s) => s.acao === 'criar' && s.espelhoId).length;

  const gravar = async () => {
    if (!estado.pode) return;
    setGravando(true); setErro(null);
    const r = await loteDeTransferencias(itens, false);
    setGravando(false);
    if ('erro' in r) setErro(r.erro); else onGravado();
  };

  const rodape = erro ?? (estado.pode
    ? `${movimentos.length} transferência${movimentos.length === 1 ? '' : 's'} · ${nEspelhos} espelho${nEspelhos === 1 ? '' : 's'} conciliado${nEspelhos === 1 ? '' : 's'} junto · tudo ou nada`
    : estado.motivo);

  return (
    <Dialog open={aberto} onOpenChange={(o) => { if (!o) onFechar(); }}>
      <DialogContent className="flex h-[min(520px,calc(100vh-16px))] w-[min(860px,calc(100vw-16px))] max-w-none flex-col gap-0 overflow-hidden p-0 [&>button.absolute]:hidden"
        data-testid="modal-criar-transferencias-lote" onPointerDownOutside={(e) => e.preventDefault()}>
        <div className="flex h-[32px] shrink-0 items-center gap-2.5 bg-primary px-3 text-primary-foreground">
          <DialogTitle className="shrink-0 whitespace-nowrap text-[13px] font-semibold">Criar transferências ({movimentos.length})</DialogTitle>
          <DialogDescription className="uma-linha-que-rola min-w-0 flex-1 text-[11px] text-primary-foreground/80">
            cada linha com a sua outra conta · prévia do banco · tudo ou nada
          </DialogDescription>
          <button type="button" onClick={onFechar} className="shrink-0 rounded p-0.5 hover:bg-white/10" aria-label="Fechar"><X className="h-3.5 w-3.5" /></button>
        </div>
        <CorpoFormulario className="min-h-0 flex-1 overflow-hidden">
          <BlocoFormulario titulo="Linhas" className="min-h-0 flex-1">
            <div className="min-h-0 flex-1 overflow-y-auto">
              <table className="w-full table-fixed text-[11px]" data-testid="tabela-lote">
                <colgroup><col style={{ width: '84px' }} /><col /><col style={{ width: '124px' }} /><col style={{ width: '220px' }} /><col style={{ width: '200px' }} /></colgroup>
                <thead className="sticky top-0 bg-primary text-primary-foreground">
                  <tr className="h-[22px] text-[9.5px] font-medium">
                    <th className="px-1 text-left">Data</th><th className="px-1 text-left">Histórico</th><th className="px-1 text-right">Valor</th>
                    <th className="px-1 text-left">Outra conta</th><th className="px-1 text-left">O que acontece</th>
                  </tr>
                </thead>
                <tbody>
                  {movimentos.map((m) => {
                    const s = simDe.get(m.extrato_id);
                    const esp = s?.acao === 'criar' && s.espelhoId ? s.espelhos.find((e) => e.id === s.espelhoId) : null;
                    const efeito = !s ? 'prevendo…' : s.acao === 'escolher_conta' ? 'escolha a conta'
                      : s.acao === 'casar_existente' ? `casa com a transferência já lançada${s.existente ? ` (${dataBr(s.existente.data)})` : ''}`
                      : esp ? `cria · concilia o espelho de ${dataBr(esp.data)}` : 'cria · outra ponta sem espelho';
                    return (
                      <tr key={m.extrato_id} className="h-[26px] border-b border-border/50">
                        <td className="px-1 tabular-nums">{dataBr(m.data)}</td>
                        <td className="truncate px-1" title={m.historico ?? ''}>{m.historico ?? '—'}</td>
                        <td className={cn('whitespace-nowrap px-1 text-right tabular-nums', m.valor < 0 ? 'text-destructive' : 'text-emerald-700')}>{formatMoeda(m.valor)}</td>
                        <td className="px-1">
                          <ContaBancariaSelect value={outra.get(m.extrato_id) ?? null} size="compact" comBusca
                            onValueChange={(id) => setOutra((o) => new Map(o).set(m.extrato_id, id))}
                            contas={contas} excluirIds={[m.conta_id]} placeholder={m.valor < 0 ? 'Para a conta' : 'Da conta'} />
                        </td>
                        <td className="px-1">
                          <div className="flex items-center gap-1">
                            <span className="truncate" title={efeito}>{efeito}</span>
                            {s && s.gemeas.length > 0 && (
                              <button type="button" aria-pressed={confirmadas.has(m.extrato_id)}
                                title="Já existe um movimento igual de outra importação, conciliado: pode ser duplicado"
                                onClick={() => setConfirmadas((c) => { const n = new Set(c); if (n.has(m.extrato_id)) n.delete(m.extrato_id); else n.add(m.extrato_id); return n; })}
                                className={cn('h-[18px] w-[60px] shrink-0 rounded border px-1 text-[10px]',
                                  confirmadas.has(m.extrato_id) ? 'border-primary bg-primary text-primary-foreground' : 'border-amber-500 bg-amber-50 text-amber-900')}>
                                {confirmadas.has(m.extrato_id) ? '✓ gêmea' : 'gêmea?'}
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </BlocoFormulario>
        </CorpoFormulario>
        <div className="flex shrink-0 items-center gap-2 border-t bg-card px-3 py-1.5">
          <span className={cn('uma-linha-que-rola min-w-0 flex-1 text-[11px]', erro ? 'text-destructive' : 'text-muted-foreground')} title={rodape}
            data-testid="rodape-lote">{rodape}</span>
          <Button variant="outline" size="sm" className="h-7 text-[11px]" onClick={onFechar}>Cancelar</Button>
          <Button size="sm" className="h-7 w-[190px] text-[11px]" onClick={() => void gravar()} disabled={!estado.pode || gravando}
            title={estado.pode ? undefined : estado.motivo} data-testid="gravar-lote">
            {gravando ? 'Gravando…' : `Criar transferências (${movimentos.length})`}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
