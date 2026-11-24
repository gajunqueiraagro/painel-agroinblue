/** NOTAS-RECEITA-A1-01 · F3.0 — o pedido e o retorno da Distribuição DF-e, com fixtures SINTÉTICOS no formato do XSD (nenhuma nota real). */
import { describe, expect, it } from 'vitest';
import {
  abrirDocZip, centavos, CONTENT_TYPE_DIST_DFE, envelopeDistDFe, lerDocumento, lerRetornoDistDFe, nsu15,
} from '../../../../supabase/functions/_shared/dfe/distribuicaoDfe';

const CHAVE = '50261112345678000190550010000012341000012345';
const CPF = '52998224725';

async function zipar(xml: string): Promise<string> {
  const corpo = new Response(new TextEncoder().encode(xml)).body;
  if (!corpo) throw new Error('sem corpo');
  const fluxo = corpo.pipeThrough(new CompressionStream('gzip'));
  const bytes = new Uint8Array(await new Response(fluxo).arrayBuffer());
  let bin = ''; for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin);
}
const RES_NFE = `<resNFe xmlns="http://www.portalfiscal.inf.br/nfe" versao="1.01"><chNFe>${CHAVE}</chNFe><CNPJ>12345678000190</CNPJ>`
  + '<xNome>CASA AGRO SINTETICA &amp; FILHOS LTDA</xNome><IE>283000001</IE><dhEmi>2026-11-10T09:15:00-04:00</dhEmi><tpNF>1</tpNF>'
  + '<vNF>12345.60</vNF><digVal>abc=</digVal><dhRecbto>2026-11-10T09:16:00-04:00</dhRecbto><nProt>150260000000001</nProt><cSitNFe>1</cSitNFe></resNFe>';
const PROC_NFE = '<nfeProc xmlns="http://www.portalfiscal.inf.br/nfe" versao="4.00"><NFe><infNFe Id="NFe' + CHAVE + '" versao="4.00">'
  + '<ide><cUF>50</cUF><nNF>1234</nNF><serie>1</serie><dhEmi>2026-11-10T09:15:00-04:00</dhEmi><tpNF>1</tpNF></ide>'
  + '<emit><CNPJ>12345678000190</CNPJ><xNome>CASA AGRO SINTETICA</xNome><enderEmit><xMun>CAMPO GRANDE</xMun></enderEmit></emit>'
  + `<dest><CPF>${CPF}</CPF><xNome>PRODUTOR SINTETICO</xNome></dest>`
  + '<total><ICMSTot><vProd>12345.60</vProd><vNF>12345.6</vNF></ICMSTot></total></infNFe></NFe>'
  + `<protNFe versao="4.00"><infProt><chNFe>${CHAVE}</chNFe><nProt>150260000000001</nProt><cStat>100</cStat></infProt></protNFe></nfeProc>`;
const RES_EVENTO_CANC = `<resEvento xmlns="http://www.portalfiscal.inf.br/nfe" versao="1.01"><cOrgao>50</cOrgao><CNPJ>12345678000190</CNPJ><chNFe>${CHAVE}</chNFe>`
  + '<dhEvento>2026-11-11T08:00:00-04:00</dhEvento><tpEvento>110111</tpEvento><nSeqEvento>1</nSeqEvento><xEvento>Cancelamento</xEvento></resEvento>';

