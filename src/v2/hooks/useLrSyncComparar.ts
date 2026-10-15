/**
 * FIN-LR-SYNC-01a — "Atualizar do Lucro Rural", passo a1: o banco COMPARA.
 *
 * O hook só leva as linhas cruas do LR (`lerArquivoLr`) à `fn_lr_sync_comparar` e devolve
 * o envelope do banco como veio. Nenhuma regra de casamento, situação ou diferença mora
 * aqui: quem decide é o banco. Nenhum lançamento é gravado neste passo — a função só
 * grava a linha da sessão (`lr_sync_sessoes`).
 *
 * ⚠ O ERRO DO BANCO VAI COMO VEIO (42501 sem acesso; 22023 linhas inválidas).
 */
import { useCallback, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import type { LinhaLr } from '@/v2/lib/lucroRural/lerArquivoLr';

export type ResultadoComparacaoLr =
  | { ok: true; envelope: unknown }
  | { ok: false; frase: string };

function fraseDoErro(e: unknown): string {
  if (e instanceof Error && e.message) return e.message;
  if (e && typeof e === 'object' && 'message' in e) return String(Reflect.get(e, 'message'));
  return 'Não foi possível comparar com o Lucro Rural.';
}

export async function compararComLr(
  clienteId: string,
  sessaoId: string,
  linhas: readonly LinhaLr[],
): Promise<ResultadoComparacaoLr> {
  const { data, error } = await (supabase as any).rpc('fn_lr_sync_comparar', {
    p_cliente: clienteId,
    p_sessao: sessaoId,
    p_linhas: linhas,
  });
  if (error) return { ok: false, frase: fraseDoErro(error) };
  return { ok: true, envelope: data };
}

export function useLrSyncComparar() {
  const [comparando, setComparando] = useState(false);
  const comparar = useCallback(
    async (clienteId: string, sessaoId: string, linhas: readonly LinhaLr[]) => {
      setComparando(true);
      try {
        return await compararComLr(clienteId, sessaoId, linhas);
      } finally {
        setComparando(false);
      }
    },
    [],
  );
  return { comparar, comparando };
}
