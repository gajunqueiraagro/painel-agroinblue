// ============================================================================
// modeloPlanilha — PR-IMPORT-EXCEL-LANC-02. Gera e baixa a planilha modelo.
//
// Gerado NO NAVEGADOR com a mesma xlsx (SheetJS) que já é dependência — nenhum
// binário versionado no repo, nada para sair de sincronia num deploy.
//
// FONTE ÚNICA DOS CABEÇALHOS: as constantes COL_* de parserLancamentos. O modelo
// usa o PRIMEIRO alias de cada lista como cabeçalho canônico, então o arquivo que
// o operador baixa é, por construção, um arquivo que a tela sabe ler. Se um alias
// mudar lá, o modelo acompanha sozinho. NUNCA redigitar a string aqui.
//
// Não há dependência circular: importLanc → excelPreview é a direção que já existe
// (importLancamentosView faz o mesmo); parserLancamentos não importa de importLanc.
// ============================================================================
import * as XLSX from 'xlsx';
import {
  COL_COMPETENCIA, COL_VALOR, COL_TIPO, COL_CONTA_PLANO, COL_FAZENDA,
  COL_FORNECEDOR, COL_CONTA_BANCARIA, COL_VENCIMENTO, COL_PAGAMENTO,
  COL_DESCRICAO, COL_DOCUMENTO, COL_TIPO_DOCUMENTO, COL_FORMA_PAGAMENTO,
  COL_OBSERVACAO, COL_STATUS, COL_SAFRA,
  TIPO_ENTRADAS, TIPO_SAIDAS,
} from '@/v2/lib/excelPreview/parserLancamentos';

interface ColunaModelo {
  /** Cabeçalho canônico = primeiro alias aceito pelo parser. */
  cabecalho: string;
  obrigatoria: boolean;
  /** Três exemplos, um por linha de amostra. */
  exemplos: [string, string, string];
  largura: number;
}

const col = (
  aliases: readonly string[],
  obrigatoria: boolean,
  exemplos: [string, string, string],
  largura: number,
): ColunaModelo => ({ cabecalho: aliases[0], obrigatoria, exemplos, largura });

/** Ordem e obrigatoriedade definidas no briefing PR-IMPORT-EXCEL-LANC-02. */
const COLUNAS: ColunaModelo[] = [
  col(COL_COMPETENCIA,    true,  ['01/07/2026', '05/07/2026', '12/07/2026'], 18),
  col(COL_VALOR,          true,  ['1.250,00', '380,90', '2.100,00'], 12),
  col(COL_TIPO,           true,  [TIPO_SAIDAS, TIPO_SAIDAS, TIPO_ENTRADAS], 18),
  col(COL_CONTA_PLANO,    true,  ['COMBUSTIVEL', 'MANUTENCAO DE MAQUINAS', 'VENDA DE BOI GORDO'], 28),
  col(COL_FAZENDA,        true,  ['SR', 'SR', 'BR'], 12),
  col(COL_FORNECEDOR,     true,  ['POSTO IPIRANGA', 'OFICINA DO ZE', 'FRIGORIFICO XYZ'], 24),
  col(COL_CONTA_BANCARIA, true,  ['Cartão Itaú', 'Cartão Itaú', 'Banco do Brasil'], 20),
  col(COL_VENCIMENTO,     false, ['10/07/2026', '', ''], 18),
  col(COL_PAGAMENTO,      false, ['10/07/2026', '05/07/2026', '12/07/2026'], 18),
  col(COL_DESCRICAO,      false, ['Diesel S10 — 200 L', 'Troca de óleo do trator', 'Venda 32 cab.'], 30),
  col(COL_DOCUMENTO,      false, ['NF 12345', '', 'NF 998'], 14),
  col(COL_TIPO_DOCUMENTO, false, ['NF', '', 'NF'], 16),
  col(COL_FORMA_PAGAMENTO,false, ['Cartão', 'PIX', 'TED'], 18),
  col(COL_OBSERVACAO,     false, ['', 'Garantia 3 meses', ''], 26),
  col(COL_STATUS,         false, ['realizado', 'realizado', 'previsto'], 12),
  col(COL_SAFRA,          false, ['2026/2027', '', ''], 12),
];

