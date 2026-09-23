/**
 * O DRE DA LAVOURA — uma chamada, tudo pronto.
 *
 * ⚠⚠ O FRONT NÃO SOMA, NÃO SUBTRAI, NÃO RATEIA. `fn_dre_lavoura` devolve cada linha do DRE já
 * arredondada, por cultura e no total, mais os centros de cada bloco e os pools de rateio. Este
 * hook converte tipos e mais nada — a única aritmética que a tela faz é dividir por área e por
 * produção para as colunas /ha e /unidade, que o contrato deixa explicitamente ao consumidor.
 * ⚠ NÚMERO CHEGA COMO STRING: `numeric` do Postgres vira texto no JSON do PostgREST. Sem `Number`
 * somar dois valores concatenaria os textos — o mesmo cuidado de `useEstoqueGraos`.
 * ⚠ E `null` ATRAVESSA INTACTO em `valor`: o contrato diz que ausência é traço, e `depreciacao`
 * chega nula de propósito (a linha existe, reservada, e o número ainda não). Transformá-la em
 * zero afirmaria "não há depreciação", que é outra coisa.
 */
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

const num = (v: unknown): number => (v == null ? 0 : Number(v) || 0);
/** Preserva a ausência: `null` continua `null`, e a tela o traduz em "—". */
const numOuNulo = (v: unknown): number | null => (v == null ? null : (Number(v) || 0));

/** Uma linha do DRE. `direto`/`rateado` só existem nas que se repartem. */
export interface DreValor {
  valor: number | null;
  direto?: number;
  rateado?: number;
  pct_receita?: number;
  por_ha?: number;
}

/** As 16 linhas, na ordem do DRE (padrão Conab). A ordem da tela mora na tela. */
export interface DreLinhas {
  receita_bruta: DreValor;
  deducoes: DreValor;
  receita_liquida: DreValor;
  custeio: DreValor;
  pos_colheita: DreValor;
  rateio_compartilhado: DreValor;
  custo_variavel: DreValor;
  margem_contribuicao: DreValor;
  custo_fixo: DreValor;
  rateio_admin: DreValor;
  resultado_operacional: DreValor;
  juros: DreValor;
  resultado_caixa: DreValor;
  investimento: DreValor;
  /**
   * O QUE SOBRA DEPOIS DE INVESTIR — DRE-CASCATA-02, e ele vem com `por_ha` pronto da RPC, como o
   * `resultado_caixa`: a divisão é pela área da cultura (ou a da safra, no total), e refazê-la no
   * front criaria a segunda dona do mesmo número.
   */
  lucro_liquido: DreValor;
  depreciacao: DreValor;
}

export type ChaveLinha = keyof DreLinhas;

export interface DreCultura {
  cultura: string;
  area_ha: number;
  peso_area: number;
  producao: number;
  produtividade: number;
  linhas: DreLinhas;
  a_pagar: { operacional: number; investimento: number };
  custo_operacional: number;
  pct_direto: number;
  /**
   * ⚠ OS TRÊS SÃO `number | null`, E O `null` É DADO: a RPC o devolve para a cultura que ainda
   * não colheu — a mandioca da 25/26 vem com os três nulos, porque sem produção não há preço
   * realizado nem ponto de equilíbrio. Lê-los com o `num` comum transformava `null` em `0` e a
   * faixa afirmava "0,00 R$/t", que é um preço, não uma ausência. Foi o defeito B4 da
   * homologação de 16/09, e ele nasceu aqui, no parser — não na tela.
   */
  equilibrio: {
    preco_realizado: number | null;
    preco_equilibrio: number | null;
    produtividade_equilibrio: number | null;
  };
}

/** Um centro dentro de um bloco — a filha de um grupo expansível. */
export interface DreCentro {
  bloco: 'custeio' | 'pos_colheita' | 'fixo' | 'investimento';
  centro: string;
  por_cultura: Record<string, { valor: number; direto: number; rateado: number; a_pagar: number }>;
  /**
   * ⚠ `valor` CHEGOU EM `20261027120300`, e com ele a última soma do front saiu. Até essa
   * migration o total do centro trazia só `direto` e `rateado`, e a coluna Total de uma filha no
   * modo "dentro dos centros" tinha de somá-los na tela — a única exceção à regra de que o front
   * não soma. O número é o mesmo (Insumos: 1.169.045,58 + 65.110,27 = 1.234.155,85); o que mudou
   * é quem responde por ele.
   */
  total: { valor: number; direto: number; rateado: number; a_pagar: number };
}

export interface DreLavoura {
  versao: string;
  safra: { id: string; codigo: string; data_inicio: string; data_fim: string };
  culturas: DreCultura[];
  total: {
    area_ha: number;
    linhas: DreLinhas;
    custo_operacional: number;
    a_pagar: { operacional: number; investimento: number };
    pct_direto: number;
  };
  centros: DreCentro[];
  rateio_admin: { admin_total: number; parcela_agricultura: number; declarado: boolean };
  pool_compartilhado: Record<string, number>;
  nao_apropriado: { por_bloco: Record<string, number>; total: number };
  gerado_em: string;
}

