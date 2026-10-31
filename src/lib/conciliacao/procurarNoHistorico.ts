/**
 * P153 (CONC-HISTORICO-01) — a parte pura do "Procurar no histórico": ler a resposta da `fn_conciliacao_historico_buscar` sem confiar
 * no formato, a frase da faixa amarela e o MODELO do "Criar igual".
 * ⚠ O MODELO SÓ ENTRA NO `prefill` do Criar de hoje (`CriarLancamentoDaLinha`): nada é gravado sem o Salvar, e o lançamento nasce
 *   casado pelo caminho de sempre. Valor, data e conta continuam os do MOVIMENTO (travados), nunca os do achado.
 */
import { normalizarParaBusca } from '@/lib/texto/busca';
import { dataBR } from '@/lib/datas/dataBR';

export type OndeProcurar = 'banco' | 'descricao' | 'fornecedor';
export const ONDE_TODOS: readonly OndeProcurar[] = ['banco', 'descricao', 'fornecedor'];

export interface AchadoDoHistorico {
  lancamentoId: string;
  dataPagamento: string | null;
  /** P153b — a busca acha TODOS os status: Comp. · Venc. · Status e o vínculo vivo com extrato */
  dataVencimento: string | null;
  dataCompetencia: string | null;
  status: string | null;
  conciliado: boolean;
  banco: string | null;
  descricao: string | null;
  fornecedorId: string | null;
  fornecedor: string | null;
  planoContaId: string | null;
  centro: string | null;
  subcentro: string | null;
  fazendaId: string | null;
  fazenda: string | null;
  /** P153b — a coluna Faz. mostra o CÓDIGO (ex.: PUR); o nome vai no `title` */
  fazendaCodigo: string | null;
  contaId: string | null;
  conta: string | null;
  valor: number;
  onde: OndeProcurar[];
}

export interface ResumoDoHistorico { fornecedorId: string; fornecedor: string; vezes: number; desde: string | null }

export interface ResultadoDoHistorico { total: number; achados: AchadoDoHistorico[]; resumo: ResumoDoHistorico | null }

/** O que o "Criar igual" leva ao formulário do Criar. */
export interface ModeloDoHistorico {
  favorecido_id?: string;
  plano_conta_id?: string;
  subcentro?: string;
  centro_custo?: string;
  fazenda_id?: string;
  descricao?: string;
}

const ehObjeto = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const texto = (v: unknown): string | null => (typeof v === 'string' && v !== '' ? v : null);
const numero = (v: unknown): number => (typeof v === 'number' ? v : typeof v === 'string' && v.trim() !== '' && Number.isFinite(Number(v)) ? Number(v) : 0);
const ehOnde = (v: unknown): v is OndeProcurar => v === 'banco' || v === 'descricao' || v === 'fornecedor';

/** A resposta da RPC → o resultado; formato inesperado = `null` (a tela diz "Não consegui procurar", nunca "nada achado"). */
export function lerResultado(data: unknown): ResultadoDoHistorico | null {
  if (!ehObjeto(data) || !Array.isArray(data.achados)) return null;
  const achados: AchadoDoHistorico[] = [];
  for (const a of data.achados) {
    if (!ehObjeto(a)) return null;
    const id = texto(a.lancamento_id);
    if (!id) return null;
    achados.push({
      lancamentoId: id, dataPagamento: texto(a.data_pagamento), banco: texto(a.banco), descricao: texto(a.descricao),
      dataVencimento: texto(a.data_vencimento), dataCompetencia: texto(a.data_competencia), status: texto(a.status_transacao),
      conciliado: a.conciliado === true, fazendaCodigo: texto(a.fazenda_codigo),
      fornecedorId: texto(a.fornecedor_id), fornecedor: texto(a.fornecedor), planoContaId: texto(a.plano_conta_id),
      centro: texto(a.centro), subcentro: texto(a.subcentro), fazendaId: texto(a.fazenda_id), fazenda: texto(a.fazenda),
      contaId: texto(a.conta_bancaria_id), conta: texto(a.conta), valor: numero(a.valor),
      onde: Array.isArray(a.onde) ? a.onde.filter(ehOnde) : [],
    });
  }
  const r = data.resumo;
  const resumo = ehObjeto(r) && texto(r.fornecedor_id) && texto(r.fornecedor)
    ? { fornecedorId: texto(r.fornecedor_id) ?? '', fornecedor: texto(r.fornecedor) ?? '', vezes: numero(r.vezes), desde: texto(r.desde) }
    : null;
  return { total: Math.max(numero(data.total), achados.length), achados, resumo };
}

