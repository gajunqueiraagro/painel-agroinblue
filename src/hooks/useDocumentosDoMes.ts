import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { aceitarArquivo } from '@/lib/arquivo/aceitarArquivo';
import { extensaoDoArquivo } from '@/lib/oc/caminhoDocumento';
import { REGRA_ARQUIVO_DO_BOLETO } from '@/hooks/useLancamentoDocumentos';
import {
  BUCKET_PEC_DOCUMENTOS, FRASE_DOCUMENTO_MUDOU, FRASE_MOTIVO_OBRIGATORIO, FRASE_NOME_OBRIGATORIO,
  caminhoDoDocumentoDoMes, lerDocumentosDoMes, lerTiposDeDocumento, type DocumentoDoMes, type TipoDeDocumento,
} from '@/lib/pecuaria/documentosDoMes';

/**
 * FECH-DOCS-01 — os documentos do mês da fazenda (livro do campeiro). Molde: os anexos do extrato (`useExtratoDaConta.ts`).
 *
 * ⚠ REGISTRAR PRIMEIRO, SUBIR DEPOIS (a lei do molde): linha sem arquivo aparece como "sem arquivo" e se conserta; arquivo no
 *   bucket sem linha é lixo que ninguém acha.
 * ⚠ A REGRA DO ARQUIVO É A DO BOLETO (PDF, JPG, PNG, 10 MB): é o que a tela diz que aceita e o que o bucket `pec-documentos`
 *   aceita. O dono do aceite é `aceitarArquivo`.
 * ⚠ A FONTE É INJETÁVEL: as três funções de gesto recebem quem fala com o banco, para o teste provar a regra sem rede.
 * ⚠ `(supabase as any).from`: a tabela `pecuaria_fechamento_documentos` nasceu depois do `types.ts` (dívida declarada; regenerar
 *   os tipos tira o cast). As respostas passam por `lerDocumentosDoMes`, sem cast.
 * ⚠ FECH-DOCS-02 — OS TIPOS SÃO DO CATÁLOGO (`catalogo_itens`, lista `tipo_documento_mes`, globais + os do cliente, só os ativos). O anexo
 *   nasce SEM tipo e o banco põe "Outro" (o gatilho `trg_pec_fech_doc_tipo`); trocar o tipo grava `tipo_id` (nunca a `especie`, legado).
 */

export const REGRA_DO_DOCUMENTO_DO_MES = REGRA_ARQUIVO_DO_BOLETO;

export interface ChaveDoMes { clienteId: string; fazendaId: string; anoMes: string }
export type Resposta = { ok: boolean; erro: string | null };

export interface FonteDeDocumentosDoMes {
  usuario(): Promise<string | null>;
  listar(chave: ChaveDoMes): Promise<{ linhas: unknown[]; erro: string | null }>;
  /** Os tipos ativos do catálogo que o cliente vê (globais + os dele). */
  listarTipos(clienteId: string): Promise<{ linhas: unknown[]; erro: string | null }>;
  inserir(linha: ChaveDoMes & { nome: string; tamanhoBytes: number; usuario: string | null }): Promise<{ id: string | null; erro: string | null }>;
  subir(caminho: string, file: File): Promise<Resposta>;
  gravarCaminho(id: string, clienteId: string, caminho: string): Promise<Resposta>;
  /** UPDATE de tipo/nome com `versao = versao lida` no filtro e versao + 1; `alcancou` = achou a linha naquela versão. */
  renomear(id: string, clienteId: string, versao: number, dados: { tipoId: string; nome: string }): Promise<Resposta & { alcancou: boolean }>;
  cancelar(id: string, clienteId: string, motivo: string, usuario: string | null): Promise<Resposta>;
  urlAssinada(caminho: string): Promise<string | null>;
}

const TABELA = 'pecuaria_fechamento_documentos';

