/**
 * FECH-ROTACAO-01 · FATIA 3 — o lote do card no grupo de pastejo (e na rotação avulsa), no Fechamento de pastos.
 *
 * Decisões do Gabriel (01/11): a alocação é POR CARD (lote '' = o card inteiro, F3-1); o padrão "grupo inteiro" é GRAVADO no salvar
 * (F3-2: a conta nunca usa o grupo de hoje — o histórico congela no mês); card + alocação numa transação só (F3-3,
 * `fn_fechamento_pasto_salvar_com_alocacao`); vedar quem recebe lote é recusado no banco (F3-4a) e quem recebe não entra na lista de
 * "vazios → vedado" do fechar em lote (F3-4b).
 * Os números da lotação saem da `fn_lotacao_do_mes` (rateio por área): sem alocação são os de hoje, linha a linha (portão da fatia 1).
 */
import { supabase } from '@/integrations/supabase/client';
import { calcUA } from '@/lib/calculos/zootecnicos';
import { fraseDoErro } from '@/lib/patrimonio/patrimonio';

export interface LotacaoDoPasto {
  pastoId: string;
  grupoId: string | null;
  areaHa: number | null;
  cabecas: number;
  ua: number;
  uaHa: number | null;
  recebeDeOutroCard: boolean;
}

export interface AlocacaoDoMes { fechamentoId: string; lote: string; pastoId: string }

/** O pasto como o lote o vê. ⚠ A `area` é a do MÊS (PASTO-AREA-OFICIAL-02a: quem monta usa `areaNoMesOuHoje` com o `areaDe` de
 *  `useAreaDosPastosNoMes`), nunca o cadastro de hoje lido aqui. */
export interface PastoDoLote { id: string; nome: string; area: number | null; grupo_id?: string | null }

export type Resultado<T> = { ok: true; dados: T; erro?: undefined } | { ok: false; erro: string; dados?: undefined };

/* ── leitura das respostas do banco, sem `as` ──────────────────────────────────────────────────────────────────────────────── */

const ehObjeto = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const texto = (v: unknown): string | null => (typeof v === 'string' ? v : null);
const numero = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : typeof v === 'string' && v.trim() !== '' && Number.isFinite(Number(v)) ? Number(v) : null);

export function lerLotacao(linhas: unknown): Map<string, LotacaoDoPasto> {
  const mapa = new Map<string, LotacaoDoPasto>();
  if (!Array.isArray(linhas)) return mapa;
  for (const l of linhas) {
    if (!ehObjeto(l)) continue;
    const id = texto(l.pasto_id);
    if (!id) continue;
    mapa.set(id, {
      pastoId: id, grupoId: texto(l.grupo_id), areaHa: numero(l.area_ha), cabecas: numero(l.cabecas) ?? 0, ua: numero(l.ua) ?? 0,
      uaHa: numero(l.ua_ha), recebeDeOutroCard: l.recebe_de_outro_card === true,
    });
  }
  return mapa;
}

export function lerAlocacoes(linhas: unknown): AlocacaoDoMes[] {
  if (!Array.isArray(linhas)) return [];
  return linhas.flatMap((l) => {
    if (!ehObjeto(l)) return [];
    const f = texto(l.fechamento_id); const p = texto(l.pasto_id);
    return f && p ? [{ fechamentoId: f, lote: texto(l.lote) ?? '', pastoId: p }] : [];
  });
}

/* ── as contas da tela (puras) ─────────────────────────────────────────────────────────────────────────────────────────────── */

/** Quem RECEBE o lote de outro card no mês: pasto de destino → pastos de origem (o próprio card não conta). */
export function quemRecebe(alocacoes: readonly AlocacaoDoMes[], cards: ReadonlyArray<{ id: string; pasto_id: string }>): Map<string, string[]> {
  const pastoDoCard = new Map(cards.map((c) => [c.id, c.pasto_id]));
  const mapa = new Map<string, string[]>();
  for (const a of alocacoes) {
    const origem = pastoDoCard.get(a.fechamentoId);
    if (!origem || origem === a.pastoId) continue;
    const lista = mapa.get(a.pastoId) ?? [];
    if (!lista.includes(origem)) mapa.set(a.pastoId, [...lista, origem]);
  }
  return mapa;
}

/** F3-4b — os cards que o "fechar em lote" propõe marcar Vedado: sem destino do mês, sem itens e que NÃO recebem lote de outro card. */
export function propostosComoVedado(candidatos: readonly string[], comItens: ReadonlySet<string>, cards: ReadonlyArray<{ id: string; pasto_id: string }>,
  recebe: ReadonlyMap<string, readonly string[]>): string[] {
  const pastoDoCard = new Map(cards.map((c) => [c.id, c.pasto_id]));
  return candidatos.filter((id) => !comItens.has(id) && !recebe.has(pastoDoCard.get(id) ?? ''));
}

/** Os pastos onde o lote DESTE card está gravado (ou null: sem alocação = só o pasto do card). */
export function alocacaoDoCard(alocacoes: readonly AlocacaoDoMes[], fechamentoId: string): string[] | null {
  const ids = alocacoes.filter((a) => a.fechamentoId === fechamentoId && a.lote === '').map((a) => a.pastoId);
  return ids.length > 0 ? ids : null;
}

