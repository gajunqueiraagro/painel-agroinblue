/**
 * OS TOTAIS DA LISTA DO FINANCEIRO V2 — caixa de um lado, sem caixa do outro (OC-VENDA-ENTREGAS-01b, D2).
 *
 * ⚠ NADA E' CONTADO DUAS VEZES. "Entradas" e "Saidas" sao SO' CAIXA; o que tem `sem_movimentacao_caixa` (entrega da conta
 *   corrente, barter, consumo, funrural) vai para "Receita sem caixa" / "Despesa sem caixa". A soma dos quatro e' a soma de
 *   antes. Transferencia continua no terceiro balde, fora dos dois (PR-V2-TRANSF-DESTINO-01).
 * ⚠ `null` CONTA COMO CAIXA — e' o que o campo sempre significou na lista; a RPC `fn_lista_v2_totais` faz o mesmo.
 * ⚠ O SENTIDO CONTINUA SAINDO DA CONTA EM FOCO (`sentidoNaConta`), como antes: esta funcao so' acrescenta o eixo do caixa.
 */
import { sentidoNaConta, type LancamentoDirecional } from './sinalPorConta';

export interface LinhaTotalizavel extends LancamentoDirecional {
  valor: number;
  sem_movimentacao_caixa?: boolean | null;
}

export interface TotaisDaListaV2 {
  entradas: number;
  saidas: number;
  transferencias: number;
  entradasSemCaixa: number;
  saidasSemCaixa: number;
}

export function totaisDaListaV2(linhas: readonly LinhaTotalizavel[], foco: string | null): TotaisDaListaV2 {
  const acc: TotaisDaListaV2 = { entradas: 0, saidas: 0, transferencias: 0, entradasSemCaixa: 0, saidasSemCaixa: 0 };
  for (const l of linhas) {
    const s = sentidoNaConta(l, foco);
    const v = Math.abs(l.valor);
    const semCaixa = l.sem_movimentacao_caixa === true;
    if (s === 'entrada') { if (semCaixa) acc.entradasSemCaixa += v; else acc.entradas += v; }
    else if (s === 'saida') { if (semCaixa) acc.saidasSemCaixa += v; else acc.saidas += v; }
    else acc.transferencias += v;
  }
  return acc;
}

/**
 * "Tipo" e "Vai para" da linha (mock v4): a entrega da conta corrente vai para o DRE e nao para o caixa; o recebimento vai
 * para o caixa e nao para o DRE. Demais lancamentos: sem caixa vai so' para o DRE; com caixa, para o caixa (e para o DRE
 * quando a conta compoe o DRE).
 */
export type TipoDaLinha = 'Entrega' | 'Recebimento' | 'Pagamento' | 'Sem caixa' | 'Lançamento';

export function tipoDaLinha(l: { origem_tipo?: string | null; subcentro?: string | null; sem_movimentacao_caixa?: boolean | null }): TipoDaLinha {
  if (l.origem_tipo === 'oc:entrega') return 'Entrega';
  if (l.subcentro === 'Adiantamento de Clientes') return 'Recebimento';
  if (l.subcentro === 'Adiantamento a Fornecedores') return 'Pagamento';
  if (l.sem_movimentacao_caixa === true) return 'Sem caixa';
  return 'Lançamento';
}

export function vaiParaDaLinha(l: { sem_movimentacao_caixa?: boolean | null; compoe_dre?: boolean | null }): string {
  if (l.sem_movimentacao_caixa === true) return l.compoe_dre === false ? '—' : 'DRE';
  return l.compoe_dre === true ? 'Caixa e DRE' : 'Caixa';
}
