/**
 * CPR-LAYOUT-04 (Gabriel 24/11 07:28) — os FILTROS da Contas a Pagar e Receber num botão só ("Filtros"), e a coluna Banco. PURO.
 *   - Origem: Recorrente · Parcelado · Avulso · Da nota. Uma linha pode ser de mais de uma (a parcela que veio da nota): cada opção é
 *     um teste; as escolhidas do mesmo grupo valem por "ou"; grupos diferentes por "e". Avulso = nenhuma das outras três.
 *   - Forma: Boleto · PIX · Débito automático · Cartão · TED · Sem forma (+ "Outra" para a grafia que não cai em nenhuma — Dinheiro…).
 *     A coluna `forma_pagamento` é texto livre (10 grafias no NJ em 24/11): o grupo sai do texto normalizado, nunca da igualdade.
 *   - Pagamento: Prontos · Faltando — pelo código da `fn_pronto_para_pagar_dos` (o ponto do Code 1/Code 4, no ar em 24/11): "pronto_*" e
 *     "nada_a_fazer" = pronto; "falta_*" = faltando; nulo = não se aplica (a receber, pago…) e com o filtro ligado a linha sai.
 * O filtro corta as linhas ANTES do recorte (`recortarCpr`): tela, PDF e Excel leem o mesmo resultado. Filtro ativo = chip com ✕.
 */
import { normalizarParaBusca } from '@/lib/texto/busca';

export type OrigemCpr = 'recorrente' | 'parcelado' | 'avulso' | 'da_nota';
export type FormaCpr = 'boleto' | 'pix' | 'debito_aut' | 'cartao' | 'ted' | 'sem_forma' | 'outra';
export type PagamentoCpr = 'prontos' | 'faltando';
export type GrupoDoFiltroCpr = 'origem' | 'forma' | 'pagamento';

export interface FiltrosCpr {
  origem: readonly OrigemCpr[];
  forma: readonly FormaCpr[];
  pagamento: readonly PagamentoCpr[];
}
export const SEM_FILTROS_CPR: FiltrosCpr = { origem: [], forma: [], pagamento: [] };

export const OPCOES_DOS_FILTROS_CPR: {
  readonly origem: readonly { valor: OrigemCpr; rotulo: string }[];
  readonly forma: readonly { valor: FormaCpr; rotulo: string }[];
  readonly pagamento: readonly { valor: PagamentoCpr; rotulo: string }[];
} = {
  origem: [
    { valor: 'recorrente', rotulo: 'Recorrente' }, { valor: 'parcelado', rotulo: 'Parcelado' },
    { valor: 'avulso', rotulo: 'Avulso' }, { valor: 'da_nota', rotulo: 'Da nota' },
  ],
  forma: [
    { valor: 'boleto', rotulo: 'Boleto' }, { valor: 'pix', rotulo: 'PIX' }, { valor: 'debito_aut', rotulo: 'Débito automático' },
    { valor: 'cartao', rotulo: 'Cartão' }, { valor: 'ted', rotulo: 'TED' }, { valor: 'sem_forma', rotulo: 'Sem forma' },
    { valor: 'outra', rotulo: 'Outra' },
  ],
  pagamento: [{ valor: 'prontos', rotulo: 'Prontos' }, { valor: 'faltando', rotulo: 'Faltando' }],
};
export const ROTULO_DO_GRUPO_CPR: Readonly<Record<GrupoDoFiltroCpr, string>> = { origem: 'Origem', forma: 'Forma', pagamento: 'Pagamento' };
/** Os grupos, na ordem do menu e dos chips. */
export const GRUPOS_DO_FILTRO_CPR: readonly GrupoDoFiltroCpr[] = ['origem', 'forma', 'pagamento'];
/** As opções de um grupo (valor + rótulo), na ordem da lista. */
export function opcoesDoGrupoCpr(g: GrupoDoFiltroCpr): readonly { valor: string; rotulo: string }[] {
  return OPCOES_DOS_FILTROS_CPR[g];
}
/** A opção está marcada no grupo? */
export function marcadoNoFiltroCpr(f: FiltrosCpr, g: GrupoDoFiltroCpr, valor: string): boolean {
  const lista: readonly string[] = f[g];
  return lista.includes(valor);
}

