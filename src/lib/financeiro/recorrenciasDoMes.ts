/**
 * O MÊS DAS RECORRÊNCIAS — REC-VALOR-CERTO-01 (Gabriel, 06/10/2026).
 *
 * A tela de Recorrências passou a responder "quanto é o recorrente DESTE MÊS, e quanto dele eu já sei?". Este arquivo é o
 * DONO, puro, dessa resposta: a linha de cada recorrência no mês, o resumo (os cartões e a barra), o filtro e o total da
 * lista. A TELA NÃO SOMA.
 *
 * ⚠ VOCABULÁRIO APROVADO, E SÓ ELE: "Valor certo" e "A confirmar". As outras duas palavras que a ideia sugere são do DRE
 *   (os dois blocos de custo) e estão PROIBIDAS em rótulo, coluna, nome de campo e comentário — preso por teste de fonte.
 * ⚠ TRÊS FONTES, UMA POR PERGUNTA:
 *   · o TIPO do valor e a marca de FOLHA são da REGRA (`financeiro_recorrencias.tipo_valor` 'exato' | 'estimado', `folha`);
 *   · o VALOR DO MÊS é do lançamento da ocorrência (o valor base só vale enquanto a ocorrência não foi gerada);
 *   · "CONFIRMADO" é a marca GRAVADA do valor do mês (`valor_do_mes_em`) ou a conta já realizada — nunca comparação de valores.
 * ⚠ O MÊS É O DO VENCIMENTO, e a régua do vencimento é a de sempre (`vencimentoPrevisto`, espelho de `_fn_recorrencia_vencimento`).
 * ⚠ CENTAVOS INTEIROS, sem arredondar no meio: certo + confirmado + estimado = total, ao centavo.
 * ⚠ ENTRADA NÃO SE MISTURA COM SAÍDA: o resumo é o das SAÍDAS; a recorrência de receita vai em `entradas`, à parte.
 */
import { vencimentoPrevisto } from './valorDoMes';

export type TipoDoValor = 'certo' | 'a_confirmar';
export type SituacaoDoMes = 'certo' | 'confirmado' | 'estimado';

/** O que o dono precisa da REGRA. */
export interface RegraDoMes {
  id: string;
  /** Com o sinal: negativo = saída, positivo = entrada. */
  valorBase: number;
  /** `tipo_valor = 'estimado'` no banco. */
  valorAConfirmar: boolean;
  folha: boolean;
  ativo: boolean;
  diaVencimento: number;
  dataInicio: string;
  primeiroVencimento: string;
  dataFim: string;
  /** A marca d'água do Gerar (a última competência gerada), ou nulo se nunca gerou. */
  ultimoLancamentoGerado: string | null;
}

/** O que o dono precisa de cada ocorrência VIVA (lançamento com `recorrencia_id`, não cancelado). */
export interface OcorrenciaDoMes {
  recorrenciaId: string;
  valor: number;
  dataVencimento: string | null;
  status: string | null;
  valorDoMesEm: string | null;
}

export interface LinhaDoMes {
  regraId: string;
  tipo: TipoDoValor;
  folha: boolean;
  entrada: boolean;
  /** |valor_base|, em centavos. */
  previsto: number;
  /** O valor do mês, em centavos: a(s) ocorrência(s) viva(s); sem ocorrência gerada, o valor base. */
  valor: number;
  situacao: SituacaoDoMes;
  /** Quantas ocorrências vivas a regra tem no mês (0 = ainda não gerada: vale o valor base). */
  ocorrencias: number;
}

export interface Fatia { valor: number; qtd: number }
export interface ResumoDoMes {
  total: Fatia; certo: Fatia; confirmado: Fatia; estimado: Fatia;
  /** SUBCONJUNTO do total, não uma quarta fatia. */
  folha: Fatia;
  /** As recorrências de receita do mês — fora do total. */
  entradas: Fatia;
}

