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
   coluna mudasse de nome.
   ⚠ A LISTA AGORA VEM DA VIEW — DOC-UMA-FONTE-01. `vw_lancamento_documentos` une os
   documentos próprios do lançamento aos da OC que o gerou (por `zoo_operacao_partes`), no
   mesmo formato. Toda coluna dela é nullable, porque é o que o Postgres declara para um
   UNION — por isso o mapeamento continua perguntando antes de ler. */
type DocRow = Database['public']['Views']['vw_lancamento_documentos']['Row'];

export type EspecieLancDoc = 'nf' | 'boleto' | 'recibo' | 'comprovante' | 'outro';

/** Os rótulos são do produto; os valores, do CHECK da RPC. Mudar um sem o outro recusa. */
export const ESPECIES_LANC_DOC: { value: EspecieLancDoc; label: string }[] = [
  { value: 'nf', label: 'Nota fiscal' },
  { value: 'boleto', label: 'Boleto' },
  { value: 'recibo', label: 'Recibo' },
  { value: 'comprovante', label: 'Comprovante' },
  { value: 'outro', label: 'Outro' },
];

/** De onde o documento vem — e, com ele, qual writer o governa. */
export type OrigemLancDoc = 'lancamento' | 'operacao';

export interface LancDocumento {
  id: string;
  /**
   * ⚠ A ORIGEM DECIDE O WRITER, não a aparência. `'operacao'` significa que o documento é
   * da OC: quem o edita, cancela e guarda o arquivo é a família `oc_documento_*`, no bucket
   * `oc-documentos`. Tratar os dois iguais criaria duas cópias do mesmo papel.
   */
  origem: OrigemLancDoc;
  /** A operação dona, quando `origem === 'operacao'`. É o endereço do drill para a OC. */
  operacaoId: string | null;
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
  /**
   * A operação que gerou este lançamento, quando existe parte viva — DOC-UMA-FONTE-01.
   *
   * ⚠ É O QUE DECIDE ONDE O PRÓXIMO DOCUMENTO NASCE. Com operação, "Adicionar" grava na
   * OC (`oc_documento_registrar`, bucket `oc-documentos`); sem ela, no próprio lançamento.
   * Nunca as duas: uma NF em duas tabelas são dois papéis que divergem no primeiro
   * cancelamento.
   */
  operacaoId: string | null;
  /** 'compra' | 'venda' | 'abate' — o parâmetro certo para reabrir a OC. */
  operacaoTipo: string | null;
  registrar: (p: LancDocPayload) => Promise<string | null>;
  editar: (documentoId: string, versaoEsperada: number, p: LancDocPayload) => Promise<boolean>;
  cancelar: (documentoId: string, motivo: string) => Promise<boolean>;
  anexar: (documentoId: string, versaoEsperada: number, file: File) => Promise<boolean>;
  urlAssinada: (caminho: string, origem?: OrigemLancDoc) => Promise<string | null>;
  recarregar: () => Promise<void>;
}

const BUCKET = 'fin-documentos';
const BUCKET_OC = 'oc-documentos';

/**
 * Espécie do lançamento → espécie da OC.
 *
 * ⚠ OS DOIS VOCABULÁRIOS NÃO SE CORRESPONDEM UM A UM, e o CHECK da RPC da OC só aceita
 * `nf_principal | nf_complementar | recibo | outro`. Boleto e comprovante não existem lá:
 * viram `outro`, e a espécie escolhida some. Por isso o formulário avisa, em vez de
 * deixar o operador descobrir depois abrindo a OC.
 * ⚠ `nf_complementar` NUNCA é escolhida daqui: ela exige `documento_origem_id`, que é uma
 * decisão sobre qual NF ela complementa — pergunta que só a aba da OC sabe fazer.
 */
export function especieParaOC(e: EspecieLancDoc): string {
  return e === 'nf' ? 'nf_principal' : e === 'recibo' ? 'recibo' : 'outro';
}
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

/** Texto do banco → origem do vocabulário, sem cast. Desconhecido vira `'lancamento'`,
 *  que é o caminho conservador: o writer do próprio lançamento recusa o que não é dele. */
const origemValida = (o: unknown): OrigemLancDoc => (o === 'operacao' ? 'operacao' : 'lancamento');

