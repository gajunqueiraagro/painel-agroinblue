import { useState, useEffect, useCallback, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { parseNumericValue } from '@/lib/calculos/abate';

// Estado + operações dos LOTES comerciais de uma operação OC (COM-3). Fonte única = camada OC
// (zoo_operacao_lotes via RLS; escrita por oc_salvar_lotes). Sem lancamentos, sem físico, sem
// financeiro. Totais derivados só no frontend. Funciona apenas em modo OC (enabled).
export type CriterioValor = 'kg' | 'cabeca' | 'total';

export interface LoteForm {
  idLocal: string;               // key React (não é o id do banco)
  ordem: number;
  categoria: string;
  quantidade: string;            // mascarado (inteiro)
  pesoMedioKg: string;           // mascarado (peso médio)
  criterioValor: CriterioValor;
  valorInformado: string;        // mascarado (R$)
}

export interface CompraLotesApi {
  lotes: LoteForm[];
  loading: boolean;
  saving: boolean;
  adicionarLote: () => void;
  editarLote: (idLocal: string, patch: Partial<LoteForm>) => void;
  removerLote: (idLocal: string) => void;
  salvar: (opts?: { silent?: boolean }) => Promise<number | null>;   // retorna a nova versão oficial | null em falha
  totais: { lotes: number; animais: number; pesoTotal: number; valorNegociado: number };
}

let _seq = 0;
const novoIdLocal = () => `lote_${Date.now()}_${_seq++}`;

interface Params {
  operacaoId: string | null;
  clienteId: string | null;
  versao: number | null;
  onVersaoChange: (v: number) => void;
  enabled: boolean;
}

export function useCompraLotes({ operacaoId, clienteId, versao, onVersaoChange, enabled }: Params): CompraLotesApi {
  const [lotes, setLotes] = useState<LoteForm[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  const carregar = useCallback(async () => {
    if (!enabled || !operacaoId) { setLotes([]); return; }
    setLoading(true);
    try {
      const { data, error } = await (supabase as any)
        .from('zoo_operacao_lotes').select('*').eq('operacao_id', operacaoId).order('ordem');
      if (error) throw new Error(error.message);
      setLotes((data ?? []).map((r: any) => ({
        idLocal: novoIdLocal(),
        ordem: r.ordem,
        categoria: r.categoria_negociada ?? '',
        quantidade: r.qtd_negociada != null ? String(r.qtd_negociada) : '',
        pesoMedioKg: r.peso_medio_negociado_kg != null ? String(r.peso_medio_negociado_kg) : '',
        criterioValor: (r.criterio_valor ?? 'kg') as CriterioValor,
        valorInformado: r.valor_informado != null ? String(r.valor_informado) : '',
      })));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Falha ao carregar lotes.');
    } finally {
      setLoading(false);
    }
  }, [enabled, operacaoId]);

  useEffect(() => { carregar(); }, [carregar]);

  const adicionarLote = useCallback(() => {
    setLotes(prev => [...prev, {
      idLocal: novoIdLocal(),
      ordem: prev.reduce((m, l) => Math.max(m, l.ordem), 0) + 1,
      categoria: '', quantidade: '', pesoMedioKg: '', criterioValor: 'kg', valorInformado: '',
    }]);
  }, []);

  const editarLote = useCallback((idLocal: string, patch: Partial<LoteForm>) => {
    setLotes(prev => prev.map(l => (l.idLocal === idLocal ? { ...l, ...patch } : l)));
  }, []);

  const removerLote = useCallback((idLocal: string) => {
    // preserva ordem contígua 1..N após remover
    setLotes(prev => prev.filter(l => l.idLocal !== idLocal).map((l, i) => ({ ...l, ordem: i + 1 })));
  }, []);

  // Retorna a NOVA versão oficial da operação em sucesso, null em falha (permite encadear
  //   salvar → concluir sem versão stale). `silent` controla APENAS o toast — não muda regra/persistência.
  const salvar = useCallback(async (opts?: { silent?: boolean }): Promise<number | null> => {
    if (!operacaoId || !clienteId) { toast.error('Operação não iniciada (salve a operação na aba Compra).'); return null; }
    setSaving(true);
    try {
      const payload = lotes.map(l => {
        const q = parseNumericValue(l.quantidade);
        return {
          ordem: l.ordem,
          categoria_negociada: l.categoria || null,
          qtd_negociada: q ? Math.trunc(q) : null,
          peso_medio_negociado_kg: parseNumericValue(l.pesoMedioKg) || null,
          criterio_valor: l.criterioValor,
          valor_informado: parseNumericValue(l.valorInformado) || null,
        };
      });
      const { data, error } = await (supabase as any).rpc('oc_salvar_lotes', {
        p_operacao_id: operacaoId, p_cliente_id: clienteId, p_versao_esperada: versao, p_lotes: payload,
      });
      if (error) throw new Error(error.message);
      const novaVersao: number = data?.versao != null ? data.versao : versao;
      if (data?.versao != null) onVersaoChange(data.versao);
      if (!opts?.silent) toast.success('Rascunho dos lotes salvo.');
      await carregar();
      return novaVersao;
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Falha ao salvar negociação.');
      return null;
    } finally {
      setSaving(false);
    }
  }, [operacaoId, clienteId, versao, lotes, onVersaoChange, carregar]);

  const totais = useMemo(() => {
    let animais = 0, pesoTotal = 0, valorNegociado = 0;
    for (const l of lotes) {
      const q = parseNumericValue(l.quantidade) || 0;
      const pm = parseNumericValue(l.pesoMedioKg) || 0;
      const v = parseNumericValue(l.valorInformado) || 0;
      const pt = q * pm;
      animais += q;
      pesoTotal += pt;
      valorNegociado += l.criterioValor === 'kg' ? pt * v : l.criterioValor === 'cabeca' ? q * v : v;
    }
    return { lotes: lotes.length, animais, pesoTotal, valorNegociado };
  }, [lotes]);

  return { lotes, loading, saving, adicionarLote, editarLote, removerLote, salvar, totais };
}
