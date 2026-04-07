import { useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useFazenda } from '@/contexts/FazendaContext';
import { useCliente } from '@/contexts/ClienteContext';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';

export interface FechamentoExecutivo {
  id: string;
  cliente_id: string;
  fazenda_id: string | null;
  ano: number;
  mes: number;
  periodo_texto: string;
  status_fechamento: string;
  versao: number;
  usuario_gerador: string | null;
  data_geracao: string;
  data_fechamento: string | null;
  observacoes_manuais: string | null;
  pdf_url: string | null;
  json_snapshot_indicadores: Record<string, any>;
  json_snapshot_textos: Record<string, string>;
  created_at: string;
  updated_at: string;
}

const MESES = ['', 'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];

export function useFechamentoExecutivo() {
  const { fazendaAtual, isGlobal } = useFazenda();
  const { clienteAtual } = useCliente();
  const { user } = useAuth();
  const [fechamentos, setFechamentos] = useState<FechamentoExecutivo[]>([]);
  const [fechamentoAtual, setFechamentoAtual] = useState<FechamentoExecutivo | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  const clienteId = clienteAtual?.id;
  const fazendaId = isGlobal ? null : fazendaAtual?.id;

  const loadFechamentos = useCallback(async (ano: number) => {
    if (!clienteId) return;
    setLoading(true);
    let query = supabase
      .from('fechamento_executivo')
      .select('*')
      .eq('cliente_id', clienteId)
      .eq('ano', ano)
      .order('mes', { ascending: false });

    if (fazendaId) {
      query = query.eq('fazenda_id', fazendaId);
    } else {
      query = query.is('fazenda_id', null);
    }

    const { data, error } = await query;
    if (error) { console.error(error); toast.error('Erro ao carregar fechamentos'); }
    else setFechamentos((data || []) as unknown as FechamentoExecutivo[]);
    setLoading(false);
  }, [clienteId, fazendaId]);

  const loadFechamento = useCallback(async (id: string) => {
    setLoading(true);
    const { data, error } = await supabase
      .from('fechamento_executivo')
      .select('*')
      .eq('id', id)
      .single();
    if (error) { console.error(error); toast.error('Erro ao carregar fechamento'); }
    else setFechamentoAtual(data as unknown as FechamentoExecutivo);
    setLoading(false);
  }, []);

  const criarFechamento = useCallback(async (ano: number, mes: number, snapshot: Record<string, any>) => {
    if (!clienteId) return null;
    setSaving(true);
    const periodoTexto = `${MESES[mes]} ${ano}`;

    // Check existing
    let query = supabase
      .from('fechamento_executivo')
      .select('versao')
      .eq('cliente_id', clienteId)
      .eq('ano', ano)
      .eq('mes', mes);
    if (fazendaId) query = query.eq('fazenda_id', fazendaId);
    else query = query.is('fazenda_id', null);

    const { data: existing } = await query;
    const nextVersion = (existing?.length || 0) + 1;

    const insertData = {
      cliente_id: clienteId,
      fazenda_id: fazendaId,
      ano,
      mes,
      periodo_texto: periodoTexto,
      versao: nextVersion,
      usuario_gerador: user?.id,
      json_snapshot_indicadores: snapshot as any,
      json_snapshot_textos: {} as any,
    };

    const { data, error } = await supabase
      .from('fechamento_executivo')
      .insert(insertData)
      .select()
      .single();

    if (error) { console.error(error); toast.error('Erro ao criar fechamento'); setSaving(false); return null; }
    const result = data as unknown as FechamentoExecutivo;
    setFechamentoAtual(result);
    toast.success('Fechamento gerado com sucesso');
    setSaving(false);
    return result;
  }, [clienteId, fazendaId, user?.id]);

  const salvarTextos = useCallback(async (id: string, textos: Record<string, string>) => {
    setSaving(true);
    const { error } = await supabase
      .from('fechamento_executivo')
      .update({ json_snapshot_textos: textos as any })
      .eq('id', id);
    if (error) { toast.error('Erro ao salvar textos'); console.error(error); }
    else {
      toast.success('Textos salvos');
      if (fechamentoAtual?.id === id) {
        setFechamentoAtual(prev => prev ? { ...prev, json_snapshot_textos: textos } : null);
      }
    }
    setSaving(false);
  }, [fechamentoAtual?.id]);

  const alterarStatus = useCallback(async (id: string, novoStatus: string) => {
    const updateData: Record<string, any> = { status_fechamento: novoStatus };
    if (novoStatus === 'fechado') updateData.data_fechamento = new Date().toISOString();
    
    const { error } = await supabase
      .from('fechamento_executivo')
      .update(updateData as any)
      .eq('id', id);
    if (error) { toast.error('Erro ao alterar status'); return false; }
    toast.success(novoStatus === 'fechado' ? 'Fechamento finalizado' : `Status: ${novoStatus}`);
    if (fechamentoAtual?.id === id) {
      setFechamentoAtual(prev => prev ? { ...prev, status_fechamento: novoStatus, ...updateData } : null);
    }
    return true;
  }, [fechamentoAtual?.id]);

  const salvarObservacoes = useCallback(async (id: string, obs: string) => {
    const { error } = await supabase
      .from('fechamento_executivo')
      .update({ observacoes_manuais: obs })
      .eq('id', id);
    if (error) { toast.error('Erro ao salvar observações'); return false; }
    if (fechamentoAtual?.id === id) {
      setFechamentoAtual(prev => prev ? { ...prev, observacoes_manuais: obs } : null);
    }
    return true;
  }, [fechamentoAtual?.id]);

  return {
    fechamentos, fechamentoAtual, loading, saving,
    loadFechamentos, loadFechamento, criarFechamento,
    salvarTextos, alterarStatus, salvarObservacoes,
    setFechamentoAtual,
  };
}
