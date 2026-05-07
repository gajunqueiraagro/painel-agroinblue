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

/** Status operacional persistido em extrato_bancario_v2.status. */
export type StatusPersistido = 'nao_conciliado' | 'parcial' | 'conciliado' | 'ignorado';

export interface MovimentoPreview extends MovimentoBruto {
  hash: string;
  /** Hash já está em extrato_bancario_v2 (apenas fato físico). */
  existeNoDB: boolean;
  /** id do registro em extrato_bancario_v2, quando existeNoDB=true. */
  extratoIdExistente: string | null;
  /** Status operacional do registro persistido (null se não existe). */
  statusPersistido: StatusPersistido | null;
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
  /**
   * Há 2+ candidatos 1:1 com score equivalente (empate estrito ≤1pt OU
   * valor+data+fornecedor idênticos). Auto-pick é DESLIGADO neste caso —
   * o usuário deve escolher manualmente. matchAmbiguo é independente de
   * matchAgrupado e nunca esconde pendência operacional.
   */
  matchAmbiguo: boolean;
  /** Candidatos top equivalentes — populado SOMENTE quando matchAmbiguo=true. */
  candidatosAmbiguos: CandidatoPossivel[];
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
  // ── Enriquecimentos para distinguir candidatos equivalentes (NF/fazenda/conta) ──
  fazenda: string | null;
  contaBancaria: string | null;
  /** |valor| original do lançamento. */
  valorOriginal: number;
  /** Soma absoluta de valor_aplicado dos vínculos existentes em conciliacao_bancaria_itens. */
  valorJaConciliado: number;
  /** valorOriginal - valorJaConciliado (limitado a 0). */
  saldoConciliar: number;
  /** valorJaConciliado > 0. */
  jaVinculadoOFX: boolean;
  /** valorJaConciliado >= valorOriginal (tolerância 0.01). */
  conciliadoIntegralmente: boolean;
}

export interface PreviewResult {
  movimentos: MovimentoPreview[];
  totalLinhas: number;
  /** Movimentos cujo hash AINDA não está no banco — alvo do "Salvar extrato". */
  novosParaSalvar: number;
  /** Total de movimentos cujo hash já existe em extrato_bancario_v2 (qualquer status). */
  existentesNoBanco: number;
  /** existeNoDB && statusPersistido='nao_conciliado'. Pendência aberta. */
  pendentes: number;
  /** existeNoDB && statusPersistido='parcial'. Parcialmente conciliado. */
  parciais: number;
  /** existeNoDB && statusPersistido='conciliado'. Já fechado. */
  conciliados: number;
  /** existeNoDB && statusPersistido='ignorado'. */
  ignorados: number;
  /**
   * Match counters — calculados sobre movimentos AINDA acionáveis
   * (não existe no DB ou status_persistido ∈ {nao_conciliado, parcial}).
   */
  matchDireto: number;
  matchAgrupados: number;
  semMatch: number;
  /** Movimentos com 2+ candidatos top equivalentes — exigem escolha manual. */
  ambiguos: number;
  formato: 'OFX' | 'CSV';
}

/**
 * Recalcula todos os agregados a partir do array de movimentos.
 *
 * Precedência absoluta: `statusPersistido` define pendência. Heurísticas
 * (`matchAgrupado`, `scoreMatch`) só contam para os contadores de match,
 * e ainda assim restritos a movimentos AINDA acionáveis. Um agrupado
 * conciliado conta apenas em `conciliados` — nunca em `pendentes` nem
 * em `matchAgrupados`.
 */
function recomputarAgregados(
  movimentos: MovimentoPreview[],
): Pick<
  PreviewResult,
  | 'novosParaSalvar' | 'existentesNoBanco' | 'pendentes' | 'parciais'
  | 'conciliados' | 'ignorados' | 'matchDireto' | 'matchAgrupados'
  | 'semMatch' | 'ambiguos'
