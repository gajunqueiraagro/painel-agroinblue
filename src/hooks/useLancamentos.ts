import { useState, useEffect } from 'react';
import { Lancamento } from '@/types/cattle';

const STORAGE_KEY = 'gado-lancamentos';

export function useLancamentos() {
  const [lancamentos, setLancamentos] = useState<Lancamento[]>(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      return stored ? JSON.parse(stored) : [];
    } catch {
      return [];
    }
  });

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(lancamentos));
  }, [lancamentos]);

  const adicionarLancamento = (lancamento: Omit<Lancamento, 'id'>) => {
    const novo: Lancamento = {
      ...lancamento,
      id: crypto.randomUUID(),
    };
    setLancamentos(prev => [novo, ...prev]);
  };

  const removerLancamento = (id: string) => {
    setLancamentos(prev => prev.filter(l => l.id !== id));
  };

  return { lancamentos, adicionarLancamento, removerLancamento };
}
