import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useFazenda } from '@/contexts/FazendaContext';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';

export interface PrecoCategoria {
  categoria: string;
  preco_kg: number;
}

export interface SnapshotDetalheCategoria {
  categoria: string;
  quantidade: number;
  peso_medio_kg: number;
  preco_kg: number;
  valor_total_categoria: number;
}

export interface FechamentoStatus {
  status: 'aberto' | 'fechado';
  fechado_por?: string | null;
  fechado_em?: string | null;
}

export function useValorRebanho(anoMes: string) {
  const { fazendaAtual } = useFazenda();
  const { user } = useAuth();
  const fazendaId = fazendaAtual?.id;
  const [precos, setPrecos] = useState<PrecoCategoria[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [fechamento, setFechamento] = useState<FechamentoStatus>({ status: 'aberto' });

  const isFechado = fechamento.status === 'fechado';

  const papel = fazendaAtual?.papel;
  const isAdmin = papel === 'dono' || papel === 'gerente';

  const loadFechamentoStatus = useCallback(async () => {
    if (!fazendaId || fazendaId === '__global__') return;
    try {
      const { data, error } = await supabase
        .from('valor_rebanho_fechamento')
        .select('status, fechado_por, fechado_em')
        .eq('fazenda_id', fazendaId)
        .eq('ano_mes', anoMes)
        .maybeSingle();

      if (error) throw error;
      if (data) {
        setFechamento({
          status: data.status === 'fechado' ? 'fechado' : 'aberto',
          fechado_por: data.fechado_por,
          fechado_em: data.fechado_em,
        });
      } else {
        setFechamento({ status: 'aberto' });
      }
    } catch {
      setFechamento({ status: 'aberto' });
    }
  }, [fazendaId, anoMes]);

  const loadPrecos = useCallback(async () => {
    if (!fazendaId || fazendaId === '__global__') return;
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('valor_rebanho_mensal')
        .select('categoria, preco_kg')
        .eq('fazenda_id', fazendaId)
        .eq('ano_mes', anoMes);

      if (error) throw error;
      setPrecos((data || []) as PrecoCategoria[]);
    } catch (e: any) {
      console.error('Erro ao carregar preços:', e);
    } finally {
      setLoading(false);
    }
  }, [fazendaId, anoMes]);

  const loadPrecosMesAnterior = useCallback(async (): Promise<PrecoCategoria[]> => {
    if (!fazendaId || fazendaId === '__global__') return [];
    try {
      const [anoStr, mesStr] = anoMes.split('-');
      let ano = Number(anoStr);
      let mes = Number(mesStr) - 1;
      if (mes < 1) {
        mes = 12;
        ano--;
      }
      const prevAnoMes = `${ano}-${String(mes).padStart(2, '0')}`;

      const { data, error } = await supabase
        .from('valor_rebanho_mensal')
        .select('categoria, preco_kg')
        .eq('fazenda_id', fazendaId)
        .eq('ano_mes', prevAnoMes);

      if (error) throw error;
      return (data || []) as PrecoCategoria[];
    } catch {
      return [];
    }
  }, [fazendaId, anoMes]);

  const loadPrecosBaseAnual = useCallback(async (): Promise<PrecoCategoria[]> => {
    if (!fazendaId || fazendaId === '__global__') return [];
    try {
      const ano = Number(anoMes.split('-')[0]);
      const dezAnoAnterior = `${ano - 1}-12`;

      const { data, error } = await supabase
        .from('valor_rebanho_mensal')
        .select('categoria, preco_kg')
        .eq('fazenda_id', fazendaId)
        .eq('ano_mes', dezAnoAnterior);

      if (error) throw error;
      return (data || []) as PrecoCategoria[];
    } catch {
      return [];
    }
  }, [fazendaId, anoMes]);

  useEffect(() => {
    loadPrecos();
    loadFechamentoStatus();
  }, [loadPrecos, loadFechamentoStatus]);

  const salvarPrecos = useCallback(async (
    items: PrecoCategoria[],
    valorTotal?: number,
    pesoTotalKg?: number,
    itensFechamento: SnapshotDetalheCategoria[] = [],
  ) => {
    if (!fazendaId || fazendaId === '__global__' || !fazendaAtual?.cliente_id) return;

    setSaving(true);
    try {
      // ── Guard: P1 must be official before P2 can close ──
      // Uses the central DB function as sole source of truth
      const { data: canClose, error: canCloseErr } = await supabase.rpc(
        'can_close_valor_rebanho' as any,
        { _fazenda_id: fazendaId, _ano_mes: anoMes }
      );
      if (canCloseErr) {
        toast.error('Erro ao verificar status do P1: ' + canCloseErr.message);
        setSaving(false);
        return;
      }
      const result = canClose as { pode_fechar: boolean; motivo?: string } | null;
      if (!result?.pode_fechar) {
        toast.error(
          `Não é possível fechar o Valor do Rebanho: ${result?.motivo || 'P1 não está oficial'}`
        );
        setSaving(false);
        return;
      }

      await supabase
        .from('valor_rebanho_mensal')
        .delete()
        .eq('fazenda_id', fazendaId)
        .eq('ano_mes', anoMes);

      const rows = items
        .filter(i => i.preco_kg > 0)
        .map(i => ({
          fazenda_id: fazendaId,
          cliente_id: fazendaAtual.cliente_id,
          ano_mes: anoMes,
          categoria: i.categoria,
          preco_kg: i.preco_kg,
        }));

      if (rows.length > 0) {
        const { error } = await supabase
          .from('valor_rebanho_mensal')
          .insert(rows);
        if (error) throw error;
      }

      const { error: deleteDetalheError } = await supabase
        .from('valor_rebanho_fechamento_itens')
        .delete()
        .eq('fazenda_id', fazendaId)
        .eq('ano_mes', anoMes);

      if (deleteDetalheError) throw deleteDetalheError;

      const fechadoEm = new Date().toISOString();
      const detalheRows = itensFechamento.map(item => ({
        fazenda_id: fazendaId,
        cliente_id: fazendaAtual.cliente_id,
        ano_mes: anoMes,
        categoria: item.categoria,
        quantidade: item.quantidade ?? 0,
        peso_medio_kg: item.peso_medio_kg ?? 0,
        preco_kg: item.preco_kg ?? 0,
        valor_total_categoria: item.valor_total_categoria ?? 0,
        fechado_em: fechadoEm,
        fechado_por: user?.id || null,
      }));

      if (detalheRows.length > 0) {
        const { error: detalheError } = await supabase
          .from('valor_rebanho_fechamento_itens')
          .insert(detalheRows);

        if (detalheError) throw detalheError;
      }

      const { error: fechamentoError } = await supabase
        .from('valor_rebanho_fechamento')
        .upsert({
          fazenda_id: fazendaId,
          cliente_id: fazendaAtual.cliente_id,
          ano_mes: anoMes,
          status: 'fechado',
          fechado_por: user?.id || null,
          fechado_em: fechadoEm,
          valor_total: valorTotal ?? 0,
          peso_total_kg: pesoTotalKg ?? 0,
        } as any, { onConflict: 'fazenda_id,ano_mes' });

      if (fechamentoError) throw fechamentoError;

      // ── Snapshot oficial para Painel do Consultor (realizado) ──
      const totalCabecas = itensFechamento.reduce((s, i) => s + (i.quantidade ?? 0), 0);
      const totalPesoKg = pesoTotalKg ?? 0;
      const pesoMedioKg = totalCabecas > 0 ? totalPesoKg / totalCabecas : 0;
      const totalArrobas = totalPesoKg / 30;
      const precoArrobaMedio = totalArrobas > 0 ? (valorTotal ?? 0) / totalArrobas : 0;
      const valorCabecaMedio = totalCabecas > 0 ? (valorTotal ?? 0) / totalCabecas : 0;

      await supabase
        .from('valor_rebanho_realizado_validado' as any)
        .upsert({
          fazenda_id: fazendaId,
          cliente_id: fazendaAtual.cliente_id,
          ano_mes: anoMes,
          valor_total: valorTotal ?? 0,
          cabecas: totalCabecas,
          peso_medio_kg: pesoMedioKg,
          arrobas_total: totalArrobas,
          preco_arroba_medio: precoArrobaMedio,
          valor_cabeca_medio: valorCabecaMedio,
          status: 'validado',
        } as any, { onConflict: 'fazenda_id,ano_mes' });

      toast.success('Valores salvos e fechamento registrado');
      await loadPrecos();
      await loadFechamentoStatus();
    } catch (e: any) {
      toast.error('Erro ao salvar preços: ' + e.message);
    } finally {
      setSaving(false);
    }
  }, [fazendaId, anoMes, user, fazendaAtual?.cliente_id, loadPrecos, loadFechamentoStatus]);

  const reabrirFechamento = useCallback(async () => {
    if (!fazendaId || fazendaId === '__global__' || !isAdmin) return;
    try {
      const { error } = await supabase
        .from('valor_rebanho_fechamento')
        .update({
          status: 'aberto',
          reaberto_por: user?.id || null,
          reaberto_em: new Date().toISOString(),
        })
        .eq('fazenda_id', fazendaId)
        .eq('ano_mes', anoMes);

      if (error) throw error;
      toast.success('Fechamento reaberto para edição');
      await loadFechamentoStatus();
    } catch (e: any) {
      toast.error('Erro ao reabrir: ' + e.message);
    }
  }, [fazendaId, anoMes, user, isAdmin, loadFechamentoStatus]);

  return {
    precos,
    loading,
    saving,
    salvarPrecos,
    loadPrecosMesAnterior,
    loadPrecosBaseAnual,
    isFechado,
    fechamento,
    isAdmin,
    reabrirFechamento,
  };
}
