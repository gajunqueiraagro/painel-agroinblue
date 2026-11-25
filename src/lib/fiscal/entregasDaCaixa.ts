/**
 * NOTA-ENTREGA-FUTURA-01 (B) — "+ Ligar entrega da Caixa" (mock aprovado pelo Gabriel 25/11 07:44): da aba Documentos de uma compra, as
 * REMESSAS de entrega futura do MESMO emitente que estão na caixa da Receita e ainda não estão em documento nenhum. A que cita esta compra
 * (refNFe = a chave da compra) vem primeiro e marcada; sem referência, o operador confirma. Ligar = o gravador de sempre
 * (`ligarRemessasACompra`, ENTREGA-FUTURA-LIGAR-01): nenhum lançamento novo, nenhum valor muda.
 */
import { supabase } from '@/integrations/supabase/client';
import { motivoDoErro, type Consulta } from '@/lib/financeiro/nfeConsultas';
import { classeDaNota } from '@/lib/fiscal/classeDaNota';
import { lerAtributos } from '@/lib/fiscal/notasDaReceita';

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- tabelas fiscais fora dos tipos gerados
const db = () => supabase as any;
const soDigitos = (s: unknown) => (typeof s === 'string' ? s.replace(/\D/g, '') : '');

export interface RemessaNaCaixa { chave: string; numero: string; emissao: string | null; valorCent: number; emitenteNome: string; xml: string;
  /** a remessa cita ESTA compra (refNFe) */
  citaACompra: boolean;
  /** cita OUTRA nota (refNFe de outra chave): a compra dela é outra */
  citaOutra: boolean }

/** a ordem: as que citam esta compra, depois as sem referência; as que citam outra nota ficam de fora (são de outra compra). PURO. */
export function ordenarRemessas(r: readonly RemessaNaCaixa[]): RemessaNaCaixa[] {
  return r.filter((x) => !x.citaOutra || x.citaACompra)
    .sort((a, b) => Number(b.citaACompra) - Number(a.citaACompra) || (a.emissao ?? '').localeCompare(b.emissao ?? '') || a.numero.localeCompare(b.numero));
}

export async function remessasNaCaixa(clienteId: string, emitenteDocumento: string, compraChave: string | null): Promise<Consulta<RemessaNaCaixa[]>> {
  try {
    const doc = soDigitos(emitenteDocumento);
    if (!doc) return { ok: true, valor: [] };
    const r = await db().from('fiscal_dfe_recebidos').select('chave, emissao, valor_cent, emitente_nome, xml')
      .eq('cliente_id', clienteId).eq('emitente_documento', doc).not('xml', 'is', null).order('emissao', { ascending: true }).limit(300);
    if (r.error) { console.error('remessasNaCaixa', r.error); return { ok: false, motivo: motivoDoErro(r.error) }; }
    const linhas: { chave: string; emissao: string | null; valorCent: number; emitenteNome: string; xml: string }[] = [];
    for (const x of Array.isArray(r.data) ? r.data : []) {
      const chave = soDigitos(Reflect.get(x, 'chave')); const xml = Reflect.get(x, 'xml');
      if (chave.length !== 44 || typeof xml !== 'string') continue;
      const em = Reflect.get(x, 'emissao'); const v = Number(Reflect.get(x, 'valor_cent')); const nome = Reflect.get(x, 'emitente_nome');
      linhas.push({ chave, emissao: typeof em === 'string' ? em : null, valorCent: Number.isFinite(v) ? v : 0, emitenteNome: typeof nome === 'string' ? nome : '', xml });
    }
    if (linhas.length === 0) return { ok: true, valor: [] };
    const chaves = linhas.map((l) => l.chave);
    const [a, d] = await Promise.all([
      db().rpc('fn_notas_atributos_fiscais', { p_cliente: clienteId, p_chaves: chaves }),
      db().from('financeiro_lancamento_documentos').select('chave_acesso').eq('cliente_id', clienteId).eq('cancelado', false).in('chave_acesso', chaves),
    ]);
    if (a.error || d.error) { console.error('remessasNaCaixa', a.error ?? d.error); return { ok: false, motivo: motivoDoErro(a.error ?? d.error) }; }
    const atributos = lerAtributos(a.data);
    const jaLigadas = new Set((Array.isArray(d.data) ? d.data : []).map((x: unknown) => soDigitos(x && typeof x === 'object' ? Reflect.get(x, 'chave_acesso') : '')));
    const compra = soDigitos(compraChave);
    const saida: RemessaNaCaixa[] = [];
    for (const l of linhas) {
      const at = atributos.get(l.chave);
      if (!at || jaLigadas.has(l.chave)) continue;
      const c = classeDaNota(at, false);
      if (c.classe !== 'nao_financeira' || c.motivo !== 'entrega_futura') continue;
      saida.push({ chave: l.chave, numero: String(Number(l.chave.slice(25, 34))), emissao: l.emissao, valorCent: l.valorCent, emitenteNome: l.emitenteNome, xml: l.xml,
        citaACompra: !!compra && at.refs.includes(compra), citaOutra: at.refs.length > 0 && !at.refs.includes(compra) });
    }
    return { ok: true, valor: ordenarRemessas(saida) };
  } catch (e) { console.error('remessasNaCaixa', e); return { ok: false, motivo: motivoDoErro(e) }; }
}

/** os lançamentos da compra (o dono da NF da compra + as parcelas ligadas a ela): a entrega vai para todos, como no "Ligar à compra" */
export async function lancamentosDaCompra(clienteId: string, documentoId: string, lancamentoId: string): Promise<string[]> {
  const [d, v] = await Promise.all([
    db().from('financeiro_lancamento_documentos').select('lancamento_id').eq('cliente_id', clienteId).eq('id', documentoId).maybeSingle(),
    db().from('financeiro_documento_vinculos').select('lancamento_id').eq('cliente_id', clienteId).eq('documento_id', documentoId),
  ]);
  const dono = !d.error && d.data && typeof Reflect.get(d.data, 'lancamento_id') === 'string' ? String(Reflect.get(d.data, 'lancamento_id')) : lancamentoId;
  const outros = !v.error && Array.isArray(v.data) ? v.data.map((x: unknown) => (x && typeof x === 'object' ? Reflect.get(x, 'lancamento_id') : null)).filter((x: unknown): x is string => typeof x === 'string') : [];
  return [...new Set([dono, ...outros, lancamentoId])];
}
