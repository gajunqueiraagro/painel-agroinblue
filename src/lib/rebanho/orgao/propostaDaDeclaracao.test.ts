/**
 * REBANHO-ORGAO-01 (F2) — a conta da declaração (R1–R5, R7). Um cliente FICTÍCIO com 2 fazendas (A e B), referência 30/11/2026, última
 * declaração em 04/05/2026, nascimentos lançados desde 07/2024. Cada número esperado está conferido à mão no comentário.
 */
import { describe, it, expect } from 'vitest';
import { faixaNaData, mesesCompletos } from './tipos';
import { nascimentosComSexo, propostaDaDeclaracao, type EntradaDaProposta, type NascimentoLancado } from './propostaDaDeclaracao';

const N = (fazendaId: string, data: string, categoria: string, cab: number): NascimentoLancado => ({ fazendaId, data, categoria, cab });
const BASE: EntradaDaProposta = {
  referencia: '2026-11-30', desde: '2026-05-04',
  fazendas: [
    { id: 'A', iagro: { F: [50, 30, 20, 10], M: [40, 5, 0, 2] }, jaDeclarado: null,
      rebanhoHoje: [{ categoria: 'mamotes_f', cab: 2 }, { categoria: 'desmama_f', cab: 40 }, { categoria: 'novilhas', cab: 60 }, { categoria: 'vacas', cab: 10 }] },
    { id: 'B', iagro: { F: [3, 0, 0, 0], M: [0, 0, 0, 1] }, jaDeclarado: null,
      rebanhoHoje: [{ categoria: 'mamotes_f', cab: 6 }, { categoria: 'desmama_f', cab: 3 }, { categoria: 'touros', cab: 1 }] },
  ],
  nascimentos: [
    N('A', '2024-07-01', 'mamotes_m', 1),                                 // o 1º nascimento lançado (07/2024)
    N('A', '2024-08-01', 'mamotes_f', 25), N('A', '2024-12-01', 'mamotes_f', 5),
    N('A', '2025-08-01', 'mamotes_f', 20), N('A', '2025-12-01', 'mamotes_f', 4), N('B', '2025-11-01', 'mamotes_f', 10),
    N('A', '2026-05-01', 'mamotes_f', 1),                                 // ANTES da declaração de 04/05 (já declarado)
    N('A', '2026-05-20', 'mamotes_f', 2),                                 // DEPOIS (no mesmo mês): é desta etapa
    N('B', '2026-08-01', 'mamotes_f', 6),
  ],
  reclassificacoes: [],
  mortesConsumo: [{ fazendaId: 'A', data: '2026-06-13', tipo: 'consumo', categoria: 'desmama_f', cab: 1 }],
  ajustes: [],
};

describe('R1 — a idade em meses completos, pelo mês de nascimento', () => {
  it('nascido em 11/2025 tem 12 meses em 30/11/2026 (0-12); em 10/2025, 13 (13-24); 10/2023, 37 (acima de 36)', () => {
    expect(mesesCompletos('2025-11', '2026-11-30')).toBe(12);
    expect(faixaNaData('2025-11', '2026-11-30')).toBe(0);
    expect(faixaNaData('2025-10', '2026-11-30')).toBe(1);
    expect(faixaNaData('2024-11', '2026-11-30')).toBe(1);
    expect(faixaNaData('2024-10', '2026-11-30')).toBe(2);
    expect(faixaNaData('2023-11', '2026-11-30')).toBe(2);
    expect(faixaNaData('2023-10', '2026-11-30')).toBe(3);
  });
});

