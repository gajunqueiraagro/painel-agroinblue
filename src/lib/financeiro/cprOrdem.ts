/**
 * CPR-LAYOUT-03 (mock aprovado pelo Gabriel em 15/11 11:25; entrega pedida em 23/11 20:16) — as regras PURAS da lista da Contas a
 * Pagar e Receber que a tela desenha:
 *   - TODA coluna ordena (clique no cabeçalho); o PADRÃO é o vencimento crescente, dentro de qualquer grupo (dia, vencidos, sem
 *     vencimento). O empate fica na ordem do dono (`ordenarDoDiaCpr`: entradas, depois saídas, do maior ao menor) — estável;
 *   - o SALDO EM TODA LINHA: corre dentro do grupo, na ordem desenhada, e FECHA no saldo do grupo (a linha "Saldo em …"), que é do
 *     dono da série. Conta de trás para a frente a partir dele: a última linha que soma termina exatamente no saldo do dia;
 *   - a NF só com o número ("9.232", nunca "NF 000.009.232").
 */

export type ColunaCpr = 'comp' | 'venc' | 'descricao' | 'fornecedor' | 'subcentro' | 'nf' | 'status' | 'valor' | 'aprovacao' | 'lancado';
export type SentidoCpr = 'asc' | 'desc';
export interface OrdemCpr { coluna: ColunaCpr; sentido: SentidoCpr }

/** A ordem com que a lista abre (e volta): vencimento crescente. */
export const ORDEM_PADRAO_CPR: OrdemCpr = { coluna: 'venc', sentido: 'asc' };

/** Os rótulos do cabeçalho, na ordem das colunas. */
export const ROTULO_DA_COLUNA_CPR: Readonly<Record<ColunaCpr, string>> = {
  comp: 'Comp.', venc: 'Venc.', descricao: 'Descrição', fornecedor: 'Fornecedor', subcentro: 'Subcentro', nf: 'NF', status: 'Status', valor: 'Valor',
  /* BPO-FUNCIONAR-01 — só com a aprovação ligada */
  aprovacao: 'Aprovação', lancado: 'Lançado por',
};

/** Clicar numa coluna: a mesma inverte o sentido; outra começa crescente (o Valor começa do maior). */
export function proximaOrdemCpr(atual: OrdemCpr, coluna: ColunaCpr): OrdemCpr {
  if (atual.coluna === coluna) return { coluna, sentido: atual.sentido === 'asc' ? 'desc' : 'asc' };
  return { coluna, sentido: coluna === 'valor' ? 'desc' : 'asc' };
}

/** O que cada coluna compara, por linha. Texto vazio e data ausente vão SEMPRE para o fim, em qualquer sentido. */
export interface ChavesDaLinhaCpr {
  comp: string | null; venc: string | null; descricao: string; fornecedor: string; subcentro: string; nf: string; status: string;
  /** o valor COM SINAL do lado (+ a receber, − a pagar) */
  valor: number;
  /** BPO-FUNCIONAR-01 — o texto do chip e o nome de quem lançou (ausentes sem a aprovação ligada: vazio vai para o fim) */
  aprovacao?: string; lancado?: string;
}

const COLADOR = new Intl.Collator('pt-BR', { sensitivity: 'base', numeric: true });

/**
 * Ordena as linhas de UM grupo pela coluna escolhida. `linhas` chega na ordem do dono (o desempate) e não é mexida: devolve uma cópia.
 * Vazio ('' / null) nunca vem antes de um valor, nos dois sentidos — a lista não abre com "—".
 */
