/**
 * Os romaneios de colheita de uma área plantada — AGRI-COLHEITA-TELA-01.
 *
 * ⚠ A CHAVE É A ÁREA, NÃO O PASTO NEM O MÊS: `agri_colheita.safra_area_id` aponta para
 * `agri_safra_area`, então a entrega pertence ao talhão daquela cultura naquela safra. Um
 * pasto com amendoim e milho tem duas listas de romaneio, e é o que se quer — o seco do
 * amendoim não se soma ao do milho.
 * ⚠ TABELA FORA DO `types.ts` (migration AGRI-03, posterior ao regen): vale o mesmo idioma já
 * usado em `useAreaPlantada` — `supabase as any` no builder, resultado convertido no ato.
 */
import { useState, useCallback, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import type { RomaneioPayload } from '@/lib/agri/colheita';

export interface ColheitaRow {
  id: string;
  safra_area_id: string;
  data_colheita: string;
  peso_bruto_kg: number | null;
  peso_liquido_kg: number | null;
  peso_refugo_kg: number | null;
  sacas: number | null;
  destino: string | null;
  romaneio_ref: string | null;
  observacoes: string | null;
}

const COLS = 'id, safra_area_id, data_colheita, peso_bruto_kg, peso_liquido_kg, peso_refugo_kg, sacas, destino, romaneio_ref, observacoes';

export function useColheita(safraAreaIds: readonly string[]) {
  const [linhas, setLinhas] = useState<ColheitaRow[]>([]);
  const [carregando, setCarregando] = useState(false);
  /* Mesma chave estável de `useAreasPorPastoNaJanela`: o array muda de identidade a cada
     render do painel, e recarregar por isso piscaria a lista. */
  const chave = [...safraAreaIds].sort().join(',');

  const carregar = useCallback(async () => {
    if (!chave) { setLinhas([]); return; }
    setCarregando(true);
    const db = supabase as any;
    const { data } = await db.from('agri_colheita')
      .select(COLS)
      .in('safra_area_id', chave.split(','))
      .eq('ativo', true)
      .order('data_colheita', { ascending: true });
    setLinhas((data as ColheitaRow[]) ?? []);
    setCarregando(false);
  }, [chave]);

  useEffect(() => { void carregar(); }, [carregar]);

  /**
   * Grava a lista de romaneios DE UMA ÁREA: insere, atualiza e apaga o que saiu da tela.
   *
   * ⚠ O ESCOPO DO APAGAR É A ÁREA, e não a lista inteira carregada: o hook pode estar
   * segurando os romaneios de duas culturas do mesmo pasto, e salvar o amendoim não pode
   * levar o milho junto. É o tipo de erro que só aparece quando o segundo talhão existe.
   */
  const salvar = useCallback(async (
    safraAreaId: string,
    lista: Array<RomaneioPayload & { id: string | null }>,
    clienteId: string,
  ): Promise<{ ok: boolean; erro?: string }> => {
    const db = supabase as any;
    const daArea = linhas.filter(l => l.safra_area_id === safraAreaId);
    const ficam = new Set(lista.map(l => l.id).filter(Boolean) as string[]);
    for (const l of daArea.filter(x => !ficam.has(x.id))) {
      const { error } = await db.from('agri_colheita').delete().eq('id', l.id);
      if (error) return { ok: false, erro: `Não foi possível remover o romaneio de ${l.data_colheita}: ${error.message}` };
    }
    for (const l of lista) {
      const payload = {
        data_colheita: l.data_colheita,
        peso_bruto_kg: l.peso_bruto_kg,
        peso_liquido_kg: l.peso_liquido_kg,
        peso_refugo_kg: l.peso_refugo_kg,
        sacas: l.sacas,
        destino: l.destino,
        romaneio_ref: l.romaneio_ref,
        observacoes: l.observacoes,
      };
      const { error } = l.id
        ? await db.from('agri_colheita').update(payload).eq('id', l.id)
        : await db.from('agri_colheita').insert({ ...payload, cliente_id: clienteId, safra_area_id: safraAreaId });
      if (error) return { ok: false, erro: error.message };
    }
    await carregar();
    return { ok: true };
  }, [linhas, carregar]);

  return { linhas, carregando, carregar, salvar };
}
