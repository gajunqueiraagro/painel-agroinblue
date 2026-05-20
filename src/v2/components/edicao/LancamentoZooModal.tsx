/**
 * LancamentoZooModal — modal soberano de edição zootécnica.
 *
 * Atalho arquitetural (pós Bug 2): reutiliza os sheets/dialogs existentes
 * como implementação temporária, sem refatorar internamente. Cria um único
 * ponto de entrada para edição que pode ser aberto de qualquer tela (V2 ou
 * legado) conhecendo apenas o `lancamentoId`.
 *
 * Próximos passos:
 *  - Fase A1-A5: substituir sheets internamente por FormOficial padronizado
 *  - Fase A6: substituir EditCompraForm + CompraFinanceiroPanel
 *  - Fase A7-A8: criar FormVenda/FormAbate completos (hoje os Dialogs são
 *    apenas subforms financeiros — falta cobertura zoo)
 *
 * REGRAS INVIOLÁVEIS preservadas:
 *  - Carrega SEMPRE pelo `lancamentoId` (via useLancamento — F2).
 *  - Permissões via useEditPermissions (F2): cancelado / mês fechado /
 *    sem permissão. Banner explícito quando bloqueado.
 *  - NUNCA lê `fazendaAtual` do FazendaContext (poluiria com "Global" no
 *    modo Global). A lista `fazendas` é usada APENAS como lookup table
 *    para resolver o nome textual da fazenda do lançamento via UUID.
 *  - Recálculo financeiro mantém regra "confirmação explícita do usuário"
 *    (CompraFinanceiroPanel preserva o comportamento atual).
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Separator } from '@/components/ui/separator';
import { AlertTriangle, Lock, Ban } from 'lucide-react';

import { useFazenda } from '@/contexts/FazendaContext';
import { useLancamento } from '@/hooks/useLancamento';
import { useEditPermissions, type EditBlockReason } from '@/hooks/useEditPermissions';
import { useLancamentos } from '@/hooks/useLancamentos';
import type { Lancamento, Categoria } from '@/types/cattle';
import { isMeta, type FiltroVisual } from '@/lib/statusOperacional';
import { kgToArrobas } from '@/types/cattle';

import { EditNascimentoSheet } from '@/components/edit/EditNascimentoSheet';
import { EditMorteSheet } from '@/components/edit/EditMorteSheet';
import { EditConsumoSheet } from '@/components/edit/EditConsumoSheet';
import { EditTransferenciaSheet } from '@/components/edit/EditTransferenciaSheet';
import { EditReclassificacaoSheet } from '@/components/edit/EditReclassificacaoSheet';
import { EditCompraForm } from '@/components/edit/EditCompraForm';
import { CompraFinanceiroPanel } from '@/components/CompraFinanceiroPanel';
import { SincronizacaoFornecedorDialog, type ParcelaInfo } from './SincronizacaoFornecedorDialog';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';

interface LancamentoZooModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** UUID do lançamento. Modal carrega tudo a partir daqui — nunca do contexto da tela. */
  lancamentoId: string;
  /** Callback para invalidar lista/cache no caller após save bem-sucedido. */
  onEditSuccess?: () => void;
}

// ─── Helpers locais ──────────────────────────────────────────────────────────

const CAMPOS_ESTRUTURAIS: (keyof Lancamento)[] = [
  'data', 'tipo', 'quantidade', 'categoria',
  'fazendaOrigem', 'fazendaDestino',
];

/** Helper compartilhado com LancamentoDetalhe: detecta mudanças em campos
 *  estruturais que P1 oficial bloqueia. */
function temAlteracaoEstrutural(original: Lancamento, editado: Partial<Lancamento>): boolean {
  return CAMPOS_ESTRUTURAIS.some(campo => {
    if (!(campo in editado)) return false;
    const valOrig = (original as unknown as Record<string, unknown>)[campo as string] ?? '';
    const valEdit = (editado as unknown as Record<string, unknown>)[campo as string] ?? '';
    return String(valOrig) !== String(valEdit);
  });
}

