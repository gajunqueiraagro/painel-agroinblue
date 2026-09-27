export interface ErroValidacaoLancamento {
  campo: string;
  mensagem: string;
}

const MACROS_ENTRADA = new Set(['Receita Operacional', 'Entrada Financeira']);
const MACROS_SAIDA   = new Set([
  'Custeio Produção', 'Saída Financeira', 'Dividendos',
  'Investimento na Fazenda', 'Deduções de Receitas',
  'Investimento em Bovinos',
]);

const DIRECOES = new Set(['1-Entradas', '2-Saídas']);

/**
 * O TIPO DA CONTA NO PLANO — BOITEL-ABATE-PRODUTOR-01d. E' a fonte soberana da direcao.
 *
 * ⚠ SO' LINHA DO PLANO (com `id`): as combinacoes legadas que o hook acrescenta a partir dos
 *   lancamentos carregam o tipo do LANCAMENTO, nao da conta, e dariam a resposta que se quer testar.
 *   A chave (`plano_conta_id`) ganha do texto, como no gatilho `resolve_classificacao_from_plano`.
 * ⚠ SO' ENTRADA OU SAIDA: transferencia e demais tipos devolvem `null`, e a regra cai na macro.
 */
export function tipoDaContaNoPlano(
  classificacoes: ReadonlyArray<{ id?: string; subcentro: string; tipo_operacao: string }>,
  planoContaId: string | null | undefined,
  subcentro: string | null | undefined,
): string | null {
  const sub = (subcentro ?? '').trim().toLowerCase();
  const linha = (planoContaId ? classificacoes.find(c => c.id === planoContaId) : undefined)
    ?? classificacoes.find(c => !!c.id && c.subcentro.trim().toLowerCase() === sub && sub !== '');
  const tipo = linha?.tipo_operacao ?? null;
  return tipo && DIRECOES.has(tipo) ? tipo : null;
}

/**
 * A DIRECAO DO LANCAMENTO CONTRA A CONTA — REGRA 3, BOITEL-ABATE-PRODUTOR-01d.
 *
 * ⚠ O TIPO DO PLANO MANDA, E SO' ONDE A REGRA JA' VALIA. Ate' aqui ela comparava o tipo com o
 *   "sentido" da MACRO, e o 1155 "Acerto de Boitel (despesas)" e' a unica conta do plano cuja
 *   direcao nao e' a da macro (2-Saidas sob Receita Operacional, opcao C do B-01): toda saida nele
 *   era recusada. Agora o esperado e' o tipo da conta, com a macro de fallback (subcentro legado).
 * ⚠ MACRO FORA DOS DOIS CONJUNTOS CONTINUA SEM CHECAGEM (Tributos, Transferencias) — usar o tipo
 *   do plano em toda linha mudaria o comportamento delas, e o briefing pede as outras identicas.
 */
export function erroDeDirecao(form: {
  tipo_operacao?: string | null;
  macro_custo?: string | null;
  subcentro?: string | null;
  tipo_plano?: string | null;
}): string | null {
  const tipo  = form.tipo_operacao?.trim() ?? '';
  const macro = form.macro_custo?.trim() ?? '';
  if (!macro || !tipo) return null;
  const sentidoDaMacro = MACROS_ENTRADA.has(macro) ? '1-Entradas' : MACROS_SAIDA.has(macro) ? '2-Saídas' : null;
  if (!sentidoDaMacro) return null;
  const plano = form.tipo_plano && DIRECOES.has(form.tipo_plano) ? form.tipo_plano : null;
  const esperado = plano ?? sentidoDaMacro;
  if (tipo === esperado) return null;
  const sub = form.subcentro?.trim() ?? '';
  const lado = esperado === '1-Entradas' ? 'entrada' : 'saída';
  const atual = tipo === '1-Entradas' ? 'Entrada' : tipo === '2-Saídas' ? 'Saída' : tipo;
  return sub
    ? `"${sub}" é conta de ${lado}, e o lançamento está como ${atual}. Troque o Tipo ou o Subcentro.`
    : `A macro "${macro}" é de ${lado}, e o lançamento está como ${atual}.`;
}

export function validarLancamento(form: {
  tipo_operacao?: string | null;
  macro_custo?: string | null;
  subcentro?: string | null;
  status_transacao?: string | null;
  origem_lancamento?: string | null;
  origem?: string | null;
  /** O tipo da conta no plano (`tipoDaContaNoPlano`) — soberano na regra 3. */
  tipo_plano?: string | null;
}): ErroValidacaoLancamento[] {
  const erros: ErroValidacaoLancamento[] = [];
  const tipo   = form.tipo_operacao?.trim() ?? '';
  const macro  = form.macro_custo?.trim() ?? '';
  const sub    = form.subcentro?.trim() ?? '';
  const status = form.status_transacao?.trim().toLowerCase() ?? '';
  const origem = (form.origem_lancamento ?? form.origem ?? '').trim().toLowerCase();

  // REGRA 1 — Saída precisa de macro
  if (tipo === '2-Saídas' && !macro) {
    erros.push({
      campo: 'macro_custo',
      mensagem: 'Saída sem macro de custo',
    });
  }

  // REGRA 2 — Lançamento realizado precisa de subcentro
  if (status === 'realizado' && !sub) {
    erros.push({
      campo: 'subcentro',
      mensagem: 'Lançamento realizado sem subcentro',
    });
  }

  // REGRA 3 — Direção do lançamento x conta do plano (a macro é fallback) — BOITEL-ABATE-PRODUTOR-01d
  const direcao = erroDeDirecao({ tipo_operacao: tipo, macro_custo: macro, subcentro: sub, tipo_plano: form.tipo_plano });
  if (direcao) erros.push({ campo: 'subcentro', mensagem: direcao });

  // REGRA 4 — Bloquear Aporte Pessoal em importação incremental
  // Aplica apenas a NOVOS registros via importação automática.
  // Edições manuais (id presente no handleSave) passam normalmente.
  // ATENÇÃO: esta regra será chamada apenas quando id === undefined
  // (inserção nova), não em edições de registros existentes.
  const subLower = sub.toLowerCase();
  if (subLower === 'aporte pessoal' && origem === 'importacao_incremental') {
    erros.push({
      campo: 'subcentro',
      mensagem: 'Classificação genérica (Aporte Pessoal) não permitida',
    });
  }

  return erros;
}
