/**
 * antiDupCriarLancamento — guarda anti-duplicidade do "Criar lançamento".
 *
 * PR-CONCIL-AGENDADO-01 (D5): antes de criar um lançamento a partir de um
 * movimento OFX, procurar compromissos ABERTOS (agendado/programado, sem
 * vínculo ativo de conciliação) de mesmo valor/sinal na janela de ±10 dias
 * da âncora de data. Se existirem, a UI exibe alerta com opção "Criar mesmo
 * assim" — bloqueio CONSCIENTE, nunca impedimento. A guarda também nunca
 * impede conciliar o candidato existente pelos fluxos normais.
 *
 * ZERO-CAST: este módulo não usa `as`. A tabela conciliacao_bancaria_itens
 * está FORA dos types gerados; por isso a consulta de vínculos ativos é
 * INJETADA pelos callers (`listarVinculosAtivos`), que a implementam com o
 * padrão `(supabase as any)` já vigente nos próprios arquivos. O client
 * recebido aqui é o SupabaseClient genérico (mesmo padrão do
 * matchOfxOnDemand), então o select de financeiro_lancamentos_v2 flui sem
 * cast — a coluna `cenario`, inclusive, está ausente dos types gerados.
 *
 * Semânticas obrigatórias (verificadas em runtime no banco proto):
 *  - vivo    = cancelado IS NOT TRUE  (coluna anulável, default false);
 *  - cenário = COALESCE(cenario,'realizado') <> 'meta' (coluna anulável);
 *  - âncora  = COALESCE(data_pagamento, data_vencimento, data_competencia).
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  dataAncoraLancamento,
  orFiltroDataAncora,
  OR_CENARIO_NAO_META,
  type ComDatasAncora,
} from './dataAncora';

export const ANTIDUP_JANELA_DIAS = 10;
export const ANTIDUP_TOL_VALOR = 0.01;

/** Consulta injetada: ids de lançamentos com vínculo ATIVO (desfeito_em IS NULL). */
export type ListarVinculosAtivos = (lancIds: string[]) => Promise<string[]>;

/** Linha mínima de financeiro_lancamentos_v2 avaliada pelo predicado. */
export interface LancParaAntiDup extends ComDatasAncora {
  id: string;
  valor: number | null;
  sinal: number | null;
  descricao: string | null;
  status_transacao: string | null;
  cenario: string | null;
  cancelado: boolean | null;
}

export interface CompromissoAberto {
  id: string;
  /** Âncora de data (nunca null nos itens retornados). */
  data: string;
  /** Valor com sinal (negativo para saída). */
  valor: number;
  descricao: string | null;
  status_transacao: string | null;
}

export interface ParamsPredicadoAntiDup {
  /** |valor| do movimento OFX. */
  valorAbs: number;
  /** Sinal esperado: crédito = 1, débito = -1. */
  sinal: 1 | -1;
  /** Data do movimento OFX, ISO 'YYYY-MM-DD'. */
  dataMov: string;
  /** Ids de lançamentos com vínculo ATIVO em conciliacao_bancaria_itens. */
  idsVinculadosAtivos: ReadonlySet<string>;
  janelaDias?: number;
  tolValor?: number;
}

/** Diferença em dias entre duas datas ISO 'YYYY-MM-DD' (valor absoluto). */
export function diasEntreISO(a: string, b: string): number {
  const ta = new Date(a + 'T00:00:00').getTime();
  const tb = new Date(b + 'T00:00:00').getTime();
  return Math.abs(ta - tb) / 86400000;
}

function sinalDoLancamento(l: LancParaAntiDup): 1 | -1 {
  return (Number(l.sinal) || 0) >= 0 ? 1 : -1;
}

/**
 * Predicado puro: o lançamento é um compromisso ABERTO equivalente ao
 * movimento OFX? Cobre exatamente as regras de D5/D9:
 *  - status agendado|programado;
 *  - cancelado !== true (false e null são vivos);
 *  - cenario !== 'meta' (null passa);
 *  - |valor| dentro de ±tolValor de valorAbs;
 *  - mesma direção (sinal);
 *  - âncora COALESCE dentro de ±janelaDias de dataMov;
 *  - sem vínculo ativo de conciliação.
 */
export function predicadoCompromissoAberto(
  l: LancParaAntiDup,
  p: ParamsPredicadoAntiDup,
): boolean {
  const janela = p.janelaDias ?? ANTIDUP_JANELA_DIAS;
  const tol = p.tolValor ?? ANTIDUP_TOL_VALOR;
  const status = (l.status_transacao || '').toLowerCase();
  if (status !== 'agendado' && status !== 'programado') return false;
  if (l.cancelado === true) return false;
  if ((l.cenario ?? 'realizado') === 'meta') return false;
  // epsilon 1e-9: tolerância ±tol INCLUSIVA sob aritmética de ponto flutuante
  // (ex.: 6000.01 - 6000 = 0.010000000000218 em float64).
  if (Math.abs(Math.abs(Number(l.valor) || 0) - p.valorAbs) > tol + 1e-9) return false;
  if (sinalDoLancamento(l) !== p.sinal) return false;
  const anc = dataAncoraLancamento(l);
  if (!anc) return false;
  if (diasEntreISO(anc, p.dataMov) > janela) return false;
  if (p.idsVinculadosAtivos.has(l.id)) return false;
  return true;
}

