/**
 * BPO-FUNCIONAR-01 — o que a CPR lê para a aprovação, SÓ quando o BPO do cliente está ligado:
 *   · a configuração (`financeiro_bpo_config`: ligado? limite) e quem aprova (`financeiro_aprovadores` + os nomes da fonte única);
 *   · o ESTADO de cada saída da página carregada (`fn_aprovacao_estados`, 118500 — a regra é do banco), em fatias de 1000 ids;
 *   · o nome de quem lançou (`fn_nomes_dos_autores`, pelo `buscarNomesDosAutores`).
 * Só leitura; quem grava é o `fn_aprovacao_decidir` (pelo `decidirAprovacao`). BPO desligado = nada é lido e a CPR fica como sempre.
 */
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { buscarNomesDosAutores } from '@/hooks/useNomesDosAutores';
import { mapaDosNomes, rotuloDaPessoa, type NomeDoAutor } from '@/lib/acessos/nomesDosAutores';
import { lerEstados, type AprovacaoDaLinha } from '@/lib/financeiro/aprovacaoNaCpr';

export interface ConfigDaAprovacao { ligado: boolean; desde: string | null; limite: number | null; aprovadores: string[]; souAprovador: boolean; euId: string | null }

const FATIA = 1000;

export function useAprovacaoDaCpr(clienteId: string | null, idsDasSaidas: readonly string[]) {
  const queryClient = useQueryClient();
  const { data: config } = useQuery({
    queryKey: ['bpo-config-cpr', clienteId],
    enabled: !!clienteId,
    queryFn: async (): Promise<ConfigDaAprovacao> => {
      const sb = supabase as any;
      /* quem sou eu: do próprio cliente do Supabase (a CPR também monta fora do AuthProvider, nos testes) */
      const euId = await supabase.auth.getUser().then((r) => r.data.user?.id ?? null).catch(() => null);
      const [cfg, ap] = await Promise.all([
        sb.from('financeiro_bpo_config').select('ativo, desde, aprova_abaixo_de').eq('cliente_id', clienteId).limit(1),
        sb.from('financeiro_aprovadores').select('user_id').eq('cliente_id', clienteId).eq('ativo', true),
      ]);
      const linha = Array.isArray(cfg.data) ? cfg.data[0] : null;
      const ids: string[] = (Array.isArray(ap.data) ? ap.data : []).map((x: { user_id: string }) => x.user_id);
      const nomes = clienteId && ids.length ? await buscarNomesDosAutores(clienteId, ids).catch((): NomeDoAutor[] => []) : [];
      const porId = mapaDosNomes(nomes);
      return {
        ligado: !cfg.error && linha?.ativo === true,
        desde: typeof linha?.desde === 'string' ? linha.desde : null,
        limite: linha?.aprova_abaixo_de == null ? null : Number(linha.aprova_abaixo_de),
        aprovadores: ids.map((id) => rotuloDaPessoa(porId.get(id))),
        souAprovador: !!euId && ids.includes(euId),
        euId,
      };
    },
  });
  const ligado = config?.ligado === true;
  const chaveIds = idsDasSaidas.length ? `${idsDasSaidas.length}:${idsDasSaidas[0]}:${idsDasSaidas[idsDasSaidas.length - 1]}` : '0';
  const { data: estados, isFetching, isError } = useQuery({
    queryKey: ['bpo-estados-cpr', clienteId, chaveIds],
    enabled: !!clienteId && ligado && idsDasSaidas.length > 0,
    queryFn: async (): Promise<{ porLinha: Map<string, AprovacaoDaLinha>; nomes: Map<string, string> }> => {
      const porLinha = new Map<string, AprovacaoDaLinha>();
      for (let i = 0; i < idsDasSaidas.length; i += FATIA) {
        const { data, error } = await (supabase as any).rpc('fn_aprovacao_estados', { p_cliente: clienteId, p_ids: idsDasSaidas.slice(i, i + FATIA) });
        if (error) throw error;
        for (const [k, v] of lerEstados(data)) porLinha.set(k, v);
      }
      const autores = [...new Set([...porLinha.values()].map((a) => a.lancadoPor).filter((x): x is string => !!x))];
      const lista = clienteId && autores.length ? await buscarNomesDosAutores(clienteId, autores).catch((): NomeDoAutor[] => []) : [];
      const nomes = new Map(lista.map((n) => [n.userId, rotuloDaPessoa(n)]));
      return { porLinha, nomes };
    },
  });
  const recarregar = useCallback(async () => {
    await queryClient.invalidateQueries({ queryKey: ['bpo-estados-cpr', clienteId] });
  }, [queryClient, clienteId]);
  return {
    config: config ?? null, ligado, estados: estados?.porLinha ?? new Map<string, AprovacaoDaLinha>(),
    nomes: estados?.nomes ?? new Map<string, string>(), lendo: isFetching, falhou: isError, recarregar,
  };
}

/** a decisão: SEMPRE a prévia antes (simular), depois a gravação — o banco confere tudo de novo (quem lançou, já decidido, motivo) */
export async function decidirAprovacao(p: { clienteId: string; ids: string[]; aprovar: boolean; motivo: string | null; simular: boolean }):
  Promise<{ ok: true; n: number; total: number } | { ok: false; frase: string }> {
  const { data, error } = await (supabase as any).rpc('fn_aprovacao_decidir',
    { p_cliente: p.clienteId, p_ids: p.ids, p_aprovar: p.aprovar, p_motivo: p.motivo, p_simular: p.simular });
  if (error) {
    const msg = typeof error.message === 'string' ? error.message.replace(/^BPO:\s*/, '') : '';
    console.warn('[bpo] decidir:', error);
    return { ok: false, frase: msg || 'Não consegui gravar a decisão agora. Nada mudou; tente de novo.' };
  }
  const n = data && typeof data === 'object' && typeof data.n === 'number' ? data.n : p.ids.length;
  const total = data && typeof data === 'object' && data.total != null ? Number(data.total) : 0;
  return { ok: true, n, total };
}
