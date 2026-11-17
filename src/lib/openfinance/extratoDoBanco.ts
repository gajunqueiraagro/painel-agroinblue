/**
 * OPENFINANCE-P3b — as regras da TELA do extrato pelo Open Finance (desenho aprovado 16/11). Puras; a rede é a `openfinance-extrato`.
 *  · a resposta da borda → a MESMA fonte da prévia do OFX (`fonteDoOpenFinance`, com o corte): daí a dedupe e a gravação de sempre;
 *  · a CONFERÊNCIA (só leitura): o que o banco diz × o que já está no extrato do sistema, no mesmo período, por dia + valor;
 *  · o SALDO DO BANCO × o extrato do sistema na mesma data (só aviso: nada se ajusta);
 *  · a SUGESTÃO da conta do sistema pelo final de 4 dígitos (nº + dígito).
 */
import { fonteDoOpenFinance, type ResultadoOpenFinance, type TransacaoOpenFinance } from '@/lib/financeiro/parser/openFinance';
import type { MovimentoBruto } from '@/lib/financeiro/parser/parseOFX';
import { round2 } from '@/lib/calculos/numeroBR';

const ehObjeto = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const textoOuNulo = (v: unknown): string | null => (typeof v === 'string' && v ? v : null);
const numeroOuNulo = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);
const DIA = /^\d{4}-\d{2}-\d{2}$/;

export interface BuscaDoBanco {
  acao: 'buscar' | 'conferir';
  de: string; ate: string; hoje: string;
  corte: string | null; ultimoDia: string | null;
  conta: { id: string; type: string; subtype: string | null; balance: number | null; currencyCode: string | null; saldoEm: string | null };
  transacoes: TransacaoOpenFinance[];
  saldoGravado: boolean | null;
}

/** O corpo da `openfinance-extrato` → a busca tipada; qualquer campo fora do contrato = nulo (a tela diz que falhou). */
export function lerBuscaDoBanco(corpo: Record<string, unknown>): BuscaDoBanco | null {
  const acao = corpo.acao === 'buscar' || corpo.acao === 'conferir' ? corpo.acao : null;
  const de = textoOuNulo(corpo.de); const ate = textoOuNulo(corpo.ate); const hoje = textoOuNulo(corpo.hoje);
  const c = ehObjeto(corpo.conta) ? corpo.conta : null;
  if (!acao || !de || !ate || !hoje || !DIA.test(de) || !DIA.test(ate) || !DIA.test(hoje) || !c || !textoOuNulo(c.id) || !textoOuNulo(c.type)) return null;
  if (!Array.isArray(corpo.transacoes)) return null;
  const transacoes: TransacaoOpenFinance[] = corpo.transacoes.flatMap((t): TransacaoOpenFinance[] => {
    if (!ehObjeto(t)) return [];
    const id = textoOuNulo(t.id); const date = textoOuNulo(t.date); const amount = numeroOuNulo(t.amount);
    if (!id || !date || amount === null) return [];
    return [{
      id, date, amount, accountId: textoOuNulo(t.accountId), description: textoOuNulo(t.description), status: textoOuNulo(t.status),
      type: textoOuNulo(t.type), providerId: textoOuNulo(t.providerId), currencyCode: textoOuNulo(t.currencyCode),
    }];
  });
  const corte = textoOuNulo(corpo.corte); const ultimoDia = textoOuNulo(corpo.ultimoDia);
  return {
    acao, de, ate, hoje,
    corte: corte && DIA.test(corte) ? corte : null,
    ultimoDia: ultimoDia && DIA.test(ultimoDia) ? ultimoDia : null,
    conta: {
      id: String(c.id), type: String(c.type), subtype: textoOuNulo(c.subtype), balance: numeroOuNulo(c.balance),
      currencyCode: textoOuNulo(c.currencyCode), saldoEm: textoOuNulo(c.saldoEm),
    },
    transacoes,
    saldoGravado: typeof corpo.saldoGravado === 'boolean' ? corpo.saldoGravado : null,
  };
}

/** A busca → a fonte da prévia. 'buscar' aplica o CORTE; 'conferir' lê o período inteiro pedido (não grava). */
export function fonteDaBusca(b: BuscaDoBanco): ResultadoOpenFinance {
  return fonteDoOpenFinance(
    { id: b.conta.id, type: b.conta.type, subtype: b.conta.subtype, balance: b.conta.balance, currencyCode: b.conta.currencyCode },
    b.transacoes,
    { de: b.de, ate: b.ate, buscadoEm: b.hoje, desde: b.acao === 'buscar' ? b.corte : null },
  );
}

export const ddmmaaaa = (dia: string): string => `${dia.slice(8, 10)}/${dia.slice(5, 7)}/${dia.slice(0, 4)}`;

/** A frase do corte, na prévia: de onde a busca começou e por quê. */
export function fraseDoCorte(b: Pick<BuscaDoBanco, 'corte' | 'ultimoDia' | 'de'>): string {
  if (b.corte && b.ultimoDia) return `Corte: ${ddmmaaaa(b.corte)} (o extrato no sistema vai até ${ddmmaaaa(b.ultimoDia)}; o antes não entra).`;
  return `Conta sem extrato no sistema: busquei desde ${ddmmaaaa(b.de)}.`;
}

/** O nome do lote em "Ver importações" (vai a `nome_arquivo`). */
export const nomeDaBusca = (hoje: string): string => `Open Finance · ${ddmmaaaa(hoje)}`;

