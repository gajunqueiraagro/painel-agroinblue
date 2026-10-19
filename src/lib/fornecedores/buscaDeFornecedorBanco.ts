import { supabase } from '@/integrations/supabase/client';

/**
 * FORN-BUSCA-UNICA-01 — quem busca fornecedor no SERVIDOR (Cadastros › Fornecedores, a Mesa) chama a RPC `fn_fornecedor_buscar`, o espelho no banco da busca única da tela
 * (`buscaDeFornecedor.ts`: razão social, fantasia, CNPJ/CPF com ou sem máscara, apelidos; ordem ativo → começa com o termo → uso →
 * nome). Substitui o `.or` do PostgREST (`filtroDaBusca`), que não lia apelidos e ordenava só por nome.
 */
export type SituacaoDaLista = 'ativos' | 'inativos' | 'todos';
export interface PaginaDaBusca<F> { total: number; itens: F[] }
export async function buscarFornecedoresNoBanco<F>(clienteId: string, busca: string, situacao: SituacaoDaLista,
  limite: number | null, deslocamento = 0): Promise<PaginaDaBusca<F>> {
  const { data, error } = await (supabase as any).rpc('fn_fornecedor_buscar', {
    p_cliente: clienteId, p_busca: busca, p_situacao: situacao, p_limite: limite, p_offset: deslocamento,
  });
  if (error) throw new Error(error.message);
  const total: number = typeof data?.total === 'number' ? data.total : 0;
  const itens: F[] = Array.isArray(data?.itens) ? data.itens : [];
  return { total, itens };
}
