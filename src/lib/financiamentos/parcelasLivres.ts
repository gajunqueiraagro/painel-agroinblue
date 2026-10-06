/**
 * PARCELAS LIVRES — valor e vencimento por parcela (PARC-LIVRES-01, Gabriel 06/10/2026).
 *
 * ⚠ FUNÇÕES PURAS, EM CENTAVOS INTEIROS. A tela não soma: N, soma, valor da compra e diferença saem de `resumoDasParcelas`;
 *   o que trava o Salvar sai de `motivoNaoSalva`; cada gesto devolve a lista nova. Nada aqui arredonda nem "faz fechar":
 *   a diferença aparece e o OPERADOR escolhe (pôr na última parcela, ou a compra passa a valer a soma).
 * ⚠ O SISTEMA NÃO FIXA DIA NEM VALOR: parcela acrescentada nasce SEM vencimento e SEM valor.
 * ⚠ PARCELA PAGA NUNCA MUDA (passo 2): `paga` trava vencimento, valor e a retirada — em toda função daqui.
 */
import type { ParcelaPrevista } from '@/lib/financiamentos/montarPayloadParcelamento';

export type OrigemDaParcela = 'nota' | 'mensal' | 'gravada' | 'nova';

export interface ParcelaLivre {
  /** Estável na tela (a numeração refaz quando uma sai; a chave não). */
  chave: string;
  /** 'YYYY-MM-DD', ou '' enquanto o operador não informa. */
  vencimento: string;
  valorCent: number;
  origem: OrigemDaParcela;
  /** O que a parcela era ao nascer (a duplicata da nota, a parcela gravada) — para o "editado · era …". `null` na nova. */
  era: { vencimento: string; valorCent: number } | null;
  /** Passo 2 — o id da parcela gravada. */
  id?: string;
  /** Passo 2 — parcela paga: `em` é a data do pagamento (ou nulo quando o banco não a tem). */
  paga?: { em: string | null };
}

export const centavos = (reais: number): number => Math.round(reais * 100);

let contador = 0;
/** Chave nova para a parcela acrescentada (só identidade de tela). */
export const novaChave = (): string => `p${Date.now().toString(36)}-${(contador += 1)}`;

/** As duplicatas da nota, como estão na nota. */
export function parcelasDaNota(duplicatas: readonly { vencimento: string; valorCent: number }[]): ParcelaLivre[] {
  return duplicatas.map((d, i) => ({
    chave: `nota-${i + 1}`, vencimento: d.vencimento, valorCent: d.valorCent, origem: 'nota',
    era: { vencimento: d.vencimento, valorCent: d.valorCent },
  }));
}

/** A prévia do "Igual todo mês" (`preverParcelas`) como ponto de partida das livres. */
export function parcelasDoMensal(previstas: readonly ParcelaPrevista[]): ParcelaLivre[] {
  return previstas.map((p) => ({
    chave: `mensal-${p.numero}`, vencimento: p.dataVencimento, valorCent: centavos(p.valor), origem: 'mensal',
    era: { vencimento: p.dataVencimento, valorCent: centavos(p.valor) },
  }));
}

export interface ResumoDasParcelas { n: number; somaCent: number; compraCent: number; diferencaCent: number }

/** N, soma, valor da compra e a diferença (soma − compra). Positiva: as parcelas passam da compra; negativa: faltam. */
export function resumoDasParcelas(parcelas: readonly ParcelaLivre[], compraCent: number): ResumoDasParcelas {
  let somaCent = 0;
  for (const p of parcelas) somaCent += p.valorCent;
  return { n: parcelas.length, somaCent, compraCent, diferencaCent: somaCent - compraCent };
}

export const FRASE_SOMA_NAO_FECHA = 'A soma das parcelas não fecha com a compra.';
export const fraseSomaNaoFecha = (oQue: string) => `A soma das parcelas não fecha com ${oQue}.`;

/** Por que não dá para salvar (escrito ao lado do Salvar), ou nulo. A ordem é a do que o operador resolve primeiro. */
export function motivoNaoSalva(parcelas: readonly ParcelaLivre[], compraCent: number, oQue = 'a compra'): string | null {
  if (parcelas.length === 0) return 'Informe ao menos uma parcela.';
  const semData = parcelas.findIndex((p) => !/^\d{4}-\d{2}-\d{2}$/.test(p.vencimento));
  if (semData >= 0) return `Parcela ${semData + 1} sem vencimento.`;
  const semValor = parcelas.findIndex((p) => !(p.valorCent > 0));
  if (semValor >= 0) return `Parcela ${semValor + 1} sem valor.`;
  if (resumoDasParcelas(parcelas, compraCent).diferencaCent !== 0) return fraseSomaNaoFecha(oQue);
  return null;
}

/** O que mudou em relação ao que a parcela era. */
export function mudancaDaParcela(p: ParcelaLivre): { vencimento: boolean; valor: boolean } {
  if (!p.era) return { vencimento: false, valor: false };
  return { vencimento: p.vencimento !== p.era.vencimento, valor: p.valorCent !== p.era.valorCent };
}

