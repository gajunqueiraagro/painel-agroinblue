/**
 * OC-LISTA-FINANC-CC-01 (Gabriel, 14/10/2026) — a Central de OCs le' a OC EM CONTA CORRENTE pelo MESMO dono da aba Financeiro.
 *
 * A lista lia Financeiro e Pagto das views do modelo TITULO, que nao olham `modelo_financeiro`: o abate da Vera quitado
 * (2d39d7e9) dizia "S/ lanc." / "Parcial". Agora UMA FONTE POR MODELO: titulo segue nas views (nada muda); conta corrente le'
 * `oc_conta_corrente_lote` (o topo do envelope de `oc_conta_corrente`, sem linhas) e escreve com os donos de sempre
 * (`saldoNaTela`, `liquidoNaTela`, `corDoSaldoNaTela`). Este arquivo NAO SOMA NADA: so' le e escolhe o rotulo.
 */
import {
  lerContaCorrente, liquidoNaTela, saldoNaTela, corDoSaldoNaTela, sinalDaFazenda,
  type ContaCorrente, type LadoContaCorrente,
} from '@/lib/oc/contaCorrente';
import type { LiquidacaoPeloLado } from '@/lib/oc/estadoPeloLado';

/** OC-LISTA-FINANC-CC-01b — uma despesa da OC como o dono a devolve (valor no sinal dele: entrada +, saida −). */
export interface DespesaDoDono { descricao: string; favorecido: string | null; valor: number; status: string; vencimento: string | null }
/** Um recebimento/pagamento programado do dono; `valor` no sinal do BANCO (a tela aplica o lado: `programadosNaTela`). */
export interface ProgramadoDoDono { data: string; valor: number }

export interface ResumoListaOC {
  modelo: 'conta_corrente' | 'titulo';
  /** O topo do envelope do dono; nulo no modelo titulo. */
  cc: ContaCorrente | null;
  docsOperacao: number;
  docsFinanceiro: number;
  /** 01b — o bloco `despesas` do dono, enxuto; [] no modelo titulo. */
  despesas: DespesaDoDono[];
  /** 01b — as linhas de recebimento programado do dono; [] no modelo titulo. */
  programados: ProgramadoDoDono[];
}

const obj = (v: unknown): Record<string, unknown> => (v && typeof v === 'object' ? (v as Record<string, unknown>) : {});
const inteiro = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) ? Math.max(0, Math.trunc(v)) : 0);
const numero = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);
const textoOuNulo = (v: unknown): string | null => (typeof v === 'string' && v !== '' ? v : null);
/* Item torto sai da lista (nunca vira zero inventado). */
function lerDespesas(v: unknown): DespesaDoDono[] {
  return (Array.isArray(v) ? v : []).flatMap(x => {
    const d = obj(x); const valor = numero(d.valor);
    if (valor == null) return [];
    return [{ descricao: textoOuNulo(d.descricao) ?? '—', favorecido: textoOuNulo(d.favorecido), valor,
      status: textoOuNulo(d.status) ?? '', vencimento: textoOuNulo(d.vencimento) }];
  });
}
function lerProgramados(v: unknown): ProgramadoDoDono[] {
  return (Array.isArray(v) ? v : []).flatMap(x => {
    const p = obj(x); const valor = numero(p.valor); const data = textoOuNulo(p.data);
    return valor == null || !data ? [] : [{ data, valor }];
  });
}

