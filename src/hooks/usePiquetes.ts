/**
 * MAPA-PIQUETES-02 — a espera dos piquetes (só da tela) e as duas chamadas de `fn_piquetes_concluir`: a prévia (p_simular) e o gravar.
 * P146: falha nunca vira prévia vazia (`Consulta`). A recusa do banco (P0001) já vem em frase pronta e vai inteira à tela; outra falha
 * vira a frase da casa (`motivoDoErro`) e o texto cru vai ao console.
 */
import { useCallback, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { motivoDoErro, type Consulta } from '@/lib/financeiro/nfeConsultas';
import {
  lerPrevia, limparPai, marcarPiquete, tirarDaEspera,
  type PiqueteEmEspera, type PoligonoParaPiquete, type PreviaDosPiquetes,
} from '@/lib/mapa/piquetesEmEspera';

/** MAPA-PIQUETES-04: `contorno` = a união das divisões quando o pai não tem polígono (o banco a grava no mesmo gesto); null = o pai já tem. */
export interface PedidoDosPiquetes { paiId: string; geometriaIds: string[]; mes: string; contorno?: GeoJSON.Polygon | null }

function fraseDaRecusa(erro: unknown): string {
  const c = erro && typeof erro === 'object' ? Reflect.get(erro, 'code') : null;
  const m = erro && typeof erro === 'object' ? Reflect.get(erro, 'message') : null;
  if (c === 'P0001' && typeof m === 'string' && m.trim()) return m;
  console.error('[MAPA-PIQUETES-02] fn_piquetes_concluir falhou', erro);
  return `Não consegui concluir: ${motivoDoErro(erro)}.`;
}

async function chamar(p: PedidoDosPiquetes, simular: boolean): Promise<{ dado: unknown; erro: unknown }> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- idioma documentado: o `.rpc` do repo
  const { data, error } = await (supabase as any).rpc('fn_piquetes_concluir', {
    p_pasto_pai: p.paiId, p_geometrias: p.geometriaIds, p_mes: p.mes, p_simular: simular, p_contorno: p.contorno ?? null,
  });
  return { dado: data, erro: error };
}

export async function previaDosPiquetes(p: PedidoDosPiquetes): Promise<Consulta<PreviaDosPiquetes>> {
  try {
    const { dado, erro } = await chamar(p, true);
    if (erro) return { ok: false, motivo: fraseDaRecusa(erro) };
    const previa = lerPrevia(dado);
    return previa ? { ok: true, valor: previa } : { ok: false, motivo: 'A prévia voltou num formato que a tela não entende. Nada foi gravado.' };
  } catch (e) {
    return { ok: false, motivo: fraseDaRecusa(e) };
  }
}

export async function gravarPiquetes(p: PedidoDosPiquetes): Promise<Consulta<{ grupoId: string | null }>> {
  try {
    const { dado, erro } = await chamar(p, false);
    if (erro) return { ok: false, motivo: fraseDaRecusa(erro) };
    const obj = dado && typeof dado === 'object' ? dado : null;
    if (!obj || Reflect.get(obj, 'ok') !== true) return { ok: false, motivo: 'O banco não confirmou a gravação. Atualize a tela antes de tentar de novo.' };
    const g = Reflect.get(obj, 'grupo_id');
    return { ok: true, valor: { grupoId: typeof g === 'string' ? g : null } };
  } catch (e) {
    return { ok: false, motivo: fraseDaRecusa(e) };
  }
}

/** A espera dos piquetes desta tela. `marcar` devolve a recusa local (polígono ligado, classificado ou sem nome) ou null. */
export function usePiquetesEmEspera() {
  const [espera, setEspera] = useState<PiqueteEmEspera[]>([]);
  const marcar = useCallback((p: PoligonoParaPiquete, paiId: string): string | null => {
    const r = marcarPiquete(espera, p, paiId);
    if (r.recusa === null) setEspera(r.espera);
    return r.recusa;
  }, [espera]);
  const tirar = useCallback((geometriaId: string) => setEspera((a) => tirarDaEspera(a, geometriaId)), []);
  const concluido = useCallback((paiId: string) => setEspera((a) => limparPai(a, paiId)), []);
  return { espera, marcar, tirar, concluido };
}
