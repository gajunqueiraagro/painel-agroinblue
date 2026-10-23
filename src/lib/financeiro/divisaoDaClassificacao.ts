/**
 * A CLASSIFICACAO DIVIDIDA NA TELA — FIN-CLASSIF-DIVIDIDA-01b/01c (Gabriel 22/10/2026; mock aprovado 08h21). O lancamento continua UMA
 * linha (um pagamento, um vencimento, uma conciliacao); so' a classificacao ganha partes, e a soma das partes = o valor.
 *
 * ⚠ A REGRA E' DO BANCO (Code 2, 01a): dividir, pelos itens da nota, voltar para 1 conta, desfazer e dividir no cadastro do
 *   financiamento/compra parcelada sao RPCs que simulam por padrao, pedem motivo e recusam com a frase pronta. Aqui so' se chama e se
 *   le^ — a tela nunca calcula a divisao que vai gravar (o resumo "por conta" dos itens e' so' a previa do que o banco vai somar).
 * ⚠ REGRA DO ID: linha que vem da visao por parte chega com "id#2", "id#3"…; abrir/editar e' SEMPRE pelo lancamento (`idDoLancamento`).
 */
import { supabase } from '@/integrations/supabase/client';
import { notificarLancamentosMudaram } from '@/hooks/useFinanceiroV2';
import type { ItemFiscal } from '@/lib/financeiro/nfe/itensDaNota';

export interface ParteGravada {
  ordem: number;
  valor: number;
  percentual: number;
  plano_conta_id: string;
  subcentro: string | null;
  centro_custo: string | null;
  escopo_negocio: string | null;
  origem: 'manual' | 'nota' | 'pai';
  itens: number;
  /** os itens da nota (n_item) que formam a parte — origem 'nota' */
  notaItens: number[];
}
export interface DivisaoLida {
  partes: ParteGravada[];
  /** a ultima operacao que ainda se desfaz (dividir / pelos itens / voltar / pai), ou `null` */
  ultimaOperacaoId: string | null;
}

/** O lancamento de uma linha — "abc#2" (a parte 2 da visao por parte) abre "abc". */
export function idDoLancamento(linha: { id: string; lancamento_id?: string | null }): string {
  if (linha.lancamento_id) return linha.lancamento_id;
  const i = linha.id.indexOf('#');
  return i > 0 ? linha.id.slice(0, i) : linha.id;
}

const texto = (v: unknown) => (typeof v === 'string' && v ? v : null);
const numero = (v: unknown) => Number(v) || 0;
/** A frase do banco (a RPC recusa com a frase pronta, `RAISE ... MESSAGE`); erro sem frase vira a padrao. */
const fraseDoErro = (e: { message?: unknown } | null, padrao: string) => (e && typeof e.message === 'string' && e.message ? e.message : padrao);

export async function lerDivisao(lancamentoId: string): Promise<DivisaoLida | null> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- as tabelas novas ainda nao estao nos tipos gerados
  const db = supabase as any;
  const [p, d] = await Promise.all([
    db.from('financeiro_lancamento_partes').select('ordem, valor, percentual, plano_conta_id, subcentro, centro_custo, escopo_negocio, origem, nota_itens')
      .eq('lancamento_id', lancamentoId).order('ordem', { ascending: true }),
    db.from('financeiro_lancamento_divisoes').select('id, acao').eq('lancamento_id', lancamentoId).is('desfeita_em', null)
      .not('acao', 'in', '(reescalar,desfazer)').order('criado_em', { ascending: false }).limit(1),
  ]);
  if (p.error || !Array.isArray(p.data)) return null;
  const partes: ParteGravada[] = p.data.map((r: Record<string, unknown>) => ({
    ordem: numero(r.ordem), valor: numero(r.valor), percentual: numero(r.percentual), plano_conta_id: String(r.plano_conta_id ?? ''),
    subcentro: texto(r.subcentro), centro_custo: texto(r.centro_custo), escopo_negocio: texto(r.escopo_negocio),
    origem: r.origem === 'nota' || r.origem === 'pai' ? r.origem : 'manual', itens: Array.isArray(r.nota_itens) ? r.nota_itens.length : 0,
    notaItens: Array.isArray(r.nota_itens) ? r.nota_itens.map(numero) : [],
  }));
  const ultima = !d.error && Array.isArray(d.data) && d.data[0] ? texto(d.data[0].id) : null;
  return { partes, ultimaOperacaoId: ultima };
}

/** A parte como a RPC pede: por valor (soma = |valor|) ou por percentual (soma = 100). */
export type ParteNova = { plano_conta_id: string; valor: number } | { plano_conta_id: string; percentual: number };

