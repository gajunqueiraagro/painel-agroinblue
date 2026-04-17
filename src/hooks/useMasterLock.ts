/**
 * useMasterLock — bloqueio master para meses fechados.
 *
 * Regras:
 * - isMaster: usuário logado é o master_user_id do cliente atual (clientes.config).
 * - isMesLocked(anoMes): true quando o mês está completamente fechado
 *   (todos os pastos ativos com status='fechado' E valor_rebanho_mensal possui registros).
 * - unlockMes(anoMes, senha): valida senha master localmente e libera somente nesta sessão.
 * - lockMes(anoMes): re-bloqueia.
 *
 * NÃO altera RLS no banco. Bloqueio é frontend-only.
 */
import { create } from 'zustand';
import { useEffect, useCallback, useMemo, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useCliente } from '@/contexts/ClienteContext';
import { useFazenda } from '@/contexts/FazendaContext';

// Senha master temporária (frontend-only). Migrar para campo no banco futuramente.
export const MASTER_PASSWORD = 'MASTER2026';

interface UnlockStore {
  unlocked: Set<string>;
  unlock: (key: string) => void;
  lock: (key: string) => void;
}

// Store global por sessão (não persiste).
const useUnlockStore = create<UnlockStore>((set) => ({
  unlocked: new Set<string>(),
  unlock: (key) =>
    set((state) => {
      const next = new Set(state.unlocked);
      next.add(key);
      return { unlocked: next };
    }),
  lock: (key) =>
    set((state) => {
      const next = new Set(state.unlocked);
      next.delete(key);
      return { unlocked: next };
    }),
}));

// Cache de status de fechamento por chave (fazendaId|anoMes).
type LockedMap = Map<string, boolean>;

export function useMasterLock(anoMes?: string) {
  const { user } = useAuth();
  const { clienteAtual } = useCliente();
  const { fazendaAtual } = useFazenda();
  const { unlocked, unlock, lock } = useUnlockStore();

  const isMaster = useMemo(() => {
    const masterId = (clienteAtual?.config as Record<string, unknown> | null)?.master_user_id;
    return !!user?.id && !!masterId && user.id === masterId;
  }, [user?.id, clienteAtual?.config]);

  const [lockedMap, setLockedMap] = useState<LockedMap>(new Map());
  const [loadingLock, setLoadingLock] = useState(false);

  const fazendaId = fazendaAtual?.id;
  const checkKey = fazendaId && anoMes ? `${fazendaId}|${anoMes}` : '';

  const fetchLockStatus = useCallback(async () => {
    if (!fazendaId || !anoMes) return;
    setLoadingLock(true);
    try {
      const primeiroDiaMes = `${anoMes}-01`;
      const [pastosRes, fpRes, vrRes] = await Promise.all([
        supabase
          .from('pastos')
          .select('id, data_inicio')
          .eq('fazenda_id', fazendaId)
          .eq('ativo', true)
          .eq('entra_conciliacao', true)
          .or(`data_inicio.is.null,data_inicio.lte.${primeiroDiaMes}`),
        supabase
          .from('fechamento_pastos')
          .select('pasto_id, status')
          .eq('fazenda_id', fazendaId)
          .eq('ano_mes', anoMes),
        supabase
          .from('valor_rebanho_mensal')
          .select('categoria')
          .eq('fazenda_id', fazendaId)
          .eq('ano_mes', anoMes)
          .limit(1),
      ]);

      const pastos = pastosRes.data ?? [];
      const fps = fpRes.data ?? [];
      const vrs = vrRes.data ?? [];

      // Mês "completamente fechado": pelo menos 1 pasto ativo, todos com fechamento status='fechado',
      // E valor_rebanho_mensal preenchido.
      const totalPastos = pastos.length;
      const fechadosIds = new Set(
        fps.filter((f) => f.status === 'fechado').map((f) => f.pasto_id)
      );
      const todosPastosFechados =
        totalPastos > 0 && pastos.every((p) => fechadosIds.has(p.id));
      const valorRebanhoOk = vrs.length > 0;
      const locked = todosPastosFechados && valorRebanhoOk;

      setLockedMap((prev) => {
        const next = new Map(prev);
        next.set(checkKey, locked);
        return next;
      });
    } finally {
      setLoadingLock(false);
    }
  }, [fazendaId, anoMes, checkKey]);

  useEffect(() => {
    if (checkKey && !lockedMap.has(checkKey)) {
      fetchLockStatus();
    }
  }, [checkKey, lockedMap, fetchLockStatus]);

  const isMesLocked = useCallback(
    (mes?: string): boolean => {
      const target = mes ?? anoMes;
      if (!target || !fazendaId) return false;
      const key = `${fazendaId}|${target}`;
      return lockedMap.get(key) === true;
    },
    [anoMes, fazendaId, lockedMap]
  );

  const isUnlocked = useCallback(
    (mes?: string): boolean => {
      const target = mes ?? anoMes;
      if (!target || !fazendaId) return false;
      return unlocked.has(`${fazendaId}|${target}`);
    },
    [anoMes, fazendaId, unlocked]
  );

  // Status efetivo: mês está bloqueado para edição?
  const isReadOnly = useCallback(
    (mes?: string): boolean => {
      if (isMaster) return false;
      const target = mes ?? anoMes;
      if (!target) return false;
      return isMesLocked(target) && !isUnlocked(target);
    },
    [isMaster, anoMes, isMesLocked, isUnlocked]
  );

  const unlockMes = useCallback(
    async (mes: string, senha: string): Promise<boolean> => {
      if (!fazendaId) return false;
      if (senha !== MASTER_PASSWORD) return false;
      unlock(`${fazendaId}|${mes}`);
      return true;
    },
    [fazendaId, unlock]
  );

  const lockMes = useCallback(
    (mes: string) => {
      if (!fazendaId) return;
      lock(`${fazendaId}|${mes}`);
    },
    [fazendaId, lock]
  );

  return {
    isMaster,
    isMesLocked,
    isUnlocked,
    isReadOnly,
    unlockMes,
    lockMes,
    loadingLock,
    refreshLock: fetchLockStatus,
  };
}
