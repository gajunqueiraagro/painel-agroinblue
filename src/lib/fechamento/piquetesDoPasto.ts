/**
 * FECH-PASTO-UNIDADE-01 F2 — o que o modal do pasto lê além do card: os piquetes do pasto vigentes no mês (piquete = pasto num grupo ATIVO
 * cuja origem é este pasto, a regra da `_fn_pai_do_piquete`) e o card do mês anterior com as linhas por piquete.
 * Falha de leitura nunca vira lista vazia (P146): volta `{ ok: false, motivo }` e o modal diz.
 */
import { supabase } from '@/integrations/supabase/client';
import { isPastoAtivoNoMes } from '@/hooks/usePastos';
import { areaDeDaLista, lerAreaDosPastosNoMes } from '@/lib/pastos/areaDoPastoNoMes';
import type { LinhaDoCard } from '@/lib/fechamento/porPiquetes';

export type Lido<T> = { ok: true; valor: T } | { ok: false; motivo: string };

export interface PiqueteDoPasto {
  id: string;
  nome: string;
  /** a área DO MÊS (PASTO-AREA-OFICIAL-02a: nunca a de hoje); null = não deu para ler (o subtotal mostra só as cabeças) */
  area_ha: number | null;
}

const ordemNatural = (a: { nome: string }, b: { nome: string }) => a.nome.localeCompare(b.nome, 'pt-BR', { numeric: true });

export function mesAnteriorDe(anoMes: string): string {
  const [a, m] = anoMes.split('-').map(Number);
  return m === 1 ? `${a - 1}-12` : `${a}-${String(m - 1).padStart(2, '0')}`;
}

/** os piquetes vigentes no mês + o nome de qualquer outro piquete citado (`outrosIds`: os que já têm linha no card) */
export async function lerPiquetesDoPasto(pastoId: string, anoMes: string, outrosIds: readonly string[] = []): Promise<Lido<{ doMes: PiqueteDoPasto[]; nomes: Map<string, string> }>> {
  const semTipo = supabase as any;
  const grupos = await semTipo.from('pasto_grupos').select('id').eq('pasto_origem_id', pastoId).eq('ativo', true);
  if (grupos.error) { console.error(grupos.error); return { ok: false, motivo: 'Não consegui ler os piquetes do pasto.' }; }
  const grupoIds: string[] = (grupos.data ?? []).map((g: { id: string }) => g.id);
  let doGrupo: { id: string; nome: string; fazenda_id: string; ativo: boolean; data_inicio: string | null; data_fim: string | null }[] = [];
  if (grupoIds.length > 0) {
    const r = await semTipo.from('pastos').select('id, nome, fazenda_id, ativo, data_inicio, data_fim').in('grupo_id', grupoIds).neq('id', pastoId);
    if (r.error) { console.error(r.error); return { ok: false, motivo: 'Não consegui ler os piquetes do pasto.' }; }
    doGrupo = r.data ?? [];
  }
  const vigentes = doGrupo.filter(p => p.ativo && isPastoAtivoNoMes(p, anoMes));
  /* a área de cada piquete NO MÊS, pela leitura da casa (fn_pastos_area_do_mes); falhou = sem a área no subtotal (só exibição) */
  let areaDe: ReturnType<typeof areaDeDaLista> = () => undefined;
  if (vigentes.length > 0) {
    try { areaDe = areaDeDaLista(await lerAreaDosPastosNoMes([vigentes[0].fazenda_id], anoMes, anoMes)); } catch (e) { console.error(e); }
  }
  const doMes = vigentes.map(p => ({ id: p.id, nome: p.nome, area_ha: areaDe(p.id, anoMes) ?? null })).sort(ordemNatural);
  const nomes = new Map<string, string>(doGrupo.map(p => [p.id, p.nome]));
  const faltam = outrosIds.filter(id => id && !nomes.has(id));
  if (faltam.length > 0) {
    const r = await semTipo.from('pastos').select('id, nome').in('id', faltam);
    if (r.error) { console.error(r.error); return { ok: false, motivo: 'Não consegui ler os piquetes do pasto.' }; }
    for (const p of r.data ?? []) nomes.set(p.id, p.nome);
  }
  return { ok: true, valor: { doMes, nomes } };
}

export interface MesAnteriorDoPasto {
  anoMes: string;
  /** o card não existe no mês anterior */
  semCard: boolean;
  linhas: LinhaDoCard[];
  nomes: Map<string, string>;
}

/** o card do mês anterior deste pasto, com TODAS as linhas (por piquete inclusive) e o nome dos piquetes */
export async function lerMesAnteriorDoPasto(pastoId: string, anoMes: string): Promise<Lido<MesAnteriorDoPasto>> {
  const semTipo = supabase as any;
  const anterior = mesAnteriorDe(anoMes);
  const card = await semTipo.from('fechamento_pastos').select('id').eq('pasto_id', pastoId).eq('ano_mes', anterior).maybeSingle();
  if (card.error) { console.error(card.error); return { ok: false, motivo: 'Não consegui ler o mês anterior.' }; }
  if (!card.data) return { ok: true, valor: { anoMes: anterior, semCard: true, linhas: [], nomes: new Map() } };
  const it = await semTipo.from('fechamento_pasto_itens')
    .select('categoria_id, quantidade, peso_medio_kg, lote, observacoes, origem_dado, lote_id, piquete_id').eq('fechamento_id', card.data.id);
  if (it.error) { console.error(it.error); return { ok: false, motivo: 'Não consegui ler o mês anterior.' }; }
  const linhas: LinhaDoCard[] = (it.data ?? []).filter((l: LinhaDoCard) => l.quantidade > 0);
  const ids = [...new Set(linhas.map(l => l.piquete_id).filter((x): x is string => !!x))];
  const nomes = new Map<string, string>();
  if (ids.length > 0) {
    const r = await semTipo.from('pastos').select('id, nome').in('id', ids);
    if (r.error) { console.error(r.error); return { ok: false, motivo: 'Não consegui ler o mês anterior.' }; }
    for (const p of r.data ?? []) nomes.set(p.id, p.nome);
  }
  return { ok: true, valor: { anoMes: anterior, semCard: false, linhas, nomes } };
}

/** "Voltar a pasto inteiro" — a prévia e a gravação pela `fn_fechamento_pasto_inteiro` (trilha no banco; nenhuma cabeça se perde) */
export async function pastoInteiroNoBanco(fechamentoId: string, simular: boolean): Promise<Lido<{ frase: string; cabecas: number }>> {
  const { data, error } = await (supabase as any).rpc('fn_fechamento_pasto_inteiro', { p_fechamento_id: fechamentoId, p_simular: simular });
  if (error) { console.error(error); return { ok: false, motivo: error.message || 'Não consegui voltar a pasto inteiro.' }; }
  return { ok: true, valor: { frase: String(data?.frase ?? ''), cabecas: Number(data?.cabecas ?? 0) } };
}
