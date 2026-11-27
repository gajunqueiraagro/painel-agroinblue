/**
 * BOLETO D3c — a API do E-MAIL DE BOLETOS na tela: o endereço do cliente (gerar · trocar · revogar) e a ÁREA DE ESPERA (o que chegou
 * por e-mail e ainda pede um gesto). Tudo pelas RPCs e tabelas da 118110.
 *
 * ⚠ INJETÁVEL (o molde do `caixaApi`): a caixa recebe por prop; o padrão é a do banco. A bancada do gate passa uma em memória.
 * ⚠ ESCRITA SÓ PELAS `fn_entrada_*` (as tabelas só aceitam SELECT do `authenticated`, pela RLS por tenant). Gerar/trocar/revogar têm
 *   PRÉVIA (`p_simular` true) antes do gesto que grava.
 * ⚠ O DOMÍNIO É DO BANCO (`_fn_entrada_dominio`, o mesmo da Edge Function): a tela nunca o escreve.
 * ⚠ O ARQUIVO JÁ ESTÁ NO STORAGE (`fin-documentos/<cliente>/entrada/<md5>`): a tela BAIXA para ler com o leitor de hoje; o corpo do
 *   e-mail não existe aqui (nunca foi guardado).
 * ⚠ `(supabase as any)`: as tabelas e RPCs nasceram depois do `types.ts` (a única exceção do zero-cast).
 */
import { supabase } from '@/integrations/supabase/client';
import { BUCKET_DOS_BOLETOS, type Resultado } from './caixaApi';
import type { LeituraGravada } from './leituraGravada';

type Linha = Record<string, unknown>;
const txt = (v: unknown): string | null => (typeof v === 'string' ? v : null);
const ehLinha = (v: unknown): v is Linha => typeof v === 'object' && v !== null && !Array.isArray(v);
const linha = (v: unknown): Linha => (ehLinha(v) ? v : {});
const numOuNulo = (v: unknown): number | null => (typeof v === 'number' ? v : null);

export type EstadoDaEntrada =
  | 'a_ler' | 'boleto' | 'nota' | 'folha' | 'nao_reconhecido' | 'sem_anexo' | 'recusado' | 'confirmacao_gmail' | 'dispensado';
const ESTADOS: readonly EstadoDaEntrada[] = ['a_ler', 'boleto', 'nota', 'folha', 'nao_reconhecido', 'sem_anexo', 'recusado', 'confirmacao_gmail', 'dispensado'];
/** Os que pedem um gesto (o índice `ix_entrada_arquivos_abertos` da 118110). */
export const ESTADOS_ABERTOS: readonly EstadoDaEntrada[] = ['a_ler', 'nao_reconhecido', 'sem_anexo', 'recusado', 'confirmacao_gmail'];

export interface EntradaDoEmail {
  id: string; mensagemId: string; remetente: string | null; assunto: string | null; recebidoEm: string | null;
  arquivoNome: string | null; tipo: 'pdf' | 'xml' | null; tamanhoBytes: number | null; storagePath: string | null;
  estado: EstadoDaEntrada; motivo: string | null; chegouDeNovo: number;
  /** BOLETO D3d (118180) — o motivo de ignorar ("dispensado" = ignorado), o detalhe, quando; e o que a linha virou ao resolver. */
  ignoradoMotivo: MotivoDeIgnorar | 'anterior_a_regra' | null; ignoradoDetalhe: string | null; ignoradoEm: string | null;
  boletoId: string | null; lancamentoId: string | null; resolvidoEm: string | null;
  /** 118610: 'arrastado' = o arquivo solto na Caixa (CAIXA-FOLHA-VERA: registrado NA HORA, não mais no gesto; sem remetente; quem arrastou vem de `resolvidos`) */
  origem?: 'email' | 'arrastado';
  /** ENTRADA-CENTRAL-01 F1 (118880): a leitura guardada, crua do banco (quem usa confere: `daGravada`); null = ainda não lida */
  leitura?: unknown;
}

