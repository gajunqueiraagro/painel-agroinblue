// ============================================================================
// MesaEnriquecimentoTab — container da nova Mesa Global de Enriquecimento.
// PR-1 (LAYOUT PURO): compõe os 5 componentes burros + EnriquecimentoRow com
// MOCK ESTÁTICO. NENHUM hook, NENHUMA RPC, NENHUM dado real — o objetivo é
// homologar a EXPERIÊNCIA da tela. Os dados reais (vw_classificacao_staging_preview
// via useClassificacaoStaging / useSessoesClassificacao) entram no PR-2.
// O container só guarda estado de UI (seleção/filtro/revisei); toda a inteligência
// (parser → staging → preview → fn_classificacao_apply) permanece fora da UI.
// ============================================================================
import { useState } from 'react';
import { EnriquecimentoToolbar } from './EnriquecimentoToolbar';
import { EnriquecimentoResumo } from './EnriquecimentoResumo';
import { EnriquecimentoLista } from './EnriquecimentoLista';
import { EnriquecimentoDetalhe } from './EnriquecimentoDetalhe';
import { EnriquecimentoActions } from './EnriquecimentoActions';
import type { EnriqRowVM, EnriqSessaoVM, EnriqContagensVM, EnriqStatus } from './types';

// ── MOCK estático (PR-1) — REMOVIDO no PR-2, quando entra o hook de dados. ──
const MOCK_SESSOES: EnriqSessaoVM[] = [
  { id: 'sess-a', label: '2026-05 · 191 linhas · 86 exatos', exatos: 86, ambiguos: 4, aplicados: 0 },
  { id: 'sess-b', label: '2026-04 · 253 linhas · 95 exatos', exatos: 95, ambiguos: 6, aplicados: 12 },
];
const MOCK_ROWS: EnriqRowVM[] = [
  { id: 'r1', data: '2026-05-03', valor: -970.85, descricao: 'Seguro de vida', status: 'exato', aplicado: false,
    subcentroAtual: null, subcentroProposto: 'Seguros', gravaSubcentro: true, subcentroOrfao: false,
    favorecidoAtual: null, favorecidoProposto: 'Seguradora XPTO', gravaFavorecido: true, mudaAlgo: true },
  { id: 'r2', data: '2026-05-07', valor: -4959.11, descricao: 'Nutrição animal', status: 'ambiguo', aplicado: false,
    subcentroAtual: 'Insumos', subcentroProposto: 'Nutrição', gravaSubcentro: false, subcentroOrfao: false,
    favorecidoAtual: 'Fornecedor A', favorecidoProposto: 'Fornecedor A', gravaFavorecido: false, mudaAlgo: false },
  { id: 'r3', data: '2026-05-12', valor: -1200.00, descricao: 'Manutenção trator', status: 'exato', aplicado: false,
    subcentroAtual: null, subcentroProposto: 'Manutenção_XYZ', gravaSubcentro: false, subcentroOrfao: true,
    favorecidoAtual: null, favorecidoProposto: 'Oficina BB', gravaFavorecido: true, mudaAlgo: true },
  { id: 'r4', data: '2026-05-15', valor: 2878.57, descricao: 'Resgate investimento', status: 'sem_match', aplicado: false,
    subcentroAtual: null, subcentroProposto: null, gravaSubcentro: false, subcentroOrfao: false,
    favorecidoAtual: null, favorecidoProposto: null, gravaFavorecido: false, mudaAlgo: false },
];
const MOCK_CONTAGENS: EnriqContagensVM = { total: 191, exatos: 86, ambiguos: 4, semMatch: 101, aplicados: 0 };

export function MesaEnriquecimentoTab() {
  // Estado de UI apenas (sem regra de negócio).
  const [sessaoAtivaId, setSessaoAtivaId] = useState<string | null>(MOCK_SESSOES[0]?.id ?? null);
  const [filtroStatus, setFiltroStatus] = useState<EnriqStatus | 'todos'>('todos');
  const [selecionadoId, setSelecionadoId] = useState<string | null>(null);
  const [revisei, setRevisei] = useState(false);

  // PR-1: filtragem trivial de apresentação sobre o mock (a derivação real vem do hook no PR-2).
  const rows = filtroStatus === 'todos' ? MOCK_ROWS : MOCK_ROWS.filter((r) => r.status === filtroStatus);
  const selecionado = rows.find((r) => r.id === selecionadoId) ?? null;
  const nAplicaveis = MOCK_ROWS.filter((r) => r.status === 'exato' && !r.aplicado && !r.subcentroOrfao).length;

  return (
    <div className="space-y-2">
      <EnriquecimentoToolbar
        sessoes={MOCK_SESSOES}
        sessaoAtivaId={sessaoAtivaId}
        onSelecionarSessao={setSessaoAtivaId}
        filtroStatus={filtroStatus}
        onFiltroStatus={setFiltroStatus}
        onPopular={() => { /* ligado no PR-3 (upload + fn_classificacao_populate_staging) */ }}
        // Sessão e Popular ainda não operam nesta fase → desabilitados (aparência natural).
        sessaoDisabled
        popularDisabled
      />

      <EnriquecimentoResumo contagens={MOCK_CONTAGENS} />

      {/* Padrão Mesa Global: lista ampla à esquerda + detalhe comparativo à direita. */}
      <div className="grid gap-2" style={{ gridTemplateColumns: '1.4fr 1fr', alignItems: 'start' }}>
        <EnriquecimentoLista rows={rows} selecionadoId={selecionadoId} onSelecionar={setSelecionadoId} />
        <EnriquecimentoDetalhe row={selecionado} />
      </div>

      <EnriquecimentoActions
        nAplicaveis={nAplicaveis}
        revisei={revisei}
        onRevisei={setRevisei}
        onAplicar={() => { /* ligado no PR-5 (fn_classificacao_apply) */ }}
        // Aplicar ainda não opera nesta fase → desabilitado (aparência natural).
        desabilitado
      />
    </div>
  );
}