const VERMELHO = 'FFC00000';
const CINZA = 'FF808080';
const AZUL = 'FF1F4E79';

/** Marca uma célula com estilo. SheetJS community não escreve estilo em .xlsx,
 *  mas o campo `s` é preservado e o Excel/LibreOffice ignoram sem quebrar — o
 *  contraste real vem do TEXTO do marcador ("OBRIGATÓRIA" vs "opcional"). */
function estilo(cor: string, negrito: boolean, italico = false) {
  return { font: { color: { rgb: cor }, bold: negrito, italic: italico } };
}

function montarAbaLancamentos(): XLSX.WorkSheet {
  const linhaMarcador = COLUNAS.map((c) => (c.obrigatoria ? 'OBRIGATÓRIA' : 'opcional'));
  const linhaCabecalho = COLUNAS.map((c) => c.cabecalho);
  const exemplos = [0, 1, 2].map((i) => COLUNAS.map((c) => c.exemplos[i]));

  const ws = XLSX.utils.aoa_to_sheet([linhaMarcador, linhaCabecalho, ...exemplos]);

  // Estilo por célula (best-effort — ver comentário em `estilo`).
  COLUNAS.forEach((c, i) => {
    const marcador = XLSX.utils.encode_cell({ r: 0, c: i });
    const cabecalho = XLSX.utils.encode_cell({ r: 1, c: i });
    if (ws[marcador]) ws[marcador].s = estilo(c.obrigatoria ? VERMELHO : CINZA, c.obrigatoria);
    if (ws[cabecalho]) ws[cabecalho].s = estilo('FF000000', true);
    for (let r = 2; r <= 4; r++) {
      const cel = XLSX.utils.encode_cell({ r, c: i });
      if (ws[cel]) ws[cel].s = estilo(AZUL, false, true);
    }
  });

  ws['!cols'] = COLUNAS.map((c) => ({ wch: c.largura }));
  // Painéis congelados em A3: marcador e cabeçalho ficam sempre à vista.
  ws['!freeze'] = { xSplit: 0, ySplit: 2, topLeftCell: 'A3', activePane: 'bottomLeft', state: 'frozen' };
  return ws;
}

/** Uma seção da aba Instruções. */
type Bloco = [titulo: string, ...linhas: string[]];

