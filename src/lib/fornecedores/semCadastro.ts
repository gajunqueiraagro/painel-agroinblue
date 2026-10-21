/**
 * FORN-SEM-CADASTRO-01 — a aba "Sem cadastro" de Cadastros › Fornecedores. Quem decide o que entra, como agrupa e qual cadastro
 * sugerir e' o BANCO (`fn_fornecedor_sem_cadastro`); quem liga e desfaz tambem (`fn_fornecedor_sem_cadastro_ligar` /
 * `_desfazer`, com a operacao e o antes de cada lancamento). Aqui: o leitor sem cast (peca torta = nulo inteiro), os filtros da
 * tela sobre o que o banco devolveu e as frases. A tela nao soma: o total vem do banco.
 */
import { supabase } from '@/integrations/supabase/client';
import { normalizarNome } from '@/lib/fornecedores/buscaDeFornecedor';

export type MotivoDaSugestao = 'ja_ligado' | 'nome_igual' | 'parecido';
export interface SugestaoSemCadastro { fornecedorId: string; nome: string; documento: string | null; motivo: MotivoDaSugestao }
export interface LancamentoSemCadastro { id: string; descricao: string | null; data: string | null; valor: number; fazendaId: string | null; status: string | null }
export interface TextoSemCadastro {
  chave: string; texto: string; origem: 'planilha' | 'descricao'; rateio: boolean;
  qtd: number; valor: number; ultimo: string | null; sugestao: SugestaoSemCadastro | null; lancamentos: LancamentoSemCadastro[];
}
export interface SemCadastro {
  textos: TextoSemCadastro[];
  total: { textos: number; lancamentos: number; valor: number };
  comSugestao: number; semSugestao: number;
}
export interface LigacaoRecente {
  id: string; texto: string; fornecedorId: string; fornecedorNome: string; fornecedorCriado: boolean; lancamentos: number;
  feitaEm: string; desfeitaEm: string | null;
}

const ehObj = (x: unknown): x is Record<string, unknown> => typeof x === 'object' && x !== null && !Array.isArray(x);
const txt = (x: unknown): string | null => (typeof x === 'string' ? x : null);
const num = (x: unknown): number | null => (typeof x === 'number' && Number.isFinite(x) ? x : typeof x === 'string' && x.trim() !== '' && Number.isFinite(Number(x)) ? Number(x) : null);
const ehMotivo = (x: unknown): x is MotivoDaSugestao => x === 'ja_ligado' || x === 'nome_igual' || x === 'parecido';

function lerSugestao(x: unknown): SugestaoSemCadastro | null | undefined {
  if (x === null || x === undefined) return null;
  if (!ehObj(x)) return undefined;
  const id = txt(x.fornecedor_id), nome = txt(x.nome), motivo = x.motivo;
  if (!id || nome === null || !ehMotivo(motivo)) return undefined;
  return { fornecedorId: id, nome, documento: txt(x.documento), motivo };
}
function lerLancamento(x: unknown): LancamentoSemCadastro | undefined {
  if (!ehObj(x)) return undefined;
  const id = txt(x.id), valor = num(x.valor);
  if (!id || valor === null) return undefined;
  return { id, descricao: txt(x.descricao), data: txt(x.data), valor, fazendaId: txt(x.fazenda_id), status: txt(x.status) };
}

/** o retorno de `fn_fornecedor_sem_cadastro`; qualquer peça torta = `null` (a tela diz que não leu, nunca mostra zero) */
export function lerSemCadastro(r: unknown): SemCadastro | null {
  if (!ehObj(r) || !Array.isArray(r.textos) || !ehObj(r.total)) return null;
  const textos: TextoSemCadastro[] = [];
  for (const t of r.textos) {
    if (!ehObj(t)) return null;
    const chave = txt(t.chave), texto = txt(t.texto), origem = txt(t.origem), qtd = num(t.qtd), valor = num(t.valor);
    const sugestao = lerSugestao(t.sugestao);
    if (!chave || texto === null || (origem !== 'planilha' && origem !== 'descricao') || qtd === null || valor === null || sugestao === undefined
        || typeof t.rateio !== 'boolean' || !Array.isArray(t.lancamentos)) return null;
    const lancamentos: LancamentoSemCadastro[] = [];
    for (const l of t.lancamentos) { const x = lerLancamento(l); if (!x) return null; lancamentos.push(x); }
    textos.push({ chave, texto, origem, rateio: t.rateio, qtd, valor, ultimo: txt(t.ultimo), sugestao, lancamentos });
  }
  const tt = num(r.total.textos), tl = num(r.total.lancamentos), tv = num(r.total.valor), cs = num(r.com_sugestao), ss = num(r.sem_sugestao);
  if (tt === null || tl === null || tv === null || cs === null || ss === null) return null;
  return { textos, total: { textos: tt, lancamentos: tl, valor: tv }, comSugestao: cs, semSugestao: ss };
}

export function lerRecentes(r: unknown): LigacaoRecente[] | null {
  if (!Array.isArray(r)) return null;
  const out: LigacaoRecente[] = [];
  for (const x of r) {
    if (!ehObj(x)) return null;
    const id = txt(x.id), texto = txt(x.texto), fid = txt(x.fornecedor_id), fnome = txt(x.fornecedor_nome), n = num(x.lancamentos), em = txt(x.feita_em);
    if (!id || texto === null || !fid || fnome === null || n === null || !em) return null;
    out.push({ id, texto, fornecedorId: fid, fornecedorNome: fnome, fornecedorCriado: x.fornecedor_criado === true, lancamentos: n,
      feitaEm: em, desfeitaEm: txt(x.desfeita_em) });
  }
  return out;
}

