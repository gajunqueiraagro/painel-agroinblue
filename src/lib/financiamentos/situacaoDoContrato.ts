/**
 * A SITUAÇÃO DO CONTRATO, LIDA DO BANCO — PARC-LIVRES-01 passo 4 (Gabriel, 06/10/2026).
 *
 * ⚠ O DONO DA SITUAÇÃO "PAGA" É O LANÇAMENTO. `fn_financiamento_situacao` devolve as parcelas vivas com a situação DERIVADA e os
 *   cartões PRONTOS; este arquivo só LÊ (sem cast) e escreve os rótulos. A tela não soma, não filtra e não decide quem está pago.
 * ⚠ Qualquer peça torta = `null` inteiro, nunca zeros: número ausente não vira "R$ 0,00".
 */
import type { DocumentoDaLinha } from '@/lib/financeiro/documentoHelper';

export type SituacaoDaParcela = 'paga' | 'vencida' | 'pendente' | 'parcial';

/** PARC-CONTRATO-01 item 1 — o PRAZO vem calculado do banco (com o "hoje" que a tela mandou); a tela só o escreve. */
export type TipoDoPrazo = 'antes' | 'no_dia' | 'atraso' | 'vencida' | 'a_vencer';
export interface PrazoDaParcela { tipo: TipoDoPrazo; dias: number }

/** O que `p_detalhe` acrescenta a cada parcela: o que a tela do contrato mostra ao lado da situação. */
export interface DetalheDaParcela {
  competencia: string | null;
  contaNome: string | null;
  tipoDocumento: string | null;
  numeroDocumento: string | null;
  prazo: PrazoDaParcela | null;
  /** os documentos VIVOS do lançamento da parcela (a NF da compra e os dela), na forma que o dono `docDaLinha` lê */
  documentos: DocumentoDaLinha[];
  boletos: number;
}

/** O que `p_detalhe` acrescenta aos cartões. `notasDiferenca` = nota − soma das parcelas; nulo = sem nota ou nota sem valor. */
export interface DetalheDosCartoes {
  aVencerQtde: number; vencidoQtde: number; notasQtde: number; notasValor: number | null; notasDiferenca: number | null; boletos: number;
}

export interface ParcelaDoContrato {
  id: string;
  numero: number | null;
  dataVencimento: string | null;
  valorPrincipal: number;
  valorJuros: number;
  valorTotal: number;
  situacao: SituacaoDaParcela;
  pagoEm: string | null;
  valorPago: number;
  lancamentoId: string | null;
  lancamentoJurosId: string | null;
  /** 'lancamento' = a situação veio do lançamento (o dono); 'parcela' = não há lançamento vivo, vale a parcela (legado). */
  fonte: 'lancamento' | 'parcela';
  /** a coluna `status` da parcela diz outra coisa que a situação derivada */
  diverge: boolean;
  /** só com `p_detalhe`; nulo na leitura sem detalhe (o lote, os painéis) */
  detalhe: DetalheDaParcela | null;
}

export interface CartoesDoContrato {
  valorContrato: number; pago: number; aVencer: number; vencido: number;
  pagas: number; parcelas: number; jurosPrevistos: number; somaPrincipal: number; somaTotal: number; divergentes: number;
  /** só com `p_detalhe` */
  detalhe: DetalheDosCartoes | null;
}

export interface SituacaoDoContrato { parcelas: ParcelaDoContrato[]; cartoes: CartoesDoContrato }

const obj = (v: unknown): Record<string, unknown> | null => (typeof v === 'object' && v !== null && !Array.isArray(v) ? Object.fromEntries(Object.entries(v)) : null);
const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);
const txt = (v: unknown): string | null => (typeof v === 'string' && v !== '' ? v : null);
const SITUACOES: readonly SituacaoDaParcela[] = ['paga', 'vencida', 'pendente', 'parcial'];
const situacao = (v: unknown): SituacaoDaParcela | null => SITUACOES.find((s) => s === v) ?? null;

const TIPOS_DE_PRAZO: readonly TipoDoPrazo[] = ['antes', 'no_dia', 'atraso', 'vencida', 'a_vencer'];