describe('envelope do pedido (distDFeInt 1.01, SOAP 1.2)', () => {
  it('distNSU por CPF em homologação: tpAmb 2, cUFAutor, CPF e o NSU com 15 dígitos', () => {
    const x = envelopeDistDFe({ ambiente: 'homologacao', uf: 50, documento: '529.982.247-25', pedido: { tipo: 'distNSU', ultNsu: 0 } });
    expect(x).toContain('<soap12:Envelope');
    expect(x).toContain('<nfeDistDFeInteresse xmlns="http://www.portalfiscal.inf.br/nfe/wsdl/NFeDistribuicaoDFe"><nfeDadosMsg>');
    expect(x).toContain('<distDFeInt xmlns="http://www.portalfiscal.inf.br/nfe" versao="1.01"><tpAmb>2</tpAmb><cUFAutor>50</cUFAutor>'
      + `<CPF>${CPF}</CPF><distNSU><ultNSU>000000000000000</ultNSU></distNSU></distDFeInt>`);
    expect(CONTENT_TYPE_DIST_DFE).toBe('application/soap+xml; charset=utf-8; action="http://www.portalfiscal.inf.br/nfe/wsdl/NFeDistribuicaoDFe/nfeDistDFeInteresse"');
  });
  it('CNPJ em produção, consNSU e consChNFe', () => {
    expect(envelopeDistDFe({ ambiente: 'producao', uf: 50, documento: '12345678000190', pedido: { tipo: 'consNSU', nsu: 123n } }))
      .toContain('<tpAmb>1</tpAmb><cUFAutor>50</cUFAutor><CNPJ>12345678000190</CNPJ><consNSU><NSU>000000000000123</NSU></consNSU>');
    expect(envelopeDistDFe({ ambiente: 'producao', uf: 50, documento: CPF, pedido: { tipo: 'consChNFe', chave: CHAVE } }))
      .toContain(`<consChNFe><chNFe>${CHAVE}</chNFe></consChNFe>`);
  });
  it('recusa documento, UF, chave e NSU tortos (nada sai)', () => {
    expect(() => envelopeDistDFe({ ambiente: 'producao', uf: 50, documento: '123', pedido: { tipo: 'distNSU', ultNsu: 0 } })).toThrow(/CPF \(11\) ou CNPJ \(14\)/);
    expect(() => envelopeDistDFe({ ambiente: 'producao', uf: 99, documento: CPF, pedido: { tipo: 'distNSU', ultNsu: 0 } })).toThrow(/UF/);
    expect(() => envelopeDistDFe({ ambiente: 'producao', uf: 50, documento: CPF, pedido: { tipo: 'consChNFe', chave: '123' } })).toThrow(/44 dígitos/);
    expect(() => nsu15(10n ** 15n)).toThrow(/NSU/);
    expect(() => nsu15(-1)).toThrow(/NSU/);
  });
});

