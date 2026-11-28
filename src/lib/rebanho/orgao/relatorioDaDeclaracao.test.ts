/**
 * REBANHO-ORGAO-01 F3 v3 — o relatório de sugestão (as linhas puras do Excel/PDF). Dados SINTÉTICOS.
 */
import { describe, it, expect } from 'vitest';
import { AVISO_DO_RELATORIO, linhasDaTabela, linhasDasDiferencas, type Relatorio } from './relatorioDaDeclaracao';
import type { LinhaDaProposta, PropostaDaFazenda } from './propostaDaDeclaracao';

const L = (faixa: 0 | 1 | 2 | 3, iagro: number, proposto: number | null, extra: Partial<LinhaDaProposta> = {}): LinhaDaProposta => ({
  faixa, iagro, nascimentos: faixa === 0 ? 10 : null, mortesConsumo: 0, passa: faixa === 3 ? null : 0, entra: 0, proposto,
  sugerido: { nascimentos: null, mortesConsumo: 0, passa: null }, ...extra,
});
const P: PropostaDaFazenda = {
  fazendaId: 'fz', recusas: [], avisos: [],
  linhas: { F: [L(0, 7, 17), L(1, 12, 12), L(2, 201, null, { passa: null }), L(3, 364, null)], M: [L(0, 0, 10), L(1, 0, 0), L(2, 0, 0), L(3, 17, 15, { mortesConsumo: 2 })] },
  sistema: { F: [{ de: 0, ate: 0, cab: 11, proposto: 17, dif: -6 }, { de: 1, ate: 3, cab: 554, proposto: 575, dif: -21 }],
    M: [{ de: 0, ate: 0, cab: 10, proposto: 10, dif: 0 }, { de: 1, ate: 1, cab: 0, proposto: 0, dif: 0 }, { de: 2, ate: 2, cab: 0, proposto: 0, dif: 0 },
      { de: 3, ate: 3, cab: 14, proposto: 15, dif: -1 }] },
};
const R: Relatorio = { cliente: 'Cliente Sintético', etapa: 'novembro/2026', orgao: 'IAGRO (MS)', emitidoEm: '27/11/2026', fazendas: [
  { nome: 'Fazenda Sintética', dataDoSaldo: '23/11/2026', proposta: P, explicacoes: [
    { classe: 'e', fazendaId: 'fz', sexo: null, cab: -2, texto: 'Saída de 20 cab × eGTA de 18.' },
    { classe: 'd', fazendaId: 'fz', sexo: 'M', cab: 1, texto: 'Touro declarado como fêmea.' },
  ] },
  { nome: 'Sem Gado', dataDoSaldo: null, proposta: null, explicacoes: [] },
] };

describe('o relatório de sugestão', () => {
  it('as diferenças: só as ≠ 0, com as causas do sexo (e as sem sexo); sem causa diz que não há, nunca inventa', () => {
    const d = linhasDasDiferencas(R);
    expect(d.map((x) => x.slice(0, 3))).toEqual([
      ['Fazenda Sintética', 'Fêmea 0 a 12 meses', '-6'], ['Fazenda Sintética', 'Fêmea 13 a 24 meses a acima de 36 meses', '-21'],
      ['Fazenda Sintética', 'Macho acima de 36 meses', '-1']]);
    expect(d[0][3]).toBe('(GTA/nota ≠ embarque) Saída de 20 cab × eGTA de 18.');
    expect(d[2][3]).toMatch(/\(sexo\/faixa declarado antes\) Touro declarado como fêmea\./);
    const semCausa = linhasDasDiferencas({ ...R, fazendas: [{ ...R.fazendas[0], explicacoes: [] }] });
    expect(semCausa[0][3]).toBe('sem causa no sistema');
  });
  it('a tabela: "—" sem número, o bloco do sistema numa linha só, faixa 36+ sem "passa"', () => {
    const t = linhasDaTabela(P);
    expect(t).toHaveLength(8);
    expect(t[1].slice(8)).toEqual(['554 (bloco)', '-21']);
    expect(t[2].slice(8)).toEqual(['', '']);
    expect(t[2][7]).toBe('—');
    expect(t[3][5]).toBe('—');
    expect(t[7].slice(2)).toEqual(['17', '—', '2', '—', '0', '15', '14', '-1']);
  });
  it('o aviso: o sistema sugere, quem declara é o produtor ou o contador', () => {
    expect(AVISO_DO_RELATORIO).toMatch(/quem declara ao órgão é o produtor ou o contador/);
  });
});
