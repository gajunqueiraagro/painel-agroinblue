/**
 * BOLETO-DDA-API-01 · D1b — O BOLETO EM PDF → o que a caixa de entrada recebe (`fn_boleto_entrar`, `p_leitura`).
 *
 * ⚠ POR POSIÇÃO, NÃO PELA ORDEM DO TEXTO (FASE 0, 14/11/2026, 12 boletos reais lidos em memória): o pdfjs não devolve os itens na
 *   ordem da leitura, e "o documento depois do rótulo" caía no MESMO número para Beneficiário e Pagador em 4 de 10, e em nada em 6.
 *   Pela posição (o documento logo abaixo ou ao lado do rótulo, na mesma página — a regra do `aoLado` do DANFE) saiu UM beneficiário
 *   em 10 de 10.
 * As regras:
 * - DOCUMENTO SÓ COM DV CERTO: CPF (11), CNPJ numérico e CNPJ alfanumérico (14; a Receita emite desde jul/2026). Pedaço da linha
 *   digitável ou do nosso número com cara de CNPJ não passa.
 * - O rótulo do beneficiário é "Beneficiário"/"Cedente" — "Beneficiário final" e "Sacador/Avalista" ficam FORA; o do pagador é
 *   "Pagador"/"Sacado".
 * - O recibo do pagador e a ficha de compensação repetem os rótulos: junta-se o que cada ocorrência acha. O documento que aparece
 *   junto dos DOIS rótulos é de nenhum; sobrando mais de um, AMBÍGUO.
 * - AMBÍGUO = null + `confira` (OK do Chat 14/11: nunca chutar). A caixa mostra "confira"; sem documento, o banco casa "por nome".
 * - PDF COM SENHA: motivo próprio; a tela pede a senha ao operador e pode SUGERIR os 5 primeiros dígitos dos documentos do cliente
 *   (`sugestoesDeSenha`). A senha nunca é gravada nem vai ao banco.
 */
import type { ItemDoDanfe } from '@/lib/financeiro/nfe/danfe';
import { itensDoPdf, type PdfjsMinimo } from '@/lib/financeiro/nfe/lerNotaPdf';
import { acharBoletoNoTexto, type BoletoNormalizado } from '@/lib/financeiro/linhaDigitavel';

/* ═══ documento (CPF / CNPJ numérico / CNPJ alfanumérico) ═══ */

/** O valor do caractere no DV do CNPJ alfanumérico: o código ASCII menos 48 ('0' = 0 … '9' = 9, 'A' = 17 … 'Z' = 42). */
const valorDoCaractere = (c: string) => c.charCodeAt(0) - 48;

