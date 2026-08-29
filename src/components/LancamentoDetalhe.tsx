import { useState, useMemo, useCallback, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Lancamento,
  CATEGORIAS,
  TODOS_TIPOS,
  Categoria,
  TipoMovimentacao,
  kgToArrobas,
} from '@/types/cattle';
import { useStatusPilares } from '@/hooks/useStatusPilares';
import { isEntrada, isReclassificacao } from '@/lib/calculos/zootecnicos';
import { nomeFazendaDoRegistro, campoFazendaEDerivado } from '@/lib/zoo/nomeFazendaDoRegistro';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle, AlertDialogDescription, AlertDialogFooter, AlertDialogCancel, AlertDialogAction } from '@/components/ui/alert-dialog';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { format, parseISO } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { Pencil, Trash2, DollarSign, AlertTriangle } from 'lucide-react';
import { AbateShareButtons } from '@/components/AbateExportMenu';
import { useFazenda } from '@/contexts/FazendaContext';
import { useCliente } from '@/contexts/ClienteContext';
import { useOcCompromissos } from '@/hooks/useOcCompromissos';
import { STATUS_OPTIONS_ZOOTECNICO_COM_META, getStatusBadge, getStatus, isMeta, type StatusOperacional } from '@/lib/statusOperacional';
import { CompraFinanceiroPanel } from '@/components/CompraFinanceiroPanel';
import { EditCompraForm } from '@/components/edit/EditCompraForm';
import { LancamentoZooModal } from '@/v2/components/edicao/LancamentoZooModal';
import { EditNascimentoSheet } from '@/components/edit/EditNascimentoSheet';
import { EditMorteSheet } from '@/components/edit/EditMorteSheet';
import { EditTransferenciaSheet } from '@/components/edit/EditTransferenciaSheet';
import { EditConsumoSheet } from '@/components/edit/EditConsumoSheet';
import { EditReclassificacaoSheet } from '@/components/edit/EditReclassificacaoSheet';
import { supabase } from '@/integrations/supabase/client';
import { formatMoeda, formatKg, formatArroba, formatPercent } from '@/lib/calculos/formatters';
import { calcValorTotal, calcArrobas, calcIndicadoresLancamento } from '@/lib/calculos/economicos';
import { toast } from 'sonner';

interface Props {
  lancamento: Lancamento;
  open: boolean;
  onClose: () => void;
  onEditar: (id: string, dados: Partial<Omit<Lancamento, 'id'>>) => void;
  onRemover: (id: string) => void;
  onCountFinanceiros?: (id: string) => Promise<number>;
  onEditarAbate?: (lancamento: Lancamento) => void;
  onEditarVenda?: (lancamento: Lancamento) => void;
  onEditarCompra?: (lancamento: Lancamento) => void;
  onEditarTransferencia?: (lancamento: Lancamento) => void;
  onEditarReclass?: (lancamento: Lancamento) => void;
  onEditarMorte?: (lancamento: Lancamento) => void;
  onEditarConsumo?: (lancamento: Lancamento) => void;
  fazendaId?: string;
}

