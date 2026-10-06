/**
 * "SEM CLASSIFICAÇÃO" — CONC-SEM-CLASSIFICACAO-01 (Gabriel, 06/10/2026).
 *
 * ⚠ A REGRA É DO BANCO: lançamento ativo com `plano_conta_id` nulo (`_fn_lancamento_sem_plano`). Este arquivo só LÊ o que
 *   `fn_conciliacao_sem_classificacao_lista` e `fn_dre_sem_classificacao` devolvem, e monta o FORM do gesto de classificar —
 *   que é gravado pelo MESMO escritor do modal do lançamento (`editarLancamento`, `useFinanceiroV2`). Nenhuma contagem,
 *   nenhuma soma e nenhuma regra de "o que é sem classificação" aqui.
 * ⚠ AUSENTE É `null`, NUNCA ZERO: retorno torto devolve `null` inteiro, e a tela escreve que não conseguiu ler.
 */
import type { ClassificacaoItem, LancamentoV2, LancamentoV2Form } from '@/hooks/useFinanceiroV2';

export interface SugestaoDeClassificacao {
  planoContaId: string;
  subcentro: string;
  centroCusto: string | null;
  /** De onde o resolvedor do banco tirou a sugestão (`tier`): regra, alias, alias_composto, plano_exato… */
  origem: string;
}

export interface LinhaSemClassificacao {
  id: string;
  data: string;
  contaId: string | null;
  contaNome: string | null;
  historicoBanco: string | null;
  descricao: string | null;
  tipoOperacao: string;
  /** Em módulo; o sinal é o do tipo (entrada / saída). */
  valor: number;
  favorecidoId: string | null;
  favorecidoNome: string | null;
  subcentroTexto: string | null;
  falta: { subcentro: boolean; fornecedor: boolean; centro: boolean };
  /** Há texto de subcentro gravado e nenhuma conta do plano para ele (os Dividendos por texto). */
  aguardaConta: boolean;
  sugestao: SugestaoDeClassificacao | null;
}

export interface ResumoSemClassificacao {
  qtde: number;
  valorEntradas: number;
  valorSaidas: number;
  comSugestao: number;
  semSugestao: number;
  aguardaConta: number;
}

export interface ListaSemClassificacao { resumo: ResumoSemClassificacao; linhas: LinhaSemClassificacao[] }

const ehObjeto = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const texto = (v: unknown): string | null => (typeof v === 'string' && v !== '' ? v : null);
const numero = (v: unknown): number | null => {
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  if (typeof v === 'string' && v.trim() !== '') { const n = Number(v); return Number.isFinite(n) ? n : null; }
  return null;
};

function lerSugestao(v: unknown): SugestaoDeClassificacao | null {
  if (!ehObjeto(v)) return null;
  const planoContaId = texto(v.plano_conta_id); const subcentro = texto(v.subcentro);
  if (!planoContaId || !subcentro) return null;
  return { planoContaId, subcentro, centroCusto: texto(v.centro_custo), origem: texto(v.origem) ?? '' };
}

function lerLinha(v: unknown): LinhaSemClassificacao | null {
  if (!ehObjeto(v)) return null;
  const id = texto(v.id); const data = texto(v.data); const tipoOperacao = texto(v.tipo_operacao); const valor = numero(v.valor);
  if (!id || !data || !tipoOperacao || valor == null) return null;
  const f = ehObjeto(v.falta) ? v.falta : {};
  return {
    id, data, tipoOperacao, valor,
    contaId: texto(v.conta_id), contaNome: texto(v.conta_nome),
    historicoBanco: texto(v.historico_banco), descricao: texto(v.descricao),
    favorecidoId: texto(v.favorecido_id), favorecidoNome: texto(v.favorecido_nome),
    subcentroTexto: texto(v.subcentro_texto),
    falta: { subcentro: f.subcentro !== false, fornecedor: f.fornecedor === true, centro: f.centro === true },
    aguardaConta: v.aguarda_conta === true,
    sugestao: lerSugestao(v.sugestao),
  };
}

/** Lê o retorno de `fn_conciliacao_sem_classificacao_lista`. Qualquer peça torta = `null` (a tela diz que não leu). */
export function lerListaSemClassificacao(dado: unknown): ListaSemClassificacao | null {
  if (!ehObjeto(dado) || !ehObjeto(dado.resumo) || !Array.isArray(dado.linhas)) return null;
  const r = dado.resumo;
  const qtde = numero(r.qtde); const valorEntradas = numero(r.valor_entradas); const valorSaidas = numero(r.valor_saidas);
  const comSugestao = numero(r.com_sugestao); const semSugestao = numero(r.sem_sugestao); const aguardaConta = numero(r.aguarda_conta);
  if (qtde == null || valorEntradas == null || valorSaidas == null || comSugestao == null || semSugestao == null || aguardaConta == null) return null;
  const linhas: LinhaSemClassificacao[] = [];
  for (const x of dado.linhas) { const l = lerLinha(x); if (!l) return null; linhas.push(l); }
  return { resumo: { qtde, valorEntradas, valorSaidas, comSugestao, semSugestao, aguardaConta }, linhas };
}

