/**
 * O QUE A LISTA DO FINANCEIRO V2 LEVA NA IDA E VOLTA DA OC — OC-HOMOLOG-FIX-02.
 *
 * ⚠ O INSTANTANEO (`financeirov2_return_filters`) JA' LEVAVA OS FILTROS DO PAINEL, mas nao os tres
 * que o operador tambem ajusta ali: "Data por", "Mostrar sem caixa" e Cultura. Medido no NJ, Ago/2026,
 * Produto "Abate": com Competencia e o sem caixa ligado a lista tinha 3 lancamentos; Abrir OC -> Fechar
 * voltava com Financeira e sem a chave, e 2.
 * ⚠ SO' NO RETORNO DA OC. "Data por" e o sem caixa continuam NAO persistindo fora dele (FinanceiroV2Tab,
 * PR-FIN-GRADE-DATAS-03): a memoria geral da sessao (`filtrosPersistidos`) nao os conhece, e o restore
 * so' os aplica quando o que ele leu e' este instantaneo.
 */
import type { DimensaoDataFinanceiro } from '@/lib/financeiro/filtrosBaseV2';

export const CHAVE_RETORNO_OC = 'financeirov2_return_filters';

export interface ExtrasRetornoOC {
  dataPor: DimensaoDataFinanceiro;
  mostrarSemCaixa: boolean;
  culturaFiltro: string;
}

const DIMENSOES: readonly DimensaoDataFinanceiro[] = ['financeira', 'competencia', 'vencimento', 'pagamento'];

function ehDimensao(v: unknown): v is DimensaoDataFinanceiro {
  return DIMENSOES.some(d => d === v);
}

/**
 * Le' os tres campos de um instantaneo ja' parseado. Campo ausente ou de tipo errado fica de fora —
 * o storage e' de runtime, e um instantaneo gravado antes deste PR nao os tem.
 */
export function extrasDoRetornoOC(f: unknown): Partial<ExtrasRetornoOC> {
  if (!f || typeof f !== 'object' || Array.isArray(f)) return {};
  const extras: Partial<ExtrasRetornoOC> = {};
  const dataPor: unknown = Reflect.get(f, 'dataPor');
  const mostrarSemCaixa: unknown = Reflect.get(f, 'mostrarSemCaixa');
  const culturaFiltro: unknown = Reflect.get(f, 'culturaFiltro');
  if (ehDimensao(dataPor)) extras.dataPor = dataPor;
  if (typeof mostrarSemCaixa === 'boolean') extras.mostrarSemCaixa = mostrarSemCaixa;
  if (typeof culturaFiltro === 'string') extras.culturaFiltro = culturaFiltro;
  return extras;
}
