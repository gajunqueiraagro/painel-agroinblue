/**
 * Hook: useZootMensal
 *
 * ⚠️ USO INTERNO — NÃO IMPORTAR DIRETAMENTE EM TELAS/COMPONENTES.
 * Consumir EXCLUSIVAMENTE via useRebanhoOficial.
 *
 * Este hook é a camada de acesso direto à view `vw_zoot_fazenda_mensal`.
 * Qualquer import direto em componente é uma VIOLAÇÃO arquitetural.
 *
 * Regra de produto: todo indicador mensal do rebanho deve vir de useRebanhoOficial.
 */

import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useFazenda } from '@/contexts/FazendaContext';

export interface ZootMensal {
  fazenda_id: string;
  cliente_id: string;
  ano: number;
  mes: number;
  cenario: 'realizado' | 'meta';
  mes_key: string;       // '01'..'12'
  ano_mes: string;        // '2025-03'
  cabecas_inicio: number;
  cabecas_final: number;
  peso_inicio_kg: number;
  peso_total_final_kg: number;
  peso_medio_final_kg: number | null;
  peso_entradas_kg: number;
  peso_saidas_kg: number;
  entradas: number;
  saidas: number;
  dias_mes: number;
  gmd_kg_cab_dia: number | null;
  gmd_numerador_kg: number | null;
  ua_media: number | null;
  area_produtiva_ha: number;
  lotacao_ua_ha: number | null;
  fonte_oficial_mes: 'fechamento' | 'fallback_movimentacao' | 'projecao';
}

interface UseZootMensalParams {
  ano: number;
  cenario: 'realizado' | 'meta';
}

export function useZootMensal({ ano, cenario }: UseZootMensalParams) {
  const { fazendaAtual } = useFazenda();
  const fazendaId = fazendaAtual?.id;

  return useQuery({
    queryKey: ['zoot-mensal', fazendaId, ano, cenario],
    queryFn: async (): Promise<ZootMensal[]> => {
      if (!fazendaId) return [];

      const { data, error } = await supabase
        .from('vw_zoot_fazenda_mensal' as any)
        .select('*')
        .eq('fazenda_id', fazendaId)
        .eq('ano', ano)
        .eq('cenario', cenario)
        .order('mes');

      if (error) {
        console.error('[useZootMensal] vw_zoot_fazenda_mensal indisponível', {
          message: error.message,
          code: (error as any).code,
          details: (error as any).details,
          hint: (error as any).hint,
          fazendaId, ano, cenario,
        });
        return [];
      }

      return (data as unknown as ZootMensal[]) || [];
    },
    enabled: !!fazendaId,
    staleTime: 30_000,
    // Mantém dados anteriores durante troca de fazenda/ano para evitar flash vazio
    // (react-query v5).
    placeholderData: (previousData) => previousData,
  });
}

/**
 * Helper: converte array de ZootMensal em Record<mes_key, ZootMensal>
 * para acesso direto por mês (ex: byMes['03']).
 */
export function indexByMes(rows: ZootMensal[]): Record<string, ZootMensal> {
  const map: Record<string, ZootMensal> = {};
  for (const r of rows) {
    map[r.mes_key] = r;
  }
  return map;
}
