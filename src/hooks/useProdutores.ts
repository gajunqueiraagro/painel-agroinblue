/**
 * FISCAL onda 1 (a) · CADASTROS › PRODUTORES — as leituras da tela (react-query) e o contexto da API injetável.
 * ⚠ SEM F5: toda gravação termina em `relerProdutores()`, que invalida a chave-raiz `produtores` — a lista, os acordos, o histórico, os
 * imóveis e as contas releem juntos.
 */
import { createContext, createElement, useCallback, useContext, type ReactNode } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { apiDoBanco, type ProdutoresApi, type Resultado } from '@/lib/fiscal/produtoresApi';

const ApiContext = createContext<ProdutoresApi>(apiDoBanco);

export function ProdutoresApiProvider({ api, children }: { api: ProdutoresApi; children: ReactNode }) {
  return createElement(ApiContext.Provider, { value: api }, children);
}
export const useProdutoresApi = (): ProdutoresApi => useContext(ApiContext);

const RAIZ = 'produtores';

export function useRelerProdutores() {
  const qc = useQueryClient();
  return useCallback(() => qc.invalidateQueries({ queryKey: [RAIZ] }), [qc]);
}

async function dados<T>(p: Promise<Resultado<T>>): Promise<T> {
  const r = await p;
  if (!r.ok) throw new Error(r.erro);
  return r.dados;
}

export function useTitulares(clienteId: string | null) {
  const api = useProdutoresApi();
  return useQuery({ queryKey: [RAIZ, 'lista', clienteId], enabled: !!clienteId, queryFn: () => dados(api.lista(clienteId ?? '')) });
}
export function useAcordos(clienteId: string | null) {
  const api = useProdutoresApi();
  return useQuery({ queryKey: [RAIZ, 'acordos', clienteId], enabled: !!clienteId, queryFn: () => dados(api.acordos(clienteId ?? '')) });
}
export function useHistoricoDaCondicao(clienteId: string | null, titularId: string | null) {
  const api = useProdutoresApi();
  return useQuery({
    queryKey: [RAIZ, 'historico', clienteId, titularId], enabled: !!clienteId && !!titularId,
    queryFn: () => dados(api.historicoDaCondicao(clienteId ?? '', titularId ?? '')),
  });
}
export function useImoveis(clienteId: string | null) {
  const api = useProdutoresApi();
  return useQuery({ queryKey: [RAIZ, 'imoveis', clienteId], enabled: !!clienteId, queryFn: () => dados(api.imoveis(clienteId ?? '')) });
}
export function useContasDoCliente(clienteId: string | null) {
  const api = useProdutoresApi();
  return useQuery({ queryKey: [RAIZ, 'contas', clienteId], enabled: !!clienteId, queryFn: () => dados(api.contas(clienteId ?? '')) });
}
