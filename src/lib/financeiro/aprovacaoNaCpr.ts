/**
 * BPO-FUNCIONAR-01 (mock aprovado, Gabriel 24/11 06:58) — a APROVAÇÃO DENTRO DA CPR. Puro: sem React e sem rede.
 *
 * O estado de cada saída vem PRONTO do banco (`fn_aprovacao_estados`, 118500: a regra é do banco, `_fn_aprovacao_na_regra`):
 *   aguardando · aprovado · aprovado_regra (abaixo do limite) · recusado · fora (fora da regra, ou BPO desligado).
 * Aqui só se decide em que ETAPA a linha aparece e o que o chip diz — nunca se recalcula a regra.
 *
 * As ETAPAS no topo da CPR são recortes da MESMA lista (as linhas que a CPR já leu):
 *   · Tudo        — a CPR de sempre;
 *   · Para aprovar — aguardando (o aprovador vê só o que ELE pode decidir: o que não lançou);
 *   · Para pagar  — aprovado (ou pela regra) e ainda não agendado nem pago;
 *   · Agendados   — status Agendado;
 *   · Pagos       — status Realizado.
 * O status de sempre (Previsto/Programado/Agendado/Realizado) NÃO muda: a aprovação é uma coluna a mais.
 */

export type EstadoAprovacao = 'aguardando' | 'aprovado' | 'aprovado_regra' | 'recusado' | 'fora';
export type EtapaCpr = 'tudo' | 'aprovar' | 'pagar' | 'agendados' | 'pagos';

export interface AprovacaoDaLinha {
  lancamentoId: string;
  estado: EstadoAprovacao;
  motivo: string | null;
  observacao: string | null;
  decididoPor: string | null;
  decididoEm: string | null;
  lancadoPor: string | null;
  lancadoEm: string | null;
  possoDecidir: boolean;
  temNota: boolean;
  temBoleto: boolean;
  forma: string | null;
  prontoPagar: string | null;
}

const ESTADOS: ReadonlySet<string> = new Set(['aguardando', 'aprovado', 'aprovado_regra', 'recusado', 'fora']);
const ehObjeto = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const texto = (v: unknown): string | null => (typeof v === 'string' && v.trim() ? v : null);
function ehEstado(v: unknown): v is EstadoAprovacao { return typeof v === 'string' && ESTADOS.has(v); }

/** as linhas da `fn_aprovacao_estados`, tipadas (linha sem id ou com estado desconhecido sai) */
export function lerEstados(dados: unknown): Map<string, AprovacaoDaLinha> {
  const mapa = new Map<string, AprovacaoDaLinha>();
  for (const r of Array.isArray(dados) ? dados : []) {
    if (!ehObjeto(r) || typeof r.lancamento_id !== 'string' || !ehEstado(r.estado)) continue;
    mapa.set(r.lancamento_id, {
      lancamentoId: r.lancamento_id, estado: r.estado, motivo: texto(r.motivo), observacao: texto(r.observacao),
      decididoPor: texto(r.decidido_por), decididoEm: texto(r.decidido_em), lancadoPor: texto(r.lancado_por), lancadoEm: texto(r.lancado_em),
      possoDecidir: r.posso_decidir === true, temNota: r.tem_nota === true, temBoleto: r.tem_boleto === true,
      forma: texto(r.forma), prontoPagar: texto(r.pronto_pagar),
    });
  }
  return mapa;
}

export interface LinhaParaEtapa { id: string; status_transacao: string | null; tipo_operacao: string | null }

/** em que etapa a linha aparece (fora de "Tudo"); nulo = só em "Tudo" */
export function etapaDaLinha(l: LinhaParaEtapa, a: AprovacaoDaLinha | undefined): Exclude<EtapaCpr, 'tudo'> | null {
  const status = (l.status_transacao ?? '').toLowerCase();
  if (l.tipo_operacao !== '2-Saídas') return null;
  if (status === 'realizado' || status === 'conciliado') return 'pagos';
  if (status === 'agendado') return 'agendados';
  if (!a) return null;
  if (a.estado === 'aguardando') return 'aprovar';
  if (a.estado === 'aprovado' || a.estado === 'aprovado_regra') return 'pagar';
  return null;
}

