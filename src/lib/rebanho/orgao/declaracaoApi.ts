/**
 * REBANHO-ORGAO-01 (F3) — a API da tela "Declaração ao órgão": só as RPCs da F1 (118510) e o bucket privado da pecuária. Injetável (a
 * tela recebe `api`; a bancada e os testes passam uma em memória). Nada aqui decide regra: as recusas vêm prontas do banco (P0001) e o
 * "sem acesso" (42501) vira frase; o resto vira a frase genérica e o erro vai ao console.
 * ⚠ O PDF do órgão vai para `pec-documentos/<cliente>/orgao/<etapa>/<fazenda>/…` (a política do bucket filtra pela 1ª pasta = cliente;
 *   o banco recusa caminho fora de `<cliente>/orgao/`).
 */
import { supabase } from '@/integrations/supabase/client';

export type Resultado<T> = { ok: true; dados: T; erro?: undefined } | { ok: false; erro: string; dados?: undefined };
export const BUCKET_DO_ORGAO = 'pec-documentos';

export interface DeclaracaoGravada {
  id: string; fazendaId: string; etapaId: string; status: 'rascunho' | 'declarada';
  saldo: unknown; saldoArquivo: string | null; extrato: unknown; extratoArquivo: string | null; editados: unknown;
  declaradaEm: string | null; versao: number;
  /** F3 v3: a conta congelada ao marcar como declarado (`propostaCongelada` lê) e o comprovante da declaração (PDF no bucket) */
  proposta: unknown; comprovanteArquivo: string | null;
}
/** F3 v3: TODA fazenda não administrativa entra (a sem gado aparece no seletor como "sem rebanho"); `temPecuaria` é a marca do cadastro. */
export interface FazendaDoCliente { id: string; nome: string; uf: string | null; temPecuaria: boolean }
export interface DeclaracaoApi {
  etapas: () => Promise<Resultado<unknown>>;
  /** as fazendas do cliente (menos a administrativa) e a UF do cadastro (DX6: sem UF = fora, a tela diz) */
  fazendas: (clienteId: string) => Promise<Resultado<FazendaDoCliente[]>>;
  /** as declarações do cliente nesta etapa e a última marcada como declarada (a data, 'AAAA-MM-DD') */
  declaracoes: (clienteId: string, etapaId: string) => Promise<Resultado<{ desta: DeclaracaoGravada[]; ultimaDeclarada: string | null }>>;
  fatos: (clienteId: string, desde: string, ate: string) => Promise<Resultado<unknown>>;
  gravar: (fazendaId: string, etapaId: string, campos: Record<string, unknown>, versao: number | null) => Promise<Resultado<{ id: string; versao: number }>>;
  declarar: (id: string, proposta: Record<string, unknown>, comprovante: string | null, versao: number) => Promise<Resultado<{ versao: number }>>;
  desfazer: (id: string, motivo: string) => Promise<Resultado<true>>;
  /** a prévia (`simular`) e a gravação do nº das eGTAs casadas */
  egtas: (clienteId: string, itens: Record<string, unknown>[], simular: boolean) => Promise<Resultado<{ grava: number; jaEstava: number; recusa: string[] }>>;
  subirPdf: (caminho: string, arquivo: File) => Promise<Resultado<true>>;
  /** F3 v3: o endereço assinado (5 min) para abrir o comprovante guardado */
  urlDoArquivo: (caminho: string) => Promise<Resultado<string>>;
}

const ehObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const txt = (v: unknown): string | null => (typeof v === 'string' && v !== '' ? v : null);
const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);

export function fraseDoErroDoOrgao(e: unknown): string {
  const r = ehObj(e) ? e : {};
  if (r.code === 'P0001' && typeof r.message === 'string') return r.message;
  if (r.code === '42501') return 'Sem acesso a este cliente.';
  if (r.code === '40001') return 'Outra pessoa mudou esta declaração: abra de novo. Nada foi gravado.';
  console.error('[declaração ao órgão]', e);
  return 'Não consegui falar com o banco. Tente de novo.';
}

export function declaracaoDaLinha(r: unknown): DeclaracaoGravada | null {
  if (!ehObj(r)) return null;
  const id = txt(r.id); const fazendaId = txt(r.fazenda_id); const etapaId = txt(r.etapa_id); const versao = num(r.versao);
  const status = r.status === 'declarada' ? 'declarada' : r.status === 'rascunho' ? 'rascunho' : null;
  if (!id || !fazendaId || !etapaId || versao === null || !status) return null;
  return { id, fazendaId, etapaId, status, saldo: r.saldo, saldoArquivo: txt(r.saldo_arquivo), extrato: r.extrato, extratoArquivo: txt(r.extrato_arquivo),
    editados: r.editados, declaradaEm: txt(r.declarada_em), versao, proposta: r.proposta ?? null, comprovanteArquivo: txt(r.comprovante_arquivo) };
}

