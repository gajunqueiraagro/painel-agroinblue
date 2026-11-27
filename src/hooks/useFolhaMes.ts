/**
 * FOLHA-TELAS-03 — as leituras das abas "Folha do mês" e "Férias" (react-query, sob a raiz 'folha': o `relerFolha()` de toda escrita a relê junto) e o
 * contexto da API injetável (a bancada e os testes trocam).
 */
import { createContext, createElement, useContext, type ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { folhaMesDoBanco, type FolhaMesApi } from '@/lib/folha/folhaMesApi';
import type { TipoDaFolha } from '@/lib/folha/folhaMes';

const ApiContext = createContext<FolhaMesApi>(folhaMesDoBanco);
export function FolhaMesApiProvider({ api, children }: { api: FolhaMesApi; children: ReactNode }) {
  return createElement(ApiContext.Provider, { value: api }, children);
}
export const useFolhaMesApi = (): FolhaMesApi => useContext(ApiContext);

export function useFolhaDoMes(clienteId: string | null, competencia: string, tipo: TipoDaFolha) {
  const api = useFolhaMesApi();
  return useQuery({
    queryKey: ['folha', 'mes', clienteId, competencia, tipo], enabled: !!clienteId,
    queryFn: async () => {
      const r = await api.mes(clienteId ?? '', competencia, tipo);
      if (!r.ok || !r.dados) throw new Error(r.erro ?? 'Não consegui ler a folha do mês.');
      return r.dados;
    },
  });
}

export function useFeriasDaFolha(clienteId: string | null) {
  const api = useFolhaMesApi();
  return useQuery({
    queryKey: ['folha', 'ferias', clienteId], enabled: !!clienteId,
    queryFn: async () => {
      const r = await api.ferias(clienteId ?? '');
      if (!r.ok || !r.dados) throw new Error(r.erro ?? 'Não consegui ler as férias.');
      return r.dados;
    },
  });
}
