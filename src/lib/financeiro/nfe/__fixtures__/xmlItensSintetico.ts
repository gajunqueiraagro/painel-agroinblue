/** ITENS-NOTA-01 — a nota SINTETICA de 3 itens (366,50) dos testes dos itens (o puro e o da tela). */
const NS = 'http://www.portalfiscal.inf.br/nfe';
const t = (n: string, v: string) => `<${n}>${v}</${n}>`;
/** 3 itens: desconto+frete+IPI; seguro+outras+ST; Simples (CSOSN) com lote. vNF = 99,50 + 217,00 + 50,00 = 366,50. */
export const XML_ITENS_SINTETICO = `<?xml version="1.0" encoding="UTF-8"?><nfeProc xmlns="${NS}"><NFe><infNFe versao="4.00" Id="NFe50260911222333000424550010000032411000000010">
<emit>${t('CNPJ', '11222333000424')}${t('xNome', 'EMITENTE SINTETICO LTDA')}${t('CRT', '3')}</emit>
<det nItem="1"><prod>${t('cProd', 'A-1')}${t('cEAN', '7891234567895')}${t('xProd', 'PRODUTO SINTETICO UM')}${t('NCM', '85381000')}${t('CEST', '1234567')}${t('CFOP', '5102')}
${t('uCom', 'UN')}${t('qCom', '2.0000')}${t('vUnCom', '50.0000000000')}${t('vProd', '100.00')}${t('cEANTrib', 'SEM GTIN')}${t('uTrib', 'CX')}${t('qTrib', '1.0000')}${t('vUnTrib', '100.0000000000')}
${t('vFrete', '5.00')}${t('vDesc', '10.00')}</prod>
<imposto>${t('vTotTrib', '20.00')}<ICMS><ICMS00>${t('orig', '0')}${t('CST', '00')}${t('vBC', '95.00')}${t('pICMS', '17.0000')}${t('vICMS', '16.15')}</ICMS00></ICMS>
<IPI>${t('cEnq', '999')}<IPITrib>${t('CST', '50')}${t('vBC', '95.00')}${t('pIPI', '4.7368')}${t('vIPI', '4.50')}</IPITrib></IPI>
<PIS><PISAliq>${t('CST', '01')}${t('vBC', '95.00')}${t('pPIS', '1.6500')}${t('vPIS', '1.57')}</PISAliq></PIS>
<COFINS><COFINSAliq>${t('CST', '01')}${t('vBC', '95.00')}${t('pCOFINS', '7.6000')}${t('vCOFINS', '7.22')}</COFINSAliq></COFINS>
<IBSCBS>${t('CST', '000')}${t('cClassTrib', '000001')}<gIBSCBS>${t('vBC', '95.00')}<gCBS>${t('pCBS', '0.9000')}${t('vCBS', '0.86')}</gCBS></gIBSCBS></IBSCBS></imposto>
${t('infAdProd', 'Informacao sintetica do item 1')}</det>
<det nItem="2"><prod>${t('cProd', 'B-2')}${t('cEAN', 'SEM GTIN')}${t('xProd', 'PRODUTO SINTETICO DOIS')}${t('NCM', '39172300')}${t('CFOP', '5405')}
${t('uCom', 'MT')}${t('qCom', '10.0000')}${t('vUnCom', '20.0000000000')}${t('vProd', '200.00')}${t('vSeg', '2.00')}${t('vOutro', '3.00')}</prod>
<imposto><ICMS><ICMS10>${t('CST', '10')}${t('vBC', '200.00')}${t('pICMS', '12.0000')}${t('vICMS', '24.00')}${t('vBCST', '240.00')}${t('pICMSST', '15.0000')}${t('vICMSST', '12.00')}</ICMS10></ICMS></imposto></det>
<det nItem="3"><prod>${t('cProd', 'C-3')}${t('xProd', 'DEFENSIVO SINTETICO TRES')}${t('NCM', '38089329')}${t('CFOP', '5102')}${t('uCom', 'GL')}${t('qCom', '1.0000')}
${t('vUnCom', '50.0000000000')}${t('vProd', '50.00')}<rastro>${t('nLote', 'L-069/24')}${t('qLote', '1.000')}${t('dFab', '2026-05-01')}${t('dVal', '2028-07-31')}</rastro></prod>
<imposto><ICMS><ICMSSN102>${t('orig', '0')}${t('CSOSN', '102')}</ICMSSN102></ICMS></imposto></det>
<total><ICMSTot>${t('vBC', '295.00')}${t('vICMS', '40.15')}${t('vST', '12.00')}${t('vProd', '350.00')}${t('vFrete', '5.00')}${t('vSeg', '2.00')}${t('vDesc', '10.00')}
${t('vIPI', '4.50')}${t('vPIS', '1.57')}${t('vCOFINS', '7.22')}${t('vOutro', '3.00')}${t('vNF', '366.50')}${t('vTotTrib', '20.00')}</ICMSTot></total>
</infNFe></NFe></nfeProc>`;
