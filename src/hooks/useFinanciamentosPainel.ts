import { useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useCliente } from '@/contexts/ClienteContext';
import { useQuery } from '@tanstack/react-query';

export type TipoFin = 'todos' | 'pecuaria' | 'agricultura';

interface ParcelaRow {
  id: string;
  financiamento_id: string;
  numero_parcela: number;
  data_vencimento: string;
  data_pagamento: string | null;
  valor_principal: number;
  valor_juros: number;
  status: string;
  cliente_id: string;
}

interface FinanciamentoRow {
  id: string;
  cliente_id: string;
  descricao: string;
  numero_contrato: string | null;
  tipo_financiamento: string;
  credor_id: string | null;
  credor_nome: string;
  status: string;
  data_contrato: string | null;
}

export interface BarraMes {
  mes: string;
  principalPago: number;
  principalPendente: number;
  jurosPago: number;
  jurosPendente: number;
  total: number;
}

export interface SliceVencimento {
  nome: string;
  valor: number;
  color: string;
}

export interface DividaCredor {
  credor: string;
  valor: number;
}

export interface ProximaParcela {
  parcela_id: string;
  financiamento_id: string;
  vencimento: string;
  descricao: string;
  tipo: string;
  credor: string;
  principal: number;
  juros: number;
  total: number;
  vencida: boolean;
  vencendo: boolean; // próximos 30 dias
}

export interface ParcelaEnriquecida {
  parcela_id: string;
  financiamento_id: string;
  vencimento: string;
  data_pagamento: string | null;
  descricao: string;
  tipo: string;
  credor: string;
  principal: number;
  juros: number;
  total: number;
  status: string;
}

export interface Breakdown {
  principal: number;
  juros: number;
  total: number;
}

export interface EvolucaoDividaBar {
  label: string;
  valor: number;
  cor: string;
  anoRef?: number | null;
}

export interface HistoricoAlavancagemPoint {
  label: string;
  ano: number;
  amortizado: number; // reusado como 'endividamento pecuaria' no chart
  meta?: number;      // reusado como 'valor do rebanho' no chart
  saldoDevedor: number;
  alavancagem: number | null; // % — null quando não há dado de rebanho
}

export interface PainelData {
  loading: boolean;
  kpis: {
    saldoDevedor: { total: Breakdown; pecuaria: Breakdown; agricultura: Breakdown };
    amortizadoNoAno: Breakdown;
    aAmortizarNoAno: Breakdown;
    totalAnosSeguintes: Breakdown;
    overdueCount: number;
  };
  barrasMensais: BarraMes[];
  pizzaVencimentos: SliceVencimento[];
  dividaPorCredor: DividaCredor[];
  alavancagem: {
    dividaPecuaria: number;
    valorRebanho: number;
    percentual: number;
    status: 'saudavel' | 'atencao' | 'critico' | 'indisponivel';
  };
  proximasParcelas: ProximaParcela[];
  parcelasEnriquecidas: ParcelaEnriquecida[];
  evolucaoDivida: EvolucaoDividaBar[];
  historicoAlavancagem: HistoricoAlavancagemPoint[];
}

const MESES_LABELS = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'];

