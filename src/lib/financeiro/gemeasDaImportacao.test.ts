/**
 * P140 — a GÊMEA de outro arquivo (`gemeasDaImportacao`): os desenhos da FASE 0 (`valores-20261028-1851-P140-fase0.md`) em dado sintético.
 * A gêmea é a COINCIDÊNCIA com uma linha viva que nada do arquivo novo reivindicou e cujo dia está no período do arquivo.
 */
import { describe, it, expect } from 'vitest';
import { gemeasDaImportacao, tituloDaGemea, extrasDasVivas, nomesDosArquivos } from './duplicidadeImportacao';

const DIAS = new Map<string, string | null>([['x1', '2031-09-10'], ['x2', '2031-09-10'], ['x9', '2031-08-31']]);
const PERIODO = { inicio: '2031-09-01', fim: '2031-09-30' };

describe('gemeasDaImportacao', () => {
  it('a gêmea: COINCIDÊNCIA com uma linha viva não reivindicada, no período do arquivo (o caso da Santa Rita)', () => {
    const g = gemeasDaImportacao([{ chave: '0', dupClassificacao: 'COINCIDENCIA_POSSIVEL', dupExistenteId: 'x1' }], new Set(), DIAS, PERIODO);
    expect([...g]).toEqual(['0']);
  });
  it('a linha viva que o arquivo novo traz (hash, FORTE, PROVÁVEL ou chave natural) não é sobra: não há gêmea', () => {
    const g = gemeasDaImportacao([{ chave: '0', dupClassificacao: 'COINCIDENCIA_POSSIVEL', dupExistenteId: 'x1' }], new Set(['x1']), DIAS, PERIODO);
    expect(g.size).toBe(0);
  });
  it('o dia da linha viva fora do período do arquivo: não é gêmea', () => {
    const g = gemeasDaImportacao([{ chave: '0', dupClassificacao: 'COINCIDENCIA_POSSIVEL', dupExistenteId: 'x9' }], new Set(), DIAS, PERIODO);
    expect(g.size).toBe(0);
  });
  it('só a COINCIDÊNCIA vira gêmea: FORTE, PROVÁVEL e a linha sem suspeita ficam como estão', () => {
    const g = gemeasDaImportacao([
      { chave: '0', dupClassificacao: 'FORTE', dupExistenteId: 'x1' },
      { chave: '1', dupClassificacao: 'PROVAVEL', dupExistenteId: 'x2' },
      { chave: '2', dupClassificacao: null, dupExistenteId: null },
    ], new Set(), DIAS, PERIODO);
    expect(g.size).toBe(0);
  });
  it('2 novas × 1 sobra = 1 gêmea (o pareamento é um a um: a 2ª não tem linha viva para reivindicar)', () => {
    const g = gemeasDaImportacao([
      { chave: '0', dupClassificacao: 'COINCIDENCIA_POSSIVEL', dupExistenteId: 'x1' },
      { chave: '1', dupClassificacao: null, dupExistenteId: null },
    ], new Set(), DIAS, PERIODO);
    expect([...g]).toEqual(['0']);
  });
  it('sem período declarado (os extremos nulos): o dia da linha viva basta', () => {
    expect(gemeasDaImportacao([{ chave: '0', dupClassificacao: 'COINCIDENCIA_POSSIVEL', dupExistenteId: 'x9' }], new Set(), DIAS,
      { inicio: null, fim: null }).size).toBe(1);
  });
});

describe('o title e os leitores da gêmea', () => {
  it('o title diz o que está no extrato, de que arquivo, quando entrou, se está conciliada e o que acontece', () => {
    expect(tituloDaGemea({ descricao: 'Resg Automatico Investim', documento: '0100926', arquivo: 'extrato-ago.ofx', gravadaEm: '2031-09-11T10:00:00Z',
      conciliada: true, importar: false })).toBe([
      'Parece a MESMA linha de um arquivo anterior: o banco mudou o texto ou o documento.',
      'No extrato: Resg Automatico Investim (doc 0100926) · arquivo extrato-ago.ofx · gravada em 11/09/2031 · já conciliada.',
      'Não será importada — marque se for movimento novo mesmo.',
    ].join('\n'));
    expect(tituloDaGemea({ descricao: null, documento: null, arquivo: null, gravadaEm: null, conciliada: false, importar: true }))
      .toContain('No extrato: — · ainda não conciliada.\nSerá importada');
  });
  it('os leitores não confiam no formato: o que não é linha válida sai', () => {
    const x = extrasDasVivas([{ id: 'x1', importacao_id: 'imp', created_at: '2031-09-11', status: 'conciliado', seq_ocorrencia: 1 }, { sem: 'id' }, null, 'lixo']);
    expect([...x.entries()]).toEqual([['x1', { importacaoId: 'imp', criadoEm: '2031-09-11', status: 'conciliado', seq: 1 }]]);
    expect(extrasDasVivas(null).size).toBe(0);
    expect([...nomesDosArquivos([{ id: 'imp', nome_arquivo: 'a.ofx' }, { id: 'sem-nome', nome_arquivo: null }]).entries()]).toEqual([['imp', 'a.ofx']]);
  });
});
