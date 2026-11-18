/**
 * Linha digitável de boleto bancário — FIN-NFE-PARCELAS-01 PR 2b.
 *
 * O boleto em PDF traz a linha digitável (47 dígitos) na camada de texto. Dela sai o VENCIMENTO e o
 * VALOR sem adivinhar nada do layout do banco:
 *   campo 5 = fator de vencimento (4 dígitos) + valor (10 dígitos, em centavos).
 *
 * ⚠ O FATOR REINICIOU EM 22/02/2025: o fator 1000 passou a ser 22/02/2025 (antes, a base era
 *   07/10/1997 e o fator 9999 caía em 21/02/2025). Medido nos 8 boletos reais da Vera (29/09/2026):
 *   a regra nova dá exatamente o vencimento impresso nos 8; a antiga daria 2002.
 * ⚠ SEM LINHA, NULL — nunca um vencimento inventado. Fator 0000 ("sem vencimento") dá vencimento nulo.
 * ⚠ SÓ VALE COM O DÍGITO VERIFICADOR CERTO (BOLETO-DDA-API-01 D1b, 14/11/2026): a linha lida do PDF com um dígito trocado dava
 *   vencimento/valor errados em silêncio. A régua é a MESMA do banco (`_fn_boleto_normalizar`, 118100): os casos de
 *   `linhaDigitavel.casos.json` rodam nos dois (`linhaDigitavelDv.test.ts` e `supabase/tests/boleto_d1b_dv_test.sql`).
 */

export interface LeituraBoleto {
  /** Os 47 dígitos, sem separador. */
  linha: string;
  /** `YYYY-MM-DD`, ou null quando o boleto não traz vencimento (fator 0000). */
  vencimento: string | null;
  /** Em reais, ou null quando o valor vem zerado (boleto de valor livre). */
  valor: number | null;
}

/** Os cinco campos da linha, com os separadores que os bancos imprimem (ponto e espaço). */
const COM_SEPARADOR = /(\d{5})[.\s]?(\d{5})\s+(\d{5})[.\s]?(\d{6})\s+(\d{5})[.\s]?(\d{6})\s+(\d)\s+(\d{14})/;

const BASE_FATOR = Date.UTC(2025, 1, 22); // fator 1000
const DIA = 86_400_000;

/** Fator de vencimento -> data, pela regra vigente desde 22/02/2025. */
export function vencimentoDoFator(fator: number): string | null {
  if (!Number.isInteger(fator) || fator <= 0) return null;
  const d = new Date(BASE_FATOR + (fator - 1000) * DIA);
  return d.toISOString().slice(0, 10);
}

/* ═══ o dígito verificador (FEBRABAN) — porta linha a linha da `_fn_boleto_normalizar` (118100) ═══ */

function mod10(p: string): number {
  let t = 0; let w = 2;
  for (let i = p.length - 1; i >= 0; i--) {
    const x = Number(p[i]) * w;
    t += Math.floor(x / 10) + (x % 10);
    w = w === 2 ? 1 : 2;
  }
  return (10 - (t % 10)) % 10;
}

/** `arrecadacao = false`: o do código de barras bancário (0/10/11 → 1); `true`: o da arrecadação (resto 0/1 → 0). */
function mod11(p: string, arrecadacao: boolean): number {
  let t = 0; let w = 2;
  for (let i = p.length - 1; i >= 0; i--) {
    t += Number(p[i]) * w;
    w = w === 9 ? 2 : w + 1;
  }
  if (arrecadacao) return t % 11 <= 1 ? 0 : 11 - (t % 11);
  const d = 11 - (t % 11);
  return d === 0 || d === 10 || d === 11 ? 1 : d;
}

/** Por que a linha não vale — os mesmos nomes do banco. */
export type MotivoDaLinha = 'tamanho' | 'dv_campo' | 'dv_bloco' | 'dv_geral' | 'arrecadacao_sem_8';

