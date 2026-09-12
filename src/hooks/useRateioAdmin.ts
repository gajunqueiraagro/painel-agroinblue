/**
 * A chave de rateio administrativo por ano — AGRI-RATEIO-TELA-01.
 *
 * ⚠ TABELA FORA DO `types.ts` (migration AGRI-04A, posterior ao regen): mesmo idioma dos
 * vizinhos — `supabase as any` no builder, resultado convertido no ato.
 * ⚠ O HOOK CARREGA DUAS COISAS: a chave do ano aberto e a LISTA DE ANOS que já têm chave. A
 * segunda é o que permite o card dizer quais anos estão preenchidos sem clicar em cada um.
 */
import { useState, useCallback, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import type { AtividadeRateio } from '@/lib/agri/rateioAdmin';

export interface RateioAdminRow {
  id: string;
  ano: number;
  atividade: AtividadeRateio;
  percentual: number;
}

export function useRateioAdmin(clienteId: string | null | undefined, ano: number) {
  const [linhas, setLinhas] = useState<RateioAdminRow[]>([]);
  const [anosComChave, setAnosComChave] = useState<number[]>([]);
  const [carregando, setCarregando] = useState(false);

  const carregarAnos = useCallback(async () => {
    if (!clienteId) { setAnosComChave([]); return; }
    const db = supabase as any;
    const { data } = await db.from('agri_rateio_admin')
      .select('ano')
      .eq('cliente_id', clienteId);
    setAnosComChave([...new Set(((data ?? []) as Array<{ ano: number }>).map(r => r.ano))]);
  }, [clienteId]);

  const carregar = useCallback(async () => {
    if (!clienteId) { setLinhas([]); return; }
    setCarregando(true);
    const db = supabase as any;
    const { data } = await db.from('agri_rateio_admin')
      .select('id, ano, atividade, percentual')
      .eq('cliente_id', clienteId)
      .eq('ano', ano);
    setLinhas((data as RateioAdminRow[]) ?? []);
    setCarregando(false);
  }, [clienteId, ano]);

  useEffect(() => { void carregar(); }, [carregar]);
  useEffect(() => { void carregarAnos(); }, [carregarAnos]);

  /**
   * Grava as três linhas do ano.
   *
   * ⚠ AS TRÊS SEMPRE, inclusive as de percentual zero: a chave é o conjunto, e uma atividade
   * ausente da tabela é ambígua — ninguém sabe se é zero declarado ou linha que faltou
   * gravar. Com as três presentes, o leitor do DRE não precisa supor.
   * ⚠ UPDATE OU INSERT PELA LINHA QUE JÁ EXISTE, e não `upsert` cego: a UNIQUE é
   * (cliente, ano, atividade), e um upsert sem `onConflict` explícito insere duplicado ou
   * falha conforme o cliente do PostgREST. Aqui a decisão é do código, não da biblioteca.
   */
  const salvar = useCallback(async (
    valores: Array<{ atividade: AtividadeRateio; percentual: number }>,
  ): Promise<{ ok: boolean; erro?: string }> => {
    if (!clienteId) return { ok: false, erro: 'Sem cliente selecionado.' };
    const db = supabase as any;
    for (const v of valores) {
      const existente = linhas.find(l => l.atividade === v.atividade);
      const { error } = existente
        ? await db.from('agri_rateio_admin')
            .update({ percentual: v.percentual, updated_at: new Date().toISOString() })
            .eq('id', existente.id)
        : await db.from('agri_rateio_admin')
            .insert({ cliente_id: clienteId, ano, atividade: v.atividade, percentual: v.percentual });
      if (error) return { ok: false, erro: error.message };
    }
    await carregar();
    await carregarAnos();
    return { ok: true };
  }, [clienteId, ano, linhas, carregar, carregarAnos]);

  return { linhas, anosComChave, carregando, salvar };
}
