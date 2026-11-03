/**
 * MAPA-AREA-TIPO-01 — a classificação do polígono (É pasto / É área + tipo / Sem classificação) SÓ pelo escritor do banco
 * `fn_mapa_geometria_classificar` (prévia por padrão, trilha, memória para o "Atualizar mapa"). Substitui o vínculo direto na tabela.
 * A recusa do banco vem pronta (P0001); sem acesso (42501) vira a frase da casa; outro erro vai ao console e volta uma frase genérica.
 * Nunca toast: quem chama mostra a frase no próprio painel.
 */
import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { argumentosDoEscritor, type DestinoDoPoligono } from '@/lib/mapa/tiposDeArea';

export interface PreviaDaClassificacao {
  semMudanca: boolean;
  de: string;
  para: string;
}

/* forma plana (o TSC do projeto, sem strict, não estreita união pelo `ok`) */
export interface Resultado<T> { ok: boolean; valor: T | null; motivo: string | null }

function rotuloDoLado(lado: unknown): string {
  if (typeof lado !== 'object' || lado === null) return '';
  const rotulo = 'rotulo' in lado && typeof lado.rotulo === 'string' ? lado.rotulo : '';
  const pasto = 'pasto' in lado && typeof lado.pasto === 'string' ? lado.pasto : '';
  return pasto ? `${rotulo} ${pasto}` : rotulo;
}

function frase(error: { code?: string; message?: string }): string {
  if (error.code === 'P0001' && error.message) return error.message;
  if (error.code === '42501') return 'Sem acesso a este polígono.';
  if (error.code === '40001') return 'O polígono foi alterado por outra pessoa. Feche e abra de novo.';
  return 'Não consegui gravar agora. Tente de novo.';
}

export function useClassificarPoligono() {
  const [gravando, setGravando] = useState(false);

  const chamar = useCallback(async (geometriaId: string, destino: DestinoDoPoligono, simular: boolean, motivo?: string): Promise<Resultado<unknown>> => {
    const { data, error } = await (supabase as any).rpc('fn_mapa_geometria_classificar', argumentosDoEscritor(geometriaId, destino, simular, motivo));
    if (error) {
      if (error.code !== 'P0001') console.error('[useClassificarPoligono]', error);
      return { ok: false, valor: null, motivo: frase(error) };
    }
    return { ok: true, valor: data, motivo: null };
  }, []);

  const prever = useCallback(async (geometriaId: string, destino: DestinoDoPoligono): Promise<Resultado<PreviaDaClassificacao>> => {
    const r = await chamar(geometriaId, destino, true);
    if (!r.ok) return { ok: false, valor: null, motivo: r.motivo };
    const d = r.valor;
    const semMudanca = typeof d === 'object' && d !== null && 'sem_mudanca' in d && d.sem_mudanca === true;
    const de = typeof d === 'object' && d !== null && 'de' in d ? rotuloDoLado(d.de) : '';
    const para = typeof d === 'object' && d !== null && 'para' in d ? rotuloDoLado(d.para) : '';
    return { ok: true, valor: { semMudanca, de, para }, motivo: null };
  }, [chamar]);

  const gravar = useCallback(async (geometriaId: string, destino: DestinoDoPoligono, motivo?: string): Promise<Resultado<true>> => {
    setGravando(true);
    try {
      const r = await chamar(geometriaId, destino, false, motivo);
      return r.ok ? { ok: true, valor: true, motivo: null } : { ok: false, valor: null, motivo: r.motivo };
    } finally {
      setGravando(false);
    }
  }, [chamar]);

  return { prever, gravar, gravando };
}

/**
 * MAPA-AREA-TIPOS-02 — o NOME do grupo de pastejo do pasto (`pasto_grupos`, o "piquete de 20A-1" da prévia sem mudança). Leitura que chega
 * depois de o grupo mudar não escreve; falha = sem nome (a frase sai sem o grupo, nunca errada).
 */
export function useNomeDoGrupo(grupoId: string | null | undefined): string | null {
  const [lido, setLido] = useState<{ id: string; nome: string | null } | null>(null);
  useEffect(() => {
    if (!grupoId) return;
    let vivo = true;
    (async () => {
      try {
        const { data, error } = await (supabase as any).from('pasto_grupos').select('nome').eq('id', grupoId).maybeSingle();
        if (!vivo) return;
        if (error) { console.error('[useNomeDoGrupo]', error); setLido({ id: grupoId, nome: null }); return; }
        const nome = data && typeof data === 'object' && 'nome' in data && typeof data.nome === 'string' ? data.nome : null;
        setLido({ id: grupoId, nome });
      } catch (e) {
        if (vivo) { console.error('[useNomeDoGrupo]', e); setLido({ id: grupoId, nome: null }); }
      }
    })();
    return () => { vivo = false; };
  }, [grupoId]);
  return grupoId && lido?.id === grupoId ? lido.nome : null;
}
