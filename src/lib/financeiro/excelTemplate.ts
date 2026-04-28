/**
 * Modelo Excel com aba única EXPORT_APP_UNICO.
 */
import { triggerXlsxDownload, type XlsxCellValue } from '@/lib/xlsxDownload';

const COLS: XlsxCellValue[] = [
  'Tipo_Registro', 'AnoMes', 'Data_Ref', 'Data_Competencia', 'Conta', 'Conta_Destino', 'Fazenda',
  'Tipo', 'Grupo', 'Valor', 'Status', 'Produto',
  'Fornecedor', 'Macro_Custo', 'Grupo_Custo', 'Centro_Custo', 'Subcentro', 'Documento', 'Obs',
];

const EXAMPLES: XlsxCellValue[][] = [
  ['LANCAMENTO', '2026-01', '2026-01-15', null, 'Banco do Brasil', null, '3M', '2-Saídas', 'Nutrição', 4500.00, 'Realizado', 'Sal mineral', 'Agro Nutrição Ltda', 'Custeio Produção', 'Nutrição', 'Sal mineral', null, 'NF 123456', 'Entrega mensal'],
  ['LANCAMENTO', '2026-02', '2026-02-10', null, 'Sicredi', null, 'BG', '2-Saídas', 'Sanidade', 2800.00, 'Realizado', 'Vacina aftosa', 'Vet Saúde Animal', 'Custeio Produção', 'Sanidade', 'Vacinação', null, 'Recibo 4567', 'Campanha mai/2026'],
  ['LANCAMENTO', '2026-03', '2026-03-05', null, 'Itaú CDI', 'Itaú Personalité', '3M', '3-Transferências', 'Resgate', 50000.00, 'Realizado', 'Resgate CDI', null, null, null, null, null, null, 'Transferência entre contas'],
  ['SALDO', '2026-01', null, null, 'Banco do Brasil', null, null, 'Saldo_Final', null, 125000.00, null, null, null, null, null, null, null, null, null],
  ['SALDO', '2026-01', null, null, 'Sicredi', null, null, 'Saldo_Final', null, 43200.50, null, null, null, null, null, null, null, null, null],
  ['RESUMO', '2026-01', null, null, null, null, null, 'Entradas', null, 85000.00, null, null, null, null, null, null, null, null, null],
  ['RESUMO', '2026-01', null, null, null, null, null, 'Saidas', null, 62000.00, null, null, null, null, null, null, null, null, null],
  ['RESUMO', '2026-01', null, null, null, null, null, 'Saldo_Final_Total', null, 168200.50, null, null, null, null, null, null, null, null, null],
];

const INSTRUCOES: XlsxCellValue[][] = [
  ['INSTRUÇÕES — MODELO FINANCEIRO UNIFICADO'],
  [],
  ['Este modelo possui 1 aba obrigatória: EXPORT_APP_UNICO'],
  [],
  ['═══════════════════════════════════════════════════════════'],
  ['COLUNA', 'OBRIGATÓRIO', 'FORMATO', 'DESCRIÇÃO'],
  ['═══════════════════════════════════════════════════════════'],
  ['Tipo_Registro', 'SIM', 'Texto', 'LANCAMENTO, SALDO ou RESUMO'],
  ['AnoMes', 'SIM', 'AAAA-MM', 'Competência (ex: 2026-03)'],
  ['Data_Ref', 'NÃO', 'AAAA-MM-DD', 'Data de referência/pagamento'],
  ['Data_Competencia', 'NÃO', 'AAAA-MM-DD', 'Data da competência. Se vazia = usa Data_Ref. Use quando pagamento ≠ competência (ex: salário pago em abr mas competência mar)'],
  ['Conta', 'NÃO', 'Texto', 'Conta bancária de origem (obrigatório para SALDO e Transferências)'],
  ['Conta_Destino', 'NÃO', 'Texto', 'Conta bancária de destino (obrigatório para Transferências)'],
  ['Fazenda', 'SIM', 'Texto', 'Código de importação da fazenda'],
  ['Tipo', 'NÃO', 'Texto', 'Tipo operação (ex: 2-Saídas, 1-Entradas)'],
  ['Grupo', 'NÃO', 'Texto', 'Grupo do lançamento'],
  ['Valor', 'SIM', 'Numérico', 'Valor da operação'],
  ['Status', 'NÃO', 'Texto', 'Ex: Pago, Pendente, Realizado'],
  ['Produto', 'NÃO', 'Texto', 'Descrição do produto ou serviço'],
  ['Fornecedor', 'NÃO', 'Texto', 'Nome do fornecedor ou cliente'],
  ['Macro_Custo', 'NÃO', 'Texto', 'Nível 1 hierarquia (ex: Custeio Produtivo)'],
  ['Grupo_Custo', 'NÃO', 'Texto', 'Nível 2 hierarquia'],
  ['Centro_Custo', 'NÃO', 'Texto', 'Nível 3 hierarquia'],
  ['Subcentro', 'NÃO', 'Texto', 'Nível 4 — detalhe opcional'],
  ['Documento', 'NÃO', 'Texto', 'Tipo + número do documento (ex: NF 123456, Recibo 4567, Contrato 2024-01)'],
  ['Obs', 'NÃO', 'Texto', 'Observações livres'],
  [],
  ['TIPOS DE REGISTRO:'],
  ['LANCAMENTO = base detalhada dos lançamentos financeiros'],
  ['SALDO = saldo final por conta e mês (Conta obrigatória)'],
  ['RESUMO = indicadores mensais resumidos de caixa'],
  [],
  ['REGRAS:'],
  ['1. Fazenda deve conter o código de importação cadastrado.'],
  ['2. Valores positivos = saídas/custos. Negativos = entradas/receitas.'],
  ['3. Datas: AAAA-MM-DD. AnoMes: AAAA-MM.'],
  ['4. O app fará agrupamentos e análises. A planilha é apenas origem dos dados.'],
  ['5. Para RESUMO, use Obs para detalhar Entradas/Saidas/Saldo.'],
];

export function downloadModeloExcel() {
  triggerXlsxDownload({
    filename: 'modelo_financeiro.xlsx',
    sheets: [
      {
        name: 'EXPORT_APP_UNICO',
        mode: 'aoa',
        rows: [COLS, ...EXAMPLES],
        cols: COLS.map(c => ({ wch: Math.max(String(c ?? '').length + 2, 18) })),
      },
      {
        name: 'INSTRUCOES',
        mode: 'aoa',
        rows: INSTRUCOES,
        cols: [{ wch: 20 }, { wch: 14 }, { wch: 14 }, { wch: 70 }],
      },
    ],
  });
}
