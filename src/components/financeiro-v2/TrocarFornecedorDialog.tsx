/**
 * TROCAR O FORNECEDOR DE VARIOS LANCAMENTOS — FORN-TROCAR-LOTE-01 (Gabriel 22/10/2026). Da lista de Lancamentos (linhas marcadas, ou
 * "todos os N do filtro"). Modal fixo, sem rolagem (so' a lista de origens rola dentro do quadro):
 *   · o resumo: N lancamentos · R$ total · de quais fornecedores saem (nome e quantos) — a simulacao do banco, sem destino;
 *   · o destino: o seletor da casa (filial: "Razao social · Municipio/UF · CNPJ completo");
 *   · os avisos: conciliados, meses fechados (com o mes), ligados a OC, ja' no destino — nao impedem (a troca e' de cadastro);
 *   · o motivo (obrigatorio) e "Trocar N lancamentos". Valor, data, conta e conciliacao nao mudam. Depois, "Desfazer" no aviso.
 */
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { FavorecidoSelect } from '@/components/shared/FavorecidoSelect';
import { QUADRO_REGUA, TD_REGUA_NUM, TD_REGUA_TEXTO, TH_REGUA } from '@/components/ui/regua-tabela';
import { aplicarTroca, desfazerTroca, simularTroca, type ResumoDaTroca } from '@/lib/financeiro/trocarFornecedor';
import { cn } from '@/lib/utils';

const brl = (v: number) => v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const mesBr = (am: string) => (/^\d{4}-\d{2}$/.test(am) ? `${am.slice(5)}/${am.slice(0, 4)}` : am);

