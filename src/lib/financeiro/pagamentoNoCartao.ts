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
import { FORMA_CARTAO_CREDITO } from '@/lib/financeiro/formasPagamentoV2';

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

/**
 * CARTAO-LANCAMENTO-01 (Gabriel 30/10 18:36) — o dia do vencimento da fatura: o DIGITADO no cadastro do cartão manda; vazio, o mais
 * frequente das faturas (`origem: 'faturas'`, a tela o mostra como SUGESTÃO, nunca como gravado); nenhum dos dois: nulo (não sugere).
 */
export function diaDoVencimentoDoCartao(digitado: number | null, faturas: readonly DiaDoCartao[]): { dia: number; origem: 'digitado' | 'faturas' } | null {
  if (digitado != null && digitado >= 1 && digitado <= 31) return { dia: digitado, origem: 'digitado' };
  const dia = diaMaisFrequente(faturas);
  return dia == null ? null : { dia, origem: 'faturas' };
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

/** O `dia` no mês de `mes01` (aaaa-mm-01); o dia que o mês não tem cai no último dia dele. */
function diaNoMes(mes01: string, dia: number): string {
  const ultimoDia = new Date(Date.UTC(Number(mes01.slice(0, 4)), Number(mes01.slice(5, 7)), 0)).getUTCDate();
  return `${mes01.slice(0, 8)}${String(Math.min(dia, ultimoDia)).padStart(2, '0')}`;
}

/**
 * CARTAO-LANCAMENTO-01 (Gabriel 30/10, decisão 3) — a FATURA ONDE A COMPRA CAI, pelo dia de fechamento do cartão:
 *   · sem fechamento cadastrado: a regra de hoje (`primeiraFatura`: o dia do vencimento no mês seguinte à compra);
 *   · com fechamento F e vencimento V: a compra ANTES do dia F fecha no mês dela; no dia F ou depois, no mês seguinte (a do dia do
 *     fechamento já é da próxima fatura); a fatura que fecha no mês M vence no dia V de M quando V > F, senão no dia V de M+1.
 *   O dia que o mês não tem (fechamento ou vencimento) cai no último dia dele. Entrada inválida: vazio.
 */
export function faturaDaCompra(compra: string, diaVencimento: number, diaFechamento: number | null): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(compra) || !(diaVencimento >= 1 && diaVencimento <= 31)) return '';
  if (diaFechamento == null) return primeiraFatura(compra, diaVencimento);
  if (!(diaFechamento >= 1 && diaFechamento <= 31)) return '';
  const mesDaCompra = `${compra.slice(0, 7)}-01`;
  const fechaNoMes = compra < diaNoMes(mesDaCompra, diaFechamento) ? mesDaCompra : somarMeses(mesDaCompra, 1);
  return diaNoMes(diaVencimento > diaFechamento ? fechaNoMes : somarMeses(fechaNoMes, 1), diaVencimento);
}

const ddmm = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;

/**
 * CARTAO-LANCAMENTO-01 — a frase do cadastro do cartão (mock v2, "Em qual fatura cai a compra"), sobre o mês seguinte ao de `hoje`.
 * Sai de `faturaDaCompra`, a mesma regra do lançamento: o que a frase diz é o que o vencimento faz.
 */
