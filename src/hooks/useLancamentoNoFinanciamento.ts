/**
 * FIN-FINANC-28 · PASSO 6 — o lançamento do Financeiro visto pelo lado do financiamento: onde ele já está (parcela, liberação, encargo,
 * captação) e as candidatas — tudo de `fn_lancamento_financiamento` (o motor do 4b ao contrário). Os gestos são as RPCs de sempre,
 * cada uma com o contrário: vincular / desvincular pagamento, salvar / remover liberação, vincular / desvincular encargo.
 * Depois de cada gesto: o canal de lançamentos avisa (lista, CPR, Conciliação releem) e as chaves do contrato são invalidadas.
 */
import { useCallback, useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { notificarLancamentosMudaram } from '@/hooks/useFinanceiroV2';
import {
  lerLancamentoNoFinanciamento, lerResultadoDoVinculo,
  type LancamentoNoFinanciamento, type OndeEsta, type PapelDoPagamento, type ResultadoDoVinculo,
} from '@/lib/financiamentos/buscaNoContrato';

const CHAVES_DO_CONTRATO = ['contrato-liberacoes', 'contrato-encargos', 'contrato-vinculos-pagamento', 'financiamento-parcelas',
  'financiamento-situacao', 'financiamentos-lista', 'financiamento-primeira-liberacao', 'painel-financiamentos'];

const fraseDoErro = (e: unknown): string => {
  const m = typeof e === 'object' && e !== null && 'message' in e ? String(e.message) : String(e);
  return m.replace(/^(ERROR:\s*)?(P0001|42501):\s*/i, '').trim() || 'Não foi possível gravar.';
};

export interface EncargoCandidato { financiamentoId: string; contrato: string; credor: string | null; mesmoCredor: boolean; numeroNaDescricao: boolean }
export interface EncargoDoLancamento { elegivel: boolean; frase: string | null; papelSugerido: string; candidatas: EncargoCandidato[] }

export function useLancamentoNoFinanciamento(lancamentoId: string | null | undefined, clienteId: string | null | undefined) {
  const qc = useQueryClient();
  const [dado, setDado] = useState<LancamentoNoFinanciamento | string | null>(null);
  const [versao, setVersao] = useState(0);

  useEffect(() => {
    if (!lancamentoId || !clienteId) { setDado(null); return; }
    let vivo = true;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- idioma documentado: o `.rpc` do repo
    void (supabase as any).rpc('fn_lancamento_financiamento', { p_lancamento_id: lancamentoId }).then(({ data, error }: { data: unknown; error: unknown }) => {
      if (!vivo) return;
      setDado(error ? fraseDoErro(error) : lerLancamentoNoFinanciamento(data) ?? 'Não foi possível ler o financiamento deste lançamento.');
    });
    return () => { vivo = false; };
  }, [lancamentoId, clienteId, versao]);

  const depois = useCallback(() => {
    setVersao((v) => v + 1);
    for (const k of CHAVES_DO_CONTRATO) void qc.invalidateQueries({ queryKey: [k] });
    if (clienteId) notificarLancamentosMudaram(clienteId);
  }, [qc, clienteId]);

  const rpc = useCallback(async (fn: string, args: Record<string, unknown>): Promise<string | null> => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- idioma documentado: o `.rpc` do repo
    const { error } = await (supabase as any).rpc(fn, args);
    if (error) return fraseDoErro(error);
    depois();
    return null;
  }, [depois]);

  const vincularParcela = useCallback(async (parcelaId: string, papel: PapelDoPagamento, mover: boolean, simular: boolean): Promise<ResultadoDoVinculo | string> => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- idioma documentado: o `.rpc` do repo
    const { data, error } = await (supabase as any).rpc('fn_financiamento_parcela_vincular', {
      p_parcela_id: parcelaId, p_lancamento_id: lancamentoId, p_papel: papel, p_mover: mover, p_simular: simular,
    });
    if (error) return fraseDoErro(error);
    const r = lerResultadoDoVinculo(data);
    if (!r) return 'Resposta do banco fora do formato.';
    if (!simular && !r.recusa) depois();
    return r;
  }, [lancamentoId, depois]);

  const vincularLiberacao = useCallback((financiamentoId: string, data: string, valor: number) => rpc('fn_financiamento_liberacao_salvar', {
    p_financiamento_id: financiamentoId, p_id: null, p_data: data, p_valor: valor, p_forma: 'conta', p_lancamento_id: lancamentoId,
    p_fornecedor_id: null, p_contrato_liquidado_id: null, p_destinacao_id: null, p_observacao: null,
  }), [rpc, lancamentoId]);

  const lerEncargo = useCallback(async (): Promise<EncargoDoLancamento | string> => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- idioma documentado: o `.rpc` do repo
    const { data, error } = await (supabase as any).rpc('fn_contrato_encargo_candidatas', { p_lancamento_id: lancamentoId });
    if (error) return fraseDoErro(error);
    if (typeof data !== 'object' || data === null) return 'Resposta do banco fora do formato.';
    const el = 'elegivel' in data && typeof data.elegivel === 'object' && data.elegivel !== null ? data.elegivel : null;
    const lanc = 'lancamento' in data && typeof data.lancamento === 'object' && data.lancamento !== null ? data.lancamento : null;
    const lista: unknown[] = 'candidatas' in data && Array.isArray(data.candidatas) ? data.candidatas : [];
    return {
      elegivel: !!el && 'ok' in el && el.ok === true,
      frase: el && 'frase' in el && typeof el.frase === 'string' ? el.frase : null,
      papelSugerido: lanc && 'papel_sugerido' in lanc && typeof lanc.papel_sugerido === 'string' ? lanc.papel_sugerido : 'outro',
      candidatas: lista.flatMap((c) => {
        if (typeof c !== 'object' || c === null || !('financiamento_id' in c) || typeof c.financiamento_id !== 'string') return [];
        const num = 'numero_contrato' in c && typeof c.numero_contrato === 'string' ? c.numero_contrato : '';
        const desc = 'descricao' in c && typeof c.descricao === 'string' ? c.descricao : '';
        return [{ financiamentoId: c.financiamento_id, contrato: num || desc || 'contrato',
          credor: 'credor_nome' in c && typeof c.credor_nome === 'string' ? c.credor_nome : null,
          mesmoCredor: 'mesmo_credor' in c && c.mesmo_credor === true, numeroNaDescricao: 'numero_na_descricao' in c && c.numero_na_descricao === true }];
      }),
    };
  }, [lancamentoId]);

  const vincularEncargo = useCallback((financiamentoId: string, papel: string) => rpc('fn_contrato_encargo_vincular', {
    p_financiamento_id: financiamentoId, p_itens: [{ lancamento_id: lancamentoId, papel }], p_simular: false,
  }), [rpc, lancamentoId]);

  /** o gesto contrário de onde o lançamento está (motivo obrigatório) */
  const desfazer = useCallback(async (a: OndeEsta, motivo: string): Promise<string | null> => {
    if (a.tipo === 'parcela' && a.vinculoId) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- idioma documentado: o `.rpc` do repo
      const { data, error } = await (supabase as any).rpc('fn_financiamento_parcela_desvincular', { p_vinculo_id: a.vinculoId, p_motivo: motivo, p_simular: false });
      if (error) return fraseDoErro(error);
      const r = lerResultadoDoVinculo(data);
      if (r?.recusa) return r.recusa;
      depois();
      return null;
    }
    if (a.tipo === 'liberacao') return rpc('fn_financiamento_liberacao_remover', { p_id: a.liberacaoId, p_motivo: motivo });
    if (a.tipo === 'encargo') return rpc('fn_contrato_encargo_desvincular', { p_encargo_id: a.encargoId, p_motivo: motivo, p_simular: false });
    return 'Este vínculo não se desfaz por aqui: ajuste pela tela do contrato.';
  }, [rpc, depois]);

  return { dado, vincularParcela, vincularLiberacao, lerEncargo, vincularEncargo, desfazer };
}
