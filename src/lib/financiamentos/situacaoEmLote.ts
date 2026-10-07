/**
 * A SITUAÇÃO DOS CONTRATOS DE UM CLIENTE, EM LOTE — PARC-FECHA-02 item 2.
 *
 * `fn_financiamentos_situacao_lote` devolve `{ <financiamento_id>: <retorno de fn_financiamento_situacao> }`: a MESMA leitura da
 * tela do contrato, contrato a contrato. Aqui só se LÊ (sem cast) e se dá a FORMA que a lista e os painéis esperavam de
 * `financiamento_parcelas` — com a situação derivada do LANÇAMENTO no lugar da coluna `status`, que ninguém atualiza quando a
 * parcela é paga pelo Financeiro. Parcela cancelada não vem (o dono já a tira).
 * ⚠ SOMAS EM CENTAVOS INTEIROS, num lugar só: a tela não soma.
 */
import { lerSituacaoDoContrato, type SituacaoDoContrato } from './situacaoDoContrato';

export function lerSituacaoEmLote(dado: unknown): Map<string, SituacaoDoContrato> | null {
  if (typeof dado !== 'object' || dado === null || Array.isArray(dado)) return null;
  const mapa = new Map<string, SituacaoDoContrato>();
  for (const [id, bruto] of Object.entries(dado)) {
    const lido = lerSituacaoDoContrato(bruto);
    if (!lido) return null;       // uma peça torta invalida o lote inteiro: nunca um número pela metade
    mapa.set(id, lido);
  }
  return mapa;
}

/** A parcela na forma que os painéis liam de `financiamento_parcelas`; `status` é a situação do DONO ('pago' só com a parcela paga). */
export interface ParcelaDoLote {
  id: string; financiamento_id: string; numero_parcela: number | null;
  data_vencimento: string | null; data_pagamento: string | null;
  valor_principal: number; valor_juros: number; status: 'pago' | 'pendente';
}
export function parcelasDoLote(lote: ReadonlyMap<string, SituacaoDoContrato>): ParcelaDoLote[] {
  const linhas: ParcelaDoLote[] = [];
  for (const [financiamentoId, s] of lote) {
    for (const p of s.parcelas) {
      const paga = p.situacao === 'paga';
      linhas.push({
        id: p.id, financiamento_id: financiamentoId, numero_parcela: p.numero, data_vencimento: p.dataVencimento,
        data_pagamento: paga ? p.pagoEm : null, valor_principal: p.valorPrincipal, valor_juros: p.valorJuros, status: paga ? 'pago' : 'pendente',
      });
    }
  }
  return linhas;
}

const cent = (v: number) => Math.round(v * 100);

/** O que a LINHA de um contrato mostra na lista — tudo do dono, em reais já fechados em centavos. */
export interface ResumoDoContratoNaLista {
  parcelasPagas: number; totalPendente: number; jurosPendente: number; proxVencimento: string | null; valorDaProxParcela: number | null;
}
export function resumoDoContratoNaLista(s: SituacaoDoContrato | undefined): ResumoDoContratoNaLista {
  if (!s) return { parcelasPagas: 0, totalPendente: 0, jurosPendente: 0, proxVencimento: null, valorDaProxParcela: null };
  const abertas = s.parcelas.filter((p) => p.situacao !== 'paga');
  let jurosCent = 0;
  for (const p of abertas) jurosCent += cent(p.valorJuros);
  let prox: (typeof abertas)[number] | null = null;
  for (const p of abertas) if (p.dataVencimento && (!prox?.dataVencimento || p.dataVencimento < prox.dataVencimento)) prox = p;
  return {
    parcelasPagas: s.cartoes.pagas,
    /* o "em aberto" É o do contrato: a vencer + vencido, os dois cartões do dono (a parcial entra só pelo que falta) */
    totalPendente: (cent(s.cartoes.aVencer) + cent(s.cartoes.vencido)) / 100,
    jurosPendente: jurosCent / 100,
    proxVencimento: prox?.dataVencimento ?? null,
    valorDaProxParcela: prox ? prox.valorTotal : null,
  };
}

/** Os totais dos cartões do topo da lista, sobre as linhas que o filtro deixou — em centavos, aqui e só aqui. */
export function totaisDaLista(linhas: readonly { total_pendente: number; juros_pendente: number }[]): { principalAberto: number; jurosAVencer: number; aPagar: number } {
  let total = 0; let juros = 0;
  for (const l of linhas) { total += cent(l.total_pendente); juros += cent(l.juros_pendente); }
  return { principalAberto: (total - juros) / 100, jurosAVencer: juros / 100, aPagar: total / 100 };
}
