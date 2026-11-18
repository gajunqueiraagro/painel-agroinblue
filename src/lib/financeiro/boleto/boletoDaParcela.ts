/**
 * BOLETO D1d — o boleto anexado a uma PARCELA entra também na CAIXA e se LIGA a ela (a mesma porta da caixa: `fn_boleto_entrar` +
 * `fn_boleto_ligar`, 118100). Só a REGRA (sem tela): a prévia de cada arquivo × parcela e a gravação do que a prévia disse.
 *
 * ⚠ O DOCUMENTO DA PARCELA NÃO MUDA: a cadeia de hoje (registrar → subir → anexar) segue igual e vem ANTES; isto roda depois dela.
 *   Falha aqui = o documento está anexado e a frase diz que o boleto não entrou na caixa. Nunca desfaz nem esconde.
 * ⚠ AS DECISÕES DO BANCO (FASE 0 D1d, §6):
 *   G1 o título já está na caixa sem ligação (novo / sem par) → LIGA o existente (nunca cria outro);
 *   G2 a parcela já tem OUTRO boleto ligado → NÃO troca calado: "Substituir" (a fatia da tela; aqui só a frase e o id do outro);
 *   o mesmo título já ligado a esta parcela → nada a fazer.
 * ⚠ PRÉVIA ANTES: `prever` só chama RPC com `p_simular` e leitura (nada grava); `gravar` faz só o que a prévia disse.
 * ⚠ `(supabase as any)` só no adaptador do banco (a única exceção do zero-cast).
 */
import { supabase } from '@/integrations/supabase/client';
import { caixaApiDoBanco, fraseDoErroDaCaixa, type CaixaApi, type Resultado } from './caixaApi';
import { lerBoletoDoArquivo, paraEntrada, type LeituraDoArquivo } from './lerBoleto';

type Linha = Record<string, unknown>;
const ehLinha = (v: unknown): v is Linha => typeof v === 'object' && v !== null && !Array.isArray(v);
const linha = (v: unknown): Linha => (ehLinha(v) ? v : {});
const txt = (v: unknown): string | null => (typeof v === 'string' ? v : null);

export type RespostaDeLigar = { ok: true } | { ok: false; motivo: string; frase: string; outroBoletoId: string | null };
export function respostaDeLigar(v: unknown): RespostaDeLigar {
  const r = linha(v);
  if (r.ok === true) return { ok: true };
  const recusa = linha(r.recusa);
  return { ok: false, motivo: txt(recusa.motivo) ?? 'recusa', frase: txt(recusa.frase) ?? 'O banco recusou a ligação. Nada foi gravado.', outroBoletoId: txt(recusa.outro_boleto_id) };
}

export interface ParcelaApi {
  entrar: CaixaApi['entrar'];
  subirArquivo: CaixaApi['subirArquivo'];
  ligar: (boletoId: string, lancamentos: string[], simular: boolean) => Promise<Resultado<RespostaDeLigar>>;
  /** O boleto VIVO já ligado a este lançamento (ou nulo). */
  boletoDoLancamento: (lancamentoId: string) => Promise<Resultado<string | null>>;
}

export const parcelaApiDoBanco: ParcelaApi = {
  entrar: caixaApiDoBanco.entrar,
  subirArquivo: caixaApiDoBanco.subirArquivo,
  async ligar(boletoId, lancamentos, simular) {
    const { data, error } = await (supabase as any).rpc('fn_boleto_ligar', { p_id: boletoId, p_lancamentos: lancamentos, p_motivo: null, p_simular: simular });
    if (error) return { ok: false, erro: fraseDoErroDaCaixa(error) };
    return { ok: true, dados: respostaDeLigar(data) };
  },
  async boletoDoLancamento(lancamentoId) {
    const { data, error } = await (supabase as any).from('boleto_lancamentos').select('boleto_id').eq('lancamento_id', lancamentoId).eq('vivo', true).limit(1);
    if (error) return { ok: false, erro: fraseDoErroDaCaixa(error) };
    const r = Array.isArray(data) && ehLinha(data[0]) ? txt(data[0].boleto_id) : null;
    return { ok: true, dados: r };
  },
};

/** O que a prévia diz que vai acontecer com UM arquivo na parcela. */
export type PreviaDaParcela =
  | { tipo: 'entra_e_liga'; leitura: Record<string, unknown> }
  | { tipo: 'liga_existente'; boletoId: string }
  | { tipo: 'ja_ligado_aqui'; boletoId: string }
  | { tipo: 'outro_boleto'; outroBoletoId: string; frase: string }
  | { tipo: 'recusa'; frase: string };

export const FRASE_OUTRO_BOLETO = 'Esta parcela já tem outro boleto ligado. Para trocar, use "Substituir" (o antigo fica na trilha).';

