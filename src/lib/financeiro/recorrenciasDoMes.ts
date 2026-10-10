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
  /**
   * RECORRENCIA-GERA-A-VIGENCIA-INTEIRA-01: a regra é vigente no mês e NÃO tem lançamento nele — com o motivo. Nulo quando
   * há ocorrência viva. A linha continua valendo o valor base (é o que o Gerar criaria); a tela escreve "não gerado".
   */
  naoGerado: MotivoNaoGerado | null;
}

/** Por que a competência do mês não tem lançamento. "mês fechado" é a palavra do banco (`nao_gerados` do Gerar). */
export type MotivoNaoGerado = 'falta gerar' | 'mês fechado';
export const ROTULO_NAO_GERADO = 'não gerado';
export const TITULO_NAO_GERADO: Record<MotivoNaoGerado, string> = {
  'falta gerar': 'falta gerar: a regra vale neste mês e o lançamento ainda não foi criado — use o Gerar',
  'mês fechado': 'mês fechado: o Gerar não cria lançamento em mês fechado; reabra o mês para gerar',
};

/** Uma competência da regra cujo lançamento foi CANCELADO: conta como ocupada (o Gerar não a recria) e não é previsão. */
export interface CompetenciaCancelada { recorrenciaId: string; competencia: string }
/** O que o dono precisa além das ocorrências vivas para dizer "não gerado" sem adivinhar. */
export interface ContextoDoMes { canceladas: readonly CompetenciaCancelada[]; mesesFechados: readonly string[] }
const SEM_CONTEXTO: ContextoDoMes = { canceladas: [], mesesFechados: [] };

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

/**
 * A OCORRÊNCIA ESTÁ ESTIMADA? — a regra ÚNICA do "ainda é estimativa" (REC-VALOR-CERTO-01/02): a recorrência é A CONFIRMAR e a
 * ocorrência não tem a marca do valor do mês nem está realizada/conciliada. A tela de Recorrências (`linhasDoMes`) e Contas a
 * Pagar e Receber (`lerEstimadasDoCliente` -> `recortarCpr`) julgam por ESTA função; nenhuma segunda regra.
 */
export function ocorrenciaEstimada(o: { valorAConfirmar: boolean; valorDoMesEm: string | null | undefined; status: string | null | undefined }): boolean {
  if (!o.valorAConfirmar) return false;
  return !o.valorDoMesEm && !STATUS_PAGO.includes(o.status ?? '');
}

/** A pior situação vence: 'estimado' > 'confirmado'. */
const pior = (a: SituacaoDoMes, b: SituacaoDoMes): SituacaoDoMes => (a === 'estimado' || b === 'estimado' ? 'estimado' : a === 'confirmado' || b === 'confirmado' ? 'confirmado' : 'certo');

/**
 * A linha de cada recorrência NO MÊS (`mes` = 'AAAA-MM', o do vencimento).
 *   · com ocorrência viva vencendo no mês: entra, pelo valor dela (duas ocorrências: soma) — mesmo com a regra pausada, porque
 *     a conta existe;
 *   · sem ocorrência viva: entra pelo valor base SÓ se a regra está ativa e tem competência que vence no mês — e aparece
 *     como NÃO GERADO, com o motivo ("mês fechado" quando a competência cai em mês fechado; senão "falta gerar"). Vale acima
 *     E ABAIXO da marca d'água (RECORRENCIA-GERA-A-VIGENCIA-INTEIRA-01: a regra vigente no mês nunca some em silêncio);
 *   · competência cujo lançamento foi CANCELADO (`contexto.canceladas`) não entra: conta cancelada não é previsão, e o Gerar
 *     não a recria. ⚠ ANTES de 10/10/2026 isto era SUPOSTO de toda competência abaixo da marca sem ocorrência viva — e a regra
 *     com a vigência levada para trás sumia dos meses passados;
 *   · fora disso, a recorrência não entra no mês.
 */
export function linhasDoMes(regras: readonly RegraDoMes[], ocorrencias: readonly OcorrenciaDoMes[], mes: string, contexto: ContextoDoMes = SEM_CONTEXTO): LinhaDoMes[] {
  const canceladas = new Set(contexto.canceladas.map((c) => `${c.recorrenciaId}|${mesDe(c.competencia)}`));
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
          const estimada = ocorrenciaEstimada({ valorAConfirmar: true, valorDoMesEm: o.valorDoMesEm, status: o.status });
          situacao = pior(situacao, estimada ? 'estimado' : 'confirmado');
        }
      }
      linhas.push({ ...base, valor, situacao, ocorrencias: vivas.length, naoGerado: null });
      continue;
    }
    if (!r.ativo) continue;
    const comp = competenciaQueVenceNoMes(r, mes);
    if (!comp) continue;
    if (canceladas.has(`${r.id}|${mesDe(comp)}`)) continue;
    const naoGerado: MotivoNaoGerado = contexto.mesesFechados.includes(mesDe(comp)) ? 'mês fechado' : 'falta gerar';
    linhas.push({ ...base, valor: base.previsto, situacao: tipo === 'certo' ? 'certo' : 'estimado', ocorrencias: 0, naoGerado });
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
