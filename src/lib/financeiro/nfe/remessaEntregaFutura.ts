/**
 * NOTA-AVULSA-890-01 (Gabriel 22/10/2026) — a REMESSA DE ENTREGA FUTURA. A venda para entrega futura tem duas notas: a ORIGINARIA (o
 * faturamento, sem mercadoria) e a(s) remessa(s) (a entrega). Lancar as duas como compra dobra o valor. A previa AVISA (ambar, nunca
 * bloqueia): pela natureza ("remessa ... entrega/venda futura") ou pelo CFOP da entrega (5116/5117/6116/6117); quando os dados
 * adicionais citam a originaria ("NFP originaria nº …"), a frase diz qual. PURO.
 */
import type { NotaLida } from './tipos';
import { normalizar } from './danfe';

export const CFOP_DE_ENTREGA_FUTURA: readonly string[] = ['5116', '5117', '6116', '6117'];

export function ehRemessaDeEntregaFutura(nota: Pick<NotaLida, 'naturezaOperacao' | 'cfops'>): boolean {
  const nat = normalizar(nota.naturezaOperacao ?? '');
  if (nat.includes('REMESSA') && nat.includes('FUTURA')) return true;
  if (nat.includes('ENTREGA FUTURA')) return true;
  return (nota.cfops ?? []).some((c) => CFOP_DE_ENTREGA_FUTURA.includes(c.replace(/\D/g, '')));
}

/** "… NFP ORIGINÁRIA Nº 123.456 …" -> "123.456"; `null` quando os dados adicionais nao citam a originaria. */
export function originariaCitada(info: string | null | undefined): string | null {
  const t = normalizar(info ?? '');
  const m = /ORIGINARIA\W{0,3}(?:DE\s+)?(?:NF[PE]?\W{0,3})?(?:N[O0]?\W{0,3})?(\d[\d./-]*\d|\d)/.exec(t);
  return m ? m[1] : null;
}

export function fraseDaRemessa(nota: Pick<NotaLida, 'naturezaOperacao' | 'cfops' | 'informacoesComplementares'>): string | null {
  if (!ehRemessaDeEntregaFutura(nota)) return null;
  const o = originariaCitada(nota.informacoesComplementares);
  return 'Remessa de entrega futura: confira se a nota da venda futura (originária) já foi lançada — esta pode ser só a entrega.'
    + (o ? ` A nota cita a originária nº ${o}.` : '');
}
