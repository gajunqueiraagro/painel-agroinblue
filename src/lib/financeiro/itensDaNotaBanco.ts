/**
 * OS ITENS DA NOTA E O BANCO — ITENS-NOTA-01. Um lugar so' fala com o supabase pelos itens: ler o arquivo da nota (XML ou PDF, pelos
 * MESMOS leitores do "+ Da nota") e gravar pela `fn_nota_fiscal_gravar`; ler o guardado pela chave. A criacao pela nota e o backfill
 * usam a MESMA `gravarItensDoArquivo`.
 */
import { supabase } from '@/integrations/supabase/client';
import { lerNota } from '@/lib/financeiro/nfe/lerNota';
import { ehChaveDeNota } from '@/lib/financeiro/nfe/formatos';
import { itensDoPdf, itensDoXml, lidosDoBanco, payloadDaNotaFiscal, type CabecalhoDaNota, type ItensLidos } from '@/lib/financeiro/nfe/itensDaNota';
import { decodificarPeloCharsetDeclarado } from '@/lib/financeiro/parser/decodificarExtrato';

export type ResultadoDosItens =
  | { ok: true; acao: 'criada' | 'substituida' | 'mantida_xml'; itens: number; confere: boolean; somaCent: number; notaCent: number; chave: string; numero: string }
  | { ok: false; frase: string };

/** Le^ o arquivo da nota e devolve o payload (sem gravar) — ou a frase do que nao deu. */
export async function lerItensDoArquivo(bytes: ArrayBuffer): Promise<{ ok: true; payload: ReturnType<typeof payloadDaNotaFiscal>; lidos: ItensLidos } | { ok: false; frase: string }> {
  const lido = await lerNota(bytes);
  if (lido.ok === false) return { ok: false, frase: lido.frase };
  const lidos = lido.origem === 'xml' ? itensDoXml(bytes) : itensDoPdf(lido.nota, lido.extras ?? {});
  if (!lidos || lidos.itens.length === 0) return { ok: false, frase: 'A nota não trouxe itens legíveis.' };
  const xml = lido.origem === 'xml' ? decodificarPeloCharsetDeclarado(bytes) : null;
  return { ok: true, payload: payloadDaNotaFiscal(lido.nota, lidos, xml), lidos };
}

/** A nota com os itens, lida do proprio arquivo (sem gravar) — o lancamento novo e a nota sem itens guardados. `null` = nao legivel. */
export async function notaComItensDoArquivo(bytes: ArrayBuffer): Promise<{ cabecalho: CabecalhoDaNota; lidos: ItensLidos } | null> {
  const r = await lerItensDoArquivo(bytes);
  if (r.ok === false) return null;
  const n = r.payload.nota;
  return { lidos: r.lidos, cabecalho: { chave: n.chave_acesso, origem: r.lidos.origem, numero: n.numero, serie: n.serie, emissao: n.emissao,
    natureza: n.natureza, regime: n.regime, emitenteDocumento: n.emitente_documento, emitenteNome: n.emitente_nome } };
}

/** Le^ e grava (ou simula). `operacao` = a do backfill (trilha). */
export async function gravarItensDoArquivo(clienteId: string, bytes: ArrayBuffer, opcoes: { simular?: boolean; operacao?: string | null } = {}): Promise<ResultadoDosItens> {
  const r = await lerItensDoArquivo(bytes);
  if (r.ok === false) return r;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- idioma documentado: o `.rpc` do repo
  const { data, error } = await (supabase as any).rpc('fn_nota_fiscal_gravar', {
    p_cliente: clienteId, p_nota: r.payload.nota, p_itens: r.payload.itens, p_simular: opcoes.simular ?? false, p_operacao: opcoes.operacao ?? null,
  });
  if (error) return { ok: false, frase: typeof error.message === 'string' && error.message ? error.message : 'Os itens não foram gravados.' };
  const o: Record<string, unknown> = data && typeof data === 'object' ? Object.fromEntries(Object.entries(data)) : {};
  const acao = o.acao === 'substituida' || o.acao === 'mantida_xml' ? o.acao : 'criada';
  return {
    ok: true, acao, itens: Number(o.itens) || r.payload.itens.length, confere: o.confere !== false,
    somaCent: Number(o.soma_cent) || 0, notaCent: Number(o.nota_cent) || 0, chave: r.payload.nota.chave_acesso, numero: r.payload.nota.numero,
  };
}

/** Os itens guardados de uma das chaves (a primeira que tiver nota guardada, a mais recente). `null` = nenhuma. */
export async function lerItensGuardados(clienteId: string, chaves: readonly string[]): Promise<{ cabecalho: CabecalhoDaNota; lidos: ItensLidos } | null> {
  const validas = [...new Set(chaves.filter(ehChaveDeNota))];
  if (!validas.length) return null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- as tabelas novas ainda nao estao nos tipos gerados
  const db = supabase as any;
  const { data: notas, error } = await db.from('nota_fiscal').select('*').eq('cliente_id', clienteId).in('chave_acesso', validas).order('lido_em', { ascending: false }).limit(1);
  const nota = !error && Array.isArray(notas) ? notas[0] : null;
  if (!nota) return null;
  const { data: itens, error: e2 } = await db.from('nota_fiscal_itens').select('*').eq('nota_id', nota.id).order('n_item');
  if (e2 || !Array.isArray(itens)) return null;
  return lidosDoBanco(nota, itens);
}

