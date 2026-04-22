/**
 * useAuditoriaDesfrutes — dados consolidados de Abates/Vendas/Consumo
 * do trimestre selecionado + histórico 6 anos.
 *
 * Fontes:
 *   - lancamentos (realizado + meta) do trimestre
 *   - lancamentos histórico (ano-5 .. ano, mesmo trimestre)
 *   - financeiro_lancamentos_v2 (Receita Pecuária) por ano, para faturamento histórico
 *   - zoot_mensal_cache (consistência com a vw oficial — não usado pra cálculo
 *     direto aqui; os desfrutes vêm de lancamentos para granularidade por tipo)
 */

import { useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { trimestreMeses, type Trimestre } from '@/hooks/useAnaliseTrimestral';

export type TipoDesfrute = 'abate' | 'venda' | 'consumo';
export const TIPOS_DESFRUTE: TipoDesfrute[] = ['abate', 'venda', 'consumo'];

interface Params {
  clienteId: string | null | undefined;
  ano: number;
  trimestre: Trimestre;
}

type Arr3 = [number, number, number];
const z3 = (): Arr3 => [0, 0, 0];

export interface DesfruteAgregado {
  cabecas: Arr3;
  pesoTotalKg: Arr3;
  valorTotal: Arr3;
  pesoMedioCab: Arr3;     // = pesoTotal / cabecas (ponderado por mês)
  arrobas: Arr3;          // = pesoTotal * 0.5 / 15
  precoArroba: Arr3;      // = valor / arrobas
  precoCab: Arr3;         // = valor / cabecas
  // Valores acumulados (derivados dos totais, não da soma dos médios)
  acum: {
    cabecas: number;
    pesoTotalKg: number;
    valorTotal: number;
    arrobas: number;
    pesoMedioCab: number;
    precoArroba: number;
    precoCab: number;
  };
}

export interface HistoricoAno {
  ano: number;
  cabecas: number;
  pesoTotalKg: number;
  pesoMedioCab: number;
  arrobas: number;
  valor: number;
  precoArroba: number;
  faturamentoReceitaPec: number;
}

function aggregar(rows: any[], meses: number[]): DesfruteAgregado {
  const cabecas = z3(), pesoTotal = z3(), valor = z3();
  for (const r of rows) {
    if (!r.data) continue;
    const mes = Number(String(r.data).substring(5, 7));
    const idx = meses.indexOf(mes);
    if (idx < 0) continue;
    cabecas[idx] += Number(r.quantidade) || 0;
    pesoTotal[idx] += Number(r.peso_total) || 0;
    valor[idx] += Number(r.valor_total) || 0;
  }
  const pesoMedioCab: Arr3 = [0, 1, 2].map(i => cabecas[i] > 0 ? pesoTotal[i] / cabecas[i] : 0) as Arr3;
  const arrobas: Arr3 = [0, 1, 2].map(i => pesoTotal[i] * 0.5 / 15) as Arr3;
  const precoArroba: Arr3 = [0, 1, 2].map(i => arrobas[i] > 0 ? valor[i] / arrobas[i] : 0) as Arr3;
  const precoCab: Arr3 = [0, 1, 2].map(i => cabecas[i] > 0 ? valor[i] / cabecas[i] : 0) as Arr3;
  // Acumulado — derivado dos TOTAIS, não da soma dos médios.
  const cabAcum = cabecas[0] + cabecas[1] + cabecas[2];
  const pesoAcum = pesoTotal[0] + pesoTotal[1] + pesoTotal[2];
  const valAcum = valor[0] + valor[1] + valor[2];
  const arrAcum = pesoAcum * 0.5 / 15;
  const acum = {
    cabecas: cabAcum,
    pesoTotalKg: pesoAcum,
    valorTotal: valAcum,
    arrobas: arrAcum,
    pesoMedioCab: cabAcum > 0 ? pesoAcum / cabAcum : 0,
    precoArroba: arrAcum > 0 ? valAcum / arrAcum : 0,
    precoCab: cabAcum > 0 ? valAcum / cabAcum : 0,
  };
  return { cabecas, pesoTotalKg: pesoTotal, valorTotal: valor, pesoMedioCab, arrobas, precoArroba, precoCab, acum };
}

function aggregarHistorico(rowsByAno: Record<number, any[]>, faturamentoByAno: Record<number, number>): HistoricoAno[] {
  const out: HistoricoAno[] = [];
  for (const a of Object.keys(rowsByAno).map(Number).sort((x, y) => x - y)) {
    const rows = rowsByAno[a] || [];
    const cab = rows.reduce((s, r) => s + (Number(r.quantidade) || 0), 0);
    const peso = rows.reduce((s, r) => s + (Number(r.peso_total) || 0), 0);
    const valor = rows.reduce((s, r) => s + (Number(r.valor_total) || 0), 0);
    const arr = peso * 0.5 / 15;
    out.push({
      ano: a,
      cabecas: cab,
      pesoTotalKg: peso,
      pesoMedioCab: cab > 0 ? peso / cab : 0,
      arrobas: arr,
      valor,
      precoArroba: arr > 0 ? valor / arr : 0,
      faturamentoReceitaPec: faturamentoByAno[a] ?? 0,
    });
  }
  return out;
}

export function useAuditoriaDesfrutes({ clienteId, ano, trimestre }: Params) {
  const meses = useMemo(() => trimestreMeses(trimestre), [trimestre]);

  return useQuery({
    queryKey: ['auditoria-desfrutes', clienteId, ano, trimestre],
    enabled: !!clienteId,
    staleTime: 60_000,
    queryFn: async () => {
      if (!clienteId) throw new Error('clienteId ausente');

      // Datas do trimestre corrente
      const dataIni = `${ano}-${String(meses[0]).padStart(2, '0')}-01`;
      const ultimoMes = meses[2];
      const dataFim = `${ano}-${String(ultimoMes).padStart(2, '0')}-${String(new Date(ano, ultimoMes, 0).getDate()).padStart(2, '0')}`;

      // Histórico: últimos 6 anos (incluindo ano atual) → [ano-5 .. ano]
      const anosHist: number[] = [];
      for (let y = ano - 5; y <= ano; y++) anosHist.push(y);

      // ano_mes list para faturamento histórico (só meses do tri, todos os anos)
      const anoMesHist: string[] = [];
      for (const y of anosHist) for (const m of meses) anoMesHist.push(`${y}-${String(m).padStart(2, '0')}`);

      // Queries em paralelo
      const [realRes, metaRes, histRes, histMetaRes, fatRes] = await Promise.all([
        supabase.from('lancamentos')
          .select('data, tipo, quantidade, peso_total, valor_total, peso_medio_kg, categoria, cenario')
          .eq('cliente_id', clienteId).eq('cancelado', false).eq('cenario', 'realizado')
          .in('tipo', TIPOS_DESFRUTE).gte('data', dataIni).lte('data', dataFim),
        supabase.from('lancamentos')
          .select('data, tipo, quantidade, peso_total, valor_total, peso_medio_kg, categoria, cenario')
          .eq('cliente_id', clienteId).eq('cancelado', false).eq('cenario', 'meta')
          .in('tipo', TIPOS_DESFRUTE).gte('data', dataIni).lte('data', dataFim),
        // Histórico realizado — uma query, filtramos por mês no JS
        supabase.from('lancamentos')
          .select('data, tipo, quantidade, peso_total, valor_total')
          .eq('cliente_id', clienteId).eq('cancelado', false).eq('cenario', 'realizado')
          .in('tipo', TIPOS_DESFRUTE)
          .gte('data', `${ano - 5}-01-01`)
          .lte('data', `${ano}-12-31`),
        // Histórico meta — mesmo range, cenario='meta'
        supabase.from('lancamentos')
          .select('data, tipo, quantidade, peso_total, valor_total')
          .eq('cliente_id', clienteId).eq('cancelado', false).eq('cenario', 'meta')
          .in('tipo', TIPOS_DESFRUTE)
          .gte('data', `${ano - 5}-01-01`)
          .lte('data', `${ano}-12-31`),
        // Faturamento Receita Pecuária (trimestre-equivalente por ano)
        supabase.from('financeiro_lancamentos_v2')
          .select('ano_mes, valor')
          .eq('cliente_id', clienteId).eq('cancelado', false)
          .eq('tipo_operacao', '1-Entradas').eq('grupo_custo', 'Receita Pecuária')
          .in('ano_mes', anoMesHist),
      ]);

      const realRows = (realRes.data as any[]) || [];
      const metaRows = (metaRes.data as any[]) || [];
      const histRows = (histRes.data as any[]) || [];
      const histMetaRows = (histMetaRes.data as any[]) || [];
      const fatRows = (fatRes.data as any[]) || [];

      // Filtrar histórico pelos meses do trimestre
      const buildHistByAnoTipo = (rows: any[]): Record<TipoDesfrute, Record<number, any[]>> => {
        const out: Record<TipoDesfrute, Record<number, any[]>> = { abate: {}, venda: {}, consumo: {} };
        for (const r of rows) {
          const d = String(r.data);
          const y = Number(d.substring(0, 4));
          const m = Number(d.substring(5, 7));
          if (!meses.includes(m)) continue;
          if (!TIPOS_DESFRUTE.includes(r.tipo)) continue;
          if (!out[r.tipo as TipoDesfrute][y]) out[r.tipo as TipoDesfrute][y] = [];
          out[r.tipo as TipoDesfrute][y].push(r);
        }
        for (const t of TIPOS_DESFRUTE) for (const y of anosHist) if (!out[t][y]) out[t][y] = [];
        return out;
      };
      const histByAnoTipo = buildHistByAnoTipo(histRows);
      const histMetaByAnoTipo = buildHistByAnoTipo(histMetaRows);

      // Faturamento por ano (somatório dos ano_mes do tri naquele ano)
      const fatByAno: Record<number, number> = {};
      for (const y of anosHist) fatByAno[y] = 0;
      for (const f of fatRows) {
        const y = Number(String(f.ano_mes).substring(0, 4));
        fatByAno[y] = (fatByAno[y] ?? 0) + Math.abs(Number(f.valor) || 0);
      }

      // Agregar realizado/meta por tipo (para o trimestre corrente)
      const byTipo = (rows: any[], tipo: TipoDesfrute) =>
        aggregar(rows.filter(r => r.tipo === tipo), meses);
      const byAll = (rows: any[]) => aggregar(rows, meses);

      return {
        ano, trimestre, meses,
        realizado: {
          abate: byTipo(realRows, 'abate'),
          venda: byTipo(realRows, 'venda'),
          consumo: byTipo(realRows, 'consumo'),
          desfrutes: byAll(realRows),
        } as Record<'abate'|'venda'|'consumo'|'desfrutes', DesfruteAgregado>,
        meta: {
          abate: byTipo(metaRows, 'abate'),
          venda: byTipo(metaRows, 'venda'),
          consumo: byTipo(metaRows, 'consumo'),
          desfrutes: byAll(metaRows),
        } as Record<'abate'|'venda'|'consumo'|'desfrutes', DesfruteAgregado>,
        historico: {
          abate: aggregarHistorico(histByAnoTipo.abate, fatByAno),
          venda: aggregarHistorico(histByAnoTipo.venda, fatByAno),
          consumo: aggregarHistorico(histByAnoTipo.consumo, fatByAno),
          desfrutes: aggregarHistorico(
            (() => {
              const all: Record<number, any[]> = {};
              for (const y of anosHist) {
                all[y] = [
                  ...(histByAnoTipo.abate[y] || []),
                  ...(histByAnoTipo.venda[y] || []),
                  ...(histByAnoTipo.consumo[y] || []),
                ];
              }
              return all;
            })(),
            fatByAno,
          ),
        } as Record<'abate'|'venda'|'consumo'|'desfrutes', HistoricoAno[]>,
        historicoMeta: {
          abate: aggregarHistorico(histMetaByAnoTipo.abate, {}),
          venda: aggregarHistorico(histMetaByAnoTipo.venda, {}),
          consumo: aggregarHistorico(histMetaByAnoTipo.consumo, {}),
          desfrutes: aggregarHistorico(
            (() => {
              const all: Record<number, any[]> = {};
              for (const y of anosHist) {
                all[y] = [
                  ...(histMetaByAnoTipo.abate[y] || []),
                  ...(histMetaByAnoTipo.venda[y] || []),
                  ...(histMetaByAnoTipo.consumo[y] || []),
                ];
              }
              return all;
            })(),
            {},
          ),
        } as Record<'abate'|'venda'|'consumo'|'desfrutes', HistoricoAno[]>,
      };
    },
  });
}

export type AuditoriaDesfrutesData = NonNullable<ReturnType<typeof useAuditoriaDesfrutes>['data']>;