export function ordenarLinhasCpr<T>(linhas: readonly T[], ordem: OrdemCpr, chaves: (l: T) => ChavesDaLinhaCpr): T[] {
  const sinal = ordem.sentido === 'asc' ? 1 : -1;
  const comChave = linhas.map((l, i) => ({ l, i, k: chaves(l) }));
  comChave.sort((a, b) => {
    const va = a.k[ordem.coluna];
    const vb = b.k[ordem.coluna];
    const vazioA = va == null || va === '';
    const vazioB = vb == null || vb === '';
    if (vazioA !== vazioB) return vazioA ? 1 : -1;
    if (!vazioA && !vazioB) {
      const c = typeof va === 'number' && typeof vb === 'number' ? va - vb : COLADOR.compare(String(va), String(vb));
      if (c !== 0) return c * sinal;
    }
    return a.i - b.i;
  });
  return comChave.map((x) => x.l);
}

/**
 * O SALDO DE CADA LINHA do grupo, na ordem desenhada. `efeito(l)` = quanto a linha mexe no saldo (+ a receber, − a pagar; 0 = não
 * soma: paga, ponta fora do caixa). Parte do saldo do grupo e anda para trás: a linha k mostra o saldo DEPOIS dela. Sem saldo do grupo
 * (null/undefined), nenhuma linha tem saldo.
 */
export function saldoPorLinhaCpr<T>(linhas: readonly T[], saldoDoGrupo: number | null | undefined, efeito: (l: T) => number): (number | null)[] {
  if (saldoDoGrupo == null) return linhas.map(() => null);
  const saida: (number | null)[] = new Array(linhas.length).fill(null);
  let depois = saldoDoGrupo;
  for (let k = linhas.length - 1; k >= 0; k -= 1) {
    saida[k] = Math.round(depois * 100) / 100;
    depois -= efeito(linhas[k]);
  }
  return saida;
}

/** O saldo ANTES da primeira linha do grupo (o que a linha "vencidos" e a primeira linha partem). */
export function saldoAntesDoGrupoCpr<T>(linhas: readonly T[], saldoDoGrupo: number | null | undefined, efeito: (l: T) => number): number | null {
  if (saldoDoGrupo == null) return null;
  return Math.round((saldoDoGrupo - linhas.reduce((s, l) => s + efeito(l), 0)) * 100) / 100;
}

/**
 * A NF SÓ COM O NÚMERO (ponto 8): "NF 000.009.232" → "9.232"; "NF 177472" → "177472". Outro documento (Rec., Bol., Comp., genérico)
 * fica como o dono escreveu. Vazio → ''.
 */
export function numeroCurtoDoDocCpr(rotulo: string): string {
  const r = (rotulo ?? '').trim();
  if (!r.startsWith('NF ')) return r;
  const n = r.slice(3).trim().replace(/^[0.]+(?=\d)/, '');
  return n || '0';
}

/** Um lado somado (o formato do dono do recorte). */
interface LadoDaFaixa { valor: number; contas: number }
/**
 * A FAIXA DOS VENCIDOS (pontos 2–3): SÓ num período que contém hoje — em mês futuro ela não aparece (só o que vence no mês); no período
 * encerrado eles vão no grupo "Saem hoje", depois do fim. Sem vencido, nenhuma faixa. Devolve quantos, quanto de cada lado e quantos não
 * apareceram no extrato já conciliado.
 */
export function faixaDosVencidosCpr<T>(o: {
  periodoDe: string; hoje: string; encerrado: boolean;
  contam: { pagar: LadoDaFaixa; receber: LadoDaFaixa; linhas: T[] };
  anteriores: { pagar: LadoDaFaixa; receber: LadoDaFaixa };
}): { contas: number; pagar: number; receber: number; foraDoExtrato: number; linhas: T[] } | null {
  if (o.periodoDe > o.hoje || o.encerrado) return null;
  const contas = o.contam.pagar.contas + o.contam.receber.contas;
  if (contas === 0) return null;
  return {
    contas, pagar: o.contam.pagar.valor, receber: o.contam.receber.valor,
    foraDoExtrato: o.anteriores.pagar.contas + o.anteriores.receber.contas, linhas: o.contam.linhas,
  };
}
