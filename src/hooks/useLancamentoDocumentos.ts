/**
 * Os documentos de UM lançamento financeiro — anexo, espécie, valor e o confronto.
 *
 * ⚠ O CONFRONTO NÃO É SOMADO AQUI. `fin_documento_confronto` devolve `valor_lancamento`,
 * `valor_documentado`, `diferenca` e `confere` prontos, e as três RPCs de escrita já o
 * devolvem no envelope. Somar os documentos no front seria a segunda resposta para
 * "quanto está documentado" — e a primeira vez que discordasse do banco, ninguém saberia
 * qual vale. Por isso o hook nunca calcula: ele lê.
 *
 * ⚠ ESTE NÃO É `useOperacaoDocumentos`. O documento da OC tem componentes (acréscimo,
 * desconto comercial, retenção) e lotes; o do lançamento é uma linha só, com um valor. Os
 * dois vocabulários de espécie também diferem — aqui é `nf|boleto|recibo|comprovante|outro`,
 * o da RPC. Nada aqui deve ser "unificado" com aquele sem que os dois modelos se
 * encontrem primeiro no banco.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import type { Json, Database } from '@/integrations/supabase/types';

/* ⚠ O TIPO VEM DO BANCO, não de um `as`. A tabela entrou no `types.ts` em `eb478369`;
   antes disto o único caminho seria um cast, e ele deixaria de acusar no dia em que uma
   coluna mudasse de nome. */
type DocRow = Database['public']['Tables']['financeiro_lancamento_documentos']['Row'];

export type EspecieLancDoc = 'nf' | 'boleto' | 'recibo' | 'comprovante' | 'outro';

/** Os rótulos são do produto; os valores, do CHECK da RPC. Mudar um sem o outro recusa. */
export const ESPECIES_LANC_DOC: { value: EspecieLancDoc; label: string }[] = [
  { value: 'nf', label: 'Nota fiscal' },
  { value: 'boleto', label: 'Boleto' },
  { value: 'recibo', label: 'Recibo' },
  { value: 'comprovante', label: 'Comprovante' },
  { value: 'outro', label: 'Outro' },
];

export interface LancDocumento {
  id: string;
  especie: EspecieLancDoc;
  nome: string;
  numero: string | null;
  serie: string | null;
  chaveAcesso: string | null;
  dataEmissao: string | null;
  valorDocumento: number | null;
  url: string | null;
  tipo: string | null;
  tamanhoBytes: number | null;
  observacao: string | null;
  emitenteId: string | null;
  emitenteNome: string | null;
  emitenteDocumento: string | null;
  cancelado: boolean;
  canceladoMotivo: string | null;
  versao: number;
}

/** O que o banco responde sobre "o que está documentado bate com o lançamento?". */
export interface Confronto {
  valorLancamento: number;
  valorDocumentado: number;
  docsAtivos: number;
  docsComValor: number;
  diferenca: number;
  confere: boolean;
}

export interface LancDocPayload {
  especie: EspecieLancDoc;
  nome?: string;
  numero?: string | null;
  serie?: string | null;
  chaveAcesso?: string | null;
  dataEmissao?: string | null;
  valorDocumento?: number | null;
  observacao?: string | null;
  emitenteId?: string | null;
  emitenteNome?: string | null;
  emitenteDocumento?: string | null;
  url?: string | null;
  tipo?: string | null;
  tamanhoBytes?: number | null;
}

export interface LancamentoDocumentosApi {
  documentos: LancDocumento[];
  confronto: Confronto | null;
  loading: boolean;
  saving: boolean;
  registrar: (p: LancDocPayload) => Promise<string | null>;
  editar: (documentoId: string, versaoEsperada: number, p: LancDocPayload) => Promise<boolean>;
  cancelar: (documentoId: string, motivo: string) => Promise<boolean>;
  anexar: (documentoId: string, versaoEsperada: number, file: File) => Promise<boolean>;
  urlAssinada: (caminho: string) => Promise<string | null>;
  recarregar: () => Promise<void>;
}

const BUCKET = 'fin-documentos';
/** 10 MB — o limite é do produto; o bucket tem o seu, e a recusa aqui é a que explica. */
export const TAMANHO_MAXIMO = 10 * 1024 * 1024;
export const TIPOS_ACEITOS = ['application/pdf', 'image/jpeg', 'image/png'];

