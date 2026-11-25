/**
 * APROVAR-PAGAMENTOS-V3 — a tela do aprovador lê TUDO numa ida: `fn_aprovacao_lista_v3(cliente, de, até)` (118600: aba, estado, posso
 * decidir, pronto, dados do pagamento) + o nome de quem lançou (a fonte única `fn_nomes_dos_autores`) + o "k/N" das parcelas. Só leitura;
 * quem grava é o `fn_aprovacao_decidir` (pelo `decidirAprovacao`). Relê quando um lançamento do cliente muda (o canal de sempre).
 * BPO desligado no cliente = a lista nem é pedida (a tela diz que a aprovação não está ligada).
 * DÉBITO AUTOMÁTICO (24/11 17:40): a regra do DA (`comRegraDoDebitoAutomatico`) e o último pagamento de cada fornecedor em DA antes do mês
 * (para o aviso de variação > 20%), na mesma leitura.
 */
import { useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { inscreverEmLancamentos } from '@/hooks/useFinanceiroV2';
import { buscarNomesDosAutores } from '@/hooks/useNomesDosAutores';
import { rotuloDaPessoa, type NomeDoAutor } from '@/lib/acessos/nomesDosAutores';
import {
  comRegraDoDebitoAutomatico, ehDebitoAutomatico, lerLinhasV3, ultimosPorFornecedor, type LinhaV3, type UltimoPagamento,
} from '@/lib/financeiro/aprovacaoV3';

export const CHAVE_APROVACAO_V3 = 'bpo-aprovacao-v3';

export function useAprovacaoV3(clienteId: string | null, de: string, ate: string) {
  const qc = useQueryClient();
  useEffect(() => {
    if (!clienteId) return;
    return inscreverEmLancamentos(clienteId, () => {
      void qc.invalidateQueries({ queryKey: [CHAVE_APROVACAO_V3, clienteId] }, { cancelRefetch: false });
    });
  }, [clienteId, qc]);
  const ligado = useQuery({
    queryKey: [CHAVE_APROVACAO_V3, clienteId, 'ligado'],
    enabled: !!clienteId,
    queryFn: async (): Promise<boolean> => {
      const { data, error } = await (supabase as any).from('financeiro_bpo_config').select('ativo').eq('cliente_id', clienteId).limit(1);
      if (error) throw error;
      return Array.isArray(data) && data[0]?.ativo === true;
    },
  });
  const lista = useQuery({
    queryKey: [CHAVE_APROVACAO_V3, clienteId, de, ate],
    enabled: !!clienteId && ligado.data === true,
    queryFn: async (): Promise<{ linhas: LinhaV3[]; nomes: Map<string, string>; ultimos: Map<string, UltimoPagamento> }> => {
      const { data, error } = await (supabase as any).rpc('fn_aprovacao_lista_v3', { p_cliente: clienteId, p_de: de, p_ate: ate });
      if (error) throw error;
      const linhas = comRegraDoDebitoAutomatico(lerLinhasV3(data));
      const autores = [...new Set(linhas.map((l) => l.lancadoPor).filter((x): x is string => !!x))];
      const doDa = [...new Set(linhas.filter((l) => ehDebitoAutomatico(l.forma)).map((l) => l.favorecidoId).filter((x): x is string => !!x))];
      const [lidos, ultimos] = await Promise.all([
        clienteId && autores.length ? buscarNomesDosAutores(clienteId, autores).catch((): NomeDoAutor[] => []) : Promise.resolve([]),
        doDa.length
          ? (supabase as any).from('financeiro_lancamentos_v2').select('favorecido_id, data_pagamento, valor').eq('cliente_id', clienteId)
            .in('favorecido_id', doDa).in('status_transacao', ['realizado', 'conciliado']).eq('cancelado', false).lt('data_pagamento', de)
            .order('data_pagamento', { ascending: false }).limit(500)
            .then((r: { data: unknown }) => ultimosPorFornecedor(r.data), () => new Map<string, UltimoPagamento>())
          : Promise.resolve(new Map<string, UltimoPagamento>()),
      ]);
      return { linhas, nomes: new Map(lidos.map((n) => [n.userId, rotuloDaPessoa(n)])), ultimos };
    },
  });
  return {
    ligado: ligado.data ?? null,
    linhas: lista.data?.linhas ?? null,
    nomes: lista.data?.nomes ?? new Map<string, string>(),
    ultimos: lista.data?.ultimos ?? new Map<string, UltimoPagamento>(),
    falhou: ligado.isError || lista.isError,
    lendo: lista.isFetching,
    recarregar: () => qc.invalidateQueries({ queryKey: [CHAVE_APROVACAO_V3, clienteId] }),
  };
}
