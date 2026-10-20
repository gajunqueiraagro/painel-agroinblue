/**
 * FIN-FINANC-28 · EDITAR = CADASTRO NOVO v2 — as quatro RPCs da edição do contrato de crédito, e a última operação das parcelas (o
 * "Desfazer"). Toda gravação relê as chaves do contrato e avisa o canal de lançamentos (o motor mexeu neles).
 * ⚠ Simular é o padrão (p_simular = true no banco): a tela pede a prévia antes e só grava na confirmação.
 */
import { useCallback, useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { notificarLancamentosMudaram } from '@/hooks/useFinanceiroV2';
import { CHAVES_DO_CONTRATO, lerVinculosDePagamento } from '@/hooks/useContratoDeCredito';
import { CHAVE_SITUACAO_DO_CONTRATO, lerSituacaoDoBanco } from '@/hooks/useSituacaoDoContrato';
import { hojeLocal } from '@/lib/datas/hojeLocal';
import {
  ajustadasDasGravadas, lerResposta, montarParcelasParaEditar, type MudancasDasParcelas, type ParcelaParaEditar, type RespostaDoBanco,
} from '@/lib/financiamentos/edicaoDoContrato';

export type ModoDeRegerar = 'manter_ajustes' | 'recalcular_todas';
export interface UltimaOperacao { id: string; tipo: 'editar' | 'regerar'; feitaEm: string }

const ERRO_FORA = 'Resposta do banco fora do formato.';

/** as parcelas gravadas do contrato (`financiamento_parcelas`), na ordem do número — a MESMA leitura e a MESMA chave
 *  (`financiamento-parcelas`) da tela do contrato: a marca `ajustada` vem daqui */
export async function lerParcelasGravadas(financiamentoId: string) {
  const { data, error } = await supabase.from('financiamento_parcelas').select('*').eq('financiamento_id', financiamentoId).order('numero_parcela');
  if (error) throw error;
  return data ?? [];
}

export function useEdicaoDoContrato(financiamentoId: string | null | undefined, clienteId: string | null | undefined) {
  const qc = useQueryClient();
  const reler = useCallback(() => {
    for (const k of CHAVES_DO_CONTRATO) void qc.invalidateQueries({ queryKey: [k] });
    if (clienteId) notificarLancamentosMudaram(clienteId);
  }, [qc, clienteId]);

  const chamar = useCallback(async (fn: string, args: Record<string, unknown>, simular: boolean): Promise<RespostaDoBanco> => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- idioma documentado: o `.rpc` do repo
    const { data, error } = await (supabase as any).rpc(fn, { ...args, p_simular: simular });
    const r = lerResposta(data, error);
    if (!simular && r && !r.recusa) reler();
    return r ?? { simulado: simular, recusa: ERRO_FORA, corpo: {} };
  }, [reler]);

  const ultima = useQuery({
    queryKey: ['contrato-operacoes-parcelas', financiamentoId],
    enabled: !!financiamentoId,
    queryFn: async (): Promise<UltimaOperacao | null> => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- a tabela nasceu depois do types.ts
      const { data } = await (supabase as any).from('financiamento_parcelas_operacoes').select('id, tipo, feita_em')
        .eq('financiamento_id', financiamentoId).is('desfeita_em', null).order('feita_em', { ascending: false }).limit(1);
      const x = Array.isArray(data) ? data[0] : null;
      return x && typeof x.id === 'string' && (x.tipo === 'editar' || x.tipo === 'regerar') ? { id: x.id, tipo: x.tipo, feitaEm: String(x.feita_em) } : null;
    },
  });

  /* FIN-CONTRATO-CRONOGRAMA-01 — UMA FONTE para as parcelas editáveis: a situação do banco + a marca `ajustada` + os vínculos vivos,
     pelas mesmas chaves da tela do contrato (o cache é o mesmo) e pelo mesmo montador (`montarParcelasParaEditar`). Nula = lendo. */
  const hoje = hojeLocal();
  /* a MESMA chave da tela do contrato (com detalhe); sem a inscrição no canal: quem grava aqui relê as chaves do contrato (`reler`) */
  const situacao = useQuery({ queryKey: [CHAVE_SITUACAO_DO_CONTRATO, financiamentoId, hoje, 'detalhe'], enabled: !!financiamentoId && !!clienteId,
    queryFn: () => lerSituacaoDoBanco(financiamentoId!, hoje, true) });
  const gravadas = useQuery({ queryKey: ['financiamento-parcelas', financiamentoId], enabled: !!financiamentoId, queryFn: () => lerParcelasGravadas(financiamentoId!) });
  const vinculos = useQuery({ queryKey: ['contrato-vinculos-pagamento', financiamentoId], enabled: !!financiamentoId && !!clienteId,
    queryFn: () => lerVinculosDePagamento(financiamentoId!) });
  const parcelas = useMemo((): ParcelaParaEditar[] | null => (situacao.data && gravadas.data
    ? montarParcelasParaEditar(situacao.data.parcelas, ajustadasDasGravadas(gravadas.data), vinculos.data ?? []) : null),
  [situacao.data, gravadas.data, vinculos.data]);

  return {
    parcelas,
    salvarCabecalho: (dados: Record<string, unknown>, simular = true) => chamar('fn_financiamento_salvar_cabecalho', { p_id: financiamentoId, p_dados: dados }, simular),
    editarParcelas: (m: MudancasDasParcelas, simular = true) => chamar('fn_financiamento_parcelas_editar', { p_id: financiamentoId, p_mudancas: m }, simular),
    regerar: (modo: ModoDeRegerar, simular = true) => chamar('fn_financiamento_parcelas_regerar', { p_id: financiamentoId, p_modo: modo }, simular),
    desfazer: (operacaoId: string, motivo: string, simular = true) => chamar('fn_financiamento_parcelas_desfazer', { p_operacao_id: operacaoId, p_motivo: motivo }, simular),
    ultimaOperacao: ultima.data ?? null,
  };
}
