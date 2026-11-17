/**
 * OPENFINANCE-P3a — "Escolher contas" de UMA conexão (só o admin AgroinBlue; Gabriel 16/11, saída A): lista o que a Pluggy tem nesta
 * conexão — tipo · banco · final · titular e CPF mascarados, nunca saldo nem transação — e o admin MARCA o que entra. Tudo desmarcado
 * na 1ª vez. Gravar = prévia (entram/continuam/saem) → confirmar → `openfinance-contas` 'permitir'. O resto nunca é lido nem gravado.
 */
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { TD_REGUA, TD_REGUA_NUM, TD_REGUA_TEXTO, TH_REGUA, TextoReservado } from '@/components/ui/regua-tabela';
import {
  contasDaResposta, escolhaMudou, FRASE_CONTAS_FALHOU, FRASE_PERMITIR_FALHOU, frasePrevia, fraseDoPermitir, lerRespostaDaBorda,
  marcadasDePartida, type ContaDaConexao,
} from '@/lib/openfinance/openfinanceTela';
import { LigarContaDoSistema } from './LigarContaDoSistema';

export function EscolherContasDoBanco({ clienteId, itemId, onFechar }: { clienteId: string; itemId: string | null; onFechar: () => void }) {
  const [contas, setContas] = useState<ContaDaConexao[] | null>(null);
  const [marcadas, setMarcadas] = useState<Set<string>>(new Set());
  const [previa, setPrevia] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const [gravadas, setGravadas] = useState(0); // P3b: relê o "Lança na conta" depois de gravar a escolha

  useEffect(() => {
    if (!itemId) return;
    let vivo = true;
    setContas(null); setPrevia(null); setMarcadas(new Set());
    void (async () => {
      try {
        const r = await lerRespostaDaBorda(await supabase.functions.invoke('openfinance-contas',
          { body: { acao: 'listar', cliente_id: clienteId, item_id: itemId } }), FRASE_CONTAS_FALHOU);
        if (!vivo) return;
        if (r.ok === false) { toast.error(r.frase); onFechar(); return; }
        const lista = contasDaResposta(r.corpo);
        setContas(lista); setMarcadas(marcadasDePartida(lista));
      } catch { if (vivo) { toast.error(FRASE_CONTAS_FALHOU); onFechar(); } }
    })();
    return () => { vivo = false; };
  }, [clienteId, itemId, onFechar]);

  const alternar = (id: string, v: boolean) => {
    setPrevia(null);
    setMarcadas(atual => { const n = new Set(atual); if (v) n.add(id); else n.delete(id); return n; });
  };
  const permitir = async (simular: boolean) => {
    if (!itemId) return;
    setOcupado(true);
    try {
      const r = await lerRespostaDaBorda(await supabase.functions.invoke('openfinance-contas',
        { body: { acao: 'permitir', cliente_id: clienteId, item_id: itemId, account_ids: [...marcadas], simular } }), FRASE_PERMITIR_FALHOU);
      if (r.ok === false) { toast.error(r.frase); return; }
      if (simular) { setPrevia(frasePrevia(r.corpo)); return; }
      toast.success(fraseDoPermitir(r.corpo));
      setGravadas((n) => n + 1); setPrevia(null);
      setContas((cs) => cs && cs.map((c) => ({ ...c, permitida: marcadas.has(c.accountId) })));
    } catch { toast.error(FRASE_PERMITIR_FALHOU); } finally { setOcupado(false); }
  };

  const mudou = contas !== null && escolhaMudou(contas, marcadas);
  return (
    <Dialog open={itemId !== null} onOpenChange={(v) => { if (!v && !ocupado) onFechar(); }}>
      <DialogContent className="max-w-[560px]" data-testid="openfinance-escolher-dialogo">
        <DialogHeader>
          <DialogTitle className="text-[13px]">Escolher contas</DialogTitle>
          <DialogDescription className="text-[11px]">
            Marque só as contas deste cliente. As não marcadas nunca são lidas nem gravadas no AgroinBlue.
          </DialogDescription>
        </DialogHeader>
        <div className="h-[176px] overflow-auto rounded-md border">
          <table className="w-full table-fixed border-collapse">
            <colgroup><col style={{ width: 28 }} /><col style={{ width: 118 }} /><col style={{ width: 76 }} /><col style={{ width: 52 }} /><col /><col style={{ width: 104 }} /></colgroup>
            <thead className="sticky top-0 bg-primary">
              <tr><th className={TH_REGUA} /><th className={`${TH_REGUA} text-left`}>Tipo</th><th className={`${TH_REGUA} text-left`}>Banco</th>
                <th className={`${TH_REGUA} text-right`}>Final</th><th className={`${TH_REGUA} text-left`}>Titular</th><th className={`${TH_REGUA} text-right`}>CPF/CNPJ</th></tr>
            </thead>
            <tbody>
              {contas === null ? <tr><td colSpan={6} className={`${TD_REGUA} text-muted-foreground`}>Lendo as contas na Pluggy…</td></tr>
                : contas.length === 0 ? <tr><td colSpan={6} className={`${TD_REGUA} text-muted-foreground`} data-testid="openfinance-sem-contas">A Pluggy não devolveu contas nesta conexão.</td></tr>
                : contas.map(c => (
                  <tr key={c.accountId} className="border-b last:border-b-0" data-testid="openfinance-conta">
                    <td className={TD_REGUA}>
                      <Checkbox className="h-3.5 w-3.5" checked={marcadas.has(c.accountId)} disabled={ocupado}
                        onCheckedChange={(v) => alternar(c.accountId, v === true)} aria-label={`${c.tipoLegivel} final ${c.final4 ?? '—'}`} data-testid="openfinance-conta-marcar" />
                    </td>
                    <td className={TD_REGUA_TEXTO} title={c.tipoLegivel}>{c.tipoLegivel}</td>
                    <td className={TD_REGUA_TEXTO} title={c.banco}>{c.banco}</td>
                    <td className={TD_REGUA_NUM}>{c.final4 ?? '—'}</td>
                    <td className={TD_REGUA_TEXTO} title={c.titular ?? '—'}>{c.titular ?? '—'}</td>
                    <td className={TD_REGUA_NUM}>{c.documento ?? '—'}</td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
        <div className="min-h-[34px] rounded-md border border-amber-200 bg-amber-50 px-2 py-1 text-[11px] text-amber-900" data-testid="openfinance-previa">
          {previa ?? 'Nada é gravado antes de você conferir a prévia.'}
        </div>
        {itemId && <LigarContaDoSistema clienteId={clienteId} itemId={itemId} versao={gravadas} />}
        <div className="flex items-center justify-end gap-2">
          <TextoReservado className="mr-auto text-[11px] text-muted-foreground" reserva="99 de 99 marcadas"
            texto={`${marcadas.size} de ${contas?.length ?? 0} marcadas`} testid="openfinance-contador" />
          <Button size="sm" variant="ghost" className="h-6 text-[11px]" disabled={ocupado} onClick={onFechar}>Fechar</Button>
          {previa === null
            ? <Button size="sm" className="h-6 w-[120px] text-[11px]" disabled={ocupado || !mudou} onClick={() => void permitir(true)} data-testid="openfinance-ver-previa">Ver a prévia</Button>
            : <Button size="sm" className="h-6 w-[120px] text-[11px]" disabled={ocupado} onClick={() => void permitir(false)} data-testid="openfinance-gravar-escolha">Gravar a escolha</Button>}
        </div>
      </DialogContent>
    </Dialog>
  );
}
