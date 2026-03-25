/**
 * Modelo Excel com 4 abas de exportação para importação financeira.
 */
import * as XLSX from 'xlsx';

// ── EXPORT_LANCAMENTOS ──
const LANC_COLS = [
  'AnoMes', 'Data Pagamento', 'Valor', 'Status Transação', 'Fazenda',
  'Tipo Operação', 'Macro_Custo', 'Grupo_Custo', 'Centro_Custo', 'Subcentro',
  'Conta Origem', 'Conta Destino', 'Fornecedor', 'Produto', 'Obs',
];

const LANC_EX1 = [
  '2026-01', '2026-02-05', 4500.00, 'Pago', '3M',
  '2-Saídas', 'Custeio Produtivo', 'Nutrição', 'Sal mineral', 'Proteinado',
  'Banco do Brasil', '', 'Agro Nutrição Ltda', 'Sal mineral', 'Entrega mensal',
];

const LANC_EX2 = [
  '2026-02', '2026-02-10', 2800.00, 'Conciliado', 'BG',
  '2-Saídas', 'Custeio Produtivo', 'Sanidade', 'Vacinação', '',
  'Sicredi', '', 'Vet Saúde Animal', 'Vacina aftosa', 'Campanha mai/2026',
];

// ── EXPORT_SALDOS_BANCARIOS ──
const SALDO_COLS = ['Conta Banco', 'AnoMes', 'Saldo_Final'];
const SALDO_EX1 = ['Banco do Brasil', '2026-01', 125000.00];
const SALDO_EX2 = ['Sicredi', '2026-01', 43200.50];

// ── EXPORT_CONTAS ──
const CONTAS_COLS = ['Conta_ID', 'Conta_Label', 'Banco', 'Instrumento', 'Agencia/Conta', 'Uso'];
const CONTAS_EX1 = ['BB_CC', 'BB Conta Corrente', 'Banco do Brasil', 'Conta Corrente', '1234/56789-0', 'Operacional'];
const CONTAS_EX2 = ['SIC_PJ', 'Sicredi PJ', 'Sicredi', 'Conta Corrente', '0101/98765-4', 'Operacional'];

// ── EXPORT_RESUMO_CAIXA ──
const RESUMO_COLS = ['AnoMes', 'Entradas', 'Saidas', 'Saldo_Final_Total'];
const RESUMO_EX1 = ['2026-01', 85000.00, 62000.00, 168200.50];
const RESUMO_EX2 = ['2026-02', 120000.00, 74300.00, 213900.50];

