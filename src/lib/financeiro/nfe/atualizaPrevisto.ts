/**
 * NOTA-ATUALIZA-PREVISTO-01 (Gabriel 06/11 17:30–17:32) — PREVISTO É ESTIMATIVA. A parcela da nota casada com um lançamento PREVISTO
 * ("É esta" na linha "só no sistema") ATUALIZA o previsto: o valor (pela participação, R3), o nº e a nota; não soma, não duplica, não cria.
 *
 * - R1: a parcela da nota que casa com um previsto sai do "Criar"; o Resultado conta o previsto com o valor NOVO.
 * - R2: o vencimento que fica é o do PREVISTO; só muda quando a nota traz as parcelas com data (duplicatas com vencimento próprio).
 *       Vencimento = emissão (à vista no papel) não conta como data.
 * - R3: a participação % (padrão 100): o valor do lançamento = participação × parcela da nota; o resto é "parte paga por outro",
 *       só informativa (não vira lançamento, não entra no DRE, no caixa nem no Livro Caixa).
 * - R4: o REALIZADO (pago/conciliado) nunca entra aqui: o valor pago não muda.
 *
 * Função pura: a tela decide quem recebe a nota; aqui só o par, o valor e o vencimento.
 */
import type { LinhaSistemaNota, ParcelaDaNotaParaCasar } from './jaLancada';

export interface PrevistoQueAtualiza {
  lancamentoId: string;
  /** a parcela da nota que ele recebe (sai do "Criar") */
  parcelaN: number;
  valorAntigoCent: number;
  valorNovoCent: number;
  /** a parcela inteira da nota (antes da participação) */
  parcelaCent: number;
  /** a parte da parcela que outro paga (parcela − valor novo); 0 com 100% */
  parteDeOutroCent: number;
  /** R2 — o vencimento que fica e se ele muda (só com duplicata de data própria) */
  vencimentoQueFica: string | null;
  vencimentoMuda: boolean;
}

/** O PREVISTO em aberto (status 'previsto', sem pagamento, sem conciliação, vivo). Programado e agendado ficam fora: têm valor combinado. */
export function ePrevistoEmAberto(l: NonNullable<LinhaSistemaNota['sistema']>): boolean {
  return l.status === 'previsto' && !l.conciliado && !l.pagamento && !l.cancelado;
}

/** R3 — o valor do lançamento pela participação (centavo arredondado; 100% = a parcela inteira). */
export function valorPelaParticipacao(parcelaCent: number, participacaoPct: number): number {
  if (!(participacaoPct > 0) || participacaoPct >= 100) return parcelaCent;
  return Math.round((parcelaCent * participacaoPct) / 100);
}

/**
 * Os pares previsto ↔ parcela da nota. Entram as linhas "só no sistema" que RECEBEM a nota (o operador escolheu "É esta"/"Vincular") e são
 * previstos em aberto; casam com as parcelas que faltam, uma a uma, na ordem do vencimento (o previsto mais cedo com a 1ª parcela).
 * `duplicatasComData`: a nota traz duplicatas (fatura com vencimento) — sem elas, a parcela tem a data da emissão e o vencimento do previsto fica.
 */
export function previstosQueAtualizam(args: {
  linhas: readonly LinhaSistemaNota[];
  recebeANota: (lancamentoId: string) => boolean;
  faltam: readonly ParcelaDaNotaParaCasar[];
  duplicatasComData: boolean;
  emissao: string | null;
  participacaoPct: number;
}): PrevistoQueAtualiza[] {
  const { linhas, recebeANota, faltam, duplicatasComData, emissao, participacaoPct } = args;
  const previstos = linhas
    .flatMap((x) => (x.situacao === 'so_no_sistema' && x.sistema && recebeANota(x.sistema.id) && ePrevistoEmAberto(x.sistema) ? [x.sistema] : []))
    .sort((a, b) => (a.vencimento ?? '').localeCompare(b.vencimento ?? '') || a.id.localeCompare(b.id));
  const parcelas = [...faltam].sort((a, b) => a.n - b.n);
  const n = Math.min(previstos.length, parcelas.length);
  const pares: PrevistoQueAtualiza[] = [];
  for (let k = 0; k < n; k++) {
    const l = previstos[k];
    const p = parcelas[k];
    const valorNovoCent = valorPelaParticipacao(p.valorCent, participacaoPct);
    const dataPropria = duplicatasComData && !!p.vencimento && p.vencimento !== emissao;
    const vencimentoQueFica = dataPropria ? p.vencimento : l.vencimento;
    pares.push({
      lancamentoId: l.id, parcelaN: p.n, valorAntigoCent: l.valorCent, valorNovoCent, parcelaCent: p.valorCent,
      parteDeOutroCent: p.valorCent - valorNovoCent, vencimentoQueFica, vencimentoMuda: dataPropria && p.vencimento !== l.vencimento,
    });
  }
  return pares;
}

/**
 * R3 — a participação sugerida pelo HISTÓRICO do mesmo fornecedor neste cliente (nunca pela descrição): o % de cada lançamento sobre a nota
 * anexada a ele. Sugere quando os últimos 3 (com nota de valor) dão o mesmo % inteiro e ele é menor que 100. O operador confirma na tela.
 */
export function participacaoDoHistorico(historico: readonly { lancamentoCent: number; documentoCent: number }[]): number | null {
  const pcts = historico.filter((h) => h.documentoCent > 0 && h.lancamentoCent > 0).slice(0, 3)
    .map((h) => (h.lancamentoCent * 100) / h.documentoCent);
  if (pcts.length < 3) return null;
  const inteiro = Math.round(pcts[0]);
  if (inteiro >= 100 || inteiro <= 0) return null;
  return pcts.every((p) => Math.abs(p - inteiro) < 0.05) ? inteiro : null;
}
