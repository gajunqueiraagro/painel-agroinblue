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
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { AlertTriangle, Lock, Ban, ExternalLink, Trash2 } from 'lucide-react';

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
import type { CompraFinanceiroPanelRef } from '@/components/CompraFinanceiroPanel';
import { SincronizacaoFornecedorDialog, type ParcelaInfo } from './SincronizacaoFornecedorDialog';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';

import { ZooMovShell } from './_blocos/ZooMovShell';
import { BlocoDadosMovimentacao } from './_blocos/BlocoDadosMovimentacao';
import { BlocoVinculoFinanceiro } from './_blocos/BlocoVinculoFinanceiro';
import { BlocoExplicacaoDiferenca } from './_blocos/BlocoExplicacaoDiferenca';
import { BlocoAcoesFinanceiras } from './_blocos/BlocoAcoesFinanceiras';
import { RegrasEdicaoBar } from './_blocos/RegrasEdicaoBar';
import { BlocoAuditoria } from './_blocos/BlocoAuditoria';
import { CompraDadosZootecnicos } from './_blocos/CompraDadosZootecnicos';
import { CompraVinculoFinanceiroDisplay } from './_blocos/CompraVinculoFinanceiroDisplay';
import { CompraAcoesFinanceiras } from './_blocos/CompraAcoesFinanceiras';
import { EditarFinanceiroSheet } from './_blocos/EditarFinanceiroSheet';
import { CompraCustosOperacao } from './_blocos/CompraCustosOperacao';
// PR-VENDA-V2-FASE-1: bloco zoo da Venda V2 (espelha CompraDadosZootecnicos)
// + motor único de cálculo (buildVendaCalculation).
import { VendaDadosZootecnicos, EMPTY_VENDA_COMERCIAL, type VendaComercialState } from './_blocos/VendaDadosZootecnicos';
import { VendaCustosOperacao } from './_blocos/VendaCustosOperacao';
import { buildVendaCalculation, type VendaCalculation, type TipoPrecoVenda } from '@/lib/calculos/venda';

/** Linha de financeiro_lancamentos_v2 vinculada à movimentação (compra).
 *  Lift state (Opção A): resolvido no modal e compartilhado entre o
 *  display verde e a aba "Custos da Operação". */
export interface FinRecord {
  id: string;
  /** PR-VENDA-V2-FINVINC-AUDITAVEL: usado na lista auditável do Card 3
   *  Financeiro Vinculado da venda (texto, NÃO autoridade — não classifica
   *  componente). */
  descricao: string | null;
  valor: number;
  /** +1 = entrada (receita), -1 = saída (despesa/dedução).
   *  Necessário para SUM(valor * sinal) na conferência financeira da venda
   *  (PR-VENDA-V2-FINVINC-SINAL). */
  sinal: number;
  /** PR-VENDA-V2-FINVINC-ORIGEMTIPO: qualifica o COMPONENTE do lançamento
   *  vinculado. Domínio validado: venda:parcela / venda:comissao /
   *  venda:frete / venda:funrural (e equivalentes abate:/compra_rebanho:).
   *  É a fonte estrutural correta para classificar por componente — NÃO
   *  inferir por descrição/sinal. */
  origem_tipo: string | null;
  data_competencia: string | null;
  data_pagamento: string | null;
  status_transacao: string | null;
  conta_bancaria_id: string | null;
  conciliado_em: string | null;
}

interface LancamentoZooModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** UUID do lançamento. Modal carrega tudo a partir daqui — nunca do contexto da tela. */
  lancamentoId: string;
  /** Callback para invalidar lista/cache no caller após save bem-sucedido. */
  onEditSuccess?: () => void;
  /**
   * PR-E — redirect tático para o form principal (aba "Lançamentos") nos
   * tipos sem EditForm dedicado dentro deste modal (hoje: venda/abate).
   * Quando informado, substitui o placeholder "Fases A7/A8" por um botão
   * "Abrir no formulário principal" que chama esse callback com o
   * `lancamento` carregado. Caller decide como navegar (set state no
   * V2Index ou navigate para `/v2?section=lancamentos-zoot&edit=...`).
   * Se ausente, o modal mantém o placeholder honesto (zero regressão).
   */
  onAbrirNoFormPrincipal?: (lancamento: Lancamento) => void;
  /**
   * PR-VENDA-V2-2C-NAVEGAR — navega para o Financeiro filtrado pelo
   * ano/mês do lançamento vinculado. Read-only: apenas navega, sem
   * escrita em financeiro_lancamentos_v2.
   */
  onAbrirFinanceiroVinculado?: (ano: string, mes: number) => void;
}

// ─── Helpers locais ──────────────────────────────────────────────────────────

const CAMPOS_ESTRUTURAIS: (keyof Lancamento)[] = [
  'data', 'tipo', 'quantidade', 'categoria',
  'fazendaOrigem', 'fazendaDestino',
];

