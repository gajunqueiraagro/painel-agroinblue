/**
 * BPO-APROVACAO-01 P1 — o BPO está LIGADO neste cliente? (o menu mostra "Aprovar pagamentos" só onde está). Uma leitura por cliente;
 * falhar a leitura = desligado (o item some; o admin vê sempre). A tabela é da 118160 (fora do types.ts: o `(supabase as any)` permitido).
 */
import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';

export function useBpoAtivo(clienteId: string | null | undefined): boolean {
  const [ativo, setAtivo] = useState(false);
  useEffect(() => {
    setAtivo(false);
    if (!clienteId) return;
    let vivo = true;
    void (async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- idioma documentado: a tabela da 118160 não está no types.ts
      const { data, error } = await (supabase as any).from('financeiro_bpo_config').select('ativo').eq('cliente_id', clienteId).limit(1);
      if (vivo) setAtivo(!error && Array.isArray(data) && data[0]?.ativo === true);
    })();
    return () => { vivo = false; };
  }, [clienteId]);
  return ativo;
}
