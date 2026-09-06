/**
 * O preço de estoque de uma categoria — [OC-PADRAO-01] 114c, o P0 do Consumo valorado.
 *
 * ⚠ A FONTE É `valor_rebanho_mensal`, decidida no 114c-3: `cliente_id + fazenda_id +
 * ano_mes + categoria` → `preco_kg`. É a MESMA tabela que `useValorRebanho` usa para
 * valorar o rebanho no fechamento; usar outra faria o consumo sair do estoque por um
 * preço e o estoque ser avaliado por outro, e a diferença apareceria como resultado que
 * ninguém lançou.
 * ⚠ NÃO É `meta_valor_rebanho_precos`. Aquela é o mundo META; o consumo é realizado.
 *
 * ⚠ SEM LINHA, CAMPO VAZIO — NUNCA ZERO. Zero é um preço, e um consumo a zero entra na
 * DRE dizendo que o animal não valia nada. Ausência de preço é ausência: o campo abre
 * vazio, a tela diz qual categoria e qual mês faltam, e quem informa é o operador.
 */
import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';

export interface PrecoEstoque {
  /** R$/kg vivo da categoria naquele mês e fazenda. `null` = não há linha. */
  precoKg: number | null;
  carregando: boolean;
}

export function usePrecoEstoqueCategoria(
  clienteId: string | null | undefined,
  fazendaId: string | null | undefined,
  anoMes: string | null | undefined,
  categoria: string | null | undefined,
): PrecoEstoque {
  const [precoKg, setPrecoKg] = useState<number | null>(null);
  const [carregando, setCarregando] = useState(false);

  const buscar = useCallback(async () => {
    if (!clienteId || !fazendaId || !anoMes || !categoria) { setPrecoKg(null); return; }
    setCarregando(true);
    try {
      const { data, error } = await supabase
        .from('valor_rebanho_mensal')
        .select('preco_kg')
        .eq('cliente_id', clienteId)
        .eq('fazenda_id', fazendaId)
        .eq('ano_mes', anoMes)
        .eq('categoria', categoria)
        .maybeSingle();
      if (error) throw error;
      const p = data?.preco_kg == null ? null : Number(data.preco_kg);
      /* ⚠ ZERO GRAVADO TAMBÉM É AUSÊNCIA AQUI. Uma linha com `preco_kg = 0` não é "o
         animal vale nada": é planilha não preenchida. O campo abre vazio nos dois casos,
         e o operador informa. */
      setPrecoKg(p != null && Number.isFinite(p) && p > 0 ? p : null);
    } catch (e) {
      console.error('[usePrecoEstoqueCategoria] falha ao buscar o preço de estoque', e);
      setPrecoKg(null);
    } finally {
      setCarregando(false);
    }
  }, [clienteId, fazendaId, anoMes, categoria]);

  useEffect(() => { void buscar(); }, [buscar]);

  return { precoKg, carregando };
}
