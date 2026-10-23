/* OC-DOC-ESPECIE-ABATE-01 passo 4 — FIXTURES DE TEXTO, SEM PDF NO REPOSITORIO.
   So' as linhas que o leitor usa, montadas como `montarLinhas` as devolve (celulas por " | "), copiadas dos 6 PDFs reais e
   ANONIMIZADAS: produtor, CPF, conta e endereco sairam; a CHAVE e' sintetica (DV certo, com o CNPJ do frigorifico). Os numeros
   (cab, kg, valores) sao os do papel — o teste prova que o leitor os acha. */

/** Chave de acesso de 44 digitos com DV modulo 11 certo. */
export function chaveSintetica(cnpj14: string, serie: number, numero: number, aamm = '2610', cuf = '50'): string {
  const base = `${cuf}${aamm}${cnpj14}55${String(serie).padStart(3, '0')}${String(numero).padStart(9, '0')}1${'12345678'}`;
  let soma = 0; let peso = 2;
  for (let i = base.length - 1; i >= 0; i--) { soma += Number(base[i]) * peso; peso = peso === 9 ? 2 : peso + 1; }
  const r = soma % 11;
  return base + String(r < 2 ? 0 : 11 - r);
}
const em4 = (c: string) => c.match(/.{1,4}/g)?.join(' ') ?? c;

export const CNPJ_MINERVA = '52.168.923/0002-31';
export const CNPJ_JBS = '02.916.265/0077-68';
export const CHAVE_MINERVA = chaveSintetica('52168923000231', 2, 8812);
export const CHAVE_JBS = chaveSintetica('02916265007768', 4, 123153);

export const NF_MINERVA = [
  'IDENTIFICAÇÃO DO EMITENTE', 'DANFE', 'Documento Auxiliar da Nota', 'Fiscal Eletrônica', 'FORTUNCERES S A',
  'RODOVIA BR 267, KM 35 | 0 | CHAVE DE ACESSO',
  em4(CHAVE_MINERVA),
  'COMPRA P/ INDUSTRIALIZ | 150260044983025 - 01/10/2026 | 15:47:01',
  'VALOR DO FRETE | VALOR DO SEGURO | DESCONTO | OUTRAS DESPESAS | VALOR TOTAL DO IPI | VALOR DA COFINS | VALOR TOTAL DA NOTA',
  '0,00 | 0,00 | 0,00 | 0,00 | 0,00 | 0,00 | 98.135,31',
  'QUANTIDADE | ESPÉCIE | MARCA | NUMERAÇÃO | PESO BRUTO | PESO LÍQUIDO',
  '18 | BOVINOS | 4.095,000 | 4.095,000',
  '3010 | NOVILHA PARA ABATE | 01029000 | 051 | 1101 | Ar | 273,0000 | 359,4700 | 98.135,31 | 0,00 | 0,00 | 0,00',
  'Inf. Contribuinte: REF NOTA FISCAL DE PRODUTOR 9413559 EMITIDA EM 29/09/2026 VR : 69 677,28 // DATA ABATE:',
  '01/10/2026 // FAZENDA: FAZENDA TESTE //',
  'FUNR R$ 1 295,39 1,320000 % // SENAR R$ 196,27 0,200000 % // SEGURO R$ 107,95 0,110000 % // PROCEDIMENTO',
];

export const ACERTO_MINERVA = [
  'FORTUNCERES S.A.',
  'CNPJ: 52.168.923/0002-31 INSC. EST.: 284881082',
  'Ordem Compra - 10352 - PRODUTOR TESTE',
  'Lote - 10 | Data Abate - 01/10/2026',
  'Resumo de Abate | Cabeça | Peso | Valor @ | Total',
  '1 - Novilha Normal (0000000 - 0011/2025) - Indicador | 18 | 4.095,00 | 359,47 | 98.135,31',
  'TOTAL Animais | 18 | 4.095,00 | 98.135,31',
  'Vencimento: 05/10/2026',
  'Acertos no Pagamento | Valor',
  'OC: 10352 - FUNR(1,32%)+SENAR(0,2%)+SEGURO(0,11%) | 1.599,61',
  'Total Despesas | 1.599,61',
  'Total Geral | 96.535,70',
];

export const ROMANEIO_MINERVA = [
  'ROMANEIO DE ABATE',
  'Lote: | 10 | Ordem Compra: | 10352 | Ord. Prod.: | 46323',
  'Fornecedor: | PRODUTOR TESTE | Qtd. Programada: | 18 | Data Abate: | 01/10/2026',
  'Total | 18 | 4.095,00 | Média Total (KG): | 227,50',
  'Média Total (@): | 15,17',
];

