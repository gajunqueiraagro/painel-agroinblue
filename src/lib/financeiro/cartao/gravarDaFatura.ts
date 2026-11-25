/**
 * CARTAO-FATURA-GRAVAR (lote 118540 no ar; decisões do Gabriel 24/11 09:27 "tudo como recomendado") — a REGRA PURA do "Gravar N prontas":
 * dos grupos da prévia e do que o operador completou na tabela ao pedido da `fn_fatura_cartao_gravar`, e da resposta do banco às frases
 * por linha. Nada grava aqui.
 *  · D1: a linha a LANÇAR precisa de conta do plano E fazenda — a sugestão do histórico traz as duas; a que falta se escolhe na tabela.
 *  · D2: vão só as PRONTAS; a incompleta fica para depois (relida a fatura, ela volta como está).
 *  · D3/D4: mover = o lançamento de outra conta vem para este cartão (com o valor da fatura, se diferir); ajustar = o valor da fatura
 *    manda (só no próprio cartão). Diferença só de vencimento ou de k/N no mesmo cartão e mesmo valor = nada a gravar: "resolver no Editar".
 *  · D6: o pagamento fica fora (transferência).
 *  · O banco confere tudo de novo (realizado, casado, mês fechado, "mudou desde a leitura" pelo `lido_em` = o `updated_at` lido) e
 *    recusa POR LINHA, com frase; a tela só mostra.
 */
import type { LinhaDaFatura, FaturaLida } from './lerFaturaOurocard';
import type { GruposDaFatura, LinhaDoGrupo } from './gruposDaFatura';

export interface Escolha { planoContaId: string | null; fazendaId: string | null }

export interface ItemLancar {
  ordem: number; gesto: 'lancar'; data_compra: string; descricao: string; valor: number; tipo: 'saida' | 'entrada';
  plano_conta_id: string; fazenda_id: string;
}
export interface ItemMudar { ordem: number; gesto: 'mover' | 'ajustar'; lancamento_id: string; lido_em: string; valor?: number }
export type ItemDoGravar = ItemLancar | ItemMudar;

/** o que a linha é no "Gravar": vai (pronta), falta algo (incompleta), nada a gravar, ou resolver no Editar */
export type EstadoDaLinha =
  | { k: 'pronta'; item: ItemDoGravar }
  | { k: 'falta'; falta: 'conta' | 'fazenda' | 'conta e fazenda' }
  | { k: 'nada' }
  | { k: 'editar'; frase: string };

export const FRASE_SO_VENCIMENTO = 'diferença só de vencimento ou de k/N: resolver no Editar';
export const FRASE_SEM_LEITURA = 'sem a hora da leitura do lançamento: leia a fatura de novo';

const reais = (cent: number) => Math.abs(cent) / 100;

/** a escolha da linha: o que o operador escolheu na tabela; sem isso, a sugestão (conta e fazenda do histórico). A conta que FORÇA a
 *  fazenda (a administrativa → a fazenda Administrativo, a regra do `FazendaSelect`) manda sobre as duas. */
export function escolhaDaLinha(x: LinhaDoGrupo, escolhas: ReadonlyMap<number, Escolha>, fazendaDaConta?: (planoContaId: string) => string | null): Escolha {
  const e = escolhas.get(x.linha.ordem);
  const planoContaId = e?.planoContaId ?? x.sugestao?.planoContaId ?? null;
  const forcada = planoContaId && fazendaDaConta ? fazendaDaConta(planoContaId) : null;
  return { planoContaId, fazendaId: forcada ?? e?.fazendaId ?? x.sugestao?.fazendaId ?? null };
}

/** a descrição que vai ao lançamento: a da fatura; a parcela de coluna própria (Sicredi) entra como "k/N" no fim (a parcela solta, P104) */
export function descricaoDoLancamento(l: LinhaDaFatura): string {
  const d = l.descricao.replace(/\s+/g, ' ').trim();
  if (!l.parcela) return d;
  const ja = new RegExp(`\\b0?${l.parcela.k}/0?${l.parcela.n}\\b`).test(d);
  return ja ? d : `${d} ${l.parcela.k}/${l.parcela.n}`;
}

export function estadoDaLinha(x: LinhaDoGrupo, escolha: Escolha, contaDaFatura: string): EstadoDaLinha {
  const l = x.linha;
  if (x.gesto === 'nada' || x.gesto === 'transferencia') return { k: 'nada' };
  if (x.gesto === 'lancar') {
    const semConta = !escolha.planoContaId; const semFazenda = !escolha.fazendaId;
    if (semConta || semFazenda) return { k: 'falta', falta: semConta && semFazenda ? 'conta e fazenda' : semConta ? 'conta' : 'fazenda' };
    return { k: 'pronta', item: { ordem: l.ordem, gesto: 'lancar', data_compra: l.dataCompra, descricao: descricaoDoLancamento(l),
      valor: reais(l.valorCent), tipo: l.valorCent < 0 ? 'entrada' : 'saida', plano_conta_id: escolha.planoContaId ?? '', fazenda_id: escolha.fazendaId ?? '' } };
  }
  const e = x.existente;
  if (!e) return { k: 'nada' };
  if (!e.atualizadoEm) return { k: 'editar', frase: FRASE_SEM_LEITURA };
  const valorDifere = e.valorCent !== Math.abs(l.valorCent);
  const valor = valorDifere ? { valor: reais(l.valorCent) } : {};
  /* em outra conta = mover (o banco recusa "ajustar" fora do cartão); com o valor da fatura se diferir (D4) */
  if (e.contaId !== contaDaFatura) return { k: 'pronta', item: { ordem: l.ordem, gesto: 'mover', lancamento_id: e.id, lido_em: e.atualizadoEm, ...valor } };
  if (!valorDifere) return { k: 'editar', frase: FRASE_SO_VENCIMENTO };
  return { k: 'pronta', item: { ordem: l.ordem, gesto: 'ajustar', lancamento_id: e.id, lido_em: e.atualizadoEm, valor: reais(l.valorCent) } };
}