/** Só as chaves presentes sobem: `editar` altera o que recebe e preserva o resto. */
function paraJson(p: LancDocPayload): Record<string, Json> {
  const j: Record<string, Json> = { especie: p.especie };
  const por = (chave: string, v: string | number | null | undefined) => {
    /* `undefined` NÃO sobe: é assim que `editar` altera só o que recebeu. `null` sobe, e
       significa apagar — as duas ausências dizem coisas diferentes. */
    if (v !== undefined) j[chave] = v;
  };
  por('nome', p.nome);
  por('numero', p.numero);
  por('serie', p.serie);
  por('chave_acesso', p.chaveAcesso);
  por('data_emissao', p.dataEmissao);
  por('valor_documento', p.valorDocumento);
  por('observacao', p.observacao);
  por('emitente_id', p.emitenteId);
  por('emitente_nome', p.emitenteNome);
  por('emitente_documento', p.emitenteDocumento);
  por('url', p.url);
  por('tipo', p.tipo);
  por('tamanho_bytes', p.tamanhoBytes);
  return j;
}

/**
 * Texto do banco → espécie do vocabulário, sem cast.
 *
 * ⚠ EXPORTADA porque a TELA precisa dela: o `Select` devolve `string`, e converter com
 * `as` ali aceitaria calado um valor que a RPC recusaria. Fora do vocabulário vira
 * `'outro'`, que é a espécie que o próprio banco usa como padrão.
 */
export const especieValida = (e: unknown): EspecieLancDoc =>
  e === 'nf' || e === 'boleto' || e === 'recibo' || e === 'comprovante' ? e : 'outro';

function daLinha(r: DocRow): LancDocumento {
  const n = (v: unknown) => (v == null ? null : Number(v));
  const s = (v: unknown) => (v == null ? null : String(v));
  return {
    id: String(r.id),
    especie: especieValida(r.especie),
    nome: String(r.nome ?? ''),
    numero: s(r.numero), serie: s(r.serie), chaveAcesso: s(r.chave_acesso),
    dataEmissao: s(r.data_emissao), valorDocumento: n(r.valor_documento),
    url: s(r.url), tipo: s(r.tipo), tamanhoBytes: n(r.tamanho_bytes),
    observacao: s(r.observacao),
    emitenteId: s(r.emitente_id), emitenteNome: s(r.emitente_nome),
    emitenteDocumento: s(r.emitente_documento),
    cancelado: r.cancelado === true, canceladoMotivo: s(r.cancelado_motivo),
    versao: Number(r.versao ?? 1),
  };
}

/** O envelope do banco → o que a tela lê. Ausente vira `null`, nunca zero. */
export function daConfronto(c: Json | null | undefined): Confronto | null {
  /* ⚠ NARROWING, NÃO CAST: `jsonb` chega como `Json`, que pode ser número, texto ou lista.
     Perguntar antes de ler é o que mantém o zero-cast — e o que faz a tela mostrar "—" em
     vez de quebrar se a RPC um dia responder outra coisa. */
  if (!c || typeof c !== 'object' || Array.isArray(c)) return null;
  return {
    valorLancamento: Number(c.valor_lancamento ?? 0),
    valorDocumentado: Number(c.valor_documentado ?? 0),
    docsAtivos: Number(c.docs_ativos ?? 0),
    docsComValor: Number(c.docs_com_valor ?? 0),
    diferenca: Number(c.diferenca ?? 0),
    confere: c.confere === true,
  };
}