/** Grava os itens depois que o lancamento nasceu, SEM travar quem chama: falha vira a frase devolvida (nunca lanca). */
export async function gravarItensSemTravar(clienteId: string, arquivo: File | ArrayBuffer): Promise<string | null> {
  try {
    const bytes = arquivo instanceof ArrayBuffer ? arquivo : await arquivo.arrayBuffer();
    const r = await gravarItensDoArquivo(clienteId, bytes);
    return r.ok === false ? r.frase : null;
  } catch (e) {
    return e && typeof e === 'object' && 'message' in e && typeof e.message === 'string' ? e.message : 'Os itens da nota não foram gravados.';
  }
}

/** Quais destas chaves ja' tem nota guardada no cliente. */
export async function chavesGuardadas(clienteId: string, chaves: readonly string[]): Promise<ReadonlySet<string>> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- as tabelas novas ainda nao estao nos tipos gerados
  const { data, error } = await (supabase as any).from('nota_fiscal').select('chave_acesso').eq('cliente_id', clienteId).in('chave_acesso', [...chaves]);
  if (error || !Array.isArray(data)) return new Set();
  return new Set(data.map((r: { chave_acesso: string }) => r.chave_acesso));
}

/* ── BACKFILL — as notas ja' guardadas (documento com chave e arquivo) que ainda nao tem itens ─────────────────────────────────────── */
export interface CandidataDoBackfill { chave: string; numero: string | null; bucket: 'fin-documentos' | 'oc-documentos'; caminho: string; origem: 'lancamento' | 'oc' }

/** As candidatas do cliente: documentos vivos com chave e arquivo, nas duas tabelas, sem nota guardada; uma por chave (o XML antes do PDF). */
export async function candidatasDoBackfill(clienteId: string): Promise<CandidataDoBackfill[]> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- as tabelas novas ainda nao estao nos tipos gerados
  const db = supabase as any;
  const [fin, oc, ja] = await Promise.all([
    db.from('financeiro_lancamento_documentos').select('chave_acesso, numero, url').eq('cliente_id', clienteId).eq('cancelado', false).not('chave_acesso', 'is', null).not('url', 'is', null),
    db.from('zoo_operacao_documentos').select('chave_acesso, numero, url').eq('cliente_id', clienteId).eq('cancelado', false).not('chave_acesso', 'is', null).not('url', 'is', null),
    db.from('nota_fiscal').select('chave_acesso').eq('cliente_id', clienteId),
  ]);
  const guardadas = new Set<string>((ja.data ?? []).map((r: { chave_acesso: string }) => r.chave_acesso));
  const porChave = new Map<string, CandidataDoBackfill>();
  const juntar = (linhas: { chave_acesso: string | null; numero: string | null; url: string | null }[] | null, bucket: CandidataDoBackfill['bucket'], origem: CandidataDoBackfill['origem']) => {
    for (const l of linhas ?? []) {
      const chave = (l.chave_acesso ?? '').replace(/\D/g, '');
      if (!ehChaveDeNota(chave) || guardadas.has(chave) || !l.url) continue;
      const atual = porChave.get(chave);
      const ehXml = /\.xml$/i.test(l.url);
      if (!atual || (ehXml && !/\.xml$/i.test(atual.caminho))) porChave.set(chave, { chave, numero: l.numero, bucket, caminho: l.url, origem });
    }
  };
  juntar(fin.data, 'fin-documentos', 'lancamento');
  juntar(oc.data, 'oc-documentos', 'oc');
  return [...porChave.values()];
}

export async function baixarArquivo(bucket: string, caminho: string): Promise<ArrayBuffer | null> {
  const { data, error } = await supabase.storage.from(bucket).download(caminho);
  if (error || !data) return null;
  return data.arrayBuffer();
}

/** A operacao de trilha do backfill (o desfazer tira as notas dela). */
export async function abrirOperacaoDoBackfill(clienteId: string, resumo: Record<string, unknown>): Promise<string | null> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- idioma documentado: o `.rpc` do repo
  const { data, error } = await (supabase as any).rpc('fn_nota_fiscal_operacao_abrir', { p_cliente: clienteId, p_tipo: 'backfill', p_resumo: resumo });
  return error || typeof data !== 'string' ? null : data;
}
export async function desfazerOperacaoDoBackfill(operacao: string, motivo: string): Promise<string | null> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- idioma documentado: o `.rpc` do repo
  const { error } = await (supabase as any).rpc('fn_nota_fiscal_desfazer', { p_operacao: operacao, p_motivo: motivo, p_simular: false });
  return error ? (error.message ?? 'O desfazer não foi gravado.') : null;
}
