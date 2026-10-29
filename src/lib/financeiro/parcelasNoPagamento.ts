/**
 * AS PARCELAS DA COMPRA NA ABA PAGAMENTO — P143 PAGAMENTO-PARCELAS-01 (Gabriel 27/10; mock aprovado ~/Downloads/mock-pagamento-parcelas-v1.html;
 * D1–D4 de 28/10; pedido de 29/10 11:35). PURO: as linhas da tabela (Parc. · Venc. · Pgto. · Valor · Status · Conta) de DUAS fontes,
 * e nada de dinheiro somado na tela.
 *   PARCELAMENTO (com `financiamento_id`): as parcelas e os totais da `fn_financiamento_situacao` (`SituacaoDoContrato`) — a MESMA fonte da
 *     tela Parcelamentos e Financiamentos; a situacao e' a que o banco deu.
 *   SOLTAS (sem `financiamento_id`, "k/N" na descricao, P104): as irmas pela regra do P95 (`buscarIrmasSoltas`); a situacao e' a MESMA regra
 *     da tela do contrato lida do lancamento (realizado/conciliado = paga; senao, vencimento antes de hoje = vencida; senao a vencer) e NAO
 *     ha' linha de totais (nao ha' contrato no banco que os de).
 */
import type { CartoesDoContrato, SituacaoDaParcela, SituacaoDoContrato } from '@/lib/financiamentos/situacaoDoContrato';
import { fracaoDaDescricao } from '@/lib/financeiro/nfe/jaLancada';

export interface LinhaDaParcela {
  lancamentoId: string | null;
  numero: number;
  total: number;
  vencimento: string | null;
  pagamento: string | null;
  valorCent: number;
  situacao: SituacaoDaParcela;
  conta: string | null;
}

export interface TotaisDaCompra { qtd: number; totalCent: number; pagasQtd: number; pagasCent: number; aPagarQtd: number; aPagarCent: number }

const cent = (v: number) => Math.round(v * 100);

/** As linhas do parcelamento, na ordem do numero. */
export function linhasDoContrato(s: SituacaoDoContrato): LinhaDaParcela[] {
  const total = s.parcelas.length;
  return [...s.parcelas]
    .sort((a, b) => (a.numero ?? 0) - (b.numero ?? 0))
    .map((p, i) => ({
      lancamentoId: p.lancamentoId, numero: p.numero ?? i + 1, total, vencimento: p.dataVencimento, pagamento: p.pagoEm,
      valorCent: cent(p.valorTotal), situacao: p.situacao, conta: p.detalhe?.contaNome ?? null,
    }));
}

/** A linha de totais: do banco (`cartoes`), nunca somada da lista. O "a pagar" e' a divisao que o proprio banco da' do que falta
 *  (a vencer + vencido + adiado); a quantidade, as contagens do banco quando ele as manda. */
export function totaisDoContrato(c: CartoesDoContrato): TotaisDaCompra {
  const qtdDoBanco = c.detalhe ? c.detalhe.aVencerQtde + c.detalhe.vencidoQtde + c.adiadoQtde : null;
  return {
    qtd: c.parcelas, totalCent: cent(c.valorContrato), pagasQtd: c.pagas, pagasCent: cent(c.pago),
    aPagarQtd: qtdDoBanco ?? Math.max(0, c.parcelas - c.pagas), aPagarCent: cent(c.aVencer) + cent(c.vencido) + cent(c.adiado),
  };
}

/** A situacao de um lancamento solto, pela regra da tela do contrato. `hoje` = 'YYYY-MM-DD' (`hojeLocal()`). */
export function situacaoDoLancamento(status: string | null | undefined, vencimento: string | null | undefined, hoje: string): SituacaoDaParcela {
  if (status === 'realizado' || status === 'conciliado') return 'paga';
  return vencimento && vencimento < hoje ? 'vencida' : 'pendente';
}

export interface IrmaSolta {
  id: string; descricao: string | null; valorCent: number;
  vencimento?: string | null; pagamento?: string | null; status?: string | null; conta?: string | null;
}

/** As linhas das soltas: so' as da MESMA fracao N e com o valor a ate' `toleranciaCent` do da propria (a regra do P95/P104, a mesma do
 *  "achadas X de N": `achadasDaFracao`), uma por k (a primeira de cada k), na ordem do k. A propria entra sempre. */
export function linhasDasSoltas(propria: IrmaSolta, irmas: readonly IrmaSolta[], hoje: string, toleranciaCent: number): LinhaDaParcela[] {
  const f = fracaoDaDescricao(propria.descricao);
  if (!f) return [];
  const porK = new Map<number, IrmaSolta>([[f.k, propria]]);
  for (const x of irmas) {
    const g = fracaoDaDescricao(x.descricao);
    if (x.id === propria.id || !g || g.n !== f.n || porK.has(g.k) || Math.abs(x.valorCent - propria.valorCent) > toleranciaCent) continue;
    porK.set(g.k, x);
  }
  return [...porK].sort((a, b) => a[0] - b[0]).map(([k, x]) => ({
    lancamentoId: x.id, numero: k, total: f.n, vencimento: x.vencimento ?? null, pagamento: x.pagamento ?? null, valorCent: x.valorCent,
    situacao: situacaoDoLancamento(x.status, x.vencimento, hoje), conta: x.conta ?? null,
  }));
}

/** P143 (o caso "Parcela 3 - None" da NF 4964) — as irmãs PELA NOTA, quando a descrição não tem "k/N": a própria + as do mesmo
 *  fornecedor e da mesma nota (`buscarIrmasDaNota`), na ordem do vencimento (a da junção no banco; o empate vai pelo id); o
 *  número da parcela é a posição e N é quantas são. Sozinha (nenhuma irmã) = vazio: é à vista de verdade. PURO. */
export function linhasDaNota(propria: IrmaSolta, irmas: readonly IrmaSolta[], hoje: string): LinhaDaParcela[] {
  const todas = [propria, ...irmas.filter((x) => x.id !== propria.id)];
  if (todas.length < 2) return [];
  const ordem = [...todas].sort((a, b) => (a.vencimento ?? '9999').localeCompare(b.vencimento ?? '9999') || a.id.localeCompare(b.id));
  return ordem.map((x, i) => ({
    lancamentoId: x.id, numero: i + 1, total: ordem.length, vencimento: x.vencimento ?? null, pagamento: x.pagamento ?? null, valorCent: x.valorCent,
    situacao: situacaoDoLancamento(x.status, x.vencimento, hoje), conta: x.conta ?? null,
  }));
}

/** Juntar so' com as N fracoes achadas (cada k uma vez, de 1 a N): os ids na ordem do k. Faltou alguma = nulo. */
export function idsParaJuntar(linhas: readonly LinhaDaParcela[]): string[] | null {
  if (!linhas.length) return null;
  const n = linhas[0].total;
  if (linhas.length !== n || linhas.some((l, i) => l.numero !== i + 1 || !l.lancamentoId)) return null;
  return linhas.map((l) => l.lancamentoId ?? '');
}
