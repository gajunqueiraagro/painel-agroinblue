/**
 * IMPORTAR-ABATE-PESO-POR-LOTE-01 (Chat 13/11 10:25; banco 117539) — Pureza × Fortunceres 12/11: lote 1 (36 cab, Angus) e lote 2 (18 cab,
 * Charolês) com pesos vivos diferentes. Um campo geral + um por lote: o do lote manda; sem ele, o geral; sem nenhum dos dois, é dúvida.
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
const BASE: Respostas = { fazendaId: 'faz-1', contraparteId: 'fortunceres', contraparteNome: 'Fortunceres', categoria: 'bois', pesoVivoMedioKg: null };
const montar = (r: Partial<Respostas>) => {
  const { documentos, cnpjFrigorifico } = lerDocumentosDoImport(PDFS);
  const { entrada, falta } = entradaDoImport(documentos, { ...BASE, ...r }, cnpjFrigorifico);
  if (!entrada) throw new Error(`sem entrada: ${falta}`);
  return montarPacoteDoAbate(entrada);
};

describe('peso vivo por lote', () => {
  it('o do lote manda; o lote sem o dele leva o geral (sem a chave: o banco usa o geral)', () => {
    const m = montar({ pesoVivoMedioKg: 550, pesosPorLote: { 2: 600 } });
    expect(m.duvidas).toEqual([]);
    expect(m.pacote?.peso_vivo_medio_kg).toBe(550);
    expect(m.pacote?.lotes.map(l => l.peso_vivo_kg)).toEqual([undefined, 600]);
  });
  it('sem o geral e com o peso de todos os lotes: não há dúvida', () => {
    const m = montar({ pesosPorLote: { 1: 560, 2: 600 } });
    expect(m.duvidas).toEqual([]);
    expect(m.pacote?.lotes.map(l => l.peso_vivo_kg)).toEqual([560, 600]);
  });
  it('sem o geral e com um lote sem peso: o peso vivo segue como dúvida (nada é montado)', () => {
    const m = montar({ pesosPorLote: { 1: 560 } });
    expect(m.duvidas).toEqual(['peso_vivo']);
    expect(m.pacote).toBeNull();
  });
  it('peso zero no lote não conta como peso (vale o geral)', () => {
    const m = montar({ pesoVivoMedioKg: 550, pesosPorLote: { 1: 0 } });
    expect(m.pacote?.lotes.map(l => l.peso_vivo_kg)).toEqual([undefined, undefined]);
  });
});
