/**
 * CONC-SUGESTOES-V2 — REGRA DE FINANCIAMENTO (b) e ADIANTAMENTO (Gabriel 26/11 07:07 / 07:09) no "Casar com o banco".
 *
 * Levados = a PARCELA inteira (a amortização e os juros da MESMA parcela) e o banco pagou outro valor → o modal PERGUNTA o motivo:
 *   · Ajuste de juros (PADRÃO) — os juros absorvem a diferença ("juros previsto X → pago Y (Δ)"); o principal não muda. O mesmo gravador
 *     de sempre (`fn_espelho_casar` grava o valor de cada item no lançamento; o "antes" fica para o desfazer).
 *   · Multa/juros de atraso — só quando o banco pagou A MAIS: os valores ficam os previstos e a diferença vai pelo "Conciliar com
 *     diferença" de hoje (criar a diferença), nunca por cima dos juros.
 *   · Desconto/bônus — só quando o banco pagou A MENOS: os juros absorvem como no ajuste, e o MOTIVO fica gravado (lote 114420).
 * ADIANTAMENTO (o banco pagou ANTES do vencimento): pergunta também se é a parcela inteira ou uma AMORTIZAÇÃO PARCIAL. Parcial = só a
 *   amortização, com o valor dela, e o "Conciliar com diferença" de hoje liga com falta (o resto da parcela segue em aberto).
 * ⚠ A TELA NÃO SOMA SALDO NEM DECIDE O QUE É PAGO: só escolhe o valor de cada item e a pergunta; quem grava é o dono.
 */
export type PapelNaParcela = 'amortizacao' | 'juros';
export interface ParcelaDoLancamento {
  parcelaId: string; papel: PapelNaParcela; vencimento: string | null; rotulo: string | null;
  /** a parcela tem lançamento de amortização (falso = CARÊNCIA: só os juros, principal 0 — o FCO 1/12) */
  temAmortizacao: boolean;
}

export type MotivoDoAjuste = 'ajuste_juros' | 'juros_atraso' | 'bonus';
export type ModoDaParcela = 'inteira' | 'parcial';

export const ROTULO_DO_MOTIVO: Record<MotivoDoAjuste, string> = {
  ajuste_juros: 'Ajuste de juros', juros_atraso: 'Multa/juros de atraso', bonus: 'Desconto/bônus',
};

/**
 * A parcela INTEIRA entre os levados: a amortização e os juros da MESMA parcela (nada mais) — ou, na CARÊNCIA (sem amortização), só os
 * juros dela. `amortizacaoId` nulo = carência.
 */
export function parDaParcela(ids: readonly string[], mapa: ReadonlyMap<string, ParcelaDoLancamento> | null):
  { parcelaId: string; amortizacaoId: string | null; jurosId: string; vencimento: string | null; rotulo: string | null } | null {
  if (!mapa) return null;
  if (ids.length === 1) {
    const p = mapa.get(ids[0]);
    return p && p.papel === 'juros' && !p.temAmortizacao
      ? { parcelaId: p.parcelaId, amortizacaoId: null, jurosId: ids[0], vencimento: p.vencimento, rotulo: p.rotulo } : null;
  }
  if (ids.length !== 2) return null;
  const pa = mapa.get(ids[0]); const pb = mapa.get(ids[1]);
  if (!pa || !pb || pa.parcelaId !== pb.parcelaId || pa.papel === pb.papel) return null;
  const amPrimeiro = pa.papel === 'amortizacao';
  const am = amPrimeiro ? pa : pb;
  const ju = amPrimeiro ? pb : pa;
  return { parcelaId: am.parcelaId, amortizacaoId: amPrimeiro ? ids[0] : ids[1], jurosId: amPrimeiro ? ids[1] : ids[0],
    vencimento: am.vencimento ?? ju.vencimento, rotulo: am.rotulo };
}

/** As opções do motivo: o padrão sempre; atraso só pagando a mais; bônus só pagando a menos. `pagouAMais` = o banco > a parcela. */
export function opcoesDoMotivo(pagouAMais: boolean): MotivoDoAjuste[] {
  return pagouAMais ? ['ajuste_juros', 'juros_atraso'] : ['ajuste_juros', 'bonus'];
}

/** Adiantado = o banco pagou antes do vencimento da parcela. */
export const pagoAdiantado = (dataDoExtrato: string | null, vencimento: string | null): boolean =>
  !!dataDoExtrato && !!vencimento && dataDoExtrato < vencimento;

const cent = (v: number) => Math.round(v * 100);

/**
 * Os juros que fecham a parcela com o banco: |banco| − amortização. Nulo quando ficariam zerados ou negativos (o banco pagou menos que o
 * principal: aí não é ajuste de juros — é amortização parcial).
 */
export function jurosQueFecham(valorDoExtrato: number, amortizacao: number): number | null {
  const j = cent(Math.abs(valorDoExtrato)) - cent(Math.abs(amortizacao));
  return j > 0 ? j / 100 : null;
}

const brl = (v: number) => Math.abs(v).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** "juros previsto 17.484,93 → pago 16.831,69 (−653,24)" — a frase do Gabriel (D1 07:00). */
export function fraseDoAjuste(jurosPrevisto: number, jurosPago: number): string {
  const d = (cent(Math.abs(jurosPago)) - cent(Math.abs(jurosPrevisto))) / 100;
  return `juros previsto ${brl(jurosPrevisto)} → pago ${brl(jurosPago)} (${d < 0 ? '−' : '+'}${brl(d)})`;
}
