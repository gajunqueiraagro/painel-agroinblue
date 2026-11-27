/**
 * NOTA-RECEITA-DANFE-ANEXO-01 · o GESTO "DANFE das notas já guardadas" (Gabriel 19/11: todo XML sem PDF — Receita + importados — como gesto
 * com prévia). Roda na sessão de quem está logado (o XML mora no storage; o PDF se gera no navegador):
 *   · as CANDIDATAS: a NF guardada só em XML nos documentos de lançamento (viva, chave de 44) sem NENHUM PDF da mesma chave no cliente;
 *   · Simular: baixa cada XML e gera o DANFE (`danfePdfDoXml`), sem gravar — diz quantos saem e o tamanho;
 *   · Gerar e anexar: o PDF entra pela MESMA cadeia dos documentos (`gravarDocumentosPendentes`: registrar → subir → anexar) no
 *     lançamento do XML, com o payload do XML (número, série, chave, emissão, valor, emitente), e se LIGA aos mesmos lançamentos que o
 *     XML já liga (`fin_documento_vincular`, a parcela 8.702 nas 4). Nada muda em valor, data, status ou conciliação.
 * Os documentos da OC (`zoo_operacao_documentos`) ficam de fora desta fatia.
 */
import { supabase } from '@/integrations/supabase/client';
import { BUCKET_LANCAMENTO_DOCUMENTOS } from '@/hooks/useLancamentoDocumentos';
import { gravarDocumentosPendentes, novoPendente } from '@/lib/financeiro/documentosPendentes';
import { baixarArquivo } from '@/lib/financeiro/itensDaNotaBanco';
import { danfePdfDoXml } from '@/lib/fiscal/danfePdf';
import { lerNFe } from '@/lib/financeiro/nfe/lerNFe';

/* as tabelas fiscais novas ainda não estão nos tipos gerados (o mesmo idioma do `useNotasDaReceita`) */
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- idioma documentado: `(supabase as any)`
const db = () => supabase as any;

export interface DocDaNota {
  id: string; lancamento_id: string; chave_acesso: string | null; nome: string | null; tipo: string | null; url: string | null;
  especie: string | null; numero: string | null; serie: string | null; data_emissao: string | null; valor_documento: number | null;
  emitente_id: string | null; emitente_nome: string | null; emitente_documento: string | null;
}
export interface CandidataDoDanfe {
  doc: DocDaNota;
  /** a chave (só dígitos) */
  chave: string;
  /** os OUTROS lançamentos a que o XML já está ligado (o PDF vai junto) */
  ligados: string[];
}

const ehXml = (d: Pick<DocDaNota, 'nome' | 'tipo'>) => /\.xml$/i.test(d.nome ?? '') || /xml/i.test(d.tipo ?? '');
const ehPdf = (d: Pick<DocDaNota, 'nome' | 'tipo'>) => /\.pdf$/i.test(d.nome ?? '') || /pdf/i.test(d.tipo ?? '');

/** a regra (pura): a NF que só tem XML — nenhum PDF da mesma chave no cliente; uma candidata por chave (o 1º XML com arquivo) */
export function candidatasSemPdf(docs: readonly DocDaNota[], vinculos: readonly { documento_id: string; lancamento_id: string }[]): CandidataDoDanfe[] {
  const porChave = new Map<string, DocDaNota[]>();
  for (const d of docs) {
    const chave = (d.chave_acesso ?? '').replace(/\D/g, '');
    if (chave.length !== 44) continue;
    porChave.set(chave, [...(porChave.get(chave) ?? []), d]);
  }
  const saida: CandidataDoDanfe[] = [];
  for (const [chave, lista] of porChave) {
    if (lista.some(ehPdf)) continue;
    /* NOTA-ENTREGA-FUTURA-01 (Gabriel 25/11 09:26) — a NF que nasceu da Receita SEM arquivo (só o registro: o XML mora na caixa) também é
       candidata; o `danfeDaCandidata` lê o XML da caixa. A com arquivo vem primeiro */
    const xml = lista.find((d) => ehXml(d) && d.url) ?? lista.find((d) => !d.url && (ehXml(d) || d.especie === 'nf'));
    if (!xml) continue;
    const ligados = [...new Set(vinculos.filter((v) => v.documento_id === xml.id && v.lancamento_id !== xml.lancamento_id).map((v) => v.lancamento_id))];
    saida.push({ doc: xml, chave, ligados });
  }
  return saida.sort((a, b) => (a.doc.data_emissao ?? '').localeCompare(b.doc.data_emissao ?? '') || a.chave.localeCompare(b.chave));
}