/** O detalhe da parcela existe quando o banco mandou a lista de documentos. Peça torta = `undefined` (invalida a leitura inteira). */
function lerDetalheDaParcela(p: Record<string, unknown>): DetalheDaParcela | null | undefined {
  if (!('documentos' in p)) return null;
  if (!Array.isArray(p.documentos)) return undefined;
  const boletos = num(p.boletos);
  if (boletos === null) return undefined;
  const documentos: DocumentoDaLinha[] = [];
  for (const bruto of p.documentos) {
    const d = obj(bruto);
    if (!d) return undefined;
    documentos.push({ especie: txt(d.especie), numero: txt(d.numero), cancelado: false });
  }
  let prazo: PrazoDaParcela | null = null;
  if (p.prazo !== null && p.prazo !== undefined) {
    const z = obj(p.prazo);
    const tipo = TIPOS_DE_PRAZO.find((t) => t === z?.tipo);
    const dias = num(z?.dias);
    if (!tipo || dias === null) return undefined;
    prazo = { tipo, dias };
  }
  return {
    competencia: txt(p.competencia), contaNome: txt(p.conta_nome), tipoDocumento: txt(p.tipo_documento), numeroDocumento: txt(p.numero_documento),
    prazo, documentos, boletos,
  };
}

function lerDetalheDosCartoes(c: Record<string, unknown>): DetalheDosCartoes | null | undefined {
  if (!('notas_qtde' in c)) return null;
  const aVencerQtde = num(c.a_vencer_qtde); const vencidoQtde = num(c.vencido_qtde); const notasQtde = num(c.notas_qtde); const boletos = num(c.boletos);
  if (aVencerQtde === null || vencidoQtde === null || notasQtde === null || boletos === null) return undefined;
  return { aVencerQtde, vencidoQtde, notasQtde, notasValor: num(c.notas_valor), notasDiferenca: num(c.notas_diferenca), boletos };
}

export function lerSituacaoDoContrato(dado: unknown): SituacaoDoContrato | null {
  const raiz = obj(dado);
  const c = obj(raiz?.cartoes);
  if (!raiz || !c || !Array.isArray(raiz.parcelas)) return null;
  const n = (k: string) => num(c[k]);
  const [valorContrato, pago, aVencer, vencido, pagas, parcelasN, jurosPrevistos, somaPrincipal, somaTotal, divergentes] =
    [n('valor_contrato'), n('pago'), n('a_vencer'), n('vencido'), n('pagas'), n('parcelas'), n('juros_previstos'), n('soma_principal'), n('soma_total'), n('divergentes')];
  if (valorContrato === null || pago === null || aVencer === null || vencido === null || pagas === null || parcelasN === null
      || jurosPrevistos === null || somaPrincipal === null || somaTotal === null || divergentes === null) return null;
  const parcelas: ParcelaDoContrato[] = [];
  for (const bruta of raiz.parcelas) {
    const p = obj(bruta);
    const id = txt(p?.id); const sit = situacao(p?.situacao);
    const vp = num(p?.valor_principal); const vj = num(p?.valor_juros); const vt = num(p?.valor_total); const vpg = num(p?.valor_pago);
    if (!p || !id || !sit || vp === null || vj === null || vt === null || vpg === null) return null;
    const detalhe = lerDetalheDaParcela(p);
    if (detalhe === undefined) return null;
    parcelas.push({
      id, numero: num(p.numero), dataVencimento: txt(p.data_vencimento), valorPrincipal: vp, valorJuros: vj, valorTotal: vt,
      situacao: sit, pagoEm: txt(p.pago_em), valorPago: vpg, lancamentoId: txt(p.lancamento_id), lancamentoJurosId: txt(p.lancamento_juros_id),
      fonte: p.fonte === 'parcela' ? 'parcela' : 'lancamento', diverge: p.diverge === true, detalhe,
    });
  }
  const detalheDosCartoes = lerDetalheDosCartoes(c);
  if (detalheDosCartoes === undefined) return null;
  return { parcelas, cartoes: { valorContrato, pago, aVencer, vencido, pagas, parcelas: parcelasN, jurosPrevistos, somaPrincipal, somaTotal, divergentes, detalhe: detalheDosCartoes } };
}

