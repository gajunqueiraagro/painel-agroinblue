import { useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useFazenda } from '@/contexts/FazendaContext';
import { useCliente } from '@/contexts/ClienteContext';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';

export interface AnaliseConsultor {
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
  json_blocos: Record<string, string>;
  created_at: string;
  updated_at: string;
}

const MESES = ['', 'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];

export function useAnaliseConsultor() {
  const { fazendaAtual, isGlobal } = useFazenda();
  const { clienteAtual } = useCliente();
  const { user } = useAuth();
  const [analises, setAnalises] = useState<AnaliseConsultor[]>([]);
  const [analiseAtual, setAnaliseAtual] = useState<AnaliseConsultor | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  const clienteId = clienteAtual?.id;
  const fazendaId = isGlobal ? null : fazendaAtual?.id;

  const loadAnalises = useCallback(async (ano: number) => {
    if (!clienteId) return;
    setLoading(true);
    let query = supabase
      .from('analise_consultor')
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
    if (error) { console.error(error); toast.error('Erro ao carregar análises'); }
    else setAnalises((data || []) as unknown as AnaliseConsultor[]);
    setLoading(false);
  }, [clienteId, fazendaId]);

  const criarAnalise = useCallback(async (ano: number, mes: number) => {
    if (!clienteId) return null;
    setSaving(true);
    const periodoTexto = `${MESES[mes]} ${ano}`;

    let query = supabase
      .from('analise_consultor')
      .select('versao')
      .eq('cliente_id', clienteId)
      .eq('ano', ano)
      .eq('mes', mes);
    if (fazendaId) query = query.eq('fazenda_id', fazendaId);
    else query = query.is('fazenda_id', null);

    const { data: existing } = await query;
    const nextVersion = (existing?.length || 0) + 1;

    // Initialize empty blocks 001-010
    const blocos: Record<string, string> = {};
    for (let i = 1; i <= 10; i++) {
      blocos[String(i).padStart(3, '0')] = '';
    }

    const insertData = {
      cliente_id: clienteId,
      fazenda_id: fazendaId,
      ano,
      mes,
      periodo_texto: periodoTexto,
      versao: nextVersion,
      usuario_gerador: user?.id,
      json_blocos: blocos as any,
    };

    const { data, error } = await supabase
      .from('analise_consultor')
      .insert(insertData)
      .select()
      .single();

    if (error) { console.error(error); toast.error('Erro ao criar análise'); setSaving(false); return null; }
    const result = data as unknown as AnaliseConsultor;
    setAnaliseAtual(result);
    toast.success('Análise gerada com sucesso');
    setSaving(false);
    return result;
  }, [clienteId, fazendaId, user?.id]);

  const salvarBlocos = useCallback(async (id: string, blocos: Record<string, string>) => {
    setSaving(true);
    const { error } = await supabase
      .from('analise_consultor')
      .update({ json_blocos: blocos as any })
      .eq('id', id);
    if (error) { toast.error('Erro ao salvar blocos'); console.error(error); }
    else {
      toast.success('Blocos salvos');
      if (analiseAtual?.id === id) {
        setAnaliseAtual(prev => prev ? { ...prev, json_blocos: blocos } : null);
      }
    }
    setSaving(false);
  }, [analiseAtual?.id]);

  const alterarStatus = useCallback(async (id: string, novoStatus: string) => {
    const updateData: Record<string, any> = { status_fechamento: novoStatus };
    if (novoStatus === 'fechado') updateData.data_fechamento = new Date().toISOString();

    const { error } = await supabase
      .from('analise_consultor')
      .update(updateData)
      .eq('id', id);
    if (error) { toast.error('Erro ao alterar status'); return false; }
    toast.success(novoStatus === 'fechado' ? 'Análise finalizada' : `Status: ${novoStatus}`);
    if (analiseAtual?.id === id) {
      setAnaliseAtual(prev => prev ? { ...prev, status_fechamento: novoStatus, ...updateData } : null);
    }
    return true;
  }, [analiseAtual?.id]);

  return {
    analises, analiseAtual, loading, saving,
    loadAnalises, criarAnalise, salvarBlocos,
    alterarStatus, setAnaliseAtual,
  };
}
