/**
 * A PARCELA LANÇADA SOLTA — P104 (Gabriel 25/10/2026 11h32: o "Parcelar este lançamento" oferecido na "… - 6/6" da NF 46.994). Um lançamento
 * com a fração "k/N" (N ≥ 2) no fim da descrição JÁ É uma parcela — lançada à mão, sem parcelamento: parcelá-lo de novo criaria N×N. O
 * bloco diz "Parcela k/N lançada solta (sem parcelamento) · achadas X de N" e não oferece parcelar (juntar as N num parcelamento é o P96).
 * As IRMÃS pela regra do P95 (`fn_nota_ja_lancada` 'fracao'): o mesmo fornecedor, a mesma fração N, sem parcelamento, não canceladas, e o
 * valor de cada uma ≈ o desta (quem dividiu arredonda: até 5 centavos de cada lado).
 */
import { supabase } from '@/integrations/supabase/client';
import { fracaoDaDescricao } from '@/lib/financeiro/nfe/jaLancada';

export interface ParcelaSolta { k: number; n: number }
/** A fração do lançamento, se ele é uma parcela solta; nulo = à vista de verdade. */
export const parcelaSolta = (descricao: string | null | undefined): ParcelaSolta | null => fracaoDaDescricao(descricao);

export interface CandidataIrma { id: string; descricao: string | null; valorCent: number }
export const TOLERANCIA_DA_IRMA_CENT = 5;

/** Quantas das N frações foram achadas (k distintos, contando a própria). PURO. */
export function achadasDaFracao(alvo: { id: string; valorCent: number; fracao: ParcelaSolta }, candidatas: readonly CandidataIrma[]): number {
  const ks = new Set<number>([alvo.fracao.k]);
  for (const c of candidatas) {
    if (c.id === alvo.id) continue;
    const f = fracaoDaDescricao(c.descricao);
    if (!f || f.n !== alvo.fracao.n) continue;
    if (Math.abs(c.valorCent - alvo.valorCent) > TOLERANCIA_DA_IRMA_CENT) continue;
    ks.add(f.k);
  }
  return ks.size;
}

export const fraseDaParcelaSolta = (f: ParcelaSolta, achadas: number | null) =>
  `Parcela ${f.k}/${f.n} lançada solta (sem parcelamento)${achadas != null ? ` · achadas ${achadas} de ${f.n}` : ''}`;

/** As candidatas do banco: as saídas vivas do mesmo fornecedor, sem parcelamento, com "/N" no fim da descrição. Falha = nulo (a frase sai sem o "achadas"). */
export async function buscarIrmasSoltas(clienteId: string, favorecidoId: string, n: number): Promise<CandidataIrma[] | null> {
  const { data, error } = await supabase.from('financeiro_lancamentos_v2').select('id, descricao, valor')
    .eq('cliente_id', clienteId).eq('favorecido_id', favorecidoId).eq('cancelado', false).is('financiamento_id', null)
    .like('descricao', `%/${n}`).limit(500);
  if (error || !data) return null;
  return data.map((r) => ({ id: r.id, descricao: r.descricao, valorCent: Math.round(Math.abs(Number(r.valor)) * 100) }));
}
