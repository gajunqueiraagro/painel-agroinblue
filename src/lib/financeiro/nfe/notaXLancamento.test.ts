/**
 * NOTA-LIGAR-LANCAMENTO-01 P1–P3 — a regra pura do "Novo documento" que lê a nota. O caso é o do NJ em dados SINTÉTICOS: nota de R$ 280.500
 * em 2 duplicatas (15% + 85%), anexada a um lançamento de 42.075 de OUTRA filial do mesmo CNPJ raiz; a 2ª duplicata paga pelo banco do
 * contrato direto ao fornecedor.
 */
import { describe, it, expect } from 'vitest';
import { avisoDeFilial, finalDaFilial, participacaoSugerida, quadroNotaXLancamento, type LiberacaoDireta } from './notaXLancamento';
import type { LancamentoJaLancado } from './jaLancada';

const NOTA_DOC = '11222333001575';
const DUPS = [{ numero: '001', vencimento: '2026-09-02', valorCent: 4_207_500 }, { numero: '002', vencimento: '2026-10-01', valorCent: 23_842_500 }];
const LIB: LiberacaoDireta = { id: 'lib-1', data: '2026-10-01', valorCent: 23_842_500, contrato: 'CT-1/26' };
const achado = (id: string, n: number, extra: Partial<LancamentoJaLancado> = {}): LancamentoJaLancado => ({
  id, vencimento: null, pagamento: null, competencia: null, descricao: `Outro ${n}`, valorCent: 0, status: 'programado', conciliado: false, financiamentoId: null,
  numeroDocumento: null, fornecedorId: null, fornecedorNome: null, fornecedorPor: 'cnpj', parcelas: [{ n, difCent: 0, difDias: 0 }], por: ['valor'], cancelado: false, ...extra });

describe('P1 — avisoDeFilial', () => {
  const lanc = (documento: string | null) => ({ id: 'f14', documento });
  it('mesmo CNPJ raiz, filial diferente: nomeia as duas filiais; com a filial da nota no cadastro = dá para trocar', () => {
    expect(finalDaFilial('11.222.333/0015-75')).toBe('0015-75');
    const a = avisoDeFilial({ notaDocumento: NOTA_DOC, notaFornecedorId: 'f15', lancamento: lanc('11.222.333/0014-94') });
    expect(a?.tipo).toBe('outra-filial');
    expect(a?.frase).toBe('A nota é da filial 0015-75 · o lançamento está na 0014-94.');
  });
  it('a filial da nota fora do cadastro = cadastrar; outro CNPJ raiz = outro fornecedor', () => {
    expect(avisoDeFilial({ notaDocumento: NOTA_DOC, notaFornecedorId: null, lancamento: lanc('11222333001494') })?.tipo).toBe('filial-fora-do-cadastro');
    expect(avisoDeFilial({ notaDocumento: NOTA_DOC, notaFornecedorId: 'f15', lancamento: lanc('99888777000100') })?.tipo).toBe('outro-fornecedor');
  });
  it('nada a avisar: o mesmo cadastro, o mesmo CNPJ, lançamento sem fornecedor ou sem CNPJ', () => {
    expect(avisoDeFilial({ notaDocumento: NOTA_DOC, notaFornecedorId: 'f14', lancamento: lanc('11222333001494') })).toBeNull();
    expect(avisoDeFilial({ notaDocumento: NOTA_DOC, notaFornecedorId: null, lancamento: lanc('11.222.333/0015-75') })).toBeNull();
    expect(avisoDeFilial({ notaDocumento: NOTA_DOC, notaFornecedorId: 'f15', lancamento: null })).toBeNull();
    expect(avisoDeFilial({ notaDocumento: NOTA_DOC, notaFornecedorId: 'f15', lancamento: lanc(null) })).toBeNull();
  });
});

