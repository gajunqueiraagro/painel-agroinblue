/**
 * A LINHA DE SALDO DO EXTRATO — PR-CONC-OFX-LINHA-SALDO-01.
 *
 * ⚠ O ITAÚ MANDA O SALDO COMO SE FOSSE MOVIMENTO: um `<STMTTRN>` comum, com `TRNAMT` positivo (o próprio saldo),
 *   `MEMO` "SALDO ANTERIOR" ou "SALDO TOTAL DISPONÍVEL DIA" e `FITID` `AAAAMMDD001`. O `parseOFX` lê tudo o que está
 *   entre `<STMTTRN>` — e deve continuar lendo, porque é o contrato do arquivo —, então o filtro mora aqui, num helper
 *   só, e quem importa o chama.
 * ⚠ MEDIDO NO BANCO (30/09): 7 linhas assim já gravadas — 5 do NJ (Itaú BBA, jul/26, "SALDO ANTERIOR" e "SALDO TOTAL
 *   DISPONÍVEL DIA", R$ 1,7 mi cada, que viraram lançamentos de ENTRADA depois cancelados) e 2 da Santa Rita ("SALDO
 *   ANTERIOR", R$ 10.000,60, ainda em aberto na conciliação). Um saldo importado como movimento é uma entrada falsa do
 *   tamanho do caixa inteiro.
 * ⚠ SÓ O INÍCIO DA DESCRIÇÃO: "PIX ENVIADO ... SALDO" é movimento. Acento e caixa não importam ("DISPONÍVEL" e
 *   "DISPONIVEL" são a mesma linha).
 */
import { saldoConfere } from '@/lib/financeiro/conciliacaoCalc';
import type { MovimentoBruto } from './parseOFX';

/** Os começos de descrição que são SALDO, não movimento. Ampliar aqui — e só aqui — quando outro banco aparecer. */
export const PREFIXOS_LINHA_DE_SALDO: readonly string[] = [
  'SALDO ANTERIOR',
  'SALDO TOTAL DISPONIVEL',
  'SALDO DO DIA',
  'SDO ',
];

const normalizar = (s: string | null | undefined): string =>
  (s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().replace(/\s+/g, ' ').trim();

/** A descrição é de uma linha de saldo do banco (e não de um movimento)? */
export function ehLinhaDeSaldo(descricao: string | null | undefined): boolean {
  const d = normalizar(descricao);
  return PREFIXOS_LINHA_DE_SALDO.some((p) => d.startsWith(p) || d === p.trim());
}

/** Separa, preservando a ordem do arquivo, o que é movimento do que é saldo. */
export function separarLinhasDeSaldo<T extends Pick<MovimentoBruto, 'descricao'>>(linhas: readonly T[]): {
  movimentos: T[]; saldos: T[];
} {
  const movimentos: T[] = [];
  const saldos: T[] = [];
  for (const l of linhas) (ehLinhaDeSaldo(l.descricao) ? saldos : movimentos).push(l);
  return { movimentos, saldos };
}

/** O último saldo do período no extrato, conferido contra o saldo que o banco declara no arquivo (`LEDGERBAL`). */
export interface ConferenciaSaldoExtrato {
  /** A linha de saldo de data mais recente (em empate, a última do arquivo). `null` sem linha de saldo. */
  ultimo: { data: string; valor: number; descricao: string } | null;
  /** `null` quando falta um dos dois lados — ausência não é "confere" nem "diverge". */
  confere: boolean | null;
  /** último − declarado, quando os dois existem. */
  diferenca: number | null;
}

/**
 * ⚠ SÓ CONFERE, NUNCA GRAVA: o saldo manual da conta é soberano e o do arquivo só o valida. Esta conta não escreve
 *   nada em lugar nenhum — ela devolve o que a prévia mostra.
 */
export function conferirSaldoDoExtrato(
  saldos: readonly Pick<MovimentoBruto, 'data' | 'valor' | 'descricao'>[],
  saldoDeclarado: number | null,
): ConferenciaSaldoExtrato {
  let ultimo: ConferenciaSaldoExtrato['ultimo'] = null;
  for (const s of saldos) {
    const d = s.data.slice(0, 10);
    if (!ultimo || d >= ultimo.data) ultimo = { data: d, valor: s.valor, descricao: s.descricao };
  }
  if (!ultimo || saldoDeclarado == null) return { ultimo, confere: null, diferenca: null };
  const diferenca = ultimo.valor - saldoDeclarado;
  return { ultimo, confere: saldoConfere(diferenca), diferenca };
}
