/**
 * COMO A NOTA SE ESCREVE NA TELA — FIN-NFE-XML-01d. Puro: texto e centavos, sem `Intl` dependente de ambiente.
 */

import { mascaraDoDocumento, soDigitos } from '@/lib/fornecedores/fornecedorTexto';

/** So' os digitos de um texto ("" quando nao ha') — o dono e' `fornecedorTexto` (FORN-SELETOR-PADRAO-01); o nome segue exportado daqui. */
export { soDigitos };

/** "NF 000.178.766": o numero com nove digitos, em grupos de tres. */
export function numeroDaNota(nNF: string): string {
  const d = soDigitos(nNF).padStart(9, '0');
  return `${d.slice(0, -6)}.${d.slice(-6, -3)}.${d.slice(-3)}`;
}

/** "178.766": o numero como se fala, com ponto de milhar e sem zeros a' esquerda. */
export function numeroFalado(nNF: string): string {
  const d = soDigitos(nNF).replace(/^0+(?=\d)/, '');
  return d.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
}

/** CNPJ "00.000.000/0000-00" ou CPF "000.000.000-00" — o formato dos cadastros. Outro tamanho: os digitos como vieram. */
export function documentoFormatado(doc: string | null | undefined): string {
  /* a MASCARA tem um dono (`mascaraDoDocumento`, FORN-SELETOR-PADRAO-01); aqui o tamanho invalido segue saindo so' em digitos */
  const d = soDigitos(doc);
  return mascaraDoDocumento(d) ?? d;
}

/** Centavos -> "16.238,00" (sem "R$"). Inteiros do começo ao fim. */
export function reais(cent: number): string {
  const neg = cent < 0;
  const abs = Math.abs(cent);
  const inteiro = String(Math.trunc(abs / 100)).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return `${neg ? '−' : ''}${inteiro},${String(abs % 100).padStart(2, '0')}`;
}

/** 'YYYY-MM-DD' -> 'dd/mm/aa'. */
export function dataCurta(iso: string | null | undefined): string {
  if (!iso || !/^\d{4}-\d{2}-\d{2}/.test(iso)) return '—';
  return `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(2, 4)}`;
}
/** 'YYYY-MM-DD' -> 'dd/mm'. */
export function diaMes(iso: string | null | undefined): string {
  if (!iso || !/^\d{4}-\d{2}-\d{2}/.test(iso)) return '—';
  return `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;
}
