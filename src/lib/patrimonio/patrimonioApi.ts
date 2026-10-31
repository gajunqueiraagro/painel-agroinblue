/**
 * PATR-01 · PR B — a API da tela de Patrimônio: TODA leitura e escrita passa por aqui, pelas RPCs do PR A (116060).
 *
 * ⚠ INJETÁVEL (o molde do `DocumentosApi` da OC): a tela recebe a API por contexto (`PatrimonioApiProvider`); o padrão é a do banco
 * (`apiDoBanco`). A bancada sintética dos prints passa uma API em memória — a tela não sabe a diferença.
 * ⚠ ESCRITA SÓ PELAS `fn_patrimonio_*` (as tabelas não aceitam INSERT/UPDATE do `authenticated`). Leitura direta só onde a RPC não
 * cobre e a RLS por tenant protege: categorias, pastos do bem, avaliações, documentos e os campos do lançamento (pgto, NF).
 * ⚠ `(supabase as any)`: as tabelas e RPCs novas nasceram depois do `types.ts` (a única exceção do zero-cast).
 * ⚠ ERRO: a frase pronta do banco (P0001) vai ao operador; o resto vira frase genérica (`fraseDoErro`).
 */
import { supabase } from '@/integrations/supabase/client';
import { fraseDoErro, type BemDaLista, type CategoriaBem, type SituacaoBem, type AtividadeBem, type OrigemValor } from './patrimonio';

/* ⚠ `erro` e `dados` existem nos DOIS ramos: o `tsconfig.app.json` (sem strict) não estreita a união pelo `ok`. */
export type Resultado<T> = { ok: true; dados: T; erro?: undefined } | { ok: false; erro: string; dados?: undefined };
type Linha = Record<string, unknown>;

/* ── leitores de linha (sem cast: o que não é do tipo vira nulo) ─────────────────────────────────────────────────────────── */
const txt = (v: unknown): string | null => (typeof v === 'string' ? v : null);
const num = (v: unknown): number => (typeof v === 'number' ? v : typeof v === 'string' && v.trim() !== '' && !Number.isNaN(Number(v)) ? Number(v) : 0);
const numOuNulo = (v: unknown): number | null => (v == null || v === '' ? null : num(v));
const bool = (v: unknown): boolean => v === true;
const ehLinha = (v: unknown): v is Linha => typeof v === 'object' && v !== null && !Array.isArray(v);
const linhas = (v: unknown): Linha[] => (Array.isArray(v) ? v.filter(ehLinha) : []);
const SITUACOES: readonly SituacaoBem[] = ['em_formacao', 'em_uso', 'baixado'];
const ATIVIDADES: readonly AtividadeBem[] = ['pecuaria', 'lavoura', 'compartilhado'];
const ORIGENS: readonly OrigemValor[] = ['lancamentos', 'sem_lancamento', 'estimativa'];
const situacao = (v: unknown): SituacaoBem => SITUACOES.find(s => s === v) ?? 'em_formacao';
const atividade = (v: unknown): AtividadeBem => ATIVIDADES.find(s => s === v) ?? 'pecuaria';
const origem = (v: unknown): OrigemValor => ORIGENS.find(s => s === v) ?? 'lancamentos';

export function bemDaLinha(r: Linha): BemDaLista {
  return {
    bem_id: String(r.bem_id), fazenda_id: String(r.fazenda_id), fazenda_codigo: txt(r.fazenda_codigo),
    categoria_id: String(r.categoria_id), categoria_codigo: txt(r.categoria_codigo) ?? '', categoria_nome: txt(r.categoria_nome) ?? '',
    deprecia: bool(r.deprecia), tem_mercado: bool(r.tem_mercado), tem_pastos: bool(r.tem_pastos),
    descricao: txt(r.descricao) ?? '', marca: txt(r.marca), modelo: txt(r.modelo), identificacao: txt(r.identificacao),
    situacao: situacao(r.situacao), em_uso_desde: txt(r.em_uso_desde), baixado_em: txt(r.baixado_em), atividade: atividade(r.atividade),
    origem_valor: origem(r.origem_valor), valor_extra: num(r.valor_extra), valor_lancamentos: num(r.valor_lancamentos),
    aquisicao: num(r.aquisicao), a_realizar: num(r.a_realizar), n_lancamentos: num(r.n_lancamentos), n_a_realizar: num(r.n_a_realizar),
    n_a_conferir: num(r.n_a_conferir), n_selo: num(r.n_selo), n_repetidas: num(r.n_repetidas), primeira_data: txt(r.primeira_data),
    vida_util_meses: numOuNulo(r.vida_util_meses), residual_pct: numOuNulo(r.residual_pct),
    depreciacao_acumulada: num(r.depreciacao_acumulada), depreciacao_no_ano: num(r.depreciacao_no_ano), valor_contabil: num(r.valor_contabil),
    mercado_valor: numOuNulo(r.mercado_valor), mercado_data: txt(r.mercado_data), mercado_base: txt(r.mercado_base),
    area_pastos_ha: numOuNulo(r.area_pastos_ha), versao: num(r.versao),
  };
}

