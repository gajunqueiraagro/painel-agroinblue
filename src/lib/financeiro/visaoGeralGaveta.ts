/**
 * FIN-VISAO-GERAL-01 PR 5 (SPEC §5, §7) — a GAVETA DE LANÇAMENTOS do modal de análise: tipos, o pedido ao banco e os filtros da
 * "lista de Lançamentos". A tela NUNCA soma: total, nº de lançamentos, valor médio, resumo, % dos filhos e cada linha vêm prontos da
 * `fn_vg_gaveta` — que lê as MESMAS linhas (por parte) da série do modal, então o total da gaveta é o valor do nó.
 *   · Nó com filhos: a lista são os filhos (clique desce). Subcentro: os lançamentos, paginados (até 500 por página).
 *   · ⚠ REGRA DO ID: a parte 2+ da classificação dividida chega com a chave "id#2"; abrir é SEMPRE pelo `lancamento_id` que o banco
 *     manda junto (nunca pela chave da linha).
 */
import { supabase } from '@/integrations/supabase/client';
import { MESES_ABR, rotuloMes, type LadoVG } from '@/lib/financeiro/visaoGeral';
import type { CaminhoVG, ContextoAnaliseVG, CriterioVG } from '@/lib/financeiro/visaoGeralAnalise';

export const POR_PAGINA_GAVETA = 500;

export interface LancamentoGavetaVG {
  chave: string; lancamento_id: string; parte_ordem: number; partes_total: number;
  data: string | null; favorecido: string; descricao: string | null; conta: string;
  valor: number; valor_lancamento: number; status: string; previsto: boolean; vencido: boolean;
}
export interface FilhoGavetaVG { caminho: CaminhoVG; rotulo: string; qtd: number; valor: number; pct: number | null }
export interface GavetaVG {
  lado: LadoVG; mes: string; criterio: CriterioVG; janela: { de: string; ate: string }; folha: boolean;
  caminho: { caminho: CaminhoVG; rotulo: string }[];
  irmaos: { caminho: CaminhoVG; rotulo: string; valor: number }[];
  qtd: number; total: number; medio: number | null;
  resumo: { tipo: 'favorecido' | 'filhos'; linhas: { rotulo: string; qtd: number; valor: number; pct?: number | null }[] };
  linhas: (LancamentoGavetaVG | FilhoGavetaVG)[];
  total_linhas: number; pagina: number; por_pagina: number; paginas: number;
  /** só na folha (111947): o que a lista de Lançamentos não reproduz — vencidos trazidos de antes da janela; no nó de transferências,
   *  as transferências entre duas contas do conjunto (aqui se anulam); no de saída, os pagamentos de fatura com o cartão fora do conjunto
   *  (111949: aqui não entram — P82) */
  lista?: { vencidos_fora: number; transf_internas: number; faturas_cartao?: number } | null;
}
/** o que a gaveta pede: o nó, o mês e o critério do modal (a janela); o resto vem da tela */
export interface PedidoGavetaVG { lado: LadoVG; caminho: CaminhoVG; am: string; criterio: CriterioVG }

export const ehLancamento = (l: LancamentoGavetaVG | FilhoGavetaVG): l is LancamentoGavetaVG => 'lancamento_id' in l;

export async function carregarGavetaVG(ctx: ContextoAnaliseVG, p: PedidoGavetaVG, pagina = 1): Promise<GavetaVG> {
  const { data, error } = await (supabase.rpc as any)('fn_vg_gaveta', {
    p_cliente: ctx.clienteId, p_de: ctx.de, p_ate: ctx.ate, p_mes: p.am, p_lado: p.lado, p_caminho: p.caminho, p_criterio: p.criterio,
    p_contas: ctx.contas, p_fazendas: ctx.fazendas, p_atividade: ctx.atividade, p_hoje: ctx.hoje,
    p_status: ctx.status, p_incluir_vencidos: ctx.comVencidos, p_pagina: pagina, p_por_pagina: POR_PAGINA_GAVETA,
  });
  if (error) throw new Error(error.message);
  return data as GavetaVG;
}

/** as páginas já abertas, de novo (salvou um lançamento: relê o que estava na tela, sem perder o lugar) — as linhas são do banco */
export async function recarregarGavetaVG(ctx: ContextoAnaliseVG, p: PedidoGavetaVG, paginas: number): Promise<GavetaVG> {
  const lidas = await Promise.all(Array.from({ length: Math.max(1, paginas) }, (_, i) => carregarGavetaVG(ctx, p, i + 1)));
  return { ...lidas[0], linhas: lidas.flatMap((g) => g.linhas), pagina: lidas[lidas.length - 1].pagina };
}

