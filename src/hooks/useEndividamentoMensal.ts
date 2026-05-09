import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useCliente } from '@/contexts/ClienteContext';

export interface EndividamentoLinhaRPC {
  mes: number;
  divida_inicial_pec: number;
  captacao_pec: number;
  amortizacao_pec: number;
  juros_pec: number;
  divida_final_pec: number;
  divida_inicial_agri: number;
  captacao_agri: number;
  amortizacao_agri: number;
  juros_agri: number;
  divida_final_agri: number;
}

export interface EndividamentoSeries {
  dividaInicialPec:  number[]; captacaoPec:    number[]; amortizacaoPec: number[];
  jurosPec:          number[]; dividaFinalPec: number[];
  dividaInicialAgri: number[]; captacaoAgri:   number[]; amortizacaoAgri: number[];
  jurosAgri:         number[]; dividaFinalAgri: number[];
  dividaInicialTotal: number[]; captacaoTotal:    number[]; amortizacaoTotal: number[];
  jurosTotal:         number[]; dividaFinalTotal: number[];
}

export interface UseEndividamentoMensalResult {
  loading: boolean;
  hasData: boolean;
  series: EndividamentoSeries;
}

const z12 = (): number[] => new Array(12).fill(0);

const emptySeries = (): EndividamentoSeries => ({
  dividaInicialPec: z12(),  captacaoPec: z12(),  amortizacaoPec: z12(),
  jurosPec: z12(),          dividaFinalPec: z12(),
  dividaInicialAgri: z12(), captacaoAgri: z12(), amortizacaoAgri: z12(),
  jurosAgri: z12(),         dividaFinalAgri: z12(),
  dividaInicialTotal: z12(), captacaoTotal: z12(), amortizacaoTotal: z12(),
  jurosTotal: z12(),         dividaFinalTotal: z12(),
});

/**
 * Bloco Endividamento PC-100 (sempre GLOBAL — consolidado do cliente).
 * Consome RPC fn_endividamento_mensal. Não recalcula nada no front.
 * Cenário: Realizado apenas. META fora de escopo.
 *
 * Decisões oficiais (Maio/2026):
 *   D1 Split Pec/Agri = financiamentos.tipo_financiamento
 *   D2 Captação = (valor_total - valor_entrada) por data_contrato
 *   D3 Dívida = somente principal em aberto
 *   D4 Quitados participam do histórico
 *   D5 Fonte = financiamento_parcelas JOIN financiamentos (NUNCA financeiro_lancamentos_v2)
 *   D6 Cálculo server-side (não recalcular no front)
 */
export function useEndividamentoMensal(ano: number): UseEndividamentoMensalResult {
  const { clienteAtual } = useCliente();
  const clienteId = clienteAtual?.id;

  const { data, isLoading } = useQuery({
    queryKey: ['endividamento-mensal', clienteId, ano],
    enabled: !!clienteId && !!ano,
    staleTime: 5 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
    queryFn: async (): Promise<EndividamentoLinhaRPC[]> => {
      const { data, error } = await supabase.rpc('fn_endividamento_mensal' as any, {
        p_cliente_id: clienteId!,
        p_ano: ano,
      });
      if (error) throw error;
      return (data ?? []) as EndividamentoLinhaRPC[];
    },
  });

  const series = emptySeries();
  let hasData = false;

  if (data && data.length > 0) {
    hasData = true;
    for (const row of data) {
      const i = row.mes - 1;
      if (i < 0 || i > 11) continue;
      series.dividaInicialPec[i]  = Number(row.divida_inicial_pec)  || 0;
      series.captacaoPec[i]       = Number(row.captacao_pec)        || 0;
      series.amortizacaoPec[i]    = Number(row.amortizacao_pec)     || 0;
      series.jurosPec[i]          = Number(row.juros_pec)           || 0;
      series.dividaFinalPec[i]    = Number(row.divida_final_pec)    || 0;
      series.dividaInicialAgri[i] = Number(row.divida_inicial_agri) || 0;
      series.captacaoAgri[i]      = Number(row.captacao_agri)       || 0;
      series.amortizacaoAgri[i]   = Number(row.amortizacao_agri)    || 0;
      series.jurosAgri[i]         = Number(row.juros_agri)          || 0;
      series.dividaFinalAgri[i]   = Number(row.divida_final_agri)   || 0;
      series.dividaInicialTotal[i] = series.dividaInicialPec[i] + series.dividaInicialAgri[i];
      series.captacaoTotal[i]      = series.captacaoPec[i]      + series.captacaoAgri[i];
      series.amortizacaoTotal[i]   = series.amortizacaoPec[i]   + series.amortizacaoAgri[i];
      series.jurosTotal[i]         = series.jurosPec[i]         + series.jurosAgri[i];
      series.dividaFinalTotal[i]   = series.dividaFinalPec[i]   + series.dividaFinalAgri[i];
    }

    if (process.env.NODE_ENV !== 'production') {
      const TOL = 0.01;
      for (let i = 0; i < 12; i++) {
        const calcPec = series.dividaInicialPec[i] + series.captacaoPec[i] - series.amortizacaoPec[i];
        if (Math.abs(calcPec - series.dividaFinalPec[i]) > TOL) {
          console.warn(`[useEndividamentoMensal] Identidade Pec quebrou mês ${i+1}: di+cap-am=${calcPec.toFixed(2)} vs df=${series.dividaFinalPec[i].toFixed(2)}`);
        }
        const calcAgri = series.dividaInicialAgri[i] + series.captacaoAgri[i] - series.amortizacaoAgri[i];
        if (Math.abs(calcAgri - series.dividaFinalAgri[i]) > TOL) {
          console.warn(`[useEndividamentoMensal] Identidade Agri quebrou mês ${i+1}: di+cap-am=${calcAgri.toFixed(2)} vs df=${series.dividaFinalAgri[i].toFixed(2)}`);
        }
        if (i > 0 && Math.abs(series.dividaInicialPec[i] - series.dividaFinalPec[i-1]) > TOL) {
          console.warn(`[useEndividamentoMensal] Propagação Pec quebrou mês ${i+1}`);
        }
      }
    }
  }

  return { loading: isLoading, hasData, series };
}
