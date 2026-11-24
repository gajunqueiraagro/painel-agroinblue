/**
 * REBANHO-ORGAO-01 (F2) — os tipos e a régua de IDADE da declaração do rebanho ao órgão estadual (MS: IAGRO / e-Saniagro).
 * FONTE = SÓ O SISTEMA (Gabriel 23/11): nada estimado. A faixa sai do MÊS DE NASCIMENTO lançado, em meses COMPLETOS na data de referência
 * (o fim da etapa), com o nascimento no dia 1º do mês (o sistema lança nascimento por mês). 0-12 = até 12 meses completos; 13-24; 25-36; 37+.
 */
export type Sexo = 'F' | 'M';
/** 0 = 0-12 · 1 = 13-24 · 2 = 25-36 · 3 = acima de 36 (bovino/bubalino). */
export type Faixa = 0 | 1 | 2 | 3;
export const FAIXAS: readonly Faixa[] = [0, 1, 2, 3];
export const ROTULO_DA_FAIXA: Record<Faixa, string> = { 0: '0 a 12 meses', 1: '13 a 24 meses', 2: '25 a 36 meses', 3: 'acima de 36 meses' };
/** Por sexo, uma contagem por faixa. */
export type PorFaixa = [number, number, number, number];
export type PorSexo<T> = Record<Sexo, T>;

/** 'AAAA-MM' → índice de meses (AAAA*12 + MM-1). */
export const indiceDoMes = (mes: string): number => Number(mes.slice(0, 4)) * 12 + Number(mes.slice(5, 7)) - 1;
/** Meses completos de quem nasceu no dia 1º de `mesDeNascimento` até a data `ref` ('AAAA-MM-DD'). */
export function mesesCompletos(mesDeNascimento: string, ref: string): number {
  return indiceDoMes(ref.slice(0, 7)) - indiceDoMes(mesDeNascimento);   // nascido no dia 1º: no mês de ref já completou (dia ≥ 1)
}
export function faixaDaIdade(meses: number): Faixa {
  return meses <= 12 ? 0 : meses <= 24 ? 1 : meses <= 36 ? 2 : 3;
}
export const faixaNaData = (mesDeNascimento: string, ref: string): Faixa => faixaDaIdade(mesesCompletos(mesDeNascimento, ref));
export const zeros = (): PorFaixa => [0, 0, 0, 0];
