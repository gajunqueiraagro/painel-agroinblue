import { useMemo, useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useFazenda } from '@/contexts/FazendaContext';
import { useCliente } from '@/contexts/ClienteContext';
import { useSnapshotAreaAnual } from '@/hooks/useFechamentoArea';
import { useLancamentos } from '@/hooks/useLancamentos';
import { useFinanceiro } from '@/hooks/useFinanceiro';
import type { FinanceiroLancamento } from '@/hooks/useFinanceiro';
import type { Lancamento } from '@/types/cattle';
import {
  useRebanhoOficial,
  totalizarPorMes as totalizarViewPorMes,
} from '@/hooks/useRebanhoOficial';
import { useStatusPilares } from '@/hooks/useStatusPilares';
import { buildMonthlyDataFromView } from '@/pages/PainelConsultorTab';
import {
  computePeriodGmd,
  rollingAvg,
  buildDesfruteCabMensal,
  TIPOS_DESFRUTE_OFICIAL,
} from '@/lib/calculos/painelConsultorIndicadores';
import { calcularIndicadoresEficienciaArea } from '@/lib/calculos/eficienciaArea';
import type { StatusPilares } from '@/hooks/useStatusPilares';

interface Params {
  ano: number;
  mes: number;
  viewMode?: 'mes' | 'periodo';
  /** Quando false (default), o hook NÃO carrega/processa dados de meta — economiza N queries e o pesado buildMonthlyDataFromView. */
  carregarMeta?: boolean;
  /** Quando true, hook carrega ano-1 e calcula deltas/séries comparativas internamente (Cabeças). Default: false. */
  incluirComparativos?: boolean;
  /** Lançamentos pecuários compartilhados — quando fornecido, o hook NÃO carrega via useLancamentos. */
  lancPecExterno?: Lancamento[];
  /** Lançamentos financeiros compartilhados — quando fornecido, o hook NÃO carrega via useFinanceiro. */
  lancFinExterno?: FinanceiroLancamento[];
}

export type StatusValidacaoArea =
  | 'ok'
  | 'sem_area'
  | 'sem_snapshot'
  | 'p1_aberto'
  | 'p1_fechado_sem_snap'
  | 'incompleto'
  | 'carregando';

export interface PainelConsultorDataResult {
  cabecas: number | null;
  pesoMedio: number | null;
  gmd: number | null;
  arrobas: number | null;
  desfrute: number | null;
  receita: number | null;
  desembolso: number | null;
  resultado: number | null;
  valorRebanhoMes: number | null;
  areaProdutivaMes: number | null;
  lotUaHa: number | null;
  kgHa: number | null;
  arrHa: number | null;
  statusArea: StatusValidacaoArea;
  faltandoCount: number;
  statusPilares: StatusPilares | null;
  /** False quando GLOBAL e nem todas as fazendas pec do cliente têm P1 fechado no(s) mês(es) avaliado(s). */
  dadosCompletos: boolean;
  /** Séries mensais Jan–Dez do cenário REALIZADO. null durante loading ou em incompletoOverride. */
  seriesMensais: {
    cabFin:             number[];
    cabMediaAcumulada:  number[];   // média Jan→mes, índice 1=Jan…12=Dez
    pesoMedioFin:       number[];
    arrobasProd:        number[];
    gmd:                number[];
    desfruteCab:        number[];
    valorRebFin:        number[];
  } | null;
  /** Séries mensais Jan–Dez do cenário META. null se não houver meta carregada. */
  seriesMeta: {
    cabFin:       number[];
    pesoMedioFin: number[];
    arrobasProd:  number[];
    gmd:          number[];
  } | null;
  /** Indicador de Cabeças/Rebanho com tudo pronto para o card e o modal. */
  cabecasIndicador: {
    label:     string;
    titulo:    string;
    subtitulo: string;
    valor:     number | null;
    deltaMes:  number | null;
    deltaAno:  number | null;
    deltaMeta: number | null;
    serieAno:  number[];   // tamanho 13, índice 1=Jan…12=Dez (índice 0 = NaN)
    serieAnoAnt?: number[];
    serieMetaIndicador?: number[];
  } | null;
  /** Indicador de Peso Médio com tudo pronto para o card e o modal. */
  pesoMedioIndicador: {
    label:      string;
    titulo:     string;
    subtitulo:  string;
    valor:      number | null;
    deltaMes:   number | null;
    deltaAno:   number | null;
    deltaMeta:  number | null;
    serieAno:   number[];
    serieAnoAnt?: number[];
    serieMeta?:  number[];
  } | null;
  /** Indicador de GMD com tudo pronto para o card e o modal. */
  gmdIndicador: {
    label:      string;
    titulo:     string;
    subtitulo:  string;
    valor:      number | null;
    deltaMes:   number | null;
    deltaAno:   number | null;
    deltaMeta:  number | null;
    serieAno:   number[];
    serieAnoAnt?: number[];
    serieMeta?:  number[];
  } | null;
  /** Indicador de UA/ha (lotação) — sem ano anterior nesta fase. */
  uaHaIndicador: {
    label:      string;
    titulo:     string;
    subtitulo:  string;
    valor:      number | null;
    deltaMes:   number | null;
    deltaAno:   number | null;   // sempre null nesta fase
    deltaMeta:  number | null;
    serieAno:   number[];
    serieAnoAnt?: number[];      // ausente nesta fase
    serieMeta?:  number[];
  } | null;
  /** Indicador kg vivo/ha (peso total do rebanho / área) — sem ano anterior nesta fase. */
  kgHaIndicador: {
    label:      string;
    titulo:     string;
    subtitulo:  string;
    valor:      number | null;
    deltaMes:   number | null;
    deltaAno:   number | null;   // sempre null nesta fase
    deltaMeta:  number | null;
    serieAno:   number[];
    serieAnoAnt?: number[];      // ausente nesta fase
    serieMeta?:  number[];
  } | null;
  /** Indicador @ produzidas — fluxo (mês = valor do mês; período = acumulado Jan→mês). */
  arrobasIndicador: {
    label:      string;
    titulo:     string;
    subtitulo:  string;
    valor:      number | null;
    deltaMes:   number | null;
    deltaAno:   number | null;
    deltaMeta:  number | null;
    serieAno:   number[];
    serieAnoAnt?: number[];
    serieMeta?:  number[];
  } | null;
  /**
   * Indicador Desfrute (cab.) — fluxo (mês = abate+venda+consumo do mês;
   * período = acumulado Jan→mês). Sem ano anterior nem meta (PC-100 também não expõe).
   */
  desfruteIndicador: {
    label:      string;
    titulo:     string;
    subtitulo:  string;
    valor:      number | null;
    deltaMes:   number | null;
    deltaAno:   number | null;   // sempre null nesta fase
    deltaMeta:  number | null;   // sempre null nesta fase
    serieAno:   number[];
    serieAnoAnt?: number[];      // ausente nesta fase
    serieMeta?:  number[];       // ausente nesta fase
  } | null;
  /**
   * Indicador Valor do Rebanho — patrimônio (estoque).
   * Mês = posição final do mês. Período = MESMO VALOR (não soma, não média).
   * Fonte: valor_rebanho_realizado_validado (Fazenda) / vw_valor_rebanho_realizado_global_mensal (Global).
   * Meta: valor_rebanho_meta_validada (somente Fazenda — não há fonte Global).
   */
  valorRebanhoIndicador: {
    label:      string;
    titulo:     string;
    subtitulo:  string;
    valor:      number | null;
    deltaMes:   number | null;
    deltaAno:   number | null;
    deltaMeta:  number | null;
    serieAno:   number[];
    serieAnoAnt?: number[];
    serieMeta?:  number[];
  } | null;
  /**
   * Receita Pecuária Competência — fonte: monthlyData.recPecComp (lancPec desfrute, valorTotal/competência).
   * Mês = recPecComp[m]. Período = Σ recPecComp Jan→m.
   * Ano-1 e meta: queries diretas a 'lancamentos' (cenario='realizado'/'meta', TIPOS_DESFRUTE).
   */
  receitaPecIndicador: {
    label:      string;
    titulo:     string;
    subtitulo:  string;
    valor:      number | null;
    deltaMes:   number | null;
    deltaAno:   number | null;
    deltaMeta:  number | null;
    serieAno:   number[];
    serieAnoAnt?: number[];
    serieMeta?:  number[];
  } | null;
  /**
   * Custeio Produção Pecuária — fonte: monthlyData.custeioPec
   *   (lancFin grupo_custo IN ('Custo Fixo Pecuária', 'Custo Variável Pecuária')).
   * Mês = custeioPec[m]. Período = Σ custeioPec Jan→m.
   * Ano-1: query direta a financeiro_lancamentos_v2 (status='realizado').
   * Meta: query direta a planejamento_financeiro (cenario='meta').
   */
  custeioPecIndicador: {
    label:      string;
    titulo:     string;
    subtitulo:  string;
    valor:      number | null;
    deltaMes:   number | null;
    deltaAno:   number | null;
    deltaMeta:  number | null;
    serieAno:   number[];
    serieAnoAnt?: number[];
    serieMeta?:  number[];
  } | null;
  /**
   * Custo Produtivo R$/@ — derivado: custeioPec / arrobasProd.
   * Mês = custeioPec[m]/arrobasProd[m]. Período = Σ custeioPec / Σ arrobasProd.
   * Ano-1 e meta: derivados das séries custeioPec ano-1/meta e arrobasProd ano-1/meta.
   */
  custoArrIndicador: {
    label:      string;
    titulo:     string;
    subtitulo:  string;
    valor:      number | null;
    deltaMes:   number | null;
    deltaAno:   number | null;
    deltaMeta:  number | null;
    serieAno:   number[];
    serieAnoAnt?: number[];
    serieMeta?:  number[];
  } | null;
  /**
   * Preço de Venda R$/@ — derivado: recPecComp / desfrute_arr.
   * Mês = recPecComp[m]/desfrute_arr[m]. Período = Σ recPecComp / Σ desfrute_arr.
   * Ano-1 e meta: derivados das mesmas queries diretas a 'lancamentos' (pecAnoAnt12/pecMeta12).
   */
  precoArrIndicador: {
    label:      string;
    titulo:     string;
    subtitulo:  string;
    valor:      number | null;
    deltaMes:   number | null;
    deltaAno:   number | null;
    deltaMeta:  number | null;
    serieAno:   number[];
    serieAnoAnt?: number[];
    serieMeta?:  number[];
  } | null;
  /**
   * Custo por Cabeça R$/cab — derivado: custeioPec / cabMedia.
   * Mês = custeioPec[m]/cabMediaMes[m]. Período = (Σ custeioPec / cabMediaAcumulada) / numMeses.
   * Ano-1 e meta: derivados de custeioPec ano-1/meta e cabMedia ano-1/meta.
   */
  custoCabIndicador: {
    label:      string;
    titulo:     string;
    subtitulo:  string;
    valor:      number | null;
    deltaMes:   number | null;
    deltaAno:   number | null;
    deltaMeta:  number | null;
    serieAno:   number[];
    serieAnoAnt?: number[];
    serieMeta?:  number[];
  } | null;
  /**
   * Margem por @ — derivado: precoArr − custoArr.
   * Mês = precoArrMes − custoArrMes. Período = precoArrPeriodo − custoArrPeriodo.
   * Ano-1 e meta: derivados das séries de Preço de Venda e Custo R$/@.
   */
  margemArrIndicador: {
    label:      string;
    titulo:     string;
    subtitulo:  string;
    valor:      number | null;
    deltaMes:   number | null;
    deltaAno:   number | null;
    deltaMeta:  number | null;
    serieAno:   number[];
    serieAnoAnt?: number[];
    serieMeta?:  number[];
  } | null;
  loading: boolean;
}

