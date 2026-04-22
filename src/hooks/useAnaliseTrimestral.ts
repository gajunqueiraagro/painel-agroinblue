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
      const anoMesTriPrev = meses.map(m => `${anoPrev}-${String(m).padStart(2, '0')}`);
      // Mês imediatamente anterior ao primeiro do tri (pra variação de estoque)
      const mesAntCurrent = meses[0] === 1 ? `${anoPrev}-12` : `${ano}-${String(meses[0] - 1).padStart(2, '0')}`;
      const mesAntPrev = meses[0] === 1 ? `${ano - 2}-12` : `${anoPrev}-${String(meses[0] - 1).padStart(2, '0')}`;
      const vrfAnoMes = [mesAntCurrent, ...anoMesTri, mesAntPrev, ...anoMesTriPrev];
      const dataIni = anoMesTri[0] + '-01';
      const dataFimMes = meses[2];
      const dataFimDia = new Date(ano, dataFimMes, 0).getDate();
      const dataFim = `${ano}-${String(dataFimMes).padStart(2, '0')}-${String(dataFimDia).padStart(2, '0')}`;

      const [zootReal, zootMeta, zootPrev, finLancs, finLancsPrev, saldos, movLancs, pastos, vrfRes] = await Promise.all([
        supabase.from('zoot_mensal_cache' as any).select('*')
          .eq('cliente_id', clienteId).eq('ano', ano).eq('cenario', 'realizado').in('mes', meses),
        supabase.from('zoot_mensal_cache' as any).select('*')
          .eq('cliente_id', clienteId).eq('ano', ano).eq('cenario', 'meta').in('mes', meses),
        supabase.from('zoot_mensal_cache' as any).select('*')
          .eq('cliente_id', clienteId).eq('ano', anoPrev).eq('cenario', 'realizado').in('mes', meses),
        supabase.from('financeiro_lancamentos_v2').select('ano_mes, valor, tipo_operacao, macro_custo, grupo_custo, subcentro, centro_custo')
          .eq('cliente_id', clienteId).eq('cancelado', false).in('ano_mes', anoMesTri),
        supabase.from('financeiro_lancamentos_v2').select('ano_mes, valor, tipo_operacao, macro_custo, grupo_custo')
          .eq('cliente_id', clienteId).eq('cancelado', false).in('ano_mes', anoMesTriPrev),
        supabase.from('financeiro_saldos_bancarios_v2').select('ano_mes, saldo_inicial, saldo_final, total_entradas, total_saidas')
          .eq('cliente_id', clienteId).in('ano_mes', anoMesTri),
        supabase.from('lancamentos').select('data, tipo, quantidade, peso_total, valor_total, cenario, cancelado')
          .eq('cliente_id', clienteId).eq('cancelado', false).eq('cenario', 'realizado')
          .gte('data', dataIni).lte('data', dataFim),
        supabase.from('pastos').select('fazenda_id, area_produtiva_ha, ativo, entra_conciliacao')
          .eq('cliente_id', clienteId).eq('ativo', true).eq('entra_conciliacao', true),
        supabase.from('valor_rebanho_fechamento').select('ano_mes, valor_total, status')
          .eq('cliente_id', clienteId).in('ano_mes', vrfAnoMes),
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

      // ── DRE (Demonstrativo de Resultado) ──
      // Agregar valor_rebanho_fechamento por ano_mes (soma das fazendas do cliente)
      const vrfRows = (vrfRes.data as any[]) || [];
      const vrfMap = new Map<string, { valor: number; statusOk: boolean }>();
      for (const r of vrfRows) {
        const key = r.ano_mes as string;
        const prev = vrfMap.get(key);
        const valor = (prev?.valor || 0) + (Number(r.valor_total) || 0);
        // status=fechado em todas as linhas do mês → considerar disponível
        const okPrev = prev ? prev.statusOk : true;
        const statusOk = okPrev && (r.status === 'fechado');
        vrfMap.set(key, { valor, statusOk });
      }
      const vrfValor = (key: string): number | null => vrfMap.has(key) ? vrfMap.get(key)!.valor : null;
      const vrfDisponivel = (key: string): boolean => vrfMap.has(key) && vrfMap.get(key)!.statusOk;

      // DRE — per-month (atual)
      const dreFatura: Arr3 = receitaPec;                               // (+) Faturamento competência = Receita Pecuária
      const dreDesemb: Arr3 = [0, 1, 2].map(i => custoFixoPec[i] + custoVariavelPec[i]) as Arr3;
      const dreLucroBruto: Arr3 = [0, 1, 2].map(i => dreFatura[i] - dreDesemb[i]) as Arr3;
      const dreReposicao: Arr3 = compraBovinos;
      const dreVariacao: Arr3 = [0, 0, 0];
      const dreFechamentoPendente: [boolean, boolean, boolean] = [false, false, false];
      for (let i = 0; i < 3; i++) {
        const mesCurKey = anoMesTri[i];
        const mesAntKey = i === 0 ? mesAntCurrent : anoMesTri[i - 1];
        const vCur = vrfValor(mesCurKey);
        const vAnt = vrfValor(mesAntKey);
        if (vCur == null || vAnt == null) {
          dreFechamentoPendente[i] = true;
          dreVariacao[i] = 0;
        } else {
          dreVariacao[i] = vCur - vAnt;
          dreFechamentoPendente[i] = !vrfDisponivel(mesCurKey) || !vrfDisponivel(mesAntKey);
        }
      }
      const dreLucroOperacional: Arr3 = [0, 1, 2].map(i => dreLucroBruto[i] - dreReposicao[i] + dreVariacao[i]) as Arr3;
      const dreJuros: Arr3 = jurosPec;
      const dreLucroLiquido: Arr3 = [0, 1, 2].map(i => dreLucroOperacional[i] - dreJuros[i]) as Arr3;
      const dreMargemPct: Arr3 = [0, 1, 2].map(i => dreFatura[i] > 0 ? (dreLucroLiquido[i] / dreFatura[i]) * 100 : 0) as Arr3;
      const dreMarkupPct: Arr3 = [0, 1, 2].map(i => dreDesemb[i] > 0 ? (dreLucroLiquido[i] / dreDesemb[i]) * 100 : 0) as Arr3;

      // DRE — Ref ano anterior (totais do tri)
      const finRowsPrev = (finLancsPrev.data as any[]) || [];
      const sumPrev = (pred: (l: any) => boolean): number =>
        finRowsPrev.filter(pred).reduce((s, l) => s + Math.abs(Number(l.valor) || 0), 0);
      const prevFatura = sumPrev(l => l.tipo_operacao === '1-Entradas' && l.grupo_custo === 'Receita Pecuária');
      const prevCustoFixo = sumPrev(l => l.grupo_custo === 'Custo Fixo Pecuária');
      const prevCustoVar = sumPrev(l => l.grupo_custo === 'Custo Variável Pecuária');
      const prevDesemb = prevCustoFixo + prevCustoVar;
      const prevReposicao = sumPrev(l => l.grupo_custo === 'Compra de Bovinos');
      const prevJuros = sumPrev(l => l.grupo_custo === 'Juros de Financiamento Pecuária');
      const prevLucroBruto = prevFatura - prevDesemb;
      const prevMesFinTri = anoMesTriPrev[2];
      const prevVarFinal = vrfValor(prevMesFinTri);
      const prevVarInicial = vrfValor(mesAntPrev);
      const prevFechamentoPend = prevVarFinal == null || prevVarInicial == null;
      const prevVariacao = prevFechamentoPend ? 0 : (prevVarFinal! - prevVarInicial!);
      const prevLucroOper = prevLucroBruto - prevReposicao + prevVariacao;
      const prevLucroLiq = prevLucroOper - prevJuros;
      const prevMargem = prevFatura > 0 ? (prevLucroLiq / prevFatura) * 100 : 0;
      const prevMarkup = prevDesemb > 0 ? (prevLucroLiq / prevDesemb) * 100 : 0;

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
        dre: {
          faturamento: dreFatura,
          desembolsoProducao: dreDesemb,
          lucroBruto: dreLucroBruto,
          reposicaoBovinos: dreReposicao,
          variacaoEstoque: dreVariacao,
          fechamentoPendente: dreFechamentoPendente,
          lucroOperacional: dreLucroOperacional,
          jurosFinanciamento: dreJuros,
          lucroLiquido: dreLucroLiquido,
          margemLucroPct: dreMargemPct,
          markupPct: dreMarkupPct,
          refAnoAnterior: {
            ano: anoPrev,
            faturamento: prevFatura,
            desembolsoProducao: prevDesemb,
            lucroBruto: prevLucroBruto,
            reposicaoBovinos: prevReposicao,
            variacaoEstoque: prevVariacao,
            lucroOperacional: prevLucroOper,
            jurosFinanciamento: prevJuros,
            lucroLiquido: prevLucroLiq,
            margemLucroPct: prevMargem,
            markupPct: prevMarkup,
            fechamentoPendente: prevFechamentoPend,
          },
        },
      };
    },
  });
}

