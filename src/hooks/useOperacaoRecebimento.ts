import { useState, useEffect, useCallback, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

// Recebimento físico POR LOTE de uma operação OC (PR-OC-RECEB-01). Fonte soberana:
//   negociação = zoo_operacao_lotes; recebido = lancamentos (via oc_registrar_movimentacao/
//   oc_receber_lotes); leitura por lote = vw_oc_lotes_recebimento. Sem pasto, sem financeiro.
//   Funciona só em modo OC com operação NÃO rascunho (após "Concluir negociação").

export type EstadoRecebimento = 'nao_iniciado' | 'parcial' | 'completo' | 'excedente';

export interface LoteRecebimento {
  loteId: string;
  ordem: number;
  categoria: string | null;
  qtdNegociada: number | null;
  qtdRecebida: number;
  diferenca: number;
  estado: EstadoRecebimento;
  pesoMedioNegociadoKg: number | null;   // referência (só inicializa o input Peso méd.; vínculo por loteId)
}

export interface MovimentacaoOC {
  id: string;            // zoo_operacao_movimentacoes.id (para estorno)
  loteId: string;
  data: string;
  categoria: string | null;
  quantidade: number;
  pesoMedio: number | null;
  cancelado: boolean;
}

export interface RegistroRecebimento {
  data: string;
  categoria: string;
  quantidade: number;
  pesoMedio: number | null;
  observacao: string;
}

export interface RecebimentoApi {
  lotes: LoteRecebimento[];
  movimentacoes: MovimentacaoOC[];
  loading: boolean;
  saving: boolean;
  concluirNegociacao: (opts?: { versaoOverride?: number; silent?: boolean }) => Promise<boolean>;
  receberTodos: () => Promise<void>;
  registrar: (loteId: string, dados: RegistroRecebimento) => Promise<void>;
  estornar: (movimentacaoId: string, motivo: string) => Promise<void>;
  encerrar: (motivo: string) => Promise<void>;
  reabrir: (motivo: string) => Promise<void>;
  /** Estorna TODO o recebimento da operacao e reconstroi o cache zootecnico dos
      anos afetados. `true` = estornado; `false` = falhou (mensagem ja exibida). */
  estornarTudo: (motivo: string) => Promise<boolean>;
}

interface Params {
  operacaoId: string | null;
  clienteId: string | null;
  versao: number | null;
  onVersaoChange: (v: number) => void;
  onStatusChange?: (status: string) => void;
  onEntregaChange?: (encerrada: boolean) => void;
  enabled: boolean;
}

interface LoteRecRow {
  lote_id: string; ordem: number; categoria_negociada: string | null;
  qtd_negociada: number | null; qtd_recebida: number; diferenca: number; estado_recebimento: EstadoRecebimento;
  peso_medio_negociado_kg: number | null;
}
interface MovRow {
  id: string; operacao_lote_id: string;
  lancamentos: { data: string; categoria: string | null; quantidade: number; peso_medio_kg: number | null; cancelado: boolean } | null;
}

export function useOperacaoRecebimento({ operacaoId, clienteId, versao, onVersaoChange, onStatusChange, onEntregaChange, enabled }: Params): RecebimentoApi {
  const [lotes, setLotes] = useState<LoteRecebimento[]>([]);
  const [movimentacoes, setMovimentacoes] = useState<MovimentacaoOC[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  const carregar = useCallback(async () => {
    if (!enabled || !operacaoId) { setLotes([]); setMovimentacoes([]); return; }
    setLoading(true);
    try {
      const [rec, mov] = await Promise.all([
        (supabase as any).from('vw_oc_lotes_recebimento').select('*').eq('operacao_id', operacaoId).order('ordem'),
        (supabase as any).from('zoo_operacao_movimentacoes')
          .select('id, operacao_lote_id, lancamentos(data, categoria, quantidade, peso_medio_kg, cancelado)')
          .eq('operacao_id', operacaoId),
      ]);
      if (rec.error) throw new Error(rec.error.message);
      if (mov.error) throw new Error(mov.error.message);
      setLotes(((rec.data ?? []) as LoteRecRow[]).map(r => ({
        loteId: r.lote_id, ordem: r.ordem, categoria: r.categoria_negociada,
        qtdNegociada: r.qtd_negociada, qtdRecebida: r.qtd_recebida, diferenca: r.diferenca, estado: r.estado_recebimento,
        pesoMedioNegociadoKg: r.peso_medio_negociado_kg ?? null,
      })));
      setMovimentacoes(((mov.data ?? []) as MovRow[]).map(m => ({
        id: m.id, loteId: m.operacao_lote_id,
        data: m.lancamentos?.data ?? '',
        categoria: m.lancamentos?.categoria ?? null,
        quantidade: m.lancamentos?.quantidade ?? 0,
        pesoMedio: m.lancamentos?.peso_medio_kg ?? null,
        cancelado: m.lancamentos?.cancelado ?? false,
      })));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Falha ao carregar recebimento.');
    } finally {
      setLoading(false);
    }
  }, [enabled, operacaoId]);

  useEffect(() => { carregar(); }, [carregar]);

  const guardOp = (): boolean => {
    if (!operacaoId || !clienteId) { toast.error('Operação não iniciada.'); return false; }
    return true;
  };

  // Retorna true/false (permite encadear após salvar). `versaoOverride`: usa a versão fresca vinda
  //   do salvar (evita conflito de lock otimista); ausente → versão atual. `silent`: só controla toast.
  //   RPC/payload inalterados além da versão oficial enviada.
  const concluirNegociacao = useCallback(async (opts?: { versaoOverride?: number; silent?: boolean }): Promise<boolean> => {
    if (!guardOp()) return false;
    setSaving(true);
    try {
      const { data, error } = await (supabase as any).rpc('oc_confirmar', {
        p_operacao_id: operacaoId, p_cliente_id: clienteId, p_versao_esperada: opts?.versaoOverride ?? versao,
      });
      if (error) throw new Error(error.message);
      if (data?.versao != null) onVersaoChange(data.versao);
      if (data?.status_comercial && onStatusChange) onStatusChange(data.status_comercial);
      if (!opts?.silent) toast.success('Negociação concluída (fechada).');
      await carregar();
      return true;
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Falha ao concluir negociação.');
      return false;
    } finally { setSaving(false); }
  }, [operacaoId, clienteId, versao, onVersaoChange, onStatusChange, carregar]);

  const receberTodos = useCallback(async () => {
    if (!guardOp()) return;
    // Recebe SEMPRE o saldo pendente por lote (diferenca > 0): inclui parciais, nunca repete o
    // que já foi recebido; ignora lotes completos (diferenca=0) ou excedentes (diferenca<0).
    const itens = lotes
      .filter(l => l.diferenca > 0)
      .map(l => ({ lote_id: l.loteId, categoria: l.categoria, quantidade: l.diferenca }));
    if (itens.length === 0) { toast.info('Nenhum saldo pendente para receber conforme negociado.'); return; }
    setSaving(true);
    try {
      const { data, error } = await (supabase as any).rpc('oc_receber_lotes', {
        p_operacao_id: operacaoId, p_cliente_id: clienteId, p_versao_esperada: versao, p_recebimentos: itens,
      });
      if (error) throw new Error(error.message);
      if (data?.versao != null) onVersaoChange(data.versao);
      toast.success(`Recebido conforme negociado — ${data?.recebidos ?? itens.length} lote(s).`);
      await carregar();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Falha ao receber conforme negociado.');
    } finally { setSaving(false); }
  }, [lotes, operacaoId, clienteId, versao, onVersaoChange, carregar]);

  const registrar = useCallback(async (loteId: string, dados: RegistroRecebimento) => {
    if (!guardOp()) return;
    setSaving(true);
    try {
      const { error } = await (supabase as any).rpc('oc_registrar_movimentacao', {
        p_operacao_id: operacaoId, p_cliente_id: clienteId, p_lote_id: loteId,
        p_data: dados.data, p_categoria: dados.categoria, p_quantidade: dados.quantidade,
        p_peso_medio_kg: dados.pesoMedio, p_peso_total_kg: null, p_observacao: dados.observacao || null,
      });
      if (error) throw new Error(error.message);
      toast.success('Recebimento registrado.');
      await carregar();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Falha ao registrar recebimento.');
    } finally { setSaving(false); }
  }, [operacaoId, clienteId, carregar]);

  const estornar = useCallback(async (movimentacaoId: string, motivo: string) => {
    if (!guardOp()) return;
    setSaving(true);
    try {
      const { error } = await (supabase as any).rpc('oc_estornar_movimentacao', {
        p_movimentacao_id: movimentacaoId, p_cliente_id: clienteId, p_motivo: motivo || null,
      });
      if (error) throw new Error(error.message);
      toast.success('Movimentação estornada.');
      await carregar();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Falha ao estornar.');
    } finally { setSaving(false); }
  }, [operacaoId, clienteId, carregar]);

  const encerrar = useCallback(async (motivo: string) => {
    if (!guardOp()) return;
    setSaving(true);
    try {
      const { data, error } = await (supabase as any).rpc('oc_encerrar_entrega', {
        p_operacao_id: operacaoId, p_cliente_id: clienteId, p_versao_esperada: versao, p_motivo: motivo || null,
      });
      if (error) throw new Error(error.message);
      if (data?.versao != null) onVersaoChange(data.versao);
      if (onEntregaChange) onEntregaChange(true);
      toast.success('Recebimento encerrado.');
      await carregar();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Falha ao encerrar recebimento.');
    } finally { setSaving(false); }
  }, [operacaoId, clienteId, versao, onVersaoChange, onEntregaChange, carregar]);

  // PR-OC-REABRIR-ENTREGA-UI-01 — reabertura AUDITADA da entrega (oc_reabrir_entrega). Motivo obrigatório;
  //   versão EXPLÍCITA (sem fallback inventado). Sucesso: propaga operacao_versao + entrega aberta e recarrega.
  //   40001 (conflito de versão): recarrega os dados antes de encerrar o fluxo. NÃO altera status_comercial.
  const reabrir = useCallback(async (motivo: string) => {
    if (!operacaoId || !clienteId) { toast.error('Operação não iniciada.'); return; }
    if (versao == null) { toast.error('Versão da operação indisponível.'); return; }
    const m = motivo.trim();
    if (m === '') { toast.error('Informe o motivo da reabertura.'); return; }
    setSaving(true);
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any).rpc('oc_reabrir_entrega', {
        p_operacao_id: operacaoId, p_cliente_id: clienteId, p_versao_esperada: versao, p_motivo: m,
      });
      if (error) {
        if (error.code === '40001') await carregar();   // conflito de versão: sincroniza antes de sair
        throw new Error(error.message);
      }
      if (data?.operacao_versao != null) onVersaoChange(data.operacao_versao);
      if (onEntregaChange) onEntregaChange(false);
      toast.success('Recebimento reaberto.');
      await carregar();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Falha ao reabrir recebimento.');
    } finally { setSaving(false); }
  }, [operacaoId, clienteId, versao, onVersaoChange, onEntregaChange, carregar]);

  /* ESTORNO TOTAL — desfaz TODAS as movimentacoes de recebimento da operacao.
     E o unico caminho para renegociar lotes de uma compra ja recebida:
     `oc_salvar_lotes` recusa com "Operacao com movimentacao de recebimento" e o
     guard e legitimo. Sem esta funcao, a operacao ficava sem saida pela UI.

     ⚠ A ORDEM DEPOIS DO SUCESSO NAO E ARBITRARIA:
       1. cache zootecnico dos anos afetados — ANTES de propagar versao, para que
          quem recarregar ja leia numero coerente;
       2. versao nova;
       3. entrega REABERTA (o estorno sempre reabre);
       4. recarregar o proprio painel.
     ⚠ `fn_zoot_cache_rebuild` recebe CLIENTE e ANO, nao fazenda, e itera as
     fazendas internamente. Por isso percorre-se `anos_afetados` e NAO
     `fazendas_afetadas` — iterar fazenda chamaria a funcao N vezes para o mesmo
     trabalho. Custo medido no maior cliente da base: ~850 ms por ano.
     ⚠ FALHA NO REBUILD NAO REVERTE NADA: o estorno ja esta commitado no banco, e
     um `throw` aqui deixaria a UI mentindo sobre o que aconteceu. Avisa-se que os
     indicadores podem estar defasados e segue-se — o dado esta certo, a leitura
     derivada e' que pode estar velha. */
  const estornarTudo = useCallback(async (motivo: string): Promise<boolean> => {
    if (!operacaoId || !clienteId) { toast.error('Operação não iniciada.'); return false; }
    if (versao == null) { toast.error('Versão da operação indisponível.'); return false; }
    const m = motivo.trim();
    if (m === '') { toast.error('Informe o motivo do estorno.'); return false; }
    setSaving(true);
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any).rpc('oc_estornar_recebimento', {
        p_operacao_id: operacaoId, p_cliente_id: clienteId, p_versao_esperada: versao, p_motivo: m,
      });
      if (error) {
        if (error.code === '40001') {
          await carregar();
          throw new Error('A operação mudou enquanto você trabalhava. Recarregue e tente de novo.');
        }
        const bruto = error.message ?? '';
        if (/nao possui recebimento ativo|não possui recebimento ativo/i.test(bruto)) {
          throw new Error('A operação não possui recebimento ativo para estornar.');
        }
        if (/cancelada/i.test(bruto)) {
          throw new Error('Operação cancelada: o estorno exige reabertura administrativa.');
        }
        throw new Error(bruto || 'Falha ao estornar recebimento.');
      }

      const anos: number[] = Array.isArray(data?.anos_afetados) ? data.anos_afetados : [];
      let rebuildOk = true;
      for (const ano of anos) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { error: eRb } = await (supabase as any).rpc('fn_zoot_cache_rebuild', {
          p_cliente_id: clienteId, p_ano: ano,
        });
        if (eRb) rebuildOk = false;
      }

      if (data?.operacao_versao != null) onVersaoChange(data.operacao_versao);
      if (onEntregaChange) onEntregaChange(false);

      const qtdMov = data?.movimentacoes_estornadas ?? 0;
      const qtdCab = data?.quantidade_estornada ?? 0;
      toast.success(`Recebimento estornado: ${qtdMov} movimentação(ões), ${qtdCab} cabeça(s).`);
      if (!rebuildOk) {
        toast.warning('Estorno concluído, mas o recálculo de indicadores falhou — eles podem estar defasados.');
      }
      await carregar();
      return true;
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Falha ao estornar recebimento.');
      return false;
    } finally { setSaving(false); }
  }, [operacaoId, clienteId, versao, onVersaoChange, onEntregaChange, carregar]);

  return useMemo(() => ({
    lotes, movimentacoes, loading, saving,
    concluirNegociacao, receberTodos, registrar, estornar, encerrar, reabrir, estornarTudo,
  }), [lotes, movimentacoes, loading, saving, concluirNegociacao, receberTodos, registrar, estornar, encerrar, reabrir, estornarTudo]);
}
