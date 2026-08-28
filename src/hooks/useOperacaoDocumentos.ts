import { useState, useEffect, useCallback, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { BUCKET_OC_DOCUMENTOS, caminhoDocumentoOC, extensaoDoArquivo, motivoArquivoInvalido } from '@/lib/oc/caminhoDocumento';

// Documentos fiscais da Operação Comercial (PR-OC-DOC-UI-01). Consome EXCLUSIVAMENTE os contratos
//   publicados no PR-OC-DOC-MODEL-01: view vw_oc_documentos + RPCs oc_documento_registrar/editar/
//   cancelar. Para edição lê componentes/lotes/versão das tabelas-base (SELECT tenant). Sem upload,
//   sem FINV2/liquidação, sem tocar negociação/recebimento.

export type EspecieDoc = 'nf_principal' | 'nf_complementar' | 'recibo' | 'outro';
export type NaturezaComp = 'acrescimo' | 'desconto_comercial' | 'retencao_sem_caixa' | 'despesa_desembolso' | 'informativo';

export interface DocumentoLista {
  documentoId: string;
  especie: EspecieDoc;
  numero: string | null;
  serie: string | null;
  dataEmissao: string | null;
  situacao: 'ativo' | 'cancelado';
  cancelado: boolean;
  valorLiquido: number;
  totalAcrescimos: number;
  totalDescontosComerciais: number;
  totalRetencoesSemCaixa: number;
  totalDespesasDesembolso: number;
  qtdComponentes: number;
  qtdLotes: number;
  documentoOrigemId: string | null;
  /* PR-OC-DOCUMENTOS-02 — a `url` ja vinha na view e nao era exposta. Sem ela a tela
     nao distingue "documento registrado COM arquivo" de "registrado SEM arquivo", que
     e' exatamente o estado que o fluxo registrar-depois-subir pode deixar para tras. */
  url: string | null;
  /* EMITENTE na LISTA. A view foi recriada com as tres colunas depois de 20260903120000
     — antes disso so o formulario (que le a tabela-base) enxergava quem emitiu.
     ⚠ `emitenteNome` NULO significa "o emitente e a propria contraparte", nao "ausente":
     a divergencia e' que se grava. Quem exibir isso tem de dizer a contraparte, nunca "—". */
  emitenteId: string | null;
  emitenteNome: string | null;
}

export interface ComponentePayload { tipo: string; natureza: NaturezaComp; valor: number; descricao?: string; ordem: number; }

export interface DocumentoPayload {
  especie: EspecieDoc;
  numero?: string;
  serie?: string;
  chaveAcesso?: string;
  dataEmissao?: string;
  observacao?: string;
  url?: string;
  documentoOrigemId?: string | null;
  /* EMITENTE — quem assinou a nota, quando difere da contraparte da operacao.
     Ausente = e' a propria contraparte (caso comum). Ver 20260903120000. */
  emitenteId?: string | null;
  emitenteNome?: string | null;
  emitenteDocumento?: string | null;
  componentes: ComponentePayload[];
  lotes: string[];
}

export interface DocumentoDetalhe {
  documentoId: string;
  versao: number;
  especie: EspecieDoc;
  numero: string;
  serie: string;
  chaveAcesso: string;
  dataEmissao: string;
  observacao: string;
  url: string;
  documentoOrigemId: string | null;
  emitenteId: string | null;
  emitenteNome: string;
  emitenteDocumento: string;
  componentes: ComponentePayload[];
  loteIds: string[];
}

export interface LoteOpcao { loteId: string; ordem: number; categoria: string | null; }

export interface DocumentosApi {
  documentos: DocumentoLista[];
  lotes: LoteOpcao[];
  loading: boolean;
  saving: boolean;
  registrar: (p: DocumentoPayload) => Promise<string | null>;   // devolve o documento_id
  anexarArquivo: (documentoId: string, versaoEsperada: number, file: File) => Promise<boolean>;
  urlAssinada: (caminho: string) => Promise<string | null>;
  editar: (documentoId: string, versaoEsperada: number, p: DocumentoPayload) => Promise<boolean>;
  cancelar: (documentoId: string, motivo: string) => Promise<boolean>;
  carregarDetalhe: (documentoId: string) => Promise<DocumentoDetalhe | null>;
}

interface Params {
  operacaoId: string | null;
  clienteId: string | null;
  enabled: boolean;
}

interface DocRow {
  documento_id: string; especie: EspecieDoc; numero: string | null; serie: string | null; data_emissao: string | null;
  situacao: 'ativo' | 'cancelado'; cancelado: boolean; valor_liquido: number;
  total_acrescimos: number; total_descontos_comerciais: number; total_retencoes_sem_caixa: number; total_despesas_desembolso: number;
  qtd_componentes: number; qtd_lotes: number; documento_origem_id: string | null;
  url: string | null;
  emitente_id: string | null; emitente_nome: string | null; emitente_documento: string | null;
}
interface LoteRow { id: string; ordem: number; categoria_negociada: string | null; }

function payloadJson(p: DocumentoPayload): Record<string, unknown> {
  return {
    especie: p.especie,
    numero: p.numero ?? null,
    serie: p.serie ?? null,
    chave_acesso: p.chaveAcesso ?? null,
    data_emissao: p.dataEmissao ?? null,
    observacao: p.observacao ?? null,
    url: p.url ?? null,
    documento_origem_id: p.documentoOrigemId ?? null,
    emitente_id: p.emitenteId ?? null,
    emitente_nome: p.emitenteNome ?? null,
    emitente_documento: p.emitenteDocumento ?? null,
    componentes: p.componentes.map(c => ({
      tipo: c.tipo, natureza: c.natureza, valor: c.valor, ordem: c.ordem, descricao: c.descricao ?? null,
    })),
    lotes: p.lotes,
  };
}

export function useOperacaoDocumentos({ operacaoId, clienteId, enabled }: Params): DocumentosApi {
  const [documentos, setDocumentos] = useState<DocumentoLista[]>([]);
  const [lotes, setLotes] = useState<LoteOpcao[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  const carregar = useCallback(async () => {
    if (!enabled || !operacaoId) { setDocumentos([]); setLotes([]); return; }
    setLoading(true);
    try {
      const [docs, los] = await Promise.all([
        (supabase as any).from('vw_oc_documentos').select('*').eq('operacao_id', operacaoId),
        (supabase as any).from('zoo_operacao_lotes').select('id, ordem, categoria_negociada').eq('operacao_id', operacaoId).order('ordem'),
      ]);
      if (docs.error) throw new Error(docs.error.message);
      if (los.error) throw new Error(los.error.message);
      setDocumentos(((docs.data ?? []) as DocRow[]).map(d => ({
        documentoId: d.documento_id, especie: d.especie, numero: d.numero, serie: d.serie, dataEmissao: d.data_emissao,
        situacao: d.situacao, cancelado: d.cancelado, valorLiquido: Number(d.valor_liquido),
        totalAcrescimos: Number(d.total_acrescimos), totalDescontosComerciais: Number(d.total_descontos_comerciais),
        totalRetencoesSemCaixa: Number(d.total_retencoes_sem_caixa), totalDespesasDesembolso: Number(d.total_despesas_desembolso),
        qtdComponentes: d.qtd_componentes, qtdLotes: d.qtd_lotes, documentoOrigemId: d.documento_origem_id,
        url: d.url ?? null,
        emitenteId: d.emitente_id ?? null, emitenteNome: d.emitente_nome ?? null,
      })));
      setLotes(((los.data ?? []) as LoteRow[]).map(l => ({ loteId: l.id, ordem: l.ordem, categoria: l.categoria_negociada })));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Falha ao carregar documentos.');
    } finally {
      setLoading(false);
    }
  }, [enabled, operacaoId]);

  useEffect(() => { carregar(); }, [carregar]);

  const guard = (): boolean => {
    if (!operacaoId || !clienteId) { toast.error('Operação não iniciada.'); return false; }
    return true;
  };

  /* ⚠ DEVOLVE O ID, nao um booleano. A ordem do fluxo e REGISTRAR PRIMEIRO, SUBIR
     DEPOIS, e o caminho do arquivo precisa do `documento_id`. Antes o envelope trazia o
     id e a funcao o descartava — mesmo defeito de `oc_salvar_rascunho` devolvendo a
     versao e o front nao lendo.
     ⚠ POR QUE ESTA ORDEM: subir antes deixaria ARQUIVO ORFAO no bucket se o registro
     falhasse — sem linha, sem dono, sem quem limpe. Registrando primeiro, a falha no
     upload deixa uma LINHA SEM ARQUIVO: visivel na tela e corrigivel pelo anexar.
     Lixo visivel e melhor que lixo invisivel. */
  const registrar = useCallback(async (p: DocumentoPayload): Promise<string | null> => {
    if (!guard()) return null;
    setSaving(true);
    try {
      const { data, error } = await (supabase as any).rpc('oc_documento_registrar', {
        p_operacao_id: operacaoId, p_cliente_id: clienteId, p_payload: payloadJson(p),
      });
      if (error) throw new Error(error.message);
      const id = (data as { documento_id?: string } | null)?.documento_id ?? null;
      toast.success('Documento registrado.');
      await carregar();
      return id;
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Falha ao registrar documento.');
      return null;
    } finally { setSaving(false); }
  }, [operacaoId, clienteId, carregar]);

  /* SOBE o arquivo e grava a url no documento JA REGISTRADO. O caminho sai do helper
     unico (`caminhoDocumentoOC`): a politica de Storage compara a primeira pasta com os
     clientes do usuario, e qualquer desvio devolve "sem permissao" em vez de "caminho
     errado". `upsert` para o re-envio do mesmo documento — e' o que a politica de UPDATE
     existe para permitir. */
  const anexarArquivo = useCallback(async (documentoId: string, versaoEsperada: number, file: File): Promise<boolean> => {
    if (!guard() || !clienteId || !operacaoId) return false;
    const invalido = motivoArquivoInvalido(file);
    if (invalido) { toast.error(invalido); return false; }
    const ext = extensaoDoArquivo(file)!;
    const caminho = caminhoDocumentoOC(clienteId, operacaoId, documentoId, ext);
    setSaving(true);
    try {
      const { error: upErr } = await supabase.storage
        .from(BUCKET_OC_DOCUMENTOS)
        .upload(caminho, file, { upsert: true, contentType: file.type });
      if (upErr) throw new Error(upErr.message);
      const { error } = await (supabase as any).rpc('oc_documento_editar', {
        p_documento_id: documentoId, p_cliente_id: clienteId,
        p_versao_esperada: versaoEsperada, p_payload: { url: caminho },
      });
      if (error) throw new Error(error.message);
      toast.success('Arquivo anexado.');
      await carregar();
      return true;
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Falha ao anexar o arquivo.');
      return false;
    } finally { setSaving(false); }
  }, [operacaoId, clienteId, carregar]);

  /* O bucket e' PRIVADO: link direto nao abre. URL assinada, curta — o documento se
     re-assina a cada clique, e link vazado expira sozinho. */
  const urlAssinada = useCallback(async (caminho: string): Promise<string | null> => {
    const { data, error } = await supabase.storage
      .from(BUCKET_OC_DOCUMENTOS).createSignedUrl(caminho, 60);
    if (error) { toast.error('Não foi possível abrir o arquivo.'); return null; }
    return data?.signedUrl ?? null;
  }, []);

  const editar = useCallback(async (documentoId: string, versaoEsperada: number, p: DocumentoPayload): Promise<boolean> => {
    if (!guard()) return false;
    setSaving(true);
    try {
      const { error } = await (supabase as any).rpc('oc_documento_editar', {
        p_documento_id: documentoId, p_cliente_id: clienteId, p_versao_esperada: versaoEsperada, p_payload: payloadJson(p),
      });
      if (error) throw new Error(error.message);
      toast.success('Documento atualizado.');
      await carregar();
      return true;
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Falha ao editar documento.');
      return false;
    } finally { setSaving(false); }
  }, [operacaoId, clienteId, carregar]);

  const cancelar = useCallback(async (documentoId: string, motivo: string): Promise<boolean> => {
    if (!guard()) return false;
    setSaving(true);
    try {
      const { error } = await (supabase as any).rpc('oc_documento_cancelar', {
        p_documento_id: documentoId, p_cliente_id: clienteId, p_motivo: motivo,
      });
      if (error) throw new Error(error.message);
      toast.success('Documento cancelado.');
      await carregar();
      return true;
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Falha ao cancelar documento.');
      return false;
    } finally { setSaving(false); }
  }, [operacaoId, clienteId, carregar]);

  const carregarDetalhe = useCallback(async (documentoId: string): Promise<DocumentoDetalhe | null> => {
    if (!operacaoId) return null;
    try {
      const [hdr, comp, links] = await Promise.all([
        (supabase as any).from('zoo_operacao_documentos')
          /* O detalhe le da TABELA-BASE porque ja lia (versao, componentes, lotes vem
             dali). A view tambem expoe o emitente desde que foi recriada — as duas
             fontes concordam; esta e' so a mais curta para este caso. */
          .select('id, versao, especie, numero, serie, chave_acesso, data_emissao, observacao, url, documento_origem_id, emitente_id, emitente_nome, emitente_documento')
          .eq('id', documentoId).maybeSingle(),
        (supabase as any).from('zoo_operacao_documento_componentes')
          .select('tipo, natureza, valor, ordem, descricao').eq('documento_id', documentoId).eq('cancelado', false).order('ordem'),
        (supabase as any).from('zoo_operacao_documento_lotes').select('operacao_lote_id').eq('documento_id', documentoId),
      ]);
      if (hdr.error) throw new Error(hdr.error.message);
      const h = hdr.data as { id: string; versao: number; especie: EspecieDoc; numero: string | null; serie: string | null;
        chave_acesso: string | null; data_emissao: string | null; observacao: string | null; url: string | null; documento_origem_id: string | null;
        emitente_id: string | null; emitente_nome: string | null; emitente_documento: string | null } | null;
      if (!h) return null;
      return {
        documentoId: h.id, versao: h.versao, especie: h.especie,
        numero: h.numero ?? '', serie: h.serie ?? '', chaveAcesso: h.chave_acesso ?? '',
        dataEmissao: h.data_emissao ?? '', observacao: h.observacao ?? '', url: h.url ?? '',
        documentoOrigemId: h.documento_origem_id,
        emitenteId: h.emitente_id, emitenteNome: h.emitente_nome ?? '', emitenteDocumento: h.emitente_documento ?? '',
        componentes: ((comp.data ?? []) as { tipo: string; natureza: NaturezaComp; valor: number; ordem: number; descricao: string | null }[])
          .map(c => ({ tipo: c.tipo, natureza: c.natureza, valor: Number(c.valor), ordem: c.ordem, descricao: c.descricao ?? '' })),
        loteIds: ((links.data ?? []) as { operacao_lote_id: string }[]).map(l => l.operacao_lote_id),
      };
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Falha ao carregar o documento.');
      return null;
    }
  }, [operacaoId]);

  return useMemo(() => ({ documentos, lotes, loading, saving, registrar, editar, cancelar, carregarDetalhe, anexarArquivo, urlAssinada }),
    [documentos, lotes, loading, saving, registrar, editar, cancelar, carregarDetalhe, anexarArquivo, urlAssinada]);
}
