/**
 * useImportacaoExtrato — orquestra import OFX/CSV de extrato bancário.
 *
 * Fluxo:
 *   1. `gerarPreview({ arquivo, contaBancariaId })`
 *      - Detecta formato pelo nome/conteúdo (.ofx / .csv).
 *      - Roda parser (`parseOFX` ou `parseCSV`).
 *      - Calcula `hash_movimento` para cada movimento.
 *      - Consulta `extrato_bancario_v2` por cliente_id + hashes para marcar duplicados.
 *      - Devolve preview com totais e flag `duplicado` por linha.
 *
 *   2. `confirmarImportacao({ contaBancariaId, nomeArquivo, formato })`
 *      - Cria cabeçalho em `financeiro_importacoes_v2` (tipo='OFX'|'CSV', totais).
 *      - Insere apenas os NÃO-duplicados em `extrato_bancario_v2`, em batches de 500.
 *      - Status inicial dos movimentos: 'nao_conciliado'.
 *      - NÃO cria nada em `financeiro_lancamentos_v2`.
 *      - NÃO faz matching automático.
 *
 * Erros são propagados via `error` state e exception.
 */
import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useCliente } from '@/contexts/ClienteContext';
import { useFazenda } from '@/contexts/FazendaContext';
import { parseOFX, type MovimentoBruto } from '@/lib/financeiro/parser/parseOFX';
import { parseCSV } from '@/lib/financeiro/parser/parseCSV';
import { hashMovimento } from '@/lib/financeiro/extratoHash';

export interface MovimentoPreview extends MovimentoBruto {
  hash: string;
  /** Já existe em extrato_bancario_v2 (mesmo cliente, mesmo hash). */
  duplicado: boolean;
  /** Score 0-100 do melhor candidato em financeiro_lancamentos_v2 (apenas visual). */
  scoreMatch: number;
  /** Sinal de match: scoreMatch >= 50 (1:1 ou agrupado). */
  matchEncontrado: boolean;
  /** id do lançamento candidato 1:1 (null em match agrupado). */
  lancamentoMatchId: string | null;
  /** Nome do fornecedor do candidato 1:1, se houver. */
  fornecedorMatch: string | null;
  /** Descrição do candidato 1:1. */
  descricaoMatch: string | null;
  /** Status do lançamento candidato 1:1 ('realizado'|'agendado'|'programado'|null). */
  statusMatch: string | null;

  /** Match composto por vários lançamentos (N:N). */
  matchAgrupado: boolean;
  /** Quantidade de lançamentos no grupo (0 quando não agrupado). */
  quantidadeItensMatch: number;
  /** Soma absoluta dos valores do grupo (deve bater com |valor| do extrato). */
  valorSomado: number;
  /** Ids dos lançamentos que compõem o grupo. */
  lancamentosIds: string[];
  /** Detalhes para auditoria visual (tooltip/expand). */
  detalhesAgrupados: LancamentoAgrupadoInfo[];
  /** Top-10 candidatos sugeridos para escolha manual (mesmo se score baixo). */
  candidatosPossiveis: CandidatoPossivel[];
}

export interface LancamentoAgrupadoInfo {
  id: string;
  data: string | null;
  fornecedor: string | null;
  descricao: string | null;
  valor: number;        // signed (negativo = saída)
  macroCusto: string | null;
  grupoCusto: string | null;
  /** Status atual do lançamento (para decidir se converte). */
  statusTransacao: string | null;
}

/** Candidato sugerido para movimentos sem match automático (ranking heurístico). */
export interface CandidatoPossivel {
  id: string;
  data: string | null;
  fornecedor: string | null;
  descricao: string | null;
  valor: number;        // signed
  statusTransacao: string | null;
  diffValor: number;    // |valor lanc| - |valor mov|
  diffDias: number;     // |data lanc - data mov| em dias
  numeroDocumento: string | null;
}

export interface PreviewResult {
  movimentos: MovimentoPreview[];
  totalLinhas: number;
  novos: number;
  duplicados: number;
  /** Movimentos NOVOS resolvidos por match 1:1 (score >= 50, sem composição). */
  matchDireto: number;
  /** Movimentos NOVOS resolvidos via composição (subset). */
  matchAgrupados: number;
  /** Movimentos NOVOS sem qualquer match (score < 50). */
  semMatch: number;
  formato: 'OFX' | 'CSV';
}

