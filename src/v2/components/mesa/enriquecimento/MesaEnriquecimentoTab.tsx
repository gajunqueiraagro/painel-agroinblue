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
  listarContas, filtrarPorConta,
} from '@/v2/lib/mesa/enriquecimentoView';
import { EnriquecimentoToolbar } from './EnriquecimentoToolbar';
import { EnriquecimentoLista } from './EnriquecimentoLista';
import { EnriquecimentoDetalhe } from './EnriquecimentoDetalhe';
import { EnriquecimentoActions } from './EnriquecimentoActions';
import { EnriquecimentoImportarDialog } from './EnriquecimentoImportarDialog';
import type { EnriqStatus } from './types';

export function MesaEnriquecimentoTab() {
  const { clienteAtual } = useCliente();
  const { data: sessoes } = useSessoesClassificacao(clienteAtual?.id ?? null);

  // Estado de UI apenas.
  const [sessaoId, setSessaoId] = useState<string | null>(null);
  const [filtroConta, setFiltroConta] = useState<string>('todas');
  const [filtroStatus, setFiltroStatus] = useState<EnriqStatus | 'todos'>('todos');
  const [selecionadoId, setSelecionadoId] = useState<string | null>(null);
  const [revisei, setRevisei] = useState(false);
  const [importOpen, setImportOpen] = useState(false);

  // Auto-seleção da sessão mais útil na abertura (regra extraída para o módulo puro).
  useEffect(() => {
    if (sessaoId) return;
    const melhor = escolherMelhorSessaoId(sessoes);
    if (melhor) setSessaoId(melhor);
  }, [sessaoId, sessoes]);

  const { staging, isFetching } = useClassificacaoStaging(sessaoId, clienteAtual?.id);

  // ViewModels prontos (adapters/selectors puros).
  const sessoesVM = useMemo(() => toSessoesVM(sessoes), [sessoes]);
  const contas = useMemo(() => listarContas(staging), [staging]);
  // Conta é a partição de trabalho: contadores, lista e fluxo derivam do staging DA CONTA.
  const stagingConta = useMemo(() => filtrarPorConta(staging, filtroConta), [staging, filtroConta]);
  const contagens = useMemo(() => contarContagens(stagingConta), [stagingConta]);
  const nAplicaveis = useMemo(() => contarAplicaveisExatos(stagingConta), [stagingConta]);
  const rowsVM = useMemo(() => stagingConta.map(toRowVM), [stagingConta]);
  const rowsFiltradas = useMemo(() => filtrarPorStatus(rowsVM, filtroStatus), [rowsVM, filtroStatus]);
  const selecionado = rowsFiltradas.find((r) => r.id === selecionadoId) ?? null;

  // Navegação read-only entre linhas da lista (Anterior/Próximo) — só troca a seleção.
  const idx = rowsFiltradas.findIndex((r) => r.id === selecionadoId);
  const canAnterior = idx > 0;
  const canProximo = rowsFiltradas.length > 0 && idx < rowsFiltradas.length - 1;
  const irAnterior = () => { if (canAnterior) setSelecionadoId(rowsFiltradas[idx - 1].id); };
  const irProximo = () => {
    if (idx < 0) { if (rowsFiltradas.length) setSelecionadoId(rowsFiltradas[0].id); }
    else if (canProximo) setSelecionadoId(rowsFiltradas[idx + 1].id);
  };
  const posicao = `${idx >= 0 ? idx + 1 : '—'} / ${rowsFiltradas.length}`;

  return (
    <div className="space-y-1 md:space-y-0 md:flex-1 md:min-h-0 md:flex md:flex-col md:gap-1">
      <EnriquecimentoToolbar
        sessoes={sessoesVM}
        sessaoAtivaId={sessaoId}
        onSelecionarSessao={(id) => { setSessaoId(id); setFiltroConta('todas'); setSelecionadoId(null); }}
        contas={contas}
        contaAtivaId={filtroConta}
        onSelecionarConta={(id) => { setFiltroConta(id); setSelecionadoId(null); }}
        contagens={contagens}
        filtroStatus={filtroStatus}
        onFiltroStatus={setFiltroStatus}
        onImportar={() => setImportOpen(true)}
      />

      {isFetching && <div className="text-[10px] text-muted-foreground px-1 md:shrink-0">Carregando…</div>}

      {/* Hierarquia: ESQUERDA (~38%) seleciona o lançamento · DIREITA (~62%) analisa/decide (foco).
          Desktop: grid ocupa o espaço restante (flex-1) e só a lista rola. Mobile: empilha. */}
      <div className="grid gap-1.5 grid-cols-1 items-start md:[grid-template-columns:0.62fr_1fr] md:[grid-template-rows:minmax(0,1fr)] md:flex-1 md:min-h-0">
        <EnriquecimentoLista rows={rowsFiltradas} selecionadoId={selecionadoId} onSelecionar={setSelecionadoId} />
        <EnriquecimentoDetalhe row={selecionado} />
      </div>

      <EnriquecimentoActions
        posicao={posicao}
        onAnterior={irAnterior}
        onProximo={irProximo}
        canAnterior={canAnterior}
        canProximo={canProximo}
        revisado={revisei}
        onRevisado={setRevisei}
        onSalvar={() => { /* ligado no PR-U1 (save por lançamento) */ }}
        onSalvarProximo={() => { /* ligado no PR-U1 */ }}
        onAplicarTodos={() => { /* ligado no PR-5 (fn_classificacao_apply em lote) */ }}
        nAplicaveis={nAplicaveis}
        escritaDesabilitada
      />

      <EnriquecimentoImportarDialog
        open={importOpen}
        onClose={() => setImportOpen(false)}
        clienteId={clienteAtual?.id ?? null}
        onImportado={(sid) => { setSessaoId(sid); setFiltroConta('todas'); setFiltroStatus('todos'); setSelecionadoId(null); setImportOpen(false); }}
      />
    </div>
  );
}
