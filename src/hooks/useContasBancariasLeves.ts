// PR-OC-UI-FIN-FIX-02 item 6 — fonte LEVE e reutilizável de contas bancárias do cliente.
//   Espelho exato da query enxuta (cliente_id + ativa=true + order ordem_exibicao) já usada em
//   useFinanceiroV2, SEM arrastar o hook pesado. Shape mínimo p/ o select opcional de conta por parcela
//   no dialog Programar; o writer oc_programar_compromisso valida conta por tenant (parcelas[].conta_bancaria_id).
import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';

export interface ContaBancariaLeve {
  id: string;
  /** Fallback do rotulo quando `nome_exibicao` e' nulo — e' o que
   *  ContaBancariaSelect (padrao do sistema) usa: `nome_exibicao || nome_conta`. */
  nome_conta: string;
  nome_exibicao: string | null;
  banco: string | null;
  agencia: string | null;
  numero_conta: string | null;
  /** `cc` | `inv` | `cartao` — vocabulário medido no proto. Usado só para AGRUPAR a
   *  lista; a ordem dentro do grupo continua sendo `ordem_exibicao` (a do cadastro). */
  tipo_conta: string | null;
}

// Rótulo de exibição estável: nome_exibicao → "banco ag/conta" → id curto. Nunca vazio.
export function rotuloContaLeve(c: ContaBancariaLeve): string {
  if (c.nome_exibicao && c.nome_exibicao.trim()) return c.nome_exibicao.trim();
  const banco = (c.banco ?? '').trim();
  const agConta = [c.agencia, c.numero_conta].filter(Boolean).join('/');
  const composto = [banco, agConta].filter(Boolean).join(' ');
  return composto || c.id.slice(0, 8);
}

export function useContasBancariasLeves(clienteId: string | null) {
  const [contas, setContas] = useState<ContaBancariaLeve[]>([]);
  const [loading, setLoading] = useState(false);

  const carregar = useCallback(async () => {
    if (!clienteId) { setContas([]); return; }
    setLoading(true);
    const { data } = await supabase
      .from('financeiro_contas_bancarias')
      .select('id, nome_conta, nome_exibicao, banco, agencia, numero_conta, tipo_conta')
      .eq('cliente_id', clienteId)
      .eq('ativa', true)
      .order('ordem_exibicao');
    setContas((data ?? []).map(r => ({
      id: r.id,
      nome_conta: r.nome_conta,
      nome_exibicao: r.nome_exibicao,
      banco: r.banco,
      agencia: r.agencia,
      numero_conta: r.numero_conta,
      tipo_conta: r.tipo_conta,
    })));
    setLoading(false);
  }, [clienteId]);

  useEffect(() => { carregar(); }, [carregar]);

  return { contas, loading, recarregar: carregar };
}
