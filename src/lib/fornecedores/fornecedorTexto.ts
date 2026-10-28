/**
 * fornecedorTexto — FORN-SELETOR-PADRAO-01 passo 1b. As funções PURAS do seletor de fornecedor: normalização (da busca e do
 * nome repetido), formatação do documento e o recorte do que a lista mostra. Um lugar só; o seletor e os testes leem daqui.
 */

/** Só os dígitos de um texto ("" quando não há). */
export const soDigitos = (t: string | null | undefined): string => (t ?? '').replace(/\D/g, '');

/** A máscara de CNPJ (14) ou CPF (11) sobre os DÍGITOS; nulo para qualquer outro tamanho — não se inventa máscara. */
export function mascaraDoDocumento(digitos: string): string | null {
  const d = digitos;
  if (d.length === 14) return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8, 12)}-${d.slice(12)}`;
  if (d.length === 11) return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`;
  return null;
}

/** O documento como a tela o escreve: 00.000.000/0000-00 ou 000.000.000-00; outro tamanho aparece COMO ESTÁ. Vazio = "". */
export function formatarDocumento(doc: string | null | undefined): string {
  const cru = (doc ?? '').trim();
  if (!cru) return '';
  return mascaraDoDocumento(soDigitos(cru)) ?? cru;
}

/**
 * FIN-FINANC-28-P3-FIX4 — o `title` de um credor/fornecedor: o NOME DO CADASTRO INTEIRO e o CPF/CNPJ formatado ("Nome · 00.000.000/0000-00").
 * Sem documento, só o nome; sem nome, vazio. ⚠ PROIBIDO ENCURTAR NOME DE CREDOR (decisão do Gabriel, 17/10): a tela mostra o nome
 * exatamente como está no cadastro e, onde não cabe, corta com reticências com isto no `title`.
 */
export function nomeEDocumento(nome: string | null | undefined, doc: string | null | undefined): string {
  const n = (nome ?? '').trim();
  const d = formatarDocumento(doc);
  return [n, d].filter(Boolean).join(' · ');
}

/* FORN-BUSCA-UNICA-01 — a normalização e os dígitos da busca MORAM em `buscaDeFornecedor.ts` (o dono da regra de busca, espelhado
   pela RPC); aqui só se reexportam, para os chamadores de sempre. */
export { normalizarNome, digitosDaBusca } from './buscaDeFornecedor';
import { normalizarNome, prepararParaBusca, buscarPreparados, casaComOTermo, type Preparado, type SituacaoDaBusca } from './buscaDeFornecedor';

/** O mínimo que estas funções leem de um fornecedor. */
/** FORN-CADASTRO-02: `nome` é a RAZÃO SOCIAL; `nome_fantasia` (opcional) entra na opção e na busca. */
export interface FornecedorDoSeletor { id: string; nome: string; cpf_cnpj?: string | null; ativo?: boolean | null; nome_fantasia?: string | null;
  /** FORN-BUSCA-UNICA-01 — a busca única também lê: a marca da mesclagem, os apelidos e o uso */
  fundido_em_id?: string | null; aliases_norm?: readonly string[] | null; uso?: number | null;
  /** FORN-FILIAL-01 — a cidade da filial */
  municipio?: string | null; uf?: string | null }

/** Cadastro de projeção ("[META]" no nome): fora da lista por padrão; só entra em modal de meta. A regra mora aqui. */
/** FORN-CADASTRO-02 — a fantasia de qualquer linha de fornecedor (o campo é opcional nos tipos dos hospedeiros) */
export const fantasiaDe = (f: object): string | null => { const v: unknown = Reflect.get(f, 'nome_fantasia'); return typeof v === 'string' && v.trim() ? v : null; };
/** FORN-FILIAL-01 — a cidade da filial como a opção a escreve: "Presidente Prudente/SP" (só a cidade ou só a UF quando falta a outra);
 *  sem nenhuma, nula. Lida de qualquer linha de fornecedor (o campo é opcional nos tipos dos hospedeiros). */
export const cidadeDe = (f: object): string | null => {
  const ler = (k: string): string => { const v: unknown = Reflect.get(f, k); return typeof v === 'string' ? v.trim() : ''; };
  const m = ler('municipio'), u = ler('uf');
  return m && u ? `${m}/${u}` : m || u || null;
};

export const ehCadastroDeMeta = (nome: string): boolean => nome.includes('[META]');

/** O que se calcula UMA vez por fornecedor ao montar a lista (a busca corre sobre isto a cada tecla). */
/* FORN-BUSCA-UNICA-01 — nomeNorm, fantasiaNorm, digitos, apelidos, ativo e uso vêm de `prepararParaBusca` (a regra única). */
export interface OpcaoDeFornecedor<F extends FornecedorDoSeletor> extends Preparado<F> {
  /** Documento formatado ("" = sem documento: a área do documento da opção fica vazia). */
  documento: string;
  /** Quantos ATIVOS têm este mesmo nome normalizado; 0 quando o nome é único (sem selo). */
  iguais: number;
}