/** O que o DRE deixa de ver por falta de plano — `fn_dre_sem_classificacao`. */
export interface DreSemClassificacao { qtde: number; valorEntradas: number; valorSaidas: number }

export function lerDreSemClassificacao(dado: unknown): DreSemClassificacao | null {
  if (!ehObjeto(dado)) return null;
  const qtde = numero(dado.qtde); const valorEntradas = numero(dado.valor_entradas); const valorSaidas = numero(dado.valor_saidas);
  if (qtde == null || valorEntradas == null || valorSaidas == null) return null;
  return { qtde, valorEntradas, valorSaidas };
}

/* ── o que a tela escreve ─────────────────────────────────────────────────────── */

export const ehEntrada = (tipoOperacao: string) => tipoOperacao.startsWith('1');

/** O texto que identifica a linha: o histórico do banco; sem vínculo com extrato, a descrição do lançamento. */
export const historicoDaLinha = (l: Pick<LinhaSemClassificacao, 'historicoBanco' | 'descricao'>) => l.historicoBanco ?? l.descricao ?? '—';

const ORIGEM: Record<string, string> = {
  regra: 'regra de classificação',
  alias: 'apelido do subcentro',
  alias_composto: 'apelido do subcentro com a safra',
  plano_exato: 'mesmo nome de uma conta do plano',
  plano_unaccent: 'mesmo nome de uma conta do plano (sem acento)',
  plano_folha: 'último trecho do texto = uma conta do plano',
};
/** De onde veio a sugestão, por extenso (o `title` do seletor). Origem desconhecida é escrita como veio. */
export const origemDaSugestao = (origem: string) => `sugestão: ${ORIGEM[origem] ?? (origem || 'origem não informada')}`;

export const MOTIVO_AGUARDA_CONTA = 'aguarda conta no plano (CONC-DIVIDENDOS-PLANO-01)';
export const FRASE_NADA_GRAVADO = 'nada é gravado sem você aceitar';

/**
 * SUBCENTRO SÓ OFERECE CONTA DO PLANO: as entradas que o hook do Financeiro sintetiza (os Dividendos de
 * `financeiro_dividendos`, com id `dividendo-<uuid>`, e as combinações de lançamentos legados, sem id) NÃO são linha do
 * plano — escolhê-las deixaria o lançamento sem `plano_conta_id`, que é exatamente o que esta tela existe para acabar.
 */
export function contasDoPlano(classificacoes: readonly ClassificacaoItem[]): ClassificacaoItem[] {
  return classificacoes.filter((c) => typeof c.id === 'string' && c.id !== '' && !c.id.startsWith('dividendo-'));
}

/* ── filtro e ordenação (só a ORDEM e o recorte do que o banco devolveu) ──────── */

export type FiltroSemClassificacao = 'todos' | 'com_sugestao' | 'sem_sugestao';
export type ColunaSemClassificacao = 'data' | 'historico' | 'valor' | 'falta' | 'fornecedor' | 'subcentro';
export interface OrdemSemClassificacao { coluna: ColunaSemClassificacao; sentido: 'asc' | 'desc' }
/** O padrão: valor, do maior para o menor. */
export const ORDEM_PADRAO: OrdemSemClassificacao = { coluna: 'valor', sentido: 'desc' };

export function filtrarLinhas(linhas: readonly LinhaSemClassificacao[], filtro: FiltroSemClassificacao): LinhaSemClassificacao[] {
  if (filtro === 'com_sugestao') return linhas.filter((l) => l.sugestao !== null);
  if (filtro === 'sem_sugestao') return linhas.filter((l) => l.sugestao === null);
  return [...linhas];
}

const quantoFalta = (l: LinhaSemClassificacao) => Number(l.falta.subcentro) + Number(l.falta.fornecedor) + Number(l.falta.centro);
const chaveDe = (l: LinhaSemClassificacao, coluna: ColunaSemClassificacao): string | number => {
  switch (coluna) {
    case 'data': return l.data;
    case 'historico': return historicoDaLinha(l).toLocaleLowerCase('pt-BR');
    case 'valor': return l.valor;
    case 'falta': return quantoFalta(l);
    case 'fornecedor': return (l.favorecidoNome ?? '').toLocaleLowerCase('pt-BR');
    case 'subcentro': return (l.sugestao?.subcentro ?? l.subcentroTexto ?? '').toLocaleLowerCase('pt-BR');
  }
};