/* ── os tipos do modal ─────────────────────────────────────────────────────────────────────────────────────────────────────── */

/** O cadastro do bem como o formulário edita (o `p_bem` da `fn_patrimonio_bem_salvar`). */
export interface FormBem {
  id: string | null; versao: number | null; cliente_id: string; fazenda_id: string; categoria_id: string; descricao: string;
  marca: string; modelo: string; ano_fabricacao: number | null; identificacao: string; observacao: string;
  situacao: SituacaoBem; em_uso_desde: string; atividade: AtividadeBem; financiamento_id: string | null;
  origem_valor: OrigemValor; valor_sem_lancamento: number | null; estimativa_rs_ha: number | null; estimativa_area_ha: number | null;
  area_ha: number | null; matricula: string; nirf: string; seguradora: string; apolice: string; seguro_vence_em: string;
  vida_util_meses: number | null; residual_pct: number | null;
}

/** Um lançamento ligado (a `fn_patrimonio_bem_lancamentos` + pagamento e NF lidos do lançamento). */
export interface LancamentoDoBem {
  vinculo_id: string; lancamento_id: string; parte_ordem: number; partes_total: number | null; estado: 'soma' | 'a_realizar' | 'a_conferir';
  motivo: string | null; selo: string | null; valor: number | null; data: string | null; data_pagamento: string | null;
  numero_documento: string | null; status_transacao: string | null; descricao: string | null; fornecedor: string | null;
  subcentro: string | null; fazenda_id: string | null; repetida: boolean; de_contrato: boolean;
}

export interface PastoDoCadastro { id: string; nome: string; fazenda_id: string; area_produtiva_ha: number | null; ativo: boolean }
export interface PastoLigado { pasto_id: string; area_ha: number }
export interface MesDaSerie { periodo: string; base: number; quota: number; acumulada: number; contabil: number; vida_util_meses: number | null; residual_pct: number | null }
export interface Avaliacao { id: string; data: string; fonte: string; base: string; valor_ha: number | null; area_ha: number | null; valor_total: number }
export interface DocumentoBem { id: string; especie: string; nome: string; storage_path: string | null; tamanho_bytes: number | null; criado_em: string }
export interface ItemSemBem {
  lancamento_id: string; parte_ordem: number; data: string | null; valor: number; descricao: string | null; fornecedor: string | null;
  subcentro: string | null; fazenda_codigo: string | null; repetida: boolean; de_contrato: boolean; a_realizar: boolean;
}
export interface PreviaLigar {
  ok: boolean; soma: number; n_ligar: number; n_recusas: number; n_repetidas: number;
  itens: Array<{ lancamento_id: string; parte_ordem: number; situacao: string; motivo: string | null; repetida: boolean; valor: number | null; descricao: string | null }>;
  contratos: Array<{ financiamento_id: string; descricao: string | null; n_parcelas: number; n_faltam: number; valor_total: number;
    faltam: Array<{ lancamento_id: string; parte_ordem: number }> }>;
}
export type ItemDoVinculo = { lancamento_id: string; parte_ordem: number };