export async function prever(api: ParcelaApi, clienteId: string, leitura: Record<string, unknown>, lancamentoId: string): Promise<PreviaDaParcela> {
  const [e, ja] = await Promise.all([api.entrar(clienteId, leitura, true), api.boletoDoLancamento(lancamentoId)]);
  if (e.ok === false) return { tipo: 'recusa', frase: e.erro };
  if (ja.ok === false) return { tipo: 'recusa', frase: ja.erro };
  const r = e.dados;
  if (r.ok === false) return { tipo: 'recusa', frase: r.frase };
  const existente = r.jaExiste ? r.id : null;
  if (ja.dados && ja.dados === existente) return { tipo: 'ja_ligado_aqui', boletoId: ja.dados };
  if (ja.dados) return { tipo: 'outro_boleto', outroBoletoId: ja.dados, frase: FRASE_OUTRO_BOLETO };
  if (!r.jaExiste) return { tipo: 'entra_e_liga', leitura };
  if (!existente) return { tipo: 'recusa', frase: r.frase ?? 'Este boleto já está no sistema.' };
  const s = r.boleto.situacao;
  if (s !== 'novo' && s !== 'sem_par') {
    return { tipo: 'recusa', frase: s === 'ligado' ? 'Este boleto já está ligado a outro lançamento.' : 'Este boleto foi descartado ou substituído na caixa.' };
  }
  return { tipo: 'liga_existente', boletoId: existente };
}

export type DesfechoDaParcela = { ok: true; boletoId: string | null; frase: string } | { ok: false; frase: string };
const naoEntrou = (porque: string): DesfechoDaParcela => ({ ok: false, frase: `O boleto foi anexado à parcela, mas não entrou na caixa: ${porque}` });

/** Faz SÓ o que a prévia disse. O documento da parcela já está anexado (a cadeia de hoje); aqui nada o desfaz. */
export async function gravar(api: ParcelaApi, clienteId: string, previa: PreviaDaParcela, arquivo: File, lancamentoId: string): Promise<DesfechoDaParcela> {
  if (previa.tipo === 'ja_ligado_aqui') return { ok: true, boletoId: previa.boletoId, frase: 'Este boleto já estava ligado a esta parcela.' };
  if (previa.tipo === 'outro_boleto' || previa.tipo === 'recusa') return naoEntrou(previa.frase);
  let id: string;
  if (previa.tipo === 'liga_existente') id = previa.boletoId;
  else {
    const e = await api.entrar(clienteId, previa.leitura, false);
    if (e.ok === false) return naoEntrou(e.erro);
    if (e.dados.ok === false) return naoEntrou(e.dados.frase);
    if (!e.dados.id) return naoEntrou('o banco não devolveu o boleto.');
    id = e.dados.id;
    if (e.dados.storagePath && !e.dados.jaExiste) {
      const s = await api.subirArquivo(e.dados.storagePath, arquivo);
      if (s.ok === false) return { ok: false, frase: 'O boleto entrou na caixa, mas o arquivo da caixa não subiu; ele não foi ligado à parcela.' };
    }
  }
  const l = await api.ligar(id, [lancamentoId], false);
  if (l.ok === false) return { ok: false, frase: `O boleto está na caixa, mas não foi ligado à parcela: ${l.erro}` };
  if (l.dados.ok === false) return { ok: false, frase: `O boleto está na caixa, mas não foi ligado à parcela: ${l.dados.frase}` };
  return { ok: true, boletoId: id, frase: previa.tipo === 'liga_existente' ? 'Ligado ao boleto que já estava na caixa.' : 'Entrou na caixa e foi ligado à parcela.' };
}

/* ═══ a coluna "Na caixa" do "Anexar vários boletos" (D1 do mock-boleto-d1d-v1, Gabriel 17/11 14:23) ═══ */

/** O que a coluna mostra. `so_documento` = o arquivo é anexado à parcela, mas não entra na caixa (sem linha, imagem, senha…). */
export type NaCaixa =
  | { estado: 'lendo' }
  | { estado: 'previa'; previa: PreviaDaParcela }
  | { estado: 'so_documento'; frase: string };

export const FRASE_SO_DOCUMENTO_SEM_LINHA = 'sem linha digitável: anexa só o documento';
export const FRASE_SO_DOCUMENTO_IMAGEM = 'imagem: anexa só o documento (a caixa lê só PDF)';
export const FRASE_SO_DOCUMENTO_SENHA = 'PDF com senha: anexa só o documento (ponha-o na caixa para digitar a senha)';

/** Lê o PDF como a caixa lê (`lerBoletoDoArquivo` + `paraEntrada`): a leitura para o banco, ou a frase do "só o documento". */
export async function leituraParaACaixa(
  arquivo: File,
  ler: (bytes: ArrayBuffer) => Promise<LeituraDoArquivo> = (b) => lerBoletoDoArquivo(b),
): Promise<{ ok: true; leitura: Record<string, unknown> } | { ok: false; frase: string }> {
  if (arquivo.type !== 'application/pdf' && !/\.pdf$/i.test(arquivo.name)) return { ok: false, frase: FRASE_SO_DOCUMENTO_IMAGEM };
  const r = await ler(await arquivo.arrayBuffer());
  if (r.ok === false) return { ok: false, frase: r.motivo === 'senha' || r.motivo === 'senha_errada' ? FRASE_SO_DOCUMENTO_SENHA : FRASE_SO_DOCUMENTO_SEM_LINHA };
  const boleto = r.leitura.boleto;
  if (!boleto) return { ok: false, frase: FRASE_SO_DOCUMENTO_SEM_LINHA };
  return { ok: true, leitura: paraEntrada({ ...r.leitura, boleto }, 'pdf', arquivo.name) };
}