function BannerBloqueio({ reason }: { reason: EditBlockReason }) {
  if (!reason) return null;
  const map: Record<NonNullable<EditBlockReason>, { icon: typeof Lock; title: string; desc: string; bg: string; text: string }> = {
    mes_fechado: {
      icon: Lock,
      title: 'Mês fechado — edição estrutural bloqueada',
      desc: 'Campos como data, quantidade, categoria e fazenda não podem ser alterados após o fechamento do Mapa de Pastos. Observação e peso continuam editáveis.',
      bg: 'bg-amber-50 dark:bg-amber-950/30 border-amber-200 dark:border-amber-900/60',
      text: 'text-amber-800 dark:text-amber-200',
    },
    cancelado: {
      icon: Ban,
      title: 'Lançamento cancelado',
      desc: 'Este lançamento foi cancelado e não pode mais ser editado.',
      bg: 'bg-red-50 dark:bg-red-950/30 border-red-200 dark:border-red-900/60',
      text: 'text-red-800 dark:text-red-200',
    },
    sem_permissao: {
      icon: AlertTriangle,
      title: 'Sem permissão',
      desc: 'Você não tem permissão para editar este lançamento.',
      bg: 'bg-red-50 dark:bg-red-950/30 border-red-200 dark:border-red-900/60',
      text: 'text-red-800 dark:text-red-200',
    },
  };
  const cfg = map[reason];
  const Icon = cfg.icon;
  return (
    <div className={`flex items-start gap-2 px-3 py-2 rounded-md border ${cfg.bg} ${cfg.text}`}>
      <Icon className="h-4 w-4 shrink-0 mt-0.5" />
      <div>
        <div className="text-xs font-semibold">{cfg.title}</div>
        <div className="text-[11px] leading-snug mt-0.5">{cfg.desc}</div>
      </div>
    </div>
  );
}

// ─── Modal ───────────────────────────────────────────────────────────────────

