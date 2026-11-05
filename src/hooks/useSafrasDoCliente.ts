/**
 * UI-PERIODO-01 — as safras do cliente para os atalhos do componente de período: `financeiro_safras` (data_inicio, data_fim) das
 * atividades pedidas, ativas, com as duas datas. A data da safra vem do cadastro e nunca do código.
 */
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { AtividadeDaSafra, SafraDoCadastro } from '@/lib/periodo/intervaloDeDatas';

const texto = (v: unknown): string | null => (typeof v === 'string' && v.length > 0 ? v : null);

/** A linha lida vira safra do componente; sem as duas datas, ou fora das atividades, não entra. */
export function lerSafras(linhas: unknown): SafraDoCadastro[] {
  if (!Array.isArray(linhas)) return [];
  return linhas.flatMap((l): SafraDoCadastro[] => {
    if (typeof l !== 'object' || l === null) return [];
    const id = texto(Reflect.get(l, 'id'));
    const de = texto(Reflect.get(l, 'data_inicio'));
    const ate = texto(Reflect.get(l, 'data_fim'));
    const escopo = Reflect.get(l, 'escopo_negocio');
    if (!id || !de || !ate || (escopo !== 'pecuaria' && escopo !== 'agricultura')) return [];
    return [{ id, codigo: texto(Reflect.get(l, 'codigo')) ?? texto(Reflect.get(l, 'nome')) ?? '—', atividade: escopo, de: de.slice(0, 10), ate: ate.slice(0, 10) }];
  });
}

export function useSafrasDoCliente(clienteId: string | null | undefined, atividades: readonly AtividadeDaSafra[]) {
  const chave = [...atividades].sort().join(',');
  const { data, isLoading } = useQuery({
    queryKey: ['safras-do-cliente', clienteId ?? '', chave],
    enabled: !!clienteId && atividades.length > 0,
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const { data: linhas, error } = await supabase.from('financeiro_safras')
        .select('id, codigo, nome, escopo_negocio, data_inicio, data_fim')
        .eq('cliente_id', clienteId ?? '')
        .eq('ativa', true)
        .in('escopo_negocio', chave.split(','));
      if (error) throw new Error('Não consegui ler as safras do cliente.');
      return lerSafras(linhas);
    },
  });
  return { safras: data ?? [], carregando: isLoading };
}
