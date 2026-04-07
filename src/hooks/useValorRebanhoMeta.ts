/**
 * Hook para ler e gravar o Valor do Rebanho META persistido.
 * Fonte única de dados META de patrimônio para o Painel do Consultor e gráficos.
 *
 * Tabelas: valor_rebanho_meta, valor_rebanho_meta_itens
 */
import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useFazenda } from '@/contexts/FazendaContext';
import { useCliente } from '@/contexts/ClienteContext';

export interface ValorRebanhoMetaTotais {
  ano_mes: string;
  valor_total: number;
  cabecas: number;
  peso_total_kg: number;
  peso_medio_kg: number;
  arrobas_total: number;
  preco_arroba_medio: number;
  valor_cabeca_medio: number;
  status: string;
}

export interface ValorRebanhoMetaItem {
  categoria: string;
  quantidade: number;
  peso_medio_kg: number;
  preco_arroba: number;
  preco_kg: number;
  valor_cabeca: number;
  valor_total_categoria: number;
}

/**
 * Lê todos os meses de valor_rebanho_meta para o ano informado.
 * Usado pelo Painel do Consultor para ler sem recalcular.
 */
export function useValorRebanhoMetaAno(ano: number) {
  const { fazendaAtual } = useFazenda();
  const fazendaId = fazendaAtual?.id;
  const [data, setData] = useState<ValorRebanhoMetaTotais[]>([]);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    if (!fazendaId) return;
    setLoading(true);
    try {
      const meses = Array.from({ length: 12 }, (_, i) =>
        `${ano}-${String(i + 1).padStart(2, '0')}`
      );
      const { data: rows, error } = await supabase
        .from('valor_rebanho_meta')
        .select('ano_mes, valor_total, cabecas, peso_total_kg, peso_medio_kg, arrobas_total, preco_arroba_medio, valor_cabeca_medio, status')
        .eq('fazenda_id', fazendaId)
        .in('ano_mes', meses);
      if (error) throw error;
      setData((rows || []) as ValorRebanhoMetaTotais[]);
    } catch (e: any) {
      console.error('Erro ao carregar valor_rebanho_meta:', e);
    } finally {
      setLoading(false);
    }
  }, [fazendaId, ano]);

  useEffect(() => { load(); }, [load]);

  // Helper: retorna array de 12 valores para um campo específico
  const getMonthlyValues = useCallback((field: keyof ValorRebanhoMetaTotais): number[] => {
    return Array.from({ length: 12 }, (_, i) => {
      const anoMes = `${ano}-${String(i + 1).padStart(2, '0')}`;
      const row = data.find(r => r.ano_mes === anoMes);
      if (!row) return 0;
      return Number(row[field]) || 0;
    });
  }, [data, ano]);

  return { data, loading, reload: load, getMonthlyValues };
}

/**
 * Grava o valor do rebanho META para um mês específico.
 * Chamado pela tela MetaPrecoTab ao salvar/validar.
 */
export async function salvarValorRebanhoMeta(params: {
  fazendaId: string;
  clienteId: string;
  anoMes: string;
  totais: {
    valor_total: number;
    cabecas: number;
    peso_total_kg: number;
    peso_medio_kg: number;
    arrobas_total: number;
    preco_arroba_medio: number;
    valor_cabeca_medio: number;
  };
  itens: ValorRebanhoMetaItem[];
  status: string;
  validadoPor?: string | null;
}) {
  const { fazendaId, clienteId, anoMes, totais, itens, status, validadoPor } = params;

  // Upsert totais
  const { data: existing } = await supabase
    .from('valor_rebanho_meta')
    .select('id')
    .eq('fazenda_id', fazendaId)
    .eq('ano_mes', anoMes)
    .maybeSingle();

  let metaId: string;

  if (existing?.id) {
    metaId = existing.id;
    const { error } = await supabase
      .from('valor_rebanho_meta')
      .update({
        ...totais,
        status,
        validado_por: status === 'validado' ? validadoPor : null,
        validado_em: status === 'validado' ? new Date().toISOString() : null,
      })
      .eq('id', metaId);
    if (error) throw error;
  } else {
    const { data: inserted, error } = await supabase
      .from('valor_rebanho_meta')
      .insert({
        fazenda_id: fazendaId,
        cliente_id: clienteId,
        ano_mes: anoMes,
        ...totais,
        status,
        validado_por: status === 'validado' ? validadoPor : null,
        validado_em: status === 'validado' ? new Date().toISOString() : null,
      })
      .select('id')
      .single();
    if (error) throw error;
    metaId = inserted.id;
  }

  // Replace itens
  await supabase
    .from('valor_rebanho_meta_itens')
    .delete()
    .eq('meta_id', metaId);

  if (itens.length > 0) {
    const rows = itens.map(it => ({
      meta_id: metaId,
      categoria: it.categoria,
      quantidade: it.quantidade,
      peso_medio_kg: it.peso_medio_kg,
      preco_arroba: it.preco_arroba,
      preco_kg: it.preco_kg,
      valor_cabeca: it.valor_cabeca,
      valor_total_categoria: it.valor_total_categoria,
    }));
    const { error } = await supabase
      .from('valor_rebanho_meta_itens')
      .insert(rows);
    if (error) throw error;
  }

  return metaId;
}
