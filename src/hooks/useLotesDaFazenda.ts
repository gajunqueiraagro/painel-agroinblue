/**
 * LOTES-03 F1 — o LEITOR ÚNICO dos lotes de uma fazenda (a lista Produção › Lotes, a ficha e o campo Lote do modal do pasto).
 * Cab., peso, GMD e pasto vêm do fechamento pela `fn_lotes_da_fazenda` (fonte única); `fazendaId` nulo = lista vazia, sem banco.
 * Quem grava lote chama `notificarLotesMudaram(fazendaId)` DEPOIS da gravação: toda instância daquela fazenda relê (F5 nunca).
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { loteDaLinha } from '@/lib/lotes/lista';
import { marcarDaCria } from '@/lib/lotes/assistente';
import { cadastroDaLinha, lerCadastrosDoLote } from '@/hooks/useCadastrosDoLote';
import type { CadastroDoLote, LoteDaLista } from '@/lib/lotes/tipos';

export const FRASE_ERRO_LOTES = 'Não consegui ler os lotes da fazenda.';

const inscritos = new Map<string, Set<() => void>>();

/** Avisa as instâncias montadas daquela fazenda que os lotes mudaram (chamar DEPOIS que a gravação passou). */
export function notificarLotesMudaram(fazendaId: string): void {
  const subs = inscritos.get(fazendaId);
  if (!subs) return;
  for (const cb of [...subs]) cb();   // cópia: um callback pode desmontar durante a volta
}

/** L1 (Gabriel 09/11): qual lote leva carimbo — a regra do assistente, com a atividade e a categoria DO LOTE (ativas ou não).
 *  Sem esta leitura (erro ou falha) o lote volta como veio e mostra o código, como antes: nunca "sem carimbo" à toa. */
async function daCria(lidos: LoteDaLista[]): Promise<LoteDaLista[]> {
  const ids = [...new Set(lidos.flatMap(l => [l.atividadeId, l.categoriaId]))];
  if (!ids.length) return lidos;
  try {
    const [cad, reb] = await Promise.all([
      lerCadastrosDoLote().in('id', ids),
      supabase.from('categorias_rebanho').select('id, codigo').like('codigo', 'mamotes%'),
    ]);
    if (cad.error || reb.error || !Array.isArray(cad.data)) { console.error('[lotes] carimbo da cria', cad.error ?? reb.error); return lidos; }
    const cadastros = cad.data.map(cadastroDaLinha).filter((c: unknown): c is CadastroDoLote => c !== null);
    return marcarDaCria(lidos, cadastros, (reb.data ?? []).filter(r => (r.codigo ?? '').startsWith('mamotes')).map(r => r.id));
  } catch (e) {
    console.error('[lotes] carimbo da cria', e);
    return lidos;
  }
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
      const lidos = linhas.map(loteDaLinha).filter((l): l is LoteDaLista => l !== null);
      setLotes(lidos);
      setErro(null); setCarregando(false);
      /* L1: a marca da cria chega num 2º passo (a lista não espera por ela) */
      const marcados = await daCria(lidos);
      if (meu === pedido.current && marcados !== lidos) setLotes(marcados);
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
