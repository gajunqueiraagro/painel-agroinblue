/**
 * LOTES-03 F1 — o LEITOR ÚNICO dos lotes de uma fazenda (a lista Produção › Lotes, a ficha e o campo Lote do modal do pasto).
 * Cab., peso, GMD e pasto vêm do fechamento pela `fn_lotes_da_fazenda` (fonte única); `fazendaId` nulo = lista vazia, sem banco.
 * Quem grava lote chama `notificarLotesMudaram(fazendaId)` DEPOIS da gravação: toda instância daquela fazenda relê (F5 nunca).
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { loteDaLinha } from '@/lib/lotes/lista';
import type { LoteDaLista } from '@/lib/lotes/tipos';

export const FRASE_ERRO_LOTES = 'Não consegui ler os lotes da fazenda.';

const inscritos = new Map<string, Set<() => void>>();

/** Avisa as instâncias montadas daquela fazenda que os lotes mudaram (chamar DEPOIS que a gravação passou). */
export function notificarLotesMudaram(fazendaId: string): void {
  const subs = inscritos.get(fazendaId);
  if (!subs) return;
  for (const cb of [...subs]) cb();   // cópia: um callback pode desmontar durante a volta
}

export function useLotesDaFazenda(fazendaId: string | null, anoMes: string): {
  lotes: LoteDaLista[]; carregando: boolean; erro: string | null; recarregar: () => void;
} {
  const [lotes, setLotes] = useState<LoteDaLista[]>([]);
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const pedido = useRef(0);

  const recarregar = useCallback(() => {
    const meu = ++pedido.current;
    if (!fazendaId) { setLotes([]); setErro(null); setCarregando(false); return; }
    setCarregando(true);
    void (async () => {
      const { data, error } = await (supabase as any).rpc('fn_lotes_da_fazenda', { p_fazenda: fazendaId, p_ano_mes: anoMes });
      if (meu !== pedido.current) return;   // chegou depois de outra leitura (ou a tela saiu): não escreve
      if (error) {
        console.error('[lotes] fn_lotes_da_fazenda', error);
        setErro(FRASE_ERRO_LOTES); setCarregando(false); return;
      }
      const linhas: unknown[] = Array.isArray(data) ? data : [];
      setLotes(linhas.map(loteDaLinha).filter((l): l is LoteDaLista => l !== null));
      setErro(null); setCarregando(false);
    })();
  }, [fazendaId, anoMes]);

  useEffect(() => {
    recarregar();
    if (!fazendaId) return;
    const subs = inscritos.get(fazendaId) ?? new Set<() => void>();
    subs.add(recarregar); inscritos.set(fazendaId, subs);
    return () => { subs.delete(recarregar); pedido.current++; };
  }, [fazendaId, recarregar]);

  return { lotes, carregando, erro, recarregar };
}