export function usePainelConsultorData({ ano, mes, viewMode = 'mes', carregarMeta = false, incluirComparativos = false, lancPecExterno, lancFinExterno }: Params): PainelConsultorDataResult {
  const { fazendaAtual, isGlobal } = useFazenda();
  const fazendaId = fazendaAtual?.id;
  const { clienteAtual } = useCliente();

  const { areaMensal, totalFazendasAtivas, fazendasAtivasCarregadas, fazendasComSnapPorMes, fazendasComP1PorMes, temP1FechadoPorMes, loading: loadingArea } = useSnapshotAreaAnual(
    ano,
    isGlobal ? undefined : fazendaId,
    isGlobal,
    clienteAtual?.id,
  );

  // Área do ano anterior — necessária para deltaAno de UA/ha e kg vivo/ha.
  // useSnapshotAreaAnual não tem param `enabled`; carrega incondicionalmente.
  // Custo: +3 queries leves; aceitável conforme decisão D1 prévia.
  const { areaMensal: areaMensalAnoAnt } = useSnapshotAreaAnual(
    ano - 1,
    isGlobal ? undefined : fazendaId,
    isGlobal,
    clienteAtual?.id,
  );

  const {
    rawCategorias: viewDataRealizado,
    loading: loadingRebanho,
  } = useRebanhoOficial({ ano, cenario: 'realizado', global: isGlobal });

  // Meta é carregada quando carregarMeta=true OU incluirComparativos=true
  // (cabecasIndicador.deltaMeta precisa de seriesMeta).
  const carregarMetaEffective = carregarMeta || incluirComparativos;

  const {
    rawCategorias: viewDataMetaRaw,
  } = useRebanhoOficial({ ano, cenario: 'meta', global: isGlobal, enabled: carregarMetaEffective });

  const viewDataMeta = carregarMetaEffective ? viewDataMetaRaw : null;

  const {
    rawCategorias: viewDataAnoAnt,
  } = useRebanhoOficial({
    ano: ano - 1,
    cenario: 'realizado',
    global: isGlobal,
    enabled: incluirComparativos === true,
  });

  const viewTotalsAnoAnt = useMemo(
    () => incluirComparativos && viewDataAnoAnt
      ? totalizarViewPorMes(viewDataAnoAnt)
      : null,
    [viewDataAnoAnt, incluirComparativos],
  );

  const viewTotals = useMemo(
    () => totalizarViewPorMes(viewDataRealizado ?? []),
    [viewDataRealizado],
  );

  const viewTotalsMeta = useMemo(
    () => carregarMetaEffective ? totalizarViewPorMes(viewDataMeta ?? []) : ({} as ReturnType<typeof totalizarViewPorMes>),
    [viewDataMeta, carregarMetaEffective],
  );

  // Só usar externo quando tiver dado real — array vazio [] = ainda carregando
  const usarLancPecExterno = Array.isArray(lancPecExterno) && lancPecExterno.length > 0;
  const usarLancFinExterno = Array.isArray(lancFinExterno) && lancFinExterno.length > 0;

  const { lancamentos: lancPecInterno, loading: loadingLancInterno } =
    useLancamentos({ enabled: !usarLancPecExterno });

  const { lancamentos: lancFinInterno, loading: loadingFinInterno } =
    useFinanceiro({ enabled: !usarLancFinExterno });

  const lancPec    = usarLancPecExterno ? lancPecExterno! : lancPecInterno;
  const lancFin    = usarLancFinExterno ? lancFinExterno! : lancFinInterno;
  const loadingLanc = usarLancPecExterno ? false : loadingLancInterno;
  const loadingFin  = usarLancFinExterno ? false : loadingFinInterno;

  // Valor do Rebanho oficial — mesma fonte do PainelConsultorTab (sem fallback).
  // Array 13 posições: [0] = Dez ano anterior, [1..12] = Jan..Dez do ano.
  // Ausência de validado → NaN (propaga como null no consumidor via safe()).
  const [valorRebanhoMes, setValorRebanhoMes] = useState<number[]>(() => Array(13).fill(NaN));

  useEffect(() => {
    let cancelled = false;
    const cid = clienteAtual?.id;

    const load = async () => {
      const dezAnoAnterior = `${ano - 1}-12`;
      const meses = Array.from({ length: 12 }, (_, i) => `${ano}-${String(i + 1).padStart(2, '0')}`);
      const todasMeses = [dezAnoAnterior, ...meses];

      if (isGlobal) {
        if (!cid) {
          if (!cancelled) setValorRebanhoMes(Array(13).fill(NaN));
          return;
        }
        const { data, error } = await supabase
          .from('vw_valor_rebanho_realizado_global_mensal' as any)
          .select('ano_mes, valor_total')
          .eq('cliente_id', cid)
          .in('ano_mes', todasMeses);
        if (cancelled) return;
        if (error || !data?.length) {
          setValorRebanhoMes(Array(13).fill(NaN));
          return;
        }
        const byMes = Object.fromEntries(
          (data as any[]).map(r => [r.ano_mes, Number(r.valor_total)]),
        );
        setValorRebanhoMes(
          todasMeses.map(m => (byMes[m] != null && !isNaN(byMes[m]) ? byMes[m] : NaN)),
        );
        return;
      }

      if (!fazendaId || fazendaId === '__global__') {
        if (!cancelled) setValorRebanhoMes(Array(13).fill(NaN));
        return;
      }
      const { data, error } = await supabase
        .from('valor_rebanho_realizado_validado' as any)
        .select('ano_mes, valor_total, status')
        .eq('fazenda_id', fazendaId)
        .in('ano_mes', todasMeses);
      if (cancelled) return;
      if (error || !data?.length) {
        setValorRebanhoMes(Array(13).fill(NaN));
        return;
      }
      const byMes = new Map<string, number>();
      for (const row of data as any[]) {
        if (row.status === 'validado') {
          byMes.set(row.ano_mes, Number(row.valor_total));
        }
      }
      setValorRebanhoMes(todasMeses.map(m => (byMes.has(m) ? byMes.get(m)! : NaN)));
    };

    load();
    return () => { cancelled = true; };
  }, [ano, isGlobal, fazendaId, clienteAtual?.id]);

  // Valor do Rebanho ano anterior (apenas quando incluirComparativos=true).
  const [valorRebanhoMesAnoAnt, setValorRebanhoMesAnoAnt] = useState<number[]>(() => Array(13).fill(NaN));
  useEffect(() => {
    if (!incluirComparativos) {
      setValorRebanhoMesAnoAnt(Array(13).fill(NaN));
      return;
    }
    let cancelled = false;
    const cid = clienteAtual?.id;
    const anoAnt = ano - 1;
    const load = async () => {
      const dezAnoAnterior = `${anoAnt - 1}-12`;
      const meses = Array.from({ length: 12 }, (_, i) => `${anoAnt}-${String(i + 1).padStart(2, '0')}`);
      const todasMeses = [dezAnoAnterior, ...meses];

      if (isGlobal) {
        if (!cid) {
          if (!cancelled) setValorRebanhoMesAnoAnt(Array(13).fill(NaN));
          return;
        }
        const { data, error } = await supabase
          .from('vw_valor_rebanho_realizado_global_mensal' as any)
          .select('ano_mes, valor_total')
          .eq('cliente_id', cid)
          .in('ano_mes', todasMeses);
        if (cancelled) return;
        if (error || !data?.length) { setValorRebanhoMesAnoAnt(Array(13).fill(NaN)); return; }
        const byMes = Object.fromEntries((data as any[]).map(r => [r.ano_mes, Number(r.valor_total)]));
        setValorRebanhoMesAnoAnt(todasMeses.map(m => (byMes[m] != null && !isNaN(byMes[m]) ? byMes[m] : NaN)));
        return;
      }

      if (!fazendaId || fazendaId === '__global__') {
        if (!cancelled) setValorRebanhoMesAnoAnt(Array(13).fill(NaN));
        return;
      }
      const { data, error } = await supabase
        .from('valor_rebanho_realizado_validado' as any)
        .select('ano_mes, valor_total, status')
        .eq('fazenda_id', fazendaId)
        .in('ano_mes', todasMeses);
      if (cancelled) return;
      if (error || !data?.length) { setValorRebanhoMesAnoAnt(Array(13).fill(NaN)); return; }
      const byMes = new Map<string, number>();
      for (const row of data as any[]) {
        if (row.status === 'validado') byMes.set(row.ano_mes, Number(row.valor_total));
      }
      setValorRebanhoMesAnoAnt(todasMeses.map(m => (byMes.has(m) ? byMes.get(m)! : NaN)));
    };
    load();
    return () => { cancelled = true; };
  }, [incluirComparativos, ano, isGlobal, fazendaId, clienteAtual?.id]);

  // Desfrute ano-1 — query direta a 'lancamentos' filtrada por TIPOS_DESFRUTE_OFICIAL.
  // Carregado apenas quando incluirComparativos=true (chamada principal do hook).
  const [desfruteAnoAnt12, setDesfruteAnoAnt12] = useState<number[]>(() => Array(12).fill(0));
  useEffect(() => {
    if (!incluirComparativos) {
      setDesfruteAnoAnt12(Array(12).fill(0));
      return;
    }
    let cancelled = false;
    const cid = clienteAtual?.id;
    const anoAnt = ano - 1;

    const load = async () => {
      const PAGE = 1000;
      const allRows: any[] = [];
      let from = 0;
      while (true) {
        let q = supabase
          .from('lancamentos')
          .select('tipo, quantidade, data')
          .eq('cancelado', false)
          .eq('cenario', 'realizado')
          .in('tipo', [...TIPOS_DESFRUTE_OFICIAL] as string[])
          .gte('data', `${anoAnt}-01-01`)
          .lte('data', `${anoAnt}-12-31`);
        if (isGlobal) {
          if (!cid) {
            if (!cancelled) setDesfruteAnoAnt12(Array(12).fill(0));
            return;
          }
          q = q.eq('cliente_id', cid);
        } else if (fazendaId && fazendaId !== '__global__') {
          q = q.eq('fazenda_id', fazendaId);
        } else {
          if (!cancelled) setDesfruteAnoAnt12(Array(12).fill(0));
          return;
        }

        const { data, error } = await q.order('data').range(from, from + PAGE - 1);
        if (cancelled) return;
        if (error || !data || data.length === 0) break;
        allRows.push(...data);
        if (data.length < PAGE) break;
        from += PAGE;
      }
      if (cancelled) return;
      const lite = allRows.map((r: any) => ({
        tipo: r.tipo,
        quantidade: Number(r.quantidade) || 0,
        data: r.data,
        cenario: 'realizado',
      }));
      setDesfruteAnoAnt12(buildDesfruteCabMensal(lite, anoAnt));
    };
    load();
    return () => { cancelled = true; };
  }, [incluirComparativos, ano, isGlobal, fazendaId, clienteAtual?.id]);

  // Desfrute META — query direta a 'lancamentos' (cenario='meta') filtrada por TIPOS_DESFRUTE_OFICIAL.
  // Mantém a invariante (abate+venda+consumo, sem morte/transfer) — divergente do PC-100 que usa
  // saidas externas META (inclui morte/transfer).
  const [desfruteMetaMes12, setDesfruteMetaMes12] = useState<number[]>(() => Array(12).fill(0));
  useEffect(() => {
    let cancelled = false;
    const cid = clienteAtual?.id;
    if (!cid && !fazendaId) {
      setDesfruteMetaMes12(Array(12).fill(0));
      return;
    }
    const load = async () => {
      const PAGE = 1000;
      const allRows: any[] = [];
      let from = 0;
      while (true) {
        let q = supabase
          .from('lancamentos')
          .select('tipo, quantidade, data')
          .eq('cancelado', false)
          .eq('cenario', 'meta')
          .in('tipo', [...TIPOS_DESFRUTE_OFICIAL] as string[])
          .gte('data', `${ano}-01-01`)
          .lte('data', `${ano}-12-31`);
        if (isGlobal) {
          if (!cid) {
            if (!cancelled) setDesfruteMetaMes12(Array(12).fill(0));
            return;
          }
          q = q.eq('cliente_id', cid);
        } else if (fazendaId && fazendaId !== '__global__') {
          q = q.eq('fazenda_id', fazendaId);
        } else {
          if (!cancelled) setDesfruteMetaMes12(Array(12).fill(0));
          return;
        }
        const { data, error } = await q.order('data').range(from, from + PAGE - 1);
        if (cancelled) return;
        if (error || !data || data.length === 0) break;
        allRows.push(...data);
        if (data.length < PAGE) break;
        from += PAGE;
      }
      if (cancelled) return;
      const lite = allRows.map((r: any) => ({
        tipo: r.tipo,
        quantidade: Number(r.quantidade) || 0,
        data: r.data,
        cenario: 'realizado',  // bypass: já filtramos cenario=meta no SQL acima
      }));
      setDesfruteMetaMes12(buildDesfruteCabMensal(lite, ano));
    };
    load();
    return () => { cancelled = true; };
  }, [ano, isGlobal, fazendaId, clienteAtual?.id]);

  // Pec ano-1 (cenario='realizado', TIPOS_DESFRUTE) — agrega Σ valor_total e Σ qtd*pesoMedio/30
  // por mês. Suporta Receita Pec ano-1 e Preço de Venda R$/@ ano-1 (mesma fonte oficial).
  const [pecAnoAnt12, setPecAnoAnt12] = useState<{ rec: number[]; desfArr: number[] }>(
    () => ({ rec: Array(12).fill(0), desfArr: Array(12).fill(0) }),
  );
  useEffect(() => {
    if (!incluirComparativos) {
      setPecAnoAnt12({ rec: Array(12).fill(0), desfArr: Array(12).fill(0) });
      return;
    }
    let cancelled = false;
    const cid = clienteAtual?.id;
    const anoAnt = ano - 1;
    const load = async () => {
      const PAGE = 1000;
      const allRows: any[] = [];
      let from = 0;
      while (true) {
        let q = supabase
          .from('lancamentos')
          .select('tipo, quantidade, peso_medio_kg, valor_total, data')
          .eq('cancelado', false)
          .eq('cenario', 'realizado')
          .eq('status_operacional', 'realizado')
          .in('tipo', [...TIPOS_DESFRUTE_OFICIAL] as string[])
          .gte('data', `${anoAnt}-01-01`)
          .lte('data', `${anoAnt}-12-31`);
        if (isGlobal) {
          if (!cid) {
            if (!cancelled) setPecAnoAnt12({ rec: Array(12).fill(0), desfArr: Array(12).fill(0) });
            return;
          }
          q = q.eq('cliente_id', cid);
        } else if (fazendaId && fazendaId !== '__global__') {
          q = q.eq('fazenda_id', fazendaId);
        } else {
          if (!cancelled) setPecAnoAnt12({ rec: Array(12).fill(0), desfArr: Array(12).fill(0) });
          return;
        }
        const { data, error } = await q.order('data').range(from, from + PAGE - 1);
        if (cancelled) return;
        if (error || !data || data.length === 0) break;
        allRows.push(...data);
        if (data.length < PAGE) break;
        from += PAGE;
      }
      if (cancelled) return;
      const rec = Array(12).fill(0);
      const desfArr = Array(12).fill(0);
      for (const r of allRows) {
        const m = parseInt(String(r.data ?? '').slice(5, 7));
        if (isNaN(m) || m < 1 || m > 12) continue;
        const qtd = Number(r.quantidade) || 0;
        const pmk = Number(r.peso_medio_kg) || 0;
        const vt  = Math.abs(Number(r.valor_total) || 0);
        rec[m - 1]    += vt;
        desfArr[m - 1] += (qtd * pmk) / 30;
      }
      setPecAnoAnt12({ rec, desfArr });
    };
    load();
    return () => { cancelled = true; };
  }, [incluirComparativos, ano, isGlobal, fazendaId, clienteAtual?.id]);

  // Pec META (cenario='meta', TIPOS_DESFRUTE) — mesma estrutura para o ano corrente.
  const [pecMeta12, setPecMeta12] = useState<{ rec: number[]; desfArr: number[] }>(
    () => ({ rec: Array(12).fill(0), desfArr: Array(12).fill(0) }),
  );
  useEffect(() => {
    if (!carregarMetaEffective) {
      setPecMeta12({ rec: Array(12).fill(0), desfArr: Array(12).fill(0) });
      return;
    }
    let cancelled = false;
    const cid = clienteAtual?.id;
    const load = async () => {
      const PAGE = 1000;
      const allRows: any[] = [];
      let from = 0;
      while (true) {
        let q = supabase
          .from('lancamentos')
          .select('tipo, quantidade, peso_medio_kg, valor_total, data')
          .eq('cancelado', false)
          .eq('cenario', 'meta')
          .in('tipo', [...TIPOS_DESFRUTE_OFICIAL] as string[])
          .gte('data', `${ano}-01-01`)
          .lte('data', `${ano}-12-31`);
        if (isGlobal) {
          if (!cid) {
            if (!cancelled) setPecMeta12({ rec: Array(12).fill(0), desfArr: Array(12).fill(0) });
            return;
          }
          q = q.eq('cliente_id', cid);
        } else if (fazendaId && fazendaId !== '__global__') {
          q = q.eq('fazenda_id', fazendaId);
        } else {
          if (!cancelled) setPecMeta12({ rec: Array(12).fill(0), desfArr: Array(12).fill(0) });
          return;
        }
        const { data, error } = await q.order('data').range(from, from + PAGE - 1);
        if (cancelled) return;
        if (error || !data || data.length === 0) break;
        allRows.push(...data);
        if (data.length < PAGE) break;
        from += PAGE;
      }
      if (cancelled) return;
      const rec = Array(12).fill(0);
      const desfArr = Array(12).fill(0);
      for (const r of allRows) {
        const m = parseInt(String(r.data ?? '').slice(5, 7));
        if (isNaN(m) || m < 1 || m > 12) continue;
        const qtd = Number(r.quantidade) || 0;
        const pmk = Number(r.peso_medio_kg) || 0;
        const vt  = Math.abs(Number(r.valor_total) || 0);
        rec[m - 1]    += vt;
        desfArr[m - 1] += (qtd * pmk) / 30;
      }
      setPecMeta12({ rec, desfArr });
    };
    load();
    return () => { cancelled = true; };
  }, [carregarMetaEffective, ano, isGlobal, fazendaId, clienteAtual?.id]);

  // Custeio Produção Pecuária ANO-1 — financeiro_lancamentos_v2 do ano-1.
  // Filtros SQL: status_transacao='realizado', cenario='realizado', cancelado=false,
  //              sem_movimentacao_caixa=false, grupo_custo IN (Custo Fixo/Var Pec).
  const [custeioPecAnoAnt12, setCusteioPecAnoAnt12] = useState<number[]>(() => Array(12).fill(0));
  useEffect(() => {
    if (!incluirComparativos) {
      setCusteioPecAnoAnt12(Array(12).fill(0));
      return;
    }
    let cancelled = false;
    const cid = clienteAtual?.id;
    const anoAnt = ano - 1;
    const load = async () => {
      const PAGE = 1000;
      const allRows: any[] = [];
      let from = 0;
      while (true) {
        let q = (supabase
          .from('financeiro_lancamentos_v2')
          .select('data_pagamento, valor, grupo_custo') as any)
          .eq('cancelado', false)
          .eq('sem_movimentacao_caixa', false)
          .eq('status_transacao', 'realizado')
          .eq('cenario', 'realizado')
          .in('grupo_custo', ['Custo Fixo Pecuária', 'Custo Variável Pecuária'])
          .gte('data_pagamento', `${anoAnt}-01-01`)
          .lte('data_pagamento', `${anoAnt}-12-31`);
        if (isGlobal) {
          if (!cid) {
            if (!cancelled) setCusteioPecAnoAnt12(Array(12).fill(0));
            return;
          }
          q = q.eq('cliente_id', cid);
        } else if (fazendaId && fazendaId !== '__global__') {
          q = q.eq('fazenda_id', fazendaId);
        } else {
          if (!cancelled) setCusteioPecAnoAnt12(Array(12).fill(0));
          return;
        }
        const { data, error } = await q.range(from, from + PAGE - 1);
        if (cancelled) return;
        if (error || !data || data.length === 0) break;
        allRows.push(...data);
        if (data.length < PAGE) break;
        from += PAGE;
      }
      if (cancelled) return;
      const out = Array(12).fill(0);
      for (const r of allRows) {
        const m = parseInt(String(r.data_pagamento ?? '').slice(5, 7));
        if (isNaN(m) || m < 1 || m > 12) continue;
        out[m - 1] += Math.abs(Number(r.valor) || 0);
      }
      setCusteioPecAnoAnt12(out);
    };
    load();
    return () => { cancelled = true; };
  }, [incluirComparativos, ano, isGlobal, fazendaId, clienteAtual?.id]);

  // Custeio Produção Pecuária META — planejamento_financeiro cenario='meta'.
  // Sem status_transacao (planejamento não tem). Soma valor_planejado por mes.
  const [custeioPecMeta12, setCusteioPecMeta12] = useState<number[]>(() => Array(12).fill(0));
  useEffect(() => {
    if (!carregarMetaEffective) {
      setCusteioPecMeta12(Array(12).fill(0));
      return;
    }
    let cancelled = false;
    const cid = clienteAtual?.id;
    const load = async () => {
      const PAGE = 1000;
      const allRows: any[] = [];
      let from = 0;
      while (true) {
        let q = (supabase
          .from('planejamento_financeiro' as any)
          .select('mes, valor_planejado, grupo_custo') as any)
          .eq('ano', ano)
          .eq('cenario', 'meta')
          .in('grupo_custo', ['Custo Fixo Pecuária', 'Custo Variável Pecuária']);
        if (isGlobal) {
          if (!cid) {
            if (!cancelled) setCusteioPecMeta12(Array(12).fill(0));
            return;
          }
          q = q.eq('cliente_id', cid);
        } else if (fazendaId && fazendaId !== '__global__') {
          q = q.eq('fazenda_id', fazendaId);
        } else {
          if (!cancelled) setCusteioPecMeta12(Array(12).fill(0));
          return;
        }
        const { data, error } = await q.range(from, from + PAGE - 1);
        if (cancelled) return;
        if (error || !data || data.length === 0) break;
        allRows.push(...data);
        if (data.length < PAGE) break;
        from += PAGE;
      }
      if (cancelled) return;
      const out = Array(12).fill(0);
      for (const r of allRows) {
        const m = Number(r.mes);
        if (!Number.isInteger(m) || m < 1 || m > 12) continue;
        out[m - 1] += Number(r.valor_planejado) || 0;
      }
      setCusteioPecMeta12(out);
    };
    load();
    return () => { cancelled = true; };
  }, [carregarMetaEffective, ano, isGlobal, fazendaId, clienteAtual?.id]);

  // Valor do Rebanho META validada — somente Fazenda (Global não tem fonte oficial).
  const [valorRebanhoMetaMes, setValorRebanhoMetaMes] = useState<number[]>(() => Array(12).fill(NaN));
  useEffect(() => {
    const cid = clienteAtual?.id;
    if (!cid) { setValorRebanhoMetaMes(Array(12).fill(NaN)); return; }
    if (!isGlobal && (!fazendaId || fazendaId === '__global__')) {
      setValorRebanhoMetaMes(Array(12).fill(NaN));
      return;
    }
    let cancelled = false;
    const meses = Array.from({ length: 12 }, (_, i) => `${ano}-${String(i + 1).padStart(2, '0')}`);
    // Sem filtro de status — alinha com MetaPrecoTab (fonte oficial). O snapshot
    // é considerado autoritativo independente do status (ver auditoria meta).
    let q = supabase
      .from('valor_rebanho_meta_validada' as any)
      .select('ano_mes, valor_total')
      .eq('cliente_id', cid)
      .in('ano_mes', meses);
    if (!isGlobal) q = q.eq('fazenda_id', fazendaId);
    q.then(({ data, error }) => {
      if (cancelled) return;
      if (error || !data) { setValorRebanhoMetaMes(Array(12).fill(NaN)); return; }
      // Agregação por ano_mes — soma de fazendas validadas no Global; 1 só registro p/ Fazenda.
      const valor = Array(12).fill(0);
      const tem   = Array(12).fill(false);
      for (const r of data as any[]) {
        const idx = meses.indexOf(r.ano_mes);
        if (idx < 0) continue;
        const v = Number(r.valor_total) || 0;
        valor[idx] += v;
        tem[idx] = true;
      }
      // Mês sem nenhum registro → NaN (não 0); preserva semântica "sem meta".
      setValorRebanhoMetaMes(valor.map((v, i) => tem[i] ? v : NaN));
    });
    return () => { cancelled = true; };
  }, [ano, isGlobal, fazendaId, clienteAtual?.id]);

  const mesRef = mes === 0 ? 12 : mes;
  const mesStr = `${ano}-${String(mesRef).padStart(2, '0')}`;
  const { status: statusPilares } = useStatusPilares(fazendaId, mesStr);

  const monthlyData = useMemo(
    () =>
      buildMonthlyDataFromView(
        viewTotals,
        viewDataRealizado ?? [],
        lancFin,
        lancPec,
        ano,
        0,
        valorRebanhoMes,
        isGlobal,
        areaMensal,
      ),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [viewTotals, viewDataRealizado, lancFin, lancPec, ano, isGlobal, areaMensal, valorRebanhoMes],
  );

  const monthlyDataMeta = useMemo(
    () =>
      carregarMetaEffective && viewDataMeta && viewDataMeta.length > 0
        ? buildMonthlyDataFromView(
            viewTotalsMeta,
            viewDataMeta,
            [],
            [],
            ano,
            0,
            Array(13).fill(NaN),
            isGlobal,
            areaMensal,
          )
        : null,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [viewTotalsMeta, viewDataMeta, carregarMetaEffective, ano, isGlobal, areaMensal],
  );

  const loading = loadingRebanho || loadingLanc || loadingFin || loadingArea;

  const idx = mesRef - 1;

  const statusArea: StatusValidacaoArea = (() => {
    if (loadingArea) return 'carregando';
    if (isGlobal) {
      // Aguardar query de fazendas ativas completar antes de julgar
      if (!fazendasAtivasCarregadas) return 'carregando';
      if (totalFazendasAtivas === 0) return 'sem_snapshot';
      const comP1  = fazendasComP1PorMes[idx] ?? 0;
      const comSnap = fazendasComSnapPorMes[idx] ?? 0;
      if (comP1 === 0) return 'ok';
      if (comSnap < comP1) return 'incompleto';
      if ((areaMensal[idx] ?? 0) <= 0) return 'sem_snapshot';
      return 'ok';
    }
    if ((areaMensal[idx] ?? 0) > 0) return 'ok';
    if (temP1FechadoPorMes[idx]) return 'p1_fechado_sem_snap';
    return 'p1_aberto';
  })();

  const faltandoCount = isGlobal
    ? Math.max(0, (fazendasComP1PorMes[idx] ?? 0) - (fazendasComSnapPorMes[idx] ?? 0))
    : 0;

  const safe = (v: number | null | undefined) =>
    v == null || isNaN(Number(v)) ? null : Number(v);

  const meanArr = (arr: number[]): number | null => {
    const valid = arr.filter(v => v != null && !isNaN(v));
    return valid.length > 0
      ? valid.reduce((s, v) => s + v, 0) / valid.length
      : null;
  };

  const sumArr = (arr: number[]): number =>
    arr.reduce((s, v) => s + (v == null || isNaN(v) ? 0 : v), 0);

  const sliceUpTo = (arr: number[], i: number): number[] => arr.slice(0, i + 1);

  const isPeriodo = viewMode === 'periodo';

  // ── Integridade do GLOBAL ──
  // dadosCompletos: no modo global, verificar se todas as fazendas pecuárias
  // possuem P1 fechado no(s) mês(es) avaliado(s).
  // Usa fazendasComP1PorMes (fonte: fechamento_pastos) — não depende do cache.
  const dadosCompletos = (() => {
    if (!isGlobal) return true;
    if (loading || !fazendasAtivasCarregadas) return true; // não julgar durante carregamento
    if (totalFazendasAtivas === 0) return true;
    if (isPeriodo) {
      for (let i = 0; i <= idx; i++) {
        const comP1 = fazendasComP1PorMes[i] ?? 0;
        if (comP1 < totalFazendasAtivas) return false;
      }
      return true;
    }
    const comP1 = fazendasComP1PorMes[idx] ?? 0;
    return comP1 >= totalFazendasAtivas;
  })();
  const incompletoOverride = isGlobal && !dadosCompletos && !loading;

  // kgHaPorMes (mensal): peso vivo total do rebanho / área produtiva
  // Mantido aqui por ser usado abaixo no bloco kgHaIndicador (oficial PC-100).
  const kgHaPorMes = (monthlyData.pesoTotalFin ?? []).map((p, i) =>
    p > 0 && (areaMensal[i] ?? 0) > 0 ? p / areaMensal[i] : NaN
  );

  // ── Cabeças/Rebanho oficial (1-based, length 13) ──
  // monthlyData.cabFin é 0-based (índice 0=Jan); converter para 1-based.
  const cabFinSerie13 = Array.from({ length: 13 }, (_, i) =>
    i === 0 ? NaN : (monthlyData.cabFin[i - 1] ?? NaN)
  );

  // Média acumulada Jan→m baseada em cabMediaMes = (cabIni+cabFin)/2
  const cabMediaAcumulada = Array.from({ length: 13 }, (_, i) => {
    if (i === 0) return NaN;
    const vals = monthlyData.cabMediaMes
      .slice(0, i)
      .filter(v => !isNaN(v) && v > 0);
    return vals.length > 0
      ? vals.reduce((s, v) => s + v, 0) / vals.length
      : NaN;
  });

  const cabSerie = isPeriodo ? cabMediaAcumulada : cabFinSerie13;
  const mesIdx = mes;
  const cabValorRaw = cabSerie[mesIdx];
  const cabValor = (cabValorRaw == null || isNaN(cabValorRaw)) ? null : cabValorRaw;

  const cabDeltaMes = (() => {
    if (mesIdx <= 1) return null;
    const curr = cabSerie[mesIdx];
    const prev = cabSerie[mesIdx - 1];
    if (curr == null || isNaN(curr) || prev == null || isNaN(prev) || prev === 0) return null;
    return ((curr - prev) / prev) * 100;
  })();

  // ── Séries do ano anterior (somente quando incluirComparativos=true) ──
  // cabFin do ano anterior — 1-based (índice 0 = NaN, 1=Jan … 12=Dez)
  const cabFinAnoAntSerie = viewTotalsAnoAnt
    ? Array.from({ length: 13 }, (_, i) =>
        i === 0 ? NaN : (viewTotalsAnoAnt[i]?.saldo_final ?? NaN)
      )
    : null;

  // cabIni do ano anterior — para calcular cabMedia do ano anterior
  const cabIniAnoAntSerie = viewTotalsAnoAnt
    ? Array.from({ length: 13 }, (_, i) =>
        i === 0 ? NaN : (viewTotalsAnoAnt[i]?.saldo_inicial ?? NaN)
      )
    : null;

  // cabMediaAcumulada do ano anterior — rolling avg de cabMedia[m] = (cabIni[m] + cabFin[m]) / 2
  const cabMediaAcumAnoAnt = (() => {
    if (!cabFinAnoAntSerie || !cabIniAnoAntSerie) return null;
    const result = Array(13).fill(NaN) as number[];
    let sum = 0, n = 0;
    for (let m = 1; m <= 12; m++) {
      const ini = cabIniAnoAntSerie[m];
      const fin = cabFinAnoAntSerie[m];
      if (!isNaN(ini) && !isNaN(fin)) {
        sum += (ini + fin) / 2;
        n++;
        result[m] = sum / n;
      }
    }
    return result;
  })();

  const cabSerieAnoAnt = isPeriodo ? cabMediaAcumAnoAnt : cabFinAnoAntSerie;

  const cabDeltaAno = (() => {
    if (!cabSerieAnoAnt) return null;
    const curr = cabSerie[mesIdx];
    const ant  = cabSerieAnoAnt[mesIdx];
    if (curr == null || isNaN(curr) || ant == null || isNaN(ant) || ant === 0) return null;
    return ((curr - ant) / ant) * 100;
  })();

  // ── Séries da META para o ano corrente (carregadas se carregarMeta || incluirComparativos) ──
  const cabFinMetaSerie13 = monthlyDataMeta
    ? Array.from({ length: 13 }, (_, i) =>
        i === 0 ? NaN : (monthlyDataMeta.cabFin[i - 1] ?? NaN)
      )
    : null;

  const cabMediaAcumMeta = (() => {
    if (!monthlyDataMeta) return null;
    const result = Array(13).fill(NaN) as number[];
    let sum = 0, n = 0;
    for (let m = 1; m <= 12; m++) {
      const v = monthlyDataMeta.cabMediaMes[m - 1];
      if (!isNaN(v) && v > 0) {
        sum += v;
        n++;
        result[m] = sum / n;
      }
    }
    return result;
  })();

  const cabSerieMeta = isPeriodo ? cabMediaAcumMeta : cabFinMetaSerie13;

  const cabDeltaMeta = (() => {
    if (!cabSerieMeta) return null;
    const curr = cabSerie[mesIdx];
    const meta = cabSerieMeta[mesIdx];
    if (curr == null || isNaN(curr) || meta == null || isNaN(meta) || meta === 0) return null;
    return ((curr - meta) / meta) * 100;
  })();

  // ─────────────────────────────────────────────────────────────
  // ── Peso Médio oficial (1-based, length 13) ──
  // ─────────────────────────────────────────────────────────────
  // Realizado mensal — pesoMedioFin já é 0-based; converter para 1-based.
  const pesoMedioFinSerie13 = Array.from({ length: 13 }, (_, i) =>
    i === 0 ? NaN : (monthlyData.pesoMedioFin[i - 1] ?? NaN)
  );

  // Realizado período — média ponderada Σ pesoTotalFin / Σ cabFin (idêntico à fórmula
  // oficial do PainelConsultor já presente no escalar `pesoMedio` deste hook).
  const pesoMedioPeriodoSerie13 = Array.from({ length: 13 }, (_, i) => {
    if (i === 0) return NaN;
    const totalPeso = monthlyData.pesoTotalFin.slice(0, i)
      .reduce((s, v) => s + (Number.isNaN(v) ? 0 : v), 0);
    const totalCab = monthlyData.cabFin.slice(0, i)
      .reduce((s, v) => s + (Number.isNaN(v) ? 0 : v), 0);
    return totalCab > 0 ? totalPeso / totalCab : NaN;
  });

  const pesoSerie = isPeriodo ? pesoMedioPeriodoSerie13 : pesoMedioFinSerie13;

  const pesoDeltaMes = (() => {
    if (mesIdx <= 1) return null;
    const curr = safe(pesoSerie[mesIdx]);
    const prev = safe(pesoSerie[mesIdx - 1]);
    if (curr == null || prev == null || prev === 0) return null;
    return ((curr - prev) / prev) * 100;
  })();

  // Ano anterior — usa viewTotalsAnoAnt (carregado quando incluirComparativos=true)
  const pesoMedioFinAnoAnt13 = viewTotalsAnoAnt
    ? Array.from({ length: 13 }, (_, i) => {
        if (i === 0) return NaN;
        const ptf = viewTotalsAnoAnt[i]?.peso_total_final ?? 0;
        const cab = viewTotalsAnoAnt[i]?.saldo_final ?? 0;
        return cab > 0 ? ptf / cab : NaN;
      })
    : null;

  const pesoMedioPeriodoAnoAnt13 = viewTotalsAnoAnt
    ? Array.from({ length: 13 }, (_, i) => {
        if (i === 0) return NaN;
        let totalPeso = 0, totalCab = 0;
        for (let m = 1; m <= i; m++) {
          totalPeso += viewTotalsAnoAnt[m]?.peso_total_final ?? 0;
          totalCab  += viewTotalsAnoAnt[m]?.saldo_final ?? 0;
        }
        return totalCab > 0 ? totalPeso / totalCab : NaN;
      })
    : null;

  const pesoSerieAnoAnt = isPeriodo ? pesoMedioPeriodoAnoAnt13 : pesoMedioFinAnoAnt13;

  // Meta — usa monthlyDataMeta (gate carregarMetaEffective já existente)
  const pesoMedioMetaSerie13 = monthlyDataMeta
    ? Array.from({ length: 13 }, (_, i) =>
        i === 0 ? NaN : (monthlyDataMeta.pesoMedioFin[i - 1] ?? NaN)
      )
    : null;

  const pesoMedioPeriodoMetaSerie13 = monthlyDataMeta
    ? Array.from({ length: 13 }, (_, i) => {
        if (i === 0) return NaN;
        const totalPeso = (monthlyDataMeta.pesoTotalFin ?? []).slice(0, i)
          .reduce((s, v) => s + (Number.isNaN(v) ? 0 : v), 0);
        const totalCab = (monthlyDataMeta.cabFin ?? []).slice(0, i)
          .reduce((s, v) => s + (Number.isNaN(v) ? 0 : v), 0);
        return totalCab > 0 ? totalPeso / totalCab : NaN;
      })
    : null;

  const pesoMetaSerie = isPeriodo ? pesoMedioPeriodoMetaSerie13 : pesoMedioMetaSerie13;

  const pesoDeltaAno = (() => {
    if (!pesoSerieAnoAnt) return null;
    const curr = safe(pesoSerie[mesIdx]);
    const ant  = safe(pesoSerieAnoAnt[mesIdx]);
    if (curr == null || ant == null || ant === 0) return null;
    return ((curr - ant) / ant) * 100;
  })();

  const pesoDeltaMeta = (() => {
    if (!pesoMetaSerie) return null;
    const curr = safe(pesoSerie[mesIdx]);
    const meta = safe(pesoMetaSerie[mesIdx]);
    if (curr == null || meta == null || meta === 0) return null;
    return ((curr - meta) / meta) * 100;
  })();

  // ─────────────────────────────────────────────────────────────
  // ── GMD oficial (1-based, length 13) ──
  // Fórmula período = computePeriodGmd (PC-100), helper compartilhado.
  // ─────────────────────────────────────────────────────────────
  const diasNoMesAno = (anoRef: number) =>
    Array.from({ length: 12 }, (_, i) => new Date(anoRef, i + 1, 0).getDate());

  const diasAno = diasNoMesAno(ano);

  // GMD mensal (oficial): monthlyData.gmd já é prodBio/cabMedia/dias por mês.
  const gmdMesSerie13 = Array.from({ length: 13 }, (_, i) =>
    i === 0 ? NaN : (monthlyData.gmd[i - 1] ?? NaN)
  );

  // GMD período (oficial PC-100): computePeriodGmd(prodKg, cabMediaMes, dias).
  const gmdPeriodo12 = computePeriodGmd(monthlyData.prodKg, monthlyData.cabMediaMes, diasAno);
  const gmdPeriodoSerie13 = Array.from({ length: 13 }, (_, i) =>
    i === 0 ? NaN : (gmdPeriodo12[i - 1] ?? NaN)
  );

  const gmdSerie = isPeriodo ? gmdPeriodoSerie13 : gmdMesSerie13;
  const gmdValor = safe(gmdSerie[mesIdx]);

  const gmdDeltaMes = (() => {
    if (mesIdx <= 1) return null;
    const curr = safe(gmdSerie[mesIdx]);
    const prev = safe(gmdSerie[mesIdx - 1]);
    if (curr == null || prev == null || prev === 0) return null;
    return ((curr - prev) / prev) * 100;
  })();

  // Ano anterior — derivar prodKg, cabMediaMes, gmdMensal a partir de viewTotalsAnoAnt.
  const prodKgAnoAnt = viewTotalsAnoAnt
    ? Array.from({ length: 12 }, (_, i) => viewTotalsAnoAnt[i + 1]?.producao_biologica ?? 0)
    : null;

  const cabMediaMesAnoAnt = viewTotalsAnoAnt
    ? Array.from({ length: 12 }, (_, i) => {
        const ini = viewTotalsAnoAnt[i + 1]?.saldo_inicial ?? 0;
        const fin = viewTotalsAnoAnt[i + 1]?.saldo_final ?? 0;
        return (ini + fin) / 2;
      })
    : null;

  const diasAnoAnt = diasNoMesAno(ano - 1);

  const gmdMesAnoAntSerie13 = (prodKgAnoAnt && cabMediaMesAnoAnt)
    ? Array.from({ length: 13 }, (_, i) => {
        if (i === 0) return NaN;
        const m = i;
        const cm = cabMediaMesAnoAnt[m - 1];
        const pb = prodKgAnoAnt[m - 1];
        const d = diasAnoAnt[m - 1];
        return cm > 0 && d > 0 ? pb / cm / d : NaN;
      })
    : null;

  const gmdPeriodoAnoAntSerie13 = (prodKgAnoAnt && cabMediaMesAnoAnt)
    ? (() => {
        const arr12 = computePeriodGmd(prodKgAnoAnt, cabMediaMesAnoAnt, diasAnoAnt);
        return Array.from({ length: 13 }, (_, i) =>
          i === 0 ? NaN : (arr12[i - 1] ?? NaN)
        );
      })()
    : null;

  const gmdSerieAnoAnt = isPeriodo ? gmdPeriodoAnoAntSerie13 : gmdMesAnoAntSerie13;

  const gmdDeltaAno = (() => {
    if (!gmdSerieAnoAnt) return null;
    const curr = safe(gmdSerie[mesIdx]);
    const ant  = safe(gmdSerieAnoAnt[mesIdx]);
    if (curr == null || ant == null || ant === 0) return null;
    return ((curr - ant) / ant) * 100;
  })();

  // Meta — monthlyDataMeta já tem gmd mensal, prodKg e cabMediaMes.
  const gmdMesMetaSerie13 = monthlyDataMeta
    ? Array.from({ length: 13 }, (_, i) =>
        i === 0 ? NaN : (monthlyDataMeta.gmd[i - 1] ?? NaN)
      )
    : null;

  const gmdPeriodoMetaSerie13 = monthlyDataMeta
    ? (() => {
        const arr12 = computePeriodGmd(monthlyDataMeta.prodKg, monthlyDataMeta.cabMediaMes, diasAno);
        return Array.from({ length: 13 }, (_, i) =>
          i === 0 ? NaN : (arr12[i - 1] ?? NaN)
        );
      })()
    : null;

  const gmdSerieMeta = isPeriodo ? gmdPeriodoMetaSerie13 : gmdMesMetaSerie13;

  const gmdDeltaMeta = (() => {
    if (!gmdSerieMeta) return null;
    const curr = safe(gmdSerie[mesIdx]);
    const meta = safe(gmdSerieMeta[mesIdx]);
    if (curr == null || meta == null || meta === 0) return null;
    return ((curr - meta) / meta) * 100;
  })();

  // ─────────────────────────────────────────────────────────────
  // ── UA/ha oficial (1-based, length 13) ──
  // Fórmula período = rollingAvg(lotUaHa) (PC-100). Sem ano anterior nesta fase.
  // ─────────────────────────────────────────────────────────────
  const uaHaMesSerie13 = Array.from({ length: 13 }, (_, i) =>
    i === 0 ? NaN : (monthlyData.lotUaHa[i - 1] ?? NaN)
  );

  const uaHaPeriodo12 = rollingAvg(monthlyData.lotUaHa);
  const uaHaPeriodoSerie13 = Array.from({ length: 13 }, (_, i) =>
    i === 0 ? NaN : (uaHaPeriodo12[i - 1] ?? NaN)
  );

  const uaHaSerie = isPeriodo ? uaHaPeriodoSerie13 : uaHaMesSerie13;
  const uaHaValor = safe(uaHaSerie[mesIdx]);

  const uaHaDeltaMes = (() => {
    if (mesIdx <= 1) return null;
    const curr = safe(uaHaSerie[mesIdx]);
    const prev = safe(uaHaSerie[mesIdx - 1]);
    if (curr == null || prev == null || prev === 0) return null;
    return ((curr - prev) / prev) * 100;
  })();

  // Meta — monthlyDataMeta.lotUaHa já vem de calcularIndicadoresEficienciaArea.
  const uaHaMesMetaSerie13 = monthlyDataMeta
    ? Array.from({ length: 13 }, (_, i) =>
        i === 0 ? NaN : (monthlyDataMeta.lotUaHa[i - 1] ?? NaN)
      )
    : null;

  const uaHaPeriodoMetaSerie13 = monthlyDataMeta
    ? (() => {
        const arr12 = rollingAvg(monthlyDataMeta.lotUaHa);
        return Array.from({ length: 13 }, (_, i) =>
          i === 0 ? NaN : (arr12[i - 1] ?? NaN)
        );
      })()
    : null;

  const uaHaSerieMeta = isPeriodo ? uaHaPeriodoMetaSerie13 : uaHaMesMetaSerie13;

  const uaHaDeltaMeta = (() => {
    if (!uaHaSerieMeta) return null;
    const curr = safe(uaHaSerie[mesIdx]);
    const meta = safe(uaHaSerieMeta[mesIdx]);
    if (curr == null || meta == null || meta === 0) return null;
    return ((curr - meta) / meta) * 100;
  })();

  // ── Ano anterior — UA/ha (e kg vivo/ha): exige área ano-1 + viewTotalsAnoAnt ──
  // Reusa calcularIndicadoresEficienciaArea (helper compartilhado).
  const eficienciaAreaAnoAnt = (() => {
    const temAreaValidaAnoAnt =
      Array.isArray(areaMensalAnoAnt) &&
      areaMensalAnoAnt.some(v => v > 0);

    const temRebanhoAnoAnt =
      viewTotalsAnoAnt &&
      Object.keys(viewTotalsAnoAnt).length > 0;

    if (!temAreaValidaAnoAnt || !temRebanhoAnoAnt) return null;
    const cabIni = Array.from({ length: 12 }, (_, i) => viewTotalsAnoAnt[i + 1]?.saldo_inicial ?? 0);
    const cabFin = Array.from({ length: 12 }, (_, i) => viewTotalsAnoAnt[i + 1]?.saldo_final ?? 0);
    const pesoMedioFin = Array.from({ length: 12 }, (_, i) => {
      const c = cabFin[i];
      const ptf = viewTotalsAnoAnt[i + 1]?.peso_total_final ?? 0;
      return c > 0 ? ptf / c : NaN;
    });
    const arrobasProd = Array.from({ length: 12 }, (_, i) =>
      (viewTotalsAnoAnt[i + 1]?.producao_biologica ?? 0) / 30
    );
    return calcularIndicadoresEficienciaArea({
      cabIni, cabFin, pesoMedioFin, arrobasProd,
      areaProdMensal: areaMensalAnoAnt,
    });
  })();

  const uaHaMesAnoAntSerie13 = eficienciaAreaAnoAnt
    ? Array.from({ length: 13 }, (_, i) =>
        i === 0 ? NaN : (eficienciaAreaAnoAnt.lotUaHa[i - 1] ?? NaN)
      )
    : null;

  const uaHaPeriodoAnoAntSerie13 = eficienciaAreaAnoAnt
    ? (() => {
        const arr12 = rollingAvg(eficienciaAreaAnoAnt.lotUaHa);
        return Array.from({ length: 13 }, (_, i) =>
          i === 0 ? NaN : (arr12[i - 1] ?? NaN)
        );
      })()
    : null;

  const uaHaSerieAnoAnt = isPeriodo ? uaHaPeriodoAnoAntSerie13 : uaHaMesAnoAntSerie13;

  const uaHaDeltaAno = (() => {
    if (!uaHaSerieAnoAnt) return null;
    const curr = safe(uaHaSerie[mesIdx]);
    const ant  = safe(uaHaSerieAnoAnt[mesIdx]);
    if (curr == null || ant == null || ant === 0) return null;
    return ((curr - ant) / ant) * 100;
  })();

  // ─────────────────────────────────────────────────────────────
  // ── kg vivo/ha oficial (1-based, length 13) ──
  // peso vivo total do rebanho ÷ área produtiva (estoque, NÃO produção).
  // Período = rollingAvg PC-100. Sem ano anterior nesta fase.
  // ─────────────────────────────────────────────────────────────
  const kgHaMesSerie13 = Array.from({ length: 13 }, (_, i) =>
    i === 0 ? NaN : (kgHaPorMes[i - 1] ?? NaN)
  );

  const kgHaPeriodo12 = rollingAvg(kgHaPorMes);
  const kgHaPeriodoSerie13 = Array.from({ length: 13 }, (_, i) =>
    i === 0 ? NaN : (kgHaPeriodo12[i - 1] ?? NaN)
  );

  const kgHaSerie = isPeriodo ? kgHaPeriodoSerie13 : kgHaMesSerie13;
  const kgHaValor = safe(kgHaSerie[mesIdx]);

  const kgHaDeltaMes = (() => {
    if (mesIdx <= 1) return null;
    const curr = safe(kgHaSerie[mesIdx]);
    const prev = safe(kgHaSerie[mesIdx - 1]);
    if (curr == null || prev == null || prev === 0) return null;
    return ((curr - prev) / prev) * 100;
  })();

  // Meta — monthlyDataMeta.pesoTotalFin / areaMensal (mesma área do realizado).
  const kgHaPorMesMeta = monthlyDataMeta
    ? (monthlyDataMeta.pesoTotalFin ?? []).map((p, i) =>
        p > 0 && (areaMensal[i] ?? 0) > 0 ? p / areaMensal[i] : NaN
      )
    : null;

  const kgHaMesMetaSerie13 = kgHaPorMesMeta
    ? Array.from({ length: 13 }, (_, i) =>
        i === 0 ? NaN : (kgHaPorMesMeta[i - 1] ?? NaN)
      )
    : null;

  const kgHaPeriodoMetaSerie13 = kgHaPorMesMeta
    ? (() => {
        const arr12 = rollingAvg(kgHaPorMesMeta);
        return Array.from({ length: 13 }, (_, i) =>
          i === 0 ? NaN : (arr12[i - 1] ?? NaN)
        );
      })()
    : null;

  const kgHaSerieMeta = isPeriodo ? kgHaPeriodoMetaSerie13 : kgHaMesMetaSerie13;

  const kgHaDeltaMeta = (() => {
    if (!kgHaSerieMeta) return null;
    const curr = safe(kgHaSerie[mesIdx]);
    const meta = safe(kgHaSerieMeta[mesIdx]);
    if (curr == null || meta == null || meta === 0) return null;
    return ((curr - meta) / meta) * 100;
  })();

  // Ano anterior — kg vivo/ha: pesoTotalFin ano-1 / area ano-1.
  const kgHaPorMesAnoAnt = (viewTotalsAnoAnt && areaMensalAnoAnt)
    ? Array.from({ length: 12 }, (_, i) => {
        const ptf = viewTotalsAnoAnt[i + 1]?.peso_total_final ?? 0;
        const area = areaMensalAnoAnt[i] ?? 0;
        return ptf > 0 && area > 0 ? ptf / area : NaN;
      })
    : null;

  const kgHaMesAnoAntSerie13 = kgHaPorMesAnoAnt
    ? Array.from({ length: 13 }, (_, i) =>
        i === 0 ? NaN : (kgHaPorMesAnoAnt[i - 1] ?? NaN)
      )
    : null;

  const kgHaPeriodoAnoAntSerie13 = kgHaPorMesAnoAnt
    ? (() => {
        const arr12 = rollingAvg(kgHaPorMesAnoAnt);
        return Array.from({ length: 13 }, (_, i) =>
          i === 0 ? NaN : (arr12[i - 1] ?? NaN)
        );
      })()
    : null;

  const kgHaSerieAnoAnt = isPeriodo ? kgHaPeriodoAnoAntSerie13 : kgHaMesAnoAntSerie13;

  const kgHaDeltaAno = (() => {
    if (!kgHaSerieAnoAnt) return null;
    const curr = safe(kgHaSerie[mesIdx]);
    const ant  = safe(kgHaSerieAnoAnt[mesIdx]);
    if (curr == null || ant == null || ant === 0) return null;
    return ((curr - ant) / ant) * 100;
  })();

  // ─────────────────────────────────────────────────────────────
  // ── @ produzidas oficial — fluxo (1-based, length 13) ──
  // mes = valor do mês; periodo = soma acumulada Jan→m. Sem média/rollingAvg.
  // ─────────────────────────────────────────────────────────────
  const cumSumTo13 = (arr12: number[]): number[] => {
    const out = Array(13).fill(NaN) as number[];
    let acc = 0;
    for (let i = 1; i <= 12; i++) {
      const v = arr12[i - 1];
      acc += (v == null || isNaN(v) ? 0 : v);
      out[i] = acc;
    }
    return out;
  };

  const arrobasMesSerie13 = Array.from({ length: 13 }, (_, i) =>
    i === 0 ? NaN : (monthlyData.arrobasProd[i - 1] ?? NaN)
  );
  const arrobasPeriodoSerie13 = cumSumTo13(monthlyData.arrobasProd);
  const arrobasSerie = isPeriodo ? arrobasPeriodoSerie13 : arrobasMesSerie13;
  const arrobasValor = safe(arrobasSerie[mesIdx]);

  const arrobasDeltaMes = (() => {
    if (mesIdx <= 1) return null;
    const curr = safe(arrobasSerie[mesIdx]);
    const prev = safe(arrobasSerie[mesIdx - 1]);
    if (curr == null || prev == null || prev === 0) return null;
    return ((curr - prev) / prev) * 100;
  })();

  // Ano anterior — viewTotalsAnoAnt[m].producao_biologica / 30
  const arrobasProdAnoAnt12 = viewTotalsAnoAnt
    ? Array.from({ length: 12 }, (_, i) =>
        (viewTotalsAnoAnt[i + 1]?.producao_biologica ?? 0) / 30
      )
    : null;

  const arrobasMesAnoAntSerie13 = arrobasProdAnoAnt12
    ? Array.from({ length: 13 }, (_, i) =>
        i === 0 ? NaN : (arrobasProdAnoAnt12[i - 1] ?? NaN)
      )
    : null;

  const arrobasPeriodoAnoAntSerie13 = arrobasProdAnoAnt12
    ? cumSumTo13(arrobasProdAnoAnt12)
    : null;

  const arrobasSerieAnoAnt = isPeriodo ? arrobasPeriodoAnoAntSerie13 : arrobasMesAnoAntSerie13;

  const arrobasDeltaAno = (() => {
    if (!arrobasSerieAnoAnt) return null;
    const curr = safe(arrobasSerie[mesIdx]);
    const ant  = safe(arrobasSerieAnoAnt[mesIdx]);
    if (curr == null || ant == null || ant === 0) return null;
    return ((curr - ant) / ant) * 100;
  })();

  // Meta — monthlyDataMeta.arrobasProd
  const arrobasMesMetaSerie13 = monthlyDataMeta
    ? Array.from({ length: 13 }, (_, i) =>
        i === 0 ? NaN : (monthlyDataMeta.arrobasProd[i - 1] ?? NaN)
      )
    : null;

  const arrobasPeriodoMetaSerie13 = monthlyDataMeta
    ? cumSumTo13(monthlyDataMeta.arrobasProd)
    : null;

  const arrobasSerieMeta = isPeriodo ? arrobasPeriodoMetaSerie13 : arrobasMesMetaSerie13;

  const arrobasDeltaMeta = (() => {
    if (!arrobasSerieMeta) return null;
    const curr = safe(arrobasSerie[mesIdx]);
    const meta = safe(arrobasSerieMeta[mesIdx]);
    if (curr == null || meta == null || meta === 0) return null;
    return ((curr - meta) / meta) * 100;
  })();

  // ─────────────────────────────────────────────────────────────
  // ── Desfrute (cab.) oficial — fluxo (1-based, length 13) ──
  // mes = abate+venda+consumo do mês (já em monthlyData.desfruteCab via lancPec).
  // periodo = soma acumulada Jan→m. Sem média/rollingAvg, sem mortes.
  // ─────────────────────────────────────────────────────────────
  const desfruteMesSerie13 = Array.from({ length: 13 }, (_, i) =>
    i === 0 ? NaN : (monthlyData.desfruteCab[i - 1] ?? NaN)
  );
  const desfrutePeriodoSerie13 = cumSumTo13(monthlyData.desfruteCab);
  const desfruteSerie = isPeriodo ? desfrutePeriodoSerie13 : desfruteMesSerie13;
  const desfruteValor = safe(desfruteSerie[mesIdx]);

  const desfruteDeltaMes = (() => {
    if (mesIdx <= 1) return null;
    const curr = safe(desfruteSerie[mesIdx]);
    const prev = safe(desfruteSerie[mesIdx - 1]);
    if (curr == null || prev == null || prev === 0) return null;
    return ((curr - prev) / prev) * 100;
  })();

  // Ano anterior — Desfrute: query a 'lancamentos' (TIPOS_DESFRUTE_OFICIAL).
  const desfruteAnoAntPossui = desfruteAnoAnt12.some(v => v > 0);

  const desfruteMesAnoAntSerie13 = desfruteAnoAntPossui
    ? Array.from({ length: 13 }, (_, i) =>
        i === 0 ? NaN : (desfruteAnoAnt12[i - 1] ?? NaN)
      )
    : null;

  const desfrutePeriodoAnoAntSerie13 = desfruteAnoAntPossui
    ? cumSumTo13(desfruteAnoAnt12)
    : null;

  const desfruteSerieAnoAnt = isPeriodo ? desfrutePeriodoAnoAntSerie13 : desfruteMesAnoAntSerie13;

  const desfruteDeltaAno = (() => {
    if (!desfruteSerieAnoAnt) return null;
    const curr = safe(desfruteSerie[mesIdx]);
    const ant  = safe(desfruteSerieAnoAnt[mesIdx]);
    if (curr == null || ant == null || ant === 0) return null;
    return ((curr - ant) / ant) * 100;
  })();

  // Meta — Desfrute: 'lancamentos' cenario='meta' filtrado pelos mesmos tipos oficiais.
  const desfruteMetaPossui = desfruteMetaMes12.some(v => v > 0);

  const desfruteMesMetaSerie13 = desfruteMetaPossui
    ? Array.from({ length: 13 }, (_, i) =>
        i === 0 ? NaN : (desfruteMetaMes12[i - 1] ?? NaN)
      )
    : null;

  const desfrutePeriodoMetaSerie13 = desfruteMetaPossui
    ? cumSumTo13(desfruteMetaMes12)
    : null;

  const desfruteSerieMeta = isPeriodo ? desfrutePeriodoMetaSerie13 : desfruteMesMetaSerie13;

  const desfruteDeltaMeta = (() => {
    if (!desfruteSerieMeta) return null;
    const curr = safe(desfruteSerie[mesIdx]);
    const meta = safe(desfruteSerieMeta[mesIdx]);
    if (curr == null || meta == null || meta === 0) return null;
    return ((curr - meta) / meta) * 100;
  })();

  // ─────────────────────────────────────────────────────────────
  // ── Valor do Rebanho oficial — patrimônio/estoque (1-based, length 13) ──
  // mes = posição do mês. periodo = MESMO valor (estoque, sem soma/média).
  // Fonte: valor_rebanho_realizado_validado / vw_valor_rebanho_realizado_global_mensal.
  // ─────────────────────────────────────────────────────────────
  // valorRebanhoMes é 1-based (length 13): [0]=Dez ano-1, [1..12]=Jan..Dez.
  // serieAno é a mesma em mes/periodo (regra: período = posição do mês selecionado).
  const valorRebanhoSerie = valorRebanhoMes;
  const valorRebanhoValor = safe(valorRebanhoSerie[mesIdx]);

  const valorRebanhoDeltaMes = (() => {
    if (mesIdx < 1) return null;
    const curr = safe(valorRebanhoSerie[mesIdx]);
    // mesIdx-1 é Dez ano-1 quando mesIdx=1 — fonte oficial inclui esse valor
    const prev = safe(valorRebanhoSerie[mesIdx - 1]);
    if (curr == null || prev == null || prev === 0) return null;
    return ((curr - prev) / prev) * 100;
  })();

  // Ano anterior — vem de valorRebanhoMesAnoAnt (carregado quando incluirComparativos=true).
  const valorRebanhoSerieAnoAnt = valorRebanhoMesAnoAnt.some(v => !isNaN(v))
    ? valorRebanhoMesAnoAnt
    : null;

  const valorRebanhoDeltaAno = (() => {
    if (!valorRebanhoSerieAnoAnt) return null;
    const curr = safe(valorRebanhoSerie[mesIdx]);
    const ant  = safe(valorRebanhoSerieAnoAnt[mesIdx]);
    if (curr == null || ant == null || ant === 0) return null;
    return ((curr - ant) / ant) * 100;
  })();

  // Meta — só Fazenda. valorRebanhoMetaMes é 0-based (length 12).
  // Convertemos para 1-based length 13 para padronizar com as outras séries.
  const valorRebanhoSerieMeta = valorRebanhoMetaMes.some(v => !isNaN(v))
    ? Array.from({ length: 13 }, (_, i) =>
        i === 0 ? NaN : (valorRebanhoMetaMes[i - 1] ?? NaN)
      )
    : null;

  const valorRebanhoDeltaMeta = (() => {
    if (!valorRebanhoSerieMeta) return null;
    const curr = safe(valorRebanhoSerie[mesIdx]);
    const meta = safe(valorRebanhoSerieMeta[mesIdx]);
    if (curr == null || meta == null || meta === 0) return null;
    return ((curr - meta) / meta) * 100;
  })();

  // ─────────────────────────────────────────────────────────────
  // ── Financeiro Produtivo — 6 indicadores (1-based, length 13) ──
  // Sem ano-1 nem meta nas fontes auditadas (lancPec/lancFin ano-1
  // não fetched; monthlyDataMeta não tem recPecComp/custOper).
  // ─────────────────────────────────────────────────────────────
  const cumSumArr = (arr: number[]): number[] => {
    const out: number[] = [];
    let acc = 0;
    for (let i = 0; i < arr.length; i++) {
      const v = arr[i];
      acc += (v == null || isNaN(v) ? 0 : v);
      out.push(acc);
    }
    return out;
  };

  // === 1) Receita Pecuária Competência ===
  const receitaPecMesSerie13 = Array.from({ length: 13 }, (_, i) =>
    i === 0 ? NaN : (monthlyData.recPecComp[i - 1] ?? NaN)
  );
  const receitaPecPeriodoSerie13 = cumSumTo13(monthlyData.recPecComp);
  const receitaPecSerie = isPeriodo ? receitaPecPeriodoSerie13 : receitaPecMesSerie13;
  const receitaPecValor = safe(receitaPecSerie[mesIdx]);
  const receitaPecDeltaMes = (() => {
    if (mesIdx <= 1) return null;
    const curr = safe(receitaPecSerie[mesIdx]);
    const prev = safe(receitaPecSerie[mesIdx - 1]);
    if (curr == null || prev == null || prev === 0) return null;
    return ((curr - prev) / prev) * 100;
  })();

  // Receita Pec — ano-1 e meta (fonte: pecAnoAnt12 / pecMeta12 via fetch direto a 'lancamentos').
  const receitaPecAnoAntPossui = pecAnoAnt12.rec.some(v => v > 0);
  const receitaPecMesAnoAntSerie13 = receitaPecAnoAntPossui
    ? Array.from({ length: 13 }, (_, i) => i === 0 ? NaN : (pecAnoAnt12.rec[i - 1] ?? NaN))
    : null;
  const receitaPecPeriodoAnoAntSerie13 = receitaPecAnoAntPossui
    ? cumSumTo13(pecAnoAnt12.rec)
    : null;
  const receitaPecSerieAnoAnt = isPeriodo ? receitaPecPeriodoAnoAntSerie13 : receitaPecMesAnoAntSerie13;
  const receitaPecDeltaAno = (() => {
    if (!receitaPecSerieAnoAnt) return null;
    const curr = safe(receitaPecSerie[mesIdx]);
    const ant  = safe(receitaPecSerieAnoAnt[mesIdx]);
    if (curr == null || ant == null || ant === 0) return null;
    return ((curr - ant) / ant) * 100;
  })();

  const receitaPecMetaPossui = pecMeta12.rec.some(v => v > 0);
  const receitaPecMesMetaSerie13 = receitaPecMetaPossui
    ? Array.from({ length: 13 }, (_, i) => i === 0 ? NaN : (pecMeta12.rec[i - 1] ?? NaN))
    : null;
  const receitaPecPeriodoMetaSerie13 = receitaPecMetaPossui
    ? cumSumTo13(pecMeta12.rec)
    : null;
  const receitaPecSerieMeta = isPeriodo ? receitaPecPeriodoMetaSerie13 : receitaPecMesMetaSerie13;
  const receitaPecDeltaMeta = (() => {
    if (!receitaPecSerieMeta) return null;
    const curr = safe(receitaPecSerie[mesIdx]);
    const meta = safe(receitaPecSerieMeta[mesIdx]);
    if (curr == null || meta == null || meta === 0) return null;
    return ((curr - meta) / meta) * 100;
  })();

  // === 2) Custeio Produção Pecuária — fonte custeioPec (sem investimento/juros/agri) ===
  const custeioPecMesSerie13 = Array.from({ length: 13 }, (_, i) =>
    i === 0 ? NaN : (monthlyData.custeioPec[i - 1] ?? NaN)
  );
  const custeioPecPeriodoSerie13 = cumSumTo13(monthlyData.custeioPec);
  const custeioPecSerie = isPeriodo ? custeioPecPeriodoSerie13 : custeioPecMesSerie13;
  const custeioPecValor = safe(custeioPecSerie[mesIdx]);
  const custeioPecDeltaMes = (() => {
    if (mesIdx <= 1) return null;
    const curr = safe(custeioPecSerie[mesIdx]);
    const prev = safe(custeioPecSerie[mesIdx - 1]);
    if (curr == null || prev == null || prev === 0) return null;
    return ((curr - prev) / prev) * 100;
  })();

  // Custeio Pec — ano-1 (custeioPecAnoAnt12) e meta (custeioPecMeta12).
  const custeioPecAnoAntPossui = custeioPecAnoAnt12.some(v => v > 0);
  const custeioPecMesAnoAntSerie13 = custeioPecAnoAntPossui
    ? Array.from({ length: 13 }, (_, i) => i === 0 ? NaN : (custeioPecAnoAnt12[i - 1] ?? NaN))
    : null;
  const custeioPecPeriodoAnoAntSerie13 = custeioPecAnoAntPossui
    ? cumSumTo13(custeioPecAnoAnt12)
    : null;
  const custeioPecSerieAnoAnt = isPeriodo ? custeioPecPeriodoAnoAntSerie13 : custeioPecMesAnoAntSerie13;
  const custeioPecDeltaAno = (() => {
    if (!custeioPecSerieAnoAnt) return null;
    const curr = safe(custeioPecSerie[mesIdx]);
    const ant  = safe(custeioPecSerieAnoAnt[mesIdx]);
    if (curr == null || ant == null || ant === 0) return null;
    return ((curr - ant) / ant) * 100;
  })();

  const custeioPecMetaPossui = custeioPecMeta12.some(v => v > 0);
  const custeioPecMesMetaSerie13 = custeioPecMetaPossui
    ? Array.from({ length: 13 }, (_, i) => i === 0 ? NaN : (custeioPecMeta12[i - 1] ?? NaN))
    : null;
  const custeioPecPeriodoMetaSerie13 = custeioPecMetaPossui
    ? cumSumTo13(custeioPecMeta12)
    : null;
  const custeioPecSerieMeta = isPeriodo ? custeioPecPeriodoMetaSerie13 : custeioPecMesMetaSerie13;
  const custeioPecDeltaMeta = (() => {
    if (!custeioPecSerieMeta) return null;
    const curr = safe(custeioPecSerie[mesIdx]);
    const meta = safe(custeioPecSerieMeta[mesIdx]);
    if (curr == null || meta == null || meta === 0) return null;
    return ((curr - meta) / meta) * 100;
  })();

  // === 3) Custo Produtivo R$/@ — custeioPec / arrobasProd ===
  const custoArrMes12 = monthlyData.custeioPec.map((c, i) => {
    const a = monthlyData.arrobasProd[i];
    return a != null && a > 0 ? c / a : NaN;
  });
  const custoArrPeriodo12 = (() => {
    const cAcum = cumSumArr(monthlyData.custeioPec);
    const aAcum = cumSumArr(monthlyData.arrobasProd);
    return cAcum.map((c, i) => aAcum[i] > 0 ? c / aAcum[i] : NaN);
  })();
  const custoArrMesSerie13 = Array.from({ length: 13 }, (_, i) =>
    i === 0 ? NaN : (custoArrMes12[i - 1] ?? NaN)
  );
  const custoArrPeriodoSerie13 = Array.from({ length: 13 }, (_, i) =>
    i === 0 ? NaN : (custoArrPeriodo12[i - 1] ?? NaN)
  );
  const custoArrSerie = isPeriodo ? custoArrPeriodoSerie13 : custoArrMesSerie13;
  const custoArrValor = safe(custoArrSerie[mesIdx]);
  const custoArrDeltaMes = (() => {
    if (mesIdx <= 1) return null;
    const curr = safe(custoArrSerie[mesIdx]);
    const prev = safe(custoArrSerie[mesIdx - 1]);
    if (curr == null || prev == null || prev === 0) return null;
    return ((curr - prev) / prev) * 100;
  })();

  // Custo R$/@ — ano-1 e meta. Possui se custeio E arrobas ano-1/meta possuírem.
  const custoArrAnoAntPossui = custeioPecAnoAntPossui
    && !!arrobasProdAnoAnt12 && arrobasProdAnoAnt12.some(v => v > 0);
  const custoArrMesAnoAnt12 = custoArrAnoAntPossui && arrobasProdAnoAnt12
    ? custeioPecAnoAnt12.map((c, i) => {
        const a = arrobasProdAnoAnt12[i];
        return a > 0 ? c / a : NaN;
      })
    : null;
  const custoArrPeriodoAnoAnt12 = custoArrAnoAntPossui && arrobasProdAnoAnt12
    ? (() => {
        const cAcum = cumSumArr(custeioPecAnoAnt12);
        const aAcum = cumSumArr(arrobasProdAnoAnt12);
        return cAcum.map((c, i) => aAcum[i] > 0 ? c / aAcum[i] : NaN);
      })()
    : null;
  const custoArrMesAnoAntSerie13 = custoArrMesAnoAnt12
    ? Array.from({ length: 13 }, (_, i) => i === 0 ? NaN : (custoArrMesAnoAnt12[i - 1] ?? NaN))
    : null;
  const custoArrPeriodoAnoAntSerie13 = custoArrPeriodoAnoAnt12
    ? Array.from({ length: 13 }, (_, i) => i === 0 ? NaN : (custoArrPeriodoAnoAnt12[i - 1] ?? NaN))
    : null;
  const custoArrSerieAnoAnt = isPeriodo ? custoArrPeriodoAnoAntSerie13 : custoArrMesAnoAntSerie13;
  const custoArrDeltaAno = (() => {
    if (!custoArrSerieAnoAnt) return null;
    const curr = safe(custoArrSerie[mesIdx]);
    const ant  = safe(custoArrSerieAnoAnt[mesIdx]);
    if (curr == null || ant == null || ant === 0) return null;
    return ((curr - ant) / ant) * 100;
  })();

  const custoArrMetaPossui = custeioPecMetaPossui
    && !!monthlyDataMeta && monthlyDataMeta.arrobasProd.some(v => v > 0);
  const custoArrMesMeta12 = custoArrMetaPossui && monthlyDataMeta
    ? custeioPecMeta12.map((c, i) => {
        const a = monthlyDataMeta.arrobasProd[i];
        return a > 0 ? c / a : NaN;
      })
    : null;
  const custoArrPeriodoMeta12 = custoArrMetaPossui && monthlyDataMeta
    ? (() => {
        const cAcum = cumSumArr(custeioPecMeta12);
        const aAcum = cumSumArr(monthlyDataMeta.arrobasProd);
        return cAcum.map((c, i) => aAcum[i] > 0 ? c / aAcum[i] : NaN);
      })()
    : null;
  const custoArrMesMetaSerie13 = custoArrMesMeta12
    ? Array.from({ length: 13 }, (_, i) => i === 0 ? NaN : (custoArrMesMeta12[i - 1] ?? NaN))
    : null;
  const custoArrPeriodoMetaSerie13 = custoArrPeriodoMeta12
    ? Array.from({ length: 13 }, (_, i) => i === 0 ? NaN : (custoArrPeriodoMeta12[i - 1] ?? NaN))
    : null;
  const custoArrSerieMeta = isPeriodo ? custoArrPeriodoMetaSerie13 : custoArrMesMetaSerie13;
  const custoArrDeltaMeta = (() => {
    if (!custoArrSerieMeta) return null;
    const curr = safe(custoArrSerie[mesIdx]);
    const meta = safe(custoArrSerieMeta[mesIdx]);
    if (curr == null || meta == null || meta === 0) return null;
    return ((curr - meta) / meta) * 100;
  })();

  // === 4) Preço de Venda R$/@ — recPecComp / desfrute_arr ===
  const precoArrMes12 = monthlyData.recPecComp.map((r, i) => {
    const d = monthlyData.desfrute_arr[i];
    return d != null && d > 0 ? r / d : NaN;
  });
  const precoArrPeriodo12 = (() => {
    const rAcum = cumSumArr(monthlyData.recPecComp);
    const dAcum = cumSumArr(monthlyData.desfrute_arr);
    return rAcum.map((r, i) => dAcum[i] > 0 ? r / dAcum[i] : NaN);
  })();
  const precoArrMesSerie13 = Array.from({ length: 13 }, (_, i) =>
    i === 0 ? NaN : (precoArrMes12[i - 1] ?? NaN)
  );
  const precoArrPeriodoSerie13 = Array.from({ length: 13 }, (_, i) =>
    i === 0 ? NaN : (precoArrPeriodo12[i - 1] ?? NaN)
  );
  const precoArrSerie = isPeriodo ? precoArrPeriodoSerie13 : precoArrMesSerie13;
  const precoArrValor = safe(precoArrSerie[mesIdx]);
  const precoArrDeltaMes = (() => {
    if (mesIdx <= 1) return null;
    const curr = safe(precoArrSerie[mesIdx]);
    const prev = safe(precoArrSerie[mesIdx - 1]);
    if (curr == null || prev == null || prev === 0) return null;
    return ((curr - prev) / prev) * 100;
  })();

  // Preço R$/@ — ano-1 e meta (mesmas fontes pecAnoAnt12 / pecMeta12).
  const precoArrAnoAntPossui = pecAnoAnt12.desfArr.some(v => v > 0);
  const precoArrMesAnoAnt12 = precoArrAnoAntPossui
    ? pecAnoAnt12.rec.map((r, i) => {
        const d = pecAnoAnt12.desfArr[i];
        return d > 0 ? r / d : NaN;
      })
    : null;
  const precoArrPeriodoAnoAnt12 = precoArrAnoAntPossui
    ? (() => {
        const rAcum = cumSumArr(pecAnoAnt12.rec);
        const dAcum = cumSumArr(pecAnoAnt12.desfArr);
        return rAcum.map((r, i) => dAcum[i] > 0 ? r / dAcum[i] : NaN);
      })()
    : null;
  const precoArrMesAnoAntSerie13 = precoArrMesAnoAnt12
    ? Array.from({ length: 13 }, (_, i) => i === 0 ? NaN : (precoArrMesAnoAnt12[i - 1] ?? NaN))
    : null;
  const precoArrPeriodoAnoAntSerie13 = precoArrPeriodoAnoAnt12
    ? Array.from({ length: 13 }, (_, i) => i === 0 ? NaN : (precoArrPeriodoAnoAnt12[i - 1] ?? NaN))
    : null;
  const precoArrSerieAnoAnt = isPeriodo ? precoArrPeriodoAnoAntSerie13 : precoArrMesAnoAntSerie13;
  const precoArrDeltaAno = (() => {
    if (!precoArrSerieAnoAnt) return null;
    const curr = safe(precoArrSerie[mesIdx]);
    const ant  = safe(precoArrSerieAnoAnt[mesIdx]);
    if (curr == null || ant == null || ant === 0) return null;
    return ((curr - ant) / ant) * 100;
  })();

  const precoArrMetaPossui = pecMeta12.desfArr.some(v => v > 0);
  const precoArrMesMeta12 = precoArrMetaPossui
    ? pecMeta12.rec.map((r, i) => {
        const d = pecMeta12.desfArr[i];
        return d > 0 ? r / d : NaN;
      })
    : null;
  const precoArrPeriodoMeta12 = precoArrMetaPossui
    ? (() => {
        const rAcum = cumSumArr(pecMeta12.rec);
        const dAcum = cumSumArr(pecMeta12.desfArr);
        return rAcum.map((r, i) => dAcum[i] > 0 ? r / dAcum[i] : NaN);
      })()
    : null;
  const precoArrMesMetaSerie13 = precoArrMesMeta12
    ? Array.from({ length: 13 }, (_, i) => i === 0 ? NaN : (precoArrMesMeta12[i - 1] ?? NaN))
    : null;
  const precoArrPeriodoMetaSerie13 = precoArrPeriodoMeta12
    ? Array.from({ length: 13 }, (_, i) => i === 0 ? NaN : (precoArrPeriodoMeta12[i - 1] ?? NaN))
    : null;
  const precoArrSerieMeta = isPeriodo ? precoArrPeriodoMetaSerie13 : precoArrMesMetaSerie13;
  const precoArrDeltaMeta = (() => {
    if (!precoArrSerieMeta) return null;
    const curr = safe(precoArrSerie[mesIdx]);
    const meta = safe(precoArrSerieMeta[mesIdx]);
    if (curr == null || meta == null || meta === 0) return null;
    return ((curr - meta) / meta) * 100;
  })();

  // === 5) Custo Cab. R$/cab — custeioPec / cabMedia (mesma base GMD) ===
  // Mês:     custeioPec[m] / cabMediaMes[m]
  // Período: (Σ custeioPec Jan→m / cabMediaAcumulada[m]) / m
  //          onde m = número de meses considerados no período (1..12).
  // Não somar custo/cab mês a mês — a divisão pelo nº de meses garante R$/cab.mês médio.
  const custoCabMes12 = monthlyData.custeioPec.map((c, i) => {
    const cm = monthlyData.cabMediaMes[i];
    return cm != null && cm > 0 ? c / cm : NaN;
  });
  const custoCabPeriodoSerie13 = Array.from({ length: 13 }, (_, i) => {
    if (i === 0) return NaN;
    const cAcum = sumArr(sliceUpTo(monthlyData.custeioPec, i - 1));
    const cmAcum = cabMediaAcumulada[i];
    if (!(cmAcum > 0)) return NaN;
    return (cAcum / cmAcum) / i;
  });
  const custoCabMesSerie13 = Array.from({ length: 13 }, (_, i) =>
    i === 0 ? NaN : (custoCabMes12[i - 1] ?? NaN)
  );
  const custoCabSerie = isPeriodo ? custoCabPeriodoSerie13 : custoCabMesSerie13;
  const custoCabValor = safe(custoCabSerie[mesIdx]);
  const custoCabDeltaMes = (() => {
    if (mesIdx <= 1) return null;
    const curr = safe(custoCabSerie[mesIdx]);
    const prev = safe(custoCabSerie[mesIdx - 1]);
    if (curr == null || prev == null || prev === 0) return null;
    return ((curr - prev) / prev) * 100;
  })();

  // Custo Cab. — ano-1 e meta. Mesma fórmula: mês = c/cm; per = (Σc/cmAcum)/numMeses.
  const custoCabAnoAntPossui = custeioPecAnoAntPossui
    && !!cabMediaMesAnoAnt && cabMediaMesAnoAnt.some(v => v > 0)
    && !!cabMediaAcumAnoAnt;
  const custoCabMesAnoAnt12 = custoCabAnoAntPossui && cabMediaMesAnoAnt
    ? custeioPecAnoAnt12.map((c, i) => {
        const cm = cabMediaMesAnoAnt[i];
        return cm > 0 ? c / cm : NaN;
      })
    : null;
  const custoCabMesAnoAntSerie13 = custoCabMesAnoAnt12
    ? Array.from({ length: 13 }, (_, i) => i === 0 ? NaN : (custoCabMesAnoAnt12[i - 1] ?? NaN))
    : null;
  const custoCabPeriodoAnoAntSerie13 = custoCabAnoAntPossui && cabMediaAcumAnoAnt
    ? Array.from({ length: 13 }, (_, i) => {
        if (i === 0) return NaN;
        const cAcum = sumArr(sliceUpTo(custeioPecAnoAnt12, i - 1));
        const cmAcum = cabMediaAcumAnoAnt[i];
        if (!(cmAcum > 0)) return NaN;
        return (cAcum / cmAcum) / i;
      })
    : null;
  const custoCabSerieAnoAnt = isPeriodo ? custoCabPeriodoAnoAntSerie13 : custoCabMesAnoAntSerie13;
  const custoCabDeltaAno = (() => {
    if (!custoCabSerieAnoAnt) return null;
    const curr = safe(custoCabSerie[mesIdx]);
    const ant  = safe(custoCabSerieAnoAnt[mesIdx]);
    if (curr == null || ant == null || ant === 0) return null;
    return ((curr - ant) / ant) * 100;
  })();

  const custoCabMetaPossui = custeioPecMetaPossui
    && !!monthlyDataMeta && monthlyDataMeta.cabMediaMes.some(v => v > 0)
    && !!cabMediaAcumMeta;
  const custoCabMesMeta12 = custoCabMetaPossui && monthlyDataMeta
    ? custeioPecMeta12.map((c, i) => {
        const cm = monthlyDataMeta.cabMediaMes[i];
        return cm > 0 ? c / cm : NaN;
      })
    : null;
  const custoCabMesMetaSerie13 = custoCabMesMeta12
    ? Array.from({ length: 13 }, (_, i) => i === 0 ? NaN : (custoCabMesMeta12[i - 1] ?? NaN))
    : null;
  const custoCabPeriodoMetaSerie13 = custoCabMetaPossui && cabMediaAcumMeta
    ? Array.from({ length: 13 }, (_, i) => {
        if (i === 0) return NaN;
        const cAcum = sumArr(sliceUpTo(custeioPecMeta12, i - 1));
        const cmAcum = cabMediaAcumMeta[i];
        if (!(cmAcum > 0)) return NaN;
        return (cAcum / cmAcum) / i;
      })
    : null;
  const custoCabSerieMeta = isPeriodo ? custoCabPeriodoMetaSerie13 : custoCabMesMetaSerie13;
  const custoCabDeltaMeta = (() => {
    if (!custoCabSerieMeta) return null;
    const curr = safe(custoCabSerie[mesIdx]);
    const meta = safe(custoCabSerieMeta[mesIdx]);
    if (curr == null || meta == null || meta === 0) return null;
    return ((curr - meta) / meta) * 100;
  })();

  // === 6) Margem por @ — preçoArr − custoArr ===
  const margemArrMesSerie13 = Array.from({ length: 13 }, (_, i) => {
    if (i === 0) return NaN;
    const p = precoArrMesSerie13[i];
    const c = custoArrMesSerie13[i];
    if (isNaN(p) || isNaN(c)) return NaN;
    return p - c;
  });
  const margemArrPeriodoSerie13 = Array.from({ length: 13 }, (_, i) => {
    if (i === 0) return NaN;
    const p = precoArrPeriodoSerie13[i];
    const c = custoArrPeriodoSerie13[i];
    if (isNaN(p) || isNaN(c)) return NaN;
    return p - c;
  });
  const margemArrSerie = isPeriodo ? margemArrPeriodoSerie13 : margemArrMesSerie13;
  const margemArrValor = safe(margemArrSerie[mesIdx]);
  const margemArrDeltaMes = (() => {
    if (mesIdx <= 1) return null;
    const curr = safe(margemArrSerie[mesIdx]);
    const prev = safe(margemArrSerie[mesIdx - 1]);
    if (curr == null || prev == null || prev === 0) return null;
    return ((curr - prev) / prev) * 100;
  })();

  // Margem por @ — ano-1 e meta. Deriva: precoArr − custoArr (mesma série/modo).
  const margemArrSerieAnoAnt = (precoArrSerieAnoAnt && custoArrSerieAnoAnt)
    ? Array.from({ length: 13 }, (_, i) => {
        if (i === 0) return NaN;
        const p = precoArrSerieAnoAnt[i];
        const c = custoArrSerieAnoAnt[i];
        if (isNaN(p) || isNaN(c)) return NaN;
        return p - c;
      })
    : null;
  const margemArrDeltaAno = (() => {
    if (!margemArrSerieAnoAnt) return null;
    const curr = safe(margemArrSerie[mesIdx]);
    const ant  = safe(margemArrSerieAnoAnt[mesIdx]);
    if (curr == null || ant == null || ant === 0) return null;
    return ((curr - ant) / ant) * 100;
  })();

  const margemArrSerieMeta = (precoArrSerieMeta && custoArrSerieMeta)
    ? Array.from({ length: 13 }, (_, i) => {
        if (i === 0) return NaN;
        const p = precoArrSerieMeta[i];
        const c = custoArrSerieMeta[i];
        if (isNaN(p) || isNaN(c)) return NaN;
        return p - c;
      })
    : null;
  const margemArrDeltaMeta = (() => {
    if (!margemArrSerieMeta) return null;
    const curr = safe(margemArrSerie[mesIdx]);
    const meta = safe(margemArrSerieMeta[mesIdx]);
    if (curr == null || meta == null || meta === 0) return null;
    return ((curr - meta) / meta) * 100;
  })();

  const baseReturn: PainelConsultorDataResult = {
    cabecas: isPeriodo
      ? meanArr(sliceUpTo(monthlyData.cabFin, idx))
      : safe(monthlyData.cabFin[idx]),

    pesoMedio: isPeriodo
      ? (() => {
          const totalPeso = sumArr(sliceUpTo(monthlyData.pesoTotalFin, idx));
          const totalCab  = sumArr(sliceUpTo(monthlyData.cabFin, idx));
          return totalCab > 0 ? totalPeso / totalCab : null;
        })()
      : safe(monthlyData.pesoMedioFin[idx]),

    // GMD: série oficial (mês = monthlyData.gmd; período = computePeriodGmd PC-100)
    gmd: gmdValor,

    // @ produzidas: série oficial (mês = valor do mês; período = acumulado Jan→m)
    arrobas: arrobasValor,

    // Desfrute (cab.): série oficial (mês = valor do mês; período = acumulado Jan→m)
    desfrute: desfruteValor,

    receita: isPeriodo
      ? sumArr(sliceUpTo(monthlyData.recPecComp, idx))
      : safe(monthlyData.recPecComp[idx]),

    desembolso: isPeriodo
      ? sumArr(sliceUpTo(monthlyData.custOper, idx))
      : safe(monthlyData.custOper[idx]),

    resultado: isPeriodo
      ? sumArr(sliceUpTo(monthlyData.resOper, idx))
      : safe(monthlyData.resOper[idx]),

    // Valor Rebanho e areaProdutivaMes: posição do mês selecionado — não soma, não média
    valorRebanhoMes: safe(monthlyData.valorRebFin[idx]),
    areaProdutivaMes: safe(areaMensal[idx]),

    // UA/ha: série oficial (mês = monthlyData.lotUaHa; período = rollingAvg PC-100)
    lotUaHa: uaHaValor,

    arrHa: isPeriodo
      ? meanArr(sliceUpTo(monthlyData.arrHa, idx))
      : safe(monthlyData.arrHa[idx]),

    kgHa: kgHaValor,
    statusArea,
    faltandoCount,
    statusPilares: statusPilares ?? null,
    dadosCompletos,
    seriesMensais: monthlyData ? {
      cabFin:       monthlyData.cabFin,
      cabMediaAcumulada,
      pesoMedioFin: monthlyData.pesoMedioFin,
      arrobasProd:  monthlyData.arrobasProd,
      gmd:          monthlyData.gmd,
      desfruteCab:  monthlyData.desfruteCab,
      valorRebFin:  monthlyData.valorRebFin,
    } : null,
    seriesMeta: monthlyDataMeta ? {
      cabFin:       monthlyDataMeta.cabFin,
      pesoMedioFin: monthlyDataMeta.pesoMedioFin,
      arrobasProd:  monthlyDataMeta.arrobasProd,
      gmd:          monthlyDataMeta.gmd,
    } : null,
    cabecasIndicador: monthlyData ? {
      label:     isPeriodo ? 'REBANHO MÉDIO' : 'CABEÇAS',
      titulo:    isPeriodo ? 'Rebanho Médio no período' : 'Rebanho Final do mês',
      subtitulo: isPeriodo
        ? 'Quantidade média de cabeças no período selecionado'
        : 'Quantidade de cabeças no final do mês',
      valor:     cabValor,
      deltaMes:  cabDeltaMes,
      deltaAno:  cabDeltaAno,
      deltaMeta: cabDeltaMeta,
      serieAno:  cabSerie,
      serieAnoAnt: cabSerieAnoAnt ?? undefined,
      serieMetaIndicador: cabSerieMeta ?? undefined,
    } : null,
    pesoMedioIndicador: monthlyData ? {
      label:     isPeriodo ? 'PESO MÉDIO PERÍODO' : 'PESO MÉDIO FINAL',
      titulo:    isPeriodo ? 'Peso Médio Período' : 'Peso Médio Final',
      subtitulo: isPeriodo
        ? 'Peso médio do rebanho na média do período'
        : 'Peso médio do rebanho no final do mês',
      valor:     safe(pesoSerie[mesIdx]),
      deltaMes:  pesoDeltaMes,
      deltaAno:  pesoDeltaAno,
      deltaMeta: pesoDeltaMeta,
      serieAno:    pesoSerie,
      serieAnoAnt: pesoSerieAnoAnt ?? undefined,
      serieMeta:   pesoMetaSerie ?? undefined,
    } : null,
    gmdIndicador: monthlyData ? {
      label:     isPeriodo ? 'GMD MÉDIO NO PERÍODO' : 'GMD NO MÊS',
      titulo:    isPeriodo ? 'GMD no Período' : 'GMD no mês',
      subtitulo: isPeriodo
        ? 'Ganho médio diário no período'
        : 'Ganho médio diário no mês',
      valor:     gmdValor,
      deltaMes:  gmdDeltaMes,
      deltaAno:  gmdDeltaAno,
      deltaMeta: gmdDeltaMeta,
      serieAno:    gmdSerie,
      serieAnoAnt: gmdSerieAnoAnt ?? undefined,
      serieMeta:   gmdSerieMeta ?? undefined,
    } : null,
    uaHaIndicador: monthlyData ? {
      label:     isPeriodo ? 'UA/HA MÉDIA NO PERÍODO' : 'UA/HA NO MÊS',
      titulo:    isPeriodo ? 'UA/ha no período' : 'UA/ha no mês',
      subtitulo: isPeriodo
        ? 'Taxa de lotação média no período'
        : 'Taxa de lotação no mês',
      valor:     uaHaValor,
      deltaMes:  uaHaDeltaMes,
      deltaAno:  uaHaDeltaAno,
      deltaMeta: uaHaDeltaMeta,
      serieAno:    uaHaSerie,
      serieAnoAnt: uaHaSerieAnoAnt ?? undefined,
      serieMeta:   uaHaSerieMeta ?? undefined,
    } : null,
    kgHaIndicador: monthlyData ? {
      label:     isPeriodo ? 'KG VIVO/HA MÉDIO NO PERÍODO' : 'KG VIVO/HA NO MÊS',
      titulo:    isPeriodo ? 'kg vivo/ha no período' : 'kg vivo/ha no mês',
      subtitulo: isPeriodo
        ? 'Peso vivo médio do rebanho por hectare no período'
        : 'Peso vivo do rebanho por hectare no final do mês',
      valor:     kgHaValor,
      deltaMes:  kgHaDeltaMes,
      deltaAno:  kgHaDeltaAno,
      deltaMeta: kgHaDeltaMeta,
      serieAno:    kgHaSerie,
      serieAnoAnt: kgHaSerieAnoAnt ?? undefined,
      serieMeta:   kgHaSerieMeta ?? undefined,
    } : null,
    arrobasIndicador: monthlyData ? {
      label:     isPeriodo ? '@ PRODUZIDAS NO PERÍODO' : '@ PRODUZIDAS NO MÊS',
      titulo:    isPeriodo ? '@ produzidas no período' : '@ produzidas no mês',
      subtitulo: isPeriodo
        ? 'Arrobas produzidas acumuladas no período'
        : 'Arrobas produzidas no mês',
      valor:     arrobasValor,
      deltaMes:  arrobasDeltaMes,
      deltaAno:  arrobasDeltaAno,
      deltaMeta: arrobasDeltaMeta,
      serieAno:    arrobasSerie,
      serieAnoAnt: arrobasSerieAnoAnt ?? undefined,
      serieMeta:   arrobasSerieMeta ?? undefined,
    } : null,
    desfruteIndicador: monthlyData ? {
      label:     isPeriodo ? 'DESFRUTE (CAB.) NO PERÍODO' : 'DESFRUTE (CAB.) NO MÊS',
      titulo:    isPeriodo ? 'Desfrute no período' : 'Desfrute no mês',
      subtitulo: isPeriodo
        ? 'Animais abatidos, vendidos em pé e consumidos no período'
        : 'Animais abatidos, vendidos em pé e consumidos no mês',
      valor:     desfruteValor,
      deltaMes:  desfruteDeltaMes,
      deltaAno:  desfruteDeltaAno,
      deltaMeta: desfruteDeltaMeta,
      serieAno:    desfruteSerie,
      serieAnoAnt: desfruteSerieAnoAnt ?? undefined,
      serieMeta:   desfruteSerieMeta ?? undefined,
    } : null,
    valorRebanhoIndicador: monthlyData ? {
      label:     isPeriodo ? 'VALOR DO REBANHO NO PERÍODO' : 'VALOR DO REBANHO NO MÊS',
      titulo:    isPeriodo ? 'Valor do Rebanho no período' : 'Valor do Rebanho no mês',
      subtitulo: 'Valor patrimonial do rebanho no final do mês selecionado',
      valor:     valorRebanhoValor,
      deltaMes:  valorRebanhoDeltaMes,
      deltaAno:  valorRebanhoDeltaAno,
      deltaMeta: valorRebanhoDeltaMeta,
      serieAno:    valorRebanhoSerie,
      serieAnoAnt: valorRebanhoSerieAnoAnt ?? undefined,
      serieMeta:   valorRebanhoSerieMeta ?? undefined,
    } : null,
    receitaPecIndicador: monthlyData ? {
      label:     isPeriodo ? 'RECEITAS PECUÁRIAS COMPETÊNCIA ACUM.' : 'RECEITAS PECUÁRIAS COMPETÊNCIA NO MÊS',
      titulo:    isPeriodo ? 'Receitas Pecuárias Competência acum.' : 'Receitas Pecuárias Competência no mês',
      subtitulo: isPeriodo
        ? 'Receita pecuária acumulada Jan→mês (competência)'
        : 'Receita pecuária do mês (competência)',
      valor:     receitaPecValor,
      deltaMes:  receitaPecDeltaMes,
      deltaAno:  receitaPecDeltaAno,
      deltaMeta: receitaPecDeltaMeta,
      serieAno:    receitaPecSerie,
      serieAnoAnt: receitaPecSerieAnoAnt ?? undefined,
      serieMeta:   receitaPecSerieMeta ?? undefined,
    } : null,
    custeioPecIndicador: monthlyData ? {
      label:     isPeriodo ? 'CUSTEIO PRODUÇÃO PECUÁRIA ACUM.' : 'CUSTEIO PRODUÇÃO PECUÁRIA NO MÊS',
      titulo:    isPeriodo ? 'Custeio Produção Pecuária acum.' : 'Custeio Produção Pecuária no mês',
      subtitulo: isPeriodo
        ? 'Custo Fixo + Custo Variável Pecuária acumulado Jan→mês (caixa)'
        : 'Custo Fixo + Custo Variável Pecuária no mês (caixa)',
      valor:     custeioPecValor,
      deltaMes:  custeioPecDeltaMes,
      deltaAno:  custeioPecDeltaAno,
      deltaMeta: custeioPecDeltaMeta,
      serieAno:    custeioPecSerie,
      serieAnoAnt: custeioPecSerieAnoAnt ?? undefined,
      serieMeta:   custeioPecSerieMeta ?? undefined,
    } : null,
    custoArrIndicador: monthlyData ? {
      label:     'CUSTO PRODUTIVO R$/@',
      titulo:    'Custo Produtivo R$/@',
      subtitulo: isPeriodo
        ? 'Custo produtivo pecuário por @ produzida (acumulado Jan→mês)'
        : 'Custo produtivo pecuário por @ produzida no mês',
      valor:     custoArrValor,
      deltaMes:  custoArrDeltaMes,
      deltaAno:  custoArrDeltaAno,
      deltaMeta: custoArrDeltaMeta,
      serieAno:    custoArrSerie,
      serieAnoAnt: custoArrSerieAnoAnt ?? undefined,
      serieMeta:   custoArrSerieMeta ?? undefined,
    } : null,
    precoArrIndicador: monthlyData ? {
      label:     'PREÇO DE VENDA R$/@',
      titulo:    'Preço de Venda R$/@',
      subtitulo: isPeriodo
        ? 'Receita pecuária por @ desfrutada (acumulado Jan→mês)'
        : 'Receita pecuária por @ desfrutada no mês',
      valor:     precoArrValor,
      deltaMes:  precoArrDeltaMes,
      deltaAno:  precoArrDeltaAno,
      deltaMeta: precoArrDeltaMeta,
      serieAno:    precoArrSerie,
      serieAnoAnt: precoArrSerieAnoAnt ?? undefined,
      serieMeta:   precoArrSerieMeta ?? undefined,
    } : null,
    custoCabIndicador: monthlyData ? {
      label:     isPeriodo ? 'CUSTO CAB. PERÍODO R$/CAB.' : 'CUSTO CAB. MÊS R$/CAB.',
      titulo:    isPeriodo ? 'Custo Cab. período R$/cab.' : 'Custo Cab. mês R$/cab.',
      subtitulo: isPeriodo
        ? 'Custeio pecuário por cabeça média (acumulado Jan→mês, R$/cab.mês)'
        : 'Custeio pecuário por cabeça média no mês',
      valor:     custoCabValor,
      deltaMes:  custoCabDeltaMes,
      deltaAno:  custoCabDeltaAno,
      deltaMeta: custoCabDeltaMeta,
      serieAno:    custoCabSerie,
      serieAnoAnt: custoCabSerieAnoAnt ?? undefined,
      serieMeta:   custoCabSerieMeta ?? undefined,
    } : null,
    margemArrIndicador: monthlyData ? {
      label:     'MARGEM POR @',
      titulo:    'Margem por @',
      subtitulo: isPeriodo
        ? 'Preço de venda R$/@ menos custo produtivo R$/@ (acumulado Jan→mês)'
        : 'Preço de venda R$/@ menos custo produtivo R$/@ no mês',
      valor:     margemArrValor,
      deltaMes:  margemArrDeltaMes,
      deltaAno:  margemArrDeltaAno,
      deltaMeta: margemArrDeltaMeta,
      serieAno:    margemArrSerie,
      serieAnoAnt: margemArrSerieAnoAnt ?? undefined,
      serieMeta:   margemArrSerieMeta ?? undefined,
    } : null,
    loading,
  };

  if (incompletoOverride) {
    return {
      ...baseReturn,
      cabecas: null,
      pesoMedio: null,
      gmd: null,
      arrobas: null,
      desfrute: null,
      lotUaHa: null,
      kgHa: null,
      areaProdutivaMes: null,
      dadosCompletos: false,
      seriesMensais: null,
      seriesMeta: null,
      cabecasIndicador: null,
      pesoMedioIndicador: null,
      gmdIndicador: null,
      uaHaIndicador: null,
      kgHaIndicador: null,
      arrobasIndicador: null,
      desfruteIndicador: null,
      valorRebanhoIndicador: null,
      receitaPecIndicador: null,
      custeioPecIndicador: null,
      custoArrIndicador: null,
      precoArrIndicador: null,
      custoCabIndicador: null,
      margemArrIndicador: null,
    };
  }

  return baseReturn;
}
