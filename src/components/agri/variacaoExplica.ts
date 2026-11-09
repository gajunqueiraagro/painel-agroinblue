/**
 * A EXPLICAÇÃO DA VARIAÇÃO DO ESTOQUE — DRE-VARIACAO-EXPLICA-01 fatia 1b (mock `ui-validar/variacao-estoque-mock.html`, 05/11).
 *
 * Tudo aqui sai do payload da `fn_dre_pecuaria_patrimonio` por soma, subtração e divisão — nenhum número novo:
 *   Produção = vpb − ágio · Evolução de categoria = ágio · Mercado = efeito · Fim = Início + as três.
 * ⚠ D1: o preço de referência é o R$/@ de dez/AA (P0). D2: aberta pela linha do RESUMIDO ("Variação do estoque"), a ponte
 * termina na linha — Produção + Evolução − Reposição —, sem as pontas (F3). D3: fim pelo cadastro = mercado "—" + selo.
 * ⚠ AUSÊNCIA É `null` ("—" na tela), ZERO É NÚMERO.
 */

export interface TotaisDaVariacao {
  v0: number; v1_p0: number; v1_p1: number; vpb: number; efeito: number;
  /** `null` = a RPC não mandou o ágio (anterior à 115300). */
  agio: number | null;
  at0: number; at1: number;
  p1_fonte: 'fechamento' | 'cadastro' | 'zero' | null;
}

export type ChavePasso = 'inicio' | 'producao' | 'evolucao' | 'mercado' | 'fim' | 'reposicao' | 'linha';
export interface PassoEmReais {
  chave: ChavePasso;
  rotulo: string;
  /** `null` = "—". */
  valor: number | null;
  /** `ponta` desenha do chão; `delta` flutua sobre o acumulado; `linha` é o total da linha do DRE (do chão). */
  tipo: 'ponta' | 'delta' | 'linha';
}

/** Fim sem fechamento validado: o preço do fim não existe, e o mercado é "—" (D3). */
export const fimPeloCadastro = (t: Pick<TotaisDaVariacao, 'p1_fonte'>) => t.p1_fonte === 'cadastro';

/** A Produção sem o ágio. Sem a chave do ágio, a produção é o vpb inteiro (e a evolução fica "—"). */
export const producaoSemAgio = (t: Pick<TotaisDaVariacao, 'vpb' | 'agio'>) => t.vpb - (t.agio ?? 0);

/**
 * A PONTE EM R$ — V1.
 * Detalhado: Início · Produção · Evolução de categoria · Mercado · Fim (a soma fecha: Início + os três = Fim).
 * Resumido (D2/F3): Produção · Evolução de categoria · (−) Reposição · = Variação do estoque (a linha da grade).
 */
export function ponteEmReais(
  t: TotaisDaVariacao, rotulos: { p0: string; p1: string },
  modo: { resumido: boolean; reposicao: number | null },
): PassoEmReais[] {
  const prod = producaoSemAgio(t);
  const evol = t.agio;
  if (modo.resumido) {
    const linha = modo.reposicao == null ? null : prod + (evol ?? 0) - modo.reposicao;
    return [
      { chave: 'producao', rotulo: 'Produção', valor: prod, tipo: 'delta' },
      { chave: 'evolucao', rotulo: 'Evolução de categoria', valor: evol, tipo: 'delta' },
      { chave: 'reposicao', rotulo: '(−) Reposição', valor: modo.reposicao == null ? null : -modo.reposicao, tipo: 'delta' },
      { chave: 'linha', rotulo: 'Variação do estoque', valor: linha, tipo: 'linha' },
    ];
  }
  return [
    { chave: 'inicio', rotulo: `Valia em ${rotulos.p0}`, valor: t.v0, tipo: 'ponta' },
    { chave: 'producao', rotulo: 'Produção', valor: prod, tipo: 'delta' },
    { chave: 'evolucao', rotulo: 'Evolução de categoria', valor: evol, tipo: 'delta' },
    { chave: 'mercado', rotulo: 'Mercado', valor: fimPeloCadastro(t) ? null : t.efeito, tipo: 'delta' },
    { chave: 'fim', rotulo: `Vale em ${rotulos.p1}`, valor: t.v1_p1, tipo: 'ponta' },
  ];
}

/**
 * OS TRÊS CARDS QUE EXPLICAM A PRODUÇÃO — V2 (A2, 05/11).
 * Quantidade = Δ @ × R$/@ médio do início (preço de dez/AA) · Composição = Produção − Quantidade (já sem o ágio) ·
 * Mercado = o efeito. Quantidade + Composição = a barra Produção.
 */
