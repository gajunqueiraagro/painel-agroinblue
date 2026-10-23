/**
 * FORN-FILIAL-01 (Gabriel, 21/10/2026) — ao digitar o CNPJ no cadastro, buscar razão social, fantasia e endereço numa consulta PÚBLICA.
 * FASE 0 (21/10): a BrasilAPI (`https://brasilapi.com.br/api/cnpj/v1/<14 dígitos>`) responde sem chave e com
 * `access-control-allow-origin: *` (o navegador chama direto); o município vem em CAIXA ALTA e sem acento — o nome certo sai da API de
 * localidades do IBGE pelo código (`codigo_municipio_ibge`, também com CORS aberto); sem ela, o nome em caixa de título.
 * ⚠ NUNCA TRAVA O CADASTRO: rede fora, CNPJ não achado, limite de uso, tempo esgotado (6s) ou CNPJ alfanumérico (a API só tem o numérico)
 *   viram `{ ok: false, frase }` — o cadastro segue à mão. Nada aqui grava: quem preenche é o formulário, e SÓ campo vazio
 *   (`preencherVazios`).
 */
import type { DadosDoFornecedor } from './cadastroDoFornecedor';

export interface DadosDoCnpj {
  razaoSocial: string; fantasia: string; municipio: string; uf: string;
  logradouro: string; numero: string; complemento: string; bairro: string; cep: string;
  /** "MATRIZ" | "FILIAL" ('' sem a informação) */
  matrizFilial: string;
}
export type RespostaDoCnpj = { ok: true; dados: DadosDoCnpj } | { ok: false; frase: string };

export const FRASE_CONSULTA_INDISPONIVEL = 'Consulta do CNPJ indisponível agora: preencha à mão (o cadastro não depende dela).';
export const FRASE_CNPJ_NAO_ACHADO = 'CNPJ não encontrado na consulta pública: preencha à mão.';
export const FRASE_CNPJ_ALFANUMERICO = 'A consulta pública ainda não tem o CNPJ alfanumérico: preencha à mão.';

const PEQUENAS = new Set(['de', 'da', 'do', 'das', 'dos', 'e', 'd']);
/** "PRESIDENTE PRUDENTE" -> "Presidente Prudente"; "SAO JOAO DO OESTE" -> "Sao Joao do Oeste" (sem o IBGE não há acento) */
export function caixaDeTitulo(s: string): string {
  return s.toLowerCase().split(/\s+/).filter(Boolean)
    .map((p, i) => (i > 0 && PEQUENAS.has(p) ? p : p.charAt(0).toUpperCase() + p.slice(1))).join(' ');
}

const texto = (v: unknown): string => (typeof v === 'string' ? v.trim() : typeof v === 'number' ? String(v) : '');

type Buscar = (url: string, init?: { signal?: AbortSignal }) => Promise<{ ok: boolean; status: number; json: () => Promise<unknown> }>;

async function comPrazo<T>(ms: number, f: (sinal: AbortSignal) => Promise<T>): Promise<T> {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), ms);
  try { return await f(ctl.signal); } finally { clearTimeout(t); }
}

/** A consulta. `buscar` = o `fetch` (trocável no teste). */
export async function consultarCnpj(cnpj: string, opcoes: { buscar?: Buscar; ms?: number } = {}): Promise<RespostaDoCnpj> {
  const buscar: Buscar = opcoes.buscar ?? ((u, i) => fetch(u, i));
  const ms = opcoes.ms ?? 6000;
  const chave = cnpj.replace(/[^0-9A-Za-z]/g, '').toUpperCase();
  if (chave.length !== 14) return { ok: false, frase: FRASE_CNPJ_NAO_ACHADO };
  if (!/^\d{14}$/.test(chave)) return { ok: false, frase: FRASE_CNPJ_ALFANUMERICO };
  let bruto: Record<string, unknown>;
  try {
    const r = await comPrazo(ms, (signal) => buscar(`https://brasilapi.com.br/api/cnpj/v1/${chave}`, { signal }));
    if (r.status === 404) return { ok: false, frase: FRASE_CNPJ_NAO_ACHADO };
    if (!r.ok) return { ok: false, frase: FRASE_CONSULTA_INDISPONIVEL };
    const j = await r.json();
    if (!j || typeof j !== 'object') return { ok: false, frase: FRASE_CONSULTA_INDISPONIVEL };
    bruto = Object.fromEntries(Object.entries(j));
  } catch {
    return { ok: false, frase: FRASE_CONSULTA_INDISPONIVEL };
  }
  /* o nome do município como o IBGE escreve (com acento); sem ele, a caixa de título — a falha aqui não derruba a consulta */
  let municipio = caixaDeTitulo(texto(bruto.municipio));
  const ibge = texto(bruto.codigo_municipio_ibge);
  if (/^\d{7}$/.test(ibge)) {
    try {
      const r = await comPrazo(ms, (signal) => buscar(`https://servicodados.ibge.gov.br/api/v1/localidades/municipios/${ibge}`, { signal }));
      if (r.ok) {
        const j = await r.json();
        const nome = j && typeof j === 'object' ? texto(Reflect.get(j, 'nome')) : '';
        if (nome) municipio = nome;
      }
    } catch { /* fica a caixa de título */ }
  }
  const tipoLogradouro = texto(bruto.descricao_tipo_de_logradouro);
  const logradouro = texto(bruto.logradouro);
  return { ok: true, dados: {
    razaoSocial: texto(bruto.razao_social), fantasia: texto(bruto.nome_fantasia), municipio, uf: texto(bruto.uf).toUpperCase(),
    logradouro: tipoLogradouro && logradouro && !logradouro.toUpperCase().startsWith(tipoLogradouro.toUpperCase()) ? `${tipoLogradouro} ${logradouro}` : logradouro,
    numero: texto(bruto.numero), complemento: texto(bruto.complemento), bairro: texto(bruto.bairro),
    cep: texto(bruto.cep).replace(/^(\d{5})(\d{3})$/, '$1-$2'), matrizFilial: texto(bruto.descricao_identificador_matriz_filial).toUpperCase(),
  } };
}

