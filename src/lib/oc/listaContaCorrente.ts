/**
 * OC-LISTA-FINANC-CC-01 (Gabriel, 14/10/2026) — a Central de OCs le' a OC EM CONTA CORRENTE pelo MESMO dono da aba Financeiro.
 *
 * A lista lia Financeiro e Pagto das views do modelo TITULO, que nao olham `modelo_financeiro`: o abate da Vera quitado
 * (2d39d7e9) dizia "S/ lanc." / "Parcial". Agora UMA FONTE POR MODELO: titulo segue nas views (nada muda); conta corrente le'
 * `oc_conta_corrente_lote` (o topo do envelope de `oc_conta_corrente`, sem linhas) e escreve com os donos de sempre
 * (`saldoNaTela`, `liquidoNaTela`, `corDoSaldoNaTela`). Este arquivo NAO SOMA NADA: so' le e escolhe o rotulo.
 */
import {
  lerContaCorrente, liquidoNaTela, saldoNaTela, corDoSaldoNaTela,
  type ContaCorrente, type LadoContaCorrente,
} from '@/lib/oc/contaCorrente';
import type { LiquidacaoPeloLado } from '@/lib/oc/estadoPeloLado';

export interface ResumoListaOC {
  modelo: 'conta_corrente' | 'titulo';
  /** O topo do envelope do dono; nulo no modelo titulo. */
  cc: ContaCorrente | null;
  docsOperacao: number;
  docsFinanceiro: number;
}

const obj = (v: unknown): Record<string, unknown> => (v && typeof v === 'object' ? (v as Record<string, unknown>) : {});
const inteiro = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) ? Math.max(0, Math.trunc(v)) : 0);

/** Le o retorno de `oc_conta_corrente_lote`. Peca torta = a OC fica fora (a linha cai no modelo titulo), nunca numero inventado. */
export function lerLoteContaCorrente(raw: unknown): Record<string, ResumoListaOC> {
  const out: Record<string, ResumoListaOC> = {};
  for (const [id, v] of Object.entries(obj(raw))) {
    const r = obj(v);
    const modelo = r.modelo === 'conta_corrente' ? 'conta_corrente' : 'titulo';
    const cc = modelo === 'conta_corrente' ? lerContaCorrente(r.envelope) : null;
    if (modelo === 'conta_corrente' && !cc) continue;
    out[id] = { modelo, cc, docsOperacao: inteiro(r.docs_operacao), docsFinanceiro: inteiro(r.docs_financeiro) };
  }
  return out;
}

/** O lado do conta corrente pelo tipo da OC; tipo desconhecido = nulo (a linha fica no modelo titulo). */
export function ladoDaOC(tipo: string | null | undefined): LadoContaCorrente | null {
  return tipo === 'venda' || tipo === 'abate' || tipo === 'compra' ? tipo : null;
}

const centavos = (v: number) => Math.round(v * 100);

/**
 * O PAGTO da linha em conta corrente, no vocabulario da view (`estado_liquidacao`), para a celula, o filtro e a ordenacao
 * lerem UMA coisa: quitado -> 'quitada'; adiantado -> 'excedente'; recebido > 0 e falta > 0 -> 'parcial'; nada recebido ->
 * 'nao_liquidada' ("aguardando"). `base` = o liquido do dono e `total_liquidado_valido` = o recebido, para o % do `title`.
 * As despesas pendentes seguem vindo da view (o ponto ambar).
 */
export function pagtoDaLinhaCC(cc: ContaCorrente, lado: LadoContaCorrente, despesasPendentes: number | null | undefined): LiquidacaoPeloLado {
  const saldo = saldoNaTela(cc, lado);
  const estado = cc.situacao === 'quitado' ? 'quitada'
    : corDoSaldoNaTela(saldo) === 'adiantado' ? 'excedente'
    : centavos(cc.recebido) > 0 && centavos(saldo) > 0 ? 'parcial'
    : centavos(cc.recebido) > 0 && centavos(saldo) === 0 ? 'quitada'
    : 'nao_liquidada';
  return { estado_liquidacao: estado, base: liquidoNaTela(cc, lado), total_liquidado_valido: cc.recebido, despesas_pendentes: despesasPendentes ?? null };
}

export type TomFinanceiroCC = 'sucesso' | 'neutro' | 'atencao' | 'atencao_forte';
export interface FinanceiroDaLinhaCC {
  /** O que falta receber/pagar no sinal da fazenda (`saldoNaTela`); nulo quando quitado (a celula fica sem numero). */
  valor: number | null;
  pilula: string;
  titulo: string;
  tom: TomFinanceiroCC;
}

/**
 * A coluna FINANCEIRO da linha em conta corrente: o SALDO do dono (nao o liquido, que ja' esta' na coluna Valor) e a pilula pela
 * situacao do dono. Pilula de 44px: "Liquidado" e "A receber" cabem por extenso (medido: 37,6 e 37,5px a 8px); "Progr." e
 * "Aguard." curtos, com a palavra inteira no `title` ("Programado" e "Aguardando" pedem 46,9 e 47,0px).
 */
export function financeiroDaLinhaCC(cc: ContaCorrente, lado: LadoContaCorrente): FinanceiroDaLinhaCC {
  const saldo = saldoNaTela(cc, lado);
  const valor = centavos(saldo) === 0 ? null : saldo;
  if (cc.situacao === 'quitado') return { valor: null, pilula: 'Liquidado', titulo: 'Liquidado', tom: 'sucesso' };
  if (cc.situacao === 'aguardando_saida') return { valor, pilula: 'Aguard.', titulo: 'Aguardando a saída do gado', tom: 'neutro' };
  if (corDoSaldoNaTela(saldo) === 'adiantado') return { valor, pilula: 'Adiantado', titulo: 'Adiantado', tom: 'atencao_forte' };
  if (centavos(cc.programado) > 0) return { valor, pilula: 'Progr.', titulo: 'Programado', tom: 'neutro' };
  const falta = lado === 'compra' ? 'A pagar' : 'A receber';
  return { valor, pilula: falta, titulo: falta, tom: 'atencao' };
}

/** O `title` do clipe; zero documentos = nulo (sem icone, o lugar fica reservado). */
export function fraseDosDocumentos(n: number, onde: 'operacao' | 'financeiro'): string | null {
  if (!(n > 0)) return null;
  const nome = n === 1 ? 'documento' : 'documentos';
  return onde === 'operacao' ? `${n} ${nome} da operação` : `${n} ${nome} no financeiro`;
}
