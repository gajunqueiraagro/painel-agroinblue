import { useState, useEffect } from 'react';
import { Lancamento, SaldoInicial } from '@/types/cattle';

const STORAGE_KEY = 'gado-lancamentos';
const SALDO_KEY = 'gado-saldo-inicial';

export function useLancamentos() {
  const [lancamentos, setLancamentos] = useState<Lancamento[]>(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      return stored ? JSON.parse(stored) : [];
    } catch {
      return [];
    }
  });

  const [saldosIniciais, setSaldosIniciais] = useState<SaldoInicial[]>(() => {
    try {
      const stored = localStorage.getItem(SALDO_KEY);
      return stored ? JSON.parse(stored) : [];
    } catch {
      return [];
    }
  });

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(lancamentos));
  }, [lancamentos]);

  useEffect(() => {
    localStorage.setItem(SALDO_KEY, JSON.stringify(saldosIniciais));
  }, [saldosIniciais]);

  const adicionarLancamento = (lancamento: Omit<Lancamento, 'id'>) => {
    const novo: Lancamento = {
      ...lancamento,
      id: crypto.randomUUID(),
    };
    setLancamentos(prev => [novo, ...prev]);
  };

  const editarLancamento = (id: string, dados: Partial<Omit<Lancamento, 'id'>>) => {
    setLancamentos(prev =>
      prev.map(l => (l.id === id ? { ...l, ...dados } : l))
    );
  };

  const removerLancamento = (id: string) => {
    setLancamentos(prev => prev.filter(l => l.id !== id));
  };

  const setSaldoInicial = (ano: number, categoria: SaldoInicial['categoria'], quantidade: number) => {
    setSaldosIniciais(prev => {
      const filtered = prev.filter(s => !(s.ano === ano && s.categoria === categoria));
      if (quantidade > 0) {
        return [...filtered, { ano, categoria, quantidade }];
      }
      return filtered;
    });
  };

  return {
    lancamentos,
    saldosIniciais,
    adicionarLancamento,
    editarLancamento,
    removerLancamento,
    setSaldoInicial,
  };
}
