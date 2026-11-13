/**
 * NOTA-PDF-IBS-CBS-01 — o IBS/CBS ESCRITO no DANFE em PDF: as três formas vistas nos PDFs reais (por item; total no rodapé; total com base e
 * alíquotas), a conferência (só avisa) e o caminho até a gravação (item → `ibs_cbs`; total → `totais.ibs_cbs`). Os PDFs reais ficam fora do
 * repo (dado de cliente) e só rodam onde existem.
 */
import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { conferirIbsCbs, ibsCbsDoItem, ibsCbsDoTotal, ibsCbsTotalDaNota } from './ibsCbsDoPdf';
import { itensDoPdf, payloadDaNotaFiscal } from './itensDaNota';
import { lerNota } from './lerNota';
import type { PdfjsMinimo } from './lerNotaPdf';
import type { NotaLida } from './tipos';
import { lerNFe } from './lerNFe';
import { montarNFe, utf8 } from './__fixtures__/notas';

describe('A · por item (a linha de baixo do item)', () => {
  it('as chaves do grupo IBSCBS do XML, valores com ponto; vIBS = UF + Mun', () => {
    expect(ibsCbsDoItem('CST/Cl.Trib: 000/000001, BC: 632,81, IBS UF: 0,63, IBS Mun: 0,00, CBS: · 5,70#Desconto: 0,00 0,00%'))
      .toEqual({ CST: '000', cClassTrib: '000001', vBC: '632.81', vIBSUF: '0.63', vIBSMun: '0.00', vIBS: '0.63', vCBS: '5.70' });
  });
  it('o leitor parte a linha em qualquer ponto (" · "): "IBS Mun: 0,00, · CBS: 12,24"; milhar com ponto', () => {
    expect(ibsCbsDoItem('CST/Cl.Trib: 000/000001, BC: 1.359,53, IBS UF: 1,36, IBS Mun: 0,00, · CBS: 12,24')?.vCBS).toBe('12.24');
    expect(ibsCbsDoItem('CST/Cl.Trib: 000/000001, BC: 1.359,53, IBS UF: 1,36, IBS Mun: 0,00, · CBS: 12,24')?.vBC).toBe('1359.53');
  });
  it('sem a forma A (lote, tributos aproximados, nada): null — nunca zero', () => {
    for (const t of [null, '', 'Lote: 069/24 D.Fab: 01/05/26', 'Trib aproxR$: 18.43 Fed, R$: 0.00 Est', 'CST/Cl.Trib: 000/000001']) expect(ibsCbsDoItem(t)).toBeNull();
  });
});

