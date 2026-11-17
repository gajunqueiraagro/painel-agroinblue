/**
 * OPENFINANCE-PILOTO-01 — a resposta do Open Finance (Pluggy: `GET /accounts` + `GET /transactions`) → a FONTE da prévia.
 *
 * Não chama ninguém: recebe o que a borda já leu e devolve o mesmo `FonteDoExtrato` do OFX/CSV. Daqui em diante a prévia,
 * a dedupe e a gravação são as de sempre (`useImportacaoExtrato.gerarPreviewDaFonte` → `fn_extrato_importar_arquivo`).
 *
 * As regras (FASE 0, OK do Chat 13/11):
 * - SÓ O LANÇADO (`status = POSTED`). O PENDENTE ainda não é extrato: muda de valor/data e some; conta-se, não entra.
 * - O SINAL vem do `type` (CREDIT entra, DEBIT sai), com o valor em módulo: a Pluggy só documenta o sinal do cartão.
 *   Sem `type`, o sinal do próprio valor.
 * - A DATA é a do dia em Brasília: a Pluggy manda ISO em UTC, e "2026-11-05T01:30Z" é o dia 04 aqui.
 * - O DOCUMENTO é o `providerId` (o id do banco no Open Finance, estável). O `id` da Pluggy NÃO serve: muda quando a
 *   transação é refeita e quando a conta é reconectada.
 * - A mesma transação (`id`) repetida na resposta (sobreposição de página) entra uma vez.
 * - Valor zero não é movimento: conta como informativa.
 * - O CORTE (`desde`): a 1ª busca de cada conta começa no dia seguinte ao último extrato já importado; o antes conta, não entra.
 * - CARTÃO DE CRÉDITO NÃO ENTRA AQUI: o sistema não importa fatura (passo futuro, ligado ao CARTAO-FATURA-IMPORT-01).
 * - O SALDO DECLARADO é o da conta na hora da busca, com a data da busca. Ausente = `null`, nunca zero.
 */
import type { MovimentoBruto } from './parseOFX';
import type { FonteDoExtrato } from './fonteDoExtrato';
import { round2 } from '@/lib/calculos/numeroBR';

/** Só os campos que usamos de `GET /accounts` (Pluggy). */
export interface ContaOpenFinance {
  id: string;
  type: string;
  subtype?: string | null;
  name?: string | null;
  number?: string | null;
  balance?: number | null;
  currencyCode?: string | null;
}

/** Só os campos que usamos de `GET /transactions` (Pluggy). */
export interface TransacaoOpenFinance {
  id: string;
  accountId?: string | null;
  description?: string | null;
  descriptionRaw?: string | null;
  amount: number;
  date: string;
  status?: string | null;
  type?: string | null;
  providerId?: string | null;
  currencyCode?: string | null;
}

export interface OpcoesOpenFinance {
  /** A janela pedida ao banco (ISO 'AAAA-MM-DD'). */
  de: string;
  ate: string;
  /** O dia da busca: a data do saldo declarado. */
  buscadoEm: string;
  /** O dia seguinte ao último extrato já importado desta conta; antes dele não entra. */
  desde?: string | null;
}

/** O que ficou de fora e por quê — a prévia mostra; nada some calado. */
export interface RelatorioOpenFinance {
  recebidas: number;
  entram: number;
  pendentes: number;
  zeradas: number;
  antesDoCorte: number;
  repetidasNaResposta: number;
  semData: number;
  semDocumento: number;
  /** OF-CONFERIR-CASAMENTO-01: a borda pede 1 dia a mais de cada lado (o filtro da Pluggy não é pelo dia de Brasília); o que cai fora
   *  do período pedido, no dia de Brasília, não entra */
  foraDoPeriodo: number;
}

export type ResultadoOpenFinance =
  | { ok: true; fonte: FonteDoExtrato; relatorio: RelatorioOpenFinance }
  | { ok: false; motivo: 'cartao' | 'moeda' | 'outra_conta'; frase: string };

const FRASE_CARTAO = 'Esta conta do Open Finance é um cartão de crédito. A fatura ainda não se importa por aqui: '
  + 'escolha a conta corrente ou a poupança. Nada foi lido.';