export interface PatrimonioApi {
  categorias(): Promise<CategoriaBem[]>;
  lista(clienteId: string, fazendaId: string | null, posicao: string): Promise<Resultado<BemDaLista[]>>;
  semBemResumo(clienteId: string): Promise<{ n: number; valor: number } | null>;
  itensSemBem(clienteId: string): Promise<ItemSemBem[]>;
  lancamentosDoBem(bemId: string, clienteId: string): Promise<LancamentoDoBem[]>;
  pastosDaFazenda(fazendaId: string): Promise<PastoDoCadastro[]>;
  pastosDoBem(bemId: string): Promise<PastoLigado[]>;
  serie(clienteId: string, bemId: string, ate: string): Promise<MesDaSerie[]>;
  avaliacoes(bemId: string): Promise<Avaliacao[]>;
  documentos(bemId: string): Promise<DocumentoBem[]>;
  cadastroDoBem(bemId: string): Promise<FormBem | null>;
  salvarBem(form: FormBem, simular: boolean, motivo: string | null): Promise<Resultado<Linha>>;
  mudarParametros(bemId: string, vigenteDesde: string, vidaMeses: number, residual: number, motivo: string, simular: boolean): Promise<Resultado<Linha>>;
  ligar(bemId: string, itens: ItemDoVinculo[], confirmarRepetidas: boolean, simular: boolean): Promise<Resultado<PreviaLigar>>;
  desligar(bemId: string, itens: ItemDoVinculo[], motivo: string): Promise<Resultado<Linha>>;
  salvarPastos(bemId: string, pastos: PastoLigado[], simular: boolean): Promise<Resultado<Linha>>;
  salvarAvaliacao(bemId: string, a: { data: string; fonte: string; base: string | null; valor_ha: number | null; area_ha: number | null; valor_total: number | null }): Promise<Resultado<Linha>>;
  cancelarAvaliacao(id: string, motivo: string): Promise<Resultado<Linha>>;
  enviarDocumento(bemId: string, arquivo: File, especie: string): Promise<string | null>;
  removerDocumento(id: string, motivo: string): Promise<Resultado<Linha>>;
  urlDoDocumento(caminho: string): Promise<string | null>;
}

/* ── a API do banco ────────────────────────────────────────────────────────────────────────────────────────────────────────── */

export const BUCKET_DO_PATRIMONIO = 'fin-documentos';

async function rpc(nome: string, args: Record<string, unknown>): Promise<Resultado<unknown>> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- tabelas/RPCs novas fora do `types.ts` (a exceção do zero-cast)
  const { data, error } = await (supabase as any).rpc(nome, args);
  if (error) return { ok: false, erro: fraseDoErro(error) };
  return { ok: true, dados: data };
}
const comoLinha = (r: Resultado<unknown>): Resultado<Linha> => (r.ok ? { ok: true, dados: ehLinha(r.dados) ? r.dados : {} } : { ok: false, erro: r.erro ?? 'Não consegui gravar. Tente de novo.' });
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- idem
const tabela = (nome: string) => (supabase as any).from(nome);

const vazioOuNulo = (s: string) => (s.trim() === '' ? null : s.trim());

export function payloadDoBem(f: FormBem): Record<string, unknown> {
  return {
    id: f.id, versao: f.versao, cliente_id: f.cliente_id, fazenda_id: f.fazenda_id, categoria_id: f.categoria_id, descricao: f.descricao,
    marca: vazioOuNulo(f.marca), modelo: vazioOuNulo(f.modelo), ano_fabricacao: f.ano_fabricacao, identificacao: vazioOuNulo(f.identificacao),
    observacao: vazioOuNulo(f.observacao), situacao: f.situacao, em_uso_desde: f.situacao === 'em_uso' ? vazioOuNulo(f.em_uso_desde) : null,
    atividade: f.atividade, financiamento_id: f.financiamento_id, origem_valor: f.origem_valor, valor_sem_lancamento: f.valor_sem_lancamento,
    estimativa_rs_ha: f.estimativa_rs_ha, estimativa_area_ha: f.estimativa_area_ha, area_ha: f.area_ha, matricula: vazioOuNulo(f.matricula),
    nirf: vazioOuNulo(f.nirf), seguradora: vazioOuNulo(f.seguradora), apolice: vazioOuNulo(f.apolice),
    seguro_vence_em: vazioOuNulo(f.seguro_vence_em), vida_util_meses: f.vida_util_meses, residual_pct: f.residual_pct,
  };
}

