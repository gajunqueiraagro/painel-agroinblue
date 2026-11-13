/**
 * IMPORTAR-ABATE-01 proposta A (Chat 12/11 18:35; banco 117537) — o caso real da Fortunceres (NJ, abate 12/11/2026, anonimizado): DOIS
 * acertos no mesmo abate → DOIS lotes na mesma OC; o incentivo Proape-Precoce é CRÉDITO (dentro do líquido do lote, nunca despesa); a NF
 * e o romaneio de cada acerto ligados só ao lote dele; a NF que falta (a 9218 do lote 1) é AVISO.
 */
import { describe, it, expect } from 'vitest';
import { documentoDoPdf, entradaDoImport, lerDocumentosDoImport, marcaDoPdf, type PdfDoImport } from './leituraDoImport';
import { detalhesDoAcertoMinerva } from './detalhesMinerva';
import { montarPacoteDoAbate } from './pacoteDoAbate';
import {
  ACERTO_FORT_LT01_REAL, ACERTO_FORT_LT02_REAL, NF_FORT_LT02_REAL, ROMANEIO_FORT_LT01_REAL, ROMANEIO_FORT_LT02_REAL,
} from '@/lib/oc/leitura/__fixtures__/linhasFortuncereNjReal';

const pdf = (nome: string, linhas: readonly string[]): PdfDoImport => ({ nome, linhas: [...linhas], temTexto: true });
/* em ordem embaralhada: o lote 2 primeiro */
const PDFS = [pdf('ROMANEIO_LT02.pdf', ROMANEIO_FORT_LT02_REAL), pdf('ACERTO_LT02.pdf', ACERTO_FORT_LT02_REAL), pdf('NF_LT02.pdf', NF_FORT_LT02_REAL),
  pdf('ACERTO_LT01.pdf', ACERTO_FORT_LT01_REAL), pdf('ROMANEIO_LT01.pdf', ROMANEIO_FORT_LT01_REAL)];
const RESP = { fazendaId: 'faz-1', contraparteId: 'fortunceres', contraparteNome: 'Fortunceres', categoria: 'bois', pesoVivoMedioKg: 550 };
const montar = (pdfs = PDFS) => {
  const { documentos, cnpjFrigorifico } = lerDocumentosDoImport(pdfs);
  const { entrada, falta } = entradaDoImport(documentos, RESP, cnpjFrigorifico);
  if (!entrada) throw new Error(`sem entrada: ${falta}`);
  return montarPacoteDoAbate(entrada);
};

describe('acerto da Fortunceres: crédito e preço composto', () => {
  it('o incentivo é CRÉDITO, não despesa; o preço composto 385,25 + 5,00 + 5,7788', () => {
    const d = detalhesDoAcertoMinerva(ACERTO_FORT_LT01_REAL);
    expect(d?.despesas).toEqual([{ tipo: 'senar', descricao: 'SENAR (0,2%)', valor: 590.9 }]);
    expect(d?.creditos).toEqual([{ descricao: 'INCENTIVO PROAPE-PRECOCE/MS', valor: 8491.8 }]);
    expect(d?.composicaoDoPreco).toEqual({ base: 385.25, idade: 5, programa: 5.7788 });
  });
});

