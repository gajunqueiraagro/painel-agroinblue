/**
 * A IDA E VOLTA DA CONTAS A PAGAR E RECEBER AO CONTRATO — PARC-CADEIA-01 passo 2.
 *
 * "Abrir o contrato" (no aviso de parcela de compra parcelada) sai da tela; ao voltar, ela reabre com o MESMO recorte. A tela
 * não guardava filtro nenhum (estado local): este é o instantâneo de UMA ida e volta — gravado ao sair, lido UMA vez ao montar
 * e apagado. Não é memória geral de filtros.
 * ⚠ SEM `as`: o que vem do `sessionStorage` é validado campo a campo; campo torto fica de fora (a tela usa o padrão dele).
 */
import type { AtalhoCpr, FiltroContaCpr, PeriodoCpr, SegmentoCpr } from '@/lib/financeiro/cprRecorte';

export const CHAVE_RETORNO_CPR = 'cpr_retorno_do_contrato';

export interface RetornoCpr {
  visao: 'lista' | 'fluxo';
  atalho: AtalhoCpr;
  datas: PeriodoCpr | null;
  incluirVencidos: boolean;
  contaSel: FiltroContaCpr;
  segmento: SegmentoCpr;
  statusLigados: string[];
  ampliado: boolean;
}

const ehObjeto = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const ehData = (v: unknown): v is string => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v);

/** Valida o instantâneo. Devolve só os campos bons; `null` quando não há nada aproveitável. */
export function lerRetornoCpr(texto: string | null | undefined): Partial<RetornoCpr> | null {
  if (!texto) return null;
  let j: unknown;
  try { j = JSON.parse(texto); } catch { return null; }
  if (!ehObjeto(j)) return null;
  const r: Partial<RetornoCpr> = {};
  if (j.visao === 'lista' || j.visao === 'fluxo') r.visao = j.visao;
  if (j.atalho === 'mes' || j.atalho === '30' || j.atalho === '60' || j.atalho === 'datas') r.atalho = j.atalho;
  if (j.datas === null) r.datas = null;
  else if (ehObjeto(j.datas)) {
    const de = j.datas.de; const ate = j.datas.ate;
    if (ehData(de) && ehData(ate)) r.datas = { de, ate };
  }
  const incluir = j.incluirVencidos; const conta = j.contaSel; const amp = j.ampliado; const status = j.statusLigados;
  if (typeof incluir === 'boolean') r.incluirVencidos = incluir;
  if (typeof conta === 'string') r.contaSel = conta; else if (conta === null) r.contaSel = null;
  if (j.segmento === 'pagar' || j.segmento === 'receber' || j.segmento === 'ambos') r.segmento = j.segmento;
  if (Array.isArray(status)) r.statusLigados = status.filter((x): x is string => typeof x === 'string');
  if (typeof amp === 'boolean') r.ampliado = amp;
  return Object.keys(r).length > 0 ? r : null;
}

/** Lê UMA vez e apaga: a volta seguinte, sem ida, abre no padrão. */
export function consumirRetornoCpr(): Partial<RetornoCpr> | null {
  try {
    const texto = sessionStorage.getItem(CHAVE_RETORNO_CPR);
    if (texto !== null) sessionStorage.removeItem(CHAVE_RETORNO_CPR);
    return lerRetornoCpr(texto);
  } catch {
    return null;
  }
}

export function guardarRetornoCpr(estado: RetornoCpr): void {
  try { sessionStorage.setItem(CHAVE_RETORNO_CPR, JSON.stringify(estado)); } catch { /* sem storage: a volta abre no padrão */ }
}