/** Por que o grupo Pagamento estaria desligado; `null` = ligado (a `fn_pronto_para_pagar_dos` está no ar). */
export const MOTIVO_PAGAMENTO_DESLIGADO_CPR: string | null = null;

/** O código da `fn_pronto_para_pagar_dos` → pronta? (true/false); nulo = a regra não se aplica à linha. */
export function prontaDoCodigoCpr(codigo: string | null | undefined): boolean | null {
  if (codigo == null || codigo === '') return null;
  if (codigo.startsWith('pronto_') || codigo === 'nada_a_fazer') return true;
  return false;
}

/** O que a regra lê da linha (os campos do lançamento). `parcela` = a linha é parcela de compra parcelada ou de financiamento. */
export interface LinhaDoFiltroCpr {
  recorrencia_id?: string | null;
  origem_lancamento?: string | null;
  origem_tipo?: string | null;
  tipo_documento?: string | null;
  numero_documento?: string | null;
  forma_pagamento?: string | null;
}

const temTexto = (s: string | null | undefined): boolean => (s ?? '').trim() !== '';

/** As origens da linha (pode ser mais de uma; Avulso só quando não é nenhuma das outras). */
export function origensDaLinhaCpr(l: LinhaDoFiltroCpr, ehParcela = false): Set<OrigemCpr> {
  const o = new Set<OrigemCpr>();
  if (temTexto(l.recorrencia_id) || l.origem_lancamento === 'recorrencia') o.add('recorrente');
  if (ehParcela || l.origem_lancamento === 'parcela_financiamento' || (l.origem_tipo ?? '').startsWith('parcela_')) o.add('parcelado');
  if (normalizarParaBusca(l.tipo_documento).startsWith('nota fiscal') && temTexto(l.numero_documento)) o.add('da_nota');
  if (o.size === 0) o.add('avulso');
  return o;
}

/** O grupo da forma gravada (texto livre): pelo texto normalizado. Cartão vem antes de Débito ("Cartão de Débito" é cartão). */
export function formaDaLinhaCpr(forma: string | null | undefined): FormaCpr {
  const f = normalizarParaBusca(forma);
  if (f === '') return 'sem_forma';
  if (f.includes('boleto')) return 'boleto';
  if (f.includes('pix')) return 'pix';
  if (f.includes('cartao') || f.includes('credito')) return 'cartao';
  if (f.includes('debito')) return 'debito_aut';
  if (f.includes('transfer') || f === 'ted' || f.startsWith('ted ') || f === 'doc') return 'ted';
  return 'outra';
}

export const algumFiltroCpr = (f: FiltrosCpr): boolean => f.origem.length + f.forma.length + f.pagamento.length > 0;

/**
 * A linha passa nos filtros? Grupo vazio = sem filtro. `pronta`: true/false = a regra do banco; null = não se aplica (com o filtro
 * Pagamento ligado, a linha sai); ausente = ainda não lido (não filtra — nunca esconder por falta de leitura).
 */
export function passaNosFiltrosCpr(l: LinhaDoFiltroCpr, f: FiltrosCpr, ctx: { ehParcela?: boolean; pronta?: boolean | null } = {}): boolean {
  if (f.origem.length > 0) {
    const o = origensDaLinhaCpr(l, ctx.ehParcela);
    if (!f.origem.some((x) => o.has(x))) return false;
  }
  if (f.forma.length > 0 && !f.forma.includes(formaDaLinhaCpr(l.forma_pagamento))) return false;
  if (f.pagamento.length > 0 && ctx.pronta !== undefined) {
    if (ctx.pronta === null || !f.pagamento.includes(ctx.pronta ? 'prontos' : 'faltando')) return false;
  }
  return true;
}

