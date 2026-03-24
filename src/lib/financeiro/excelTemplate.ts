/**
 * Geração do modelo Excel padrão para importação financeira.
 */
import * as XLSX from 'xlsx';

const COLUNAS = [
  'Data Realização',
  'Data Pagamento',
  'Produto',
  'Fornecedor',
  'Valor',
  'Status Transação',
  'Codigo_Fazenda',
  'Tipo Operação',
  'Conta Origem',
  'Conta Destino',
  'Macro_Custo',
  'Grupo_Custo',
  'Centro_Custo',
  'Subcentro',
  'Nota Fiscal',
  'Mês',
  'CNPJ/CPF',
  'Recorrência',
  'Forma de Pagamento',
  'Obs',
  'Ano',
  'Mes',
  'AnoMes',
];

const EXEMPLO_1 = [
  '2026-01-15', '2026-02-05', 'Sal mineral', 'Agro Nutrição Ltda', 4500.00,
  'Pago', '3M', 'Custo', 'Banco do Brasil', '', 'Nutrição',
  'Suplementação', 'Sal mineral', 'Proteinado', 'NF-001234', 'Janeiro',
  '12.345.678/0001-99', 'Mensal', 'Boleto', 'Entrega mensal', 2026, 1, '2026-01',
];

const EXEMPLO_2 = [
  '2026-02-10', '2026-02-10', 'Vacina aftosa', 'Vet Saúde Animal', 2800.00,
  'Pago', 'ADM', 'Custo', 'Sicredi', '', 'Sanidade',
  'Vacinação', 'Vacina obrigatória', '', 'NF-005678', 'Fevereiro',
  '98.765.432/0001-10', 'Semestral', 'PIX', 'Campanha mai/2026', 2026, 2, '2026-02',
];

const INSTRUCOES = [
  ['INSTRUÇÕES DE PREENCHIMENTO DO MODELO FINANCEIRO'],
  [],
  ['Campo', 'Obrigatório', 'Formato', 'Descrição'],
  ['Data Realização', 'SIM', 'AAAA-MM-DD', 'Data em que a despesa/receita foi realizada'],
  ['Data Pagamento', 'NÃO', 'AAAA-MM-DD', 'Data efetiva do pagamento'],
  ['Produto', 'NÃO', 'Texto', 'Descrição do produto ou serviço'],
  ['Fornecedor', 'NÃO', 'Texto', 'Nome do fornecedor ou cliente'],
  ['Valor', 'SIM', 'Numérico', 'Valor da operação (positivo = saída/custo, negativo = entrada/receita)'],
  ['Status Transação', 'NÃO', 'Texto', 'Ex: Pago, Pendente, Cancelado'],
  ['Codigo_Fazenda', 'SIM', 'Texto', 'Código oficial da fazenda cadastrado no sistema (ex: 3M, BG, ADM)'],
  ['Tipo Operação', 'NÃO', 'Texto', 'Ex: Custo, Receita, Investimento, Financeiro'],
  ['Conta Origem', 'NÃO', 'Texto', 'Conta bancária de origem'],
  ['Conta Destino', 'NÃO', 'Texto', 'Conta bancária de destino'],
  ['Macro_Custo', 'NÃO', 'Texto', 'Nível 1 da hierarquia de custo (ex: Nutrição, Sanidade)'],
  ['Grupo_Custo', 'NÃO', 'Texto', 'Nível 2 da hierarquia (ex: Suplementação, Vacinação)'],
  ['Centro_Custo', 'NÃO', 'Texto', 'Nível 3 da hierarquia (ex: Sal mineral, Vacina obrigatória)'],
  ['Subcentro', 'NÃO', 'Texto', 'Nível 4 — detalhe opcional (ex: Proteinado)'],
  ['Nota Fiscal', 'NÃO', 'Texto', 'Número da nota fiscal'],
  ['Mês', 'NÃO', 'Texto', 'Redundante — derivado de AnoMes'],
  ['CNPJ/CPF', 'NÃO', 'Texto', 'Documento do fornecedor'],
  ['Recorrência', 'NÃO', 'Texto', 'Ex: Mensal, Trimestral, Avulso'],
  ['Forma de Pagamento', 'NÃO', 'Texto', 'Ex: Boleto, PIX, Cartão, Cheque'],
  ['Obs', 'NÃO', 'Texto', 'Observações livres'],
  ['Ano', 'NÃO', 'Numérico', 'Redundante — derivado de AnoMes'],
  ['Mes', 'NÃO', 'Numérico', 'Redundante — derivado de AnoMes'],
  ['AnoMes', 'SIM', 'AAAA-MM', 'Competência oficial do lançamento (ex: 2026-03)'],
  [],
  ['REGRAS IMPORTANTES:'],
  ['1. O campo AnoMes é a competência oficial. Ano, Mês e Mes são redundantes e serão ignorados.'],
  ['2. A coluna Codigo_Fazenda deve conter o código oficial da fazenda cadastrado no app (ex: 3M, BG, ADM). ADM = Administrativo/Global.'],
  ['3. A hierarquia Macro > Grupo > Centro > Subcentro deve bater com os centros de custo cadastrados.'],
  ['4. Valores positivos representam saídas/custos. Valores negativos representam entradas/receitas.'],
  ['5. Datas devem estar no formato AAAA-MM-DD (ex: 2026-01-15).'],
];

export function downloadModeloExcel() {
  const wb = XLSX.utils.book_new();

  // Aba DADOS
  const dadosData = [COLUNAS, EXEMPLO_1, EXEMPLO_2];
  const wsDados = XLSX.utils.aoa_to_sheet(dadosData);

  // Column widths
  wsDados['!cols'] = COLUNAS.map((col) => ({
    wch: Math.max(col.length + 2, 18),
  }));

  XLSX.utils.book_append_sheet(wb, wsDados, 'DADOS');

  // Aba INSTRUCOES
  const wsInstrucoes = XLSX.utils.aoa_to_sheet(INSTRUCOES);
  wsInstrucoes['!cols'] = [{ wch: 22 }, { wch: 14 }, { wch: 14 }, { wch: 60 }];
  XLSX.utils.book_append_sheet(wb, wsInstrucoes, 'INSTRUCOES');

  XLSX.writeFile(wb, 'modelo_financeiro.xlsx');
}
