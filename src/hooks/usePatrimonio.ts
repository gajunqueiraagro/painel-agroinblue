/**
 * PATR-01 · PR B — as leituras da tela de Patrimônio (react-query) e o contexto da API injetável.
 * ⚠ SEM F5: toda escrita termina em `relerPatrimonio()`, que invalida a chave-raiz `patrimonio` — a lista de trás, os cartões e as
 * abas do modal releem juntos.
 */
import { createContext, createElement, useCallback, useContext, type ReactNode } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { apiDoBanco, type PatrimonioApi } from '@/lib/patrimonio/patrimonioApi';

const ApiContext = createContext<PatrimonioApi>(apiDoBanco);

/** A bancada (ou um teste) troca a API; a tela usa a do banco quando ninguém troca. */
export function PatrimonioApiProvider({ api, children }: { api: PatrimonioApi; children: ReactNode }) {
  return createElement(ApiContext.Provider, { value: api }, children);
}
export const usePatrimonioApi = (): PatrimonioApi => useContext(ApiContext);

const RAIZ = 'patrimonio';

export function useRelerPatrimonio() {
  const qc = useQueryClient();
  return useCallback(() => qc.invalidateQueries({ queryKey: [RAIZ] }), [qc]);
}

export function useCategoriasPatrimonio() {
  const api = usePatrimonioApi();
  return useQuery({ queryKey: [RAIZ, 'categorias'], queryFn: () => api.categorias(), staleTime: 5 * 60_000 });
}

export function useListaPatrimonio(clienteId: string | null, fazendaId: string | null, posicao: string) {
  const api = usePatrimonioApi();
  return useQuery({
    queryKey: [RAIZ, 'lista', clienteId, fazendaId, posicao],
    enabled: !!clienteId,
    queryFn: async () => {
      const r = await api.lista(clienteId ?? '', fazendaId, posicao);
      if (!r.ok) throw new Error(r.erro);
      return r.dados;
    },
  });
}

export function useSemBemResumo(clienteId: string | null) {
  const api = usePatrimonioApi();
  return useQuery({ queryKey: [RAIZ, 'sem-bem-resumo', clienteId], enabled: !!clienteId, queryFn: () => api.semBemResumo(clienteId ?? '') });
}

export function useItensSemBem(clienteId: string | null, ligado: boolean) {
  const api = usePatrimonioApi();
  return useQuery({ queryKey: [RAIZ, 'sem-bem-itens', clienteId], enabled: !!clienteId && ligado, queryFn: () => api.itensSemBem(clienteId ?? '') });
}

export function useCadastroDoBem(bemId: string | null) {
  const api = usePatrimonioApi();
  return useQuery({ queryKey: [RAIZ, 'cadastro', bemId], enabled: !!bemId, queryFn: () => api.cadastroDoBem(bemId ?? '') });
}

export function useLancamentosDoBem(bemId: string | null, clienteId: string | null) {
  const api = usePatrimonioApi();
  return useQuery({ queryKey: [RAIZ, 'lancamentos', bemId], enabled: !!bemId && !!clienteId, queryFn: () => api.lancamentosDoBem(bemId ?? '', clienteId ?? '') });
}

export function usePastosDaFazenda(fazendaId: string | null) {
  const api = usePatrimonioApi();
  return useQuery({ queryKey: [RAIZ, 'pastos-da-fazenda', fazendaId], enabled: !!fazendaId, queryFn: () => api.pastosDaFazenda(fazendaId ?? '') });
}

export function usePastosDoBem(bemId: string | null) {
  const api = usePatrimonioApi();
  return useQuery({ queryKey: [RAIZ, 'pastos-do-bem', bemId], enabled: !!bemId, queryFn: () => api.pastosDoBem(bemId ?? '') });
}

export function useSerieDoBem(clienteId: string | null, bemId: string | null, ate: string) {
  const api = usePatrimonioApi();
  return useQuery({ queryKey: [RAIZ, 'serie', bemId, ate], enabled: !!bemId && !!clienteId, queryFn: () => api.serie(clienteId ?? '', bemId ?? '', ate) });
}

export function useAvaliacoesDoBem(bemId: string | null) {
  const api = usePatrimonioApi();
  return useQuery({ queryKey: [RAIZ, 'avaliacoes', bemId], enabled: !!bemId, queryFn: () => api.avaliacoes(bemId ?? '') });
}

export function useDocumentosDoBem(bemId: string | null) {
  const api = usePatrimonioApi();
  return useQuery({ queryKey: [RAIZ, 'documentos', bemId], enabled: !!bemId, queryFn: () => api.documentos(bemId ?? '') });
}