export type CorDoSelo = 'azul' | 'verde' | 'ambar' | 'cinza' | 'vermelho';
/** O selo e a frase da coluna (a frase inteira também vai no `title`). */
export function seloNaCaixa(c: NaCaixa): { selo: string; cor: CorDoSelo; frase: string } {
  if (c.estado === 'lendo') return { selo: 'lendo…', cor: 'cinza', frase: 'lendo o boleto e perguntando à caixa' };
  if (c.estado === 'so_documento') return { selo: 'não confere', cor: 'cinza', frase: c.frase };
  const p = c.previa;
  switch (p.tipo) {
    case 'entra_e_liga': return { selo: 'entra e liga', cor: 'azul', frase: 'novo na caixa, ligado a esta parcela' };
    case 'liga_existente': return { selo: 'já na caixa · liga', cor: 'verde', frase: 'o mesmo título já estava na caixa: liga o existente' };
    case 'ja_ligado_aqui': return { selo: 'já ligado', cor: 'cinza', frase: 'este boleto já está ligado a esta parcela' };
    case 'outro_boleto': return { selo: 'outro boleto', cor: 'ambar', frase: 'a parcela já tem outro boleto ligado: troque na caixa com "Substituir"' };
    case 'recusa': return { selo: 'não entra', cor: 'vermelho', frase: p.frase };
  }
}

/** D2: a frase do rodapé quando há parcela com outro boleto (o arquivo é anexado como documento; nunca troca calado). */
export function fraseDoOutroBoleto(n: number): string | null {
  if (n <= 0) return null;
  return n === 1
    ? '1 parcela já tem outro boleto: ele é anexado como documento; troque na caixa com "Substituir".'
    : `${n} parcelas já têm outro boleto: eles são anexados como documento; troque na caixa com "Substituir".`;
}

/** Depois de anexar: grava na caixa SÓ o que a prévia disse, um por vez; devolve as frases do que não entrou (vazio = tudo certo). */
export async function gravarNaCaixa(
  api: ParcelaApi, clienteId: string, itens: readonly { arquivo: File; lancamentoId: string; previa: PreviaDaParcela }[],
): Promise<string[]> {
  const falhas: string[] = [];
  for (const i of itens) {
    if (i.previa.tipo !== 'entra_e_liga' && i.previa.tipo !== 'liga_existente') continue;
    const r = await gravar(api, clienteId, i.previa, i.arquivo, i.lancamentoId);
    if (r.ok === false) falhas.push(`${i.arquivo.name}: ${r.frase}`);
  }
  return falhas;
}

/* ═══ D3 do mock-boleto-d1d-v1 (Gabriel 17/11 14:23): o selo "boleto · venc dd/mm/aaaa" no Resumo do Editar lançamento ═══ */

/** `storagePath` = o PDF do boleto na caixa (o 👁 do Resumo abre ele); sem PDF guardado, null. */
export type BoletoDoResumo = { id: string; vencimento: string | null; storagePath: string | null };

/** O boleto VIVO ligado ao lançamento, com o vencimento DO BOLETO (leitura; nulo = sem boleto ligado). */
export async function boletoDoResumo(clienteId: string, lancamentoId: string): Promise<Resultado<BoletoDoResumo | null>> {
  const elo = await (supabase as any).from('boleto_lancamentos').select('boleto_id')
    .eq('cliente_id', clienteId).eq('lancamento_id', lancamentoId).eq('vivo', true).limit(1);
  if (elo.error) return { ok: false, erro: fraseDoErroDaCaixa(elo.error) };
  const id = Array.isArray(elo.data) && ehLinha(elo.data[0]) ? txt(elo.data[0].boleto_id) : null;
  if (!id) return { ok: true, dados: null };
  const b = await (supabase as any).from('boletos').select('id, vencimento, storage_path').eq('cliente_id', clienteId).eq('id', id).limit(1);
  if (b.error) return { ok: false, erro: fraseDoErroDaCaixa(b.error) };
  const l = Array.isArray(b.data) && ehLinha(b.data[0]) ? b.data[0] : null;
  return { ok: true, dados: { id, vencimento: l ? txt(l.vencimento) : null, storagePath: l ? txt(l.storage_path) : null } };
}

/** O texto da linha "Boleto" do Resumo: "venc 10/12/2026" (o rótulo já diz "Boleto"; Gabriel 18/11 14:40: sem "boleto ·" repetido);
 *  sem vencimento no título: "sem venc."; a data sempre dd/mm/aaaa. */
export function seloDoBoleto(b: Pick<BoletoDoResumo, 'vencimento'>): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(b.vencimento ?? '');
  return m ? `venc ${m[3]}/${m[2]}/${m[1]}` : 'sem venc.';
}
