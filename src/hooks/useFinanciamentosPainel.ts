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
}

const MESES_LABELS = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'];

export function useFinanciamentosPainel(ano: number, tipoFiltro: TipoFin): PainelData {
  const { clienteAtual } = useCliente();
  const clienteId = clienteAtual?.id;

  const { data: financiamentos = [], isLoading: loadingFin } = useQuery({
    queryKey: ['painel-financiamentos', clienteId, tipoFiltro],
    enabled: !!clienteId,
    queryFn: async () => {
      let q = supabase
        .from('financiamentos')
        .select('id, cliente_id, descricao, numero_contrato, tipo_financiamento, credor_id, status, financeiro_fornecedores!financiamentos_credor_id_fkey(nome)')
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

  const { data: valorRebanho = 0, isLoading: loadingReb } = useQuery({
    queryKey: ['painel-valor-rebanho', clienteId],
    enabled: !!clienteId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('valor_rebanho_fechamento')
        .select('ano_mes, valor_total')
        .eq('cliente_id', clienteId!)
        .order('ano_mes', { ascending: false })
        .limit(50);
      if (error) throw error;
      if (!data || data.length === 0) return 0;
      const maxAnoMes = data[0].ano_mes;
      return data
        .filter(r => r.ano_mes === maxAnoMes)
        .reduce((s, r) => s + Number(r.valor_total || 0), 0);
    },
  });

  const loading = loadingFin || loadingParc || loadingReb;

  const derived = useMemo(() => {
    const hojeISO = new Date().toISOString().slice(0, 10);
    const anoInicio = `${ano}-01-01`;
    const anoFim = `${ano}-12-31`;
    const hojeMs = new Date(hojeISO + 'T00:00:00').getTime();
    const em30Dias = new Date(hojeMs + 30 * 24 * 3600 * 1000).toISOString().slice(0, 10);

    const finById = new Map<string, FinanciamentoRow>();
    for (const f of financiamentos) finById.set(f.id, f);

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

    // Pizza por faixa (baseado no saldo pendente)
    const umAnoMs = 365 * 24 * 3600 * 1000;
    let curtoPrazo = 0, medioPrazo = 0, longoPrazo = 0;

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
      // Se data_pagamento for NULL, usa data_vencimento como fallback para determinar o ano do pagamento
      const refPagamento = p.data_pagamento || p.data_vencimento;
      const pagoThisYear = !!(refPagamento && refPagamento >= anoInicio && refPagamento <= anoFim);

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

      // Saldo devedor total (só pendentes, independente do ano)
      if (isPendente) {
        const bucket = fin.tipo_financiamento === 'pecuaria' ? saldoPec
          : fin.tipo_financiamento === 'agricultura' ? saldoAgri
            : null;
        if (bucket) {
          bucket.principal += principal;
          bucket.juros += juros;
          bucket.total += valorTotal;
        }

        credorMap.set(fin.credor_nome, (credorMap.get(fin.credor_nome) || 0) + valorTotal);

        const diffMs = new Date(venc + 'T00:00:00').getTime() - hojeMs;
        if (diffMs <= 365 * 24 * 3600 * 1000) curtoPrazo += valorTotal;
        else if (diffMs <= 3 * umAnoMs) medioPrazo += valorTotal;
        else longoPrazo += valorTotal;

        if (venc < hojeISO) overdueCount++;

        if (isThisYear) {
          aAmortizar.principal += principal;
          aAmortizar.juros += juros;
          aAmortizar.total += valorTotal;
        } else if (venc > anoFim) {
          anosSeguintes.principal += principal;
          anosSeguintes.juros += juros;
          anosSeguintes.total += valorTotal;
        }
      }

      if (isPago && pagoThisYear) {
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
      { nome: 'Curto prazo (<= 1 ano)', valor: curtoPrazo, color: '#16a34a' },
      { nome: 'Médio prazo (1-3 anos)', valor: medioPrazo, color: '#eab308' },
      { nome: 'Longo prazo (> 3 anos)', valor: longoPrazo, color: '#dc2626' },
    ].filter(s => s.valor > 0);

    const alavancagemPerc = valorRebanho > 0 ? (saldoPec.total / valorRebanho) * 100 : 0;
    const alavancagemStatus: 'saudavel' | 'atencao' | 'critico' | 'indisponivel' =
      valorRebanho <= 0 ? 'indisponivel'
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
        dividaPecuaria: saldoPec.total,
        valorRebanho,
        percentual: alavancagemPerc,
        status: alavancagemStatus,
      },
      proximasParcelas,
      parcelasEnriquecidas,
    };
  }, [financiamentos, parcelas, valorRebanho, ano]);

  return { loading, ...derived };
}
