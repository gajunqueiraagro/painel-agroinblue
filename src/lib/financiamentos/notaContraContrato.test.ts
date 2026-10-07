/**
 * PARC-LIVRES-01 passo 6 — a nota contra o contrato: confere em centavos, não sobrescreve, e a parcela paga não muda.
 */
import { describe, it, expect } from 'vitest';
import { conferirNota, duplicatasEmAberto, usarDuplicatasDaNota } from './notaContraContrato';
import type { ParcelaLivre } from './parcelasLivres';

const NOTA = { emitenteDocumento: '11.222.333/0001-81', emitenteNome: 'Fornecedor SA', valorCent: 30000,
  duplicatas: [{ vencimento: '2026-11-10', valorCent: 10000 }, { vencimento: '2026-12-08', valorCent: 12000 }, { vencimento: '2027-01-05', valorCent: 8000 }] };
const CONTRATO = { credorDocumento: '11222333000181', credorNome: 'Fornecedor SA', valorCent: 30000, parcelas: [
  { vencimento: '2026-11-10', valorCent: 10000, paga: true }, { vencimento: '2026-12-10', valorCent: 10000, paga: false }, { vencimento: '2027-01-10', valorCent: 10000, paga: false }] };
const linha = (c: ReturnType<typeof conferirNota>, campo: string) => c.linhas.find((l) => l.campo === campo)!;

describe('conferirNota', () => {
  it('fornecedor pelo documento (só dígitos), valor ao centavo, duplicatas × parcelas não pagas', () => {
    const c = conferirNota(NOTA, CONTRATO);
    expect(linha(c, 'fornecedor').confere).toBe(true);
    expect(linha(c, 'valor')).toMatchObject({ contratoCent: 30000, notaCent: 30000, confere: true });
    expect(linha(c, 'parcelas')).toMatchObject({ contratoTexto: '3 parcelas', notaTexto: '3 duplicatas', confere: false });
    expect(c.duplicatasDiferem).toBe(true);
  });
  it('UM centavo de diferença no valor não confere; documento diferente não confere', () => {
    const c = conferirNota({ ...NOTA, valorCent: 30001, emitenteDocumento: '52998224725' }, CONTRATO);
    expect(linha(c, 'valor').confere).toBe(false);
    expect(linha(c, 'fornecedor').confere).toBe(false);
  });
  it('cadastro sem documento: não dá para comparar (nulo, nunca "confere")', () => {
    const c = conferirNota(NOTA, { ...CONTRATO, credorDocumento: null });
    expect(linha(c, 'fornecedor').confere).toBeNull();
    expect(linha(c, 'fornecedor').contratoFixo).toBe('sem documento no cadastro');
    expect(linha(conferirNota(NOTA, CONTRATO), 'fornecedor')).toMatchObject({ contratoTexto: 'Fornecedor SA', contratoFixo: '11222333000181', notaFixo: '11222333000181' });
  });
  it('duplicatas iguais às parcelas (a paga inclusive): confere, e não oferece nada', () => {
    const c = conferirNota({ ...NOTA, duplicatas: CONTRATO.parcelas.map(({ vencimento, valorCent }) => ({ vencimento, valorCent })) }, CONTRATO);
    expect(linha(c, 'parcelas').confere).toBe(true);
    expect(c.duplicatasDiferem).toBe(false);
  });
  it('nota sem duplicatas: a linha das parcelas não se compara e nada é oferecido', () => {
    const c = conferirNota({ ...NOTA, duplicatas: [] }, CONTRATO);
    expect(linha(c, 'parcelas')).toMatchObject({ notaTexto: 'sem duplicatas', confere: null });
    expect(c).toMatchObject({ duplicatasDiferem: false, temDuplicatas: false });
  });
});

describe('usarDuplicatasDaNota — a parcela paga não muda', () => {
  const grade: ParcelaLivre[] = [
    { chave: 'a', vencimento: '2026-11-10', valorCent: 10000, origem: 'gravada', era: { vencimento: '2026-11-10', valorCent: 10000 }, paga: { em: '2026-11-10' } },
    { chave: 'b', vencimento: '2026-12-10', valorCent: 10000, origem: 'gravada', era: { vencimento: '2026-12-10', valorCent: 10000 } },
    { chave: 'c', vencimento: '2027-01-10', valorCent: 10000, origem: 'gravada', era: { vencimento: '2027-01-10', valorCent: 10000 } },
  ];
  it('a duplicata igual à paga é a paga; as outras editam as não pagas, na ordem, guardando o "era"', () => {
    expect(duplicatasEmAberto(NOTA, CONTRATO.parcelas)).toEqual(NOTA.duplicatas.slice(1));
    const nova = usarDuplicatasDaNota(grade, NOTA);
    expect(nova[0]).toEqual(grade[0]);
    expect(nova.slice(1).map((p) => [p.chave, p.vencimento, p.valorCent, p.era?.valorCent])).toEqual([['b', '2026-12-08', 12000, 10000], ['c', '2027-01-05', 8000, 10000]]);
  });
  it('nota com MENOS duplicatas tira a não paga que sobra; com MAIS, acrescenta no fim', () => {
    const menos = usarDuplicatasDaNota(grade, { ...NOTA, duplicatas: NOTA.duplicatas.slice(0, 2) });
    expect(menos.map((p) => p.chave)).toEqual(['a', 'b']);
    const mais = usarDuplicatasDaNota(grade, { ...NOTA, duplicatas: [...NOTA.duplicatas, { vencimento: '2027-02-05', valorCent: 5000 }] });
    expect(mais.length).toBe(4);
    expect(mais[3]).toMatchObject({ vencimento: '2027-02-05', valorCent: 5000, origem: 'nova', era: null });
    expect(mais[0]).toEqual(grade[0]);
  });
  it('nenhuma duplicata bate com a paga: a paga fica e TODAS as duplicatas vão para as não pagas', () => {
    const n = { ...NOTA, duplicatas: [{ vencimento: '2026-11-11', valorCent: 10000 }, { vencimento: '2026-12-08', valorCent: 20000 }] };
    const nova = usarDuplicatasDaNota(grade, n);
    expect(nova.map((p) => [p.chave, p.vencimento, p.valorCent])).toEqual([['a', '2026-11-10', 10000], ['b', '2026-11-11', 10000], ['c', '2026-12-08', 20000]]);
  });
});