const centavos = (v: number): number => Math.round(Math.abs(Number(v) || 0) * 100);
const mesDe = (iso: string | null | undefined): string => (iso ? iso.slice(0, 7) : '');
const STATUS_PAGO: readonly string[] = ['realizado', 'conciliado'];

/**
 * A competência cuja conta VENCE no mês pedido, ou nulo quando a regra não tem competência que vença nele.
 * O deslocamento é o das âncoras (meses entre `data_inicio` e `primeiro_vencimento`); quem diz o vencimento é o dono
 * (`vencimentoPrevisto`), e aqui só se confere que ele cai no mês.
 */
export function competenciaQueVenceNoMes(regra: Pick<RegraDoMes, 'diaVencimento' | 'dataInicio' | 'primeiroVencimento' | 'dataFim'>, mes: string): string | null {
  const [ai, mi] = regra.dataInicio.slice(0, 7).split('-').map(Number);
  const [av, mv] = regra.primeiroVencimento.slice(0, 7).split('-').map(Number);
  const desloc = (av - ai) * 12 + (mv - mi);
  const [am, mm] = mes.split('-').map(Number);
  const alvo = am * 12 + (mm - 1) - desloc;
  const comp = `${Math.floor(alvo / 12)}-${String((alvo % 12) + 1).padStart(2, '0')}-01`;
  if (mesDe(comp) < mesDe(regra.dataInicio) || mesDe(comp) > mesDe(regra.dataFim)) return null;
  const venc = vencimentoPrevisto(
    { dia_vencimento: regra.diaVencimento, data_inicio: regra.dataInicio, primeiro_vencimento: regra.primeiroVencimento }, comp);
  return mesDe(venc) === mes ? comp : null;
}

/** A pior situação vence: 'estimado' > 'confirmado'. */
const pior = (a: SituacaoDoMes, b: SituacaoDoMes): SituacaoDoMes => (a === 'estimado' || b === 'estimado' ? 'estimado' : a === 'confirmado' || b === 'confirmado' ? 'confirmado' : 'certo');

/**
 * A linha de cada recorrência NO MÊS (`mes` = 'AAAA-MM', o do vencimento).
 *   · com ocorrência viva vencendo no mês: entra, pelo valor dela (duas ocorrências: soma) — mesmo com a regra pausada, porque
 *     a conta existe;
 *   · sem ocorrência viva: entra pelo valor base SÓ se a regra está ativa, tem competência que vence no mês e essa
 *     competência AINDA NÃO FOI GERADA (está acima da marca d'água). Abaixo da marca e sem ocorrência viva, a conta daquele mês
 *     foi cancelada — e conta cancelada não é previsão;
 *   · fora disso, a recorrência não entra no mês.
 */
export function linhasDoMes(regras: readonly RegraDoMes[], ocorrencias: readonly OcorrenciaDoMes[], mes: string): LinhaDoMes[] {
  const porRegra = new Map<string, OcorrenciaDoMes[]>();
  for (const o of ocorrencias) {
    if (mesDe(o.dataVencimento) !== mes) continue;
    const lista = porRegra.get(o.recorrenciaId);
    if (lista) lista.push(o); else porRegra.set(o.recorrenciaId, [o]);
  }
  const linhas: LinhaDoMes[] = [];
  for (const r of regras) {
    const tipo: TipoDoValor = r.valorAConfirmar ? 'a_confirmar' : 'certo';
    const base = { regraId: r.id, tipo, folha: r.folha, entrada: r.valorBase > 0, previsto: centavos(r.valorBase) };
    const vivas = porRegra.get(r.id) ?? [];
    if (vivas.length > 0) {
      let valor = 0;
      let situacao: SituacaoDoMes = tipo === 'certo' ? 'certo' : 'confirmado';
      for (const o of vivas) {
        valor += centavos(o.valor);
        if (tipo === 'a_confirmar') {
          const confirmada = !!o.valorDoMesEm || STATUS_PAGO.includes(o.status ?? '');
          situacao = pior(situacao, confirmada ? 'confirmado' : 'estimado');
        }
      }
      linhas.push({ ...base, valor, situacao, ocorrencias: vivas.length });
      continue;
    }
    if (!r.ativo) continue;
    const comp = competenciaQueVenceNoMes(r, mes);
    if (!comp) continue;
    if (r.ultimoLancamentoGerado && mesDe(comp) <= mesDe(r.ultimoLancamentoGerado)) continue;
    linhas.push({ ...base, valor: base.previsto, situacao: tipo === 'certo' ? 'certo' : 'estimado', ocorrencias: 0 });
  }
  return linhas;
}

