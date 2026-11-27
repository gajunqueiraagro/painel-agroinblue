/**
 * ENTRADA-CENTRAL-01 F1 — A LEITURA GUARDADA: o resultado do leitor da caixa (`lerDaCaixa`), lido UMA vez (na Lambda, na chegada do
 * e-mail; ou no navegador, para o que chegou antes), fica na linha da entrada (`entrada_arquivos.leitura`) e a caixa não relê.
 *
 * ⚠ SÓ O RESULTADO, NUNCA O TEXTO DO ARQUIVO (Gabriel 18/11, lote L1 cancelado: "não quer texto guardado à parte"). Guarda-se o que a
 *   caixa mostra: a nota (chave, número, emitente, valor, 1º vencimento), os boletos (código, linha, valor, vencimento) com beneficiário e
 *   pagador, a página de cada boleto, a frase do "nada". O banco recusa qualquer outra chave (`_fn_entrada_leitura_valida`).
 * ⚠ FOLHA E RESUMO DO CONTADOR NÃO SE GUARDAM: têm salário e pessoa por pessoa. Fica só o tipo (`k`), e a caixa lê esses no navegador,
 *   como hoje (o `lerFolha` do Code 6). Senha: só o "pede senha" (a senha nunca); erro de leitura não se guarda (tenta de novo).
 * ⚠ VERSÃO DO LEITOR (`LEITOR_VERSAO`): leitura de versão diferente não vale — a caixa lê de novo e guarda a nova. Mudou um arquivo do
 *   leitor, muda a versão: o teste `leituraGravada.test.ts` prende o md5 de cada arquivo do leitor a esta versão.
 */
import type { LeituraDaCaixa } from './lerDaCaixa';
import type { BoletoNormalizado } from '@/lib/financeiro/linhaDigitavel';
import type { ParteDoBoleto } from './lerBoleto';
import type { ResumoDaNota } from './caixaPorEmail';

export const LEITOR_VERSAO = 'caixa-2';
/** O teto do que se guarda por arquivo (o banco confere o mesmo). Um PDF com dezenas de boletos cabe com folga. */
export const LEITURA_MAX_BYTES = 32768;

export type LeituraGravada =
  | { v: string; k: 'nota'; nota: ResumoDaNota }
  | { v: string; k: 'boletos'; boletos: BoletoNormalizado[]; beneficiario: ParteDoBoleto; pagador: ParteDoBoleto; paginaDeCada?: number[]; totalDePaginas?: number }
  | { v: string; k: 'folha' }
  | { v: string; k: 'resumo' }
  | { v: string; k: 'nada'; frase: string }
  | { v: string; k: 'senha' };

/** A leitura da caixa → o que se guarda (null = não se guarda: erro, que se tenta de novo). */
export function paraGravar(l: LeituraDaCaixa): LeituraGravada | null {
  const v = LEITOR_VERSAO;
  switch (l.k) {
    case 'nota': return { v, k: 'nota', nota: { chave: l.nota.chave, numero: l.nota.numero, emitente: l.nota.emitente, valor: l.nota.valor, vencimento: l.nota.vencimento } };
    case 'boletos': return {
      v, k: 'boletos',
      boletos: l.boletos.map((b) => ({ ok: true, codigo_barras: b.codigo_barras, linha: b.linha, tipo: b.tipo, banco: b.banco, valor: b.valor, vencimento: b.vencimento })),
      beneficiario: parte(l.beneficiario), pagador: parte(l.pagador),
      ...(l.paginaDeCada ? { paginaDeCada: [...l.paginaDeCada] } : {}),
      ...(l.totalDePaginas ? { totalDePaginas: l.totalDePaginas } : {}),
    };
    case 'folha': return { v, k: 'folha' };
    case 'resumo': return { v, k: 'resumo' };
    /* FOLHA-VERA-PACOTE-01: o analítico da folha tem pessoa e salário e o banco não conhece o tipo: não se guarda (a caixa lê no navegador) */
    case 'analitica': return null;
    /* CONTAS-CONSUMO-01 / CAIXA-OCR-01 / CAIXA-FOLHA-VERA: a fatura (titular, endereço), a posição do banco (saldo) e a GFD (o PIX) o banco não
       conhece como tipo: não se guardam — a caixa lê no navegador, como o analítico */
    case 'fatura': return null;
    case 'posicao': return null;
    case 'gfd': return null;
    case 'nada': return { v, k: 'nada', frase: l.frase };
    case 'senha': return { v, k: 'senha' };
    case 'erro': return null;
  }
}
const parte = (p: ParteDoBoleto): ParteDoBoleto => ({ documento: p.documento, nome: p.nome, confira: p.confira });

