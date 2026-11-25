/** NOTA-ENTREGA-FUTURA-01 (3) — o achado com OUTRA NF (dados SINTÉTICOS no formato da `fn_nota_ja_lancada`). */
import { describe, expect, it } from 'vitest';
import { achadoComOutraNota, nfFalada } from './achadoComOutraNota';
import type { LancamentoJaLancado } from './jaLancada';

const l = (o: Partial<LancamentoJaLancado> = {}): LancamentoJaLancado => ({
  id: 'a', descricao: 'Semente', valorCent: 1880000, vencimento: '2026-12-10', competencia: '2026-11-01', pagamento: null, status: 'programado',
  conciliado: false, financiamentoId: null, numeroDocumento: '000.030.436', fornecedorId: 'f', fornecedorNome: 'Pastoforma', fornecedorPor: 'cnpj',
  parcelas: [], por: ['valor'], cancelado: false, ...o,
});

describe('achadoComOutraNota', () => {
  it('o caso Pastoforma: achado só pelo valor, com a NF 30.436, entrando a 30.150', () => {
    const r = achadoComOutraNota({ alvos: [l()] }, '30150');
    expect(r?.outras).toEqual(['30436']);
    expect(r?.lancamentos.map((x) => x.id)).toEqual(['a']);
    expect(nfFalada('30436')).toBe('30.436');
  });
  it('não é o caso: a mesma NF, sem NF, ancorado por número/chave/documento/escolha, já com esta nota, nada achado', () => {
    expect(achadoComOutraNota({ alvos: [l({ numeroDocumento: '30150' })] }, '000.030.150')).toBeNull();
    expect(achadoComOutraNota({ alvos: [l({ numeroDocumento: null })] }, '30150')).toBeNull();
    for (const por of ['numero', 'chave', 'documento', 'escolhido'] as const) expect(achadoComOutraNota({ alvos: [l({ por: ['valor', por] })] }, '30150'), por).toBeNull();
    expect(achadoComOutraNota({ alvos: [l({ temEstaNota: true })] }, '30150')).toBeNull();
    expect(achadoComOutraNota({ alvos: [] }, '30150')).toBeNull();
    expect(achadoComOutraNota(null, '30150')).toBeNull();
  });
  it('um achado com outra NF e outro sem NF = não é o caso (a tabela de sempre)', () => {
    expect(achadoComOutraNota({ alvos: [l(), l({ id: 'b', numeroDocumento: '' })] }, '30150')).toBeNull();
  });
});
