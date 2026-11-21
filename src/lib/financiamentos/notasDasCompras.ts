/**
 * COMPRAS-PARC-NF-01 (Gabriel 18/11, reunião Amanda) — a NF de cada compra parcelada, para a lista "Compras parceladas".
 * FONTE ÚNICA: a nota JÁ VINCULADA às parcelas da compra (os documentos espécie "nf" dos lançamentos das parcelas, pela
 * `vw_lancamento_documentos`, que junta o dono e os vínculos). Nenhum campo paralelo; sem nota ligada = "—".
 */
import { supabase } from '@/integrations/supabase/client';

export interface NotaDaCompra { documentoId: string; numero: string; serie: string | null; emissao: string | null; valorCent: number | null; emitente: string | null }
export type NotasPorCompra = ReadonlyMap<string, readonly NotaDaCompra[]>;

/** "000.000.288" -> "288"; "12.345.678" -> "12345678"; o nº como a gente fala (sem pontos nem zeros à esquerda). */
export function numeroCurto(numero: string): string {
  const d = numero.replace(/\D/g, '').replace(/^0+(?=\d)/, '');
  return d || numero.trim();
}

/** O que a célula mostra: "—", "NF 288" ou "NF 288 +5" (a menor nota primeiro). Pura. */
export function rotuloDasNotas(notas: readonly NotaDaCompra[] | undefined): { texto: string; extras: number } {
  if (!notas?.length) return { texto: '—', extras: 0 };
  return { texto: `NF ${numeroCurto(notas[0].numero)}`, extras: notas.length - 1 };
}

/** O texto que a busca da aba lê: os números inteiros e os curtos (achar "288" e "000.000.288"). Pura. */
export function textoDasNotasParaBusca(notas: readonly NotaDaCompra[] | undefined): string {
  return (notas ?? []).flatMap((n) => [n.numero, numeroCurto(n.numero)]).join(' ');
}

/** A chave de ordenar: a menor nota (número); sem nota vai para o fim nos dois sentidos quem chama decide. Pura. */
export function chaveDeOrdem(notas: readonly NotaDaCompra[] | undefined): number | null {
  if (!notas?.length) return null;
  const n = Number(numeroCurto(notas[0].numero));
  return Number.isFinite(n) ? n : null;
}

interface LinhaParcela { financiamento_id: string; lancamento_id: string | null }
interface LinhaDoc { lancamento_id: string | null; documento_id: string | null; especie: string | null; numero: string | null; serie: string | null;
  data_emissao: string | null; valor_documento: number | string | null; emitente_nome: string | null }

/** Agrupa (pura): as parcelas de cada compra × os documentos nf dos lançamentos delas, sem repetir a nota, a menor primeiro. */
export function agruparNotas(parcelas: readonly LinhaParcela[], docs: readonly LinhaDoc[]): Map<string, NotaDaCompra[]> {
  const comprasDoLanc = new Map<string, Set<string>>();
  for (const p of parcelas) if (p.lancamento_id) {
    const s = comprasDoLanc.get(p.lancamento_id) ?? new Set<string>(); s.add(p.financiamento_id); comprasDoLanc.set(p.lancamento_id, s);
  }
  const porCompra = new Map<string, Map<string, NotaDaCompra>>();
  for (const d of docs) {
    if (d.especie !== 'nf' || !d.numero || !d.documento_id || !d.lancamento_id) continue;
    for (const fin of comprasDoLanc.get(d.lancamento_id) ?? []) {
      const m = porCompra.get(fin) ?? new Map<string, NotaDaCompra>();
      if (!m.has(d.documento_id)) m.set(d.documento_id, { documentoId: d.documento_id, numero: d.numero, serie: d.serie, emissao: d.data_emissao,
        valorCent: d.valor_documento == null ? null : Math.round(Number(d.valor_documento) * 100), emitente: d.emitente_nome });
      porCompra.set(fin, m);
    }
  }
  const ordem = (a: NotaDaCompra, b: NotaDaCompra) => (Number(numeroCurto(a.numero)) || 0) - (Number(numeroCurto(b.numero)) || 0) || a.numero.localeCompare(b.numero);
  return new Map([...porCompra].map(([k, m]) => [k, [...m.values()].sort(ordem)]));
}

const LOTE = 200;
/** Lê as notas das compras (os ids da lista). Falha = `null` (a coluna mostra "—" e a busca segue sem o nº; nunca trava a lista). */
export async function lerNotasDasCompras(clienteId: string, compras: readonly string[]): Promise<Map<string, NotaDaCompra[]> | null> {
  if (!compras.length) return new Map();
  try {
    const parcelas: LinhaParcela[] = [];
    for (let i = 0; i < compras.length; i += LOTE) {
      const { data, error } = await supabase.from('financiamento_parcelas').select('financiamento_id, lancamento_id')
        .eq('cliente_id', clienteId).in('financiamento_id', compras.slice(i, i + LOTE));
      if (error) return null;
      parcelas.push(...((data ?? []) as LinhaParcela[]));
    }
    const lancs = [...new Set(parcelas.flatMap((p) => (p.lancamento_id ? [p.lancamento_id] : [])))];
    const docs: LinhaDoc[] = [];
    for (let i = 0; i < lancs.length; i += LOTE) {
      const { data, error } = await supabase.from('vw_lancamento_documentos')
        .select('lancamento_id, documento_id, especie, numero, serie, data_emissao, valor_documento, emitente_nome')
        .eq('cliente_id', clienteId).eq('cancelado', false).eq('especie', 'nf').in('lancamento_id', lancs.slice(i, i + LOTE));
      if (error) return null;
      docs.push(...((data ?? []) as LinhaDoc[]));
    }
    return agruparNotas(parcelas, docs);
  } catch {
    return null;
  }
}
