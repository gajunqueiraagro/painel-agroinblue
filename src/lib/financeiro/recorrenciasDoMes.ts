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
  /**
   * REC-FALTA-GERAR-A-VISTA-01: o que a REGRA ainda tem para gerar, em QUALQUER mês (não só neste) — o que o banco devolveu
   * para ela, ou nulo. Não muda `naoGerado`, o valor nem o total: é só o que a linha mostra ao lado da situação.
   */
  faltaGerar: FaltaGerar | null;
}

/* ── O QUE FALTA GERAR — REC-FALTA-GERAR-A-VISTA-01 ───────────────────────────────────────────────────────────────────────
   Quem diz QUAIS competências faltam é o banco (`fn_recorrencias_a_gerar`, o Gerar perguntado sem gravar). Aqui só se LÊ a
   resposta e se CONTA o que ela traz. PROIBIDO calcular vaga neste arquivo ou na tela. */

/** O que o banco diz de UMA regra: quantos meses o Gerar criaria, quantos caem em mês fechado, e de quando a quando. */
export interface FaltaGerar { aGerar: number; fechados: number; passados: number; primeira: string | null; ultima: string | null }
export type MapaAGerar = ReadonlyMap<string, FaltaGerar>;
export const SEM_A_GERAR: MapaAGerar = new Map();

const inteiro = (v: unknown): number | null => (typeof v === 'number' && Number.isInteger(v) && v >= 0 ? v : null);
const mesOuNulo = (v: unknown): string | null | undefined =>
  (v === null || v === undefined ? null : typeof v === 'string' && /^\d{4}-\d{2}$/.test(v) ? v : undefined);

/**
 * Lê a resposta de `fn_recorrencias_a_gerar`. ⚠ PEÇA TORTA = NULO INTEIRO, nunca um mapa parcial: "não consegui ler" não pode
 * virar "está tudo em dia" (a tela escreve o aviso). Resposta vazia É um mapa vazio: nada a gerar.
 */
export function lerAGerar(resposta: unknown): Map<string, FaltaGerar> | null {
  if (!Array.isArray(resposta)) return null;
  const mapa = new Map<string, FaltaGerar>();
  for (const l of resposta) {
    if (typeof l !== 'object' || l === null) return null;
    const o: Record<string, unknown> = { ...l };
    const id = o.recorrencia_id;
    const aGerar = inteiro(o.a_gerar), fechados = inteiro(o.fechados), passados = inteiro(o.passados);
    const primeira = mesOuNulo(o.primeira), ultima = mesOuNulo(o.ultima);
    if (typeof id !== 'string' || id === '' || aGerar === null || fechados === null || passados === null
      || primeira === undefined || ultima === undefined) return null;
    mapa.set(id, { aGerar, fechados, passados, primeira, ultima });
  }
  return mapa;
}

/** O que falta gerar numa regra, ou nulo. Só regra com algo a dizer (a gerar ou em mês fechado). */
export function faltaGerarDaRegra(mapa: MapaAGerar, regraId: string): FaltaGerar | null {
  const f = mapa.get(regraId);
  return f && (f.aGerar > 0 || f.fechados > 0) ? f : null;
}

/** O cartão "Falta gerar": quantas regras têm mês para gerar e quantos meses são — CONTADO DO MAPA, não das linhas da lista. */
export function resumoFaltaGerar(mapa: MapaAGerar): { regras: number; meses: number } {
  const r = { regras: 0, meses: 0 };
  for (const f of mapa.values()) if (f.aGerar > 0) { r.regras += 1; r.meses += f.aGerar; }
  return r;
}

const meses = (n: number): string => (n === 1 ? '1 mês' : `${n} meses`);
/** 'AAAA-MM' -> 'MM/AAAA' (o texto do `title`). */
const mesAno = (m: string): string => `${m.slice(5, 7)}/${m.slice(0, 4)}`;
const intervalo = (f: FaltaGerar): string =>
  (f.primeira && f.ultima ? (f.primeira === f.ultima ? `em ${mesAno(f.primeira)}` : `de ${mesAno(f.primeira)} a ${mesAno(f.ultima)}`) : '');

/**
 * O selo da linha. REC-COLUNAS-01c (Gabriel 21/10/2026): o texto é CURTO — "falta gerar" em âmbar, ou "mês fechado" em cinza
 * quando só sobra mês fechado —, e o NÚMERO DE MESES vai no `title` ("Faltam gerar 44 meses — de 09/2026 a 04/2030 · 2
 * passados") e no item do "⋯". A coluna Situação tem a largura das situações comuns, não a do selo raro de dois dígitos.
 */
export function seloFaltaGerar(f: FaltaGerar | null): { texto: string; tom: 'ambar' | 'cinza'; titulo: string } | null {
  if (!f) return null;
  if (f.aGerar > 0) {
    const cabeca = `${f.aGerar === 1 ? 'Falta gerar 1 mês' : `Faltam gerar ${f.aGerar} meses`}${intervalo(f) ? ` — ${intervalo(f)}` : ''}`;
    const extras: string[] = [];
    if (f.passados > 0) extras.push(f.passados === 1 ? '1 passado' : `${f.passados} passados`);
    if (f.fechados > 0) extras.push(`${f.fechados} em mês fechado`);
    return { texto: 'falta gerar', tom: 'ambar', titulo: [cabeca, ...extras].join(' · ') };
  }
  if (f.fechados > 0) {
    return { texto: 'mês fechado', tom: 'cinza', titulo: `${meses(f.fechados)} em mês fechado: o Gerar não cria lançamento em mês fechado; reabra o mês para gerar` };
  }
  return null;
}

/** O rótulo do item do "⋯" que gera — REC-COLUNAS-01c: o botão "Gerar" saiu da linha e virou a primeira opção do menu. */
export const rotuloDoGerarNoMenu = (f: FaltaGerar): string => (f.aGerar === 1 ? 'Gerar 1 mês que falta' : `Gerar ${f.aGerar} meses que faltam`);
/** O valor do cartão: contagem de meses, sem R$. */
export const mesesAGerar = meses;
export const AVISO_A_GERAR_NAO_LIDO = 'não foi possível ler o que falta gerar';

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
export interface ContextoDoMes { canceladas: readonly CompetenciaCancelada[]; mesesFechados: readonly string[]; aGerar?: MapaAGerar }
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
  const aGerar = contexto.aGerar ?? SEM_A_GERAR;
  const linhas: LinhaDoMes[] = [];
  for (const r of regras) {
    const tipo: TipoDoValor = r.valorAConfirmar ? 'a_confirmar' : 'certo';
    const base = { regraId: r.id, tipo, folha: r.folha, entrada: r.valorBase > 0, previsto: centavos(r.valorBase), faltaGerar: faltaGerarDaRegra(aGerar, r.id) };
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