export const apiDoBanco: PatrimonioApi = {
  async categorias() {
    const { data, error } = await tabela('patrimonio_categorias').select('*').eq('ativo', true).order('ordem');
    if (error) { console.error('[patrimonio]', error); return []; }
    return linhas(data).map(r => ({
      id: String(r.id), cliente_id: txt(r.cliente_id), codigo: txt(r.codigo) ?? '', nome: txt(r.nome) ?? '',
      vida_util_anos: numOuNulo(r.vida_util_anos), residual_pct: num(r.residual_pct), deprecia: bool(r.deprecia),
      tem_mercado: bool(r.tem_mercado), base_mercado: r.base_mercado === 'terra' ? 'terra' : r.base_mercado === 'bem' ? 'bem' : null,
      tem_pastos: bool(r.tem_pastos), ordem: num(r.ordem), ativo: bool(r.ativo),
    }));
  },
  async lista(clienteId, fazendaId, posicao) {
    const r = await rpc('fn_patrimonio_lista', { p_cliente: clienteId, p_fazenda: fazendaId, p_posicao: posicao });
    return r.ok ? { ok: true, dados: linhas(r.dados).map(bemDaLinha) } : { ok: false, erro: r.erro ?? 'Não consegui ler o patrimônio.' };
  },
  async semBemResumo(clienteId) {
    const r = await rpc('fn_investimentos_sem_bem', { p_cliente: clienteId, p_fazenda: null, p_corte_individual: 20000 });
    if (!r.ok || !ehLinha(r.dados) || !ehLinha(r.dados.total)) return null;
    return { n: num(r.dados.total.n), valor: num(r.dados.total.valor) };
  },
  async itensSemBem(clienteId) {
    const r = await rpc('fn_investimentos_sem_bem', { p_cliente: clienteId, p_fazenda: null, p_corte_individual: 20000 });
    if (!r.ok || !ehLinha(r.dados)) return [];
    const doGrupo: Linha[] = linhas(r.dados.grupos).flatMap(g => linhas(g.itens).map((i): Linha => ({ ...i, subcentro: g.subcentro, fazenda_codigo: g.fazenda_codigo })));
    const todos: Linha[] = [...doGrupo, ...linhas(r.dados.individuais)];
    return todos.map(i => ({
      lancamento_id: String(i.lancamento_id), parte_ordem: num(i.parte_ordem) || 1, data: txt(i.data), valor: num(i.valor),
      descricao: txt(i.descricao), fornecedor: txt(i.fornecedor), subcentro: txt(i.subcentro), fazenda_codigo: txt(i.fazenda_codigo),
      repetida: bool(i.repetida), de_contrato: bool(i.de_contrato), a_realizar: bool(i.a_realizar),
    }));
  },
  async lancamentosDoBem(bemId, clienteId) {
    const r = await rpc('fn_patrimonio_bem_lancamentos', { p_bem: bemId });
    if (!r.ok) return [];
    const ls = linhas(r.dados);
    const ids = [...new Set(ls.map(l => String(l.lancamento_id)))];
    const extra = new Map<string, Linha>();
    if (ids.length) {
      const { data } = await tabela('financeiro_lancamentos_v2').select('id, data_pagamento, numero_documento').eq('cliente_id', clienteId).in('id', ids);
      for (const x of linhas(data)) extra.set(String(x.id), x);
    }
    return ls.map(l => {
      const e = extra.get(String(l.lancamento_id));
      const est = l.estado === 'soma' || l.estado === 'a_realizar' ? l.estado : 'a_conferir';
      return {
        vinculo_id: String(l.vinculo_id), lancamento_id: String(l.lancamento_id), parte_ordem: num(l.parte_ordem) || 1,
        partes_total: numOuNulo(l.partes_total), estado: est, motivo: txt(l.motivo), selo: txt(l.selo), valor: numOuNulo(l.valor),
        data: txt(l.data), data_pagamento: e ? txt(e.data_pagamento) : null, numero_documento: e ? txt(e.numero_documento) : null,
        status_transacao: txt(l.status_transacao), descricao: txt(l.descricao), fornecedor: txt(l.fornecedor), subcentro: txt(l.subcentro),
        fazenda_id: txt(l.fazenda_id), repetida: bool(l.repetida), de_contrato: bool(l.de_contrato),
      };
    });
  },
  async pastosDaFazenda(fazendaId) {
    const { data, error } = await tabela('pastos').select('id, nome, fazenda_id, area_produtiva_ha, ativo').eq('fazenda_id', fazendaId).order('nome');
    if (error) { console.error('[patrimonio]', error); return []; }
    return linhas(data).map(p => ({ id: String(p.id), nome: txt(p.nome) ?? '', fazenda_id: String(p.fazenda_id), area_produtiva_ha: numOuNulo(p.area_produtiva_ha), ativo: bool(p.ativo) }));
  },
  async pastosDoBem(bemId) {
    const { data, error } = await tabela('patrimonio_bem_pastos').select('pasto_id, area_ha').eq('bem_id', bemId).is('desligado_em', null);
    if (error) { console.error('[patrimonio]', error); return []; }
    return linhas(data).map(p => ({ pasto_id: String(p.pasto_id), area_ha: num(p.area_ha) }));
  },
  async serie(clienteId, bemId, ate) {
    const r = await rpc('fn_patrimonio_depreciacao', { p_cliente: clienteId, p_bem: bemId, p_ate: ate, p_agrupar: 'mes' });
    if (!r.ok) return [];
    return linhas(r.dados).map(m => ({ periodo: txt(m.periodo) ?? '', base: num(m.base), quota: num(m.quota), acumulada: num(m.acumulada),
      contabil: num(m.contabil), vida_util_meses: numOuNulo(m.vida_util_meses), residual_pct: numOuNulo(m.residual_pct) }));
  },
  async avaliacoes(bemId) {
    const { data, error } = await tabela('patrimonio_avaliacoes').select('id, data, fonte, base, valor_ha, area_ha, valor_total')
      .eq('bem_id', bemId).is('cancelado_em', null).order('data', { ascending: false });
    if (error) { console.error('[patrimonio]', error); return []; }
    return linhas(data).map(a => ({ id: String(a.id), data: txt(a.data) ?? '', fonte: txt(a.fonte) ?? '', base: txt(a.base) ?? '',
      valor_ha: numOuNulo(a.valor_ha), area_ha: numOuNulo(a.area_ha), valor_total: num(a.valor_total) }));
  },
  async documentos(bemId) {
    const { data, error } = await tabela('patrimonio_bem_documentos').select('id, especie, nome, storage_path, tamanho_bytes, criado_em')
      .eq('bem_id', bemId).is('cancelado_em', null).order('criado_em', { ascending: false });
    if (error) { console.error('[patrimonio]', error); return []; }
    return linhas(data).map(d => ({ id: String(d.id), especie: txt(d.especie) ?? 'outro', nome: txt(d.nome) ?? '', storage_path: txt(d.storage_path),
      tamanho_bytes: numOuNulo(d.tamanho_bytes), criado_em: txt(d.criado_em) ?? '' }));
  },
  async cadastroDoBem(bemId) {
    const { data, error } = await tabela('patrimonio_bens').select('*').eq('id', bemId).maybeSingle();
    if (error || !ehLinha(data)) { if (error) console.error('[patrimonio]', error); return null; }
    const { data: ps } = await tabela('patrimonio_bem_parametros').select('vigente_desde, vida_util_meses, residual_pct').eq('bem_id', bemId)
      .order('vigente_desde', { ascending: false }).limit(1);
    const p = linhas(ps)[0];
    const b = data;
    return {
      id: String(b.id), versao: num(b.versao), cliente_id: String(b.cliente_id), fazenda_id: String(b.fazenda_id), categoria_id: String(b.categoria_id),
      descricao: txt(b.descricao) ?? '', marca: txt(b.marca) ?? '', modelo: txt(b.modelo) ?? '', ano_fabricacao: numOuNulo(b.ano_fabricacao),
      identificacao: txt(b.identificacao) ?? '', observacao: txt(b.observacao) ?? '', situacao: situacao(b.situacao),
      em_uso_desde: txt(b.em_uso_desde) ?? '', atividade: atividade(b.atividade), financiamento_id: txt(b.financiamento_id),
      origem_valor: origem(b.origem_valor), valor_sem_lancamento: numOuNulo(b.valor_sem_lancamento), estimativa_rs_ha: numOuNulo(b.estimativa_rs_ha),
      estimativa_area_ha: numOuNulo(b.estimativa_area_ha), area_ha: numOuNulo(b.area_ha), matricula: txt(b.matricula) ?? '', nirf: txt(b.nirf) ?? '',
      seguradora: txt(b.seguradora) ?? '', apolice: txt(b.apolice) ?? '', seguro_vence_em: txt(b.seguro_vence_em) ?? '',
      vida_util_meses: p ? numOuNulo(p.vida_util_meses) : null, residual_pct: p ? numOuNulo(p.residual_pct) : null,
    };
  },
  async salvarBem(form, simular, motivo) {
    return comoLinha(await rpc('fn_patrimonio_bem_salvar', { p_bem: payloadDoBem(form), p_simular: simular, p_motivo: motivo }));
  },
  async mudarParametros(bemId, vigenteDesde, vidaMeses, residual, motivo, simular) {
    return comoLinha(await rpc('fn_patrimonio_parametros_mudar', { p_bem: bemId, p_vigente_desde: vigenteDesde, p_vida_util_meses: vidaMeses,
      p_residual_pct: residual, p_motivo: motivo, p_simular: simular }));
  },
  async ligar(bemId, itens, confirmarRepetidas, simular) {
    const r = await rpc('fn_patrimonio_bem_ligar', { p_bem: bemId, p_itens: itens, p_confirmar_repetidas: confirmarRepetidas, p_simular: simular });
    if (!r.ok) return { ok: false, erro: r.erro ?? 'Não consegui ligar. Tente de novo.' };
    const d = ehLinha(r.dados) ? r.dados : {};
    return { ok: true, dados: {
      ok: d.ok !== false, soma: num(d.soma_aquisicao), n_ligar: num(d.n_ligar ?? d.n_ligados), n_recusas: num(d.n_recusas), n_repetidas: num(d.n_repetidas),
      itens: linhas(d.itens).map(i => ({ lancamento_id: String(i.lancamento_id), parte_ordem: num(i.parte_ordem) || 1, situacao: txt(i.situacao) ?? '',
        motivo: txt(i.motivo), repetida: bool(i.repetida), valor: numOuNulo(i.valor), descricao: txt(i.descricao) })),
      contratos: linhas(d.contratos).map(c => ({ financiamento_id: String(c.financiamento_id), descricao: txt(c.descricao), n_parcelas: num(c.n_parcelas),
        n_faltam: num(c.n_faltam), valor_total: num(c.valor_total),
        faltam: linhas(c.faltam).map(f => ({ lancamento_id: String(f.lancamento_id), parte_ordem: num(f.parte_ordem) || 1 })) })),
    } };
  },
  async desligar(bemId, itens, motivo) {
    return comoLinha(await rpc('fn_patrimonio_bem_desligar', { p_bem: bemId, p_itens: itens, p_motivo: motivo, p_simular: false }));
  },
  async salvarPastos(bemId, pastos, simular) {
    return comoLinha(await rpc('fn_patrimonio_bem_pastos_salvar', { p_bem: bemId, p_pastos: pastos, p_simular: simular }));
  },
  async salvarAvaliacao(bemId, a) {
    return comoLinha(await rpc('fn_patrimonio_avaliacao_salvar', { p_bem: bemId, p_avaliacao: a, p_simular: false }));
  },
  async cancelarAvaliacao(id, motivo) {
    return comoLinha(await rpc('fn_patrimonio_avaliacao_cancelar', { p_id: id, p_motivo: motivo }));
  },
  async enviarDocumento(bemId, arquivo, especie) {
    const ext = arquivo.name.includes('.') ? arquivo.name.split('.').pop() ?? 'bin' : 'bin';
    const r = await rpc('fn_patrimonio_documento_registrar', { p_bem: bemId, p_especie: especie, p_nome: arquivo.name, p_extensao: ext,
      p_tipo: arquivo.type || null, p_tamanho: arquivo.size });
    if (!r.ok) return r.erro ?? 'Não consegui registrar o documento.';
    const d = ehLinha(r.dados) ? r.dados : {};
    const caminho = txt(d.storage_path); const docId = txt(d.id);
    if (!caminho || !docId) return 'O banco não devolveu o caminho do arquivo.';
    const up = await supabase.storage.from(BUCKET_DO_PATRIMONIO).upload(caminho, arquivo, { upsert: false, contentType: arquivo.type || undefined });
    if (up.error) {
      await rpc('fn_patrimonio_documento_remover', { p_id: docId, p_motivo: 'o arquivo não subiu' });
      return `O arquivo "${arquivo.name}" não subiu. Nada ficou registrado.`;
    }
    return null;
  },
  async removerDocumento(id, motivo) {
    return comoLinha(await rpc('fn_patrimonio_documento_remover', { p_id: id, p_motivo: motivo }));
  },
  async urlDoDocumento(caminho) {
    const { data, error } = await supabase.storage.from(BUCKET_DO_PATRIMONIO).createSignedUrl(caminho, 60);
    return error ? null : data?.signedUrl ?? null;
  },
};
