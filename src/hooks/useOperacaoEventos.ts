import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

/* Trilha de auditoria da operacao (PR-OC-AUDITORIA-01).
   ⚠ CONSULTA PROPRIA, e nao o envelope. `useOperacaoComercial` ate carrega
   `zoo_operacao_eventos`, mas o CompraModalShell nunca usa aquele envelope — ele monta o
   estado por aba. Pendurar a auditoria la significaria carregar a operacao inteira de
   novo, por um caminho que a tela nao percorre.
   ⚠ SO LEITURA. Este hook nao tem writer nenhum, de proposito: trilha que a tela sabe
   escrever nao e' trilha.
   ⚠ TETO DE 50 com "ver mais": 46 eventos numa unica operacao ja e' o caso REAL medido
   (OC 156b793b), entao a pagina seguinte nao e' hipotese remota. */

export const EVENTOS_PAGINA = 50;

export interface EventoOC {
  id: string;
  acao: string;
  detalhes: Record<string, unknown> | null;
  dadosAnteriores: Record<string, unknown> | null;
  dadosNovos: Record<string, unknown> | null;
  usuarioId: string | null;
  origem: string | null;
  criadoEm: string;
}

export interface EventosApi {
  eventos: EventoOC[];
  loading: boolean;
  /** Ha mais eventos alem dos carregados — habilita o "ver mais". */
  temMais: boolean;
  carregarMais: () => void;
}

interface EventoRow {
  id: string;
  acao: string;
  detalhes: Record<string, unknown> | null;
  dados_anteriores: Record<string, unknown> | null;
  dados_novos: Record<string, unknown> | null;
  usuario_id: string | null;
  origem: string | null;
  created_at: string;
}

interface Params {
  operacaoId: string | null;
  enabled: boolean;
}

export function useOperacaoEventos({ operacaoId, enabled }: Params): EventosApi {
  const [eventos, setEventos] = useState<EventoOC[]>([]);
  const [loading, setLoading] = useState(false);
  const [limite, setLimite] = useState(EVENTOS_PAGINA);
  const [temMais, setTemMais] = useState(false);

  /* Volta ao teto inicial quando a operacao muda: sem isto, abrir uma operacao depois de
     ter expandido outra carregaria paginas que ninguem pediu. */
  useEffect(() => { setLimite(EVENTOS_PAGINA); }, [operacaoId]);

  const carregar = useCallback(async () => {
    if (!enabled || !operacaoId) { setEventos([]); setTemMais(false); return; }
    setLoading(true);
    try {
      /* Pede UM a mais que o teto: e' assim que se sabe que ha proxima pagina sem gastar
         um `count` separado. O extra e' descartado da lista. */
      const { data, error } = await (supabase as any)
        .from('zoo_operacao_eventos')
        .select('id, acao, detalhes, dados_anteriores, dados_novos, usuario_id, origem, created_at')
        .eq('operacao_id', operacaoId)
        .order('created_at', { ascending: false })
        .limit(limite + 1);
      if (error) throw new Error(error.message);
      const linhas = (data ?? []) as EventoRow[];
      setTemMais(linhas.length > limite);
      setEventos(linhas.slice(0, limite).map(e => ({
        id: e.id,
        acao: e.acao,
        detalhes: e.detalhes ?? null,
        dadosAnteriores: e.dados_anteriores ?? null,
        dadosNovos: e.dados_novos ?? null,
        usuarioId: e.usuario_id ?? null,
        origem: e.origem ?? null,
        criadoEm: e.created_at,
      })));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Falha ao carregar o histórico.');
    } finally {
      setLoading(false);
    }
  }, [enabled, operacaoId, limite]);

  useEffect(() => { void carregar(); }, [carregar]);

  return { eventos, loading, temMais, carregarMais: () => setLimite(l => l + EVENTOS_PAGINA) };
}
