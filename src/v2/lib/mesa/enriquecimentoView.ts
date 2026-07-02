// ============================================================================
// enriquecimentoView — módulo PURO (sem React, sem Supabase, sem RPC/write).
// Adapter/selector: mapeia a shape do banco (vw_classificacao_staging_preview /
// SessaoClassificacaoResumo) para os ViewModels burros da Mesa Global. NENHUMA
// regra de negócio nova: grava/mantém/órfão vêm das flags will_* da view; os
// demais campos são projeção/formatação e comparação confere/difere de leitura.
// ============================================================================
import type {
  ClassificacaoStagingPreviewRow,
  SessaoClassificacaoResumo,
} from '@/v2/hooks/useClassificacaoStaging';
import type {
  EnriqRowVM, EnriqSessaoVM, EnriqContagensVM, EnriqContaVM, EnriqStatus, EnriqTom, EnriqComparativoLinha,
  EnriqCampoEditavel, EnriqProveniencia, EnriqEdicao, EnriqEstado,
} from '@/v2/components/mesa/enriquecimento/types';
import { fmtData, fmtBRL, fmtTexto, mesAbrev, dataHoraCurta, STATUS_META } from '@/v2/components/mesa/enriquecimento/fmt';

const vazio = (v: unknown): boolean => v === null || v === undefined || String(v).trim() === '';
const norm = (v: unknown): string => String(v ?? '').trim().toLowerCase();

// Linha de comparação "de leitura" (Sistema x Excel): confere / difere / —.
function refLinha(campo: string, sistema: string | null, excel: string | null, sFmt: string, eFmt: string): EnriqComparativoLinha {
  let resultado = '—'; let tom: EnriqTom = 'neutro';
  if (!vazio(sistema) && !vazio(excel)) {
    if (norm(sistema) === norm(excel)) { resultado = 'confere'; tom = 'ok'; }
    else { resultado = 'difere'; tom = 'difere'; }
  }
  return { campo, sistema: sFmt, excel: eFmt, resultado, tom };
}

