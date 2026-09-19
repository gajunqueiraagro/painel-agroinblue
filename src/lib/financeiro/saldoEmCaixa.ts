/**
 * SALDO EM CAIXA — âncora conciliada + roll-forward. PR-CPR-2A.1.
 *
 * ⚠ ELE NASCE DE UM NÚMERO FANTASMA. A primeira versão do card somava, de cada conta, o saldo
 * do seu MAIOR `ano_mes`. Como as contas fecham em meses diferentes, a soma misturava
 * competências e não correspondia a data nenhuma: na Vera (19/09/2026) dava R$ 462.109,65 —
 * Itaú Personalite de setembro (155.746,78) mais Itaú CDI de AGOSTO (305.208,79), quando o CDI
 * já havia caído para ~100 mil em setembro. Um saldo que nunca existiu, em nenhum dia.
 *
 * A REGRA, para cada conta: partir do último mês que de fato CONCILIA e somar os realizados
 * desde aquela posição até hoje. Nunca somar meses diferentes.
 *
 * ⚠ AS DUAS RÉGUAS SÃO EMPRESTADAS, NÃO REESCRITAS — é o ponto do PR. `movimentoNaConta` (a
 * perna de destino entra positiva; sem `sinal` legível o tipo responde) e `saldoConfere`
 * (tolerância ZERO em centavos) já são as réguas da Conciliação. Reescrevê-las aqui daria duas
 * respostas para "esta conta fecha?" — que é exatamente como o card antigo nasceu errado.
 */
import { fimDoMes, movimentoNaConta, type LinhaDaPosicao } from '@/hooks/useExtratoDaConta';
import { roundCurrency, saldoConfere } from '@/lib/financeiro/conciliacaoCalc';

/** A linha de saldo declarado de uma conta num mês. */
export interface SaldoMesConta {
  conta_bancaria_id: string | null;
  ano_mes: string | null;
  saldo_inicial: number | null;
  saldo_final: number | null;
  /**
   * ⚠ A POSIÇÃO DECLARADA, e ela MANDA sobre o fim do mês. Nulo significa "fim do mês", que é o
   * que as linhas antigas dizem — inventar uma data para elas seria afirmar uma conferência que
   * ninguém fez. É a mesma leitura de `useSaldoGerencialDoMes.posicaoEm`.
   */
  saldo_data: string | null;
}

export interface AncoraDaConta {
  contaId: string;
  anoMes: string;
  /** `YYYY-MM-DD` — a data até a qual esta conta está conferida. */
  data: string;
  valor: number;
}

/** O fim do mês de um `YYYY-MM`. */
export function fimDoAnoMes(anoMes: string): string {
  return fimDoMes(Number(anoMes.slice(0, 4)), Number(anoMes.slice(5, 7)));
}

/** A posição de uma linha de saldo: a declarada, ou o fim do mês por omissão. */
export function posicaoDoSaldo(s: SaldoMesConta): string {
  return s.saldo_data ?? fimDoAnoMes(s.ano_mes ?? '');
}

/**
 * A ÂNCORA DE UMA CONTA: o mês mais recente cujo saldo declarado FECHA na sua posição.
 *
 * ⚠ O TESTE É "ATÉ A POSIÇÃO", NÃO "O MÊS INTEIRO", e a diferença é observável. Na Vera, o Itaú
 * Personalite declarou 155.746,78 com posição em 17/09: somando o mês inteiro a diferença é de
 * 58.809,06 (há lançamentos de 18/09 em diante) e o mês pareceria NÃO conciliado; somando até
 * 17/09 a diferença é ZERO. Recusar essa âncora jogaria fora a conferência mais recente que o
 * operador fez.
 * ⚠ E OS DOIS CAMINHOS CONVERGEM quando a cadeia está sã — medido: âncora 31/08 mais setembro
 * inteiro e âncora 17/09 mais o que veio depois dão o MESMO 96.937,72. É o que se espera de um
 * roll-forward que não reconta nada; se divergirem, a cadeia de saldos é que está quebrada.
 *
 * `null` quando nenhum mês da janela fecha — a conta não tem de onde partir, e isso se REPORTA,
 * nunca se substitui pelo saldo mais recente "porque é o que há".
 */
