/**
 * MAPA-PIQUETES-03 — os grupos que nasceram de um pasto (`pasto_grupos.pasto_origem_id`, 20261028117080) das fazendas do mapa: é por eles que
 * o mapa junta o pai e o grupo numa UNIDADE (`unidadesDoMapa`). Grupo montado no cadastro (sem origem) não entra.
 * Falha da leitura: o mapa segue pasto a pasto, como antes (nunca esconde pasto), e o erro fica em `erro` e no console.
 * ⚠ Leitura que termina depois de a fazenda mudar não escreve (OC-ABRIR-LENTO-01).
 */
import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import type { GrupoComOrigem } from '@/lib/mapa/unidadesDoMapa';

function lerGrupos(dado: unknown): GrupoComOrigem[] {
  if (!Array.isArray(dado)) return [];
  const saida: GrupoComOrigem[] = [];
  for (const l of dado) {
    if (!l || typeof l !== 'object') continue;
    const id = Reflect.get(l, 'id'); const nome = Reflect.get(l, 'nome'); const origem = Reflect.get(l, 'pasto_origem_id'); const ativo = Reflect.get(l, 'ativo');
    if (typeof id !== 'string' || typeof nome !== 'string' || typeof origem !== 'string') continue;
    saida.push({ id, nome, pasto_origem_id: origem, ativo: ativo !== false });
  }
  return saida;
}

export function useGruposComOrigem(fazendaIds: readonly string[]): { grupos: GrupoComOrigem[]; erro: string | null } {
  const chave = [...fazendaIds].sort().join(',');
  const [estado, setEstado] = useState<{ chave: string; grupos: GrupoComOrigem[]; erro: string | null }>({ chave: '', grupos: [], erro: null });
  useEffect(() => {
    if (!chave) { setEstado({ chave: '', grupos: [], erro: null }); return; }
    let vivo = true;
    void (async () => {
      let data: unknown = null; let error: unknown = null;
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any -- idioma documentado: a coluna nova ainda não está no types.ts
        const r = await (supabase as any).from('pasto_grupos').select('id, nome, pasto_origem_id, ativo')
          .in('fazenda_id', chave.split(',')).not('pasto_origem_id', 'is', null);
        data = r.data; error = r.error;
      } catch (e) { error = e; }   // MAPA-PIQUETES-04: falha que lança também vira o "segue pasto a pasto" (nunca derruba a tela)
      if (!vivo) return;
      if (error) {
        console.error('[useGruposComOrigem]', error);
        setEstado({ chave, grupos: [], erro: 'Não foi possível ler as divisões dos pastos.' });
        return;
      }
      setEstado({ chave, grupos: lerGrupos(data), erro: null });
    })();
    return () => { vivo = false; };
  }, [chave]);
  return estado.chave === chave ? { grupos: estado.grupos, erro: estado.erro } : { grupos: [], erro: null };
}