const lerValor = (x: unknown): DreValor => {
  const o = (x ?? {}) as Record<string, unknown>;
  return {
    valor: numOuNulo(o.valor),
    ...(o.direto != null ? { direto: num(o.direto) } : {}),
    ...(o.rateado != null ? { rateado: num(o.rateado) } : {}),
    ...(o.pct_receita != null ? { pct_receita: num(o.pct_receita) } : {}),
    ...(o.por_ha != null ? { por_ha: num(o.por_ha) } : {}),
  };
};

const CHAVES: ChaveLinha[] = [
  'receita_bruta', 'deducoes', 'receita_liquida', 'custeio', 'pos_colheita',
  'rateio_compartilhado', 'custo_variavel', 'margem_contribuicao', 'custo_fixo',
  'rateio_admin', 'resultado_operacional', 'juros', 'resultado_caixa',
  'investimento', 'lucro_liquido', 'depreciacao',
];

const lerLinhas = (x: unknown): DreLinhas => {
  const o = (x ?? {}) as Record<string, unknown>;
  const out = {} as DreLinhas;
  for (const k of CHAVES) out[k] = lerValor(o[k]);
  return out;
};

export function useDreLavoura(clienteId: string | null | undefined, safraId: string | null) {
  const queryClient = useQueryClient();
  const chave = ['dre-lavoura', clienteId ?? '', safraId ?? ''];
  const { data, isLoading, error } = useQuery({
    queryKey: chave,
    enabled: !!clienteId && !!safraId,
    queryFn: async (): Promise<DreLavoura | null> => {
      const { data: r, error: err } = await (supabase as any).rpc('fn_dre_lavoura', {
        p_cliente_id: clienteId, p_safra_id: safraId,
      });
      if (err) throw err;
      const o = (r ?? null) as Record<string, unknown> | null;
      if (!o) return null;
      const safra = (o.safra ?? {}) as Record<string, unknown>;
      const total = (o.total ?? {}) as Record<string, unknown>;
      const ra = (o.rateio_admin ?? {}) as Record<string, unknown>;
      const na = (o.nao_apropriado ?? {}) as Record<string, unknown>;
      return {
        versao: String(o.versao ?? ''),
        safra: {
          id: String(safra.id ?? ''), codigo: String(safra.codigo ?? ''),
          data_inicio: String(safra.data_inicio ?? ''), data_fim: String(safra.data_fim ?? ''),
        },
        culturas: (Array.isArray(o.culturas) ? o.culturas : []).map((c: Record<string, unknown>) => {
          const ap = (c.a_pagar ?? {}) as Record<string, unknown>;
          const eq = (c.equilibrio ?? {}) as Record<string, unknown>;
          return {
            cultura: String(c.cultura ?? '—'),
            area_ha: num(c.area_ha), peso_area: num(c.peso_area),
            producao: num(c.producao), produtividade: num(c.produtividade),
            linhas: lerLinhas(c.linhas),
            a_pagar: { operacional: num(ap.operacional), investimento: num(ap.investimento) },
            custo_operacional: num(c.custo_operacional), pct_direto: num(c.pct_direto),
            equilibrio: {
              preco_realizado: numOuNulo(eq.preco_realizado),
              preco_equilibrio: numOuNulo(eq.preco_equilibrio),
              produtividade_equilibrio: numOuNulo(eq.produtividade_equilibrio),
            },
          };
        }),
        total: {
          area_ha: num(total.area_ha), linhas: lerLinhas(total.linhas),
          custo_operacional: num(total.custo_operacional),
          a_pagar: {
            operacional: num((total.a_pagar as Record<string, unknown>)?.operacional),
            investimento: num((total.a_pagar as Record<string, unknown>)?.investimento),
          },
          pct_direto: num(total.pct_direto),
        },
        centros: (Array.isArray(o.centros) ? o.centros : []).map((c: Record<string, unknown>) => {
          const pc = (c.por_cultura ?? {}) as Record<string, Record<string, unknown>>;
          const t = (c.total ?? {}) as Record<string, unknown>;
          return {
            bloco: String(c.bloco ?? 'custeio') as DreCentro['bloco'],
            centro: String(c.centro ?? '—'),
            por_cultura: Object.fromEntries(Object.entries(pc).map(([k, v]) => [k, {
              valor: num(v?.valor), direto: num(v?.direto),
              rateado: num(v?.rateado), a_pagar: num(v?.a_pagar),
            }])),
            total: { valor: num(t.valor), direto: num(t.direto), rateado: num(t.rateado), a_pagar: num(t.a_pagar) },
          };
        }),
        rateio_admin: {
          admin_total: num(ra.admin_total), parcela_agricultura: num(ra.parcela_agricultura),
          declarado: ra.declarado === true,
        },
        pool_compartilhado: Object.fromEntries(
          Object.entries((o.pool_compartilhado ?? {}) as Record<string, unknown>)
            .map(([k, v]) => [k, num(v)])),
        nao_apropriado: {
          por_bloco: Object.fromEntries(
            Object.entries((na.por_bloco ?? {}) as Record<string, unknown>).map(([k, v]) => [k, num(v)])),
          total: num(na.total),
        },
        gerado_em: String(o.gerado_em ?? ''),
      };
    },
  });
  /* ⚠ A CHAVE NUMA CONSTANTE, e não repetida no `invalidateQueries`: duas listas iguais escritas
     em lugares diferentes é como nasce um recarregar que não recarrega nada. */
  const recarregar = () => queryClient.invalidateQueries({ queryKey: chave });

  return { dre: data ?? null, carregando: isLoading, erro: error as Error | null, recarregar };
}