export const declaracaoApiDoBanco: DeclaracaoApi = {
  async fazendas(clienteId) {
    const { data, error } = await (supabase as any).from('fazendas').select('id, nome, tem_pecuaria, eh_administrativa, fazenda_cadastros(estado)')
      .eq('cliente_id', clienteId);
    if (error) return { ok: false, erro: fraseDoErroDoOrgao(error) };
    const linhas: unknown[] = Array.isArray(data) ? data : [];
    return { ok: true, dados: linhas.flatMap((r) => {
      if (!ehObj(r) || r.eh_administrativa === true) return [];
      const id = txt(r.id); const nome = txt(r.nome);
      const cad = Array.isArray(r.fazenda_cadastros) ? r.fazenda_cadastros[0] : r.fazenda_cadastros;
      const uf = ehObj(cad) ? txt(typeof cad.estado === 'string' ? cad.estado.trim().toUpperCase() : null) : null;
      return id && nome ? [{ id, nome, uf, temPecuaria: r.tem_pecuaria === true }] : [];
    }).sort((a, b) => a.nome.localeCompare(b.nome)) };
  },
  async etapas() {
    const { data, error } = await (supabase as any).from('orgao_etapas').select('id, uf, orgao, tipo, inicio, fim, prorrogado_ate, ativo');
    return error ? { ok: false, erro: fraseDoErroDoOrgao(error) } : { ok: true, dados: data };
  },
  async declaracoes(clienteId, etapaId) {
    const [desta, ultima] = await Promise.all([
      (supabase as any).from('rebanho_declaracoes')
        .select('id, fazenda_id, etapa_id, status, saldo, saldo_arquivo, extrato, extrato_arquivo, editados, proposta, comprovante_arquivo, declarada_em, versao')
        .eq('cliente_id', clienteId).eq('etapa_id', etapaId),
      (supabase as any).from('rebanho_declaracoes').select('declarada_em').eq('cliente_id', clienteId).eq('status', 'declarada')
        .neq('etapa_id', etapaId).order('declarada_em', { ascending: false }).limit(1),
    ]);
    if (desta.error) return { ok: false, erro: fraseDoErroDoOrgao(desta.error) };
    if (ultima.error) return { ok: false, erro: fraseDoErroDoOrgao(ultima.error) };
    const linhas: unknown[] = Array.isArray(desta.data) ? desta.data : [];
    const u: unknown[] = Array.isArray(ultima.data) ? ultima.data : [];
    const em = ehObj(u[0]) ? txt(u[0].declarada_em) : null;
    return { ok: true, dados: { desta: linhas.flatMap((l) => { const d = declaracaoDaLinha(l); return d ? [d] : []; }), ultimaDeclarada: em ? em.slice(0, 10) : null } };
  },
  async fatos(clienteId, desde, ate) {
    const { data, error } = await (supabase as any).rpc('fn_rebanho_orgao_fatos', { p_cliente_id: clienteId, p_desde: desde, p_ate: ate });
    return error ? { ok: false, erro: fraseDoErroDoOrgao(error) } : { ok: true, dados: data };
  },
  async gravar(fazendaId, etapaId, campos, versao) {
    const { data, error } = await (supabase as any).rpc('fn_rebanho_declaracao_gravar',
      { p_fazenda_id: fazendaId, p_etapa_id: etapaId, p_campos: campos, p_versao: versao, p_simular: false });
    if (error) return { ok: false, erro: fraseDoErroDoOrgao(error) };
    const id = ehObj(data) ? txt(data.id) : null; const v = ehObj(data) ? num(data.versao) : null;
    return id && v !== null ? { ok: true, dados: { id, versao: v } } : { ok: false, erro: 'O banco não devolveu a declaração.' };
  },
  async declarar(id, proposta, comprovante, versao) {
    const { data, error } = await (supabase as any).rpc('fn_rebanho_declaracao_declarar',
      { p_id: id, p_proposta: proposta, p_comprovante_arquivo: comprovante, p_versao: versao, p_simular: false });
    if (error) return { ok: false, erro: fraseDoErroDoOrgao(error) };
    const v = ehObj(data) ? num(data.versao) : null;
    return v !== null ? { ok: true, dados: { versao: v } } : { ok: false, erro: 'O banco não devolveu a versão.' };
  },
  async desfazer(id, motivo) {
    const { error } = await (supabase as any).rpc('fn_rebanho_declaracao_desfazer', { p_id: id, p_motivo: motivo, p_simular: false });
    return error ? { ok: false, erro: fraseDoErroDoOrgao(error) } : { ok: true, dados: true };
  },
  async egtas(clienteId, itens, simular) {
    const { data, error } = await (supabase as any).rpc('fn_egta_gravar_numero', { p_cliente_id: clienteId, p_itens: itens, p_simular: simular });
    if (error) return { ok: false, erro: fraseDoErroDoOrgao(error) };
    const n = (k: string) => (ehObj(data) && Array.isArray(data[k]) ? data[k] : []);
    return { ok: true, dados: { grava: n('grava').length, jaEstava: n('ja_estava').length,
      recusa: n('recusa').flatMap((r: unknown) => (ehObj(r) ? [`${txt(r.numero) ?? '—'}: ${txt(r.frase) ?? ''}`] : [])) } };
  },
  async subirPdf(caminho, arquivo) {
    const { error } = await supabase.storage.from(BUCKET_DO_ORGAO).upload(caminho, arquivo, { upsert: true, contentType: 'application/pdf' });
    if (error) { console.error('[declaração ao órgão] upload', error); return { ok: false, erro: 'O PDF não subiu: nada foi gravado.' }; }
    return { ok: true, dados: true };
  },
  async urlDoArquivo(caminho) {
    const { data, error } = await supabase.storage.from(BUCKET_DO_ORGAO).createSignedUrl(caminho, 300);
    if (error || !data?.signedUrl) { console.error('[declaração ao órgão] url', error); return { ok: false, erro: 'Não consegui abrir o comprovante.' }; }
    return { ok: true, dados: data.signedUrl };
  },
};
