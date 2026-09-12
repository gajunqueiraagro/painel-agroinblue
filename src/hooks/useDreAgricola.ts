/**
 * O DRE agrícola de uma safra — PR-AGRI-DRE-01.
 *
 * ⚠ UMA CHAMADA, ZERO CÁLCULO. `fn_dre_agricola_por_safra` está congelada e é a fonte única
 * da cascata e do rateio; este hook só a chama e entrega o conjunto plano. Qualquer soma que
 * o front fizesse aqui seria uma segunda regra, e o Painel da Safra viria a ler a outra.
 * ⚠ `(supabase as any).rpc` É A EXCEÇÃO DECLARADA da casa, e ela se aplica inteira aqui: a
 * função nasceu depois do último regen do `types.ts`, então o cliente tipado não a conhece.
 */
import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import type { CelulaDre } from '@/lib/agri/dreCultura';

export function useDreAgricola(clienteId: string | null | undefined, safraId: string | null) {
  const [linhas, setLinhas] = useState<CelulaDre[]>([]);
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const carregar = useCallback(async () => {
    if (!clienteId || !safraId) { setLinhas([]); setErro(null); return; }
    setCarregando(true);
    setErro(null);
    const { data, error } = await (supabase as any).rpc('fn_dre_agricola_por_safra', {
      p_cliente_id: clienteId,
      p_safra_id: safraId,
    });
    if (error) {
      /* ⚠ O ERRO VAI PARA A TELA COM CÓDIGO E MENSAGEM. Um DRE que aparece vazio sem dizer por
         quê é pior que um DRE que não aparece: o operador conclui que não há custo. */
      setErro([error.code, error.message].filter(Boolean).join(' · ') || 'Erro ao ler o DRE.');
      setLinhas([]);
    } else {
      setLinhas((data as CelulaDre[]) ?? []);
    }
    setCarregando(false);
  }, [clienteId, safraId]);

  useEffect(() => { void carregar(); }, [carregar]);

  return { linhas, carregando, erro, recarregar: carregar };
}
