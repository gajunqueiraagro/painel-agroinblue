/**
 * FIN-LR-SYNC-01 passo a2 — "Atualizar do Lucro Rural": o banco APLICA o que o operador confirmou e DESFAZ a última atualização.
 *
 * O hook só leva as decisões da tela à `fn_lr_sync_aplicar` (e o pedido de desfazer à `fn_lr_sync_desfazer`) e devolve o
 * envelope do banco como veio. Nenhuma regra mora aqui: o banco compara de novo, recusa a decisão cuja situação mudou desde a
 * tela e diz o motivo de cada recusa. SIMULAR = GRAVAR: o mesmo caminho, desfeito no banco (`simular` é o padrão).
 *
 * ⚠ O ERRO DO BANCO VAI COMO VEIO (42501 sem acesso; 22023 decisões inválidas; P0001 com a frase do desfazer).
 */
import { useCallback, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';

/** Uma decisão da tela sobre uma linha do LR (a tela parte da `acao_padrao` da comparação). */
export interface DecisaoLr {
  chave: string;
  acao: string;
  /** A situação que a tela viu; o banco recusa ('mudou_desde_a_comparacao') se a de agora for outra. */
  situacao: string;
  /** O lançamento que a tela viu casado (o banco confere). */
  lancamento_visto?: string | null;
  /** O lançamento escolhido para `vincular` (casamento manual). */
  lancamento_id?: string | null;
  /** A classificação do operador para `criar_programada` quando o de-para não resolve. */
  classificacao?: { plano_conta_id?: string; fazenda_id?: string; favorecido_id?: string; conta_id?: string; safra_id?: string };
}

export type ResultadoLr = { ok: true; envelope: unknown } | { ok: false; frase: string };

function fraseDoErro(e: unknown, padrao: string): string {
  if (e instanceof Error && e.message) return e.message;
  if (e && typeof e === 'object' && 'message' in e) return String(Reflect.get(e, 'message'));
  return padrao;
}

export async function aplicarLr(
  clienteId: string,
  sessaoId: string,
  decisoes: readonly DecisaoLr[],
  simular = true,
): Promise<ResultadoLr> {
  const { data, error } = await (supabase as any).rpc('fn_lr_sync_aplicar', {
    p_cliente: clienteId,
    p_sessao: sessaoId,
    p_decisoes: decisoes,
    p_simular: simular,
  });
  if (error) return { ok: false, frase: fraseDoErro(error, 'Não foi possível aplicar a atualização do Lucro Rural.') };
  return { ok: true, envelope: data };
}

/** Desfaz a ÚLTIMA aplicação do cliente (`aplicacaoId` nulo = a última; outra é recusada pelo banco). */
export async function desfazerLr(clienteId: string, aplicacaoId: string | null, simular = true): Promise<ResultadoLr> {
  const { data, error } = await (supabase as any).rpc('fn_lr_sync_desfazer', {
    p_cliente: clienteId,
    p_aplicacao: aplicacaoId,
    p_simular: simular,
  });
  if (error) return { ok: false, frase: fraseDoErro(error, 'Não foi possível desfazer a atualização do Lucro Rural.') };
  return { ok: true, envelope: data };
}

export function useLrSyncAplicar() {
  const [gravando, setGravando] = useState(false);
  const aplicar = useCallback(
    async (clienteId: string, sessaoId: string, decisoes: readonly DecisaoLr[], simular = true) => {
      setGravando(true);
      try {
        return await aplicarLr(clienteId, sessaoId, decisoes, simular);
      } finally {
        setGravando(false);
      }
    },
    [],
  );
  const desfazer = useCallback(async (clienteId: string, aplicacaoId: string | null, simular = true) => {
    setGravando(true);
    try {
      return await desfazerLr(clienteId, aplicacaoId, simular);
    } finally {
      setGravando(false);
    }
  }, []);
  return { aplicar, desfazer, gravando };
}