export const NF_JBS = [
  'Identificação do Emitente | DANFE', 'Documento', 'JBS SA', 'Auxiliar da Nota',
  '0-ENTRADA | CHAVE DE ACESSO',
  CHAVE_JBS,
  'COMPRA PARA INDUSTRIALIZACAO | 150260046878486 | 13/10/2026 17:49:41',
  '[ 1/123153 - 12/11/2026 - 212.449,03 ] ;',
  'VALOR DO FRETE | VALOR DO SEGURO | DESCONTO | OUTRAS DESPESAS ACESSÓRIAS | VALOR DO IPI | VALOR TOTAL DA NOTA',
  '0,00 | 0,00 | 0,00 | 0,00 | 0,00 | 215.969,33',
  'QUANTIDADE | ESPÉCIE | MARCA | NUMERAÇÃO | PESO BRUTO | PESO LÍQUIDO',
  '36 | KG | 9.512,600 | 9.512,600',
  'DADOS DO PRODUTO/SERVIÇOS | PEDIDO: | 895279 | CARGA: | 1 | PEDIDO CLIENTE: | 1449704 | INSTRUÇÃO: | 970373 | DOCUMENTO: | 3010403',
  '9022 | VACA RASTREADA | 34 | 01029000 | 051 | 1101 | KG | 8.987,000 | 22,667 | 203.705,330 | 0,00 | 0,00 | 0,00 | 0,00 | 0,00',
  '9039 | NOVILHA RASTREADA | 2 | 01029000 | 051 | 1101 | KG | 525,600 | 23,333 | 12.264,000 | 0,00 | 0,00 | 0,00 | 0,00 | 0,00',
  'ICMS DIFERIDO CONFORME ART. 2 CAP.II DO DECRETO 12.056 DE 08/03/2006. NF',
  'PRODUTOR NUMEROS. 9444845/9444790 DE 09/10/2026. DESCONTO DO FUNRURAL NO',
  'VALOR DE R$ 2850,79 . DESCONTO DA RAT NO VALOR DE R$ 237,57 . DESCONTO DE',
  'SENAR NO VALOR DE R$ 431,94 . CODIGO DO TERCEIRO E 0000000. | . Numero Guia',
];

export const ACERTO_JBS = [
  'Acerto de Compra de Gado',
  'Documento: 3010402 | NF: | Instrução: 970373 | Data: | 13/10/2026',
  'CONVENCIONAL | Pedido: | 895279',
  'N | Vcto | Valor | Tipo de Pagamento | Banco | Agência | Conta | Correntistas | CNPJ/CPF',
  /* a linha do pagamento tem 9 celulas e comeca por numero, como a do produto (banco e agencia como no papel) */
  '1 | 12/11/2026 | 212.449,03 | 1 - PAG-CRÉDITO CC-TED-PIX | 341 | 3937 | 0000000000-0 | PRODUTOR TESTE | 000.000.000-00',
  'Código | Descrição dos produtos | Valor Médio @ | Unidade | Vol. | Peso | Peso @ | Preço | Total',
  '9022 | VACA RASTREADA | 340,00 | KG | 34 | 8.987,00 | 17,62 | 340,00 | 203.705,33',
  '000,000 a 999,999 | 34 | 8.987,00 | 340,00 | 203.705,33',
  '9039 | NOVILHA RASTREADA | 350,00 | KG | 2 | 525,60 | 17,52 | 350,00 | 12.264,00',
  'E 589 | CG ( - ) Desconto Contrib.Social Rural (Funrural) | 0,00 | 0,00 | 0,00 | 3.520,30',
  'Peso Líquido: | 9.512,60 | Total Qtde: | 36,000 | Bruto das Mercadorias: | 340,55',
  '215.969,33',
  'Total do Documento:',
  '212.449,03',
];

export const ROMANEIO_JBS = [
  'Romaneio de Abate',
  'Pedido: 895279 - Carga: 1',
  'Data do Abate: 13/10/2026 - Empresa: 179',
  'Total Abatido | 36,0 | 9.512,600 | 264,239 | 17,62 @',
  'O giro do boi vai ao ar das 7h às 8h (Horário de Brasília) | Romaneio de Abate - cFBED340 | Pag. | 1',
  'Total Abatido | 36,0 | 100,00% | 9.512,600 | 264,239 | 17,62 @',
];