/** as candidatas do cliente (os documentos vivos de lançamento com chave + as ligações dos XML) */
export async function candidatasDoDanfe(clienteId: string): Promise<{ ok: true; valor: CandidataDoDanfe[] } | { ok: false; motivo: string }> {
  const { data, error } = await supabase.from('financeiro_lancamento_documentos')
    .select('id, lancamento_id, chave_acesso, nome, tipo, url, especie, numero, serie, data_emissao, valor_documento, emitente_id, emitente_nome, emitente_documento')
    .eq('cliente_id', clienteId).eq('cancelado', false).not('chave_acesso', 'is', null);
  if (error) { console.error('[candidatasDoDanfe]', error); return { ok: false, motivo: 'Não consegui ler os documentos guardados.' }; }
  const docs: DocDaNota[] = (data ?? []).map((d) => ({ ...d, valor_documento: d.valor_documento == null ? null : Number(d.valor_documento) }));
  const ids = docs.filter(ehXml).map((d) => d.id);
  let vinculos: { documento_id: string; lancamento_id: string }[] = [];
  for (let i = 0; i < ids.length; i += 300) {
    const r = await supabase.from('financeiro_documento_vinculos').select('documento_id, lancamento_id').eq('cliente_id', clienteId).in('documento_id', ids.slice(i, i + 300));
    if (r.error) { console.error('[candidatasDoDanfe] vinculos', r.error); return { ok: false, motivo: 'Não consegui ler as ligações dos documentos.' }; }
    vinculos = vinculos.concat(r.data ?? []);
  }
  return { ok: true, valor: candidatasSemPdf(docs, vinculos) };
}

export type ResultadoDoDanfe = { ok: true; bytes: number } | { ok: false; frase: string };
/** a frase curta da Situação (cabe na coluna; o resto no title) */
export const FRASE_SEM_XML = 'sem XML guardado';

/** o XML da nota na caixa da Receita (`fiscal_dfe_recebidos`, RLS por cliente), quando a busca já o trouxe */
export async function xmlDaCaixaDaReceita(clienteId: string, chave: string): Promise<ArrayBuffer | null> {
  const { data, error } = await db().from('fiscal_dfe_recebidos').select('xml').eq('cliente_id', clienteId).eq('chave', chave).not('xml', 'is', null).maybeSingle();
  if (error) { console.error('[danfeDasNotasGuardadas] caixa', error); return null; }
  return typeof data?.xml === 'string' && data.xml ? new TextEncoder().encode(data.xml).buffer : null;
}

/** os produtores do cliente com certificado ativo e válido (quem pode consultar a nota pela chave) */
/**
 * NOTAS-RECEITA-BLOQUEIO-01 (Gabriel 27/11) — quando o produtor pode pedir de novo à Receita (`fiscal_dfe_controle.nao_antes_de`, o MESMO
 * relógio do portão do banco). Futuro = o botão mostra "próxima às HH:MM" e NÃO chama (antes chamava e o banco recusava). Falhou = null.
 */
