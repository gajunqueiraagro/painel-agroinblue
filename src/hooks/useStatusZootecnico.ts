/**
 * Hook de status/pendências do painel Zootécnico.
 * Verifica: fechamento rebanho, peso médio, conciliação de pastos, valor rebanho.
 */
import { useState, useEffect, useCallback, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import type { Lancamento, SaldoInicial } from '@/types/cattle';
import { calcSaldoPorCategoriaLegado } from '@/lib/calculos/zootecnicos';

export interface Pendencia {
  id: string;
  label: string;
  descricao: string;
  resolverTab?: string; // TabId to navigate
}

export type StatusGeral = 'aberto' | 'parcial' | 'fechado';

export interface StatusZootecnicoResult {
  status: StatusGeral;
  pendencias: Pendencia[];
  loading: boolean;
}

export function useStatusZootecnico(
  fazendaId: string | undefined,
  ano: number,
  mes: number,
  lancamentos: Lancamento[],
  saldosIniciais: SaldoInicial[],
) {
  const [loading, setLoading] = useState(true);
  const [rebanhoFechado, setRebanhoFechado] = useState(false);
  const [pastosTotais, setPastosTotais] = useState(0);
  const [pastosFechados, setPastosFechados] = useState(0);
  const [pastosComPeso, setPastosComPeso] = useState(0);
  const [valorRebanhoFechado, setValorRebanhoFechado] = useState(false);
  const [categoriasNoConciliadas, setCategoriasNoConciliadas] = useState(0);

  const anoMes = `${ano}-${String(mes).padStart(2, '0')}`;

  const load = useCallback(async () => {
    if (!fazendaId || fazendaId === '__global__') {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const [vrfRes, fpRes, fpiRes, vrRes] = await Promise.all([
        supabase.from('valor_rebanho_fechamento')
          .select('status').eq('fazenda_id', fazendaId).eq('ano_mes', anoMes).maybeSingle(),
        supabase.from('fechamento_pastos')
          .select('id, status, pasto_id').eq('fazenda_id', fazendaId).eq('ano_mes', anoMes),
        supabase.from('fechamento_pasto_itens')
          .select('fechamento_id, peso_medio_kg, quantidade')
          .gt('quantidade', 0),
        supabase.from('valor_rebanho_mensal')
          .select('categoria').eq('fazenda_id', fazendaId).eq('ano_mes', anoMes),
      ]);

      setRebanhoFechado(vrfRes.data?.status === 'fechado');

      const fps = fpRes.data || [];
      setPastosTotais(fps.length);
      setPastosFechados(fps.filter(f => f.status === 'fechado').length);

      // Check if fechamento itens have peso
      const fechIds = new Set(fps.map(f => f.id));
      const itens = (fpiRes.data || []).filter(i => fechIds.has(i.fechamento_id));
      const comPeso = itens.filter(i => i.peso_medio_kg && i.peso_medio_kg > 0);
      setPastosComPeso(comPeso.length > 0 ? comPeso.length : 0);

      setValorRebanhoFechado((vrRes.data || []).length > 0);

      // Categorias não conciliadas: saldo sistema vs pastos
      const saldoMap = calcSaldoPorCategoriaLegado(saldosIniciais, lancamentos, ano, mes);
      const catsSistema = Array.from(saldoMap.entries()).filter(([, q]) => q > 0);
      const catsPastos = new Set(itens.map(i => i.fechamento_id)); // rough check
      setCategoriasNoConciliadas(
        fps.length === 0 ? catsSistema.length : Math.max(0, catsSistema.length - fps.filter(f => f.status === 'fechado').length)
      );
    } catch (e) {
      console.error('useStatusZootecnico error:', e);
    } finally {
      setLoading(false);
    }
  }, [fazendaId, anoMes, ano, mes, saldosIniciais, lancamentos]);

  useEffect(() => { load(); }, [load]);

  const { status, pendencias } = useMemo(() => {
    const pends: Pendencia[] = [];

    if (!rebanhoFechado) {
      pends.push({
        id: 'rebanho',
        label: 'Fechamento de rebanho',
        descricao: 'O fechamento do mês ainda não foi realizado',
        resolverTab: 'fluxo_anual',
      });
    }

    if (pastosComPeso === 0 && pastosTotais > 0) {
      pends.push({
        id: 'peso',
        label: 'Peso médio não informado',
        descricao: 'Nenhum pasto com peso médio definido',
        resolverTab: 'conciliacao',
      });
    }

    if (pastosTotais === 0 || pastosFechados < pastosTotais) {
      pends.push({
        id: 'pastos',
        label: 'Pastos não conciliados',
        descricao: pastosTotais === 0
          ? 'Nenhum fechamento de pasto registrado'
          : `${pastosFechados}/${pastosTotais} pastos fechados`,
        resolverTab: 'conciliacao',
      });
    }

    if (!valorRebanhoFechado) {
      pends.push({
        id: 'valor',
        label: 'Valor do rebanho',
        descricao: 'Preços por kg não definidos para o mês',
        resolverTab: 'fluxo_anual',
      });
    }

    let st: StatusGeral = 'aberto';
    if (pends.length === 0) st = 'fechado';
    else if (pends.length <= 2) st = 'parcial';

    return { status: st, pendencias: pends };
  }, [rebanhoFechado, pastosTotais, pastosFechados, pastosComPeso, valorRebanhoFechado]);

  return { status, pendencias, loading };
}