function blocosInstrucoes(): Bloco[] {
  const nome = (c: ColunaModelo) => c.cabecalho;
  const porCabecalho = (cab: string) => COLUNAS.find((c) => c.cabecalho === cab);

  const obrig = COLUNAS.filter((c) => c.obrigatoria).map(nome).join(' · ');
  const opc = COLUNAS.filter((c) => !c.obrigatoria).map(nome).join(' · ');

  return [
    ['COMO USAR',
      '1. Apague as três linhas de exemplo (linhas 3 a 5 da aba Lancamentos).',
      '2. Preencha uma linha por lançamento. Não renomeie os cabeçalhos da linha 2.',
      '3. Salve e envie na tela Importação Lançamentos (Excel).',
      '4. A tela mostra as contas encontradas e você mapeia cada uma. O mapeamento fica memorizado.',
      '5. Confira a prévia. Nada é gravado até você confirmar.',
    ],
    ['COLUNAS OBRIGATÓRIAS', obrig],
    ['COLUNAS OPCIONAIS', opc],
    [`${porCabecalho(COL_CONTA_PLANO[0])?.cabecalho} — ATENÇÃO, O ERRO MAIS COMUM`,
      'É o PLANO DE CONTAS do cliente, NÃO a conta bancária.',
      'Exemplos corretos: COMBUSTIVEL · MANUTENCAO DE MAQUINAS · VENDA DE BOI GORDO.',
      'Exemplos ERRADOS (isto é conta bancária, vai na coluna "Conta bancária"): cc-001 | bradesco · Itaú Ag. 8541.',
      'Cada valor distinto desta coluna você mapeia uma vez para um subcentro AGROinBLUE.',
      'O apelido fica memorizado: na próxima importação já vem preenchido.',
    ],
    [`${nome(COLUNAS[0])} — DECIDE O MÊS`,
      'A competência define em que mês o lançamento entra, e é ela que é testada contra mês fechado.',
      'A data de pagamento NÃO decide o mês. Se as duas forem de meses diferentes, vale a competência.',
    ],
    [`${nome(COLUNAS[1])} — SEMPRE POSITIVO`,
      'Informe o valor em módulo, sem sinal. Aceita 1.250,00 ou 1250 ou 1250.00.',
      'O sentido (entrada ou saída) vem da coluna Tipo de operação, nunca do sinal do valor.',
    ],
    [`${nome(COLUNAS[2])} — ENTRADA OU SAÍDA`,
      `Use exatamente: ${TIPO_ENTRADAS} ou ${TIPO_SAIDAS}.`,
      'São aceitas também as formas curtas: Entrada, Saída, Receita, Despesa.',
      'TRANSFERÊNCIAS NÃO SÃO CRIADAS por esta importação — a linha fica de fora, com aviso.',
    ],
    ['Fazenda, Fornecedor e Conta bancária',
      'Escreva como preferir: você mapeia os valores distintos na tela, uma vez.',
      'Fornecedor que ainda não existe pode ser cadastrado na hora, sem sair da importação.',
      'Se a planilha não tiver a coluna Fazenda, a tela pede uma fazenda válida para todas as linhas.',
    ],
    [`${nome(COLUNAS[14])} — OPCIONAL`,
      'Aceita: realizado ou previsto. Vazio ou ausente assume realizado.',
    ],
    ['NÃO COLOQUE NA PLANILHA — SÃO DERIVADOS',
      'macro custo, centro de custo, grupo de custo, escopo de negócio: vêm do subcentro que você mapear.',
      'sinal: vem do Tipo de operação.',
      'ano/mês: vem da Data de competência.',
      'Preencher essas colunas não tem efeito: o sistema recalcula.',
    ],
    ['POR QUE UMA LINHA PODE FICAR DE FORA',
      '1. Transferência — não é criada por esta importação.',
      '2. Fazenda não resolvida — o valor da coluna Fazenda não foi mapeado.',
      '3. Mês fechado — a competência cai em mês já fechado PARA AQUELA FAZENDA.',
      '4. Conta do plano não mapeada — falta escolher o subcentro daquele valor.',
      'A linha problemática fica de fora; as demais entram normalmente. A prévia mostra tudo antes.',
    ],
    ['O QUE ESTA IMPORTAÇÃO NÃO FAZ',
      'Não concilia com extrato bancário. Não altera lançamento que já existe.',
      'Se a movimentação já entrou pelo OFX, a linha equivalente não vira lançamento duplicado.',
    ],
  ];
}

function montarAbaInstrucoes(): XLSX.WorkSheet {
  const linhas: string[][] = [];
  for (const [titulo, ...corpo] of blocosInstrucoes()) {
    linhas.push([titulo]);
    for (const l of corpo) linhas.push([l]);
    linhas.push(['']);
  }
  const ws = XLSX.utils.aoa_to_sheet(linhas);
  ws['!cols'] = [{ wch: 120 }];
  return ws;
}

/** Monta o workbook e dispara o download. Puro efeito de UI — não toca o banco. */
export function baixarModeloPlanilha(): void {
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, montarAbaLancamentos(), 'Lancamentos');
  XLSX.utils.book_append_sheet(wb, montarAbaInstrucoes(), 'Instruções');
  XLSX.writeFile(wb, 'modelo-importacao-lancamentos.xlsx');
}
