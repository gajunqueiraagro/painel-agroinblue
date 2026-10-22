/* FORN-BUSCA-UNICA-01 — lancamentos SINTETICOS da bancada para a lista do Financeiro V2 (filtros + tabela). Fornecedores = LISTA
   (dados/fornecedores.ts): nomes longos de proposito. Nenhum dado real. */
import { LISTA } from './fornecedores';

const ids = LISTA.filter((f: any) => !f.fundido_em_id).map((f: any) => f.id).slice(0, 14);
const DESCR = ['Sal mineral proteinado para recria e engorda — lote de outubro', 'Frete de gado', 'Vacina aftosa',
  'Manutenção de cerca da invernada do fundo, com troca de lascas e arame', 'Combustível', 'Honorários contábeis'];
const CLASS = [['Custeio Produtivo', 'Nutrição', 'Suplementação', 'Nutrição Engorda'], ['Custeio Produtivo', 'Logística', 'Fretes', 'Frete de Gado'],
  ['Despesas Administrativas', 'Serviços', 'Contabilidade', 'Honorários Contábeis Administrativos']];
const STATUS = ['previsto', 'programado', 'agendado', 'realizado'];
export const LANCAMENTOS = ids.map((fid: string, i: number) => {
  const [macro, grupo, centro, sub] = CLASS[i % CLASS.length];
  const dia = String(1 + (i * 2) % 28).padStart(2, '0');
  const status = STATUS[i % STATUS.length];
  return {
    id: `lf${i}`, cliente_id: 'cli', fazenda_id: 'f1', ano_mes: '2026-10', cancelado: false, cenario: 'realizado', origem_lancamento: 'manual',
    tipo_operacao: i % 5 === 4 ? '1-Entradas' : '2-Saídas', sinal: i % 5 === 4 ? 1 : -1, valor: [1345.5, 99999999.99, 12.3, 452310.07][i % 4],
    status_transacao: status, data_competencia: `2026-10-${dia}`, data_vencimento: `2026-10-${dia}`, data_pagamento: status === 'realizado' ? `2026-10-${dia}` : null,
    descricao: DESCR[i % DESCR.length], favorecido_id: fid, macro_custo: macro, grupo_custo: grupo, centro_custo: centro, subcentro: sub,
    escopo_negocio: 'pecuaria', numero_documento: i % 3 === 0 ? '000.000.518' : null, tipo_documento: i % 3 === 0 ? 'Nota Fiscal' : null,
    conta_bancaria_id: 'bb', conta_destino_id: null, sem_movimentacao_caixa: false, compoe_dre: true, created_at: '2026-10-01T12:00:00Z',
    /* FIN-V2-DESEMPENHO-01b — a Safra com o selo (PEC | LAV) e a 2ª linha (fase/cultura), e o "sem safra" */
    safra_id: ['s-pec', 's-lav', null][i % 3], fase: i % 3 === 0 ? 'recria' : null, cultura: i % 3 === 1 ? 'mandioca' : null,
  };
});
