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

export interface CandidataIrma {
  id: string; descricao: string | null; valorCent: number;
  /** P143 — o que a tabela das parcelas mostra (a aba Pagamento) */
  vencimento?: string | null; pagamento?: string | null; status?: string | null; conta?: string | null;
}
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

/** P143 (Gabriel 29/10 15:03, o caso "Parcela 3 - None" da NF 4964) — o NÚMERO DA NOTA para achar as irmãs quando a descrição não tem
 *  "k/N": sem pontos e espaços, antes do "/" ou do "-" da parcela ("4964 / 1", "000.004.964" e "4964" são a mesma), sem os zeros da
 *  frente. Só dígitos; o resto = nulo (não há nota para casar). PURO. */
export function numeroDaNota(numeroDocumento: string | null | undefined): string | null {
  const base = (numeroDocumento ?? '').replace(/[.\s]/g, '').split(/[/-]/)[0] ?? '';
  if (!/^\d+$/.test(base)) return null;
  const n = base.replace(/^0+/, '');
  return n || null;
}

const SELECAO_DA_IRMA = 'id, descricao, valor, data_vencimento, data_pagamento, status_transacao, conta_bancaria_id, numero_documento';
type LinhaDaIrma = { id: string; descricao: string | null; valor: number | string; data_vencimento: string | null; data_pagamento: string | null;
  status_transacao: string | null; conta_bancaria_id: string | null; numero_documento: string | null };

/** As candidatas do banco: as saídas vivas do mesmo fornecedor, sem parcelamento, com "/N" no fim da descrição. Falha = nulo (a frase sai sem o "achadas"). */
export async function buscarIrmasSoltas(clienteId: string, favorecidoId: string, n: number): Promise<CandidataIrma[] | null> {
  const { data, error } = await supabase.from('financeiro_lancamentos_v2')
    .select(SELECAO_DA_IRMA)
    .eq('cliente_id', clienteId).eq('favorecido_id', favorecidoId).eq('cancelado', false).is('financiamento_id', null)
    .like('descricao', `%/${n}`).limit(500);
  if (error || !data) return null;
  return comAsContas(data);
}

/** P143 — as irmãs PELA NOTA (a descrição sem "k/N"): os lançamentos vivos do mesmo fornecedor, sem parcelamento, com o MESMO número de
 *  nota (`numeroDaNota`). A busca do banco é larga (o número dentro do texto); quem decide é o `numeroDaNota`. Falha = nulo. */
export async function buscarIrmasDaNota(clienteId: string, favorecidoId: string, numero: string): Promise<CandidataIrma[] | null> {
  const { data, error } = await supabase.from('financeiro_lancamentos_v2')
    .select(SELECAO_DA_IRMA)
    .eq('cliente_id', clienteId).eq('favorecido_id', favorecidoId).eq('cancelado', false).is('financiamento_id', null)
    .like('numero_documento', `%${numero.slice(-3)}%`).limit(500);
  if (error || !data) return null;
  return comAsContas(data.filter((r) => numeroDaNota(r.numero_documento) === numero));
}

async function comAsContas(data: readonly LinhaDaIrma[]): Promise<CandidataIrma[]> {
  /* P143 — o nome da conta de cada uma (uma ida so', pelas contas que aparecem); falhou = sem o nome, a lista segue */
  const contas = [...new Set(data.map((r) => r.conta_bancaria_id).filter((c): c is string => !!c))];
  const nomes = new Map<string, string>();
  if (contas.length) {
    const c = await supabase.from('financeiro_contas_bancarias').select('id, nome_conta').in('id', contas);
    for (const x of c.data ?? []) if (x.nome_conta) nomes.set(x.id, x.nome_conta);
  }
  return data.map((r) => ({
    id: r.id, descricao: r.descricao, valorCent: Math.round(Math.abs(Number(r.valor)) * 100),
    vencimento: r.data_vencimento, pagamento: r.data_pagamento, status: r.status_transacao,
    conta: r.conta_bancaria_id ? nomes.get(r.conta_bancaria_id) ?? null : null,
  }));
}
