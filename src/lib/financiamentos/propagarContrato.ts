/**
 * PROPAGAR A EDIÇÃO DO CONTRATO ÀS PARCELAS — PARC-CONTRATO-01 item 2 (Gabriel, 05 e 07/10/2026).
 *
 * Quem decide o que muda, em quantas parcelas e de que valor para qual é o BANCO (`fn_parcelamento_propagar`, a mesma função
 * simula e grava). Este arquivo só (1) monta `p_campos` com o que a edição mexeu e (2) LÊ a prévia, sem cast: peça torta = nulo
 * inteiro. Nenhuma contagem é feita aqui.
 */
import type { ValorDasParcelas } from '@/lib/financiamentos/valorDasParcelas';
import type { EscopoDePropagacao, OpcaoDeEscopo } from '@/components/financeiro-v2/OpcoesDeEscopo';

/** As chaves que a RPC aceita. Data e valor NÃO estão aqui de propósito: editam-se na grade de parcelas. */
export type CampoPropagavel = 'descricao' | 'credor_id' | 'forma_pagamento' | 'conta_bancaria_id' | 'fazenda_id' | 'plano_conta_id' | 'safra_id' | 'cultura' | 'fase';
export type CamposAPropagar = Partial<Record<CampoPropagavel, string | null>>;

export const ROTULO_DO_CAMPO: Record<CampoPropagavel, string> = {
  descricao: 'Descrição', credor_id: 'Credor', forma_pagamento: 'Forma de pagamento', conta_bancaria_id: 'Conta', fazenda_id: 'Fazenda',
  plano_conta_id: 'Classificação', safra_id: 'Safra', cultura: 'Cultura', fase: 'Fase',
};

/** O que o contrato tinha ao abrir (a base da comparação) e o que o formulário tem agora. */
export interface CamposDoContrato { descricao: string; credor_id: string; conta_bancaria_id: string; fazenda_id: string; plano_conta_id: string }
/** O que só as PARCELAS têm (não é coluna do contrato): `undefined` = o operador não mexeu. */
export interface CamposDasParcelas { forma_pagamento?: string | null; safra_id?: string | null; cultura?: string | null; fase?: string | null }
export type ComumDasParcelas = Record<keyof CamposDasParcelas, ValorDasParcelas>;

const limpo = (v: string | null | undefined) => (v ?? '').trim();

/**
 * `p_campos`: SÓ o que a edição mexeu.
 * ⚠ A DESCRIÇÃO VAI SEMPRE: é ela que alcança o contrato renomeado ANTES sem propagar (as parcelas ficaram com o nome antigo e a
 *   edição de hoje não "mudou" nada). Quem diz se há parcela a renomear é o banco; sem nenhuma, o diálogo nem abre.
 * Os campos das parcelas entram quando o operador escolheu um valor diferente do que TODAS já têm (ou quando elas variam).
 */
export function camposAPropagar(base: CamposDoContrato, atual: CamposDoContrato, dasParcelas: CamposDasParcelas, comum: ComumDasParcelas): CamposAPropagar {
  const c: CamposAPropagar = {};
  if (limpo(atual.descricao)) c.descricao = limpo(atual.descricao);
  const doContrato: Array<Exclude<keyof CamposDoContrato, 'descricao'>> = ['credor_id', 'conta_bancaria_id', 'fazenda_id', 'plano_conta_id'];
  for (const k of doContrato) if (limpo(atual[k]) !== limpo(base[k])) c[k] = limpo(atual[k]) || null;
  const delas: Array<keyof CamposDasParcelas> = ['forma_pagamento', 'safra_id', 'cultura', 'fase'];
  for (const k of delas) {
    const escolhido = dasParcelas[k];
    if (escolhido === undefined) continue;
    const jaTem = comum[k];
    if (jaTem.tipo === 'igual' && jaTem.valor === limpo(escolhido)) continue;
    c[k] = limpo(escolhido) || null;
  }
  return c;
}

/* ── a prévia, como o banco a devolve ─────────────────────────────────────────────────────────────────────────────────── */

