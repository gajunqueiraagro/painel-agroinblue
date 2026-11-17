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

type Linha = Record<string, unknown>;
const txt = (v: unknown): string | null => (typeof v === 'string' ? v : null);
const ehLinha = (v: unknown): v is Linha => typeof v === 'object' && v !== null && !Array.isArray(v);
const linha = (v: unknown): Linha => (ehLinha(v) ? v : {});
const numOuNulo = (v: unknown): number | null => (typeof v === 'number' ? v : null);

export type EstadoDaEntrada =
  | 'a_ler' | 'boleto' | 'nota' | 'nao_reconhecido' | 'sem_anexo' | 'recusado' | 'confirmacao_gmail' | 'dispensado';
const ESTADOS: readonly EstadoDaEntrada[] = ['a_ler', 'boleto', 'nota', 'nao_reconhecido', 'sem_anexo', 'recusado', 'confirmacao_gmail', 'dispensado'];
/** Os que pedem um gesto (o índice `ix_entrada_arquivos_abertos` da 118110). */
export const ESTADOS_ABERTOS: readonly EstadoDaEntrada[] = ['a_ler', 'nao_reconhecido', 'sem_anexo', 'recusado', 'confirmacao_gmail'];

export interface EntradaDoEmail {
  id: string; mensagemId: string; remetente: string | null; assunto: string | null; recebidoEm: string | null;
  arquivoNome: string | null; tipo: 'pdf' | 'xml' | null; tamanhoBytes: number | null; storagePath: string | null;
  estado: EstadoDaEntrada; motivo: string | null; chegouDeNovo: number;
}
export function entradaDaLinha(r: Linha): EntradaDoEmail {
  return {
    id: String(r.id ?? ''), mensagemId: txt(r.mensagem_id) ?? '', remetente: txt(r.remetente), assunto: txt(r.assunto),
    recebidoEm: txt(r.recebido_em), arquivoNome: txt(r.arquivo_nome), tipo: r.tipo === 'pdf' || r.tipo === 'xml' ? r.tipo : null,
    tamanhoBytes: numOuNulo(r.tamanho_bytes), storagePath: txt(r.storage_path),
    estado: ESTADOS.find((e) => e === r.estado) ?? 'a_ler', motivo: txt(r.motivo), chegouDeNovo: numOuNulo(r.chegou_de_novo) ?? 0,
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

export interface EntradaEmailApi {
  endereco: (clienteId: string) => Promise<Resultado<EnderecoDoCliente>>;
  gerar: (clienteId: string, motivo: string | null, simular: boolean) => Promise<Resultado<RespostaDoEndereco>>;
  revogar: (clienteId: string, motivo: string, simular: boolean) => Promise<Resultado<RespostaDoEndereco>>;
  /** Os que pedem gesto, mais novos primeiro (até 200). */
  pendentes: (clienteId: string) => Promise<Resultado<EntradaDoEmail[]>>;
  baixar: (storagePath: string) => Promise<Resultado<Blob>>;
  marcarLido: (id: string, estado: 'boleto' | 'nota' | 'nao_reconhecido', boletoId: string | null) => Promise<Resultado<true>>;
  dispensar: (id: string) => Promise<Resultado<true>>;
}

const COLUNAS = 'id, mensagem_id, remetente, assunto, recebido_em, arquivo_nome, tipo, tamanho_bytes, storage_path, estado, motivo, chegou_de_novo';

export const entradaEmailApiDoBanco: EntradaEmailApi = {
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
  async pendentes(clienteId) {
    const { data, error } = await (supabase as any).from('entrada_arquivos').select(COLUNAS).eq('cliente_id', clienteId)
      .in('estado', ESTADOS_ABERTOS).order('recebido_em', { ascending: false }).limit(200);
    if (error) return { ok: false, erro: fraseDoErroDaEntrada(error) };
    return { ok: true, dados: (Array.isArray(data) ? data.filter(ehLinha) : []).map(entradaDaLinha) };
  },
  async baixar(storagePath) {
    const { data, error } = await supabase.storage.from(BUCKET_DOS_BOLETOS).download(storagePath);
    if (error || !data) { console.error('[e-mail de boletos] baixar', error); return { ok: false, erro: 'Não consegui abrir o arquivo que chegou.' }; }
    return { ok: true, dados: data };
  },
  async marcarLido(id, estado, boletoId) {
    const { error } = await (supabase as any).rpc('fn_entrada_marcar_lido', { p_id: id, p_estado: estado, p_boleto_id: boletoId, p_simular: false });
    if (error) return { ok: false, erro: fraseDoErroDaEntrada(error) };
    return { ok: true, dados: true };
  },
  async dispensar(id) {
    const { error } = await (supabase as any).rpc('fn_entrada_dispensar', { p_id: id, p_simular: false });
    if (error) return { ok: false, erro: fraseDoErroDaEntrada(error) };
    return { ok: true, dados: true };
  },
};
