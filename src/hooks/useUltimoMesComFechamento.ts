/**
 * MAPA-02a-fix1 (A) — o último mês ('AAAA-MM') com fechamento de pastos da fazenda (`fechamento_pastos`), para o mapa abrir nele
 * (`mesDeAbertura`). `pronto` = a leitura terminou (com ou sem mês). Erro não vai a toast: fica no console e o mapa abre no mês de hoje.
 */
import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';

export function useUltimoMesComFechamento(fazendaId: string | undefined): { fazendaId: string | undefined; mes: string | null; pronto: boolean } {
  const [lido, setLido] = useState<{ fazendaId: string; mes: string | null } | null>(null);

  useEffect(() => {
    if (!fazendaId) return;
    let cancelado = false;
    (async () => {
      const { data, error } = await supabase
        .from('fechamento_pastos')
        .select('ano_mes')
        .eq('fazenda_id', fazendaId)
        .order('ano_mes', { ascending: false })
        .limit(1);
      if (cancelado) return;
      if (error) console.error('[useUltimoMesComFechamento]', error);
      setLido({ fazendaId, mes: !error && data && data.length > 0 ? data[0].ano_mes : null });
    })();
    return () => { cancelado = true; };
  }, [fazendaId]);

  const pronto = !!fazendaId && lido?.fazendaId === fazendaId;
  return { fazendaId, mes: pronto ? lido?.mes ?? null : null, pronto };
}
