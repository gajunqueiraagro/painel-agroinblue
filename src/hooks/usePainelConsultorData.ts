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
import { computePeriodGmd, rollingAvg } from '@/lib/calculos/painelConsultorIndicadores';
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
      deltaAno:  null,                 // sem ano anterior nesta fase
      deltaMeta: uaHaDeltaMeta,
      serieAno:    uaHaSerie,
      serieAnoAnt: undefined,
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
      deltaAno:  null,                 // sem ano anterior nesta fase
      deltaMeta: kgHaDeltaMeta,
      serieAno:    kgHaSerie,
      serieAnoAnt: undefined,
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
      deltaAno:  null,
      deltaMeta: null,
      serieAno:    desfruteSerie,
      serieAnoAnt: undefined,
      serieMeta:   undefined,
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
    };
  }

  return baseReturn;
}
