/**
 * transferenciaDoExtrato — P139 (Gabriel, pedido desde 30/09; ENCAIXE aprovado 27/10): criar transferência pela linha do extrato, num
 * gesto. A regra é do BANCO (`fn_transferencia_do_extrato`, `fn_transferencias_do_extrato_lote`, `fn_extrato_transferencias_provaveis`):
 * origem/destino pelo sinal, espelho ±3 dias (o mais próximo só se for único), gêmea de outra importação, transferência já lançada →
 * casar com ela. A tela só LÊ a simulação (`p_simular`) e manda a escolha; nada aqui calcula espelho, sugestão ou par.
 * ⚠ O dinheiro chega como TEXTO (exato) e só vira número para exibir.
 */
import { supabase } from '@/integrations/supabase/client';

export interface EspelhoDaTransferencia { id: string; data: string; descricao: string; valor: number; distancia: number }
export interface GemeaDoMovimento { id: string; descricao: string; data: string }
export interface TransferenciaExistente { id: string; descricao: string; data: string | null; meiaPonta: boolean }

export type AcaoDaTransferencia = 'escolher_conta' | 'criar' | 'casar_existente';

export interface SimulacaoDaTransferencia {
  acao: AcaoDaTransferencia;
  extratoId: string;
  valor: number;
  data: string;
  origem: string | null;
  destino: string | null;
  espelhos: EspelhoDaTransferencia[];
  /** o espelho que o banco escolheria (único na menor distância); nulo = nenhum ou empate */
  espelhoId: string | null;
  gemeas: GemeaDoMovimento[];
  existente: TransferenciaExistente | null;
}

export interface SugestaoDeTransferencia {
  extratoId: string;
  contaSugerida: string | null;
  contaNome: string | null;
  motivo: 'titular_documento' | 'titular_nome' | 'aplicacao_automatica' | 'varias';
  candidatas: number;
}

const obj = (v: unknown): Record<string, unknown> | null =>
  v !== null && typeof v === 'object' && !Array.isArray(v) ? Object.fromEntries(Object.entries(v)) : null;
const txt = (v: unknown): string | null => (typeof v === 'string' ? v : null);
const num = (v: unknown): number | null => {
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  if (typeof v === 'string' && v.trim() !== '' && Number.isFinite(Number(v))) return Number(v);
  return null;
};
const ACOES: readonly AcaoDaTransferencia[] = ['escolher_conta', 'criar', 'casar_existente'];
const MOTIVOS: readonly SugestaoDeTransferencia['motivo'][] = ['titular_documento', 'titular_nome', 'aplicacao_automatica', 'varias'];
const ehAcao = (v: unknown): v is AcaoDaTransferencia => typeof v === 'string' && ACOES.some((a) => a === v);
const ehMotivo = (v: unknown): v is SugestaoDeTransferencia['motivo'] => typeof v === 'string' && MOTIVOS.some((m) => m === v);

/** Lê a simulação da porta. Peça torta = `null` (a tela diz "não deu para prever", nunca inventa). */
export function lerSimulacao(v: unknown): SimulacaoDaTransferencia | null {
  const o = obj(v);
  if (!o || o.ok !== true || !ehAcao(o.acao)) return null;
  const extratoId = txt(o.extrato_id); const valor = num(o.valor); const data = txt(o.data);
  if (!extratoId || valor == null || !data) return null;
  const espelhos: EspelhoDaTransferencia[] = [];
  for (const x of Array.isArray(o.espelhos) ? o.espelhos : []) {
    const e = obj(x); if (!e) return null;
    const id = txt(e.id); const d = txt(e.data); const vv = num(e.valor); const dist = num(e.distancia);
    if (!id || !d || vv == null || dist == null) return null;
    espelhos.push({ id, data: d, descricao: txt(e.descricao) ?? '', valor: vv, distancia: dist });
  }
  const gemeas: GemeaDoMovimento[] = [];
  for (const x of Array.isArray(o.gemeas) ? o.gemeas : []) {
    const g = obj(x); if (!g) return null;
    const id = txt(g.id); const d = txt(g.data);
    if (!id || !d) return null;
    gemeas.push({ id, data: d, descricao: txt(g.descricao) ?? '' });
  }
  const ex = obj(o.existente);
  const existente: TransferenciaExistente | null = ex && txt(ex.id)
    ? { id: txt(ex.id) ?? '', descricao: txt(ex.descricao) ?? '', data: txt(ex.data), meiaPonta: ex.meia_ponta === true }
    : null;
  return {
    acao: o.acao, extratoId, valor, data, origem: txt(o.origem), destino: txt(o.destino),
    espelhos, espelhoId: txt(o.espelho_id), gemeas, existente,
  };
}

/** Lê uma linha da sugestão. Torta = `null` (fica sem selo). */
export function lerSugestao(v: unknown): SugestaoDeTransferencia | null {
  const o = obj(v);
  if (!o || !ehMotivo(o.motivo)) return null;
  const extratoId = txt(o.extrato_id); const candidatas = num(o.candidatas);
  if (!extratoId || candidatas == null) return null;
  return { extratoId, contaSugerida: txt(o.conta_sugerida), contaNome: txt(o.conta_nome), motivo: o.motivo, candidatas };
}

