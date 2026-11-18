/**
 * BPO-APROVACAO-01 — as regras da tela do APROVADOR (pura; o banco decide quem pode e grava — 118160): ler as linhas da
 * `fn_aprovacao_lista` sem confiar no formato, agrupar por dia de vencimento, o saldo de cada conta DEPOIS dos pagamentos da fila
 * (a leitura do banco pelo Open Finance; sem ela, "—") e as frases. Rótulos genéricos (produto multi-cliente).
 */
import { round2 } from '@/lib/calculos/numeroBR';

export type SituacaoDaAprovacao = 'aguardando' | 'aprovado' | 'recusado';
export interface LinhaDaAprovacao {
  lancamentoId: string; rodada: number; situacao: SituacaoDaAprovacao; motivo: string | null; observacao: string | null;
  pedidoEm: string | null; decididoEm: string | null; vencimento: string | null; valor: number; descricao: string | null;
  fornecedor: string | null; fazenda: string | null; conta: string | null; contaId: string | null; status: string | null;
  temNota: boolean; temBoleto: boolean;
}

const ehRegistro = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const texto = (v: unknown): string | null => (typeof v === 'string' && v.trim() !== '' ? v : null);
const ehSituacao = (v: unknown): v is SituacaoDaAprovacao => v === 'aguardando' || v === 'aprovado' || v === 'recusado';

/** as linhas da `fn_aprovacao_lista` → tipadas; linha fora do contrato sai sozinha */
export function lerLinhasDaAprovacao(rows: unknown): LinhaDaAprovacao[] {
  if (!Array.isArray(rows)) return [];
  return rows.flatMap((r): LinhaDaAprovacao[] => {
    if (!ehRegistro(r)) return [];
    const id = texto(r.lancamento_id); const valor = Number(r.valor);
    if (!id || !ehSituacao(r.situacao) || !Number.isFinite(valor)) return [];
    return [{
      lancamentoId: id, rodada: Number(r.rodada) || 1, situacao: r.situacao, motivo: texto(r.motivo), observacao: texto(r.observacao),
      pedidoEm: texto(r.pedido_em), decididoEm: texto(r.decidido_em), vencimento: texto(r.vencimento)?.slice(0, 10) ?? null, valor: round2(valor),
      descricao: texto(r.descricao), fornecedor: texto(r.fornecedor), fazenda: texto(r.fazenda), conta: texto(r.conta), contaId: texto(r.conta_bancaria_id),
      status: texto(r.status_transacao), temNota: r.tem_nota === true, temBoleto: r.tem_boleto === true,
    }];
  });
}

export interface DiaDaFila { dia: string | null; total: number; linhas: LinhaDaAprovacao[] }
/** por dia de vencimento (sem vencimento por último), o total do dia; dentro do dia, a maior saída primeiro */
export function porDiaDeVencimento(linhas: readonly LinhaDaAprovacao[]): DiaDaFila[] {
  const m = new Map<string, LinhaDaAprovacao[]>();
  for (const l of linhas) { const k = l.vencimento ?? '9999-99-99'; m.set(k, [...(m.get(k) ?? []), l]); }
  return [...m.entries()].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)).map(([k, ls]) => ({
    dia: k === '9999-99-99' ? null : k,
    total: round2(ls.reduce((s, l) => s + Math.abs(l.valor), 0)),
    linhas: [...ls].sort((a, b) => Math.abs(b.valor) - Math.abs(a.valor)),
  }));
}

export interface SaldoDaConta { contaId: string; conta: string; banco: number | null; bancoEm: string | null; pagamentos: number; depois: number | null; negativo: boolean }
/**
 * O saldo de cada conta DEPOIS dos pagamentos que estão na fila (aguardando + aprovados ainda não pagos): o saldo que o BANCO informou
 * (Open Finance, a última leitura) menos a soma deles. Sem leitura do banco = "—" (nunca zero). Só aviso: nada se grava.
 */
export function saldosDepoisDosPagamentos(
  linhas: readonly LinhaDaAprovacao[], doBanco: ReadonlyMap<string, { saldo: number; em: string | null }>,
): SaldoDaConta[] {
  const por = new Map<string, { conta: string; soma: number }>();
  for (const l of linhas) {
    if (!l.contaId || l.status === 'realizado' || l.situacao === 'recusado') continue;
    const x = por.get(l.contaId) ?? { conta: l.conta ?? 'Conta', soma: 0 };
    x.soma += Math.abs(l.valor);
    por.set(l.contaId, x);
  }
  return [...por.entries()].map(([contaId, x]) => {
    const b = doBanco.get(contaId) ?? null;
    const depois = b ? round2(b.saldo - x.soma) : null;
    return { contaId, conta: x.conta, banco: b ? b.saldo : null, bancoEm: b?.em ?? null, pagamentos: round2(x.soma), depois, negativo: depois !== null && depois < 0 };
  }).sort((a, b) => (a.conta < b.conta ? -1 : 1));
}

export const somaDe = (linhas: readonly LinhaDaAprovacao[]): number => round2(linhas.reduce((s, l) => s + Math.abs(l.valor), 0));
export const FRASE_BPO_DESLIGADO = 'A aprovação de pagamentos não está ligada neste cliente.';
export const FRASE_SO_APROVADOR = 'Só quem aprova os pagamentos deste cliente decide. Aqui você acompanha a fila.';
export const FRASE_DECIDIR_FALHOU = 'Não consegui gravar a decisão agora. Nada foi gravado; tente de novo.';
export const FRASE_LER_FALHOU = 'Não consegui ler a fila de aprovação agora. Tente de novo.';
export const fraseDaRecusaSemMotivo = 'Escreva por que não aprovar (o motivo volta para quem lançou).';