export type FiltroSemCadastro = 'todos' | 'com' | 'sem';
/** o filtro e a busca da tela, sobre o que o banco devolveu (a busca pelo texto, sem acento e sem caixa) */
export function filtrarSemCadastro(textos: readonly TextoSemCadastro[], filtro: FiltroSemCadastro, busca: string): TextoSemCadastro[] {
  const b = normalizarNome(busca);
  return textos.filter((t) => (filtro === 'todos' || (filtro === 'com') === (t.sugestao !== null)) && (!b || normalizarNome(t.texto).includes(b)));
}

/** quantos lançamentos foram ligados nesta sessão (a soma do que o banco devolveu em cada ligação) */
export function lancamentosLigados(ls: readonly { qtd: number }[]): number {
  let n = 0;
  for (const l of ls) n += l.qtd;
  return n;
}

export const TITULO_DO_MOTIVO: Record<MotivoDaSugestao, string> = {
  ja_ligado: 'Sugestão: o mesmo texto já está ligado a este cadastro em outros lançamentos',
  nome_igual: 'Sugestão: o texto é a razão social, a fantasia ou um apelido deste cadastro',
  parecido: 'Sugestão: nome parecido',
};
export const MOTIVO_DO_DESFAZER = 'desfeito na aba Sem cadastro';
export const EXPLICACAO_SEM_CADASTRO = 'Lançamentos com o fornecedor escrito na coluna de fornecedor da planilha importada ou na descrição do extrato do banco, que ainda não estão ligados a um cadastro. Cada linha junta os lançamentos com o mesmo texto. Ligue a um cadastro que já existe ou crie um novo — você revisa o cadastro antes de salvar, e tudo pode ser desfeito.';

/** o mês do último lançamento, "set/2026" */
export function mesDoUltimo(iso: string | null): string {
  if (!iso || iso.length < 7) return '—';
  const m = Number(iso.slice(5, 7));
  const nomes = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
  return m >= 1 && m <= 12 ? `${nomes[m - 1]}/${iso.slice(0, 4)}` : '—';
}

/* ── o banco ── */
export async function lerSemCadastroDoBanco(clienteId: string): Promise<SemCadastro> {
  const { data, error } = await (supabase as any).rpc('fn_fornecedor_sem_cadastro', { p_cliente: clienteId });
  if (error) throw new Error(error.message);
  const v = lerSemCadastro(data);
  if (!v) throw new Error('Resposta inesperada do banco.');
  return v;
}
export async function lerRecentesDoBanco(clienteId: string): Promise<LigacaoRecente[]> {
  const { data, error } = await (supabase as any).rpc('fn_fornecedor_sem_cadastro_recentes', { p_cliente: clienteId });
  if (error) throw new Error(error.message);
  const v = lerRecentes(data);
  if (!v) throw new Error('Resposta inesperada do banco.');
  return v;
}
/** liga TODOS os lançamentos do texto ao cadastro (gravação: o gesto do operador); devolve o id da operação ou a frase do banco */
export async function ligarTexto(clienteId: string, t: Pick<TextoSemCadastro, 'chave' | 'rateio'>, fornecedorId: string, criado: boolean):
  Promise<{ ok: true; operacaoId: string; lancamentos: number } | { ok: false; frase: string }> {
  const { data, error } = await (supabase as any).rpc('fn_fornecedor_sem_cadastro_ligar', {
    p_cliente: clienteId, p_chave: t.chave, p_rateio: t.rateio, p_fornecedor_id: fornecedorId, p_fornecedor_criado: criado, p_simular: false,
  });
  if (error) return { ok: false, frase: error.message };
  const op = ehObj(data) && data.ok === true ? txt(data.operacao_id) : null;
  if (!ehObj(data) || !op) {
    const rec = ehObj(data) && ehObj(data.recusa) ? txt(data.recusa.frase) : null;
    return { ok: false, frase: rec ?? 'Resposta inesperada do banco.' };
  }
  return { ok: true, operacaoId: op, lancamentos: num(data.lancamentos) ?? 0 };
}
/** desfaz a ligação; `simular` diz antes se o cadastro criado pode sair de uso junto */
export async function desfazerLigacao(operacaoId: string, opcoes: { simular: boolean; inativarCriado?: boolean }):
  Promise<{ ok: true; voltaram: number; ficaram: number; podeInativar: boolean; inativou: boolean } | { ok: false; frase: string }> {
  const { data, error } = await (supabase as any).rpc('fn_fornecedor_sem_cadastro_desfazer', {
    p_operacao_id: operacaoId, p_motivo: MOTIVO_DO_DESFAZER, p_inativar_criado: opcoes.inativarCriado ?? false, p_simular: opcoes.simular,
  });
  if (error) return { ok: false, frase: error.message };
  if (!ehObj(data) || data.ok !== true) {
    const rec = ehObj(data) && ehObj(data.recusa) ? txt(data.recusa.frase) : null;
    return { ok: false, frase: rec ?? 'Resposta inesperada do banco.' };
  }
  return { ok: true, voltaram: num(data.voltaram) ?? 0, ficaram: num(data.ficaram) ?? 0, podeInativar: data.pode_inativar === true, inativou: data.inativou === true };
}
