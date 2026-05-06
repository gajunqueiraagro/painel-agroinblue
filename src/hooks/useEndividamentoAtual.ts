/**
 * useEndividamentoAtual — leitura enxuta da dívida em aberto AGORA, por cliente.
 *
 * Usado em superfícies (V2Home) que precisam apenas do saldo devedor atual e
 * indicadores leves derivados, SEM o overhead do painel completo.
 *
 * Critério de "em aberto numa data de referência":
 *   - financiamento.status != 'cancelado'
 *   - financiamento.data_contrato <= refDate (exclui contratos futuros)
 *   - parcela.status != 'cancelado' (defensivo)
 *   - parcela.data_pagamento IS NULL OR data_pagamento > refDate (não foi paga até refDate)
 *
 * Saídas:
 *   - total / principal / juros (saldo devedor em aberto AGORA)
 *   - totalMesAnterior / totalAnoAnterior + deltaMes / deltaAno (% relativo)
 *   - alavancagem { percentual, percentualMesAnterior, percentualAnoAnterior,
 *                   deltaMes, deltaAno, status } — dívida pecuária principal /
 *                   valor_rebanho_fechamento do respectivo ano_mes (sem fallback inventado)
 *   - pizzaVencimentos: 2 buckets curto/longo prazo, baseados em data_vencimento
 *
 * NÃO calcula: histórico anual, mensal, cronograma, credor, parcelas enriquecidas,
 * evolução. Para isso, usar `useFinanciamentosPainel`.
 */
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useCliente } from '@/contexts/ClienteContext';

export interface PizzaSliceLeve {
  nome: string;
  valor: number;
  color: string;
}

export interface AlavancagemLeve {
  percentual: number | null;
  percentualMesAnterior: number | null;
  percentualAnoAnterior: number | null;
  deltaMes: number | null;
  deltaAno: number | null;
  status: 'saudavel' | 'atencao' | 'critico' | 'indisponivel';
}

export interface EndividamentoAtual {
  total: number;
  principal: number;
  juros: number;
  totalMesAnterior: number | null;
  totalAnoAnterior: number | null;
  deltaMes: number | null;
  deltaAno: number | null;
  alavancagem: AlavancagemLeve;
  pizzaVencimentos: PizzaSliceLeve[];
  /** Saldo devedor R$ Jan→Dez do anoBase, último dia de cada mês. */
  serieAno: number[];
  /** Saldo devedor R$ Jan→Dez do anoBase-1. */
  serieAnoAnt: number[];
  /** Alavancagem % Jan→Dez do anoBase (null quando sem snapshot de rebanho). */
  serieAlavancagemAno: (number | null)[];
  /** Alavancagem % Jan→Dez do anoBase-1. */
  serieAlavancagemAnoAnt: (number | null)[];
  loading: boolean;
}

const EMPTY_ALAVANCAGEM: AlavancagemLeve = {
  percentual: null,
  percentualMesAnterior: null,
  percentualAnoAnterior: null,
  deltaMes: null,
  deltaAno: null,
  status: 'indisponivel',
};

const EMPTY_SERIE_NUM = (): number[] => new Array(12).fill(0);
const EMPTY_SERIE_NULL = (): (number | null)[] => new Array(12).fill(null);

const EMPTY = {
  total: 0,
  principal: 0,
  juros: 0,
  totalMesAnterior: null as number | null,
  totalAnoAnterior: null as number | null,
  deltaMes: null as number | null,
  deltaAno: null as number | null,
  alavancagem: EMPTY_ALAVANCAGEM,
  pizzaVencimentos: [] as PizzaSliceLeve[],
  serieAno: EMPTY_SERIE_NUM(),
  serieAnoAnt: EMPTY_SERIE_NUM(),
  serieAlavancagemAno: EMPTY_SERIE_NULL(),
  serieAlavancagemAnoAnt: EMPTY_SERIE_NULL(),
};