/** Ordena uma CÓPIA; empate fica na ordem em que o banco devolveu (estável). */
export function ordenarLinhas(linhas: readonly LinhaSemClassificacao[], ordem: OrdemSemClassificacao): LinhaSemClassificacao[] {
  const fator = ordem.sentido === 'asc' ? 1 : -1;
  return linhas.map((l, i) => ({ l, i })).sort((a, b) => {
    const x = chaveDe(a.l, ordem.coluna); const y = chaveDe(b.l, ordem.coluna);
    const c = typeof x === 'number' && typeof y === 'number' ? x - y : String(x).localeCompare(String(y), 'pt-BR');
    return c !== 0 ? c * fator : a.i - b.i;
  }).map((x) => x.l);
}

/** Clicar na coluna já ordenada inverte; coluna nova começa do MAIOR para o menor (texto: de A a Z). */
export function proximaOrdem(atual: OrdemSemClassificacao, coluna: ColunaSemClassificacao): OrdemSemClassificacao {
  if (atual.coluna === coluna) return { coluna, sentido: atual.sentido === 'asc' ? 'desc' : 'asc' };
  const textual = coluna === 'historico' || coluna === 'fornecedor' || coluna === 'subcentro';
  return { coluna, sentido: textual ? 'asc' : 'desc' };
}

/* ── o gesto: o FORM que vai ao escritor do modal do lançamento ───────────────── */

/**
 * O LANÇAMENTO COMO ESTÁ, NO FORMATO DO ESCRITOR. `editarLancamento` regrava todas as colunas do form: por isso o form
 * nasce da linha INTEIRA do banco (`buscarLancamentoPorId`) e só o que o gesto muda é trocado depois.
 * ⚠ `cultura` e `fase` FICAM DE FORA de propósito (`undefined` = o UPDATE omite a coluna e ela fica como está).
 * ⚠ É também o form do DESFAZER: regravar este form devolve classificação, fornecedor, fazenda e safra ao que eram (a
 *   fazenda e a safra podem ter sido movidas pelo gatilho quando a conta escolhida era administrativa).
 */
export function formDoLancamento(l: LancamentoV2): LancamentoV2Form {
  return {
    fazenda_id: l.fazenda_id,
    conta_bancaria_id: l.conta_bancaria_id,
    conta_destino_id: l.conta_destino_id,
    data_competencia: l.data_competencia,
    data_pagamento: l.data_pagamento,
    data_vencimento: l.data_vencimento,
    valor: l.valor,
    tipo_operacao: l.tipo_operacao,
    status_transacao: l.status_transacao ?? undefined,
    descricao: l.descricao ?? undefined,
    macro_custo: l.macro_custo ?? undefined,
    grupo_custo: l.grupo_custo ?? undefined,
    centro_custo: l.centro_custo ?? undefined,
    subcentro: l.subcentro ?? undefined,
    escopo_negocio: l.escopo_negocio ?? undefined,
    plano_conta_id: null,
    observacao: l.observacao ?? undefined,
    numero_documento: l.numero_documento,
    tipo_documento: l.tipo_documento ?? null,
    favorecido_id: l.favorecido_id,
    forma_pagamento: l.forma_pagamento,
    dados_pagamento: l.dados_pagamento,
    safra_id: l.safra_id ?? null,
  };
}

export interface EscolhaDaLinha { conta: ClassificacaoItem | null; favorecidoId: string | null }

/** Por que a linha ainda não pode ser gravada (escrito ao lado do botão), ou nulo. */
export function motivoNaoGrava(escolha: EscolhaDaLinha, tipoOperacao: string): string | null {
  if (!escolha.conta) return 'escolha o subcentro';
  if (!escolha.conta.id) return 'esta conta não é do plano';
  if (escolha.conta.tipo_operacao !== tipoOperacao) return 'conta de outro tipo (entrada × saída)';
  return null;
}

/**
 * O form de CLASSIFICAR: o lançamento como está + a conta do plano (a CHAVE e as cópias em texto dela — o gatilho
 * `resolve_classificacao_from_plano` rederiva as cópias da chave) + o fornecedor escolhido (se houver; nunca apaga o que
 * o lançamento já tem).
 */
export function formParaClassificar(l: LancamentoV2, escolha: EscolhaDaLinha): LancamentoV2Form | null {
  const c = escolha.conta;
  if (!c || !c.id) return null;
  return {
    ...formDoLancamento(l),
    plano_conta_id: c.id,
    subcentro: c.subcentro,
    centro_custo: c.centro_custo,
    grupo_custo: c.grupo_custo,
    macro_custo: c.macro_custo,
    escopo_negocio: c.escopo_negocio,
    favorecido_id: escolha.favorecidoId ?? l.favorecido_id,
  };
}