/** O boleto conferido, com AS CHAVES DO BANCO (o `jsonb` da `_fn_boleto_normalizar`): o caso é comparado campo a campo. */
export interface BoletoNormalizado {
  ok: true;
  /** Os 44 dígitos do código de barras: a chave do título na caixa (`boletos.codigo_barras`). */
  codigo_barras: string;
  /** A linha de 47 (bancário) ou 48 (arrecadação). */
  linha: string;
  tipo: 'bancario' | 'arrecadacao';
  /** Os 3 dígitos do banco emissor; null na arrecadação. */
  banco: string | null;
  /** Em reais; null quando zerado (valor livre) ou, na arrecadação, quando o 3º dígito não diz "valor efetivo" (6 ou 8). */
  valor: number | null;
  /** `YYYY-MM-DD`; null no fator 0000 e sempre na arrecadação (o vencimento dela não está no código). */
  vencimento: string | null;
}
export type LinhaConferida = BoletoNormalizado | { ok: false; motivo: MotivoDaLinha };

const centavosOuNulo = (digitos: string): number | null => {
  const c = Number(digitos);
  return c > 0 ? c / 100 : null;
};

/**
 * Linha de 47 (bancário), de 48 (arrecadação) ou o código de barras de 44, com ou sem separador → o boleto conferido, ou o motivo.
 * Nunca adivinha: dígito verificador errado = não confere.
 */
export function normalizarBoleto(entrada: string | null | undefined): LinhaConferida {
  const d = (entrada ?? '').replace(/[^0-9]/g, '');
  let bc: string;
  let linha: string | null = null;
  let arrecadacao: boolean;
  if (d.length === 47) {
    if (mod10(d.slice(0, 9)) !== Number(d[9]) || mod10(d.slice(10, 20)) !== Number(d[20]) || mod10(d.slice(21, 31)) !== Number(d[31])) {
      return { ok: false, motivo: 'dv_campo' };
    }
    bc = d.slice(0, 4) + d[32] + d.slice(33, 47) + d.slice(4, 9) + d.slice(10, 20) + d.slice(21, 31);
    linha = d; arrecadacao = false;
  } else if (d.length === 48) {
    if (d[0] !== '8') return { ok: false, motivo: 'arrecadacao_sem_8' };
    const m11 = d[2] === '8' || d[2] === '9';
    bc = '';
    for (let i = 0; i < 4; i++) {
      const b = d.slice(i * 12, i * 12 + 11);
      if ((m11 ? mod11(b, true) : mod10(b)) !== Number(d[i * 12 + 11])) return { ok: false, motivo: 'dv_bloco' };
      bc += b;
    }
    linha = d; arrecadacao = true;
  } else if (d.length === 44) {
    bc = d; arrecadacao = d[0] === '8';
  } else {
    return { ok: false, motivo: 'tamanho' };
  }

  if (arrecadacao) {
    const m11 = bc[2] === '8' || bc[2] === '9';
    const semDv = bc.slice(0, 3) + bc.slice(4);
    if ((m11 ? mod11(semDv, true) : mod10(semDv)) !== Number(bc[3])) return { ok: false, motivo: 'dv_geral' };
    if (linha === null) {
      linha = '';
      for (let i = 0; i < 4; i++) {
        const b = bc.slice(i * 11, i * 11 + 11);
        linha += b + String(m11 ? mod11(b, true) : mod10(b));
      }
    }
    const valor = bc[2] === '6' || bc[2] === '8' ? centavosOuNulo(bc.slice(4, 15)) : null;
    return { ok: true, codigo_barras: bc, linha, tipo: 'arrecadacao', banco: null, valor, vencimento: null };
  }

  if (mod11(bc.slice(0, 4) + bc.slice(5), false) !== Number(bc[4])) return { ok: false, motivo: 'dv_geral' };
  if (linha === null) {
    const c1 = bc.slice(0, 4) + bc.slice(19, 24);
    const c2 = bc.slice(24, 34);
    const c3 = bc.slice(34, 44);
    linha = c1 + String(mod10(c1)) + c2 + String(mod10(c2)) + c3 + String(mod10(c3)) + bc[4] + bc.slice(5, 19);
  }
  return {
    ok: true, codigo_barras: bc, linha, tipo: 'bancario', banco: bc.slice(0, 3),
    valor: centavosOuNulo(bc.slice(9, 19)), vencimento: vencimentoDoFator(Number(bc.slice(5, 9))),
  };
}

