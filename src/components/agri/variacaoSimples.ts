/**
 * A VARIAÇÃO DO ESTOQUE, VERSÃO SIMPLES — DRE-VARIACAO-SIMPLES-01 (Gabriel 10/11 16:54; mock
 * ui-validar/variacao-simples.html, P1–P8). As contas do modal de 2 abas (Resumo · Por categoria).
 *
 * ⚠ NENHUMA CONTA DO BANCO É REFEITA AQUI. Produção e Mercado de cada categoria são o `vpb` e o
 * `efeito` que a `fn_dre_pecuaria_patrimonio` devolve — os mesmos números das linhas "Variação por
 * produção" e "Efeito de mercado" do DRE (FASE 0 de 10/11: iguais ao centavo nas 2 fazendas da Vera
 * jan–out/26). Refazer a partir de q·pm·pk arredondados do payload dava R$ 5,84 de diferença (BG).
 * Aqui só se SOMA (grupo, total) e se DIVIDE (R$/@ ponderado = valor ÷ @).
 * ⚠ O ÁGIO (troca de categoria) FICA DENTRO DA PRODUÇÃO, como no DRE: não tem linha própria.
 */
import { formatNum } from '@/lib/calculos/formatters';
import type { MovimentosPec } from '@/hooks/useDrePecuaria';

/** Uma categoria nas unidades da tela (@ = kg vivo ÷ 30). */
export interface CatDaVariacao {
  cod: string; nome: string; jovem: boolean;
  at0: number; at1: number;
  /** início a preço do início · fim a preço do início · fim a preço do fim (do payload) */
  v0: number; v1p0: number; v1p1: number;
  /** `vpb` e `efeito` da RPC */
  producao: number; mercado: number;
}

/** Uma linha da aba Por categoria (categoria, grupo ou total). */
export interface LinhaDaVariacao {
  nome: string;
  at0: number; at1: number; dAt: number;
  pk0: number | null; pk1: number | null;
  /** (pk1 ÷ pk0 − 1) × 100; `null` sem um dos preços */
  dPkPct: number | null;
  /** início · fim a preço do início · fim */
  v0: number; v1p0: number; v1: number;
  producao: number; mercado: number; total: number;
}

const porAt = (valor: number, at: number) => (at === 0 ? null : valor / at);

/**
 * O PREÇO DO INÍCIO DE UMA CATEGORIA QUE NASCEU NO PERÍODO (sem @ no início) é o do fim valorado a
 * preço do início — o mesmo critério do banco (`coalesce(p0.pk, p1.pk)` em `v_fim_p0`). Sem isso a
 * coluna ficaria em "—" justo nas categorias que mais produziram.
 */
export function linhaDe(nome: string, cs: readonly CatDaVariacao[]): LinhaDaVariacao {
  const s = (f: (c: CatDaVariacao) => number) => cs.reduce((a, c) => a + f(c), 0);
  const at0 = s(c => c.at0); const at1 = s(c => c.at1);
  const v0 = s(c => c.v0); const v1p0 = s(c => c.v1p0); const v1 = s(c => c.v1p1);
  const pk0 = porAt(v0, at0) ?? porAt(v1p0, at1);
  const pk1 = porAt(v1, at1);
  const producao = s(c => c.producao); const mercado = s(c => c.mercado);
  return {
    nome, at0, at1, dAt: at1 - at0, pk0, pk1,
    dPkPct: pk0 == null || pk1 == null || pk0 === 0 ? null : (pk1 / pk0 - 1) * 100,
    v0, v1p0, v1, producao, mercado, total: producao + mercado,
  };
}