export function useFinanciamentosPainel(ano: number, tipoFiltro: TipoFin, mesRef: number | 'todos' = 'todos'): PainelData {
  const { clienteAtual } = useCliente();
  const clienteId = clienteAtual?.id;

  const { data: financiamentos = [], isLoading: loadingFin } = useQuery({
    queryKey: ['painel-financiamentos', clienteId, tipoFiltro],
    enabled: !!clienteId,
    queryFn: async () => {
      let q = supabase
        .from('financiamentos')
        .select('id, cliente_id, descricao, numero_contrato, tipo_financiamento, credor_id, status, data_contrato, financeiro_fornecedores!financiamentos_credor_id_fkey(nome)')
        .eq('cliente_id', clienteId!)
        .eq('status', 'ativo');
      if (tipoFiltro !== 'todos') q = q.eq('tipo_financiamento', tipoFiltro);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []).map((f: any): FinanciamentoRow => ({
        id: f.id,
        cliente_id: f.cliente_id,
        descricao: f.descricao,
        numero_contrato: f.numero_contrato ?? null,
        tipo_financiamento: f.tipo_financiamento,
        credor_id: f.credor_id ?? null,
        credor_nome: f.financeiro_fornecedores?.nome ?? '—',
        status: f.status,
        data_contrato: f.data_contrato ?? null,
      }));
    },
  });

  const financiamentoIds = useMemo(() => financiamentos.map(f => f.id), [financiamentos]);

  const { data: parcelas = [], isLoading: loadingParc } = useQuery({
    queryKey: ['painel-parcelas', clienteId, financiamentoIds.join(',')],
    enabled: !!clienteId && financiamentoIds.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('financiamento_parcelas')
        .select('id, financiamento_id, numero_parcela, data_vencimento, data_pagamento, valor_principal, valor_juros, status, cliente_id')
        .in('financiamento_id', financiamentoIds);
      if (error) throw error;
      return (data ?? []) as ParcelaRow[];
    },
  });

  const { data: rebanhoSnapshots = [], isLoading: loadingReb } = useQuery({
    queryKey: ['painel-rebanho-snapshots', clienteId],
    enabled: !!clienteId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('valor_rebanho_fechamento')
        .select('ano_mes, valor_total')
        .eq('cliente_id', clienteId!)
        .order('ano_mes', { ascending: false });
      if (error) throw error;
      // Agrega valor_total por ano_mes (múltiplas fazendas)
      const agg = new Map<string, number>();
      for (const r of data ?? []) {
        agg.set(r.ano_mes, (agg.get(r.ano_mes) || 0) + (Number(r.valor_total) || 0));
      }
      return Array.from(agg.entries())
        .map(([ano_mes, total]) => ({ ano_mes, total }))
        .sort((a, b) => b.ano_mes.localeCompare(a.ano_mes));
    },
  });
  const valorRebanho = rebanhoSnapshots.length > 0 ? rebanhoSnapshots[0].total : 0;

  const loading = loadingFin || loadingParc || loadingReb;

  const derived = useMemo(() => {
    const hojeISO = new Date().toISOString().slice(0, 10);
    const anoInicio = `${ano}-01-01`;
    const anoFim = `${ano}-12-31`;
    const hojeMs = new Date(hojeISO + 'T00:00:00').getTime();
    const em30Dias = new Date(hojeMs + 30 * 24 * 3600 * 1000).toISOString().slice(0, 10);

    // ── Data de corte derivada dos filtros (mes='todos' → 31/12 do ano; senão último dia do mês) ──
    const corteMes = mesRef === 'todos' ? 12 : Number(mesRef);
    const corteMesPadded = String(corteMes).padStart(2, '0');
    const corteAnoMes = `${ano}-${corteMesPadded}`;
    // new Date(year, monthIdx0+1, 0) → último dia do mês monthIdx0+1
    const ultimoDiaCorte = new Date(ano, corteMes, 0).getDate();
    const dataCorte = `${ano}-${corteMesPadded}-${String(ultimoDiaCorte).padStart(2, '0')}`;

    const finById = new Map<string, FinanciamentoRow>();
    for (const f of financiamentos) finById.set(f.id, f);

    // ── Helper: parcela está em aberto numa data de referência ──
    // Em aberto = financiamento já existia (data_contrato <= refDate)
    //           E parcela ainda não foi paga até refDate (data_pagamento null OU > refDate).
    // Não usa data_vencimento como critério de exclusão — vencida pendente continua em aberto.
    const parcelaEmAbertoEm = (p: ParcelaRow, finRef: FinanciamentoRow | undefined, refDate: string): boolean => {
      if (!finRef || !finRef.data_contrato || finRef.data_contrato > refDate) return false;
      if (p.data_pagamento && p.data_pagamento <= refDate) return false;
      return true;
    };

    // ── KPIs ──
    const mkBreakdown = (): Breakdown => ({ principal: 0, juros: 0, total: 0 });
    const saldoPec = mkBreakdown();
    const saldoAgri = mkBreakdown();
    const amortizado = mkBreakdown();
    const aAmortizar = mkBreakdown();
    const anosSeguintes = mkBreakdown();
    let overdueCount = 0;

    // Mensal series (do ano filtrado)
    const mensal: BarraMes[] = MESES_LABELS.map(m => ({
      mes: m, principalPago: 0, principalPendente: 0, jurosPago: 0, jurosPendente: 0, total: 0,
    }));

    // Pizza por faixa: Curto (anoFiltro..anoFiltro+1) vs Longo (anoFiltro+2+)
    let curtoPrazo = 0, longoPrazo = 0;

    // Credor
    const credorMap = new Map<string, number>();

    // Próximas parcelas
    const pendentes: ProximaParcela[] = [];

    // Parcelas enriquecidas (usadas para drilldown por mês na UI)
    const parcelasEnriquecidas: ParcelaEnriquecida[] = [];

    for (const p of parcelas) {
      const fin = finById.get(p.financiamento_id);
      if (!fin) continue;
      const principal = Number(p.valor_principal) || 0;
      const juros = Number(p.valor_juros) || 0;
      const valorTotal = principal + juros;
      const isPendente = p.status === 'pendente';
      const isPago = p.status === 'pago';
      const venc = p.data_vencimento;
      const isThisYear = venc >= anoInicio && venc <= anoFim;
      const emAberto = parcelaEmAbertoEm(p, fin, dataCorte);

      parcelasEnriquecidas.push({
        parcela_id: p.id,
        financiamento_id: p.financiamento_id,
        vencimento: venc,
        data_pagamento: p.data_pagamento,
        descricao: fin.descricao,
        tipo: fin.tipo_financiamento,
        credor: fin.credor_nome,
        principal,
        juros,
        total: valorTotal,
        status: p.status,
      });

      // ── Saldo devedor / vencidas / a amortizar / anos seguintes — em aberto na dataCorte ──
      if (emAberto) {
        const bucket = fin.tipo_financiamento === 'pecuaria' ? saldoPec
          : fin.tipo_financiamento === 'agricultura' ? saldoAgri
            : null;
        if (bucket) {
          bucket.principal += principal;
          bucket.juros += juros;
          bucket.total += valorTotal;
        }

        if (venc < dataCorte) overdueCount++;

        if (venc > dataCorte && venc <= anoFim) {
          aAmortizar.principal += principal;
          aAmortizar.juros += juros;
          aAmortizar.total += valorTotal;
        } else if (venc > anoFim) {
          anosSeguintes.principal += principal;
          anosSeguintes.juros += juros;
          anosSeguintes.total += valorTotal;
        }
      }

      // ── Pizza/Credor (out of scope nesta etapa) — mantém lógica original baseada em pendente ──
      if (isPendente) {
        credorMap.set(fin.credor_nome, (credorMap.get(fin.credor_nome) || 0) + valorTotal);

        const vencYear = Number(venc.substring(0, 4));
        if (vencYear <= ano + 1) curtoPrazo += principal;
        else longoPrazo += principal;
      }

      // ── Amortizado YTD: pago entre 01/01 do ano e dataCorte (sem fallback para data_vencimento) ──
      if (isPago && p.data_pagamento && p.data_pagamento >= anoInicio && p.data_pagamento <= dataCorte) {
        amortizado.principal += principal;
        amortizado.juros += juros;
        amortizado.total += valorTotal;
      }

      if (isThisYear) {
        const mesIdx = Number(venc.substring(5, 7)) - 1;
        if (mesIdx >= 0 && mesIdx < 12) {
          if (isPago) {
            mensal[mesIdx].principalPago += principal;
            mensal[mesIdx].jurosPago += juros;
          } else if (isPendente) {
            mensal[mesIdx].principalPendente += principal;
            mensal[mesIdx].jurosPendente += juros;
          }
          mensal[mesIdx].total += valorTotal;
        }
      }

      if (isPendente && venc <= em30Dias) {
        pendentes.push({
          parcela_id: p.id,
          financiamento_id: p.financiamento_id,
          vencimento: venc,
          descricao: fin.descricao,
          tipo: fin.tipo_financiamento,
          credor: fin.credor_nome,
          principal,
          juros,
          total: valorTotal,
          vencida: venc < hojeISO,
          vencendo: venc >= hojeISO && venc <= em30Dias,
        });
      }
    }

    const proximasParcelas = parcelas
      .filter(p => p.status === 'pendente')
      .sort((a, b) => a.data_vencimento.localeCompare(b.data_vencimento))
      .slice(0, 12)
      .map((p): ProximaParcela => {
        const fin = finById.get(p.financiamento_id)!;
        const principal = Number(p.valor_principal) || 0;
        const juros = Number(p.valor_juros) || 0;
        return {
          parcela_id: p.id,
          financiamento_id: p.financiamento_id,
          vencimento: p.data_vencimento,
          descricao: fin?.descricao ?? '—',
          tipo: fin?.tipo_financiamento ?? '—',
          credor: fin?.credor_nome ?? '—',
          principal,
          juros,
          total: principal + juros,
          vencida: p.data_vencimento < hojeISO,
          vencendo: p.data_vencimento >= hojeISO && p.data_vencimento <= em30Dias,
        };
      });

    const saldoTotal: Breakdown = {
      principal: saldoPec.principal + saldoAgri.principal,
      juros: saldoPec.juros + saldoAgri.juros,
      total: saldoPec.total + saldoAgri.total,
    };

    const dividaPorCredor: DividaCredor[] = Array.from(credorMap.entries())
      .map(([credor, valor]) => ({ credor, valor }))
      .sort((a, b) => b.valor - a.valor)
      .slice(0, 8);

    const pizzaVencimentos: SliceVencimento[] = [
      { nome: `Curto Prazo (${ano}–${ano + 1})`, valor: curtoPrazo, color: '#EF4444' },
      { nome: `Longo Prazo (${ano + 2}+)`, valor: longoPrazo, color: '#EAB308' },
    ].filter(s => s.valor > 0);

    // ── Evolução da Dívida: 7 barras (Ini + 5 anos + Demais) — só Principal pendente ──
    const evoIni = parcelas
      .filter(p => p.status === 'pendente' && finById.has(p.financiamento_id))
      .reduce((s, p) => s + (Number(p.valor_principal) || 0), 0);
    const evoPorAno: Record<number, number> = {};
    for (const p of parcelas) {
      if (p.status !== 'pendente') continue;
      if (!finById.has(p.financiamento_id)) continue;
      const vy = Number(p.data_vencimento.substring(0, 4));
      evoPorAno[vy] = (evoPorAno[vy] || 0) + (Number(p.valor_principal) || 0);
    }
    const sumAteAnoPlus4 = [0, 1, 2, 3, 4].reduce((s, k) => s + (evoPorAno[ano + k] || 0), 0);
    const demais = Object.entries(evoPorAno)
      .filter(([y]) => Number(y) > ano + 4)
      .reduce((s, [, v]) => s + v, 0);
    const evolucaoDivida: EvolucaoDividaBar[] = [
      { label: 'Ini.', valor: evoIni, cor: '#1e293b', anoRef: null },
      { label: String(ano).slice(2), valor: evoPorAno[ano] || 0, cor: '#1e3a8a', anoRef: ano },
      { label: String(ano + 1).slice(2), valor: evoPorAno[ano + 1] || 0, cor: '#1e3a8a', anoRef: ano + 1 },
      { label: String(ano + 2).slice(2), valor: evoPorAno[ano + 2] || 0, cor: '#3b82f6', anoRef: ano + 2 },
      { label: String(ano + 3).slice(2), valor: evoPorAno[ano + 3] || 0, cor: '#3b82f6', anoRef: ano + 3 },
      { label: String(ano + 4).slice(2), valor: evoPorAno[ano + 4] || 0, cor: '#3b82f6', anoRef: ano + 4 },
      { label: 'Demais', valor: demais, cor: '#60a5fa', anoRef: null },
    ];

    // ── Histórico de Alavancagem (apenas pecuária) ──
    // Para cada ano [minAnoPec..ano], usa o MESMO mês de corte aplicado aos KPIs (corteMes).
    //   refDate = último dia do mês de corte naquele ano histórico
    //   endividamento = Σ principal de parcelas em aberto na refDate (data_pagamento null OU > refDate)
    //                   E financiamento contratado até a refDate (data_contrato <= refDate)
    //   rebanho = snapshot do mesmo ano_mes (sem fallback). Ausente → alavancagem = null.
    const refMonth = corteMes;
    const refMonthLabel = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'][refMonth - 1];
    const refMonthPadded = corteMesPadded;

    const financiamentosPec = financiamentos.filter(f => f.tipo_financiamento === 'pecuaria');
    let minAnoPec = ano;
    for (const f of financiamentosPec) {
      if (f.data_contrato) {
        const y = Number(f.data_contrato.substring(0, 4));
        if (!Number.isNaN(y) && y < minAnoPec) minAnoPec = y;
      }
    }

    const finPecById = new Map(financiamentosPec.map(f => [f.id, f] as const));

    const historicoAlavancagem: HistoricoAlavancagemPoint[] = [];
    for (let y = minAnoPec; y <= ano; y++) {
      const ultimoDiaRef = new Date(y, refMonth, 0).getDate();
      const refDate = `${y}-${refMonthPadded}-${String(ultimoDiaRef).padStart(2, '0')}`;
      const refAnoMes = `${y}-${refMonthPadded}`;

      let endividamento = 0;
      for (const p of parcelas) {
        const fin = finPecById.get(p.financiamento_id);
        if (!parcelaEmAbertoEm(p, fin, refDate)) continue;
        endividamento += Number(p.valor_principal) || 0;
      }

      // Rebanho: snapshot do mesmo ano_mes (sem fallback para snap mais antigo)
      const snap = rebanhoSnapshots.find(r => r.ano_mes === refAnoMes);
      const rebanho = snap?.total ?? 0;
      const alavancagem = rebanho > 0 ? (endividamento / rebanho) * 100 : null;

      historicoAlavancagem.push({
        label: `${refMonthLabel}/${String(y).slice(2)}`,
        ano: y,
        amortizado: endividamento,
        saldoDevedor: endividamento,
        meta: rebanho > 0 ? rebanho : undefined,
        alavancagem,
      });
    }

    // ── Alavancagem atual: dívida pecuária Principal em aberto na dataCorte / Valor do Rebanho do mês de corte ──
    let dividaPecuariaPrincipal = 0;
    for (const p of parcelas) {
      const fin = finPecById.get(p.financiamento_id);
      if (!parcelaEmAbertoEm(p, fin, dataCorte)) continue;
      dividaPecuariaPrincipal += Number(p.valor_principal) || 0;
    }
    // Valor do Rebanho: snapshot exato do mês/ano de corte (sem fallback p/ snap mais recente).
    // Mantém fonte atual (valor_rebanho_fechamento) — troca de fonte fica para etapa posterior.
    const valorRebanhoCorte = rebanhoSnapshots.find(r => r.ano_mes === corteAnoMes)?.total ?? 0;
    const alavancagemPerc = valorRebanhoCorte > 0 ? (dividaPecuariaPrincipal / valorRebanhoCorte) * 100 : 0;
    const alavancagemStatus: 'saudavel' | 'atencao' | 'critico' | 'indisponivel' =
      valorRebanhoCorte <= 0 ? 'indisponivel'
        : alavancagemPerc < 30 ? 'saudavel'
          : alavancagemPerc < 50 ? 'atencao'
            : 'critico';

    return {
      kpis: {
        saldoDevedor: { total: saldoTotal, pecuaria: saldoPec, agricultura: saldoAgri },
        amortizadoNoAno: amortizado,
        aAmortizarNoAno: aAmortizar,
        totalAnosSeguintes: anosSeguintes,
        overdueCount,
      },
      barrasMensais: mensal,
      pizzaVencimentos,
      dividaPorCredor,
      alavancagem: {
        dividaPecuaria: dividaPecuariaPrincipal,
        valorRebanho: valorRebanhoCorte,
        percentual: alavancagemPerc,
        status: alavancagemStatus,
      },
      proximasParcelas,
      parcelasEnriquecidas,
      evolucaoDivida,
      historicoAlavancagem,
    };
  }, [financiamentos, parcelas, valorRebanho, rebanhoSnapshots, ano, mesRef]);

  return { loading, ...derived };
}
