/* REC-COLUNAS-01 — Financeiro › Recorrências na bancada: regras SINTÉTICAS com o PIOR texto de cada coluna curta (medido em 21/10/2026
   no dado real de todos os clientes e no domínio): Conta "Cartão BB - Ourocard Visa" (o maior nome de conta corrente/cartão), Tipo
   "A confirmar", Forma "Dinheiro" (a maior das formas do cadastro da recorrência), Situação "falta gerar · 44 meses" e "12 em mês
   fechado"; e Descrição/Favorecido longos (o caso do print: consórcio). Valores até 999.999,99 (o maior valor base real tem seis dígitos). A conta "Cartão BB - Ourocard Visa" é maior que a régua (corta com
   o inteiro no `title`); a do pior caso é "Cartão Sicredi Lavoura", o maior nome usado em recorrência. Nenhum nome de cliente. */
const hj = new Date();
const mes = `${hj.getFullYear()}-${String(hj.getMonth() + 1).padStart(2, '0')}`;
const CONTAS = [
  { id: 'c1', nome_conta: 'Cartão BB - Ourocard Visa', tipo_conta: 'cartao' },
  { id: 'c2', nome_conta: 'Cartão Sicredi Lavoura', tipo_conta: 'cartao' },
  { id: 'c3', nome_conta: 'Sicredi Pessoal', tipo_conta: 'cc' },
].map((c) => ({ ...c, banco: null, fazenda_id: 'f1', codigo_conta: null, nome_exibicao: null, agencia: null, numero_conta: null, conta_digito: null, aliases: [] }));
const FORMAS = ['Dinheiro', 'PIX', 'TED', 'Boleto', 'Cartão', 'Débito', 'Outro', null];
const DESCR = ['Consórcio Máquinas Agrícolas grupo 4321 cota 0987', 'Internet Fazenda Exemplo', 'Folha de pagamento do retiro da serra',
  'Seguro rural do maquinário pesado', 'Energia elétrica da sede', 'Contador', 'Aluguel do pasto do vizinho de baixo'];
const FAVOR = ['Administradora de Consórcios Exemplo Nacional S.A.', 'Provedor de Internet Exemplo', 'Cooperativa de Crédito Rural Exemplo',
  'Seguradora Exemplo do Agronegócio', 'Companhia de Energia Exemplo', null, 'Fulano de Tal da Silva Sauro'];
export const REGRAS = Array.from({ length: 21 }, (_, i) => ({
  id: `r${i}`, cliente_id: 'cli', descricao: DESCR[i % DESCR.length], favorecido_id: FAVOR[i % FAVOR.length] ? `fv${i}` : null,
  financeiro_fornecedores: FAVOR[i % FAVOR.length] ? { nome: FAVOR[i % FAVOR.length] } : null,
  conta_bancaria_id: CONTAS[i % 3].id, subcentro: 'Comunicação e Energia Pecuária', safra_id: null, forma_pagamento: FORMAS[i % FORMAS.length],
  observacao: null, valor_base: -(i === 0 ? 999999.99 : 1000 + i * 137.5), tipo_operacao: '2-Saídas', dia_vencimento: (i % 28) + 1,
  data_inicio: '2025-01-01', primeiro_vencimento: `2025-01-${String((i % 28) + 1).padStart(2, '0')}`, data_fim: '2030-12-31', ativo: true, ultimo_lancamento_gerado: i % 7 === 6 ? null : `${mes}-01`,
  fazenda_id: 'f1', tipo_valor: i % 2 ? 'estimado' : 'exato', folha: i % 5 === 2,
}));
const dia = (d: number) => `${mes}-${String(d).padStart(2, '0')}`;
export const OCORRENCIAS = REGRAS.filter((r) => r.ultimo_lancamento_gerado).map((r, i) => ({
  recorrencia_id: r.id, valor: Math.abs(r.valor_base), data_vencimento: dia(r.dia_vencimento), status_transacao: 'programado',
  valor_do_mes_em: i % 4 === 1 ? `${mes}-01T10:00:00Z` : null }));
export const A_GERAR = [
  { recorrencia_id: 'r0', a_gerar: 44, fechados: 0, passados: 2, primeira: '2026-09', ultima: '2030-04' },
  { recorrencia_id: 'r3', a_gerar: 0, fechados: 12, passados: 0, primeira: null, ultima: null },
  { recorrencia_id: 'r8', a_gerar: 3, fechados: 0, passados: 0, primeira: '2026-11', ultima: '2027-01' },
];
export { CONTAS as CONTAS_REC };