/* ── passo 7e: a OC de 2 lotes (LT11 + LT12), copiadas dos PDFs reais e ANONIMIZADAS do mesmo jeito ─────────────────────── */
export const CHAVE_MINERVA_8815 = chaveSintetica('52168923000231', 2, 8815);

/** Acerto com DOIS blocos de lote e a secao de creditos (o incentivo PROAPE-PRECOCE/MS). Os resumos foram encurtados para uma
 *  linha por bloco com o total do bloco (a soma do resumo = o total do bloco continua valendo). */
export const ACERTO_MINERVA_2LOTES = [
  'FORTUNCERES S.A.',
  'CNPJ: 52.168.923/0002-31 INSC. EST.: 284881082',
  'Ordem Compra - 10315 - PRODUTOR TESTE',
  'Lote - 11 | Data Abate - 01/10/2026',
  'Resumo de Abate | Cabeça | Peso | Valor @ | Total',
  '1 - Novilha Normal (X) - Indicador | 18 | 4.211,00 | 358,47 | 100.635,67',
  'TOTAL Animais | 18 | 4.211,00 | 100.635,67',
  'Vencimento: 05/10/2026',
  'Impresso em : 01/10/2026 - 17:31:47 | 1 de 3',
  'Ordem Compra - 10314 - PRODUTOR TESTE',
  'Lote - 12 | Data Abate - 01/10/2026',
  'Resumo de Abate | Cabeça | Peso | Valor @ | Total',
  '8 - Novilha Normal (X) - Indicador | 20 | 4.900,00 | 359,00 | 117.000,00',
  '16 - Novilha Normal (X) - Indicador | 16 | 3.795,50 | 359,47 | 91.080,69',
  'TOTAL Animais | 36 | 8.695,50 | 208.080,69',
  'Vencimento: 05/10/2026',
  'Acertos no Pagamento | Valor',
  'Impresso em : 01/10/2026 - 17:31:47 | 2 de 3',
  'OC: 10314 - SENAR (0,2%) | 416,16',
  'OC: 10315 - SENAR (0,2%) | 201,27',
  'Total Despesas | 617,43',
  'OC: 10314 - INCENTIVO PROAPE-PRECOCE/MS | 5.540,50',
  'OC: 10315 - INCENTIVO PROAPE-PRECOCE/MS | 2.849,93',
  'Total Créditos | 8.390,43',
  'Total Geral | 316.489,36',
  'VALOR TOTAL DO PRODUTO R$ 308.716,36 Base de cálculo: R$ 308.716,36 x 0.2 (SENAR) R$ 617,43 = R$ 308.098,93',
];

/** A NF 8815: 15 linhas de gado (aqui, 3 que somam o mesmo), duas de incentivo (NCM 00000000), Funrural VAZIO ("FUNR R$ %"),
 *  duas NFs do produtor com um VR so'. Duas celulas COLADAS ("359,4700 122.411,52", "1,0000 5.540,5000") como a montagem as deu. */
export const NF_MINERVA_INCENTIVO = [
  'IDENTIFICAÇÃO DO EMITENTE', 'DANFE', 'Documento Auxiliar da Nota', 'Fiscal Eletrônica', 'FORTUNCERES S A',
  'RODOVIA BR 267, KM 35 | 0 | CHAVE DE ACESSO',
  em4(CHAVE_MINERVA_8815),
  'COMPRA P/ INDUSTRIALIZ | 150260044983025 - 01/10/2026 | 15:47:01',
  'VALOR DO FRETE | VALOR DO SEGURO | DESCONTO | OUTRAS DESPESAS | VALOR TOTAL DO IPI | VALOR DA COFINS | VALOR TOTAL DA NOTA',
  '0,00 | 0,00 | 0,00 | 0,00 | 0,00 | 0,00 | 317.106,79',
  'QUANTIDADE | ESPÉCIE | MARCA | NUMERAÇÃO | PESO BRUTO | PESO LÍQUIDO',
  '54 | BOVINOS | 12.906,500 | 12.906,500',
  '3010 | NOVILHA PARA ABATE | 01029000 | 051 | 1101 | Ar | 340,5333 | 359,4700 122.411,52 | 0,00 | 0,00 | 0,00',
  '3010 | NOVILHA PARA ABATE | 01029000 | 051 | 1101 | Ar | 181,6667 | 359,4700 | 65.303,72 | 0,00 | 0,00 | 0,00',
  '3010 | NOVILHA PARA ABATE | 01029000 | 051 | 1101 | Ar | 338,2334 | 358,4410 | 121.001,12 | 0,00 | 0,00 | 0,00',
  'INP14526 | INCENTIVO PROAPEPRECOCE/MS | 00000000 | 041 | 1101 | Un | 1,0000 5.540,5000 | 5.540,50 | 0,00 | 0,00 | 0,00',
  'INP14526 | INCENTIVO PROAPEPRECOCE/MS | 00000000 | 041 | 1101 | Un | 1,0000 2.849,9300 | 2.849,93 | 0,00 | 0,00 | 0,00',
  'Inf. Contribuinte: REF NOTA FISCAL DE PRODUTOR 9412557, 9412508 EMITIDA EM 29/09/2026 VR : 217 567,08 // DATA',
  'ABATE: 01/10/2026 // FAZENDA: FAZENDA TESTE // FUNR R$ % //',
  'SENAR R$ 617,44 0,200000 % // SEGURO R$ % // PRECOCE_MS PROAPE PRECOCE/MS DECRETO NO 11 176/2003',
];

