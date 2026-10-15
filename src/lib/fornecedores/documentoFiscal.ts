/**
 * FORN-EDITAR-01 — O VALIDADOR ÚNICO DE CPF/CNPJ DO CADASTRO DE FORNECEDOR. Puro, um arquivo só: todo ponto que grava
 * `financeiro_fornecedores.cpf_cnpj` passa por aqui (o cadastro completo, o cadastro da casa, o criar da casa e o CNPJ do XML).
 * Nenhum outro validador paralelo.
 *
 * · VAZIO É VÁLIDO: fornecedor pode ficar sem documento.
 * · CPF: 11 dígitos + os dois dígitos verificadores (módulo 11); sequência repetida (000…, 111…) é recusada.
 * · CNPJ: 14 posições + os dois dígitos verificadores. Aceita o CNPJ ALFANUMÉRICO da Receita (vigente a partir de jul/2026): as
 *   12 primeiras posições podem ter letra maiúscula, os 2 DV são numéricos, e o valor de cada caractere é o código ASCII − 48
 *   (dígito = ele mesmo; A = 17 … Z = 42), com os pesos de sempre (2 a 9, da direita para a esquerda, recomeçando depois do
 *   oitavo). Fonte: Serpro, "Cálculo dos dígitos verificadores de CNPJ alfanumérico" (exemplo oficial: 12.ABC.345/01DE-35).
 *   Sequência repetida (00.000.000/0000-00 …) também é recusada.
 * · FORMATO GRAVADO: CPF 000.000.000-00 · CNPJ 00.000.000/0000-00 (o alfanumérico no mesmo desenho, letras em maiúsculo).
 */

export type TipoDeDocumento = 'cpf' | 'cnpj';

export interface DocumentoValidado {
  /** Vazio é válido. */
  valido: boolean;
  /** Nulo quando vazio ou quando não dá para dizer (tamanho errado). */
  tipo: TipoDeDocumento | null;
  /** O texto no formato gravado; '' quando vazio ou inválido. */
  formatado: string;
  /** Os caracteres que contam (dígitos e letras, em maiúsculo) — a chave para comparar documentos. */
  digitos: string;
  /** Por que não vale; nulo quando vale. */
  motivo: string | null;
}

export const MOTIVO_TAMANHO = 'Tamanho inválido: CPF tem 11 dígitos e CNPJ tem 14 posições.';
export const MOTIVO_CPF_DV = 'CPF inválido: dígito verificador não confere.';
export const MOTIVO_CPF_REPETIDO = 'CPF inválido: sequência repetida.';
export const MOTIVO_CNPJ_DV = 'CNPJ inválido: dígito verificador não confere.';
export const MOTIVO_CNPJ_REPETIDO = 'CNPJ inválido: sequência repetida.';
export const MOTIVO_CNPJ_LETRA_NO_DV = 'CNPJ inválido: os dois últimos caracteres são números.';
export const MOTIVO_CPF_COM_LETRA = 'CPF não tem letra.';

/** Os caracteres que contam: dígitos e letras, em maiúsculo; pontuação e espaço saem. */
export function chaveDoDocumento(texto: string | null | undefined): string {
  return (texto ?? '').toUpperCase().replace(/[^0-9A-Z]/g, '');
}

const valorDoCaractere = (c: string): number => c.charCodeAt(0) - 48;

/** Um dígito verificador sobre `base`: pesos 2..9 da direita para a esquerda, recomeçando; resto 0 ou 1 → 0. */
function dvModulo11(base: string): number {
  let soma = 0;
  let peso = 2;
  for (let i = base.length - 1; i >= 0; i--) {
    soma += valorDoCaractere(base[i]) * peso;
    peso = peso === 9 ? 2 : peso + 1;
  }
  const resto = soma % 11;
  return resto < 2 ? 0 : 11 - resto;
}

/** O DV do CPF tem pesos próprios (10..2 e 11..2), sem recomeçar. */
function dvDoCpf(base: string): number {
  let soma = 0;
  for (let i = 0; i < base.length; i++) soma += Number(base[i]) * (base.length + 1 - i);
  const resto = soma % 11;
  return resto < 2 ? 0 : 11 - resto;
}

