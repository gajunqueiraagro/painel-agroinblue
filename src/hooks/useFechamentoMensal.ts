import { useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useCliente } from '@/contexts/ClienteContext';
import { useAuth } from '@/contexts/AuthContext';
import { usePermissions } from '@/hooks/usePermissions';
import { toast } from 'sonner';

export interface FechamentoMensal {
  id: string;
  cliente_id: string;
  fazenda_id: string;
  ano_mes: string;
  status_fechamento: string;
  fechado_por: string | null;
  fechado_em: string | null;
  reaberto_por: string | null;
  reaberto_em: string | null;
  observacao: string | null;
}

export function useFechamentoMensal() {
  const { clienteAtual } = useCliente();
  const { user } = useAuth();
  const { perfil } = usePermissions();
  const clienteId = clienteAtual?.id;

  const [fechamentos, setFechamentos] = useState<FechamentoMensal[]>([]);
  const [loading, setLoading] = useState(false);

  const podFechar = ['admin_agroinblue', 'gestor_cliente', 'financeiro'].includes(perfil || '');
  const podReabrir = perfil === 'admin_agroinblue';

  const loadFechamentos = useCallback(async (fazendaId?: string) => {
    if (!clienteId) { setFechamentos([]); return; }
    setLoading(true);
    let query = supabase
      .from('financeiro_fechamentos')
      .select('*')
      .eq('cliente_id', clienteId);
    if (fazendaId) query = query.eq('fazenda_id', fazendaId);
    const { data, error } = await query;
    if (error) console.error(error);
    setFechamentos((data as FechamentoMensal[]) || []);
    setLoading(false);
  }, [clienteId]);

  const getStatus = useCallback((fazendaId: string, anoMes: string): 'aberto' | 'fechado' => {
    const f = fechamentos.find(x => x.fazenda_id === fazendaId && x.ano_mes === anoMes);
    return f?.status_fechamento === 'fechado' ? 'fechado' : 'aberto';
  }, [fechamentos]);

  const isMesFechado = useCallback((fazendaId: string, anoMes: string): boolean => {
    return getStatus(fazendaId, anoMes) === 'fechado';
  }, [getStatus]);

  const fecharMes = useCallback(async (fazendaId: string, anoMes: string) => {
    if (!clienteId || !user) return false;
    if (!podFechar) { toast.error('Sem permissão para fechar mês'); return false; }

    const existing = fechamentos.find(x => x.fazenda_id === fazendaId && x.ano_mes === anoMes);
    if (existing) {
      const { error } = await supabase
        .from('financeiro_fechamentos')
        .update({
          status_fechamento: 'fechado',
          fechado_por: user.id,
          fechado_em: new Date().toISOString(),
        })
        .eq('id', existing.id);
      if (error) { toast.error('Erro ao fechar mês'); console.error(error); return false; }
    } else {
      const { error } = await supabase
        .from('financeiro_fechamentos')
        .insert({
          cliente_id: clienteId,
          fazenda_id: fazendaId,
          ano_mes: anoMes,
          status_fechamento: 'fechado',
          fechado_por: user.id,
          fechado_em: new Date().toISOString(),
        });
      if (error) { toast.error('Erro ao fechar mês'); console.error(error); return false; }
    }

    toast.success(`Mês ${anoMes} fechado com sucesso`);
    await loadFechamentos(fazendaId);
    return true;
  }, [clienteId, user, podFechar, fechamentos, loadFechamentos]);

  const reabrirMes = useCallback(async (fazendaId: string, anoMes: string) => {
    if (!clienteId || !user) return false;
    if (!podReabrir) { toast.error('Apenas admin pode reabrir mês'); return false; }

    const existing = fechamentos.find(x => x.fazenda_id === fazendaId && x.ano_mes === anoMes);
    if (!existing) return false;

    const { error } = await supabase
      .from('financeiro_fechamentos')
      .update({
        status_fechamento: 'aberto',
        reaberto_por: user.id,
        reaberto_em: new Date().toISOString(),
      })
      .eq('id', existing.id);

    if (error) { toast.error('Erro ao reabrir mês'); console.error(error); return false; }
    toast.success(`Mês ${anoMes} reaberto`);
    await loadFechamentos(fazendaId);
    return true;
  }, [clienteId, user, podReabrir, fechamentos, loadFechamentos]);

  return {
    fechamentos,
    loading,
    loadFechamentos,
    getStatus,
    isMesFechado,
    fecharMes,
    reabrirMes,
    podFechar,
    podReabrir,
  };
}
