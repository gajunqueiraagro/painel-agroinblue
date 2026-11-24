/**
 * FORN-FORMA-PELO-EXTRATO-01 (mock aprovado 24/11) — a forma de pagamento de cada fornecedor pelo extrato conciliado. Quem decide a forma,
 * a chave e quem entra é o BANCO (lote 113520: `fn_forma_pelo_extrato_previa` / `_gravar` / `_desfazer`); aqui só se LÊ a resposta
 * (sem cast: peça torta = nulo) e se escolhem as frases. Ajustes do Gabriel: cabeçalho só com a 1ª maiúscula; sem rolagem lateral.
 */

export interface SugestaoDeForma {
  fornecedorId: string; nome: string; pagamentos: number; iguaisPct: number; forma: string; formaCadastro: string;
  /** as 2 primeiras palavras do histórico mais comum ("PAGAMENTO PIX") */
  exemplo: string;
  chaveSugerida: string | null; tipoChave: string | null; abertosSemForma: number; hojeForma: string | null; hojeChave: string | null;
}

export type NoCadastro = 'em_branco' | 'igual' | 'diferente';

export interface GravacaoDeForma {
  id: string; fornecedorId: string; nome: string; forma: string; chave: string | null; lancamentos: number; recusados: number; feitaEm: string;
}

const obj = (v: unknown): object | null => (v !== null && typeof v === 'object' && !Array.isArray(v) ? v : null);
const g = (o: object, k: string): unknown => Reflect.get(o, k);
const txt = (v: unknown): string | null => (typeof v === 'string' && v.trim() ? v : null);
const num = (v: unknown): number | null => {
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  if (typeof v === 'string' && v.trim() && Number.isFinite(Number(v))) return Number(v);
  return null;
};

/** As linhas da prévia; qualquer linha torta = nulo inteiro (a tela diz que não carregou, nunca uma lista pela metade). */
export function lerSugestoes(r: unknown): SugestaoDeForma[] | null {
  if (!Array.isArray(r)) return null;
  const out: SugestaoDeForma[] = [];
  for (const x of r) {
    const o = obj(x); if (!o) return null;
    const fornecedorId = txt(g(o, 'fornecedor_id')), nome = txt(g(o, 'nome')), forma = txt(g(o, 'forma')), formaCadastro = txt(g(o, 'forma_cadastro'));
    const pagamentos = num(g(o, 'pagamentos')), iguaisPct = num(g(o, 'iguais_pct')), abertos = num(g(o, 'abertos_sem_forma'));
    if (!fornecedorId || !nome || !forma || !formaCadastro || pagamentos === null || iguaisPct === null || abertos === null) return null;
    out.push({ fornecedorId, nome, pagamentos, iguaisPct, forma, formaCadastro, exemplo: txt(g(o, 'exemplo')) ?? '',
      chaveSugerida: txt(g(o, 'chave_sugerida')), tipoChave: txt(g(o, 'tipo_chave')), abertosSemForma: abertos,
      hojeForma: txt(g(o, 'hoje_forma')), hojeChave: txt(g(o, 'hoje_chave')) });
  }
  return out;
}

/** O cadastro hoje, comparado com a forma sugerida (no vocabulário do cadastro). */
export function noCadastro(s: SugestaoDeForma): NoCadastro {
  if (!s.hojeForma) return 'em_branco';
  return s.hojeForma === s.formaCadastro ? 'igual' : 'diferente';
}

/** Marcado ao abrir: tudo, menos quem tem OUTRA forma no cadastro (o que está lá não muda sem você marcar). */
export const marcadoAoAbrir = (s: SugestaoDeForma): boolean => noCadastro(s) !== 'diferente';

/** A frase da chave: a sugerida (com o tipo), ou por que não há. */
export function fraseDaChave(s: SugestaoDeForma): string {
  if (s.forma !== 'PIX') return '—';
  if (s.hojeChave) return 'já tem chave no cadastro';
  if (s.chaveSugerida) return `${s.tipoChave ?? 'Documento'} ${s.chaveSugerida}`;
  return 'o extrato não traz a chave';
}

/** O que a barra de baixo diz com a marcação atual. */
export function somaDaMarcacao(sugestoes: readonly SugestaoDeForma[], marcados: ReadonlySet<string>): { fornecedores: number; lancamentos: number } {
  let fornecedores = 0, lancamentos = 0;
  for (const s of sugestoes) if (marcados.has(s.fornecedorId)) { fornecedores += 1; lancamentos += s.abertosSemForma; }
  return { fornecedores, lancamentos };
}

/** As gravações ainda não desfeitas (a tabela da trilha, pela RLS do cliente). */
export function lerGravacoes(r: unknown): GravacaoDeForma[] | null {
  if (!Array.isArray(r)) return null;
  const out: GravacaoDeForma[] = [];
  for (const x of r) {
    const o = obj(x); if (!o) return null;
    const id = txt(g(o, 'id')), fornecedorId = txt(g(o, 'fornecedor_id')), forma = txt(g(o, 'forma')), feitaEm = txt(g(o, 'feita_em'));
    const lanc = g(o, 'lancamentos'); const recusados = num(g(o, 'recusados'));
    const f = obj(g(o, 'fornecedor'));
    if (!id || !fornecedorId || !forma || !feitaEm || !Array.isArray(lanc) || recusados === null) return null;
    out.push({ id, fornecedorId, nome: (f && txt(g(f, 'nome'))) ?? '—', forma, chave: txt(g(o, 'chave')), lancamentos: lanc.length, recusados, feitaEm });
  }
  return out;
}

/** O resumo que a gravação (ou a simulação) devolve: { fornecedores, lancamentos }; torto = nulo. */
export function lerResultadoDaGravacao(r: unknown): { fornecedores: number; lancamentos: number } | null {
  const o = obj(r); if (!o || g(o, 'ok') !== true) return null;
  const fs = g(o, 'fornecedores'); const l = num(g(o, 'lancamentos'));
  if (!Array.isArray(fs) || l === null) return null;
  return { fornecedores: fs.length, lancamentos: l };
}

/** O que o desfazer devolve: quantos lançamentos voltaram e quantos ficaram (mexidos depois). */
export function lerResultadoDoDesfazer(r: unknown): { voltaram: number; mantidos: number } | null {
  const o = obj(r); if (!o || g(o, 'ok') !== true) return null;
  const v = num(g(o, 'lancamentos_voltaram')); const m = g(o, 'mantidos');
  if (v === null || !Array.isArray(m)) return null;
  return { voltaram: v, mantidos: m.length };
}

export const fraseDaGravacao = (r: { fornecedores: number; lancamentos: number }): string =>
  `Gravado: ${r.fornecedores.toLocaleString('pt-BR')} ${r.fornecedores === 1 ? 'cadastro' : 'cadastros'} com a forma; `
  + `${r.lancamentos.toLocaleString('pt-BR')} ${r.lancamentos === 1 ? 'lançamento em aberto recebeu' : 'lançamentos em aberto receberam'} a forma.`;

export const fraseDoDesfazer = (r: { voltaram: number; mantidos: number }): string =>
  `Desfeito: o cadastro voltou; ${r.voltaram.toLocaleString('pt-BR')} ${r.voltaram === 1 ? 'lançamento voltou' : 'lançamentos voltaram'} para a forma em branco`
  + (r.mantidos > 0 ? `; ${r.mantidos.toLocaleString('pt-BR')} mexido${r.mantidos === 1 ? '' : 's'} depois ficou como está.` : '.');