/** 118610 — o arquivo arrastado registrado no gesto: a linha da entrada e onde o arquivo sobe (já existia = a mesma linha, não sobe de novo). */
export interface ArrastadoRegistrado { id: string; storagePath: string; jaExistia: boolean; estado: string }
/** 118610 — Resolvidos: quem, quando e o que gerou (folha: tipo, competência, lançamentos; boleto; nota). */
export interface DetalheDoResolvido {
  quem: string | null; quando: string | null;
  folha: { tipo: string | null; competencia: string | null; lancamentos: number; pessoas: number } | null;
  boleto: { beneficiario: string | null; valor: number | null; vencimento: string | null } | null;
  nota: { lancamentoId: string | null; descricao: string | null; valor: number | null } | null;
}

/** D6 — os motivos de ignorar que a tela oferece (o banco recusa outro; 'anterior_a_regra' só o banco grava). */
export type MotivoDeIgnorar = 'antigo' | 'repetido' | 'outro_cliente' | 'nao_e_documento' | 'outro';
export const MOTIVOS_DE_IGNORAR: readonly { valor: MotivoDeIgnorar; rotulo: string }[] = [
  { valor: 'antigo', rotulo: 'Boleto antigo ou já pago' },
  { valor: 'repetido', rotulo: 'Repetido (já chegou antes)' },
  { valor: 'outro_cliente', rotulo: 'Não é deste cliente' },
  { valor: 'nao_e_documento', rotulo: 'Não é boleto nem nota (propaganda, comprovante…)' },
  { valor: 'outro', rotulo: 'Outro motivo' },
];
const MOTIVOS = ['antigo', 'repetido', 'outro_cliente', 'nao_e_documento', 'outro', 'anterior_a_regra'] as const;
export function rotuloDoMotivo(m: EntradaDoEmail['ignoradoMotivo']): string {
  if (m === 'anterior_a_regra') return 'dispensado antes da regra do motivo';
  return MOTIVOS_DE_IGNORAR.find((x) => x.valor === m)?.rotulo ?? '—';
}
export function entradaDaLinha(r: Linha): EntradaDoEmail {
  return {
    id: String(r.id ?? ''), mensagemId: txt(r.mensagem_id) ?? '', remetente: txt(r.remetente), assunto: txt(r.assunto),
    recebidoEm: txt(r.recebido_em), arquivoNome: txt(r.arquivo_nome), tipo: r.tipo === 'pdf' || r.tipo === 'xml' ? r.tipo : null,
    tamanhoBytes: numOuNulo(r.tamanho_bytes), storagePath: txt(r.storage_path),
    estado: ESTADOS.find((e) => e === r.estado) ?? 'a_ler', motivo: txt(r.motivo), chegouDeNovo: numOuNulo(r.chegou_de_novo) ?? 0,
    ignoradoMotivo: MOTIVOS.find((m) => m === r.ignorado_motivo) ?? null, ignoradoDetalhe: txt(r.ignorado_detalhe), ignoradoEm: txt(r.dispensado_em),
    boletoId: txt(r.boleto_id), lancamentoId: txt(r.lancamento_id), resolvidoEm: txt(r.lido_em),
    origem: r.origem === 'arrastado' ? 'arrastado' : 'email',
    leitura: r.leitura ?? null,
  };
}

export interface EnderecoDoCliente { endereco: string | null; criadoEm: string | null; dominio: string }
export interface RespostaDoEndereco { simulado: boolean; endereco: string | null; antigo: string | null }
export function respostaDoEndereco(v: unknown): RespostaDoEndereco {
  const r = linha(v);
  return { simulado: r.simulado !== false, endereco: txt(r.endereco), antigo: txt(r.antigo) };
}

/** Erro do banco: as frases das `fn_entrada_*` (P0001, e o 42501 delas, que começa por "Só"/"Sem acesso") vão ao operador; o resto
 *  vira a frase genérica e o texto vai ao console. */
