// PR-SAFE-0 — proteção de títulos financeiros originados da Operação Comercial.
// Lógica PURA (sem I/O), reutilizada pelo writer (useFinanceiroV2.editarLancamento) e
// testável isoladamente. A detecção é ESTRUTURAL (marcadores de proveniência persistidos
// + vínculo reverso), nunca por texto de UI.

export interface MarcadoresTituloOC {
  origem_lancamento?: string | null;
  origem_tipo?: string | null;
}

/** Verdadeiro quando o título tem origem estrutural na Operação Comercial:
 *  origem_lancamento='operacao_comercial', OU origem_tipo iniciando por 'oc:',
 *  OU existe parte da OC vinculada ao título (zoo_operacao_partes.financeiro_lancamento_id). */
export function isTituloOC(m: MarcadoresTituloOC, temVinculoParteOC = false): boolean {
  return m.origem_lancamento === 'operacao_comercial'
    || String(m.origem_tipo ?? '').startsWith('oc:')
    || temVinculoParteOC;
}

/** Campos ESTRUTURAIS que compõem a obrigação da OC e não podem ser editados pelo
 *  fluxo financeiro comum. Inclui a competência (nasce do fato operacional da OC e
 *  governa ano_mes). Não inclui data_pagamento/status/conta/descrição (permitidos). */
export interface EstruturaTituloOC {
  valor?: number | null;
  favorecido_id?: string | null;
  tipo_operacao?: string | null;
  macro_custo?: string | null;
  grupo_custo?: string | null;
  centro_custo?: string | null;
  subcentro?: string | null;
  data_competencia?: string | null;
}

const norm = (v: unknown): string | null =>
  (v === null || v === undefined || v === '' ? null : String(v));

/** Lista (deduplicada) de campos estruturais que o `form` tenta alterar em relação ao
 *  estado persistido (`atual`). Vazia quando nenhum campo estrutural muda. Tolerância de
 *  R$ 0,005 no valor para evitar ruído de ponto flutuante. */
export function detectarViolacoesEstruturaisOC(
  form: EstruturaTituloOC, atual: EstruturaTituloOC,
): string[] {
  const viol = new Set<string>();
  if (Math.abs((Number(form.valor) || 0) - (Number(atual.valor) || 0)) > 0.005) viol.add('valor');
  if (norm(form.favorecido_id) !== norm(atual.favorecido_id)) viol.add('favorecido');
  if (norm(form.tipo_operacao) !== norm(atual.tipo_operacao)) viol.add('tipo de operação');
  if (norm(form.subcentro) !== norm(atual.subcentro)
    || norm(form.macro_custo) !== norm(atual.macro_custo)
    || norm(form.grupo_custo) !== norm(atual.grupo_custo)
    || norm(form.centro_custo) !== norm(atual.centro_custo)) viol.add('classificação');
  if (norm(form.data_competencia) !== norm(atual.data_competencia)) viol.add('competência');
  return Array.from(viol);
}
