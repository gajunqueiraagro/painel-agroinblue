/**
 * LOTE-BUSCA-01 — onde cada lote esteve no MÊS ANTERIOR, para os grupos do campo Lote do modal do pasto:
 * - as LIGAÇÕES: o MESMO leitor dos lotes (`useLotesDaFazenda` → `fn_lotes_da_fazenda`) no mês anterior; vale o lote cujo último dado é
 *   daquele mês (pastos e cabeças do mês);
 * - o TEXTO: o "Nome no caderno" (`fechamento_pastos.lote_mes`) dos cards da fazenda no mês anterior (set/26 só tem texto).
 * Sem fazenda = nada (null), sem banco. Falhou a leitura do texto = só as ligações (o campo segue com todos os lotes).
 */
import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useLotesDaFazenda } from '@/hooks/useLotesDaFazenda';
import { mesAnteriorDe } from '@/lib/fechamento/piquetesDoPasto';
import type { LoteNoMesAnterior, MesAnteriorDoLote, TextoNoMesAnterior } from '@/lib/lotes/buscaDoLote';

function textoDaLinha(r: unknown): TextoNoMesAnterior | null {
  if (typeof r !== 'object' || r === null) return null;
  const texto = 'lote_mes' in r && typeof r.lote_mes === 'string' ? r.lote_mes.trim() : '';
  const p = 'pastos' in r ? r.pastos : null;
  const pasto = typeof p === 'object' && p !== null && 'nome' in p && typeof p.nome === 'string' ? p.nome : '';
  return texto && pasto ? { pasto, texto } : null;
}

export function useLotesDoMesAnterior(fazendaId: string | null, anoMes: string): MesAnteriorDoLote | null {
  const anterior = mesAnteriorDe(anoMes);
  const { lotes, carregando } = useLotesDaFazenda(fazendaId, anterior);
  const [textos, setTextos] = useState<TextoNoMesAnterior[]>([]);

  useEffect(() => {
    let vivo = true;
    setTextos([]);
    if (!fazendaId) return;
    void (async () => {
      const { data, error } = await (supabase as any).from('fechamento_pastos').select('lote_mes, pastos(nome)')
        .eq('fazenda_id', fazendaId).eq('ano_mes', anterior).not('lote_mes', 'is', null);
      if (!vivo) return;
      if (error) { console.error('[lotes] caderno do mês anterior', error); return; }
      const linhas: unknown[] = Array.isArray(data) ? data : [];
      setTextos(linhas.map(textoDaLinha).filter((t): t is TextoNoMesAnterior => t !== null));
    })();
    return () => { vivo = false; };
  }, [fazendaId, anterior]);

  return useMemo(() => {
    if (!fazendaId || carregando) return null;
    const porLote = new Map<string, LoteNoMesAnterior>();
    for (const l of lotes) if (l.anoMesDado === anterior && l.pastos.length) porLote.set(l.id, { pastos: l.pastos, cabecas: l.cabecas });
    return { porLote, textos };
  }, [fazendaId, carregando, lotes, anterior, textos]);
}