export interface RespostaDaDivisao { frase: string | null; fraseNota: string | null; operacaoId: string | null; partes: { plano_conta_id: string; valor: number; percentual: number; subcentro: string | null }[] }
type Resultado<T> = { ok: true; valor: T } | { ok: false; frase: string };
export type ResultadoDaDivisao = Resultado<RespostaDaDivisao>;

function lerResposta(data: unknown): RespostaDaDivisao {
  const o: Record<string, unknown> = data && typeof data === 'object' ? Object.fromEntries(Object.entries(data)) : {};
  const partes = Array.isArray(o.partes) ? o.partes.filter((x): x is object => !!x && typeof x === 'object').map((x) => ({
    plano_conta_id: String(Reflect.get(x, 'plano_conta_id') ?? ''), valor: numero(Reflect.get(x, 'valor')), percentual: numero(Reflect.get(x, 'percentual')),
    subcentro: texto(Reflect.get(x, 'subcentro')),
  })) : [];
  return { frase: texto(o.frase), fraseNota: texto(o.frase_nota), operacaoId: texto(o.divisao_id), partes };
}

async function chamar(fn: string, args: Record<string, unknown>, clienteId: string, simular: boolean, padrao: string): Promise<Resultado<RespostaDaDivisao>> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- idioma documentado: o `.rpc` do repo
  const { data, error } = await (supabase as any).rpc(fn, args);
  if (error) return { ok: false, frase: fraseDoErro(error, padrao) };
  if (!simular) notificarLancamentosMudaram(clienteId);
  return { ok: true, valor: lerResposta(data) };
}

/** Dividir a mao (valor ou %). Parcela de financiamento/compra parcelada: divide no CADASTRO (todas as parcelas, a mesma proporcao). */
export function dividir(clienteId: string, alvo: { lancamentoId: string; financiamentoId: string | null }, partes: readonly ParteNova[], motivo: string,
  simular: boolean): Promise<Resultado<RespostaDaDivisao>> {
  if (alvo.financiamentoId) {
    return chamar('fn_financiamento_dividir_classificacao', { p_financiamento_id: alvo.financiamentoId, p_partes: partes, p_motivo: motivo, p_simular: simular },
      clienteId, simular, 'A divisão não foi feita.');
  }
  return chamar('fn_lancamento_dividir', { p_lancamento_id: alvo.lancamentoId, p_partes: partes, p_motivo: motivo, p_simular: simular },
    clienteId, simular, 'A divisão não foi feita.');
}

/** Pelos itens da nota: a conta de CADA item; o banco soma por conta (e, nota de valor diferente, divide pela proporcao). */
export function dividirPelosItens(clienteId: string, lancamentoId: string, mapa: ReadonlyMap<number, string>, motivo: string, simular: boolean) {
  const p_mapa = [...mapa].map(([n_item, plano_conta_id]) => ({ n_item, plano_conta_id }));
  return chamar('fn_lancamento_dividir_pelos_itens', { p_lancamento_id: lancamentoId, p_mapa, p_motivo: motivo, p_simular: simular },
    clienteId, simular, 'A divisão pelos itens não foi feita.');
}

/** Voltar para 1 conta (`null` = a maior parte). */
export function voltarUmaConta(clienteId: string, lancamentoId: string, planoContaId: string | null, motivo: string, simular: boolean) {
  return chamar('fn_lancamento_voltar_uma_conta', { p_lancamento_id: lancamentoId, p_plano_conta_id: planoContaId, p_motivo: motivo, p_simular: simular },
    clienteId, simular, 'A classificação não voltou para uma conta.');
}

/** Desfazer a ultima operacao (sempre grava; o banco recusa se houve outra depois). */
export function desfazerDivisao(clienteId: string, operacaoId: string, motivo: string) {
  return chamar('fn_lancamento_divisao_desfazer', { p_divisao_id: operacaoId, p_motivo: motivo }, clienteId, false, 'Não foi desfeito.');
}

/** A classificacao do lancamento como o banco a deixou (o modal a reabre depois de dividir: o Salvar seguinte manda o que esta' gravado). */
export async function classificacaoGravada(lancamentoId: string): Promise<Record<string, string | null> | null> {
  const { data, error } = await supabase.from('financeiro_lancamentos_v2')
    .select('plano_conta_id, subcentro, macro_custo, grupo_custo, centro_custo, escopo_negocio, safra_id, cultura, fase')
    .eq('id', lancamentoId).maybeSingle();
  if (error || !data || typeof data !== 'object' || Array.isArray(data)) return null;
  return Object.fromEntries(Object.entries(data).map(([k, v]) => [k, typeof v === 'string' ? v : null]));
}

