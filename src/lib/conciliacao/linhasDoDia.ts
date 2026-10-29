/**
 * linhasDoDia — P141 (CONC-LAYOUT-01, Gabriel 28/10, D4): a lista do sistema de uma conta no mês, como a tela a mostra.
 *   · Dentro do dia, do MAIOR valor para o menor, pelo valor absoluto (entrada ou saída).
 *   · O saldo aparece SÓ na última linha de cada dia (a regra da CPR de 20/10), com linha divisória entre os dias.
 * ⚠ NADA SE SOMA AQUI: o saldo do dia é o `saldo_apos_proprio` que o BANCO calculou, lido da ÚLTIMA linha do dia NA ORDEM
 *   DO BANCO (`fn_conciliacao_resumo_mes`: data, tipo DESC, extrato_id, lancamento_id) — a mesma leitura de `saldoSistemaNaData`.
 *   Reordenar dentro do dia não muda o fim do dia; os saldos intermediários (que dependem da ordem) deixam de aparecer.
 */
import type { LinhaSistemaDono } from './resumoDoDono';

export interface LinhaDoDia {
  linha: LinhaSistemaDono;
  /** é a última linha do dia na ordem da TELA (leva o saldo e a divisória) */
  fimDoDia: boolean;
  /** o saldo do fim do dia, do banco; nulo nas outras linhas do dia (ou se o dono não o mandou) */
  saldoDoDia: number | null;
}

const diaDe = (l: LinhaSistemaDono): string => (l.data ?? '').slice(0, 10);

/**
 * P159a (CONC-TELAS-01, D1/D2) — A REGRA DO DIA, UMA SÓ, para toda lista do mês por dia: o Extrato (banco), o Extrato do sistema e a
 * ordem dentro do dia da Conferência. Os dias na ordem em que vieram; dentro do dia, do MAIOR valor absoluto para o menor (entrada ou
 * saída, sem separar), a posição original desempatando (ordem estável). Devolve, em cada linha, se ela abre ou fecha o dia NA ORDEM DA
 * TELA, e na que fecha a ÚLTIMA do dia NA ORDEM ORIGINAL — é dela que quem chama lê o saldo do fim do dia (nada se soma aqui).
 */
export interface ItemDoDia<T> {
  item: T;
  dia: string;
  primeiraDoDia: boolean;
  fimDoDia: boolean;
  /** só na que fecha o dia: a última do dia na ordem ORIGINAL (o saldo do fim do dia é o dela) */
  ultimaDoDiaNaOrigem: T | null;
}

export function porDia<T>(itens: readonly T[], dia: (t: T) => string, valor: (t: T) => number): ItemDoDia<T>[] {
  const dias = new Map<string, { item: T; pos: number }[]>();
  itens.forEach((item, pos) => {
    const d = dia(item);
    const lista = dias.get(d) ?? [];
    lista.push({ item, pos });
    dias.set(d, lista);
  });
  const saida: ItemDoDia<T>[] = [];
  for (const [d, lista] of dias) {
    const ultima = lista.reduce((a, b) => (b.pos > a.pos ? b : a));
    const ordenadas = [...lista].sort((a, b) => Math.abs(valor(b.item)) - Math.abs(valor(a.item)) || a.pos - b.pos);
    ordenadas.forEach((x, i) => {
      const fim = i === ordenadas.length - 1;
      saida.push({ item: x.item, dia: d, primeiraDoDia: i === 0, fimDoDia: fim, ultimaDoDiaNaOrigem: fim ? ultima.item : null });
    });
  }
  return saida;
}

export function linhasDoDia(linhas: readonly LinhaSistemaDono[]): LinhaDoDia[] {
  /* O fim do dia NA ORDEM DO BANCO: a de maior posição original (`porDia`). */
  return porDia(linhas, diaDe, (l) => l.valor).map((x) => ({
    linha: x.item, fimDoDia: x.fimDoDia, saldoDoDia: x.ultimaDoDiaNaOrigem ? x.ultimaDoDiaNaOrigem.saldo_apos_proprio : null,
  }));
}
