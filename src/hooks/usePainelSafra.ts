/**
 * O PAINEL DA SAFRA — o raio-x do ciclo (PR-PAINEL-SAFRA-A).
 *
 * ⚠ UMA CHAMADA, ZERO CONTA NO FRONT. `fn_painel_safra` já devolve tudo somado, e ela própria lê
 * `fn_dre_agricola_por_safra` como fonte única — a mesma que alimenta o "DRE por cultura". Somar
 * qualquer coisa aqui criaria uma segunda verdade sobre o mesmo ciclo, e o operador não teria
 * como saber qual das duas telas está certa.
 * ⚠ O QUE O FRONT DERIVA SÃO SÓ RAZÕES — R$/ha e R$/saca —, e mesmo essas partem dos números da
 * RPC. Elas não são dado novo: são o mesmo dado dividido pela área e pela produção que vieram
 * junto, e por isso não podem divergir da fonte.
 */
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

/** Uma linha do desdobramento por centro de custo. */
export interface NaturezaCusto {
  centro: string;
  /** Quantos lançamentos formam a linha — o drill da fatia B vai precisar. */
  n: number;
  valor: number;
}

export interface PainelSafra {
  area_ha: number;
  /** Sacas boas + grão de roça — é o que a RPC soma. */
  total_sacas: number;
  sacas_ha: number;
  faturamento: number;
  deducoes: number;
  custo_variavel: number;
  custo_fixo: number;
  juros: number;
  rateio_compartilhado: number;
  /** Rateado por janela de datas e peso da cultura — ESTIMADO, e a tela diz isso. */
  rateio_admin: number;
  /** `resultado_caixa` do DRE — não recalculado aqui. */
  saldo: number;
  /** Fora do resultado, por decisão de modelo. Detalhe é a fatia B. */
  investimento: number;
  natureza: NaturezaCusto[];
  /** Saídas da safra que NÃO compõem DRE — existem e o operador precisa saber. */
  fora_do_custeio: number;
}

const num = (v: unknown): number => {
  const n = Number(v);
  return isFinite(n) ? n : 0;
};

export function usePainelSafra(
  clienteId: string | null | undefined,
  safraId: string | null,
  cultura: string | null,
) {
  const { data, isLoading, error } = useQuery({
    queryKey: ['painel-safra', clienteId ?? '', safraId ?? '', cultura ?? ''],
    enabled: !!clienteId && !!safraId && !!cultura,
    queryFn: async (): Promise<PainelSafra> => {
      const { data: r, error: err } = await (supabase as any).rpc('fn_painel_safra', {
        p_cliente: clienteId,
        p_safra_id: safraId,
        p_cultura: cultura,
      });
      if (err) throw err;
      const j = (r ?? {}) as Record<string, unknown>;
      /**
       * ⚠ TUDO PASSA POR `Number`, e não é paranoia: `numeric` do Postgres chega como STRING no
       * JSON do PostgREST — "873663.36", não 873663.36. Sem a conversão, `a + b` concatenaria os
       * dois textos e o total do painel seria um número absurdo que ninguém entenderia de onde
       * veio. É o mesmo cuidado que os hooks do barter tomam nos valores.
       */
      return {
        area_ha: num(j.area_ha),
        total_sacas: num(j.total_sacas),
        sacas_ha: num(j.sacas_ha),
        faturamento: num(j.faturamento),
        deducoes: num(j.deducoes),
        custo_variavel: num(j.custo_variavel),
        custo_fixo: num(j.custo_fixo),
        juros: num(j.juros),
        rateio_compartilhado: num(j.rateio_compartilhado),
        rateio_admin: num(j.rateio_admin),
        saldo: num(j.saldo),
        investimento: num(j.investimento),
        natureza: (Array.isArray(j.natureza) ? j.natureza : []).map((x: Record<string, unknown>) => ({
          centro: String(x?.centro ?? '—'),
          n: num(x?.n),
          valor: num(x?.valor),
        })),
        fora_do_custeio: num(j.fora_do_custeio),
      };
    },
  });

  return { painel: data ?? null, carregando: isLoading, erro: error as Error | null };
}

/**
 * O custeio total do ciclo.
 *
 * ⚠ NÃO É A SOMA DAS NATUREZAS, e é o ponto que mais confunde nesta tela. O array `natureza`
 * traz só o custeio DIRETO — o que está lançado com `safra_id` e tem centro de custo. O rateio
 * administrativo vem do DRE, por janela de datas e peso da cultura, e não tem centro nenhum.
 * Medido na 23/24: 561.069,03 de naturezas + 104.675,83 de rateio = 665.744,86.
 * ⚠ POR ISSO A TELA MOSTRA O RATEIO COMO LINHA PRÓPRIA, marcada "estimado": embutido nas
 * naturezas ele viraria um centro de custo que não existe; fora da conta, o custeio não fecharia
 * com o DRE.
 */
export function custeioTotal(p: PainelSafra): number {
  return p.custo_variavel + p.custo_fixo + p.juros
    + p.rateio_compartilhado + p.rateio_admin;
}

/** Por hectare — zero quando não há área, nunca `Infinity`. */
export function porHa(valor: number, areaHa: number): number {
  return areaHa > 0 ? valor / areaHa : 0;
}

/** Por saca — zero sem produção. É o que impede "R$ Infinity/sc" numa safra sem colheita. */
export function porSaca(valor: number, sacas: number): number {
  return sacas > 0 ? valor / sacas : 0;
}
