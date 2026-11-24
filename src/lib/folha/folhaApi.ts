/**
 * FOLHA-01 · PR B (telas) — a API da tela da Folha: TODA leitura e escrita passa por aqui, pelas funções do contrato do Code 6
 * (folha-20261119-0727-…-CONTRATO.md §3; lotes 118380–118425 no proto).
 * ⚠ INJETÁVEL (o molde da `PatrimonioApi`): a tela recebe a API por contexto; o padrão é a do banco. A bancada dos prints e os testes
 *   passam uma em memória — a tela não sabe a diferença.
 * ⚠ ESCRITA SÓ PELAS `fn_folha_*` e `fn_lancamento_funcionario_ligar`; cada gesto passa ANTES pela prévia (`p_simular = true`) quando a
 *   função a tem. Leitura direta só onde o contrato manda: o funcionário do lançamento (`funcionario_id` + `folha_funcionarios`, a RLS
 *   só mostra a quem tem a folha) e o arquivo no bucket.
 * ⚠ `(supabase as any)`: as funções nasceram depois do `types.ts` (a única exceção do zero-cast).
 * ⚠ ERRO: P0001 traz a frase pronta (vai para a faixa, nunca toast); 42501 = sem a folha deste cliente.
 */
import { supabase } from '@/integrations/supabase/client';
import {
  ehLinha, fichaDoBanco, fraseDoErro, historicoDoBanco, listaDoBanco, pendenciasDoBanco, txt,
  type EspecieDocumento, type Ficha, type Historico, type Linha, type ListaFuncionarios, type Pendencias,
} from './folhaTela';

/* ⚠ `erro` e `dados` existem nos DOIS ramos: o `tsconfig.app.json` (sem strict) não estreita a união pelo `ok`. */
export type Resultado<T> = { ok: true; dados: T; erro?: undefined } | { ok: false; erro: string; dados?: undefined };

export interface DetalheDoDocumento { data_documento?: string | null; vencimento?: string | null; lancamento_id?: string | null }
export interface ItemDeAtuacao { fazenda_id: string; atividade: string; pct: number }
/** o arquivo para o Visualizador: os bytes (PDF) ou só o endereço assinado (imagem, planilha) */
export interface ArquivoAberto { nome: string; ehPdf: boolean; bytes: ArrayBuffer | null; url: string | null }

export interface FolhaApi {
  folhaOk(clienteId: string): Promise<boolean>;
  lista(clienteId: string): Promise<Resultado<ListaFuncionarios>>;
  ficha(funcionarioId: string): Promise<Resultado<Ficha>>;
  historico(funcionarioId: string, de: string | null, ate: string | null): Promise<Resultado<Historico>>;
  pendencias(clienteId: string): Promise<Resultado<Pendencias>>;
  /** `pedido` = o registro INTEIRO, de `pedidoDoFuncionario` (o gravador sobrescreve toda chave, menos nascimento/PIS/CTPS) */
  gravarFuncionario(clienteId: string, pedido: Linha, simular: boolean): Promise<Resultado<Linha>>;
  gravarSalario(funcionarioId: string, desde: string, salario: number, partePct: number, motivo: string | null, simular: boolean): Promise<Resultado<Linha>>;
  gravarAtuacao(funcionarioId: string, desde: string, itens: ItemDeAtuacao[], simular: boolean): Promise<Resultado<Linha>>;
  desligar(funcionarioId: string, data: string, motivo: string, simular: boolean): Promise<Resultado<Linha>>;
  reativar(funcionarioId: string, motivo: string, simular: boolean): Promise<Resultado<Linha>>;
  /** liga (ou, com `funcionarioId` nulo, desliga) os lançamentos ao funcionário — a prévia primeiro */
  ligar(lancamentos: string[], funcionarioId: string | null, motivo: string, simular: boolean): Promise<Resultado<Linha>>;
  descartar(clienteId: string, chave: string, motivo: string, desfazer: boolean): Promise<Resultado<Linha>>;
  /** registra → sobe → detalha (data, vencimento, lançamento). Devolve a frase da recusa, ou nulo. A subida que falha cancela o registro. */
  enviarDocumento(clienteId: string, funcionarioId: string, arquivo: File, especie: EspecieDocumento, detalhe: DetalheDoDocumento): Promise<string | null>;
  detalharDocumento(id: string, detalhe: DetalheDoDocumento): Promise<Resultado<Linha>>;
  removerDocumento(id: string, motivo: string): Promise<Resultado<Linha>>;
  abrirArquivo(bucket: string, caminho: string, nome: string): Promise<ArquivoAberto | null>;
  /** o funcionário ligado ao lançamento (nulo = sem funcionário, ou sem a folha: a RLS não mostra) */
  funcionarioDoLancamento(lancamentoId: string): Promise<{ id: string; nome: string } | null>;
}