function addDiasISO(iso: string, dias: number): string {
  return new Date(new Date(iso + 'T00:00:00').getTime() + dias * 86400000)
    .toISOString()
    .slice(0, 10);
}

function montarCompromisso(l: LancParaAntiDup): CompromissoAberto {
  return {
    id: l.id,
    // predicado garante âncora não-nula; fallback defensivo em '' nunca ocorre
    data: dataAncoraLancamento(l) ?? '',
    valor: Math.abs(Number(l.valor) || 0) * sinalDoLancamento(l),
    descricao: l.descricao,
    status_transacao: l.status_transacao,
  };
}

const SELECT_ANTIDUP =
  'id, data_pagamento, data_vencimento, data_competencia, valor, sinal, descricao, status_transacao, cenario, cancelado, conta_bancaria_id, conta_destino_id';

interface FiltroBaseAntiDup {
  clienteId: string;
  contaBancariaId: string;
}

async function fetchLancsJanela(
  supabase: SupabaseClient,
  base: FiltroBaseAntiDup,
  ini: string,
  fim: string,
  valorAbs?: number,
): Promise<LancParaAntiDup[]> {
  let q = supabase
    .from('financeiro_lancamentos_v2')
    .select(SELECT_ANTIDUP)
    .eq('cliente_id', base.clienteId)
    .in('status_transacao', ['agendado', 'programado'])
    .not('cancelado', 'is', true)
    .or(OR_CENARIO_NAO_META)
    .or(`conta_bancaria_id.eq.${base.contaBancariaId},conta_destino_id.eq.${base.contaBancariaId}`)
    .or(orFiltroDataAncora(ini, fim));
  if (valorAbs !== undefined) {
    q = q
      .gte('valor', valorAbs - ANTIDUP_TOL_VALOR)
      .lte('valor', valorAbs + ANTIDUP_TOL_VALOR);
  }
  const { data, error } = await q;
  if (error) throw error;
  const rows: LancParaAntiDup[] = data ?? [];
  return rows;
}

export interface ParamsBuscaAntiDup extends FiltroBaseAntiDup {
  valorAbs: number;
  sinal: 1 | -1;
  dataMov: string;
  janelaDias?: number;
}

/**
 * Busca compromissos abertos equivalentes ao movimento OFX.
 * Uma query de lançamentos + a consulta de vínculos ativos injetada;
 * predicado aplicado client-side (fonte única de regra, testável).
 */
export async function buscarCompromissosAbertos(
  supabase: SupabaseClient,
  params: ParamsBuscaAntiDup,
  listarVinculosAtivos: ListarVinculosAtivos,
): Promise<CompromissoAberto[]> {
  const janela = params.janelaDias ?? ANTIDUP_JANELA_DIAS;
  const ini = addDiasISO(params.dataMov, -janela);
  const fim = addDiasISO(params.dataMov, +janela);

  const lancs = await fetchLancsJanela(supabase, params, ini, fim, params.valorAbs);
  if (lancs.length === 0) return [];

  const idsVinculadosAtivos = new Set(await listarVinculosAtivos(lancs.map((l) => l.id)));

  const p: ParamsPredicadoAntiDup = {
    valorAbs: params.valorAbs,
    sinal: params.sinal,
    dataMov: params.dataMov,
    idsVinculadosAtivos,
    janelaDias: janela,
  };
  return lancs.filter((l) => predicadoCompromissoAberto(l, p)).map(montarCompromisso);
}

/**
 * Aviso agregado para o caminho em LOTE ("Criar lançamentos em lote"):
 * uma única query cobrindo a janela de todos os movimentos selecionados;
 * predicado aplicado por movimento. Retorna a quantidade de movimentos com
 * pelo menos um compromisso aberto equivalente. Não bloqueia nada.
 */
export async function contarMovimentosComCompromissoAberto(
  supabase: SupabaseClient,
  params: FiltroBaseAntiDup & {
    movimentos: { id: string; data_movimento: string; valor: number }[];
  },
  listarVinculosAtivos: ListarVinculosAtivos,
): Promise<number> {
  const movs = params.movimentos;
  if (movs.length === 0) return 0;
  const datas = movs.map((m) => m.data_movimento).sort();
  const ini = addDiasISO(datas[0], -ANTIDUP_JANELA_DIAS);
  const fim = addDiasISO(datas[datas.length - 1], +ANTIDUP_JANELA_DIAS);

  const lancs = await fetchLancsJanela(supabase, params, ini, fim);
  if (lancs.length === 0) return 0;

  const idsVinculadosAtivos = new Set(await listarVinculosAtivos(lancs.map((l) => l.id)));

  let n = 0;
  for (const m of movs) {
    const p: ParamsPredicadoAntiDup = {
      valorAbs: Math.abs(Number(m.valor) || 0),
      sinal: (Number(m.valor) || 0) >= 0 ? 1 : -1,
      dataMov: m.data_movimento,
      idsVinculadosAtivos,
    };
    if (lancs.some((l) => predicadoCompromissoAberto(l, p))) n++;
  }
  return n;
}