export const fonteDoBanco: FonteDeDocumentosDoMes = {
  async usuario() {
    return (await supabase.auth.getUser()).data.user?.id ?? null;
  },
  async listar({ clienteId, fazendaId, anoMes }) {
    const { data, error } = await (supabase as any).from(TABELA)
      .select('id, tipo_id, nome, url, tamanho_bytes, uploaded_em, versao')
      .eq('cliente_id', clienteId).eq('fazenda_id', fazendaId).eq('ano_mes', anoMes).eq('cancelado', false)
      .order('uploaded_em', { ascending: false });
    return { linhas: Array.isArray(data) ? data : [], erro: error?.message ?? null };
  },
  async listarTipos(clienteId) {
    const { data, error } = await (supabase as any).from('catalogo_itens')
      .select('id, nome, grupo, ordem')
      .eq('lista', 'tipo_documento_mes').eq('ativo', true).or(`cliente_id.is.null,cliente_id.eq.${clienteId}`)
      .order('ordem', { ascending: true }).order('nome', { ascending: true });
    return { linhas: Array.isArray(data) ? data : [], erro: error?.message ?? null };
  },
  async inserir(l) {
    const { data, error } = await (supabase as any).from(TABELA)
      .insert({
        cliente_id: l.clienteId, fazenda_id: l.fazendaId, ano_mes: l.anoMes, nome: l.nome,
        tamanho_bytes: l.tamanhoBytes, url: null, uploaded_por: l.usuario,
      })
      .select('id').single();
    const id: unknown = data?.id;
    return { id: typeof id === 'string' ? id : null, erro: error?.message ?? null };
  },
  async subir(caminho, file) {
    const up = await supabase.storage.from(BUCKET_PEC_DOCUMENTOS).upload(caminho, file, { upsert: false });
    return { ok: !up.error, erro: up.error?.message ?? null };
  },
  async gravarCaminho(id, clienteId, caminho) {
    const { error } = await (supabase as any).from(TABELA).update({ url: caminho }).eq('id', id).eq('cliente_id', clienteId);
    return { ok: !error, erro: error?.message ?? null };
  },
  async renomear(id, clienteId, versao, dados) {
    const { data, error } = await (supabase as any).from(TABELA)
      .update({ tipo_id: dados.tipoId, nome: dados.nome, versao: versao + 1 })
      .eq('id', id).eq('cliente_id', clienteId).eq('versao', versao).eq('cancelado', false)
      .select('id');
    return { ok: !error, erro: error?.message ?? null, alcancou: Array.isArray(data) && data.length > 0 };
  },
  async cancelar(id, clienteId, motivo, usuario) {
    const { error } = await (supabase as any).from(TABELA)
      .update({ cancelado: true, cancelado_motivo: motivo, cancelado_em: new Date().toISOString(), cancelado_por: usuario })
      .eq('id', id).eq('cliente_id', clienteId);
    return { ok: !error, erro: error?.message ?? null };
  },
  async urlAssinada(caminho) {
    const { data, error } = await supabase.storage.from(BUCKET_PEC_DOCUMENTOS).createSignedUrl(caminho, 60);
    if (error) return null;
    return data?.signedUrl ?? null;
  },
};

/** Anexa NA HORA: a linha nasce com o nome que veio e o banco põe o tipo "Outro"; devolve o id para a tela abri-la em edição. */
export async function anexarDocumentoDoMes(
  fonte: FonteDeDocumentosDoMes, chave: ChaveDoMes, arquivo: File,
): Promise<Resposta & { id: string | null }> {
  const aceite = aceitarArquivo([arquivo], REGRA_DO_DOCUMENTO_DO_MES);
  if (aceite.ok === false) return { ok: false, erro: aceite.motivo, id: null };
  const file = aceite.arquivos[0];
  const ext = extensaoDoArquivo(file);
  if (!ext) return { ok: false, erro: 'Formato não aceito. Envie PDF, JPG ou PNG.', id: null };

  const usuario = await fonte.usuario();
  const nome = file.name.trim() || 'documento';
  const registro = await fonte.inserir({ ...chave, nome, tamanhoBytes: file.size, usuario });
  if (registro.erro || !registro.id) return { ok: false, erro: registro.erro ?? 'Não foi possível registrar o documento.', id: null };

  const caminho = caminhoDoDocumentoDoMes(chave.clienteId, chave.fazendaId, chave.anoMes, registro.id, ext);
  const up = await fonte.subir(caminho, file);
  if (!up.ok) return { ok: false, erro: up.erro ?? 'Não foi possível enviar o arquivo.', id: registro.id };
  const gravou = await fonte.gravarCaminho(registro.id, chave.clienteId, caminho);
  return { ok: gravou.ok, erro: gravou.erro, id: registro.id };
}

/** Renomear = tipo + nome num gesto, versão + 1. Nome em branco e tipo fora da lista do cliente não vão ao banco. */
export async function renomearDocumentoDoMes(
  fonte: FonteDeDocumentosDoMes, clienteId: string, doc: Pick<DocumentoDoMes, 'id' | 'versao'>, dados: { tipoId: string; nome: string },
  tipos: readonly TipoDeDocumento[],
): Promise<Resposta> {
  const nome = dados.nome.trim();
  if (!nome) return { ok: false, erro: FRASE_NOME_OBRIGATORIO };
  if (!tipos.some(t => t.id === dados.tipoId)) return { ok: false, erro: FRASE_TIPO_INVALIDO };
  const r = await fonte.renomear(doc.id, clienteId, doc.versao, { tipoId: dados.tipoId, nome });
  if (!r.ok) return { ok: false, erro: r.erro ?? 'Não foi possível gravar.' };
  if (!r.alcancou) return { ok: false, erro: FRASE_DOCUMENTO_MUDOU };
  return { ok: true, erro: null };
}

/** Cancela com motivo. Não apaga o arquivo: documento se cancela, não some. Sem motivo, nem vai ao banco. */
export async function cancelarDocumentoDoMes(
  fonte: FonteDeDocumentosDoMes, clienteId: string, documentoId: string, motivo: string,
): Promise<Resposta> {
  const texto = motivo.trim();
  if (!texto) return { ok: false, erro: FRASE_MOTIVO_OBRIGATORIO };
  const usuario = await fonte.usuario();
  const r = await fonte.cancelar(documentoId, clienteId, texto, usuario);
  return { ok: r.ok, erro: r.ok ? null : (r.erro ?? 'Não foi possível cancelar.') };
}