/** A aba Por categoria: gado jovem e gado adulto, cada um com o subtotal em cima, e o total do rebanho. */
export interface GrupoDaVariacao { titulo: string; subtotal: LinhaDaVariacao; cats: LinhaDaVariacao[] }
export function porCategoria(cats: readonly CatDaVariacao[]): { grupos: GrupoDaVariacao[]; total: LinhaDaVariacao } {
  const grupo = (titulo: string, lista: readonly CatDaVariacao[]): GrupoDaVariacao[] =>
    (lista.length === 0 ? [] : [{ titulo, subtotal: linhaDe(titulo, lista), cats: lista.map(c => linhaDe(c.nome, [c])) }]);
  return {
    grupos: [...grupo('Gado jovem', cats.filter(c => c.jovem)), ...grupo('Gado adulto', cats.filter(c => !c.jovem))],
    total: linhaDe('Total do rebanho', cats),
  };
}

/**
 * A NOTA DO MIX (P8): o preço médio do rebanho é ponderado pelas @ de cada categoria, e ele se mexe
 * quando a MISTURA muda, mesmo com o mercado parado — e essa parte já está dentro da Produção
 * (o texto do mock P8). `null` com menos de duas categorias com preço nas duas pontas.
 */
export function notaDoMix(total: LinhaDaVariacao, cats: readonly LinhaDaVariacao[]): string | null {
  const pcts = cats.map(c => c.dPkPct).filter((p): p is number => p != null && Number.isFinite(p));
  if (pcts.length < 2 || total.dPkPct == null) return null;
  const mn = Math.min(...pcts); const mx = Math.max(...pcts);
  const t = total.dPkPct;
  const verbo = t >= 0 ? 'subiu' : 'caiu';
  return `Por que o preço médio ${verbo} ${pct(Math.abs(t))} e as categorias ficaram entre ${pct(mn)} e ${pct(mx)}? `
    + 'Porque a mistura do rebanho muda o preço médio (mais ou menos @ das categorias de @ mais cara). Essa parte é do tipo de gado, não do mercado, e já está dentro de "Produção".';
}
const pct = (p: number) => `${formatNum(p, 1)}%`;

/**
 * O EXTRATO DAS ARROBAS (P5) — início + nascimentos + compras − vendas e abates − mortes, com o
 * GANHO DE PESO fechando a diferença até o fim (o briefing). As pontas são as @ dos cards (as das
 * categorias), para o extrato fechar com o que está escrito ao lado.
 * ⚠ TRANSFERÊNCIA SÓ APARECE QUANDO ≠ 0 — e entra antes do ganho, para ele não absorvê-la.
 */
export interface LinhaDoExtrato { chave: string; rotulo: string; arrobas: number; total?: boolean }
export function extratoDasArrobas(at0: number, at1: number, m: MovimentosPec, datas: { inicio: string; fim: string }): {
  linhas: LinhaDoExtrato[]; produzido: number; vendido: number; ganho: number;
} {
  const nasc = m.nascimentos.arrobas; const comp = m.compradas.arrobas;
  const tin = m.transf_entrada.arrobas; const tout = m.transf_saida.arrobas;
  const vend = m.vendas_abates.arrobas; const mort = m.mortes.arrobas;
  const ganho = at1 - (at0 + nasc + comp + tin - vend - mort - tout);
  const linhas: LinhaDoExtrato[] = [
    { chave: 'inicio', rotulo: `Arrobas em ${datas.inicio}`, arrobas: at0, total: true },
    { chave: 'ganho', rotulo: '+ Ganho de peso do gado (engorda)', arrobas: ganho },
    { chave: 'nascimentos', rotulo: '+ Nascimentos', arrobas: nasc },
    { chave: 'compras', rotulo: '+ Compras', arrobas: comp },
    ...(tin !== 0 ? [{ chave: 'transf_entrada', rotulo: '+ Transferências recebidas', arrobas: tin }] : []),
    { chave: 'vendas', rotulo: '− Vendas e abates', arrobas: -vend },
    { chave: 'mortes', rotulo: '− Mortes', arrobas: -mort },
    ...(tout !== 0 ? [{ chave: 'transf_saida', rotulo: '− Transferências enviadas', arrobas: -tout }] : []),
    { chave: 'fim', rotulo: `Arrobas em ${datas.fim}`, arrobas: at1, total: true },
  ];
  return { linhas, produzido: ganho + nasc, vendido: vend, ganho };
}

