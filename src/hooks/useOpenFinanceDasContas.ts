/**
 * CONTAS-OF-LINHA-01 — o que a coluna "Open Finance" de Contas bancárias lê, numa ida só (as 4 leituras juntas) e SÓ para o admin:
 * os avisos do cliente (`openfinance_eventos`, o mesmo filtro da lista "Bancos conectados"), as contas ligadas (`openfinance_contas_permitidas`),
 * as leituras de saldo (`openfinance_saldos`) e os links do titular (`openfinance_convites`). Só leitura; o estado de cada linha é a regra
 * pura `estadoNaLinha`. Falhou = `erro` (a coluna diz "—" com o motivo no title; nunca "Conectar" inventado).
 */
import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import type { EventoDaFila } from '@/lib/openfinance/openfinanceTela';
import type { ContaPermitida, ConviteDoCliente, SaldoLido } from '@/lib/openfinance/openfinanceNaLinha';

export interface OpenFinanceDasContas { eventos: EventoDaFila[]; permitidas: ContaPermitida[]; saldos: SaldoLido[]; convites: ConviteDoCliente[] }

const lista = <T,>(v: unknown): T[] => (Array.isArray(v) ? v : []);

export function useOpenFinanceDasContas(clienteId: string | null, ligado: boolean) {
  const [dados, setDados] = useState<OpenFinanceDasContas | null>(null);
  const [erro, setErro] = useState(false);
  const [vez, setVez] = useState(0);
  const recarregar = useCallback(() => setVez((n) => n + 1), []);

  useEffect(() => {
    if (!clienteId || !ligado) { setDados(null); return; }
    let vivo = true;
    void (async () => {
      const sb = supabase as any;
      const [ev, pe, sa, co] = await Promise.all([
        sb.from('openfinance_eventos').select('evento, item_id, cliente_id, client_user_id, connector_id, recebido_em')
          .or(`cliente_id.eq.${clienteId},client_user_id.eq.${clienteId}`).order('recebido_em'),
        sb.from('openfinance_contas_permitidas').select('item_id, conta_bancaria_id, final4, ativo').eq('cliente_id', clienteId).eq('ativo', true),
        sb.from('openfinance_saldos').select('conta_bancaria_id, lido_em').eq('cliente_id', clienteId),
        sb.from('openfinance_convites').select('expira_em, usado_em, revogado_em').eq('cliente_id', clienteId),
      ]);
      if (!vivo) return;
      if (ev.error || pe.error || sa.error || co.error) { setErro(true); setDados(null); return; }
      setErro(false);
      setDados({ eventos: lista<EventoDaFila>(ev.data), permitidas: lista<ContaPermitida>(pe.data), saldos: lista<SaldoLido>(sa.data), convites: lista<ConviteDoCliente>(co.data) });
    })();
    return () => { vivo = false; };
  }, [clienteId, ligado, vez]);

  return { dados, erro, recarregar };
}