/** Le o retorno de `oc_conta_corrente_lote`. Peca torta = a OC fica fora (a linha cai no modelo titulo), nunca numero inventado. */
export function lerLoteContaCorrente(raw: unknown): Record<string, ResumoListaOC> {
  const out: Record<string, ResumoListaOC> = {};
  for (const [id, v] of Object.entries(obj(raw))) {
    const r = obj(v);
    const modelo = r.modelo === 'conta_corrente' ? 'conta_corrente' : 'titulo';
    const cc = modelo === 'conta_corrente' ? lerContaCorrente(r.envelope) : null;
    if (modelo === 'conta_corrente' && !cc) continue;
    out[id] = {
      modelo, cc, docsOperacao: inteiro(r.docs_operacao), docsFinanceiro: inteiro(r.docs_financeiro),
      despesas: modelo === 'conta_corrente' ? lerDespesas(r.despesas) : [],
      programados: modelo === 'conta_corrente' ? lerProgramados(r.programados) : [],
    };
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
 * OC-LISTA-FINANC-CC-01c — A REGRA UNICA DO NUMERO DA COLUNA FINANCEIRO, para os dois modelos: o numero aparece so' quando ha'
 * falta a receber / pagar; quitada = sem numero. A FONTE de cada modelo nao muda (conta corrente: o saldo do dono; titulo: o
 * liquido da obrigacao, das views) — este helper decide so' se ele aparece. Zero ao centavo tambem nao aparece.
 */
export function numeroDoFinanceiro(valor: number | null | undefined, quitado: boolean): number | null {
  if (quitado || valor == null || !Number.isFinite(valor) || centavos(valor) === 0) return null;
  return valor;
}

/**
 * A coluna FINANCEIRO da linha em conta corrente: o SALDO do dono (nao o liquido, que ja' esta' na coluna Valor) e a pilula pela
 * situacao do dono. OC-LISTA-FINANC-CC-01c: pilulas POR EXTENSO numa pilula de 52px (medido a 8px no Chromium com a Inter:
 * "Programado" 46,9 e "Aguardando" 47,0 sao as maiores).
 */
export function financeiroDaLinhaCC(cc: ContaCorrente, lado: LadoContaCorrente): FinanceiroDaLinhaCC {
  const saldo = saldoNaTela(cc, lado);
  const valor = numeroDoFinanceiro(saldo, cc.situacao === 'quitado');
  if (cc.situacao === 'quitado') return { valor: null, pilula: 'Liquidado', titulo: 'Liquidado', tom: 'sucesso' };
  if (cc.situacao === 'aguardando_saida') return { valor, pilula: 'Aguardando', titulo: 'Aguardando a saída do gado', tom: 'neutro' };
  if (corDoSaldoNaTela(saldo) === 'adiantado') return { valor, pilula: 'Adiantado', titulo: 'Adiantado', tom: 'atencao_forte' };
  if (centavos(cc.programado) > 0) return { valor, pilula: 'Programado', titulo: 'Programado', tom: 'neutro' };
  const falta = lado === 'compra' ? 'A pagar' : 'A receber';
  return { valor, pilula: falta, titulo: falta, tom: 'atencao' };
}

/** O `title` do clipe; zero documentos = nulo (sem icone, o lugar fica reservado). */
export function fraseDosDocumentos(n: number, onde: 'operacao' | 'financeiro'): string | null {
  if (!(n > 0)) return null;
  const nome = n === 1 ? 'documento' : 'documentos';
  return onde === 'operacao' ? `${n} ${nome} da operação` : `${n} ${nome} no financeiro`;
}

/* ---------------------------------------------------------------------------------------------------------------------------
 * OC-LISTA-FINANC-CC-01b — as despesas e os programados do dono, para o ponto ambar e o Resumo / PDF / Excel.
 * ⚠ "Em aberto" = status do lancamento FORA de realizado / conciliado (o status que o dono devolve). O modelo titulo NAO passa por
 *   aqui: la' o ponto e o Resumo seguem a view, so' com o total (decisao do Gabriel: sem segunda regua).
 * ------------------------------------------------------------------------------------------------------------------------- */
const PAGO = new Set(['realizado', 'conciliado']);
/** As despesas do dono ainda em aberto. */
export function despesasEmAbertoCC(r: ResumoListaOC): DespesaDoDono[] {
  return r.despesas.filter(d => !PAGO.has(d.status));
}
/** Soma em CENTAVOS do modulo de uma lista de valores (o Resumo mostra Despesas em modulo, como no modelo titulo). */
const somaModulo = (vs: readonly number[]) => vs.reduce((a, v) => a + Math.abs(Math.round(v * 100)), 0) / 100;
/** O TOTAL das despesas do dono (modulo) — a coluna Despesas do Resumo. Sem despesa: nulo (traco), como no titulo. */
export function totalDespesasCC(r: ResumoListaOC): number | null {
  return r.despesas.length === 0 ? null : somaModulo(r.despesas.map(d => d.valor));
}
/** O total das em aberto (modulo) — o que acende o ponto ambar. */
export function totalDespesasEmAbertoCC(r: ResumoListaOC): number {
  return somaModulo(despesasEmAbertoCC(r).map(d => d.valor));
}
const brl = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
/** O `title` do ponto ambar: "descrição · favorecido — R$ valor", uma por linha; nulo sem despesa em aberto. */
export function tituloDasDespesasEmAberto(r: ResumoListaOC): string | null {
  const ds = despesasEmAbertoCC(r);
  if (ds.length === 0) return null;
  return ds.map(d => `${d.descricao}${d.favorecido ? ` · ${d.favorecido}` : ''} — ${brl(Math.abs(d.valor))}`).join('\n');
}
/** Os programados no lado da fazenda (positivo = o que se espera receber / pagar), pelo fator do dono. */
export function programadosNaTela(r: ResumoListaOC, lado: LadoContaCorrente): ProgramadoDoDono[] {
  const f = sinalDaFazenda(lado).dinheiro;
  return r.programados.map(p => ({ data: p.data, valor: p.valor === 0 ? 0 : f * p.valor }));
}

/** A linha do Resumo da OC em conta corrente: Valor = liquido, Pago = recebido, Falta = max(0, saldo), Despesas = o total do dono,
 *  e o estado efetivo (o mesmo do Pagto da lista). Nenhuma soma alem do total das despesas do dono. */
export function linhaDoResumoCC(r: ResumoListaOC, lado: LadoContaCorrente): {
  valor: number; pago: number; falta: number; despesas: number | null; estado: string | null;
} | null {
  if (!r.cc) return null;
  const saldo = saldoNaTela(r.cc, lado);
  return {
    valor: liquidoNaTela(r.cc, lado),
    pago: r.cc.recebido,
    falta: Math.max(0, saldo),
    despesas: totalDespesasCC(r),
    estado: pagtoDaLinhaCC(r.cc, lado, null).estado_liquidacao,
  };
}

/** OC-ABRIR-LENTO-01 — a frase da falha do resumo do conta corrente da Central (o erro do banco nunca vai cru a' tela). */
export const FRASE_RESUMO_CC_INDISPONIVEL = 'Não foi possível carregar o resumo do conta corrente agora. Tente de novo.';