/** Os cinco campos da linha de 47, com separador; a de 48 em quatro blocos de 11 + DV ("81660000001-1 23450001111-4 …"). */
const COM_SEPARADOR_TODAS = new RegExp(COM_SEPARADOR.source, 'g');
const ARRECADACAO_EM_BLOCOS = /8\d{10}[-.\s]?\d\s+\d{11}[-.\s]?\d\s+\d{11}[-.\s]?\d\s+\d{11}[-.\s]?\d/g;
const CORRIDA_47 = /(?<!\d)\d{47}(?!\d)/g;
const CORRIDA_48 = /(?<!\d)8\d{47}(?!\d)/g;

/**
 * O boleto do texto do PDF: a PRIMEIRA linha (47 ou 48, com separador ou corrida) com DV certo. Sem nenhuma, null.
 * ⚠ O código de barras de 44 solto no texto NÃO é procurado: a chave da NF-e também tem 44 dígitos.
 */
export function acharBoletoNoTexto(texto: string): BoletoNormalizado | null {
  const candidatas = [
    ...[...texto.matchAll(COM_SEPARADOR_TODAS)].map((m) => m.slice(1).join('')),
    ...[...texto.matchAll(ARRECADACAO_EM_BLOCOS)].map((m) => m[0]),
    ...[...texto.matchAll(CORRIDA_47)].map((m) => m[0]),
    ...[...texto.matchAll(CORRIDA_48)].map((m) => m[0]),
  ];
  for (const c of candidatas) {
    const r = normalizarBoleto(c);
    if (r.ok) return r;
  }
  return null;
}

/**
 * BOLETO D3d (D7) — TODOS os boletos do texto (o PDF com 2+ fichas de compensação), cada um com o DV conferido, sem repetir o mesmo
 * título (a ficha e o recibo do pagador trazem a mesma linha). Ordem = a do texto. O `acharBoletoNoTexto` de hoje fica como está.
 */
export function acharBoletosNoTexto(texto: string): BoletoNormalizado[] {
  const candidatas = [
    ...[...texto.matchAll(COM_SEPARADOR_TODAS)].map((m) => ({ i: m.index ?? 0, c: m.slice(1).join('') })),
    ...[...texto.matchAll(ARRECADACAO_EM_BLOCOS)].map((m) => ({ i: m.index ?? 0, c: m[0] })),
    ...[...texto.matchAll(CORRIDA_47)].map((m) => ({ i: m.index ?? 0, c: m[0] })),
    ...[...texto.matchAll(CORRIDA_48)].map((m) => ({ i: m.index ?? 0, c: m[0] })),
  ].sort((a, b) => a.i - b.i);
  const achados: BoletoNormalizado[] = [];
  for (const { c } of candidatas) {
    const r = normalizarBoleto(c);
    if (r.ok && !achados.some((x) => x.codigo_barras === r.codigo_barras)) achados.push(r);
  }
  return achados;
}

/**
 * Lê a linha digitável de 47 dígitos (com ou sem separadores) COM DV CERTO. Devolve null se não houver.
 * (O "Anexar boletos das parcelas" só casa boleto bancário; a arrecadação fica para a caixa, por `acharBoletoNoTexto`.)
 */
export function lerLinhaDigitavel(texto: string): LeituraBoleto | null {
  const candidatas = [
    ...[...texto.matchAll(COM_SEPARADOR_TODAS)].map((m) => m.slice(1).join('')),
    ...[...texto.matchAll(CORRIDA_47)].map((m) => m[0]),
  ];
  for (const c of candidatas) {
    const r = normalizarBoleto(c);
    if (r.ok) return { linha: r.linha, vencimento: r.vencimento, valor: r.valor };
  }
  return null;
}