/** O padrão "grupo inteiro" (decisão 2): o próprio pasto + os membros do grupo que podem receber no mês (sem vedado, sem fechado). */
export function grupoInteiro(pastoId: string, membros: readonly PastoDoLote[], impedidos: ReadonlySet<string>): string[] {
  return [pastoId, ...membros.map((m) => m.id).filter((id) => id !== pastoId && !impedidos.has(id))];
}

/** Σ das áreas (só as que existem); nenhuma = null (sem número, nunca "0,00"). */
export function somaDasAreas(pastos: ReadonlyArray<Pick<PastoDoLote, 'area'>>): number | null {
  const areas = pastos.map((p) => p.area).filter((a): a is number => a != null && Number.isFinite(a) && a > 0);
  return areas.length ? Math.round(areas.reduce((s, a) => s + a, 0) * 100) / 100 : null;
}

/** A UA do card pelos itens (a mesma regra do calcUA): para a linha de efeito, antes de gravar. */
export function uaDosItens(itens: ReadonlyArray<{ quantidade: number; peso_medio_kg: number | null }>): number {
  return itens.reduce((s, i) => s + (i.quantidade > 0 ? calcUA(i.quantidade, i.peso_medio_kg) : 0), 0);
}

/** A faixa do grupo na grade: Σ UA dos membros ÷ Σ área dos membros NÃO vedados no mês (decisões 2 e 4). */
export function resumoDoGrupo(membros: readonly PastoDoLote[], lotacao: ReadonlyMap<string, LotacaoDoPasto>, vedados: ReadonlySet<string>) {
  const ocupaveis = membros.filter((m) => !vedados.has(m.id));
  const area = somaDasAreas(ocupaveis);
  const ua = membros.reduce((s, m) => s + (lotacao.get(m.id)?.ua ?? 0), 0);
  const cab = membros.reduce((s, m) => s + (lotacao.get(m.id)?.cabecas ?? 0), 0);
  return {
    piquetes: membros.length, areaHa: area, cabecas: Math.round(cab), ua,
    uaHa: area && ua > 0 ? ua / area : null,
    vedados: membros.filter((m) => vedados.has(m.id)).map((m) => m.nome),
  };
}

/**
 * O que o salvar manda em `p_pasto_ids` (F3-2 e F3-3):
 *  · null  = não mexe na alocação (pasto sem grupo, sem "também esteve em" e sem alocação gravada: o salvar de sempre);
 *  · []    = apaga a alocação (o card ficou sem cabeça, ou voltou a "só este pasto");
 *  · lista = o lote nesses pastos (o próprio sempre primeiro).
 */
export function pastosParaGravar(p: { pastoId: string; escolhidos: readonly string[]; temCabeca: boolean; temGrupo: boolean; gravada: readonly string[] | null }): string[] | null {
  const lista = [p.pastoId, ...p.escolhidos.filter((id) => id !== p.pastoId)];
  if (!p.temCabeca) return p.gravada ? [] : null;
  if (lista.length === 1) return p.gravada || p.temGrupo ? [] : null;
  return lista;
}

/* ── o banco ───────────────────────────────────────────────────────────────────────────────────────────────────────────────── */

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- tabela e RPCs novas fora do `types.ts` (a exceção do zero-cast, como `patrimonioApi`)
const semTipo: any = supabase;

export const API_LOTE_NO_GRUPO = {
  async lotacaoDoMes(fazendaId: string, anoMes: string): Promise<Resultado<Map<string, LotacaoDoPasto>>> {
    const { data, error } = await semTipo.rpc('fn_lotacao_do_mes', { p_fazenda_id: fazendaId, p_ano_mes: anoMes });
    if (error) return { ok: false, erro: fraseDoErro(error, 'Não consegui ler a lotação do mês.') };
    return { ok: true, dados: lerLotacao(data) };
  },
  async alocacoesDoMes(fazendaId: string, anoMes: string): Promise<Resultado<AlocacaoDoMes[]>> {
    const { data, error } = await semTipo.from('fechamento_alocacoes').select('fechamento_id, lote, pasto_id').eq('fazenda_id', fazendaId).eq('ano_mes', anoMes);
    if (error) return { ok: false, erro: fraseDoErro(error, 'Não consegui ler onde os lotes estiveram.') };
    return { ok: true, dados: lerAlocacoes(data) };
  },
};

/** O card + a alocação numa transação (F3-3). A recusa do banco vem como frase pronta (P0001) ou genérica (o resto vai ao console). */
export async function salvarCardComAlocacaoNoBanco(fechamentoId: string, campos: Record<string, unknown>, itens: readonly Record<string, unknown>[],
  pastoIds: string[] | null): Promise<{ ok: true; erro: null } | { ok: false; erro: string }> {
  const { error } = await semTipo.rpc('fn_fechamento_pasto_salvar_com_alocacao', { p_fechamento_id: fechamentoId, p_campos: campos, p_itens: itens, p_pasto_ids: pastoIds });
  if (error) { console.error(error); return { ok: false, erro: error.message || 'Não foi possível salvar o pasto.' }; }
  return { ok: true, erro: null };
}