/** O que a consulta preenche no formulário: SÓ campo VAZIO (nunca sobrescreve o digitado). Devolve o patch e quais campos entraram. */
export function preencherVazios(d: DadosDoFornecedor, c: DadosDoCnpj): { patch: Partial<DadosDoFornecedor>; campos: (keyof DadosDoFornecedor)[] } {
  const pares: [keyof DadosDoFornecedor, string][] = [
    ['nome', c.razaoSocial], ['nome_fantasia', c.fantasia], ['municipio', c.municipio], ['uf', c.uf], ['logradouro', c.logradouro],
    ['numero', c.numero], ['complemento', c.complemento], ['bairro', c.bairro], ['cep', c.cep],
  ];
  const patch: Partial<DadosDoFornecedor> = {};
  const campos: (keyof DadosDoFornecedor)[] = [];
  for (const [k, v] of pares) {
    const atual = d[k];
    if (v && typeof atual === 'string' && atual.trim() === '') { Object.assign(patch, { [k]: v }); campos.push(k); }
  }
  if (campos.length && d.tipo_pessoa === '') { patch.tipo_pessoa = 'PJ'; }
  return { patch, campos };
}

/** A frase do que entrou ("Da Receita: razão social, cidade/UF e endereço."), ou nula se nada entrou. */
export function fraseDoPreenchido(campos: readonly (keyof DadosDoFornecedor)[], matrizFilial: string): string | null {
  if (!campos.length) return null;
  const nomes: string[] = [];
  if (campos.includes('nome')) nomes.push('razão social');
  if (campos.includes('nome_fantasia')) nomes.push('fantasia');
  if (campos.includes('municipio') || campos.includes('uf')) nomes.push('cidade/UF');
  if (campos.some((k) => ['logradouro', 'numero', 'complemento', 'bairro', 'cep'].includes(k))) nomes.push('endereço');
  const lista = nomes.length > 1 ? `${nomes.slice(0, -1).join(', ')} e ${nomes[nomes.length - 1]}` : nomes[0];
  return `Da consulta do CNPJ${matrizFilial ? ` (${matrizFilial.toLowerCase()})` : ''}: ${lista}. Confira antes de salvar.`;
}

/**
 * P31 — FORN-CNPJ-RECEITA-02 (Gabriel 23/10/2026). A consulta preenchia SÓ campo vazio: com a razão social (ou a fantasia) já escrita e
 * DIFERENTE da Receita, o dado da Receita sumia calado — "não preenche a razão social". Agora o que difere é OFERECIDO ("Usar"), nunca
 * escrito por cima: campo · hoje · Receita. Igual a menos de caixa, acento e espaço não é diferença (a gravação padroniza a caixa:
 * `trg_aa_fornecedor_nome_caixa`, FORN-NOME-CAIXA-01).
 */
export type CampoDaReceita = 'nome' | 'nome_fantasia';
export interface OfertaDaReceita { campo: CampoDaReceita; rotulo: string; hoje: string; receita: string }
const comparavel = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
export function ofertasDaReceita(d: Pick<DadosDoFornecedor, CampoDaReceita>, c: Pick<DadosDoCnpj, 'razaoSocial' | 'fantasia'>): OfertaDaReceita[] {
  const pares: [CampoDaReceita, string, string][] = [['nome', 'Razão social', c.razaoSocial], ['nome_fantasia', 'Fantasia', c.fantasia]];
  return pares.flatMap(([campo, rotulo, receita]) => {
    const hoje = d[campo].trim();
    return receita.trim() && hoje && comparavel(hoje) !== comparavel(receita) ? [{ campo, rotulo, hoje, receita: receita.trim() }] : [];
  });
}