describe('B / C · o total escrito', () => {
  it('B — "Vlr.CBS R$ · Vlr.IBS UF R$ · Vlr.IBS MUN R$" no meio das complementares', () => {
    expect(ibsCbsDoTotal('Vendedor: 012 - X TIPO DE VENDA: RETIRAVlr.CBS R$ 2,67 Vlr.IBS UF R$ 0,30 Vlr.IBS MUN R$ 0,00 Complemento do endereço: FAZ'))
      .toEqual({ vCBS: '2.67', vIBSUF: '0.30', vIBSMun: '0.00', vIBS: '0.30' });
  });
  it('C — a base e as alíquotas escritas ("Base IBS/CBS:R$ … e CBS:R$ 46,65(0,9000%)")', () => {
    expect(ibsCbsDoTotal('Fonte:IBPT/MS, Base IS:R$ 0,00, IS:R$ 0,00(0,0000),Base IBS/CBS:R$ 5181,88, IBS:R$ 5,16(IBSUF:5,16(0,1000%), IBSMun:0,00(0,0000%)) e CBS:R$ 46,65(0,9000%)'))
      .toEqual({ vBC: '5181.88', vIBS: '5.16', vIBSUF: '5.16', pIBSUF: '0.1000', vIBSMun: '0.00', pIBSMun: '0.0000', vCBS: '46.65', pCBS: '0.9000' });
  });
  it('D — o total na continuação das complementares (sem R$), e a linha de UM item não é lida como total', () => {
    expect(ibsCbsDoTotal('#MANUTENCAO CAMPO#Base IBS/CBS: 22851,53, IBS UF: 22,85, IBS Mun: 0,00, CBS: 205,68'))
      .toEqual({ vBC: '22851.53', vIBSUF: '22.85', vIBSMun: '0.00', vIBS: '22.85', vCBS: '205.68' });
    expect(ibsCbsDoTotal('CST/Cl.Trib: 000/000001, BC: 632,81, IBS UF: 0,63, IBS Mun: 0,00, CBS: 5,70')).toBeNull();
  });
  it('o total da nota: nas complementares; senão, no detalhe de item com o marcador "Base IBS/CBS" (a continuação colada no último item)', () => {
    expect(ibsCbsTotalDaNota(null, ['CST/Cl.Trib: 000/000001, BC: 632,81, IBS UF: 0,63, IBS Mun: 0,00, CBS: 5,70',
      'CST/Cl.Trib: 000/000001, BC: 5600,00, IBS UF: 5,60, IBS Mun: 0,00, CBS: 50,40#CONTINUAÇÃO DAS INFORMAÇÕES COMPLEMENTARES#Base IBS/CBS: 22851,53, IBS UF: 22,85, IBS Mun: 0,00, CBS: 205,68'])?.vCBS).toBe('205.68');
    expect(ibsCbsTotalDaNota(null, ['CST/Cl.Trib: 000/000001, BC: 632,81, IBS UF: 0,63, IBS Mun: 0,00, CBS: 5,70'])).toBeNull();
  });
  it('o papel que não traz (o DANFE da Minerva, os tributos aproximados da Lei 12.741, o cClassTrib sem valor): null', () => {
    for (const t of [null, 'Vlr Aprox dos Tributos: R$ 15,46 Federal / R$ 13,77 Estadual - Fonte: IBPT', 'LC 214/2025 CclasTrib IBS/CBS: 000001 Conforme Artigo 1o'])
      expect(ibsCbsDoTotal(t)).toBeNull();
  });
});

describe('a conferência (só avisa, nunca muda valor)', () => {
  const item = ibsCbsDoItem('CST/Cl.Trib: 000/000001, BC: 632,81, IBS UF: 0,63, IBS Mun: 0,00, CBS: 5,70');
  it('o item fecha com a base (0,1% · 0,9% de 2026, 1 centavo de arredondamento): sem aviso', () => {
    expect(conferirIbsCbs([item], null)).toEqual([]);
  });
  it('o item que não fecha com a base: aviso com o item e a base', () => {
    expect(conferirIbsCbs([{ ...item!, vCBS: '7.70' }], null)).toEqual(['item 1: IBS/CBS escritos não fecham com a base 632.81']);
  });
  it('a soma dos itens × o total escrito', () => {
    expect(conferirIbsCbs([item, item], { vCBS: '11.40', vIBSUF: '1.26' })).toEqual([]);
    expect(conferirIbsCbs([item, item], { vCBS: '20.00', vIBSUF: '1.26' })).toEqual(['a soma dos itens (11.40) não fecha com o total escrito de CBS (20.00)']);
  });
});

describe('o caminho até a gravação', () => {
  /* a base é a nota do fixture da casa (`montarNFe` → `lerNFe`), com os itens e as complementares do DANFE trocados — sem cast */
  const base = (() => { const r = lerNFe(utf8(montarNFe())); if (r.ok === false) throw new Error(r.frase); return r.nota; })();
  const nota = (o: Partial<NotaLida> = {}): NotaLida => ({
    ...base, totais: { produtosCent: 8100, descontoCent: 0, freteCent: 0, notaCent: 8100 },
    itens: [{ descricao: 'PORCA', quantidade: '1', unidade: 'UN', valorCent: 4500, detalhe: 'CST/Cl.Trib: 000/000001, BC: 45,00, IBS UF: 0,05, IBS Mun: 0,00, CBS: 0,41' },
      { descricao: 'ARRUELA', quantidade: '1', unidade: 'UN', valorCent: 3600, detalhe: null }],
    informacoesComplementares: 'RETIRAVlr.CBS R$ 0,70 Vlr.IBS UF R$ 0,07 Vlr.IBS MUN R$ 0,00 Complemento', ...o,
  });
  it('o item com a forma A leva o grupo; o sem, null (nunca zero); o total escrito vai em totais.ibs_cbs, sem rateio', () => {
    const l = itensDoPdf(nota());
    expect(l.itens.map((i) => i.ibsCbs?.vCBS ?? null)).toEqual(['0.41', null]);
    expect(l.totais.ibsCbs).toEqual({ vCBS: '0.70', vIBSUF: '0.07', vIBSMun: '0.00', vIBS: '0.07' });
    const p = payloadDaNotaFiscal(nota(), l, null);
    expect(p.nota.totais.ibs_cbs).toEqual({ vCBS: '0.70', vIBSUF: '0.07', vIBSMun: '0.00', vIBS: '0.07' });
    expect(p.itens.map((i) => i.ibs_cbs)).toEqual([l.itens[0].ibsCbs, null]);
  });
  it('o papel sem IBS/CBS: nada no total (a chave nem existe) e os itens com null', () => {
    const l = itensDoPdf(nota({ informacoesComplementares: 'Vlr Aprox dos Tributos: R$ 15,46 Federal', itens: [{ descricao: 'X', quantidade: '1', unidade: 'UN', valorCent: 8100, detalhe: null }] }));
    expect('ibsCbs' in l.totais).toBe(false);
    expect(payloadDaNotaFiscal(nota(), l, null).nota.totais).not.toHaveProperty('ibs_cbs');
    expect(l.itens[0].ibsCbs).toBeNull();
  });
});

