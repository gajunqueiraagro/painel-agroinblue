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
import { chaveDoCliente } from '@/lib/financeiro/filtrosPersistidos';

export const CHAVE_RETORNO_OC = 'financeirov2_return_filters';
/** P94 — o instantaneo da OC tambem e' do cliente: abrir a OC no NJ e voltar no Agnaldo nao traz o recorte do NJ. */
export const chaveRetornoOC = (clienteId: string) => chaveDoCliente(CHAVE_RETORNO_OC, clienteId);

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

const ROTULO_DA_DIMENSAO: Record<DimensaoDataFinanceiro, string> = {
  financeira: 'Financeira', competencia: 'Competência', vencimento: 'Vencimento', pagamento: 'Pagamento',
};

export interface ChipDaOC { campo: 'dataPor' | 'semCaixa'; texto: string }

/**
 * P94 — O QUE VEIO DA OC E MUDA O RECORTE FICA A' VISTA, como chip na faixa dos totais ("Vindo da OC: Data por = Competência ✕"):
 * so' o que difere do padrao (Financeira; sem caixa oculto) e so' enquanto a tela ainda esta' no valor que a OC trouxe — o operador
 * que troca na barra ja' decidiu, e o chip sai.
 */
export function chipsVindosDaOC(
  vindo: Partial<Pick<ExtrasRetornoOC, 'dataPor' | 'mostrarSemCaixa'>>,
  atual: { dataPor: DimensaoDataFinanceiro; mostrarSemCaixa: boolean },
): ChipDaOC[] {
  const chips: ChipDaOC[] = [];
  if (vindo.dataPor && vindo.dataPor !== 'financeira' && atual.dataPor === vindo.dataPor) {
    chips.push({ campo: 'dataPor', texto: `Vindo da OC: Data por = ${ROTULO_DA_DIMENSAO[vindo.dataPor]}` });
  }
  if (vindo.mostrarSemCaixa === true && atual.mostrarSemCaixa) chips.push({ campo: 'semCaixa', texto: 'Vindo da OC: Sem caixa = Mostrar' });
  return chips;
}
