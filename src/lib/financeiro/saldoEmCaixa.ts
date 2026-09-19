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

/**
 * ONDE CADA TIPO DE CONTA ENTRA NO CAIXA — PR-CPR-2A.2.
 *
 * ⚠ PERMUTA É DINHEIRO DE VERDADE, e a 2A.1 a deixava de fora. A cooperativa devolveu o
 * excedente do barter para a conta permuta e de lá ele foi transferido para o Sicredi Lavoura:
 * dinheiro que se transfere para conta corrente conta. O que ele NÃO é é dinheiro LIVRE — não
 * paga boleto amanhã —, e por isso vai em "aplicado", ao lado do investimento, em vez de
 * inflar o "disponível".
 * ⚠ CARTÃO CONTINUA FORA, e por definição, não por saldo: é limite, não dinheiro.
 * ⚠ TIPO DESCONHECIDO CAI EM 'fora' — a mesma doutrina da lista branca da 2A.1. Um tipo novo
 * que entrasse no caixa sozinho, em silêncio, é o defeito que se paga caro; ficar de fora é o
 * lado certo para errar num número que decide pagamento.
 */
export type GrupoDeCaixa = 'disponivel' | 'aplicado' | 'fora';

export function grupoDoTipoConta(tipo: string | null | undefined): GrupoDeCaixa {
  const t = (tipo ?? '').trim().toLowerCase();
  if (t === 'cc') return 'disponivel';
  if (t === 'inv' || t === 'permuta') return 'aplicado';
  return 'fora';
}

/**
 * A conta tem extrato bancário para bater?
 *
 * ⚠ É PELO TIPO, E ISSO FOI MEDIDO — a alternativa óbvia é uma armadilha. "Conta sem
 * importação de OFX" parecia o teste estrutural certo, e reprovou na medição: no proto, em
 * 19/09/2026, Bradesco, Santander, Sicredi Pecuária e TODOS os investimentos têm zero OFX e
 * mesmo assim mantêm a cadeia de saldos e conciliam normalmente (80 linhas de saldo cada).
 * Usar o OFX como régua jogaria 18 das 20 contas do NJ na regra sem-extrato e desmontaria a
 * 2A.1 inteira. O que de fato separa a permuta é não ser mantida na cadeia — ela tem UMA linha
 * de saldo contra as 80 das demais —, e `tipo_conta` é a declaração explícita disso.
 */
export function contaSemExtrato(tipo: string | null | undefined): boolean {
  return (tipo ?? '').trim().toLowerCase() === 'permuta';
}

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

/**
 * A ÂNCORA DE UMA CONTA SEM EXTRATO — o último saldo declarado, SEM teste de conciliação.
 *
 * ⚠ NÃO HÁ EXTRATO A BATER, então exigir que o mês "feche" descartaria a conta inteira — e a
 * 2A.1 fazia exatamente isso com a permuta. Conciliar é confrontar o sistema com o banco;
 * onde não há banco, o declarado é a melhor informação que existe e vale como âncora.
 * ⚠ `null` só quando não há saldo declarado NENHUM — e aí a conta é nomeada, nunca chutada.
 */
export function ancoraSemExtrato(
  contaId: string, saldos: readonly SaldoMesConta[],
): AncoraDaConta | null {
  const recente = saldos
    .filter((s) => s.conta_bancaria_id === contaId && s.saldo_final != null)
    .sort((a, b) => ((b.ano_mes ?? '') < (a.ano_mes ?? '') ? -1 : 1))[0];
  if (!recente) return null;
  return {
    contaId,
    anoMes: recente.ano_mes ?? '',
    data: posicaoDoSaldo(recente),
    valor: roundCurrency(Number(recente.saldo_final)),
  };
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
  tipo: string | null;
  /**
   * O acumulado de TODOS os realizados da conta, de sempre — só para conta SEM extrato.
   *
   * ⚠ ELE NÃO ENTRA NO TOTAL; serve para PERGUNTAR se o saldo declarado explica a conta. A
   * permuta do NJ declara R$ 0,00 em ago/2026 e carrega R$ 264.875,89 de movimentos de barter
   * entre 2023 e 2026 que esse zero não explica. O total usa o declarado (é o que a tela de
   * Saldos mostra, e inventar outro número aqui criaria uma segunda verdade); o que este campo
   * faz é impedir que a divergência fique INVISÍVEL.
   */
  acumuladoRealizados?: number | null;
}