/**
 * A faixa amarela: o nome que o banco escreve NÃO é o do fornecedor que o histórico mostra (o banco corta, abrevia ou usa a razão
 * social) — "o banco escreve X; o fornecedor costuma ser Y (N vezes desde dd/mm/aaaa)". Nome contido no fornecedor = sem faixa.
 */
export function fraseDaFaixa(termo: string, resumo: ResumoDoHistorico | null): string | null {
  const t = normalizarParaBusca(termo);
  if (!resumo || !t) return null;
  if (normalizarParaBusca(resumo.fornecedor).includes(t)) return null;
  const vezes = `${resumo.vezes} ${resumo.vezes === 1 ? 'vez' : 'vezes'}`;
  return `O banco escreve "${termo.trim()}"; o fornecedor costuma ser ${resumo.fornecedor} (${vezes}${resumo.desde ? ` desde ${dataBR(resumo.desde)}` : ''}).`;
}

/** O achado → o modelo do Criar. Só o que ensina a classificação: fornecedor, subcentro (a conta do plano), fazenda e descrição. */
export function modeloDoAchado(a: AchadoDoHistorico): ModeloDoHistorico {
  return {
    favorecido_id: a.fornecedorId ?? undefined,
    plano_conta_id: a.planoContaId ?? undefined,
    subcentro: a.subcentro ?? undefined,
    centro_custo: a.centro ?? undefined,
    fazenda_id: a.fazendaId ?? undefined,
    descricao: a.descricao ?? undefined,
  };
}

/** "N achados" (ou "50 de N achados" quando a RPC cortou no limite). */
export function contagemDosAchados(r: ResultadoDoHistorico): string {
  const n = r.total;
  if (r.achados.length < n) return `${r.achados.length} de ${n} achados`;
  return `${n} ${n === 1 ? 'achado' : 'achados'}`;
}

/* ─── P153b (Gabriel 29/10): o que cada linha oferece, a ordem e o período ─────────────────────────────────────────────── */

const EM_ABERTO = new Set(['previsto', 'programado', 'agendado']);

/** Em aberto = previsto/programado/agendado e sem pagamento. Só ele se CASA; o resto serve de modelo ("Criar igual"). */
export const emAberto = (a: AchadoDoHistorico): boolean => EM_ABERTO.has((a.status ?? '').toLowerCase()) && !a.dataPagamento;

/** A conta do achado não é a do extrato (as duas conhecidas). Sem conta no lançamento não é "outra": o casar de hoje a preenche. */
export const outraConta = (a: AchadoDoHistorico, contaDoExtrato: string | null | undefined): boolean =>
  !!a.contaId && !!contaDoExtrato && a.contaId !== contaDoExtrato;

export type AcaoDoAchado = 'casar' | 'casar_trocando_conta' | 'criar_igual';

/**
 * A ação da linha (D3, Gabriel 29/10): em aberto da MESMA conta (ou sem conta) = "Casar"; em aberto de OUTRA conta = "Casar e trocar a
 * conta" (a `fn_espelho_casar` com `trocar_conta`, numa transação); pago/conciliado = "Criar igual" (de outra conta, com o selo "outra
 * conta" — nunca casa). Sem quem case (a estação), tudo é "Criar igual", como antes.
 */
