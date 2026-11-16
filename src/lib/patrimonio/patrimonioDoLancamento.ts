/**
 * LANC-PATRIMONIO-VINCULO-01 — o lançamento e o Patrimônio, no rodapé do Editar lançamento (mock v1 aprovado pelo Gabriel 15/11 07:48).
 *
 * As regras da tela, puras (o banco é a autoridade: `fn_patrimonio_bem_ligar` e `fn_patrimonio_bem_criar_e_ligar` recusam com a frase
 * pronta; aqui só se decide o que MOSTRAR):
 *   D1 "Patrimônio" aparece só em conta de Investimento na Fazenda, fora do centro RH — a MESMA régua da `fn_investimentos_sem_bem` e
 *      da `_fn_patrimonio_conta_investimento` (macro 'Investimento na Fazenda', centro <> 'RH').
 *   D2 previsto/agendado: o botão aparece; o Ligar fica parado com o motivo ("liga quando for pago"), exceto parcela de contrato.
 *   D3 "Financiamento" (vincular) só nas contas de financiamento; o "↔ …" de onde o lançamento já está fica SEMPRE.
 *   D4 parcela de compra parcelada: liga o contrato inteiro (a prévia do banco lista as que faltam; a tela as inclui).
 *   D5 sem bem = selo no botão, nunca bloqueio do Salvar.
 * ⚠ PREMISSA FISCAL (Gabriel 15/11 07:42): o cliente é CONTRIBUINTE de IBS/CBS em 2027 — o caso padrão. O selo diz o crédito.
 */
import { casaNaBusca } from '@/lib/texto/busca';
import type { AtividadeBem, BemDaLista, CategoriaBem } from './patrimonio';
import type { ItemDoVinculo, PreviaLigar } from './patrimonioApi';

export const MACRO_INVESTIMENTO = 'Investimento na Fazenda';
export const CENTRO_RH = 'RH';

/** D1 — a conta pede "Patrimônio" (a régua do banco). */
export const contaPedePatrimonio = (c: { macro_custo?: string | null; centro_custo?: string | null } | null | undefined): boolean =>
  !!c && c.macro_custo === MACRO_INVESTIMENTO && (c.centro_custo ?? '') !== CENTRO_RH;

/** D3 — as contas em que "Financiamento" (vincular) aparece: juros, amortização, consórcio a contemplar, entrada de financiamento e
 *  despesas financeiras (os subcentros do plano global; o sufixo da atividade varia). */
const SUBCENTROS_DE_FINANCIAMENTO = ['Juros de Financiamento', 'Amortização Financiamento', 'Consórcio a contemplar', 'Entrada de Financiamento', 'Despesas Financeiras'];
export const contaPedeFinanciamento = (subcentro: string | null | undefined): boolean =>
  !!subcentro && SUBCENTROS_DE_FINANCIAMENTO.some((s) => subcentro.startsWith(s));

/** Uma parte do lançamento (a `vw_fin_classificacao_por_parte`): sem divisão, uma só (ordem 1). */
export interface ParteDoLancamento {
  parte_ordem: number; partes_total: number; valor: number; plano_conta_id: string | null; macro_custo: string | null; centro_custo: string | null;
  subcentro: string | null; escopo_negocio: string | null; status_transacao: string | null; cancelado: boolean; fazenda_id: string | null;
  data_pagamento: string | null; data_competencia: string | null; descricao: string | null; de_contrato: boolean;
}
/** Um vínculo VIVO do lançamento com um bem. */
export interface VinculoDoLancamento { bem_id: string; codigo: string; descricao: string; parte_ordem: number }
export interface PatrimonioDoLancamentoLido { partes: ParteDoLancamento[]; vinculos: VinculoDoLancamento[] }

/** As partes que são investimento (D1) e não estão canceladas. */
export const partesDeInvestimento = (l: PatrimonioDoLancamentoLido): ParteDoLancamento[] =>
  l.partes.filter((p) => !p.cancelado && contaPedePatrimonio(p));

/** O que se liga: as partes de investimento SEM vínculo vivo (a outra parte de um lançamento dividido não entra). */
export const itensParaLigar = (l: PatrimonioDoLancamentoLido, lancamentoId: string): ItemDoVinculo[] =>
  partesDeInvestimento(l).filter((p) => !l.vinculos.some((v) => v.parte_ordem === p.parte_ordem))
    .map((p) => ({ lancamento_id: lancamentoId, parte_ordem: p.parte_ordem }));

export type EstadoDoBotao =
  | { tipo: 'nada' }
  | { tipo: 'ligado'; vinculos: VinculoDoLancamento[]; faltam: number }
  | { tipo: 'sem_bem'; partes: ParteDoLancamento[] };

/** O que o rodapé mostra: nada (conta que não pede, cancelado), o bem ligado (↔ código), ou "Patrimônio · sem bem". */
export function estadoDoBotao(l: PatrimonioDoLancamentoLido | null): EstadoDoBotao {
  if (!l) return { tipo: 'nada' };
  const inv = partesDeInvestimento(l);
  if (!inv.length) return { tipo: 'nada' };
  const soltas = inv.filter((p) => !l.vinculos.some((v) => v.parte_ordem === p.parte_ordem));
  if (l.vinculos.length) return { tipo: 'ligado', vinculos: l.vinculos, faltam: soltas.length };
  return { tipo: 'sem_bem', partes: soltas };
}

