/**
 * NOTAS-RECEITA-CARD-SEMPRE-01 — lê do banco o que o card da Receita precisa (só SELECT, pela RLS do cliente) e devolve o estado pela regra
 * única `decidirEstado`. Do histórico da busca só vêm o código e o motivo da recusa (`detalhe->>recusa`): nunca o detalhe inteiro.
 */
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { decidirEstado, type EstadoDaReceita } from '@/lib/fiscal/estadoDaReceita';

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- tabelas fiscais fora dos tipos gerados
const db = () => supabase as any;
const txt = (x: unknown): string | null => (typeof x === 'string' && x !== '' ? x : null);
const linhas = (d: unknown): Record<string, unknown>[] =>
  (Array.isArray(d) ? d : []).filter((x): x is Record<string, unknown> => !!x && typeof x === 'object');

export const chaveDoEstadoDaReceita = (clienteId: string | null) => ['estado-da-receita', clienteId];

export async function lerBaseDoEstado(clienteId: string) {
  const [c, x, b, p] = await Promise.all([
    db().from('fiscal_certificados').select('situacao, valido_ate, enviado_em').eq('cliente_id', clienteId),
    db().from('fiscal_dfe_controle').select('ultima_busca_em, nao_antes_de').eq('cliente_id', clienteId),
    db().from('fiscal_dfe_buscas').select('em, cstat, recusa:detalhe->>recusa').eq('cliente_id', clienteId)
      /* a consulta por chave (consChNFe) não é a busca da agenda: fica fora */
      .or('detalhe->>pedido.is.null,detalhe->>pedido.neq.consChNFe')
      .order('em', { ascending: false }).limit(1),
    db().from('fiscal_dfe_pausa').select('motivo, desde, ate').eq('cliente_id', clienteId),
  ]);
  if (c.error || x.error || b.error || p.error) throw new Error('Não consegui ler o estado da busca da Receita.');
  const ult = linhas(b.data)[0];
  return {
    certificados: linhas(c.data).map((r) => ({ situacao: txt(r.situacao) ?? '', validoAte: txt(r.valido_ate), enviadoEm: txt(r.enviado_em) })),
    controle: linhas(x.data).map((r) => ({ ultimaBuscaEm: txt(r.ultima_busca_em), naoAntesDe: txt(r.nao_antes_de) })),
    ultimaBusca: ult && txt(ult.em) ? { em: String(ult.em), cstat: txt(ult.cstat), recusa: txt(ult.recusa) } : null,
    pausas: linhas(p.data).flatMap((r) => (txt(r.motivo) && txt(r.desde) ? [{ motivo: String(r.motivo), desde: String(r.desde), ate: txt(r.ate) }] : [])),
  };
}

/** o estado do card; `notasALancar` é a mesma conta do selo do "+ Novo" (as que pedem ação) */
export function useEstadoDaReceita(clienteId: string | null, notasALancar: number | null): EstadoDaReceita {
  const q = useQuery({
    queryKey: chaveDoEstadoDaReceita(clienteId),
    queryFn: () => lerBaseDoEstado(clienteId ?? ''),
    enabled: !!clienteId,
    staleTime: 60_000,
    refetchInterval: 5 * 60_000,
  });
  if (!clienteId || q.isLoading || notasALancar === null) return { tipo: 'carregando' };
  if (q.isError || !q.data) return { tipo: 'parada', motivo: 'outro', desde: null, voltaEm: null, validoAte: null };
  return decidirEstado({ carregando: false, ...q.data, notasALancar });
}