/** O porquê do selo "transf.?", para o `title`. */
export function porqueDaSugestao(s: SugestaoDeTransferencia): string {
  if (s.motivo === 'varias') return `transferência provável: ${s.candidatas} contas podem ser a outra ponta — escolha ao criar`;
  const como = s.motivo === 'titular_documento' ? 'o documento do titular aparece no histórico'
    : s.motivo === 'titular_nome' ? 'o nome do titular aparece no histórico'
    : 'aplicação/resgate automático: a única conta de investimento deste banco';
  return `transferência provável → ${s.contaNome ?? 'outra conta'} (${como})`;
}

/** A recusa do banco vem pronta (frase); erro sem mensagem = frase genérica. */
function fraseDoErro(e: unknown): string {
  const o = obj(e);
  const m = o ? txt(o.message) : null;
  return m && m.trim() ? m : 'Não foi possível concluir. Nada foi gravado.';
}

export interface EscolhaDaTransferencia {
  outraConta: string | null;
  espelhoId?: string | null;
  semEspelho?: boolean;
  confirmarGemea?: boolean;
}

export async function simularTransferencia(extratoId: string, e: EscolhaDaTransferencia):
  Promise<{ ok: true; sim: SimulacaoDaTransferencia } | { ok: false; erro: string }> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- idioma documentado: o `.rpc` do repo (função fora dos tipos gerados)
  const { data, error } = await (supabase as any).rpc('fn_transferencia_do_extrato', {
    p_extrato: extratoId, p_outra_conta: e.outraConta, p_espelho: e.espelhoId ?? null, p_sem_espelho: !!e.semEspelho, p_simular: true,
  });
  if (error) return { ok: false, erro: fraseDoErro(error) };
  const sim = lerSimulacao(data);
  return sim ? { ok: true, sim } : { ok: false, erro: 'Não deu para prever a transferência. Nada foi gravado.' };
}

export async function gravarTransferencia(extratoId: string, e: EscolhaDaTransferencia):
  Promise<{ ok: true; lancamentoId: string } | { ok: false; erro: string }> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- idioma documentado: o `.rpc` do repo (função fora dos tipos gerados)
  const { data, error } = await (supabase as any).rpc('fn_transferencia_do_extrato', {
    p_extrato: extratoId, p_outra_conta: e.outraConta, p_espelho: e.espelhoId ?? null, p_sem_espelho: !!e.semEspelho,
    p_confirmar_gemea: !!e.confirmarGemea, p_simular: false,
  });
  if (error) return { ok: false, erro: fraseDoErro(error) };
  const o = obj(data); const id = o ? txt(o.lancamento_id) : null;
  return id ? { ok: true, lancamentoId: id } : { ok: false, erro: 'O banco não confirmou a gravação.' };
}

export interface ItemDoLote extends EscolhaDaTransferencia { extratoId: string }

export async function loteDeTransferencias(itens: readonly ItemDoLote[], simular: boolean):
  Promise<{ ok: true; sims: SimulacaoDaTransferencia[]; transferencias: number; espelhos: number } | { ok: false; erro: string }> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- idioma documentado: o `.rpc` do repo (função fora dos tipos gerados)
  const { data, error } = await (supabase as any).rpc('fn_transferencias_do_extrato_lote', {
    p_itens: itens.map((i) => ({ extrato_id: i.extratoId, outra_conta: i.outraConta, espelho_id: i.espelhoId ?? null,
      sem_espelho: !!i.semEspelho, confirmar_gemea: !!i.confirmarGemea })),
    p_simular: simular,
  });
  if (error) return { ok: false, erro: fraseDoErro(error) };
  const o = obj(data);
  if (!o || o.ok !== true) return { ok: false, erro: 'O banco não confirmou o lote.' };
  const sims: SimulacaoDaTransferencia[] = [];
  if (simular) {
    for (const x of Array.isArray(o.itens) ? o.itens : []) {
      const s = lerSimulacao(x);
      if (!s) return { ok: false, erro: 'Não deu para prever o lote. Nada foi gravado.' };
      sims.push(s);
    }
  }
  return { ok: true, sims, transferencias: num(o.transferencias) ?? 0, espelhos: num(o.espelhos) ?? 0 };
}

export async function sugestoesDeTransferencia(contaId: string, de: string, ate: string): Promise<Map<string, SugestaoDeTransferencia>> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- idioma documentado: o `.rpc` do repo (função fora dos tipos gerados)
  const { data, error } = await (supabase as any).rpc('fn_extrato_transferencias_provaveis', { p_conta: contaId, p_de: de, p_ate: ate });
  const m = new Map<string, SugestaoDeTransferencia>();
  if (error || !Array.isArray(data)) return m;
  for (const x of data) { const s = lerSugestao(x); if (s) m.set(s.extratoId, s); }
  return m;
}