/** D5 + premissa fiscal: o `title` do selo "sem bem". Não contribuinte (exceção): sem a frase do crédito. */
export const tituloDoSemBem = (contribuinte = true): string => contribuinte
  ? 'investimento sem bem: o crédito de IBS/CBS deste bem fica sem lastro no Patrimônio'
  : 'investimento sem bem: ligue a um bem do Patrimônio';

/** D2 — por que o Ligar/Criar fica parado: previsto/agendado que não é parcela de contrato. */
export const FRASE_LIGA_QUANDO_PAGO = 'Liga quando for pago.';
export function motivoDoPrevisto(partes: readonly ParteDoLancamento[]): string | null {
  const pago = (s: string | null) => s === 'realizado' || s === 'conciliado';
  return partes.some((p) => !pago(p.status_transacao) && !p.de_contrato) ? FRASE_LIGA_QUANDO_PAGO : null;
}

/** A categoria sugerida pela conta (`contas_sugeridas` da categoria): nunca chutada — sem sugestão, nula. */
export function categoriaSugerida(categorias: readonly CategoriaComContas[], planoContaId: string | null): CategoriaComContas | null {
  if (!planoContaId) return null;
  return categorias.find((c) => c.ativo && c.contas_sugeridas.includes(planoContaId)) ?? null;
}
export type CategoriaComContas = CategoriaBem & { prefixo: string | null; contas_sugeridas: string[] };

/** A atividade do bem pela conta (o escopo do plano): pecuária, lavoura, ou compartilhado. */
export function atividadeDaConta(escopo: string | null | undefined, subcentro: string | null | undefined): AtividadeBem {
  const t = `${escopo ?? ''} ${subcentro ?? ''}`.toLowerCase();
  if (t.includes('pec')) return 'pecuaria';
  if (t.includes('agri') || t.includes('lavoura')) return 'lavoura';
  return 'compartilhado';
}

/** "Ligar a um bem": primeiro os da categoria sugerida e da mesma fazenda, depois os da categoria, depois os da fazenda; baixado fica fora. */
export function bensParaLigar(bens: readonly BemDaLista[], categoriaId: string | null, fazendaId: string | null, busca: string): BemDaLista[] {
  const peso = (b: BemDaLista) => (b.categoria_id === categoriaId ? 0 : 2) + (b.fazenda_id === fazendaId ? 0 : 1);
  return bens
    .filter((b) => b.situacao !== 'baixado')
    .filter((b) => !busca.trim() || [b.codigo, b.descricao, b.fazenda_codigo].some((t) => casaNaBusca(t, busca)))
    .map((b, i) => ({ b, i }))
    .sort((x, y) => peso(x.b) - peso(y.b) || x.i - y.i)
    .map((x) => x.b);
}

/** A prévia deixa gravar: nada recusado, o contrato inteiro, repetida só com a confirmação (o mesmo critério do Ligar do Patrimônio). */
export const faltamDoContrato = (p: PreviaLigar): number => p.contratos.reduce((t, c) => t + c.n_faltam, 0);
export const previaDeixaGravar = (p: PreviaLigar, confirmaRepetidas: boolean): boolean =>
  p.ok && p.n_recusas === 0 && faltamDoContrato(p) === 0 && (p.n_repetidas === 0 || confirmaRepetidas);

/** A frase da prévia, numa linha (o que o banco disse). */
export function fraseDaPrevia(p: PreviaLigar, alvo: { codigo: string; aquisicaoAntes: number } | null, n2: (v: number) => string): string {
  const recusa = p.itens.find((i) => i.situacao === 'recusa');
  if (recusa) return recusa.motivo ?? 'O banco recusou.';
  if (faltamDoContrato(p) > 0) {
    const c = p.contratos[0];
    return `Liga as ${c.n_parcelas} parcelas da compra (R$ ${n2(c.valor_total)}) — o bem entra pelo contrato inteiro.`;
  }
  if (p.n_repetidas > 0) return 'Parece repetido: confirme que não é para ligar.';
  if (alvo) return `${alvo.codigo} passa de ${n2(alvo.aquisicaoAntes)} para ${n2(alvo.aquisicaoAntes + p.soma)} de aquisição · nada muda no lançamento`;
  return `Soma na aquisição: ${n2(p.soma)} · nada muda no lançamento`;
}

/** As parcelas que faltam do contrato, somadas à escolha (D4). */
export function comOContrato(itens: readonly ItemDoVinculo[], p: PreviaLigar): ItemDoVinculo[] {
  const chave = (i: ItemDoVinculo) => `${i.lancamento_id}#${i.parte_ordem}`;
  const m = new Map(itens.map((i) => [chave(i), i]));
  for (const c of p.contratos) for (const f of c.faltam) m.set(chave(f), f);
  return [...m.values()];
}
