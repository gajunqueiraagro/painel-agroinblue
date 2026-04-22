/**
 * useAnaliseTrimestral — Dados consolidados do trimestre selecionado.
 *
 * Fontes:
 *   - zoot_mensal_cache (realizado + meta + ano-1 para YoY)
 *   - financeiro_lancamentos_v2 (custos, receitas, aportes)
 *   - financeiro_saldos_bancarios_v2 (fluxo de caixa consolidado)
 *   - lancamentos (movimentações zootécnicas: abate/venda/nascimento/...)
 *   - pastos (area_produtiva_ha por fazenda)
 *
 * Classificação (campo grupo_custo):
 *   CP Pecuária = Custo Fixo Pec + Custo Variável Pec + Juros Fin Pec + Deduções Pec
 *   Receita Pec = tipo=1-Entradas AND grupo='Receita Pecuária'
 *   Faturamento = tipo=1-Entradas EXCETO macro='Entrada Financeira'
 *   Aporte Pessoal = tipo=1-Entradas AND subcentro='Aporte Pessoal'
 *   Dividendos    = tipo=2-Saídas AND macro='Dividendos'
 */

import { useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';

export type Trimestre = 1 | 2 | 3 | 4;

export function trimestreMeses(t: Trimestre): number[] {
  const base = (t - 1) * 3;
  return [base + 1, base + 2, base + 3];
}

interface Params {
  clienteId: string | null | undefined;
  ano: number;
  trimestre: Trimestre;
}

type Arr3 = [number, number, number];
const z3 = (): Arr3 => [0, 0, 0];

function toArr3<T>(mes: number[], valor: T[], tri: number[]): Arr3 {
  const out: Arr3 = z3();
  for (let i = 0; i < mes.length; i++) {
    const idx = tri.indexOf(mes[i]);
    if (idx >= 0) (out as any)[idx] = valor[i];
  }
  return out;
}

export function useAnaliseTrimestral({ clienteId, ano, trimestre }: Params) {
  const meses = useMemo(() => trimestreMeses(trimestre), [trimestre]);

  return useQuery({
    queryKey: ['analise-trimestral', clienteId, ano, trimestre],
    enabled: !!clienteId,
    staleTime: 60_000,
    queryFn: async () => {
      if (!clienteId) throw new Error('clienteId ausente');
      const anoMesTri = meses.map(m => `${ano}-${String(m).padStart(2, '0')}`);
      const anoPrev = ano - 1;
      const dataIni = anoMesTri[0] + '-01';
      const dataFimMes = meses[2];
      const dataFimDia = new Date(ano, dataFimMes, 0).getDate();
      const dataFim = `${ano}-${String(dataFimMes).padStart(2, '0')}-${String(dataFimDia).padStart(2, '0')}`;

      const [zootReal, zootMeta, zootPrev, finLancs, saldos, movLancs, pastos] = await Promise.all([
        supabase.from('zoot_mensal_cache' as any).select('*')
          .eq('cliente_id', clienteId).eq('ano', ano).eq('cenario', 'realizado').in('mes', meses),
        supabase.from('zoot_mensal_cache' as any).select('*')
          .eq('cliente_id', clienteId).eq('ano', ano).eq('cenario', 'meta').in('mes', meses),
        supabase.from('zoot_mensal_cache' as any).select('*')
          .eq('cliente_id', clienteId).eq('ano', anoPrev).eq('cenario', 'realizado').in('mes', meses),
        supabase.from('financeiro_lancamentos_v2').select('ano_mes, valor, tipo_operacao, macro_custo, grupo_custo, subcentro, centro_custo')
          .eq('cliente_id', clienteId).eq('cancelado', false).in('ano_mes', anoMesTri),
        supabase.from('financeiro_saldos_bancarios_v2').select('ano_mes, saldo_inicial, saldo_final, total_entradas, total_saidas')
          .eq('cliente_id', clienteId).in('ano_mes', anoMesTri),
        supabase.from('lancamentos').select('data, tipo, quantidade, peso_total, valor_total, cenario, cancelado')
          .eq('cliente_id', clienteId).eq('cancelado', false).eq('cenario', 'realizado')
          .gte('data', dataIni).lte('data', dataFim),
        supabase.from('pastos').select('fazenda_id, area_produtiva_ha, ativo, entra_conciliacao')
          .eq('cliente_id', clienteId).eq('ativo', true).eq('entra_conciliacao', true),
      ]);

      const zootRealRows = (zootReal.data as any[]) || [];
      const zootMetaRows = (zootMeta.data as any[]) || [];
      const zootPrevRows = (zootPrev.data as any[]) || [];
      const finRows = (finLancs.data as any[]) || [];
      const saldoRows = (saldos.data as any[]) || [];
      const movRows = (movLancs.data as any[]) || [];
      const pastoRows = (pastos.data as any[]) || [];

      // ── ÁREA ──
      const areaPecuariaHa = pastoRows.reduce((s, p) => s + (p.area_produtiva_ha || 0), 0);

      // ── REBANHO (agregando todas categorias) ──
      const aggZoot = (rows: any[]): { si: Arr3; sf: Arr3; gmdNum: Arr3; gmdDen: Arr3; prodBio: Arr3 } => {
        const si = z3(), sf = z3(), gmdNum = z3(), gmdDen = z3(), prodBio = z3();
        for (const r of rows) {
          const idx = meses.indexOf(r.mes);
          if (idx < 0) continue;
          si[idx] += Number(r.saldo_inicial) || 0;
          sf[idx] += Number(r.saldo_final) || 0;
          // GMD ponderado por saldo_inicial
          const g = Number(r.gmd) || 0;
          const w = Number(r.saldo_inicial) || 0;
          gmdNum[idx] += g * w;
          gmdDen[idx] += w;
          prodBio[idx] += Number(r.producao_biologica) || 0;
        }
        return { si, sf, gmdNum, gmdDen, prodBio };
      };

      const zr = aggZoot(zootRealRows);
      const zm = aggZoot(zootMetaRows);
      const zp = aggZoot(zootPrevRows);

      const saldoInicial: Arr3 = zr.si;
      const saldoFinal: Arr3 = zr.sf;
      const rebanhoMedio: Arr3 = [0, 1, 2].map(i => (zr.si[i] + zr.sf[i]) / 2) as Arr3;
      const gmdReal: Arr3 = [0, 1, 2].map(i => zr.gmdDen[i] > 0 ? zr.gmdNum[i] / zr.gmdDen[i] : 0) as Arr3;
      const gmdMeta: Arr3 = [0, 1, 2].map(i => zm.gmdDen[i] > 0 ? zm.gmdNum[i] / zm.gmdDen[i] : 0) as Arr3;
      const gmdYoy: Arr3 = [0, 1, 2].map(i => zp.gmdDen[i] > 0 ? zp.gmdNum[i] / zp.gmdDen[i] : 0) as Arr3;
      const lotacaoUaHa: Arr3 = [0, 1, 2].map(i => areaPecuariaHa > 0 ? (rebanhoMedio[i] * 0.75) / areaPecuariaHa : 0) as Arr3;
      const lotacaoMeta: Arr3 = [0, 1, 2].map(i => {
        const rebMedMeta = (zm.si[i] + zm.sf[i]) / 2;
        return areaPecuariaHa > 0 ? (rebMedMeta * 0.75) / areaPecuariaHa : 0;
      }) as Arr3;

      // ── MOVIMENTAÇÕES (tipo zootécnico) ──
      const sumMov = (tipo: string, field: 'quantidade' | 'peso_total' | 'valor_total'): Arr3 => {
        const out = z3();
        for (const r of movRows) {
          if (r.tipo !== tipo) continue;
          const mes = Number(String(r.data).substring(5, 7));
          const idx = meses.indexOf(mes);
          if (idx < 0) continue;
          out[idx] += Number((r as any)[field]) || 0;
        }
        return out;
      };
      const nascimentos = sumMov('nascimento', 'quantidade');
      const compras = sumMov('compra', 'quantidade');
      const abatesCab = sumMov('abate', 'quantidade');
      const abatesKg = sumMov('abate', 'peso_total');
      const abatesValor = sumMov('abate', 'valor_total');
      const vendas = sumMov('venda', 'quantidade');
      const mortes = sumMov('morte', 'quantidade');
      const consumo = sumMov('consumo', 'quantidade');
      const mortalidadePct: Arr3 = [0, 1, 2].map(i => saldoInicial[i] > 0 ? (mortes[i] / saldoInicial[i]) * 100 : 0) as Arr3;
      const precoArroba: Arr3 = [0, 1, 2].map(i => {
        const arrobas = abatesKg[i] * 0.5 / 15;
        return arrobas > 0 ? abatesValor[i] / arrobas : 0;
      }) as Arr3;

      // ── FINANCEIRO: classificação por grupo_custo/macro_custo ──
      const matchSum = (pred: (l: any) => boolean): Arr3 => {
        const out = z3();
        for (const l of finRows) {
          if (!pred(l)) continue;
          const mes = Number(String(l.ano_mes).substring(5, 7));
          const idx = meses.indexOf(mes);
          if (idx < 0) continue;
          out[idx] += Math.abs(Number(l.valor) || 0);
        }
        return out;
      };

      const custoFixoPec = matchSum(l => l.grupo_custo === 'Custo Fixo Pecuária');
      const custoVariavelPec = matchSum(l => l.grupo_custo === 'Custo Variável Pecuária');
      const jurosPec = matchSum(l => l.grupo_custo === 'Juros de Financiamento Pecuária');
      const deducoesPec = matchSum(l => l.macro_custo === 'Deduções de Receitas' && l.grupo_custo === 'Deduções Pecuária');
      const custoProducaoPec: Arr3 = [0, 1, 2].map(i => custoFixoPec[i] + custoVariavelPec[i] + jurosPec[i] + deducoesPec[i]) as Arr3;
      const rCabMes: Arr3 = [0, 1, 2].map(i => rebanhoMedio[i] > 0 ? custoProducaoPec[i] / rebanhoMedio[i] : 0) as Arr3;

      const custoFixoAgr = matchSum(l => l.grupo_custo === 'Custo Fixo Agricultura');
      const custoVarAgr = matchSum(l => l.grupo_custo === 'Custo Variável Agricultura');
      const investPec = matchSum(l => l.grupo_custo === 'Investimento Pecuária');
      const investAgr = matchSum(l => l.macro_custo === 'Investimento na Fazenda' && l.grupo_custo === 'Investimento Agricultura');
      const amortizacoes = matchSum(l => l.macro_custo === 'Saída Financeira' && l.grupo_custo === 'Amortizações');
      const compraBovinos = matchSum(l => l.grupo_custo === 'Compra de Bovinos');
      const dividendos = matchSum(l => l.tipo_operacao === '2-Saídas' && l.macro_custo === 'Dividendos');
      const aportePessoal = matchSum(l => l.tipo_operacao === '1-Entradas' && l.subcentro === 'Aporte Pessoal');

      const receitaPec = matchSum(l => l.tipo_operacao === '1-Entradas' && l.grupo_custo === 'Receita Pecuária');
      const receitaTotal = matchSum(l => l.tipo_operacao === '1-Entradas' && l.macro_custo === 'Receita Operacional');
      const faturamentoTotal = matchSum(l => l.tipo_operacao === '1-Entradas' && l.macro_custo !== 'Entrada Financeira');

      const lucroBrutoPec: Arr3 = [0, 1, 2].map(i => receitaPec[i] - custoProducaoPec[i]) as Arr3;
      const margemPct: Arr3 = [0, 1, 2].map(i => receitaPec[i] > 0 ? (lucroBrutoPec[i] / receitaPec[i]) * 100 : 0) as Arr3;

      // ── FLUXO CAIXA (agregado por ano_mes) ──
      const saldoIniCaixa = z3(), saldoFimCaixa = z3(), entradasCaixa = z3(), saidasCaixa = z3();
      for (const s of saldoRows) {
        const mes = Number(String(s.ano_mes).substring(5, 7));
        const idx = meses.indexOf(mes);
        if (idx < 0) continue;
        saldoIniCaixa[idx] += Number(s.saldo_inicial) || 0;
        saldoFimCaixa[idx] += Number(s.saldo_final) || 0;
        entradasCaixa[idx] += Number(s.total_entradas) || 0;
        saidasCaixa[idx] += Number(s.total_saidas) || 0;
      }

      // ── DIVIDENDO LÍQUIDO ──
      const dividendoLiquido: Arr3 = [0, 1, 2].map(i => dividendos[i] - aportePessoal[i]) as Arr3;

      return {
        meses,
        ano,
        trimestre,
        area: { areaPecuariaHa },
        rebanho: { saldoInicial, saldoFinal, nascimentos, compras, abates: abatesCab, vendas, mortes, consumo, rebanhoMedio },
        zootecnico: { gmd: gmdReal, gmdMeta, gmdYoy, lotacaoUaHa, lotacaoMeta, mortalidadePct },
        desfrutes: { abatesCab, abatesKg, abatesValor, precoArroba, comprasCab: compras },
        custoPec: {
          custoFixo: custoFixoPec, custoVariavel: custoVariavelPec, juros: jurosPec,
          deducoes: deducoesPec, total: custoProducaoPec, rCabMes,
          metaRCab: z3(), // meta financeira não modelada ainda — placeholder
          investPec, compraBovinos,
        },
        resultado: { faturamentoTotal, receitaTotal, receitaPec, custoProducaoPec, lucroBrutoPec, margemPct },
        fluxoCaixa: { saldoInicial: saldoIniCaixa, saldoFinal: saldoFimCaixa, entradas: entradasCaixa, saidas: saidasCaixa },
        detalhamentoSaidas: {
          custoFixoPec, custoVarPec: custoVariavelPec, custoFixoAgr, custoVarAgr,
          investPec, investAgr, compraBovinos, dividendos, amortizacoes, juros: jurosPec,
        },
        aportes: { dividendos, aportePessoal, dividendoLiquido },
      };
    },
  });
}

export type AnaliseTrimestralData = NonNullable<ReturnType<typeof useAnaliseTrimestral>['data']>;
