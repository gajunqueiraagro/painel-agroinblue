/**
 * A CONTA DIGITADA NUM CAMPO DE VALOR — FIN-VALOR-CALC-01a (Gabriel, 05/10/2026).
 *
 * "16.238,00/2", "1.345,50*50%", "(1.345,50+220)/3": o operador faz a conta DIRETO no campo e o campo guarda SÓ O RESULTADO.
 * Este arquivo é o ÚNICO dono da conta: o campo Valor do lançamento o chama hoje, o `CampoMoeda` (21 usos) chamará o mesmo.
 *
 * ⚠ PURO: não importa React, não toca o DOM. NÃO AVALIA CÓDIGO (nada de avaliador de texto nem de construtor de função)
 *   e não traz dependência: analisador próprio
 *   (tokens + descida recursiva com a precedência de sempre).
 * ⚠ OS OPERANDOS SÃO LIDOS PELO `parseMoeda` — o único parser de número pt-BR do sistema ("1.000" é mil, "0,5" é meio). Este
 *   arquivo NÃO escreve um segundo: ele só recorta o pedaço de texto que é número e o entrega.
 * ⚠ A ARITMÉTICA É EXATA: cada operando vira uma FRAÇÃO de inteiros (`bigint`), as quatro operações são feitas em fração, e só
 *   o resultado final é arredondado a centavos (metade para cima) — 0,1 + 0,2 dá 0,30 e 100/3 dá 33,33 sem depender da sorte
 *   do ponto flutuante. O número que sai ainda passa pelo `round2` da casa, que nele é identidade.
 *
 * GRAMÁTICA
 *   conta  := ["="] soma
 *   soma   := termo { ("+" | "-") termo }
 *   termo  := fator { ("*" | "/") fator }
 *   fator  := ( número | "(" soma ")" ) ["%"]
 *   "*" também se escreve x, X, × ; "/" também ÷ ; "-" também o "−" tipográfico. Espaços são ignorados.
 *   NÃO HÁ sinal unário: "-5" não é conta (o campo não aceita valor negativo).
 * O "%" É O DA CALCULADORA COMUM
 *   na multiplicação e na divisão vale "por cento":            A * 50% = A × 0,5      A / 50% = A ÷ 0,5
 *   somado ou subtraído SOZINHO, é por cento do que está à esquerda: A + 10% = A × 1,1   A − 10% = A × 0,9
 *   (termo com mais de um fator não é "sozinho": 100 + 50%*200 = 100 + 100.)
 */
import { parseMoeda, round2 } from '@/lib/calculos/numeroBR';

export type MotivoDaConta = 'vazia' | 'invalida' | 'divisao_por_zero' | 'negativa' | 'grande_demais';
export type ResultadoDaConta =
  | { ok: true; valor: number }
  /** `incompleta`: o texto acabou no meio ("16.238,00/", "(2+3") — ainda pode virar conta; a tela mostra "= …". */
  | { ok: false; motivo: MotivoDaConta; incompleta: boolean };

/** O maior valor que um campo de dinheiro aceita. */
export const TETO_DA_CONTA = 999_999_999.99;

const OPERADORES = /[+*/xX×÷()%]/;
/**
 * O TEXTO É UMA CONTA? — é o que decide se o campo sai da máscara de centavos.
 * Tem operador (+ * / x X × ÷ ( ) %), começa com "=", ou tem um "-" DEPOIS de um operando.
 * ⚠ "-5" NÃO É CONTA: não há operando antes do sinal. É um número com sinal, que o campo de valor não aceita — quem o
 *   recebe (a máscara) fica só com os dígitos, como sempre fez.
 */
export function ehConta(texto: string | null | undefined): boolean {
  const t = (texto ?? '').trim();
  if (!t) return false;
  if (t.startsWith('=')) return true;
  if (OPERADORES.test(t)) return true;
  return /[\d.,]\s*[-−]/.test(t);
}

