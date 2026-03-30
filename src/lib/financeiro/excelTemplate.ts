/**
 * Modelo Excel com aba única EXPORT_APP_UNICO.
 */
import { triggerXlsxDownload } from '@/lib/xlsxDownload';

const COLS = [
  'Tipo_Registro', 'AnoMes', 'Data_Ref', 'Conta', 'Fazenda',
  'Tipo', 'Grupo', 'Valor', 'Status', 'Produto',
  'Fornecedor', 'Macro_Custo', 'Grupo_Custo', 'Centro_Custo', 'Subcentro', 'Obs',
];

const EXAMPLES: unknown[][] = [
  ['LANCAMENTO', '2026-01', '2026-01-15', 'Banco do Brasil', '3M', '2-Saídas', 'Nutrição', 4500.00, 'Pago', 'Sal mineral', 'Agro Nutrição Ltda', 'Custeio Produtivo', 'Nutrição', 'Sal mineral', 'Proteinado', 'Entrega mensal'],
  ['LANCAMENTO', '2026-02', '2026-02-10', 'Sicredi', 'BG', '2-Saídas', 'Sanidade', 2800.00, 'Conciliado', 'Vacina aftosa', 'Vet Saúde Animal', 'Custeio Produtivo', 'Sanidade', 'Vacinação', '', 'Campanha mai/2026'],
  ['SALDO', '2026-01', '', 'Banco do Brasil', '', 'Saldo_Final', '', 125000.00, '', '', '', '', '', '', '', ''],
  ['SALDO', '2026-01', '', 'Sicredi', '', 'Saldo_Final', '', 43200.50, '', '', '', '', '', '', '', ''],
  ['RESUMO', '2026-01', '', '', '', 'Entradas', '', 85000.00, '', '', '', '', '', '', '', ''],
  ['RESUMO', '2026-01', '', '', '', 'Saidas', '', 62000.00, '', '', '', '', '', '', '', ''],
  ['RESUMO', '2026-01', '', '', '', 'Saldo_Final_Total', '', 168200.50, '', '', '', '', '', '', '', ''],
];

const INSTRUCOES: unknown[][] = [
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
  ['Conta', 'NÃO', 'Texto', 'Conta bancária (obrigatório para SALDO)'],
  ['Fazenda', 'SIM', 'Texto', 'Código de importação da fazenda'],
  ['Tipo', 'NÃO', 'Texto', 'Tipo operação (ex: 2-Saídas, 1-Entradas)'],
  ['Grupo', 'NÃO', 'Texto', 'Grupo do lançamento'],
  ['Valor', 'SIM', 'Numérico', 'Valor da operação'],
  ['Status', 'NÃO', 'Texto', 'Ex: Pago, Pendente, Conciliado'],
  ['Produto', 'NÃO', 'Texto', 'Descrição do produto ou serviço'],
  ['Fornecedor', 'NÃO', 'Texto', 'Nome do fornecedor ou cliente'],
  ['Macro_Custo', 'NÃO', 'Texto', 'Nível 1 hierarquia (ex: Custeio Produtivo)'],
  ['Grupo_Custo', 'NÃO', 'Texto', 'Nível 2 hierarquia'],
  ['Centro_Custo', 'NÃO', 'Texto', 'Nível 3 hierarquia'],
  ['Subcentro', 'NÃO', 'Texto', 'Nível 4 — detalhe opcional'],
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
        cols: COLS.map(c => ({ wch: Math.max(c.length + 2, 18) })),
      },
      {
        name: 'INSTRUCOES',
        mode: 'aoa',
        rows: INSTRUCOES,
        cols: [{ wch: 18 }, { wch: 14 }, { wch: 14 }, { wch: 60 }],
      },
    ],
  });
}
