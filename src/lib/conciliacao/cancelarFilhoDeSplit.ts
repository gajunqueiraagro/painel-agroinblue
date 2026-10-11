/**
 * FILHO DE DESMEMBRAMENTO NÃO SE CANCELA SOZINHO — CONC-SPLIT-FILHO-CANCELADO-01 passo 2, commit B (Gabriel, 11/10/2026).
 *
 * O dono, na tela, do aviso que substitui o cancelamento de um lançamento que é filho de um desmembramento VIVO da Mesa.
 * QUEM RESPONDE "é filho de split vivo?" É O BANCO (`fn_split_do_lancamento`, o mesmo dono da trava
 * `trg_guard_split_filho_cancelar`); aqui só se lê a resposta, se escrevem as frases e se pede o desfazer ao dono dele
 * (`fn_classificacao_desfazer_split`). Nenhuma conta: os números (soma dos vivos, valor do extrato) são os do banco.
 *
 * ⚠ O `staging_id` QUE O DESFAZER PEDE NÃO VEM NO RETORNO de `fn_split_do_lancamento`. O caminho, sem migration, é a view que a
 *   Mesa já lê (`vw_classificacao_staging_preview`, que expõe `staging_id` e `split_id`): UMA linha da importação com aquele
 *   split. A tela NÃO lê `classificacao_split_itens`.
 */
import { supabase } from '@/integrations/supabase/client';

export interface FilhoDoSplit { lancamentoId: string; descricao: string; valor: number; cancelado: boolean; este: boolean }

export interface SplitDoLancamento {
  splitId: string;
  extrato: { id: string; data: string; valor: number; descricao: string; contaNome: string };
  sessaoId: string | null;
  filhos: FilhoDoSplit[];
  totalFilhos: number;
  somaVivos: number;
  desfazivel: boolean;
  motivoNaoDesfazivel: string | null;
}

/* ── frases (um lugar só) ───────────────────────────────────────────────── */

export const TITULO_DO_SPLIT = 'Este lançamento veio de um desmembramento';
export const FRASE_DO_SPLIT =
  'Um filho não se cancela sozinho: o extrato ficaria parcial e sem saída. Desfaça o desmembramento inteiro e refaça pela Mesa.';
export const ROTULO_DESFAZER_SPLIT = 'Desfazer desmembramento';
export const NAO_DESFAZIVEL_SEM_MOTIVO = 'Este desmembramento não pode ser desfeito por aqui.';
export const NAO_ACHOU_A_LINHA = 'Não foi possível achar a linha da importação deste desmembramento. Desfaça pela Mesa do Enriquecer.';
const NAO_LEU = 'O banco devolveu uma resposta que a tela não soube ler.';
const FALHA = 'Falha ao falar com o banco.';

/**
 * A frase das portas que NÃO abrem o diálogo (as que cancelam pelo hook e o lote). Escrita AQUI, com os números da leitura —
 * a mensagem crua do banco não atravessa o normalizador de erros do hook (que só deixa passar frase autorada pela tela).
 */
export function fraseDaTravaDoSplit(s: SplitDoLancamento): string {
  return `Este lançamento é parte do desmembramento do extrato de ${dataCurta(s.extrato.data)} (${moeda(Math.abs(s.extrato.valor))}, `
    + `${s.totalFilhos} lançamentos). Não se cancela sozinho: desfaça o desmembramento pela Mesa do Enriquecer.`;
}

export const fraseDoLoteDeSplit = (n: number): string =>
  `${n === 1 ? '1 parte' : `${n} partes`} de desmembramento: desfaça pela Mesa.`;

/* ── leitura ────────────────────────────────────────────────────────────── */

const obj = (v: unknown): Record<string, unknown> | null =>
  typeof v === 'object' && v !== null && !Array.isArray(v) ? Object.fromEntries(Object.entries(v)) : null;
const texto = (v: unknown): string | null => (typeof v === 'string' ? v : null);
const numero = (v: unknown): number | null => {
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  if (typeof v === 'string' && v.trim() !== '') { const n = Number(v); return Number.isFinite(n) ? n : null; }
  return null;
};

/** Lê o retorno de `fn_split_do_lancamento`. `null` do banco = não é filho de split vivo; peça torta também = `null`. */
export function lerSplitDoLancamento(json: unknown): SplitDoLancamento | null {
  const r = obj(json);
  if (!r) return null;
  const splitId = texto(r.split_id);
  const e = obj(r.extrato);
  if (!splitId || !e || !Array.isArray(r.filhos)) return null;
  const extratoId = texto(e.id); const data = texto(e.data); const valor = numero(e.valor);
  if (!extratoId || !data || valor === null) return null;
  const filhos: FilhoDoSplit[] = [];
  for (const bruto of r.filhos) {
    const f = obj(bruto);
    const lancamentoId = f ? texto(f.lancamento_id) : null;
    if (!f || !lancamentoId) return null;
    const v = numero(f.valor);
    if (v === null && f.valor !== null && f.valor !== undefined) return null;
    filhos.push({ lancamentoId, descricao: texto(f.descricao) ?? '', valor: v ?? 0, cancelado: f.cancelado === true, este: f.este === true });
  }
  const totalFilhos = numero(r.total_filhos); const somaVivos = numero(r.soma_vivos);
  if (totalFilhos === null || somaVivos === null || typeof r.desfazivel !== 'boolean') return null;
  return {
    splitId,
    extrato: { id: extratoId, data, valor, descricao: texto(e.descricao) ?? '', contaNome: texto(e.conta_nome) ?? '' },
    sessaoId: texto(obj(r.importacao)?.sessao_id),
    filhos, totalFilhos, somaVivos,
    desfazivel: r.desfazivel,
    motivoNaoDesfazivel: texto(r.motivo_nao_desfazivel),
  };
}

