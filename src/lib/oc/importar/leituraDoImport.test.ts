/**
 * IMPORTAR-ABATE-01 — a tela de importar com o caso real SM-LT06 (Minerva José Bonifácio, OC 77562, abate 10/11/2026): os 3 PDFs em
 * qualquer ordem → a espécie de cada um, o CNPJ do frigorífico, a entrada do pacote e o pacote (com o centavo do acerto EXPLÍCITO).
 */
import { describe, it, expect } from 'vitest';
import { entradaDoImport, fazendaPelaNf, lerDocumentosDoImport, remetenteDaNfFrigorifico, type PdfDoImport } from './leituraDoImport';
import { montarPacoteDoAbate } from './pacoteDoAbate';
import { ACERTO_SM_LT06_REAL, NF_SM_LT06_REAL, ROMANEIO_SM_LT06_REAL } from '@/lib/oc/leitura/__fixtures__/linhasSmLt06Real';

const pdf = (nome: string, linhas: readonly string[]): PdfDoImport => ({ nome, linhas: [...linhas], temTexto: true });
const PDFS = [pdf('ROMANEIO.pdf', ROMANEIO_SM_LT06_REAL), pdf('ACERTO.pdf', ACERTO_SM_LT06_REAL), pdf('NF.pdf', NF_SM_LT06_REAL)];
const RESP = { fazendaId: 'faz-1', contraparteId: 'minerva-jb', contraparteNome: 'Minerva S.A.', categoria: 'boi', pesoVivoMedioKg: 520 };

describe('SM-LT06 — os 3 PDFs na tela de importar', () => {
  it('cada PDF na sua espécie, em qualquer ordem; o CNPJ do frigorífico vem da NF/acerto e libera o romaneio', () => {
    const { documentos, cnpjFrigorifico } = lerDocumentosDoImport(PDFS);
    expect(documentos.map(d => [d.nome, d.especie, d.leitura.tipo])).toEqual([
      ['ROMANEIO.pdf', 'romaneio', 'lido'], ['ACERTO.pdf', 'acerto', 'lido'], ['NF.pdf', 'nf_principal', 'lido'],
    ]);
    expect((cnpjFrigorifico ?? '').replace(/\D/g, '')).toBe('67620377000386');
  });

  it('a entrada vira o pacote: 3 lotes, recebimento 119.531,53, o centavo no acerto, os 3 documentos sem `lotes`', () => {
    const { documentos, cnpjFrigorifico } = lerDocumentosDoImport(PDFS);
    const { entrada, falta } = entradaDoImport(documentos, RESP, cnpjFrigorifico);
    expect(falta).toBeNull();
    if (!entrada) throw new Error('sem entrada');
    const m = montarPacoteDoAbate(entrada);
    expect(m.duvidas).toEqual([]);
    expect(m.pacote?.lotes.map(l => l.cab)).toEqual([10, 6, 1]);
    expect(m.pacote?.recebimento.valor).toBe(119531.53);
    expect(m.pacote?.diferenca_acerto?.valor).toBe(0.01);
    const docs = m.pacote?.documentos ?? [];
    expect(docs.map(d => d.especie)).toEqual(['romaneio', 'acerto', 'nf_principal']);
    expect(docs.every(d => !('lotes' in d))).toBe(true);
    const acerto = docs.find(d => d.especie === 'acerto');
    expect(JSON.stringify(acerto?.componentes)).toContain('"tipo":"diferenca_acerto"');
    expect(String(docs.find(d => d.especie === 'nf_principal')?.chave_acesso ?? '').replace(/\D/g, '')).toBe('35261167620377000386550020000458541005675430');
    expect(docs.find(d => d.especie === 'nf_principal')?.emitente_id).toBe('minerva-jb');
  });

  it('sem o acerto não há pacote (é ele que tem as faixas e o líquido)', () => {
    const { documentos, cnpjFrigorifico } = lerDocumentosDoImport([PDFS[0], PDFS[2]]);
    expect(entradaDoImport(documentos, RESP, cnpjFrigorifico)).toEqual({ entrada: null, falta: 'acerto' });
  });
});

describe('a fazenda pela NF do frigorífico (o produtor é o remetente)', () => {
  const rem = remetenteDaNfFrigorifico(NF_SM_LT06_REAL);
  it('lê nome, IE e endereço do quadro Destinatário / Remetente', () => {
    expect(rem).toEqual({ nome: 'PRODUTOR TESTE', ie: '000000000000', endereco: 'FAZENDA TESTE, S/N' });
  });
  it('pela IE do cadastro; sem IE que case, pelo nome no endereço (só se for UMA)', () => {
    const FAZ = [{ id: 'f-teste', nome: 'Faz. Teste', ie: '000.000.000.000' }, { id: 'f-outra', nome: 'Faz. Outra', ie: '111' }];
    expect(fazendaPelaNf(rem, FAZ)).toEqual({ fazenda: FAZ[0], pela: 'ie' });
    const semIe = [{ id: 'f-teste', nome: 'Faz. Teste', ie: null }, { id: 'f-outra', nome: 'Faz. Outra', ie: null }];
    expect(fazendaPelaNf(rem, semIe)).toEqual({ fazenda: semIe[0], pela: 'endereco' });
    expect(fazendaPelaNf(rem, [{ id: 'x', nome: 'Faz. Outra', ie: '222' }])).toBeNull();
  });
});
