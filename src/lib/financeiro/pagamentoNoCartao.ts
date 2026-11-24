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

export type ComoFoiPago = 'duplicatas' | 'avista' | 'cartao' | 'parcelado';
export const MIN_PARCELAS_DO_CARTAO = 2;
export const MAX_PARCELAS_DO_CARTAO = 24;
/**
 * NOTA-PAGTO-PARCELADO-01 (Gabriel 11/11, NF do trator: 110.000 + 4 × 25.000 por PIX) — "Parcelado (boleto, PIX, transferência, débito)":
 * as MESMAS parcelas e a MESMA grade do cartão (iguais todo mês ou livres), com a conta normal do lançamento e a forma escolhida aqui.
 * O gravador é o de sempre (`comPagamento` → `fn_parcelamento_cadastrar`): nada novo no banco.
 */
export const MIN_PARCELAS_DO_PARCELADO = 2;
export const MAX_PARCELAS_DO_PARCELADO = 120;
export const FORMAS_DO_PARCELADO: readonly string[] = ['Boleto', 'PIX', 'Transferência', 'Débito', 'Débito Automático'];
/** a grade de parcelas (cartão ou parcelado): o máximo de parcelas de cada um */
export const maxParcelasDe = (como: ComoFoiPago): number => (como === 'parcelado' ? MAX_PARCELAS_DO_PARCELADO : MAX_PARCELAS_DO_CARTAO);
/** as formas que desenham a grade de parcelas no lugar das duplicatas */
export const pagaEmGrade = (como: ComoFoiPago): boolean => como === 'cartao' || como === 'parcelado';
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
 * FIN-FORMA-CARTAO-AUTO-01 (Gabriel 17/11 07:44, D1/D2) — a FORMA pela conta, o ESPELHO do gatilho do banco `trg_00_forma_pela_conta`
 * (20261028115520), que é quem manda: saída em conta de CARTÃO é SEMPRE "Cartão de crédito", diga o que disser o operador, a nota ou o
 * fornecedor (D1); ao sair de uma conta de cartão para outra que não é, a forma volta a vazia só se era "Cartão de crédito" (D2).
 * (Era CARTAO-LANCAMENTO-01: só preenchia a vazia, e só no lançamento novo.)
 */
export function formaPelaConta(forma: string, contaEhCartao: boolean, contaAntesEraCartao = false): string {
  if (contaEhCartao) return FORMA_CARTAO_CREDITO;
  return contaAntesEraCartao && forma === FORMA_CARTAO_CREDITO ? '' : forma;
}

/**
 * CARTAO-LANCAMENTO-01 / CARTAO-VENC-FATURA-01 (Gabriel 23/11) — o VENCIMENTO pela fatura: no cartão o lançamento NASCE com o vencimento
 * da fatura em que a compra cai; só a data que o OPERADOR DIGITOU no campo fica ("pode trocar"). A data que veio de fora (a emissão da
 * nota sem duplicata, o prefill) cede à fatura — era o caso da NF 348.174 (Sendas, 17/11, Ourocard): nascia vencendo 17/11.
 */
export function vencimentoPelaFatura(atual: string, sugerida: string, operadorDigitou: boolean): string {
  if (!sugerida) return atual;
  return operadorDigitou ? atual : sugerida;
}

/**
 * CARTAO-VENC-FATURA-01 — a PARCELA k (1..N) NA FATURA k: a 1ª é a fatura da compra (`faturaDaCompra`), cada uma das seguintes vence no
 * dia V do mês seguinte. O dia que o mês não tem cai no último dele SEM arrastar os seguintes (dia 31: 28/02 e depois 31/03 — somar um
 * mês a 28/02 daria 28/03). Entrada inválida: vazio.
 */
export function faturaDaParcela(compra: string, k: number, diaVencimento: number, diaFechamento: number | null): string {
  const primeira = faturaDaCompra(compra, diaVencimento, diaFechamento);
  if (!primeira || !Number.isInteger(k) || k < 1) return '';
  return diaNoMes(somarMeses(`${primeira.slice(0, 7)}-01`, k - 1), diaVencimento);
}
/** As N faturas das parcelas (a parcela k na fatura k). */
export const faturasDasParcelas = (compra: string, n: number, diaVencimento: number, diaFechamento: number | null): string[] =>
  Array.from({ length: Math.max(0, n) }, (_, i) => faturaDaParcela(compra, i + 1, diaVencimento, diaFechamento));