const MESES_CURTOS = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
/** "set/25" — o mês de um ano_mes ('2025-09'); "—" se não for um. */
export function mesCurto(am: string): string {
  if (!/^\d{4}-\d{2}$/.test(am)) return '—';
  return `${MESES_CURTOS[Number(am.slice(5, 7)) - 1]}/${am.slice(2, 4)}`;
}
/** O período curto do título (v4, Chat 11/11 08:35): do mês seguinte a P0 até P1 — "jan–set/25", ou "jul/25–jun/26" virando o ano. */
export function periodoCurto(p0: string, p1: string): string {
  if (!/^\d{4}-\d{2}$/.test(p0) || !/^\d{4}-\d{2}$/.test(p1)) return '—';
  const t = Number(p0.slice(0, 4)) * 12 + Number(p0.slice(5, 7));
  const ini = `${Math.floor(t / 12)}-${String((t % 12) + 1).padStart(2, '0')}`;
  return ini.slice(0, 4) === p1.slice(0, 4) ? `${MESES_CURTOS[Number(ini.slice(5, 7)) - 1]}–${mesCurto(p1)}` : `${mesCurto(ini)}–${mesCurto(p1)}`;
}

/** As datas dos cards em dd/mm/aaaa: o início é o 1º dia do mês seguinte a P0; o fim, o último dia de P1. */
export function datasDasPontas(p0: string, p1: string): { inicio: string; fim: string } {
  const ok = (am: string) => /^\d{4}-\d{2}$/.test(am);
  const dd = (d: Date) => `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
  const inicio = ok(p0) ? dd(new Date(Number(p0.slice(0, 4)), Number(p0.slice(5, 7)), 1)) : '—';
  const fim = ok(p1) ? dd(new Date(Number(p1.slice(0, 4)), Number(p1.slice(5, 7)), 0)) : '—';
  return { inicio, fim };
}

/**
 * DE ONDE VEIO A VARIAÇÃO, LINHA POR LINHA — mock v2 (Gabriel 11/11 06:58, `ui-validar/variacao-v2.html`). O preço médio PONDERADO
 * da @ em 3 degraus: o do início (valor ÷ @ do início) → o do rebanho de HOJE a preços do início (Σ @fim·P_início ÷ @fim) → o de
 * hoje (valor do fim ÷ @ do fim).
 *   1 Quantidade de arrobas: Δ@ × o preço médio do início.
 *   2 Tipo de gado (mistura + ágio): o RESTO da Variação por produção (vpb da RPC − linha 1). Por isso 1 + 2 = vpb, ao centavo.
 *   3 Mercado: o efeito de mercado da RPC.
 *   Total: Valor fim − Valor início = 1 + 2 + 3.
 * ⚠ AS LINHAS 2 E 3 NÃO SE REFAZEM: saem do vpb e do efeito da RPC (as linhas do DRE). Só a 1 é conta da tela.
 */
export interface DegrausDoPreco {
  /** os 3 degraus do preço médio ponderado da @; `null` sem @ na ponta */
  p0: number | null; pMeio: number | null; p1: number | null;
  quantidade: { at0: number; at1: number; dAt: number; vale: number };
  tipo: { vale: number };
  mercado: { vale: number };
  total: { v0: number; v1: number; vale: number };
  /** o vpb (1 + 2) — o número da linha "Variação por produção" do DRE */
  producao: number;
}
export function degrausDoPreco(t: LinhaDaVariacao): DegrausDoPreco {
  const p0 = t.pk0;
  const pMeio = t.at1 === 0 ? null : t.v1p0 / t.at1;
  const p1 = t.pk1;
  const q = t.dAt * (p0 ?? 0);
  return {
    p0, pMeio, p1,
    quantidade: { at0: t.at0, at1: t.at1, dAt: t.dAt, vale: q },
    tipo: { vale: t.producao - q },
    mercado: { vale: t.mercado },
    total: { v0: t.v0, v1: t.v1, vale: t.producao + t.mercado },
    producao: t.producao,
  };
}