/** dd/mm/aaaa (a data do lançamento: pagamento, ou vencimento no previsto) */
export const dataLonga = (d: string | null) => (d ? `${d.slice(8, 10)}/${d.slice(5, 7)}/${d.slice(0, 4)}` : '—');

/**
 * "Ver na lista de Lançamentos ›" (P94: a tela nunca filtra o que não mostra) — os filtros EQUIVALENTES que a barra da lista mostra:
 * tipo, ano e meses da janela, status (o realizado e os chips ligados), fazenda, conta (só quando é UMA: a lista filtra uma conta),
 * atividade, centro e subcentro. A soma da lista pode diferir da gaveta onde a lista não tem o filtro: várias contas, o vencido
 * levado para o mês de hoje e a transferência entre contas escolhidas (a lista mostra; a gaveta anula) — `avisoDaLista` diz qual.
 *   · O nó de TRANSFERÊNCIAS ("Outras saídas › Transferências para outras contas", sem atividade nem subcentro) abre a lista no tipo
 *     "3-Transferências", sem centro (na lista a transferência não tem centro nem subcentro: com "2-Saídas" ela abriria vazia).
 *   · A CONTA (quando é uma) vai pelo LADO: saída em Conta Origem; ENTRADA em CONTA DESTINO — a entrada grava a conta em
 *     `conta_destino_id` (NJ 2026: 354 de 374, nenhuma em `conta_bancaria_id`) e a transferência recebida também; a lista, no tipo
 *     Entradas, até apaga a Conta Origem (PR 5b: pela origem, a entrada abria vazia e a transferência de entrada mostrava as que SAEM).
 *   · STATUS: na lista "Realizado" EXCLUI os conciliados ("Conciliado", `conciliado_real`, é a outra metade — LANC-STATUS-LISTA-UNICA-01);
 *     o realizado da Visão Geral são os dois, então vão os dois (PR 5b: só "realizado" escondia os conciliados).
 */
export interface FiltrosListaVG {
  tipo: '1-Entradas' | '2-Saídas' | '3-Transferências'; anos: string[]; meses: string[]; status: string[];
  fazendaId: string | null; contaId: string | null; contaDestinoId: string | null; atividade: string | null; centro: string | null; subcentro: string | null;
}
const TRANSF_SAIDA = 'Transferências para outras contas';
const TRANSF_ENTRADA = 'Transferências de outras contas';
const CENTROS_DE_TRANSFERENCIA = [TRANSF_SAIDA, TRANSF_ENTRADA];
export const ehNoDeTransferencia = (caminho: CaminhoVG) => !caminho[1] && CENTROS_DE_TRANSFERENCIA.includes(caminho[2] ?? '');

export function filtrosDaLista(ctx: ContextoAnaliseVG, g: Pick<GavetaVG, 'lado' | 'janela'>, caminho: CaminhoVG): FiltrosListaVG {
  const [ad, md] = [Number(g.janela.de.slice(0, 4)), Number(g.janela.de.slice(5, 7))];
  const [aa, ma] = [Number(g.janela.ate.slice(0, 4)), Number(g.janela.ate.slice(5, 7))];
  const anos: string[] = []; const meses = new Set<string>();
  for (let a = ad, m = md; a < aa || (a === aa && m <= ma); m === 12 ? (a += 1, m = 1) : (m += 1)) {
    if (!anos.includes(String(a))) anos.push(String(a));
    meses.add(String(m).padStart(2, '0'));
  }
  const transf = ehNoDeTransferencia(caminho);
  const umaConta = ctx.contas?.length === 1 ? ctx.contas[0] : null;
  const entra = g.lado === 'entrada';
  return {
    tipo: transf ? '3-Transferências' : g.lado === 'saida' ? '2-Saídas' : '1-Entradas', anos, meses: [...meses].sort(),
    status: ['realizado', 'conciliado_real', ...ctx.status],
    fazendaId: ctx.fazendas?.length === 1 ? ctx.fazendas[0] : null,
    contaId: entra ? null : umaConta, contaDestinoId: entra ? umaConta : null,
    atividade: caminho[1] ?? ctx.atividade ?? null, centro: transf ? null : caminho[2] ?? null, subcentro: transf ? null : caminho[3] ?? null,
  };
}

