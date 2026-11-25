/**
 * DA-NOTA-JUROS-01 (Gabriel 24/11 17:03) — PAGO ≠ NOTA NUNCA TRAVA (a regra de 18/11 do juros no casar). Quando TUDO o que recebe a nota já está
 * pago, a diferença entre o pago e a nota é explicada: pago MAIOR = "juros/multa" (o banco divide o MESMO pagamento: a nota na conta dele + a
 * diferença em Despesas Financeiras — `fn_nota_completar` com `p_diferenca`); pago MENOR = "desconto" (nada muda no lançamento). O operador
 * pode trocar: "não é juros" devolve a guarda de sempre (a nota não cobre todos: compra errada?). PURO.
 */

export type MotivoDaDiferenca = 'juros' | 'desconto';
/** o que o operador escolhe: o motivo, ou "conferir" (não é juros/desconto: a guarda da soma volta a valer) */
export type EscolhaDaDiferenca = MotivoDaDiferenca | 'conferir';

export interface PagoNaNota {
  pago: boolean;
  /** o vencimento do lançamento (ISO) */
  vencimento: string | null;
  /** a data do pagamento (ISO) */
  pagamento: string | null;
}

export interface DiferencaDaNota {
  pagoCent: number;
  notaCent: number;
  /** pago − nota (positivo = pagou a mais) */
  difCent: number;
  sugerido: MotivoDaDiferenca;
  /** dias entre o vencimento (o da nota, senão o do lançamento) e o pagamento; nulo = sem as datas */
  diasDepois: number | null;
}

const dia = (iso: string | null | undefined) => (iso && /^\d{4}-\d{2}-\d{2}/.test(iso) ? Date.UTC(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10)) : null);

/**
 * A diferença a explicar, ou nula (bate com a nota no meio centavo; há lançamento em aberto ou parcela que vai nascer — aí vale a regra de
 * sempre). `vencimentoDaNota` = o último vencimento das duplicatas da nota (o "pagou 1 dia depois" é contra ele).
 */
export function diferencaDaNota({ alvos, somaCent, notaCent, nascem, vencimentoDaNota }: {
  alvos: readonly PagoNaNota[]; somaCent: number; notaCent: number; nascem: number; vencimentoDaNota?: string | null;
}): DiferencaDaNota | null {
  const difCent = somaCent - notaCent;
  if (Math.abs(difCent) <= 1 || nascem > 0 || alvos.length === 0 || !alvos.every((a) => a.pago)) return null;
  const pagamentos = alvos.map((a) => dia(a.pagamento)).filter((d): d is number => d !== null);
  const ultimoPagamento = pagamentos.length ? Math.max(...pagamentos) : null;
  const vencimentos = alvos.map((a) => dia(a.vencimento)).filter((d): d is number => d !== null);
  const venc = dia(vencimentoDaNota) ?? (vencimentos.length ? Math.max(...vencimentos) : null);
  const diasDepois = ultimoPagamento !== null && venc !== null ? Math.round((ultimoPagamento - venc) / 86_400_000) : null;
  return { pagoCent: somaCent, notaCent, difCent, sugerido: difCent > 0 ? 'juros' : 'desconto', diasDepois };
}

/** O motivo que vale: o escolhido, senão o sugerido. "conferir" = nenhum (a guarda da soma volta). */
export function motivoQueVale(d: DiferencaDaNota | null, escolhido: EscolhaDaDiferenca | null): MotivoDaDiferenca | null {
  if (!d) return null;
  const e = escolhido ?? d.sugerido;
  if (e === 'conferir') return null;
  /* o motivo tem de casar com o sinal: juros só a mais, desconto só a menos */
  return (e === 'juros') === (d.difCent > 0) ? e : null;
}

/** A guarda "a soma passa da nota" vale? Não, quando o pago a mais é JUROS. */
export function somaPassaDaNotaTrava(somaCent: number, notaCent: number, motivo: MotivoDaDiferenca | null): boolean {
  return somaCent > notaCent + 1 && motivo !== 'juros';
}

const reais = (cent: number) => (Math.abs(cent) / 100).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** O porquê no `title`: "Pago R$ 3.446,34 · nota R$ 3.441,75 · diferença +R$ 4,59 — pago 1 dia depois do vencimento: juros/multa." */
export function porqueDaDiferenca(d: DiferencaDaNota): string {
  const quando = d.diasDepois === null ? '' : d.diasDepois > 0 ? ` — pago ${d.diasDepois} dia${d.diasDepois === 1 ? '' : 's'} depois do vencimento`
    : d.diasDepois < 0 ? ` — pago ${-d.diasDepois} dia${d.diasDepois === -1 ? '' : 's'} antes do vencimento` : ' — pago no vencimento';
  const efeito = d.difCent > 0
    ? 'Juros/multa: o pagamento fica dividido (a nota na conta dele + a diferença em Despesas Financeiras); valor, caixa e conciliação não mudam.'
    : 'Desconto: o lançamento fica como está (o custo é o que foi pago).';
  return `Pago R$ ${reais(d.pagoCent)} · nota R$ ${reais(d.notaCent)} · diferença ${d.difCent > 0 ? '+' : '−'}R$ ${reais(d.difCent)}${quando}. ${efeito}`;
}

/** Os números curtos da linha (cada um no seu lugar, nunca frase corrida). */
export function numerosDaDiferenca(d: DiferencaDaNota): { pago: string; nota: string; diferenca: string } {
  return { pago: `R$ ${reais(d.pagoCent)}`, nota: `R$ ${reais(d.notaCent)}`, diferenca: `${d.difCent > 0 ? '+' : '−'}R$ ${reais(d.difCent)}` };
}
