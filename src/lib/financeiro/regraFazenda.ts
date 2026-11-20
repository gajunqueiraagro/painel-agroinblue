/**
 * FIN-REGRA-VARIAVEL-FAZENDA-01 (Gabriel 19/11 09:52) — a regra fazenda × conta tem UM dono: o banco (`_fn_regra_fazenda_da_conta`, lote 114260).
 * A tela só PERGUNTA (`fn_regra_fazenda_da_conta`) e mostra a frase; os gatilhos recusam o que passar. Aqui: a pergunta, a lista do que já está
 * fora da regra (`fn_lancamentos_regra_fazenda_pendentes`), a troca em lote com prévia e desfazer (`fn_lancamentos_trocar_fazenda`) e as
 * leituras puras (o texto do selo, as parcelas do mesmo contrato).
 */
import { supabase } from '@/integrations/supabase/client';
import { notificarLancamentosMudaram } from '@/hooks/useFinanceiroV2';

/** A regra só vale no lançamento NOVO ou quando a fazenda ou a conta MUDAM (o legado continua editável nos outros campos — o mesmo do gatilho). */
export function regraValeAqui(a: { novo: boolean; fazendaDe: string | null; planoDe: string | null; fazenda: string | null; plano: string | null }): boolean {
  if (!a.plano) return false;
  if (a.novo) return true;
  return (a.fazendaDe ?? null) !== (a.fazenda ?? null) || (a.planoDe ?? null) !== (a.plano ?? null);
}

const frase = (e: { message?: unknown } | null, padrao: string) => (e && typeof e.message === 'string' && e.message ? e.message : padrao);

/** A frase da regra para a conta × fazenda (nulo = passa). Erro de rede não trava a tela: o gatilho do banco é a última palavra. */
export async function perguntarRegraFazenda(plano: string, fazenda: string | null): Promise<string | null> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- idioma documentado: o `.rpc` do repo
  const { data, error } = await (supabase as any).rpc('fn_regra_fazenda_da_conta', { p_plano: plano, p_fazenda: fazenda });
  if (error) return null;
  return typeof data === 'string' && data ? data : null;
}

export interface PendenteDaRegra {
  id: string;
  competencia: string;
  valor: number;
  descricao: string;
  status: string;
  fornecedor: string | null;
  subcentro: string;
  grupoCusto: string;
  fazendaId: string | null;
  regra: string;
  financiamentoId: string | null;
  conciliado: boolean;
  mesFechado: boolean;
  /** (a) a fazenda pelo histórico do fornecedor (só fazenda que passa na regra) */
  sugestao: { fazendaId: string; vezes: number; de: number; origem: string } | null;
  /** (b) só no custo fixo de atividade: a conta administrativa equivalente */
  contaAdm: { planoContaId: string; subcentro: string } | null;
}

const texto = (o: object, k: string): string | null => { const v: unknown = Reflect.get(o, k); return typeof v === 'string' ? v : null; };
const num = (o: object, k: string) => Number(Reflect.get(o, k)) || 0;
const obj = (o: object, k: string): object | null => { const v: unknown = Reflect.get(o, k); return v && typeof v === 'object' ? v : null; };

export function lerPendentes(r: unknown): PendenteDaRegra[] {
  if (!Array.isArray(r)) return [];
  return r.filter((x): x is object => !!x && typeof x === 'object').flatMap((o) => {
    const id = texto(o, 'id');
    if (!id) return [];
    const s = obj(o, 'sugestao');
    const a = obj(o, 'conta_adm');
    const sFaz = s ? texto(s, 'fazenda_id') : null;
    const aPlano = a ? texto(a, 'plano_conta_id') : null;
    return [{
      id, competencia: texto(o, 'competencia') ?? '', valor: num(o, 'valor'), descricao: texto(o, 'descricao') ?? '—', status: texto(o, 'status') ?? '',
      fornecedor: texto(o, 'fornecedor'), subcentro: texto(o, 'subcentro') ?? '—', grupoCusto: texto(o, 'grupo_custo') ?? '', fazendaId: texto(o, 'fazenda_id'),
      regra: texto(o, 'regra') ?? '', financiamentoId: texto(o, 'financiamento_id'),
      conciliado: Reflect.get(o, 'conciliado') === true, mesFechado: Reflect.get(o, 'mes_fechado') === true,
      sugestao: s && sFaz ? { fazendaId: sFaz, vezes: num(s, 'vezes'), de: num(s, 'de'), origem: texto(s, 'origem') ?? '' } : null,
      contaAdm: a && aPlano ? { planoContaId: aPlano, subcentro: texto(a, 'subcentro') ?? '—' } : null,
    }];
  });
}

export async function carregarPendentesDaRegra(clienteId: string): Promise<PendenteDaRegra[] | { erro: string }> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- idioma documentado: o `.rpc` do repo
  const { data, error } = await (supabase as any).rpc('fn_lancamentos_regra_fazenda_pendentes', { p_cliente: clienteId });
  if (error) return { erro: frase(error, 'Não foi possível ler os lançamentos fora da regra.') };
  return lerPendentes(data);
}

