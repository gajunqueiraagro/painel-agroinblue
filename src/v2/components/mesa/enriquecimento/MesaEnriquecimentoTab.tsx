// ============================================================================
// MesaEnriquecimentoTab — container da Mesa Global de Enriquecimento.
// Consome APENAS ViewModels prontos (via @/v2/lib/mesa/enriquecimentoView) e
// guarda só estado de UI (sessão ativa, filtro, seleção, revisei). Nenhuma regra
// de negócio aqui — a inteligência fica em parser → staging → vw_...preview →
// fn_classificacao_apply. Salvar/Reverter/editar por linha estão ativos (apply_row /
// reverter_row / editar_proposto); Aplicar em lote (fn_classificacao_apply) ligado no P0-1A.
// ============================================================================
import { useState, useMemo, useEffect, useRef } from 'react';
import { toast } from 'sonner';
import { useCliente } from '@/contexts/ClienteContext';
import { useFazenda } from '@/contexts/FazendaContext';
import { useFinanceiroV2 } from '@/hooks/useFinanceiroV2';
import { useClassificacaoStaging, useSessoesClassificacao } from '@/v2/hooks/useClassificacaoStaging';
import {
  toRowVM, toSessoesVM, contarContagens, contarAplicaveisExatos, filtrarPorStatus, filtrarPorModo, escolherMelhorSessaoId,
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
  const [filtroModo, setFiltroModo] = useState<'pendentes' | 'todas'>('pendentes');   // PR-U2d-1 — burn-down

  // PR-U2d-1 — janela de graça: ids recém-aplicados ficam visíveis ~1,4s antes do
  // burn-down (só timing de apresentação; nada de dados do VM aqui).
  const GRACE_MS = 1400;
  const [graceIds, setGraceIds] = useState<Set<string>>(() => new Set());
  const graceTimers = useRef<ReturnType<typeof setTimeout>[]>([]);
  useEffect(() => () => { graceTimers.current.forEach(clearTimeout); }, []);
  function manterEmGraca(id: string) {
    setGraceIds((prev) => { const n = new Set(prev); n.add(id); return n; });
    const t = setTimeout(() => {
      setGraceIds((prev) => { const n = new Set(prev); n.delete(id); return n; });
    }, GRACE_MS);
    graceTimers.current.push(t);
  }
  const [selecionadoId, setSelecionadoId] = useState<string | null>(null);
  const [revisei, setRevisei] = useState(false);
  const [importOpen, setImportOpen] = useState(false);

  // Auto-seleção da sessão mais útil na abertura (regra extraída para o módulo puro).
  useEffect(() => {
    if (sessaoId) return;
    const melhor = escolherMelhorSessaoId(sessoes);
    if (melhor) setSessaoId(melhor);
  }, [sessaoId, sessoes]);

  const {
    staging, isFetching,
    applyRow, isApplyingRow, reverterRow, isRevertingRow,
    apply, isApplying,
    editarProposto,
  } = useClassificacaoStaging(sessaoId, clienteAtual?.id);

  // PR-U2c-2A — data layer dos editores inline (fonte única: mesmos dados do
  // Lançamento oficial). Loaders manuais → só carrega o necessário.
  const { classificacoes, fornecedores, loadClassificacoes, loadFornecedores, criarFornecedor } = useFinanceiroV2();
  const { fazendas } = useFazenda();
  useEffect(() => {
    if (!clienteAtual?.id) return;
    loadClassificacoes();
    loadFornecedores();
  }, [clienteAtual?.id, loadClassificacoes, loadFornecedores]);

  // ViewModels prontos (adapters/selectors puros).
  const sessoesVM = useMemo(() => toSessoesVM(sessoes), [sessoes]);
  const contas = useMemo(() => listarContas(staging), [staging]);
  // Conta é a partição de trabalho: contadores, lista e fluxo derivam do staging DA CONTA.
  const stagingConta = useMemo(() => filtrarPorConta(staging, filtroConta), [staging, filtroConta]);
  const contagens = useMemo(() => contarContagens(stagingConta), [stagingConta]);
  // P0-1A: o lote é da SESSÃO (todas as contas) — não pode depender do filtro de conta.
  const nAplicaveis = useMemo(() => contarAplicaveisExatos(staging), [staging]);
  const rowsVM = useMemo(() => stagingConta.map(toRowVM), [stagingConta]);
  // PR-U2d-1 — modo (pendentes/todas) é o gate; o filtro por status refina dentro dele.
  const rowsModo = useMemo(() => filtrarPorModo(rowsVM, filtroModo, graceIds), [rowsVM, filtroModo, graceIds]);
  const rowsFiltradas = useMemo(() => filtrarPorStatus(rowsModo, filtroStatus), [rowsModo, filtroStatus]);
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

  // R1 — Promise da edição em voo (commit-on-blur de Produto/Documento). salvar() a aguarda
  // antes do apply, para o apply_row NUNCA ler update_proposto antes do editar_proposto commitar.
  const pendingEditRef = useRef<Promise<unknown> | null>(null);

  // Escrita por linha (PR-U1). Salvar = apply_row(overwrite=true); Reverter = reverter_row.
  const isBusy = isApplyingRow || isRevertingRow || isApplying;
  // Linha órfã (subcentro fora do plano) não pode ser aplicada — a trigger do
  // lançamento rejeita. Só será salvável após editar o subcentro (PR-U2).
  const podeSalvar = !!selecionado && !selecionado.aplicado && selecionado.temMatch && !selecionado.subcentroOrfao;
  const podeReverter = !!selecionado && selecionado.aplicado;

  // Extrai mensagem humana de qualquer erro (PostgrestError não é instanceof Error).
  const errMsg = (e: unknown): string => {
    if (e instanceof Error && e.message) return e.message;
    if (e && typeof e === 'object' && 'message' in e && (e as any).message) return String((e as any).message);
    try { return JSON.stringify(e); } catch { return String(e); }
  };

  const MOTIVO_MSG: Record<string, string> = {
    sem_lancamento_vinculado: 'Sem lançamento vinculado — resolva o ambíguo ou não é possível salvar sem match.',
    lancamento_inexistente_ou_cancelado: 'Lançamento não encontrado ou cancelado.',
    pulado_subcentro_preenchido: 'Subcentro já preenchido — nada a gravar no modo conservador.',
    sem_permissao: 'Sem permissão para este cliente.',
    nada_a_reverter: 'Nada a reverter nesta linha.',
  };

  async function salvar(): Promise<boolean> {
    if (!selecionado) return false;
    const id = selecionado.id;                       // captura antes do await (seleção pode mudar)
    try {
      // R1 — aguarda qualquer edição pendente (commit-on-blur de Produto/Documento) COMMITAR
      // antes de o apply_row ler update_proposto. Sem timeout/polling: só await da Promise.
      // (erro da edição já foi tratado no onEditar; aqui só garantimos a ordem.)
      try { await pendingEditRef.current; } catch { /* noop */ }
      const res: any = await applyRow({ staging_id: id, overwrite: true });
      if (res?.aplicado) { manterEmGraca(id); toast.success('Lançamento salvo.'); return true; }
      toast.error(MOTIVO_MSG[res?.motivo] ?? `Não salvo (${res?.motivo ?? 'erro'}).`);
      return false;
    } catch (e: unknown) {
      toast.error(`Erro ao salvar: ${errMsg(e)}`);
      return false;
    }
  }
  async function handleSalvarProximo() {
    const ok = await salvar();
    if (ok) irProximo();
  }
  async function handleReverter() {
    if (!selecionado) return;
    try {
      const res: any = await reverterRow(selecionado.id);
      if (res?.ok) toast.success('Revertido.');
      else toast.error(MOTIVO_MSG[res?.motivo] ?? `Não revertido (${res?.motivo ?? 'erro'}).`);
    } catch (e: unknown) {
      toast.error(`Erro ao reverter: ${errMsg(e)}`);
    }
  }

  // P0-1A — acelerador em lote: aplica todos os Exatos pendentes DA SESSÃO (conservador,
  // nunca sobrescreve). A RPC retorna contagens (não ids) → burn-down direto via
  // invalidation; sem janela de graça.
  async function handleAplicarTodos() {
    if (!sessaoId) return;
    try {
      const res = await apply(sessaoId);
      toast.success(`Lote concluído: ${res.aplicados} aplicados · ${res.pulados_subcentro_preenchido} pulados (já classificados) · ${res.erros} erros.`);
    } catch (e: unknown) {
      toast.error(`Erro no lote: ${errMsg(e)}`);
    }
  }

  // PR-U2c-2A — edição da proposta via editarProposto (os editores dos passos
  // 2B..2E chamam isto). patch = { subcentro | favorecido_id | fazenda_id | produto | ... }.
  async function onEditar(patch: Record<string, unknown>): Promise<void> {
    if (!selecionado) return;
    // R1 — dispara a edição e registra a Promise SINCRONAMENTE (antes do 1º await), para o
    // salvar() disparado logo em seguida (blur→click) poder aguardá-la antes do apply.
    const p = editarProposto({ staging_id: selecionado.id, patch });
    pendingEditRef.current = p;
    try {
      const res: any = await p;
      if (res?.ok) {
        const rej = res?.campos_rejeitados;
        if (rej && Object.keys(rej).length > 0) {
          toast.error(`Alguns campos não aplicados: ${JSON.stringify(rej)}`);
        }
      } else {
        toast.error(MOTIVO_MSG[res?.motivo] ?? `Não editado (${res?.motivo ?? 'erro'}).`);
      }
    } catch (e: unknown) {
      toast.error(`Erro ao editar: ${errMsg(e)}`);
    } finally {
      if (pendingEditRef.current === p) pendingEditRef.current = null;
    }
  }

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
        filtroModo={filtroModo}
        onFiltroModo={setFiltroModo}
        onImportar={() => setImportOpen(true)}
      />

      {isFetching && <div className="text-[10px] text-muted-foreground px-1 md:shrink-0">Carregando…</div>}

      {/* Hierarquia: ESQUERDA (~29%) só LOCALIZA o lançamento · DIREITA (~71%) é a área de
          trabalho (foco). Desktop: grid ocupa o restante (flex-1) e só a lista rola. Mobile: empilha.
          hideBanco: sob filtro por conta, Banco é redundante (some na lista e no detalhe). */}
      <div className="grid gap-1.5 grid-cols-1 items-start md:[grid-template-columns:0.40fr_1fr] md:[grid-template-rows:minmax(0,1fr)] md:flex-1 md:min-h-0">
        <EnriquecimentoLista rows={rowsFiltradas} selecionadoId={selecionadoId} onSelecionar={setSelecionadoId} hideBanco={filtroConta !== 'todas'} />
        <EnriquecimentoDetalhe
          row={selecionado}
          classificacoes={classificacoes}
          fornecedores={fornecedores}
          fazendas={fazendas}
          clienteId={clienteAtual?.id}
          hideBanco={filtroConta !== 'todas'}
          onEditar={onEditar}
          onCriarFornecedor={criarFornecedor}
        />
      </div>

      <EnriquecimentoActions
        posicao={posicao}
        onAnterior={irAnterior}
        onProximo={irProximo}
        canAnterior={canAnterior}
        canProximo={canProximo}
        revisado={revisei}
        onRevisado={setRevisei}
        onSalvar={() => { void salvar(); }}
        onSalvarProximo={() => { void handleSalvarProximo(); }}
        onReverter={() => { void handleReverter(); }}
        onAplicarTodos={() => { void handleAplicarTodos(); }}
        nAplicaveis={nAplicaveis}
        salvarDisabled={!podeSalvar}
        reverterDisabled={!podeReverter}
        aplicarTodosDisabled={!sessaoId || nAplicaveis === 0}
        isBusy={isBusy}
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