/* ── o que o diálogo escreve ────────────────────────────────────────────── */

export const moeda = (v: number): string => `R$ ${v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
/** 'AAAA-MM-DD' -> 'DD/MM/AA', sem passar por `Date` (data de calendário não tem fuso) */
export function dataCurta(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  return m ? `${m[3]}/${m[2]}/${m[1].slice(2)}` : iso;
}

export function situacaoDoFilho(f: FilhoDoSplit): string {
  return f.cancelado ? 'cancelado' : f.este ? 'este lançamento' : 'vivo';
}

/** soma dos vivos × valor do extrato: os dois números do banco, lado a lado; a tela só COMPARA (em centavos). */
export function confrontoDoSplit(s: SplitDoLancamento): { vivos: string; extrato: string; confere: boolean } {
  const extrato = Math.abs(s.extrato.valor);
  return { vivos: moeda(s.somaVivos), extrato: moeda(extrato), confere: Math.round(s.somaVivos * 100) === Math.round(extrato * 100) };
}

/** Por que o botão está apagado (ou nulo: pode desfazer). O motivo do OPERADOR é cobrado à parte, pelo diálogo. */
export function porQueNaoDesfaz(s: SplitDoLancamento): string | null {
  return s.desfazivel ? null : (s.motivoNaoDesfazivel?.trim() || NAO_DESFAZIVEL_SEM_MOTIVO);
}

/* ── prefiltro e lote ───────────────────────────────────────────────────── */

/** Todo filho de desmembramento nasce com esta origem: quem não a tem não precisa perguntar ao banco. */
export const ORIGEM_DE_FILHO_DE_SPLIT = 'mesa_split';
export const podeSerFilhoDeSplit = (l: { origem_lancamento?: string | null } | null | undefined): boolean =>
  l?.origem_lancamento === ORIGEM_DE_FILHO_DE_SPLIT;

export function separarFilhosDeSplit(ids: readonly string[], filhos: ReadonlySet<string>): { cancelaveis: string[]; puladosSplit: string[] } {
  return { cancelaveis: ids.filter(id => !filhos.has(id)), puladosSplit: ids.filter(id => filhos.has(id)) };
}

/* ── as idas ao banco ───────────────────────────────────────────────────── */

const mensagem = (e: unknown): string =>
  (typeof e === 'object' && e !== null && 'message' in e && typeof e.message === 'string' && e.message) || FALHA;

/**
 * "Este lançamento é filho de desmembramento vivo?" — quem responde é o banco. `null` = não é (ou o banco não respondeu):
 * a porta segue o cancelamento de sempre, e a trava do banco continua valendo.
 */
export async function consultarSplitDoLancamento(lancamentoId: string): Promise<SplitDoLancamento | null> {
  try {
    const { data, error } = await (supabase as any).rpc('fn_split_do_lancamento', { p_lancamento_id: lancamentoId });
    if (error) return null;
    return lerSplitDoLancamento(data);
  } catch {
    return null;
  }
}

/** Dos ids dados, quais são filhos de split vivo. Só pergunta ao banco pelos que têm a origem de filho. */
export async function filhosDeSplitVivo(ids: readonly string[]): Promise<Set<string>> {
  const achados = new Set<string>();
  try {
    for (let i = 0; i < ids.length; i += 100) {
      const { data, error } = await supabase.from('financeiro_lancamentos_v2').select('id')
        .in('id', ids.slice(i, i + 100)).eq('origem_lancamento', ORIGEM_DE_FILHO_DE_SPLIT);
      if (error) continue;
      for (const l of data ?? []) {
        if (await consultarSplitDoLancamento(l.id)) achados.add(l.id);
      }
    }
  } catch {
    /* sem a leitura, a trava do banco continua valendo */
  }
  return achados;
}

/** A linha da importação por onde o dono desfaz o split (qualquer linha dele serve). */
async function stagingDoSplit(s: SplitDoLancamento): Promise<string | null> {
  let q = (supabase as any).from('vw_classificacao_staging_preview').select('staging_id').eq('split_id', s.splitId);
  if (s.sessaoId) q = q.eq('sessao_id', s.sessaoId);
  const { data, error } = await q.limit(1);
  if (error || !Array.isArray(data)) return null;
  return texto(obj(data[0])?.staging_id);
}

/** Desfaz o desmembramento inteiro pelo dono. Devolve a frase da recusa, ou nulo quando gravou. */
export async function desfazerSplit(alvo: SplitDoLancamento, motivo: string): Promise<string | null> {
  try {
    const stagingId = await stagingDoSplit(alvo);
    if (!stagingId) return NAO_ACHOU_A_LINHA;
    const { data, error } = await (supabase as any).rpc('fn_classificacao_desfazer_split', {
      p_staging_id: stagingId, p_motivo: motivo, p_simular: false,
    });
    if (error) return mensagem(error);
    const r = obj(data);
    if (!r) return NAO_LEU;
    return r.ok === true ? null : (texto(r.mensagem) ?? NAO_LEU);
  } catch (e) {
    return mensagem(e);
  }
}