export function ancoraDaConta(
  contaId: string,
  saldos: readonly SaldoMesConta[],
  linhas: readonly LinhaDaPosicao[],
  mesMinimo: string,
): AncoraDaConta | null {
  const candidatos = saldos
    .filter((s) => s.conta_bancaria_id === contaId && s.saldo_final != null
      && (s.ano_mes ?? '') >= mesMinimo)
    .sort((a, b) => ((b.ano_mes ?? '') < (a.ano_mes ?? '') ? -1 : 1));

  for (const s of candidatos) {
    const anoMes = s.ano_mes ?? '';
    const posicao = posicaoDoSaldo(s);
    let movimento = 0;
    for (const l of linhas) {
      const d = (l.data_pagamento ?? '').slice(0, 10);
      /* Sem data de pagamento a linha não tem posição no tempo e não entra em soma nenhuma —
         a mesma decisão de `somarAtePosicao`. */
      if (!d || d.slice(0, 7) !== anoMes || d > posicao) continue;
      if (l.conta_bancaria_id !== contaId && l.conta_destino_id !== contaId) continue;
      movimento += movimentoNaConta(l, contaId);
    }
    const calculado = roundCurrency(Number(s.saldo_inicial ?? 0) + movimento);
    if (saldoConfere(Number(s.saldo_final) - calculado)) {
      return { contaId, anoMes, data: posicao, valor: roundCurrency(Number(s.saldo_final)) };
    }
  }
  return null;
}

/** Âncora + realizados de `(ancora.data, hoje]`. */
export function estimarSaldoDaConta(
  ancora: AncoraDaConta,
  linhas: readonly LinhaDaPosicao[],
  hoje: string,
): number {
  let movimento = 0;
  for (const l of linhas) {
    const d = (l.data_pagamento ?? '').slice(0, 10);
    if (!d || d <= ancora.data || d > hoje) continue;
    if (l.conta_bancaria_id !== ancora.contaId && l.conta_destino_id !== ancora.contaId) continue;
    movimento += movimentoNaConta(l, ancora.contaId);
  }
  return roundCurrency(ancora.valor + movimento);
}

export interface ContaEmCaixa {
  id: string;
  nome: string;
}

export interface SaldoEmCaixa {
  /** A soma das contas que TÊM âncora. */
  total: number;
  /** A posição conciliada mais atrasada — o elo fraco. `null` quando nenhuma conta ancorou. */
  ancoraMaisAtrasada: string | null;
  /** As contas presas nessa posição mais atrasada, para o aviso poder nomeá-las. */
  contasNoEloFraco: string[];
  /** Contas sem nenhum mês que feche na janela — ficam FORA do total, e por isso são nomeadas. */
  semAncora: string[];
  /** Quantas contas entraram no total. */
  ancoradas: number;
}

/**
 * O saldo em caixa do cliente.
 *
 * ⚠ CONTA SEM ÂNCORA FICA DE FORA E É NOMEADA. A alternativa seria usar o saldo mais recente
 * dela assim mesmo — e aí o total voltaria a misturar competências pela porta dos fundos, que é
 * o defeito que este módulo existe para fechar. Um total menor e declarado é honesto; um total
 * "completo" com uma parcela inventada não é.
 */
export function estimarSaldoEmCaixa(entrada: {
  contas: readonly ContaEmCaixa[];
  saldos: readonly SaldoMesConta[];
  linhas: readonly LinhaDaPosicao[];
  hoje: string;
  mesMinimo: string;
}): SaldoEmCaixa {
  const { contas, saldos, linhas, hoje, mesMinimo } = entrada;
  let total = 0;
  let ancoradas = 0;
  const semAncora: string[] = [];
  const porConta: { nome: string; data: string }[] = [];

  for (const c of contas) {
    const ancora = ancoraDaConta(c.id, saldos, linhas, mesMinimo);
    if (!ancora) { semAncora.push(c.nome); continue; }
    total = roundCurrency(total + estimarSaldoDaConta(ancora, linhas, hoje));
    ancoradas += 1;
    porConta.push({ nome: c.nome, data: ancora.data });
  }

  if (porConta.length === 0) {
    return { total: 0, ancoraMaisAtrasada: null, contasNoEloFraco: [], semAncora, ancoradas: 0 };
  }
  const maisAtrasada = porConta.reduce((m, p) => (p.data < m ? p.data : m), porConta[0].data);
  return {
    total,
    ancoraMaisAtrasada: maisAtrasada,
    contasNoEloFraco: porConta.filter((p) => p.data === maisAtrasada).map((p) => p.nome),
    semAncora,
    ancoradas,
  };
}
