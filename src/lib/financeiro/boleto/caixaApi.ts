/**
 * BOLETO-DDA-API-01 · D1c (a) — a API da CAIXA DE BOLETOS: toda leitura e escrita passa por aqui, pelas RPCs da D1a (118100).
 *
 * ⚠ INJETÁVEL (o molde do `patrimonioApi`): a tela recebe a API por prop; o padrão é a do banco (`caixaApiDoBanco`). A bancada
 *   sintética do gate de tela passa uma API em memória — a tela não sabe a diferença.
 * ⚠ ESCRITA SÓ PELAS `fn_boleto_*` (as tabelas não aceitam INSERT/UPDATE do `authenticated`). `fn_boleto_entrar` com `p_simular`
 *   é a PRÉVIA (nada grava); sem ele, grava e devolve o `storage_path` onde o PDF sobe (bucket `fin-documentos`, a pasta 1 é o
 *   cliente — a policy de hoje).
 * ⚠ O PDF SOBE DEPOIS DO REGISTRO: o id do boleto nasce no banco. Se o arquivo não subir, o boleto fica na caixa SEM o arquivo
 *   (a leitura já está gravada) e a tela diz "o arquivo não subiu"; nunca some calado.
 * ⚠ `(supabase as any)`: as RPCs nasceram depois do `types.ts` (a única exceção do zero-cast). Nenhum `as` além dele: o que não é
 *   do tipo vira nulo pelos leitores de linha.
 * ⚠ SENHA DO PDF: nunca passa por aqui (a leitura é local, no navegador); a sugestão vem dos TITULARES do cliente (escolha do
 *   Gabriel 14/11: só titulares).
 */
import { supabase } from '@/integrations/supabase/client';
import type { LancamentoDoRateio, TerceiroDoRateio } from './rateioNaCaixa';

type Linha = Record<string, unknown>;
const txt = (v: unknown): string | null => (typeof v === 'string' ? v : null);
const numOuNulo = (v: unknown): number | null =>
  typeof v === 'number' ? v : typeof v === 'string' && v.trim() !== '' && !Number.isNaN(Number(v)) ? Number(v) : null;
const num = (v: unknown): number => numOuNulo(v) ?? 0;
const ehLinha = (v: unknown): v is Linha => typeof v === 'object' && v !== null && !Array.isArray(v);
const linhas = (v: unknown): Linha[] => (Array.isArray(v) ? v.filter(ehLinha) : []);
const linha = (v: unknown): Linha => (ehLinha(v) ? v : {});

export type SituacaoDoTitulo = 'novo' | 'ligado' | 'sem_par' | 'descartado' | 'substituido';
const SITUACOES: readonly SituacaoDoTitulo[] = ['novo', 'ligado', 'sem_par', 'descartado', 'substituido'];
const situacaoDoTitulo = (v: unknown): SituacaoDoTitulo => SITUACOES.find((s) => s === v) ?? 'novo';

export interface ProgramadoPor { usuarioId: string | null; nome: string | null; em: string | null }
export interface LancamentoDaCaixa {
  id: string; descricao: string | null; valor: number; status: string | null; cancelado: boolean;
  vencimento: string | null; agendadoPara: string | null; pagamento: string | null;
  favorecido: string | null; favorecidoDocumento: string | null; conta: string | null;
  conciliado: boolean; programadoPor: ProgramadoPor | null;
}
export interface BoletoDaCaixa {
  id: string | null; codigoBarras: string; linhaDigitavel: string; tipo: 'bancario' | 'arrecadacao';
  valor: number | null; vencimento: string | null;
  beneficiarioNome: string | null; beneficiarioDocumento: string | null; pagadorNome: string | null; pagadorDocumento: string | null;
  origem: string | null; situacao: SituacaoDoTitulo; arquivoNome: string | null; storagePath: string | null; criadoEm: string | null;
}
export type TipoDeCandidato = 'exato' | 'soma' | 'por_nome';
export interface CandidatoDoBoleto { tipo: TipoDeCandidato; soma: number; lancamentos: LancamentoDaCaixa[] }
export type AvisoDoBoleto =
  | { codigo: 'ja_pago' }
  | { codigo: 'ja_programado'; por: ProgramadoPor | null }
  | { codigo: 'soma_diferente'; soma: number; valor: number; diferenca: number; explicacao: string | null }
  | { codigo: 'parece_ja_pago'; lancamentos: LancamentoDaCaixa[] }
  | { codigo: 'pagador_de_fora' }
  | { codigo: 'valor_lido_diferente'; lido: number; doCodigo: number }
  | { codigo: 'sem_vencimento' }
  | { codigo: 'sem_valor' };
