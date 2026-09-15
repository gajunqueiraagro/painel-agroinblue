/**
 * As cargas de colheita de uma área plantada — AGRI-COLHEITA-TELA-01.
 *
 * ⚠ A CHAVE É A ÁREA, NÃO O PASTO NEM O MÊS: `agri_colheita.safra_area_id` aponta para
 * `agri_safra_area`, então a carga pertence ao talhão daquela cultura naquela safra. Um pasto
 * com amendoim e milho tem duas listas — o seco de um não se soma ao do outro.
 * ⚠ UMA CARGA POR VEZ, NÃO EM LOTE. O romaneio chega avulso e se lança avulso; salvar a lista
 * inteira obrigaria a apagar e reinserir o que não mudou, e um erro no meio deixaria metade
 * gravada. Aqui cada gesto é uma linha: grava, devolve erro se falhar, recarrega.
 * ⚠ TABELA FORA DO `types.ts` (migration posterior ao regen): vale o idioma já usado em
 * `useAreaPlantada` — `supabase as any` no builder, resultado convertido no ato.
 */
import { useState, useCallback, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import type { CargaPayload } from '@/lib/agri/colheita';

export interface ColheitaRow {
  id: string;
  safra_area_id: string;
  data_colheita: string;
  hora_chegada: string | null;
  peso_fazenda_kg: number | null;
  ticket_balanca: string | null;
  nf_produtor: string | null;
  filial: string | null;
  /** EL-02: NOT NULL no banco; a carga sempre tem um local. */
  local_estoque_id: string | null;
  peso_verde_kg: number | null;
  peso_seco_kg: number | null;
  umidade_pct: number | null;
  aflatoxina_ppb: number | null;
  sacas_boas: number | null;
  grao_roca_sacas: number | null;
  grao_roca_kg: number | null;
  renda_liquida_pct: number | null;
  taxa_secagem: number | null;
  valor_secagem: number | null;
  observacoes: string | null;
}

const COLS = 'id, safra_area_id, data_colheita, hora_chegada, peso_fazenda_kg,'
  + ' ticket_balanca, nf_produtor, filial, local_estoque_id,'
  + ' peso_verde_kg, peso_seco_kg, umidade_pct, aflatoxina_ppb, sacas_boas,'
  + ' grao_roca_sacas, grao_roca_kg, renda_liquida_pct, taxa_secagem, valor_secagem,'
  + ' observacoes';

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
   * Grava UMA carga — insere quando `id` é nulo, atualiza quando não é.
   *
   * ⚠ O `safra_area_id` VAI NO UPDATE TAMBÉM, e não só no insert. Até o
   * PR-TALHAO-NO-MODAL-12 o talhão era o contexto da tela e nunca mudava numa edição; agora
   * ele é campo do modal, e sem esta linha mover a carga de talhão diria "Carga atualizada" e
   * não moveria nada — o pior defeito que esta tela pode ter, porque o operador não tem como
   * desconfiar. Reinserir o mesmo valor quando não mudou é inofensivo.
   */
  const salvarCarga = useCallback(async (
    safraAreaId: string,
    id: string | null,
    payload: CargaPayload,
    clienteId: string,
  ): Promise<{ ok: boolean; erro?: string }> => {
    const db = supabase as any;
    const { error } = id
      ? await db.from('agri_colheita').update({ ...payload, safra_area_id: safraAreaId }).eq('id', id)
      : await db.from('agri_colheita')
        .insert({ ...payload, cliente_id: clienteId, safra_area_id: safraAreaId });
    /* ⚠ O ERRO DO BANCO VAI INTEIRO PARA A TELA. "Não foi possível salvar" sozinho manda o
       operador adivinhar; a mensagem do PostgREST diz qual coluna recusou. */
    if (error) return { ok: false, erro: error.message };
    await carregar();
    return { ok: true };
  }, [carregar]);

  /**
   * ⚠ EXCLUSÃO É LÓGICA, não `delete`: `ativo = false`. A carga é documento — ticket de
   * balança e nota do produtor existem no papel da cooperativa, e apagar a linha do banco
   * tiraria do sistema o que continua existindo no arquivo do produtor.
   */
  const excluirCarga = useCallback(async (id: string): Promise<{ ok: boolean; erro?: string }> => {
    const db = supabase as any;
    const { error } = await db.from('agri_colheita').update({ ativo: false }).eq('id', id);
    if (error) return { ok: false, erro: error.message };
    await carregar();
    return { ok: true };
  }, [carregar]);

  return { linhas, carregando, carregar, salvarCarga, excluirCarga };
}
