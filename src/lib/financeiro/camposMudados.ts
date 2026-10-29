/**
 * EDITAR-SO-MUDADOS-01 (Gabriel 29/10 09:1x) — o Salvar do Editar lançamento manda SÓ os campos que a pessoa mudou: campo não tocado nunca é
 * sobrescrito. Nasce de dois casos: o Editar aberto pelo Caixa (`FinanceiroCaixaTab`) monta o lançamento à mão SEM vencimento, conta destino,
 * dados de pagamento, tipo de documento, safra e cultura, e o Salvar os gravava vazios; e a linha da lista que ficou velha regravava o valor velho.
 * ⚠ "MUDOU" É CONTRA O QUE O FORMULÁRIO ABRIU (o lançamento que o modal recebeu), nunca contra o banco: o que a pessoa não tocou não vai.
 * ⚠ VAZIO, NULO E AUSENTE SÃO O MESMO VALOR aqui (o campo que o chamador não trouxe abre vazio; salvar sem tocar não o "apaga").
 * ⚠ ONDE O MODAL TRANSFORMA O VALOR AO GRAVAR (o status "meta", a conta da entrada), a diferença conta como mudança e o campo vai, como sempre
 *   foi: o pior caso é o de hoje, nunca um apagar novo. PURO.
 */
/** Os campos do formulário que o Editar compara. */
export type CampoDoEditar = 'fazenda_id' | 'conta_bancaria_id' | 'conta_destino_id' | 'data_competencia' | 'data_vencimento' | 'data_pagamento'
  | 'valor' | 'tipo_operacao' | 'status_transacao' | 'descricao' | 'macro_custo' | 'grupo_custo' | 'centro_custo' | 'subcentro' | 'escopo_negocio'
  | 'plano_conta_id' | 'observacao' | 'numero_documento' | 'tipo_documento' | 'favorecido_id' | 'forma_pagamento' | 'dados_pagamento'
  | 'safra_id' | 'cultura' | 'fase';
const CAMPOS: readonly CampoDoEditar[] = ['fazenda_id', 'conta_bancaria_id', 'conta_destino_id', 'data_competencia', 'data_vencimento', 'data_pagamento',
  'valor', 'tipo_operacao', 'status_transacao', 'descricao', 'macro_custo', 'grupo_custo', 'centro_custo', 'subcentro', 'escopo_negocio',
  'plano_conta_id', 'observacao', 'numero_documento', 'tipo_documento', 'favorecido_id', 'forma_pagamento', 'dados_pagamento',
  'safra_id', 'cultura', 'fase'];

/** Vazio, nulo e ausente = `null`; número = centavos (o valor é sempre positivo no form); objeto = o JSON dele. */
function normal(campo: CampoDoEditar, v: unknown): string | number | null {
  if (v === undefined || v === null || v === '') return null;
  if (campo === 'valor') { const n = Math.abs(Number(v)); return Number.isFinite(n) ? Math.round(n * 100) : null; }
  if (typeof v === 'object') return JSON.stringify(v);
  return String(v);
}

/** Os campos que MUDARAM entre o lançamento que o formulário abriu e o formulário do Salvar. */
export function camposMudados(abriuCom: object, form: object): CampoDoEditar[] {
  const antes = new Map<string, unknown>(Object.entries(abriuCom));
  const depois = new Map<string, unknown>(Object.entries(form));
  return CAMPOS.filter((c) => normal(c, antes.get(c)) !== normal(c, depois.get(c)));
}

/** De que campos do formulário sai cada coluna do UPDATE; coluna fora daqui (as marcas de quem grava, o valor do mês) vai sempre. */
const CLASSIFICACAO: readonly CampoDoEditar[] = ['subcentro', 'macro_custo', 'grupo_custo', 'centro_custo', 'escopo_negocio', 'plano_conta_id'];
const ORIGEM: Readonly<Record<string, readonly CampoDoEditar[]>> = {
  fazenda_id: ['fazenda_id'], conta_bancaria_id: ['conta_bancaria_id'], conta_destino_id: ['conta_destino_id'], data_competencia: ['data_competencia'],
  data_vencimento: ['data_vencimento'], data_pagamento: ['data_pagamento'], valor: ['valor'], sinal: ['tipo_operacao'], tipo_operacao: ['tipo_operacao'],
  status_transacao: ['status_transacao'], descricao: ['descricao'],
  macro_custo: CLASSIFICACAO, grupo_custo: CLASSIFICACAO, centro_custo: CLASSIFICACAO, subcentro: CLASSIFICACAO, escopo_negocio: CLASSIFICACAO,
  plano_conta_id: CLASSIFICACAO,
  observacao: ['observacao'], numero_documento: ['numero_documento'], tipo_documento: ['tipo_documento'], favorecido_id: ['favorecido_id'],
  forma_pagamento: ['forma_pagamento'], dados_pagamento: ['dados_pagamento'], ano_mes: ['data_pagamento', 'data_competencia'],
  safra_id: ['safra_id'], cultura: ['cultura'], fase: ['fase'],
};

/** O UPDATE só com as colunas que vêm de campo mudado (e as que não vêm de campo nenhum). Sem a lista (outro gravador), o UPDATE inteiro. */
export function soOQueMudou<T extends Record<string, unknown>>(payload: T, mudados: readonly string[] | undefined): Partial<T> {
  if (!mudados) return payload;
  const m = new Set(mudados);
  const fica: Partial<T> = {};
  for (const [coluna, valor] of Object.entries(payload)) {
    const de = ORIGEM[coluna];
    if (!de || de.some((c) => m.has(c))) Object.assign(fica, { [coluna]: valor });
  }
  return fica;
}