const mascaraCpf = (d: string): string => `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9, 11)}`;
const mascaraCnpj = (d: string): string => `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8, 12)}-${d.slice(12, 14)}`;

const repetido = (d: string): boolean => d.length > 0 && d.split('').every((c) => c === d[0]);

/** Valida o texto livre digitado (com ou sem máscara). */
export function validarDocumento(texto: string | null | undefined): DocumentoValidado {
  const d = chaveDoDocumento(texto);
  if (d === '') return { valido: true, tipo: null, formatado: '', digitos: '', motivo: null };
  const invalido = (tipo: TipoDeDocumento | null, motivo: string): DocumentoValidado => ({ valido: false, tipo, formatado: '', digitos: d, motivo });

  if (d.length === 11) {
    if (!/^\d{11}$/.test(d)) return invalido('cpf', MOTIVO_CPF_COM_LETRA);
    if (repetido(d)) return invalido('cpf', MOTIVO_CPF_REPETIDO);
    const dv1 = dvDoCpf(d.slice(0, 9));
    const dv2 = dvDoCpf(d.slice(0, 9) + dv1);
    if (`${dv1}${dv2}` !== d.slice(9)) return invalido('cpf', MOTIVO_CPF_DV);
    return { valido: true, tipo: 'cpf', formatado: mascaraCpf(d), digitos: d, motivo: null };
  }
  if (d.length === 14) {
    if (!/^\d{2}$/.test(d.slice(12))) return invalido('cnpj', MOTIVO_CNPJ_LETRA_NO_DV);
    if (repetido(d)) return invalido('cnpj', MOTIVO_CNPJ_REPETIDO);
    const dv1 = dvModulo11(d.slice(0, 12));
    const dv2 = dvModulo11(d.slice(0, 12) + dv1);
    if (`${dv1}${dv2}` !== d.slice(12)) return invalido('cnpj', MOTIVO_CNPJ_DV);
    return { valido: true, tipo: 'cnpj', formatado: mascaraCnpj(d), digitos: d, motivo: null };
  }
  return invalido(null, MOTIVO_TAMANHO);
}

/**
 * A máscara ENQUANTO SE DIGITA: só dígitos e até 11 posições = desenho de CPF; letra ou mais de 11 = desenho de CNPJ (corta
 * em 14). Não valida: só desenha o que já foi digitado.
 */
export function mascararAoDigitar(texto: string): string {
  const d = chaveDoDocumento(texto).slice(0, 14);
  if (d === '') return '';
  const cpf = /^\d*$/.test(d) && d.length <= 11;
  const cortes = cpf ? [[3, '.'], [6, '.'], [9, '-']] : [[2, '.'], [5, '.'], [8, '/'], [12, '-']];
  let saida = '';
  for (let i = 0; i < d.length; i++) {
    for (const [pos, sep] of cortes) if (i === pos) saida += sep;
    saida += d[i];
  }
  return saida;
}

export type SituacaoDoGravado = 'ok' | 'vazio' | 'fora_do_padrao';

/**
 * Como está o documento JÁ GRAVADO num cadastro: 'vazio'; 'ok' (válido e escrito no formato gravado); 'fora_do_padrao' (só
 * dígitos, outro formato, tamanho errado ou dígito verificador errado — o motivo diz qual).
 */
export function situacaoDoGravado(gravado: string | null | undefined): { situacao: SituacaoDoGravado; motivo: string | null } {
  const cru = (gravado ?? '').trim();
  if (cru === '') return { situacao: 'vazio', motivo: null };
  const v = validarDocumento(cru);
  if (!v.valido) return { situacao: 'fora_do_padrao', motivo: v.motivo };
  if (v.formatado !== cru) return { situacao: 'fora_do_padrao', motivo: `Gravado fora do formato: o certo é ${v.formatado}.` };
  return { situacao: 'ok', motivo: null };
}