export function LancamentoDetalhe({ lancamento, open, onClose, onEditar, onRemover, onCountFinanceiros, onEditarAbate, onEditarVenda, onEditarCompra, onEditarTransferencia, onEditarReclass, onEditarMorte, onEditarConsumo, fazendaId }: Props) {
  const navigate = useNavigate();
  const { fazendaAtual, fazendas } = useFazenda();
  // Bug 1.2: nome da fazenda DO LANÇAMENTO (texto persistido > lookup pelo
  // UUID fazendaId > vazio). NUNCA cair em FazendaContext, pois em modo
  // Global esse nome vira "Global" e polui o banco. Usado APENAS para
  // display e write de campos TEXTO em `lancamentos` (fazendaOrigem/Destino).
  // Para INSERTs financeiros, sempre usar `lancamento.fazendaId` (UUID).
  const nomeFazendaResolvido = useMemo(() => {
    if (lancamento.fazendaDestino) return lancamento.fazendaDestino;
    const fz = fazendas.find(f => f.id === lancamento.fazendaId);
    return fz?.nome || '';
  }, [lancamento.fazendaDestino, lancamento.fazendaId, fazendas]);
  // PR-UI-LANC-CARD-FAZENDA-01 — LEITURA de exibição, precedência UUID-first,
  // a mesma que o painel de edição ao lado (LancamentoZooModal) já usava.
  // ⚠ Coexiste de propósito com `nomeFazendaResolvido` acima, que é TEXT-first
  // e alimenta os WRITES (linhas 265 e 312). Mudar aquele mudaria o que se
  // grava — fora do escopo deste PR. Unificar os dois é dívida declarada.
  const nomeFazendaRegistro = useMemo(
    () => nomeFazendaDoRegistro(lancamento, fazendas),
    [lancamento, fazendas],
  );
  const nomeFazenda = fazendaAtual?.nome || '';
  const outrasFazendas = useMemo(() => fazendas.filter(f => f.id !== fazendaAtual?.id), [fazendas, fazendaAtual]);
  const lancamentoIsMeta = isMeta(lancamento);
  // Bug 2: na edição OPERACIONAL de lançamentos zoo, "Meta" não é opção
  // de menu — é ESTADO do lançamento. Antes vinha de usePermissions
  // (permissão de criar Meta no Planejamento), o que era semanticamente
  // errado: permitia trocar cenário realizado→meta pela edição operacional.
  // Regra soberana: Meta só aparece quando o lançamento JÁ é Meta.
  const canEditMeta = lancamentoIsMeta;
  // metaLocked = "Meta sem permissão para editar". Antes dependia da
  // permissão do usuário; agora, com canEditMeta = lancamentoIsMeta, a
  // expressão é sempre false (preserva forma para usos downstream e evita
  // remoção arriscada de condicionais).
  const metaLocked = lancamentoIsMeta && !canEditMeta;

  // ─── P1 governance for this lancamento's month ───
  const lancAnoMes = useMemo(() => lancamento.data?.slice(0, 7), [lancamento.data]);
  const { status: statusPilaresLanc } = useStatusPilares(fazendaId, lancAnoMes);
  const p1Oficial = statusPilaresLanc.p1_mapa_pastos.status === 'oficial';
  // P1 fechado bloqueia apenas cenario='realizado'. Meta é projeção (trigger
  // trg_guard_lancamento_mes_fechado_p1 bypassa Meta no banco) — front segue
  // a mesma regra. Base é lancamento.cenario original (não form pendente).
  const effectiveP1Oficial = p1Oficial && !lancamentoIsMeta;

  // Campos zootécnicos estruturais (afetam conciliação, saldo, GMD, fluxo)
  const CAMPOS_ESTRUTURAIS: (keyof Lancamento)[] = [
    'data', 'tipo', 'quantidade', 'categoria', 'categoriaDestino',
    'fazendaOrigem', 'fazendaDestino',
  ];

  /** Verifica se houve alteração em campos zootécnicos estruturais */
  function temAlteracaoEstrutural(original: Lancamento, editado: Partial<Lancamento>): boolean {
    return CAMPOS_ESTRUTURAIS.some(campo => {
      if (!(campo in editado)) return false;
      const valOrig = (original as any)[campo] ?? '';
      const valEdit = (editado as any)[campo] ?? '';
      return String(valOrig) !== String(valEdit);
    });
  }

  const [p1BloqueioMsg, setP1BloqueioMsg] = useState<string | null>(null);
  const [editando, setEditando] = useState(false);
  const [form, setForm] = useState({ ...lancamento });
  /** UI-only: tracks whether 'meta' is selected in the status toggle (for edit forms) */
  const [formStatusMode, setFormStatusMode] = useState<'realizado' | 'programado' | 'meta'>(
    lancamentoIsMeta ? 'meta' : ((lancamento.statusOperacional as any) || 'realizado')
  );

  // Confirmation modal state
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [financeiroCount, setFinanceiroCount] = useState(0);
  const [checkingVinculos, setCheckingVinculos] = useState(false);
  const [notaFiscalEdit, setNotaFiscalEdit] = useState(lancamento.notaFiscal || '');

  // Etapa 1 — sheet padronizado para Nascimento (substitui Dialog genérico)
  const [nascimentoEditOpen, setNascimentoEditOpen] = useState(false);
  // Etapa 2 — sheet padronizado para Morte (substitui Dialog genérico)
  const [morteEditOpen, setMorteEditOpen] = useState(false);
  // Etapa 3 — sheet padronizado para Transferência saída (substitui Dialog genérico)
  const [transferenciaEditOpen, setTransferenciaEditOpen] = useState(false);
  // Etapa 4 — sheet padronizado para Consumo (substitui Dialog genérico)
  const [consumoEditOpen, setConsumoEditOpen] = useState(false);
  // Etapa 5 — sheet padronizado para Reclassificação (substitui Dialog genérico)
  const [reclassificacaoEditOpen, setReclassificacaoEditOpen] = useState(false);

  // Atalho arquitetural: entrypoint soberano de edição (carrega por id).
  // Substitui os caminhos paralelos antigos (navegação para aba lancamentos,
  // sheets locais espalhados). state legado abaixo permanece declarado para
  // não quebrar JSX dos sheets antigos (que continuam montados sem efeito).
  const [zooModalOpen, setZooModalOpen] = useState(false);

  // Unified purchase edit sheet
  const [compraEditSheetOpen, setCompraEditSheetOpen] = useState(false);
  const [compraForm, setCompraForm] = useState({ ...lancamento });
  const [compraStatusMode, setCompraStatusMode] = useState<'realizado' | 'programado' | 'meta'>(
    lancamentoIsMeta ? 'meta' : ((lancamento.statusOperacional as any) || 'realizado')
  );
  const [compraSaving, setCompraSaving] = useState(false);
  const [compraZooSaved, setCompraZooSaved] = useState(false);

  // Financial records summary for purchases
  interface FinResumo { id: string; descricao: string; valor: number; data_pagamento: string | null; cancelado: boolean; origem_tipo: string | null; }
  const [finRecords, setFinRecords] = useState<FinResumo[]>([]);

  /* ── PR-ZOOT-MODAL-RESUMO-01 · VINCULO PELA OPERACAO COMERCIAL ─────────────
     `finRecords` acima busca por `movimentacao_rebanho_id`, que e' o vinculo do fluxo
     LEGADO (compra antiga -> titulo direto). Na OC esse campo NAO existe, e por isso o
     modal dizia "nenhum lancamento financeiro" para 26 compras que tinham titulo pago.
     O caminho da OC tem seis saltos (lancamento -> ligacao -> operacao -> compromisso
     -> programacao -> parcela -> parte -> titulo). NAO os reconstruo aqui: duas VIEWS
     ja entregam o resultado pronto por `operacao_id`, e `useOcCompromissos` ja e' o
     leitor delas. Do front sai apenas UM salto — descobrir a operacao do lancamento.
     ⚠ `zoo_operacao_movimentacoes` nao esta em types.ts (conferido); `as any` no nome
     da tabela e' o idioma ja estabelecido no repo para as tabelas zoo_*. */
  const { clienteAtual } = useCliente();
  const [ocOperacaoId, setOcOperacaoId] = useState<string | null>(null);
  const [ocBuscando, setOcBuscando] = useState(false);
  /* Reusa o leitor das views (`vw_oc_compromissos_resumo` e
     `vw_oc_parcelas_materializacao`) em vez de escrever uma segunda consulta para os
     mesmos dados. `enabled` desliga tudo quando o lancamento nao vem de OC. */
  const ocApi = useOcCompromissos({
    operacaoId: ocOperacaoId,
    clienteId: clienteAtual?.id ?? null,
    enabled: !!ocOperacaoId && !!clienteAtual?.id,
  });
  const ocPrincipal = ocApi.compromissos.filter(c => c.natureza === 'principal' && c.status !== 'cancelado');
  const ocObrigacoes = ocApi.compromissos.filter(c => c.natureza === 'obrigacao' && c.status !== 'cancelado');
  const temOC = !!ocOperacaoId && ocApi.compromissos.length > 0;
  const [finLoading, setFinLoading] = useState(false);
  const [detalheFornecedorId, setDetalheFornecedorId] = useState('');

  const isCompra = lancamento.tipo === 'compra';
  const isAbate = lancamento.tipo === 'abate';
  const isVenda = lancamento.tipo === 'venda';
  const isTransferenciaSaida = lancamento.tipo === 'transferencia_saida';

  const loadFinRecords = useCallback(() => {
    if (!isCompra) return;
    setOcBuscando(true);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (supabase as any)
      .from('zoo_operacao_movimentacoes')
      .select('operacao_id')
      .eq('movimentacao_id', lancamento.id)
      .maybeSingle()
      .then(({ data }: { data: { operacao_id: string } | null }) => {
        setOcOperacaoId(data?.operacao_id ?? null);
        setOcBuscando(false);
      });

    setFinLoading(true);
    supabase
      .from('financeiro_lancamentos_v2')
      .select('id, descricao, valor, data_pagamento, cancelado, origem_tipo, favorecido_id')
      .eq('movimentacao_rebanho_id', lancamento.id)
      .eq('cancelado', false)
      .order('data_pagamento', { ascending: true })
      .then(({ data }) => {
        setFinRecords((data as FinResumo[]) || []);
        setFinLoading(false);
        const favId = (data as any[])?.[0]?.favorecido_id;
        if (favId && !detalheFornecedorId) setDetalheFornecedorId(favId);
      });
  }, [isCompra, lancamento.id, detalheFornecedorId]);

  useEffect(() => {
    if (open) loadFinRecords();
  }, [open, loadFinRecords]);

  const tipoInfo = TODOS_TIPOS.find(t => t.value === lancamento.tipo);
  const catInfo = CATEGORIAS.find(c => c.value === lancamento.categoria);

  const isTransferenciaEntrada = lancamento.tipo === 'transferencia_entrada';

  // ---- Handle edit click ----
  // Atalho arquitetural: edição soberana via LancamentoZooModal.
  // Ignora callbacks legados onEditarAbate/Venda/Compra/etc. (que navegavam
  // para aba lancamentos) e os Sheets inline antigos. Para abate/venda, o
  // modal mostra placeholder honesto (TODO Fase A7/A8). Demais tipos abrem
  // os Edit*Sheets existentes reroteados pelo modal.
  const handleEditClick = () => {
    // Fonte única de edição de Compra (PR-OC-ENTRYPOINT-UNIFY-01): decisão pelo VÍNCULO OFICIAL da
    //   ponte (operacaoId), nunca por heurística. Com OC → CompraModalShell (modal novo), mesma
    //   navegação da Central. Sem OC → editor legado atual.
    if (lancamento.tipo === 'compra') {
      if (lancamento.operacaoId) {
        window.location.assign(`/v2?oc_compra=1&oc_id=${lancamento.operacaoId}`);
        return;
      }
      if (lancamento.origemRegistro === 'operacao_comercial') {
        // Sinalizada como OC mas sem vínculo na ponte (ausente/inconsistente): NÃO abrir o legado —
        //   reabriria o risco de divergência que este PR elimina. Permanece na tela.
        toast.error('Não foi possível localizar a Operação Comercial de origem.');
        return;
      }
    }
    setZooModalOpen(true);
  };

  // ---- Simple edit save (non-purchase) ----
  const handleSalvar = () => {
    const isSaidaAuto = ['abate', 'venda', 'transferencia_saida', 'consumo', 'morte'].includes(form.tipo);
    const isEntradaAuto = ['nascimento', 'compra', 'transferencia_entrada'].includes(form.tipo);

    const dados: Partial<Omit<Lancamento, 'id'>> = {
      data: form.data,
      tipo: form.tipo,
      quantidade: Number(form.quantidade),
      categoria: form.categoria,
      categoriaDestino: form.categoriaDestino,
      // Bug 1.2: nome da fazenda do registro resolvido (texto > lookup UUID),
      // nunca do FazendaContext.
      fazendaOrigem: isSaidaAuto ? (nomeFazendaResolvido || undefined) : (form.fazendaOrigem || undefined),
      fazendaDestino: isEntradaAuto ? (nomeFazendaResolvido || undefined) : (form.fazendaDestino || undefined),
      pesoMedioKg: form.pesoMedioKg ? Number(form.pesoMedioKg) : undefined,
      pesoMedioArrobas: form.pesoMedioKg ? kgToArrobas(Number(form.pesoMedioKg)) : undefined,
      precoMedioCabeca: form.precoMedioCabeca ? Number(form.precoMedioCabeca) : undefined,
      cenario: formStatusMode === 'meta' ? 'meta' : 'realizado',
      statusOperacional: formStatusMode === 'meta' ? null : (form.statusOperacional || null),
    };

    // P1 selective block: only block if structural fields changed
    if (effectiveP1Oficial && temAlteracaoEstrutural(lancamento, dados as Partial<Lancamento>)) {
      setP1BloqueioMsg('Alteração não salva. Este mês está fechado no Mapa de Pastos. Campos zootécnicos que afetam conciliação (data, quantidade, categoria, fazenda) não podem ser alterados após o fechamento. Campos financeiros/comerciais (peso, preço, observação) podem ser editados.');
      return;
    }
    setP1BloqueioMsg(null);

    onEditar(lancamento.id, dados);
    setEditando(false);
    onClose();
  };

  // ---- Purchase zootécnico — detector de mudança ----
  // Compara compraForm com o lancamento original. Se nada mudou, BLOCO 2
  // (financeiro) é liberado sem exigir o "1. Salvar zoo".
  const compraZooDirty = useMemo(() => {
    if (!isCompra) return false;
    const cenarioForm = compraStatusMode === 'meta' ? 'meta' : 'realizado';
    const statusForm  = compraStatusMode === 'meta' ? null : (compraForm.statusOperacional || null);
    return (
      compraForm.data !== lancamento.data ||
      Number(compraForm.quantidade) !== Number(lancamento.quantidade) ||
      Number(compraForm.pesoMedioKg ?? 0) !== Number(lancamento.pesoMedioKg ?? 0) ||
      compraForm.categoria !== lancamento.categoria ||
      (compraForm.fazendaOrigem || '') !== (lancamento.fazendaOrigem || '') ||
      cenarioForm !== (lancamento.cenario || 'realizado') ||
      statusForm !== (lancamento.statusOperacional ?? null)
    );
  }, [isCompra, compraForm, compraStatusMode, lancamento]);

  // ---- Purchase zootécnico save ----
  const handleSalvarCompraZoo = async () => {
    const dados: Partial<Lancamento> = {
      data: compraForm.data,
      tipo: compraForm.tipo,
      quantidade: Number(compraForm.quantidade),
      categoria: compraForm.categoria,
      fazendaOrigem: compraForm.fazendaOrigem || undefined,
      // Bug 1.2: usa nome resolvido (texto persistido > lookup pela fazendaId).
      fazendaDestino: nomeFazendaResolvido,
      pesoMedioKg: compraForm.pesoMedioKg ? Number(compraForm.pesoMedioKg) : undefined,
      pesoMedioArrobas: compraForm.pesoMedioKg ? kgToArrobas(Number(compraForm.pesoMedioKg)) : undefined,
      // pesoTotal: derivação pura (qtd × pesoMedio). Sem decisão de fonte financeira.
      // valorTotal e precoUnitario ficam fora deste PR — frente B-Sync (sincronização zoot↔financeiro) pendente.
      pesoTotal: compraForm.pesoMedioKg && compraForm.quantidade
        ? Math.round(Number(compraForm.quantidade) * Number(compraForm.pesoMedioKg) * 100) / 100
        : undefined,
      cenario: compraStatusMode === 'meta' ? 'meta' : 'realizado',
      statusOperacional: compraStatusMode === 'meta' ? null : (compraForm.statusOperacional || null),
    };

    if (effectiveP1Oficial && temAlteracaoEstrutural(lancamento, dados)) {
      setP1BloqueioMsg('Alteração não salva. Este mês está fechado no Mapa de Pastos. Campos zootécnicos que afetam conciliação (data, quantidade, categoria, fazenda) não podem ser alterados após o fechamento. Campos financeiros/comerciais podem ser editados.');
      return;
    }
    setP1BloqueioMsg(null);

    setCompraSaving(true);
    try {
      await onEditar(lancamento.id, dados);
      setCompraZooSaved(true);
      toast.success('Dados zootécnicos atualizados.');
    } catch (e: any) {
      toast.error('Falha ao salvar dados zootécnicos: ' + (e?.message || 'erro desconhecido'));
    } finally {
      setCompraSaving(false);
    }
  };

  // ---- Deletion ----
  const handleRemoverClick = useCallback(async () => {
    if (onCountFinanceiros) {
      setCheckingVinculos(true);
      try {
        const count = await onCountFinanceiros(lancamento.id);
        setFinanceiroCount(count);
        setConfirmOpen(true);
      } finally {
        setCheckingVinculos(false);
      }
    } else {
      setFinanceiroCount(0);
      setConfirmOpen(true);
    }
  }, [lancamento.id, onCountFinanceiros]);

  const handleConfirmRemover = async () => {
    setConfirmOpen(false);
    await onRemover(lancamento.id);
    onClose();
  };

  // ===================== VIEW MODE =====================
  if (!editando) {
    const entrada = isEntrada(lancamento.tipo);
    const reclass = isReclassificacao(lancamento.tipo);
    const catDestinoInfo = lancamento.categoriaDestino
      ? CATEGORIAS.find(c => c.value === lancamento.categoriaDestino)
      : null;

    const statusBadge = getStatusBadge(lancamento);
    const ind = calcIndicadoresLancamento(lancamento);
    const totalArrobas = calcArrobas(lancamento);
    const valorTotalCalc = calcValorTotal(lancamento);

    // Helper for a detail row
    const Row = ({ label, value, className = '' }: { label: string; value: React.ReactNode; className?: string }) => (
      <div className={className}>
        <p className="text-[9px] text-muted-foreground leading-none mb-0.5">{label}</p>
        <p className="font-bold text-foreground text-[11px] leading-tight tabular-nums">{value}</p>
      </div>
    );

    /* ── PR-UI-LANC-RESULTADO-4-COLUNAS-01 ──────────────────────────────────────
       Cada linha do resultado passa a mostrar, alem do total, quanto ela representa
       POR CABECA, POR QUILO e POR ARROBA. E' o que responde "quanto o desconto comeu
       da arroba" sem ninguem abrir a calculadora.
       ⚠ RAZAO DE AGREGADOS, nunca media de razoes: divide-se o total da linha pela
       base total. As bases vem de `calcIndicadoresLancamento` (`ind`), que ja aplica
       a regra certa — carcaca/15 no abate, peso vivo/30 no resto — e por isso nenhuma
       divisao nova foi escrita aqui.
       ⚠ AS BASES DE kg E @ SAO DIFERENTES NO ABATE: kg e' peso VIVO, @ e' CARCACA.
       Ver as duas lado a lado parece contradicao ate se ler a linha de base — e' por
       isso que ela e' obrigatoria e nao decorativa. */
    const baseCab = lancamento.quantidade;
    const baseKg = ind.pesoTotalKg;
    const baseArroba = ind.pesoTotalArrobas;

    /** Deriva valor/base. NULL quando nao ha o que dividir — e '—' na tela.
     *  ⚠ Sem `?? 0`: zero e' resultado real de uma divisao que aconteceu; traco e'
     *  a ausencia de divisao. Trocar um pelo outro faz o card afirmar o que nao sabe. */
    const porBase = (valor: number | null, base: number): number | null =>
      valor === null || !(base > 0) ? null : valor / base;

    /** Uma linha do resultado: rotulo + total + as tres derivadas.
     *  `sinal` prefixa os quatro valores; `tom` pinta a linha INTEIRA. */
    const LinhaResultado = ({ rotulo, valor, sinal = '', tom = 'neutro', forte = false }: {
      rotulo: string; valor: number | null;
      sinal?: '' | '+' | '-';
      tom?: 'neutro' | 'soma' | 'subtrai';
      forte?: boolean;
    }) => {
      /* Classes de estado ja usadas neste arquivo — nenhum hex novo. Totalizadora fica
         sem cor de sinal de proposito: ela nao soma nem subtrai, ela conclui. */
      const cor = tom === 'soma' ? 'text-green-600 dark:text-green-400'
        : tom === 'subtrai' ? 'text-destructive' : '';
      const celula = (v: number | null) => v === null ? '—' : `${sinal}${formatMoeda(v)}`;
      return (
        <div className={`grid grid-cols-[1fr_100px_84px_66px_70px] gap-x-1.5 items-baseline ${forte ? 'font-bold' : ''}`}>
          <span className={cor || 'text-muted-foreground'}>{rotulo}</span>
          <span className={`text-right tabular-nums text-[13px] ${cor}`}>{celula(valor)}</span>
          <span className={`text-right tabular-nums text-[13px] ${cor}`}>{celula(porBase(valor, baseCab))}</span>
          <span className={`text-right tabular-nums text-[13px] ${cor}`}>{celula(porBase(valor, baseKg))}</span>
          <span className={`text-right tabular-nums text-[13px] ${cor}`}>{celula(porBase(valor, baseArroba))}</span>
        </div>
      );
    };

    const CabecalhoResultado = () => (
      <div className="grid grid-cols-[1fr_100px_84px_66px_70px] gap-x-1.5 text-[11px] text-muted-foreground">
        <span />
        <span className="text-right">total</span>
        <span className="text-right">por cab.</span>
        <span className="text-right">por kg</span>
        <span className="text-right">por @</span>
      </div>
    );

    return (
      <>
        <Dialog open={open} onOpenChange={onClose}>
          {/* ⚠ 620px, e nao os 512 do `max-w-lg`. Quatro colunas de valor nao cabem em
              512: um valor como R$ 111.328,13 em 13px ocupa ~95px, e quatro deles mais o
              rotulo estouram a largura util. A alternativa seria reduzir a fonte, que e'
              justamente o que nao se faz — o piso de leitura e' 10px (A21). */}
          <DialogContent className="max-w-[620px]">
            <DialogHeader className="pb-0">
              <DialogTitle className="flex items-center gap-2 text-sm">
                <span className="text-lg">{tipoInfo?.icon}</span>
                {tipoInfo?.label}
                <span className={`ml-1 text-[10px] font-bold px-2 py-0.5 rounded-full ${statusBadge.cls}`}>
                  {statusBadge.label}
                </span>
              </DialogTitle>
            </DialogHeader>

            <div className="space-y-1.5">
              {/* ── Dados operacionais ── */}
              <div className="grid grid-cols-3 gap-x-3 gap-y-1 text-[11px]">
                <Row label={isAbate ? 'Data do Abate' : 'Data'} value={format(parseISO(lancamento.data), 'dd/MM/yyyy', { locale: ptBR })} />
                <Row
                  label="Quantidade"
                  value={
                    <span className={entrada ? 'text-green-700 dark:text-green-400' : reclass ? '' : 'text-destructive'}>
                      {entrada ? '+' : reclass ? '' : '-'}{lancamento.quantidade} cab.
                    </span>
                  }
                />
                <Row label="Categoria" value={catInfo?.label || '-'} />

                {/* PR-ZOOT-MODAL-RESUMO-01 — o fornecedor passou a ser gravado nas compras
                    de OC (20260901120000 + backfill). O literal '[nao informado]' NAO chega
                    aqui: `useLancamentos` ja o converte em undefined (linha 100), entao a
                    linha some sozinha quando nao ha fornecedor — ausencia declarada, sem
                    ruido de banco na tela. */}
                {lancamento.fornecedorNomeSnapshot && (
                  <Row label="Fornecedor" value={lancamento.fornecedorNomeSnapshot} />
                )}

                {catDestinoInfo && <Row label="Cat. Destino" value={catDestinoInfo.label} />}

                {lancamento.pesoMedioKg && (
                  <Row label="Peso Médio" value={`${formatKg(lancamento.pesoMedioKg)} (${formatArroba(ind.pesoArroba)})`} />
                )}

                {/* PR-UI-LANC-CARD-FAZENDA-01 — o LADO DERIVADO lê o registro
                    (UUID), não a cópia textual. O lado não derivado é dado de
                    verdade (frigorífico, comprador, motivo, outra fazenda) e
                    segue cru. As GUARDAS não mudaram: as mesmas linhas
                    aparecem e somem nas mesmas condições de antes. */}
                {lancamento.fazendaOrigem && (
                  <Row label="Fazenda Origem" value={campoFazendaEDerivado(lancamento.tipo, 'origem') ? nomeFazendaRegistro : lancamento.fazendaOrigem} />
                )}
                {(lancamento.fazendaDestino || (isAbate && (lancamento.compradorFornecedor || (lancamento as any).abateFrigorifico))) && (
                  <Row label={isAbate ? 'Frigorífico' : lancamento.tipo === 'morte' ? 'Motivo da Morte' : lancamento.tipo === 'consumo' ? 'Motivo' : 'Fazenda Destino'} value={isAbate ? (lancamento.fazendaDestino || lancamento.compradorFornecedor || (lancamento as any).abateFrigorifico) : (campoFazendaEDerivado(lancamento.tipo, 'destino') ? nomeFazendaRegistro : lancamento.fazendaDestino)} />
                )}
                {(lancamento.tipo === 'morte' || lancamento.tipo === 'consumo') && lancamento.notaFiscal && (
                  <Row label="Identificação" value={lancamento.notaFiscal} />
                )}
              </div>

              {/* ── Abate: campos específicos ── */}
              {isAbate && (
                <>
                  <Separator className="my-0.5" />
                  <div className="grid grid-cols-3 gap-x-3 gap-y-1 text-[11px]">
                    {lancamento.dataVenda && <Row label="Data Venda" value={format(parseISO(lancamento.dataVenda), 'dd/MM/yyyy')} />}
                    {lancamento.dataEmbarque && <Row label="Data Embarque" value={format(parseISO(lancamento.dataEmbarque), 'dd/MM/yyyy')} />}
                    {lancamento.dataAbate && <Row label="Data Abate" value={format(parseISO(lancamento.dataAbate), 'dd/MM/yyyy')} />}
                    {lancamento.tipoVenda && (
                      <Row label="Comercialização" value={{ escala: 'Escala', a_termo: 'A termo', spot: 'Spot', outro: 'Outro' }[lancamento.tipoVenda] || lancamento.tipoVenda} />
                    )}
                    {lancamento.tipoPeso && (
                      <Row label="Tipo de Abate" value={{ vivo: 'Peso vivo', morto: 'Peso morto' }[lancamento.tipoPeso] || lancamento.tipoPeso} />
                    )}
                    {lancamento.pesoCarcacaKg && <Row label="Peso Carcaça" value={formatKg(lancamento.pesoCarcacaKg)} />}
                    {lancamento.pesoCarcacaKg && lancamento.pesoMedioKg && ind.rendimento > 0 && (
                      <Row label="Rendimento" value={formatPercent(ind.rendimento)} />
                    )}
                    {lancamento.precoArroba && <Row label="R$/@ Base" value={formatMoeda(lancamento.precoArroba)} />}
                  </div>
                </>
              )}

              {/* ── Bloco financeiro resumido ── */}
              {isAbate && valorTotalCalc > 0 ? (
                <>
                  <Separator className="my-0.5" />
                  {(() => {
                    const snap = lancamento.detalhesSnapshot as any;
                    const snapCalc = snap?.calculation;
                    const valorBase = snapCalc?.valorBase ?? ((totalArrobas || 0) * (lancamento.precoArroba || 0));
                    const funruralTotal = snapCalc?.funruralTotal ?? (lancamento.descontoFunrural || 0);
                    const valorBruto = snapCalc?.valorBruto ?? (valorBase - funruralTotal);
                    /* ⚠ AUSENCIA E' TRACO, ZERO E' VALOR. Bonus e desconto que nao existem
                       tem de sair como '—'; um que existe e vale R$ 0,04 divide-se, arredonda
                       para R$ 0,00 e mostra zero — porque zero ali e' resultado medido.
                       `somaOuNull` devolve null quando NENHUMA das parcelas foi informada, e
                       so' entao a linha some. Era o `|| 0` que apagava a diferenca. */
                    const somaOuNull = (...vs: (number | null | undefined)[]) =>
                      vs.every(v => v === null || v === undefined) ? null : vs.reduce((a: number, v) => a + (v || 0), 0);
                    const bonusTotal = snapCalc?.totalBonus ?? somaOuNull(lancamento.bonusPrecoce, lancamento.bonusQualidade, lancamento.bonusListaTrace);
                    const descontosTotal = snapCalc?.totalDescontos ?? somaOuNull(lancamento.descontoQualidade, lancamento.outrosDescontos);
                    const valorLiquido = snapCalc?.valorLiquido ?? valorTotalCalc;
                    return (
                      <>
                        <div className="space-y-0.5 text-[12px]">
                          <CabecalhoResultado />
                          <LinhaResultado rotulo="Valor Base" valor={valorBase} />
                          <LinhaResultado rotulo="Bônus" valor={bonusTotal} sinal="+" tom="soma" />
                          <LinhaResultado rotulo="Descontos" valor={descontosTotal} sinal="-" tom="subtrai" />
                          <LinhaResultado rotulo="Valor Bruto" valor={valorBruto} forte />
                          {funruralTotal > 0 && (
                            <LinhaResultado rotulo="Funrural" valor={funruralTotal} sinal="-" tom="subtrai" />
                          )}
                          {/* ⚠ ULTIMA LINHA DA TABELA, e nao mais um bloco separado abaixo:
                              R$/cab, R$/kg e R$/@ liquidos sao exatamente as tres colunas
                              desta linha. O bloco de indicadores que os repetia saiu. */}
                          <LinhaResultado rotulo="Valor Líquido (NF)" valor={valorLiquido} forte />
                        </div>
                        {/* LINHA DE BASE — obrigatoria. Sem ela, R$/kg e R$/@ no abate
                            parecem incoerentes entre si, porque nao dividem o mesmo peso. */}
                        <p className="text-[11px] text-muted-foreground">
                          {lancamento.quantidade} cab · {formatKg(baseKg)} vivo{baseArroba > 0 ? ` · ${formatArroba(baseArroba)} de carcaça` : ''}
                        </p>
                      </>
                    );
                  })()}
                </>
              ) : isVenda && (() => {
                const snap = lancamento.detalhesSnapshot as any;
                const vc = snap?._tipo === 'venda' ? snap : (snap?.type === 'venda_boitel' ? snap : (snap?.calculation || null));
                if (!vc || (!vc.valorBruto && !vc.tipoVenda)) return false;
                return true;
              })() ? (
                <>
                  <Separator className="my-0.5" />
                  {(() => {
                    const snap = lancamento.detalhesSnapshot as any;
                    const isBoitelSnap = snap?.type === 'venda_boitel';
                    const vc = snap?._tipo === 'venda' ? snap : snap;
                    return (
                      <>
                        {isBoitelSnap ? (
                          <div className="space-y-0.5 text-[10px]">
                            <div className="flex justify-between"><span className="text-muted-foreground">Tipo</span><strong>Boitel</strong></div>
                            <div className="flex justify-between"><span className="text-muted-foreground">Qtde</span><strong>{lancamento.quantidade} cab.</strong></div>
                            {vc.pesoKg > 0 && <div className="flex justify-between"><span className="text-muted-foreground">Peso Inicial</span><strong>{formatKg(vc.pesoKg)}</strong></div>}
                          </div>
                        ) : (
                          <>
                            <div className="space-y-0.5 text-[10px]">
                              <div className="flex justify-between"><span className="text-muted-foreground">Valor Bruto</span><strong className="tabular-nums">{formatMoeda(vc.valorBruto || vc.valorBase)}</strong></div>
                              {(vc.totalDespesas > 0) && (
                                <div className="flex justify-between"><span className="text-muted-foreground">– Despesas</span><strong className="text-orange-600 dark:text-orange-400 tabular-nums">-{formatMoeda(vc.totalDespesas)}</strong></div>
                              )}
                              {(vc.totalDeducoes > 0 || vc.funruralTotal > 0) && (
                                <div className="flex justify-between"><span className="text-muted-foreground">– Deduções</span><strong className="text-destructive tabular-nums">-{formatMoeda(vc.totalDeducoes || vc.funruralTotal)}</strong></div>
                              )}
                            </div>
                            <div className="bg-primary/10 rounded px-2.5 py-1.5 flex items-center justify-between">
                              <span className="text-[10px] text-muted-foreground font-medium">Valor Líquido</span>
                              <span className="font-extrabold text-primary text-base tabular-nums">{formatMoeda(vc.valorLiquido)}</span>
                            </div>
                            <div className="grid grid-cols-4 gap-x-2 gap-y-0.5 text-[10px]">
                              <Row label="Qtde" value={`${lancamento.quantidade} cab.`} />
                              {vc.totalArrobas > 0 && <Row label="Total @" value={formatArroba(vc.totalArrobas)} />}
                              {vc.liqArroba > 0 && <Row label="R$/@ líq." value={formatMoeda(vc.liqArroba)} />}
                              {vc.liqCabeca > 0 && <Row label="R$/cab líq." value={formatMoeda(vc.liqCabeca)} />}
                              {vc.liqKg > 0 && <Row label="R$/kg líq." value={formatMoeda(vc.liqKg)} />}
                            </div>
                          </>
                        )}
                      </>
                    );
                  })()}
                </>
              ) : valorTotalCalc > 0 ? (
                <>
                  <Separator className="my-0.5" />
                  <div className="grid grid-cols-3 gap-x-3 gap-y-1 text-[11px]">
                    {totalArrobas && totalArrobas > 0 && (
                      <Row label="Total Arrobas" value={formatArroba(totalArrobas)} />
                    )}
                    {ind.liqCabeca > 0 && (
                      <Row label="R$/Cabeça" value={formatMoeda(ind.liqCabeca)} />
                    )}
                    {/* PR-ZOOT-MODAL-RESUMO-01 — em COMPRA o produtor negocia por QUILO;
                        a arroba e' a unidade do ABATE, onde se paga carcaca. Os blocos de
                        abate e venda seguem em R$/@ e NAO foram tocados.
                        ⚠ Sem formula nova: `liqKg` ja existia em `calcIndicadoresLancamento`
                        (economicos.ts:177), ao lado de `liqArroba`. A guarda mudou junto —
                        R$/kg depende do peso, nao das arrobas. */}
                    {ind.liqKg > 0 && (
                      <Row label="R$/kg Líq." value={formatMoeda(ind.liqKg)} />
                    )}
                  </div>
                  <div className="bg-primary/10 rounded px-2.5 py-1.5 flex items-center justify-between">
                    <span className="text-[10px] text-muted-foreground font-medium">Valor Total</span>
                    <span className="font-extrabold text-primary text-base tabular-nums">{formatMoeda(valorTotalCalc)}</span>
                  </div>
                </>
              ) : null}

              {/* ── Transferência Saída: bloco econômico do snapshot ── */}
              {isTransferenciaSaida && (() => {
                const snap = lancamento.detalhesSnapshot as any;
                if (!snap || snap._tipo !== 'transferencia_saida') return null;
                const temPreco = snap.temPrecoReferencia;
                return (
                  <>
                    <Separator className="my-0.5" />
                    <div className="grid grid-cols-3 gap-x-3 gap-y-1 text-[11px]">
                      {snap.pesoTotalKg > 0 && <Row label="Peso Total" value={formatKg(snap.pesoTotalKg)} />}
                      {snap.totalArrobas > 0 && <Row label="Total @" value={formatArroba(snap.totalArrobas)} />}
                      {snap.arrobasCab > 0 && <Row label="@/cab" value={formatArroba(snap.arrobasCab)} />}
                    </div>
                    {temPreco && (
                      <>
                        <Separator className="my-0.5" />
                        <p className="text-[8px] text-muted-foreground font-semibold uppercase tracking-wider">Referência Econômica (gerencial)</p>
                        <div className="space-y-0.5 text-[10px]">
                          {snap.precoReferenciaArroba > 0 && (
                            <div className="flex justify-between"><span className="text-muted-foreground">R$/@ ref.</span><strong className="tabular-nums">{formatMoeda(snap.precoReferenciaArroba)}</strong></div>
                          )}
                          {snap.precoReferenciaCabeca > 0 && (
                            <div className="flex justify-between"><span className="text-muted-foreground">R$/cab ref.</span><strong className="tabular-nums">{formatMoeda(snap.precoReferenciaCabeca)}</strong></div>
                          )}
                          {snap.precoReferenciaKg > 0 && (
                            <div className="flex justify-between"><span className="text-muted-foreground">R$/kg ref.</span><strong className="tabular-nums">{formatMoeda(snap.precoReferenciaKg)}</strong></div>
                          )}
                        </div>
                        <div className="bg-primary/10 rounded px-2.5 py-1.5 flex items-center justify-between">
                          <span className="text-[10px] text-muted-foreground font-medium">Valor Econômico do Lote</span>
                          <span className="font-extrabold text-primary text-base tabular-nums">{formatMoeda(snap.valorEconomicoLote)}</span>
                        </div>
                      </>
                    )}
                    {!temPreco && (
                      <div className="bg-muted/30 rounded px-2 py-1 text-[9px] text-muted-foreground">
                        Sem preço de referência informado.
                      </div>
                    )}
                  </>
                );
              })()}

              {/* Abate share buttons */}
              {isAbate && <AbateShareButtons lancamento={lancamento} fazendaNome={nomeFazenda} />}

              {/* ── Histórico (compacto) ── */}
              <div className="bg-muted/30 rounded px-2 py-1 space-y-px">
                <p className="text-[8px] text-muted-foreground font-semibold uppercase tracking-wider">Histórico</p>
                <p className="text-[9px] text-muted-foreground leading-tight">
                  <span className="font-semibold">ID:</span> {lancamento.id.slice(0, 8)}
                  {lancamento.createdAt && (
                    <> · <span className="font-semibold">Criado:</span> {format(parseISO(lancamento.createdAt), "dd/MM/yy HH:mm", { locale: ptBR })}{lancamento.createdByNome && ` por ${lancamento.createdByNome}`}</>
                  )}
                </p>
                {lancamento.updatedAt && lancamento.updatedAt !== lancamento.createdAt && (
                  <p className="text-[9px] text-muted-foreground leading-tight">
                    <span className="font-semibold">Editado:</span> {format(parseISO(lancamento.updatedAt), "dd/MM/yy HH:mm", { locale: ptBR })}{lancamento.updatedByNome && ` por ${lancamento.updatedByNome}`}
                  </p>
                )}
              </div>

              {isTransferenciaEntrada && (
                <div className="bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded px-2 py-1">
                  <p className="text-[9px] text-amber-700 dark:text-amber-400 font-medium">
                    🔒 Transferência automática — só pode ser editada/removida na fazenda de origem.
                  </p>
                </div>
              )}

              {/* ── P1 governance banner ── */}
              {effectiveP1Oficial && (
                <div className="bg-destructive/10 border border-destructive/30 rounded px-2 py-1">
                  <p className="text-[9px] text-destructive font-medium">
                    🔒 Mês fechado (P1 oficial). Reabra o período para alterar campos estruturais ou excluir.
                  </p>
                </div>
              )}

              {/* META lock banner */}
              {metaLocked && (
                <div className="bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded px-2 py-1">
                  <p className="text-[9px] text-amber-700 dark:text-amber-400 font-medium">
                    🔒 Registro META — somente consultores podem editar ou excluir.
                  </p>
                </div>
              )}

              {/* ── Ações ── */}
              <div className="flex gap-2 pt-0.5">
                {!isTransferenciaEntrada && !metaLocked && (
                  <>
                    <Button variant="default" size="sm" className="flex-1 h-7 text-[10px] font-bold" onClick={handleEditClick}>
                      <Pencil className="h-3 w-3 mr-1" /> Editar
                    </Button>
                    <Button variant="destructive" size="sm" className="h-7 text-[10px]" onClick={handleRemoverClick} disabled={checkingVinculos || effectiveP1Oficial}>
                      <Trash2 className="h-3 w-3 mr-1" /> Apagar
                    </Button>
                  </>
                )}
              </div>

              {/* Resumo financeiro da compra (view-only) */}
              {isCompra && !isTransferenciaEntrada && (
                <div className="space-y-1">
                  <div className="flex items-center gap-1.5 text-[8px] font-bold uppercase text-muted-foreground tracking-wider">
                    <DollarSign className="h-3 w-3" /> Financeiro vinculado
                  </div>
                  {/* ⚠ AS DUAS FONTES CONVIVEM. Compra antiga usa o vinculo direto
                      (`finRecords`); compra de OC usa a cadeia de compromissos. O modal
                      mostra a que existir, e se as DUAS existirem mostra as duas com um
                      aviso — esconder uma delas seria decidir por conta propria qual e' a
                      verdadeira num caso que nao deveria acontecer. */}
                  {temOC && finRecords.length > 0 && (
                    <div className="rounded border border-amber-400 bg-amber-50 dark:bg-amber-950/30 px-2 py-1 text-[9px] text-amber-800 dark:text-amber-200">
                      Esta compra tem vínculo financeiro pelos dois caminhos (direto e por operação comercial). Confira antes de agir.
                    </div>
                  )}

                  {temOC && (
                    <div className="bg-muted/20 rounded px-2 py-1 space-y-1">
                      {ocPrincipal.map(c => (
                        <div key={c.compromissoId ?? ''} className="flex items-baseline justify-between gap-2">
                          <span className="text-[9px] font-bold uppercase text-muted-foreground tracking-wider">Principal</span>
                          <span className="text-[10px] tabular-nums font-semibold">{formatMoeda(c.valorCompromisso)}</span>
                        </div>
                      ))}

                      {ocObrigacoes.length > 0 && (
                        <div className="space-y-px pt-0.5 border-t">
                          <p className="text-[8px] font-bold uppercase text-muted-foreground tracking-wider">Obrigações</p>
                          {ocObrigacoes.map(c => (
                            <div key={c.compromissoId ?? ''} className="flex items-baseline justify-between gap-2">
                              <span className="text-[9px] text-muted-foreground capitalize">{(c.componente ?? '').replace(/_/g, ' ') || '—'}</span>
                              <span className="text-[10px] tabular-nums">{formatMoeda(c.valorCompromisso)}</span>
                            </div>
                          ))}
                        </div>
                      )}

                      {ocApi.parcelas.length > 0 && (
                        <div className="space-y-px pt-0.5 border-t">
                          <p className="text-[8px] font-bold uppercase text-muted-foreground tracking-wider">Parcelas</p>
                          {ocApi.parcelas.map(pc => (
                            <div key={pc.parcelaId ?? ''} className="flex items-baseline justify-between gap-2">
                              <span className="text-[9px] text-muted-foreground">
                                {pc.sequencia}ª · {pc.vencimento ? format(parseISO(pc.vencimento), 'dd/MM/yyyy', { locale: ptBR }) : '—'}
                                {/* O TITULO e' o que o Gabriel perdeu ao migrar para a OC:
                                    sem ele a parcela e' promessa, com ele e' dinheiro. */}
                                {pc.tituloId
                                  ? ` · título ${pc.tituloStatusTransacao ?? 'lançado'}`
                                  : ' · sem título'}
                              </span>
                              <span className="text-[10px] tabular-nums">{formatMoeda(pc.valor)}</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}

                  {finLoading || ocBuscando || ocApi.loading ? (
                    <p className="text-[9px] text-muted-foreground">Carregando...</p>
                  ) : finRecords.length === 0 && !temOC ? (
                    <div className="bg-muted/30 rounded px-2 py-1 text-[9px] text-muted-foreground">
                      Nenhum lançamento financeiro gerado para esta compra.
                    </div>
                  ) : finRecords.length === 0 ? null : (() => {
                    const bovinos = finRecords.filter(r => !r.origem_tipo?.includes('frete') && !r.origem_tipo?.includes('comissao'));
                    const despesas = finRecords.filter(r => r.origem_tipo?.includes('frete') || r.origem_tipo?.includes('comissao'));
                    const totalBov = bovinos.reduce((s, r) => s + r.valor, 0);
                    const totalDesp = despesas.reduce((s, r) => s + r.valor, 0);
                    return (
                      <div className="bg-muted/20 rounded px-2 py-1 space-y-1">
                        {bovinos.length > 0 && (
                          <div className="space-y-px">
                            <p className="text-[8px] font-bold uppercase text-muted-foreground tracking-wider">Rebanho</p>
                            {bovinos.map(r => (
                              <div key={r.id} className="flex justify-between text-[9px] leading-tight">
                                <span className="text-muted-foreground truncate max-w-[60%]">💰 {r.descricao}</span>
                                <span className="font-semibold tabular-nums shrink-0">{formatMoeda(r.valor)}</span>
                              </div>
                            ))}
                            <div className="flex justify-between text-[9px] font-bold pt-0.5 border-t border-border/30">
                              <span>Total Bovinos</span>
                              <span className="tabular-nums">{formatMoeda(totalBov)}</span>
                            </div>
                          </div>
                        )}
                        {despesas.length > 0 && (
                          <div className="space-y-px">
                            <p className="text-[8px] font-bold uppercase text-muted-foreground tracking-wider">Despesas Vinculadas</p>
                            {despesas.map(r => {
                              const icon = r.origem_tipo?.includes('frete') ? '🚚' : '📋';
                              return (
                                <div key={r.id} className="flex justify-between text-[9px] leading-tight">
                                  <span className="text-muted-foreground truncate max-w-[60%]">{icon} {r.descricao}</span>
                                  <span className="font-semibold tabular-nums shrink-0">{formatMoeda(r.valor)}</span>
                                </div>
                              );
                            })}
                            <div className="flex justify-between text-[9px] font-bold pt-0.5 border-t border-border/30">
                              <span>Total Despesas</span>
                              <span className="tabular-nums">{formatMoeda(totalDesp)}</span>
                            </div>
                          </div>
                        )}
                        <div className="flex justify-between text-[10px] font-bold pt-0.5 border-t border-border/50 text-primary">
                          <span>Total Geral Vinculado</span>
                          <span className="tabular-nums">{formatMoeda(totalBov + totalDesp)}</span>
                        </div>
                      </div>
                    );
                  })()}
                </div>
              )}
            </div>
          </DialogContent>
        </Dialog>

        {/* Unified purchase edit sheet */}
        <Sheet open={compraEditSheetOpen} onOpenChange={(v) => {
          setCompraEditSheetOpen(v);
          if (!v) loadFinRecords();
        }}>
          <SheetContent side="right" className="w-full sm:max-w-xl overflow-y-auto">
            <SheetHeader className="pb-1">
              <SheetTitle className="text-sm">Editar Compra</SheetTitle>
              <p className="text-[10px] text-muted-foreground/70 italic">
                Alterações irão recalcular o financeiro da compra
              </p>
            </SheetHeader>
            <div className="mt-2 space-y-2.5">
              {/* BLOCO 1 — Zootécnico (F3a: extraído para EditCompraForm). */}
              <EditCompraForm
                lancamento={lancamento}
                form={compraForm}
                onFormChange={setCompraForm}
                statusMode={compraStatusMode}
                onStatusModeChange={setCompraStatusMode}
                saving={compraSaving}
                zooSaved={compraZooSaved}
                zooDirty={compraZooDirty}
                onSubmitZoo={handleSalvarCompraZoo}
                fornecedorId={null}
                onFornecedorChange={() => { /* sheet adormecida — LancamentoZooModal soberano */ }}
                clienteId={lancamento.clienteId ?? ''}
                canEditMeta={canEditMeta}
                finRecordsCount={finRecords.length}
                nomeFazendaDestino={nomeFazendaResolvido}
              />

              <Separator />

              {/* BLOCO 2 — Financeiro */}
              <div className="relative">
                <div className="flex items-center gap-1.5 text-[9px] font-bold uppercase text-muted-foreground tracking-wide mb-1.5">
                  <DollarSign className="h-3 w-3" /> 2. Recalcular Financeiro
                </div>
                {/* Warning about recalculation */}
                {finRecords.length > 0 && (
                  <div className="flex items-center gap-1 text-[10px] p-1.5 rounded border border-amber-200 dark:border-amber-800 bg-amber-50/60 dark:bg-amber-950/20 text-amber-600 dark:text-amber-400 mb-1.5">
                    <AlertTriangle className="h-3 w-3 shrink-0" />
                    <span>Os {finRecords.length} lançamento(s) existente(s) serão cancelados e substituídos.</span>
                  </div>
                )}
                {compraZooDirty && !compraZooSaved && (
                  <div className="absolute inset-0 z-10 bg-background/70 backdrop-blur-[1px] rounded-md flex items-center justify-center p-4">
                    <div className="text-center space-y-1">
                      <AlertTriangle className="h-4 w-4 mx-auto text-muted-foreground" />
                      <p className="text-[11px] font-medium text-muted-foreground">
                        Salve os dados zootécnicos primeiro
                      </p>
                    </div>
                  </div>
                )}
                <CompraFinanceiroPanel
                  quantidade={compraZooSaved ? Number(compraForm.quantidade) : lancamento.quantidade}
                  pesoKg={compraZooSaved ? (compraForm.pesoMedioKg || 0) : (lancamento.pesoMedioKg || 0)}
                  data={compraZooSaved ? compraForm.data : lancamento.data}
                  categoria={compraZooSaved ? compraForm.categoria : lancamento.categoria}
                  statusOp={(compraZooSaved ? (compraForm.statusOperacional || 'realizado') : (lancamento.statusOperacional || 'realizado')) as StatusOperacional}
                  fazendaOrigem={compraZooSaved ? (compraForm.fazendaOrigem || '') : (lancamento.fazendaOrigem || '')}
                  notaFiscal={notaFiscalEdit}
                  onNotaFiscalChange={setNotaFiscalEdit}
                  fornecedorId={detalheFornecedorId}
                  lancamentoId={lancamento.id}
                  mode="update"
                  fazendaIdLancamento={lancamento.fazendaId}
                  clienteIdLancamento={lancamento.clienteId}
                  onFinanceiroUpdated={() => {
                    setCompraEditSheetOpen(false);
                    loadFinRecords();
                  }}
                />
              </div>
            </div>
          </SheetContent>
        </Sheet>

        {/* Etapa 1 — Sheet padronizado de Nascimento */}
        <EditNascimentoSheet
          lancamento={lancamento}
          open={nascimentoEditOpen}
          onOpenChange={setNascimentoEditOpen}
          onSalvar={onEditar}
          onRemover={async () => { await onRemover(lancamento.id); onClose(); }}
          podeRemover={true}
          canEditMeta={canEditMeta}
          p1Oficial={effectiveP1Oficial}
          temAlteracaoEstrutural={temAlteracaoEstrutural}
          nomeFazenda={nomeFazenda}
        />

        {/* Etapa 2 — Sheet padronizado de Morte */}
        <EditMorteSheet
          lancamento={lancamento}
          open={morteEditOpen}
          onOpenChange={setMorteEditOpen}
          onSalvar={onEditar}
          onRemover={async () => { await onRemover(lancamento.id); onClose(); }}
          podeRemover={true}
          canEditMeta={canEditMeta}
          p1Oficial={effectiveP1Oficial}
          temAlteracaoEstrutural={temAlteracaoEstrutural}
          nomeFazenda={nomeFazenda}
        />

        {/* Etapa 3 — Sheet padronizado de Transferência (saída) */}
        <EditTransferenciaSheet
          lancamento={lancamento}
          open={transferenciaEditOpen}
          onOpenChange={setTransferenciaEditOpen}
          onSalvar={onEditar}
          onRemover={async () => { await onRemover(lancamento.id); onClose(); }}
          podeRemover={true}
          canEditMeta={canEditMeta}
          p1Oficial={effectiveP1Oficial}
          temAlteracaoEstrutural={temAlteracaoEstrutural}
          nomeFazenda={nomeFazenda}
          outrasFazendas={outrasFazendas}
        />

        {/* Etapa 4 — Sheet padronizado de Consumo */}
        <EditConsumoSheet
          lancamento={lancamento}
          open={consumoEditOpen}
          onOpenChange={setConsumoEditOpen}
          onSalvar={onEditar}
          onRemover={async () => { await onRemover(lancamento.id); onClose(); }}
          podeRemover={true}
          canEditMeta={canEditMeta}
          p1Oficial={effectiveP1Oficial}
          temAlteracaoEstrutural={temAlteracaoEstrutural}
          nomeFazenda={nomeFazenda}
        />

        {/* Etapa 5 — Sheet padronizado de Reclassificação (Evoluir Categoria) */}
        <EditReclassificacaoSheet
          lancamento={lancamento}
          open={reclassificacaoEditOpen}
          onOpenChange={setReclassificacaoEditOpen}
          onSalvar={onEditar}
          onRemover={async () => { await onRemover(lancamento.id); onClose(); }}
          podeRemover={true}
          p1Oficial={effectiveP1Oficial}
          temAlteracaoEstrutural={temAlteracaoEstrutural}
        />

        {/* Confirmation dialog for deletion */}
        <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Confirmar exclusão</AlertDialogTitle>
              <AlertDialogDescription>
                {financeiroCount > 0
                  ? `Esta movimentação possui ${financeiroCount} lançamento(s) financeiro(s) vinculado(s). Ao excluir, os lançamentos financeiros restantes também serão removidos.`
                  : 'Deseja realmente excluir esta movimentação?'}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancelar</AlertDialogCancel>
              <AlertDialogAction onClick={handleConfirmRemover} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                {financeiroCount > 0 ? 'Excluir tudo' : 'Excluir'}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        {/* Atalho arquitetural: entrypoint soberano de edição. */}
        <LancamentoZooModal
          open={zooModalOpen}
          onOpenChange={setZooModalOpen}
          lancamentoId={lancamento.id}
          onEditSuccess={() => {
            // Cache invalidado pelo useLancamentos.editarLancamento internamente.
            // Fechar modal soberano + propagar para o parent (que pode refetchar listas).
            setZooModalOpen(false);
          }}
          onAbrirNoFormPrincipal={(lanc) => {
            // PR-E — redirect tático: navega ao V2Index com edit=<id>&tipo=<venda|abate>.
            // V2Index lê os params, carrega o lancamento e roteia para a aba
            // "Lançamentos" com VendaDetalhesDialog/AbateDetalhesDialog aberto.
            setZooModalOpen(false);
            navigate(`/v2?section=lancamentos-zoot&edit=${lanc.id}&tipo=${lanc.tipo}`);
          }}
          onAbrirFinanceiroVinculado={(ano: string, mes: number) => {
            // PR-VENDA-V2-2C-NAVEGAR-FIX-BUG1: navega ao Financeiro filtrado por
            // ano/mês do lançamento vinculado. Read-only. V2Index lê fano/fmes.
            setZooModalOpen(false);
            navigate(`/v2?section=financeiro-lanc&fano=${ano}&fmes=${mes}`);
          }}
          onAbrirLancamentoFin={(id: string) => {
            // PR-VENDA-V2-FINVINC-ABRIR-POR-LANCAMENTO-B1: navega ao Financeiro
            // e abre direto o LancamentoV2Dialog do lançamento clicado. V2Index
            // lê flancId, troca de section, e busca o lançamento por id.
            setZooModalOpen(false);
            navigate(`/v2?section=financeiro-lanc&flancId=${id}&returnZooId=${lancamento.id}&returnZooTab=custos`);
          }}
        />
      </>
    );
  }

  // ===================== SIMPLE EDIT MODE (non-purchase types) =====================
  const isTransSaida = form.tipo === 'transferencia_saida';
  const isNascimento = form.tipo === 'nascimento';
  const isSaidaAuto = ['abate', 'venda', 'transferencia_saida', 'consumo', 'morte'].includes(form.tipo);
  const isEntradaAuto = ['nascimento', 'compra', 'transferencia_entrada'].includes(form.tipo);
  const showOrigem = !isNascimento;

  return (
    <>
      <Dialog open={open} onOpenChange={onClose}>
        <DialogContent className="max-w-sm max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Editar Lançamento</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            {/* P1 governance notice */}
            {effectiveP1Oficial && (
              <div className="bg-destructive/10 border border-destructive/30 rounded px-2 py-1.5">
                <p className="text-[9px] text-destructive font-medium">
                  🔒 Mês fechado (P1 oficial). Campos estruturais estão bloqueados. Apenas peso, preço e observação podem ser alterados.
                </p>
              </div>
            )}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="font-bold text-foreground">Data</Label>
                <Input type="date" value={form.data} onChange={e => setForm(f => ({ ...f, data: e.target.value }))} className="mt-1" disabled={effectiveP1Oficial} />
              </div>
              <div>
                <Label className="font-bold text-foreground">Quantidade</Label>
                <Input type="number" value={form.quantidade} onChange={e => setForm(f => ({ ...f, quantidade: Number(e.target.value) }))} className="mt-1" min="1" disabled={effectiveP1Oficial} />
              </div>
            </div>
            <div>
              <Label className="font-bold text-foreground">Categoria</Label>
              <Select value={form.categoria} onValueChange={v => setForm(f => ({ ...f, categoria: v as Categoria }))} disabled={effectiveP1Oficial}>
                <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {CATEGORIAS.map(c => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            {form.tipo === 'reclassificacao' && (
              <div>
                <Label className="font-bold text-foreground">Categoria Destino</Label>
                <Select value={form.categoriaDestino || ''} onValueChange={v => setForm(f => ({ ...f, categoriaDestino: v as Categoria }))} disabled={effectiveP1Oficial}>
                  <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {CATEGORIAS.filter(c => c.value !== form.categoria).map(c => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            )}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="font-bold text-foreground">Peso (kg)</Label>
                <Input type="number" value={isNascimento ? (form.pesoMedioKg && Number(form.pesoMedioKg) > 0 ? form.pesoMedioKg : 30) : (form.pesoMedioKg || '')} onChange={e => setForm(f => ({ ...f, pesoMedioKg: e.target.value ? Number(e.target.value) : undefined }))} className="mt-1" />
              </div>
              {!isNascimento && (
                <div>
                  <Label className="font-bold text-foreground">Preço/Cab (R$)</Label>
                  <Input type="number" value={form.precoMedioCabeca || ''} onChange={e => setForm(f => ({ ...f, precoMedioCabeca: e.target.value ? Number(e.target.value) : undefined }))} className="mt-1" />
                </div>
              )}
            </div>

            <div className="grid grid-cols-2 gap-3">
              {showOrigem && (
                <div>
                  <Label className="font-bold text-foreground">Faz. Origem</Label>
                  {isSaidaAuto ? (
                    <Input value={nomeFazenda} readOnly className="mt-1 bg-muted cursor-not-allowed" />
                  ) : (
                    <Input value={form.fazendaOrigem || ''} onChange={e => setForm(f => ({ ...f, fazendaOrigem: e.target.value }))} className="mt-1" disabled={effectiveP1Oficial} />
                  )}
                </div>
              )}
              <div>
                <Label className="font-bold text-foreground">
                  {form.tipo === 'morte' ? 'Motivo da Morte' : form.tipo === 'consumo' ? 'Motivo' : 'Faz. Destino'}
                </Label>
                {isEntradaAuto ? (
                  <Input value={nomeFazenda} readOnly className="mt-1 bg-muted cursor-not-allowed" />
                ) : isTransSaida && outrasFazendas.length > 0 ? (
                  <Select value={form.fazendaDestino || ''} onValueChange={v => setForm(f => ({ ...f, fazendaDestino: v }))} disabled={effectiveP1Oficial}>
                    <SelectTrigger className="mt-1"><SelectValue placeholder="Selecione a fazenda" /></SelectTrigger>
                    <SelectContent>
                      {outrasFazendas.map(f => (
                        <SelectItem key={f.id} value={f.nome}>{f.nome}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                ) : (
                  <Input
                    value={form.fazendaDestino || ''}
                    onChange={e => setForm(f => ({ ...f, fazendaDestino: e.target.value }))}
                    placeholder={form.tipo === 'morte' ? 'Ex: Raio, Picada de cobra' : form.tipo === 'consumo' ? 'Ex: Consumo interno' : 'Ex: Faz. Santa Cruz'}
                    className="mt-1"
                    disabled={effectiveP1Oficial}
                  />
                )}
              </div>
            </div>

            {/* Status Operacional */}
            {!isNascimento && (
              <div>
                <Label className="font-bold text-foreground">Status</Label>
                <div className="flex gap-1 mt-1">
                  {STATUS_OPTIONS_ZOOTECNICO_COM_META.map(s => {
                    const disabled = (s.value === 'meta' && !canEditMeta) || effectiveP1Oficial;
                    return (
                    <button
                      key={s.value}
                      type="button"
                      onClick={() => {
                        if (disabled) return;
                        setFormStatusMode(s.value as any);
                        setForm(f => ({
                          ...f,
                          statusOperacional: s.value === 'meta' ? null : s.value,
                          cenario: s.value === 'meta' ? 'meta' : 'realizado',
                        }));
                      }}
                      disabled={disabled}
                      className={`flex-1 py-2 rounded-lg text-xs font-bold border-2 transition-all ${
                        disabled ? 'opacity-50 cursor-not-allowed' : ''
                      } ${
                        formStatusMode === s.value
                          ? `${s.bg} text-white border-transparent shadow-md`
                          : 'border-border text-muted-foreground bg-muted/30'
                      }`}
                    >
                      {s.label}
                    </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Bloqueio seletivo P1 - mensagem inline */}
            {p1BloqueioMsg && (
              <div className="bg-destructive/10 border border-destructive/30 rounded px-3 py-2">
                <p className="text-[10px] text-destructive font-semibold mb-0.5">⚠️ Alteração não salva</p>
                <p className="text-[9px] text-destructive/90">{p1BloqueioMsg}</p>
              </div>
            )}

            <div className="flex gap-2 pt-2">
              <Button variant="outline" className="flex-1 touch-target" onClick={() => setEditando(false)}>Cancelar</Button>
              <Button variant="destructive" className="touch-target" onClick={handleRemoverClick} disabled={checkingVinculos || effectiveP1Oficial}>
                <Trash2 className="h-4 w-4" />
              </Button>
              <Button className="flex-1 touch-target" onClick={handleSalvar}>Salvar</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirmar exclusão</AlertDialogTitle>
            <AlertDialogDescription>
              {financeiroCount > 0
                ? `Esta movimentação possui ${financeiroCount} lançamento(s) financeiro(s) vinculado(s). Ao excluir, os lançamentos financeiros restantes também serão removidos.`
                : 'Deseja realmente excluir esta movimentação?'}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleConfirmRemover} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              {financeiroCount > 0 ? 'Excluir tudo' : 'Excluir'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