/* ── a API do banco ────────────────────────────────────────────────────────────────────────────────────────────────────────── */
type ErroDoBanco = { code?: string; message?: string } | null;
async function rpc(nome: string, args: Record<string, unknown>): Promise<{ ok: true; dados: unknown } | { ok: false; erro: string; codigo: string | null }> {
  const { data, error } = await (supabase as any).rpc(nome, args);
  const e: ErroDoBanco = error ?? null;
  if (e) return { ok: false, erro: fraseDoErro(e), codigo: e.code ?? null };
  return { ok: true, dados: data };
}
/* ⚠ O TSC DO PROJETO NÃO TEM strictNullChecks: `!r.ok` não estreita a união — a frase sai pelo `in` (que estreita nos dois modos) */
const erroDe = (r: object): string => ('erro' in r && typeof r.erro === 'string' ? r.erro : 'Não consegui gravar agora. Nada foi gravado.');
const comoLinha = (r: Awaited<ReturnType<typeof rpc>>): Resultado<Linha> =>
  'dados' in r ? { ok: true, dados: ehLinha(r.dados) ? r.dados : {} } : { ok: false, erro: erroDe(r) };
function lido<T>(r: Awaited<ReturnType<typeof rpc>>, ler: (v: unknown) => T | null): Resultado<T> {
  if (!r.ok) return { ok: false, erro: erroDe(r) };
  const v = ler(r.dados);
  return v == null ? { ok: false, erro: 'O banco não devolveu o registro.' } : { ok: true, dados: v };
}
const extensao = (nome: string): string => (nome.includes('.') ? nome.split('.').pop() ?? 'bin' : 'bin');
const ehPdf = (nome: string, tipo?: string | null) => tipo === 'application/pdf' || /\.pdf$/i.test(nome);

