/* P109 — o banco da bancada para as 4 telas da meta (Fluxo de Caixa META, PC-100, Visão Geral Planejamento, Fechamento do Período),
 * com o caso real do NJ 2026 (`meta-nj-2026.json`: só os números; fazendas, sócios e descrições SINTÉTICOS). `escala` multiplica todo
 * valor (o pior caso: `&v=grande`, ×400 — a maior célula passa de R$ 900 mi, o total de R$ 13 bi). A tela soma; a bancada só responde. */
import NJ from './meta-nj-2026.json';

const r2 = (v: number) => Math.round(v * 100) / 100;

export const FAZENDAS = NJ.fazendas.map(([id, nome, pec]) => ({ id: String(id), nome: String(nome), cliente_id: 'cli', tem_pecuaria: pec === true }));

export const PLANO = NJ.plano.map(([id, macro_custo, grupo_custo, centro_custo, subcentro, escopo_negocio, ordem_exibicao]) =>
  ({ id, macro_custo, grupo_custo, centro_custo, subcentro, escopo_negocio, ordem_exibicao, ativo: true }));

export const DIVIDENDOS = NJ.dividendos.map((nome, i) => ({ id: `dv${i + 1}`, nome }));

export function planejamento(escala: number, fazendaId: unknown) {
  return NJ.planejamento.filter(([faz]) => fazendaId == null || faz === fazendaId)
    .map(([fazenda_id, plano_conta_id, macro_custo, grupo_custo, centro_custo, subcentro, escopo_negocio, mes, valor], i) => ({
      id: `pf${i}`, cliente_id: 'cli', fazenda_id, ano: 2026, mes, macro_custo, grupo_custo, centro_custo, subcentro, escopo_negocio,
      tipo_custo: 'fixo', driver: null, unidade_driver: null, valor_base: r2(Number(valor) * escala), quantidade_driver: 0,
      valor_planejado: r2(Number(valor) * escala), origem: 'manual', cenario: 'meta', observacao: null, plano_conta_id,
      created_at: '2026-01-05T10:00:00Z', updated_at: '2026-01-05T10:00:00Z' }));
}

/** O REALIZADO de 2025 (a coluna "Real 2025" das telas): SINTÉTICO, 92% da meta 2026 de cada conta (digitado + auto do caixa), pago no dia
 *  15 do mesmo mês — a tela compara com um ano de verdade, não com zero. Uma linha por fazenda, conta e mês (a view por parte). */
export function realizado2025(escala: number) {
  const conta = new Map(PLANO.map((p) => [p.id, p]));
  const soma = new Map<string, number>();
  const somar = (faz: unknown, pc: unknown, mes: unknown, v: unknown) => {
    const k = `${faz}|${pc}|${mes}`; soma.set(k, (soma.get(k) ?? 0) + Number(v));
  };
  for (const [faz, pc, , , , , , mes, v] of NJ.planejamento) somar(faz, pc, mes, v);
  for (const [reg, faz, pc, mes, , , v] of NJ.metaLinhas) if (reg === 'caixa') somar(faz, pc, mes, v);
  const out: Record<string, unknown>[] = [];
  for (const [k, v] of soma) {
    const [faz, pc, mes] = k.split('|');
    const p = conta.get(pc);
    if (!p || v === 0) continue;
    const entrada = p.macro_custo === 'Receita Operacional' || p.macro_custo === 'Entrada Financeira';
    const dia = `2025-${mes.padStart(2, '0')}-15`;
    out.push({ id: `r25-${out.length}`, cliente_id: 'cli', fazenda_id: faz, ano_mes: dia.slice(0, 7), cancelado: false, cenario: 'realizado',
      origem_lancamento: 'manual', tipo_operacao: entrada ? '1-Entradas' : '2-Saídas', sinal: entrada ? 1 : -1,
      valor: r2(Math.abs(v) * 0.92 * escala), status_transacao: 'realizado', data_competencia: dia, data_vencimento: dia, data_pagamento: dia,
      descricao: `Realizado sintético ${p.subcentro}`, favorecido_id: null, plano_conta_id: p.id, macro_custo: p.macro_custo, grupo_custo: p.grupo_custo,
      centro_custo: p.centro_custo, subcentro: p.subcentro, escopo_negocio: p.escopo_negocio, sem_movimentacao_caixa: false, compoe_dre: true,
      conta_bancaria_id: 'bb', parte_ordem: 1, created_at: '2025-01-01T12:00:00Z' });
  }
  return out;
}

/** A `fn_meta_linhas(cliente, 2026, regime)`: o caixa traz financiamento e projetos; a competência não (a divisão do PC-100). */
export function metaLinhas(escala: number, regime: unknown) {
  return NJ.metaLinhas.filter(([reg]) => reg === regime)
    .map(([, fazenda_id, plano_conta_id, mes, origem, origem_detalhe, valor]) => ({
      fazenda_id, plano_conta_id, mes, valor: r2(Number(valor) * escala), origem, origem_detalhe, origem_id: null }));
}
