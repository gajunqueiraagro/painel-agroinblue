/**
 * CPR-LARGURA-01 (Gabriel 03/11 19:50) — A LISTA DA CONTAS A PAGAR E RECEBER CABE NA TELA, sem barra horizontal, de 1.280px para cima.
 *
 * Regra de 21/10: coluna curta pelo maior texto; a sobra é da Descrição, do Fornecedor e do Subcentro (dividem em partes iguais, uma
 * linha, "…" e o inteiro no `title`). Datas, NF e Status justos; A receber, A pagar e Saldo na largura do MAIOR VALOR do período.
 *
 * ⚠ AS LARGURAS FORAM MEDIDAS na bancada (Chromium, a fonte da casa), não arbitradas:
 *   - data dd/mm/aa a 9,5px: 43,9 → 46 · "NF 000.000.000" a 9,5px: 75,9 → 76 · a pílula "Programado" a 9px com px-0.5: 56,3 → 58;
 *   - valor da FAIXA (11px negrito, o mais largo dos três lugares): "▼ R$ 9,99" 55,8 · cada algarismo 7,35 · cada ponto de milhar 3,3 ·
 *     o "−" do saldo 7,4 (ex.: "▼ −R$ 999.999,99" = 103,3; "▼ −R$ 99.999.999,99" = 121,3).
 * ⚠ O VALOR VAI EM DEGRAUS, nunca algarismo a algarismo: até R$ 999.999,99 · até R$ 99.999.999,99 · acima, pelo número. O maior valor
 *   sai do período (as linhas, a série do saldo e os totais). As pílulas de status filtram NA CONSULTA: a tela guarda o teto, que só
 *   CRESCE enquanto cliente, período e conta são os mesmos — desligar uma pílula nunca estreita a régua (NADA SE DESLOCA).
 */

export interface Regua {
  comp: number; venc: number; pgto: number; selo: number; safra: number; faz: number;
  nf: number; status: number; pagar: number; receber: number; saldo: number;
}

/** As colunas fixas que não dependem do valor (as de valor saem de `larguraDosValoresCpr`). */
const FIXAS: Readonly<Pick<Regua, 'comp' | 'venc' | 'pgto' | 'selo' | 'nf' | 'status'>> = { comp: 46, venc: 46, pgto: 46, selo: 16, nf: 76, status: 58 };
/** O ampliado é a MESMA régua + Safra e Faz. (P152, Gabriel 28/10 15:34, D2). */
const DO_AMPLIADO: Readonly<Pick<Regua, 'safra' | 'faz'>> = { safra: 56, faz: 26 };
/** Descrição, Fornecedor e Subcentro: cada um nunca abaixo disto (a lista só rola na horizontal abaixo de ~1.100px de janela). */
export const TEXTO_MINIMO_CPR = 95;
/** px-3 da linha (24) + o filete de 3px. */
const MOLDURA = 27;
const VAO = 4;

/** Os algarismos da parte inteira de |v| ("0,00" tem 1). */
const algarismos = (v: number): number => String(Math.trunc(Math.abs(Math.round(v * 100) / 100))).length;
/** O degrau: até 6 algarismos (R$ 999.999,99) · até 8 (R$ 99.999.999,99) · acima, o próprio número. */
export const degrauDosAlgarismos = (n: number): number => (n <= 6 ? 6 : n <= 8 ? 8 : n);

/** A largura do valor na faixa (11px negrito, com a seta): `comMenos` = a coluna Saldo, que pode levar "−". */
export function larguraDoValorCpr(algs: number, comMenos: boolean): number {
  const pontos = Math.floor((algs - 1) / 3);
  return Math.ceil(48.45 + 7.35 * algs + 3.3 * pontos + (comMenos ? 7.4 : 0));
}

/** As três colunas de valor para o maior valor do período. */
export function larguraDosValoresCpr(maiorValor: number): Pick<Regua, 'receber' | 'pagar' | 'saldo'> {
  const n = degrauDosAlgarismos(algarismos(maiorValor));
  const lado = larguraDoValorCpr(n, false);
  return { receber: lado, pagar: lado, saldo: larguraDoValorCpr(n, true) };
}

/** A régua do modo, para o maior valor do período. */
export function reguaDaCpr(ampliado: boolean, maiorValor: number): Regua {
  return { ...FIXAS, safra: ampliado ? DO_AMPLIADO.safra : 0, faz: ampliado ? DO_AMPLIADO.faz : 0, ...larguraDosValoresCpr(maiorValor) };
}

/** A largura mínima da lista: a moldura, as colunas da régua, as três de texto no mínimo e 4px por vão. Abaixo dela a lista rola. */
export function larguraMinimaCpr(r: Regua): number {
  const colunas = [r.comp, r.venc, r.pgto, r.selo, r.safra, r.faz, r.nf, r.status, r.receber, r.pagar, r.saldo].filter((x) => x > 0);
  return MOLDURA + colunas.reduce((a, b) => a + b, 0) + 3 * TEXTO_MINIMO_CPR + VAO * (colunas.length + 3 - 1);
}

/**
 * O MAIOR |valor| que a lista pode desenhar no período: varre os números de tudo o que a tela soma (as linhas, a série do saldo, o
 * rodapé). Varre o objeto inteiro de propósito: um total novo na série entra sem ninguém lembrar de pôr aqui.
 */
export function maiorValorCpr(...fontes: readonly unknown[]): number {
  let maior = 0;
  const vistos = new Set<object>();
  const varrer = (x: unknown): void => {
    if (typeof x === 'number') { if (Number.isFinite(x) && Math.abs(x) > maior) maior = Math.abs(x); return; }
    if (x === null || typeof x !== 'object' || vistos.has(x)) return;
    vistos.add(x);
    if (Array.isArray(x)) { for (const y of x) varrer(y); return; }
    if (x instanceof Set || x instanceof Map) return;
    for (const y of Object.values(x)) varrer(y);
  };
  for (const f of fontes) varrer(f);
  return maior;
}
