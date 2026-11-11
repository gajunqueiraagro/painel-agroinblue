/**
 * LOTES-03 F1 — o LEITOR ÚNICO dos lotes de uma fazenda (a lista Produção › Lotes, a ficha e o campo Lote do modal do pasto).
 * Cab., peso, GMD e pasto vêm do fechamento pela `fn_lotes_da_fazenda` (fonte única); `fazendaId` nulo = lista vazia, sem banco.
 * Quem grava lote chama `notificarLotesMudaram(fazendaId)` DEPOIS da gravação: toda instância daquela fazenda relê (F5 nunca).
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { loteDaLinha } from '@/lib/lotes/lista';
import { marcarBezerro, marcarDaCria, type ItemDoMes } from '@/lib/lotes/assistente';
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

const campo = (o: object, k: string): unknown => Reflect.get(o, k);
const textoDe = (o: object, k: string): string | null => { const v = campo(o, k); return typeof v === 'string' && v !== '' ? v : null; };

/** Uma linha dos itens do mês (com o pasto embutido) → `ItemDoMes`; sem fechamento, categoria ou quantidade = nula. */
function itemDoMes(r: unknown): ItemDoMes | null {
  if (typeof r !== 'object' || r === null) return null;
  const fechamentoId = textoDe(r, 'fechamento_id'); const categoriaId = textoDe(r, 'categoria_id'); const q = Number(campo(r, 'quantidade'));
  if (!fechamentoId || !categoriaId || !Number.isFinite(q)) return null;
  const pasto = campo(r, 'fechamento_pastos');
  const noCaderno = typeof pasto === 'object' && pasto !== null ? textoDe(pasto, 'lote_mes') : null;
  return { fechamentoId, categoriaId, quantidade: q, loteId: textoDe(r, 'lote_id'), noCaderno };
}

/** L1-CARIMBO-SO-COM-BEZERRO-01 — os itens com cabeça do fechamento do mês da fazenda; falhou = nulo (o aviso não aparece). */
async function itensDoMes(fazendaId: string, anoMes: string): Promise<ItemDoMes[] | null> {
  try {
    const { data, error } = await supabase.from('fechamento_pasto_itens')
      .select('fechamento_id, categoria_id, quantidade, lote_id, fechamento_pastos!inner(fazenda_id, ano_mes, lote_mes)')
      .eq('fechamento_pastos.fazenda_id', fazendaId).eq('fechamento_pastos.ano_mes', anoMes).gt('quantidade', 0);
    if (error || !Array.isArray(data)) { console.error('[lotes] bezerro do lote', error); return null; }
    const linhas: unknown[] = data;
    return linhas.map(itemDoMes).filter((i): i is ItemDoMes => i !== null);
  } catch (e) {
    console.error('[lotes] bezerro do lote', e);
    return null;
  }
}

/** L1 (Gabriel 09/11): qual lote leva carimbo — a regra do assistente, com a atividade e a categoria DO LOTE (ativas ou não).
 *  Sem esta leitura (erro ou falha) o lote volta como veio e mostra o código, como antes: nunca "sem carimbo" à toa.
 *  L1-CARIMBO-SO-COM-BEZERRO-01: e o aviso só com bezerro ao pé no mês; sem a leitura dos itens, nunca o aviso. */
async function daCria(lidos: LoteDaLista[], fazendaId: string, anoMes: string): Promise<LoteDaLista[]> {
  const ids = [...new Set(lidos.flatMap(l => [l.atividadeId, l.categoriaId]))];
  if (!ids.length) return lidos;
  try {
    const [cad, reb, itens] = await Promise.all([
      lerCadastrosDoLote().in('id', ids),
      supabase.from('categorias_rebanho').select('id, codigo').like('codigo', 'mamotes%'),
      itensDoMes(fazendaId, anoMes),
    ]);
    if (cad.error || reb.error || !Array.isArray(cad.data)) { console.error('[lotes] carimbo da cria', cad.error ?? reb.error); return lidos; }
    const cadastros = cad.data.map(cadastroDaLinha).filter((c: unknown): c is CadastroDoLote => c !== null);
    const mamotes = (reb.data ?? []).filter(r => (r.codigo ?? '').startsWith('mamotes')).map(r => r.id);
    const cria = marcarDaCria(lidos, cadastros, mamotes);
    return itens ? marcarBezerro(cria, itens, mamotes) : cria;
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
      const marcados = await daCria(lidos, fazendaId, anoMes);
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