function daLinha(r: DocRow): LancDocumento {
  const n = (v: unknown) => (v == null ? null : Number(v));
  const s = (v: unknown) => (v == null ? null : String(v));
  return {
    id: String(r.documento_id),
    origem: origemValida(r.origem),
    operacaoId: s(r.operacao_id),
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

/**
 * O confronto contando as DUAS origens — DOC-UMA-FONTE-01.
 *
 * ⚠ ESTA SOMA CONTRARIA O QUE ESTE ARQUIVO DIZIA, e é deliberado. `fin_documento_confronto`
 * lê `financeiro_lancamento_documentos` e só ela: a NF que mora na OC ficava fora, e o
 * lançamento aparecia como "nada documentado" tendo a nota anexada um clique adiante. A
 * pergunta mudou — "quanto deste lançamento está documentado, venha o papel de onde vier" —
 * e a resposta antiga não a respondia.
 * ⚠ A ARITMÉTICA É A DA RPC, copiada da definição dela, não redigitada de cabeça:
 * `confere` exige ao menos um documento COM valor e diferença de até R$ 0,01; a diferença é
 * documentado − lançamento, arredondada a 2 casas. Se as duas contas divergirem um dia, é
 * porque alguém mudou uma sem a outra.
 * ⚠ A CORREÇÃO DE RAIZ É NO BANCO: `fin_documento_confronto` passar a ler
 * `vw_lancamento_documentos`. Aí esta função morre e o topo volta a só formatar o que leu.
 * Enquanto ela existe, `valor_lancamento` continua vindo do banco — o front não inventa
 * nem o valor do lançamento nem a tolerância.
 */
export function confrontoDasDuasOrigens(
  doBanco: Confronto | null, docs: readonly LancDocumento[],
): Confronto | null {
  if (!doBanco) return null;
  const ativos = docs.filter(d => !d.cancelado);
  const comValor = ativos.filter(d => d.valorDocumento != null);
  const total = comValor.reduce((acc, d) => acc + (d.valorDocumento ?? 0), 0);
  const diferenca = Math.round((total - doBanco.valorLancamento) * 100) / 100;
  return {
    valorLancamento: doBanco.valorLancamento,
    valorDocumentado: total,
    docsAtivos: ativos.length,
    docsComValor: comValor.length,
    diferenca,
    confere: comValor.length > 0 && Math.abs(diferenca) <= 0.01,
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
  const [operacaoId, setOperacaoId] = useState<string | null>(null);
  const [operacaoTipo, setOperacaoTipo] = useState<string | null>(null);
  const montado = useRef(true);
  useEffect(() => () => { montado.current = false; }, []);

  const habilitado = !!lancamentoId && !!clienteId;

  const recarregar = useCallback(async () => {
    if (!habilitado) { setDocumentos([]); setConfronto(null); return; }
    setLoading(true);
    try {
      /* A lista vem da VIEW (as duas origens) e o valor do lançamento continua vindo da
         RPC — quem sabe quanto vale o lançamento é o banco. */
      const [lista, conf] = await Promise.all([
        supabase.from('vw_lancamento_documentos')
          .select('*').eq('lancamento_id', lancamentoId!).eq('cliente_id', clienteId!)
          .order('uploaded_em', { ascending: false }),
        supabase.rpc('fin_documento_confronto', {
          p_lancamento_id: lancamentoId!, p_cliente_id: clienteId!,
        }),
      ]);
      if (!montado.current) return;
      if (lista.error) throw lista.error;
      if (conf.error) throw conf.error;
      const docs = (lista.data ?? []).map(daLinha);
      setDocumentos(docs);
      setConfronto(confrontoDasDuasOrigens(daConfronto(conf.data), docs));

      /* ⚠ A PERGUNTA É FEITA MESMO SEM DOCUMENTO NENHUM. Deduzir a operação das linhas da
         view só funcionaria depois do primeiro documento — e é justamente o primeiro que
         precisa saber onde nascer. */
      const parte = await supabase
        .from('zoo_operacao_partes')
        .select('operacao_id, zoo_operacoes_comerciais(tipo_operacao)')
        .eq('financeiro_lancamento_id', lancamentoId!)
        .neq('cancelada', true)
        .limit(1)
        .maybeSingle();
      if (!montado.current) return;
      setOperacaoId(parte.data?.operacao_id ?? null);
      /* ⚠ O TIPO É METADE DO ENDEREÇO — a lição do PR-OC-VENDA-FIN-PREVISAO-01D. `oc_compra`,
         `oc_venda` e `oc_abate` são parâmetros diferentes, e abrir uma venda como compra faz
         a hidratação recusar e largar o usuário sem modal. Vem no mesmo embed para não
         custar uma segunda ida. */
      const op = parte.data?.zoo_operacoes_comerciais;
      setOperacaoTipo(op && typeof op.tipo_operacao === 'string' ? op.tipo_operacao : null);
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
      /* ⚠ COM OPERAÇÃO, O DOCUMENTO NASCE NA OC — nunca uma cópia de cada lado.
         ⚠ E NASCE SEM VALOR: no modelo da OC o valor de um documento vem dos COMPONENTES
         (acréscimo, desconto comercial, retenção), que mexem na liquidação da operação.
         Escolher uma natureza aqui seria decidir dinheiro por conta própria; por isso o
         formulário esconde o campo de valor quando o destino é a OC e diz onde ele mora. */
      const { data, error } = operacaoId
        ? await supabase.rpc('oc_documento_registrar', {
            p_operacao_id: operacaoId, p_cliente_id: clienteId!,
            p_payload: { ...paraJson(p), especie: especieParaOC(p.especie), valor_documento: undefined },
          })
        : await supabase.rpc('fin_documento_registrar', {
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

  /* Quem governa o documento é a origem DELE, não a do lançamento: um lançamento de OC
     pode ter, no futuro, documento próprio; e o writer errado recusaria — ou pior,
     aceitaria e a outra tabela não ficaria sabendo. */
  const origemDoDocumento = useCallback(
    (documentoId: string): OrigemLancDoc =>
      documentos.find(d => d.id === documentoId)?.origem ?? 'lancamento',
    [documentos]);

  const editar = useCallback(async (documentoId: string, versaoEsperada: number, p: LancDocPayload) => {
    if (!clienteId) return false;
    setSaving(true);
    try {
      const daOC = origemDoDocumento(documentoId) === 'operacao';
      const { data, error } = daOC
        ? await supabase.rpc('oc_documento_editar', {
            p_documento_id: documentoId, p_cliente_id: clienteId,
            p_versao_esperada: versaoEsperada,
            p_payload: { ...paraJson(p), especie: especieParaOC(p.especie), valor_documento: undefined },
          })
        : await supabase.rpc('fin_documento_editar', {
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
      const { data, error } = origemDoDocumento(documentoId) === 'operacao'
        ? await supabase.rpc('oc_documento_cancelar', {
            p_documento_id: documentoId, p_cliente_id: clienteId, p_motivo: motivo,
          })
        : await supabase.rpc('fin_documento_cancelar', {
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
      const doc = documentos.find(d => d.id === documentoId);
      const daOC = doc?.origem === 'operacao';
      /* ⚠ CADA BUCKET COM O SEU CAMINHO. O da OC é `{cliente}/{operacao}/{documento}.ext` —
         a convenção de `caminhoDocumentoOC`, e é dela que a policy por cliente depende
         (`foldername[1]`). Subir o arquivo da OC no caminho do lançamento passaria na
         policy e deixaria o arquivo onde a aba da OC não o procura. */
      const caminho = daOC && doc?.operacaoId
        ? `${clienteId}/${doc.operacaoId}/${documentoId}.${file.name.split('.').pop() ?? 'bin'}`
        : `${clienteId}/${lancamentoId}/${Date.now()}-${file.name}`;
      const up = await supabase.storage.from(daOC ? BUCKET_OC : BUCKET)
        .upload(caminho, file, { upsert: false });
      if (up.error) throw up.error;
      return await editar(documentoId, versaoEsperada, {
        especie: doc?.especie ?? 'outro',
        url: caminho, tipo: file.type, tamanhoBytes: file.size,
      });
    } finally {
      if (montado.current) setSaving(false);
    }
  }, [habilitado, clienteId, lancamentoId, documentos, editar]);

  /* ⚠ O ARQUIVO MORA NO BUCKET DA ORIGEM. Assinar no bucket errado devolve 404 e a tela
     diria "não foi possível abrir" sobre um arquivo que existe. A policy de leitura do
     `oc-documentos` é por CLIENTE (`foldername[1] IN get_user_cliente_ids`), não por
     operação — então quem abre o lançamento baixa a NF da OC sem permissão nova. */
  const urlAssinada = useCallback(async (caminho: string, origem: OrigemLancDoc = 'lancamento') => {
    const bucket = origem === 'operacao' ? BUCKET_OC : BUCKET;
    const { data, error } = await supabase.storage.from(bucket).createSignedUrl(caminho, 60);
    if (error) return null;
    return data?.signedUrl ?? null;
  }, []);

  return { documentos, confronto, loading, saving, operacaoId, operacaoTipo,
    registrar, editar, cancelar, anexar, urlAssinada, recarregar };
}