export function fraseDoErroDaEntrada(e: unknown): string {
  const r = linha(e);
  const m = typeof r.message === 'string' ? r.message : '';
  if (r.code === 'P0001' && m) return m;
  if (r.code === '42501') return /^(Só |Sem acesso)/.test(m) ? m : 'Sem acesso a este cliente.';
  console.error('[e-mail de boletos]', e);
  return 'Não consegui falar com o banco. Tente de novo.';
}

/** A nota (pela chave) que JÁ ESTÁ num lançamento vivo do cliente: o documento com a mesma chave (D3 — "já lançada · Vincular"). */
export interface NotaNoSistema { lancamentoId: string; descricao: string | null; valor: number | null; vencimento: string | null }

export interface EntradaEmailApi {
  endereco: (clienteId: string) => Promise<Resultado<EnderecoDoCliente>>;
  gerar: (clienteId: string, motivo: string | null, simular: boolean) => Promise<Resultado<RespostaDoEndereco>>;
  revogar: (clienteId: string, motivo: string, simular: boolean) => Promise<Resultado<RespostaDoEndereco>>;
  /** BOLETO D3d — TUDO o que chegou (a resolver, resolvidos e ignorados), mais novos primeiro (até 300). */
  todas: (clienteId: string) => Promise<Resultado<EntradaDoEmail[]>>;
  baixar: (storagePath: string) => Promise<Resultado<Blob>>;
  /** D6 — ignorar com motivo (vários de uma vez), voltar (Ignorados/Resolvidos → A resolver) e resolver (boleto ou nota). Sem prévia na
   *  tela: o gesto já é a escolha explícita (o minimodal do motivo), e o banco recusa o que não cabe. */
  ignorar: (ids: string[], motivo: MotivoDeIgnorar, detalhe: string | null) => Promise<Resultado<true>>;
  voltar: (id: string) => Promise<Resultado<true>>;
  /** 'folha' (FOLHA-NA-CAIXA-01): o recibo do contador aplicado — o banco aceita depois do lote da entrada (estado novo) */
  resolver: (id: string, estado: 'boleto' | 'nota' | 'folha', boletoId: string | null, lancamentoId: string | null) => Promise<Resultado<true>>;
  /** As chaves que já estão num lançamento vivo do cliente (pelo documento). Falhou = erro (P146: nunca "não achei"). */
  notasNoSistema: (clienteId: string, chaves: string[]) => Promise<Resultado<Record<string, NotaNoSistema>>>;
  /** 118610 (opcionais: a bancada antiga não tem; sem eles o arrastado fica só na sessão, como antes) */
  registrarArrastado?: (clienteId: string, a: { nome: string; tipo: 'pdf' | 'xml'; tamanho: number; md5: string }) => Promise<Resultado<ArrastadoRegistrado>>;
  resolvidos?: (clienteId: string) => Promise<Resultado<Record<string, DetalheDoResolvido>>>;
  /** ENTRADA-CENTRAL-01 F1 (118880): guarda o resultado da leitura feita no navegador (só se a linha não tem a desta versão; o texto nunca) */
  guardarLeitura?: (id: string, leitura: LeituraGravada) => Promise<Resultado<true>>;
  /** CAIXA-ATUALIZAR-01: a pergunta barata da atualização automática — quando entrou a linha mais nova do cliente (null = nenhuma) */
  ultimaChegada?: (clienteId: string) => Promise<Resultado<string | null>>;
}

const COLUNAS = 'id, mensagem_id, remetente, assunto, recebido_em, arquivo_nome, tipo, tamanho_bytes, storage_path, estado, motivo, chegou_de_novo, '
  + 'ignorado_motivo, ignorado_detalhe, dispensado_em, boleto_id, lancamento_id, lido_em, origem, leitura';

