/**
 * Excluir um lote da OC — [OC-EXCLUIR-LOTE], envelope 128.
 *
 * ⚠ EXCLUIR LOTE É PERMITIDO EM QUALQUER ESTADO DA OPERAÇÃO. Não é descuido: o lote arrasta
 * movimentação zootecnica, compromisso, parcela e título, e a decisão do Gabriel (06/09) é
 * que o sistema DESFAÇA o que ele arrasta em vez de trancar a porta e mandar o operador
 * caçar cada peça à mão. O único bloqueio é título CONCILIADO — aí o dinheiro já encontrou
 * o extrato, e desfazer sem estorno seria reescrever conciliação.
 *
 * ⚠ SIMULAR NÃO É PREVISÃO, É A MESMA CONTA. `p_simular = true` percorre exatamente o mesmo
 * caminho da execução e devolve o mesmo `rol`, sem gravar — por isso o diálogo pode
 * prometer o que vai acontecer. Uma lista montada no front seria a segunda resposta, e
 * divergiria na primeira mudança da RPC.
 *
 * ⚠ A VERSÃO DA EXECUÇÃO É A DO STATE, e a que ela devolve é a que os próximos gestos usam:
 * `oc_excluir_lote` avança `zoo_operacoes_comerciais.versao`, e reusar a velha volta 40001.
 */
import { useCallback, useState } from 'react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import type { Json } from '@/integrations/supabase/types';

/** Um item do que será desfeito. `tipo` vem do banco: movimentacao | compromisso | lote. */
export interface ItemDoRol {
  tipo: string;
  descricao: string;
  id: string | null;
}

/** O que impede a exclusão. Hoje só existe `conciliado`. */
export interface Bloqueio {
  tipo: string;
  descricao: string;
}

export interface SimulacaoExclusao {
  ok: boolean;
  rol: ItemDoRol[];
  bloqueios: Bloqueio[];
}

export interface ResultadoExclusao {
  operacaoVersao: number;
  rol: ItemDoRol[];
  lotesRestantesCab: number;
  valorAcordado: number | null;
}

export interface ExcluirLoteApi {
  simulando: boolean;
  excluindo: boolean;
  simular: (loteId: string) => Promise<SimulacaoExclusao | null>;
  excluir: (loteId: string, versaoEsperada: number, motivo: string) => Promise<ResultadoExclusao | null>;
}

/* ⚠ NARROWING, NÃO CAST — o retorno é `jsonb` e chega como `Json`, que pode ser número,
   texto ou lista. Perguntar antes de ler é o que faz a tela dizer "não sei" em vez de
   quebrar, se a RPC um dia responder outra coisa. */
function objeto(j: Json | null | undefined): Record<string, Json> | null {
  return j && typeof j === 'object' && !Array.isArray(j) ? j : null;
}

function lerRol(j: Json | undefined): ItemDoRol[] {
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

function lerBloqueios(j: Json | undefined): Bloqueio[] {
  return lerRol(j).map(({ tipo, descricao }) => ({ tipo, descricao }));
}

export function useExcluirLoteOC(
  operacaoId: string | null | undefined,
  clienteId: string | null | undefined,
): ExcluirLoteApi {
  const [simulando, setSimulando] = useState(false);
  const [excluindo, setExcluindo] = useState(false);

  const simular = useCallback(async (loteId: string): Promise<SimulacaoExclusao | null> => {
    if (!operacaoId || !clienteId) return null;
    setSimulando(true);
    try {
      const { data, error } = await supabase.rpc('oc_excluir_lote', {
        p_operacao_id: operacaoId, p_cliente_id: clienteId,
        /* ⚠ VERSÃO E MOTIVO NÃO SÃO EXIGIDOS NA SIMULAÇÃO — a RPC só os cobra quando vai
           gravar. Mandar `0` e `''` aqui é o contrato dela, não um valor inventado. */
        p_versao_esperada: 0, p_lote_id: loteId, p_motivo: '', p_simular: true,
      });
      if (error) throw error;
      const env = objeto(data);
      if (!env) throw new Error('A simulação não voltou no formato esperado.');
      return {
        ok: env.ok === true,
        rol: lerRol(env.rol),
        bloqueios: lerBloqueios(env.bloqueios),
      };
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Falha ao simular a exclusão do lote.');
      return null;
    } finally {
      setSimulando(false);
    }
  }, [operacaoId, clienteId]);

  const excluir = useCallback(async (
    loteId: string, versaoEsperada: number, motivo: string,
  ): Promise<ResultadoExclusao | null> => {
    if (!operacaoId || !clienteId) return null;
    setExcluindo(true);
    try {
      const { data, error } = await supabase.rpc('oc_excluir_lote', {
        p_operacao_id: operacaoId, p_cliente_id: clienteId,
        p_versao_esperada: versaoEsperada, p_lote_id: loteId, p_motivo: motivo,
        p_simular: false,
      });
      if (error) throw error;
      const env = objeto(data);
      const versao = Number(env?.operacao_versao);
      if (!env || !Number.isFinite(versao)) {
        /* ⚠ SEM A VERSÃO, O PRÓXIMO GESTO NASCE ERRADO. Falhar aqui é melhor que devolver
           um sucesso que faria o Salvar seguinte bater em 40001 sem explicação. */
        throw new Error('O lote foi excluído, mas a versão não voltou. Recarregue antes de continuar.');
      }
      const acordado = Number(env.valor_acordado);
      return {
        operacaoVersao: versao,
        rol: lerRol(env.rol),
        lotesRestantesCab: Number(env.lotes_restantes_cab ?? 0),
        valorAcordado: Number.isFinite(acordado) ? acordado : null,
      };
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Falha ao excluir o lote.');
      return null;
    } finally {
      setExcluindo(false);
    }
  }, [operacaoId, clienteId]);

  return { simulando, excluindo, simular, excluir };
}
