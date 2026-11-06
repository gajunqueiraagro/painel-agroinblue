/**
 * MAPA-CRIAR-PIQUETES-01 fatia 2b — as três chamadas do caminho de volta dos piquetes: `fn_piquetes_mover_linha`, `fn_piquetes_juntar` e
 * `fn_piquetes_desfazer`. A PRÉVIA é a própria função com `p_simular = true` (devolve exatamente o que gravaria); recusa do banco (P0001) vem em
 * frase pronta e vai ao diálogo (nunca toast); 40001 = "alguém mexeu, recarregue". P146: falha nunca vira prévia vazia (`Consulta`).
 */
import { supabase } from '@/integrations/supabase/client';
import type { Consulta } from '@/lib/financeiro/nfeConsultas';
import {
  fraseDaVolta, lerDesfazer, lerDesfazerInicio, lerGravouInicio, lerJuntar, lerMoverLinha, lerMudarInicio, mesFechadoDoErro,
  type InicioDoPiquete, type PreviaDesfazer, type PreviaDesfazerInicio, type PreviaJuntar, type PreviaMoverLinha, type PreviaMudarInicio,
} from '@/lib/mapa/piquetesVolta';

/** A resposta de um gesto de volta: a `Consulta` de sempre; a recusa pode trazer o mês FECHADO que a barrou (PIQUETE-VIGENCIA-01, D3: o link do Reabrir). */
export type RespostaDaVolta<T> = { ok: true; valor: T } | { ok: false; motivo: string; mesFechado?: string | null };

const NAO_ENTENDI = 'A resposta do banco veio num formato que a tela não entende. Nada foi gravado.';

async function chamar<T>(fn: string, args: Record<string, unknown>, ler: (d: unknown) => T | null): Promise<RespostaDaVolta<T>> {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- idioma documentado: as funções novas ainda não estão no types.ts
    const { data, error } = await (supabase as any).rpc(fn, args);
    if (error) return { ok: false, motivo: fraseDaVolta(error), mesFechado: mesFechadoDoErro(error) };
    const lido = ler(data);
    return lido ? { ok: true, valor: lido } : { ok: false, motivo: NAO_ENTENDI };
  } catch (e) {
    return { ok: false, motivo: fraseDaVolta(e) };
  }
}

export interface DivisaoParaMover { id: string; versao: number; geojson: GeoJSON.Geometry }
export interface PedidoMoverLinha { fazendaId: string; alterar: readonly DivisaoParaMover[]; mes: string; motivo: string; simular: boolean }
/** Mover a linha: EXATAMENTE as duas divisões vizinhas do mesmo grupo (o banco recusa de outro jeito). */
export const moverLinha = (p: PedidoMoverLinha) => chamar<PreviaMoverLinha>('fn_piquetes_mover_linha', {
  p_fazenda_id: p.fazendaId, p_gesto: { alterar: p.alterar }, p_mes: p.mes, p_motivo: p.motivo, p_simular: p.simular,
}, lerMoverLinha);

export interface PedidoJuntar {
  ficaPastoId: string; saiPastoId: string; mes: string; uniao: GeoJSON.Polygon; versaoFica: number; versaoSai: number; motivo: string; simular: boolean;
}
/** Juntar: A (a selecionada) absorve B; `uniao` é a união (um Polygon) feita na tela. */
export const juntarDivisoes = (p: PedidoJuntar) => chamar<PreviaJuntar>('fn_piquetes_juntar', {
  p_fica: p.ficaPastoId, p_sai: p.saiPastoId, p_mes: p.mes,
  p_desenho: { geojson: p.uniao, versao_fica: p.versaoFica, versao_sai: p.versaoSai }, p_motivo: p.motivo, p_simular: p.simular,
}, lerJuntar);

export interface PedidoDesfazer { grupoId: string; motivo: string; simular: boolean }
export const desfazerPiquetes = (p: PedidoDesfazer) => chamar<PreviaDesfazer>('fn_piquetes_desfazer', {
  p_grupo: p.grupoId, p_motivo: p.motivo, p_simular: p.simular,
}, lerDesfazer);

