/**
 * O HISTÓRICO DE UMA CULTURA — uma linha por safra em que ela teve área plantada.
 *
 * ⚠ NENHUMA CONTA AQUI, e desta vez nem as divisões: `fn_dre_lavoura_historico` devolve `/ha` e
 * `/unidade` prontos, o equilíbrio por safra e o `delta_resultado_ha` contra a safra anterior —
 * que é justamente a conta que o front não poderia fazer sozinho sem reordenar as safras.
 * ⚠ ELA SUBSTITUI `fn_painel_safra_comparativo` NA LEITURA DE HISTÓRICO, e as duas respondem
 * coisas diferentes: a antiga compara receita/custeio por hectare, esta compara o RESULTADO e o
 * PONTO DE EQUILÍBRIO. A antiga continua viva porque a aba Produção lê dela a composição por
 * qualidade — ver `ProducaoSafraPanel`.
 * ⚠ `delta_resultado_ha` NASCE `null` NA PRIMEIRA SAFRA, por construção: não há anterior. É
 * ausência, e a tela mostra "—" — nunca zero, que afirmaria "não mudou".
 */
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface SafraHistorico {
  safra: string;
  data_inicio: string;
  area_ha: number;
  producao: number;
  produtividade: number;
  custo_ha: number;
  custo_unidade: number;
  preco_realizado: number | null;
  preco_equilibrio: number | null;
  produtividade_equilibrio: number | null;
  resultado_ha: number;
  /** `null` na primeira safra da série — não há anterior contra o que comparar. */
  delta_resultado_ha: number | null;
}

/* ⚠ O POSTGREST DEVOLVE `numeric` COMO STRING. `num` normaliza; `numOuNulo` preserva o `null`,
   porque aqui ele é dado — a safra sem colheita não tem preço realizado nem equilíbrio. */
const num = (v: unknown): number => {
  const n = Number(v);
  return isFinite(n) ? n : 0;
};
const numOuNulo = (v: unknown): number | null => {
  if (v === null || v === undefined) return null;
  const n = Number(v);
  return isFinite(n) ? n : null;
};

export function useDreLavouraHistorico(
  clienteId: string | null | undefined, cultura: string | null,
) {
  const { data, isLoading, error } = useQuery({
    queryKey: ['dre-lavoura-historico', clienteId ?? '', cultura ?? ''],
    enabled: !!clienteId && !!cultura,
    queryFn: async (): Promise<SafraHistorico[]> => {
      const { data: r, error: err } = await (supabase as any).rpc('fn_dre_lavoura_historico', {
        p_cliente_id: clienteId, p_cultura: cultura,
      });
      if (err) throw err;
      return (Array.isArray(r) ? r : []).map((x: Record<string, unknown>) => ({
        safra: String(x?.safra ?? '—'),
        data_inicio: String(x?.data_inicio ?? ''),
        area_ha: num(x?.area_ha),
        producao: num(x?.producao),
        produtividade: num(x?.produtividade),
        custo_ha: num(x?.custo_ha),
        custo_unidade: num(x?.custo_unidade),
        preco_realizado: numOuNulo(x?.preco_realizado),
        preco_equilibrio: numOuNulo(x?.preco_equilibrio),
        produtividade_equilibrio: numOuNulo(x?.produtividade_equilibrio),
        resultado_ha: num(x?.resultado_ha),
        delta_resultado_ha: numOuNulo(x?.delta_resultado_ha),
      }));
    },
  });
  return { safras: data ?? [], carregando: isLoading, erro: error };
}
