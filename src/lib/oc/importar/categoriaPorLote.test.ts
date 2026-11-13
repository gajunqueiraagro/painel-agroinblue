/**
 * Chat 13/11 12:39 — bois da Pureza × Fortunceres: com a categoria escolhida nos 2 lotes (Garrotes), o Criar ficava apagado com
 * "Responda as dúvidas: Categoria que saiu". A mesma regra do peso: com TODOS os lotes com categoria, a geral não é obrigatória — o
 * pacote leva a do lote 1 como geral (o banco exige a geral e só a usa para o lote sem a dele).
 */
import { describe, it, expect } from 'vitest';
import { entradaDoImport, lerDocumentosDoImport, type PdfDoImport, type Respostas } from './leituraDoImport';
import { montarPacoteDoAbate } from './pacoteDoAbate';
import {
  ACERTO_FORT_LT01_REAL, ACERTO_FORT_LT02_REAL, NF_FORT_LT02_REAL, ROMANEIO_FORT_LT01_REAL, ROMANEIO_FORT_LT02_REAL,
} from '@/lib/oc/leitura/__fixtures__/linhasFortuncereNjReal';

const pdf = (nome: string, linhas: readonly string[]): PdfDoImport => ({ nome, linhas: [...linhas], temTexto: true });
const PDFS = [pdf('ACERTO_LT01.pdf', ACERTO_FORT_LT01_REAL), pdf('ROMANEIO_LT01.pdf', ROMANEIO_FORT_LT01_REAL),
  pdf('ACERTO_LT02.pdf', ACERTO_FORT_LT02_REAL), pdf('NF_LT02.pdf', NF_FORT_LT02_REAL), pdf('ROMANEIO_LT02.pdf', ROMANEIO_FORT_LT02_REAL)];
const BASE: Respostas = { fazendaId: 'faz-1', contraparteId: 'fortunceres', contraparteNome: 'Fortunceres', categoria: null, pesoVivoMedioKg: 550 };
const montar = (r: Partial<Respostas>) => {
  const { documentos, cnpjFrigorifico } = lerDocumentosDoImport(PDFS);
  const { entrada, falta } = entradaDoImport(documentos, { ...BASE, ...r }, cnpjFrigorifico);
  if (!entrada) throw new Error(`sem entrada: ${falta}`);
  return montarPacoteDoAbate(entrada);
};

describe('categoria por lote sem a geral', () => {
  it('os 2 lotes com Garrotes e a geral vazia: não há dúvida; a geral do pacote é a do lote 1', () => {
    const m = montar({ categoriasPorLote: { 1: 'garrotes', 2: 'garrotes' } });
    expect(m.duvidas).toEqual([]);
    expect(m.pacote?.categoria).toBe('garrotes');
    expect(m.pacote?.lotes.map(l => l.categoria)).toEqual([undefined, undefined]);
  });
  it('lotes com categorias diferentes e a geral vazia: a do lote 1 vai como geral, o lote 2 leva a dele', () => {
    const m = montar({ categoriasPorLote: { 1: 'garrotes', 2: 'bois' } });
    expect(m.duvidas).toEqual([]);
    expect(m.pacote?.categoria).toBe('garrotes');
    expect(m.pacote?.lotes.map(l => l.categoria)).toEqual([undefined, 'bois']);
  });
  it('a geral vazia e um lote sem categoria: segue a dúvida (nada é montado)', () => {
    const m = montar({ categoriasPorLote: { 1: 'garrotes' } });
    expect(m.duvidas).toEqual(['categoria']);
    expect(m.pacote).toBeNull();
  });
  it('com a geral escolhida: como antes (a geral manda; o lote só leva a dele quando difere)', () => {
    const m = montar({ categoria: 'bois', categoriasPorLote: { 2: 'garrotes' } });
    expect(m.duvidas).toEqual([]);
    expect(m.pacote?.categoria).toBe('bois');
    expect(m.pacote?.lotes.map(l => l.categoria)).toEqual([undefined, 'garrotes']);
  });
});
