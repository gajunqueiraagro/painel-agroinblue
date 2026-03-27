import { useMemo } from 'react';
import { useCliente } from '@/contexts/ClienteContext';
import type { TabId } from '@/components/BottomNav';

export type Perfil = 'admin_agroinblue' | 'gestor_cliente' | 'financeiro' | 'campo' | 'leitura';

export interface Permissions {
  perfil: Perfil;
  /** Can view this tab */
  canViewTab: (tab: TabId) => boolean;
  /** Can create/edit/delete data in a given module */
  canEdit: (modulo: 'zootecnico' | 'financeiro' | 'cadastros' | 'acessos' | 'pastos' | 'chuvas') => boolean;
  /** Is read-only user */
  isReadOnly: boolean;
  /** Is admin or gestor */
  isManager: boolean;
}

// Tabs that require financial editing access
const FINANCIAL_TABS: TabId[] = [
  'lancar_fin_hub', 'fin_caixa', 'analise_economica',
];

// Tabs that are financial visibility (read)
const FINANCIAL_VIEW_TABS: TabId[] = [
  'visao_fin_hub', 'analise_economica', 'fin_caixa',
];

// Tabs that are campo/zoo operations
const CAMPO_TABS: TabId[] = [
  'resumo', 'lancar_zoo_hub', 'visao_zoo_hub',
  'lancamentos', 'movimentacao', 'fluxo_anual',
  'fechamento', 'chuvas', 'financeiro', 'evolucao_categoria',
  'mapa_pastos', 'resumo_pastos', 'conciliacao', 'conciliacao_categoria',
  'evolucao_rebanho_hub', 'zootecnico', 'zootecnico_hub',
  'indicadores', 'visao_anual_zoo', 'analise', 'analise_entradas',
  'analise_saidas', 'desfrute', 'evolucao', 'analise_operacional',
  'pastos', 'valor_rebanho',
];

// Admin-only tabs
const ADMIN_TABS: TabId[] = ['acessos'];

/**
 * Determines what a user can see/do based on their perfil in the current client.
 */
export function usePermissions(): Permissions {
  const { clienteAtual } = useCliente();

  const perfil: Perfil = (clienteAtual?.perfil as Perfil) || 'leitura';

  return useMemo(() => {
    const isAdmin = perfil === 'admin_agroinblue';
    const isGestor = perfil === 'gestor_cliente';
    const isFinanceiro = perfil === 'financeiro';
    const isCampo = perfil === 'campo';
    const isLeitura = perfil === 'leitura';

    const isManager = isAdmin || isGestor;
    const isReadOnly = isLeitura;

    const canViewTab = (tab: TabId): boolean => {
      // Admin and gestor see everything
      if (isManager) return true;

      // Acessos only for managers
      if (ADMIN_TABS.includes(tab)) return false;

      // Financeiro: can view campo tabs (read) + financial tabs
      if (isFinanceiro) {
        return CAMPO_TABS.includes(tab) || FINANCIAL_TABS.includes(tab) || FINANCIAL_VIEW_TABS.includes(tab);
      }

      // Campo: can view campo tabs + cadastros, no financial detail tabs
      if (isCampo) {
        return CAMPO_TABS.includes(tab) || tab === 'cadastros';
      }

      // Leitura: can view everything except acessos (already filtered above)
      if (isLeitura) {
        return CAMPO_TABS.includes(tab) || FINANCIAL_VIEW_TABS.includes(tab) || FINANCIAL_TABS.includes(tab) || tab === 'cadastros';
      }

      return false;
    };

    const canEdit = (modulo: 'zootecnico' | 'financeiro' | 'cadastros' | 'acessos' | 'pastos' | 'chuvas'): boolean => {
      if (isReadOnly) return false;
      if (isManager) return true;

      switch (modulo) {
        case 'zootecnico':
        case 'pastos':
        case 'chuvas':
          return isCampo || isFinanceiro === false; // campo can edit
        case 'financeiro':
          return isFinanceiro;
        case 'cadastros':
          return isCampo; // campo can manage cadastros básicos
        case 'acessos':
          return false; // only managers
        default:
          return false;
      }
    };

    return { perfil, canViewTab, canEdit, isReadOnly, isManager };
  }, [perfil]);
}