export function acaoDoAchado(a: AchadoDoHistorico, contaDoExtrato: string | null | undefined, podeCasar: boolean): AcaoDoAchado {
  if (!podeCasar || !emAberto(a)) return 'criar_igual';
  return outraConta(a, contaDoExtrato) ? 'casar_trocando_conta' : 'casar';
}

/** A data de referência: o pagamento, ou o vencimento de quem não foi pago (a mesma da `fn_conciliacao_historico_buscar`). */
export const dataDeReferencia = (a: AchadoDoHistorico): string | null => a.dataPagamento ?? a.dataVencimento;

export type ColunaDoHistorico = 'comp' | 'venc' | 'pgto' | 'descricao' | 'fornecedor' | 'subcentro' | 'fazenda' | 'conta' | 'valor' | 'status';
export interface OrdemDoHistorico { coluna: ColunaDoHistorico | 'data'; sentido: 'asc' | 'desc' }
/** A ordem padrão: a data mais recente primeiro (a de referência). */
export const ORDEM_PADRAO: OrdemDoHistorico = { coluna: 'data', sentido: 'desc' };

function chave(a: AchadoDoHistorico, c: OrdemDoHistorico['coluna']): string | number | null {
  switch (c) {
    case 'data': return dataDeReferencia(a);
    case 'comp': return a.dataCompetencia;
    case 'venc': return a.dataVencimento;
    case 'pgto': return a.dataPagamento;
    case 'descricao': return a.descricao ? normalizarParaBusca(a.descricao) : null;
    case 'fornecedor': return a.fornecedor ? normalizarParaBusca(a.fornecedor) : null;
    case 'subcentro': return a.subcentro ? normalizarParaBusca(a.subcentro) : null;
    case 'fazenda': return a.fazendaCodigo ?? (a.fazenda ? normalizarParaBusca(a.fazenda) : null);
    case 'conta': return a.conta ? normalizarParaBusca(a.conta) : null;
    case 'valor': return a.valor;
    case 'status': return a.conciliado ? 'conciliado' : (a.status ?? null);
  }
}

/** Ordena pela coluna; o vazio vai sempre para o fim (nos dois sentidos); empate fica na ordem de chegada. Não muda a lista de entrada. */
export function ordenarAchados(lista: readonly AchadoDoHistorico[], ordem: OrdemDoHistorico): AchadoDoHistorico[] {
  const sinal = ordem.sentido === 'asc' ? 1 : -1;
  return lista.map((a, i) => ({ a, i, k: chave(a, ordem.coluna) })).sort((x, y) => {
    if (x.k == null && y.k == null) return x.i - y.i;
    if (x.k == null) return 1;
    if (y.k == null) return -1;
    const d = typeof x.k === 'number' && typeof y.k === 'number' ? x.k - y.k : String(x.k).localeCompare(String(y.k), 'pt-BR');
    return d !== 0 ? d * sinal : x.i - y.i;
  }).map((x) => x.a);
}

/** Clicar no cabeçalho: a mesma coluna inverte; outra coluna começa descendo nas datas e no valor, subindo nos textos. */
export function proximaOrdem(atual: OrdemDoHistorico, coluna: ColunaDoHistorico): OrdemDoHistorico {
  if (atual.coluna === coluna) return { coluna, sentido: atual.sentido === 'asc' ? 'desc' : 'asc' };
  const desce = coluna === 'comp' || coluna === 'venc' || coluna === 'pgto' || coluna === 'valor';
  return { coluna, sentido: desce ? 'desc' : 'asc' };
}

/** O "até" da busca (Gabriel, 30/10): o fim do MÊS SEGUINTE ao do extrato — acha o em aberto que vence depois do movimento. */
export function fimDoMesSeguinte(dataISO: string | null | undefined): string | null {
  if (!dataISO || !/^\d{4}-\d{2}/.test(dataISO)) return null;
  const ano = Number(dataISO.slice(0, 4)); const mes = Number(dataISO.slice(5, 7));
  const fim = new Date(Date.UTC(ano, mes + 1, 0));
  return fim.toISOString().slice(0, 10);
}

