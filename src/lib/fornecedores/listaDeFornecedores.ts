/**
 * FORN-LISTA-01 — a lista de Cadastros › Fornecedores, aba Cadastro. Quem busca, conta, ordena e pagina e' o BANCO
 * (`fn_fornecedor_lista`, que usa a busca unica `fn_fornecedor_buscar`); aqui: o leitor sem cast (peca torta = nulo), as frases e
 * a memoria do "Por pagina". "Sem CPF/CNPJ" e' do validador unico (`situacaoDoGravado`), sobre os pares (id, documento) que o banco
 * devolve para o recorte da situacao.
 */
import { supabase } from '@/integrations/supabase/client';
import { situacaoDoGravado } from '@/lib/fornecedores/documentoFiscal';

export type SituacaoDaListaDeCadastros = 'ativos' | 'inativos' | 'mesclados' | 'todos';
export type OrdemDaLista = 'razao_social' | 'nome_fantasia' | 'documento' | 'cidade' | 'lancamentos' | 'ultimo_uso' | 'situacao';
export const POR_PAGINA = [50, 100, 200] as const;
export type PorPagina = (typeof POR_PAGINA)[number];
export type PorPaginaTexto = '50' | '100' | '200';
/** o segmento da tela e' texto; o numero sai daqui (sem conversao solta na tela) */
export const porPaginaDoTexto = (v: PorPaginaTexto): PorPagina => (v === '50' ? 50 : v === '200' ? 200 : 100);
export const textoDoPorPagina = (v: PorPagina): PorPaginaTexto => (v === 50 ? '50' : v === 200 ? '200' : '100');

export interface LinhaDaLista {
  id: string; nome: string; nome_fantasia: string | null; cpf_cnpj: string | null; municipio: string | null; uf: string | null;
  lancamentos: number; ultimo_uso: string | null; situacao: 'ativo' | 'inativo' | 'mesclado'; dono_nome: string | null;
  fundido_em: string | null; fundido_em_id: string | null; ativo: boolean; fazenda_id: string; linha: Record<string, unknown>;
}
export interface PaginaDaLista {
  total: number;
  contagens: Record<SituacaoDaListaDeCadastros, number>;
  documentos: { id: string; cpfCnpj: string | null }[];
  itens: LinhaDaLista[];
}

const ehObj = (x: unknown): x is Record<string, unknown> => typeof x === 'object' && x !== null && !Array.isArray(x);
const txt = (x: unknown): string | null => (typeof x === 'string' ? x : null);
const num = (x: unknown): number | null => (typeof x === 'number' && Number.isFinite(x) ? x : null);
const ehSituacao = (x: unknown): x is LinhaDaLista['situacao'] => x === 'ativo' || x === 'inativo' || x === 'mesclado';

/** o retorno de `fn_fornecedor_lista`; qualquer peca torta = nulo (a tela diz que nao leu, nunca mostra zero) */
export function lerPaginaDaLista(r: unknown): PaginaDaLista | null {
  if (!ehObj(r) || !ehObj(r.contagens) || !Array.isArray(r.itens) || !Array.isArray(r.documentos)) return null;
  const total = num(r.total);
  const c = r.contagens;
  const ativos = num(c.ativos), inativos = num(c.inativos), mesclados = num(c.mesclados), todos = num(c.todos);
  if (total === null || ativos === null || inativos === null || mesclados === null || todos === null) return null;
  const documentos: PaginaDaLista['documentos'] = [];
  for (const d of r.documentos) {
    if (!Array.isArray(d) || typeof d[0] !== 'string') return null;
    documentos.push({ id: d[0], cpfCnpj: txt(d[1]) });
  }
  const itens: LinhaDaLista[] = [];
  for (const i of r.itens) {
    if (!ehObj(i)) return null;
    const id = txt(i.id), nome = txt(i.nome), lanc = num(i.lancamentos), sit = i.situacao;
    if (!id || nome === null || lanc === null || !ehSituacao(sit)) return null;
    itens.push({ id, nome, nome_fantasia: txt(i.nome_fantasia), cpf_cnpj: txt(i.cpf_cnpj), municipio: txt(i.municipio), uf: txt(i.uf),
      lancamentos: lanc, ultimo_uso: txt(i.ultimo_uso), situacao: sit, dono_nome: txt(i.dono_nome), fundido_em: txt(i.fundido_em),
      fundido_em_id: txt(i.fundido_em_id), ativo: i.ativo !== false, fazenda_id: txt(i.fazenda_id) ?? '', linha: i });
  }
  return { total, contagens: { ativos, inativos, mesclados, todos }, documentos, itens };
}

export interface PedidoDaLista {
  clienteId: string; busca: string; situacao: SituacaoDaListaDeCadastros; ids: string[] | null;
  ordem: OrdemDaLista; desc: boolean; porPagina: number; pagina: number;
}
export async function lerListaDoBanco(p: PedidoDaLista): Promise<PaginaDaLista> {
  const { data, error } = await (supabase as any).rpc('fn_fornecedor_lista', {
    p_cliente: p.clienteId, p_busca: p.busca, p_situacao: p.situacao, p_ids: p.ids, p_ordem: p.ordem, p_desc: p.desc,
    p_limite: p.porPagina, p_offset: (p.pagina - 1) * p.porPagina,
  });
  if (error) throw new Error(error.message);
  const v = lerPaginaDaLista(data);
  if (!v) throw new Error('Resposta inesperada do banco.');
  return v;
}

/** os ids do recorte cujo documento falta ou esta' fora do padrao, pelo validador unico */
export function idsSemDocumento(documentos: readonly { id: string; cpfCnpj: string | null }[]): string[] {
  return documentos.filter((d) => situacaoDoGravado(d.cpfCnpj).situacao !== 'ok').map((d) => d.id);
}

/** "Mostrando 1–100 de 355" — com zero, "Nenhum cadastro" */
export function textoDoIntervalo(total: number, pagina: number, porPagina: number): string {
  if (total <= 0) return 'Nenhum cadastro';
  const de = (pagina - 1) * porPagina + 1, ate = Math.min(pagina * porPagina, total);
  return `Mostrando ${de.toLocaleString('pt-BR')}–${ate.toLocaleString('pt-BR')} de ${total.toLocaleString('pt-BR')}`;
}
export const paginasDe = (total: number, porPagina: number) => Math.max(1, Math.ceil(total / porPagina));

/** dd/mm/aaaa da data do banco (AAAA-MM-DD); sem data, nulo */
export function dataDoUltimoUso(iso: string | null): string | null {
  if (!iso || !/^\d{4}-\d{2}-\d{2}/.test(iso)) return null;
  return `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`;
}
export function cidadeUf(municipio: string | null, uf: string | null): string | null {
  const m = municipio?.trim(), u = uf?.trim();
  if (m && u) return `${m}/${u}`;
  return m || u || null;
}

/* a memoria do "Por pagina", por usuario e por navegador; sem armazenamento, o padrao (100) */
const CHAVE = 'forn-lista-por-pagina:';
export function lerPorPagina(usuario: string | null): PorPagina {
  try {
    const v = Number(window.localStorage.getItem(CHAVE + (usuario ?? 'sem-usuario')));
    return v === 50 || v === 200 ? v : 100;
  } catch { return 100; }
}
export function guardarPorPagina(usuario: string | null, v: PorPagina): void {
  try { window.localStorage.setItem(CHAVE + (usuario ?? 'sem-usuario'), String(v)); } catch { /* sem armazenamento: so' a sessao */ }
}