describe('Fortunceres 12/11 — os 2 acertos viram 2 lotes da MESMA OC', () => {
  it('lote 1 = ordem 10770 (36 cab), lote 2 = 10771 (18 cab); líquido de cada um = o do acerto; a receber 447.261,84 em 16/11', () => {
    const m = montar();
    expect(m.recusa).toBeNull();
    expect(m.duvidas).toEqual([]);
    const p = m.pacote;
    if (!p) throw new Error('sem pacote');
    expect(p.lotes.map(l => [l.ordem, l.cab, l.peso_carcaca_kg, l.senar, l.funrural, l.incentivo, l.valor_liquido])).toEqual([
      [1, 36, 11190.5, 590.9, 0, 8491.8, 303351.55], [2, 18, 5309, 280.34, 0, 4022.85, 143910.29]]);
    expect(p.recebimento).toEqual({ valor: 447261.84, vencimento: '2026-11-16', documento: 'NF 9219', observacao: 'Líquido dos 2 acertos do frigorífico.' });
    expect(p.lotes[0].observacao).toBe('Ordem de compra 10770 · faixa do acerto: Bois Normal (3162414 - 0002/2026) - Indicador - Angus · @ 385,25 + idade 5,00 + programa 5,7788');
    expect(p.chave_nf).toBe('50261152168923000231550020000092191000451503');
    expect(p.diferenca_acerto).toBeUndefined();
  });

  it('cada documento no lote dele (lote_ordem); a NF 9219 é do lote 2; falta a NF do lote 1 = AVISO', () => {
    const m = montar();
    const docs = (m.pacote?.documentos ?? []).map(d => [d.especie, d.numero ?? null, d.lote_ordem]);
    expect(docs).toEqual([['romaneio', null, 2], ['acerto', null, 2], ['nf_principal', '9219', 2], ['acerto', null, 1], ['romaneio', null, 1]]);
    expect(m.avisos).toEqual(['Falta a NF do frigorífico do lote 1 (ordem de compra 10770): esse lote não é conferido com a NF.']);
  });

  it('a conferência do banco (117537) fecha: por NF, líquido + retenções − incentivo = bruto; Σ lotes = a receber', () => {
    const p = montar().pacote;
    if (!p) throw new Error('sem pacote');
    const cent = (n: number) => Math.round(n * 100);
    const nf = p.documentos.find(d => d.especie === 'nf_principal');
    const comps = Array.isArray(nf?.componentes) ? nf.componentes : [];
    const bruto = comps.find((c: { tipo?: string }) => c.tipo === 'valor_bruto')?.valor;
    const l2 = p.lotes[1];
    expect(cent(l2.valor_liquido + l2.senar + l2.funrural - (l2.incentivo ?? 0))).toBe(cent(Number(bruto)));
    expect(p.lotes.reduce((a, l) => a + cent(l.valor_liquido), 0)).toBe(cent(p.recebimento.valor));
  });

  it('com a NF do lote 1 faltando E sem o romaneio do lote 2: ainda monta; o aviso continua', () => {
    const m = montar(PDFS.filter(x => x.nome !== 'ROMANEIO_LT02.pdf'));
    expect(m.pacote?.lotes.map(l => l.cab)).toEqual([36, 18]);
    expect(m.avisos?.length).toBe(1);
  });
});

describe('o PDF sobe no documento DELE', () => {
  it('2 acertos e 2 romaneios com a lista do banco fora de ordem: cada PDF no documento das suas cabeças e kg', () => {
    const { documentos } = lerDocumentosDoImport(PDFS);
    const banco = [
      { documentoId: 'ac-36', especie: 'acerto', numero: null, cab: 36, pesoKg: 11190.5, cancelado: false },
      { documentoId: 'ac-18', especie: 'acerto', numero: null, cab: 18, pesoKg: 5309, cancelado: false },
      { documentoId: 'ro-18', especie: 'romaneio', numero: null, cab: 18, pesoKg: 5309, cancelado: false },
      { documentoId: 'ro-36', especie: 'romaneio', numero: null, cab: 36, pesoKg: 11190.5, cancelado: false },
      { documentoId: 'nf-9219', especie: 'nf_principal', numero: '9219', cab: 18, pesoKg: 5309, cancelado: false },
    ];
    const usados = new Set<string>();
    const pares = documentos.map(d => {
      const m = marcaDoPdf(d);
      const doc = m ? documentoDoPdf(m, banco, usados) : null;
      if (doc) usados.add(doc.documentoId);
      return [d.nome, doc?.documentoId ?? null];
    });
    expect(pares).toEqual([['ROMANEIO_LT02.pdf', 'ro-18'], ['ACERTO_LT02.pdf', 'ac-18'], ['NF_LT02.pdf', 'nf-9219'], ['ACERTO_LT01.pdf', 'ac-36'], ['ROMANEIO_LT01.pdf', 'ro-36']]);
  });
});
