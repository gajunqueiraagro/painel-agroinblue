/**
 * NOTA-FORNECEDOR-COMPARAR-01 (Gabriel 22/10/2026 08h10) — o que a nota (ou a Receita) MUDARIA no cadastro, campo a campo (PURO).
 * "Pode estar atualizando um errado e poluir todo o sistema": antes de gravar, a tela mostra Campo · Hoje · Da nota · [marcar].
 *   · campo VAZIO hoje -> vem marcado; DIFERENTE -> vem DESMARCADO (com a diferenca destacada); IGUAL -> aparece apagado, sem caixa;
 *   · o nome digitado pelo usuario ("Pec.3M-…", "Esc. Garças") e' so' mais um campo diferente: nunca muda sem marcar;
 *   · o cadastro que nao parece o certo (outro CNPJ, nome sem palavra em comum) e' dito no topo.
 * O mesmo componente serve a Receita (P31): quem chama diz a origem.
 */
import { documentoFormatado, soDigitos } from '@/lib/financeiro/nfe/formatos';
import type { EmitenteNFe } from '@/lib/financeiro/nfe/tipos';

export type CampoDoCadastro = 'nome' | 'nome_fantasia' | 'cpf_cnpj' | 'inscricao_estadual' | 'logradouro' | 'numero' | 'complemento' | 'bairro' | 'cep' | 'municipio' | 'uf';
export type CadastroParaComparar = Partial<Record<CampoDoCadastro, string | null>>;

/** O cadastro como a NOTA o escreve (o emitente; a razao social pode vir da Receita). Os dois caminhos da nota — a previa ("+ Da nota")
 *  e a faixa do XML do Novo lancamento — comparam contra ESTE, nunca cada um o seu. */
export function propostaDoEmitente(emitente: EmitenteNFe, razaoSocial: string = emitente.nome): CadastroParaComparar {
  const e = emitente.endereco;
  return {
    nome: razaoSocial, nome_fantasia: emitente.fantasia, cpf_cnpj: documentoFormatado(emitente.documento), inscricao_estadual: emitente.ie,
    logradouro: e?.logradouro ?? null, numero: e?.numero ?? null, complemento: e?.complemento ?? null, bairro: e?.bairro ?? null,
    cep: e?.cep ?? null, municipio: e?.municipio ?? null, uf: e?.uf ?? null,
  };
}

export interface GrupoDoCadastro { chave: string; rotulo: string; colunas: CampoDoCadastro[]; comparar: 'texto' | 'digitos' }
export const GRUPOS_DO_CADASTRO: readonly GrupoDoCadastro[] = [
  { chave: 'razao', rotulo: 'Razão social', colunas: ['nome'], comparar: 'texto' },
  { chave: 'fantasia', rotulo: 'Fantasia', colunas: ['nome_fantasia'], comparar: 'texto' },
  { chave: 'cnpj', rotulo: 'CNPJ/CPF', colunas: ['cpf_cnpj'], comparar: 'digitos' },
  { chave: 'ie', rotulo: 'IE', colunas: ['inscricao_estadual'], comparar: 'digitos' },
  { chave: 'endereco', rotulo: 'Endereço', colunas: ['logradouro', 'numero', 'complemento', 'bairro'], comparar: 'texto' },
  { chave: 'cep', rotulo: 'CEP', colunas: ['cep'], comparar: 'digitos' },
  { chave: 'cidade', rotulo: 'Cidade/UF', colunas: ['municipio', 'uf'], comparar: 'texto' },
];

export type EstadoDoCampo = 'vazio' | 'diferente' | 'igual';
export interface LinhaDaComparacao { grupo: GrupoDoCadastro; hoje: string; proposto: string; estado: EstadoDoCampo; marcadoPadrao: boolean }

const limpo = (v: string | null | undefined) => (v ?? '').replace(/\s+/g, ' ').trim();
const texto = (g: GrupoDoCadastro, c: CadastroParaComparar) => {
  if (g.chave === 'cidade') return [limpo(c.municipio), limpo(c.uf)].filter(Boolean).join('/');
  return g.colunas.map((k) => limpo(c[k])).filter(Boolean).join(', ');
};
const normal = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
const iguais = (g: GrupoDoCadastro, a: string, b: string) => (g.comparar === 'digitos' ? soDigitos(a) === soDigitos(b) : normal(a) === normal(b));

/** As linhas da tabela: so' os grupos que a nota TRAZ (o vazio da nota nao apaga nada). */
export function linhasDaComparacao(hoje: CadastroParaComparar, proposta: CadastroParaComparar): LinhaDaComparacao[] {
  return GRUPOS_DO_CADASTRO.flatMap((grupo) => {
    const p = texto(grupo, proposta);
    if (!p) return [];
    const h = texto(grupo, hoje);
    const estado: EstadoDoCampo = !h ? 'vazio' : iguais(grupo, h, p) ? 'igual' : 'diferente';
    return [{ grupo, hoje: h, proposto: p, estado, marcadoPadrao: estado === 'vazio' }];
  });
}

/** O que vai a' RPC: so' as colunas dos grupos marcados (e so' as que a nota traz). */
export function camposMarcados(proposta: CadastroParaComparar, marcados: ReadonlySet<string>): Partial<Record<CampoDoCadastro, string>> {
  const saida: Partial<Record<CampoDoCadastro, string>> = {};
  for (const g of GRUPOS_DO_CADASTRO) {
    if (!marcados.has(g.chave)) continue;
    for (const k of g.colunas) { const v = limpo(proposta[k]); if (v) saida[k] = v; }
  }
  return saida;
}

/** O cadastro achado NAO parece o certo? (outro CNPJ; ou nome sem nenhuma palavra em comum com a razao social ou a fantasia). */
export function cadastroPareceErrado(hoje: CadastroParaComparar, emitente: { documento: string | null; nomes: readonly (string | null | undefined)[] }): string | null {
  const docHoje = soDigitos(hoje.cpf_cnpj ?? '');
  const docNota = soDigitos(emitente.documento ?? '');
  if (docHoje && docNota && docHoje !== docNota) return `Este cadastro tem outro CNPJ/CPF (${hoje.cpf_cnpj}) — a nota é de outro documento.`;
  if (docHoje && docHoje === docNota) return null;   // o mesmo documento: e' o cadastro certo, seja qual for o nome
  const palavras = (s: string | null | undefined) => new Set(normal(s ?? '').split(' ').filter((w) => w.length >= 4 && !/^\d+$/.test(w) && !['ltda', 'eireli', 'comercio', 'industria'].includes(w)));
  const doCadastro = new Set([...palavras(hoje.nome), ...palavras(hoje.nome_fantasia)]);
  const daNota = new Set(emitente.nomes.flatMap((n) => [...palavras(n)]));
  if (doCadastro.size && daNota.size && ![...doCadastro].some((w) => daNota.has(w))) return `O nome do cadastro ("${hoje.nome ?? ''}") não parece o do emitente da nota.`;
  return null;
}
