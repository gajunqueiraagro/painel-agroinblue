/**
 * Indicadores produtivos por FAZENDA no mês — cabecas, GMD, UA media e
 * producao biologica.
 *
 * FONTES:
 *   vw_zoot_fazenda_mensal  -> cabecas_final, gmd_kg_cab_dia, ua_media
 *   zoot_mensal_cache       -> producao_biologica (somar por fazenda)
 *
 * NAO LER area_produtiva_ha NEM lotacao_ua_ha da view: ela usa area propria,
 * divergente do snapshot oficial (Pureza jul/2026: view 4.726 ha contra
 * snapshot 3.595 ha produtiva). A lotacao da view (0,73) nao reconcilia com
 * o UA/ha do Global (0,86). Area vem de areaPorFazendaMes e a lotacao e
 * recalculada na tela.
 *
 * Somas conferidas contra o agregado em 21/08/2026 — cabecas, @ e lotacao
 * batem com os indicadores do Global.
 *
 * CASTS: `vw_zoot_fazenda_mensal` ESTA em src/integrations/supabase/types.ts,
 * mas o repo ja a le com `as any` no nome (useZootMensal, ResumoTab) porque o
 * client nao resolve view sem relationship; `zoot_mensal_cache` NAO esta nos
 * types. Os dois casts sao o idioma estabelecido para esse caso.
 */
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface ProdutivoPorFazenda {
  fazenda_id: string;
  cabecas: number;
  gmd: number | null;
  ua_media: number;
  arrobas: number;
}

/* @ do mes = producao biologica / 30 — mesma regra do PC-100. */
const KG_POR_ARROBA = 30;

export function useProdutivoPorFazenda(
  clienteId: string | undefined,
  anoMes: string,
  enabled = true,
) {
  return useQuery({
    queryKey: ['produtivo-por-fazenda', clienteId, anoMes],
    queryFn: async (): Promise<ProdutivoPorFazenda[]> => {
      const [anoStr, mesStr] = anoMes.split('-');
      const ano = Number(anoStr);
      const mes = Number(mesStr);

      const [vwRes, cacheRes] = await Promise.all([
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (supabase.from('vw_zoot_fazenda_mensal' as any)
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          .select('fazenda_id, cabecas_final, gmd_kg_cab_dia, ua_media') as any)
          .eq('cliente_id', clienteId!)
          .eq('ano', ano)
          .eq('mes', mes)
          .eq('cenario', 'realizado'),
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (supabase.from('zoot_mensal_cache' as any)
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          .select('fazenda_id, producao_biologica') as any)
          .eq('cliente_id', clienteId!)
          .eq('ano', ano)
          .eq('mes', mes)
          .eq('cenario', 'realizado'),
      ]);
      if (vwRes.error) throw vwRes.error;
      if (cacheRes.error) throw cacheRes.error;

      /* producao_biologica vem por CATEGORIA: somar por fazenda antes de dividir. */
      type LinhaCache = { fazenda_id: string | null; producao_biologica: number | null };
      const bioPorFazenda = new Map<string, number>();
      for (const row of (cacheRes.data ?? []) as LinhaCache[]) {
        if (!row.fazenda_id) continue;
        bioPorFazenda.set(
          row.fazenda_id,
          (bioPorFazenda.get(row.fazenda_id) ?? 0) + (Number(row.producao_biologica) || 0),
        );
      }

      type LinhaVw = {
        fazenda_id: string | null;
        cabecas_final: number | null;
        gmd_kg_cab_dia: number | null;
        ua_media: number | null;
      };
      const out: ProdutivoPorFazenda[] = [];
      for (const row of (vwRes.data ?? []) as LinhaVw[]) {
        if (!row.fazenda_id) continue;
        out.push({
          fazenda_id: row.fazenda_id,
          cabecas: Number(row.cabecas_final) || 0,
          /* GMD null e AUSENCIA, nao zero: fazenda sem fechamento nao ganhou 0 kg/dia. */
          gmd: row.gmd_kg_cab_dia == null ? null : Number(row.gmd_kg_cab_dia),
          ua_media: Number(row.ua_media) || 0,
          arrobas: (bioPorFazenda.get(row.fazenda_id) ?? 0) / KG_POR_ARROBA,
        });
      }
      return out;
    },
    enabled: enabled && !!clienteId && !!anoMes,
    staleTime: 5 * 60 * 1000,
    refetchOnWindowFocus: false,
  });
}
