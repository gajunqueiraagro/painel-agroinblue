import type { ReceitaPecuariaModalData, CentroComposicao, SubcentroComposicao, DeltaSeguro } from './receitaPecuariaModalTypes';
import type { LinhaExecutiva } from './blocoResumoExecutivoTypes';
import type { ComposicaoSubcentro } from '@/lib/painelConsultor/agregadosFinanceiros';
import { ORDEM_CENTROS_RECEITA_PECUARIA } from '@/lib/financeiro/classificacao';

export interface BuildReceitaPecModalInput {
  linha: LinhaExecutiva;
  porSubcentroMeta: Record<string, ComposicaoSubcentro>;
  porSubcentroReal: Record<string, ComposicaoSubcentro>;
}

const sum12 = (arr: number[]): number => arr.reduce((s, v) => s + (v ?? 0), 0);

/**
 * Delta executivo seguro:
 * - meta<=0 && real<=0 → 0 (ambos zero, sem variação)
 * - real<=0 && meta>0  → null (matematicamente indefinido — render "—")
 * - caso geral         → (meta - real) / real
 */
function calcDeltaSeguro(meta: number, real: number): DeltaSeguro {
  if (meta <= 0 && real <= 0) return 0;
  if (real <= 0) return null;
  return (meta - real) / real;
}

export function buildReceitaPecuariaModalData(input: BuildReceitaPecModalInput): ReceitaPecuariaModalData {
  const { linha, porSubcentroMeta, porSubcentroReal } = input;

  const allSubs = new Set([
    ...Object.keys(porSubcentroMeta),
    ...Object.keys(porSubcentroReal),
  ]);

  const subcentros: SubcentroComposicao[] = [];
  for (const sub of allSubs) {
    const m = porSubcentroMeta[sub];
    const r = porSubcentroReal[sub];
    const metaMeses = m?.meses ?? new Array(12).fill(0);
    const realMeses = r?.meses ?? new Array(12).fill(0);
    const metaTotal = sum12(metaMeses);
    const realTotal = sum12(realMeses);

    if (metaTotal === 0 && realTotal === 0) continue;

    const centro = m?.centro_custo ?? r?.centro_custo;
    if (!centro) {
      console.warn('[buildReceitaPecModal] subcentro sem centro associado, ignorado:', sub);
      continue;
    }

    subcentros.push({
      subcentro: sub,
      centro_custo: centro,
      metaMeses, realMeses, metaTotal, realTotal,
      delta: calcDeltaSeguro(metaTotal, realTotal),
      impactoAbs: metaTotal - realTotal,
    });
  }

  const centrosMap = new Map<string, SubcentroComposicao[]>();
  for (const s of subcentros) {
    if (!centrosMap.has(s.centro_custo)) centrosMap.set(s.centro_custo, []);
    centrosMap.get(s.centro_custo)!.push(s);
  }

  const centrosForaDaOrdemOficial: string[] = [];
  for (const c of centrosMap.keys()) {
    if (!(ORDEM_CENTROS_RECEITA_PECUARIA as readonly string[]).includes(c)) {
      centrosForaDaOrdemOficial.push(c);
      console.warn('[buildReceitaPecModal] centro fora da ORDEM_CENTROS_RECEITA_PECUARIA:', c);
    }
  }

  const centrosOrdenados: string[] = [
    ...ORDEM_CENTROS_RECEITA_PECUARIA.filter(c => centrosMap.has(c)),
    ...centrosForaDaOrdemOficial.sort((a, b) => a.localeCompare(b, 'pt-BR')),
  ];

  const porCentro: CentroComposicao[] = centrosOrdenados.map(centro => {
    const subs = centrosMap.get(centro)!.sort((a, b) => b.metaTotal - a.metaTotal);
    const metaTotal = subs.reduce((s, x) => s + x.metaTotal, 0);
    const realTotal = subs.reduce((s, x) => s + x.realTotal, 0);
    return {
      centro_custo: centro,
      subcentros: subs,
      metaTotal, realTotal,
      delta: calcDeltaSeguro(metaTotal, realTotal),
    };
  });

  const topImpactos = [...subcentros]
    .sort((a, b) => Math.abs(b.impactoAbs) - Math.abs(a.impactoAbs))
    .slice(0, 3);

  const totalMetaBreakdown = porCentro.reduce((s, c) => s + c.metaTotal, 0);
  const totalRealBreakdown = porCentro.reduce((s, c) => s + c.realTotal, 0);
  const diferencaMeta = totalMetaBreakdown - linha.meta;
  const diferencaReal = totalRealBreakdown - linha.real;
  const conciliado = Math.abs(diferencaMeta) < 1 && Math.abs(diferencaReal) < 1;

  return {
    linha,
    porCentro,
    topImpactos,
    conciliado,
    diferencaMeta,
    diferencaReal,
    centrosForaDaOrdemOficial,
  };
}
