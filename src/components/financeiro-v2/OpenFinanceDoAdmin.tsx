/**
 * OPENFINANCE-PILOTO-01 · P3 mínima (Gabriel 16/11 14:50) + OPENFINANCE-SEG-01 (Chat 15:31) — os botões do ADMIN AgroinBlue na barra de
 * Contas bancárias:
 *  · "Conectar banco"     → `openfinance-conectar` com o cliente aberto → o Widget oficial da Pluggy PRESO aos bancos do Open Finance
 *    REGULADO (`connectorIds` que a função devolve; consentimento no app do banco, nunca login/senha; sem os bancos de teste);
 *  · "Desconectar banco"  → a lista das conexões DESTE cliente (`conexoesDoCliente`) → confirmação → `openfinance-desconectar`;
 *  · "Registrar webhook"  → `openfinance-webhook-registrar` pelo login do admin (idempotente na função).
 * Fora do admin, nada aparece. A tela não grava nada direto: quem grava são as funções; as transações são a P3 completa.
 * Os rótulos não mudam durante o pedido (nada se desloca): o botão só fica desabilitado.
 */
import { useState } from 'react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { useCliente } from '@/contexts/ClienteContext';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import {
  carregarWidget, conectoresDaConexao, conexoesDoCliente, FRASE_CONECTAR_FALHOU, FRASE_DESCONECTAR_FALHOU, FRASE_REGISTRO_FALHOU,
  FRASE_SEM_REGULADOS, FRASE_WIDGET_FALHOU, fraseDoDesconectar, fraseDoItem, fraseDoRegistro, lerRespostaDaBorda, tokenDaConexao,
  type ConexaoDoCliente, type EventoDaFila,
} from '@/lib/openfinance/openfinanceTela';

const dataCurta = (iso: string) => new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });

export function OpenFinanceDoAdmin({ clienteId }: { clienteId: string | null }) {
  const { isAdmin } = useCliente();
  const [ocupado, setOcupado] = useState<'conectar' | 'registrar' | 'desconectar' | null>(null);
  const [lista, setLista] = useState<ConexaoDoCliente[] | null>(null);
  const [aberto, setAberto] = useState(false);
  const [confirmar, setConfirmar] = useState<ConexaoDoCliente | null>(null);
  if (!isAdmin) return null;

  const registrar = async () => {
    setOcupado('registrar');
    try {
      const r = await lerRespostaDaBorda(await supabase.functions.invoke('openfinance-webhook-registrar', { body: {} }), FRASE_REGISTRO_FALHOU);
      if (r.ok === false) toast.error(r.frase); else toast.success(fraseDoRegistro(r.corpo));
    } catch { toast.error(FRASE_REGISTRO_FALHOU); } finally { setOcupado(null); }
  };

  const conectar = async () => {
    if (!clienteId) { toast.error('Escolha o cliente antes de conectar o banco.'); return; }
    setOcupado('conectar');
    try {
      const r = await lerRespostaDaBorda(await supabase.functions.invoke('openfinance-conectar', { body: { cliente_id: clienteId } }), FRASE_CONECTAR_FALHOU);
      if (r.ok === false) { toast.error(r.frase); return; }
      const token = tokenDaConexao(r.corpo);
      if (!token) { toast.error(FRASE_CONECTAR_FALHOU); return; }
      const regulados = conectoresDaConexao(r.corpo);
      if (regulados.length === 0) { toast.error(FRASE_SEM_REGULADOS); return; }
      let Widget;
      try { Widget = await carregarWidget(); } catch { toast.error(FRASE_WIDGET_FALHOU); return; }
      const w = new Widget({
        connectToken: token,
        includeSandbox: false,
        connectorIds: regulados, // SÓ o Open Finance regulado: o banco pede o consentimento no app dele; nunca login/senha aqui
        onSuccess: (dados) => toast.success(fraseDoItem(dados)),
        onError: () => toast.error('A conexão com o banco não terminou. Nada foi gravado; tente de novo.'),
      });
      await w.init();
    } catch { toast.error(FRASE_CONECTAR_FALHOU); } finally { setOcupado(null); }
  };

  const abrirDesconectar = async () => {
    if (!clienteId) { toast.error('Escolha o cliente antes de desconectar um banco.'); return; }
    setConfirmar(null); setLista(null); setAberto(true);
    const { data, error } = await (supabase as any).from('openfinance_eventos')
      .select('evento, item_id, cliente_id, client_user_id, connector_id, recebido_em')
      .or(`cliente_id.eq.${clienteId},client_user_id.eq.${clienteId}`).order('recebido_em');
    if (error) { setAberto(false); toast.error('Não consegui ler as conexões deste cliente. Tente de novo.'); return; }
    const eventos: EventoDaFila[] = Array.isArray(data) ? data : [];
    setLista(conexoesDoCliente(eventos, clienteId));
  };

  const desconectar = async (c: ConexaoDoCliente) => {
    if (!clienteId) return;
    setOcupado('desconectar');
    try {
      const r = await lerRespostaDaBorda(await supabase.functions.invoke('openfinance-desconectar', { body: { cliente_id: clienteId, item_id: c.itemId } }), FRASE_DESCONECTAR_FALHOU);
      if (r.ok === false) { toast.error(r.frase); return; }
      toast.success(fraseDoDesconectar(r.corpo));
      setLista(atual => (atual ?? []).filter(x => x.itemId !== c.itemId));
      setConfirmar(null);
    } catch { toast.error(FRASE_DESCONECTAR_FALHOU); } finally { setOcupado(null); }
  };

  return (
    <div className="flex flex-none items-center gap-1.5" data-testid="openfinance-admin">
      <Button size="sm" variant="outline" className="h-6 px-2.5 text-[11px]" disabled={ocupado !== null} onClick={() => void conectar()}
        title="Admin AgroinBlue · Open Finance regulado (Pluggy): o consentimento é dado no app do banco; nunca senha aqui" data-testid="openfinance-conectar">Conectar banco</Button>
      <Button size="sm" variant="outline" className="h-6 px-2.5 text-[11px]" disabled={ocupado !== null} onClick={() => void abrirDesconectar()}
        title="Admin AgroinBlue · apaga a conexão na Pluggy (o consentimento cai); os extratos já importados ficam" data-testid="openfinance-desconectar">Desconectar banco</Button>
      <Button size="sm" variant="outline" className="h-6 px-2.5 text-[11px]" disabled={ocupado !== null} onClick={() => void registrar()}
        title="Admin AgroinBlue · registra na Pluggy o webhook do AgroinBlue (uma vez; não duplica)" data-testid="openfinance-registrar">Registrar webhook</Button>

      <Dialog open={aberto} onOpenChange={(v) => { if (!v && ocupado !== 'desconectar') setAberto(false); }}>
        <DialogContent className="max-w-[460px]" data-testid="openfinance-desconectar-dialogo">
          <DialogHeader>
            <DialogTitle className="text-[13px]">Desconectar banco</DialogTitle>
            <DialogDescription className="text-[11px]">
              Conexões do Open Finance deste cliente. Desconectar apaga a conexão na Pluggy e o consentimento cai; os extratos já importados ficam.
            </DialogDescription>
          </DialogHeader>
          <div className="min-h-[96px] rounded-md border text-[11px]">
            {lista === null ? <div className="p-2 text-muted-foreground">Lendo as conexões…</div>
              : lista.length === 0 ? <div className="p-2 text-muted-foreground" data-testid="openfinance-sem-conexao">Nenhum banco conectado para este cliente.</div>
              : lista.map(c => (
                <div key={c.itemId} className="flex h-[26px] items-center gap-2 border-b px-2 last:border-b-0" data-testid="openfinance-conexao">
                  <span className="min-w-0 flex-1 truncate" title={`Conexão ${c.itemId}`}>Banco (conector {c.connectorId ?? '—'})</span>
                  <span className="w-[86px] flex-none tabular-nums text-muted-foreground">desde {dataCurta(c.desde)}</span>
                  <Button size="sm" variant="ghost" className="h-5 flex-none px-2 text-[11px] text-rose-700" disabled={ocupado !== null}
                    onClick={() => setConfirmar(c)} data-testid="openfinance-desconectar-este">Desconectar</Button>
                </div>
              ))}
          </div>
          {confirmar && (
            <div className="space-y-1 rounded-md border border-rose-200 bg-rose-50 p-2" data-testid="openfinance-confirmar">
              <div className="text-[11px] font-semibold text-rose-700">
                Desconectar o banco (conector {confirmar.connectorId ?? '—'})? A Pluggy apaga a conexão; não dá para desfazer (conecta-se de novo).
              </div>
              <div className="flex justify-end gap-2">
                <Button size="sm" variant="ghost" className="h-6 text-[11px]" disabled={ocupado !== null} onClick={() => setConfirmar(null)}>Voltar</Button>
                <Button size="sm" variant="destructive" className="h-6 text-[11px]" disabled={ocupado !== null}
                  onClick={() => void desconectar(confirmar)} data-testid="openfinance-confirmar-desconectar">Desconectar</Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