// ── INSTRUÇÕES ──
const INSTRUCOES = [
  ['INSTRUÇÕES — MODELO FINANCEIRO SIMPLIFICADO'],
  [],
  ['Este modelo possui 4 abas de exportação. Preencha cada aba conforme instruções abaixo.'],
  [],
  ['═══════════════════════════════════════════════════════════'],
  ['ABA: EXPORT_LANCAMENTOS'],
  ['═══════════════════════════════════════════════════════════'],
  ['Campo', 'Obrigatório', 'Formato', 'Descrição'],
  ['AnoMes', 'SIM', 'AAAA-MM', 'Competência oficial do lançamento (ex: 2026-03)'],
  ['Data Pagamento', 'NÃO', 'AAAA-MM-DD', 'Data efetiva do pagamento'],
  ['Valor', 'SIM', 'Numérico', 'Valor da operação (positivo = saída, negativo = entrada)'],
  ['Status Transação', 'NÃO', 'Texto', 'Ex: Pago, Pendente, Conciliado'],
  ['Fazenda', 'SIM', 'Texto', 'Código de importação da fazenda (ex: 3M, BG, ADM)'],
  ['Tipo Operação', 'NÃO', 'Texto', 'Ex: 1-Entradas, 2-Saídas, 3-Investimento'],
  ['Macro_Custo', 'NÃO', 'Texto', 'Nível 1 hierarquia (ex: Custeio Produtivo)'],
  ['Grupo_Custo', 'NÃO', 'Texto', 'Nível 2 hierarquia (ex: Nutrição)'],
  ['Centro_Custo', 'NÃO', 'Texto', 'Nível 3 hierarquia (ex: Sal mineral)'],
  ['Subcentro', 'NÃO', 'Texto', 'Nível 4 — detalhe opcional'],
  ['Conta Origem', 'NÃO', 'Texto', 'Conta bancária de origem'],
  ['Conta Destino', 'NÃO', 'Texto', 'Conta bancária de destino'],
  ['Fornecedor', 'NÃO', 'Texto', 'Nome do fornecedor ou cliente'],
  ['Produto', 'NÃO', 'Texto', 'Descrição do produto ou serviço'],
  ['Obs', 'NÃO', 'Texto', 'Observações livres'],
  [],
  ['═══════════════════════════════════════════════════════════'],
  ['ABA: EXPORT_SALDOS_BANCARIOS'],
  ['═══════════════════════════════════════════════════════════'],
  ['Campo', 'Obrigatório', 'Formato', 'Descrição'],
  ['Conta Banco', 'SIM', 'Texto', 'Nome da conta bancária'],
  ['AnoMes', 'SIM', 'AAAA-MM', 'Mês de referência do saldo'],
  ['Saldo_Final', 'SIM', 'Numérico', 'Saldo ao final do mês'],
  [],
  ['═══════════════════════════════════════════════════════════'],
  ['ABA: EXPORT_CONTAS'],
  ['═══════════════════════════════════════════════════════════'],
  ['Campo', 'Obrigatório', 'Formato', 'Descrição'],
  ['Conta_ID', 'SIM', 'Texto', 'Código único da conta (ex: BB_CC)'],
  ['Conta_Label', 'SIM', 'Texto', 'Nome da conta para exibição'],
  ['Banco', 'NÃO', 'Texto', 'Nome do banco'],
  ['Instrumento', 'NÃO', 'Texto', 'Ex: Conta Corrente, Poupança, CDB'],
  ['Agencia/Conta', 'NÃO', 'Texto', 'Número da agência e conta'],
  ['Uso', 'NÃO', 'Texto', 'Finalidade: Operacional, Investimento, etc.'],
  [],
  ['═══════════════════════════════════════════════════════════'],
  ['ABA: EXPORT_RESUMO_CAIXA'],
  ['═══════════════════════════════════════════════════════════'],
  ['Campo', 'Obrigatório', 'Formato', 'Descrição'],
  ['AnoMes', 'SIM', 'AAAA-MM', 'Mês de referência'],
  ['Entradas', 'SIM', 'Numérico', 'Total de entradas no mês'],
  ['Saidas', 'SIM', 'Numérico', 'Total de saídas no mês'],
  ['Saldo_Final_Total', 'SIM', 'Numérico', 'Saldo final consolidado'],
  [],
  ['REGRAS IMPORTANTES:'],
  ['1. O campo Fazenda (EXPORT_LANCAMENTOS) deve conter o código de importação cadastrado na fazenda.'],
  ['2. Valores positivos = saídas/custos. Valores negativos = entradas/receitas.'],
  ['3. Datas no formato AAAA-MM-DD. AnoMes no formato AAAA-MM.'],
  ['4. O app fará todos os agrupamentos e análises. A planilha é apenas a origem dos dados.'],
];

function makeSheet(cols: string[], examples: unknown[][], colWidth = 20) {
  const ws = XLSX.utils.aoa_to_sheet([cols, ...examples]);
  ws['!cols'] = cols.map(c => ({ wch: Math.max(c.length + 2, colWidth) }));
  return ws;
}

export function downloadModeloExcel() {
  const wb = XLSX.utils.book_new();

  XLSX.utils.book_append_sheet(wb, makeSheet(LANC_COLS, [LANC_EX1, LANC_EX2]), 'EXPORT_LANCAMENTOS');
  XLSX.utils.book_append_sheet(wb, makeSheet(SALDO_COLS, [SALDO_EX1, SALDO_EX2]), 'EXPORT_SALDOS_BANCARIOS');
  XLSX.utils.book_append_sheet(wb, makeSheet(CONTAS_COLS, [CONTAS_EX1, CONTAS_EX2]), 'EXPORT_CONTAS');
  XLSX.utils.book_append_sheet(wb, makeSheet(RESUMO_COLS, [RESUMO_EX1, RESUMO_EX2]), 'EXPORT_RESUMO_CAIXA');

  const wsInst = XLSX.utils.aoa_to_sheet(INSTRUCOES);
  wsInst['!cols'] = [{ wch: 22 }, { wch: 14 }, { wch: 14 }, { wch: 60 }];
  XLSX.utils.book_append_sheet(wb, wsInst, 'INSTRUCOES');

  XLSX.writeFile(wb, 'modelo_financeiro.xlsx');
}