export interface SaldoEmCaixa {
  /** `disponivel + aplicado`. Cartão e tipo desconhecido não entram. */
  total: number;
  /** Conta corrente — o dinheiro que paga boleto amanhã. */
  disponivel: number;
  /** Investimento + permuta — dinheiro que existe e não está livre. */
  aplicado: number;
  /** A posição conciliada mais atrasada — o elo fraco. `null` quando nenhuma conta ancorou. */
  ancoraMaisAtrasada: string | null;
  /** As contas presas nessa posição mais atrasada, para o aviso poder nomeá-las. */
  contasNoEloFraco: string[];
  /** Contas sem nenhum mês que feche na janela — ficam FORA do total, e por isso são nomeadas. */
  semAncora: string[];
  /**
   * Contas cujo número PRECISA de olho humano — entram no total assim mesmo.
   *
   * ⚠ ELAS NÃO SÃO ESCONDIDAS NEM ZERADAS. Saldo de permuta negativo é erro de lançamento (uma
   * transferência ou entrada que não foi lançada), não estado válido; e saldo declarado que não
   * explica os movimentos da conta é a mesma família de defeito, do outro lado do sinal.
   * Ocultar qualquer um dos dois faria a tela mentir para proteger a própria aparência. O
   * conserto do dado é da Conciliação; daqui sai só a visibilidade.
   */
  aConferir: string[];
  /** Quantas contas entraram no total. */
  ancoradas: number;
}

/**
 * O saldo em caixa do cliente, em dois níveis.
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
  let disponivel = 0;
  let aplicado = 0;
  let ancoradas = 0;
  const semAncora: string[] = [];
  const aConferir: string[] = [];
  const porConta: { nome: string; data: string }[] = [];

  for (const c of contas) {
    const grupo = grupoDoTipoConta(c.tipo);
    if (grupo === 'fora') continue;

    const semExtrato = contaSemExtrato(c.tipo);
    const ancora = semExtrato
      ? ancoraSemExtrato(c.id, saldos)
      : ancoraDaConta(c.id, saldos, linhas, mesMinimo);
    if (!ancora) { semAncora.push(c.nome); continue; }

    const valor = estimarSaldoDaConta(ancora, linhas, hoje);
    if (grupo === 'disponivel') disponivel = roundCurrency(disponivel + valor);
    else aplicado = roundCurrency(aplicado + valor);
    ancoradas += 1;
    porConta.push({ nome: c.nome, data: ancora.data });

    /* Negativo é erro de lançamento em QUALQUER conta de caixa, e mais ainda na permuta. */
    if (valor < 0) { aConferir.push(c.nome); continue; }
    /* O declarado explica os movimentos da conta? Só faz sentido perguntar onde não há extrato:
       nas demais, é exatamente isso que a conciliação já respondeu ao fechar o mês. */
    if (semExtrato && c.acumuladoRealizados != null
      && !saldoConfere(Number(c.acumuladoRealizados) - valor)) {
      aConferir.push(c.nome);
    }
  }

  const total = roundCurrency(disponivel + aplicado);
  if (porConta.length === 0) {
    return {
      total, disponivel, aplicado, ancoraMaisAtrasada: null, contasNoEloFraco: [],
      semAncora, aConferir, ancoradas: 0,
    };
  }
  const maisAtrasada = porConta.reduce((m, p) => (p.data < m ? p.data : m), porConta[0].data);
  return {
    total,
    disponivel,
    aplicado,
    ancoraMaisAtrasada: maisAtrasada,
    contasNoEloFraco: porConta.filter((p) => p.data === maisAtrasada).map((p) => p.nome),
    semAncora,
    aConferir,
    ancoradas,
  };
}
