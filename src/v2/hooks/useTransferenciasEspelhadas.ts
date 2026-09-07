/**
 * As transferências entre contas do próprio cliente — [ENRIQUECER-GRAVAR-01] (133c item 3).
 *
 * ⚠ O QUE ELAS SÃO: dois lançamentos que o OFX trouxe como fatos separados — uma saída numa
 * conta e uma entrada em outra, mesmo valor, um dia de distância — e que são **um** movimento
 * só. Enquanto ficam separados, o mês conta o dinheiro duas vezes: uma despesa que não
 * existe e uma receita que não existe.
 *
 * ⚠ A DETECÇÃO É DO BANCO, e o front NÃO a reproduz. `fn_transferencias_espelhadas` já
 * exige valor igual (2 casas), |dias| ≤ 1, contas diferentes e **subcentro nulo** dos dois
 * lados — quem já foi classificado não é candidato. Uma segunda régua aqui discordaria dela
 * no dia em que a tolerância mudasse.
 *
 * ⚠ `ambiguo` NÃO É ERRO, É PERGUNTA: significa que a mesma saída casa com mais de uma
 * entrada (ou o contrário). Medido em agosto do NJ: três saídas de R$ 300.000 do Itaú no dia
 * 17 contra entradas no BB e na Lavoura. Quem escolhe é o operador.
 *
 * ⚠ A UNIÃO SIMULA ANTES DE GRAVAR. `fn_transferencia_unir(p_simular=true)` devolve
 * `vinculos_a_mover` sem escrever nada; é o número que a tela mostra antes de o operador
 * confirmar. Sem ele, "Unir" é um botão que promete um efeito invisível.
 */
import { useCallback, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { notificarLancamentosMudaram } from '@/hooks/useFinanceiroV2';

/** Um par candidato, exatamente como a RPC o devolve. */
export interface ParEspelhado {
  saida_id: string;
  entrada_id: string;
  valor: number;
  dia_saida: string;
  dia_entrada: string;
  conta_saida_id: string;
  conta_saida: string | null;
  conta_entrada_id: string;
  conta_entrada: string | null;
  desc_saida: string | null;
  desc_entrada: string | null;
  /** A mesma saída casa com mais de uma entrada, ou a mesma entrada com mais de uma saída. */
  ambiguo: boolean;
}

export interface TransferenciasEspelhadas {
  total: number;
  unicos: number;
  pares: ParEspelhado[];
}

const VAZIO: TransferenciasEspelhadas = { total: 0, unicos: 0, pares: [] };

/** O que a simulação devolve — o número que a tela mostra antes de confirmar. */
export interface SimulacaoUniao {
  vinculos_a_mover: number;
  valor: number | null;
}

export function useTransferenciasEspelhadas(clienteId: string | null | undefined, anoMes: string | null) {
  const qc = useQueryClient();
  const [unindo, setUnindo] = useState(false);

  const query = useQuery({
    queryKey: ['transferencias-espelhadas', clienteId ?? null, anoMes ?? null],
    enabled: !!clienteId && !!anoMes,
    staleTime: 30_000,
    queryFn: async (): Promise<TransferenciasEspelhadas> => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- idioma documentado do repo
      const { data, error } = await (supabase as any).rpc('fn_transferencias_espelhadas', {
        p_cliente_id: clienteId, p_ano_mes: anoMes,
      });
      if (error) throw error;
      const r = (data ?? {}) as { total?: number; unicos?: number; pares?: ParEspelhado[] };
      return { total: r.total ?? 0, unicos: r.unicos ?? 0, pares: r.pares ?? [] };
    },
  });

  /** Simula a união — não escreve nada. */
  const simular = useCallback(async (saidaId: string, entradaId: string): Promise<SimulacaoUniao | null> => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- idioma documentado do repo
    const { data, error } = await (supabase as any).rpc('fn_transferencia_unir', {
      p_saida_id: saidaId, p_entrada_id: entradaId, p_simular: true,
    });
    if (error) throw error;
    const r = (data ?? {}) as { ok?: boolean; vinculos_a_mover?: number; valor?: number; motivo?: string };
    if (!r.ok) throw new Error(r.motivo ?? 'não foi possível simular a união');
    return { vinculos_a_mover: r.vinculos_a_mover ?? 0, valor: r.valor ?? null };
  }, []);

  /** Une de verdade. O par sai da lista na releitura. */
  const unir = useCallback(async (saidaId: string, entradaId: string): Promise<{ vinculosMovidos: number }> => {
    setUnindo(true);
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- idioma documentado do repo
      const { data, error } = await (supabase as any).rpc('fn_transferencia_unir', {
        p_saida_id: saidaId, p_entrada_id: entradaId, p_simular: false,
      });
      if (error) throw error;
      const r = (data ?? {}) as { ok?: boolean; vinculos_movidos?: number; motivo?: string };
      if (!r.ok) throw new Error(r.motivo ?? 'não foi possível unir');
      if (clienteId) notificarLancamentosMudaram(clienteId);
      await qc.invalidateQueries({ queryKey: ['transferencias-espelhadas', clienteId ?? null, anoMes ?? null] });
      return { vinculosMovidos: r.vinculos_movidos ?? 0 };
    } finally {
      setUnindo(false);
    }
  }, [clienteId, anoMes, qc]);

  return { dados: query.data ?? VAZIO, carregando: query.isLoading, simular, unir, unindo };
}