export const entradaEmailApiDoBanco: EntradaEmailApi = {
  async ultimaChegada(clienteId) {
    const { data, error } = await (supabase as any).from('entrada_arquivos').select('criado_em, ultima_chegada_em').eq('cliente_id', clienteId)
      .order('criado_em', { ascending: false }).limit(1);
    if (error) return { ok: false, erro: fraseDoErroDaEntrada(error) };
    const r: unknown = Array.isArray(data) ? data[0] : null;
    const em = r && typeof r === 'object' && 'criado_em' in r && typeof r.criado_em === 'string' ? r.criado_em : null;
    return { ok: true, dados: em };
  },
  async endereco(clienteId) {
    const [d, e] = await Promise.all([
      (supabase as any).rpc('_fn_entrada_dominio'),
      (supabase as any).from('cliente_entrada_email').select('local, criado_em').eq('cliente_id', clienteId).eq('ativo', true).maybeSingle(),
    ]);
    if (d.error || e.error) return { ok: false, erro: fraseDoErroDaEntrada(d.error ?? e.error) };
    const dominio = txt(d.data) ?? '';
    const r = linha(e.data);
    const local = txt(r.local);
    return { ok: true, dados: { dominio, endereco: local && dominio ? `${local}@${dominio}` : null, criadoEm: txt(r.criado_em) } };
  },
  async gerar(clienteId, motivo, simular) {
    const { data, error } = await (supabase as any).rpc('fn_entrada_email_gerar', { p_cliente_id: clienteId, p_motivo: motivo, p_simular: simular });
    if (error) return { ok: false, erro: fraseDoErroDaEntrada(error) };
    return { ok: true, dados: respostaDoEndereco(data) };
  },
  async revogar(clienteId, motivo, simular) {
    const { data, error } = await (supabase as any).rpc('fn_entrada_email_revogar', { p_cliente_id: clienteId, p_motivo: motivo, p_simular: simular });
    if (error) return { ok: false, erro: fraseDoErroDaEntrada(error) };
    return { ok: true, dados: respostaDoEndereco(data) };
  },
  async todas(clienteId) {
    const { data, error } = await (supabase as any).from('entrada_arquivos').select(COLUNAS).eq('cliente_id', clienteId)
      .order('recebido_em', { ascending: false }).limit(300);
    if (error) return { ok: false, erro: fraseDoErroDaEntrada(error) };
    return { ok: true, dados: (Array.isArray(data) ? data.filter(ehLinha) : []).map(entradaDaLinha) };
  },
  async baixar(storagePath) {
    const { data, error } = await supabase.storage.from(BUCKET_DOS_BOLETOS).download(storagePath);
    if (error || !data) { console.error('[e-mail de boletos] baixar', error); return { ok: false, erro: 'Não consegui abrir o arquivo que chegou.' }; }
    return { ok: true, dados: data };
  },
  async ignorar(ids, motivo, detalhe) {
    const { error } = await (supabase as any).rpc('fn_entrada_ignorar', { p_ids: ids, p_motivo: motivo, p_detalhe: detalhe, p_simular: false });
    if (error) return { ok: false, erro: fraseDoErroDaEntrada(error) };
    return { ok: true, dados: true };
  },
  async voltar(id) {
    const { error } = await (supabase as any).rpc('fn_entrada_voltar', { p_id: id, p_simular: false });
    if (error) return { ok: false, erro: fraseDoErroDaEntrada(error) };
    return { ok: true, dados: true };
  },
  async resolver(id, estado, boletoId, lancamentoId) {
    const { error } = await (supabase as any).rpc('fn_entrada_resolver', { p_id: id, p_estado: estado, p_boleto_id: boletoId, p_lancamento_id: lancamentoId, p_simular: false });
    if (error) return { ok: false, erro: fraseDoErroDaEntrada(error) };
    return { ok: true, dados: true };
  },
  async guardarLeitura(id, leitura) {
    const { error } = await (supabase as any).rpc('fn_entrada_leitura_guardar', { p_id: id, p_leitura: leitura, p_simular: false });
    if (error) return { ok: false, erro: fraseDoErroDaEntrada(error) };
    return { ok: true, dados: true };
  },
  async registrarArrastado(clienteId, a) {
    const { data, error } = await (supabase as any).rpc('fn_entrada_registrar_arrastado', {
      p_cliente: clienteId, p_nome: a.nome, p_tipo: a.tipo, p_tamanho: a.tamanho, p_md5: a.md5, p_simular: false,
    });
    if (error) return { ok: false, erro: fraseDoErroDaEntrada(error) };
    const d = typeof data === 'object' && data !== null ? data : {};
    const id = txt(d.id); const storagePath = txt(d.storage_path);
    if (!id || !storagePath) return { ok: false, erro: 'O banco não devolveu o registro do arquivo.' };
    return { ok: true, dados: { id, storagePath, jaExistia: d.ja_existia === true, estado: txt(d.estado) ?? 'a_ler' } };
  },
  async resolvidos(clienteId) {
    const { data, error } = await (supabase as any).rpc('fn_entrada_resolvidos', { p_cliente: clienteId });
    if (error) return { ok: false, erro: fraseDoErroDaEntrada(error) };
    const dados: Record<string, DetalheDoResolvido> = {};
    for (const r of (Array.isArray(data) ? data.filter(ehLinha) : [])) {
      const o: Linha = ehLinha(r.o_que) ? r.o_que : {};
      const id = txt(r.entrada_id);
      if (!id) continue;
      dados[id] = {
        quem: txt(r.quem), quando: txt(r.quando),
        folha: 'lancamentos' in o ? { tipo: txt(o.tipo), competencia: txt(o.competencia), lancamentos: numOuNulo(o.lancamentos) ?? 0, pessoas: numOuNulo(o.pessoas) ?? 0 } : null,
        boleto: 'beneficiario' in o ? { beneficiario: txt(o.beneficiario), valor: numOuNulo(o.valor), vencimento: txt(o.vencimento) } : null,
        nota: 'lancamento_id' in o ? { lancamentoId: txt(o.lancamento_id), descricao: txt(o.descricao), valor: numOuNulo(o.valor) } : null,
      };
    }
    return { ok: true, dados };
  },
  async notasNoSistema(clienteId, chaves) {
    if (!chaves.length) return { ok: true, dados: {} };
    const docs = await (supabase as any).from('financeiro_lancamento_documentos').select('chave_acesso, lancamento_id')
      .eq('cliente_id', clienteId).eq('cancelado', false).in('chave_acesso', chaves);
    if (docs.error) return { ok: false, erro: fraseDoErroDaEntrada(docs.error) };
    const pares = (Array.isArray(docs.data) ? docs.data.filter(ehLinha) : [])
      .map((d) => ({ chave: txt(d.chave_acesso), lanc: txt(d.lancamento_id) })).filter((d): d is { chave: string; lanc: string } => !!d.chave && !!d.lanc);
    if (!pares.length) return { ok: true, dados: {} };
    const lancs = await (supabase as any).from('financeiro_lancamentos_v2').select('id, descricao, valor, data_vencimento')
      .eq('cliente_id', clienteId).eq('cancelado', false).in('id', [...new Set(pares.map((p) => p.lanc))]);
    if (lancs.error) return { ok: false, erro: fraseDoErroDaEntrada(lancs.error) };
    const lidas: Linha[] = Array.isArray(lancs.data) ? lancs.data.filter(ehLinha) : [];
    const porId = new Map<string, Linha>(lidas.map((l) => [String(l.id), l]));
    const dados: Record<string, NotaNoSistema> = {};
    for (const p of pares) {
      const l = porId.get(p.lanc);
      if (!l || dados[p.chave]) continue;
      dados[p.chave] = { lancamentoId: p.lanc, descricao: txt(l.descricao), valor: numOuNulo(l.valor), vencimento: txt(l.data_vencimento) };
    }
    return { ok: true, dados };
  },
};