/* ── os 6 PDFs REAIS do censo de 12/11 (fora do repo: dado de cliente) ── */
const H = process.env.HOME ?? '';
const REAIS: [string, number, { itensCom: number; total: Record<string, string> | null; somaCBSItens?: string }][] = [
  /* a 39423: os 38 itens com a forma A e o total (forma D) na continuação das complementares; a soma dos itens fecha com o total (205,68) */
  ['000.039.423.pdf', 39423, { itensCom: 38, total: { vBC: '22851.53', vIBSUF: '22.85', vIBSMun: '0.00', vIBS: '22.85', vCBS: '205.68' }, somaCBSItens: '205.68' }],
  ['000.532.052.pdf', 532052, { itensCom: 0, total: { vCBS: '0.70', vIBSUF: '0.07', vIBSMun: '0.00', vIBS: '0.07' } }],
  ['000.532.390.pdf', 532390, { itensCom: 0, total: { vCBS: '2.67', vIBSUF: '0.30', vIBSMun: '0.00', vIBS: '0.30' } }],
  ['000.532.391.pdf', 532391, { itensCom: 0, total: { vCBS: '1.34', vIBSUF: '0.15', vIBSMun: '0.00', vIBS: '0.15' } }],
  ['46.994.pdf', 46994, { itensCom: 0, total: { vCBS: '30.42', vIBSUF: '3.38', vIBSMun: '0.00', vIBS: '3.38' } }],
  ['8282.pdf', 8282, { itensCom: 0, total: { vBC: '5181.88', vIBS: '5.16', vIBSUF: '5.16', pIBSUF: '0.1000', vIBSMun: '0.00', pIBSMun: '0.0000', vCBS: '46.65', pCBS: '0.9000' } }],
];
describe.skipIf(!REAIS.every(([f]) => existsSync(`${H}/Downloads/${f}`)))('os 6 PDFs reais (censo 12/11): o leitor agora lê o IBS/CBS escrito', () => {
  it.each(REAIS)('%s', async (arq, numero, esperado) => {
    const pdfjs: PdfjsMinimo = await import('pdfjs-dist/legacy/build/pdf.mjs');
    const b = readFileSync(`${H}/Downloads/${arq}`);
    const r = await lerNota(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength), { pdfjs });
    if (r.ok === false) throw new Error(r.frase);
    expect(Number(r.nota.numero)).toBe(numero);
    const l = itensDoPdf(r.nota);
    const com = l.itens.filter((i) => i.ibsCbs);
    expect(com.length).toBe(esperado.itensCom);
    expect(l.totais.ibsCbs ?? null).toEqual(esperado.total);
    if (esperado.somaCBSItens) expect((com.reduce((s, i) => s + Math.round(Number(i.ibsCbs?.vCBS) * 100), 0) / 100).toFixed(2)).toBe(esperado.somaCBSItens);
    expect(conferirIbsCbs(l.itens.map((i) => i.ibsCbs), l.totais.ibsCbs ?? null)).toEqual([]);
  }, 60000);
});
