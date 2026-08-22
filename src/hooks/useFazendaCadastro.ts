/**
 * Cadastro da fazenda — a MATRICULA e sua decomposicao declarada.
 *
 * FONTE: `fazenda_cadastros`, uma linha por (cliente_id, fazenda_id).
 *
 * POR QUE NAO O SNAPSHOT. Meta e planejamento sobre a terra que se TEM — a
 * matricula. `fechamento_area_snapshot` e o que os pastos disseram no mes
 * passado: leitura diferente, e nao serve de referencia para planejar.
 *
 * NAO EXISTE `area_silvicultura_ha` nesta tabela. A familia Silvicultura
 * nasceu em 19/08/2026 e o cadastro nao acompanhou — a referencia dessa
 * linha fica vazia por ausencia real, nao por erro de leitura.
 *
 * `fazendas.area_total` e coluna MORTA (0 de 19 preenchidas). A matricula
 * vem de `fazenda_cadastros.area_total_ha`.
 *
 * CASTS: a tabela ESTA em src/integrations/supabase/types.ts, mas o Row
 * gerado esta DEFASADO — declara `area_total` e `area_produtiva`, nao as
 * colunas `area_*_ha` que existem no banco. Ler sem cast produz TS2551
 * (e' a origem dos 2 erros de baseline em V2Fazendas.tsx). Os dois casts
 * sao o idioma do repo para esse caso; a correcao de raiz e regenerar
 * types.ts, frente propria registrada.
 */
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface FazendaCadastroAreas {
  area_total_ha: number | null;
  area_pecuaria_ha: number | null;
  area_agricultura_ha: number | null;
  area_reserva_ha: number | null;
  area_app_ha: number | null;
  area_benfeitorias_ha: number | null;
  area_outras_ha: number | null;
}

const COLS = [
  'area_total_ha',
  'area_pecuaria_ha',
  'area_agricultura_ha',
  'area_reserva_ha',
  'area_app_ha',
  'area_benfeitorias_ha',
  'area_outras_ha',
] as const;

/** Matricula de UMA fazenda, para o painel do Global. */
export interface MatriculaPorFazenda {
  fazenda_id: string;
  area_total_ha: number | null;
}

/**
 * Variante de CLIENTE: todas as matriculas de uma vez, para o painel do modo
 * Global. Mesmos casts e mesma regra de nulidade da leitura individual —
 * fazenda sem linha ou sem `area_total_ha` devolve null, nunca 0. Somar zero
 * afirmaria "matricula zero"; null diz "nao cadastrada", que e o fato.
 */
export function useMatriculasDoCliente(clienteId: string | undefined, enabled = true) {
  return useQuery({
    queryKey: ['matriculas-do-cliente', clienteId],
    queryFn: async (): Promise<MatriculaPorFazenda[]> => {
      const { data, error } = await (supabase
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .from('fazenda_cadastros' as any)
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .select('fazenda_id, area_total_ha') as any)
        .eq('cliente_id', clienteId!);
      if (error) throw error;
      return ((data ?? []) as Record<string, unknown>[])
        .filter(r => !!r.fazenda_id)
        .map(r => ({
          fazenda_id: String(r.fazenda_id),
          area_total_ha: r.area_total_ha == null ? null : Number(r.area_total_ha),
        }));
    },
    enabled: enabled && !!clienteId,
    staleTime: 5 * 60 * 1000,
    refetchOnWindowFocus: false,
  });
}

export function useFazendaCadastro(
  clienteId: string | undefined,
  fazendaId: string | undefined,
  enabled = true,
) {
  return useQuery({
    queryKey: ['fazenda-cadastro-areas', clienteId, fazendaId],
    queryFn: async (): Promise<FazendaCadastroAreas | null> => {
      const { data, error } = await (supabase
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .from('fazenda_cadastros' as any)
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .select(COLS.join(', ')) as any)
        .eq('cliente_id', clienteId!)
        .eq('fazenda_id', fazendaId!)
        .maybeSingle();
      if (error) throw error;
      if (!data) return null;

      /* NULL permanece NULL: cadastro sem a familia preenchida e ausencia de
         declaracao, nao zero declarado — mesma regra da Meta. */
      const num = (v: unknown) => (v == null ? null : Number(v));
      const row = data as Record<string, unknown>;
      return {
        area_total_ha: num(row.area_total_ha),
        area_pecuaria_ha: num(row.area_pecuaria_ha),
        area_agricultura_ha: num(row.area_agricultura_ha),
        area_reserva_ha: num(row.area_reserva_ha),
        area_app_ha: num(row.area_app_ha),
        area_benfeitorias_ha: num(row.area_benfeitorias_ha),
        area_outras_ha: num(row.area_outras_ha),
      };
    },
    enabled: enabled && !!clienteId && !!fazendaId,
    staleTime: 5 * 60 * 1000,
    refetchOnWindowFocus: false,
  });
}
