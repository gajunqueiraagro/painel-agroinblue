/**
 * SUGESTAO-ITENS-03 §3 (Gabriel 27/11) — o ICMS DESONERADO: a NF-e com ICMS40 + `vICMSDeson` e `indDeduzDeson` = 1 tem o vNF SEM o desonerado
 * (o caso da NF 54.388: 50.508,92 − 17% = 41.922,40). O líquido do item passa a ser sem ele e a soma dos itens = o valor da nota.
 * Nota antiga (sem a tag): a dedução vale só quando é ela que fecha a soma com o vNF. `indDeduzDeson` = 0: não deduz. Fixtures SINTÉTICAS.
 */
import { describe, it, expect } from 'vitest';
import { conferirSoma, itensDoXml } from './itensDaNota';

const bytes = (s: string) => new TextEncoder().encode(s).buffer;
const nfe = (o: { deson: string; ind: string | null; vNF: string; vProd?: string }) => `<?xml version="1.0" encoding="UTF-8"?>
<nfeProc xmlns="http://www.portalfiscal.inf.br/nfe"><NFe><infNFe Id="NFe35261100000000000000550010000543881000000000" versao="4.00">
<emit><CRT>3</CRT></emit>
<det nItem="1"><prod><cProd>Q1</cProd><cEAN>SEM GTIN</cEAN><xProd>QUIRELA DE MILHO A GRANEL</xProd><NCM>11031300</NCM><CFOP>5101</CFOP>
<uCom>T</uCom><qCom>30.1600</qCom><vUnCom>1674.6989390000</vUnCom><vProd>${o.vProd ?? '50508.92'}</vProd><uTrib>T</uTrib><qTrib>30.1600</qTrib><vUnTrib>1674.6989390000</vUnTrib></prod>
<imposto><ICMS><ICMS40><orig>0</orig><CST>40</CST><vICMSDeson>${o.deson}</vICMSDeson><motDesICMS>9</motDesICMS>${o.ind != null ? `<indDeduzDeson>${o.ind}</indDeduzDeson>` : ''}</ICMS40></ICMS></imposto></det>
<total><ICMSTot><vICMSDeson>${o.deson}</vICMSDeson><vProd>${o.vProd ?? '50508.92'}</vProd><vDesc>0.00</vDesc><vNF>${o.vNF}</vNF></ICMSTot></total>
</infNFe></NFe></nfeProc>`;

describe('ICMS desonerado deduzido do valor da nota', () => {
  it('indDeduzDeson = 1 (o caso da NF 54.388): o item líquido = vProd − vICMSDeson e a soma = o vNF', () => {
    const l = itensDoXml(bytes(nfe({ deson: '8586.52', ind: '1', vNF: '41922.40' })));
    if (!l) throw new Error('XML não lido');
    expect(l.itens[0]).toMatchObject({ cst: '40', produtoCent: 5050892, icms: { desoneradoCent: 858652, deduzDesonerado: true }, liquidoCent: 4192240 });
    expect(conferirSoma(l)).toEqual({ somaCent: 4192240, notaCent: 4192240, diferencaCent: 0, confere: true });
  });
  it('nota antiga (sem indDeduzDeson): deduz só porque é a dedução que fecha com o vNF', () => {
    const l = itensDoXml(bytes(nfe({ deson: '8586.52', ind: null, vNF: '41922.40' })));
    expect(l?.itens[0]).toMatchObject({ icms: { deduzDesonerado: true }, liquidoCent: 4192240 });
    expect(l && conferirSoma(l).confere).toBe(true);
  });
  it('nota antiga cujo vNF NÃO deduz: o líquido fica cheio (o desonerado só informado)', () => {
    const l = itensDoXml(bytes(nfe({ deson: '8586.52', ind: null, vNF: '50508.92' })));
    expect(l?.itens[0]).toMatchObject({ icms: { desoneradoCent: 858652, deduzDesonerado: false }, liquidoCent: 5050892 });
    expect(l && conferirSoma(l).confere).toBe(true);
  });
  it('indDeduzDeson = 0: não deduz', () => {
    const l = itensDoXml(bytes(nfe({ deson: '8586.52', ind: '0', vNF: '50508.92' })));
    expect(l?.itens[0]).toMatchObject({ icms: { deduzDesonerado: false }, liquidoCent: 5050892 });
  });
});
