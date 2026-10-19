/**
 * FIN-CONSORCIO-02 — o consórcio pelas RPCs do banco: a tela (`fn_consorcio_tela`), a prévia do gerador (`fn_consorcio_cronograma`)
 * e os gestos (salvar, reajuste, contemplação, editar / regerar / desfazer parcelas — os do financiamento, que desviam no banco).
 * Depois de gravar: a tela, a lista de contratos e o canal dos lançamentos releem.
 */
import { useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { notificarLancamentosMudaram } from '@/hooks/useFinanceiroV2';
import { hojeLocal } from '@/lib/datas/hojeLocal';
import { lerCronograma, lerTelaDoConsorcio, type Cronograma } from '@/lib/financiamentos/consorcio';

export const CHAVE_TELA_DO_CONSORCIO = 'consorcio-tela';

/** a resposta de uma RPC de gesto: `recusa` (frase do banco) ou o envelope; o erro do PostgREST vira a frase dele */
export interface RespostaDoGesto { ok: boolean; recusa: string | null; dado: Record<string, unknown> | null }

function lerResposta(data: unknown, error: { message?: string } | null): RespostaDoGesto {
  if (error) return { ok: false, recusa: error.message || 'O banco recusou.', dado: null };
  const o = typeof data === 'object' && data !== null && !Array.isArray(data) ? Object.fromEntries(Object.entries(data)) : null;
  if (!o) return { ok: false, recusa: 'O banco não respondeu.', dado: null };
  /* o consórcio devolve a frase; as cascas do financiamento (editar / regerar / desfazer) devolvem `{motivo, frase}` */
  const rec = o.recusa;
  const frase = typeof rec === 'object' && rec !== null && !Array.isArray(rec) ? Object.fromEntries(Object.entries(rec)).frase : rec;
  const recusa = typeof frase === 'string' && frase ? frase : null;
  return { ok: !recusa, recusa, dado: o };
}

export function useTelaDoConsorcio(financiamentoId: string | null | undefined) {
  return useQuery({
    queryKey: [CHAVE_TELA_DO_CONSORCIO, financiamentoId],
    enabled: !!financiamentoId,
    queryFn: async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- idioma documentado: o `.rpc` do repo
      const { data, error } = await (supabase as any).rpc('fn_consorcio_tela', { p_id: financiamentoId, p_hoje: hojeLocal() });
      if (error) throw error;
      const tela = lerTelaDoConsorcio(data);
      if (!tela) throw new Error('Resposta do consórcio fora do formato.');
      return tela;
    },
  });
}

/** a prévia do gerador para as regras do formulário (espera 300 ms depois da última mudança) */
export function useCronogramaDoConsorcio(regras: Record<string, unknown>): Cronograma | null {
  const [crono, setCrono] = useState<Cronograma | null>(null);
  const chave = JSON.stringify(regras);
  useEffect(() => {
    let vivo = true;
    const t = setTimeout(async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- idioma documentado: o `.rpc` do repo
      const { data, error } = await (supabase as any).rpc('fn_consorcio_cronograma', { p: JSON.parse(chave) });
      if (vivo) setCrono(error ? null : lerCronograma(data));
    }, 300);
    return () => { vivo = false; clearTimeout(t); };
  }, [chave]);
  return crono;
}

export function useGestosDoConsorcio(clienteId: string | null | undefined) {
  const qc = useQueryClient();
  const depois = (finId: string | null) => {
    void qc.invalidateQueries({ queryKey: [CHAVE_TELA_DO_CONSORCIO, finId] });
    void qc.invalidateQueries({ queryKey: ['financiamentos-lista'] });
    void qc.invalidateQueries({ queryKey: ['contrato-documentos', finId] });
    if (clienteId) notificarLancamentosMudaram(clienteId);
  };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- idioma documentado: o `.rpc` do repo
  const rpc = (fn: string, args: Record<string, unknown>) => (supabase as any).rpc(fn, args);
  const gesto = async (finId: string | null, fn: string, args: Record<string, unknown>, simular: boolean): Promise<RespostaDoGesto> => {
    const { data, error } = await rpc(fn, { ...args, p_simular: simular });
    const r = lerResposta(data, error);
    if (r.ok && !simular) depois(finId ?? (typeof r.dado?.financiamento_id === 'string' ? r.dado.financiamento_id : null));
    return r;
  };
  return {
    salvar: (finId: string | null, dados: Record<string, unknown>, simular: boolean) => gesto(finId, 'fn_consorcio_salvar', { p_id: finId, p_dados: dados }, simular),
    reajustar: (finId: string, pct: number, aPartirDe: string, indice: string | null, simular: boolean) =>
      gesto(finId, 'fn_consorcio_reajustar', { p_id: finId, p_pct: pct, p_a_partir_de: aPartirDe, p_indice: indice }, simular),
    contemplar: (finId: string, dados: Record<string, unknown>, simular: boolean) => gesto(finId, 'fn_consorcio_contemplar', { p_id: finId, p_dados: dados }, simular),
    regerar: (finId: string, modo: 'manter_ajustes' | 'recalcular_todas', simular: boolean) =>
      gesto(finId, 'fn_financiamento_parcelas_regerar', { p_id: finId, p_modo: modo }, simular),
    editarParcela: (finId: string, mudanca: Record<string, unknown>, simular: boolean) =>
      gesto(finId, 'fn_financiamento_parcelas_editar', { p_id: finId, p_mudancas: { alterar: [mudanca] } }, simular),
    desfazer: (finId: string, operacaoId: string, motivo: string) =>
      gesto(finId, 'fn_financiamento_parcelas_desfazer', { p_operacao_id: operacaoId, p_motivo: motivo }, false),
  };
}