// PR-VENDA-V2-FASE-1: lista canônica usada APENAS pelo guard da Venda V2
// (inclui categoriaDestino e pesoMedioKg). NÃO substitui CAMPOS_ESTRUTURAIS —
// Compra mantém comportamento atual; venda usa esta via parâmetro de
// temAlteracaoEstrutural. Unificação completa fica para PR posterior.
const CAMPOS_ESTRUTURAIS_VENDA: (keyof Lancamento)[] = [
  'data', 'tipo', 'quantidade', 'categoria', 'categoriaDestino',
  'fazendaOrigem', 'fazendaDestino', 'pesoMedioKg',
];

/** Helper compartilhado com LancamentoDetalhe: detecta mudanças em campos
 *  estruturais que P1 oficial bloqueia. Aceita lista opcional (default =
 *  CAMPOS_ESTRUTURAIS, comportamento idêntico ao original). */
function temAlteracaoEstrutural(
  original: Lancamento,
  editado: Partial<Lancamento>,
  campos: (keyof Lancamento)[] = CAMPOS_ESTRUTURAIS,
): boolean {
  return campos.some(campo => {
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
  onAbrirNoFormPrincipal,
  onAbrirFinanceiroVinculado,
}: LancamentoZooModalProps) {
  const { lancamento, raw, loading, error } = useLancamento(open ? lancamentoId : null);
  const permissions = useEditPermissions(raw);

  // Z4.2: clienteId/fazendaId derivados do registro com fallback no raw.
  // NUNCA usar contexto visual (ClienteContext/FazendaContext) — viola
  // soberania do modal. raw.cliente_id/raw.fazenda_id vêm do mesmo
  // supabase response que alimenta `lancamento`, então são confiáveis.
  const clienteIdLancamento = useMemo(() => {
    return lancamento?.clienteId ?? raw?.cliente_id ?? '';
  }, [lancamento?.clienteId, raw?.cliente_id]);

  const fazendaIdLancamento = useMemo(() => {
    return lancamento?.fazendaId ?? raw?.fazenda_id ?? '';
  }, [lancamento?.fazendaId, raw?.fazenda_id]);

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
    // Lookup-first via UUID (estável). Corrige bug de display quando o campo
    // TEXT fazenda_destino foi salvo como 'Global' ou outro lixo no writer.
    const fz = fazendas.find(f => f.id === lancamento.fazendaId);
    if (fz?.nome) return fz.nome;
    if (lancamento.fazendaDestino) return lancamento.fazendaDestino;
    if (lancamento.fazendaOrigem) return lancamento.fazendaOrigem;
    return '';
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

  // ── PR-VENDA-V2-FASE-1: Estado local da edição de venda ─────────────────
  const [vendaForm, setVendaForm] = useState<Lancamento | null>(null);
  const [vendaStatusMode, setVendaStatusMode] = useState<'realizado' | 'programado' | 'meta'>('realizado');
  const [vendaSaving, setVendaSaving] = useState(false);
  const [vendaZooSaved, setVendaZooSaved] = useState(false);
  const [vendaComercial, setVendaComercial] = useState<VendaComercialState>(EMPTY_VENDA_COMERCIAL);

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

  // ── V2B: edição financeira via drawer + refresh do display ──────────────
  const [editFinSheetOpen, setEditFinSheetOpen] = useState(false);
  const [finRefreshKey, setFinRefreshKey] = useState(0);
  const [existingFinCount, setExistingFinCount] = useState(0);
  const compraFinanceiroPanelRef = useRef<CompraFinanceiroPanelRef>(null);

  // ── V2C lift state: query única do vínculo financeiro no modal alimenta
  //    o bloco verde (display) E a aba "Custos da Operação". ───────────────
  const [finRecords, setFinRecords] = useState<FinRecord[]>([]);
  const [finContasMap, setFinContasMap] = useState<Map<string, string>>(new Map());
  const [finLoading, setFinLoading] = useState(true);
  const [finError, setFinError] = useState<string | null>(null);

  useEffect(() => {
    if (!open || !lancamento || !['compra', 'venda'].includes(lancamento.tipo)) return;
    let cancelled = false;
    setFinLoading(true);
    setFinError(null);

    (async () => {
      const { data: parcelas, error: errP } = await supabase
        .from('financeiro_lancamentos_v2')
        .select('id, descricao, valor, sinal, origem_tipo, data_competencia, data_pagamento, status_transacao, conta_bancaria_id, conciliado_em')
        .eq('movimentacao_rebanho_id', lancamento.id)
        .eq('cancelado', false)
        .order('data_pagamento', { ascending: true });

      if (cancelled) return;
      if (errP) {
        setFinRecords([]);
        setFinContasMap(new Map());
        setFinError('Falha ao carregar vínculo financeiro. Tente reabrir o modal.');
        setFinLoading(false);
        return;
      }

      const recs: FinRecord[] = parcelas ?? [];
      const contasIds = Array.from(
        new Set(recs.map(r => r.conta_bancaria_id).filter((v): v is string => !!v))
      );

      let map = new Map<string, string>();
      if (contasIds.length > 0) {
        const { data: contas, error: errC } = await supabase
          .from('financeiro_contas_bancarias')
          .select('id, nome_exibicao')
          .in('id', contasIds);
        if (cancelled) return;
        if (!errC && contas) {
          map = new Map(contas.map(c => [c.id, c.nome_exibicao ?? '—']));
        }
      }

      setFinRecords(recs);
      setFinContasMap(map);
      setExistingFinCount(recs.length);
      setFinLoading(false);
    })();

    return () => { cancelled = true; };
  }, [open, lancamento, finRefreshKey]);

  // PR-ZOO-FIN-LOCK CAMADA1: derivações de proteção a partir do mesmo
  // finRecords já consumido pelo display verde. Sem nova query.
  // Pattern de classificação alinhado com handleSalvarCompraZoo:
  // realizado E conciliado são tratados como "congelados".
  const realizedCount = useMemo(
    () => finRecords.filter(r => r.status_transacao === 'realizado').length,
    [finRecords]
  );
  const conciliadoCount = useMemo(
    () => finRecords.filter(r => r.conciliado_em !== null).length,
    [finRecords]
  );
  const recalculoLocked = realizedCount > 0 || conciliadoCount > 0;

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

  // PR-VENDA-V2-FASE-1: init de venda (espelha compra L317+). Hidrata o
  // estado comercial a partir de lancamento.detalhesSnapshot, tolerando
  // camelCase (canônico V2) E snake_case (snapshot do backfill PR-VENDA-COMP-01).
  useEffect(() => {
    if (lancamento && lancamento.tipo === 'venda' && open) {
      setVendaForm({ ...lancamento });
      setVendaStatusMode(isMeta(lancamento) ? 'meta' : ((lancamento.statusOperacional as 'realizado' | 'programado') || 'realizado'));
      setVendaZooSaved(false);

      const snap = lancamento.detalhesSnapshot as Record<string, unknown> | undefined;
      const isVendaSnap = !!snap && (snap.type === 'venda' || snap._tipo === 'venda');
      const get = (k1: string, k2: string): string => {
        if (!isVendaSnap || !snap) return '';
        const v = snap[k1] ?? snap[k2];
        return v == null ? '' : String(v);
      };
      const tipoPrecoSnap = (isVendaSnap && snap
        ? (snap.tipoPreco ?? (snap as Record<string, unknown>).tipo_preco)
        : undefined) as TipoPrecoVenda | undefined;
      setVendaComercial({
        tipoVenda: lancamento.tipoVenda === 'desmama' ? 'desmama' : 'gado_adulto',
        tipoPreco: tipoPrecoSnap ?? 'por_kg',
        precoInput: get('precoInput', 'preco_input'),
        frete: get('frete', 'frete'),
        comissaoPct: get('comissaoPct', 'comissao_pct'),
        outrosCustos: get('outrosCustos', 'outros_custos'),
        funruralPct: get('funruralPct', 'funrural_pct'),
        funruralReais: get('funruralReais', 'funrural_reais'),
        formaReceb: isVendaSnap && snap && snap.formaReceb === 'prazo' ? 'prazo' : 'avista',
        qtdParcelas: get('qtdParcelas', 'qtd_parcelas') || '1',
        parcelas: (isVendaSnap && snap && Array.isArray(snap.parcelas) ? snap.parcelas : []) as VendaComercialState['parcelas'],
      });
    }
  }, [lancamento, open]);

  // Z4: Carrega fornecedor com fallback em cascata.
  // Prioridade: zoo.fornecedorId → primeiro favorecido_id de fv2 vinculado → null.
  // PR-VENDA-V2-FASE-1: estendido para 'venda' — mesma lógica de cascata.
  useEffect(() => {
    if (!lancamento || !open) return;
    if (lancamento.tipo !== 'compra' && lancamento.tipo !== 'venda') return;

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

  // PR-ZOO-FIN-LOCK-FIX-A: compraZooDirty completo. Adicionadas 3
  // comparações para fornecedorIdEdit/observacao/valorTotal — sem
  // elas o botão "Salvar Alterações" ficava disabled mesmo após
  // alteração desses campos (Zoo puro, não depende do Financeiro).
  // fornecedorIdEdit é state local do modal (não está em compraForm),
  // por isso entra também como dependência do useMemo.
  const compraZooDirty = useMemo(() => {
    if (!lancamento || !compraForm || lancamento.tipo !== 'compra') return false;
    const cenarioForm = compraStatusMode === 'meta' ? 'meta' : 'realizado';
    return (
      compraForm.data !== lancamento.data ||
      Number(compraForm.quantidade) !== Number(lancamento.quantidade) ||
      Number(compraForm.pesoMedioKg ?? 0) !== Number(lancamento.pesoMedioKg ?? 0) ||
      compraForm.categoria !== lancamento.categoria ||
      (compraForm.fazendaOrigem || '') !== (lancamento.fazendaOrigem || '') ||
      cenarioForm !== (lancamento.cenario || 'realizado') ||
      (fornecedorIdEdit ?? null) !== (lancamento.fornecedorId ?? null) ||
      (compraForm.observacao ?? '') !== (lancamento.observacao ?? '') ||
      Number(compraForm.valorTotal ?? 0) !== Number(lancamento.valorTotal ?? 0)
    );
  }, [compraForm, compraStatusMode, lancamento, fornecedorIdEdit]);

  // ── PR-VENDA-V2-FASE-1: motor único ────────────────────────────────────
  // Toda saída derivada (R$/@, R$/kg, R$/cab, valorBruto, valorLiquido) vem
  // daqui. NUNCA recalcular em outro lugar (proibido por contrato).
  const vendaCalc = useMemo<VendaCalculation>(() => {
    return buildVendaCalculation({
      quantidade: vendaForm?.quantidade ?? 0,
      pesoKg: vendaForm?.pesoMedioKg ?? 0,
      categoria: vendaForm?.categoria ?? '',
      fazendaOrigem: vendaForm?.fazendaOrigem ?? '',
      compradorNome: fornecedorNomeEdit ?? '',
      data: vendaForm?.data ?? '',
      statusOperacional: (vendaForm?.statusOperacional as 'programado' | 'agendado' | 'realizado') ?? 'realizado',
      observacao: vendaForm?.observacao ?? '',
      tipoVenda: vendaComercial.tipoVenda,
      tipoPreco: vendaComercial.tipoPreco,
      precoInput: vendaComercial.precoInput,
      frete: vendaComercial.frete,
      comissaoPct: vendaComercial.comissaoPct,
      outrosCustos: vendaComercial.outrosCustos,
      funruralPct: vendaComercial.funruralPct,
      funruralReais: vendaComercial.funruralReais,
      formaReceb: vendaComercial.formaReceb,
      qtdParcelas: vendaComercial.qtdParcelas,
      parcelas: vendaComercial.parcelas,
    });
  }, [vendaForm, vendaComercial, fornecedorNomeEdit]);

  // vendaZooDirty: comparação manual dos campos do form + JSON do estado
  // comercial vs snapshot inicial. Suficiente como gate de botão.
  const vendaZooDirty = useMemo(() => {
    if (!lancamento || !vendaForm || lancamento.tipo !== 'venda') return false;
    const cenarioForm = vendaStatusMode === 'meta' ? 'meta' : 'realizado';

    // Estado comercial inicial reconstruído a partir do snapshot (mesma lógica
    // do useEffect de init, mantida inline pra ficar transparente no diff).
    const snap = lancamento.detalhesSnapshot as Record<string, unknown> | undefined;
    const isVendaSnap = !!snap && (snap.type === 'venda' || snap._tipo === 'venda');
    const getInit = (k1: string, k2: string): string => {
      if (!isVendaSnap || !snap) return '';
      const v = snap[k1] ?? snap[k2];
      return v == null ? '' : String(v);
    };
    const tipoPrecoInicial = (isVendaSnap && snap
      ? (snap.tipoPreco ?? (snap as Record<string, unknown>).tipo_preco)
      : undefined) as TipoPrecoVenda | undefined;
    const inicial: VendaComercialState = {
      tipoVenda: lancamento.tipoVenda === 'desmama' ? 'desmama' : 'gado_adulto',
      tipoPreco: tipoPrecoInicial ?? 'por_kg',
      precoInput: getInit('precoInput', 'preco_input'),
      frete: getInit('frete', 'frete'),
      comissaoPct: getInit('comissaoPct', 'comissao_pct'),
      outrosCustos: getInit('outrosCustos', 'outros_custos'),
      funruralPct: getInit('funruralPct', 'funrural_pct'),
      funruralReais: getInit('funruralReais', 'funrural_reais'),
      formaReceb: isVendaSnap && snap && snap.formaReceb === 'prazo' ? 'prazo' : 'avista',
      qtdParcelas: getInit('qtdParcelas', 'qtd_parcelas') || '1',
      parcelas: (isVendaSnap && snap && Array.isArray(snap.parcelas) ? snap.parcelas : []) as VendaComercialState['parcelas'],
    };

    return (
      vendaForm.data !== lancamento.data ||
      Number(vendaForm.quantidade) !== Number(lancamento.quantidade) ||
      Number(vendaForm.pesoMedioKg ?? 0) !== Number(lancamento.pesoMedioKg ?? 0) ||
      vendaForm.categoria !== lancamento.categoria ||
      (vendaForm.fazendaOrigem || '') !== (lancamento.fazendaOrigem || '') ||
      (vendaForm.fazendaDestino || '') !== (lancamento.fazendaDestino || '') ||
      cenarioForm !== (lancamento.cenario || 'realizado') ||
      (fornecedorIdEdit ?? null) !== (lancamento.fornecedorId ?? null) ||
      (vendaForm.observacao ?? '') !== (lancamento.observacao ?? '') ||
      JSON.stringify(vendaComercial) !== JSON.stringify(inicial)
    );
  }, [vendaForm, vendaComercial, vendaStatusMode, lancamento, fornecedorIdEdit]);

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
      // PR-EditCompraZoo-PesoTotal-V2: peso_total derivado de qtd × peso_medio,
      // garante que UPDATE inclua peso_total. Sem essa linha o hook
      // editarLancamento L513 não envia o campo (guard `!== undefined`).
      // Mesma fórmula do handleSalvarCompraZoo em LancamentoDetalhe.tsx
      // (commit 17a1acb2). Aplicado também aqui porque V2 usa este modal,
      // não o LancamentoDetalhe legado.
      pesoTotal: compraForm.pesoMedioKg && compraForm.quantidade
        ? Math.round(Number(compraForm.quantidade) * Number(compraForm.pesoMedioKg) * 100) / 100
        : undefined,
      // PR-V2D.2-ETAPA1: persiste valor zootécnico editável no banco.
      // R$/cab e R$/kg derivam em runtime no CompraDadosZootecnicos a partir
      // de form.valorTotal (L40-41 daquele arquivo), portanto recalculam
      // sozinhos. preco_unitario NÃO é alterado nesta etapa — frente paralela.
      valorTotal: compraForm.valorTotal !== undefined && compraForm.valorTotal !== null
        ? Number(compraForm.valorTotal)
        : undefined,
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

  // ── PR-VENDA-V2-FASE-1: doSaveVendaZoo (espelha doSaveZoo da Compra) ───
  // Snapshot canônico SOMENTE com inputs (camelCase). Derivados (rArroba,
  // rCab, valorBruto, etc.) saem do motor único `vendaCalc` e são gravados
  // em colunas dedicadas (precoArroba, precoUnitario, valorTotal, pesoTotal).
  // NÃO escreve em financeiro_lancamentos_v2 (Fase 2).
  const doSaveVendaZoo = useCallback(async () => {
    if (!lancamento || !vendaForm) return;
    const fornecedorMudou = (fornecedorIdEdit ?? null) !== (lancamento.fornecedorId ?? null);
    const snapshotFinal = fornecedorMudou
      ? (fornecedorNomeEdit ?? '[nao informado]')
      : (snapshotNomeInicial ?? lancamento.fornecedorNomeSnapshot ?? '[nao informado]');

    const detalhesSnapshotCanonico = {
      type: 'venda' as const,
      tipoVenda: vendaComercial.tipoVenda,
      tipoPreco: vendaComercial.tipoPreco,
      precoInput: vendaComercial.precoInput,
      frete: vendaComercial.frete,
      comissaoPct: vendaComercial.comissaoPct,
      outrosCustos: vendaComercial.outrosCustos,
      funruralPct: vendaComercial.funruralPct,
      funruralReais: vendaComercial.funruralReais,
      formaReceb: vendaComercial.formaReceb,
      qtdParcelas: vendaComercial.qtdParcelas,
      parcelas: vendaComercial.parcelas,
    };

    const dados: Partial<Lancamento> = {
      data: vendaForm.data,
      tipo: vendaForm.tipo,
      quantidade: Number(vendaForm.quantidade),
      categoria: vendaForm.categoria,
      fazendaOrigem: vendaForm.fazendaOrigem || undefined,
      fazendaDestino: vendaForm.fazendaDestino || undefined,
      pesoMedioKg: vendaForm.pesoMedioKg ? Number(vendaForm.pesoMedioKg) : undefined,
      pesoMedioArrobas: vendaForm.pesoMedioKg ? kgToArrobas(Number(vendaForm.pesoMedioKg)) : undefined,
      pesoTotal: vendaCalc.pesoTotalKg,
      // Decisão 1+3 do briefing: competência (valor_total) = saída do motor.
      valorTotal: vendaCalc.valorBruto,
      // Desnormalização de leitura — derivados ficam fáceis em listagens/relatórios.
      precoArroba: vendaCalc.rArroba,
      precoUnitario: vendaCalc.rCab,
      tipoVenda: vendaComercial.tipoVenda,
      cenario: vendaStatusMode === 'meta' ? 'meta' : 'realizado',
      statusOperacional: vendaStatusMode === 'meta' ? null : (vendaForm.statusOperacional || null),
      fornecedorId: fornecedorIdEdit ?? undefined,
      fornecedorNomeSnapshot: snapshotFinal,
      detalhesSnapshot: detalhesSnapshotCanonico,
    };
    if (
      permissions.canEditEstrutural === false &&
      temAlteracaoEstrutural(lancamento, dados, CAMPOS_ESTRUTURAIS_VENDA)
    ) {
      return;
    }
    setVendaSaving(true);
    try {
      await onSalvar(lancamento.id, dados);
      setVendaZooSaved(true);
    } finally {
      setVendaSaving(false);
    }
  }, [lancamento, vendaForm, vendaComercial, vendaStatusMode, vendaCalc, permissions.canEditEstrutural, onSalvar, fornecedorIdEdit, fornecedorNomeEdit, snapshotNomeInicial]);

  const handleSalvarVendaZoo = useCallback(async () => {
    await doSaveVendaZoo();
  }, [doSaveVendaZoo]);

  const handleSalvarCompraZoo = useCallback(async () => {
    if (!lancamento || !compraForm) return;

    // GUARD 0 — Z4.2: sem cliente do registro, save bloqueado.
    // raw.cliente_id é a única fonte confiável; sem ele, não há
    // operação segura — fornecedor não pode ser consolidado sem
    // identificar a tenant do registro.
    if (!clienteIdLancamento) {
      toast.error(
        'Cliente do lançamento não identificado. ' +
        'Reabra o lançamento ou contate o suporte.'
      );
      return;
    }

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
  }, [lancamento, compraForm, fornecedorIdEdit, fornecedorNomeEdit, snapshotNomeInicial, doSaveZoo, clienteIdLancamento]);

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

  // Badge inline "Mês fechado" no header — só para blockReason === 'mes_fechado'.
  // Outros reasons (cancelado, sem_permissao) seguem via BannerBloqueio no corpo.
  const badgeMesFechado = permissions.blockReason === 'mes_fechado' ? (
    <div className="ml-2 px-2.5 py-1 rounded-md bg-amber-50 border border-amber-300 flex items-center gap-1.5">
      <Lock className="w-3 h-3 text-amber-700" />
      <span className="text-[11px] font-semibold text-amber-900 leading-none">Mês fechado</span>
      <span className="text-[10px] text-amber-800 leading-none">· edição bloqueada</span>
    </div>
  ) : undefined;

  // FASE 1D — botão "Salvar e Gerar Financeiro" é VISUAL APENAS.
  // EQUIVALENTE a "Salvar Alterações". NÃO chama generateFinanceiro, NÃO abre
  // modal, NÃO regenera parcelas, NÃO afeta financeiro. Combinação real é
  // decisão arquitetural pendente para fase futura.
  const handleSalvarEGerar = async () => {
    await handleSalvarCompraZoo();
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
        <>
          <ZooMovShell
            open={open}
            onOpenChange={onOpenChange}
            title="Editar Compra"
            subtitle={nomeFazendaDoRegistro}
            badgeMesFechado={badgeMesFechado}
            auditoriaSlot={
              <BlocoAuditoria
                lancamentoId={lancamento.id}
                createdAt={raw?.created_at}
                updatedAt={raw?.updated_at}
              />
            }
            custosOperacaoSlot={
              <CompraCustosOperacao
                lancamento={lancamento}
                compraForm={compraForm}
                records={finRecords}
                loading={finLoading}
                error={finError}
              />
            }
            footer={
              <div className="flex items-center justify-between">
                <Button
                  variant="outline"
                  size="sm"
                  className="h-7 text-[11px] font-semibold text-red-700 border-red-300 hover:bg-red-50"
                  onClick={() => onOpenChange(false)}
                >
                  <Trash2 className="h-3 w-3 mr-1" />
                  Cancelar Movimentação
                </Button>
                <div className="flex items-center gap-1.5">
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-7 text-[11px] font-medium"
                    onClick={() => onOpenChange(false)}
                  >
                    Cancelar
                  </Button>
                  <Button
                    size="sm"
                    className="h-7 text-[11px] font-semibold bg-blue-600 hover:bg-blue-700"
                    onClick={handleSalvarCompraZoo}
                    disabled={compraSaving || !compraZooDirty}
                  >
                    {compraSaving ? 'Salvando…' : 'Salvar Alterações'}
                  </Button>
                  <Button
                    size="sm"
                    className="h-7 text-[11px] font-semibold bg-emerald-600 hover:bg-emerald-700 text-white"
                    onClick={handleSalvarEGerar}
                    disabled={compraSaving || !compraZooDirty}
                  >
                    Salvar e Gerar Financeiro
                  </Button>
                </div>
              </div>
            }
          >
            {/* Banner de bloqueio (apenas para reasons != 'mes_fechado'). */}
            {permissions.blockReason && permissions.blockReason !== 'mes_fechado' && (
              <BannerBloqueio reason={permissions.blockReason} />
            )}

            {!clienteIdLancamento && (
              <div className="flex items-start gap-2 px-3 py-2 rounded-md border bg-red-50 border-red-200 text-red-800 mb-3">
                <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
                <div className="text-xs">Cliente do lançamento não identificado.</div>
              </div>
            )}

            {/* PR-V2E.2: 55/45 — Verde ganha bastante espaço para acomodar valores R$ grandes */}
            {/* LINHA ÚNICA: AZUL (55%) + COLUNA DIREITA empilhada (45%) */}
            <div className="grid grid-cols-[11fr_9fr] gap-3 mb-3">
              <BlocoDadosMovimentacao>
                <CompraDadosZootecnicos
                  lancamento={lancamento}
                  form={compraForm}
                  onFormChange={setCompraForm as React.Dispatch<React.SetStateAction<Lancamento>>}
                  statusMode={compraStatusMode}
                  onStatusModeChange={setCompraStatusMode}
                  canEditMeta={canEditMeta}
                  nomeFazendaDestino={nomeFazendaDoRegistro}
                  fornecedorId={fornecedorIdEdit}
                  onFornecedorChange={(id, nome) => {
                    setFornecedorIdEdit(id);
                    setFornecedorNomeEdit(nome);
                  }}
                  textoLegado={!fornecedorIdEdit ? (textoLegadoInicial ?? undefined) : undefined}
                  snapshotNome={snapshotNomeInicial ?? undefined}
                  clienteId={clienteIdLancamento}
                  observacao={compraForm.observacao ?? ''}
                  onObservacaoChange={v => setCompraForm(f => f ? { ...f, observacao: v } : f)}
                />
              </BlocoDadosMovimentacao>

              <div className="flex flex-col gap-3">
                <BlocoVinculoFinanceiro>
                  <CompraVinculoFinanceiroDisplay
                    records={finRecords}
                    contasMap={finContasMap}
                    loading={finLoading}
                    error={finError}
                    valorZootecnico={Number(compraForm.valorTotal ?? lancamento.valorTotal) || 0}
                    quantidade={Number(compraForm.quantidade) || 0}
                    pesoTotalKg={(Number(compraForm.quantidade) || 0) * (Number(compraForm.pesoMedioKg) || 0)}
                  />
                </BlocoVinculoFinanceiro>

                <BlocoAcoesFinanceiras>
                  <CompraAcoesFinanceiras
                    onGerarAtualizar={() => {
                      compraFinanceiroPanelRef.current?.generateFinanceiro(lancamento.id);
                    }}
                    onEditarFinanceiro={() => setEditFinSheetOpen(true)}
                    existingCount={existingFinCount}
                    realizedCount={realizedCount}
                    conciliadoCount={conciliadoCount}
                    disabled={!permissions.canEdit}
                  />
                </BlocoAcoesFinanceiras>
              </div>
            </div>

            {/* PR-V2E.0: Bloco Explicação da Diferença escondido temporariamente.
                Render condicional preserva import e permite reversão trivial. */}
            {false && <BlocoExplicacaoDiferenca />}

            {/* PR-V2E.0: RegrasEdicaoBar escondido temporariamente. */}
            {false && <RegrasEdicaoBar />}
          </ZooMovShell>

          {/* Drawer de edição financeira — abre por cima sem fechar o modal zoo. */}
          <EditarFinanceiroSheet
            open={editFinSheetOpen}
            onOpenChange={setEditFinSheetOpen}
            panelRef={compraFinanceiroPanelRef}
            quantidade={compraZooSaved ? Number(compraForm.quantidade) : lancamento.quantidade}
            pesoKg={compraZooSaved ? (compraForm.pesoMedioKg || 0) : (lancamento.pesoMedioKg || 0)}
            data={compraZooSaved ? compraForm.data : lancamento.data}
            categoria={(compraZooSaved ? compraForm.categoria : lancamento.categoria) as Categoria}
            statusOp={(() => {
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
            fazendaIdLancamento={fazendaIdLancamento || undefined}
            clienteIdLancamento={clienteIdLancamento || undefined}
            recalculoLocked={recalculoLocked}
            onFinanceiroUpdated={() => {
              setEditFinSheetOpen(false);
              setFinRefreshKey(k => k + 1);
              onEditSuccess?.();
            }}
          />

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
        </>
      );

    // BACKLOG — extrair FormVenda/FormAbate completos para dentro deste modal
    // (zoo + boitel/bônus/descontos + recálculo financeiro). Era previsto como
    // Fases A7/A8 mas foi desbloqueado em PR-E via redirect tático ao form
    // principal da aba "Lançamentos", que já edita venda/abate corretamente
    // (qtd, peso, categoria, fazenda, NF, fornecedor). Sem ETA para a versão
    // unificada — o redirect cobre 100% das operações.
    //
    // PR-E (redirect tático): se o caller forneceu `onAbrirNoFormPrincipal`,
    // substituímos o placeholder por um botão que redireciona ao form principal
    // da aba "Lançamentos" (que já edita venda/abate corretamente). Caller é
    // responsável pela navegação (set state no V2Index ou navigate por URL).
    // PR-VENDA-V2-FASE-1: case 'venda' agora renderiza in-modal (espelha
    // case 'compra'). case 'abate' permanece com o redirect tático original
    // — SEM alteração de comportamento do abate neste PR.
    case 'venda': {
      if (!vendaForm) return null;
      return (
        <ZooMovShell
          open={open}
          onOpenChange={onOpenChange}
          title="Editar Venda"
          subtitle={nomeFazendaDoRegistro}
          badgeMesFechado={badgeMesFechado}
          auditoriaSlot={
            <BlocoAuditoria
              lancamentoId={lancamento.id}
              createdAt={raw?.created_at}
              updatedAt={raw?.updated_at}
            />
          }
          custosOperacaoSlot={
            <VendaCustosOperacao
              calc={vendaCalc}
              comercial={vendaComercial}
              onComercialChange={setVendaComercial}
              records={finRecords}
              contasMap={finContasMap}
              loading={finLoading}
              onAbrirFinanceiro={onAbrirFinanceiroVinculado}
            />
          }
          footer={
            <div className="flex items-center justify-between">
              <Button
                variant="outline"
                size="sm"
                className="h-7 text-[11px] font-semibold text-red-700 border-red-300 hover:bg-red-50"
                onClick={() => onOpenChange(false)}
              >
                <Trash2 className="h-3 w-3 mr-1" />
                Cancelar Movimentação
              </Button>
              <div className="flex items-center gap-1.5">
                <Button
                  variant="outline"
                  size="sm"
                  className="h-7 text-[11px] font-medium"
                  onClick={() => onOpenChange(false)}
                >
                  Cancelar
                </Button>
                <Button
                  size="sm"
                  className="h-7 text-[11px] font-semibold bg-blue-600 hover:bg-blue-700"
                  onClick={handleSalvarVendaZoo}
                  disabled={vendaSaving || !vendaZooDirty}
                >
                  {vendaSaving ? 'Salvando…' : 'Salvar Alterações'}
                </Button>
              </div>
            </div>
          }
        >
          {/* Banner de bloqueio (apenas para reasons != 'mes_fechado'). */}
          {permissions.blockReason && permissions.blockReason !== 'mes_fechado' && (
            <BannerBloqueio reason={permissions.blockReason} />
          )}

          {!clienteIdLancamento && (
            <div className="flex items-start gap-2 px-3 py-2 rounded-md border bg-red-50 border-red-200 text-red-800 mb-3">
              <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
              <div className="text-xs">Cliente do lançamento não identificado.</div>
            </div>
          )}

          <div className="grid grid-cols-[11fr_9fr] gap-3 mb-3">
            <BlocoDadosMovimentacao>
              <VendaDadosZootecnicos
                lancamento={lancamento}
                form={vendaForm}
                onFormChange={setVendaForm as React.Dispatch<React.SetStateAction<Lancamento>>}
                comercial={vendaComercial}
                onComercialChange={setVendaComercial}
                statusMode={vendaStatusMode}
                onStatusModeChange={setVendaStatusMode}
                canEditMeta={canEditMeta}
                nomeFazendaOrigem={nomeFazendaDoRegistro}
                fornecedorId={fornecedorIdEdit}
                onFornecedorChange={(id, nome) => {
                  setFornecedorIdEdit(id);
                  setFornecedorNomeEdit(nome);
                }}
                textoLegado={!fornecedorIdEdit ? (textoLegadoInicial ?? undefined) : undefined}
                snapshotNome={snapshotNomeInicial ?? undefined}
                clienteId={clienteIdLancamento ?? ''}
                observacao={vendaForm.observacao ?? ''}
                onObservacaoChange={v => setVendaForm(f => f ? { ...f, observacao: v } : f)}
                calc={vendaCalc}
              />
            </BlocoDadosMovimentacao>

            <BlocoVinculoFinanceiro>
              <div className="px-3 py-4 text-[11px] text-muted-foreground italic">
                Vínculo financeiro será tratado na Fase 2. Aqui ficarão forma de
                recebimento, parcelas, conta bancária, datas e status financeiro.
              </div>
            </BlocoVinculoFinanceiro>
          </div>
        </ZooMovShell>
      );
    }

    case 'abate': {
      const tipoLabel = 'Abate';
      if (onAbrirNoFormPrincipal) {
        return (
          <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-md">
              <DialogHeader>
                <DialogTitle>Editar {tipoLabel} no formulário principal</DialogTitle>
                <DialogDescription>
                  A edição completa de {lancamento.tipo} (quantidade, peso,
                  categoria, fazenda, NF, fornecedor) acontece no formulário
                  principal da aba "Lançamentos". Vamos abrir o registro lá.
                </DialogDescription>
              </DialogHeader>
              <DialogFooter className="gap-2">
                <Button variant="outline" onClick={() => onOpenChange(false)}>
                  Cancelar
                </Button>
                <Button
                  onClick={() => {
                    onAbrirNoFormPrincipal(lancamento);
                    onOpenChange(false);
                  }}
                >
                  <ExternalLink className="h-4 w-4 mr-1.5" />
                  Abrir no formulário principal
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        );
      }
      // Fallback: caller não passou callback — manter placeholder honesto.
      return (
        <Dialog open={open} onOpenChange={onOpenChange}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>Edição de {tipoLabel} indisponível neste fluxo</DialogTitle>
              <DialogDescription>
                A edição completa de {lancamento.tipo} ainda passa pela aba "Lançamentos"
                (form principal). Esta unificação chega nas Fases A7/A8.
              </DialogDescription>
            </DialogHeader>
          </DialogContent>
        </Dialog>
      );
    }

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