export interface CampoDaPrevia { campo: CampoPropagavel; de: string | null; para: string | null; naoPagas: number; pagas: number; nasPagas: boolean }
export interface PreviaDaPropagacao {
  parcelas: { naoPagas: number; pagas: number };
  nomeProprio: { naoPagas: number; pagas: number };
  campos: CampoDaPrevia[];
  alteradas: { futuros: number; todos: number };
  gravadas: number;
}

const obj = (v: unknown): Record<string, unknown> | null => (typeof v === 'object' && v !== null && !Array.isArray(v) ? Object.fromEntries(Object.entries(v)) : null);
const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);
const txt = (v: unknown): string | null => (typeof v === 'string' && v !== '' ? v : null);
const CAMPOS: readonly CampoPropagavel[] = ['descricao', 'credor_id', 'forma_pagamento', 'conta_bancaria_id', 'fazenda_id', 'plano_conta_id', 'safra_id', 'cultura', 'fase'];

export function lerPreviaDaPropagacao(dado: unknown): PreviaDaPropagacao | null {
  const r = obj(dado); const p = obj(r?.parcelas); const n = obj(r?.nome_proprio); const a = obj(r?.alteradas);
  if (!r || !p || !n || !a || !Array.isArray(r.campos)) return null;
  const [np, pg, nnp, npg, fut, tod, grav] = [num(p.nao_pagas), num(p.pagas), num(n.nao_pagas), num(n.pagas), num(a.futuros), num(a.todos), num(r.gravadas)];
  if (np === null || pg === null || nnp === null || npg === null || fut === null || tod === null || grav === null) return null;
  const campos: CampoDaPrevia[] = [];
  for (const bruto of r.campos) {
    const c = obj(bruto);
    const campo = CAMPOS.find((k) => k === c?.campo);
    const naoPagas = num(c?.nao_pagas); const pagas = num(c?.pagas);
    if (!c || !campo || naoPagas === null || pagas === null) return null;
    campos.push({ campo, de: txt(c.de), para: txt(c.para), naoPagas, pagas, nasPagas: c.nas_pagas === true });
  }
  return { parcelas: { naoPagas: np, pagas: pg }, nomeProprio: { naoPagas: nnp, pagas: npg }, campos, alteradas: { futuros: fut, todos: tod }, gravadas: grav };
}

/** As três opções, com o que cada uma alcança NO CONTRATO (a regra é do banco; aqui é só o texto). */
export const OPCOES_DO_CONTRATO: readonly OpcaoDeEscopo[] = [
  { valor: 'futuros', rotulo: 'Só os futuros', explica: 'as parcelas ainda não pagas' },
  { valor: 'todos', rotulo: 'Futuros e passados', explica: 'todas; nas pagas mudam só a descrição e a classificação — forma, conta, data e valor das pagas não mudam nunca' },
  { valor: 'nenhum', rotulo: 'Não propagar', explica: 'grava só o contrato; as parcelas ficam como estão' },
];

/** Quantos lançamentos o escopo escolhido altera — o número é do banco; trocar a opção só troca qual se lê. */
export function lancamentosDoEscopo(p: PreviaDaPropagacao, escopo: EscopoDePropagacao): number {
  return escopo === 'nenhum' ? 0 : p.alteradas[escopo];
}

/**
 * "2 parcelas com nome próprio ficam como estão." — os números são os do banco, ditos um a um (a tela não os soma): em
 * "Futuros e passados" as não pagas e as pagas aparecem lado a lado. Nulo sem nenhuma no escopo.
 */
export function fraseDoNomeProprio(p: PreviaDaPropagacao, escopo: EscopoDePropagacao): string | null {
  if (escopo === 'nenhum') return null;
  const np = p.nomeProprio.naoPagas; const pg = escopo === 'todos' ? p.nomeProprio.pagas : 0;
  if (np === 0 && pg === 0) return null;
  const partes: string[] = [];
  if (np > 0) partes.push(np === 1 ? '1 não paga' : `${np} não pagas`);
  if (pg > 0) partes.push(pg === 1 ? '1 paga' : `${pg} pagas`);
  return `Com nome próprio, ficam como estão: ${partes.join(' e ')}.`;
}

export const MOTIVO_PROPAGAR_SO_NO_PARCELAMENTO = 'Propagar às parcelas: só em parcelamento. No financiamento com juros as parcelas são do motor.';
