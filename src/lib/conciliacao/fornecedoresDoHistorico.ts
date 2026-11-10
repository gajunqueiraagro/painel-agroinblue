/**
 * CONC-SUGESTOES-FONTE-01 item 4 (Gabriel 08/11/2026, opção B: "regra única no banco") — o FORNECEDOR QUE O HISTÓRICO CONHECE para o
 * texto de cada movimento sem par do mês, para o motor das sugestões pôr esse fornecedor primeiro e o "só texto parecido" no fim.
 *
 * ⚠ A REGRA É DO BANCO: `fn_conciliacao_fornecedores_do_historico` devolve, por termo, o `resumo` da PRÓPRIA busca do "Procurar no
 *   histórico" (a faixa "Costuma ser…"), com a MESMA janela que o modal abre (1º/jan do ano · fim do mês seguinte). Aqui só se monta o
 *   pedido (o termo é o `nomeDoHistorico`, o mesmo do campo do modal) e se lê a resposta.
 * ⚠ EM LOTES: ~120 ms por termo no banco (medido 08/11, BB out/26: 40 termos = 5,5 s numa chamada) — os lotes vão juntos.
 */
import { nomeDoHistorico } from './nomeDoHistorico';
import { fimDoMesSeguinte } from './procurarNoHistorico';

export const TERMOS_POR_LOTE = 8;

export interface MovimentoDoHistorico { historico: string | null; data: string | null }

/** Os termos distintos dos movimentos (o `nomeDoHistorico` aparado, 2+ letras), na ordem em que aparecem. */
export function termosDosMovimentos(movs: readonly MovimentoDoHistorico[]): string[] {
  const vistos = new Set<string>();
  for (const m of movs) {
    const t = nomeDoHistorico(m.historico, m.data).trim();
    if (t.length >= 2) vistos.add(t);
  }
  return [...vistos];
}

export function emLotes<T>(itens: readonly T[], tamanho = TERMOS_POR_LOTE): T[][] {
  const lotes: T[][] = [];
  for (let i = 0; i < itens.length; i += tamanho) lotes.push(itens.slice(i, i + tamanho));
  return lotes;
}

/** A janela da busca: a mesma do modal ao abrir (`ProcurarNoHistorico`: `${ano}-01-01` · `fimDoMesSeguinte`). */
export function janelaDoMes(anoMes: string): { de: string; ate: string | null } {
  return { de: `${anoMes.slice(0, 4)}-01-01`, ate: fimDoMesSeguinte(`${anoMes}-01`) };
}

/** Lê a resposta `{ termo: { fornecedor_id, … } }`: só o que tem `fornecedor_id` em texto entra. */
export function lerFornecedoresDoHistorico(data: unknown): Map<string, string> {
  const m = new Map<string, string>();
  if (!data || typeof data !== 'object' || Array.isArray(data)) return m;
  for (const [termo, r] of Object.entries(data)) {
    if (!r || typeof r !== 'object' || Array.isArray(r)) continue;
    const id: unknown = Reflect.get(r, 'fornecedor_id');
    if (typeof id === 'string' && id) m.set(termo, id);
  }
  return m;
}

/** O fornecedor do histórico de UM movimento, pelo mesmo termo que foi pedido. */
export function fornecedorDoMovimento(mapa: ReadonlyMap<string, string>, mov: MovimentoDoHistorico): string | null {
  return mapa.get(nomeDoHistorico(mov.historico, mov.data).trim()) ?? null;
}