/* ── PURO: a previa dos itens por conta ──────────────────────────────────────────────────────────────────────────────── */

export interface ContaDosItens { planoContaId: string; liquidoCent: number; itens: number; percentual: number }

/** Os itens somados por conta, na ordem do primeiro item de cada conta (a mesma ordem que o banco usa). Item sem conta fica de fora. */
export function porContaDosItens(itens: readonly Pick<ItemFiscal, 'nItem' | 'liquidoCent'>[], mapa: ReadonlyMap<number, string>): ContaDosItens[] {
  const total = itens.reduce((s, i) => s + i.liquidoCent, 0);
  const m = new Map<string, ContaDosItens>();
  for (const i of [...itens].sort((a, b) => a.nItem - b.nItem)) {
    const c = mapa.get(i.nItem);
    if (!c) continue;
    const x = m.get(c) ?? { planoContaId: c, liquidoCent: 0, itens: 0, percentual: 0 };
    x.liquidoCent += i.liquidoCent; x.itens += 1;
    m.set(c, x);
  }
  return [...m.values()].map((x) => ({ ...x, percentual: total > 0 ? (x.liquidoCent * 100) / total : 0 }));
}

/** A conta de cada item como a divisao gravada a deixou (as partes de origem 'nota'). */
export function contasDasPartes(partes: readonly ParteGravada[]): Map<number, string> {
  const m = new Map<number, string>();
  for (const p of partes) for (const n of p.notaItens) m.set(n, p.plano_conta_id);
  return m;
}

/** Por que o "Dividir" dos itens nao anda (a frase pronta), ou `null`. */
export function porQueNaoDivideOsItens(itens: readonly Pick<ItemFiscal, 'nItem'>[], mapa: ReadonlyMap<number, string>): string | null {
  const faltam = itens.filter((i) => !mapa.get(i.nItem)).length;
  if (faltam > 0) return `Faltam ${faltam} de ${itens.length} ${itens.length === 1 ? 'item' : 'itens'} sem conta. Escolha a conta de cada item.`;
  if (new Set(itens.map((i) => mapa.get(i.nItem))).size < 2) return 'Todos os itens estão na mesma conta: não há o que dividir.';
  return null;
}

/* ── PURO: a celula da lista (01c) ───────────────────────────────────────────────────────────────────────────────────── */

export interface ValorDividido { parte: number | null; total: number; casadas: number; partes: number }

/**
 * O que a linha da lista diz de um lancamento dividido (`fn_fin_v2_lista_pagina`: `valor` = o lancamento inteiro; `valor_parte`,
 * `partes_total`, `partes_casadas` = o que casa com o filtro). `null` = sem divisao. `parte` so' quando o filtro pega MENOS partes que
 * o total ("R$ 1.055,00 de R$ 9.583,00", selo "1 de 2 contas"); sem filtro de conta, o valor cheio e o selo "dividido".
 */
export function valorDividido(l: object): ValorDividido | null {
  const partes = numero(Reflect.get(l, 'partes_total'));
  if (!(partes > 1)) return null;
  const casadas = numero(Reflect.get(l, 'partes_casadas'));
  const total = Math.abs(numero(Reflect.get(l, 'valor')));
  const vp = Reflect.get(l, 'valor_parte');
  return { parte: casadas > 0 && casadas < partes && vp != null ? Math.abs(numero(vp)) : null, total, casadas, partes };
}

/** Os itens por conta em PERCENTUAL (a parcela divide no cadastro, so' por %): 6 casas, a ultima conta fecha os 100. */
export function percentuaisDosItens(porConta: readonly ContaDosItens[]): ParteNova[] {
  const total = porConta.reduce((s, c) => s + c.liquidoCent, 0);
  if (!(total > 0)) return [];
  let acum = 0;
  return porConta.map((c, k) => {
    const p = k < porConta.length - 1 ? Math.round((c.liquidoCent * 100 * 1e6) / total) / 1e6 : Math.round((100 - acum) * 1e6) / 1e6;
    acum += p;
    return { plano_conta_id: c.planoContaId, percentual: p };
  });
}

/* ── NOTA-CONTAS-NA-CRIACAO-01 A (P77) — a divisao pelos itens escolhida no NOVO lancamento ──────────────────────────────────────── */

/** O motivo da divisao feita junto com a criacao (a RPC pede motivo; o gesto e' o proprio "Dividir … ao salvar"). */
export const MOTIVO_DA_DIVISAO_NA_CRIACAO = 'dividido pelos itens da nota ao criar o lançamento';

