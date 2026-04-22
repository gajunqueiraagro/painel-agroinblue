import { useMemo } from 'react';
import { useCliente } from '@/contexts/ClienteContext';
import type { TabId } from '@/components/BottomNav';

export type Perfil = 'admin_agroinblue' | 'gestor_cliente' | 'financeiro' | 'campo' | 'leitura';

export interface Permissions {
  perfil: Perfil;
  canViewTab: (tab: TabId) => boolean;
  canEdit: (modulo: 'zootecnico' | 'financeiro' | 'cadastros' | 'acessos' | 'pastos' | 'chuvas') => boolean;
  isReadOnly: boolean;
  isManager: boolean;
  /** Somente admin_agroinblue pode criar/editar/excluir META */
  canEditMeta: boolean;
}

// Financial-specific tabs
const FINANCIAL_TABS: TabId[] = [
  'lancar_fin_hub', 'visao_fin_hub', 'fin_caixa', 'analise_economica',
];

// Admin/manager-only tabs
const MANAGER_TABS: TabId[] = ['acessos', 'analise_trimestral'];

export function usePermissions(): Permissions {
  const { clienteAtual } = useCliente();
  const perfil: Perfil = (clienteAtual?.perfil as Perfil) || 'leitura';

  return useMemo(() => {
    const isAdmin = perfil === 'admin_agroinblue';
    const isGestor = perfil === 'gestor_cliente';
    const isFinanceiro = perfil === 'financeiro';
    const isCampo = perfil === 'campo';
    const isReadOnly = perfil === 'leitura';
    const isManager = isAdmin || isGestor;

    const canViewTab = (tab: TabId): boolean => {
      if (isManager) return true;
      if (MANAGER_TABS.includes(tab)) return false;
      if (isCampo && FINANCIAL_TABS.includes(tab)) return false;
      // financeiro and leitura can see all non-manager tabs
      return true;
    };

    const canEdit = (modulo: 'zootecnico' | 'financeiro' | 'cadastros' | 'acessos' | 'pastos' | 'chuvas'): boolean => {
      if (isReadOnly) return false;
      if (isManager) return true;
      switch (modulo) {
        case 'zootecnico':
        case 'pastos':
        case 'chuvas':
          return isCampo;
        case 'financeiro':
          return isFinanceiro;
        case 'cadastros':
          return false; // only managers
        case 'acessos':
          return false;
        default:
          return false;
      }
    };

    const canEditMeta = isAdmin;

    return { perfil, canViewTab, canEdit, isReadOnly, isManager, canEditMeta };
  }, [perfil]);
}