/** PIQUETE-VIGENCIA-01: os piquetes de um grupo nascido do Concluir passam a começar noutro mês (antes = antecipar; depois = adiar). */
export interface PedidoMudarInicio { grupoId: string; mes: string; motivo: string; simular: boolean }
export const mudarInicio = (p: PedidoMudarInicio) => chamar<PreviaMudarInicio>('fn_piquetes_mudar_inicio', {
  p_grupo: p.grupoId, p_mes: p.mes, p_motivo: p.motivo, p_simular: p.simular, p_alocar: false,
}, lerMudarInicio);

/** O caminho de volta do gesto acima: desfaz a ÚLTIMA mudança de início ainda não desfeita do grupo. */
export const desfazerMudancaDeInicio = (p: PedidoDesfazer) => chamar<PreviaDesfazerInicio>('fn_piquetes_mudar_inicio_desfazer', {
  p_grupo: p.grupoId, p_motivo: p.motivo, p_simular: p.simular,
}, lerDesfazerInicio);

/** PIQUETE-VIGENCIA-01 (Gabriel 06/11 17:13): a GRAVAÇÃO das duas funções lida pelo leitor dela (a resposta não tem frase, meses nem pastos). */
export const gravarMudancaDeInicio = (p: { grupoId: string; mes: string; motivo: string }) => chamar<{ trilhaId: string }>('fn_piquetes_mudar_inicio', {
  p_grupo: p.grupoId, p_mes: p.mes, p_motivo: p.motivo, p_simular: false, p_alocar: false,
}, lerGravouInicio);
export const gravarDesfazerInicio = (p: { grupoId: string; motivo: string }) => chamar<{ trilhaId: string }>('fn_piquetes_mudar_inicio_desfazer', {
  p_grupo: p.grupoId, p_motivo: p.motivo, p_simular: false,
}, lerGravouInicio);

/** PIQUETE-VIGENCIA-01 (bug do P9): o início de cada piquete ATIVO do grupo, lido do banco na abertura do diálogo (a mesma tabela da função).
 *  O filtro também vai na tela (a bancada não filtra o `.eq`). P146: falha = motivo, nunca lista vazia. */
export async function lerIniciosDoGrupo(grupoId: string): Promise<Consulta<InicioDoPiquete[]>> {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- idioma documentado: `grupo_id` de `pastos` ainda não está no types.ts
    const { data, error } = await (supabase as any).from('pastos').select('id, nome, data_inicio, grupo_id, ativo').eq('grupo_id', grupoId).eq('ativo', true);
    if (error) { console.error('[lerIniciosDoGrupo]', error); return { ok: false, motivo: 'Não consegui ler o início dos piquetes.' }; }
    const linhas: unknown[] = Array.isArray(data) ? data : [];
    const valor: InicioDoPiquete[] = [];
    for (const r of linhas) {
      const id = Reflect.get(Object(r), 'id'), nome = Reflect.get(Object(r), 'nome'), ini = Reflect.get(Object(r), 'data_inicio');
      if (Reflect.get(Object(r), 'grupo_id') !== grupoId || Reflect.get(Object(r), 'ativo') !== true || typeof id !== 'string') continue;
      valor.push({ pastoId: id, nome: typeof nome === 'string' ? nome : '—', inicio: typeof ini === 'string' ? ini : null });
    }
    return { ok: true, valor };
  } catch (e) {
    console.error('[lerIniciosDoGrupo]', e);
    return { ok: false, motivo: 'Não consegui ler o início dos piquetes.' };
  }
}

/** A versão de cada polígono lida na hora (a que vai no gesto é a de agora, nunca a da lista em memória). */
export async function versoesDosPoligonos(ids: readonly string[]): Promise<Consulta<Map<string, number>>> {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- idioma documentado: o `.from` do repo
    const { data, error } = await (supabase as any).from('fazenda_geometrias').select('id, versao').in('id', [...ids]);
    if (error) return { ok: false, motivo: fraseDaVolta(error) };
    const mapa = new Map<string, number>();
    if (Array.isArray(data)) for (const l of data) {
      const id = l && typeof l === 'object' ? Reflect.get(l, 'id') : null;
      const v = l && typeof l === 'object' ? Reflect.get(l, 'versao') : null;
      if (typeof id === 'string' && typeof v === 'number') mapa.set(id, v);
    }
    if (ids.some(id => !mapa.has(id))) return { ok: false, motivo: 'Um dos desenhos não existe mais. Recarregue a tela.' };
    return { ok: true, valor: mapa };
  } catch (e) {
    return { ok: false, motivo: fraseDaVolta(e) };
  }
}