/**
 * Por que a divisao pendente NAO pode ir junto com a criacao (a frase), ou `null`. Confere ANTES de gravar o que o banco recusaria depois:
 * item sem conta, uma conta so', conta fora do plano ou de outro tipo (o "mostrar todos" deixa escolher) — assim o banco so' recusa o que
 * a tela nao pode saber (mes fechado, acesso, rede).
 */
export function porQueNaoDivideNaCriacao(itens: readonly Pick<ItemFiscal, 'nItem'>[], mapa: ReadonlyMap<number, string>,
  classificacoes: readonly { id?: string; subcentro: string; tipo_operacao: string }[], tipoOperacao: string): string | null {
  const base = porQueNaoDivideOsItens(itens, mapa);
  if (base) return base;
  for (const id of new Set(mapa.values())) {
    const c = classificacoes.find((x) => x.id === id);
    if (!c) return 'Uma das contas escolhidas não está no plano de contas. Escolha de novo.';
    if (c.tipo_operacao !== tipoOperacao) return `A conta "${c.subcentro}" é de ${c.tipo_operacao} e o lançamento é de ${tipoOperacao}.`;
  }
  return null;
}

/**
 * As partes da divisao PENDENTE (so' para mostrar na aba Geral antes de salvar): o percentual dos itens aplicado ao valor do lancamento,
 * a ultima fecha o centavo — a mesma conta que o banco faz quando a nota e o lancamento diferem.
 */
export function partesPendentes(itens: readonly Pick<ItemFiscal, 'nItem' | 'liquidoCent'>[], mapa: ReadonlyMap<number, string>,
  classificacoes: readonly { id?: string; subcentro: string; centro_custo: string; escopo_negocio?: string | null }[], total: number): ParteGravada[] {
  const porConta = porContaDosItens(itens, mapa);
  const totalCent = Math.round(Math.abs(total) * 100);
  let acum = 0;
  return porConta.map((c, k) => {
    const cent = k < porConta.length - 1 ? Math.round((totalCent * c.percentual) / 100) : totalCent - acum;
    acum += cent;
    const cls = classificacoes.find((x) => x.id === c.planoContaId);
    return { ordem: k + 1, valor: cent / 100, percentual: c.percentual, plano_conta_id: c.planoContaId, subcentro: cls?.subcentro ?? null,
      centro_custo: cls?.centro_custo ?? null, escopo_negocio: cls?.escopo_negocio ?? null, origem: 'nota', itens: c.itens,
      notaItens: itens.filter((i) => mapa.get(i.nItem) === c.planoContaId).map((i) => i.nItem) };
  });
}

/** A conta que o lancamento leva quando dividido: a MAIOR parte (empate: a primeira) — a regra do banco (`_fn_fin_dividir`). */
export function contaDaMaiorParte(itens: readonly Pick<ItemFiscal, 'nItem' | 'liquidoCent'>[], mapa: ReadonlyMap<number, string>): string | null {
  const porConta = porContaDosItens(itens, mapa);
  return [...porConta].sort((a, b) => b.liquidoCent - a.liquidoCent)[0]?.planoContaId ?? null;
}

/**
 * O lancamento A VISTA acabou de nascer (e a nota dele ja' esta' anexada e com os itens guardados): divide pelos itens com a MESMA
 * `fn_lancamento_dividir_pelos_itens`. Recusou: o lancamento recem-criado e' CANCELADO (`fn_cancelar_lancamento_auditoria`, motivo
 * escrito) — nada fica valendo pela metade — e volta a frase. `null` = dividido.
 */
export async function dividirNaCriacao(clienteId: string, lancamentoId: string, mapa: ReadonlyMap<number, string>): Promise<string | null> {
  const r = await dividirPelosItens(clienteId, lancamentoId, mapa, MOTIVO_DA_DIVISAO_NA_CRIACAO, false);
  if (r.ok === false) return desfazerCriacao(clienteId, lancamentoId, r.frase);
  return null;
}

/** Cancela o lancamento recem-criado cuja divisao nao foi gravada, e devolve a frase do que aconteceu. */
export async function desfazerCriacao(clienteId: string, lancamentoId: string, porque: string): Promise<string> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- idioma documentado: o `.rpc` do repo
  const { error } = await (supabase as any).rpc('fn_cancelar_lancamento_auditoria', { p_lancamento_id: lancamentoId, p_motivo: `divisão pelos itens não gravada na criação: ${porque}` });
  notificarLancamentosMudaram(clienteId);
  return error
    ? `A divisão não foi gravada (${porque}) e o lançamento criado NÃO pôde ser cancelado: cancele-o na lista antes de lançar de novo.`
    : `Nada ficou valendo: a divisão não foi gravada (${porque}) e o lançamento recém-criado foi cancelado. Corrija e salve de novo.`;
}

