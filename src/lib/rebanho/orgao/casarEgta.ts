/**
 * REBANHO-ORGAO-01 (F2) — R6: cada eGTA do extrato casa com a MOVIMENTAÇÃO do sistema da mesma fazenda e do mesmo sentido, pela SOMA de
 * cabeças (1 movimentação = 1 a 8 eGTAs) e pela data (±10 dias). O estorno anula a eGTA de mesmo documento. A eGTA não soma na
 * declaração: ela só CONFERE (o órgão já a tem). O que casou ganha o nº gravado na movimentação (O3, gesto com prévia — fora daqui).
 * FASE 0 (Vera, 04/05/25→04/05/26): 42 de 42 casaram; a maior diferença de data foi de 9 dias (venda de 60, 04/08 × eGTA 13/08).
 */
import type { OperacaoDoExtrato } from './lerExtratoIagro';

export const JANELA_DE_DIAS = 10;
export const MAX_EGTAS_POR_MOVIMENTO = 8;

export interface MovimentoComGta {
  id: string;
  /** 'AAAA-MM-DD' */
  data: string;
  sentido: 'saida' | 'entrada';
  cab: number;
  /** o nº que já está gravado (o casamento confere; diferente = aviso) */
  numeroDocumento: string | null;
}
export interface EgtaDoExtrato { documento: string; data: string; sentido: 'saida' | 'entrada'; cab: number }
export interface Casamento { movimentoId: string; documentos: string[]; cab: number; diasDeDiferenca: number; numeroJaGravadoDiferente: boolean }
export interface ResultadoDoCasamento { casados: Casamento[]; egtaSemMovimento: EgtaDoExtrato[]; movimentoSemEgta: MovimentoComGta[] }

/** As eGTAs vivas do extrato (sem as estornadas: o estorno anula a de mesmo documento). */
export function egtasDoExtrato(ops: readonly OperacaoDoExtrato[]): EgtaDoExtrato[] {
  const estornados = new Set(ops.filter((o) => o.tipo === 'estorno_saida' || o.tipo === 'estorno_entrada').map((o) => o.documento));
  return ops.filter((o) => (o.tipo === 'egta_saida' || o.tipo === 'egta_entrada') && o.documento && o.quando && !estornados.has(o.documento))
    .map((o) => ({ documento: o.documento ?? '', data: (o.quando ?? '').slice(0, 10), sentido: o.tipo === 'egta_saida' ? 'saida' : 'entrada', cab: Math.abs(o.geral) }));
}

const dias = (a: string, b: string) => Math.round((Date.parse(`${a}T00:00:00Z`) - Date.parse(`${b}T00:00:00Z`)) / 86_400_000);

/** Um subconjunto (até `max`) que soma `alvo`, tentando primeiro as mais próximas na data. */
function subconjunto(cands: readonly EgtaDoExtrato[], alvo: number, max: number): EgtaDoExtrato[] | null {
  let passos = 0;
  const ir = (i: number, resto: number, escolhidas: EgtaDoExtrato[]): EgtaDoExtrato[] | null => {
    if (resto === 0) return escolhidas;
    if (escolhidas.length === max || i >= cands.length || ++passos > 20_000) return null;
    for (let j = i; j < cands.length; j++) {
      if (cands[j].cab > resto) continue;
      const r = ir(j + 1, resto - cands[j].cab, [...escolhidas, cands[j]]);
      if (r) return r;
    }
    return null;
  };
  return ir(0, alvo, []);
}

export function casarEgta(egtas: readonly EgtaDoExtrato[], movimentos: readonly MovimentoComGta[]): ResultadoDoCasamento {
  const usadas = new Set<string>();
  const casados: Casamento[] = [];
  const sem: MovimentoComGta[] = [];
  for (const m of [...movimentos].sort((a, b) => a.data.localeCompare(b.data) || a.id.localeCompare(b.id))) {
    const cands = egtas.filter((e) => !usadas.has(e.documento) && e.sentido === m.sentido && Math.abs(dias(e.data, m.data)) <= JANELA_DE_DIAS)
      .sort((a, b) => Math.abs(dias(a.data, m.data)) - Math.abs(dias(b.data, m.data)) || a.documento.localeCompare(b.documento));
    const achou = subconjunto(cands, m.cab, MAX_EGTAS_POR_MOVIMENTO);
    if (!achou) { sem.push(m); continue; }
    for (const e of achou) usadas.add(e.documento);
    const docs = achou.map((e) => e.documento).sort();
    casados.push({ movimentoId: m.id, documentos: docs, cab: m.cab, diasDeDiferenca: Math.max(...achou.map((e) => Math.abs(dias(e.data, m.data)))),
      numeroJaGravadoDiferente: !!m.numeroDocumento && !docs.some((d) => (m.numeroDocumento ?? '').includes(d.split('/')[0])) });
  }
  return { casados, egtaSemMovimento: egtas.filter((e) => !usadas.has(e.documento)), movimentoSemEgta: sem };
}
