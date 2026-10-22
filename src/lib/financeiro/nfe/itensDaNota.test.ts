/**
 * ITENS-NOTA-01 — os itens do documento fiscal: TODOS os campos do XML, o DANFE com o rateio marcado, e a IGUALDADE (soma dos liquidos =
 * valor da nota) nos dois. Fixtures SINTETICAS.
 */
import { describe, it, expect } from 'vitest';
import { conferirSoma, itensDoPdf, itensDoXml, liquidoDoItem, loteDoDetalhe, ratear } from './itensDaNota';
import { notaDoDanfe } from './danfe';
import { XML_ITENS_SINTETICO } from './__fixtures__/xmlItensSintetico';
import { PAGINAS_DANFE_SINTETICO, danfeSinteticoSemDuplicata } from './__fixtures__/danfeSintetico';

const XML = XML_ITENS_SINTETICO;
const bytes = (s: string) => new TextEncoder().encode(s).buffer;

describe('I1 — XML: todos os campos do item e os totais', () => {
  const l = itensDoXml(bytes(XML));
  if (!l) throw new Error('XML nao lido');
  it('o item 1 inteiro (comercial e tributavel, acrescimos/descontos do emitente, ICMS, IPI, PIS, COFINS, IBS/CBS, info adicional)', () => {
    const i = l.itens[0];
    expect(i).toMatchObject({
      nItem: 1, codigo: 'A-1', ean: '7891234567895', descricao: 'PRODUTO SINTETICO UM', ncm: '85381000', cest: '1234567', cfop: '5102', cst: '00', csosn: null,
      unidade: 'UN', quantidade: '2.0000', unitario: '50.0000000000', unidadeTrib: 'CX', quantidadeTrib: '1.0000', unitarioTrib: '100.0000000000',
      produtoCent: 10000, descontoCent: 1000, freteCent: 500, seguroCent: 0, outrasCent: 0, rateado: false,
      icms: { cst: '00', bcCent: 9500, aliquota: '17.0000', valorCent: 1615 }, ipi: { cst: '50', bcCent: 9500, aliquota: '4.7368', valorCent: 450 },
      pis: { cst: '01', valorCent: 157 }, cofins: { cst: '01', valorCent: 722 }, infoAdicional: 'Informacao sintetica do item 1', liquidoCent: 9950,
    });
    expect(i.ibsCbs).toMatchObject({ CST: '000', cClassTrib: '000001', pCBS: '0.9000', vCBS: '0.86' });
  });
  it('ST no item 2, CSOSN e rastro no item 3, o regime (CRT) e os totais', () => {
    expect(l.itens[1]).toMatchObject({ seguroCent: 200, outrasCent: 300, icmsSt: { bcCent: 24000, aliquota: '15.0000', valorCent: 1200 }, liquidoCent: 21700 });
    expect(l.itens[2]).toMatchObject({ csosn: '102', cst: null, ean: null, rastro: [{ lote: 'L-069/24', quantidade: '1.000', fabricacao: '2026-05-01', validade: '2028-07-31' }], liquidoCent: 5000 });
    expect(l.regime).toBe('3');
    expect(l.totais).toMatchObject({ produtosCent: 35000, descontoCent: 1000, freteCent: 500, seguroCent: 200, outrasCent: 300, ipiCent: 450, stCent: 1200, notaCent: 36650, tributosAproxCent: 2000 });
  });
  it('IGUALDADE: soma dos liquidos = valor da nota', () => {
    expect(conferirSoma(l)).toEqual({ somaCent: 36650, notaCent: 36650, diferencaCent: 0, confere: true });
  });
  it('o que nao e\' NF-e nao le^', () => {
    expect(itensDoXml(bytes('nao e xml'))).toBeNull();
  });
});

describe('I2 — PDF: o DANFE, com desconto do total RATEADO pelo valor do item', () => {
  it('NF 937 sintetica: 73,44 de desconto em 510 / 1.020 / 510 -> 18,36 / 36,72 / 18,36, marcados "rateado"; soma = nota', () => {
    const r = notaDoDanfe(PAGINAS_DANFE_SINTETICO);
    if (r.ok === false) throw new Error(r.frase);
    const l = itensDoPdf(r.nota, r.extras);
    expect(l.itens.map((i) => [i.descontoCent, i.rateado, i.liquidoCent])).toEqual([[1836, true, 49164], [3672, true, 98328], [1836, true, 49164]]);
    expect(l.itens[0]).toMatchObject({ codigo: '10001', ncm: '38085929', cst: '040', cfop: '5102', unidade: 'GL', rastro: [{ lote: '069/24', fabricacao: '01/05/26', validade: '31/07/28' }] });
    expect(conferirSoma(l).confere).toBe(true);
  });
  it('nota sem desconto (o molde de 21/10): nada rateado, soma = nota', () => {
    const r = notaDoDanfe(danfeSinteticoSemDuplicata());
    if (r.ok === false) throw new Error(r.frase);
    const l = itensDoPdf(r.nota, r.extras);
    expect(l.itens.every((i) => !i.rateado)).toBe(true);
    expect(conferirSoma(l)).toMatchObject({ somaCent: 958300, confere: true });
  });
});

describe('I3 — as contas', () => {
  it('o rateio fecha em centavos (o ultimo leva a sobra) e ignora peso zero', () => {
    expect(ratear(100, [1, 1, 1])).toEqual([33, 33, 34]);
    expect(ratear(7344, [51000, 102000, 51000])).toEqual([1836, 3672, 1836]);
    expect(ratear(10, [0, 5, 0])).toEqual([0, 10, 0]);
    expect(ratear(0, [1, 2])).toEqual([0, 0]);
  });
  it('liquido = produto - desconto + frete + seguro + outras + IPI + ST + FCP-ST', () => {
    expect(liquidoDoItem({ produtoCent: 1000, descontoCent: 100, freteCent: 50, seguroCent: 20, outrasCent: 30, ipi: { valorCent: 40 }, icmsSt: { valorCent: 60 }, fcpSt: { valorCent: 5 } })).toBe(1105);
    expect(loteDoDetalhe('Lote: 146/25 D.Fab: 13/11/25 D.Val: 13/11/28 | S | S')).toEqual({ lote: '146/25', quantidade: null, fabricacao: '13/11/25', validade: '13/11/28' });
  });
});