/* ── fração exata ─────────────────────────────────────────────────────────────────────────────────────────────────────── */
interface Fracao { n: bigint; d: bigint }   // d > 0 sempre
const ZERO = BigInt(0), UM = BigInt(1), CEM = BigInt(100), DEZ = BigInt(10);
const fr = (n: bigint, d: bigint = UM): Fracao => (d < ZERO ? { n: -n, d: -d } : { n, d });
const mdc = (a: bigint, b: bigint): bigint => { let x = a < ZERO ? -a : a, y = b < ZERO ? -b : b; while (y !== ZERO) { [x, y] = [y, x % y]; } return x || UM; };
const reduzir = (f: Fracao): Fracao => { const g = mdc(f.n, f.d); return { n: f.n / g, d: f.d / g }; };
const somar = (a: Fracao, b: Fracao) => reduzir(fr(a.n * b.d + b.n * a.d, a.d * b.d));
const subtrair = (a: Fracao, b: Fracao) => reduzir(fr(a.n * b.d - b.n * a.d, a.d * b.d));
const multiplicar = (a: Fracao, b: Fracao) => reduzir(fr(a.n * b.n, a.d * b.d));
const dividir = (a: Fracao, b: Fracao) => reduzir(fr(a.n * b.d, a.d * b.n));

/** O número que o `parseMoeda` devolveu, como fração exata — pela escrita decimal dele, nunca pelo binário. */
function fracaoDoNumero(n: number): Fracao | null {
  const s = String(n);
  if (!/^\d+(\.\d+)?$/.test(s)) return null;          // notação científica ou algo que não é um decimal simples
  const [inteiro, dec = ''] = s.split('.');
  return reduzir(fr(BigInt(inteiro + dec), DEZ ** BigInt(dec.length)));
}

/* ── tokens ───────────────────────────────────────────────────────────────────────────────────────────────────────────── */
type Token =
  | { t: 'num'; v: Fracao }
  | { t: 'op'; v: '+' | '-' | '*' | '/' }
  | { t: '(' } | { t: ')' } | { t: '%' };

class ErroDaConta extends Error {
  constructor(public motivo: MotivoDaConta, public incompleta = false) { super(motivo); }
}

function tokenizar(texto: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;
  while (i < texto.length) {
    const c = texto[i];
    if (/\s/.test(c)) { i++; continue; }
    if (/[\d.,]/.test(c)) {
      let j = i;
      while (j < texto.length && /[\d.,]/.test(texto[j])) j++;
      const pedaco = texto.slice(i, j);
      const n = /\d/.test(pedaco) ? parseMoeda(pedaco) : null;
      const f = n === null ? null : fracaoDoNumero(n);
      if (!f) throw new ErroDaConta('invalida');
      tokens.push({ t: 'num', v: f });
      i = j; continue;
    }
    if (c === '+') tokens.push({ t: 'op', v: '+' });
    else if (c === '-' || c === '−') tokens.push({ t: 'op', v: '-' });
    else if (c === '*' || c === 'x' || c === 'X' || c === '×') tokens.push({ t: 'op', v: '*' });
    else if (c === '/' || c === '÷') tokens.push({ t: 'op', v: '/' });
    else if (c === '(') tokens.push({ t: '(' });
    else if (c === ')') tokens.push({ t: ')' });
    else if (c === '%') tokens.push({ t: '%' });
    else throw new ErroDaConta('invalida');
    i++;
  }
  return tokens;
}

/* ── análise: descida recursiva ───────────────────────────────────────────────────────────────────────────────────────── */
/** Um termo já calculado; `soPorcento` = ele é UM fator marcado com "%" e mais nada (o "+ 10%" da calculadora). */
interface Termo { valor: Fracao; soPorcento: boolean }