/** Monta as opções: tira os de meta (salvo `incluirMeta`), normaliza e conta os nomes repetidos ENTRE OS LISTADOS. */
export function montarOpcoes<F extends FornecedorDoSeletor>(ativos: readonly F[], incluirMeta = false): OpcaoDeFornecedor<F>[] {
  const base = incluirMeta ? ativos : ativos.filter((f) => !ehCadastroDeMeta(f.nome));
  const preparados = prepararParaBusca(base);
  const contagem = new Map<string, number>();
  preparados.forEach((p) => contagem.set(p.nomeNorm, (contagem.get(p.nomeNorm) ?? 0) + 1));
  return preparados.map((p) => {
    const vezes = contagem.get(p.nomeNorm) ?? 1;
    return { ...p, documento: formatarDocumento(p.f.cpf_cnpj), iguais: vezes > 1 ? vezes : 0 };
  });
}

/** A opção casa com a busca? A regra única (`casaComOTermo`, `buscaDeFornecedor.ts`): razão social, fantasia, apelidos e — busca só de
 *  número — o documento. */
export function casaComABusca<F extends FornecedorDoSeletor>(o: OpcaoDeFornecedor<F>, busca: string): boolean {
  return casaComOTermo(o, busca);
}

export const LIMITE_DE_OPCOES = 100;

export interface RecorteDeOpcoes<F extends FornecedorDoSeletor> {
  /** Quantas casam com a busca (a busca corre sobre TODAS). */
  total: number;
  /** As que a lista desenha: o escolhido no topo (mesmo fora do limite) e as demais até o limite. */
  visiveis: OpcaoDeFornecedor<F>[];
}

/** Filtra sobre todas, põe o escolhido no topo e corta no limite — o corte nunca muda o RESULTADO da busca, só o que se desenha. */
export function recortarOpcoes<F extends FornecedorDoSeletor>(
  opcoes: readonly OpcaoDeFornecedor<F>[], busca: string, escolhidoId: string | null | undefined, limite: number = LIMITE_DE_OPCOES,
  situacao: SituacaoDaBusca = 'ativos',
): RecorteDeOpcoes<F> {
  /* FORN-BUSCA-UNICA-01 — o que casa e a ORDEM são da regra única (`buscarPreparados`) */
  const casam = buscarPreparados<F, OpcaoDeFornecedor<F>>(opcoes, busca, situacao);
  const escolhido = escolhidoId ? casam.find((o) => o.f.id === escolhidoId) : undefined;
  if (!escolhido) return { total: casam.length, visiveis: casam.slice(0, limite) };
  const visiveis: OpcaoDeFornecedor<F>[] = [escolhido];
  for (const o of casam) {
    if (visiveis.length >= limite) break;
    if (o !== escolhido) visiveis.push(o);
  }
  return { total: casam.length, visiveis };
}

/** O rodapé fixo da lista quando há mais do que se desenha; nulo quando cabe tudo. */
export function fraseDoLimite(mostrando: number, total: number): string | null {
  return total > mostrando ? `Mostrando ${mostrando} de ${total.toLocaleString('pt-BR')} — digite para refinar` : null;
}

export const SEM_DOCUMENTO = 'sem CNPJ/CPF';
/** A linha fixa sob o campo: o documento do escolhido, "sem CNPJ/CPF", ou vazia quando nada foi escolhido.
 *  P117 (FORN-FILIAL-01, Gabriel 21/10): com cidade no cadastro, "CNPJ · Cidade/UF" — a filial se reconhece pela cidade; sem cidade, só o
 *  CNPJ (nada inventado); sem documento, "sem CNPJ/CPF" (a cidade sozinha não identifica o cadastro). */
export function linhaDoDocumento(escolhido: FornecedorDoSeletor | null | undefined): string {
  if (!escolhido) return '';
  const doc = formatarDocumento(escolhido.cpf_cnpj);
  if (!doc) return SEM_DOCUMENTO;
  const cidade = cidadeDe(escolhido);
  return cidade ? `${doc} · ${cidade}` : doc;
}
/** O selo do nome repetido ("3 iguais"); "" quando o nome é único. */
export const seloDeIguais = (n: number): string => (n > 1 ? `${n} iguais` : '');