/** a linha entra na etapa escolhida? ("Para aprovar" do aprovador = só o que ELE pode decidir) */
export function entraNaEtapa(etapa: EtapaCpr, l: LinhaParaEtapa, a: AprovacaoDaLinha | undefined, soAsMinhas: boolean): boolean {
  if (etapa === 'tudo') return true;
  if (etapaDaLinha(l, a) !== etapa) return false;
  return etapa !== 'aprovar' || !soAsMinhas || a?.possoDecidir === true;
}

export const ETAPAS_DE_RECORTE: readonly Exclude<EtapaCpr, 'tudo'>[] = ['aprovar', 'pagar', 'agendados', 'pagos'];
export const ETAPAS: readonly EtapaCpr[] = ['tudo', ...ETAPAS_DE_RECORTE];

export interface ContagemDaEtapa { n: number; total: number }
export function contarEtapas<T extends LinhaParaEtapa & { valor: number | null }>(
  linhas: readonly T[], estados: ReadonlyMap<string, AprovacaoDaLinha>, soAsMinhas: boolean,
): Record<EtapaCpr, ContagemDaEtapa> {
  const c: Record<EtapaCpr, ContagemDaEtapa> = {
    tudo: { n: 0, total: 0 }, aprovar: { n: 0, total: 0 }, pagar: { n: 0, total: 0 }, agendados: { n: 0, total: 0 }, pagos: { n: 0, total: 0 },
  };
  for (const l of linhas) {
    const v = Math.abs(Number(l.valor ?? 0));
    c.tudo.n += 1; c.tudo.total += v;
    for (const e of ETAPAS_DE_RECORTE) {
      if (entraNaEtapa(e, l, estados.get(l.id), soAsMinhas)) { c[e].n += 1; c[e].total += v; }
    }
  }
  return c;
}

export const ROTULO_DA_ETAPA: Record<EtapaCpr, string> = {
  tudo: 'Tudo', aprovar: 'Para aprovar', pagar: 'Para pagar', agendados: 'Agendados', pagos: 'Pagos',
};

export type TomDoChip = 'aguardando' | 'aprovado' | 'recusado' | 'neutro';
/** o chip da coluna Aprovação (o mock): Aguardando · Sem documento · Aprovado · Aprovado · regra · Recusado · — */
export function chipDaAprovacao(a: AprovacaoDaLinha | undefined): { texto: string; tom: TomDoChip; titulo: string } {
  if (!a || a.estado === 'fora') return { texto: '—', tom: 'neutro', titulo: 'Fora da aprovação (entrada, pago, antes da data de início ou aprovação desligada)' };
  switch (a.estado) {
    case 'aguardando': return a.temNota || a.temBoleto
      ? { texto: 'Aguardando', tom: 'aguardando', titulo: 'Aguardando a aprovação' }
      : { texto: 'Sem documento', tom: 'aguardando', titulo: 'Aguardando a aprovação · sem NF nem boleto anexado' };
    case 'aprovado': return { texto: 'Aprovado', tom: 'aprovado', titulo: a.observacao ?? 'Aprovado' };
    case 'aprovado_regra': return { texto: 'Aprovado · regra', tom: 'aprovado', titulo: 'Abaixo do limite: aprovado pela regra do cliente' };
    default: return { texto: 'Recusado', tom: 'recusado', titulo: `Recusado: ${a.motivo ?? '—'}` };
  }
}

const dois = (n: number) => String(n).padStart(2, '0');
/** "Amanda · 20/11" — o primeiro nome de quem lançou e o dia; sem autor = "—" */
export function lancadoPorTexto(nome: string | null, iso: string | null): string {
  const primeiro = (nome ?? '').trim().split(/[\s@]+/)[0] ?? '';
  if (!primeiro) return '—';
  if (!iso) return primeiro;
  const d = new Date(iso);
  return `${primeiro} · ${dois(d.getDate())}/${dois(d.getMonth() + 1)}`;
}

/** por que a linha não tem caixa de seleção (a fonte única do title) */
export function motivoSemSelecao(a: AprovacaoDaLinha | undefined, euLancei: boolean): string | null {
  if (!a || a.estado !== 'aguardando') return 'Só o que está aguardando se aprova';
  if (euLancei) return 'Quem lançou não aprova';
  if (!a.possoDecidir) return 'Só quem aprova este cliente decide';
  return null;
}