export function LancamentoZooModal({
  open,
  onOpenChange,
  lancamentoId,
  onEditSuccess,
}: LancamentoZooModalProps) {
  const { lancamento, raw, loading, error } = useLancamento(open ? lancamentoId : null);
  const permissions = useEditPermissions(raw);

  // Lista de fazendas APENAS como lookup table para resolver o nome textual
  // da fazenda do lançamento via UUID. NUNCA lemos `fazendaAtual` daqui —
  // esse é o sentinel que vira "Global" em modo Global.
  const { fazendas } = useFazenda();

  // editarLancamento canonical — usar cenário do lançamento como queryKey
  // (fallback 'realizado' enquanto carrega).
  const cenarioParam = lancamento?.cenario ?? 'realizado';
  const { editarLancamento } = useLancamentos({ cenario: cenarioParam });

  // ── Nome da fazenda do registro (texto persistido > lookup por UUID > '')
  const nomeFazendaDoRegistro = useMemo(() => {
    if (!lancamento) return '';
    if (lancamento.fazendaDestino) return lancamento.fazendaDestino;
    if (lancamento.fazendaOrigem) return lancamento.fazendaOrigem;
    const fz = fazendas.find(f => f.id === lancamento.fazendaId);
    return fz?.nome || '';
  }, [lancamento, fazendas]);

  // ── Outras fazendas (Transferência): exclui a fazenda DO LANÇAMENTO,
  // não a fazenda do filtro UI.
  const outrasFazendas = useMemo(() => {
    if (!lancamento?.fazendaId) return [] as Array<{ id: string; nome: string }>;
    return fazendas
      .filter(f => f.id !== lancamento.fazendaId)
      .map(f => ({ id: f.id, nome: f.nome }));
  }, [lancamento?.fazendaId, fazendas]);

  // ── canEditMeta vem do estado do REGISTRO (regra Bug 2).
  const canEditMeta = lancamento ? isMeta(lancamento) : false;

  // ── onSalvar canonical ─ chama editarLancamento + dispara invalidação no caller.
  const onSalvar = useCallback(
    async (id: string, dados: Partial<Omit<Lancamento, 'id'>>) => {
      await editarLancamento(id, dados);
      onEditSuccess?.();
    },
    [editarLancamento, onEditSuccess],
  );

  // ── Estado local da edição de compra (BLOCO zoo + BLOCO fin) ────────────
  const [compraForm, setCompraForm] = useState<Lancamento | null>(null);
  const [compraStatusMode, setCompraStatusMode] = useState<'realizado' | 'programado' | 'meta'>('realizado');
  const [compraSaving, setCompraSaving] = useState(false);
  const [compraZooSaved, setCompraZooSaved] = useState(false);
  const [notaFiscalEdit, setNotaFiscalEdit] = useState('');

  // ── Z4: fornecedor soberano do zoo (edição) ────────────────────────────
  const [fornecedorIdEdit, setFornecedorIdEdit] = useState<string | null>(null);
  const [fornecedorNomeEdit, setFornecedorNomeEdit] = useState<string | null>(null);
  const [snapshotNomeInicial, setSnapshotNomeInicial] = useState<string | null>(null);
  const [textoLegadoInicial, setTextoLegadoInicial] = useState<string | null>(null);
  // Modal de sincronização (mostra antes do save quando troca fornecedor com parcelas).
  interface SyncData {
    fornecedorAntigo: { id: string | null; nome: string | null };
    fornecedorNovo: { id: string | null; nome: string | null };
    parcelas: { sincronizaveis: ParcelaInfo[]; congeladas: ParcelaInfo[] };
  }
  const [modalSyncAberto, setModalSyncAberto] = useState(false);
  const [syncData, setSyncData] = useState<SyncData | null>(null);

  // Reinicializa state ao trocar de lançamento ou reabrir.
  // REGRA: side-effect (setState) precisa ser useEffect, não useMemo.
  // useMemo com setState é anti-pattern grave em React 18 — pode causar
  // tela branca silenciosa por violar a regra "no setState during render".
  useEffect(() => {
    if (lancamento && lancamento.tipo === 'compra' && open) {
      setCompraForm({ ...lancamento });
      setCompraStatusMode(isMeta(lancamento) ? 'meta' : ((lancamento.statusOperacional as 'realizado' | 'programado') || 'realizado'));
      setCompraZooSaved(false);
      setNotaFiscalEdit(lancamento.notaFiscal || '');
    }
  }, [lancamento, open]);

  // Z4: Carrega fornecedor com fallback em cascata.
  // Prioridade: zoo.fornecedorId → primeiro favorecido_id de fv2 vinculado → null.
  useEffect(() => {
    if (!lancamento || lancamento.tipo !== 'compra' || !open) return;

    let cancelado = false;

    // 1. Prioridade zoo soberano
    if (lancamento.fornecedorId) {
      setFornecedorIdEdit(lancamento.fornecedorId);
      setFornecedorNomeEdit(lancamento.fornecedorNomeSnapshot ?? null);
      setSnapshotNomeInicial(lancamento.fornecedorNomeSnapshot ?? null);
      setTextoLegadoInicial(null);
      return;
    }

    // 2. Fallback: favorecido_id da primeira parcela financeira vinculada
    (async () => {
      const { data } = await supabase
        .from('financeiro_lancamentos_v2')
        .select('favorecido_id, financeiro_fornecedores(id, nome)')
        .eq('movimentacao_rebanho_id', lancamento.id)
        .eq('cancelado', false)
        .not('favorecido_id', 'is', null)
        .order('data_competencia', { ascending: true })
        .limit(1);
      if (cancelado) return;
      const fb = data?.[0] as { favorecido_id?: string | null; financeiro_fornecedores?: { id: string; nome: string } | null } | undefined;
      if (fb?.favorecido_id) {
        setFornecedorIdEdit(fb.favorecido_id);
        setFornecedorNomeEdit(fb.financeiro_fornecedores?.nome ?? null);
        setSnapshotNomeInicial(null);
        setTextoLegadoInicial(lancamento.compradorFornecedor ?? null);
        return;
      }
      // 3. Sem zoo, sem fin: pura legado
      setFornecedorIdEdit(null);
      setFornecedorNomeEdit(null);
      setSnapshotNomeInicial(lancamento.fornecedorNomeSnapshot ?? null);
      setTextoLegadoInicial(lancamento.compradorFornecedor ?? null);
    })();

    return () => { cancelado = true; };
  }, [lancamento, open]);

  const compraZooDirty = useMemo(() => {
    if (!lancamento || !compraForm || lancamento.tipo !== 'compra') return false;
    const cenarioForm = compraStatusMode === 'meta' ? 'meta' : 'realizado';
    return (
      compraForm.data !== lancamento.data ||
      Number(compraForm.quantidade) !== Number(lancamento.quantidade) ||
      Number(compraForm.pesoMedioKg ?? 0) !== Number(lancamento.pesoMedioKg ?? 0) ||
      compraForm.categoria !== lancamento.categoria ||
      (compraForm.fazendaOrigem || '') !== (lancamento.fazendaOrigem || '') ||
      cenarioForm !== (lancamento.cenario || 'realizado')
    );
  }, [compraForm, compraStatusMode, lancamento]);

  // Z4: extraído de handleSalvarCompraZoo para reuso pelo modal de sync.
  const doSaveZoo = useCallback(async () => {
    if (!lancamento || !compraForm) return;
    // Snapshot: usa nome atual do mestre quando fornecedor mudou; mantém
    // snapshot anterior quando não mudou (imutabilidade preservada).
    const fornecedorMudou = (fornecedorIdEdit ?? null) !== (lancamento.fornecedorId ?? null);
    const snapshotFinal = fornecedorMudou
      ? (fornecedorNomeEdit ?? '[nao informado]')
      : (snapshotNomeInicial ?? lancamento.fornecedorNomeSnapshot ?? '[nao informado]');

    const dados: Partial<Lancamento> = {
      data: compraForm.data,
      tipo: compraForm.tipo,
      quantidade: Number(compraForm.quantidade),
      categoria: compraForm.categoria,
      fazendaOrigem: compraForm.fazendaOrigem || undefined,
      fazendaDestino: nomeFazendaDoRegistro,
      pesoMedioKg: compraForm.pesoMedioKg ? Number(compraForm.pesoMedioKg) : undefined,
      pesoMedioArrobas: compraForm.pesoMedioKg ? kgToArrobas(Number(compraForm.pesoMedioKg)) : undefined,
      cenario: compraStatusMode === 'meta' ? 'meta' : 'realizado',
      statusOperacional: compraStatusMode === 'meta' ? null : (compraForm.statusOperacional || null),
      fornecedorId: fornecedorIdEdit ?? undefined,
      fornecedorNomeSnapshot: snapshotFinal,
    };
    if (permissions.canEditEstrutural === false && temAlteracaoEstrutural(lancamento, dados)) {
      return;
    }
    setCompraSaving(true);
    try {
      await onSalvar(lancamento.id, dados);
      setCompraZooSaved(true);
    } finally {
      setCompraSaving(false);
    }
  }, [lancamento, compraForm, compraStatusMode, nomeFazendaDoRegistro, permissions.canEditEstrutural, onSalvar, fornecedorIdEdit, fornecedorNomeEdit, snapshotNomeInicial]);

  const handleSalvarCompraZoo = useCallback(async () => {
    if (!lancamento || !compraForm) return;

    // GUARD 1 — Anti-regressão: nunca limpar fornecedor consolidado.
    if (lancamento.fornecedorId && !fornecedorIdEdit) {
      toast.error(
        'Este lançamento já possui fornecedor consolidado. ' +
        'Selecione outro fornecedor ou cancele.'
      );
      return;
    }

    const fornecedorIdAnterior = lancamento.fornecedorId ?? null;
    const fornecedorMudou = (fornecedorIdEdit ?? null) !== fornecedorIdAnterior;

    // Modal de sync APENAS quando há fornecedor antigo consolidado E mudou.
    // Primeira atribuição (anterior null) não requer modal — vai direto pro save.
    if (fornecedorMudou && fornecedorIdAnterior !== null) {
      const { data: parcelasRaw } = await supabase
        .from('financeiro_lancamentos_v2')
        .select('id, descricao, valor, data_competencia, data_pagamento, status_transacao, conciliado_em, cancelado')
        .eq('movimentacao_rebanho_id', lancamento.id)
        .eq('cancelado', false);

      const parcelas = (parcelasRaw ?? []) as Array<{
        id: string;
        descricao: string | null;
        valor: number;
        data_competencia: string | null;
        data_pagamento: string | null;
        status_transacao: string | null;
        conciliado_em: string | null;
        cancelado: boolean;
      }>;

      const sincronizaveis: ParcelaInfo[] = parcelas.filter(p =>
        !p.cancelado &&
        p.conciliado_em === null &&
        (p.status_transacao ?? 'programado') !== 'realizado'
      );
      const congeladas: ParcelaInfo[] = parcelas.filter(p =>
        p.conciliado_em !== null ||
        p.status_transacao === 'realizado'
      );

      if (sincronizaveis.length > 0 || congeladas.length > 0) {
        setSyncData({
          fornecedorAntigo: { id: fornecedorIdAnterior, nome: snapshotNomeInicial },
          fornecedorNovo: { id: fornecedorIdEdit, nome: fornecedorNomeEdit },
          parcelas: { sincronizaveis, congeladas },
        });
        setModalSyncAberto(true);
        return; // save aguarda decisão do usuário
      }
    }

    // Sem mudança OU sem parcelas — save direto
    await doSaveZoo();
  }, [lancamento, compraForm, fornecedorIdEdit, fornecedorNomeEdit, snapshotNomeInicial, doSaveZoo]);

  // ── Handlers do SincronizacaoFornecedorDialog ──
  const handleAtualizarSincronizaveis = useCallback(async () => {
    if (!syncData) return;
    const ids = syncData.parcelas.sincronizaveis.map(p => p.id);
    if (ids.length > 0) {
      const { error } = await supabase
        .from('financeiro_lancamentos_v2')
        .update({ favorecido_id: fornecedorIdEdit })
        .in('id', ids);
      if (error) {
        toast.error('Falha ao atualizar parcelas. Zoo NÃO foi salvo.');
        return;
      }
    }
    await doSaveZoo();
    setModalSyncAberto(false);
    setSyncData(null);
  }, [syncData, fornecedorIdEdit, doSaveZoo]);

  const handleNaoTocarParcelas = useCallback(async () => {
    await doSaveZoo();
    setModalSyncAberto(false);
    setSyncData(null);
  }, [doSaveZoo]);

  const handleCancelarSync = useCallback(() => {
    if (lancamento) {
      setFornecedorIdEdit(lancamento.fornecedorId ?? null);
      setFornecedorNomeEdit(lancamento.fornecedorNomeSnapshot ?? null);
    }
    setModalSyncAberto(false);
    setSyncData(null);
  }, [lancamento]);

  // ─── Estados intermediários ─────────────────────────────────────────────

  if (loading) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Carregando lançamento…</DialogTitle>
            <DialogDescription>Aguarde enquanto buscamos os dados.</DialogDescription>
          </DialogHeader>
        </DialogContent>
      </Dialog>
    );
  }

  if (error || !lancamento) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Não foi possível carregar o lançamento</DialogTitle>
            <DialogDescription>
              {error?.message || 'Lançamento não encontrado ou ID inválido.'}
            </DialogDescription>
          </DialogHeader>
        </DialogContent>
      </Dialog>
    );
  }

  // ─── Roteamento por tipo ────────────────────────────────────────────────

  const sheetCommonProps = {
    lancamento,
    open,
    onOpenChange,
    onSalvar,
    podeRemover: false, // remoção fica para o caller via outro fluxo
    canEditMeta,
    p1Oficial: permissions.blockReason === 'mes_fechado',
    temAlteracaoEstrutural,
    nomeFazenda: nomeFazendaDoRegistro,
  };

  switch (lancamento.tipo) {
    case 'nascimento':
      return <EditNascimentoSheet {...sheetCommonProps} />;

    case 'morte':
      return <EditMorteSheet {...sheetCommonProps} />;

    case 'consumo':
      return <EditConsumoSheet {...sheetCommonProps} />;

    case 'transferencia_saida':
    case 'transferencia_entrada':
      return (
        <EditTransferenciaSheet
          {...sheetCommonProps}
          outrasFazendas={outrasFazendas}
        />
      );

    case 'reclassificacao':
      return (
        <EditReclassificacaoSheet
          lancamento={lancamento}
          open={open}
          onOpenChange={onOpenChange}
          onSalvar={onSalvar}
          podeRemover={false}
          p1Oficial={permissions.blockReason === 'mes_fechado'}
          temAlteracaoEstrutural={temAlteracaoEstrutural}
        />
      );

    case 'compra':
      if (!compraForm) return null; // aguardando init via useMemo
      return (
        <Sheet open={open} onOpenChange={onOpenChange}>
          <SheetContent side="right" className="w-full sm:max-w-xl overflow-y-auto">
            <SheetHeader className="pb-1">
              <SheetTitle className="text-sm">Editar Compra</SheetTitle>
              <p className="text-[10px] text-muted-foreground/70 italic">
                Alterações em campos zootécnicos irão recalcular o financeiro da compra.
              </p>
            </SheetHeader>
            <div className="mt-2 space-y-2.5">
              <BannerBloqueio reason={permissions.blockReason} />

              <EditCompraForm
                lancamento={lancamento}
                form={compraForm}
                onFormChange={setCompraForm as React.Dispatch<React.SetStateAction<Lancamento>>}
                statusMode={compraStatusMode}
                onStatusModeChange={setCompraStatusMode}
                saving={compraSaving}
                zooSaved={compraZooSaved}
                zooDirty={compraZooDirty}
                onSubmitZoo={handleSalvarCompraZoo}
                canEditMeta={canEditMeta}
                finRecordsCount={0 /* lookup futuro — não bloqueante aqui */}
                nomeFazendaDestino={nomeFazendaDoRegistro}
                fornecedorId={fornecedorIdEdit}
                onFornecedorChange={(id, nome) => {
                  setFornecedorIdEdit(id);
                  setFornecedorNomeEdit(nome);
                }}
                textoLegado={!fornecedorIdEdit ? (textoLegadoInicial ?? undefined) : undefined}
                snapshotNome={snapshotNomeInicial ?? undefined}
                clienteId={lancamento.clienteId ?? ''}
                readOnly={!permissions.canEdit}
                blockReason={permissions.blockReason}
              />

              <Separator />

              <CompraFinanceiroPanel
                quantidade={compraZooSaved ? Number(compraForm.quantidade) : lancamento.quantidade}
                pesoKg={compraZooSaved ? (compraForm.pesoMedioKg || 0) : (lancamento.pesoMedioKg || 0)}
                data={compraZooSaved ? compraForm.data : lancamento.data}
                categoria={(compraZooSaved ? compraForm.categoria : lancamento.categoria) as Categoria}
                statusOp={(() => {
                  // FiltroVisual = 'programado' | 'agendado' | 'realizado' | 'meta'.
                  // Lançamentos com 'previsto' (legado) caem em 'programado' para o
                  // CompraFinanceiroPanel — equivalência visual aceita.
                  const raw = compraZooSaved
                    ? (compraForm.statusOperacional ?? 'realizado')
                    : (lancamento.statusOperacional ?? 'realizado');
                  if (compraStatusMode === 'meta') return 'meta' as FiltroVisual;
                  if (raw === 'previsto') return 'programado' as FiltroVisual;
                  return raw as FiltroVisual;
                })()}
                fazendaOrigem={compraZooSaved ? (compraForm.fazendaOrigem || '') : (lancamento.fazendaOrigem || '')}
                notaFiscal={notaFiscalEdit}
                onNotaFiscalChange={setNotaFiscalEdit}
                fornecedorId={fornecedorIdEdit ?? ''}
                lancamentoId={lancamento.id}
                mode="update"
                fazendaIdLancamento={lancamento.fazendaId}
                clienteIdLancamento={lancamento.clienteId}
                onFinanceiroUpdated={() => {
                  onOpenChange(false);
                  onEditSuccess?.();
                }}
              />
            </div>
          </SheetContent>
          {/* Z4: modal de sincronização — aparece ANTES do save zoo quando
              fornecedor muda em lançamento com parcelas vinculadas. */}
          {syncData && (
            <SincronizacaoFornecedorDialog
              open={modalSyncAberto}
              onOpenChange={setModalSyncAberto}
              fornecedorAntigo={syncData.fornecedorAntigo}
              fornecedorNovo={syncData.fornecedorNovo}
              parcelas={syncData.parcelas}
              onAtualizar={handleAtualizarSincronizaveis}
              onNaoTocar={handleNaoTocarParcelas}
              onCancelar={handleCancelarSync}
            />
          )}
        </Sheet>
      );

    // TODO Fase A7 — extrair FormVenda completo (zoo + boitel + recálculo fin).
    // TODO Fase A8 — extrair FormAbate completo (zoo + bônus + descontos + frigorífico).
    // Hoje os Dialogs *DetalhesDialog são apenas subforms financeiros que recebem
    // initialData específico — não cobrem a edição completa (qtd, peso, categoria,
    // fazenda, NF, fornecedor vêm do form principal na LancamentosTab).
    case 'venda':
    case 'abate':
      return (
        <Dialog open={open} onOpenChange={onOpenChange}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>Edição de {lancamento.tipo === 'venda' ? 'Venda' : 'Abate'} indisponível neste fluxo</DialogTitle>
              <DialogDescription>
                A edição completa de {lancamento.tipo} ainda passa pela aba "Lançamentos"
                (form principal). Esta unificação chega nas Fases A7/A8.
              </DialogDescription>
            </DialogHeader>
          </DialogContent>
        </Dialog>
      );

    default:
      return (
        <Dialog open={open} onOpenChange={onOpenChange}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>Tipo não suportado</DialogTitle>
              <DialogDescription>
                Edição zoo unificada ainda não cobre o tipo "{lancamento.tipo}".
              </DialogDescription>
            </DialogHeader>
          </DialogContent>
        </Dialog>
      );
  }
}