export function useLancamentoDocumentos(
  lancamentoId: string | null,
  clienteId: string | null,
): LancamentoDocumentosApi {
  const [documentos, setDocumentos] = useState<LancDocumento[]>([]);
  const [confronto, setConfronto] = useState<Confronto | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const montado = useRef(true);
  useEffect(() => () => { montado.current = false; }, []);

  const habilitado = !!lancamentoId && !!clienteId;

  const recarregar = useCallback(async () => {
    if (!habilitado) { setDocumentos([]); setConfronto(null); return; }
    setLoading(true);
    try {
      /* A lista vem da tabela e o confronto da RPC — duas perguntas, duas fontes, e a
         segunda é a que manda no topo. */
      const [lista, conf] = await Promise.all([
        supabase.from('financeiro_lancamento_documentos')
          .select('*').eq('lancamento_id', lancamentoId!).eq('cliente_id', clienteId!)
          .order('uploaded_em', { ascending: false }),
        supabase.rpc('fin_documento_confronto', {
          p_lancamento_id: lancamentoId!, p_cliente_id: clienteId!,
        }),
      ]);
      if (!montado.current) return;
      if (lista.error) throw lista.error;
      if (conf.error) throw conf.error;
      setDocumentos((lista.data ?? []).map(daLinha));
      setConfronto(daConfronto(conf.data));
    } finally {
      if (montado.current) setLoading(false);
    }
  }, [lancamentoId, clienteId, habilitado]);

  useEffect(() => { void recarregar(); }, [recarregar]);

  /* ⚠ AS TRÊS ESCRITAS DEVOLVEM O CONFRONTO no próprio envelope, então o topo se atualiza
     sem uma ida a mais. `recarregar` continua vindo depois porque a LISTA também mudou. */
  const aplicarEnvelope = (env: Json | null): Record<string, Json> | null => {
    if (!env || typeof env !== 'object' || Array.isArray(env)) return null;
    const c = daConfronto(env.confronto);
    if (c && montado.current) setConfronto(c);
    return env;
  };

  const registrar = useCallback(async (p: LancDocPayload): Promise<string | null> => {
    if (!habilitado) return null;
    setSaving(true);
    try {
      const { data, error } = await supabase.rpc('fin_documento_registrar', {
        p_lancamento_id: lancamentoId!, p_cliente_id: clienteId!, p_payload: paraJson(p),
      });
      if (error) throw error;
      const env = aplicarEnvelope(data);
      await recarregar();
      const id = env?.documento_id;
      return id ? String(id) : null;
    } finally {
      if (montado.current) setSaving(false);
    }
  }, [lancamentoId, clienteId, habilitado, recarregar]);

  const editar = useCallback(async (documentoId: string, versaoEsperada: number, p: LancDocPayload) => {
    if (!clienteId) return false;
    setSaving(true);
    try {
      const { data, error } = await supabase.rpc('fin_documento_editar', {
        p_documento_id: documentoId, p_cliente_id: clienteId,
        p_versao_esperada: versaoEsperada, p_payload: paraJson(p),
      });
      if (error) throw error;
      aplicarEnvelope(data);
      await recarregar();
      return true;
    } finally {
      if (montado.current) setSaving(false);
    }
  }, [clienteId, recarregar]);

  const cancelar = useCallback(async (documentoId: string, motivo: string) => {
    if (!clienteId) return false;
    setSaving(true);
    try {
      const { data, error } = await supabase.rpc('fin_documento_cancelar', {
        p_documento_id: documentoId, p_cliente_id: clienteId, p_motivo: motivo,
      });
      if (error) throw error;
      aplicarEnvelope(data);
      await recarregar();
      return true;
    } finally {
      if (montado.current) setSaving(false);
    }
  }, [clienteId, recarregar]);

  /**
   * Sobe o arquivo e grava a URL no documento que já existe.
   *
   * ⚠ REGISTRAR PRIMEIRO, ANEXAR DEPOIS é permitido de propósito: um documento sem
   * arquivo aparece na lista dizendo "sem arquivo", e lixo visível se conserta. Se o
   * upload viesse antes do registro, uma falha no meio deixaria arquivo no bucket sem
   * nenhuma linha apontando para ele — lixo invisível, que ninguém acha para limpar.
   */
  const anexar = useCallback(async (documentoId: string, versaoEsperada: number, file: File) => {
    if (!habilitado) return false;
    if (!TIPOS_ACEITOS.includes(file.type)) throw new Error('Formato não aceito. Envie PDF, JPG ou PNG.');
    if (file.size > TAMANHO_MAXIMO) throw new Error('Arquivo acima de 10 MB.');
    setSaving(true);
    try {
      const caminho = `${clienteId}/${lancamentoId}/${Date.now()}-${file.name}`;
      const up = await supabase.storage.from(BUCKET).upload(caminho, file, { upsert: false });
      if (up.error) throw up.error;
      return await editar(documentoId, versaoEsperada, {
        especie: documentos.find(d => d.id === documentoId)?.especie ?? 'outro',
        url: caminho, tipo: file.type, tamanhoBytes: file.size,
      });
    } finally {
      if (montado.current) setSaving(false);
    }
  }, [habilitado, clienteId, lancamentoId, documentos, editar]);

  const urlAssinada = useCallback(async (caminho: string) => {
    const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(caminho, 60);
    if (error) return null;
    return data?.signedUrl ?? null;
  }, []);

  return { documentos, confronto, loading, saving, registrar, editar, cancelar, anexar, urlAssinada, recarregar };
}
