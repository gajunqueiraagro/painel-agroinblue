/**
 * A SUGESTAO APRENDIDA DA CONTA DE CADA ITEM — FIN-CLASSIF-DIVIDIDA-01b (mock: "sugestao aprendida por produto · mude onde precisar").
 * Aprende das divisoes ja' feitas PELOS ITENS da nota (`financeiro_lancamento_partes.origem = 'nota'`, com os `nota_itens` de cada parte)
 * do MESMO emitente: o produto (codigo do fornecedor; sem codigo, a descricao) vai para a conta em que foi posto da ultima vez.
 * Sem historico, nada e' sugerido (a tela parte da conta do lancamento). So' le^; nada e' gravado.
 */
import { supabase } from '@/integrations/supabase/client';
import { soDigitos } from '@/lib/financeiro/nfe/formatos';
import type { ItemFiscal } from '@/lib/financeiro/nfe/itensDaNota';

/** A chave do produto: o codigo do fornecedor; sem codigo, a descricao (sem caixa, acento e espacos repetidos). */
export function chaveDoProduto(i: Pick<ItemFiscal, 'codigo' | 'descricao'>): string {
  const c = (i.codigo ?? '').trim();
  if (c) return `c:${c}`;
  return `d:${i.descricao.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim()}`;
}

export interface ItemJaClassificado { chave: string; planoContaId: string; quando: string }

/** O aprendido: cada produto -> a conta da vez MAIS RECENTE. */
export function aprender(historico: readonly ItemJaClassificado[]): Map<string, string> {
  const m = new Map<string, { plano: string; quando: string }>();
  for (const h of historico) {
    const x = m.get(h.chave);
    if (!x || h.quando > x.quando) m.set(h.chave, { plano: h.planoContaId, quando: h.quando });
  }
  return new Map([...m].map(([k, v]) => [k, v.plano]));
}

/** As contas sugeridas para os itens de agora (so' as que o plano aceita: `valida`). */
export function sugerir(itens: readonly Pick<ItemFiscal, 'nItem' | 'codigo' | 'descricao'>[], aprendido: ReadonlyMap<string, string>,
  valida: (planoContaId: string) => boolean): Map<number, string> {
  const m = new Map<number, string>();
  for (const i of itens) {
    const p = aprendido.get(chaveDoProduto(i));
    if (p && valida(p)) m.set(i.nItem, p);
  }
  return m;
}

/** Le^ o historico do emitente (as notas dele ja' divididas pelos itens). Falha = sem historico. */
export async function historicoDoEmitente(clienteId: string, emitenteDocumento: string | null, notaAtualChave: string | null): Promise<ItemJaClassificado[]> {
  const doc = soDigitos(emitenteDocumento ?? '');
  if (!doc) return [];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- as tabelas novas ainda nao estao nos tipos gerados
  const db = supabase as any;
  try {
    const { data: notas } = await db.from('nota_fiscal').select('id, chave_acesso').eq('cliente_id', clienteId).eq('emitente_documento', doc)
      .order('lido_em', { ascending: false }).limit(60);
    const outras = (Array.isArray(notas) ? notas : []).filter((n: { chave_acesso: string }) => n.chave_acesso !== notaAtualChave);
    if (!outras.length) return [];
    const notaDaChave = new Map<string, string>(outras.map((n: { id: string; chave_acesso: string }) => [n.chave_acesso, n.id]));
    const { data: docs } = await db.from('financeiro_lancamento_documentos').select('lancamento_id, chave_acesso').eq('cliente_id', clienteId)
      .in('chave_acesso', [...notaDaChave.keys()]).eq('cancelado', false);
    const notaDoLanc = new Map<string, string>();
    for (const d of Array.isArray(docs) ? docs : []) { const n = notaDaChave.get(d.chave_acesso); if (n) notaDoLanc.set(d.lancamento_id, n); }
    if (!notaDoLanc.size) return [];
    const { data: partes } = await db.from('financeiro_lancamento_partes').select('lancamento_id, plano_conta_id, nota_itens, criado_em')
      .in('lancamento_id', [...notaDoLanc.keys()]).eq('origem', 'nota');
    const ps = Array.isArray(partes) ? partes : [];
    if (!ps.length) return [];
    const notaIds = [...new Set(ps.map((p: { lancamento_id: string }) => notaDoLanc.get(p.lancamento_id)).filter(Boolean))];
    const { data: itens } = await db.from('nota_fiscal_itens').select('nota_id, n_item, codigo, descricao').in('nota_id', notaIds);
    const item = new Map<string, Pick<ItemFiscal, 'codigo' | 'descricao'>>();
    for (const i of Array.isArray(itens) ? itens : []) item.set(`${i.nota_id}|${i.n_item}`, { codigo: i.codigo ?? null, descricao: String(i.descricao ?? '') });
    const out: ItemJaClassificado[] = [];
    for (const p of ps) {
      const nota = notaDoLanc.get(p.lancamento_id);
      for (const n of Array.isArray(p.nota_itens) ? p.nota_itens : []) {
        const i = item.get(`${nota}|${n}`);
        if (i) out.push({ chave: chaveDoProduto(i), planoContaId: String(p.plano_conta_id), quando: String(p.criado_em ?? '') });
      }
    }
    return out;
  } catch {
    return [];
  }
}
