// ============================================================================
// MesaEnriquecimentoTab — container da Mesa Global de Enriquecimento.
// Consome APENAS ViewModels prontos (via @/v2/lib/mesa/enriquecimentoView) e
// guarda só estado de UI (sessão ativa, filtro, seleção, revisei). Nenhuma regra
// de negócio aqui — a inteligência fica em parser → staging → vw_...preview →
// fn_classificacao_apply. Read-only: usa apenas `staging` (SELECT via view) e a
// lista de sessões. Popular (PR-3) e Aplicar (PR-5) seguem desabilitados.
// ============================================================================
import { useState, useMemo, useEffect } from 'react';
import { useCliente } from '@/contexts/ClienteContext';
import { useClassificacaoStaging, useSessoesClassificacao } from '@/v2/hooks/useClassificacaoStaging';
import {
  toRowVM, toSessoesVM, contarContagens, contarAplicaveisExatos, filtrarPorStatus, escolherMelhorSessaoId,
} from '@/v2/lib/mesa/enriquecimentoView';
import { EnriquecimentoToolbar } from './EnriquecimentoToolbar';
import { EnriquecimentoLista } from './EnriquecimentoLista';
import { EnriquecimentoDetalhe } from './EnriquecimentoDetalhe';
import { EnriquecimentoActions } from './EnriquecimentoActions';
import type { EnriqStatus } from './types';

export function MesaEnriquecimentoTab() {
  const { clienteAtual } = useCliente();
  const { data: sessoes } = useSessoesClassificacao(clienteAtual?.id ?? null);

  // Estado de UI apenas.
  const [sessaoId, setSessaoId] = useState<string | null>(null);
  const [filtroStatus, setFiltroStatus] = useState<EnriqStatus | 'todos'>('todos');
  const [selecionadoId, setSelecionadoId] = useState<string | null>(null);
  const [revisei, setRevisei] = useState(false);

  // Auto-seleção da sessão mais útil na abertura (regra extraída para o módulo puro).
  useEffect(() => {
    if (sessaoId) return;
    const melhor = escolherMelhorSessaoId(sessoes);
    if (melhor) setSessaoId(melhor);
  }, [sessaoId, sessoes]);

  const { staging, isFetching } = useClassificacaoStaging(sessaoId, clienteAtual?.id);

  // ViewModels prontos (adapters/selectors puros).
  const sessoesVM = useMemo(() => toSessoesVM(sessoes), [sessoes]);
  const contagens = useMemo(() => contarContagens(staging), [staging]);
  const nAplicaveis = useMemo(() => contarAplicaveisExatos(staging), [staging]);
  const rowsVM = useMemo(() => staging.map(toRowVM), [staging]);
  const rowsFiltradas = useMemo(() => filtrarPorStatus(rowsVM, filtroStatus), [rowsVM, filtroStatus]);
  const selecionado = rowsFiltradas.find((r) => r.id === selecionadoId) ?? null;

  return (
    <div className="space-y-2">
      <EnriquecimentoToolbar
        sessoes={sessoesVM}
        sessaoAtivaId={sessaoId}
        onSelecionarSessao={(id) => { setSessaoId(id); setSelecionadoId(null); }}
        contagens={contagens}
        filtroStatus={filtroStatus}
        onFiltroStatus={setFiltroStatus}
        onImportar={() => { /* ligado no PR-3 (upload + fn_classificacao_populate_staging) */ }}
        importarDisabled
      />

      {isFetching && <div className="text-[11px] text-muted-foreground px-1">Carregando…</div>}

      {/* Padrão Mesa Global: lista à esquerda (~46%) + detalhe comparativo à direita (~54%). */}
      <div className="grid gap-2" style={{ gridTemplateColumns: '1fr 1.15fr', alignItems: 'start' }}>
        <EnriquecimentoLista rows={rowsFiltradas} selecionadoId={selecionadoId} onSelecionar={setSelecionadoId} />
        <EnriquecimentoDetalhe row={selecionado} />
      </div>

      <EnriquecimentoActions
        nAplicaveis={nAplicaveis}
        revisei={revisei}
        onRevisei={setRevisei}
        onAplicar={() => { /* ligado no PR-5 (fn_classificacao_apply) */ }}
        desabilitado
      />
    </div>
  );
}
