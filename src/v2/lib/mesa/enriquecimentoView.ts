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
  EnriqRowVM, EnriqSessaoVM, EnriqContagensVM, EnriqStatus, EnriqTom, EnriqComparativoLinha,
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
  const descricao = row.lanc_descricao ?? row.lanc_observacao ?? row.excel_produto;

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
    refLinha('Produto', null, row.excel_produto, '—', fmtTexto(row.excel_produto)),
    { campo: 'Fornecedor', sistema: fmtTexto(favSistema), excel: fmtTexto(favExcel), resultado: favRes, tom: favTom },
    refLinha('Fazenda', null, row.excel_fazenda_codigo, '—', fmtTexto(row.excel_fazenda_codigo)),
    { campo: 'Subcentro', sistema: fmtTexto(subSistema), excel: fmtTexto(subExcel), resultado: subRes, tom: subTom },
    refLinha('Data comp.', row.lanc_data_competencia, row.excel_data, fmtData(row.lanc_data_competencia), fmtData(row.excel_data)),
    { campo: 'Documento', sistema: '—', excel: '—', resultado: '—', tom: 'neutro' },
    refLinha('Descrição', descricao, row.excel_produto, fmtTexto(descricao), fmtTexto(row.excel_produto)),
  ];

  return {
    id: row.staging_id,
    linha: row.excel_linha_origem,
    status: row.match_status as EnriqStatus,
    statusLabel,
    aplicado: row.aplicado,
    mudaAlgo: row.will_change_anything,
    data: fmtData(row.excel_data ?? row.lanc_data_pagamento),
    valor: fmtBRL(row.excel_valor ?? row.lanc_valor),
    banco: fmtTexto(banco),
    fornecedor: fmtTexto(favSistema ?? favExcel),
    comparativo,
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