> {
  const acionaveis = movimentos.filter(
    (m) =>
      !m.existeNoDB ||
      m.statusPersistido === 'nao_conciliado' ||
      m.statusPersistido === 'parcial',
  );
  return {
    novosParaSalvar:   movimentos.filter((m) => !m.existeNoDB).length,
    existentesNoBanco: movimentos.filter((m) =>  m.existeNoDB).length,
    // Pendente = null (não salvo) OR nao_conciliado. Conciliado/parcial/ignorado
    // NUNCA entram, mesmo que sejam agrupados.
    pendentes:         movimentos.filter((m) =>
      m.statusPersistido === null || m.statusPersistido === 'nao_conciliado'
    ).length,
    parciais:          movimentos.filter((m) => m.statusPersistido === 'parcial').length,
    conciliados:       movimentos.filter((m) => m.statusPersistido === 'conciliado').length,
    ignorados:         movimentos.filter((m) => m.statusPersistido === 'ignorado').length,
    // matchDireto exclui ambíguos — empates não contam como match único.
    matchDireto:       acionaveis.filter((m) => m.matchEncontrado && !m.matchAgrupado && !m.matchAmbiguo).length,
    matchAgrupados:    acionaveis.filter((m) => m.matchAgrupado).length,
    // semMatch exclui ambíguos — eles têm candidatos, só não há vencedor único.
    semMatch:          acionaveis.filter((m) => !m.matchEncontrado && !m.matchAmbiguo).length,
    ambiguos:          acionaveis.filter((m) => m.matchAmbiguo).length,
  };
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
  fazenda_id: string | null;
  conta_bancaria_id: string | null;
}

/** Comparação textual estrita para ambiguidade (sem incluir parcial difuso). */
function similarFornecedorEstrito(a: string | null, b: string | null): boolean {
  if (!a || !b) return false;
  const an = a
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toUpperCase();
  const bn = b
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toUpperCase();
  if (!an || !bn) return false;
  return an === bn || an.includes(bn) || bn.includes(an);
}

/**
 * Detecta empate de candidatos 1:1 — regra estrita (financeiro):
 *   ambíguo = score IGUAL ao topo OU diferença ≤ 1pt OU
 *             (mesmo valor + mesma data + fornecedor parecido).
 * Tolerância maior gera falso-ambíguo. Por isso ≤ 1, não ≤ 5.
 */