export interface SituacaoDoBoleto { lancamentos: LancamentoDaCaixa[]; somaLigada: number | null; avisos: AvisoDoBoleto[] }

export type RespostaDeEntrar =
  | { ok: false; frase: string; motivo: string }
  | {
    ok: true; simulado: boolean; jaExiste: boolean; id: string | null; frase: string | null; storagePath: string | null;
    boleto: BoletoDaCaixa; situacao: SituacaoDoBoleto; candidatos: CandidatoDoBoleto[]; avisos: AvisoDoBoleto[];
  };
export interface ItemDaCaixa { boleto: BoletoDaCaixa; situacao: SituacaoDoBoleto }
export interface ListaDaCaixa {
  contadores: Record<SituacaoDoTitulo, number>;
  itens: ItemDaCaixa[];
}
/* ⚠ `erro` e `dados` nos DOIS ramos: o `tsconfig.app.json` (sem strict) não estreita a união pelo `ok`. */
export type Resultado<T> = { ok: true; dados: T; erro?: undefined } | { ok: false; erro: string; dados?: undefined };

/* ── leitores ─────────────────────────────────────────────────────────────────────────────────────────────────────────────── */
function programadoPor(v: unknown): ProgramadoPor | null {
  if (!ehLinha(v)) return null;
  return { usuarioId: txt(v.usuario_id), nome: txt(v.nome), em: txt(v.em) };
}
export function lancamentoDaLinha(r: Linha): LancamentoDaCaixa {
  return {
    id: String(r.id ?? ''), descricao: txt(r.descricao), valor: num(r.valor), status: txt(r.status), cancelado: r.cancelado === true,
    vencimento: txt(r.vencimento), agendadoPara: txt(r.agendado_para), pagamento: txt(r.pagamento),
    favorecido: txt(r.favorecido), favorecidoDocumento: txt(r.favorecido_documento), conta: txt(r.conta),
    conciliado: r.conciliado === true, programadoPor: programadoPor(r.programado_por),
  };
}
export function boletoDaLinha(r: Linha): BoletoDaCaixa {
  return {
    id: txt(r.id), codigoBarras: txt(r.codigo_barras) ?? '', linhaDigitavel: txt(r.linha_digitavel) ?? '',
    tipo: r.tipo === 'arrecadacao' ? 'arrecadacao' : 'bancario', valor: numOuNulo(r.valor), vencimento: txt(r.vencimento),
    beneficiarioNome: txt(r.beneficiario_nome), beneficiarioDocumento: txt(r.beneficiario_documento),
    pagadorNome: txt(r.pagador_nome), pagadorDocumento: txt(r.pagador_documento),
    origem: txt(r.origem), situacao: situacaoDoTitulo(r.situacao), arquivoNome: txt(r.arquivo_nome), storagePath: txt(r.storage_path),
    criadoEm: txt(r.criado_em),
  };
}
export function avisoDaLinha(r: Linha): AvisoDoBoleto | null {
  switch (r.codigo) {
    case 'ja_pago': return { codigo: 'ja_pago' };
    case 'ja_programado': return { codigo: 'ja_programado', por: programadoPor(r.por) };
    case 'soma_diferente': return { codigo: 'soma_diferente', soma: num(r.soma), valor: num(r.valor), diferenca: num(r.diferenca), explicacao: txt(r.explicacao) };
    case 'parece_ja_pago': return { codigo: 'parece_ja_pago', lancamentos: linhas(r.lancamentos).map(lancamentoDaLinha) };
    case 'pagador_de_fora': return { codigo: 'pagador_de_fora' };
    case 'valor_lido_diferente': return { codigo: 'valor_lido_diferente', lido: num(r.lido), doCodigo: num(r.do_codigo) };
    case 'sem_vencimento': return { codigo: 'sem_vencimento' };
    case 'sem_valor': return { codigo: 'sem_valor' };
    default: return null;
  }
}
const avisos = (v: unknown): AvisoDoBoleto[] => linhas(v).map(avisoDaLinha).filter((a): a is AvisoDoBoleto => a !== null);
export function situacaoDaLinha(r: Linha): SituacaoDoBoleto {
  return { lancamentos: linhas(r.lancamentos).map(lancamentoDaLinha), somaLigada: numOuNulo(r.soma_ligada), avisos: avisos(r.avisos) };
}
const TIPOS_DE_CANDIDATO: readonly TipoDeCandidato[] = ['exato', 'soma', 'por_nome'];
export function candidatoDaLinha(r: Linha): CandidatoDoBoleto | null {
  const tipo = TIPOS_DE_CANDIDATO.find((t) => t === r.tipo);
  if (!tipo) return null;
  return { tipo, soma: num(r.soma), lancamentos: linhas(r.lancamentos).map(lancamentoDaLinha) };
}
export function respostaDeEntrar(v: unknown): RespostaDeEntrar {
  const r = linha(v);
  if (r.ok !== true) {
    const recusa = linha(r.recusa);
    return { ok: false, motivo: txt(recusa.motivo) ?? 'recusa', frase: txt(recusa.frase) ?? 'O banco recusou este boleto. Nada foi gravado.' };
  }
  return {
    ok: true, simulado: r.simulado !== false, jaExiste: r.ja_existe === true, id: txt(r.id), frase: txt(r.frase),
    storagePath: txt(r.storage_path), boleto: boletoDaLinha(linha(r.boleto)), situacao: situacaoDaLinha(linha(r.situacao)),
    candidatos: linhas(r.candidatos).map(candidatoDaLinha).filter((c): c is CandidatoDoBoleto => c !== null),
    avisos: avisos(r.avisos),
  };
}
export function listaDaCaixa(v: unknown): ListaDaCaixa {
  const r = linha(v); const c = linha(r.contadores);
  return {
    contadores: { novo: num(c.novo), ligado: num(c.ligado), sem_par: num(c.sem_par), descartado: num(c.descartado), substituido: num(c.substituido) },
    itens: linhas(r.itens).map((i) => ({ boleto: boletoDaLinha(i), situacao: situacaoDaLinha(linha(i.situacao_atual)) })),
  };
}