export const FRASE_TIPO_INVALIDO = 'Escolha um tipo da lista.';

export interface DocumentosDoMesApi {
  documentos: DocumentoDoMes[];
  /** Os tipos do cliente (vazio enquanto lê ou se a leitura falhou: o erro vai em `erro`). */
  tipos: TipoDeDocumento[];
  /** Ainda não houve resposta para ESTA fazenda + mês: quem conta mostra "…", nunca zero. */
  lendo: boolean;
  erro: string | null;
  recarregar: () => Promise<void>;
  anexar: (arquivo: File) => Promise<Resposta & { id: string | null }>;
  renomear: (doc: Pick<DocumentoDoMes, 'id' | 'versao'>, dados: { tipoId: string; nome: string }) => Promise<Resposta>;
  cancelar: (documentoId: string, motivo: string) => Promise<Resposta>;
  urlAssinada: (caminho: string) => Promise<string | null>;
}

export function useDocumentosDoMes(
  clienteId: string | null, fazendaId: string | null, anoMes: string | null, fonte: FonteDeDocumentosDoMes = fonteDoBanco,
): DocumentosDoMesApi {
  const chaveTexto = clienteId && fazendaId && anoMes ? `${clienteId}|${fazendaId}|${anoMes}` : null;
  const [estado, setEstado] = useState<{ chave: string | null; documentos: DocumentoDoMes[]; erro: string | null }>(
    { chave: null, documentos: [], erro: null });
  const pedido = useRef(0);
  const [tiposDoCliente, setTiposDoCliente] = useState<{ cliente: string | null; tipos: TipoDeDocumento[]; erro: string | null }>(
    { cliente: null, tipos: [], erro: null });

  /* Os tipos são do CLIENTE (não do mês): uma leitura por cliente, só com fazenda (sem ela o diálogo não abre). Resposta de outro cliente
     é descartada. */
  const temFazenda = Boolean(fazendaId);
  useEffect(() => {
    if (!clienteId || !temFazenda) { setTiposDoCliente({ cliente: null, tipos: [], erro: null }); return; }
    let vivo = true;
    void fonte.listarTipos(clienteId).then((r) => {
      if (vivo) setTiposDoCliente({ cliente: clienteId, tipos: r.erro ? [] : lerTiposDeDocumento(r.linhas), erro: r.erro });
    });
    return () => { vivo = false; };
  }, [clienteId, temFazenda, fonte]);
  const tipos = tiposDoCliente.cliente === clienteId ? tiposDoCliente.tipos : [];

  const recarregar = useCallback(async () => {
    const meu = ++pedido.current;
    if (!clienteId || !fazendaId || !anoMes || !chaveTexto) { setEstado({ chave: null, documentos: [], erro: null }); return; }
    const r = await fonte.listar({ clienteId, fazendaId, anoMes });
    if (meu !== pedido.current) return; // resposta de outra fazenda / outro mês: descartada
    setEstado({ chave: chaveTexto, documentos: r.erro ? [] : lerDocumentosDoMes(r.linhas), erro: r.erro });
  }, [clienteId, fazendaId, anoMes, chaveTexto, fonte]);

  useEffect(() => { void recarregar(); }, [recarregar]);

  const doMes = estado.chave === chaveTexto;

  const anexarNoMes = useCallback(async (arquivo: File) => {
    if (!clienteId || !fazendaId || !anoMes) return { ok: false, erro: 'Selecione a fazenda e o mês.', id: null };
    const r = await anexarDocumentoDoMes(fonte, { clienteId, fazendaId, anoMes }, arquivo);
    await recarregar();
    return r;
  }, [clienteId, fazendaId, anoMes, fonte, recarregar]);

  const renomearNoMes = useCallback(async (doc: Pick<DocumentoDoMes, 'id' | 'versao'>, dados: { tipoId: string; nome: string }) => {
    if (!clienteId) return { ok: false, erro: 'Sem cliente.' };
    const r = await renomearDocumentoDoMes(fonte, clienteId, doc, dados, tipos);
    await recarregar();
    return r;
  }, [clienteId, fonte, recarregar, tipos]);

  const cancelarNoMes = useCallback(async (documentoId: string, motivo: string) => {
    if (!clienteId) return { ok: false, erro: 'Sem cliente.' };
    const r = await cancelarDocumentoDoMes(fonte, clienteId, documentoId, motivo);
    if (r.ok) await recarregar();
    return r;
  }, [clienteId, fonte, recarregar]);

  return {
    documentos: doMes ? estado.documentos : [],
    tipos,
    lendo: chaveTexto !== null && !doMes,
    erro: doMes ? (estado.erro ?? (tiposDoCliente.cliente === clienteId ? tiposDoCliente.erro : null)) : null,
    /* nomes locais diferentes dos métodos da fonte: o `check:tdz` casa por nome e os tomava por uso antes da declaração */
    recarregar, anexar: anexarNoMes, renomear: renomearNoMes, cancelar: cancelarNoMes,
    urlAssinada: fonte.urlAssinada,
  };
}