export function explicacaoDaFatura(diaFechamento: number | null, diaVencimento: number | null, hoje: string): { titulo: string; linha: string; nota: string } {
  if (diaVencimento == null) {
    return { titulo: 'Em qual fatura cai a compra:', linha: 'Digite o dia de vencimento (ou deixe o sugerido pelas faturas) para ver em qual fatura cai a compra.', nota: '' };
  }
  const semFechamento = `Sem dia de fechamento: vence no dia ${diaVencimento} do mês seguinte à compra (a regra de hoje).`;
  if (diaFechamento == null) return { titulo: `Em qual fatura cai a compra (vence dia ${diaVencimento}):`, linha: semFechamento, nota: '' };
  const mes = somarMeses(`${hoje.slice(0, 7)}-01`, 1);
  const fecha = diaNoMes(mes, diaFechamento);
  const depois = `vence em ${ddmm(faturaDaCompra(fecha, diaVencimento, diaFechamento))}`;
  const titulo = `Em qual fatura cai a compra (fecha dia ${diaFechamento}, vence dia ${diaVencimento}):`;
  if (fecha === mes) {
    return { titulo, linha: `toda compra (no dia do fechamento também) → ${depois}, na fatura que fecha no dia ${diaFechamento} seguinte`, nota: semFechamento };
  }
  const vespera = `${fecha.slice(0, 8)}${String(Number(fecha.slice(8, 10)) - 1).padStart(2, '0')}`;
  const antes = vespera === mes ? `compra de ${ddmm(mes)}`
    : Number(vespera.slice(8, 10)) === 2 ? `compra de ${ddmm(mes)} ou ${ddmm(vespera)}` : `compra de ${ddmm(mes)} a ${ddmm(vespera)}`;
  const naFatura = `fatura que fecha em ${ddmm(fecha)} e vence em ${ddmm(faturaDaCompra(mes, diaVencimento, diaFechamento))}`;
  return { titulo, linha: `${antes} → ${naFatura} · compra de ${ddmm(fecha)} em diante (no dia do fechamento também) → ${depois}`, nota: semFechamento };
}

/** O dia em que FECHA a fatura onde a compra cai (a de antes do dia F fecha no mês dela; no dia F ou depois, no mês seguinte). */
export function fechamentoDaCompra(compra: string, diaFechamento: number): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(compra) || !(diaFechamento >= 1 && diaFechamento <= 31)) return '';
  const mesDaCompra = `${compra.slice(0, 7)}-01`;
  const fechaNoMesDaCompra = diaNoMes(mesDaCompra, diaFechamento);
  return compra < fechaNoMesDaCompra ? fechaNoMesDaCompra : diaNoMes(somarMeses(mesDaCompra, 1), diaFechamento);
}

/**
 * CARTAO-LANCAMENTO-01 (decisão 2) — a FORMA pela conta: conta de cartão põe "Cartão de crédito" só quando a forma está vazia ou foi
 * ela mesma que pôs (`automatica`); a escolha do operador ou da nota nunca é trocada. Conta que não é cartão volta a vazio só se a forma
 * era a automática.
 */
export function formaPelaConta(atual: { forma: string; automatica: boolean }, contaEhCartao: boolean): { forma: string; automatica: boolean } {
  if (contaEhCartao) return atual.forma === '' || atual.automatica ? { forma: FORMA_CARTAO_CREDITO, automatica: true } : { forma: atual.forma, automatica: false };
  return atual.automatica ? { forma: '', automatica: false } : atual;
}

/**
 * CARTAO-LANCAMENTO-01 — o VENCIMENTO pela fatura: a data nova entra quando o campo está vazio ou ainda mostra a sugestão anterior
 * (a compra, o cartão ou o parcelado mudaram); a data que o operador ou a nota puseram fica.
 */
export function vencimentoPelaFatura(atual: string, sugeridaAntes: string, sugerida: string): string {
  if (!sugerida) return atual;
  return atual === '' || atual === sugeridaAntes ? sugerida : atual;
}

/**
 * A frase do lançamento, embaixo da conta (mock v2): "Cartão Elo: compra de 30/10 cai na fatura que fecha 03/11 e vence 10/11 · pode
 * trocar". Sem dia de fechamento, diz de onde veio o dia ("do cadastro" ou "sugerido pelas faturas").
 */
export function fraseDaFaturaNoLancamento(nomeDoCartao: string, compra: string, dia: { dia: number; origem: 'digitado' | 'faturas' }, diaFechamento: number | null): string {
  const vence = faturaDaCompra(compra, dia.dia, diaFechamento);
  if (!vence) return '';
  const fecha = diaFechamento == null ? '' : fechamentoDaCompra(compra, diaFechamento);
  const naFatura = fecha ? `cai na fatura que fecha ${ddmm(fecha)} e vence ${ddmm(vence)}`
    : `cai na fatura que vence ${ddmm(vence)} (dia ${dia.dia}, ${dia.origem === 'digitado' ? 'do cadastro' : 'sugerido pelas faturas'}; sem dia de fechamento)`;
  return `${nomeDoCartao}: compra de ${ddmm(compra)} ${naFatura} · pode trocar`;
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
