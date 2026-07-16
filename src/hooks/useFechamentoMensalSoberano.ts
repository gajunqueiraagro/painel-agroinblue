/**
 * D.0B-i — Hook soberano de leitura mensal do fechamento.
 *
 * Consome APENAS os quatro contratos D.0A (em paralelo, Promise.all):
 *   fn_cards_componentes_mes, fn_composicao_componentes_categoria_mes,
 *   fn_pendencias_fechamento_mes (envelope M8), fn_locais_sugeridos_mes.
 * fn_natureza_patrimonial_fazenda e fn_uso_operacional_mes NÃO são chamados — os quatro
 *   envelopes já trazem natureza_patrimonial / uso_operacional / eh_ajuste.
 *
 * Não migra nenhuma tela nesta fase. Ver invariante da união em @/lib/fechamentoMensalSoberano.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import {
  buildCardsExistentes,
  buildLinhasDaTela,
  buildSugeridosSemCard,
  type CardMensalSoberano,
  type ComponenteMensal,
  type ComposicaoCategoriaMensal,
  type LinhaFechamentoMensal,
  type LocalSugeridoMensal,
  type PendenciaMensal,
} from '@/lib/fechamentoMensalSoberano';

interface RawState {
  componentes: ComponenteMensal[];
  composicaoPorCategoria: ComposicaoCategoriaMensal[];
  pendencias: PendenciaMensal[];
  locaisSugeridos: LocalSugeridoMensal[];
}

const EMPTY: RawState = { componentes: [], composicaoPorCategoria: [], pendencias: [], locaisSugeridos: [] };

export interface UseFechamentoMensalSoberanoResult extends RawState {
  cardsExistentes: CardMensalSoberano[];
  sugeridosSemCard: LocalSugeridoMensal[];
  linhasDaTela: LinhaFechamentoMensal[];
  loading: boolean;
  error: Error | null;
  reload: () => Promise<void>;
}

export function useFechamentoMensalSoberano(
  fazendaId: string | null | undefined,
  anoMes: string | null | undefined,
): UseFechamentoMensalSoberanoResult {
  const [raw, setRaw] = useState<RawState>(EMPTY);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  // Proteção contra resposta obsoleta (fazenda/mês mudam durante o carregamento) e unmount.
  const reqIdRef = useRef(0);
  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  const load = useCallback(async (): Promise<void> => {
    if (!fazendaId || !anoMes) {
      reqIdRef.current++;              // invalida qualquer resposta em voo
      setRaw(EMPTY);
      setError(null);
      setLoading(false);
      return;
    }
    const myReq = ++reqIdRef.current;
    setLoading(true);
    setError(null);
    const params = { p_fazenda_id: fazendaId, p_ano_mes: anoMes };
    try {
      // Quatro RPCs em paralelo (não 6, sem N+1 por-pasto/por-card).
      const [cards, comp, pend, loc] = await Promise.all([
        supabase.rpc('fn_cards_componentes_mes' as never, params as never),
        supabase.rpc('fn_composicao_componentes_categoria_mes' as never, params as never),
        supabase.rpc('fn_pendencias_fechamento_mes' as never, params as never),
        supabase.rpc('fn_locais_sugeridos_mes' as never, params as never),
      ]);
      const primeiroErro = cards.error || comp.error || pend.error || loc.error;
      if (primeiroErro) throw primeiroErro;
      if (!mountedRef.current || myReq !== reqIdRef.current) return; // resposta obsoleta -> descarta
      // Atualização atômica: só publica o conjunto completo após as 4 resolverem.
      setRaw({
        componentes: (cards.data as unknown as ComponenteMensal[]) ?? [],
        composicaoPorCategoria: (comp.data as unknown as ComposicaoCategoriaMensal[]) ?? [],
        pendencias: (pend.data as unknown as PendenciaMensal[]) ?? [],
        locaisSugeridos: (loc.data as unknown as LocalSugeridoMensal[]) ?? [],
      });
    } catch (e) {
      if (!mountedRef.current || myReq !== reqIdRef.current) return;
      setRaw(EMPTY);                    // erro atômico: nunca publica conjunto parcialmente misturado
      setError(e instanceof Error ? e : new Error(String(e)));
    } finally {
      if (mountedRef.current && myReq === reqIdRef.current) setLoading(false);
    }
  }, [fazendaId, anoMes]);

  // Deps do efeito de fetch: apenas (fazendaId, anoMes) via `load`; nunca os arrays de resultado.
  useEffect(() => { void load(); }, [load]);

  const cardsExistentes = useMemo(
    () => buildCardsExistentes(raw.componentes, raw.pendencias),
    [raw.componentes, raw.pendencias],
  );
  const sugeridosSemCard = useMemo(
    () => buildSugeridosSemCard(raw.locaisSugeridos, cardsExistentes),
    [raw.locaisSugeridos, cardsExistentes],
  );
  const linhasDaTela = useMemo(
    () => buildLinhasDaTela(cardsExistentes, sugeridosSemCard),
    [cardsExistentes, sugeridosSemCard],
  );

  return {
    ...raw,
    cardsExistentes,
    sugeridosSemCard,
    linhasDaTela,
    loading,
    error,
    reload: load,
  };
}
