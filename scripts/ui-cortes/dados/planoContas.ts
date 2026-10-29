/* P172 — Cadastros › Plano de Contas na bancada. Dado SINTÉTICO, no pior caso medido no proto (29/10): macro de 23 letras, grupo e centro
   de 35, subcentro de 54; os três tipos; contas globais inativas; subcentros DO CLIENTE no centro do molde do P171 (ativos e um inativo);
   dividendos do cadastro com nome longo. Volume para o corpo rolar (~190 contas). */
type Conta = {
  id: string; cliente_id: string | null; tipo_operacao: string; macro_custo: string; grupo_custo: string | null; centro_custo: string;
  subcentro: string | null; escopo_negocio: string; ativo: boolean; ordem_exibicao: number; compoe_dre: boolean;
};
const c = (id: string, tipo: string, macro: string, grupo: string, centro: string, sub: string, ordem: number, o: Partial<Conta> = {}): Conta => ({
  id, cliente_id: null, tipo_operacao: tipo, macro_custo: macro, grupo_custo: grupo, centro_custo: centro, subcentro: sub,
  escopo_negocio: 'pecuaria', ativo: true, ordem_exibicao: ordem, compoe_dre: true, ...o,
});
const MACRO_LONGO = 'Receita Operacional Agr';
const GRUPO_LONGO = 'Grupo Sintético de Nome Bem Comprido';
const CENTRO_LONGO = 'Centro Sintético de Nome Comprido X';
const SUB_LONGO = 'Subcentro Sintético com o Nome Mais Comprido do Plano X';

export const PLANO: Conta[] = [
  c('r1', '1-Entradas', 'Receita Operacional', 'Pecuária', 'Venda de Animais', 'Venda de Boi Gordo', 1010),
  c('r2', '1-Entradas', 'Receita Operacional', 'Pecuária', 'Venda de Animais', 'Venda de Vacas', 1011),
  c('r3', '1-Entradas', MACRO_LONGO, GRUPO_LONGO, CENTRO_LONGO, SUB_LONGO, 1020),
  c('r4', '1-Entradas', 'Entrada Financeira', 'Outras Entradas', 'Movimentações Financeiras', 'Adiantamento de Clientes', 3010, { ativo: false, compoe_dre: false, escopo_negocio: 'administrativo' }),
  ...Array.from({ length: 150 }, (_, k) => c(`d${k}`, '2-Saídas', 'Custeio Produção', k % 3 ? 'Custo Variável Pecuária' : GRUPO_LONGO,
    k % 4 ? `Centro Sintético ${String(k % 9).padStart(2, '0')}` : CENTRO_LONGO, k % 5 ? `Subcentro sintético ${String(k).padStart(3, '0')}` : SUB_LONGO, 6000 + k,
    k % 37 === 0 ? { ativo: false } : {})),
  c('s1', '2-Saídas', 'Saída Financeira', 'Outras Saídas', 'Ajustes', 'Pagamento Estornado', 16005, { compoe_dre: false, escopo_negocio: 'administrativo' }),
  c('s2', '2-Saídas', 'Saída Financeira', 'Outras Saídas', 'Repasses a terceiros', 'Animais de funcionários', 16006, { cliente_id: 'cli', compoe_dre: false, escopo_negocio: 'administrativo' }),
  c('s3', '2-Saídas', 'Saída Financeira', 'Outras Saídas', 'Repasses a terceiros', SUB_LONGO, 16006, { cliente_id: 'cli', compoe_dre: false, escopo_negocio: 'administrativo' }),
  c('s4', '2-Saídas', 'Saída Financeira', 'Outras Saídas', 'Repasses a terceiros', 'Repasse antigo', 16006, { cliente_id: 'cli', ativo: false, compoe_dre: false, escopo_negocio: 'administrativo' }),
  c('s5', '2-Saídas', 'Saída Financeira', 'Outras Saídas', 'Amortizações', 'Amortização de Empréstimo', 16010, { compoe_dre: false, escopo_negocio: 'administrativo' }),
  c('s6', '2-Saídas', 'Saída Financeira', 'Outras Saídas', 'Movimentações Financeiras', 'Devolução de Adiantamento de Clientes', 16031, { ativo: false, compoe_dre: false, escopo_negocio: 'administrativo' }),
  c('t1', '3-Transferências', 'Transferências', 'Transferências', 'Entre Contas', 'Transferência entre contas', 20010, { compoe_dre: false, escopo_negocio: 'administrativo' }),
];
export const DIVIDENDOS = [
  { id: 'v1', cliente_id: 'cli', nome: 'Despesas Pessoais', ativo: true, ordem_exibicao: 0 },
  { id: 'v2', cliente_id: 'cli', nome: 'Dependentes do Produtor com Nome Sintético Bem Longo', ativo: true, ordem_exibicao: 1 },
];