export async function proximaBuscaDoTitular(titularId: string): Promise<string | null> {
  const { data, error } = await db().from('fiscal_dfe_controle').select('nao_antes_de').eq('titular_id', titularId).maybeSingle();
  if (error || !data) return null;
  const v = Reflect.get(data, 'nao_antes_de');
  return typeof v === 'string' && Date.parse(v) > Date.now() ? v : null;
}
/** "HH:MM" no fuso de quem olha */
export const horaCurta = (iso: string): string => { const d = new Date(iso); return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`; };

export async function titularesComCertificado(clienteId: string): Promise<string[]> {
  const { data, error } = await db().from('fiscal_certificados').select('titular_id, valido_ate').eq('cliente_id', clienteId).eq('situacao', 'ativo');
  if (error) { console.error('[danfeDasNotasGuardadas] certificados', error); return []; }
  const agora = new Date().toISOString();
  const ids: string[] = [];
  for (const c of Array.isArray(data) ? data : []) {
    const id = Reflect.get(c, 'titular_id'); const ate = Reflect.get(c, 'valido_ate');
    if (typeof id === 'string' && typeof ate === 'string' && ate > agora && !ids.includes(id)) ids.push(id);
  }
  return ids;
}

/** "Buscar na Receita": a consulta pela CHAVE (consChNFe) da `fiscal-dfe-buscar` — o XML completo cai na caixa da Receita.
 *  ⚠ A consulta pela chave faz a próxima busca automática desse produtor esperar 1 h (a regra da busca). */
export async function buscarNaReceitaPelaChave(titularId: string, chave: string): Promise<{ ok: boolean; frase: string }> {
  const { data, error } = await supabase.functions.invoke('fiscal-dfe-buscar', { body: { titular_id: titularId, ambiente: 'producao', chave } });
  if (error) { console.error('[buscarNaReceitaPelaChave]', error); return { ok: false, frase: 'A Receita não respondeu. Tente de novo mais tarde.' }; }
  const ok = data && typeof data === 'object' && Reflect.get(data, 'ok') === true;
  const frase = data && typeof data === 'object' && typeof Reflect.get(data, 'frase') === 'string' ? String(Reflect.get(data, 'frase')) : '';
  return { ok, frase: ok ? 'XML trazido da Receita.' : frase || 'A Receita não trouxe o XML desta nota.' };
}

/** gera o DANFE de UMA candidata; com `simular` = false grava e liga. Nunca lança: a falha volta como frase. */
export async function danfeDaCandidata(clienteId: string, c: CandidataDoDanfe, simular: boolean,
  gerar: (xml: File) => Promise<{ ok: true; pdf: File } | { ok: false; frase: string }> = danfePdfDoXml): Promise<ResultadoDoDanfe> {
  /* o XML: o arquivo guardado; sem ele, o da caixa da Receita (a busca/consulta pela chave já o trouxe); sem os dois: "sem XML guardado"
     (a linha oferece "Buscar na Receita") */
  const guardado = c.doc.url ? await baixarArquivo(BUCKET_LANCAMENTO_DOCUMENTOS, c.doc.url) : null;
  const bytes = guardado ?? await xmlDaCaixaDaReceita(clienteId, c.chave);
  if (!bytes) return { ok: false, frase: FRASE_SEM_XML };
  const nomeXml = /\.xml$/i.test(c.doc.nome ?? '') ? (c.doc.nome ?? 'nota.xml') : `NFe${c.chave}.xml`;
  const g = await gerar(new File([bytes], nomeXml, { type: 'application/xml' }));
  if (g.ok === false) return { ok: false, frase: g.frase };
  if (simular) return { ok: true, bytes: g.pdf.size };
  const [r] = await gravarDocumentosPendentes(clienteId, c.doc.lancamento_id, [novoPendente({
    especie: 'nf', nome: `${c.doc.nome?.replace(/\.xml$/i, '') || `nf ${c.doc.numero ?? ''}`.trim()} (DANFE)`, numero: c.doc.numero, serie: c.doc.serie,
    chaveAcesso: c.doc.chave_acesso, dataEmissao: c.doc.data_emissao, valorDocumento: c.doc.valor_documento, emitenteId: c.doc.emitente_id,
    emitenteNome: c.doc.emitente_id ? null : c.doc.emitente_nome, emitenteDocumento: c.doc.emitente_id ? null : c.doc.emitente_documento,
  }, g.pdf, null)]);
  if (!r?.gravado || !r.documentoId) return { ok: false, frase: r?.erro ?? 'o PDF não foi gravado' };
  if (c.ligados.length) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- idioma documentado: o `.rpc` do repo
    const { error } = await (supabase as any).rpc('fin_documento_vincular', { p_documento: r.documentoId, p_cliente: clienteId, p_lancamentos: c.ligados });
    if (error) { console.error('[danfeDaCandidata] vincular', error); return { ok: false, frase: 'o PDF foi anexado, mas não foi ligado às outras parcelas' }; }
  }
  return { ok: true, bytes: g.pdf.size };
}

/**
 * NOTA-ENTREGA-FUTURA-01 (Gabriel 25/11 09:26: a NF 30.150 da compra "sem arquivo") — "Ligar o XML da Receita": o documento NF que nasceu da
 * Receita só com o registro recebe o ARQUIVO do XML que já está na caixa (a chave do XML confere com a do documento: senão nada se grava), pela
 * MESMA porta de sempre (`anexar` do documento), e o DANFE gerado dele (`danfeDaCandidata`, ligado aos mesmos lançamentos), se ainda não há
 * PDF dessa chave. Nada muda em valor, data, status ou conciliação. Nunca lança: a falha volta como frase.
 */
export async function ligarXmlDaReceitaAoDocumento(clienteId: string, documentoId: string, chave: string, temPdf: boolean,
  anexarXml: (arquivo: File) => Promise<boolean>,
  g: { daCaixa?: typeof xmlDaCaixaDaReceita; danfe?: typeof danfeDaCandidata; lerChave?: (xml: ArrayBuffer) => string | null } = {}): Promise<{ ok: boolean; frase: string }> {
  const daCaixa = g.daCaixa ?? xmlDaCaixaDaReceita;
  const danfe = g.danfe ?? danfeDaCandidata;
  const lerChave = g.lerChave ?? ((xml: ArrayBuffer) => { const r = lerNFe(xml); return r.ok ? r.nota.chave.replace(/\D/g, '') : null; });
  const ch = chave.replace(/\D/g, '');
  const xml = await daCaixa(clienteId, ch);
  if (!xml) return { ok: false, frase: 'O XML desta nota não está na caixa da Receita.' };
  if (lerChave(xml) !== ch) return { ok: false, frase: 'O XML da caixa é de outra nota (a chave não confere). Nada foi gravado.' };
  let anexou = false;
  try { anexou = await anexarXml(new File([xml], `NFe${ch}.xml`, { type: 'application/xml' })); } catch (e) { console.error('[ligarXmlDaReceita] anexar', e); }
  if (!anexou) return { ok: false, frase: 'Não consegui anexar o XML ao documento.' };
  if (temPdf) return { ok: true, frase: 'XML ligado ao documento.' };
  const d = await supabase.from('financeiro_lancamento_documentos')
    .select('id, lancamento_id, chave_acesso, nome, tipo, url, especie, numero, serie, data_emissao, valor_documento, emitente_id, emitente_nome, emitente_documento')
    .eq('cliente_id', clienteId).eq('id', documentoId).maybeSingle();
  if (d.error || !d.data) return { ok: false, frase: 'XML ligado; o DANFE não foi gerado (não li o documento). Use "DANFE das notas já guardadas".' };
  const doc: DocDaNota = { ...d.data, url: null, valor_documento: d.data.valor_documento == null ? null : Number(d.data.valor_documento) };
  const v = await supabase.from('financeiro_documento_vinculos').select('lancamento_id').eq('cliente_id', clienteId).eq('documento_id', documentoId);
  const ligados = [...new Set((v.data ?? []).map((x) => x.lancamento_id).filter((x): x is string => typeof x === 'string' && x !== doc.lancamento_id))];
  const r = await danfe(clienteId, { doc, chave: ch, ligados }, false);
  return r.ok === false ? { ok: false, frase: `XML ligado; o DANFE não saiu (${r.frase}).` } : { ok: true, frase: 'XML ligado e DANFE gerado.' };
}