const FRASE_MOEDA = 'Esta conta do Open Finance não é em reais. Nada foi lido.';
const FRASE_OUTRA_CONTA = 'A resposta do banco trouxe movimento de outra conta junto. Nada foi lido: busque de novo.';

const DIA_EM_BRASILIA = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit',
});

/** ISO da Pluggy (UTC) → o dia em Brasília 'AAAA-MM-DD'. Data pura passa como está. Ilegível → null. */
export function diaEmBrasilia(iso: string | null | undefined): string | null {
  if (!iso) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(iso)) return iso;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return DIA_EM_BRASILIA.format(d);
}

/** O módulo ao centavo pela régua da casa (`round2`). A Pluggy manda 2 casas; o arredondar é defesa. */
function emReais(v: number): number {
  return round2(Math.abs(v));
}

export function fonteDoOpenFinance(
  conta: ContaOpenFinance,
  transacoes: TransacaoOpenFinance[],
  opcoes: OpcoesOpenFinance,
): ResultadoOpenFinance {
  if (conta.type === 'CREDIT' || conta.subtype === 'CREDIT_CARD') return { ok: false, motivo: 'cartao', frase: FRASE_CARTAO };
  if (conta.currencyCode && conta.currencyCode !== 'BRL') return { ok: false, motivo: 'moeda', frase: FRASE_MOEDA };
  if (transacoes.some((t) => t.accountId && t.accountId !== conta.id)) {
    return { ok: false, motivo: 'outra_conta', frase: FRASE_OUTRA_CONTA };
  }

  const rel: RelatorioOpenFinance = {
    recebidas: transacoes.length, entram: 0, pendentes: 0, zeradas: 0, antesDoCorte: 0, repetidasNaResposta: 0, semData: 0, semDocumento: 0,
    foraDoPeriodo: 0,
  };
  const vistos = new Set<string>();
  const movimentos: MovimentoBruto[] = [];
  const corte = opcoes.desde ?? null;

  for (const t of transacoes) {
    if (vistos.has(t.id)) { rel.repetidasNaResposta += 1; continue; }
    vistos.add(t.id);
    if (t.status !== 'POSTED') { rel.pendentes += 1; continue; }
    const data = diaEmBrasilia(t.date);
    if (!data) { rel.semData += 1; continue; }
    if (!Number.isFinite(t.amount) || emReais(t.amount) === 0) { rel.zeradas += 1; continue; }
    if (corte && data < corte) { rel.antesDoCorte += 1; continue; }
    if (data < opcoes.de || data > opcoes.ate) { rel.foraDoPeriodo += 1; continue; }
    const entra = t.type === 'CREDIT' || (t.type !== 'DEBIT' && t.amount > 0);
    const documento = (t.providerId ?? '').trim() || null;
    if (!documento) rel.semDocumento += 1;
    movimentos.push({
      data,
      valor: entra ? emReais(t.amount) : -emReais(t.amount),
      tipo: entra ? 'credito' : 'debito',
      descricao: ((t.description ?? '').trim() || (t.descriptionRaw ?? '').trim()),
      documento,
    });
  }
  /* A ordem do dia: a da resposta (a ocorrência de dois movimentos iguais no mesmo dia depende dela). `sort` é estável. */
  movimentos.sort((a, b) => (a.data < b.data ? -1 : a.data > b.data ? 1 : 0));
  rel.entram = movimentos.length;

  const saldo = typeof conta.balance === 'number' && Number.isFinite(conta.balance) ? conta.balance : null;
  return {
    ok: true,
    relatorio: rel,
    fonte: {
      formato: 'OPEN_FINANCE',
      movimentos,
      linhasInformativas: rel.zeradas,
      saldoDeclarado: saldo,
      saldoDeclaradoData: saldo === null ? null : opcoes.buscadoEm,
      periodoDeclaradoInicio: corte && corte > opcoes.de ? corte : opcoes.de,
      periodoDeclaradoFim: opcoes.ate,
    },
  };
}
