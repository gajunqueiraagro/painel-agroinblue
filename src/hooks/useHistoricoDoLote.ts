/**
 * LOTES-03 F1 — o Histórico da ficha do lote: a trilha `audit_log` (tabela_origem 'rebanho_lotes', o registro = o lote), com a guarda do
 * cliente, do mais recente para o mais antigo; o autor pela fonte única (`fn_nomes_dos_autores`). Só leitura.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { buscarNomesDosAutores } from '@/hooks/useNomesDosAutores';
import { autorNaTrilha, mapaDosNomes, type NomeDoAutor } from '@/lib/acessos/nomesDosAutores';
import { trilhaDaLinha, type LinhaDaTrilha } from '@/lib/lotes/lista';

export const FRASE_ERRO_HISTORICO = 'Não consegui ler o histórico do lote.';

export interface EventoDoLote extends LinhaDaTrilha { autor: string | null }

export function useHistoricoDoLote(clienteId: string | null, loteId: string | null, versao: number): {
  eventos: EventoDoLote[]; carregando: boolean; erro: string | null; recarregar: () => void;
} {
  const [eventos, setEventos] = useState<EventoDoLote[]>([]);
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const pedido = useRef(0);

  const recarregar = useCallback(() => {
    const meu = ++pedido.current;
    if (!clienteId || !loteId) { setEventos([]); setErro(null); return; }
    setCarregando(true);
    void (async () => {
      const { data, error } = await (supabase as any).from('audit_log')
        .select('id, created_at, usuario_id, via, acao, resumo, dados_anteriores, dados_novos')
        .eq('cliente_id', clienteId).eq('tabela_origem', 'rebanho_lotes').eq('registro_id', loteId)
        .order('created_at', { ascending: false });
      if (meu !== pedido.current) return;
      if (error) { console.error('[lotes] historico', error); setErro(FRASE_ERRO_HISTORICO); setCarregando(false); return; }
      const linhas: unknown[] = Array.isArray(data) ? data : [];
      const trilha = linhas.map(trilhaDaLinha).filter((t): t is LinhaDaTrilha => t !== null);
      const ids = [...new Set(trilha.map(t => t.usuarioId).filter((x): x is string => !!x))];
      let nomes: NomeDoAutor[] = [];
      if (ids.length) { try { nomes = await buscarNomesDosAutores(clienteId, ids); } catch { nomes = []; } }
      if (meu !== pedido.current) return;
      const mapa = mapaDosNomes(nomes);
      setEventos(trilha.map(t => ({ ...t, autor: autorNaTrilha(t.usuarioId, mapa, t.via) })));
      setErro(null); setCarregando(false);
    })();
  }, [clienteId, loteId]);

  /* `versao` entra para reler depois de cada gravação do lote (a ficha recebe a versão nova da lista) */
  useEffect(() => { recarregar(); return () => { pedido.current++; }; }, [recarregar, versao]);

  return { eventos, carregando, erro, recarregar };
}