/* ── FORN-NOME-EXIBIDO-01 (Gabriel 19/10/2026) — UMA regra de nome exibido para o filtro e a grade de Lançamentos ──────────────
 * O nome é SEMPRE a razão social do cadastro (`nome`). Quando dois ou mais cadastros da MESMA lista dão o mesmo nome comparado,
 * cada um ganha um final fixo, que não corta: o fim do CNPJ/CPF ("…0007-69") ou "sem CNPJ". Cadastro inativo leva a marca
 * "inativo". Nasce da Vera: "Lineagro … AS" (inativo) e "Lineagro … S.A." apareciam no filtro com o mesmo começo de nome. */

/** Sufixos societários que não distinguem um cadastro do outro ("S.A." x "AS" x "SA", "Ltda", "ME"…). */
const SUFIXO_SOCIETARIO = /\b(s a|sa|as|ltda|me|epp|eireli|cia)\b/g;

/**
 * O nome para dizer "parece o mesmo": sem acento e caixa, sem pontuação e sem sufixo societário.
 * ⚠ O PREFIXO "Pec.3M-" FICA NA CHAVE (Gabriel 19/10/2026): ele marca o fornecedor pago POR RATEIO, com a nota fiscal no nome do
 *   Higino e a Vera pagando a parte dela — "Pec.3M-X" e "X" são cadastros diferentes de propósito, nunca "parecidos".
 */
export function chaveDoNomeComparado(nome: string | null | undefined): string {
  const n = normalizarNome(nome);
  return n.replace(/[^a-z0-9 ]/g, ' ').replace(SUFIXO_SOCIETARIO, ' ').replace(/\s+/g, ' ').trim();
}

export const FINAL_SEM_DOCUMENTO = 'sem CNPJ';

/** O fim do documento que distingue o cadastro: CNPJ "…0007-69", CPF "…789-09", outro tamanho os 4 últimos dígitos; vazio = "sem CNPJ". */
export function finalDoDocumento(doc: string | null | undefined): string {
  const d = soDigitos(doc);
  if (!d) return FINAL_SEM_DOCUMENTO;
  if (d.length === 14) return `…${d.slice(8, 12)}-${d.slice(12)}`;
  if (d.length === 11) return `…${d.slice(6, 9)}-${d.slice(9)}`;
  return `…${d.slice(-4)}`;
}

export interface RotuloDoFornecedor {
  /** A razão social, como está no cadastro. */
  nome: string;
  /** O final que distingue os parecidos; nulo quando o nome comparado é único na lista. */
  final: string | null;
  inativo: boolean;
  /** O `title`: nome inteiro · documento formatado (ou "sem CNPJ") · cidade/UF · inativo — o detalhe que a TABELA não escreve
   *  (FIN-V2-FORNECEDOR-SEM-SUFIXO-01). */
  title: string;
}

/** Os rótulos de uma LISTA de cadastros (a que a tela mostra junta): o final só aparece entre os parecidos DESSA lista. */
export function rotulosDosFornecedores(fornecedores: readonly FornecedorDoSeletor[]): Map<string, RotuloDoFornecedor> {
  const porChave = new Map<string, Set<string>>();
  for (const f of fornecedores) {
    const k = chaveDoNomeComparado(f.nome);
    if (!k) continue;
    const s = porChave.get(k) ?? new Set<string>();
    s.add(f.id);
    porChave.set(k, s);
  }
  const rotulos = new Map<string, RotuloDoFornecedor>();
  for (const f of fornecedores) {
    const k = chaveDoNomeComparado(f.nome);
    const parecidos = k ? (porChave.get(k)?.size ?? 0) : 0;
    const inativo = f.ativo === false;
    rotulos.set(f.id, {
      nome: f.nome,
      final: parecidos > 1 ? finalDoDocumento(f.cpf_cnpj) : null,
      inativo,
      title: [f.nome.trim(), formatarDocumento(f.cpf_cnpj) || FINAL_SEM_DOCUMENTO, cidadeDe(f), inativo ? 'inativo' : null].filter(Boolean).join(' · '),
    });
  }
  return rotulos;
}

/** O texto que fica à direita do nome, sem cortar: o final (se há parecidos) e a marca "inativo". Vazio quando não há nada. */
export function sufixoDoRotulo(r: RotuloDoFornecedor | undefined): string {
  if (!r) return '';
  return [r.final, r.inativo ? 'inativo' : null].filter(Boolean).join(' · ');
}

/** "Pec.3M-" no começo do nome = fornecedor pago POR RATEIO, com a NF no nome do Higino (Gabriel 19/10/2026). */
export const ehRateio = (nome: string | null | undefined): boolean => /^\s*pec\.3m-/i.test(nome ?? '');
/** Dois cadastros só se mesclam do MESMO lado: os dois com "Pec.3M-" ou os dois sem. "Pec.3M-X" e "X" são diferentes de propósito. */
export const mesmoLadoDoRateio = (a: string | null | undefined, b: string | null | undefined): boolean => ehRateio(a) === ehRateio(b);
