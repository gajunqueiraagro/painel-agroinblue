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
  // Diagnóstico temporário — remover após bug isolado.
  // eslint-disable-next-line no-console
  console.log('[ZooModal] render', { lancamentoId, open });
  const { lancamento, raw, loading, error } = useLancamento(open ? lancamentoId : null);
  // eslint-disable-next-line no-console
  console.log('[ZooModal] useLancamento', { hasLancamento: !!lancamento, loading, error: error?.message });
  const permissions = useEditPermissions(raw);
  // eslint-disable-next-line no-console
  console.log('[ZooModal] permissions', permissions);

  // Lista de fazendas APENAS como lookup table para resolver o nome textual
  // da fazenda do lançamento via UUID. NUNCA lemos `fazendaAtual` daqui —
  // esse é o sentinel que vira "Global" em modo Global.
  const { fazendas } = useFazenda();

  // editarLancamento canonical — usar cenário do lançamento como queryKey
  // (fallback 'realizado' enquanto carrega).
  const cenarioParam = lancamento?.cenario ?? 'realizado';
  // eslint-disable-next-line no-console
  console.log('[ZooModal] before useLancamentos', { cenarioParam, hasFazendas: fazendas.length });
  const { editarLancamento } = useLancamentos({ cenario: cenarioParam });
  // eslint-disable-next-line no-console
  console.log('[ZooModal] after useLancamentos', { hasEditar: typeof editarLancamento === 'function' });

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

  const handleSalvarCompraZoo = useCallback(async () => {
    if (!lancamento || !compraForm) return;
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
  }, [lancamento, compraForm, compraStatusMode, nomeFazendaDoRegistro, permissions.canEditEstrutural, onSalvar]);

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

  // eslint-disable-next-line no-console
  console.log('[ZooModal] before switch', { tipo: lancamento.tipo, fazendaId: lancamento.fazendaId, clienteId: lancamento.clienteId });

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
                fornecedorId=""
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