/* PARC-CONTRATO-01: a não paga por vencer é "A vencer" (a palavra do cartão), não "Pendente". */
export const ROTULO_SITUACAO: Record<SituacaoDaParcela, string> = { paga: 'Paga', vencida: 'Vencida', pendente: 'A vencer', parcial: 'Parcial' };
export const CLASSE_SITUACAO: Record<SituacaoDaParcela, string> = {
  paga: 'bg-emerald-100 text-emerald-800', vencida: 'bg-red-100 text-red-800', pendente: 'bg-amber-100 text-amber-800', parcial: 'bg-amber-100 text-amber-800',
};
/** O que o `title` da situação diz: de onde ela veio. */
export function origemDaSituacao(p: ParcelaDoContrato): string {
  if (p.fonte === 'parcela') return 'parcela sem lançamento: a situação é a registrada na parcela';
  if (p.situacao === 'parcial') return 'só parte dos lançamentos desta parcela está realizada';
  return 'situação lida do lançamento desta parcela';
}
export const MOTIVO_PARCELA_SEM_LANCAMENTO = 'Parcela sem lançamento no Financeiro.';

/* ── PARC-CONTRATO-01 item 1 — como a tela ESCREVE o que o banco calculou (nenhuma conta aqui) ─────────────────────────── */

const dias = (n: number) => (n === 1 ? '1 dia' : `${n} dias`);

/** "3 dias antes" · "no dia" · "2 dias de atraso" · "vencida há 2 dias" · "vence em 29 dias" (hoje: "vence hoje"). */
export function textoDoPrazo(p: PrazoDaParcela | null): string {
  if (!p) return '—';
  switch (p.tipo) {
    case 'antes': return `${dias(p.dias)} antes`;
    case 'no_dia': return 'no dia';
    case 'atraso': return `${dias(p.dias)} de atraso`;
    case 'vencida': return `vencida há ${dias(p.dias)}`;
    case 'a_vencer': return p.dias === 0 ? 'vence hoje' : `vence em ${dias(p.dias)}`;
  }
}
/** verde = pagou em dia; vermelho = atraso; cinza = ainda por vencer. */
export const TOM_DO_PRAZO: Record<TipoDoPrazo, 'verde' | 'vermelho' | 'cinza'> = {
  antes: 'verde', no_dia: 'verde', atraso: 'vermelho', vencida: 'vermelho', a_vencer: 'cinza',
};

const reais = (v: number) => v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/**
 * O rodapé da coluna Nota fiscal: "1 nota · confere" ou a diferença ESCRITA (nota − soma das parcelas, do banco).
 * A tela só olha o sinal para escolher a palavra; não subtrai nada.
 */
export function textoDasNotas(c: DetalheDosCartoes | null): { texto: string; tom: 'verde' | 'vermelho' | 'cinza'; titulo: string } {
  if (!c || c.notasQtde === 0) return { texto: '—', tom: 'cinza', titulo: 'nenhuma nota fiscal ligada às parcelas' };
  const n = c.notasQtde === 1 ? '1 nota' : `${c.notasQtde} notas`;
  if (c.notasDiferenca === null) return { texto: `${n} · sem valor`, tom: 'cinza', titulo: 'a nota não tem valor registrado: não dá para comparar com as parcelas' };
  if (c.notasDiferenca === 0) return { texto: `${n} · confere`, tom: 'verde', titulo: 'o valor da nota é igual à soma das parcelas' };
  const sinal = c.notasDiferenca > 0 ? '+' : '\u2212';
  return {
    texto: `${n} · ${sinal}${reais(Math.abs(c.notasDiferenca))}`, tom: 'vermelho',
    titulo: c.notasDiferenca > 0 ? 'a nota vale mais que a soma das parcelas' : 'a nota vale menos que a soma das parcelas',
  };
}