function cnpjOk(d: string): boolean {
  if (!/^[0-9A-Z]{12}\d{2}$/.test(d) || /^(\d)\1{13}$/.test(d)) return false;
  const dv = (base: string, pesos: number[]) => {
    const s = pesos.reduce((acc, p, i) => acc + valorDoCaractere(base[i]) * p, 0) % 11;
    return s < 2 ? 0 : 11 - s;
  };
  const p1 = [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
  return dv(d.slice(0, 12), p1) === Number(d[12]) && dv(d.slice(0, 13), [6, ...p1]) === Number(d[13]);
}

function cpfOk(d: string): boolean {
  if (!/^\d{11}$/.test(d) || /^(\d)\1{10}$/.test(d)) return false;
  const dv = (n: number) => {
    let s = 0;
    for (let i = 0; i < n; i++) s += Number(d[i]) * (n + 1 - i);
    const r = (s * 10) % 11;
    return r === 10 ? 0 : r;
  };
  return dv(9) === Number(d[9]) && dv(10) === Number(d[10]);
}

/** O documento só com letras e dígitos, em caixa alta — a MESMA chave do banco (`_fn_fornecedor_chave_documento`). */
export const chaveDoDocumento = (s: string) => s.replace(/[^0-9A-Za-z]/g, '').toUpperCase();

/** CPF ou CNPJ (numérico ou alfanumérico) com DV certo. */
export function documentoValido(s: string): boolean {
  const d = chaveDoDocumento(s);
  return d.length === 11 ? cpfOk(d) : d.length === 14 ? cnpjOk(d) : false;
}

/** Os documentos com DV certo de um texto: pontuados, ou soltos quando o texto é SÓ o número (nunca um pedaço de número maior). */
const DOC_PONTUADO = /(?<![0-9A-Z])(?:[0-9A-Z]{2}\.[0-9A-Z]{3}\.[0-9A-Z]{3}\/[0-9A-Z]{4}-\d{2}|\d{3}\.\d{3}\.\d{3}-\d{2})(?![0-9A-Z])/gi;
export function documentosDoTexto(s: string): string[] {
  const achados = [...s.matchAll(DOC_PONTUADO)].map((m) => chaveDoDocumento(m[0]));
  const solto = /^\s*(?:CPF|CNPJ|CPF\/CNPJ)?[:\s]*([0-9A-Z]{14}|\d{11})\s*$/i.exec(s);
  if (solto) achados.push(chaveDoDocumento(solto[1]));
  return [...new Set(achados.filter(documentoValido))];
}

/* ═══ rótulos e posição ═══ */

/* O rótulo COMEÇA o item (com "Nome do"/"CPF/CNPJ do" na frente, no máximo): a frase do rodapé que só cita "o beneficiário" não é
   rótulo (medido num boleto real: um item de 118 caracteres com a palavra duas vezes). */
const ANTES_DO_ROTULO = String.raw`^\s*(?:(?:nome|cpf\s*\/\s*cnpj|cnpj|cpf)\s+(?:do\s+)?)?`;
const ROTULO_BENEFICIARIO = new RegExp(`${ANTES_DO_ROTULO}(?:benefici[aá]rio|cedente)`, 'i');
const ROTULO_PAGADOR = new RegExp(`${ANTES_DO_ROTULO}(?:pagador|sacado(?!r))`, 'i');
/** "Beneficiário final" (o do PIX/ficha), "Sacador/Avalista" e "Agência/Código do Beneficiário" não são o beneficiário do título. */
const ROTULO_FORA = /benefici[aá]rio\s+final|sacador|avalista|c[oó]digo|ag[eê]ncia/i;

/** Até onde abaixo do rótulo (em pontos do PDF; ~3 linhas de boleto) e para o lado se procura o valor dele. O lado: o CNPJ na
 *  mesma linha do rótulo foi medido a 316 pt num boleto real (300 o perdia). */
const ABAIXO_MAX = 40;
const AO_LADO_MAX = 340;

interface ItemNaPagina extends ItemDoDanfe { pagina: number }

function ehRotulo(t: string, re: RegExp): boolean {
  return re.test(t) && !ROTULO_FORA.test(t);
}

/** Os itens perto de um rótulo: na mesma linha à direita, ou logo abaixo; o mais perto primeiro (y no PDF cresce para cima). */
function pertoDe(rotulo: ItemNaPagina, itens: ItemNaPagina[]): ItemNaPagina[] {
  return itens
    .filter((t) => t.pagina === rotulo.pagina && t.y <= rotulo.y + 2 && rotulo.y - t.y < ABAIXO_MAX && Math.abs(t.x - rotulo.x) < AO_LADO_MAX)
    .sort((a, b) => (rotulo.y - a.y) - (rotulo.y - b.y) || Math.abs(a.x - rotulo.x) - Math.abs(b.x - rotulo.x));
}

/** O nome que o item traz, sem o rótulo, sem o documento, sem "CPF/CNPJ:". Null quando sobra menos de 3 letras. */
function nomeDoItem(s: string): string | null {
  const limpo = s
    .replace(DOC_PONTUADO, ' ')
    .replace(/benefici[aá]rio|cedente|pagador|sacado|nome|raz[aã]o\s+social|cpf\s*\/\s*cnpj|cnpj|cpf|[:|]/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^[-–—,.\s]+|[-–—,.\s]+$/g, '');
  return (limpo.match(/\p{L}/gu) ?? []).length >= 3 ? limpo : null;
}

export interface ParteDoBoleto {
  /** Só letras e dígitos, em caixa alta; null quando não achou ou ficou ambíguo. */
  documento: string | null;
  nome: string | null;
  /** true = o leitor não decidiu sozinho (documento ambíguo, ou rótulo sem documento): a caixa mostra "confira". */
  confira: boolean;
}

interface Achado { documentos: string[]; nomes: string[]; rotulos: number }

function acharParte(itens: ItemNaPagina[], re: RegExp): Achado {
  const documentos: string[] = [];
  const nomes: string[] = [];
  const rotulos = itens.filter((t) => ehRotulo(t.str, re));
  for (const r of rotulos) {
    const perto = [r, ...pertoDe(r, itens).filter((t) => t !== r)];
    const comDoc = perto.find((t) => documentosDoTexto(t.str).length > 0);
    if (comDoc) documentos.push(documentosDoTexto(comDoc.str)[0]);
    const nome = perto.map((t) => (ehRotulo(t.str, ROTULO_BENEFICIARIO) || ehRotulo(t.str, ROTULO_PAGADOR)) && t !== r ? null : nomeDoItem(t.str))
      .find((n) => n !== null);
    if (nome) nomes.push(nome);
  }
  return { documentos: [...new Set(documentos)], nomes, rotulos: rotulos.length };
}

function decidir(a: Achado, doOutro: string[]): ParteDoBoleto {
  const meus = a.documentos.filter((d) => !doOutro.includes(d));
  const documento = meus.length === 1 ? meus[0] : null;
  return {
    documento,
    nome: a.nomes[0] ?? null,
    confira: a.rotulos > 0 && documento === null,
  };
}

export interface LeituraDoBoleto {
  /** A linha conferida (DV certo), ou null. */
  boleto: BoletoNormalizado | null;
  beneficiario: ParteDoBoleto;
  pagador: ParteDoBoleto;
}

/** Os itens do PDF (com posição, página a página, como o `itensDoPdf` devolve) → a leitura do boleto. Pura. */
export function lerBoleto(paginas: ItemDoDanfe[][]): LeituraDoBoleto {
  const itens: ItemNaPagina[] = paginas.flatMap((p, i) => p.map((t) => ({ ...t, pagina: i + 1 })));
  const texto = paginas.map((p) => p.map((t) => t.str).join(' ')).join('\n');
  const b = acharParte(itens, ROTULO_BENEFICIARIO);
  const p = acharParte(itens, ROTULO_PAGADOR);
  return {
    boleto: acharBoletoNoTexto(texto),
    beneficiario: decidir(b, p.documentos),
    pagador: decidir(p, b.documentos),
  };
}

/** A leitura no formato do `p_leitura` da `fn_boleto_entrar` (o banco reconfere o DV; os campos vazios não vão). */
export function paraEntrada(l: LeituraDoBoleto & { boleto: BoletoNormalizado }, origem: 'pdf' | 'email' | 'whatsapp', arquivoNome: string) {
  const ext = /\.([A-Za-z0-9]+)$/.exec(arquivoNome)?.[1] ?? 'pdf';
  return {
    linha: l.boleto.linha,
    origem,
    arquivo_nome: arquivoNome,
    arquivo_extensao: ext.toLowerCase(),
    ...(l.beneficiario.nome ? { beneficiario_nome: l.beneficiario.nome } : {}),
    ...(l.beneficiario.documento ? { beneficiario_documento: l.beneficiario.documento } : {}),
    ...(l.pagador.nome ? { pagador_nome: l.pagador.nome } : {}),
    ...(l.pagador.documento ? { pagador_documento: l.pagador.documento } : {}),
  };
}

/* ═══ o arquivo ═══ */

export type LeituraDoArquivo =
  | { ok: true; leitura: LeituraDoBoleto }
  | { ok: false; motivo: 'senha' | 'senha_errada' | 'sem_texto' | 'ilegivel'; frase: string };

export const FRASE_SENHA = 'Este PDF é protegido por senha. Digite a senha para ler o boleto (ela não é guardada).';
export const FRASE_SENHA_ERRADA = 'A senha não abriu o PDF. Confira e tente de novo.';
export const FRASE_SEM_TEXTO = 'Este PDF não tem texto (é uma imagem). Digite a linha digitável.';
export const FRASE_ILEGIVEL = 'Não consegui abrir este PDF.';

/** O pdfjs avisa a senha por `PasswordException`: código 1 = precisa de senha, 2 = senha errada. */
function erroDeSenha(e: unknown): 'senha' | 'senha_errada' | null {
  if (typeof e !== 'object' || e === null || !('name' in e) || e.name !== 'PasswordException') return null;
  return 'code' in e && e.code === 2 ? 'senha_errada' : 'senha';
}

export async function lerBoletoDoArquivo(
  bytes: ArrayBuffer,
  opcoes: { senha?: string; pdfjs?: PdfjsMinimo } = {},
): Promise<LeituraDoArquivo> {
  try {
    const { paginas } = await itensDoPdf(bytes, opcoes.pdfjs, { senha: opcoes.senha });
    if (!paginas.some((p) => p.some((t) => t.str.trim() !== ''))) return { ok: false, motivo: 'sem_texto', frase: FRASE_SEM_TEXTO };
    return { ok: true, leitura: lerBoleto(paginas) };
  } catch (e) {
    const senha = erroDeSenha(e);
    if (senha === 'senha') return { ok: false, motivo: 'senha', frase: FRASE_SENHA };
    if (senha === 'senha_errada') return { ok: false, motivo: 'senha_errada', frase: FRASE_SENHA_ERRADA };
    console.error('[boleto] PDF ilegível', e);
    return { ok: false, motivo: 'ilegivel', frase: FRASE_ILEGIVEL };
  }
}

/**
 * Sugestões de senha para o operador escolher (muitos bancos usam os 5 primeiros dígitos do CPF/CNPJ do pagador): os 5 primeiros
 * dígitos de cada documento dado (os do cliente), sem repetir. SÓ SUGESTÃO: nada aqui grava ou envia a senha.
 */
export function sugestoesDeSenha(documentos: (string | null | undefined)[]): string[] {
  return [...new Set(documentos.map((d) => (d ?? '').replace(/\D/g, '')).filter((d) => d.length >= 5).map((d) => d.slice(0, 5)))];
}
