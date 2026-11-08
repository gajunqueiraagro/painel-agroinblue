/**
 * FECH-FAIXA-01 — os dados da faixa do fechamento do mês (fazenda atual), só LEITURA das fontes que já existem:
 *   · ① os pastos do mês pela MESMA regra da tela do Fechamento (`usePastos` + `pastosDoFechamentoNoMes`) e o status dos cards do mês
 *     (`fechamento_pastos`); a tela do Fechamento passa os cards que ela já tem (`fechamentos`), e a faixa acompanha cada Fechar sem reler;
 *   · ② o snapshot do Valor do Rebanho do mês (`valor_rebanho_realizado_validado`): o status e o valor que ele guarda.
 * No Global não há faixa (o fechamento é de uma fazenda): devolve nulo.
 */
import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useFazenda } from '@/contexts/FazendaContext';
import { usePastos } from '@/hooks/usePastos';
import { pastosDoFechamentoNoMes } from '@/hooks/useLoteDoMes';
import type { SnapshotStatusValue } from '@/hooks/useSnapshotStatus';
import { contarPastosFechados, type EstadoDaFaixa } from '@/lib/fechamento/faixaDoFechamento';

/** a chave das leituras da faixa: quem grava (revalidar, fechar) invalida por ela */
export const CHAVE_DA_FAIXA = 'faixa-do-fechamento';

export interface CardDoMes { pasto_id: string; status: string }

function situacaoDoSnapshot(status: string | null | undefined): SnapshotStatusValue {
  /* a MESMA leitura do `useSnapshotStatus` para uma fazenda */
  return status === 'cadeia_quebrada' || status === 'invalidado' || status === 'validado' ? status : 'sem_snapshot';
}

export function useFaixaDoFechamento(anoMes: string, fechamentos?: readonly CardDoMes[]): EstadoDaFaixa | null {
  const { fazendaAtual } = useFazenda();
  const fazendaId = fazendaAtual?.id && fazendaAtual.id !== '__global__' ? fazendaAtual.id : null;
  const { pastos } = usePastos();

  const cards = useQuery({
    queryKey: [CHAVE_DA_FAIXA, 'cards', fazendaId, anoMes],
    enabled: !!fazendaId && !fechamentos,
    queryFn: async (): Promise<CardDoMes[]> => {
      const { data, error } = await supabase.from('fechamento_pastos').select('pasto_id, status').eq('fazenda_id', fazendaId!).eq('ano_mes', anoMes);
      if (error) throw error;
      return (data ?? []).map(r => ({ pasto_id: r.pasto_id, status: r.status }));
    },
  });

  const valor = useQuery({
    queryKey: [CHAVE_DA_FAIXA, 'valor', fazendaId, anoMes],
    enabled: !!fazendaId,
    queryFn: async () => {
      const { data, error } = await supabase.from('valor_rebanho_realizado_validado')
        .select('status, valor_total, preco_arroba_medio').eq('fazenda_id', fazendaId!).eq('ano_mes', anoMes).maybeSingle();
      if (error) throw error;
      return {
        situacao: situacaoDoSnapshot(data?.status),
        valorTotal: data?.valor_total != null ? Number(data.valor_total) : null,
        precoArroba: data?.preco_arroba_medio != null ? Number(data.preco_arroba_medio) : null,
      };
    },
  });

  const listaDeCards = fechamentos ?? cards.data ?? null;
  return useMemo(() => {
    if (!fazendaId) return null;
    const idsDoMes = pastosDoFechamentoNoMes(pastos, anoMes).map(p => p.id);
    const status = new Map((listaDeCards ?? []).map(c => [c.pasto_id, c.status]));
    return {
      anoMes,
      pastos: listaDeCards && pastos.length > 0 ? contarPastosFechados(idsDoMes, status) : null,
      valor: valor.data ?? null,
    };
  }, [fazendaId, pastos, anoMes, listaDeCards, valor.data]);
}