export function toRowVM(row: ClassificacaoStagingPreviewRow): EnriqRowVM {
  const statusLabel = STATUS_META[row.match_status]?.label ?? row.match_status;

  // Subcentro — campo GRAVADO pelo apply (usa flags da view).
  const subSistema = row.lanc_subcentro_atual;
  const subExcel = row.proposto_subcentro ?? row.excel_subcentro;
  let subRes = 'mantém'; let subTom: EnriqTom = 'neutro';
  if (row.will_create_subcentro_orfao) { subRes = 'bloqueado'; subTom = 'bloqueio'; }
  else if (row.will_set_subcentro) { subRes = 'grava'; subTom = 'muda'; }

  // Favorecido/Fornecedor — campo GRAVADO pelo apply (usa flag da view).
  const favSistema = row.lanc_favorecido_nome_atual;
  const favExcel = row.proposto_favorecido_nome ?? row.excel_fornecedor;
  const favRes = row.will_set_favorecido ? 'grava' : 'mantém';
  const favTom: EnriqTom = row.will_set_favorecido ? 'muda' : 'neutro';

  const banco = row.lanc_conta_bancaria_nome ?? row.conta_filtro_nome ?? row.excel_conta_origem;
  // Descrição = observação/complemento do Sistema (NUNCA produto). O Excel não expõe
  // campo de descrição/obs no staging, então o lado Excel de "Descrição" é '—'.
  // O texto de produto (ex.: "27,5t quirera de milho") pertence à linha "Produto".
  const descricao = row.lanc_descricao ?? row.lanc_observacao;

  const comparativo: EnriqComparativoLinha[] = [
    refLinha('Data', row.lanc_data_pagamento, row.excel_data, fmtData(row.lanc_data_pagamento), fmtData(row.excel_data)),
    {
      campo: 'Valor',
      sistema: fmtBRL(row.lanc_valor), excel: fmtBRL(row.excel_valor),
      ...(vazio(row.lanc_valor) || vazio(row.excel_valor)
        ? { resultado: '—', tom: 'neutro' as EnriqTom }
        : row.lanc_valor === row.excel_valor
          ? { resultado: 'confere', tom: 'ok' as EnriqTom }
          : { resultado: 'difere', tom: 'difere' as EnriqTom }),
    },
    refLinha('Banco', row.lanc_conta_bancaria_nome, row.excel_conta_origem, fmtTexto(row.lanc_conta_bancaria_nome), fmtTexto(row.excel_conta_origem)),
    // PR-U2b — Produto/Fazenda agora com Resultado (proposta de enriquecimento), read-only.
    { campo: 'Produto', sistema: '—', excel: fmtTexto(row.excel_produto), resultado: fmtTexto(row.proposto_produto), tom: (vazio(row.proposto_produto) ? 'neutro' : 'muda') as EnriqTom },
    { campo: 'Fornecedor', sistema: fmtTexto(favSistema), excel: fmtTexto(favExcel), resultado: favRes, tom: favTom },
    { campo: 'Fazenda', sistema: '—', excel: fmtTexto(row.excel_fazenda_codigo), resultado: fmtTexto(row.proposto_fazenda_nome), tom: (row.will_set_fazenda ? 'muda' : 'neutro') as EnriqTom },
    { campo: 'Subcentro', sistema: fmtTexto(subSistema), excel: fmtTexto(subExcel), resultado: subRes, tom: subTom },
    refLinha('Data comp.', row.lanc_data_competencia, row.excel_data, fmtData(row.lanc_data_competencia), fmtData(row.excel_data)),
    { campo: 'Documento', sistema: '—', excel: '—', resultado: '—', tom: 'neutro' },
    refLinha('Descrição', descricao, null, fmtTexto(descricao), '—'),
  ];

  // PR-U2b — descritores de campo editável (a UI de U2c consome; aqui só prepara).
  const camposEditaveis: EnriqCampoEditavel[] = [
    { campo: 'subcentro',     label: 'Subcentro',  editor: 'plano',      valorAtual: row.proposto_subcentro,        suportadoPeloApply: true },
    { campo: 'favorecido_id', label: 'Favorecido', editor: 'fornecedor', valorAtual: row.proposto_favorecido_nome,  suportadoPeloApply: true },
    { campo: 'fazenda_id',    label: 'Fazenda',    editor: 'fazenda',    valorAtual: row.proposto_fazenda_nome,     suportadoPeloApply: true },
    { campo: 'produto',       label: 'Produto',    editor: 'texto',      valorAtual: row.proposto_produto,          suportadoPeloApply: false },
    { campo: 'safra',         label: 'Safra',      editor: 'texto',      valorAtual: row.proposto_safra,            suportadoPeloApply: false },
    { campo: 'categoria',     label: 'Categoria',  editor: 'texto',      valorAtual: row.proposto_categoria,        suportadoPeloApply: false },
  ];
  // PR-U2b — proveniência (projeção read-only de _meta; só rastreabilidade).
  const proveniencia: EnriqProveniencia = {
    tier: row.proposto_tier,
    origem: row.proposto_origem_resolucao,
    motorVersion: row.motor_version,
  };
  // PR-U2c-2A — valores crus da proposta para os editores inline.
  const edicao: EnriqEdicao = {
    subcentro: row.proposto_subcentro,
    favorecidoId: row.proposto_favorecido_id,
    fazendaId: row.proposto_fazenda_id,
    produto: row.proposto_produto,
    tipoOperacao: row.lanc_tipo_operacao ?? row.excel_tipo_operacao,
    macro: row.proposto_macro,
  };

  // PR-U2d-1 — estado operacional da linha (ordem: primeira condição que casar vence).
  const temMatch = row.lanc_id != null;
  const subcentroOrfao = row.will_create_subcentro_orfao || row.proposto_subcentro_existe_no_plano === false;
  const estado: EnriqEstado =
    row.aplicado ? 'aplicado'
    : !temMatch ? 'sem_vinculo'                         // sem_match / ambíguo não resolvido
    : subcentroOrfao ? 'revisar'                        // proposta fora do plano → bloqueia apply
    : row.match_status === 'divergente' ? 'revisar'     // lançamento já tem valor diferente
    : row.match_status === 'ja_classificado' ? 'nada'   // já == proposta
    : 'pronto';                                         // exato / ambiguo_resolvido

  return {
    id: row.staging_id,
    linha: row.excel_linha_origem,
    status: row.match_status as EnriqStatus,
    statusLabel,
    estado,
    aplicado: row.aplicado,
    temMatch,
    subcentroOrfao,
    mudaAlgo: row.will_change_anything,
    data: fmtData(row.excel_data ?? row.lanc_data_pagamento),
    valor: fmtBRL(row.excel_valor ?? row.lanc_valor),
    banco: fmtTexto(banco),
    fornecedor: fmtTexto(favSistema ?? favExcel),
    comparativo,
    camposEditaveis,
    proveniencia,
    edicao,
  };
}

/**
 * Sessões → VMs com rótulo identificável: "Mai/2026 · Imp NN · dd/MM HH:mm · N linhas".
 * O índice NN é cronológico por mês (desempata importações quase idênticas).
 * Retorna ordenado por criada_em desc (mais recente primeiro) para o seletor.
 */