function analisar(tokens: Token[]): Fracao {
  let p = 0;
  const olhar = () => tokens[p];
  const fim = () => new ErroDaConta('invalida', true);

  const fator = (): { valor: Fracao; porcento: boolean } => {
    const tk = olhar();
    if (!tk) throw fim();
    let valor: Fracao;
    if (tk.t === 'num') { valor = tk.v; p++; }
    else if (tk.t === '(') {
      p++;
      valor = soma();
      const fecha = olhar();
      if (!fecha) throw fim();
      if (fecha.t !== ')') throw new ErroDaConta('invalida');
      p++;
    } else throw new ErroDaConta('invalida');
    if (olhar()?.t === '%') { p++; return { valor: dividir(valor, fr(CEM)), porcento: true }; }
    return { valor, porcento: false };
  };

  const termo = (): Termo => {
    const primeiro = fator();
    let valor = primeiro.valor;
    let fatores = 1;
    for (;;) {
      const tk = olhar();
      if (!tk || tk.t !== 'op' || (tk.v !== '*' && tk.v !== '/')) break;
      p++;
      const f = fator();
      fatores++;
      if (tk.v === '*') valor = multiplicar(valor, f.valor);
      else {
        if (f.valor.n === ZERO) throw new ErroDaConta('divisao_por_zero');
        valor = dividir(valor, f.valor);
      }
    }
    return { valor, soPorcento: fatores === 1 && primeiro.porcento };
  };

  function soma(): Fracao {
    let acumulado = termo().valor;
    for (;;) {
      const tk = olhar();
      if (!tk || tk.t !== 'op' || (tk.v !== '+' && tk.v !== '-')) break;
      p++;
      const t = termo();
      /* "A + 10%": dez por cento DE A — o termo sozinho com "%" é proporção do que está à esquerda. */
      const parcela = t.soPorcento ? multiplicar(acumulado, t.valor) : t.valor;
      acumulado = tk.v === '+' ? somar(acumulado, parcela) : subtrair(acumulado, parcela);
    }
    return acumulado;
  }

  const resultado = soma();
  if (p < tokens.length) throw new ErroDaConta('invalida');
  return resultado;
}

/** Fração → centavos inteiros, metade para cima (só chega aqui valor não negativo). */
function centavos(f: Fracao): bigint {
  const DOIS = BigInt(2);
  return (f.n * CEM * DOIS + f.d) / (f.d * DOIS);
}

/**
 * CALCULA A CONTA. Devolve o valor em reais, já em duas casas, ou o motivo da recusa.
 * Um número sozinho ("16.238,00") é uma conta válida de um termo só — o campo em modo conta pode ter ficado sem operador.
 */
export function calcularConta(texto: string | null | undefined): ResultadoDaConta {
  let t = (texto ?? '').trim();
  if (t.startsWith('=')) t = t.slice(1).trim();
  if (!t) return { ok: false, motivo: 'vazia', incompleta: false };
  try {
    const tokens = tokenizar(t);
    if (tokens.length === 0) return { ok: false, motivo: 'vazia', incompleta: false };
    const f = analisar(tokens);
    if (f.n < ZERO) return { ok: false, motivo: 'negativa', incompleta: false };
    const c = centavos(f);
    if (c > BigInt(Math.round(TETO_DA_CONTA * 100))) return { ok: false, motivo: 'grande_demais', incompleta: false };
    return { ok: true, valor: round2(Number(c) / 100) };
  } catch (e) {
    if (e instanceof ErroDaConta) return { ok: false, motivo: e.motivo, incompleta: e.incompleta };
    throw e;
  }
}

/** A frase de cada recusa, para a tela escrever ao lado do campo. Uma lista só. */
export const FRASE_DA_CONTA: Record<MotivoDaConta, string> = {
  vazia: 'conta vazia',
  invalida: 'conta inválida',
  divisao_por_zero: 'divisão por zero',
  negativa: 'resultado negativo',
  grande_demais: 'valor grande demais',
};

/** `true` quando a conta deu certo; estreita sem depender de `strict`. */
export function contaOk(r: ResultadoDaConta): r is { ok: true; valor: number } {
  return r.ok === true;
}