const brData = (iso: string) => (/^\d{4}-\d{2}-\d{2}$/.test(iso) ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(2, 4)}` : '—');
export const brCentavos = (cent: number) => (cent / 100).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const NASCEU: Record<OrigemDaParcela, string> = {
  nota: 'duplicata da nota', mensal: 'igual todo mês', gravada: 'gravada', nova: 'acrescentada',
};

/** "De onde veio": a origem, ou "editado · era {o valor e/ou a data de antes}". */
export function deOndeVeio(p: ParcelaLivre): string {
  if (p.paga) return `paga${p.paga.em ? ` em ${brData(p.paga.em)}` : ''}`;
  const m = mudancaDaParcela(p);
  if (!p.era || (!m.vencimento && !m.valor)) return NASCEU[p.origem];
  const partes: string[] = [];
  if (m.vencimento) partes.push(brData(p.era.vencimento));
  if (m.valor) partes.push(brCentavos(p.era.valorCent));
  return `editado · era ${partes.join(' · ')}`;
}

/** O motivo da linha travada (o `title` da parcela paga). */
export const motivoDaPaga = (p: ParcelaLivre): string | null =>
  (p.paga ? `paga${p.paga.em ? ` em ${brData(p.paga.em)}` : ''}: data e valor não mudam` : null);

/* ── os gestos: cada um devolve a lista NOVA; parcela paga não se mexe ───────── */

export function editarVencimento(parcelas: readonly ParcelaLivre[], chave: string, vencimento: string): ParcelaLivre[] {
  return parcelas.map((p) => (p.chave === chave && !p.paga ? { ...p, vencimento } : p));
}

export function editarValor(parcelas: readonly ParcelaLivre[], chave: string, valorCent: number): ParcelaLivre[] {
  return parcelas.map((p) => (p.chave === chave && !p.paga ? { ...p, valorCent: Math.max(0, Math.round(valorCent)) } : p));
}

/** "+ Parcela": no fim, sem data e sem valor (o sistema não inventa nenhum dos dois). */
export function acrescentarParcela(parcelas: readonly ParcelaLivre[], chave: string = novaChave()): ParcelaLivre[] {
  return [...parcelas, { chave, vencimento: '', valorCent: 0, origem: 'nova', era: null }];
}

/** "✕": tira a parcela (a numeração refaz pela posição). Paga não sai. */
export function retirarParcela(parcelas: readonly ParcelaLivre[], chave: string): ParcelaLivre[] {
  return parcelas.filter((p) => p.chave !== chave || !!p.paga);
}

/** A última parcela que pode receber a diferença: a última NÃO paga. `-1` quando não há. */
export function indiceQueRecebeADiferenca(parcelas: readonly ParcelaLivre[]): number {
  for (let i = parcelas.length - 1; i >= 0; i -= 1) if (!parcelas[i].paga) return i;
  return -1;
}

/**
 * "Pôr {diferença} na parcela N": a última não paga absorve a diferença, e a soma passa a fechar. `null` quando não há
 * parcela que possa recebê-la ou quando ela ficaria zerada/negativa (o gesto fica apagado com o motivo).
 */
export function porDiferencaNaUltima(parcelas: readonly ParcelaLivre[], compraCent: number): ParcelaLivre[] | null {
  const i = indiceQueRecebeADiferenca(parcelas);
  if (i < 0) return null;
  const novo = parcelas[i].valorCent - resumoDasParcelas(parcelas, compraCent).diferencaCent;
  if (!(novo > 0)) return null;
  return parcelas.map((p, k) => (k === i ? { ...p, valorCent: novo } : p));
}

/** Houve edição em relação ao ponto de partida? (para perguntar antes de voltar ao "Igual todo mês"). */
export function houveEdicao(parcelas: readonly ParcelaLivre[], base: readonly ParcelaLivre[]): boolean {
  if (parcelas.length !== base.length) return true;
  return parcelas.some((p, i) => p.chave !== base[i].chave || p.vencimento !== base[i].vencimento || p.valorCent !== base[i].valorCent);
}

/** O que viaja na chave `parcelas` da RPC: número pela posição, valor em reais com duas casas. */
export function parcelasParaPayload(parcelas: readonly ParcelaLivre[]): { numero: number; data_vencimento: string; valor: number }[] {
  return parcelas.map((p, i) => ({ numero: i + 1, data_vencimento: p.vencimento, valor: p.valorCent / 100 }));
}

/** A lista no formato da prévia (o que a grade de boletos e o resumo já leem). */
export function parcelasComoPrevistas(parcelas: readonly ParcelaLivre[]): ParcelaPrevista[] {
  return parcelas.map((p, i) => ({ numero: i + 1, dataVencimento: p.vencimento, valor: p.valorCent / 100 }));
}