export function toSessoesVM(sessoes: SessaoClassificacaoResumo[] | undefined | null): EnriqSessaoVM[] {
  const arr = sessoes ?? [];
  const asc = [...arr].sort((a, b) => a.criada_em.localeCompare(b.criada_em));
  const idxPorMes = new Map<string, number>();
  const vmById = new Map<string, EnriqSessaoVM>();
  for (const s of asc) {
    const mes = s.excel_ano_mes ?? '—';
    const n = (idxPorMes.get(mes) ?? 0) + 1;
    idxPorMes.set(mes, n);
    const carimbo = dataHoraCurta(s.criada_em);
    const partes = [
      mesAbrev(s.excel_ano_mes),
      `Imp ${String(n).padStart(2, '0')}`,
      carimbo,
      `${s.total} linhas`,
    ].filter(Boolean);
    vmById.set(s.sessao_id, {
      id: s.sessao_id,
      label: partes.join(' · '),
      exatos: s.exatos,
      ambiguos: s.ambiguos,
      aplicados: s.aplicados,
    });
  }
  return [...asc].reverse().map((s) => vmById.get(s.sessao_id)!).filter(Boolean);
}

// ── Selectors (extração da lógica inline do MesaClassificacaoTab) ────────────

// Contas presentes na sessão (para o filtro visual). '__sem__' = sem conta canônica.
export function listarContas(staging: ClassificacaoStagingPreviewRow[]): EnriqContaVM[] {
  const m = new Map<string, EnriqContaVM>();
  for (const r of staging) {
    const id = r.conta_filtro_id ?? '__sem__';
    const nome = r.conta_filtro_nome ?? 'Sem conta';
    const cur = m.get(id) ?? { id, nome, total: 0 };
    cur.total++;
    m.set(id, cur);
  }
  return [...m.values()].sort((a, b) =>
    a.id === '__sem__' ? 1 : b.id === '__sem__' ? -1 : b.total - a.total,
  );
}

// Filtra o staging por conta ('todas' = sem filtro). Só visualização.
export function filtrarPorConta(
  staging: ClassificacaoStagingPreviewRow[],
  contaId: string,
): ClassificacaoStagingPreviewRow[] {
  return contaId === 'todas'
    ? staging
    : staging.filter((r) => (r.conta_filtro_id ?? '__sem__') === contaId);
}

export function contarContagens(staging: ClassificacaoStagingPreviewRow[]): EnriqContagensVM {
  const c: EnriqContagensVM = { total: staging.length, exatos: 0, ambiguos: 0, semMatch: 0, aplicados: 0 };
  for (const r of staging) {
    if (r.match_status === 'exato') c.exatos++;
    else if (r.match_status === 'ambiguo') c.ambiguos++;
    else if (r.match_status === 'sem_match') c.semMatch++;
    if (r.aplicado) c.aplicados++;
  }
  return c;
}

export function contarAplicaveisExatos(staging: ClassificacaoStagingPreviewRow[]): number {
  return staging.filter((r) => r.match_status === 'exato' && !r.aplicado).length;
}

export function filtrarPorStatus(rows: EnriqRowVM[], filtro: EnriqStatus | 'todos'): EnriqRowVM[] {
  return filtro === 'todos' ? rows : rows.filter((r) => r.status === filtro);
}

// PR-U2d-1 — burn-down. 'pendentes' (default) mostra só o que precisa de ação
// (pronto/revisar/sem_vinculo); 'todas' mostra tudo (aplicado/nada esmaecidos na lista).
// `graceIds` (janela de graça): ids recém-aplicados seguram na lista ~1,4s para o
// operador ver o estado resolvido antes do burn-down (só timing de visibilidade —
// o conteúdo da linha segue 100% derivado do VM).
export function filtrarPorModo(rows: EnriqRowVM[], modo: 'pendentes' | 'todas', graceIds?: Set<string>): EnriqRowVM[] {
  if (modo === 'todas') return rows;
  return rows.filter((r) =>
    r.estado === 'pronto' || r.estado === 'revisar' || r.estado === 'sem_vinculo' || (graceIds?.has(r.id) ?? false),
  );
}

export function escolherMelhorSessaoId(sessoes: SessaoClassificacaoResumo[] | undefined | null): string | null {
  if (!sessoes || sessoes.length === 0) return null;
  const ordenadas = [...sessoes].sort((a, b) => {
    const ua = a.exatos + a.ambiguos, ub = b.exatos + b.ambiguos;
    if (ub !== ua) return ub - ua;
    return b.criada_em.localeCompare(a.criada_em);
  });
  const melhor = ordenadas[0];
  return melhor && (melhor.exatos + melhor.ambiguos) > 0 ? melhor.sessao_id : null;
}
