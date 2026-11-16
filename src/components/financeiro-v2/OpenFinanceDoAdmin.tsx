/**
 * OPENFINANCE-PILOTO-01 · P3 mínima (Gabriel 16/11 14:50) — os dois botões do ADMIN AgroinBlue na barra de Contas bancárias:
 *  · "Conectar banco"    → `openfinance-conectar` com o cliente aberto → o Widget oficial da Pluggy (token de 30 min);
 *  · "Registrar webhook" → `openfinance-webhook-registrar` pelo login do admin (idempotente na função).
 * Fora do admin, nada aparece. A tela não grava nada: o aviso chega pelo webhook; as transações são a P3 completa.
 * Os rótulos não mudam durante o pedido (nada se desloca): o botão só fica desabilitado.
 */
import { useState } from 'react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { useCliente } from '@/contexts/ClienteContext';
import { Button } from '@/components/ui/button';
import {
  carregarWidget, FRASE_CONECTAR_FALHOU, FRASE_REGISTRO_FALHOU, FRASE_WIDGET_FALHOU, fraseDoItem, fraseDoRegistro,
  lerRespostaDaBorda, tokenDaConexao,
} from '@/lib/openfinance/openfinanceTela';

export function OpenFinanceDoAdmin({ clienteId }: { clienteId: string | null }) {
  const { isAdmin } = useCliente();
  const [ocupado, setOcupado] = useState<'conectar' | 'registrar' | null>(null);
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
      let Widget;
      try { Widget = await carregarWidget(); } catch { toast.error(FRASE_WIDGET_FALHOU); return; }
      const w = new Widget({
        connectToken: token,
        includeSandbox: true, // piloto no proto: o "Pluggy Bank" de teste aparece junto dos bancos reais
        onSuccess: (dados) => toast.success(fraseDoItem(dados)),
        onError: () => toast.error('A conexão com o banco não terminou. Nada foi gravado; tente de novo.'),
      });
      await w.init();
    } catch { toast.error(FRASE_CONECTAR_FALHOU); } finally { setOcupado(null); }
  };

  return (
    <div className="flex flex-none items-center gap-1.5" data-testid="openfinance-admin">
      <Button size="sm" variant="outline" className="h-6 px-2.5 text-[11px]" disabled={ocupado !== null} onClick={() => void conectar()}
        title="Admin AgroinBlue · Open Finance (Pluggy): conectar um banco deste cliente" data-testid="openfinance-conectar">Conectar banco</Button>
      <Button size="sm" variant="outline" className="h-6 px-2.5 text-[11px]" disabled={ocupado !== null} onClick={() => void registrar()}
        title="Admin AgroinBlue · registra na Pluggy o webhook do AgroinBlue (uma vez; não duplica)" data-testid="openfinance-registrar">Registrar webhook</Button>
    </div>
  );
}