export const apiDoBanco: FolhaApi = {
  async folhaOk(clienteId) {
    const r = await rpc('folha_ok', { _cliente: clienteId });
    return r.ok && r.dados === true;
  },
  async lista(clienteId) { return lido(await rpc('fn_folha_funcionarios_lista', { p_cliente: clienteId }), listaDoBanco); },
  async ficha(funcionarioId) { return lido(await rpc('fn_folha_funcionario_ficha', { p_funcionario: funcionarioId }), fichaDoBanco); },
  async historico(funcionarioId, de, ate) {
    return lido(await rpc('fn_folha_historico', { p_funcionario: funcionarioId, p_de: de, p_ate: ate }), historicoDoBanco);
  },
  async pendencias(clienteId) { return lido(await rpc('fn_folha_pendencias', { p_cliente: clienteId }), pendenciasDoBanco); },
  async gravarFuncionario(clienteId, pedido, simular) {
    return comoLinha(await rpc('fn_folha_funcionario_gravar', { p_cliente: clienteId, p_dados: pedido, p_simular: simular }));
  },
  async gravarSalario(funcionarioId, desde, salario, partePct, motivo, simular) {
    return comoLinha(await rpc('fn_folha_salario_gravar', {
      p_funcionario: funcionarioId, p_desde: desde, p_salario: salario, p_parte_pct: partePct, p_motivo: motivo, p_simular: simular,
    }));
  },
  async gravarAtuacao(funcionarioId, desde, itens, simular) {
    return comoLinha(await rpc('fn_folha_atuacao_gravar', { p_funcionario: funcionarioId, p_desde: desde, p_itens: itens, p_simular: simular }));
  },
  async desligar(funcionarioId, data, motivo, simular) {
    return comoLinha(await rpc('fn_folha_funcionario_desligar', { p_funcionario: funcionarioId, p_data: data, p_motivo: motivo, p_simular: simular }));
  },
  async reativar(funcionarioId, motivo, simular) {
    return comoLinha(await rpc('fn_folha_funcionario_reativar', { p_funcionario: funcionarioId, p_motivo: motivo, p_simular: simular }));
  },
  async ligar(lancamentos, funcionarioId, motivo, simular) {
    return comoLinha(await rpc('fn_lancamento_funcionario_ligar', { p_lancamentos: lancamentos, p_funcionario: funcionarioId, p_motivo: motivo, p_simular: simular }));
  },
  async descartar(clienteId, chave, motivo, desfazer) {
    return comoLinha(await rpc('fn_folha_pendencia_descartar', { p_cliente: clienteId, p_chave: chave, p_motivo: motivo, p_desfazer: desfazer }));
  },
  async enviarDocumento(clienteId, funcionarioId, arquivo, especie, detalhe) {
    /* ⚠ md5 NULO: o navegador não calcula md5 (o `crypto.subtle` não tem) e a casa não tem o helper — a recusa do "mesmo arquivo" não vale
       para quem sobe pela ficha (declarado no relatório) */
    const r = await rpc('fn_folha_documento_registrar', {
      p_cliente: clienteId, p_folha: null, p_funcionario: funcionarioId, p_especie: especie, p_nome: arquivo.name, p_extensao: extensao(arquivo.name),
      p_tipo: arquivo.type || null, p_tamanho: arquivo.size, p_md5: null, p_entrada: null,
    });
    if (!r.ok) return erroDe(r);
    const d = ehLinha(r.dados) ? r.dados : {};
    const caminho = txt(d.storage_path); const docId = txt(d.id);
    if (!caminho || !docId) return 'O banco não devolveu o caminho do arquivo.';
    const up = await supabase.storage.from('folha-documentos').upload(caminho, arquivo, { upsert: false, contentType: arquivo.type || undefined });
    if (up.error) {
      await rpc('fn_folha_documento_remover', { p_id: docId, p_motivo: 'o arquivo não subiu' });
      return `O arquivo "${arquivo.name}" não subiu. Nada ficou registrado.`;
    }
    const temDetalhe = detalhe.data_documento !== undefined || detalhe.vencimento !== undefined || detalhe.lancamento_id !== undefined;
    if (temDetalhe) {
      const det = await rpc('fn_folha_documento_detalhar', { p_id: docId, p_dados: detalhe, p_simular: false });
      if (!det.ok) return `O arquivo subiu, mas a data/vencimento não gravou: ${erroDe(det)}`;
    }
    return null;
  },
  async detalharDocumento(id, detalhe) {
    return comoLinha(await rpc('fn_folha_documento_detalhar', { p_id: id, p_dados: detalhe, p_simular: false }));
  },
  async removerDocumento(id, motivo) { return comoLinha(await rpc('fn_folha_documento_remover', { p_id: id, p_motivo: motivo })); },
  async abrirArquivo(bucket, caminho, nome) {
    if (ehPdf(nome)) {
      const { data, error } = await supabase.storage.from(bucket).download(caminho);
      if (!error && data) return { nome, ehPdf: true, bytes: await data.arrayBuffer(), url: null };
    }
    const { data, error } = await supabase.storage.from(bucket).createSignedUrl(caminho, 60);
    return error || !data?.signedUrl ? null : { nome, ehPdf: false, bytes: null, url: data.signedUrl };
  },
  async funcionarioDoLancamento(lancamentoId) {
    const { data: l } = await (supabase as any).from('financeiro_lancamentos_v2').select('funcionario_id').eq('id', lancamentoId).maybeSingle();
    const fid = ehLinha(l) ? txt(l.funcionario_id) : null;
    if (!fid) return null;
    const { data: f } = await (supabase as any).from('folha_funcionarios').select('id, nome').eq('id', fid).maybeSingle();
    return ehLinha(f) && txt(f.nome) ? { id: fid, nome: String(f.nome) } : null;
  },
};