/* ═══ do banco para a caixa (o jsonb vem de fora: confere cada campo, sem cast) ═══ */
type Obj = Record<string, unknown>;
const ehObj = (x: unknown): x is Obj => typeof x === 'object' && x !== null && !Array.isArray(x);
const txt = (x: unknown): string | null => (typeof x === 'string' ? x : null);
const num = (x: unknown): number | null => (typeof x === 'number' && Number.isFinite(x) ? x : null);
const data = (x: unknown): string | null => (typeof x === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(x) ? x : null);

function boletoDe(x: unknown): BoletoNormalizado | null {
  if (!ehObj(x)) return null;
  const cb = txt(x.codigo_barras); const linha = txt(x.linha);
  if (!cb || !/^\d{44}$/.test(cb) || !linha || !/^\d{47,48}$/.test(linha)) return null;
  const tipo = x.tipo === 'bancario' || x.tipo === 'arrecadacao' ? x.tipo : null;
  if (!tipo) return null;
  return { ok: true, codigo_barras: cb, linha, tipo, banco: txt(x.banco), valor: num(x.valor), vencimento: data(x.vencimento) };
}
function parteDe(x: unknown): ParteDoBoleto | null {
  if (!ehObj(x) || typeof x.confira !== 'boolean') return null;
  return { documento: txt(x.documento), nome: txt(x.nome), confira: x.confira };
}
const inteiros = (x: unknown): number[] | null =>
  Array.isArray(x) && x.every((n) => Number.isInteger(n) && n > 0) ? x.filter((n): n is number => typeof n === 'number') : null;

/**
 * O jsonb da linha → a leitura que a caixa usa, SÓ se for desta versão do leitor e de um tipo que se mostra sem o arquivo (nota, boletos,
 * nada, senha). Folha e resumo, versão velha, campo estranho → null: a caixa lê o arquivo, como sempre fez.
 */
export function daGravada(x: unknown): LeituraDaCaixa | null {
  if (!ehObj(x) || x.v !== LEITOR_VERSAO) return null;
  if (x.k === 'nota') {
    const n = x.nota;
    if (!ehObj(n)) return null;
    const chave = txt(n.chave); const numero = txt(n.numero);
    if (!chave || !/^\d{44}$/.test(chave) || !numero) return null;
    return { k: 'nota', nota: { chave, numero, emitente: txt(n.emitente), valor: num(n.valor), vencimento: data(n.vencimento) } };
  }
  if (x.k === 'boletos') {
    if (!Array.isArray(x.boletos) || !x.boletos.length) return null;
    const boletos = x.boletos.map(boletoDe);
    const beneficiario = parteDe(x.beneficiario); const pagador = parteDe(x.pagador);
    if (boletos.some((b) => !b) || !beneficiario || !pagador) return null;
    const paginaDeCada = x.paginaDeCada === undefined ? undefined : inteiros(x.paginaDeCada);
    const totalDePaginas = x.totalDePaginas === undefined ? undefined : num(x.totalDePaginas);
    if (paginaDeCada === null || totalDePaginas === null) return null;
    return {
      k: 'boletos', boletos: boletos.filter((b): b is BoletoNormalizado => !!b), beneficiario, pagador,
      ...(paginaDeCada ? { paginaDeCada } : {}), ...(totalDePaginas ? { totalDePaginas } : {}),
    };
  }
  if (x.k === 'nada') { const frase = txt(x.frase); return frase ? { k: 'nada', frase } : null; }
  if (x.k === 'senha') return { k: 'senha', errada: false };
  return null;
}