export interface PedidoDoGravar {
  fatura: { hash: string; arquivo: string; final: string | null; fechamento: string | null; vencimento: string | null; total: number | null; motivo?: string };
  itens: ItemDoGravar[];
  /** as ordens das linhas a lançar que ficam para depois (falta conta/fazenda) */
  incompletas: number[];
}

/** o pedido: só as prontas (D2), sem as que o banco já recusou nesta leitura (`fora`) */
export function pedidoDoGravar(f: FaturaLida, g: GruposDaFatura, o: {
  contaDaFatura: string; escolhas: ReadonlyMap<number, Escolha>; hash: string; arquivo: string; fora?: ReadonlySet<number>;
  fazendaDaConta?: (planoContaId: string) => string | null;
}): PedidoDoGravar {
  const itens: ItemDoGravar[] = []; const incompletas: number[] = [];
  for (const x of g.linhas) {
    if (o.fora?.has(x.linha.ordem)) continue;
    const s = estadoDaLinha(x, escolhaDaLinha(x, o.escolhas, o.fazendaDaConta), o.contaDaFatura);
    if (s.k === 'pronta') itens.push(s.item);
    else if (s.k === 'falta') incompletas.push(x.linha.ordem);
  }
  return {
    fatura: { hash: o.hash, arquivo: o.arquivo, final: f.finalCartao, fechamento: f.fechamento, vencimento: f.vencimento,
      total: f.totalCent == null ? null : f.totalCent / 100 },
    itens, incompletas,
  };
}

/* ═══ a resposta do banco ═══ */
export interface RecusaDaLinha { motivo: string; frase: string }
export interface RespostaDoGravar {
  ok: boolean; simulado: boolean; gravacaoId: string | null;
  /** a recusa da fatura inteira (cartão, arquivo, vencimento…) */
  recusa: RecusaDaLinha | null;
  /** ordem → a recusa daquela linha */
  recusas: Map<number, RecusaDaLinha>;
  lancar: number; mover: number; ajustar: number; soma: number | null;
}

const texto = (v: unknown): string | null => (typeof v === 'string' && v.trim() ? v : null);
const numero = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : typeof v === 'string' && v.trim() !== '' && Number.isFinite(Number(v)) ? Number(v) : null);
function objeto(v: unknown): Record<string, unknown> | null {
  return v !== null && typeof v === 'object' && !Array.isArray(v) ? Object.fromEntries(Object.entries(v)) : null;
}
function recusaDe(v: unknown): RecusaDaLinha | null {
  const r = objeto(v);
  const frase = r ? texto(r.frase) : null;
  return r && frase ? { motivo: texto(r.motivo) ?? 'recusada', frase } : null;
}

/** a resposta da `fn_fatura_cartao_gravar` (prévia ou aplicar); null = não entendi */
export function respostaDoGravar(data: unknown): RespostaDoGravar | null {
  const d = objeto(data);
  if (!d || typeof d.ok !== 'boolean') return null;
  const recusas = new Map<number, RecusaDaLinha>();
  for (const it of Array.isArray(d.itens) ? d.itens : []) {
    const o = objeto(it); const ordem = o ? numero(o.ordem) : null; const r = o ? recusaDe(o.recusa) : null;
    if (ordem != null && r) recusas.set(ordem, r);
  }
  return {
    ok: d.ok, simulado: d.simulado === true, gravacaoId: texto(d.gravacao_id), recusa: recusaDe(d.recusa), recusas,
    lancar: numero(d.lancar) ?? 0, mover: numero(d.mover) ?? 0, ajustar: numero(d.ajustar) ?? 0, soma: numero(d.soma),
  };
}

/** "lança 12 · move 3 · ajusta 1 · R$ 4.526,58" (a frase da confirmação) */
export function fraseDoGravar(r: Pick<RespostaDoGravar, 'lancar' | 'mover' | 'ajustar' | 'soma'>): string {
  const partes = [r.lancar ? `lança ${r.lancar}` : null, r.mover ? `move ${r.mover}` : null, r.ajustar ? `ajusta ${r.ajustar}` : null].filter(Boolean);
  const soma = r.soma == null ? '' : ` · R$ ${r.soma.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  return `${partes.join(' · ') || 'nada'}${soma}`;
}

/* ═══ o desfazer ═══ */
export interface RespostaDoDesfazer { ok: boolean; simulado: boolean; recusa: RecusaDaLinha | null; voltaram: number; ficaram: { ordem: number | null; frase: string }[] }
export function respostaDoDesfazer(data: unknown): RespostaDoDesfazer | null {
  const d = objeto(data);
  if (!d || typeof d.ok !== 'boolean') return null;
  const ficaram = (Array.isArray(d.ficaram) ? d.ficaram : []).flatMap((x) => {
    const o = objeto(x); const frase = o ? texto(o.frase) ?? texto(o.motivo) : null;
    return o && frase ? [{ ordem: numero(o.ordem), frase }] : [];
  });
  return { ok: d.ok, simulado: d.simulado === true, recusa: recusaDe(d.recusa), voltaram: numero(d.voltaram) ?? 0, ficaram };
}
export function fraseDoDesfazer(r: RespostaDoDesfazer): string {
  const volta = `${r.voltaram} ${r.voltaram === 1 ? 'linha volta' : 'linhas voltam'}`;
  return r.ficaram.length ? `${volta} · ${r.ficaram.length} ${r.ficaram.length === 1 ? 'fica' : 'ficam'} (mudaram depois)` : volta;
}
