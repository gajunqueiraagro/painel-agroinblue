/**
 * FOLHA-FUNC-CADASTRO-01 — a leitura da aba Cadastro completa (react-query, sob a raiz 'folha': o `relerFolha()` de toda escrita a relê
 * junto) e o contexto da API injetável (a bancada e os testes trocam).
 */
import { createContext, createElement, useContext, type ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { fichaCadastroDoBanco, type FichaCadastroApi } from '@/lib/folha/fichaCadastroApi';

const ApiContext = createContext<FichaCadastroApi>(fichaCadastroDoBanco);
export function FichaCadastroApiProvider({ api, children }: { api: FichaCadastroApi; children: ReactNode }) {
  return createElement(ApiContext.Provider, { value: api }, children);
}
export const useFichaCadastroApi = (): FichaCadastroApi => useContext(ApiContext);

export function useCadastroCompleto(funcionarioId: string | null, favorecidoId: string | null) {
  const api = useFichaCadastroApi();
  return useQuery({
    queryKey: ['folha', 'cadastro-completo', funcionarioId, favorecidoId], enabled: !!funcionarioId || !!favorecidoId,
    queryFn: async () => {
      const r = await api.ler(funcionarioId ?? '', favorecidoId);
      if (!r.ok || !r.dados) throw new Error(r.erro ?? 'Não consegui ler o cadastro.');
      return r.dados;
    },
  });
}
