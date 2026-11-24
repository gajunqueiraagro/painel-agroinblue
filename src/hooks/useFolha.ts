/**
 * FOLHA-01 · PR B (telas) — as leituras da tela da Folha (react-query) e o contexto da API injetável (o molde de `usePatrimonio`).
 * ⚠ SEM F5: toda escrita termina em `relerFolha()`, que invalida a chave-raiz `folha` — a lista, a ficha, o histórico e as pendências
 *   releem juntos.
 */
import { createContext, createElement, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { apiDoBanco, type FolhaApi } from '@/lib/folha/folhaApi';

const ApiContext = createContext<FolhaApi>(apiDoBanco);

/** A bancada (ou um teste) troca a API; a tela usa a do banco quando ninguém troca. */
export function FolhaApiProvider({ api, children }: { api: FolhaApi; children: ReactNode }) {
  return createElement(ApiContext.Provider, { value: api }, children);
}
export const useFolhaApi = (): FolhaApi => useContext(ApiContext);

const RAIZ = 'folha';

export function useRelerFolha() {
  const qc = useQueryClient();
  return useCallback(() => qc.invalidateQueries({ queryKey: [RAIZ] }), [qc]);
}

/** D5: quem vê a Folha (admin sempre; os outros, com a marca 'folha' no cliente). Enquanto lê, `undefined`. */
export function useFolhaOk(clienteId: string | null) {
  const api = useFolhaApi();
  return useQuery({ queryKey: [RAIZ, 'ok', clienteId], enabled: !!clienteId, staleTime: 5 * 60_000, queryFn: () => api.folhaOk(clienteId ?? '') });
}

/** D5 NO MENU: o mesmo `folha_ok`, SEM react-query — o menu lateral também é montado fora do `QueryClientProvider` (testes do menu) e
 *  não pode depender dele. Lê uma vez por cliente; enquanto lê (ou se falhar), `false`: a Folha fica fora do menu. */
export function useFolhaOkDoMenu(clienteId: string | null): boolean {
  const api = useFolhaApi();
  const [ok, setOk] = useState<{ cliente: string | null; ok: boolean }>({ cliente: null, ok: false });
  useEffect(() => {
    if (!clienteId) return;
    let vivo = true;
    void api.folhaOk(clienteId).then(v => { if (vivo) setOk({ cliente: clienteId, ok: v }); }, () => { if (vivo) setOk({ cliente: clienteId, ok: false }); });
    return () => { vivo = false; };
  }, [api, clienteId]);
  return ok.cliente === clienteId && ok.ok;
}

function lerOuFalhar<T>(r: { ok: boolean; dados?: T; erro?: string }): T {
  if (!r.ok || r.dados === undefined) throw new Error(r.erro ?? 'Não consegui ler a folha.');
  return r.dados;
}

export function useFuncionarios(clienteId: string | null, ligado = true) {
  const api = useFolhaApi();
  return useQuery({ queryKey: [RAIZ, 'lista', clienteId], enabled: !!clienteId && ligado, queryFn: async () => lerOuFalhar(await api.lista(clienteId ?? '')) });
}

export function useFicha(funcionarioId: string | null) {
  const api = useFolhaApi();
  return useQuery({ queryKey: [RAIZ, 'ficha', funcionarioId], enabled: !!funcionarioId, queryFn: async () => lerOuFalhar(await api.ficha(funcionarioId ?? '')) });
}

export function useHistorico(funcionarioId: string | null, de: string | null, ate: string | null) {
  const api = useFolhaApi();
  return useQuery({
    queryKey: [RAIZ, 'historico', funcionarioId, de, ate], enabled: !!funcionarioId,
    queryFn: async () => lerOuFalhar(await api.historico(funcionarioId ?? '', de, ate)),
  });
}

export function usePendenciasFolha(clienteId: string | null) {
  const api = useFolhaApi();
  return useQuery({ queryKey: [RAIZ, 'pendencias', clienteId], enabled: !!clienteId, queryFn: async () => lerOuFalhar(await api.pendencias(clienteId ?? '')) });
}

export function useFuncionarioDoLancamento(lancamentoId: string | null) {
  const api = useFolhaApi();
  return useQuery({ queryKey: [RAIZ, 'do-lancamento', lancamentoId], enabled: !!lancamentoId, queryFn: () => api.funcionarioDoLancamento(lancamentoId ?? '') });
}