/**
 * CARTAO-VENC-FATURA-01 — a compra no cartão nasce PROGRAMADA e sem data de pagamento (paga-se na fatura); o conciliado não muda.
 */
export const statusNoCartao = (status: string): string => (status === 'conciliado' ? status : 'programado');
/**
 * CARTAO-VENC-FATURA-01 — a importação (Excel) que CRIA numa conta de cartão: o vencimento da planilha manda; sem ele, a fatura em que a
 * competência cai; sem dias do cartão, nada (vazio, como hoje).
 */
export function vencimentoDaImportacaoNoCartao(vencimentoDaPlanilha: string | null | undefined, competencia: string | null | undefined, dias: DiasDaFatura | null): string | null {
  if (vencimentoDaPlanilha) return vencimentoDaPlanilha;
  if (!dias?.vencimento || !competencia) return vencimentoDaPlanilha ?? null;
  return faturaDaCompra(competencia, dias.vencimento.dia, dias.fechamento) || null;
}
/** O cadastro das contas (Cadastros › Contas bancárias) numa aba nova: o lançamento aberto não se perde. */
export const LINK_DO_CADASTRO_DAS_CONTAS = '/?secao=contas-bancarias';

/** Os dias que o cartão usa para achar a fatura: o vencimento (digitado manda; vazio, o das faturas) e o fechamento digitado. */
export interface DiasDaFatura { vencimento: { dia: number; origem: 'digitado' | 'faturas' } | null; fechamento: number | null; aviso: string | null }
/**
 * CARTAO-VENC-FATURA-01 — UMA leitura para toda porta (Novo, + Da nota, Parcelar este lançamento, importação): junta o cadastro do cartão
 * (`diasCadastradosDoCartao`) e as faturas (`diasDoCartao`). Sem fechamento ou sem vencimento no cadastro: o AVISO pequeno (a tela põe o
 * link para o cadastro); o vencimento ainda sai das faturas, como sugestão.
 */
