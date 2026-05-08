import { createContext, useContext, useState, useEffect, useCallback, useRef, ReactNode } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from './AuthContext';

export interface Cliente {
  id: string;
  nome: string;
  slug: string;
  ativo: boolean;
  config: Record<string, any> | null;
  perfil: string;
}

interface ClienteContextType {
  clientes: Cliente[];
  clienteAtual: Cliente | null;
  setClienteAtual: (c: Cliente) => void;
  loading: boolean;
  reloadClientes: () => Promise<void>;
  isAdmin: boolean;
}

const ClienteContext = createContext<ClienteContextType | undefined>(undefined);

export function ClienteProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [clienteAtual, setClienteAtualState] = useState<Cliente | null>(null);
  const [loading, setLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);

  // Cache de is_admin_agroinblue por userId (1 RPC por sessão).
  // TODO: limpar adminCheckedRef/adminResultRef no logout se necessário
  const adminCheckedRef = useRef<string | null>(null);
  const adminResultRef = useRef<boolean | null>(null);

  // Guard de concorrência: bloqueia chamadas paralelas de loadClientes
  // (StrictMode dev double-mount, re-renders rápidos do AuthContext etc.).
  const loadingRef = useRef(false);

  const userId = user?.id;

  const loadClientes = useCallback(async () => {
    if (!userId) {
      setClientes([]);
      setClienteAtualState(null);
      setLoading(false);
      setIsAdmin(false);
      return;
    }
    if (loadingRef.current) {
      console.log('[ClienteContext] skip concurrent loadClientes', { userId });
      return;
    }
    loadingRef.current = true;
    setLoading(true);
    const _t0 = performance.now();
    console.log('[ClienteContext] loadClientes start', { userId });
    try {
      // Check if user is admin (cache por userId — 1 RPC por sessão)
      let userIsAdmin: boolean;
      if (adminCheckedRef.current === userId && adminResultRef.current !== null) {
        userIsAdmin = adminResultRef.current;
        console.log('[ClienteContext] is_admin_agroinblue: cache hit', { userIsAdmin });
      } else {
        const _tRpc = performance.now();
        console.log('[ClienteContext] rpc is_admin_agroinblue START');
        const { data: adminCheck, error: rpcErr } = await supabase.rpc('is_admin_agroinblue', { _user_id: userId });
        console.log(`[ClienteContext] rpc is_admin_agroinblue END (${(performance.now() - _tRpc).toFixed(0)}ms)`, { data: adminCheck, error: rpcErr });
        userIsAdmin = !!adminCheck;
        adminCheckedRef.current = userId;
        adminResultRef.current = userIsAdmin;
      }
      setIsAdmin(userIsAdmin);

      if (userIsAdmin) {
        // Admin sees all clients
        const _tQ = performance.now();
        console.log('[ClienteContext] query clientes (admin) START');
        const { data: allClientes, error: qErr } = await supabase
          .from('clientes')
          .select('*')
          .eq('ativo', true)
          .order('nome');
        console.log(`[ClienteContext] query clientes (admin) END (${(performance.now() - _tQ).toFixed(0)}ms)`, { rows: allClientes?.length ?? 0, error: qErr });

        if (allClientes && allClientes.length > 0) {
          const list: Cliente[] = allClientes.map(c => ({
            ...c,
            config: c.config as Record<string, any> | null,
            perfil: 'admin_agroinblue',
          }));
          setClientes(list);
          restoreOrSetDefault(list);
        } else {
          setClientes([]);
          setClienteAtualState(null);
        }
      } else {
        // Regular user: load from cliente_membros
        const _tQ = performance.now();
        console.log('[ClienteContext] query cliente_membros START');
        const { data: membros, error: qErr } = await supabase
          .from('cliente_membros')
          .select('cliente_id, perfil, clientes(id, nome, slug, ativo, config)')
          .eq('user_id', userId)
          .eq('ativo', true);
        console.log(`[ClienteContext] query cliente_membros END (${(performance.now() - _tQ).toFixed(0)}ms)`, { rows: membros?.length ?? 0, error: qErr });

        if (membros && membros.length > 0) {
          const list: Cliente[] = membros
            .filter(m => (m.clientes as any)?.ativo !== false)
            .map(m => ({
              ...(m.clientes as any),
              config: (m.clientes as any)?.config as Record<string, any> | null,
              perfil: m.perfil,
            }));
          setClientes(list);
          restoreOrSetDefault(list);
        } else {
          setClientes([]);
          setClienteAtualState(null);
        }
      }
    } catch (e) {
      console.error('[ClienteContext] loadClientes EXCEPTION', e);
      setClientes([]);
      setClienteAtualState(null);
    } finally {
      setLoading(false);
      loadingRef.current = false;
      console.log(`[ClienteContext] loadClientes total: ${(performance.now() - _t0).toFixed(0)}ms`);
    }
  }, [userId]);

  const restoreOrSetDefault = (list: Cliente[]) => {
    const savedId = localStorage.getItem('cliente-ativo');
    const saved = list.find(c => c.id === savedId);
    setClienteAtualState(saved || list[0]);
  };

  useEffect(() => {
    loadClientes();
  }, [loadClientes]);

  const setClienteAtual = (c: Cliente) => {
    setClienteAtualState(c);
    localStorage.setItem('cliente-ativo', c.id);
    // Reset fazenda ativa ao trocar cliente (evita cruzamento de dados)
    Object.keys(localStorage).forEach((key) => {
      if (key.startsWith('fazenda-ativa-')) {
        localStorage.removeItem(key);
      }
    });
  };

  return (
    <ClienteContext.Provider value={{ clientes, clienteAtual, setClienteAtual, loading, reloadClientes: loadClientes, isAdmin }}>
      {children}
    </ClienteContext.Provider>
  );
}

export function useCliente() {
  const context = useContext(ClienteContext);
  if (!context) throw new Error('useCliente must be used within ClienteProvider');
  return context;
}
