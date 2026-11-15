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

/**
 * NOTA-PAGTO-PARCELADO-01 P3 (Gabriel 11/11, NF Iguaçu 74.367 "REMESSA DE MERCADORIA OU BEM PARA CONSERTO OU REPARO": a prévia ofereceu
 * criar uma compra de R$ 210.000) — a nota que NÃO É COMPRA: remessa/retorno de conserto, demonstração, comodato, industrialização,
 * armazenagem, bonificação/brinde/amostra e simples faturamento. A prévia AVISA em destaque e NÃO SUGERE PAGAMENTO (sem forma, sem
 * vencimento, sem duplicatas na proposta); nunca bloqueia — o operador ainda decide. PURO; pelo CFOP (a regra fiscal) ou pela natureza.
 */
export interface OperacaoSemCompra { rotulo: string; cfops: readonly string[]; natureza: readonly string[][] }
export const OPERACOES_SEM_COMPRA: readonly OperacaoSemCompra[] = [
  { rotulo: 'retorno de conserto', cfops: ['5916', '6916'], natureza: [['RETORNO', 'CONSERTO'], ['RETORNO', 'REPARO']] },
  { rotulo: 'remessa para conserto', cfops: ['5915', '6915'], natureza: [['CONSERTO'], ['REPARO']] },
  { rotulo: 'retorno de demonstração', cfops: ['5913', '6913'], natureza: [['RETORNO', 'DEMONSTRACAO']] },
  { rotulo: 'remessa para demonstração', cfops: ['5912', '6912'], natureza: [['DEMONSTRACAO']] },
  { rotulo: 'comodato', cfops: ['5908', '6908', '5909', '6909'], natureza: [['COMODATO']] },
  { rotulo: 'industrialização', cfops: ['5901', '6901', '5902', '6902', '5903', '6903'], natureza: [['INDUSTRIALIZACAO']] },
  { rotulo: 'armazenagem', cfops: ['5905', '6905', '5906', '6906', '5907', '6907'], natureza: [['ARMAZENAGEM'], ['DEPOSITO']] },
  { rotulo: 'bonificação ou brinde', cfops: ['5910', '6910'], natureza: [['BONIFICACAO'], ['BRINDE']] },
  { rotulo: 'amostra grátis', cfops: ['5911', '6911'], natureza: [['AMOSTRA']] },
  { rotulo: 'simples faturamento', cfops: ['5922', '6922'], natureza: [['SIMPLES', 'FATURAMENTO']] },
];

/** A operação que não é compra (a primeira que casa: o CFOP manda; sem CFOP conhecido, a natureza), ou `null`. */
export function operacaoSemCompra(nota: Pick<NotaLida, 'naturezaOperacao' | 'cfops'>): OperacaoSemCompra | null {
  const cfops = (nota.cfops ?? []).map((c) => c.replace(/\D/g, ''));
  const porCfop = OPERACOES_SEM_COMPRA.find((o) => cfops.some((c) => o.cfops.includes(c)));
  if (porCfop) return porCfop;
  /* a nota com CFOP de COMPRA conhecido não vira "sem compra" só pela palavra da natureza */
  if (cfops.length > 0) return null;
  const nat = normalizar(nota.naturezaOperacao ?? '');
  return OPERACOES_SEM_COMPRA.find((o) => o.natureza.some((palavras) => palavras.every((w) => nat.includes(w)))) ?? null;
}

export function fraseDeSemCompra(nota: Pick<NotaLida, 'naturezaOperacao' | 'cfops'>): string | null {
  const o = operacaoSemCompra(nota);
  return o ? `Nota de ${o.rotulo.toUpperCase()} — não é compra: não sugerimos pagamento. Confira se a compra tem outra nota.` : null;
}

/** O aviso da natureza da nota na prévia (um lugar só): primeiro o "não é compra", senão a remessa de entrega futura. */
export function avisoDaNatureza(nota: Pick<NotaLida, 'naturezaOperacao' | 'cfops' | 'informacoesComplementares'>): { frase: string; semCompra: boolean } | null {
  const sem = fraseDeSemCompra(nota);
  if (sem) return { frase: sem, semCompra: true };
  const r = fraseDaRemessa(nota);
  return r ? { frase: r, semCompra: false } : null;
}