/** O "Buscar do banco" com 0 movimento novo: a frase, sem prévia vazia. */
export function fraseSemMovimento(b: Pick<BuscaDoBanco, 'corte' | 'ultimoDia' | 'de' | 'hoje'>): string {
  return `O banco não tem movimento lançado de ${ddmmaaaa(b.corte ?? b.de)} até ${ddmmaaaa(b.hoje)}. Nada a importar.`;
}

export const FRASE_BUSCA_FALHOU = 'Não consegui buscar o extrato no banco agora. Nada foi lido; tente de novo.';
export const FRASE_LIGAR_FALHOU = 'Não consegui gravar a ligação agora. Nada foi gravado; tente de novo.';

// ── A conferência (só leitura) ─────────────────────────────────────────────────────────────────────────────────────

export interface LinhaDoSistema { data: string; valor: number; descricao: string | null }
export interface ResultadoConferencia {
  casam: number;
  soNoBanco: MovimentoBruto[];
  soNoSistema: LinhaDoSistema[];
}
const chaveDiaValor = (data: string, valor: number) => `${data.slice(0, 10)}|${Math.round(round2(valor) * 100)}`;

/**
 * Banco × sistema no MESMO período, por DIA + VALOR (com sinal), um a um: dois movimentos iguais no mesmo dia casam com duas linhas
 * iguais. O documento NÃO entra (o do OFX do Itaú é sequencial do dia; o da Pluggy é o providerId — FASE 0). Não grava nada.
 */
export function conferirComSistema(banco: readonly MovimentoBruto[], sistema: readonly LinhaDoSistema[]): ResultadoConferencia {
  const sobra = new Map<string, LinhaDoSistema[]>();
  for (const l of sistema) {
    const k = chaveDiaValor(l.data, l.valor);
    const fila = sobra.get(k) ?? [];
    fila.push(l);
    sobra.set(k, fila);
  }
  let casam = 0;
  const soNoBanco: MovimentoBruto[] = [];
  for (const m of banco) {
    const fila = sobra.get(chaveDiaValor(m.data, m.valor));
    if (fila && fila.length > 0) { fila.shift(); casam += 1; } else soNoBanco.push(m);
  }
  const soNoSistema = [...sobra.values()].flat().sort((a, b) => (a.data < b.data ? -1 : a.data > b.data ? 1 : 0));
  return { casam, soNoBanco, soNoSistema };
}

export function fraseDaConferencia(r: ResultadoConferencia, de: string, ate: string): string {
  const periodo = `${ddmmaaaa(de)} a ${ddmmaaaa(ate)}`;
  if (r.soNoBanco.length === 0 && r.soNoSistema.length === 0) {
    return r.casam === 0 ? `Nenhum movimento de ${periodo}, nem no banco nem no sistema.`
      : `${periodo}: os ${r.casam} movimentos do banco casam com o extrato do sistema. Nada a mais, nada a menos.`;
  }
  return `${periodo}: ${r.casam} casam · ${r.soNoBanco.length} só no banco · ${r.soNoSistema.length} só no sistema. Nada foi gravado.`;
}

// ── Saldo do banco × sistema (só aviso) ────────────────────────────────────────────────────────────────────────────

/** O dia em Brasília e a hora (hh:mm) de um ISO; ilegível = nulo. */
export function diaEHoraEmBrasilia(iso: string | null): { dia: string; hora: string } | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  const partes = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(d);
  const p = (t: string) => partes.find((x) => x.type === t)?.value ?? '';
  return { dia: `${p('year')}-${p('month')}-${p('day')}`, hora: `${p('hour')}:${p('minute')}` };
}

/**
 * O extrato do sistema no fim do DIA do banco: o saldo de abertura do mês + as linhas vivas do mês até esse dia. Fora do mês, sem
 * abertura ou sem dia = nulo (a tela mostra "—", nunca zero).
 */
export function extratoDoSistemaNoDia(abertura: number | null, mes: string, linhas: readonly { data: string; valor: number }[], dia: string | null): number | null {
  if (abertura === null || !dia || dia.slice(0, 7) !== mes) return null;
  return round2(linhas.reduce((s, l) => (l.data.slice(0, 7) === mes && l.data.slice(0, 10) <= dia ? s + l.valor : s), abertura));
}

export interface SaldoBancoXSistema { banco: number; sistema: number | null; diferenca: number | null; diverge: boolean }
/** Diferença = banco − sistema; diverge a partir de R$ 0,01 (meio centavo é a régua da casa). */
export function saldoBancoXSistema(banco: number, sistema: number | null): SaldoBancoXSistema {
  if (sistema === null) return { banco, sistema, diferenca: null, diverge: false };
  const diferenca = round2(banco - sistema) + 0; // + 0: o −0 do arredondamento vira 0
  return { banco, sistema, diferenca, diverge: Math.abs(diferenca) >= 0.005 };
}

// ── A sugestão da conta do sistema ────────────────────────────────────────────────────────────────────────────────

export interface ContaDoSistema { id: string; numero_conta: string | null; conta_digito: string | null; tipo_conta: string | null; ativa: boolean | null }
/** A conta corrente ativa cujo nº+dígito termina no final da Pluggy; só UMA (zero ou empate = sem sugestão). */
export function contaSugerida(final4: string | null, contas: readonly ContaDoSistema[]): string | null {
  if (!final4 || !/^\d{4}$/.test(final4)) return null;
  const achadas = contas.filter((c) => c.ativa !== false && c.tipo_conta === 'cc'
    && `${c.numero_conta ?? ''}${c.conta_digito ?? ''}`.replace(/\D/g, '').endsWith(final4));
  return achadas.length === 1 ? achadas[0].id : null;
}