/** Erro do banco: a frase pronta (P0001) vai ao operador; o resto vira a frase genérica e o texto vai ao console. */
export function fraseDoErroDaCaixa(e: unknown): string {
  const r = linha(e);
  if (r.code === 'P0001' && typeof r.message === 'string') return r.message;
  if (r.code === '42501') return 'Sem acesso a este cliente.';
  console.error('[caixa de boletos]', e);
  return 'Não consegui falar com o banco. Tente de novo.';
}

/* ── a API ────────────────────────────────────────────────────────────────────────────────────────────────────────────────── */
export interface CaixaApi {
  lista: (clienteId: string) => Promise<Resultado<ListaDaCaixa>>;
  entrar: (clienteId: string, leitura: Record<string, unknown>, simular: boolean) => Promise<Resultado<RespostaDeEntrar>>;
  subirArquivo: (caminho: string, arquivo: File) => Promise<Resultado<true>>;
  /** Os CPF/CNPJ dos titulares ATIVOS do cliente (a sugestão de senha; nunca o fornecedor). */
  documentosDosTitulares: (clienteId: string) => Promise<Resultado<string[]>>;
  /** BOLETO D3d — ignorar o boleto guardado (`descartado`, motivo obrigatório) ou trazê-lo de volta (`novo`), pela `fn_boleto_marcar`. */
  marcar: (boletoId: string, situacao: 'descartado' | 'novo', motivo: string | null) => Promise<Resultado<true>>;
  /** Gabriel 18/11 14:40 ("o PDF não aparece no lançamento"): o arquivo que já está no bucket vira DOCUMENTO do lançamento, pelo
   *  gravador de sempre (`fin_documento_registrar`; a mesma NF + o mesmo tipo de arquivo ele recusa com 23505 = "já estava"). */
  registrarDocumento: (clienteId: string, lancamentoId: string, doc: DocumentoDaCaixa) => Promise<Resultado<'gravado' | 'ja_estava'>>;
  /** CAIXA-FOLHA-RATEIO-01: os acordos de rateio ATIVOS do cliente, do lado do terceiro (nome e CPF/CNPJ dele, a parte do cliente). */
  acordosDeRateio?: (clienteId: string) => Promise<Resultado<TerceiroDoRateio[]>>;
  /** CAIXA-FOLHA-RATEIO-01: os lançamentos vivos do cliente nessas competências ('AAAA-MM'), com o nome do fornecedor. */
  lancamentosDoRateio?: (clienteId: string, competencias: readonly string[]) => Promise<Resultado<LancamentoDoRateio[]>>;
}

