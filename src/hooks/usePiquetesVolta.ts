/**
 * MAPA-CRIAR-PIQUETES-01 fatia 2b — as três chamadas do caminho de volta dos piquetes: `fn_piquetes_mover_linha`, `fn_piquetes_juntar` e
 * `fn_piquetes_desfazer`. A PRÉVIA é a própria função com `p_simular = true` (devolve exatamente o que gravaria); recusa do banco (P0001) vem em
 * frase pronta e vai ao diálogo (nunca toast); 40001 = "alguém mexeu, recarregue". P146: falha nunca vira prévia vazia (`Consulta`).
 */
import { supabase } from '@/integrations/supabase/client';
import type { Consulta } from '@/lib/financeiro/nfeConsultas';
import {
  fraseDaVolta, lerDesfazer, lerJuntar, lerMoverLinha,
  type PreviaDesfazer, type PreviaJuntar, type PreviaMoverLinha,
} from '@/lib/mapa/piquetesVolta';

const NAO_ENTENDI = 'A resposta do banco veio num formato que a tela não entende. Nada foi gravado.';

async function chamar<T>(fn: string, args: Record<string, unknown>, ler: (d: unknown) => T | null): Promise<Consulta<T>> {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- idioma documentado: as funções novas ainda não estão no types.ts
    const { data, error } = await (supabase as any).rpc(fn, args);
    if (error) return { ok: false, motivo: fraseDaVolta(error) };
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