describe('retorno da distribuição', () => {
  it('138 com docZip: cStat, NSUs e os documentos abertos (resNFe, procNFe, resEvento)', async () => {
    const ret = '<soap:Envelope xmlns:soap="http://www.w3.org/2003/05/soap-envelope"><soap:Body><nfeDistDFeInteresseResponse '
      + 'xmlns="http://www.portalfiscal.inf.br/nfe/wsdl/NFeDistribuicaoDFe"><nfeDistDFeInteresseResult>'
      + '<retDistDFeInt xmlns="http://www.portalfiscal.inf.br/nfe" versao="1.01"><tpAmb>2</tpAmb><verAplic>1.7.6</verAplic><cStat>138</cStat>'
      + '<xMotivo>Documento localizado</xMotivo><dhResp>2026-11-14T20:00:00-03:00</dhResp><ultNSU>000000000000003</ultNSU><maxNSU>000000000000010</maxNSU>'
      + `<loteDistDFeInt><docZip NSU="000000000000001" schema="resNFe_v1.01.xsd">${await zipar(RES_NFE)}</docZip>`
      + `<docZip NSU="000000000000002" schema="procNFe_v4.00.xsd">${await zipar(PROC_NFE)}</docZip>`
      + `<docZip NSU="000000000000003" schema="resEvento_v1.01.xsd">${await zipar(RES_EVENTO_CANC)}</docZip></loteDistDFeInt>`
      + '</retDistDFeInt></nfeDistDFeInteresseResult></nfeDistDFeInteresseResponse></soap:Body></soap:Envelope>';
    const r = lerRetornoDistDFe(ret);
    expect(r).toMatchObject({ cStat: '138', xMotivo: 'Documento localizado', ultNsu: 3n, maxNsu: 10n });
    expect(r.docs.map((d) => [d.nsu, d.esquema])).toEqual([[1n, 'resNFe_v1.01.xsd'], [2n, 'procNFe_v4.00.xsd'], [3n, 'resEvento_v1.01.xsd']]);

    const lidos = await Promise.all(r.docs.map(async (d) => lerDocumento(d, await abrirDocZip(d.base64))));
    expect(lidos[0]).toEqual({ tipo: 'nota', linha: expect.objectContaining({
      tipo: 'nfe', chave: CHAVE, nsu: 1n, situacao: 'resumo', emitente_documento: '12345678000190', emitente_nome: 'CASA AGRO SINTETICA & FILHOS LTDA',
      emissao: '2026-11-10', valor_cent: 1234560, xml: null }) });
    expect(lidos[1]).toEqual({ tipo: 'nota', linha: expect.objectContaining({
      chave: CHAVE, situacao: 'xml', emitente_documento: '12345678000190', emitente_nome: 'CASA AGRO SINTETICA', emissao: '2026-11-10', valor_cent: 1234560 }) });
    /* o emitente é o do bloco emit, nunca o CPF do destinatário */
    expect(lidos[1].tipo === 'nota' && lidos[1].linha.xml).toBe(PROC_NFE);
    expect(lidos[2]).toEqual({ tipo: 'evento', evento: expect.objectContaining({ chave: CHAVE, tpEvento: '110111', descricao: 'Cancelamento' }) });
  });
  it('nota do produtor (emitente com CPF) para empresa (destinatário com CNPJ): o emitente é o CPF do emit', () => {
    const x = PROC_NFE.replace('<emit><CNPJ>12345678000190</CNPJ>', `<emit><CPF>${CPF}</CPF>`)
      .replace(`<dest><CPF>${CPF}</CPF>`, '<dest><CNPJ>98765432000110</CNPJ>');
    const d = lerDocumento({ nsu: 5n, esquema: 'procNFe_v4.00.xsd' }, x);
    expect(d.tipo === 'nota' && d.linha.emitente_documento).toBe(CPF);
  });
  it('137 sem documentos; resumo de nota cancelada vem como cancelado_na_sefaz', () => {
    const r = lerRetornoDistDFe('<retDistDFeInt><cStat>137</cStat><xMotivo>Nenhum documento localizado</xMotivo><ultNSU>000000000000000</ultNSU><maxNSU>000000000000000</maxNSU></retDistDFeInt>');
    expect(r).toMatchObject({ cStat: '137', ultNsu: 0n, maxNsu: 0n, docs: [] });
    const canc = lerDocumento({ nsu: 9n, esquema: 'resNFe_v1.01.xsd' }, RES_NFE.replace('<cSitNFe>1</cSitNFe>', '<cSitNFe>3</cSitNFe>'));
    expect(canc.tipo === 'nota' && canc.linha.situacao).toBe('cancelado_na_sefaz');
  });
  it('sem retDistDFeInt (Fault, página do servidor) = erro com o motivo; docZip sem NSU = erro', () => {
    expect(() => lerRetornoDistDFe('<soap:Fault><soap:Reason><soap:Text>Certificado inválido</soap:Text></soap:Reason></soap:Fault>')).toThrow(/Certificado inválido/);
    expect(() => lerRetornoDistDFe('<html><title>403 - Forbidden</title></html>')).toThrow(/403 - Forbidden/);
    expect(() => lerRetornoDistDFe('<retDistDFeInt><cStat>138</cStat><loteDistDFeInt><docZip schema="resNFe_v1.01.xsd">x</docZip></loteDistDFeInt></retDistDFeInt>')).toThrow(/NSU/);
  });
  /* DFE-CONSCHNFE-SEM-NSU (24/11, NF 14.835 da Vera): na consulta pela CHAVE a SEFAZ manda o docZip só com o schema; o leitor aceita com
     NSU nulo SÓ quando pedido (`semNsu`); na distNSU o docZip sem NSU segue erro (o teste acima) */
  it('consChNFe: docZip sem NSU lido com NSU nulo; sem schema segue erro; sem a opção segue erro', async () => {
    const ret = `<retDistDFeInt><tpAmb>1</tpAmb><cStat>138</cStat><xMotivo>Documento localizado</xMotivo><loteDistDFeInt>`
      + `<docZip schema="resNFe_v1.01.xsd">${await zipar(RES_NFE)}</docZip></loteDistDFeInt></retDistDFeInt>`;
    const r = lerRetornoDistDFe(ret, { semNsu: true });
    expect(r.cStat).toBe('138');
    expect(r.docs).toHaveLength(1);
    expect(r.docs[0].nsu).toBeNull();
    const lido = lerDocumento(r.docs[0], await abrirDocZip(r.docs[0].base64));
    expect(lido.tipo === 'nota' && lido.linha.chave).toBe(CHAVE);
    expect(lido.tipo === 'nota' && lido.linha.nsu).toBeNull();
    expect(lido.tipo === 'nota' && lido.linha.situacao).toBe('resumo');
    expect(() => lerRetornoDistDFe(ret)).toThrow(/NSU/);
    expect(() => lerRetornoDistDFe('<retDistDFeInt><cStat>138</cStat><loteDistDFeInt><docZip NSU="000000000000001">x</docZip></loteDistDFeInt></retDistDFeInt>', { semNsu: true }))
      .toThrow(/schema/);
  });
  it('esquema desconhecido passa como "outro"; resNFe sem chave = erro', () => {
    expect(lerDocumento({ nsu: 1n, esquema: 'resCTe_v1.00.xsd' }, '<x/>')).toEqual({ tipo: 'outro', esquema: 'resCTe_v1.00.xsd' });
    expect(() => lerDocumento({ nsu: 1n, esquema: 'resNFe_v1.01.xsd' }, '<resNFe><chNFe>1</chNFe></resNFe>')).toThrow(/chave/);
  });
  it('centavos pelo texto, sem float', () => {
    expect(centavos('0.1')).toBe(10);
    expect(centavos('1234567.89')).toBe(123456789);
    expect(centavos('12')).toBe(1200);
    expect(centavos('1,5')).toBeNull();
    expect(centavos(null)).toBeNull();
  });
});