const vazia = (): Fatia => ({ valor: 0, qtd: 0 });
const somar = (f: Fatia, l: LinhaDoMes) => { f.valor += l.valor; f.qtd += 1; };

/** O resumo do mês: os cartões e a barra. Só SAÍDAS no total; as entradas vão à parte. */
export function resumoDoMes(linhas: readonly LinhaDoMes[]): ResumoDoMes {
  const r: ResumoDoMes = { total: vazia(), certo: vazia(), confirmado: vazia(), estimado: vazia(), folha: vazia(), entradas: vazia() };
  for (const l of linhas) {
    if (l.entrada) { somar(r.entradas, l); continue; }
    somar(r.total, l);
    somar(r[l.situacao], l);
    if (l.folha) somar(r.folha, l);
  }
  return r;
}

/* ── o filtro e o total da LISTA ──────────────────────────────────────────────────────────────────────────────────────── */

export type FiltroDoTipo = 'todas' | 'certo' | 'a_confirmar' | 'folha';
export type FiltroDaSituacao = 'todas' | 'confirmado' | 'estimado';

export function filtrarLinhas(linhas: readonly LinhaDoMes[], tipo: FiltroDoTipo, situacao: FiltroDaSituacao): LinhaDoMes[] {
  return linhas.filter((l) =>
    (tipo === 'todas' || (tipo === 'folha' ? l.folha : l.tipo === tipo))
    && (situacao === 'todas' || l.situacao === situacao));
}

/** O rodapé "Total do mês" da lista, com o filtro já aplicado. Entradas e saídas em colunas próprias: nunca se anulam. */
export interface TotalDaLista { qtd: number; previsto: number; valor: number; entradasQtd: number; entradasPrevisto: number; entradasValor: number }
export function totalDaLista(linhas: readonly LinhaDoMes[]): TotalDaLista {
  const t: TotalDaLista = { qtd: 0, previsto: 0, valor: 0, entradasQtd: 0, entradasPrevisto: 0, entradasValor: 0 };
  for (const l of linhas) {
    if (l.entrada) { t.entradasQtd += 1; t.entradasPrevisto += l.previsto; t.entradasValor += l.valor; }
    else { t.qtd += 1; t.previsto += l.previsto; t.valor += l.valor; }
  }
  return t;
}

/** As larguras da barra de proporção (certo · confirmado · estimado), em % do total; total zero = três zeros. */
export function proporcoesDoMes(r: ResumoDoMes): { certo: number; confirmado: number; estimado: number } {
  if (r.total.valor <= 0) return { certo: 0, confirmado: 0, estimado: 0 };
  const p = (f: Fatia) => (f.valor / r.total.valor) * 100;
  return { certo: p(r.certo), confirmado: p(r.confirmado), estimado: p(r.estimado) };
}

/* ── o que a tela escreve ─────────────────────────────────────────────────────────────────────────────────────────────── */

export const ROTULO_TIPO: Record<TipoDoValor, string> = { certo: 'Certo', a_confirmar: 'A confirmar' };
export const ROTULO_SITUACAO_DO_MES: Record<SituacaoDoMes, string> = { certo: 'certo', confirmado: 'confirmado', estimado: 'estimado' };
export const EXPLICACAO_A_CONFIRMAR =
  'A confirmar: o valor base é uma estimativa. A conta de cada mês fica estimada até você informar o valor do mês.';
