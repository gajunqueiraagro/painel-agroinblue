/**
 * FIN-NOTA-PDF-01 — o DANFE (PDF) lido pela posicao entrega a MESMA `NotaLida` do XML.
 * D1 o DANFE sintetico (as posicoes do real, dados de teste) lido inteiro · D2 a chave confere; cada campo trocado diverge
 * D3 PDF sem texto e PDF que nao e' DANFE · D4 a nota do PDF segue o caminho do XML (`proporLancamento`)
 * D5 o despachante: XML continua no `lerNFe` (mesmo resultado) e "%PDF" vai ao DANFE
 * D6 o PDF REAL da prova (NF 937), lido pelo pdfjs de verdade — so' roda onde o arquivo existe (fora do repo: dado de cliente).
 */
import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { conferirChave, digitoDaChave, notaDoDanfe, centavosBr, type CampoDaMarca, type ItemDoDanfe, type ResultadoDoDanfe } from './danfe';
import { ehPdf, lerNota } from './lerNota';
import { itensDoPdf, type PdfjsMinimo } from './lerNotaPdf';
import { lerNFe } from './lerNFe';
import { proporLancamento } from './proporLancamento';
import { resolverEmitente } from './resolverEmitente';
import { PAGINAS_DANFE_SINTETICO } from './__fixtures__/danfeSintetico';
import { montarNFe, utf8 } from './__fixtures__/notas';

function lida(r: ResultadoDoDanfe) {
  if (r.ok === false) throw new Error(`esperava nota, veio recusa: ${r.frase}`);
  return r;
}
const trocar = (de: string, para: string): ItemDoDanfe[][] => PAGINAS_DANFE_SINTETICO.map((p) => p.map((it) => (it.str === de ? { ...it, str: para } : it)));

describe('D1 — o DANFE sintetico lido inteiro', () => {
  const r = lida(notaDoDanfe(PAGINAS_DANFE_SINTETICO));
  it('nota, emitente, destinatario, totais, duplicatas, itens e protocolo', () => {
    const n = r.nota;
    expect(n.chave).toBe('50260911222333000424550100000009371217538298');
    expect([n.numero, n.serie, n.emissao, n.saidaEntrada, n.tipoNota, n.modelo]).toEqual(['937', '10', '2026-09-15', '2026-09-15', 'saida', '55']);
    expect(n.naturezaOperacao).toBe('VENDA DE MERCADORIA ADQ TERC');
    expect(n.emitente).toEqual({
      documento: '11222333000424', nome: 'AGRO SINTETICA INSUMOS AGROPECUARIOS LTD', fantasia: null, ie: '280000001',
      endereco: { logradouro: 'RUA DAS FLORES', numero: '100', complemento: null, bairro: 'CENTRO', municipio: 'CAMPO GRANDE', uf: 'MS', cep: '79000000', telefone: '6730000000' },
    });
    expect(n.destinatario).toEqual({ documento: '11144477735', nome: 'PRODUTOR SINTETICO DE TESTE', ie: '280000002' });
    expect(n.totais).toEqual({ produtosCent: 204000, freteCent: 0, descontoCent: 7344, notaCent: 196656 });
    expect(n.fatura).toEqual({ origCent: 196656, descCent: 0, liqCent: 196656 });
    expect(n.duplicatas).toEqual([
      { numero: '001', vencimento: '2026-10-20', valorCent: 49164 }, { numero: '002', vencimento: '2026-11-20', valorCent: 49164 },
      { numero: '003', vencimento: '2026-12-20', valorCent: 49164 }, { numero: '004', vencimento: '2027-01-20', valorCent: 49164 },
    ]);
    expect(n.somaDuplicatasCent).toBe(196656);
    expect(n.itens.map((i) => [i.descricao, i.quantidade, i.unidade, i.unitarioCent, i.valorCent])).toEqual([
      ['HERBICIDA SINTETICO 5 LT', '1.0000', 'GL', 51000, 51000],
      ['HERBICIDA SINTETICO 5 LT', '2.0000', 'GL', 51000, 102000],
      ['HERBICIDA SINTETICO 5 LT', '1.0000', 'GL', 51000, 51000],
    ]);
    expect(n.itens[0].detalhe).toContain('Lote: 069/24');
    expect(n.protocolo).toEqual({ cStat: '100', numero: '150260000000001' });
    expect(r.avisos).toEqual([]);
  });
  it('produtos − desconto = valor da nota = soma das duplicatas', () => {
    const n = r.nota;
    expect(n.itens.reduce((s, i) => s + i.valorCent, 0) - n.totais.descontoCent).toBe(n.totais.notaCent);
    expect(n.somaDuplicatasCent).toBe(n.totais.notaCent);
  });
  it('as marcas do amarelo: cada campo lido tem o seu retangulo', () => {
    const campos = new Set(r.marcas.map((m) => m.campo));
    const lidos: CampoDaMarca[] = ['emitente', 'emitente_cnpj', 'emitente_ie', 'numero', 'serie', 'chave', 'natureza', 'destinatario', 'emissao', 'duplicatas', 'desconto', 'valor_nota', 'itens'];
    for (const c of lidos) {
      expect(campos.has(c), c).toBe(true);
    }
    expect(r.marcas.filter((m) => m.campo === 'duplicatas')).toHaveLength(4);
    expect(r.marcas.every((m) => m.pagina === 1 && m.w > 0 && m.h > 0)).toBe(true);
  });
});