/** Liga/desliga uma opção de um grupo (a ordem das opções é a da lista, nunca a do clique). */
export function alternarFiltroCpr(f: FiltrosCpr, grupo: GrupoDoFiltroCpr, valor: string): FiltrosCpr {
  const ordem: readonly string[] = opcoesDoGrupoCpr(grupo).map((o) => o.valor);
  const atual: readonly string[] = f[grupo];
  const novo = atual.includes(valor) ? atual.filter((x) => x !== valor) : [...atual, valor];
  const ordenado = ordem.filter((x) => novo.includes(x));
  return { ...f, [grupo]: ordenado };
}

/** Os chips dos filtros ativos (um por grupo: "Origem: Recorrente, Da nota"), na ordem Origem · Forma · Pagamento. */
export function chipsDosFiltrosCpr(f: FiltrosCpr): { grupo: GrupoDoFiltroCpr; texto: string }[] {
  return GRUPOS_DO_FILTRO_CPR.filter((g) => f[g].length > 0).map((g) => {
    const rotulos = opcoesDoGrupoCpr(g).filter((o) => marcadoNoFiltroCpr(f, g, o.valor)).map((o) => o.rotulo);
    return { grupo: g, texto: `${ROTULO_DO_GRUPO_CPR[g]}: ${rotulos.join(', ')}` };
  });
}

/** A frase dos filtros para o cabeçalho do PDF / Excel ("Filtros: Origem: Recorrente · Forma: PIX"); '' sem filtro. */
export function fraseDosFiltrosCpr(f: FiltrosCpr): string {
  const c = chipsDosFiltrosCpr(f);
  return c.length === 0 ? '' : `Filtros: ${c.map((x) => x.texto).join(' · ')}`;
}

/* ─── a coluna Banco: o apelido curto da conta ───────────────────────────────────────────────────────────────────────── */

/** Os nomes de banco que têm forma curta conhecida (a 1ª palavra ou o par inicial do nome da conta, normalizados). */
const BANCO_CURTO: readonly [RegExp, string][] = [
  [/^banco do brasil\b/, 'BB'], [/^sicredi\b/, 'Sic.'], [/^sicoob\b/, 'Sicoob'], [/^itau bba\b/, 'Itaú BBA'], [/^itau\b/, 'Itaú'],
  [/^caixa economica( federal)?\b/, 'CEF'], [/^santander\b/, 'Sant.'], [/^bradesco\b/, 'Brad.'], [/^cartao\b/, 'Cart.'],
  [/^invest\b/, 'Inv.'], [/^permuta\b/, 'Perm.'],
];
/** Palavra que não entra no apelido. */
const SEM_PESO = new Set(['de', 'da', 'do', 'das', 'dos', 'e', '-', '·', '|']);

/**
 * O APELIDO CURTO da conta para a coluna Banco (~70px a 11px): o banco na forma curta conhecida + as outras palavras em 3 letras e
 * ponto ("Sicredi Pessoal" → "Sic. Pes."; "Banco do Brasil" → "BB"; "Sicredi PJ Pecuária" → "Sic. PJ Pec."). Sigla (tudo maiúsculo,
 * até 4 letras) e palavra de até 5 letras ("Caixa") ficam inteiras. O nome inteiro vai no `title`. Sem nome → ''.
 */
export function apelidoCurtoDaContaCpr(nome: string | null | undefined): string {
  let resto = (nome ?? '').replace(/^cc-\d+\s*\|\s*/i, '').replace(/[-·|]/g, ' ').replace(/\s+/g, ' ').trim();
  if (!resto) return '';
  const partes: string[] = [];
  for (let passo = 0; passo < 3; passo += 1) {
    const n = normalizarParaBusca(resto);
    const achado = BANCO_CURTO.find(([re]) => re.test(n));
    if (!achado) break;
    const casou = n.match(achado[0])?.[0] ?? '';
    partes.push(achado[1]);
    resto = resto.slice(casou.length).trim();
  }
  for (const w of resto.split(' ')) {
    if (!w || SEM_PESO.has(w.toLowerCase())) continue;
    const sigla = /^[A-Z0-9]{1,4}$/.test(w);
    partes.push(sigla || w.length <= 5 ? w : `${w.slice(0, 3)}.`);
  }
  return partes.join(' ');
}
