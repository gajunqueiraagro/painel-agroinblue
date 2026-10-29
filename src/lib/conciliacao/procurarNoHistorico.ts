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
  banco: string | null;
  descricao: string | null;
  fornecedorId: string | null;
  fornecedor: string | null;
  planoContaId: string | null;
  centro: string | null;
  subcentro: string | null;
  fazendaId: string | null;
  fazenda: string | null;
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
