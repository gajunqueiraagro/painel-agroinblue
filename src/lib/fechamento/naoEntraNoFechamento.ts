/**
 * REBANHO-SEM-GADO-01 (Gabriel 27/11, "já pedi 1000 vezes") — QUEM ENTRA NO FECHAMENTO DO REBANHO de um mês. A regra mora no BANCO
 * (`_fn_fazenda_rebanho_no_mes`, lida por `_fn_status_pilares_fechamento`, 118940): a fazenda entra se, naquele mês, tiver pasto cadastrado
 * (vigente) OU saldo de rebanho > 0 OU movimentação de rebanho. Sem nada disso, o banco devolve os dois pilares 'nao_aplicavel' — e é por
 * esse sinal, só por ele, que a tela tira a fazenda da faixa, do modal e da contagem "Rebanho N/M". A marca `tem_pecuaria` NÃO decide.
 * Zerou o gado e não tem pasto → sai no mês seguinte; voltou gado → volta sozinha (o banco vê a movimentação).
 */
import type { StatusPilar } from '@/hooks/useStatusPilares';

/** O banco disse "sem rebanho neste mês": os dois pilares 'nao_aplicavel'. */
export const semRebanhoNoMes = (f: { p1: StatusPilar; p2: StatusPilar }): boolean => f.p1 === 'nao_aplicavel' && f.p2 === 'nao_aplicavel';

/** Só as fazendas que entram no fechamento do mês (a ordem de chegada se mantém). */
export const doFechamento = <T extends { p1: StatusPilar; p2: StatusPilar }>(status: readonly T[]): T[] => status.filter((f) => !semRebanhoNoMes(f));
