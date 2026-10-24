/**
 * A NOTA PAGA NO CARTÃO EM N VEZES — P74 (NOTA-CARTAO-PARCELADO-01, Gabriel 23/10/2026: "Não vou fazer à mão! esperar o sistema arrumar").
 * PURO. O caso: NF 778.618 (Agnaldo, sem duplicata, R$ 3.284,88) paga no Cartão Elo em 4 × R$ 821,22, faturas 10/09 a 10/12/2026 — a
 * prévia só criava 1/1 e o operador cancelou e refez à mão.
 *   · "Como foi pago?" — Duplicatas da nota | À vista | Cartão em N×. Abre em Duplicatas quando a nota as traz; senão À vista. A escolha
 *     vira a PROPOSTA da nota (`comPagamento`): as parcelas do cartão entram no lugar das duplicatas, e daí para baixo tudo é o caminho de
 *     sempre — gravar (`criarParcelasDaNota`), o PDF nas N, a busca de "nota já lançada" (que passa a procurar as parcelas do cartão),
 *     o "No Novo lançamento" e o "Atualizar e parcelar". Nenhum gravador novo.
 *   · As parcelas do cartão saem pelo MESMO arredondamento do Novo lançamento › Parcelada (`preverParcelas`, o espelho da RPC).
 *   · A 1ª FATURA SUGERIDA (decisão de 24/10): o dia do mês MAIS FREQUENTE dos vencimentos não cancelados do mesmo cartão nos últimos 12
 *     meses (empate: o que aconteceu mais recentemente), no 1º mês depois da emissão. Sem histórico: vazio e obrigatório.
 */
import { preverParcelas } from '@/lib/financiamentos/montarPayloadParcelamento';
import { duplicatasCabemNoParcelamentoDeHoje, somarMeses, type ParcelamentoProposto } from '@/lib/financeiro/nfe/proporLancamento';
import type { DuplicataNFe } from '@/lib/financeiro/nfe/tipos';
import type { DoXml } from '@/lib/financeiro/nfePrefill';

export type ComoFoiPago = 'duplicatas' | 'avista' | 'cartao';
export const MIN_PARCELAS_DO_CARTAO = 2;
export const MAX_PARCELAS_DO_CARTAO = 24;
export const FRASE_NOTA_SEM_DUPLICATAS = 'A nota não traz duplicatas.';

/** Como a prévia abre: com duplicatas, nelas; sem, à vista. Depois, só o operador muda. */
export const comoAbre = (nDuplicatas: number): ComoFoiPago => (nDuplicatas > 0 ? 'duplicatas' : 'avista');

/** Um dia do mês em que vencem lançamentos do cartão (o que `fn_cartao_dias_de_vencimento` devolve). */
export interface DiaDoCartao { dia: number; lancamentos: number; ultimo: string }

/** O dia mais frequente; empate: o de vencimento mais recente; ainda empate, o menor dia. Sem histórico: nulo. */
export function diaMaisFrequente(dias: readonly DiaDoCartao[]): number | null {
  let melhor: DiaDoCartao | null = null;
  for (const d of dias) {
    if (!(d.lancamentos > 0) || !(d.dia >= 1 && d.dia <= 31)) continue;
    if (!melhor || d.lancamentos > melhor.lancamentos
      || (d.lancamentos === melhor.lancamentos && (d.ultimo > melhor.ultimo || (d.ultimo === melhor.ultimo && d.dia < melhor.dia)))) melhor = d;
  }
  return melhor ? melhor.dia : null;
}

/** O período da sugestão: os 12 meses até hoje. */
export const periodoDaSugestao = (hoje: string) => ({ desde: somarMeses(hoje, -12), ate: hoje });

/** A 1ª fatura: o `dia` no mês SEGUINTE ao da emissão (o dia que o mês não tem cai no último dia dele). */
export function primeiraFatura(emissao: string, dia: number): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(emissao) || !(dia >= 1 && dia <= 31)) return '';
  const proximo = somarMeses(`${emissao.slice(0, 7)}-01`, 1);
  const ultimoDia = new Date(Date.UTC(Number(proximo.slice(0, 4)), Number(proximo.slice(5, 7)), 0)).getUTCDate();
  return `${proximo.slice(0, 8)}${String(Math.min(dia, ultimoDia)).padStart(2, '0')}`;
}

/** "Elo" de "Cartão Elo" — o rótulo curto da sugestão. */
export const nomeCurtoDoCartao = (nome: string) => nome.replace(/^\s*cart[ãa]o\s+/i, '').trim() || nome;
export const rotuloDaSugestao = (nomeDoCartao: string, dia: number) => `1ª fatura · sugerido (${nomeCurtoDoCartao(nomeDoCartao)}, dia ${dia})`;

/** As N parcelas iguais, todo mês no mesmo dia, pelo arredondamento do Novo lançamento › Parcelada (a última absorve a sobra). */
export function parcelasDoCartao(totalCent: number, n: number, primeira: string): DuplicataNFe[] {
  if (!(n >= MIN_PARCELAS_DO_CARTAO && n <= MAX_PARCELAS_DO_CARTAO) || !/^\d{4}-\d{2}-\d{2}$/.test(primeira) || !(totalCent > 0)) return [];
  return preverParcelas(totalCent / 100, n, primeira).map((x) => ({ numero: String(x.numero), vencimento: x.dataVencimento, valorCent: Math.round(x.valor * 100) }));
}

/**
 * A nota COMO FOI PAGA — a proposta que vai para a gravação, a busca e o Novo lançamento:
 *   duplicatas = a da nota, intocada · à vista = sem duplicatas (um lançamento, o vencimento escolhido) ·
 *   cartão = as parcelas do cartão no lugar das duplicatas (o valor = a soma delas; mensal se cabem no parcelamento de hoje, senão livres).
 */
export function comPagamento(d: DoXml, como: ComoFoiPago, parcelas: readonly DuplicataNFe[] = []): DoXml {
  if (como === 'duplicatas') return d;
  const p = d.proposta;
  if (como === 'avista') return { ...d, proposta: { ...p, duplicatas: [], parcelamento: { tipo: 'unico', vencimento: '' } } };
  const lista = [...parcelas];
  const somaCent = lista.reduce((s, x) => s + x.valorCent, 0);
  const parcelamento: ParcelamentoProposto = duplicatasCabemNoParcelamentoDeHoje(lista)
    ? { tipo: 'parcelado', parcelas: lista.length, primeiroVencimento: lista[0]?.vencimento ?? '' }
    : { tipo: 'livres', parcelas: lista.length };
  return { ...d, proposta: { ...p, duplicatas: lista, valorCent: somaCent, parcelamento } };
}

/** O rodapé com o cartão: "O PDF fica anexado às 4 parcelas como a NF 778.618 · 4 saídas no Cartão Elo, uma em cada fatura." */
export const fraseDoRodapeDoCartao = (origem: 'PDF' | 'XML', n: number, nf: string, cartao: string) =>
  `O ${origem} fica anexado às ${n} parcelas como a NF ${nf} · ${n} saídas no ${cartao}, uma em cada fatura.`;