export const ROMANEIO_MINERVA_LT11 = [
  'ROMANEIO DE ABATE',
  'Lote: | 11 | Ordem Compra: | 10315 | Ord. Prod.: | 46323',
  'Fornecedor: | PRODUTOR TESTE | Qtd. Programada: | 18 | Data Abate: | 01/10/2026',
  'Total | 18 | 4.211,00 | Média Total (KG): | 233,94',
];
export const ROMANEIO_MINERVA_LT12 = [
  'ROMANEIO DE ABATE',
  'Lote: | 12 | Ordem Compra: | 10314 | Ord. Prod.: | 46323',
  'Fornecedor: | PRODUTOR TESTE | Qtd. Programada: | 36 | Data Abate: | 01/10/2026',
  'Total | 36 | 8.695,50 | Média Total (KG): | 241,54',
];

/* ── 7f · saida da fazenda (OC-DOC-SAIDA-FAZENDA-01): copiadas dos PDFs reais da Vera (13/10) e ANONIMIZADAS — produtor, CPF, IE,
   codigos e endereco sairam; a chave da NFP-e e' sintetica (DV certo, com o CNPJ da SEFAZ-MS, que e' quem esta' na chave real). */
export const CHAVE_NFPE = chaveSintetica('02935843000105', 890, 9444790);

export const NFPE_SAIDA = [
  'DANFE', 'NOTA FISCAL ELETRÔNICA', '1 - SAÍDA', 'CHAVE DE ACESSO',
  'Nº | 009.444.790',
  'CNPJ: 02.935.843/0001-05',
  em4(CHAVE_NFPE),
  'SÉRIE: | 890',
  'NOTA FISCAL DO PRODUTOR ELETRÔNICA - NFPe',
  'NATUREZA DE OPERAÇÃO | PROTOCOLO DE AUTORIZAÇÃO DE USO',
  'REMETENTE',
  'NOME / RAZÃO SOCIAL | CNPJ/CPF | DATA DE EMISSÃO',
  'PRODUTOR TESTE | 000.000.000-00 | 09/10/2026 08:32:14',
  'ENDEREÇO | BAIRRO/DISTRITO | CEP | DATA DE ENTRADA/SAÍDA',
  'FAZENDA TESTE | ZONA RURAL | 79000-000 | 12/10/2026 07:00:00',
  'DESTINATÁRIO',
  'NOME / RAZÃO SOCIAL | CNPJ/CPF',
  'FRIGORIFICO TESTE | 02.916.265/0077-68',
  'VALOR DO FRETE | VALOR DO SEGURO | DESCONTO | OUTRAS DESPESAS ACESSÓRIAS | VALOR DO IPI | VALOR TOTAL DA NOTA',
  '0,00 | 0,00 | 0,00 | 0,00 | 0,00 | 75.483,72',
  'FEMEA PARA ABATE 36M - OP INTERNA - GADO BOVINO',
  '837 | 01022990 | 051 | 5101 | UN | 18,0000 | 4.193,5400 | 75.483,72 | 0,00 | 0,00 | 0,00 | 0,00 | 0,00',
  'Nº GTA: Q- | 745856 | ; TRANSPORTADOR DESCONHECIDO NO MOMENTO DA EMISSÃO DA NOTA FISCAL; Via de',
];

