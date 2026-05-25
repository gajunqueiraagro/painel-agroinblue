/**
 * Identidade soberana e determinística da linha bancária Excel.
 *
 * REGRA: a MESMA linha bancária gera a MESMA chave SEMPRE —
 * em re-upload, nova sessão, reabertura, F5, staging.
 *
 * NÃO depende de:
 *   - hash de bytes do arquivo
 *   - loteId aleatório
 *   - índice da linha na planilha
 *   - timestamp
 *   - ordem do parser
 *
 * Depende APENAS dos 5 dados canônicos da linha:
 *   data_competencia | valor_signed | conta | documento | descricao
 *
 * Hash: cyrb53 (sync, sem deps, 53-bit). Colisão em 10k linhas ~ 0.00001%.
 */

import type { ExcelLinhaNormalizada } from '@/v2/lib/excelPreview/types';

function normalizarTexto(s: string | null | undefined): string {
  if (s == null) return '';
  return String(s)
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')   // remove acentos
    .toUpperCase()
    .replace(/[^A-Z0-9 ]/g, ' ')        // só alfanum + espaço
    .replace(/\s+/g, ' ')               // colapsa espaços
    .trim();
}

function normalizarData(s: string | null | undefined): string {
  if (!s) return '';
  return String(s).slice(0, 10);        // 'YYYY-MM-DD'
}

function normalizarValor(centavos: number, sinal: string): string {
  const n = Math.round(Math.abs(Number(centavos) || 0));
  const s = sinal === 'entrada' ? '+' : sinal === 'saida' ? '-' : '?';
  return `${s}${n}`;
}

function normalizarDoc(s: string | null | undefined): string {
  if (s == null) return '';
  return String(s).toUpperCase().replace(/[^A-Z0-9]/g, '');
}

/**
 * cyrb53 — variante canônica do bryc (sem seed externo).
 * Retorna hash 53-bit como hex de 14 chars com padStart.
 */
function cyrb53(str: string): string {
  let h1 = 0xdeadbeef, h2 = 0x41c6ce57;
  for (let i = 0; i < str.length; i++) {
    const ch = str.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  const hashed = 4294967296 * (2097151 & h2) + (h1 >>> 0);
  return hashed.toString(16).padStart(14, '0');
}

/**
 * Constrói chave canônica e determinística da linha Excel.
 * Retorna hash hex de 14 chars (53 bits).
 *
 * descricao = observacao (Obs do Excel) se truthy após trim,
 * senão cai em fornecedor (sempre presente na prática).
 * conta = contaTexto (já trimmed pelo parser).
 */
export function buildLinhaKeyDeterministica(linha: ExcelLinhaNormalizada): string {
  const obs = (linha.observacao ?? '').trim();
  const descricao = obs.length > 0 ? linha.observacao : linha.fornecedor;

  const partes = [
    normalizarData(linha.dataCompetencia),
    normalizarValor(linha.valorCentavos, linha.sinal),
    normalizarTexto(linha.contaTexto),
    normalizarDoc(linha.documento),
    normalizarTexto(descricao),
  ];

  return cyrb53(partes.join('|'));
}
