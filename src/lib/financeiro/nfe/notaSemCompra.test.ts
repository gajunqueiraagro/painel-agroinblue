/**
 * NOTA-PAGTO-PARCELADO-01 P3 (Gabriel 11/11, NF Iguaçu 74.367 "REMESSA DE MERCADORIA OU BEM PARA CONSERTO OU REPARO") — a nota que NÃO É
 * COMPRA avisa em destaque e a proposta NÃO SUGERE PAGAMENTO (sem duplicatas, sem vencimento, sem forma); a entrega futura segue como era.
 * Notas SINTÉTICAS (`montarNFe`).
 */
import { describe, it, expect } from 'vitest';
import { lerNFe } from './lerNFe';
import { montarNFe, utf8 } from './__fixtures__/notas';
import { proporLancamento } from './proporLancamento';
import { resolverEmitente } from './resolverEmitente';
import { avisoDaNatureza, fraseDeSemCompra, operacaoSemCompra } from './remessaEntregaFutura';
import type { NotaLida } from './tipos';

const nota = (o: Partial<NotaLida> = {}): NotaLida => {
  const r = lerNFe(utf8(montarNFe({ vNF: '210000.00', duplicatas: [['001', '2026-08-07', '110000.00'], ['002', '2026-10-10', '100000.00']] })));
  if (r.ok === false) throw new Error(r.frase);
  return { ...r.nota, ...o };
};
const propor = (n: NotaLida) => {
  const p = proporLancamento({ nota: n, avisosDoLeitor: [], fazendas: [], emitente: resolverEmitente(n.emitente, [], null), favorecidoId: null, ultima: null });
  if (p.ok === false) throw new Error(p.frase);
  return p.proposta;
};
const CONSERTO = 'REMESSA DE MERCADORIA OU BEM PARA CONSERTO OU REPARO';

describe('a operação que não é compra', () => {
  it('pela natureza (sem CFOP): o caso do Gabriel = remessa para conserto', () => {
    expect(operacaoSemCompra({ naturezaOperacao: CONSERTO, cfops: [] })?.rotulo).toBe('remessa para conserto');
    expect(operacaoSemCompra({ naturezaOperacao: 'Retorno de mercadoria recebida para conserto', cfops: [] })?.rotulo).toBe('retorno de conserto');
    expect(operacaoSemCompra({ naturezaOperacao: 'SIMPLES FATURAMENTO - VENDA P/ ENTREGA FUTURA', cfops: [] })?.rotulo).toBe('simples faturamento');
    expect(operacaoSemCompra({ naturezaOperacao: 'Bonificação', cfops: [] })?.rotulo).toBe('bonificação ou brinde');
  });
  it('pelo CFOP (manda sobre a natureza): 6915, 5916, 5912, 5908, 5922', () => {
    expect(['6.915', '5916', '5912', '5908', '5922'].map((c) => operacaoSemCompra({ naturezaOperacao: 'OUTRAS', cfops: [c] })?.rotulo))
      .toEqual(['remessa para conserto', 'retorno de conserto', 'remessa para demonstração', 'comodato', 'simples faturamento']);
  });
  it('venda comum NÃO avisa — nem quando a natureza cita a palavra mas o CFOP é de venda (5102)', () => {
    expect(operacaoSemCompra({ naturezaOperacao: 'VENDA DE MERCADORIA', cfops: ['5102'] })).toBeNull();
    expect(operacaoSemCompra({ naturezaOperacao: 'VENDA DE PEÇAS PARA CONSERTO', cfops: ['5102'] })).toBeNull();
    expect(fraseDeSemCompra({ naturezaOperacao: 'VENDA', cfops: [] })).toBeNull();
  });
  it('a frase diz o que é e que não sugere pagamento; a entrega futura continua com a frase dela (âmbar)', () => {
    expect(fraseDeSemCompra({ naturezaOperacao: CONSERTO, cfops: [] })).toBe('Nota de REMESSA PARA CONSERTO — não é compra: não sugerimos pagamento. Confira se a compra tem outra nota.');
    expect(avisoDaNatureza({ naturezaOperacao: CONSERTO, cfops: [], informacoesComplementares: null })?.semCompra).toBe(true);
    const futura = avisoDaNatureza({ naturezaOperacao: 'VENDA', cfops: ['6116'], informacoesComplementares: null });
    expect([futura?.semCompra, futura?.frase.startsWith('Remessa de entrega futura')]).toEqual([false, true]);
    expect(avisoDaNatureza({ naturezaOperacao: 'VENDA DE MERCADORIA', cfops: ['5102'], informacoesComplementares: null })).toBeNull();
  });
});

describe('a proposta da nota que não é compra não sugere pagamento', () => {
  it('com duplicatas e forma no XML: a de conserto sai SEM duplicatas, sem vencimento, sem forma; o aviso vem PRIMEIRO', () => {
    const venda = propor(nota());
    expect([venda.duplicatas.length, venda.parcelamento.tipo, venda.formaPagamento !== '']).toEqual([2, 'livres', true]);
    const conserto = propor(nota({ naturezaOperacao: CONSERTO, cfops: ['6915'] }));
    expect(conserto.duplicatas).toEqual([]);
    expect(conserto.parcelamento).toEqual({ tipo: 'unico', vencimento: '' });
    expect(conserto.formaPagamento).toBe('');
    expect(conserto.avisos[0]).toBe('Nota de REMESSA PARA CONSERTO — não é compra: não sugerimos pagamento. Confira se a compra tem outra nota.');
  });
  it('o aviso "não é compra" vem ANTES dos outros (aqui, as duplicatas que não somam a nota)', () => {
    const r = lerNFe(utf8(montarNFe({ vNF: '210000.00', duplicatas: [['001', '2026-08-07', '110000.00'], ['002', '2026-10-10', '90000.00']] })));
    if (r.ok === false) throw new Error(r.frase);
    const avisos = propor({ ...r.nota, naturezaOperacao: CONSERTO, cfops: ['6915'] }).avisos;
    expect(avisos.length).toBeGreaterThan(1);
    expect(avisos[0].startsWith('Nota de REMESSA PARA CONSERTO')).toBe(true);
  });
});