describe('R2/R3/R5 — a proposta das 2 fazendas', () => {
  const r = propostaDaDeclaracao(BASE);
  const A = r.fazendas[0]; const B = r.fazendas[1];
  it('nascimentos da etapa pela DATA: o de 20/05 entra, o de 01/05 (antes da declaração de 04/05) não', () => {
    expect(A.linhas.F[0].nascimentos).toBe(2);
    expect(B.linhas.F[0].nascimentos).toBe(6);
  });
  it('0-12 → 13-24: ficam os nascidos registrados que ainda têm até 12 meses — primeiro na fazenda onde nasceram, a sobra na outra', () => {
    /* ficam: A 12/25 (4) + 05/26-01 (1) = 5; B 11/25 (10), mas a B só tem 3 no órgão → 3 ficam lá e 7 vão para a A → A fica com 12.
       A: balde = 50 − 1 consumo = 49 → passa 49 − 12 = 37. B: 3 − 3 = 0. */
    expect(A.linhas.F[0].passa).toBe(37);
    expect(B.linhas.F[0].passa).toBe(0);
  });
  it('13-24 → 25-36: ficam os nascidos de 11/2024 em diante (A 12/24: 5) → passa 30 − 5 = 25', () => {
    expect(A.linhas.F[1].passa).toBe(25);
  });
  it('25-36 → 37+: a janela de quem fica começa em 11/2023, antes do 1º nascimento lançado (07/2024): EM BRANCO, com aviso', () => {
    expect(A.linhas.F[2].passa).toBeNull();
    expect(A.avisos.some((a) => a.includes('fica em branco'))).toBe(true);
  });
  it('o que passa entra IGUAL na faixa seguinte, e o proposto fecha', () => {
    expect(A.linhas.F.map((l) => [l.entra, l.proposto])).toEqual([[0, 14], [37, 42], [25, 45], [0, 10]]);   // 50+2−1−37 · 30+37−25 · 20+25 · 10
    expect(B.linhas.F.map((l) => l.proposto)).toEqual([9, 0, 0, 0]);
  });
  it('R5: o sistema hoje — 0-12 pelos nascidos registrados; novilha/vaca sem mês de nascimento = UM bloco 13-24…37+ (a Dif. no bloco)', () => {
    /* A 0-12: os 2 da etapa + os antigos que ficam (A 5 + 7 da B) = 14; o bloco: desmama velha 40+2−14 = 28 + novilhas 60 + vacas 10 = 98 */
    expect(A.sistema.F).toEqual([{ de: 0, ate: 0, cab: 14, proposto: 14, dif: 0 }, { de: 1, ate: 3, cab: 98, proposto: 97, dif: 1 }]);
    /* B sem categoria sem faixa: uma faixa por grupo; o touro é 37+ */
    expect(B.sistema.F.map((g) => [g.de, g.ate, g.cab])).toEqual([[0, 0, 9], [1, 1, 0], [2, 2, 0], [3, 3, 0]]);
    expect(B.sistema.M.map((g) => [g.de, g.ate, g.cab, g.dif])).toEqual([[0, 0, 0, 0], [1, 1, 0, 0], [2, 2, 0, 0], [3, 3, 1, 0]]);
  });
  it('sem o comprovante lido, a coluna do órgão é "—" (null), nunca zero', () => {
    const s = propostaDaDeclaracao({ ...BASE, fazendas: [{ ...BASE.fazendas[0], iagro: null }, BASE.fazendas[1]] });
    expect(s.fazendas[0].linhas.F.map((l) => l.iagro)).toEqual([null, null, null, null]);
    expect(s.fazendas[0].linhas.F[0].proposto).toBeNull();
  });
});

describe('R3 — o nascimento: o par N1=B, o parcial, e a troca de sexo do mamote', () => {
  it('nascimento em "garrotes" + reclassificação garrotes → mamotes M no mesmo mês e quantidade = nascimento de MACHO', () => {
    const n = nascimentosComSexo([N('A', '2026-07-01', 'garrotes', 4)], [{ fazendaId: 'A', data: '2026-07-15', de: 'garrotes', para: 'mamotes_m', cab: 4 }]);
    expect(n.map((x) => [x.sexo, x.cab, x.parcial])).toEqual([['M', 4, false]]);
  });
  it('a reclassificação de OUTRO MÊS ou de OUTRA FAZENDA não junta: o nascido em "novilhas" segue FÊMEA (com o par seria macho)', () => {
    const r = (fazendaId: string, data: string) => [{ fazendaId, data, de: 'novilhas', para: 'mamotes_m', cab: 4 }];
    const nasc = [N('A', '2026-07-01', 'novilhas', 4)];
    expect(nascimentosComSexo(nasc, r('A', '2026-07-15')).map((x) => x.sexo)).toEqual(['M']);   // o par exato: controle
    expect(nascimentosComSexo(nasc, r('A', '2026-08-01')).map((x) => x.sexo)).toEqual(['F']);   // outro mês
    expect(nascimentosComSexo(nasc, r('B', '2026-07-15')).map((x) => x.sexo)).toEqual(['F']);   // outra fazenda
  });
  it('quantidade diferente (par parcial) não junta: fica como veio, com aviso', () => {
    const r = propostaDaDeclaracao({ ...BASE, nascimentos: [...BASE.nascimentos, N('A', '2026-07-01', 'novilhas', 5)],
      reclassificacoes: [{ fazendaId: 'A', data: '2026-07-15', de: 'novilhas', para: 'mamotes_f', cab: 3 }] });
    expect(r.fazendas[0].avisos.some((a) => a.startsWith('Nascimento fora de mamote em 2026-07'))).toBe(true);
  });
  it('mamote F reclassificado para mamote M depois de nascer: o nascido entra como MACHO', () => {
    const r = propostaDaDeclaracao({ ...BASE, reclassificacoes: [{ fazendaId: 'B', data: '2026-09-01', de: 'mamotes_f', para: 'mamotes_m', cab: 2 }] });
    expect([r.fazendas[1].linhas.F[0].nascimentos, r.fazendas[1].linhas.M[0].nascimentos]).toEqual([4, 2]);
  });
});