export function diasDaFatura(cadastro: { fechamento: number | null; vencimento: number | null }, faturas: readonly DiaDoCartao[]): DiasDaFatura {
  const faltam = [cadastro.fechamento == null ? 'fechamento' : null, cadastro.vencimento == null ? 'vencimento' : null].filter((x): x is string => x !== null);
  const aviso = faltam.length === 0 ? null
    : `Cartão sem dia de ${faltam.join(' e de ')} no cadastro: o vencimento ${faltam.includes('vencimento') ? 'não sai do cadastro' : 'não sabe em qual fatura cai a compra do fim do mês'}.`;
  return { vencimento: diaDoVencimentoDoCartao(cadastro.vencimento, faturas), fechamento: cadastro.fechamento, aviso };
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

/**
 * CARTAO-VENC-FATURA-01 (mock aprovado 23/11 13:38) — o conteúdo do ⓘ "pela fatura do cartão" (o ciclo nunca vira bloco na tela):
 * "Por que 16/12? A compra é de 17/11, depois do fechamento de 05/11 → entra na fatura que fecha em 05/12 e vence em 16/12." e, no
 * parcelado, as N datas (parcela k na fatura k). Sem dia de fechamento, diz que o dia é o do vencimento no mês seguinte. Entrada inválida: vazio.
 */
export function porQueOVencimento(compra: string, dia: { dia: number; origem: 'digitado' | 'faturas' }, diaFechamento: number | null, parcelas = 1): string {
  const vence = faturaDaCompra(compra, dia.dia, diaFechamento);
  if (!vence) return '';
  const dd = (x: string) => `${x.slice(8, 10)}/${x.slice(5, 7)}/${x.slice(0, 4)}`;
  let porque: string;
  if (diaFechamento == null) {
    porque = `Por que ${ddmm(vence)}? Sem dia de fechamento no cadastro: vence no dia ${dia.dia} (${dia.origem === 'digitado' ? 'do cadastro' : 'sugerido pelas faturas'}) do mês seguinte à compra de ${ddmm(compra)}.`;
  } else {
    const fecha = fechamentoDaCompra(compra, diaFechamento);
    const anterior = diaNoMes(somarMeses(`${fecha.slice(0, 7)}-01`, -1), diaFechamento);
    const quando = compra === anterior ? `no dia do fechamento (${ddmm(anterior)}), que já é da fatura seguinte`
      : `depois do fechamento de ${ddmm(anterior)}`;
    porque = `Por que ${ddmm(vence)}? A compra é de ${ddmm(compra)}, ${quando} → entra na fatura que fecha em ${ddmm(fecha)} e vence em ${ddmm(vence)}.`;
  }
  if (!(parcelas >= 2)) return porque;
  const datas = faturasDasParcelas(compra, parcelas, dia.dia, diaFechamento);
  return `${porque} Parcelado em ${parcelas}×: ${datas.map((x, i) => (i === 0 ? `parcela 1 vence ${dd(x)}` : `${i + 1} em ${dd(x)}`)).join(' · ')}.`;
}

/** "Elo" de "Cartão Elo" — o rótulo curto da sugestão. */
export const nomeCurtoDoCartao = (nome: string) => nome.replace(/^\s*cart[ãa]o\s+/i, '').trim() || nome;
export const rotuloDaSugestao = (nomeDoCartao: string, dia: number) => `1ª fatura · sugerido (${nomeCurtoDoCartao(nomeDoCartao)}, dia ${dia})`;

/** As N parcelas iguais, todo mês no mesmo dia, pelo arredondamento do Novo lançamento › Parcelada (a última absorve a sobra). */
export function parcelasDoCartao(totalCent: number, n: number, primeira: string, max: number = MAX_PARCELAS_DO_CARTAO, diaDaFatura: number | null = null): DuplicataNFe[] {
  if (!(n >= MIN_PARCELAS_DO_CARTAO && n <= max) || !/^\d{4}-\d{2}-\d{2}$/.test(primeira) || !(totalCent > 0)) return [];
  /* CARTAO-VENC-FATURA-01 — com o dia da fatura, a parcela k vence no dia dele no mês k (a 1ª cortada no fim do mês não corta as outras) */
  const dia = diaDaFatura != null && diaDaFatura >= 1 && diaDaFatura <= 31 ? diaDaFatura : null;
  return preverParcelas(totalCent / 100, n, primeira).map((x, i) => ({ numero: String(x.numero),
    vencimento: dia ? diaNoMes(somarMeses(`${primeira.slice(0, 7)}-01`, i), dia) : x.dataVencimento, valorCent: Math.round(x.valor * 100) }));
}

/**
 * A nota COMO FOI PAGA — a proposta que vai para a gravação, a busca e o Novo lançamento:
 *   duplicatas = a da nota, intocada · à vista = sem duplicatas (um lançamento, o vencimento escolhido) ·
 *   cartão / parcelado = as parcelas escolhidas no lugar das duplicatas (o valor = a soma delas; mensal se cabem no parcelamento de hoje,
 *   senão livres); no parcelado a FORMA escolhida (boleto, PIX…) entra no lugar da do XML.
 */
export function comPagamento(d: DoXml, como: ComoFoiPago, parcelas: readonly DuplicataNFe[] = [], forma = ''): DoXml {
  if (como === 'duplicatas') return d;
  const p = d.proposta;
  if (como === 'avista') return { ...d, proposta: { ...p, duplicatas: [], parcelamento: { tipo: 'unico', vencimento: '' } } };
  const lista = [...parcelas];
  const somaCent = lista.reduce((s, x) => s + x.valorCent, 0);
  const parcelamento: ParcelamentoProposto = duplicatasCabemNoParcelamentoDeHoje(lista)
    ? { tipo: 'parcelado', parcelas: lista.length, primeiroVencimento: lista[0]?.vencimento ?? '' }
    : { tipo: 'livres', parcelas: lista.length };
  const formaPagamento = como === 'parcelado' && forma ? forma : p.formaPagamento;
  return { ...d, proposta: { ...p, duplicatas: lista, valorCent: somaCent, parcelamento, formaPagamento } };
}

/** O rodapé com o cartão: "O PDF fica anexado às 4 parcelas como a NF 778.618 · 4 saídas no Cartão Elo, uma em cada fatura." */
export const fraseDoRodapeDoCartao = (origem: 'PDF' | 'XML', n: number, nf: string, cartao: string) =>
  `O ${origem} fica anexado às ${n} parcelas como a NF ${nf} · ${n} saídas no ${cartao}, uma em cada fatura.`;
