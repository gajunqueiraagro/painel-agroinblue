import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';

/**
 * P138 (Gabriel 27/10/2026) — a SAFRA DA COMPETÊNCIA é UMA regra, a do banco (`_fn_safra_da_competencia`: a safra ativa do escopo cujo
 * período contém a data; zero ou mais de uma -> nenhuma). A tela PERGUNTA ao banco, nunca deduz a temporada pelo código da safra.
 * O banco grava a mesma resposta em todo lançamento CRIADO sem safra (`trg_safra_da_competencia`); aqui ela só se MOSTRA.
 * Fora de pecuária/lavoura (administrativo, financeiro, silvicultura) ou sem cliente/data: nada a perguntar (null).
 * ⚠ SEM react-query e SEM o contexto do cliente: o cluster e a prévia da nota montam em telas e testes sem esses provedores; o cliente
 * vem por parâmetro e a resposta fica num mapa da sessão (a mesma pergunta não volta ao banco).
 */
const respostas = new Map<string, string | null>();

export function useSafraDaCompetencia(
  clienteId: string | null | undefined, escopo: string | null | undefined, dataISO: string | null | undefined, ligado = true,
): string | null {
  const data = dataISO && /^\d{4}-\d{2}-\d{2}/.test(dataISO) ? dataISO.slice(0, 10) : null;
  const pergunta = ligado && !!clienteId && !!data && (escopo === 'pecuaria' || escopo === 'agricultura');
  const chave = pergunta ? `${clienteId}|${escopo}|${data}` : '';
  const [resposta, setResposta] = useState<{ chave: string; id: string | null }>({ chave: '', id: null });
  useEffect(() => {
    if (!chave || !clienteId || !escopo || !data) return;
    if (respostas.has(chave)) { setResposta({ chave, id: respostas.get(chave) ?? null }); return; }
    let vivo = true;
    /* a pergunta que falha (rede, permissão) NUNCA derruba o formulário: fica "sem resposta" (nada se mostra) e o erro vai ao console */
    const perguntar = async () => {
      try {
        const { data: id, error } = await supabase.rpc('_fn_safra_da_competencia', { p_cliente_id: clienteId, p_escopo: escopo, p_data: data });
        if (error) throw error;
        respostas.set(chave, id ?? null);
        if (vivo) setResposta({ chave, id: id ?? null });
      } catch (e) { console.error('[P138] _fn_safra_da_competencia', e); }
    };
    void perguntar();
    return () => { vivo = false; };
  }, [chave, clienteId, escopo, data]);
  return chave && resposta.chave === chave ? resposta.id : null;
}
