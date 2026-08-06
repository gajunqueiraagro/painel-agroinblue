/**
 * matchOfxOnDemand — preview operacional de rematch para OFX órfão.
 *
 * R2 (decisão PR-RematchOnDemand): este helper DUPLICA TEMPORARIAMENTE a
 * lógica de scoring/grouping do useImportacaoExtrato.ts. NÃO importa do
 * hook original — o caminho de import OFX em produção fica intocado.
 *
 * Quando o rematch estiver validado em produção, um PR-Refactor-MatchEngine
 * futuro unificará as duas implementações num único módulo puro. Até lá,
 * QUALQUER mudança de regra de score deve refletir em AMBOS os locais.
 *
 * Filtros aplicados na busca de candidatos (PR-CONCIL-AGENDADO-01):
 *   - cancelado IS NOT TRUE            (coluna anulável — vivo = false OU null)
 *   - sem_movimentacao_caixa IS NOT TRUE (OFX é caixa real; NULL não exclui)
 *   - COALESCE(cenario,'realizado') != 'meta'  (cenario é anulável)
 *   - status_transacao in (realizado, agendado, programado)
 *   - conta_bancaria_id = X  OR  conta_destino_id = X
 *   - âncora COALESCE(data_pagamento, data_vencimento, data_competencia)
 *     ±10 dias do range OFX (agendado costuma viver em data_vencimento)
 *   - lançamentos JÁ VINCULADOS (conciliacao_bancaria_itens.desfeito_em IS NULL)
 *     são excluídos do pool de candidatos
 *
 * NÃO cria nem altera vínculo. NÃO altera status do extrato.
 * Resultado é consumido em memória pelo RematchOnDemandPanel.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { dataAncoraLancamento, orFiltroDataAncora, OR_CENARIO_NAO_META } from './dataAncora';

export interface MovimentoOfxParaRematch {
  id: string;
  data_movimento: string;        // 'YYYY-MM-DD'
  valor: number;                  // sempre positivo (módulo)
  tipo_movimento: 'credito' | 'debito';
  descricao: string | null;
  documento: string | null;
  conta_bancaria_id: string;
}

export interface CandidatoRematch {
  lancamentoId: string;
  data: string;
  valor: number;                  // valor com sinal
  descricao: string | null;
  fornecedor: string | null;      // null no MVP — lookup de favorecido fica fora
  numeroDocumento: string | null;
  fazenda: string | null;
  contaBancaria: string | null;
  macroCusto: string | null;
  grupoCusto: string | null;
  centroCusto: string | null;
  subcentro: string | null;
  statusTransacao: string | null;
  score: number;                  // 0..100
  diffValor: number;              // |valor lanc| - |valor mov|
  diffDias: number;               // |data lanc - data mov| em dias
}

export interface GrupoRematch {
  lancamentosIds: string[];
  valorSomado: number;
  score: number;                  // 0..89 (teto duro)
  itens: CandidatoRematch[];
}

export interface RematchResultado {
  ofx: MovimentoOfxParaRematch;
  candidatos1to1: CandidatoRematch[];    // top 10 por score
  candidatoMatch: CandidatoRematch | null;
  ambiguo: boolean;                       // ≥2 candidatos top com score equivalente
  agrupado: GrupoRematch | null;
  semMatch: boolean;                      // sem candidato com score ≥ 50 e sem grupo
}

export interface RematchParams {
  clienteId: string;
  contaBancariaId: string;
  anoMes: string;                 // 'YYYY-MM'
}

// ───────────────────────── helpers ─────────────────────────

function calcularScore1to1(
  movDataISO: string,
  movDescricao: string | null,
  lancDataISO: string,
  lancDescricao: string | null,
  lancValorAbs: number,
  movValorAbs: number,
): number {
  let score = 0;
  if (Math.abs(lancValorAbs - movValorAbs) <= 0.01) score += 70;
  const diffDias = Math.abs(
    (new Date(lancDataISO).getTime() - new Date(movDataISO).getTime()) / 86400000,
  );
  if (diffDias <= 3) score += 20;
  if (movDescricao && lancDescricao) {
    const a = movDescricao.toLowerCase().trim();
    const b = lancDescricao.toLowerCase().trim();
    if (a && b && (a.includes(b) || b.includes(a))) score += 10;
  }
  return score;
}

interface LancRaw {
  id: string;
  data_pagamento: string | null;
  data_vencimento: string | null;
  data_competencia: string | null;
  valor: number;
  sinal: number | null;
  descricao: string | null;
  favorecido_id: string | null;
  conta_bancaria_id: string | null;
  conta_destino_id: string | null;
  macro_custo: string | null;
  grupo_custo: string | null;
  centro_custo: string | null;
  subcentro: string | null;
  status_transacao: string | null;
  numero_documento: string | null;
  cenario: string | null;
  fazenda_id: string | null;
  sem_movimentacao_caixa: boolean | null;
}

function tryGroupingMatch(
  mov: MovimentoOfxParaRematch,
  pool: LancRaw[],
  fazendaMap: Map<string, string>,
  contaMap: Map<string, string>,
): GrupoRematch | null {
  const target = Math.abs(mov.valor);
  const movTime = new Date(mov.data_movimento).getTime();
  const ordenado = [...pool].sort((a, b) => {
    const ancA = dataAncoraLancamento(a);
    const ancB = dataAncoraLancamento(b);
    const ta = ancA ? Math.abs(new Date(ancA).getTime() - movTime) : Number.MAX_SAFE_INTEGER;
    const tb = ancB ? Math.abs(new Date(ancB).getTime() - movTime) : Number.MAX_SAFE_INTEGER;
    return ta - tb;
  });

  const MAX_DEPTH = 5;
  const TIMEOUT_MS = 500;
  const inicio = Date.now();
  let melhor: LancRaw[] | null = null;

  function dfs(idx: number, restante: number, atual: LancRaw[]) {
    if (melhor !== null && atual.length >= melhor.length) return;
    if (Date.now() - inicio > TIMEOUT_MS) return;
    if (Math.abs(restante) <= 0.05 && atual.length >= 2) {
      if (melhor === null || atual.length < melhor.length) {
        melhor = [...atual];
      }
      return;
    }
    if (atual.length >= MAX_DEPTH) return;
    for (let i = idx; i < ordenado.length; i++) {
      const v = Math.abs(Number(ordenado[i].valor));
      if (v > restante + 0.05) continue;
      atual.push(ordenado[i]);
      dfs(i + 1, restante - v, atual);
      atual.pop();
    }
  }
  dfs(0, target, []);

  if (!melhor) return null;
  const melhorSafe: LancRaw[] = melhor;

  // Score agrupado (simplificado — MVP. Bônus completos ficam para PR futuro)
  let score = 50;
  const datasItens = melhorSafe
    .map((i) => dataAncoraLancamento(i))
    .filter((d): d is string => !!d)
    .map((d) => new Date(d).getTime());
  const diffMedio = datasItens.length > 0
    ? datasItens.reduce((s, t) => s + Math.abs(t - movTime), 0)
      / datasItens.length / 86400000
    : 999;
  if (diffMedio <= 3) score += 20;
  if (melhorSafe.length > 5) score -= 10;
  score = Math.min(score, 89);

  const itens: CandidatoRematch[] = melhorSafe.map((l) => {
    const lancValor = Number(l.valor);
    const contaId = l.conta_bancaria_id ?? l.conta_destino_id;
    const anc = dataAncoraLancamento(l);
    const diffDias = anc
      ? Math.abs((new Date(anc).getTime() - movTime) / 86400000)
      : 999;
    return {
      lancamentoId: l.id,
      data: anc ?? '',
      valor: lancValor,
      descricao: l.descricao,
      fornecedor: null,
      numeroDocumento: l.numero_documento,
      fazenda: l.fazenda_id ? fazendaMap.get(l.fazenda_id) ?? null : null,
      contaBancaria: contaId ? contaMap.get(contaId) ?? null : null,
      macroCusto: l.macro_custo,
      grupoCusto: l.grupo_custo,
      centroCusto: l.centro_custo,
      subcentro: l.subcentro,
      statusTransacao: l.status_transacao,
      score,
      diffValor: Math.abs(lancValor) - target / melhorSafe.length,
      diffDias,
    };
  });

  return {
    lancamentosIds: melhorSafe.map((l) => l.id),
    valorSomado: melhorSafe.reduce((s, l) => s + Math.abs(Number(l.valor)), 0),
    score,
    itens,
  };
}

// ───────────────────────── função principal ─────────────────────────

export async function rematchOfxOnDemand(
  supabase: SupabaseClient,
  params: RematchParams,
): Promise<RematchResultado[]> {
  // 1) Range de datas
  const dataIniMes = `${params.anoMes}-01`;
  const [ano, mes] = params.anoMes.split('-').map(Number);
  const dataFimMesExc = mes === 12
    ? `${ano + 1}-01-01`
    : `${ano}-${String(mes + 1).padStart(2, '0')}-01`;
  const dataIniLanc = new Date(new Date(dataIniMes).getTime() - 10 * 86400000)
    .toISOString().slice(0, 10);
  const dataFimLanc = new Date(new Date(dataFimMesExc).getTime() + 10 * 86400000)
    .toISOString().slice(0, 10);

  // 2) OFX pendente da conta+mês
  // Cast `'extrato_bancario_v2' as any` é padrão do projeto (useExtratoBancario etc.)
  const { data: ofxRows, error: errOfx } = await supabase
    .from('extrato_bancario_v2' as any)
    .select('id, data_movimento, valor, tipo_movimento, descricao, documento, conta_bancaria_id')
    .eq('cliente_id', params.clienteId)
    .eq('conta_bancaria_id', params.contaBancariaId)
    .eq('status', 'nao_conciliado')
    .gte('data_movimento', dataIniMes)
    .lt('data_movimento', dataFimMesExc)
    .is('cancelado_em', null);
  if (errOfx) throw errOfx;

  // 3) Lançamentos candidatos
  const { data: lancsRaw, error: errLanc } = await supabase
    .from('financeiro_lancamentos_v2')
    .select('id, data_pagamento, data_vencimento, data_competencia, valor, sinal, descricao, favorecido_id, conta_bancaria_id, conta_destino_id, macro_custo, grupo_custo, centro_custo, subcentro, status_transacao, numero_documento, cenario, fazenda_id, sem_movimentacao_caixa')
    .eq('cliente_id', params.clienteId)
    // PR-CONCIL-AGENDADO-01 (D9): vivo = cancelado IS NOT TRUE (coluna anulável).
    .not('cancelado', 'is', true)
    // D9: apenas TRUE exclui — coluna anulável sem default (136 vivos com NULL).
    .not('sem_movimentacao_caixa', 'is', true)
    // D9: cenario é anulável — 'diferente de meta OU nulo'.
    .or(OR_CENARIO_NAO_META)
    .in('status_transacao', ['realizado', 'agendado', 'programado'])
    .or(`conta_bancaria_id.eq.${params.contaBancariaId},conta_destino_id.eq.${params.contaBancariaId}`)
    // D1: janela ±10d sobre a âncora COALESCE(pagamento, vencimento, competência).
    .or(orFiltroDataAncora(dataIniLanc, dataFimLanc));
  if (errLanc) throw errLanc;

  // 4) Excluir lançamentos já vinculados ativos
  const { data: jaVinculados, error: errVinc } = await supabase
    .from('conciliacao_bancaria_itens' as any)
    .select('lancamento_id')
    .eq('cliente_id', params.clienteId)
    .is('desfeito_em', null);
  if (errVinc) throw errVinc;
  const idsVinculados = new Set(
    ((jaVinculados as unknown as { lancamento_id: string }[]) ?? [])
      .map((v) => v.lancamento_id),
  );
  const lancsLivres = ((lancsRaw ?? []) as unknown as LancRaw[])
    .filter((l) => !idsVinculados.has(l.id));

  // 5) Resolver labels em batch
  const fazIds = [...new Set(lancsLivres.map((l) => l.fazenda_id).filter((x): x is string => !!x))];
  const contaIds = [...new Set([
    ...lancsLivres.map((l) => l.conta_bancaria_id).filter((x): x is string => !!x),
    ...lancsLivres.map((l) => l.conta_destino_id).filter((x): x is string => !!x),
  ])];
  const [fazendasRes, contasRes] = await Promise.all([
    fazIds.length > 0
      ? supabase.from('fazendas').select('id, nome').in('id', fazIds)
      : Promise.resolve({ data: [] as Array<{ id: string; nome: string }>, error: null }),
    contaIds.length > 0
      ? supabase.from('financeiro_contas_bancarias')
          .select('id, nome_conta, nome_exibicao').in('id', contaIds)
      : Promise.resolve({
          data: [] as Array<{ id: string; nome_conta: string; nome_exibicao: string | null }>,
          error: null,
        }),
  ]);
  const fazendaMap = new Map<string, string>(
    (((fazendasRes as { data: Array<{ id: string; nome: string }> | null }).data) ?? [])
      .map((f) => [f.id, f.nome]),
  );
  const contaMap = new Map<string, string>(
    (((contasRes as { data: Array<{ id: string; nome_conta: string; nome_exibicao: string | null }> | null }).data) ?? [])
      .map((c) => [c.id, c.nome_exibicao ?? c.nome_conta]),
  );

  // 6) Para cada OFX, ranquear top 10 + tentar grupo
  const movs = ((ofxRows ?? []) as unknown as MovimentoOfxParaRematch[]);
  const resultados: RematchResultado[] = [];
  for (const mov of movs) {
    const movValorAbs = Math.abs(mov.valor);

    // Filtrar pool: ±10 dias sobre a âncora. Sem filtro de sinal — engine atual também não filtra.
    const pool = lancsLivres.filter((l) => {
      const anc = dataAncoraLancamento(l);
      if (!anc) return false;
      const diff = Math.abs(
        (new Date(anc).getTime() - new Date(mov.data_movimento).getTime()) / 86400000,
      );
      return diff <= 10;
    });

    const candidatos1to1: CandidatoRematch[] = pool.map((l) => {
      const lancValor = Number(l.valor);
      const lancValorAbs = Math.abs(lancValor);
      // Âncora não-nula garantida pelo filtro do pool acima.
      const anc = dataAncoraLancamento(l) ?? mov.data_movimento;
      const score = calcularScore1to1(
        mov.data_movimento, mov.descricao,
        anc, l.descricao,
        lancValorAbs, movValorAbs,
      );
      const diffDias = Math.abs(
        (new Date(anc).getTime() - new Date(mov.data_movimento).getTime()) / 86400000,
      );
      const contaId = l.conta_bancaria_id ?? l.conta_destino_id;
      return {
        lancamentoId: l.id,
        data: anc,
        valor: lancValor,
        descricao: l.descricao,
        fornecedor: null,
        numeroDocumento: l.numero_documento,
        fazenda: l.fazenda_id ? fazendaMap.get(l.fazenda_id) ?? null : null,
        contaBancaria: contaId ? contaMap.get(contaId) ?? null : null,
        macroCusto: l.macro_custo,
        grupoCusto: l.grupo_custo,
        centroCusto: l.centro_custo,
        subcentro: l.subcentro,
        statusTransacao: l.status_transacao,
        score,
        diffValor: lancValorAbs - movValorAbs,
        diffDias,
      };
    }).sort((a, b) => b.score - a.score).slice(0, 10);

    const top = candidatos1to1[0];
    const segundo = candidatos1to1[1];
    const ambiguo = !!top && !!segundo
      && Math.abs(top.score - segundo.score) <= 1
      && top.score >= 70;
    const candidatoMatch = !ambiguo && top && top.score >= 90 ? top : null;

    let agrupado: GrupoRematch | null = null;
    if (!candidatoMatch) {
      agrupado = tryGroupingMatch(mov, pool, fazendaMap, contaMap);
    }

    const temAlgo = !!candidatoMatch || ambiguo || !!agrupado
      || (top && top.score >= 50);
    const semMatch = !temAlgo;

    resultados.push({
      ofx: mov,
      candidatos1to1,
      candidatoMatch,
      ambiguo,
      agrupado,
      semMatch,
    });
  }

  return resultados;
}