export function TrocarFornecedorDialog({ clienteId, ids, onClose, onTrocado }: {
  clienteId: string;
  ids: readonly string[];
  onClose: () => void;
  onTrocado?: () => void;
}) {
  const [inicial, setInicial] = useState<ResumoDaTroca | null>(null);
  const [comDestino, setComDestino] = useState<ResumoDaTroca | null>(null);
  const [destino, setDestino] = useState('');
  const [motivo, setMotivo] = useState('');
  const [erro, setErro] = useState<string | null>(null);
  const [gravando, setGravando] = useState(false);

  useEffect(() => {
    let vivo = true;
    void simularTroca(clienteId, ids, null).then((r) => { if (!vivo) return; if ('erro' in r) setErro(r.erro); else setInicial(r); });
    return () => { vivo = false; };
  }, [clienteId, ids]);
  useEffect(() => {
    let vivo = true;
    setComDestino(null);
    if (!destino) return;
    void simularTroca(clienteId, ids, destino).then((r) => { if (!vivo) return; if ('erro' in r) setErro(r.erro); else setComDestino(r); });
    return () => { vivo = false; };
  }, [clienteId, ids, destino]);

  const r = comDestino ?? inicial;
  const recusa = comDestino?.recusa ?? null;
  const n = comDestino && !recusa ? comDestino.lancamentos : 0;
  const pode = !!destino && !!comDestino && !recusa && n > 0 && motivo.trim().length > 0 && !gravando;
  const avisos = r ? [
    r.conciliados ? `${r.conciliados} conciliado${r.conciliados === 1 ? '' : 's'} (a conciliação não muda)` : null,
    r.mesesFechados.length ? `${r.mesesFechadosLancamentos} em mês fechado: ${r.mesesFechados.map((m) => `${m.fazenda} ${mesBr(m.anoMes)}`).join(', ')}` : null,
    r.ligadosAOc ? `${r.ligadosAOc} ligado${r.ligadosAOc === 1 ? '' : 's'} a OC (a parte da OC mantém o fornecedor dela)` : null,
    comDestino?.jaNoDestino ? `${comDestino.jaNoDestino} já ${comDestino.jaNoDestino === 1 ? 'está' : 'estão'} neste fornecedor` : null,
    r.cancelados ? `${r.cancelados} cancelado${r.cancelados === 1 ? '' : 's'} fica${r.cancelados === 1 ? '' : 'm'} de fora` : null,
  ].filter((x): x is string => !!x) : [];

  const trocar = async () => {
    if (!pode) return;
    setGravando(true); setErro(null);
    try {
      const a = await aplicarTroca(clienteId, ids, destino, motivo.trim());
      if ('erro' in a) { setErro(a.erro); return; }
      const op = a.operacaoId;
      toast.success(`Fornecedor trocado em ${a.lancamentos} lançamento${a.lancamentos === 1 ? '' : 's'}`, op ? {
        action: { label: 'Desfazer', onClick: () => { void desfazerTroca(clienteId, op, 'desfeito logo depois da troca em lote').then((d) => (
          'erro' in d ? toast.error(d.erro) : toast.success(`Desfeito: ${d.voltaram} voltaram${d.ficaram ? `, ${d.ficaram} já mexidos ficaram` : ''}`))); } },
      } : undefined);
      onTrocado?.();
      onClose();
    } finally { setGravando(false); }
  };

  return (
    <Dialog open onOpenChange={(o) => { if (!o && !gravando) onClose(); }}>
      <DialogContent className="flex h-[min(480px,95vh)] w-[min(660px,97vw)] max-w-none flex-col gap-0 overflow-hidden p-0" data-testid="trocar-fornecedor">
        <div className="flex h-9 shrink-0 items-center bg-primary px-3.5 pr-10">
          <DialogTitle className="text-[13px] font-semibold leading-none text-primary-foreground">Trocar fornecedor</DialogTitle>
          <DialogDescription className="sr-only">Troca o fornecedor dos lançamentos marcados, com trilha e desfazer.</DialogDescription>
        </div>
        <div className="flex min-h-0 flex-1 flex-col gap-1.5 bg-muted p-2 text-[10.5px]">
          <div className="flex h-6 shrink-0 items-center gap-3 rounded-md border bg-card px-2.5 tabular-nums" data-testid="trocar-resumo">
            {inicial ? <>
              <b>{inicial.lancamentos} lançamento{inicial.lancamentos === 1 ? '' : 's'}</b>
              <span>R$ {brl(inicial.soma)}</span>
              <span className="text-muted-foreground">{inicial.origens.length} fornecedor{inicial.origens.length === 1 ? '' : 'es'} de origem</span>
            </> : <span className="text-muted-foreground">{erro ? '' : 'Lendo os lançamentos marcados…'}</span>}
          </div>
          <div className={cn(QUADRO_REGUA, 'min-h-0 flex-1')}>
            <table className="w-full shrink-0 table-fixed border-collapse bg-primary">
              <colgroup><col /><col style={{ width: 70 }} /><col style={{ width: 110 }} /></colgroup>
              <thead><tr>{['Sai de', 'Lanç.', 'R$'].map((h) => <th key={h} className={cn(TH_REGUA, h === 'Sai de' ? 'text-left' : 'text-right')}>{h}</th>)}</tr></thead>
            </table>
            <div className="min-h-0 flex-1 overflow-y-auto" data-testid="trocar-origens">
              <table className="w-full table-fixed border-collapse">
                <colgroup><col /><col style={{ width: 70 }} /><col style={{ width: 110 }} /></colgroup>
                <tbody>
                  {(inicial?.origens ?? []).map((o) => (
                    <tr key={o.id ?? 'sem'} className="border-b border-border/50" data-testid="trocar-origem">
                      <td className={TD_REGUA_TEXTO} title={o.nome}>{o.nome}</td>
                      <td className={TD_REGUA_NUM}>{o.lancamentos}</td>
                      <td className={TD_REGUA_NUM}>{brl(o.soma)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
          <div className="shrink-0" data-testid="trocar-destino">
            <span className="text-[10px] text-muted-foreground">Para o fornecedor *</span>
            <FavorecidoSelect value={destino} onChange={(v) => { setDestino(v); setErro(null); }} clienteId={clienteId} triggerClassName="h-[24px] text-[10.5px]" />
          </div>
          <div className={cn('flex h-[30px] shrink-0 items-center rounded-md px-2', recusa ? 'bg-destructive/10 text-destructive' : avisos.length ? 'bg-amber-50 text-amber-900' : 'text-muted-foreground')} data-testid="trocar-avisos">
            <span className="min-w-0 uma-linha-que-rola" title={recusa ?? avisos.join(' · ')}>
              {recusa ? `⚠ ${recusa}` : avisos.length ? `⚠ ${avisos.join(' · ')}` : 'Só o fornecedor muda: valor, data, conta e conciliação ficam como estão.'}
            </span>
          </div>
          <Textarea value={motivo} onChange={(e) => setMotivo(e.target.value)} placeholder="Motivo (obrigatório)" className="h-[44px] min-h-0 shrink-0 resize-none text-[10.5px]" data-testid="trocar-motivo" />
        </div>
        <div className="flex h-9 shrink-0 items-center gap-2 border-t bg-card px-3 text-[10.5px]">
          <span className="min-w-0 uma-linha-que-rola text-destructive" data-testid="trocar-erro" title={erro ?? undefined}>{erro ? `⚠ ${erro}` : ''}</span>
          <span className="ml-auto" />
          <Button type="button" size="sm" variant="outline" className="h-[24px] shrink-0 px-2.5 text-[10.5px]" disabled={gravando} onClick={onClose}>Cancelar</Button>
          <Button type="button" size="sm" className="h-[24px] w-[170px] shrink-0 px-2.5 text-[10.5px]" disabled={!pode} onClick={() => { void trocar(); }} data-testid="trocar-confirmar">
            {gravando ? 'Trocando…' : `Trocar ${n ? `${n} ` : ''}lançamento${n === 1 ? '' : 's'}`}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
