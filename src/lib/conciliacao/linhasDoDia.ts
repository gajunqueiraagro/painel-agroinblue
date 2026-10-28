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

export function linhasDoDia(linhas: readonly LinhaSistemaDono[]): LinhaDoDia[] {
  /* Os dias, na ordem em que o banco os mandou; dentro de cada um, a posição original desempata (ordem estável). */
  const dias = new Map<string, { linha: LinhaSistemaDono; pos: number }[]>();
  linhas.forEach((linha, pos) => {
    const d = diaDe(linha);
    const lista = dias.get(d) ?? [];
    lista.push({ linha, pos });
    dias.set(d, lista);
  });
  const saida: LinhaDoDia[] = [];
  for (const lista of dias.values()) {
    /* O fim do dia NA ORDEM DO BANCO: a de maior posição original. */
    const ultimaDoBanco = lista.reduce((a, b) => (b.pos > a.pos ? b : a));
    const ordenadas = [...lista].sort((a, b) => Math.abs(b.linha.valor) - Math.abs(a.linha.valor) || a.pos - b.pos);
    ordenadas.forEach((x, i) => {
      const fim = i === ordenadas.length - 1;
      saida.push({ linha: x.linha, fimDoDia: fim, saldoDoDia: fim ? ultimaDoBanco.linha.saldo_apos_proprio : null });
    });
  }
  return saida;
}
