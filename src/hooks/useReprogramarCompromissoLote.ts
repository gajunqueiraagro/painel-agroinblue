/**
 * Atualizar o compromisso ao valor corrente do lote — [OC-EDITAR-LOTE-FECHADA] 128b/128e.
 *
 * ⚠ NASCE DE UM DEFEITO DE CONFIANÇA. Editar o valor do lote de uma OC já programada
 * deixava o compromisso com o número antigo, e a aba Financeiro mostrava os dois lado a
 * lado sem dizer qual valia. `oc_revalorar_lote` NÃO servia: ela mexe no lote e nos
 * lançamentos do rebanho e não toca compromisso, parcela nem título (medido em 06/09).
 * `oc_reprogramar_compromisso_do_lote` (20260906205249) é a que faz a outra metade.
 *
 * ⚠ SIMULAR É A MESMA CONTA, sem gravar — igual ao `useExcluirLoteOC`. O diálogo lista o
 * rol que a execução produziria; montar a lista no front seria a segunda resposta para
 * "o que vai acontecer", e ela divergiria na primeira mudança da RPC.
 *
 * ⚠ DINHEIRO REALIZADO NÃO SE MEXE SEM ESTORNO. A RPC cancela só parcelas previstas ou
 * programadas; realizado, agendado ou conciliado BLOQUEIA e diz qual. É o mesmo princípio
 * do excluir lote.
 */
import { useCallback, useState } from 'react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import type { Json } from '@/integrations/supabase/types';

export interface ItemDoRolReprogramacao { tipo: string; descricao: string; id: string | null }
export interface BloqueioReprogramacao { tipo: string; descricao: string }

export interface SimulacaoReprogramacao {
  ok: boolean;
  rol: ItemDoRolReprogramacao[];
  bloqueios: BloqueioReprogramacao[];
  valorAntigo: number | null;
  valorNovo: number | null;
}

export interface ResultadoReprogramacao {
  operacaoVersao: number;
  valorAntigo: number | null;
  valorNovo: number | null;
  /** `true` quando o compromisso já conferia — nada foi gravado, e o toast diz isso. */
  nadaAFazer: boolean;
}

export interface ReprogramarCompromissoApi {
  simulando: boolean;
  reprogramando: boolean;
  simular: (loteId: string) => Promise<SimulacaoReprogramacao | null>;
  reprogramar: (loteId: string, versaoEsperada: number, motivo: string) => Promise<ResultadoReprogramacao | null>;
}

function objeto(j: Json | null | undefined): Record<string, Json> | null {
  return j && typeof j === 'object' && !Array.isArray(j) ? j : null;
}

function lerRol(j: Json | undefined): ItemDoRolReprogramacao[] {
  if (!Array.isArray(j)) return [];
  return j.flatMap((item) => {
    const o = objeto(item);
    const descricao = o?.descricao;
    if (typeof descricao !== 'string') return [];
    return [{
      tipo: typeof o?.tipo === 'string' ? o.tipo : 'outro',
      descricao,
      id: typeof o?.id === 'string' ? o.id : null,
    }];
  });
}

/** Número do envelope, ou `null`. A RPC manda cru — quem formata é a tela. */
function num(j: Json | undefined): number | null {
  const n = Number(j);
  return j != null && Number.isFinite(n) ? n : null;
}

export function useReprogramarCompromissoLote(
  operacaoId: string | null | undefined,
  clienteId: string | null | undefined,
): ReprogramarCompromissoApi {
  const [simulando, setSimulando] = useState(false);
  const [reprogramando, setReprogramando] = useState(false);

  const simular = useCallback(async (loteId: string): Promise<SimulacaoReprogramacao | null> => {
    if (!operacaoId || !clienteId) return null;
    setSimulando(true);
    try {
      const { data, error } = await supabase.rpc('oc_reprogramar_compromisso_do_lote', {
        p_operacao_id: operacaoId, p_cliente_id: clienteId,
        /* Versão e motivo não são exigidos na simulação — contrato da RPC, não valor
           inventado (o mesmo do `oc_excluir_lote`). */
        p_versao_esperada: 0, p_lote_id: loteId, p_motivo: '', p_simular: true,
      });
      if (error) throw error;
      const env = objeto(data);
      if (!env) throw new Error('A simulação não voltou no formato esperado.');
      return {
        ok: env.ok === true,
        rol: lerRol(env.rol),
        bloqueios: lerRol(env.bloqueios).map(({ tipo, descricao }) => ({ tipo, descricao })),
        valorAntigo: num(env.valor_antigo),
        valorNovo: num(env.valor_novo),
      };
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Falha ao simular a atualização do compromisso.');
      return null;
    } finally {
      setSimulando(false);
    }
  }, [operacaoId, clienteId]);

  const reprogramar = useCallback(async (
    loteId: string, versaoEsperada: number, motivo: string,
  ): Promise<ResultadoReprogramacao | null> => {
    if (!operacaoId || !clienteId) return null;
    setReprogramando(true);
    try {
      const { data, error } = await supabase.rpc('oc_reprogramar_compromisso_do_lote', {
        p_operacao_id: operacaoId, p_cliente_id: clienteId,
        p_versao_esperada: versaoEsperada, p_lote_id: loteId, p_motivo: motivo, p_simular: false,
      });
      if (error) throw error;
      const env = objeto(data);
      const versao = Number(env?.operacao_versao);
      if (!env || !Number.isFinite(versao)) {
        throw new Error('O compromisso foi atualizado, mas a versão não voltou. Recarregue antes de continuar.');
      }
      return {
        operacaoVersao: versao,
        valorAntigo: num(env.valor_antigo),
        valorNovo: num(env.valor_novo),
        nadaAFazer: env.nada_a_fazer === true,
      };
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Falha ao atualizar o compromisso.');
      return null;
    } finally {
      setReprogramando(false);
    }
  }, [operacaoId, clienteId]);

  return { simulando, reprogramando, simular, reprogramar };
}