describe('R4 — morte e consumo', () => {
  const mc = (data: string, tipo: 'morte' | 'consumo', categoria: string, cab = 1) => ({ fazendaId: 'A', data, tipo, categoria, cab });
  it('na faixa da categoria; novilha não tem faixa certa (fica de fora, com aviso); a morte de mamote nascido na etapa não tira da faixa antiga', () => {
    const r = propostaDaDeclaracao({ ...BASE, mortesConsumo: [...BASE.mortesConsumo, mc('2026-09-25', 'consumo', 'vacas'), mc('2026-08-01', 'morte', 'novilhas'), mc('2026-07-01', 'morte', 'mamotes_f')] });
    const F = r.fazendas[0].linhas.F;
    expect(F.map((l) => l.mortesConsumo)).toEqual([2, 0, 0, 1]);
    expect(r.fazendas[0].avisos.some((a) => a.includes('novilhas') && a.includes('não sabe a faixa'))).toBe(true);
    /* o mamote morto nasceu na etapa: o balde antigo continua 49 → passa 37 (igual ao cenário sem ele) */
    expect(F[0].passa).toBe(37);
    expect(r.fazendas[0].avisos.some((a) => a.startsWith('Sem o extrato'))).toBe(true);
  });
  it('o que o extrato já mostra declarado sai da coluna', () => {
    const z = (): [number, number, number, number] => [0, 0, 0, 0];
    const ja = { morte: { F: z(), M: z() }, consumo: { F: [1, 0, 0, 0] as [number, number, number, number], M: z() } };
    const r = propostaDaDeclaracao({ ...BASE, fazendas: [{ ...BASE.fazendas[0], jaDeclarado: ja }, BASE.fazendas[1]] });
    expect(r.fazendas[0].linhas.F[0].mortesConsumo).toBe(0);
    expect(r.fazendas[0].avisos.some((a) => a.includes('já declarado'))).toBe(true);
  });
});

describe('editado e faixa negativa', () => {
  it('o editado substitui o sugerido (o sugerido fica para o ↺); passar mais do que há vira recusa', () => {
    const r = propostaDaDeclaracao({ ...BASE, editados: { A: { F: { passa: { 0: 100 } } } } });
    const l = r.fazendas[0].linhas.F[0];
    expect([l.passa, l.sugerido.passa]).toEqual([100, 37]);
    expect(r.fazendas[0].recusas).toEqual(['Fêmeas 0-12: passa 100, mas só há 51.']);
  });
});

describe('R7 — as explicações que o sistema conhece', () => {
  it('ajuste de contagem = (b); troca de sexo de animal já declarado = (d); a do mamote nascido na etapa não (a R3 já declara certo)', () => {
    const r = propostaDaDeclaracao({ ...BASE,
      ajustes: [{ fazendaId: 'B', data: '2026-09-30', sentido: 'entrada', categoria: 'mamotes_f', cab: 30 }, { fazendaId: 'B', data: '2026-01-31', sentido: 'saida', categoria: 'vacas', cab: 5 }],
      reclassificacoes: [{ fazendaId: 'B', data: '2026-07-01', de: 'mamotes_f', para: 'desmama_m', cab: 5 }, { fazendaId: 'B', data: '2026-09-01', de: 'mamotes_f', para: 'mamotes_m', cab: 2 }] });
    expect(r.explicacoes.map((x) => [x.classe, x.fazendaId, x.cab])).toEqual([['b', 'B', 30], ['d', 'B', 5]]);
  });
});
