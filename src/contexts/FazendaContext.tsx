import { createContext, useContext, useState, useEffect, ReactNode, useCallback, useMemo, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from './AuthContext';
import { useCliente } from './ClienteContext';
import { toast } from 'sonner';

export interface Fazenda {
  id: string;
  nome: string;
  owner_id: string;
  cliente_id: string;
  codigo?: string | null;
  codigo_importacao?: string | null;
  tem_pecuaria?: boolean;
  /* `text` NULLABLE com default 'ativa'::text — nao e enum (conferido no
     information_schema em 22/08/2026). Opcional e anulavel de proposito: o
     tipo tem de admitir a ausencia, senao volta o fallback que este PR
     desmonta. Hoje ha 0 linhas NULL (13 'ativa' + 6 'inativa'). */
  status_operacional?: string | null;
  papel?: string;
}

export const GLOBAL_FAZENDA: Fazenda = {
  id: '__global__',
  nome: 'Global',
  owner_id: '',
  cliente_id: '',
  papel: 'viewer',
};

// PR-NAV-CONTEXTO-FAZENDA-01A — critério ÚNICO do domínio pecuário para os seletores de Fazenda do
//   envelope da Operação Comercial (Compra, Venda em pé, Abate, Boitel): nunca o sentinel Global e
//   apenas fazendas reais aptas (tem_pecuaria === true — administrativas e "sem pecuária" ficam de
//   fora). Escolher uma retorna sempre um UUID válido para persistir. NÃO confundir com
//   `fazendasComPecuaria` (`!== false`), que serve a dashboards/fechamento e mantém sua semântica.
export function isFazendaPecuaria(f: Pick<Fazenda, 'id' | 'tem_pecuaria'>): boolean {
  return f.id !== '__global__' && f.tem_pecuaria === true;
}

interface FazendaContextType {
  fazendas: Fazenda[];
  fazendasComPecuaria: Fazenda[];
  fazendaAtual: Fazenda | null;
  setFazendaAtual: (f: Fazenda) => void;
  criarFazenda: (nome: string, codigo: string) => Promise<Fazenda | null>;
  loading: boolean;
  reloadFazendas: () => Promise<void>;
  isGlobal: boolean;
}

const FazendaContext = createContext<FazendaContextType | undefined>(undefined);

export function FazendaProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const { clienteAtual } = useCliente();
  const [fazendas, setFazendas] = useState<Fazenda[]>([]);
  const [fazendaAtual, setFazendaAtualState] = useState<Fazenda | null>(null);
  const [loading, setLoading] = useState(true);

  // Cache: chave = `${clienteId}-${userId}`. Evita refetch quando loadFazendas é
  // recriado (deps user/clienteAtual mudam de referência mas valores idênticos).
  const loadedForRef = useRef<string | null>(null);

  const loadFazendas = useCallback(async () => {
    if (!user || !clienteAtual?.id) {
      setFazendas([]);
      setFazendaAtualState(null);
      setLoading(false);
      return;
    }
    const cacheKey = `${clienteAtual.id}-${user.id}`;
    if (loadedForRef.current === cacheKey) {
      setLoading(false);
      return;
    }

    setLoading(true);
    console.log('[FazendaContext] loadFazendas start', { clienteId: clienteAtual.id });
    const _t0 = performance.now();
    try {
      const _tQ1 = performance.now();
      console.log('[FazendaContext] query fazendas START');
      /* status_operacional carregado: sem ele, V2Fazendas caia no fallback
         `?? 'ativa'` e REGRAVAVA 'ativa' por cima de 'inativa' a cada save.
         O campo e o unico mecanismo de "excluir" fazenda que o sistema tem.

         DOIS CASTS: a coluna EXISTE no banco (text, nullable, default 'ativa')
         mas NAO em src/integrations/supabase/types.ts, que esta defasado — o
         mesmo defeito que ja produz 1 erro de baseline em
         useFazendasPecuariaAtivas.ts. Sem os casts o select inteiro degrada
         para SelectQueryError e o arquivo passa a acusar 4 erros novos
         (medido: 79 -> 83). E o idioma do repo para este caso; a correcao de
         raiz e regenerar types.ts, frente propria ja registrada.
         O `as FazendaRow[]` abaixo devolve o tipo na saida do `any`, para o
         `.map` seguinte nao propagar `any` pelo contexto inteiro. */
      type FazendaRow = Pick<Fazenda, 'id' | 'nome' | 'codigo' | 'owner_id' | 'cliente_id' | 'codigo_importacao' | 'tem_pecuaria' | 'status_operacional'>;
      const { data: fazendasCliente, error: errFaz } = await (supabase
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .from('fazendas' as any)
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .select('id, nome, codigo, owner_id, cliente_id, codigo_importacao, tem_pecuaria, status_operacional') as any)
        .eq('cliente_id', clienteAtual.id) as { data: FazendaRow[] | null; error: unknown };
      console.log(`[FazendaContext] query fazendas END (${(performance.now() - _tQ1).toFixed(0)}ms)`, { rows: fazendasCliente?.length ?? 0, error: errFaz });

      if (fazendasCliente && fazendasCliente.length > 0) {
        const _tQ2 = performance.now();
        console.log('[FazendaContext] query fazenda_membros START');
        const { data: membros, error: errMem } = await supabase
          .from('fazenda_membros')
          .select('fazenda_id, papel')
          .eq('user_id', user.id)
          .in('fazenda_id', fazendasCliente.map(f => f.id));
        console.log(`[FazendaContext] query fazenda_membros END (${(performance.now() - _tQ2).toFixed(0)}ms)`, { rows: membros?.length ?? 0, error: errMem });

        const papelPorFazenda = new Map<string, string>(
          (membros || []).map(m => [m.fazenda_id, m.papel])
        );

        const list: Fazenda[] = fazendasCliente.map(f => ({
          ...f,
          papel: papelPorFazenda.get(f.id) ?? (f.owner_id === user.id ? 'dono' : 'membro'),
        }));

        setFazendas(list);
        const savedKey = `fazenda-ativa-${clienteAtual?.id}`;
        const savedId = localStorage.getItem(savedKey);
        if (savedId && savedId !== '__global__') {
          const saved = list.find((f: Fazenda) => f.id === savedId);
          setFazendaAtualState(saved || (list.length > 1 ? GLOBAL_FAZENDA : list[0] || null));
        } else {
          setFazendaAtualState(list.length > 1 ? GLOBAL_FAZENDA : list[0] || null);
        }
      } else {
        setFazendas([]);
        setFazendaAtualState(null);
      }
      // Marca cache somente após fetch bem-sucedido
      loadedForRef.current = cacheKey;
    } catch (e) {
      console.error('[FazendaContext] loadFazendas EXCEPTION', e);
      // Em caso de erro, limpar cache para permitir retry
      loadedForRef.current = null;
      setFazendas([]);
    } finally {
      setLoading(false);
      console.log(`[FazendaContext] loadFazendas total: ${(performance.now() - _t0).toFixed(0)}ms`);
    }
  }, [user, clienteAtual]);

  const reloadFazendas = useCallback(async () => {
    loadedForRef.current = null;
    await loadFazendas();
  }, [loadFazendas]);

  useEffect(() => {
    setFazendas([]);
    setFazendaAtualState(null);
    loadedForRef.current = null;               // invalida cache → força refetch
    setLoading(!!clienteAtual?.id);            // loading true só se há cliente para buscar
  }, [clienteAtual?.id]);

  useEffect(() => { loadFazendas(); }, [loadFazendas]);

  const setFazendaAtual = (f: Fazenda) => {
    setFazendaAtualState(f);
    if (clienteAtual) {
      localStorage.setItem(`fazenda-ativa-${clienteAtual.id}`, f.id);
    }
  };

  const criarFazenda = async (nome: string, codigo: string): Promise<Fazenda | null> => {
    if (!user || !clienteAtual) return null;
    if (!codigo?.trim()) { toast.error('Código da fazenda é obrigatório.'); return null; }
    const cod = codigo.trim().toUpperCase();
    const payload: any = { nome, owner_id: user.id, cliente_id: clienteAtual.id, codigo: cod, codigo_importacao: cod };
    const { data, error } = await supabase
      .from('fazendas')
      .insert(payload)
      .select()
      .single();
    if (error) { toast.error('Erro ao criar fazenda: ' + error.message); return null; }

    const fazenda = { ...data, papel: 'dono' };
    loadedForRef.current = null;
    await loadFazendas();
    setFazendaAtual(fazenda);
    return fazenda;
  };

  const isGlobal = fazendaAtual?.id === '__global__';

  const fazendasComPecuaria = useMemo(
    () => fazendas.filter(f => f.tem_pecuaria !== false),
    [fazendas]
  );

  return (
    <FazendaContext.Provider value={{ fazendas, fazendasComPecuaria, fazendaAtual, setFazendaAtual, criarFazenda, loading, reloadFazendas, isGlobal }}>
      {children}
    </FazendaContext.Provider>
  );
}

export function useFazenda() {
  const context = useContext(FazendaContext);
  if (!context) throw new Error('useFazenda must be used within FazendaProvider');
  return context;
}
