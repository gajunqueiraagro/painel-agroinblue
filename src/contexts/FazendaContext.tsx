import { createContext, useContext, useState, useEffect, ReactNode, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from './AuthContext';
import { toast } from 'sonner';

export interface Fazenda {
  id: string;
  nome: string;
  owner_id: string;
  cliente_id: string;
  codigo_importacao?: string | null;
  tem_pecuaria?: boolean;
  papel?: string;
}

export const GLOBAL_FAZENDA: Fazenda = {
  id: '__global__',
  nome: 'Global',
  owner_id: '',
  papel: 'viewer',
};

interface FazendaContextType {
  fazendas: Fazenda[];
  fazendaAtual: Fazenda | null;
  setFazendaAtual: (f: Fazenda) => void;
  criarFazenda: (nome: string, codigoImportacao?: string) => Promise<Fazenda | null>;
  loading: boolean;
  reloadFazendas: () => Promise<void>;
  isGlobal: boolean;
}

const FazendaContext = createContext<FazendaContextType | undefined>(undefined);

export function FazendaProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [fazendas, setFazendas] = useState<Fazenda[]>([]);
  const [fazendaAtual, setFazendaAtualState] = useState<Fazenda | null>(null);
  const [loading, setLoading] = useState(true);

  const loadFazendas = useCallback(async () => {
    if (!user) { setFazendas([]); setFazendaAtualState(null); setLoading(false); return; }
    setLoading(true);
    try {
      const { data: membros } = await supabase
        .from('fazenda_membros')
        .select('fazenda_id, papel, fazendas(id, nome, owner_id, codigo_importacao, tem_pecuaria)')
        .eq('user_id', user.id);

      if (membros && membros.length > 0) {
        const list = membros.map(m => ({
          ...(m.fazendas as any),
          papel: m.papel,
        }));
        setFazendas(list);
        const savedId = localStorage.getItem('fazenda-ativa');
        if (savedId === '__global__' && list.length > 1) {
          setFazendaAtualState(GLOBAL_FAZENDA);
        } else {
          const saved = list.find(f => f.id === savedId);
          setFazendaAtualState(saved || list[0]);
        }
      } else {
        setFazendas([]);
        setFazendaAtualState(null);
      }
    } catch {
      setFazendas([]);
    }
    setLoading(false);
  }, [user]);

  useEffect(() => { loadFazendas(); }, [loadFazendas]);

  const setFazendaAtual = (f: Fazenda) => {
    setFazendaAtualState(f);
    localStorage.setItem('fazenda-ativa', f.id);
  };

  const criarFazenda = async (nome: string, codigoImportacao?: string): Promise<Fazenda | null> => {
    if (!user) return null;
    const payload: any = { nome, owner_id: user.id };
    if (codigoImportacao) payload.codigo_importacao = codigoImportacao;
    const { data, error } = await supabase
      .from('fazendas')
      .insert(payload)
      .select()
      .single();
    if (error) { toast.error('Erro ao criar fazenda: ' + error.message); return null; }

    const fazenda = { ...data, papel: 'dono' };
    await loadFazendas();
    setFazendaAtual(fazenda);
    return fazenda;
  };

  const isGlobal = fazendaAtual?.id === '__global__';

  return (
    <FazendaContext.Provider value={{ fazendas, fazendaAtual, setFazendaAtual, criarFazenda, loading, reloadFazendas: loadFazendas, isGlobal }}>
      {children}
    </FazendaContext.Provider>
  );
}

export function useFazenda() {
  const context = useContext(FazendaContext);
  if (!context) throw new Error('useFazenda must be used within FazendaProvider');
  return context;
}