interface CandidatoComScore {
  lanc: LancamentoCandidato;
  score: number;
  fornNome: string | null;
}
function detectarAmbiguidade(
  candidatos: CandidatoComScore[],
): { scoreMax: number; empatesTop: CandidatoComScore[]; ambiguo: boolean } {
  if (candidatos.length === 0) return { scoreMax: 0, empatesTop: [], ambiguo: false };
  const sorted = [...candidatos].sort((a, b) => b.score - a.score);
  const top = sorted[0];
  if (top.score < 50) return { scoreMax: top.score, empatesTop: [], ambiguo: false };

  const empatesTop = sorted.filter((c) => {
    if (Math.abs(c.score - top.score) <= 1) return true;
    // Caso especial: scores diferentes mas valor+data+fornecedor idênticos
    const valorIgual =
      Math.abs(Math.abs(c.lanc.valor) - Math.abs(top.lanc.valor)) <= 0.01;
    const dataIgual = c.lanc.data_pagamento === top.lanc.data_pagamento;
    const fornParecido = similarFornecedorEstrito(c.fornNome, top.fornNome);
    return valorIgual && dataIgual && fornParecido;
  });

  return {
    scoreMax: top.score,
    empatesTop,
    ambiguo: empatesTop.length > 1,
  };
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

      // Consulta dos hashes JÁ persistidos: traz id + status para que a UI
      // possa diferenciar "existe no banco" (fato físico) de "já processado"
      // (status operacional). Hash existente NÃO significa pendência fechada.
      const hashes = movimentosComHash.map((m) => m.hash);
      const { data: existentes, error: errSel } = await supabase
        .from('extrato_bancario_v2' as any)
        .select('id, hash_movimento, status')
        .eq('cliente_id', clienteAtual.id)
        .in('hash_movimento', hashes);
      if (errSel) throw errSel;
      const persistidoPorHash = new Map<string, { id: string; status: StatusPersistido }>();
      for (const r of (existentes as unknown as
        { id: string; hash_movimento: string; status: StatusPersistido }[] ?? [])
      ) {
        persistidoPorHash.set(r.hash_movimento, { id: r.id, status: r.status });
      }

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
        .select('id, data_pagamento, valor, sinal, descricao, favorecido_id, conta_bancaria_id, conta_destino_id, macro_custo, grupo_custo, status_transacao, numero_documento, cenario, fazenda_id')
        .eq('cliente_id', clienteAtual.id)
        .eq('cancelado', false)
        .neq('cenario', 'meta')
        .in('status_transacao', ['realizado', 'agendado', 'programado'])
        .or(`conta_bancaria_id.eq.${params.contaBancariaId},conta_destino_id.eq.${params.contaBancariaId}`)
        .gte('data_pagamento', fetchIni)
        .lte('data_pagamento', fetchFim);

      const lancs = (lancsRaw ?? []) as unknown as LancamentoCandidato[];

      // ── Lookups paralelos: fornecedores, fazendas, contas, vínculos existentes ──
      const favIds = Array.from(
        new Set(lancs.map((l) => l.favorecido_id).filter((x): x is string => !!x)),
      );
      const fazIds = Array.from(
        new Set(lancs.map((l) => l.fazenda_id).filter((x): x is string => !!x)),
      );
      const contaIds = Array.from(
        new Set(
          lancs
            .flatMap((l) => [l.conta_bancaria_id, l.conta_destino_id])
            .filter((x): x is string => !!x),
        ),
      );
      const lancIds = lancs.map((l) => l.id);

      const [fornsRes, fazsRes, contasRes, vinculosRes] = await Promise.all([
        favIds.length > 0
          ? supabase.from('financeiro_fornecedores').select('id, nome').in('id', favIds)
          : Promise.resolve({ data: [] as { id: string; nome: string }[] }),
        fazIds.length > 0
          ? supabase.from('fazendas').select('id, nome').in('id', fazIds)
          : Promise.resolve({ data: [] as { id: string; nome: string }[] }),
        contaIds.length > 0
          ? supabase
              .from('financeiro_contas_bancarias')
              .select('id, nome_conta, nome_exibicao')
              .in('id', contaIds)
          : Promise.resolve({ data: [] as { id: string; nome_conta: string; nome_exibicao: string | null }[] }),
        lancIds.length > 0
          ? supabase
              .from('conciliacao_bancaria_itens' as any)
              .select('lancamento_id, valor_aplicado')
              .eq('cliente_id', clienteAtual.id)
              .in('lancamento_id', lancIds)
          : Promise.resolve({ data: [] as { lancamento_id: string; valor_aplicado: number }[] }),
      ]);

      const fornMap = new Map<string, string>();
      for (const f of (fornsRes.data ?? []) as { id: string; nome: string }[]) {
        fornMap.set(f.id, f.nome);
      }
      const fazendaMap = new Map<string, string>();
      for (const f of (fazsRes.data ?? []) as { id: string; nome: string }[]) {
        fazendaMap.set(f.id, f.nome);
      }
      const contaMap = new Map<string, string>();
      for (const c of (contasRes.data ?? []) as
        { id: string; nome_conta: string; nome_exibicao: string | null }[]
      ) {
        contaMap.set(c.id, c.nome_exibicao || c.nome_conta);
      }
      // Soma dos valor_aplicado por lançamento — base para saldo conciliável e
      // para excluir do auto-match os lançamentos já totalmente cobertos.
      const totalAplicadoPorLanc = new Map<string, number>();
      for (const v of (vinculosRes.data ?? []) as
        { lancamento_id: string; valor_aplicado: number }[]
      ) {
        const cur = totalAplicadoPorLanc.get(v.lancamento_id) ?? 0;
        totalAplicadoPorLanc.set(
          v.lancamento_id,
          cur + Math.abs(Number(v.valor_aplicado) || 0),
        );
      }

      // Mapa lancId → nomeFornecedor (para score agrupado consultar por l.id).
      const fornByLancId = new Map<string, string>();
      for (const l of lancs) {
        if (l.favorecido_id) {
          const nome = fornMap.get(l.favorecido_id);
          if (nome) fornByLancId.set(l.id, nome);
        }
      }

      // Lançamentos já conciliados integralmente — excluídos do auto-match
      // mas continuam disponíveis em candidatosPossiveis para auditoria manual.
      function jaConciliadoIntegralmente(l: LancamentoCandidato): boolean {
        const aplicado = totalAplicadoPorLanc.get(l.id) ?? 0;
        const valorAbs = Math.abs(Number(l.valor) || 0);
        return aplicado >= valorAbs - 0.01;
      }
      const lancsLivres = lancs.filter((l) => !jaConciliadoIntegralmente(l));

      // Helper: monta um CandidatoPossivel completo (com fazenda/conta/saldo).
      function montarCandidato(
        l: LancamentoCandidato,
        movDataISO: string,
        valorMovAbs: number,
      ): CandidatoPossivel {
        const valorOriginal = Math.abs(Number(l.valor) || 0);
        const valorJaConciliado = totalAplicadoPorLanc.get(l.id) ?? 0;
        const saldoConciliar = Math.max(0, valorOriginal - valorJaConciliado);
        return {
          id: l.id,
          data: l.data_pagamento,
          fornecedor: l.favorecido_id ? fornMap.get(l.favorecido_id) ?? null : null,
          descricao: l.descricao,
          valor: (Number(l.valor) || 0) * ((Number(l.sinal) || 0) >= 0 ? 1 : -1),
          statusTransacao: l.status_transacao,
          diffValor: Math.abs(valorOriginal - valorMovAbs),
          diffDias: l.data_pagamento ? Math.abs(diasEntre(movDataISO, l.data_pagamento)) : 999,
          numeroDocumento: l.numero_documento,
          fazenda: l.fazenda_id ? fazendaMap.get(l.fazenda_id) ?? null : null,
          contaBancaria: l.conta_bancaria_id ? contaMap.get(l.conta_bancaria_id) ?? null : null,
          valorOriginal,
          valorJaConciliado,
          saldoConciliar,
          jaVinculadoOFX: valorJaConciliado > 0,
          conciliadoIntegralmente: valorJaConciliado >= valorOriginal - 0.01,
        };
      }

      // Para cada movimento:
      //   1) tentar match 1:1 sobre `lancsLivres` (excluídos os já totalmente
      //      conciliados). Detectar ambiguidade — se houver empate estrito,
      //      desativar auto-pick e expor candidatosAmbiguos para escolha humana;
      //   2) se 1:1 falhar, tentar composição (subset, até 8 itens, ±10 dias,
      //      sinal compatível, timeout 200ms).
      const movimentos: MovimentoPreview[] = movimentosComHash.map((m) => {
        const valorMov = Math.abs(m.valor);

        // ── 1) Score de TODOS os candidatos viáveis (auto-match exclui já-totalmente-conciliados) ──
        const candidatosScore: CandidatoComScore[] = [];
        for (const l of lancsLivres) {
          if (Math.abs(Math.abs(Number(l.valor) || 0) - valorMov) > 0.01) continue;
          if (!l.data_pagamento) continue;
          if (Math.abs(diasEntre(m.data, l.data_pagamento)) > 7) continue;
          const fornNome = l.favorecido_id ? fornMap.get(l.favorecido_id) ?? null : null;
          const s = calcularScore(m.data, m.descricao, l, fornNome);
          candidatosScore.push({ lanc: l, score: s, fornNome });
        }

        const { scoreMax, empatesTop, ambiguo } = detectarAmbiguidade(candidatosScore);
        const matchAmbiguo = ambiguo;
        // Auto-pick SOMENTE quando há candidato único (não ambíguo) com score ≥ 50.
        const melhor: LancamentoCandidato | null =
          !matchAmbiguo && empatesTop.length === 1 && scoreMax >= 50
            ? empatesTop[0].lanc
            : null;
        const melhorScore = scoreMax;
        const fornecedorMatch = melhor?.favorecido_id ? fornMap.get(melhor.favorecido_id) ?? null : null;

        // Lista de candidatos ambíguos enriquecida (somente quando há empate real).
        const candidatosAmbiguos: CandidatoPossivel[] = matchAmbiguo
          ? empatesTop.map((c) => montarCandidato(c.lanc, m.data, valorMov))
          : [];

        // Top-10 candidatos sugeridos (ranking por valor próximo, data, similaridade).
        // Mantém TODOS os lançamentos do range (incluindo já vinculados ou conciliados)
        // — modal manual é responsável por mostrar flags e desabilitar quando preciso.
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
          .map(({ lanc: l }) => montarCandidato(l, m.data, valorMov));

        const persistido = persistidoPorHash.get(m.hash) ?? null;
        const baseFields: MovimentoPreview = {
          ...m,
          existeNoDB: persistido !== null,
          extratoIdExistente: persistido?.id ?? null,
          statusPersistido: persistido?.status ?? null,
          scoreMatch: melhorScore,
          // matchEncontrado=true quando há candidatos viáveis — inclui ambíguos
          // (existem candidatos, só não há vencedor único).
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
          matchAmbiguo,
          candidatosAmbiguos,
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

        return baseFields;
      });

      const result: PreviewResult = {
        movimentos,
        totalLinhas: movimentos.length,
        ...recomputarAgregados(movimentos),
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
    importacaoId: string | null;
  }> {
    if (!preview) throw new Error('Sem preview gerado — chame gerarPreview primeiro');
    if (!clienteAtual?.id) throw new Error('Cliente não selecionado');

    // Extrato bancário pertence ao cliente+conta (sem fazenda — a tabela
    // extrato_bancario_v2 não tem fazenda_id). O cabeçalho opcional em
    // financeiro_importacoes_v2 ainda exige fazenda_id NOT NULL, então só
    // criamos esse header quando o usuário está em uma fazenda específica.
    // Em modo global, a importação é salva direto em extrato_bancario_v2
    // com importacao_id = NULL (campo já é nullable). Sem fazenda padrão.
    const fazendaId = fazendaAtual?.id;
    const fazendaEspecifica = !!fazendaId && fazendaId !== '__global__';

    const novos = preview.movimentos.filter((m) => !m.existeNoDB);
    if (novos.length === 0) throw new Error('Nenhum movimento novo para importar');

    setLoading(true);
    setError(null);
    try {
      // 0) Validação defensiva — a conta bancária deve pertencer ao cliente atual.
      //    Evita inserir em extrato_bancario_v2 com conta_bancaria_id de outro cliente.
      const { data: conta, error: errConta } = await supabase
        .from('financeiro_contas_bancarias')
        .select('cliente_id')
        .eq('id', params.contaBancariaId)
        .maybeSingle();
      if (errConta) throw errConta;
      if (!conta) throw new Error('Conta bancária não encontrada.');
      if ((conta as { cliente_id: string }).cliente_id !== clienteAtual.id) {
        throw new Error('A conta bancária selecionada não pertence ao cliente atual.');
      }

      // 1) Cabeçalho de importação — opcional (depende de fazenda específica).
      let importacaoId: string | null = null;
      if (fazendaEspecifica) {
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
            total_com_erro: preview.existentesNoBanco,
            status: 'confirmada',
          } as any)
          .select('id')
          .single();
        if (e1) throw e1;
        importacaoId = (imp as { id: string }).id;
      }

      // 2) Insert dos movimentos em batches de 500. Capturamos o id retornado
      //    para atualizar o preview em memória — assim o usuário não perde as
      //    ações de conciliação por re-gerar preview.
      const BATCH = 500;
      let inseridos = 0;
      const idsPorHash = new Map<string, string>();
      for (let i = 0; i < novos.length; i += BATCH) {
        const fatia = novos.slice(i, i + BATCH).map((m) => ({
          cliente_id: clienteAtual.id,
          conta_bancaria_id: params.contaBancariaId,
          importacao_id: importacaoId, // null em modo global
          data_movimento: m.data,
          descricao: m.descricao,
          documento: m.documento,
          valor: m.valor,
          tipo_movimento: m.tipo,
          hash_movimento: m.hash,
          status: 'nao_conciliado' as const,
        }));
        const { data: inserted, error: e2 } = await supabase
          .from('extrato_bancario_v2' as any)
          .insert(fatia)
          .select('id, hash_movimento');
        if (e2) throw e2;
        for (const r of (inserted ?? []) as { id: string; hash_movimento: string }[]) {
          idsPorHash.set(r.hash_movimento, r.id);
        }
        inseridos += fatia.length;
      }

      // Atualiza o preview em memória: cada movimento novo passa a ter
      // existeNoDB=true, statusPersistido='nao_conciliado' e o id do
      // registro recém-criado. Permite ações imediatamente após salvar.
      setPreview((prev) => {
        if (!prev) return prev;
        const movs: MovimentoPreview[] = prev.movimentos.map((m) => {
          if (m.existeNoDB) return m;
          const novoId = idsPorHash.get(m.hash) ?? null;
          return {
            ...m,
            existeNoDB: true,
            extratoIdExistente: novoId,
            statusPersistido: 'nao_conciliado' as const,
          };
        });
        return {
          ...prev,
          movimentos: movs,
          ...recomputarAgregados(movs),
        };
      });

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

  /**
   * Re-consulta extrato_bancario_v2 para os hashes do preview atual e
   * atualiza existeNoDB / extratoIdExistente / statusPersistido + agregados.
   *
   * Disparado após cada baixa/vínculo individual para que os contadores
   * (pendentes / parciais / conciliados) reflitam o estado real do DB.
   */
  async function refreshStatusPersistidos(): Promise<void> {
    if (!preview || !clienteAtual?.id) return;
    const hashes = preview.movimentos.map((m) => m.hash);
    if (hashes.length === 0) return;

    const { data, error } = await supabase
      .from('extrato_bancario_v2' as any)
      .select('id, hash_movimento, status')
      .eq('cliente_id', clienteAtual.id)
      .in('hash_movimento', hashes);
    if (error) {
      console.error('[refreshStatusPersistidos]', error);
      return;
    }

    const persistidoPorHash = new Map<string, { id: string; status: StatusPersistido }>();
    for (const r of (data as unknown as
      { id: string; hash_movimento: string; status: StatusPersistido }[] ?? [])
    ) {
      persistidoPorHash.set(r.hash_movimento, { id: r.id, status: r.status });
    }

    setPreview((prev) => {
      if (!prev) return prev;
      const movs: MovimentoPreview[] = prev.movimentos.map((m) => {
        const persistido = persistidoPorHash.get(m.hash) ?? null;
        return {
          ...m,
          existeNoDB: persistido !== null,
          extratoIdExistente: persistido?.id ?? null,
          statusPersistido: persistido?.status ?? null,
        };
      });
      return {
        ...prev,
        movimentos: movs,
        ...recomputarAgregados(movs),
      };
    });
  }

  return {
    preview,
    loading,
    error,
    gerarPreview,
    confirmarImportacao,
    refreshStatusPersistidos,
    reset,
  };
}