/** O texto do selo: "N despesas no Administrativo" quando todas são do Administrativo (o caso do Gabriel); senão o geral. */
export function textoDoSelo(p: readonly PendenteDaRegra[]): string {
  const n = p.length;
  if (p.every((x) => /Administrativo:/.test(x.regra))) return `${n} ${n === 1 ? 'despesa' : 'despesas'} no Administrativo`;
  return `${n} ${n === 1 ? 'lançamento' : 'lançamentos'} com a fazenda fora da regra`;
}

/** As parcelas do MESMO contrato corrigem juntas (Seguro Vida 1/12…7/12, Starvac 2/5…5/5): o financiamento, ou a descrição sem o "k/N". */
export function chaveDoContrato(p: PendenteDaRegra): string {
  if (p.financiamentoId) return `fin:${p.financiamentoId}`;
  const base = p.descricao.replace(/\s*[-–]?\s*(parc\.?\s*)?\d+\s*\/\s*\d+\s*$/i, '').replace(/\s*[-–]\s*parc\.?\s*\d+\s*$/i, '').trim().toLowerCase();
  return `d:${base}|${(p.fornecedor ?? '').toLowerCase()}|${p.subcentro.toLowerCase()}|${Math.round(p.valor * 100)}`;
}

/** O destino de uma linha no modal: uma fazenda, ou (custo fixo de atividade) a conta administrativa equivalente. */
export type DestinoDaCorrecao = { tipo: 'fazenda'; fazendaId: string } | { tipo: 'conta'; planoContaId: string };

export function destinoPadrao(p: PendenteDaRegra): DestinoDaCorrecao | null {
  return p.sugestao ? { tipo: 'fazenda', fazendaId: p.sugestao.fazendaId } : null;
}

export const chaveDoDestino = (d: DestinoDaCorrecao) => (d.tipo === 'fazenda' ? `f:${d.fazendaId}` : `c:${d.planoContaId}`);
export function destinoDaChave(k: string): DestinoDaCorrecao | null {
  if (k.startsWith('f:') && k.length > 2) return { tipo: 'fazenda', fazendaId: k.slice(2) };
  if (k.startsWith('c:') && k.length > 2) return { tipo: 'conta', planoContaId: k.slice(2) };
  return null;
}

/** As linhas marcadas agrupadas por destino (a função troca UM destino por chamada). */
export function gruposPorDestino(marcados: readonly { id: string; destino: DestinoDaCorrecao }[]): { destino: DestinoDaCorrecao; ids: string[] }[] {
  const m = new Map<string, { destino: DestinoDaCorrecao; ids: string[] }>();
  for (const x of marcados) {
    const k = chaveDoDestino(x.destino);
    const g = m.get(k) ?? { destino: x.destino, ids: [] };
    g.ids.push(x.id);
    m.set(k, g);
  }
  return [...m.values()];
}

export interface ResultadoDaTrocaDeFazenda { ok: boolean; recusas: string[]; trocaId: string | null; linhas: number }
export function lerTrocaDeFazenda(r: unknown): ResultadoDaTrocaDeFazenda {
  if (!r || typeof r !== 'object') return { ok: false, recusas: ['Resposta fora do formato.'], trocaId: null, linhas: 0 };
  const rec: unknown = Reflect.get(r, 'recusas');
  const lin: unknown = Reflect.get(r, 'linhas');
  return {
    ok: Reflect.get(r, 'ok') === true,
    recusas: Array.isArray(rec) ? rec.filter((x): x is string => typeof x === 'string') : [],
    trocaId: texto(r, 'troca_id'), linhas: Array.isArray(lin) ? lin.length : 0,
  };
}

export async function trocarFazenda(clienteId: string, ids: readonly string[], destino: DestinoDaCorrecao, motivo: string, simular: boolean): Promise<ResultadoDaTrocaDeFazenda> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- idioma documentado: o `.rpc` do repo
  const { data, error } = await (supabase as any).rpc('fn_lancamentos_trocar_fazenda', {
    p_cliente: clienteId, p_ids: [...ids], p_fazenda: destino.tipo === 'fazenda' ? destino.fazendaId : null,
    p_plano: destino.tipo === 'conta' ? destino.planoContaId : null, p_motivo: motivo, p_simular: simular });
  if (error) return { ok: false, recusas: [frase(error, 'A troca não foi feita.')], trocaId: null, linhas: 0 };
  const r = lerTrocaDeFazenda(data);
  if (!simular && r.ok) notificarLancamentosMudaram(clienteId);
  return r;
}

export async function desfazerTrocaDeFazenda(clienteId: string, trocaId: string): Promise<string | null> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- idioma documentado: o `.rpc` do repo
  const { data, error } = await (supabase as any).rpc('fn_lancamentos_trocar_fazenda_desfazer', { p_troca: trocaId });
  if (error) return frase(error, 'A troca não foi desfeita.');
  if (data && typeof data === 'object' && Reflect.get(data, 'ok') !== true) return texto(data, 'recusa') ?? 'A troca não foi desfeita.';
  notificarLancamentosMudaram(clienteId);
  return null;
}
