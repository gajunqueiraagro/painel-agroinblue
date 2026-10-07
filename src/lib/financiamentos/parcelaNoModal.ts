/**
 * VALOR E VENCIMENTO DE UMA PARCELA DE COMPRA PARCELADA, EDITADOS PELO MODAL DO LANÇAMENTO — PARC-CADEIA-01 passo 3
 * (fecha a dívida PARC-MODAL-PARCELA-VALOR-01: o modal gravava só o lançamento e a parcela ficava com o número antigo).
 *
 * A parcela e o lançamento mudam JUNTOS: quando o Salvar muda valor ou vencimento de parcela NÃO paga, esses dois campos vão
 * por `fn_parcelamento_editar_parcelas` (a lista final do contrato com só esta parcela alterada), ANTES do gravador de sempre.
 * Este é o dono PURO: monta a lista, diz se mudou e escreve "A compra passa de X para Y". Em CENTAVOS inteiros; nada é
 * arredondado nem engolido — o total novo é a soma da lista, e o operador o vê antes de salvar.
 * ⚠ PARCELA PAGA NUNCA MUDA: quem diz que está paga é a situação do banco (`fn_financiamento_situacao`); valor e vencimento
 *   ficam em leitura com o motivo.
 */
import { brCentavos, centavos } from '@/lib/financiamentos/parcelasLivres';
import type { SituacaoDoContrato } from '@/lib/financiamentos/situacaoDoContrato';

export const MOTIVO_PARCELA_PAGA = 'Parcela paga: valor e vencimento não mudam.';

export interface EdicaoDaParcela {
  numero: number | null;
  total: number;
  paga: boolean;
  /** o valor ou o vencimento do modal difere do que a PARCELA tem */
  mudou: boolean;
  /** a lista final do contrato, na ordem, para `fn_parcelamento_editar_parcelas` */
  lista: { id: string; data_vencimento: string | null; valor: number }[];
  totalAntesCent: number;
  totalDepoisCent: number;
  /** "A compra passa de X para Y." — só quando o total muda */
  frase: string | null;
}

/** `null` = o lançamento não é parcela viva deste contrato. */
export function edicaoDaParcela(situacao: SituacaoDoContrato, lancamentoId: string, valorDoModal: number, vencimentoDoModal: string | null): EdicaoDaParcela | null {
  const alvo = situacao.parcelas.find(p => p.lancamentoId === lancamentoId);
  if (!alvo) return null;
  const vencimento = vencimentoDoModal?.trim() ? vencimentoDoModal.trim() : null;
  const valorCent = centavos(Math.abs(valorDoModal));
  const paga = alvo.situacao === 'paga' || alvo.situacao === 'parcial';
  const mudou = !paga && (valorCent !== centavos(alvo.valorTotal) || vencimento !== alvo.dataVencimento);
  let somaCent = 0;
  const lista = situacao.parcelas.map(p => {
    const daVez = p.id === alvo.id && !paga;
    const cent = daVez ? valorCent : centavos(p.valorTotal);
    somaCent += cent;
    return { id: p.id, data_vencimento: daVez ? vencimento : p.dataVencimento, valor: cent / 100 };
  });
  const totalAntesCent = centavos(situacao.cartoes.valorContrato);
  return {
    numero: alvo.numero, total: situacao.parcelas.length, paga, mudou, lista,
    totalAntesCent, totalDepoisCent: somaCent,
    frase: mudou && somaCent !== totalAntesCent ? `A compra passa de ${brCentavos(totalAntesCent)} para ${brCentavos(somaCent)}.` : null,
  };
}

/** O prefiltro barato de quem PODE ser parcela de contrato (a resposta é do banco): só então o modal consulta. */
export const podeSerParcelaDeContrato = (l: { origem_tipo?: string | null } | null | undefined): boolean =>
  l?.origem_tipo === 'parcela_principal';
