/**
 * REBANHO-ORGAO-01 F3 v3 — a escolha da etapa (ano + mês), o status da fazenda e a conta congelada (dados SINTÉTICOS).
 */
import { describe, it, expect } from 'vitest';
import {
  anosDasEtapas, etapaDe, etapaEncerrada, etapasDeDeclaracao, mesDaEtapa, mesesDasEtapas, propostaCongelada, statusDaFazenda,
} from './etapaDaTela';
import type { EtapaDoOrgao } from './montarDeclaracao';

const E = (id: string, inicio: string, fim: string, tipo: EtapaDoOrgao['tipo'] = 'declaracao', uf = 'MS', prorrogadoAte: string | null = null): EtapaDoOrgao =>
  ({ id, uf, orgao: 'IAGRO', tipo, inicio, fim, prorrogadoAte });
const ETAPAS = [E('n26', '2026-11-01', '2026-11-30'), E('m26', '2026-05-01', '2026-05-31', 'declaracao', 'MS', '2026-06-02'),
  E('b26', '2026-07-01', '2026-12-31', 'brucelose'), E('m25', '2025-05-01', '2025-05-31'), E('go', '2026-05-01', '2026-05-31', 'declaracao', 'GO')];

describe('a etapa da tela', () => {
  it('só as de declaração da UF, em ordem; anos (mais novo primeiro) e meses (do calendário)', () => {
    const es = etapasDeDeclaracao(ETAPAS, 'MS');
    expect(es.map((e) => e.id)).toEqual(['m25', 'm26', 'n26']);
    expect(anosDasEtapas(es)).toEqual(['2026', '2025']);
    expect(mesesDasEtapas(es)).toEqual(['maio', 'novembro']);
    expect(mesDaEtapa(es[2])).toBe('novembro');
    expect(etapaDe(es, '2026', 'maio')?.id).toBe('m26');
    expect(etapaDe(es, '2025', 'novembro')).toBeNull();
    expect(etapasDeDeclaracao(ETAPAS, null)).toEqual([]);
  });
  it('encerrada = o prazo (com a prorrogação) passou', () => {
    const m26 = etapaDe(etapasDeDeclaracao(ETAPAS, 'MS'), '2026', 'maio');
    expect(m26 && etapaEncerrada(m26, '2026-06-02')).toBe(false);
    expect(m26 && etapaEncerrada(m26, '2026-06-03')).toBe(true);
  });
});

describe('o status da fazenda', () => {
  it('declarada > sem rebanho (comprovante E sistema sem bovino) > a declarar', () => {
    expect(statusDaFazenda({ declarada: true, bovinosNoComprovante: 0, bovinosNoSistema: 0 })).toBe('declarada');
    expect(statusDaFazenda({ declarada: false, bovinosNoComprovante: null, bovinosNoSistema: 0 })).toBe('sem_rebanho');
    expect(statusDaFazenda({ declarada: false, bovinosNoComprovante: 3, bovinosNoSistema: 0 })).toBe('a_declarar');
    expect(statusDaFazenda({ declarada: false, bovinosNoComprovante: 0, bovinosNoSistema: 1 })).toBe('a_declarar');
  });
});

describe('a conta congelada', () => {
  const L = (faixa: number) => ({ faixa, iagro: 10, nascimentos: faixa === 0 ? 5 : null, mortesConsumo: 0, passa: faixa === 3 ? null : 0, entra: 0, proposto: 10,
    sugerido: { nascimentos: null, mortesConsumo: 0, passa: null } });
  const ok = { referencia: '2026-11-30', desde: '2026-05-04', linhas: { F: [0, 1, 2, 3].map(L), M: [0, 1, 2, 3].map(L) },
    sistema: { F: [{ de: 0, ate: 0, cab: 10, proposto: 10, dif: 0 }, { de: 1, ate: 3, cab: 30, proposto: 30, dif: 0 }], M: [] } };
  it('volta igual do banco', () => {
    const p = propostaCongelada(JSON.parse(JSON.stringify(ok)));
    expect(p?.linhas.F[0].nascimentos).toBe(5);
    expect(p?.sistema.F[1]).toEqual({ de: 1, ate: 3, cab: 30, proposto: 30, dif: 0 });
    expect(p?.referencia).toBe('2026-11-30');
  });
  it('forma errada = null (faixa fora, linha faltando, campo de texto no lugar de número)', () => {
    expect(propostaCongelada({ ...ok, linhas: { ...ok.linhas, F: ok.linhas.F.slice(0, 3) } })).toBeNull();
    expect(propostaCongelada({ ...ok, linhas: { ...ok.linhas, M: [...ok.linhas.M.slice(0, 3), { ...L(3), faixa: 7 }] } })).toBeNull();
    expect(propostaCongelada({ ...ok, sistema: { F: [{ de: 0, ate: 0, cab: '10' }], M: [] } })).toBeNull();
    expect(propostaCongelada(null)).toBeNull();
  });
});