export const EGTA_SAIDA = [
  'Guia de Trânsito Animal | ( | e-GTA | ) | UF | Série | Número',
  '(Válida em todo o Território Nacional) | MS | Q | 745856',
  'PROCEDÊNCIA | DESTINO',
  'Estabelecimento: | FAZENDA TESTE | Estabelecimento: | FRIGORIFICO TESTE',
  'FINALIDADE: | ABATE | MEIO DE TRANSPORTE: | RODOVIÁRIO',
  'Fêmea | Macho | Total | Total por Extenso',
  '18 | 0 | 18 | DEZOITO ANIMAIS',
  'OBSERVAÇÕES | Data/Hora de Embarque: 12/10/2026 07:00:00. Não há registro de Ingresso',
  'Data: | 09/10/2026 08:30:59 | PRODUTOR TESTE',
  'Validade: | 15/10/2026 | Cargo: PRODUTOR',
];

export const MODELO_B_SAIDA = [
  'Declaração do Produtor',
  'Modelo B | Documento No. 27666194',
  'As informações da propriedade de origem dos animais relacionados na(s) GTA(s) série e número',
  '745856/Q ,745874/Q',
  'constantes na declaração do produtor MOD-B estão arquivadas neste Serviço Veterinário.',
  'Data e Hora de Emissão: | 09/10/2026 08:39 | Páginas: | 1 de 1',
];

export const CARTA_GARANTIA_SAIDA = [
  'Carta de Garantia do Produtor',
  'Eu, PRODUTOR TESTE, abaixo assinado, responsável pela propriedade rural FAZENDA TESTE, declaro que foram destinados 36 animais para serem abatidos no',
  'estabelecimento FRIGORIFICO TESTE sob SIF 0000 no dia 13/10/2026',
  'acompanhados da(s) GTA(s) Nº: 745856/Q e 745874/Q.',
  'Data Embarque: 09/10/2026',
];

/* P85/P86 (Gabriel 23/10/2026) — o MESMO layout dos PDFs da Fortunceres de 21/10, com dados SINTETICOS: uma OC de 2 lotes (ordens de compra
   20001 e 20002), cada lote com o seu acerto e o seu romaneio, e os dois romaneios com a MESMA "Ord. Prod." (como no caso real). O acerto do
   lote 7 tem o centavo de arredondamento do frigorifico: as linhas somam 124.000,01 e o PDF imprime TOTAL 124.000,00. */
export const ACERTO_LOTE7_UM_CENTAVO = [
  'FORTUNCERES S.A.',
  'RODOVIA SINTETICA, KM 0 - DISTRITO INDUSTRIAL',
  'CNPJ: 52.168.923/0002-31 INSC. EST.: 284881082',
  'Ordem Compra - 20002 - PRODUTOR TESTE',
  'Lote - 7 | Data Abate - 05/10/2026',
  'Resumo de Abate | Cabeça | Peso | Valor @ | Total',
  '1 - Bois Normal - Balcão | 20 | 6.000,00 | 300,00 | 120.000,01',
  '2 - Bois Tratamento Frio - Trat.Frio - Balcão | 1 | 300,00 | 200,00 | 4.000,00',
  'TOTAL Animais | 21 | 6.300,00 | 124.000,00',
  'Vencimento: 15/10/2026',
  'Acertos no Pagamento | Valor',
  'OC: 20002 - SENAR (0,2%) | 248,00',
  'Total Despesas | 248,00',
  'OC: 20002 - INCENTIVO PROAPE-PRECOCE/MS | 5.000,00',
  'Total Créditos | 5.000,00',
  'Total Geral | 128.752,00',
  'VALOR TOTAL DO PRODUTO R$ 124.000,00 Base de cálculo: R$ 124.000,00 x 0.2 (SENAR) R$ 248,00',
];
export const ROMANEIO_LOTE6 = [
  'ROMANEIO DE ABATE',
  'Lote: | 6 | Ordem Compra: | 20001 | Ord. Prod.: | 50001',
  'Fornecedor: | PRODUTOR TESTE | Qtd. Programada: | 30 | Data Abate: | 05/10/2026',
  'Total | 30 | 9.000,00 | Média Total (KG): | 300,00',
  'Média Total (@): | 20,00',
];
export const ROMANEIO_LOTE7 = [
  'ROMANEIO DE ABATE',
  'Lote: | 7 | Ordem Compra: | 20002 | Ord. Prod.: | 50001',
  'Fornecedor: | PRODUTOR TESTE | Qtd. Programada: | 21 | Data Abate: | 05/10/2026',
  'Total | 21 | 6.300,00 | Média Total (KG): | 300,00',
  'Média Total (@): | 20,00',
];
