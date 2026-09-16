/**
 * O DRE DA PECUÁRIA — por fazenda, num período de meses.
 *
 * ⚠⚠ NENHUM CÁLCULO AQUI. `fn_dre_pecuaria` devolve cada linha já arredondada, por fazenda e no
 * total, e a tela RENDERIZA. A única divisão que fica com o consumidor é `valor / cab_fim`, e
 * ela é de apresentação.
 * ⚠ DUAS VARIAÇÕES, E ELAS NÃO SE SOMAM. `vpb_operacional` = o rebanho mudou, a preço CONGELADO
 * do fechamento anterior; `efeito_mercado` = o preço mudou, rebanho congelado. Fundi-las numa
 * "variação de patrimônio" esconderia qual das duas respondeu pelo resultado — que é a pergunta
 * que o produtor faz quando o número sobe sem ele ter vendido nada.
 * ⚠ `sem_p0` / `sem_p1` SÃO DADO: fazenda sem fechamento numa das pontas vem com as duas
 * variações NULAS, e a tela mostra "—". Zero ali afirmaria que o rebanho não mudou.
 */
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

/** As 18 linhas da cascata, na ordem em que a RPC as nomeia. */
export interface DrePecLinhas {
  vendas: number;
  outras_receitas: number;
  receita_bruta: number;
  deducoes: number;
  receita_liquida: number;
  /** `null` sem fechamento numa das pontas. */
  vpb_operacional: number | null;
  reposicao: number;
  vbp: number;
  custo_variavel: number;
  margem: number;
  custo_fixo: number;
  rateio_adm: number;
  resultado_operacional: number;
  juros: number;
  resultado_periodo: number;
  /** `null` sem fechamento numa das pontas. */
  efeito_mercado: number | null;
  resultado_com_mercado: number;
  investimento: number;
  a_pagar: number;
  patrimonio: {
    v_ini_p0: number; v_fim_p0: number; v_fim_p1: number;
    cab_ini: number; cab_fim: number;
  };
  sem_p0: boolean;
  sem_p1: boolean;
}

export type ChaveLinhaPec = keyof DrePecLinhas;

export interface DrePecFazenda {
  fazenda_id: string;
  nome: string;
  linhas: DrePecLinhas;
}

export interface DrePecuaria {
  periodo: { de: string; ate: string; p0: string; meses: number };
  rateio_adm: { pool: number; bruto: number; criterio: string };
  fazendas: DrePecFazenda[];
  total: DrePecLinhas;
}

/* ⚠ O POSTGREST DEVOLVE `numeric` COMO STRING. `num` normaliza; `numOuNulo` preserva o `null`,
   porque aqui ele é dado — a fazenda sem fechamento não tem variação, e isso não é zero. */
const num = (v: unknown): number => {
  const n = Number(v);
  return isFinite(n) ? n : 0;
};
const numOuNulo = (v: unknown): number | null => {
  if (v === null || v === undefined) return null;
  const n = Number(v);
  return isFinite(n) ? n : null;
};

function lerLinhas(x: unknown): DrePecLinhas {
  const o = (x ?? {}) as Record<string, unknown>;
  const p = (o.patrimonio ?? {}) as Record<string, unknown>;
  return {
    vendas: num(o.vendas),
    outras_receitas: num(o.outras_receitas),
    receita_bruta: num(o.receita_bruta),
    deducoes: num(o.deducoes),
    receita_liquida: num(o.receita_liquida),
    vpb_operacional: numOuNulo(o.vpb_operacional),
    reposicao: num(o.reposicao),
    vbp: num(o.vbp),
    custo_variavel: num(o.custo_variavel),
    margem: num(o.margem),
    custo_fixo: num(o.custo_fixo),
    rateio_adm: num(o.rateio_adm),
    resultado_operacional: num(o.resultado_operacional),
    juros: num(o.juros),
    resultado_periodo: num(o.resultado_periodo),
    efeito_mercado: numOuNulo(o.efeito_mercado),
    resultado_com_mercado: num(o.resultado_com_mercado),
    investimento: num(o.investimento),
    a_pagar: num(o.a_pagar),
    patrimonio: {
      v_ini_p0: num(p.v_ini_p0), v_fim_p0: num(p.v_fim_p0), v_fim_p1: num(p.v_fim_p1),
      cab_ini: num(p.cab_ini), cab_fim: num(p.cab_fim),
    },
    sem_p0: o.sem_p0 === true,
    sem_p1: o.sem_p1 === true,
  };
}

export function useDrePecuaria(
  clienteId: string | null | undefined, de: string | null, ate: string | null,
) {
  const queryClient = useQueryClient();
  const chave = ['dre-pecuaria', clienteId ?? '', de ?? '', ate ?? ''];
  const { data, isLoading, error } = useQuery({
    queryKey: chave,
    enabled: !!clienteId && !!de && !!ate,
    queryFn: async (): Promise<DrePecuaria | null> => {
      const { data: r, error: err } = await (supabase as any).rpc('fn_dre_pecuaria', {
        p_cliente: clienteId, p_de: de, p_ate: ate,
      });
      if (err) throw err;
      const o = (r ?? null) as Record<string, unknown> | null;
      if (!o) return null;
      const per = (o.periodo ?? {}) as Record<string, unknown>;
      const ra = (o.rateio_adm ?? {}) as Record<string, unknown>;
      return {
        periodo: {
          de: String(per.de ?? ''), ate: String(per.ate ?? ''),
          p0: String(per.p0 ?? ''), meses: num(per.meses),
        },
        rateio_adm: {
          pool: num(ra.pool), bruto: num(ra.bruto), criterio: String(ra.criterio ?? ''),
        },
        fazendas: (Array.isArray(o.fazendas) ? o.fazendas : []).map((f: Record<string, unknown>) => ({
          fazenda_id: String(f?.fazenda_id ?? ''),
          nome: String(f?.nome ?? '—'),
          linhas: lerLinhas(f?.linhas),
        })),
        total: lerLinhas(o.total),
      };
    },
  });

  const recarregar = () => queryClient.invalidateQueries({ queryKey: chave });
  return { dre: data ?? null, carregando: isLoading, erro: error as Error | null, recarregar };
}
