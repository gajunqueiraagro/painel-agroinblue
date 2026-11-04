/**
 * VISAO-GERAL-02 — "Conciliação de <mês>: N itens sem casar". A MESMA leitura da Conciliação e da esteira do consultor
 * (`consultaDoResumoMes`, `fn_conciliacao_resumo_mes`, mesmo cache): a linha `total` do mês, extratos do banco sem par no sistema +
 * lançamentos do sistema sem par no extrato. Só a linha total (somar total com as contas contaria duas vezes). Por cliente × mês.
 */
import { useQuery } from '@tanstack/react-query';
import { consultaDoResumoMes } from '@/hooks/useResumoConciliacao';
import type { LinhaResumo } from '@/lib/conciliacao/resumoDoDono';

/** `null` = sem linha total (mês sem conta, ou ainda lendo); número = os dois lados sem par somados. */
export function semCasarDoResumo(linhas: readonly Pick<LinhaResumo, 'nivel' | 'extratos_sem_par' | 'lancamentos_sem_par'>[] | undefined): number | null {
  const total = (linhas ?? []).find((l) => l.nivel === 'total');
  return total ? total.extratos_sem_par.qtde + total.lancamentos_sem_par.qtde : null;
}

export function useConciliacaoSemCasar(clienteId: string | null | undefined, anoMes: string) {
  const { data, isLoading } = useQuery(consultaDoResumoMes(clienteId, anoMes, null));
  return { semCasar: semCasarDoResumo(data), carregando: isLoading };
}