export interface CardsDaProducao {
  quantidade: number | null; composicao: number | null; mercado: number | null;
  dAt: number; pkMedio0: number | null;
  /** R$/@ médio do FIM a preço do início (só composição) e a preço do fim (com mercado). */
  pkFimRef: number | null; pkFimMes: number | null;
}
export function cardsDaProducao(t: TotaisDaVariacao): CardsDaProducao {
  const dAt = t.at1 - t.at0;
  const pkMedio0 = t.at0 === 0 ? null : t.v0 / t.at0;
  const quantidade = pkMedio0 == null ? null : dAt * pkMedio0;
  const composicao = quantidade == null ? null : producaoSemAgio(t) - quantidade;
  return {
    quantidade, composicao, mercado: fimPeloCadastro(t) ? null : t.efeito, dAt, pkMedio0,
    pkFimRef: t.at1 === 0 ? null : t.v1_p0 / t.at1,
    pkFimMes: fimPeloCadastro(t) || t.at1 === 0 ? null : t.v1_p1 / t.at1,
  };
}

/** Uma linha (categoria, grupo ou total) já em @ — o mínimo que a V3/V6 precisam. */
export interface LinhaDoRebanho {
  nome: string;
  q0: number; q1: number; at0: number; at1: number;
  v0: number; v1p0: number; v1p1: number;
  vpb: number; efeito: number; agio: number | null;
}

/** V6 — o rebanho de dez e o que mudou: as derivadas de uma linha, sobre o total do rebanho. */
export interface LinhaV6 {
  nome: string;
  cab0: number; at0: number; atPorCab: number | null; pk0: number | null; v0: number;
  dCab: number; dCabPct: number | null; dAt: number; dAtPct: number | null;
  part0: number | null; part1: number | null; dPart: number | null;
}
const pct = (d: number, base: number) => (base === 0 ? null : (d / base) * 100);
export function linhaV6(l: LinhaDoRebanho, total: Pick<LinhaDoRebanho, 'at0' | 'at1'>): LinhaV6 {
  const part0 = total.at0 === 0 ? null : (l.at0 / total.at0) * 100;
  const part1 = total.at1 === 0 ? null : (l.at1 / total.at1) * 100;
  return {
    nome: l.nome, cab0: l.q0, at0: l.at0, atPorCab: l.q0 === 0 ? null : l.at0 / l.q0,
    pk0: l.at0 === 0 ? null : l.v0 / l.at0, v0: l.v0,
    dCab: l.q1 - l.q0, dCabPct: pct(l.q1 - l.q0, l.q0), dAt: l.at1 - l.at0, dAtPct: pct(l.at1 - l.at0, l.at0),
    part0, part1, dPart: part0 == null || part1 == null ? null : part1 - part0,
  };
}

/** V4 — um ponto por mês: @ e os dois R$/@ médios (a preço de dez/AA e a preço do mês; sem fechamento, "—"). */
export interface PontoV4 { ano_mes: string; arrobas: number | null; pkRef: number | null; pkMes: number | null; cadastro: boolean }
export function serieV4(meses: readonly { ano_mes: string; fonte: 'fechamento' | 'cadastro'; arrobas: number | null; v_ref: number | null; v_mes: number | null }[]): PontoV4[] {
  return meses.map(m => {
    const a = m.arrobas;
    const div = (v: number | null) => (v == null || a == null || a === 0 ? null : v / a);
    return { ano_mes: m.ano_mes, arrobas: a, pkRef: div(m.v_ref), pkMes: m.fonte === 'fechamento' ? div(m.v_mes) : null, cadastro: m.fonte === 'cadastro' };
  });
}

/** Número em pt-BR, inteiro, com sinal explícito (−, nunca hífen). */
export const reaisComSinal = (v: number | null) => {
  if (v == null) return '—';
  const r = Math.round(v);
  const s = Math.abs(r).toLocaleString('pt-BR', { maximumFractionDigits: 0 });
  return `${r > 0 ? '+' : r < 0 ? '−' : ''}R$ ${s}`;
};
export const reais = (v: number | null) => (v == null ? '—' : `R$ ${Math.round(v).toLocaleString('pt-BR', { maximumFractionDigits: 0 })}`);

/**
 * V5 — a frase, com os números da tela (nada que a tela não mostre).
 * ⚠ Mercado "—" (fim pelo cadastro) sai da frase como "sem preço do fim", nunca como zero.
 */
export function fraseDaVariacao(t: TotaisDaVariacao, rotulos: { p0: string; p1: string }): string {
  const c = cardsDaProducao(t);
  const at = (v: number) => `${Math.round(v).toLocaleString('pt-BR')} @`;
  const sinalAt = `${c.dAt > 0 ? '+' : c.dAt < 0 ? '−' : ''}${Math.abs(Math.round(c.dAt)).toLocaleString('pt-BR')} @`;
  const partes = [
    `De ${rotulos.p0} a ${rotulos.p1} o rebanho foi de ${at(t.at0)} para ${at(t.at1)} (${sinalAt}), o que vale ${reaisComSinal(c.quantidade)} pelo R$/@ de ${rotulos.p0}.`,
    `A composição somou ${reaisComSinal(c.composicao)}${t.agio == null ? '.' : ` e a evolução de categoria, ${reaisComSinal(t.agio)}.`}`,
    `Juntas dão a variação por produção do DRE: ${reaisComSinal(t.vpb)}.`,
    fimPeloCadastro(t) ? 'O mercado fica sem número: o fim veio do cadastro, sem preço do mês.' : `À parte, o mercado: ${reaisComSinal(t.efeito)}.`,
  ];
  return partes.join(' ');
}