describe('D2 — a chave de 44 digitos confere o lido', () => {
  const base = lida(notaDoDanfe(PAGINAS_DANFE_SINTETICO)).nota;
  it('o digito verificador (modulo 11) da chave sintetica', () => {
    expect(digitoDaChave(base.chave.slice(0, 43))).toBe(8);
    expect(conferirChave(base)).toEqual([]);
  });
  it.each([
    ['numero', { numero: '938' }],
    ['serie', { serie: '1' }],
    ['mes', { emissao: '2026-10-15' }],
    ['cnpj', { emitente: { ...base.emitente, documento: '11222333000181' } }],
  ])('%s trocado diverge', (campo, patch) => {
    expect(conferirChave({ ...base, ...patch })).toEqual([campo]);
  });
  it('digito errado na chave', () => {
    expect(conferirChave({ ...base, chave: `${base.chave.slice(0, 43)}1` })).toContain('digito');
  });
  it('no PDF: o numero do quadro diferente do da chave volta em `divergencias`', () => {
    const r = lida(notaDoDanfe(trocar('Nº 000.000.937', 'Nº 000.000.938')));
    expect(r.nota.numero).toBe('938');
    expect(r.divergencias).toEqual(['numero']);
  });
});

describe("D3 — o que nao e' lido", () => {
  it('PDF sem texto (foto/escaneado): etapa 2, nada lido', () => {
    const r = notaDoDanfe([[]]);
    expect(r.ok === false && r.motivo).toBe('pdf_sem_texto');
  });
  it("PDF que nao e' DANFE", () => {
    const r = notaDoDanfe([[{ str: 'EXTRATO DE CONTA CORRENTE', x: 10, y: 800, w: 100, h: 8 }]]);
    expect(r.ok === false && r.motivo).toBe('pdf_nao_e_danfe');
  });
  it('centavos brasileiros', () => {
    expect([centavosBr('1.966,56'), centavosBr('510,0000'), centavosBr('0,00'), centavosBr('R$ 491,64'), centavosBr('abc')]).toEqual([196656, 51000, 0, 49164, null]);
  });
});

describe('D4 — a nota do PDF segue o caminho do XML', () => {
  it('proporLancamento: 4 parcelas mensais de 491,64 = 1.966,56; a fazenda pela IE do destinatario', () => {
    const n = lida(notaDoDanfe(PAGINAS_DANFE_SINTETICO)).nota;
    const resolucao = resolverEmitente(n.emitente, [], null);
    const p = proporLancamento({ nota: n, avisosDoLeitor: [], fazendas: [{ id: 'faz-1', nome: 'Faz. Sintetica', ie: '280000002' }], emitente: resolucao, favorecidoId: null, ultima: null });
    if (p.ok === false) throw new Error(p.frase);
    expect(p.proposta.valorCent).toBe(196656);
    expect(p.proposta.parcelamento).toEqual({ tipo: 'parcelado', parcelas: 4, primeiroVencimento: '2026-10-20' });
    expect(p.proposta.fazendaId).toBe('faz-1');
    expect(p.proposta.documento.chaveAcesso).toBe(n.chave);
    expect(resolucao.achadoPor).toBeNull();
  });
});

describe('D5 — o despachante', () => {
  it('XML: o mesmo resultado do lerNFe (regressao)', async () => {
    const bytes = utf8(montarNFe());
    const r = await lerNota(bytes);
    const x = lerNFe(bytes);
    if (r.ok === false || x.ok === false) throw new Error('XML deveria ler');
    expect(r.origem).toBe('xml');
    expect(r.nota).toEqual(x.nota);
    expect(r.avisos).toEqual(x.avisos);
  });
  it('"%PDF" no comeco = PDF', () => {
    expect(ehPdf(new TextEncoder().encode('%PDF-1.4\n').buffer)).toBe(true);
    expect(ehPdf(utf8(montarNFe()))).toBe(false);
  });
  it('PDF danificado: a frase, nada lido', async () => {
    const r = await lerNota(new TextEncoder().encode('%PDF-1.4 lixo').buffer, { pdfjs: { getDocument: () => ({ promise: Promise.reject(new Error('x')) }) } });
    expect(r.ok).toBe(false);
  });
});

const REAL = `${process.env.HOME ?? ''}/agroinblue-local/fin-nota-pdf/000.000.937.pdf`;
describe.skipIf(!existsSync(REAL))('D6 — o PDF real da prova (NF 937), pelo pdfjs', () => {
  it('lido inteiro; a chave confere; 4 × 491,64', async () => {
    const pdfjs: PdfjsMinimo = await import('pdfjs-dist/legacy/build/pdf.mjs');
    const b = readFileSync(REAL);
    const bytes = b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength);
    const r = await lerNota(bytes, { pdfjs });
    if (r.ok === false) throw new Error(r.frase);
    expect(r.origem).toBe('pdf');
    expect([r.nota.numero, r.nota.serie, r.nota.emissao, r.nota.totais.notaCent, r.nota.totais.descontoCent]).toEqual(['937', '10', '2026-09-15', 196656, 7344]);
    expect(r.nota.duplicatas.map((d) => [d.vencimento, d.valorCent])).toEqual([
      ['2026-10-20', 49164], ['2026-11-20', 49164], ['2026-12-20', 49164], ['2027-01-20', 49164],
    ]);
    expect(r.nota.emitente.documento).toBe('63627945001553');
    expect(r.nota.emitente.nome.endsWith(' LTD')).toBe(true);
    expect(r.divergencias).toEqual([]);
    expect((await itensDoPdf(bytes, pdfjs)).tamanhos[0].largura).toBeGreaterThan(800);
  });
});