export interface ConfirmarParams {
  contaBancariaId: string;
  nomeArquivo: string;
  formato: 'OFX' | 'CSV';
}

function detectarFormato(nomeArquivo: string, conteudo: string): 'OFX' | 'CSV' | null {
  const lower = nomeArquivo.toLowerCase();
  if (lower.endsWith('.ofx') || /<OFX>/i.test(conteudo)) return 'OFX';
  if (lower.endsWith('.csv') || lower.endsWith('.txt')) return 'CSV';
  return null;
}

function addDays(iso: string, n: number): string {
  const d = new Date(iso + 'T00:00:00');
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
}

function diasEntre(a: string, b: string): number {
  const d1 = new Date(a + 'T00:00:00').getTime();
  const d2 = new Date(b + 'T00:00:00').getTime();
  return Math.round((d1 - d2) / 86400000);
}

function normalizarTexto(s: string | null | undefined): string {
  return (s ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toUpperCase();
}

interface LancamentoCandidato {
  id: string;
  data_pagamento: string | null;
  valor: number;
  sinal: number;
  descricao: string | null;
  favorecido_id: string | null;
  macro_custo: string | null;
  grupo_custo: string | null;
  status_transacao: string | null;
  numero_documento: string | null;
}

/**
 * Score 0-100 de match entre movimento do extrato e lançamento financeiro.
 * Pré-condição: |valor| do extrato == |valor| do lançamento (tol 0.01).
 *   - 70 pontos: valor exato
 *   - +20:        diferença de data ≤ 3 dias
 *   - +10:        descrição/fornecedor similar
 */
function calcularScore(
  movDataISO: string,
  movDescricao: string,
  lanc: LancamentoCandidato,
  fornNome: string | null,
): number {
  let score = 70;
  if (lanc.data_pagamento) {
    const diff = Math.abs(diasEntre(movDataISO, lanc.data_pagamento));
    if (diff <= 3) score += 20;
  }
  const movN = normalizarTexto(movDescricao);
  const lancN = normalizarTexto(lanc.descricao);
  const fornN = normalizarTexto(fornNome);
  if (movN && (
    (lancN && (movN.includes(lancN) || lancN.includes(movN))) ||
    (fornN && movN.includes(fornN))
  )) {
    score += 10;
  }
  return score;
}

/**
 * Heurística gulosa para encontrar combinação de até `maxItens` lançamentos
 * cuja soma de |valor| seja ≈ `target` (tol 0.05).
 *
 * Estratégia:
 *   - Pool ordenado por proximidade da data do movimento (heurística forte).
 *   - DFS limitado por profundidade e tempo (timeoutMs).
 *   - Poda: candidatos cujo |valor| > restante+0.05 são pulados.
 *   - Quando encontra solução, mantém a com MENOS itens (ties: mais próxima da data).
 *
 * Retorna `null` se não houver combinação viável dentro do orçamento.
 */
interface GrupoEncontrado {
  itens: LancamentoCandidato[];
  somaAbs: number;
}
function tryGroupingMatch(
  target: number,
  pool: LancamentoCandidato[],
  movDataISO: string,
  maxItens: number,
  timeoutMs: number,
): GrupoEncontrado | null {
  if (pool.length === 0 || target <= 0) return null;

  // Ordena por proximidade da data — primeiros são candidatos mais prováveis.
  const ordenado = [...pool].sort((a, b) => {
    const da = a.data_pagamento ? Math.abs(diasEntre(movDataISO, a.data_pagamento)) : 999;
    const db = b.data_pagamento ? Math.abs(diasEntre(movDataISO, b.data_pagamento)) : 999;
    return da - db;
  });

  const start = Date.now();
  let melhor: GrupoEncontrado | null = null;
  const atual: LancamentoCandidato[] = [];

  function dfs(startIdx: number, restante: number, depth: number) {
    if (Date.now() - start > timeoutMs) return;
    if (Math.abs(restante) < 0.05) {
      if (melhor === null || atual.length < melhor.itens.length) {
        const somaAbs = target - restante; // = soma acumulada dos itens
        melhor = { itens: [...atual], somaAbs: Math.abs(somaAbs) };
      }
      return;
    }
    if (depth >= maxItens) return;
    if (restante < -0.05) return; // ultrapassou demais
    // Poda: se já temos solução com K itens, parar quando atual.length+1 >= K
    if (melhor !== null && atual.length + 1 >= melhor.itens.length) return;

    for (let i = startIdx; i < ordenado.length; i++) {
      if (Date.now() - start > timeoutMs) return;
      const v = Math.abs(Number(ordenado[i].valor) || 0);
      if (v > restante + 0.05) continue;
      atual.push(ordenado[i]);
      dfs(i + 1, restante - v, depth + 1);
      atual.pop();
    }
  }

  dfs(0, target, 0);
  return melhor;
}

/**
 * Score para match agrupado. Teto = 89 (nunca supera match 1:1 max=100).
 *
 * Bônus:
 *   +20 — Δ data média do grupo até a data do movimento ≤ 3 dias
 *   +10 — >50% dos itens têm fornecedor/descrição similar ao movimento
 *   +10 — todos os itens compartilham mesma `macro_custo` (coerência)
 *   +10 — span (max-min) entre datas do grupo ≤ 3 dias (compactness)
 *
 * Penalidades:
 *   -10 — grupo com > 5 itens (preferir grupos pequenos)
 *   -10 — múltiplas macros (mistura de naturezas)
 *    -5 — span > 7 dias entre as datas do grupo
 *
 * Base = 50. Após bônus/penalidades, teto duro em 89.
 */
function calcularScoreAgrupado(
  movDataISO: string,
  movDescricao: string,
  itens: LancamentoCandidato[],
  fornByLancId: Map<string, string>,
): number {
  if (itens.length === 0) return 0;
  let score = 50;

  // ── Δ data média ──
  const datas = itens.map((l) => l.data_pagamento).filter((d): d is string => !!d);
  let span = 0;
  if (datas.length > 0) {
    const ts = datas.map((d) => new Date(d + 'T00:00:00').getTime());
    const mediaTs = ts.reduce((s, x) => s + x, 0) / ts.length;
    const movTs = new Date(movDataISO + 'T00:00:00').getTime();
    const diasMedios = Math.abs((mediaTs - movTs) / 86400000);
    if (diasMedios <= 3) score += 20;
    span = (Math.max(...ts) - Math.min(...ts)) / 86400000;
  }

  // ── descrição/fornecedor similar ──
  const movN = normalizarTexto(movDescricao);
  if (movN) {
    let similares = 0;
    for (const l of itens) {
      const lancN = normalizarTexto(l.descricao);
      const fornN = normalizarTexto(l.favorecido_id ? fornByLancId.get(l.id) ?? null : null);
      if ((lancN && (movN.includes(lancN) || lancN.includes(movN))) ||
          (fornN && movN.includes(fornN))) {
        similares++;
      }
    }
    if (similares / itens.length > 0.5) score += 10;
  }

  // ── coerência de macro_custo ──
  const macros = new Set(itens.map((l) => l.macro_custo).filter((m): m is string => !!m));
  if (macros.size === 1) score += 10;
  if (macros.size > 1) score -= 10;

  // ── compactness das datas ──
  if (datas.length > 0) {
    if (span <= 3) score += 10;
    else if (span > 7) score -= 5;
  }

  // ── tamanho do grupo ──
  if (itens.length > 5) score -= 10;

  return Math.max(0, Math.min(89, score));
}

export function useImportacaoExtrato() {
  const { clienteAtual } = useCliente();
  const { fazendaAtual } = useFazenda();
  const [preview, setPreview] = useState<PreviewResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function gerarPreview(params: {
    arquivo: File;
    contaBancariaId: string;
  }): Promise<PreviewResult> {
    setLoading(true);
    setError(null);
    try {
      if (!clienteAtual?.id) throw new Error('Cliente não selecionado');
      const conteudo = await params.arquivo.text();
      const formato = detectarFormato(params.arquivo.name, conteudo);
      if (!formato) throw new Error('Formato não reconhecido (espera-se .ofx ou .csv)');

      const movimentosBrutos = formato === 'OFX' ? parseOFX(conteudo) : parseCSV(conteudo);
      if (movimentosBrutos.length === 0) {
        throw new Error('Nenhum movimento encontrado no arquivo');
      }

      // Calcular hashes em paralelo.
      const movimentosComHash = await Promise.all(
        movimentosBrutos.map(async (m) => ({
          ...m,
          hash: await hashMovimento({
            contaBancariaId: params.contaBancariaId,
            dataISO: m.data,
            valor: m.valor,
            descricao: m.descricao,
            documento: m.documento ?? '',
          }),
        })),
      );

      // Consultar duplicatas em uma única query.
      const hashes = movimentosComHash.map((m) => m.hash);
      const { data: existentes, error: errSel } = await supabase
        .from('extrato_bancario_v2' as any)
        .select('hash_movimento')
        .eq('cliente_id', clienteAtual.id)
        .in('hash_movimento', hashes);
      if (errSel) throw errSel;
      const dupSet = new Set((existentes as unknown as { hash_movimento: string }[] ?? []).map((r) => r.hash_movimento));

      // ── Match financeiro: buscar candidatos em financeiro_lancamentos_v2 ──
      // Range de datas amplo (±10 dias para cobrir 1:1 e composição N:N).
      const datas = movimentosComHash.map((m) => m.data).sort();
      const dataMin = datas[0];
      const dataMax = datas[datas.length - 1];
      const fetchIni = addDays(dataMin, -10);
      const fetchFim = addDays(dataMax, +10);

      // Inclui agendado/programado para permitir conversão assistida via OFX.
      // Exclui cenário META — não é alvo de conciliação.
      const { data: lancsRaw } = await supabase
        .from('financeiro_lancamentos_v2')
        .select('id, data_pagamento, valor, sinal, descricao, favorecido_id, conta_bancaria_id, conta_destino_id, macro_custo, grupo_custo, status_transacao, numero_documento, cenario')
        .eq('cliente_id', clienteAtual.id)
        .eq('cancelado', false)
        .neq('cenario', 'meta')
        .in('status_transacao', ['realizado', 'agendado', 'programado'])
        .or(`conta_bancaria_id.eq.${params.contaBancariaId},conta_destino_id.eq.${params.contaBancariaId}`)
        .gte('data_pagamento', fetchIni)
        .lte('data_pagamento', fetchFim);

      const lancs = (lancsRaw ?? []) as unknown as LancamentoCandidato[];

      // Carregar nomes de fornecedores referenciados (uma query agregada).
      const favIds = Array.from(
        new Set(lancs.map((l) => l.favorecido_id).filter((x): x is string => !!x)),
      );
      const fornMap = new Map<string, string>();
      if (favIds.length > 0) {
        const { data: forns } = await supabase
          .from('financeiro_fornecedores')
          .select('id, nome')
          .in('id', favIds);
        for (const f of (forns ?? []) as { id: string; nome: string }[]) {
          fornMap.set(f.id, f.nome);
        }
      }

      // Mapa lancId → nomeFornecedor (para score agrupado consultar por l.id).
      const fornByLancId = new Map<string, string>();
      for (const l of lancs) {
        if (l.favorecido_id) {
          const nome = fornMap.get(l.favorecido_id);
          if (nome) fornByLancId.set(l.id, nome);
        }
      }

      // Para cada movimento:
      //   1) tentar match 1:1 (|valor| igual, data ±7d, score ≥ 50);
      //   2) se falhar, tentar composição (subset, até 8 itens, ±10 dias, sinal compatível, timeout 200ms).
      const movimentos: MovimentoPreview[] = movimentosComHash.map((m) => {
        const valorMov = Math.abs(m.valor);

        // ── 1) tentativa 1:1 ──
        let melhor: LancamentoCandidato | null = null;
        let melhorScore = 0;
        for (const l of lancs) {
          if (Math.abs(Math.abs(Number(l.valor) || 0) - valorMov) > 0.01) continue;
          if (!l.data_pagamento) continue;
          if (Math.abs(diasEntre(m.data, l.data_pagamento)) > 7) continue;
          const fornNome = l.favorecido_id ? fornMap.get(l.favorecido_id) ?? null : null;
          const s = calcularScore(m.data, m.descricao, l, fornNome);
          if (s > melhorScore) {
            melhorScore = s;
            melhor = l;
          }
        }
        const fornecedorMatch = melhor?.favorecido_id ? fornMap.get(melhor.favorecido_id) ?? null : null;

        // Top-10 candidatos sugeridos (ranking por valor próximo, data, similaridade).
        // Útil tanto para "Ver possíveis" (sem match) quanto para revisar matches fracos.
        const sinalEsperado = m.tipo === 'credito' ? 1 : -1;
        const movN = normalizarTexto(m.descricao);
        const candidatosPossiveis: CandidatoPossivel[] = lancs
          .filter((l) => {
            if (!l.data_pagamento) return false;
            const dDiff = Math.abs(diasEntre(m.data, l.data_pagamento));
            if (dDiff > 10) return false;
            const sinalLanc = (Number(l.sinal) || 0) >= 0 ? 1 : -1;
            return sinalLanc === sinalEsperado;
          })
          .map((l) => {
            const valorL = Math.abs(Number(l.valor) || 0);
            const diffValor = Math.abs(valorL - valorMov);
            const diffDias = Math.abs(diasEntre(m.data, l.data_pagamento!));
            const fornN = normalizarTexto(l.favorecido_id ? fornMap.get(l.favorecido_id) ?? null : null);
            const lancN = normalizarTexto(l.descricao);
            const similaridade = (movN && (
              (lancN && (movN.includes(lancN) || lancN.includes(movN))) ||
              (fornN && movN.includes(fornN))
            )) ? 1 : 0;
            return { lanc: l, diffValor, diffDias, similaridade };
          })
          // ordenar: menor diff de valor → menor diff de data → maior similaridade.
          .sort((a, b) => {
            if (a.diffValor !== b.diffValor) return a.diffValor - b.diffValor;
            if (a.diffDias !== b.diffDias) return a.diffDias - b.diffDias;
            return b.similaridade - a.similaridade;
          })
          .slice(0, 10)
          .map(({ lanc: l, diffValor, diffDias }) => ({
            id: l.id,
            data: l.data_pagamento,
            fornecedor: l.favorecido_id ? fornMap.get(l.favorecido_id) ?? null : null,
            descricao: l.descricao,
            valor: (Number(l.valor) || 0) * ((Number(l.sinal) || 0) >= 0 ? 1 : -1),
            statusTransacao: l.status_transacao,
            diffValor,
            diffDias,
            numeroDocumento: l.numero_documento,
          }));

        const baseFields: Omit<MovimentoPreview, 'duplicado'> = {
          ...m,
          scoreMatch: melhorScore,
          matchEncontrado: melhorScore >= 50,
          lancamentoMatchId: melhor?.id ?? null,
          fornecedorMatch,
          descricaoMatch: melhor?.descricao ?? null,
          statusMatch: melhor?.status_transacao ?? null,
          matchAgrupado: false,
          quantidadeItensMatch: 0,
          valorSomado: 0,
          lancamentosIds: [],
          detalhesAgrupados: [],
          candidatosPossiveis,
        };

        // ── 2) tentativa de composição ──
        // Pula se já há match 1:1 forte (>85) — não vale a pena buscar grupo.
        // Pula se 1:1 já é razoável (>=50) — match direto vence agrupado por design.
        if (melhorScore < 50) {
          const sinalEsperado = m.tipo === 'credito' ? 1 : -1;
          const pool = lancs.filter((l) => {
            if (!l.data_pagamento) return false;
            if (Math.abs(diasEntre(m.data, l.data_pagamento)) > 10) return false;
            // Compatibilidade de sinal: positivo = entrada, negativo = saída
            const sinalLanc = (Number(l.sinal) || 0) >= 0 ? 1 : -1;
            return sinalLanc === sinalEsperado;
          });

          // Limita pool a 30 mais próximos da data para reduzir explosão DFS.
          const poolReduzido = pool
            .map((l) => ({ l, dist: Math.abs(diasEntre(m.data, l.data_pagamento!)) }))
            .sort((a, b) => a.dist - b.dist)
            .slice(0, 30)
            .map((x) => x.l);

          const grupo = tryGroupingMatch(valorMov, poolReduzido, m.data, 8, 200);
          if (grupo && grupo.itens.length >= 2) {
            const scoreGrupo = calcularScoreAgrupado(m.data, m.descricao, grupo.itens, fornByLancId);
            if (scoreGrupo >= 50) {
              const detalhes: LancamentoAgrupadoInfo[] = grupo.itens
                .map((l) => ({
                  id: l.id,
                  data: l.data_pagamento,
                  fornecedor: l.favorecido_id ? fornMap.get(l.favorecido_id) ?? null : null,
                  descricao: l.descricao,
                  valor: (Number(l.valor) || 0) * ((Number(l.sinal) || 0) >= 0 ? 1 : -1),
                  macroCusto: l.macro_custo,
                  grupoCusto: l.grupo_custo,
                  statusTransacao: l.status_transacao,
                }))
                .sort((a, b) => (a.data ?? '').localeCompare(b.data ?? ''));
              return {
                ...baseFields,
                duplicado: dupSet.has(m.hash),
                scoreMatch: scoreGrupo,
                matchEncontrado: true,
                lancamentoMatchId: null,
                fornecedorMatch: null,
                descricaoMatch: null,
                matchAgrupado: true,
                quantidadeItensMatch: grupo.itens.length,
                valorSomado: grupo.somaAbs,
                lancamentosIds: grupo.itens.map((x) => x.id),
                detalhesAgrupados: detalhes,
              };
            }
          }
        }

        return { ...baseFields, duplicado: dupSet.has(m.hash) };
      });

      const novos = movimentos.filter((m) => !m.duplicado);
      const result: PreviewResult = {
        movimentos,
        totalLinhas: movimentos.length,
        novos: novos.length,
        duplicados: movimentos.filter((m) => m.duplicado).length,
        matchDireto: novos.filter((m) => m.matchEncontrado && !m.matchAgrupado).length,
        matchAgrupados: novos.filter((m) => m.matchAgrupado).length,
        semMatch: novos.filter((m) => !m.matchEncontrado).length,
        formato,
      };
      setPreview(result);
      return result;
    } catch (e: any) {
      const msg = e?.message ?? String(e);
      setError(msg);
      throw e;
    } finally {
      setLoading(false);
    }
  }

  async function confirmarImportacao(params: ConfirmarParams): Promise<{
    inseridos: number;
    importacaoId: string;
  }> {
    if (!preview) throw new Error('Sem preview gerado — chame gerarPreview primeiro');
    if (!clienteAtual?.id) throw new Error('Cliente não selecionado');
    const fazendaId = fazendaAtual?.id;
    if (!fazendaId || fazendaId === '__global__') {
      throw new Error('Selecione uma fazenda específica para importar');
    }

    const novos = preview.movimentos.filter((m) => !m.duplicado);
    if (novos.length === 0) throw new Error('Nenhum movimento novo para importar');

    setLoading(true);
    setError(null);
    try {
      // 1) Cabeçalho de importação.
      const { data: imp, error: e1 } = await supabase
        .from('financeiro_importacoes_v2')
        .insert({
          cliente_id: clienteAtual.id,
          fazenda_id: fazendaId,
          conta_bancaria_id: params.contaBancariaId,
          nome_arquivo: params.nomeArquivo,
          tipo_arquivo: params.formato,
          total_linhas: preview.totalLinhas,
          total_validas: novos.length,
          total_com_erro: preview.duplicados,
          status: 'confirmada',
        } as any)
        .select('id')
        .single();
      if (e1) throw e1;
      const importacaoId = (imp as { id: string }).id;

      // 2) Insert dos movimentos em batches de 500.
      const BATCH = 500;
      let inseridos = 0;
      for (let i = 0; i < novos.length; i += BATCH) {
        const fatia = novos.slice(i, i + BATCH).map((m) => ({
          cliente_id: clienteAtual.id,
          conta_bancaria_id: params.contaBancariaId,
          importacao_id: importacaoId,
          data_movimento: m.data,
          descricao: m.descricao,
          documento: m.documento,
          valor: m.valor,
          tipo_movimento: m.tipo,
          hash_movimento: m.hash,
          status: 'nao_conciliado' as const,
        }));
        const { error: e2 } = await supabase
          .from('extrato_bancario_v2' as any)
          .insert(fatia);
        if (e2) throw e2;
        inseridos += fatia.length;
      }

      // Preserva o preview na tela: o usuário ainda vai interagir com os botões
      // por linha (Marcar realizado / Vincular / Revisar / Ver possíveis), que
      // dependem de o extrato já estar persistido (lookup por hash).
      return { inseridos, importacaoId };
    } catch (e: any) {
      const msg = e?.message ?? String(e);
      setError(msg);
      throw e;
    } finally {
      setLoading(false);
    }
  }

  function reset() {
    setPreview(null);
    setError(null);
  }

  return {
    preview,
    loading,
    error,
    gerarPreview,
    confirmarImportacao,
    reset,
  };
}
