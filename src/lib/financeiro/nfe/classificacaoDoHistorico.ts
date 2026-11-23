/**
 * NOTA-CONTA-MESMO-TIPO-01 (URGENTE NJ, Gabriel 23/11 11:57) — a conta que o "+ Da nota" sugere pelo HISTÓRICO do fornecedor.
 * A nota de compra é sempre "2-Saídas": a sugestão só vem de lançamentos do MESMO tipo (o fornecedor que também COMPRA de nós — o João
 * Rodrigo compra gado do NJ — não empresta a "Venda de Fêmeas" à compra de milho). Entre os do mesmo tipo, a conta MAIS USADA nos 12
 * meses até o último lançamento; empate = a mais recente. Puro: quem lê do banco é `ultimaClassificacaoDoFornecedor`.
 */
import type { UltimaClassificacao } from './proporLancamento';

/** Uma linha do histórico, já do mesmo tipo e na ordem do banco (competência mais nova primeiro). */
export type LinhaDoHistorico = UltimaClassificacao;

/** 'AAAA-MM-DD' de 12 meses antes. */
function dozeMesesAntes(data: string): string {
  const [a, m, d] = data.split('-').map(Number);
  return `${String(a - 1).padStart(4, '0')}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

export function classificacaoDoHistorico(linhas: readonly LinhaDoHistorico[]): UltimaClassificacao | null {
  if (linhas.length === 0) return null;
  const desde = dozeMesesAntes(linhas[0].data);
  const contagem = new Map<string, { n: number; primeira: LinhaDoHistorico }>();
  for (const l of linhas) {
    if (l.data < desde) continue;
    const x = contagem.get(l.plano_conta_id);
    if (x) x.n += 1; else contagem.set(l.plano_conta_id, { n: 1, primeira: l });
  }
  let melhor: { n: number; primeira: LinhaDoHistorico } | null = null;
  /* o Map guarda a ordem de chegada (a mais recente primeiro): só troca com MAIS usos, então o empate fica com a mais recente */
  for (const x of contagem.values()) if (!melhor || x.n > melhor.n) melhor = x;
  return melhor ? melhor.primeira : null;
}