/** as frases do rodapé (Gabriel: a tela nunca esconde diferença) — na ordem em que valem: a primeira que vale ocupa a linha; a 4ª, a
 *  da virada do ano, é montada com os meses do caso (`avisoDaViradaDeAno`); a 5ª, a da fatura do cartão (regra do Gabriel, P82: compra
 *  no cartão = saída, pagamento da fatura = transferência) */
export const AVISOS_DA_LISTA = {
  contas: 'A lista filtra uma conta por vez: vai abrir com todas as contas.',
  vencidos: 'Na lista, os vencidos ficam no mês do vencimento.',
  transferencias: 'A lista mostra as transferências entre as contas escolhidas; aqui elas se anulam.',
  fatura: 'A lista mostra o pagamento da fatura como transferência; aqui não entra (a compra já foi a saída).',
} as const;

/** "jan–fev" / "nov" — meses (1–12, em ordem) em faixas seguidas */
function faixasDeMeses(ms: number[]): string[] {
  const out: string[] = [];
  for (let i = 0; i < ms.length;) {
    let j = i;
    while (j + 1 < ms.length && ms[j + 1] === ms[j] + 1) j += 1;
    out.push(i === j ? MESES_ABR[ms[i] - 1] : `${MESES_ABR[ms[i] - 1]}–${MESES_ABR[ms[j] - 1]}`);
    i = j + 1;
  }
  return out;
}
/**
 * PR 5b — o 4º aviso: a janela que ATRAVESSA o ano (média ou acumulado, ex.: nov/25 → fev/26). A lista filtra ano × mês, então os
 * meses escolhidos valem em todos os anos escolhidos: além da janela, ela traz os meses que sobram em cada ano. A frase usa os meses
 * do caso; dentro do mesmo ano não há sobra (null). O conserto (a lista aceitar período de datas) é do P98.
 */
export function avisoDaViradaDeAno(janela: { de: string; ate: string }): string | null {
  const [ad, md] = [Number(janela.de.slice(0, 4)), Number(janela.de.slice(5, 7))];
  const [aa, ma] = [Number(janela.ate.slice(0, 4)), Number(janela.ate.slice(5, 7))];
  if (ad === aa) return null;
  const dentro = new Set<string>(); const meses = new Set<number>();
  for (let a = ad, m = md; a < aa || (a === aa && m <= ma); m === 12 ? (a += 1, m = 1) : (m += 1)) { dentro.add(`${a}-${m}`); meses.add(m); }
  const ordem = [...meses].sort((x, y) => x - y);
  const sobras: string[] = [];
  for (let a = ad; a <= aa; a += 1) {
    const ms = ordem.filter((m) => !dentro.has(`${a}-${m}`));
    if (ms.length) sobras.push(`${faixasDeMeses(ms).join(', ')}/${String(a).slice(2)}`);
  }
  if (!sobras.length) return null;
  const lista = sobras.length === 1 ? sobras[0] : `${sobras.slice(0, -1).join(', ')} e ${sobras[sobras.length - 1]}`;
  return `A lista filtra por ano e mês: o período ${rotuloMes(janela.de.slice(0, 7))}–${rotuloMes(janela.ate.slice(0, 7))} traz também ${lista}.`;
}
/**
 * O que a lista de Lançamentos NÃO reproduz desta folha, para a linha acima do "Ver na lista ›". Sem diferença: [] (a linha fica vazia,
 * o lugar continua reservado). Os números vêm do banco (`lista`); a tela só escolhe a frase. Fora da folha: [].
 */
export function avisosDaLista(ctx: Pick<ContextoAnaliseVG, 'contas'>, g: Pick<GavetaVG, 'folha' | 'lista' | 'janela'> | null): string[] {
  if (!g?.folha) return [];
  const a: string[] = [];
  if ((ctx.contas?.length ?? 0) > 1) a.push(AVISOS_DA_LISTA.contas);
  if ((g.lista?.vencidos_fora ?? 0) > 0) a.push(AVISOS_DA_LISTA.vencidos);
  if ((g.lista?.transf_internas ?? 0) > 0) a.push(AVISOS_DA_LISTA.transferencias);
  const virada = g.janela ? avisoDaViradaDeAno(g.janela) : null;
  if (virada) a.push(virada);
  if ((g.lista?.faturas_cartao ?? 0) > 0) a.push(AVISOS_DA_LISTA.fatura);
  return a;
}
