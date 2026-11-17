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

/** VISAO-GERAL-PENDENCIAS-01 (D1 a, Gabriel 17/11 06:53) — o "N sem casar" da linha total contava o que NUNCA terá extrato (cartão, conta
 *  virtual, conta sem OFX: no NJ de out/26, 63 dos 86). Agora: UMA linha por CONTA COM EXTRATO (`tem_extrato`, o campo que a própria RPC
 *  devolve) com o que sobra sem casar (extratos sem par + lançamentos sem par daquela conta). Conta sem extrato não entra; a Conciliação
 *  continua mostrando tudo. */
export interface ContaSemCasar { contaId: string; nome: string; qtd: number }
export function contasSemCasarDoResumo(
  linhas: readonly Pick<LinhaResumo, 'nivel' | 'conta_id' | 'conta_nome' | 'tem_extrato' | 'extratos_sem_par' | 'lancamentos_sem_par'>[] | undefined,
): ContaSemCasar[] {
  return (linhas ?? [])
    .filter((l) => l.nivel === 'conta' && l.tem_extrato && !!l.conta_id)
    .map((l) => ({ contaId: String(l.conta_id), nome: l.conta_nome, qtd: l.extratos_sem_par.qtde + l.lancamentos_sem_par.qtde }))
    .filter((c) => c.qtd > 0);
}

export function useConciliacaoSemCasar(clienteId: string | null | undefined, anoMes: string) {
  const { data, isLoading } = useQuery(consultaDoResumoMes(clienteId, anoMes, null));
  return { semCasar: semCasarDoResumo(data), contas: contasSemCasarDoResumo(data), carregando: isLoading };
}
