/**
 * NOTAS-RECEITA-SEM-LANCAMENTO-01 (Gabriel 18/11, proposta aprovada) — A CLASSE DA NOTA pela própria nota, UMA regra (lista "Notas da Receita"
 * e "+ Da nota"): (a) compra · (b) não gera lançamento (com o motivo) · (c) cancelada · (d) venda do titular (NF de entrada do comprador).
 * ⚠ PELO CFOP, NUNCA pelo tPag 90 sozinho: na FASE 0 (NJ) 11 compras de verdade (5102 "VENDA", R$ 104.992,90) vinham com tPag 90 ("sem
 *   pagamento") — muito emissor usa o 90 na venda a prazo.
 * ⚠ ENTREGA FUTURA: 5922/6922 é o FATURAMENTO (gera o pagamento); 5116/5117/6116/6117 é a REMESSA da mercadoria (não gera).
 * ⚠ tpNF 0 (entrada) emitida por OUTRO com o titular de destinatário = o comprador registrando a compra (o frigorífico): é VENDA do titular.
 * Pura: recebe os atributos que o banco extrai do XML (`fn_notas_atributos_fiscais`).
 */
export type MotivoNaoFinanceira = 'comodato' | 'entrega_futura' | 'bonificacao' | 'devolucao' | 'garantia' | 'demonstracao' | 'conserto'
  | 'retorno' | 'retorno_demonstracao' | 'outra_remessa';
/** a lista dos motivos (a mesma do tipo), para ler o que o banco devolve sem cast */
export const MOTIVOS_NAO_FINANCEIROS: readonly MotivoNaoFinanceira[] = ['comodato', 'entrega_futura', 'bonificacao', 'devolucao', 'garantia',
  'demonstracao', 'conserto', 'retorno', 'retorno_demonstracao', 'outra_remessa'];
export type ClasseDaNota =
  | { classe: 'compra' }
  | { classe: 'nao_financeira'; motivo: MotivoNaoFinanceira }
  | { classe: 'cancelada' }
  | { classe: 'venda_do_titular' };

export interface AtributosFiscais { cfops: readonly string[]; tpNF: string | null; natOp: string | null }

const tem = (cfops: readonly string[], lista: readonly string[]) => cfops.some((c) => lista.includes(c));
/** os CFOPs de remessa/retorno sem pagamento (o grupo 59xx/69xx menos os que FATURAM ou documentam venda) */
const FATURA_OU_DOCUMENTA = ['5922', '6922', '5929', '6929'];

export function classeDaNota(a: AtributosFiscais, cancelada: boolean): ClasseDaNota {
  if (cancelada) return { classe: 'cancelada' };
  const c = a.cfops;
  const nat = (a.natOp ?? '').toUpperCase();
  if (tem(c, ['5908', '6908'])) return { classe: 'nao_financeira', motivo: 'comodato' };
  if (tem(c, ['5116', '5117', '6116', '6117'])) return { classe: 'nao_financeira', motivo: 'entrega_futura' };
  if (tem(c, ['5910', '6910', '5911', '6911'])) return { classe: 'nao_financeira', motivo: 'bonificacao' };
  if (tem(c, ['1202', '2202', '5202', '6202', '1411', '2411', '5411', '6411'])) return { classe: 'nao_financeira', motivo: 'devolucao' };
  /* NOTA-DEMONSTRACAO-01 (Gabriel 19/11 08:03): 5912/6912 = o bem VEM para demonstração; o RETORNO dele é 5913/6913 (saída) ou 1913/2913 —
     a NF de ENTRADA que o fornecedor emite ao receber o bem de volta (tpNF 0: sem esta linha cairia em "venda do titular") */
  if (tem(c, ['5913', '6913', '1913', '2913'])) return { classe: 'nao_financeira', motivo: 'retorno_demonstracao' };
  if (tem(c, ['5912', '6912'])) return { classe: 'nao_financeira', motivo: 'demonstracao' };
  if (tem(c, ['5915', '6915', '5916', '6916'])) return { classe: 'nao_financeira', motivo: 'conserto' };
  if (tem(c, ['5909', '6909', '1909', '2909'])) return { classe: 'nao_financeira', motivo: 'retorno' };
  if (tem(c, ['5949', '6949']) && !/DEBITO/.test(nat)) return { classe: 'nao_financeira', motivo: /GARANTIA/.test(nat) ? 'garantia' : 'outra_remessa' };
  if (c.some((x) => /^[56]9\d\d$/.test(x) && !FATURA_OU_DOCUMENTA.includes(x) && x !== '5949' && x !== '6949')) {
    return { classe: 'nao_financeira', motivo: 'outra_remessa' };
  }
  if (a.tpNF === '0') return { classe: 'venda_do_titular' };
  return { classe: 'compra' };
}

export const ROTULO_DO_MOTIVO: Record<MotivoNaoFinanceira, string> = {
  comodato: 'comodato', entrega_futura: 'remessa de entrega futura', bonificacao: 'bonificação', devolucao: 'devolução',
  garantia: 'garantia', demonstracao: 'demonstração', conserto: 'conserto', retorno: 'retorno', retorno_demonstracao: 'retorno de demonstração',
  outra_remessa: 'remessa',
};
/** o que o selo diz e o ⓘ explica */
export const DICA_DO_MOTIVO: Record<MotivoNaoFinanceira, string> = {
  comodato: 'Bem emprestado (comodato): não é compra. Registre como bem de terceiro para devolver.',
  entrega_futura: 'Remessa da mercadoria já faturada: a cobrança é a nota de faturamento (5922/6922), não esta.',
  bonificacao: 'Bonificação/brinde: sem pagamento.',
  devolucao: 'Devolução: não é compra nova.',
  garantia: 'Troca/substituição em garantia: sem pagamento.',
  demonstracao: 'Demonstração: o bem volta ao fornecedor.',
  conserto: 'Conserto: o bem vai e volta; o serviço vem em outra nota.',
  retorno: 'Retorno de bem: fecha uma remessa anterior.',
  retorno_demonstracao: 'O bem em demonstração voltou ao fornecedor: fecha a demonstração.',
  outra_remessa: 'Remessa sem pagamento (CFOP de remessa/retorno).',
};
/** o motivo que abre "Registrar bem de terceiro" (o bem fica com o titular e volta depois) */
export const ehBemDeTerceiro = (c: ClasseDaNota): boolean =>
  c.classe === 'nao_financeira' && (c.motivo === 'comodato' || c.motivo === 'demonstracao' || c.motivo === 'conserto');