export type AnaliseTrimestralData = NonNullable<ReturnType<typeof useAnaliseTrimestral>['data']>;

// ============================================================================
// DRE por Período (1..N meses acumulado)
// ============================================================================

interface DREPeriodoParams {
  clienteId: string | null | undefined;
  ano: number;
  ateMes: number; // 1..12 — DRE acumulado de Jan até este mês
}

export function useAnaliseDREPeriodo({ clienteId, ano, ateMes }: DREPeriodoParams) {
  const meses = useMemo(() => Array.from({ length: ateMes }, (_, i) => i + 1), [ateMes]);

  return useQuery({
    queryKey: ['analise-dre-periodo', clienteId, ano, ateMes],
    enabled: !!clienteId && ateMes >= 1 && ateMes <= 12,
    staleTime: 60_000,
    queryFn: async () => {
      if (!clienteId) throw new Error('clienteId ausente');
      const pad = (n: number) => String(n).padStart(2, '0');
      const anoPrev = ano - 1;
      const anoMes = meses.map(m => `${ano}-${pad(m)}`);
      const anoMesPrev = meses.map(m => `${anoPrev}-${pad(m)}`);
      const mesAntAtual = `${anoPrev}-12`;
      const mesAntPrev = `${ano - 2}-12`;
      const vrfAnoMes = [mesAntAtual, ...anoMes, mesAntPrev, ...anoMesPrev];
      const dataIni = `${ano}-01-01`;
      const dataFim = `${ano}-${pad(ateMes)}-${String(new Date(ano, ateMes, 0).getDate()).padStart(2, '0')}`;

      const [fin, finPrev, compras, zootAtu, vrf] = await Promise.all([
        supabase.from('financeiro_lancamentos_v2')
          .select('ano_mes, valor, tipo_operacao, macro_custo, grupo_custo')
          .eq('cliente_id', clienteId).eq('cancelado', false).in('ano_mes', anoMes),
        supabase.from('financeiro_lancamentos_v2')
          .select('ano_mes, valor, tipo_operacao, macro_custo, grupo_custo')
          .eq('cliente_id', clienteId).eq('cancelado', false).in('ano_mes', anoMesPrev),
        supabase.from('lancamentos')
          .select('data, tipo, valor_total, quantidade, peso_total')
          .eq('cliente_id', clienteId).eq('cancelado', false).eq('cenario', 'realizado')
          .eq('tipo', 'compra').gte('data', dataIni).lte('data', dataFim),
        supabase.from('zoot_mensal_cache' as any).select('*')
          .eq('cliente_id', clienteId).eq('ano', ano).eq('cenario', 'realizado').in('mes', meses),
        supabase.from('valor_rebanho_fechamento')
          .select('ano_mes, valor_total, status')
          .eq('cliente_id', clienteId).in('ano_mes', vrfAnoMes),
      ]);

      const finRows = (fin.data as any[]) || [];
      const finRowsPrev = (finPrev.data as any[]) || [];
      const compraRows = (compras.data as any[]) || [];
      const zootRows = (zootAtu.data as any[]) || [];
      const vrfRows = (vrf.data as any[]) || [];

      const N = ateMes;
      const arr = (): number[] => Array(N).fill(0);

      const sumByMes = (rows: any[], pred: (l: any) => boolean): number[] => {
        const out = arr();
        for (const l of rows) {
          if (!pred(l)) continue;
          const mes = Number(String(l.ano_mes).substring(5, 7));
          const idx = meses.indexOf(mes);
          if (idx < 0) continue;
          out[idx] += Math.abs(Number(l.valor) || 0);
        }
        return out;
      };

      const faturamento = sumByMes(finRows, l => l.tipo_operacao === '1-Entradas' && l.grupo_custo === 'Receita Pecuária');
      const custoFixo = sumByMes(finRows, l => l.grupo_custo === 'Custo Fixo Pecuária');
      const custoVar = sumByMes(finRows, l => l.grupo_custo === 'Custo Variável Pecuária');
      const juros = sumByMes(finRows, l => l.grupo_custo === 'Juros de Financiamento Pecuária');

      const desembolso: number[] = meses.map((_, i) => custoFixo[i] + custoVar[i]);
      const lucroBruto: number[] = meses.map((_, i) => faturamento[i] - desembolso[i]);

      // Reposição = lancamentos tipo=compra por data (valor_total), soma por mês
      const reposicao: number[] = arr();
      let reposicaoTemValor = false;
      for (const r of compraRows) {
        const mes = Number(String(r.data).substring(5, 7));
        const idx = meses.indexOf(mes);
        if (idx < 0) continue;
        const v = Number(r.valor_total);
        if (v != null && !Number.isNaN(v)) {
          reposicao[idx] += Math.abs(v);
          reposicaoTemValor = true;
        }
      }

      // vrfMap
      const vrfMap = new Map<string, { valor: number; statusOk: boolean }>();
      for (const r of vrfRows) {
        const prev = vrfMap.get(r.ano_mes);
        const valor = (prev?.valor || 0) + (Number(r.valor_total) || 0);
        const okPrev = prev ? prev.statusOk : true;
        vrfMap.set(r.ano_mes, { valor, statusOk: okPrev && r.status === 'fechado' });
      }
      const vrfVal = (k: string) => vrfMap.has(k) ? vrfMap.get(k)!.valor : null;

      const variacao: number[] = arr();
      const fechamentoPendente: boolean[] = Array(N).fill(false);
      for (let i = 0; i < N; i++) {
        const cur = anoMes[i];
        const ant = i === 0 ? mesAntAtual : anoMes[i - 1];
        const vCur = vrfVal(cur), vAnt = vrfVal(ant);
        if (vCur == null || vAnt == null) { fechamentoPendente[i] = true; }
        else variacao[i] = vCur - vAnt;
      }

      const lucroOper: number[] = meses.map((_, i) => lucroBruto[i] - reposicao[i] + variacao[i]);
      const lucroLiq: number[] = meses.map((_, i) => lucroOper[i] - juros[i]);
      const margem: number[] = meses.map((_, i) => faturamento[i] > 0 ? (lucroLiq[i] / faturamento[i]) * 100 : 0);
      const markup: number[] = meses.map((_, i) => desembolso[i] > 0 ? (lucroLiq[i] / desembolso[i]) * 100 : 0);

      // Acumulados (soma)
      const acumSum = (a: number[]) => a.reduce((s, v) => s + v, 0);
      const acumFat = acumSum(faturamento);
      const acumDesemb = acumSum(desembolso);
      const acumLucroBruto = acumSum(lucroBruto);
      const acumReposicao = acumSum(reposicao);
      const acumVariacao = acumSum(variacao);
      const acumLucroOper = acumLucroBruto - acumReposicao + acumVariacao;
      const acumJuros = acumSum(juros);
      const acumLucroLiq = acumLucroOper - acumJuros;
      const acumMargem = acumFat > 0 ? (acumLucroLiq / acumFat) * 100 : 0;
      const acumMarkup = acumDesemb > 0 ? (acumLucroLiq / acumDesemb) * 100 : 0;

      // Ref ano anterior (mesmo período)
      const sumPrev = (pred: (l: any) => boolean) =>
        finRowsPrev.filter(pred).reduce((s, l) => s + Math.abs(Number(l.valor) || 0), 0);
      const prevFat = sumPrev(l => l.tipo_operacao === '1-Entradas' && l.grupo_custo === 'Receita Pecuária');
      const prevFixo = sumPrev(l => l.grupo_custo === 'Custo Fixo Pecuária');
      const prevVar = sumPrev(l => l.grupo_custo === 'Custo Variável Pecuária');
      const prevDesemb = prevFixo + prevVar;
      const prevJuros = sumPrev(l => l.grupo_custo === 'Juros de Financiamento Pecuária');
      const prevLucroBruto = prevFat - prevDesemb;
      // Reposição prev: SEM info direta (compras zoo do prev não foram buscadas pra economizar query) — flag zero
      const prevReposicao = 0;
      const prevVarFinal = vrfVal(anoMesPrev[N - 1]);
      const prevVarInicial = vrfVal(mesAntPrev);
      const prevVariacao = prevVarFinal != null && prevVarInicial != null ? prevVarFinal - prevVarInicial : 0;
      const prevLucroOper = prevLucroBruto - prevReposicao + prevVariacao;
      const prevLucroLiq = prevLucroOper - prevJuros;
      const prevMargem = prevFat > 0 ? (prevLucroLiq / prevFat) * 100 : 0;
      const prevMarkup = prevDesemb > 0 ? (prevLucroLiq / prevDesemb) * 100 : 0;

      // Rebanho no período: saldo_inicial do 1º mês, saldo_final do último
      const byMes = new Map<number, { si: number; sf: number }>();
      for (const r of zootRows) {
        const m = r.mes as number;
        if (!byMes.has(m)) byMes.set(m, { si: 0, sf: 0 });
        const x = byMes.get(m)!;
        x.si += Number(r.saldo_inicial) || 0;
        x.sf += Number(r.saldo_final) || 0;
      }
      const cabInicial = byMes.get(meses[0])?.si ?? 0;
      const cabFinal = byMes.get(meses[N - 1])?.sf ?? 0;
      const valorInicial = vrfVal(mesAntAtual) ?? 0;
      const valorFinal = vrfVal(anoMes[N - 1]) ?? 0;

      return {
        ano, ateMes, meses,
        dre: {
          faturamento, desembolsoProducao: desembolso,
          lucroBruto, reposicaoBovinos: reposicao, reposicaoTemValor,
          variacaoEstoque: variacao, fechamentoPendente,
          lucroOperacional: lucroOper, jurosFinanciamento: juros,
          lucroLiquido: lucroLiq, margemLucroPct: margem, markupPct: markup,
          acum: {
            faturamento: acumFat, desembolsoProducao: acumDesemb, lucroBruto: acumLucroBruto,
            reposicaoBovinos: acumReposicao, variacaoEstoque: acumVariacao,
            lucroOperacional: acumLucroOper, jurosFinanciamento: acumJuros,
            lucroLiquido: acumLucroLiq, margemLucroPct: acumMargem, markupPct: acumMarkup,
          },
          refAnoAnterior: {
            ano: anoPrev,
            faturamento: prevFat, desembolsoProducao: prevDesemb, lucroBruto: prevLucroBruto,
            reposicaoBovinos: prevReposicao, variacaoEstoque: prevVariacao,
            lucroOperacional: prevLucroOper, jurosFinanciamento: prevJuros,
            lucroLiquido: prevLucroLiq, margemLucroPct: prevMargem, markupPct: prevMarkup,
          },
        },
        rebanhoPeriodo: {
          cabInicial, cabFinal,
          valorInicial, valorFinal,
          diferencaCab: cabFinal - cabInicial,
          variacaoReboR: valorFinal - valorInicial,
          valorInicialPendente: vrfVal(mesAntAtual) == null,
          valorFinalPendente: vrfVal(anoMes[N - 1]) == null,
        },
      };
    },
  });
}

export type DREPeriodoData = NonNullable<ReturnType<typeof useAnaliseDREPeriodo>['data']>;
