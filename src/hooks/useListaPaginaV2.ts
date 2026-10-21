/**
 * FIN-V2-DESEMPENHO-01b — a página da lista de Lançamentos Financeiros, do servidor (`fn_fin_v2_lista_pagina`).
 * UMA ida por página (filtros, ordem e página), com a guarda de corrida de sempre (a resposta velha não sobrescreve a nova) e a
 * releitura pelo canal de lançamentos (quem grava avisa; a página volta sem F5). Sem `habilitado` não consulta e esvazia.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { inscreverEmLancamentos } from '@/hooks/useFinanceiroV2';
import { lerPaginaV2, type PaginaDaListaV2 } from '@/lib/financeiro/listaPaginaV2';
import { normalizarErro } from '@/lib/erroOperacional';

export interface PedidoDaPaginaV2 {
  filtros: Record<string, unknown>;
  ordem: Record<string, string>;
  pagina: number;
  porPagina: number;
}

export const FRASE_LISTA_INDISPONIVEL = 'Não foi possível carregar os lançamentos agora. Tente de novo.';

export function useListaPaginaV2(clienteId: string | null | undefined, pedido: PedidoDaPaginaV2, habilitado: boolean) {
  const [pagina, setPagina] = useState<PaginaDaListaV2 | null>(null);
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  /* os NOMES dos fornecedores DESTA página (uma ida, por id): o cadastro inteiro do cliente vem em levas e chega segundos depois
     da página; sem isto a coluna Fornecedor ficaria esperando por ele */
  const [nomes, setNomes] = useState<ReadonlyMap<string, string>>(new Map());
  const token = useRef(0);
  /* a chave do pedido (o objeto muda a cada render; o texto não) */
  const chave = JSON.stringify(pedido);
  const chaveRef = useRef(chave);
  chaveRef.current = chave;

  const carregar = useCallback(async () => {
    const meu = ++token.current;
    const vivo = () => meu === token.current;
    if (!clienteId || !habilitado) { setPagina(null); setCarregando(false); setErro(null); return; }
    const p: PedidoDaPaginaV2 = JSON.parse(chaveRef.current);
    setCarregando(true); setErro(null);
    try {
      const { data, error } = await (supabase as any).rpc('fn_fin_v2_lista_pagina', {
        p_cliente: clienteId, p_filtros: p.filtros, p_ordem: p.ordem, p_pagina: p.pagina, p_por_pagina: p.porPagina,
      });
      if (!vivo()) return;
      if (error) throw error;
      const lida = lerPaginaV2(data);
      if (!lida) throw new Error('resposta da lista fora do formato');
      setPagina(lida);
      const ids = [...new Set(lida.linhas.map((l) => l.favorecido_id).filter((x): x is string => !!x))];
      if (ids.length > 0) {
        const { data: fs, error: ef } = await supabase.from('financeiro_fornecedores').select('id, nome').eq('cliente_id', clienteId).in('id', ids);
        if (!vivo()) return;
        if (!ef && fs) setNomes((antes) => { const m = new Map(antes); for (const f of fs) m.set(f.id, f.nome); return m; });
      }
    } catch (e) {
      if (!vivo()) return;
      console.error('fn_fin_v2_lista_pagina', normalizarErro(e, 'listaPaginaV2').diagnostico);
      setErro(FRASE_LISTA_INDISPONIVEL);
    } finally {
      if (vivo()) setCarregando(false);
    }
  }, [clienteId, habilitado]);

  useEffect(() => { carregar(); }, [carregar, chave]);
  /* quem grava lançamento avisa o canal; a página é relida (mesmo pedido) */
  useEffect(() => {
    if (!clienteId) return;
    return inscreverEmLancamentos(clienteId, () => { carregar(); });
  }, [clienteId, carregar]);
  /* saiu da tela: a resposta que chegar depois não escreve nada */
  useEffect(() => () => { token.current += 1; }, []);

  return { pagina, carregando, erro, nomes, recarregar: carregar };
}