describe('P2 — quadroNotaXLancamento', () => {
  const base = { duplicatas: DUPS, notaCent: 28_050_000, emissao: '2026-09-01', lancamento: { id: 'l1', valorCent: 4_207_500, data: '2026-03-06' } };
  it('o caso do NJ: a 001 é ESTE lançamento, a 002 a liberação do contrato; ninguém sem dono', () => {
    const q = quadroNotaXLancamento({ ...base, outros: [], liberacoes: [LIB] });
    expect(q.linhas.map((l) => l.quem.tipo)).toEqual(['este', 'liberacao']);
    expect(q.linhas[1].quem).toMatchObject({ contrato: 'CT-1/26' });
    expect([q.semDonoCent, q.esteSemDuplicata]).toEqual([0, false]);
  });
  it('outro lançamento já no sistema (pela duplicata n), ignorando o próprio e o cancelado; sem nada = ninguém, e a soma sem dono', () => {
    const q = quadroNotaXLancamento({ ...base, outros: [achado('l1', 2), achado('c', 2, { cancelado: true })], liberacoes: [] });
    expect(q.linhas[1].quem.tipo).toBe('ninguem');
    expect(q.semDonoCent).toBe(23_842_500);
    const q2 = quadroNotaXLancamento({ ...base, outros: [achado('l2', 2)], liberacoes: [LIB] });
    expect(q2.linhas[1].quem).toMatchObject({ tipo: 'outro', lancamentoId: 'l2' });
  });
  it('a liberação só conta com valor igual e até 60 dias da duplicata; e paga uma duplicata só', () => {
    expect(quadroNotaXLancamento({ ...base, outros: [], liberacoes: [{ ...LIB, data: '2026-12-15' }] }).linhas[1].quem.tipo).toBe('ninguem');
    expect(quadroNotaXLancamento({ ...base, outros: [], liberacoes: [{ ...LIB, valorCent: 23_842_400 }] }).linhas[1].quem.tipo).toBe('ninguem');
    const iguais = [{ numero: '1', vencimento: '2026-10-01', valorCent: 100 }, { numero: '2', vencimento: '2026-11-01', valorCent: 100 }];
    const q = quadroNotaXLancamento({ ...base, duplicatas: iguais, lancamento: { id: null, valorCent: null, data: null }, outros: [], liberacoes: [{ ...LIB, valorCent: 100 }] });
    expect(q.linhas.map((l) => l.quem.tipo)).toEqual(['liberacao', 'ninguem']);
  });
  it('duplicatas de mesmo valor: ESTE é a de vencimento mais perto da data do lançamento; valor que não bate = esteSemDuplicata', () => {
    const iguais = [{ numero: '1', vencimento: '2026-10-01', valorCent: 2_500_000 }, { numero: '2', vencimento: '2026-11-10', valorCent: 2_500_000 }];
    const q = quadroNotaXLancamento({ ...base, duplicatas: iguais, lancamento: { id: 'l', valorCent: 2_500_000, data: '2026-11-08' }, outros: [], liberacoes: [] });
    expect(q.linhas.map((l) => l.quem.tipo)).toEqual(['ninguem', 'este']);
    expect(quadroNotaXLancamento({ ...base, lancamento: { id: 'l', valorCent: 999, data: null }, outros: [], liberacoes: [] }).esteSemDuplicata).toBe(true);
  });
  it('nota sem duplicata = uma linha (a nota inteira, na emissão)', () => {
    const q = quadroNotaXLancamento({ ...base, duplicatas: [], lancamento: { id: 'l', valorCent: 28_050_000, data: null }, outros: [], liberacoes: [] });
    expect(q.linhas).toEqual([{ numero: 'nota', vencimento: '2026-09-01', valorCent: 28_050_000, quem: { tipo: 'este' } }]);
  });
});

describe('P3 — participacaoSugerida', () => {
  it('42.075 de 280.500 = 15%; a nota inteira (ou mais) ou sem valor = nenhuma; o piso é 1% e o teto 99%', () => {
    expect(participacaoSugerida(4_207_500, 28_050_000)).toBe(15);
    expect(participacaoSugerida(28_050_000, 28_050_000)).toBeNull();
    expect(participacaoSugerida(28_049_999, 28_050_000)).toBeNull();
    expect(participacaoSugerida(null, 28_050_000)).toBeNull();
    expect(participacaoSugerida(10, 28_050_000)).toBe(1);
    expect(participacaoSugerida(27_900_000, 28_050_000)).toBe(99);
  });
});
