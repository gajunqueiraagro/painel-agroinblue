/**
 * Os nomes de quem aparece numa trilha (ou de todos os membros, com `ids` nulo) — ACESSOS-PERFIL-01. UMA leitura por cliente
 * e conjunto de ids, pela fonte unica `fn_nomes_dos_autores`.
 */
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { lerNomesDosAutores, mapaDosNomes, type NomeDoAutor } from '@/lib/acessos/nomesDosAutores';

export const CHAVE_NOMES_DOS_AUTORES = 'nomes-dos-autores';

export async function buscarNomesDosAutores(clienteId: string, ids: readonly string[] | null): Promise<NomeDoAutor[]> {
  const { data, error } = await (supabase as any).rpc('fn_nomes_dos_autores', { p_cliente_id: clienteId, p_ids: ids });
  if (error) throw error;
  const lidos = lerNomesDosAutores(data);
  if (lidos == null) throw new Error('resposta inesperada da leitura de nomes');
  return lidos;
}

export function useNomesDosAutores(clienteId: string | null, ids: readonly (string | null | undefined)[]) {
  const unicos = [...new Set(ids.filter((x): x is string => typeof x === 'string' && x !== ''))].sort();
  const consulta = useQuery({
    queryKey: [CHAVE_NOMES_DOS_AUTORES, clienteId, unicos.join(',')],
    queryFn: () => buscarNomesDosAutores(clienteId as string, unicos),
    enabled: !!clienteId && unicos.length > 0,
    staleTime: 60_000,
  });
  return { nomes: mapaDosNomes(consulta.data ?? []), lendo: consulta.isLoading, erro: consulta.error != null };
}
