/**
 * Função pura montarComposicaoFazenda.
 *
 * Recebe rawCategorias (linha por fazenda × categoria × mês) e
 * agrega por fazenda_id para o mês de referência.
 *
 * Modo Global: produz N itens (N = nº de fazendas com cabecas > 0).
 * Modo Individual: produz 1 item (a fazenda selecionada).
 *
 * pesoMedioKg = pesoTotalKg / cabecas (derivado).
 * gmd ponderado por cabecas (linhas com cabecas > 0 e gmd != null).
 *
 * Filtra apenas fazendas que estão em fazendasComPecuariaIds (ignora
 * Retiro Agricultura, ADM, etc.).
 *
 * areaProdutivaHa, uaHa, arrobasHa: null por agora (não-objetivo do
 * Step 2.3 — não consultar nova fonte, não recalcular paralelo).
 * Quando essas métricas existirem oficialmente por fazenda no PC-100,
 * essa função será estendida sem mudar a interface.
 */
import type { ItemComposicaoFazenda } from './types';

/** Shape mínimo do raw — aceita ZootCategoriaMensal real ou simulado. */
interface CategoriaMensalMinimo {
  fazenda_id?: string;
  fazendaId?: string;
  mes?: number;
  saldo_final?: number | null;
  saldoFinal?: number | null;
  peso_total_final?: number | null;
  pesoTotalFinal?: number | null;
  gmd?: number | null;
}

function num(v: number | null | undefined): number {
  if (v == null || Number.isNaN(v)) return 0;
  return v;
}

function nullable(v: number | null | undefined): number | null {
  if (v == null || Number.isNaN(v)) return null;
  return v;
}

export function montarComposicaoFazenda(
  rawCategorias: CategoriaMensalMinimo[] | null | undefined,
  mes: number,
  fazendaNomes: Map<string, string>,
  fazendasComPecuariaIds: Set<string>,
): ItemComposicaoFazenda[] | null {
  if (!rawCategorias || rawCategorias.length === 0) return null;
  if (mes < 1 || mes > 12) return null;

  // 1. Filtra apenas linhas do mês de referência e fazendas pecuárias
  const linhas = rawCategorias.filter((r) => {
    const m = r.mes;
    if (m !== mes) return false;
    const fid = r.fazendaId ?? r.fazenda_id ?? '';
    if (!fid) return false;
    return fazendasComPecuariaIds.has(fid);
  });
  if (linhas.length === 0) return null;

  // 2. Agrega por fazenda_id
  interface Acc {
    fazendaId: string;
    cabecas: number;
    pesoTotalKg: number;
    gmdSomaPonderada: number;
    gmdPesoTotal: number;
  }

  const agregadosMap = new Map<string, Acc>();
  for (const l of linhas) {
    const fid = (l.fazendaId ?? l.fazenda_id ?? '') as string;
    const cab = num(l.saldoFinal ?? l.saldo_final);
    const peso = num(l.pesoTotalFinal ?? l.peso_total_final);
    const gmd = nullable(l.gmd);

    let acc = agregadosMap.get(fid);
    if (!acc) {
      acc = {
        fazendaId: fid,
        cabecas: 0,
        pesoTotalKg: 0,
        gmdSomaPonderada: 0,
        gmdPesoTotal: 0,
      };
      agregadosMap.set(fid, acc);
    }
    acc.cabecas += cab;
    acc.pesoTotalKg += peso;
    if (gmd != null && cab > 0) {
      acc.gmdSomaPonderada += gmd * cab;
      acc.gmdPesoTotal += cab;
    }
  }

  // 3. Filtra fazendas com cabecas > 0 (no mês)
  const ativos = Array.from(agregadosMap.values()).filter((a) => a.cabecas > 0);
  if (ativos.length === 0) return null;

  // 4. Totais para pcts
  const totalCabecas = ativos.reduce((s, a) => s + a.cabecas, 0);
  const totalPeso = ativos.reduce((s, a) => s + a.pesoTotalKg, 0);

  // 5. Monta resultado final
  const itens: ItemComposicaoFazenda[] = ativos.map((a) => ({
    fazendaId: a.fazendaId,
    fazenda: fazendaNomes.get(a.fazendaId) ?? a.fazendaId,
    cabecas: a.cabecas,
    pesoTotalKg: a.pesoTotalKg,
    pesoMedioKg: a.cabecas > 0 ? a.pesoTotalKg / a.cabecas : 0,
    gmd: a.gmdPesoTotal > 0 ? a.gmdSomaPonderada / a.gmdPesoTotal : null,
    pctRebanho: totalCabecas > 0 ? a.cabecas / totalCabecas : 0,
    pctPeso: totalPeso > 0 ? a.pesoTotalKg / totalPeso : 0,
    areaProdutivaHa: null,
    uaHa: null,
    arrobasHa: null,
  }));

  // 6. Ordena por cabecas DESC
  itens.sort((a, b) => b.cabecas - a.cabecas);

  return itens;
}