/** O documento que a caixa anexa: o PDF do boleto (`boleto`), o PDF/DANFE da nota (`nf`, com a chave e o número) ou o PDF ORIGINAL de
 *  vários boletos (`outro`, BOLETO-SEPARAR-01: "PDF original (N boletos)", guardado no 1º lançamento; a parcela leva só o seu). */
export interface DocumentoDaCaixa {
  especie: 'boleto' | 'nf' | 'outro' | 'comprovante'; nome: string; url: string; tamanhoBytes: number | null;
  numero?: string | null; chaveAcesso?: string | null;
  /** o tipo do arquivo (padrão PDF); a nota vai em PDF (o DANFE) E em XML (Gabriel 14:47: "o XML do e-mail não entrou") */
  tipo?: 'application/pdf' | 'application/xml';
}

export const BUCKET_DOS_BOLETOS = 'fin-documentos';

export const caixaApiDoBanco: CaixaApi = {
  async lista(clienteId) {
    const { data, error } = await (supabase as any).rpc('fn_boletos_lista', { p_cliente_id: clienteId, p_situacoes: null });
    if (error) return { ok: false, erro: fraseDoErroDaCaixa(error) };
    return { ok: true, dados: listaDaCaixa(data) };
  },
  async entrar(clienteId, leitura, simular) {
    const { data, error } = await (supabase as any).rpc('fn_boleto_entrar', { p_cliente_id: clienteId, p_leitura: leitura, p_simular: simular });
    if (error) return { ok: false, erro: fraseDoErroDaCaixa(error) };
    return { ok: true, dados: respostaDeEntrar(data) };
  },
  async subirArquivo(caminho, arquivo) {
    const { error } = await supabase.storage.from(BUCKET_DOS_BOLETOS).upload(caminho, arquivo, { upsert: false });
    if (error) { console.error('[caixa de boletos] upload', error); return { ok: false, erro: 'O arquivo não subiu.' }; }
    return { ok: true, dados: true };
  },
  async documentosDosTitulares(clienteId) {
    const { data, error } = await (supabase as any).from('fiscal_titulares').select('documento, cnpj_produtor')
      .eq('cliente_id', clienteId).eq('ativo', true);
    if (error) { console.error('[caixa de boletos] titulares', error); return { ok: false, erro: 'Não consegui ler os titulares.' }; }
    return { ok: true, dados: linhas(data).flatMap((t) => [txt(t.documento), txt(t.cnpj_produtor)]).filter((d): d is string => !!d) };
  },
  async registrarDocumento(clienteId, lancamentoId, doc) {
    /* o boleto: um PDF de boleto por lançamento — se ele já tem um (o fluxo antigo anexava como documento, ex. NF 122.049 de 17/11),
       não se anexa outro (a NF repetida o gravador já recusa sozinho, pela chave) */
    if (doc.especie === 'boleto') {
      const ja = await (supabase as any).from('financeiro_lancamento_documentos').select('id', { count: 'exact', head: true })
        .eq('cliente_id', clienteId).eq('lancamento_id', lancamentoId).eq('especie', 'boleto').eq('cancelado', false);
      if (ja.error) return { ok: false, erro: fraseDoErroDaCaixa(ja.error) };
      if ((ja.count ?? 0) > 0) return { ok: true, dados: 'ja_estava' };
    }
    /* o original de vários boletos: o MESMO arquivo no mesmo lançamento entra uma vez só */
    if (doc.especie === 'outro' || doc.especie === 'comprovante') {
      const ja = await (supabase as any).from('financeiro_lancamento_documentos').select('id', { count: 'exact', head: true })
        .eq('cliente_id', clienteId).eq('lancamento_id', lancamentoId).eq('url', doc.url).eq('cancelado', false);
      if (ja.error) return { ok: false, erro: fraseDoErroDaCaixa(ja.error) };
      if ((ja.count ?? 0) > 0) return { ok: true, dados: 'ja_estava' };
    }
    const { error } = await (supabase as any).rpc('fin_documento_registrar', {
      p_lancamento_id: lancamentoId, p_cliente_id: clienteId,
      p_payload: {
        especie: doc.especie, nome: doc.nome, tipo: doc.tipo ?? 'application/pdf', url: doc.url, tamanho_bytes: doc.tamanhoBytes,
        numero: doc.numero ?? null, chave_acesso: doc.chaveAcesso ?? null,
        ...(doc.especie === 'nf' ? { tipo_arquivo: doc.tipo ?? 'application/pdf' } : {}),
      },
    });
    if (error && linha(error).code === '23505') return { ok: true, dados: 'ja_estava' };
    if (error) return { ok: false, erro: fraseDoErroDaCaixa(error) };
    return { ok: true, dados: 'gravado' };
  },
  async acordosDeRateio(clienteId) {
    const { data, error } = await (supabase as any).from('fiscal_acordos_rateio')
      .select('id, nome, parte_produtor, terceiro:fiscal_titulares!fiscal_acordos_rateio_terceiro_id_fkey(nome, documento)')
      .eq('cliente_id', clienteId).eq('ativo', true);
    if (error) { console.error('[caixa de boletos] acordos de rateio', error); return { ok: false, erro: 'Não consegui ler os acordos de rateio.' }; }
    return { ok: true, dados: linhas(data).flatMap((a): TerceiroDoRateio[] => {
      const t = ehLinha(a.terceiro) ? a.terceiro : null;
      const id = txt(a.id); const nome = t ? txt(t.nome) : null;
      if (!id || !nome) return [];
      const parte = Number(a.parte_produtor);
      return [{ acordoId: id, acordo: txt(a.nome) ?? '', terceiro: nome, documento: t ? txt(t.documento) : null, parteDoCliente: Number.isFinite(parte) ? parte : null }];
    }) };
  },
  async lancamentosDoRateio(clienteId, competencias) {
    if (!competencias.length) return { ok: true, dados: [] };
    const { data, error } = await (supabase as any).from('financeiro_lancamentos_v2')
      .select('id, descricao, valor, data_competencia, data_vencimento, status_transacao, favorecido:financeiro_fornecedores!fk_flv2_favorecido_tenant(nome)')
      .eq('cliente_id', clienteId).eq('cancelado', false).in('data_competencia', competencias.map((c) => `${c}-01`));
    if (error) { console.error('[caixa de boletos] lançamentos do rateio', error); return { ok: false, erro: 'Não consegui ler os lançamentos do mês.' }; }
    return { ok: true, dados: linhas(data).flatMap((l): LancamentoDoRateio[] => {
      const id = txt(l.id); const comp = txt(l.data_competencia); const valor = Number(l.valor);
      if (!id || !comp || !Number.isFinite(valor)) return [];
      const f = ehLinha(l.favorecido) ? txt(l.favorecido.nome) : null;
      return [{ id, descricao: txt(l.descricao) ?? '', favorecido: f, valor: Math.abs(valor), competencia: comp.slice(0, 7), vencimento: txt(l.data_vencimento), status: txt(l.status_transacao) ?? '' }];
    }) };
  },
  async marcar(boletoId, situacao, motivo) {
    const { error } = await (supabase as any).rpc('fn_boleto_marcar', { p_id: boletoId, p_situacao: situacao, p_motivo: motivo, p_simular: false });
    if (error) return { ok: false, erro: fraseDoErroDaCaixa(error) };
    return { ok: true, dados: true };
  },
};

/** O SELO do "+ Novo ▾" (Gabriel 15/11, D1): os boletos que pedem ação = "na caixa" (novo) + "sem par". Uma contagem só, pela RLS por
 *  tenant (sem trazer as linhas). Falhou = `null` (o selo fica vazio; nunca "0" inventado). */
export async function contarBoletosQuePedemAcao(clienteId: string): Promise<number | null> {
  const { count, error } = await (supabase as any).from('boletos').select('id', { count: 'exact', head: true })
    .eq('cliente_id', clienteId).in('situacao', ['novo', 'sem_par']);
  if (error) { console.error('[caixa de boletos] contagem', error); return null; }
  return typeof count === 'number' ? count : null;
}
