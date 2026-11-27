/**
 * CAIXA-OCR-01 O4 (Gabriel 27/11, mock aprovado) — a "Posição de operações financeiras para simples conferência" que o banco manda (o saldo das
 * operações de crédito numa data base). PURO: recebe as linhas de cada página (as do `montarLinhas`, células por " | ") e devolve a
 * `PosicaoLida`: data base, emissão e, por operação, produto, número do contrato, taxa, início, vencimento, principal, juros, atraso e saldo.
 * Na Caixa ela vira "posição do banco": o contrato se acha pelo NÚMERO (nunca pelo nome do produto) e a tela mostra o saldo do banco × o do
 * sistema; nada grava sozinho.
 *
 * Layout (a forma; ⚠ documento real NUNCA no repo, teste ou log — os testes usam dados inventados):
 *   "Posição de operações financeiras para simples conferência" · "Nome: … | Data base: | Data de emissão:" e, abaixo, "… | <base> | <emissão>";
 *   por operação "<produto> | <contrato> | <indexador> | <moeda> | <taxa> | <atraso dias> | <início> | <vencimento> | R$ <principal> |
 *   R$ <juros> | R$ <atraso> | R$ <saldo>"; "Total | R$ … | R$ … | R$ … | R$ <saldo total>".
 * CONFERE = a soma dos saldos das operações é o total (ao centavo). O que não for reconhecido devolve "não sei".
 */
import { valorDoRecibo } from '@/lib/folha/lerFolha';

export interface OperacaoDaPosicao {
  produto: string;
  contrato: string;
  taxa: number | null;
  inicio: string | null;
  vencimento: string | null;
  principal: number;
  juros: number;
  atraso: number;
  saldo: number;
}
export interface PosicaoLida {
  /** 'AAAA-MM-DD' */
  dataBase: string;
  emissao: string | null;
  operacoes: OperacaoDaPosicao[];
  total: number | null;
  confere: boolean;
}
export type LeituraDaPosicao = { ok: true; posicao: PosicaoLida } | { ok: false; frase: string };
export const FRASE_NAO_E_POSICAO = 'Não é uma posição de operações do banco que eu conheça.';

const semAcento = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const celulas = (linha: string) => linha.split('|').map((c) => c.trim()).filter((c) => c !== '');
const iso = (s: string): string | null => {
  const m = s.trim().match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (!m) return null;
  const d = new Date(Date.UTC(Number(m[3]), Number(m[2]) - 1, Number(m[1])));
  return d.getUTCDate() === Number(m[1]) && d.getUTCMonth() === Number(m[2]) - 1 ? `${m[3]}-${m[2]}-${m[1]}` : null;
};
const reais = (s: string) => (/^R\$/.test(s.trim()) ? valorDoRecibo(s.trim().replace(/^R\$\s*/, '')) : null);
const centavos = (v: number) => Math.round(v * 100);

export function lerPosicaoOperacoes(paginas: string[][]): LeituraDaPosicao {
  const linhas = paginas.flat();
  if (!linhas.some((l) => /^posicao de operacoes financeiras para simples conferencia$/.test(semAcento(l).trim()))) {
    return { ok: false, frase: FRASE_NAO_E_POSICAO };
  }
  /* as datas: a linha abaixo do "Data base: | Data de emissão:" termina com "<base> | <emissão>" */
  const iCab = linhas.findIndex((l) => /data base:/.test(semAcento(l)) && /data de emissao:/.test(semAcento(l)));
  const abaixo = iCab >= 0 ? celulas(linhas[iCab + 1] ?? '') : [];
  /* a linha das datas não tem valor em R$ (senão é uma operação: a data base não veio) */
  const datas = abaixo.some((x) => /^R\$/.test(x)) ? [] : abaixo.map(iso).filter((d): d is string => d !== null);
  if (datas.length < 1) return { ok: false, frase: FRASE_NAO_E_POSICAO };
  const operacoes: OperacaoDaPosicao[] = [];
  let total: number | null = null;
  for (const l of linhas) {
    const c = celulas(l);
    const valores = c.map(reais);
    if (semAcento(c[0] ?? '') === 'total' && valores.filter((v) => v !== null).length >= 1) {
      total = [...valores].reverse().find((v) => v !== null) ?? null;
      continue;
    }
    /* a operação: o contrato é a 1ª célula só de dígitos (6+); os 4 últimos valores em R$ são principal, juros, atraso e saldo */
    const iContrato = c.findIndex((x, i) => i > 0 && /^\d{6,}$/.test(x));
    const rs = valores.filter((v): v is number => v !== null);
    if (iContrato < 1 || rs.length < 4) continue;
    const resto = c.slice(iContrato + 1);
    const datasOp = resto.map(iso).filter((d): d is string => d !== null);
    const taxa = resto.map((x) => valorDoRecibo(x)).find((v) => v !== null) ?? null;
    const [principal, juros, atraso, saldo] = rs.slice(-4);
    operacoes.push({ produto: c.slice(0, iContrato).join(' '), contrato: c[iContrato], taxa, inicio: datasOp[0] ?? null, vencimento: datasOp[1] ?? null,
      principal, juros, atraso, saldo });
  }
  if (!operacoes.length) return { ok: false, frase: FRASE_NAO_E_POSICAO };
  const soma = operacoes.reduce((s, o) => s + centavos(o.saldo), 0);
  return { ok: true, posicao: { dataBase: datas[0], emissao: datas[1] ?? null, operacoes, total, confere: total !== null && soma === centavos(total) } };
}