function ultimoDiaDoMes(ano: number, mes: number): string {
  const d = new Date(ano, mes, 0).getDate();
  return `${ano}-${String(mes).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

function deltaPct(atual: number, anterior: number | null): number | null {
  if (anterior == null || anterior === 0) return null;
  return ((atual - anterior) / anterior) * 100;
}

export function useEndividamentoAtual(anoBase?: number): EndividamentoAtual {
  const { clienteAtual } = useCliente();
  const clienteId = clienteAtual?.id;
  const anoBaseEff = anoBase ?? new Date().getFullYear();

  const { data, isLoading } = useQuery({
    queryKey: ['endividamento-atual', clienteId, anoBaseEff],
    enabled: !!clienteId,
    staleTime: 5 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
    queryFn: async () => {
      const hoje = new Date();
      const hojeISO = hoje.toISOString().slice(0, 10);
      const mesHoje = hoje.getMonth() + 1; // 1-12
      const anoHoje = hoje.getFullYear();

      // Datas de corte para os 3 snapshots:
      //  - atual: hoje
      //  - mês anterior: último dia do mês anterior (cruza ano se mes=1)
      //  - ano anterior, mesmo mês: último dia do mesmo mês no ano anterior
      const mesAntAno = mesHoje === 1 ? anoHoje - 1 : anoHoje;
      const mesAntMes = mesHoje === 1 ? 12 : mesHoje - 1;
      const dataCorteMesAnt = ultimoDiaDoMes(mesAntAno, mesAntMes);
      const dataCorteAnoAnt = ultimoDiaDoMes(anoHoje - 1, mesHoje);

      // 1) Financiamentos não-cancelados, contratados até hoje (com tipo).
      const { data: fins, error: e1 } = await supabase
        .from('financiamentos')
        .select('id, tipo_financiamento, data_contrato')
        .eq('cliente_id', clienteId!)
        .neq('status', 'cancelado')
        .lte('data_contrato', hojeISO);
      if (e1) throw e1;

      const ids = (fins ?? []).map((f) => f.id);
      if (ids.length === 0) return EMPTY;

      const tipoById = new Map<string, string>();
      const dataContratoById = new Map<string, string | null>();
      for (const f of fins ?? []) {
        tipoById.set(f.id, f.tipo_financiamento);
        dataContratoById.set(f.id, f.data_contrato);
      }

      // 2) Parcelas relevantes: em aberto OU pagas dentro da janela coberta pelas séries.
      //    Janela = início do ano anterior ao anoBase OU dataCorteAnoAnt (o que for menor).
      const inicioCobertura = `${Math.min(anoBaseEff - 1, anoHoje - 1)}-01-01`;
      const { data: parcs, error: e2 } = await supabase
        .from('financiamento_parcelas')
        .select('financiamento_id, valor_principal, valor_juros, data_vencimento, data_pagamento')
        .in('financiamento_id', ids)
        .neq('status', 'cancelado')
        .or(`data_pagamento.is.null,data_pagamento.gte.${inicioCobertura}`);
      if (e2) throw e2;

      // 3) Snapshots de valor_rebanho_fechamento (somando fazendas).
      //    Limit 300 cobre ~10 fazendas × 30 meses — suficiente p/ séries 24m + recentes.
      const { data: snaps } = await supabase
        .from('valor_rebanho_fechamento')
        .select('ano_mes, valor_total')
        .eq('cliente_id', clienteId!)
        .order('ano_mes', { ascending: false })
        .limit(300);
      const aggReb = new Map<string, number>();
      for (const r of snaps ?? []) {
        aggReb.set(r.ano_mes, (aggReb.get(r.ano_mes) || 0) + (Number(r.valor_total) || 0));
      }
      const sortedReb = Array.from(aggReb.entries()).sort((a, b) => b[0].localeCompare(a[0]));
      const valorRebanhoAtual = sortedReb[0]?.[1] ?? 0;
      const valorRebanhoMesAnt = aggReb.get(`${mesAntAno}-${String(mesAntMes).padStart(2, '0')}`) ?? 0;
      const valorRebanhoAnoAnt = aggReb.get(`${anoHoje - 1}-${String(mesHoje).padStart(2, '0')}`) ?? 0;

      // 4) Pré-computar 24 datas de corte para as séries mensais.
      const cortesAno: string[] = new Array(12).fill('').map((_, i) => ultimoDiaDoMes(anoBaseEff, i + 1));
      const cortesAnoAnt: string[] = new Array(12).fill('').map((_, i) => ultimoDiaDoMes(anoBaseEff - 1, i + 1));

      // 5) Avaliar em-aberto em todas as datas e acumular (snapshots + séries).
      let principal = 0;
      let juros = 0;
      let dividaPecAtual = 0;
      let totalMesAnt = 0;
      let dividaPecMesAnt = 0;
      let totalAnoAnt = 0;
      let dividaPecAnoAnt = 0;
      let curtoPrazo = 0;
      let longoPrazo = 0;
      const totalAnoSerie = new Array(12).fill(0);
      const dividaPecAnoSerie = new Array(12).fill(0);
      const totalAnoAntSerie = new Array(12).fill(0);
      const dividaPecAnoAntSerie = new Array(12).fill(0);

      const isEmAbertoEm = (
        dataPagamento: string | null,
        dataContrato: string | null,
        refDate: string,
      ): boolean => {
        if (!dataContrato || dataContrato > refDate) return false;
        if (dataPagamento && dataPagamento <= refDate) return false;
        return true;
      };

      for (const p of parcs ?? []) {
        const vp = Number(p.valor_principal) || 0;
        const vj = Number(p.valor_juros) || 0;
        const vt = vp + vj;
        const tipo = tipoById.get(p.financiamento_id);
        const dc = dataContratoById.get(p.financiamento_id) ?? null;
        const ehPec = tipo === 'pecuaria';

        // Atual (hoje)
        if (isEmAbertoEm(p.data_pagamento, dc, hojeISO)) {
          principal += vp;
          juros += vj;
          if (ehPec) dividaPecAtual += vp;

          // Pizza só do snapshot atual.
          const venc = p.data_vencimento;
          const vencYear = venc ? Number(venc.slice(0, 4)) : NaN;
          if (!Number.isNaN(vencYear)) {
            if (vencYear <= anoBaseEff + 1) curtoPrazo += vp;
            else longoPrazo += vp;
          }
        }

        // Mês anterior
        if (isEmAbertoEm(p.data_pagamento, dc, dataCorteMesAnt)) {
          totalMesAnt += vt;
          if (ehPec) dividaPecMesAnt += vp;
        }

        // Mesmo mês, ano anterior
        if (isEmAbertoEm(p.data_pagamento, dc, dataCorteAnoAnt)) {
          totalAnoAnt += vt;
          if (ehPec) dividaPecAnoAnt += vp;
        }

        // Séries mensais (12 meses × 2 anos)
        for (let m = 0; m < 12; m++) {
          if (isEmAbertoEm(p.data_pagamento, dc, cortesAno[m])) {
            totalAnoSerie[m] += vt;
            if (ehPec) dividaPecAnoSerie[m] += vp;
          }
          if (isEmAbertoEm(p.data_pagamento, dc, cortesAnoAnt[m])) {
            totalAnoAntSerie[m] += vt;
            if (ehPec) dividaPecAnoAntSerie[m] += vp;
          }
        }
      }

      // 6) Séries de alavancagem (% por mês = dívida pec mensal / rebanho do mesmo ano_mes).
      const serieAlavAno: (number | null)[] = new Array(12).fill(null).map((_, m) => {
        const reb = aggReb.get(`${anoBaseEff}-${String(m + 1).padStart(2, '0')}`) ?? 0;
        return reb > 0 ? (dividaPecAnoSerie[m] / reb) * 100 : null;
      });
      const serieAlavAnoAnt: (number | null)[] = new Array(12).fill(null).map((_, m) => {
        const reb = aggReb.get(`${anoBaseEff - 1}-${String(m + 1).padStart(2, '0')}`) ?? 0;
        return reb > 0 ? (dividaPecAnoAntSerie[m] / reb) * 100 : null;
      });

      const totalAtual = principal + juros;

      // Alavancagem (% — sem fallback). Se denominador <= 0, percentual fica null.
      const alavPerc = valorRebanhoAtual > 0 ? (dividaPecAtual / valorRebanhoAtual) * 100 : null;
      const alavMesAnt = valorRebanhoMesAnt > 0 ? (dividaPecMesAnt / valorRebanhoMesAnt) * 100 : null;
      const alavAnoAnt = valorRebanhoAnoAnt > 0 ? (dividaPecAnoAnt / valorRebanhoAnoAnt) * 100 : null;

      let alavStatus: AlavancagemLeve['status'] = 'indisponivel';
      if (alavPerc != null) {
        alavStatus = alavPerc < 30 ? 'saudavel' : alavPerc < 50 ? 'atencao' : 'critico';
      }

      const pizzaVencimentos: PizzaSliceLeve[] = [
        { nome: `Curto Prazo (${anoBaseEff}–${anoBaseEff + 1})`, valor: curtoPrazo, color: '#EF4444' },
        { nome: `Longo Prazo (${anoBaseEff + 2}+)`,              valor: longoPrazo, color: '#EAB308' },
      ].filter((s) => s.valor > 0);

      return {
        total: totalAtual,
        principal,
        juros,
        totalMesAnterior: totalMesAnt > 0 ? totalMesAnt : null,
        totalAnoAnterior: totalAnoAnt > 0 ? totalAnoAnt : null,
        deltaMes: deltaPct(totalAtual, totalMesAnt > 0 ? totalMesAnt : null),
        deltaAno: deltaPct(totalAtual, totalAnoAnt > 0 ? totalAnoAnt : null),
        alavancagem: {
          percentual: alavPerc,
          percentualMesAnterior: alavMesAnt,
          percentualAnoAnterior: alavAnoAnt,
          deltaMes: alavPerc != null && alavMesAnt != null ? deltaPct(alavPerc, alavMesAnt) : null,
          deltaAno: alavPerc != null && alavAnoAnt != null ? deltaPct(alavPerc, alavAnoAnt) : null,
          status: alavStatus,
        },
        pizzaVencimentos,
        serieAno: totalAnoSerie,
        serieAnoAnt: totalAnoAntSerie,
        serieAlavancagemAno: serieAlavAno,
        serieAlavancagemAnoAnt: serieAlavAnoAnt,
      };
    },
  });

  return {
    total: data?.total ?? 0,
    principal: data?.principal ?? 0,
    juros: data?.juros ?? 0,
    totalMesAnterior: data?.totalMesAnterior ?? null,
    totalAnoAnterior: data?.totalAnoAnterior ?? null,
    deltaMes: data?.deltaMes ?? null,
    deltaAno: data?.deltaAno ?? null,
    alavancagem: data?.alavancagem ?? EMPTY_ALAVANCAGEM,
    pizzaVencimentos: data?.pizzaVencimentos ?? EMPTY.pizzaVencimentos,
    serieAno: data?.serieAno ?? EMPTY.serieAno,
    serieAnoAnt: data?.serieAnoAnt ?? EMPTY.serieAnoAnt,
    serieAlavancagemAno: data?.serieAlavancagemAno ?? EMPTY.serieAlavancagemAno,
    serieAlavancagemAnoAnt: data?.serieAlavancagemAnoAnt ?? EMPTY.serieAlavancagemAnoAnt,
    loading: isLoading,
  };
}
