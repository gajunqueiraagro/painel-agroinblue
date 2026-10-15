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
