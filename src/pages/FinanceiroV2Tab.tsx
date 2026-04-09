import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { formatMoeda } from '@/lib/calculos/formatters';
import { STATUS_LABEL as CENTRAL_STATUS_LABEL } from '@/lib/statusOperacional';
import { isTransferenciaTipo } from '@/lib/financeiro/v2Transferencia';
import { formatDocumento } from '@/lib/financeiro/documentoHelper';
import { toast } from 'sonner';
import { SearchableSelect } from '@/components/ui/searchable-select';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Plus, Pencil, Copy, ChevronLeft, ChevronRight, Zap, List, ChevronsUpDown, FilterX, Download, ArrowUp, ArrowDown, ArrowUpDown, Trash2, X, SlidersHorizontal } from 'lucide-react';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { useIsMobile } from '@/hooks/use-mobile';
import { useFazenda } from '@/contexts/FazendaContext';
import { useFinanceiroV2, type LancamentoV2, type FiltrosV2 } from '@/hooks/useFinanceiroV2';
import { useFechamentoMensal } from '@/hooks/useFechamentoMensal';
import { LancamentoV2Dialog } from '@/components/financeiro-v2/LancamentoV2Dialog';
import { ModoRapidoGrid } from '@/components/financeiro-v2/ModoRapidoGrid';
import { FinanceiroV2ExportMenu } from '@/components/financeiro-v2/FinanceiroV2ExportMenu';
import { CorrecaoTransferenciasBanner } from '@/components/financeiro-v2/CorrecaoTransferenciasBanner';
import { FechamentoMensalBanner } from '@/components/financeiro/FechamentoMensalBanner';
import { format, parseISO } from 'date-fns';

// ── Sorting helpers ──

const CONTA_GROUP_ORDER: Record<string, number> = { cc: 0, inv: 1, cartao: 2 };

function sortContas<T extends { nome_conta: string; tipo_conta?: string | null; codigo_conta?: string | null }>(contas: T[]): T[] {
  return [...contas].sort((a, b) => {
    const tA = (a.tipo_conta || '').toLowerCase();
    const tB = (b.tipo_conta || '').toLowerCase();
    // Fallback: extract prefix from codigo_conta or nome_conta
    const prefA = tA || (a.codigo_conta || a.nome_conta).split('-')[0]?.toLowerCase() || '';
    const prefB = tB || (b.codigo_conta || b.nome_conta).split('-')[0]?.toLowerCase() || '';
    const gA = CONTA_GROUP_ORDER[prefA] ?? 99;
    const gB = CONTA_GROUP_ORDER[prefB] ?? 99;
    if (gA !== gB) return gA - gB;
    // Within same group, descending by numeric suffix from codigo_conta
    const codeA = a.codigo_conta || a.nome_conta;
    const codeB = b.codigo_conta || b.nome_conta;
    const numA = parseInt(codeA.split('-')[1] || '0', 10);
    const numB = parseInt(codeB.split('-')[1] || '0', 10);
    return numB - numA;
  });
}

/** Display name for a conta: prefer nome_exibicao, fallback to nome_conta */
function contaLabel(c: { nome_conta: string; nome_exibicao?: string | null; agencia?: string | null; numero_conta?: string | null; conta_digito?: string | null }): string {
  const nome = c.nome_exibicao || c.nome_conta;
  const parts: string[] = [];
  if (c.agencia) parts.push(c.agencia);
  if (c.numero_conta) {
    parts.push(c.conta_digito ? `${c.numero_conta}-${c.conta_digito}` : c.numero_conta);
  }
  if (parts.length > 0) return `${nome} (${parts.join(' ')})`;
  return nome;
}

const MACRO_ORDER = [
  'Receitas',
  'Dedução de Receitas',
  'Outras Entradas Financeiras',
  'Custeio Produtivo',
  'Investimentos na Fazenda',
  'Investimentos em Bovinos',
  'Amortizações Financeiras',
  'Dividendos',
];

function sortMacros(macros: string[]): string[] {
  return [...macros].sort((a, b) => {
    const iA = MACRO_ORDER.indexOf(a);
    const iB = MACRO_ORDER.indexOf(b);
    const oA = iA >= 0 ? iA : 999;
    const oB = iB >= 0 ? iB : 999;
    if (oA !== oB) return oA - oB;
    return a.localeCompare(b, 'pt-BR');
  });
}

function sortFazendas<T extends { nome: string; id: string }>(fazendas: T[]): T[] {
  return [...fazendas].sort((a, b) => {
    const aIsAdmin = a.nome.toLowerCase().includes('administrativ');
    const bIsAdmin = b.nome.toLowerCase().includes('administrativ');
    if (aIsAdmin && !bIsAdmin) return 1;
    if (!aIsAdmin && bIsAdmin) return -1;
    return a.nome.localeCompare(b.nome, 'pt-BR');
  });
}

const MESES_LIST = [
  { value: '01', label: 'Jan' }, { value: '02', label: 'Fev' },
  { value: '03', label: 'Mar' }, { value: '04', label: 'Abr' },
  { value: '05', label: 'Mai' }, { value: '06', label: 'Jun' },
  { value: '07', label: 'Jul' }, { value: '08', label: 'Ago' },
  { value: '09', label: 'Set' }, { value: '10', label: 'Out' },
  { value: '11', label: 'Nov' }, { value: '12', label: 'Dez' },
];

const STATUS_LABELS: Record<string, string> = {
  meta: CENTRAL_STATUS_LABEL.meta,
  agendado: 'Agendado',
  programado: CENTRAL_STATUS_LABEL.programado,
  realizado: CENTRAL_STATUS_LABEL.realizado,
};
const STATUS_TEXT_COLORS: Record<string, string> = {
  previsto: 'text-cyan-600 dark:text-cyan-400',
  agendado: 'text-purple-600 dark:text-purple-400',
  programado: 'text-blue-600 dark:text-blue-400',
  realizado: 'text-green-700 dark:text-green-400 font-bold',
};

function fmtValor(v: number, sinal: number) {
  return formatMoeda(Math.abs(v) * (sinal >= 0 ? 1 : -1));
}
function fmtDate(d: string | null) {
  if (!d) return '-';
  try { return format(parseISO(d), 'dd/MM/yy'); } catch { return d; }
}
function formatNF(l: LancamentoV2): string {
  return formatDocumento((l as any).tipo_documento, l.numero_documento);
}

interface Props {
  onBack?: () => void;
  filtroAnoInicial?: string;
  filtroMesInicial?: number;
}

function getInitialPageSize() {
  if (typeof window === 'undefined') return 30;
  const width = window.innerWidth;
  if (width < 768) return 12;
  if (width < 1024) return 20;
  return 30;
}

export function FinanceiroV2Tab({ onBack, filtroAnoInicial, filtroMesInicial }: Props) {
  const { fazendas, fazendaAtual } = useFazenda();
  const [pageSize] = useState(getInitialPageSize);
  const [currentPage, setCurrentPage] = useState(0);
  const hook = useFinanceiroV2(pageSize);
  const fechamentoHook = useFechamentoMensal();
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  const currentYear = new Date().getFullYear();
  const anos = useMemo(() => {
    const arr: string[] = [];
    for (let y = currentYear; y >= currentYear - 5; y--) arr.push(String(y));
    return arr;
  }, [currentYear]);

  const defaultFazendaId = fazendaAtual?.id !== '__global__' ? fazendaAtual?.id || '__all__' : '__all__';

  const getDefaults = () => ({
    fazendaId: defaultFazendaId,
    ano: filtroAnoInicial || String(currentYear),
    mesesSelecionados: filtroMesInicial ? [String(filtroMesInicial).padStart(2, '0')] : [] as string[],
    statusTransacao: '__all__',
    tipoOperacao: '__all__',
    contaOrigem: '__all__',
    contaDestino: '__all__',
    macroFiltro: '__all__',
    grupoFiltro: '__all__',
    centroFiltro: '__all__',
    subcentroFiltro: '__all__',
    produtoFiltro: '',
    fornecedorFiltro: '__all__',
    atividadeFiltro: '__all__',
  });

  const defaults = getDefaults();
  const [fazendaId, setFazendaId] = useState(defaults.fazendaId);
  const [ano, setAno] = useState(defaults.ano);
  const [mesesSelecionados, setMesesSelecionados] = useState<string[]>(defaults.mesesSelecionados);
  const [statusTransacao, setStatusTransacao] = useState(defaults.statusTransacao);
  const [tipoOperacao, setTipoOperacao] = useState(defaults.tipoOperacao);
  const [contaOrigem, setContaOrigem] = useState(defaults.contaOrigem);
  const [contaDestino, setContaDestino] = useState(defaults.contaDestino);
  const [macroFiltro, setMacroFiltro] = useState(defaults.macroFiltro);
  const [grupoFiltro, setGrupoFiltro] = useState(defaults.grupoFiltro);
  const [centroFiltro, setCentroFiltro] = useState(defaults.centroFiltro);
  const [subcentroFiltro, setSubcentroFiltro] = useState(defaults.subcentroFiltro);
  const [produtoFiltro, setProdutoFiltro] = useState(defaults.produtoFiltro);
  const [fornecedorFiltro, setFornecedorFiltro] = useState(defaults.fornecedorFiltro);
  const [atividadeFiltro, setAtividadeFiltro] = useState(defaults.atividadeFiltro);
  const [mesPopoverOpen, setMesPopoverOpen] = useState(false);
  // Track if macro/centro were auto-filled by subcentro
  const [macroLocked, setMacroLocked] = useState(false);

  const [mode, setMode] = useState<'list' | 'rapido'>('list');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingLanc, setEditingLanc] = useState<LancamentoV2 | null>(null);

  // Bulk selection state
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);
  const [bulkDeleting, setBulkDeleting] = useState(false);
  const [confirmCleanupOpen, setConfirmCleanupOpen] = useState(false);
  const [cleanupDeleting, setCleanupDeleting] = useState(false);
  const [cleanupConfirmText, setCleanupConfirmText] = useState('');
  const [confirmMigracaoOpen, setConfirmMigracaoOpen] = useState(false);
  const [migracaoDeleting, setMigracaoDeleting] = useState(false);
  const [migracaoConfirmText, setMigracaoConfirmText] = useState('');

  // Sorting state
   type SortField = 'default' | 'data' | 'pgto' | 'valor' | 'produto' | 'fornecedor' | 'centro' | 'status';
  type SortDir = 'asc' | 'desc';
   const [sortField, setSortField] = useState<SortField>('default');
   const [sortDir, setSortDir] = useState<SortDir>('asc');

  const fazOperacionais = useMemo(() => sortFazendas(fazendas.filter(f => f.id !== '__global__')), [fazendas]);

  const sortedContas = useMemo(() => sortContas(hook.contasBancarias), [hook.contasBancarias]);

  const isEntrada = tipoOperacao === '1-Entradas';
  const isSaida = tipoOperacao === '2-Saídas';
  const isTransf = tipoOperacao === '3-Transferência';

  // === Cascading classification filters: Tipo → Macro → Grupo → Centro → Subcentro ===
  const filteredByTipo = useMemo(() => {
    if (tipoOperacao === '__all__') return hook.classificacoes;
    return hook.classificacoes.filter(c => c.tipo_operacao === tipoOperacao);
  }, [hook.classificacoes, tipoOperacao]);

  const macrosUnicos = useMemo(() => {
    const set = new Set(filteredByTipo.map(c => c.macro_custo).filter(Boolean));
    return sortMacros(Array.from(set));
  }, [filteredByTipo]);

  const filteredByMacro = useMemo(() => {
    if (macroFiltro === '__all__') return filteredByTipo;
    return filteredByTipo.filter(c => c.macro_custo === macroFiltro);
  }, [filteredByTipo, macroFiltro]);

  const gruposUnicos = useMemo(() => {
    const set = new Set(filteredByMacro.map(c => c.grupo_custo).filter(Boolean));
    return Array.from(set).sort();
  }, [filteredByMacro]);

  const filteredByGrupo = useMemo(() => {
    if (grupoFiltro === '__all__') return filteredByMacro;
    return filteredByMacro.filter(c => c.grupo_custo === grupoFiltro);
  }, [filteredByMacro, grupoFiltro]);

  const centrosUnicos = useMemo(() => {
    const set = new Set(filteredByGrupo.map(c => c.centro_custo).filter(Boolean));
    return Array.from(set).sort();
  }, [filteredByGrupo]);

  const filteredByCentro = useMemo(() => {
    if (centroFiltro === '__all__') return filteredByGrupo;
    return filteredByGrupo.filter(c => c.centro_custo === centroFiltro);
  }, [filteredByGrupo, centroFiltro]);

  const subcentrosUnicos = useMemo(() => {
    const set = new Set(filteredByCentro.map(c => c.subcentro).filter(Boolean));
    return Array.from(set).sort();
  }, [filteredByCentro]);

  // Auto-clear invalid downstream filters when upstream changes
  useEffect(() => {
    if (macroFiltro !== '__all__' && !macrosUnicos.includes(macroFiltro)) {
      setMacroFiltro('__all__'); setMacroLocked(false);
    }
  }, [macrosUnicos, macroFiltro]);

  useEffect(() => {
    if (grupoFiltro !== '__all__' && !gruposUnicos.includes(grupoFiltro)) {
      setGrupoFiltro('__all__');
    }
  }, [gruposUnicos, grupoFiltro]);

  useEffect(() => {
    if (centroFiltro !== '__all__' && !centrosUnicos.includes(centroFiltro)) {
      setCentroFiltro('__all__');
    }
  }, [centrosUnicos, centroFiltro]);

  useEffect(() => {
    if (subcentroFiltro !== '__all__' && !subcentrosUnicos.includes(subcentroFiltro)) {
      setSubcentroFiltro('__all__');
    }
  }, [subcentrosUnicos, subcentroFiltro]);

  // Subcentro selection: auto-fill macro + grupo + centro
  const handleSubcentroChange = (val: string) => {
    setSubcentroFiltro(val);
    if (val !== '__all__') {
      const match = hook.classificacoes.find(c => c.subcentro === val);
      if (match) {
        setMacroFiltro(match.macro_custo || '__all__');
        setGrupoFiltro(match.grupo_custo || '__all__');
        setCentroFiltro(match.centro_custo || '__all__');
        setMacroLocked(true);
      }
    } else {
      if (macroLocked) {
        setMacroFiltro('__all__');
        setGrupoFiltro('__all__');
        setCentroFiltro('__all__');
        setMacroLocked(false);
      }
    }
  };

  useEffect(() => {
    hook.loadContas();
    hook.loadClassificacoes();
    hook.loadFornecedores();
  }, [hook.loadContas, hook.loadClassificacoes, hook.loadFornecedores]);

  useEffect(() => {
    if (fazendaAtual && fazendaAtual.id !== '__global__') {
      setFazendaId(fazendaAtual.id);
    }
  }, [fazendaAtual]);

  // Load fechamentos when fazenda changes
  useEffect(() => {
    const fId = fazendaId !== '__all__' ? fazendaId : undefined;
    fechamentoHook.loadFechamentos(fId);
  }, [fazendaId, fechamentoHook.loadFechamentos]);

  // Determine which months are currently selected and if any are closed
  const mesesAtivos = useMemo(() => {
    if (mesesSelecionados.length > 0) return mesesSelecionados.map(m => `${ano}-${m}`);
    return [];
  }, [ano, mesesSelecionados]);

  const mesFechadoAtivo = useMemo(() => {
    if (fazendaId === '__all__' || !fazendaId) return false;
    if (mesesAtivos.length === 1) return fechamentoHook.isMesFechado(fazendaId, mesesAtivos[0]);
    // If multiple months or "todos", check all - show banner if ANY is closed
    if (mesesAtivos.length === 0) {
      // "Todos" - check all 12 months
      for (let m = 1; m <= 12; m++) {
        const am = `${ano}-${String(m).padStart(2, '0')}`;
        if (fechamentoHook.isMesFechado(fazendaId, am)) return true;
      }
      return false;
    }
    return mesesAtivos.some(am => fechamentoHook.isMesFechado(fazendaId, am));
  }, [fazendaId, mesesAtivos, ano, fechamentoHook.isMesFechado]);

  // Single month selected -> show precise banner
  const singleMonthSelected = mesesSelecionados.length === 1 ? `${ano}-${mesesSelecionados[0]}` : null;
  const singleMonthStatus = singleMonthSelected && fazendaId !== '__all__'
    ? fechamentoHook.getStatus(fazendaId, singleMonthSelected)
    : 'aberto';

  const filtros: FiltrosV2 = useMemo(() => ({
    fazenda_id: fazendaId !== '__all__' ? fazendaId : undefined,
    ano: ano,
    mes: mesesSelecionados.length === 0 ? 'todos' : undefined,
    meses: mesesSelecionados.length > 0 ? mesesSelecionados : undefined,
    conta_bancaria_id: contaOrigem !== '__all__' ? contaOrigem : undefined,
    conta_destino_id: contaDestino !== '__all__' ? contaDestino : undefined,
    tipo_operacao: tipoOperacao !== '__all__' ? tipoOperacao : undefined,
    status_transacao: statusTransacao !== '__all__' ? statusTransacao : undefined,
    macro_custo: macroFiltro !== '__all__' ? macroFiltro : undefined,
    grupo_custo: grupoFiltro !== '__all__' ? grupoFiltro : undefined,
    centro_custo: centroFiltro !== '__all__' ? centroFiltro : undefined,
    subcentro: subcentroFiltro !== '__all__' ? subcentroFiltro : undefined,
  }), [fazendaId, ano, mesesSelecionados, contaOrigem, contaDestino, tipoOperacao, statusTransacao, macroFiltro, grupoFiltro, centroFiltro, subcentroFiltro]);

  useEffect(() => {
    hook.loadLancamentos(filtros, 0);
  }, [filtros]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    setCurrentPage(0);
    setSelectedIds(new Set());
  }, [filtros, produtoFiltro, fornecedorFiltro, atividadeFiltro]);

  const handlePageChange = (p: number) => setCurrentPage(p);

  const handleSave = async (form: any, id?: string) => {
    let ok: boolean;
    if (id) {
      console.log('[FinV2] before save', {
        id,
        tipo_operacao: editingLanc?.tipo_operacao,
        conta_bancaria_id: editingLanc?.conta_bancaria_id,
        conta_destino_id: editingLanc?.conta_destino_id,
        status_transacao: editingLanc?.status_transacao,
      });
      console.log('[FinV2] UPDATE lancamento id=', id);
      ok = await hook.editarLancamento(id, form);
    } else {
      console.log('[FinV2] INSERT new lancamento');
      ok = await hook.criarLancamento(form);
    }
    if (ok) {
      const scrollTop = scrollContainerRef.current?.scrollTop ?? 0;
      await hook.loadLancamentos(filtros, hook.page);
      requestAnimationFrame(() => {
        if (scrollContainerRef.current) scrollContainerRef.current.scrollTop = scrollTop;
      });
      const refreshed = hook.lancamentos.find(l => l.id === id);
      console.log('[FinV2] after save reload', {
        id,
        tipo_operacao: refreshed?.tipo_operacao,
        conta_bancaria_id: refreshed?.conta_bancaria_id,
        conta_destino_id: refreshed?.conta_destino_id,
        status_transacao: refreshed?.status_transacao,
      });
    }
    return ok;
  };
  const handleDelete = async (id: string) => {
    const ok = await hook.excluirLancamento(id);
    if (ok) {
      const scrollTop = scrollContainerRef.current?.scrollTop ?? 0;
      await hook.loadLancamentos(filtros, hook.page);
      requestAnimationFrame(() => {
        if (scrollContainerRef.current) scrollContainerRef.current.scrollTop = scrollTop;
      });
    }
    return ok;
  };
  const handleDuplicate = async (lanc: LancamentoV2) => {
    const ok = await hook.duplicarLancamento(lanc);
    if (ok) {
      const scrollTop = scrollContainerRef.current?.scrollTop ?? 0;
      await hook.loadLancamentos(filtros, hook.page);
      requestAnimationFrame(() => {
        if (scrollContainerRef.current) scrollContainerRef.current.scrollTop = scrollTop;
      });
    }
  };

  // ── Bulk selection helpers (defined after sortedLancamentos via lazy refs) ──
  const toggleSelect = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const openNew = () => { setEditingLanc(null); setDialogOpen(true); };
  const openEdit = (l: LancamentoV2) => {
    console.log('[FinV2] reopen edit object', {
      id: l.id,
      tipo_operacao: l.tipo_operacao,
      conta_bancaria_id: l.conta_bancaria_id,
      conta_destino_id: l.conta_destino_id,
      status_transacao: l.status_transacao,
      origem_lida_de: 'conta_bancaria_id',
      destino_lido_de: 'conta_destino_id',
    });
    setEditingLanc(l);
    setDialogOpen(true);
  };

  const fornecedoresMap = useMemo(
    () => new Map(hook.fornecedores.map(f => [f.id, f.nome])),
    [hook.fornecedores],
  );

  // Derive atividade from subcentro
  const getAtividade = (subcentro: string | null): string => {
    if (!subcentro) return 'outros';
    const s = subcentro.toUpperCase();
    if (s.startsWith('PEC/') || s.startsWith('PEC ')) return 'pecuaria';
    if (s.startsWith('AGRI/') || s.startsWith('AGRI ')) return 'agricultura';
    return 'outros';
  };

  // Build grupo_custo lookup from classificacoes (centro_custo → grupo_custo)
  const centroToGrupo = useMemo(() => {
    const map = new Map<string, string>();
    hook.classificacoes.forEach(c => {
      if (c.centro_custo && c.grupo_custo) map.set(c.centro_custo, c.grupo_custo);
    });
    return map;
  }, [hook.classificacoes]);

  const filteredLancamentos = useMemo(() => {
    let items = hook.lancamentos;

    // Directional conta filtering:
    const hasContaOrigem = contaOrigem && contaOrigem !== '__all__';
    const hasContaDestino = contaDestino && contaDestino !== '__all__';

    if (hasContaOrigem && !hasContaDestino) {
      items = items.filter(l => l.sinal < 0 || isTransferenciaTipo(l.tipo_operacao));
    } else if (hasContaDestino && !hasContaOrigem) {
      items = items.filter(l => l.sinal > 0 || isTransferenciaTipo(l.tipo_operacao));
    }

    if (produtoFiltro.trim()) {
      const q = produtoFiltro.toLowerCase();
      items = items.filter(l => l.descricao?.toLowerCase().includes(q));
    }
    if (fornecedorFiltro !== '__all__') {
      items = items.filter(l => l.favorecido_id === fornecedorFiltro);
    }
    if (atividadeFiltro !== '__all__') {
      items = items.filter(l => getAtividade(l.subcentro) === atividadeFiltro);
    }
    // Client-side grupo_custo filter (not a DB column on lancamentos)
    if (grupoFiltro !== '__all__') {
      items = items.filter(l => {
        const grupo = centroToGrupo.get(l.centro_custo || '');
        return grupo === grupoFiltro;
      });
    }
    return items;
  }, [hook.lancamentos, contaOrigem, contaDestino, produtoFiltro, fornecedorFiltro, atividadeFiltro, grupoFiltro, centroToGrupo]);

  const compareDefaultOrder = useCallback((a: LancamentoV2, b: LancamentoV2) => {
    const pagamentoA = a.data_pagamento || '9999-12-31';
    const pagamentoB = b.data_pagamento || '9999-12-31';
    const pagamentoCmp = pagamentoA.localeCompare(pagamentoB);
    if (pagamentoCmp !== 0) return pagamentoCmp;

    const fornecedorA = fornecedoresMap.get(a.favorecido_id || '') || '';
    const fornecedorB = fornecedoresMap.get(b.favorecido_id || '') || '';
    const fornecedorCmp = fornecedorA.localeCompare(fornecedorB, 'pt-BR');
    if (fornecedorCmp !== 0) return fornecedorCmp;

    const produtoCmp = (a.descricao || '').localeCompare(b.descricao || '', 'pt-BR');
    if (produtoCmp !== 0) return produtoCmp;

    const valorCmp = (b.valor * b.sinal) - (a.valor * a.sinal);
    if (valorCmp !== 0) return valorCmp;

    return a.id.localeCompare(b.id);
  }, [fornecedoresMap]);

  // Sorted lancamentos
  const sortedLancamentos = useMemo(() => {
    const items = [...filteredLancamentos];
    items.sort((a, b) => {
      if (sortField === 'default') {
        return compareDefaultOrder(a, b);
      }

      const dir = sortDir === 'asc' ? 1 : -1;
      let primary = 0;

      switch (sortField) {
        case 'data':
          primary = dir * a.data_competencia.localeCompare(b.data_competencia);
          break;
        case 'pgto':
          primary = dir * ((a.data_pagamento || '').localeCompare(b.data_pagamento || ''));
          break;
        case 'valor':
          primary = dir * ((a.valor * a.sinal) - (b.valor * b.sinal));
          break;
        case 'produto':
          primary = dir * (a.descricao || '').localeCompare(b.descricao || '', 'pt-BR');
          break;
        case 'fornecedor': {
          const nA = fornecedoresMap.get(a.favorecido_id || '') || '';
          const nB = fornecedoresMap.get(b.favorecido_id || '') || '';
          primary = dir * nA.localeCompare(nB, 'pt-BR');
          break;
        }
        case 'centro':
          primary = dir * (a.centro_custo || '').localeCompare(b.centro_custo || '', 'pt-BR');
          break;
        case 'status':
          primary = dir * (a.status_transacao || '').localeCompare(b.status_transacao || '', 'pt-BR');
          break;
        default:
          primary = 0;
      }

      if (primary !== 0) return primary;
      return compareDefaultOrder(a, b);
    });
    return items;
  }, [filteredLancamentos, sortField, sortDir, compareDefaultOrder, fornecedoresMap]);

  const totalLancamentosFiltrados = sortedLancamentos.length;

  // ── Bulk selection (depends on sortedLancamentos) ──
  const allSelected = useMemo(() => selectedIds.size > 0 && sortedLancamentos.length > 0 && sortedLancamentos.every(l => selectedIds.has(l.id)), [selectedIds, sortedLancamentos]);
  const someSelected = selectedIds.size > 0;

  const toggleSelectAll = () => {
    if (allSelected) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(sortedLancamentos.map(l => l.id)));
    }
  };

  const selectedLancamentos = useMemo(() => hook.lancamentos.filter(l => selectedIds.has(l.id)), [hook.lancamentos, selectedIds]);
  const bloqueadosInfo = useMemo(() => {
    const importados = selectedLancamentos.filter(l => !!l.lote_importacao_id);
    const deletaveis = selectedLancamentos.filter(l => !l.lote_importacao_id);
    const origens = new Set(selectedLancamentos.map(l => l.origem_lancamento));
    return { importados, deletaveis, origens: Array.from(origens) };
  }, [selectedLancamentos]);

  const handleBulkDelete = async () => {
    setBulkDeleting(true);
    try {
      const ids = bloqueadosInfo.deletaveis.map(l => l.id);
      const result = await hook.excluirLancamentosEmLote(ids);
      if (result.excluidos > 0) {
        toast.success(`${result.excluidos} lançamento${result.excluidos !== 1 ? 's' : ''} excluído${result.excluidos !== 1 ? 's' : ''}`);
      }
      if (result.bloqueados.length > 0) {
        toast.error(`${result.bloqueados.length} importado(s) não puderam ser excluídos`);
      }
      setSelectedIds(new Set());
      await hook.loadLancamentos(filtros, hook.page);
    } finally {
      setBulkDeleting(false);
      setConfirmDeleteOpen(false);
    }
  };

  // Cleanup: count imported realizado in current filtered set
  const realizadosImportadosCount = useMemo(() =>
    sortedLancamentos.filter(l => l.status_transacao === 'realizado' && !!l.lote_importacao_id && !l.cancelado).length,
    [sortedLancamentos]
  );

  const handleCleanupRealizados = async () => {
    setCleanupDeleting(true);
    try {
      const result = await hook.cancelarRealizadosImportados(filtros);
      if (result.cancelados > 0) {
        toast.success(`${result.cancelados} lançamento${result.cancelados !== 1 ? 's' : ''} realizado${result.cancelados !== 1 ? 's' : ''} importado${result.cancelados !== 1 ? 's' : ''} removido${result.cancelados !== 1 ? 's' : ''}`);
        await hook.loadLancamentos(filtros, hook.page);
      } else {
        toast.info('Nenhum lançamento encontrado para remoção');
      }
    } catch (err) {
      console.error(err);
      toast.error('Erro ao executar limpeza');
    } finally {
      setCleanupDeleting(false);
      setConfirmCleanupOpen(false);
      setCleanupConfirmText('');
    }
  };

  const handleCancelarMigracao2025 = async () => {
    setMigracaoDeleting(true);
    try {
      const result = await hook.cancelarMigracao('2025');
      if (result.cancelados > 0) {
        toast.success(`${result.cancelados} registros de migração 2025 cancelados`);
        if (result.restantes.length > 0) {
          const resumo = result.restantes.map(r => `${r.origem}: ${r.qtd}`).join(', ');
          toast.info(`Restam ativos em 2025: ${resumo}`);
        } else {
          toast.info('Nenhum registro ativo restante em 2025');
        }
        await hook.loadLancamentos(filtros, hook.page);
      } else {
        toast.info('Nenhum registro de migração encontrado em 2025');
      }
    } catch (err) {
      console.error(err);
      toast.error('Erro ao cancelar migração');
    } finally {
      setMigracaoDeleting(false);
      setConfirmMigracaoOpen(false);
      setMigracaoConfirmText('');
    }
  };

  const totalPages = Math.max(1, Math.ceil(totalLancamentosFiltrados / pageSize));


  useEffect(() => {
    if (currentPage > totalPages - 1) {
      setCurrentPage(Math.max(0, totalPages - 1));
    }
  }, [currentPage, totalPages]);

  const paginatedLancamentos = useMemo(() => {
    const start = currentPage * pageSize;
    return sortedLancamentos.slice(start, start + pageSize);
  }, [sortedLancamentos, currentPage, pageSize]);

  const toggleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDir(field === 'valor' ? 'desc' : 'asc');
    }
  };
  const SortIndicator = ({ field }: { field: Exclude<SortField, 'default'> }) => {
    if (sortField !== field) return <ArrowUpDown className="inline h-2.5 w-2.5 ml-0.5 opacity-40" />;
    return sortDir === 'asc'
      ? <ArrowUp className="inline h-2.5 w-2.5 ml-0.5" />
      : <ArrowDown className="inline h-2.5 w-2.5 ml-0.5" />;
  };

  const hasContaOrigemAtiva = contaOrigem && contaOrigem !== '__all__';
  const hasContaDestinoAtiva = contaDestino && contaDestino !== '__all__';

  const totalEntradas = (hasContaOrigemAtiva && !hasContaDestinoAtiva)
    ? 0
    : sortedLancamentos.filter(l => l.sinal > 0).reduce((s, l) => s + l.valor, 0);

  const totalSaidas = (hasContaDestinoAtiva && !hasContaOrigemAtiva)
    ? 0
    : sortedLancamentos.filter(l => l.sinal < 0).reduce((s, l) => s + l.valor, 0);

  const toggleMes = (val: string) => {
    setMesesSelecionados(prev =>
      prev.includes(val) ? prev.filter(m => m !== val) : [...prev, val]
    );
  };

  const mesLabel = mesesSelecionados.length === 0
    ? 'Todos'
    : mesesSelecionados.length <= 3
      ? mesesSelecionados.map(m => MESES_LIST.find(x => x.value === m)?.label).join(', ')
      : `${mesesSelecionados.length} meses`;

  const handleLimparFiltros = () => {
    const d = getDefaults();
    setAno(d.ano);
    setMesesSelecionados([]);
    setStatusTransacao('__all__');
    setFazendaId(d.fazendaId);
    setTipoOperacao('__all__');
    setContaOrigem('__all__');
    setContaDestino('__all__');
    setMacroFiltro('__all__');
    setGrupoFiltro('__all__');
    setCentroFiltro('__all__');
    setSubcentroFiltro('__all__');
    setProdutoFiltro('');
    setFornecedorFiltro('__all__');
    setAtividadeFiltro('__all__');
    setMacroLocked(false);
    setSortField('default');
    setSortDir('asc');
    setCurrentPage(0);
  };

  // Determine which fazenda_id to pass to loadLancamentos
  const queryFazendaId = fazendaId !== '__all__' ? fazendaId : undefined;

  const selCls = "h-6 text-[10px]";
  const itemCls = "text-[10px] py-0.5";
  const lblCls = "text-[9px] font-semibold leading-none mb-0.5 block text-[hsl(213_52%_24%)]";

  const isMobile = useIsMobile();
  const [moreFiltersOpen, setMoreFiltersOpen] = useState(false);

  // Count active advanced filters for badge
  const advancedFilterCount = [
    contaOrigem !== '__all__',
    contaDestino !== '__all__',
    macroFiltro !== '__all__',
    grupoFiltro !== '__all__',
    centroFiltro !== '__all__',
    subcentroFiltro !== '__all__',
    produtoFiltro !== '',
    fornecedorFiltro !== '__all__',
    atividadeFiltro !== '__all__',
  ].filter(Boolean).length;

  return (
    <div className="space-y-1 pb-20" style={{ backgroundColor: '#F3F6FA' }}>
      {/* FILTERS */}
      <Card className="rounded-lg bg-white" style={{ border: '1px solid #D6DEE8', boxShadow: '0 2px 6px rgba(0,0,0,0.04)' }}>
        <CardContent className="p-2 space-y-1">
          {isMobile ? (
            <>
              {/* MOBILE: Row 1 — Ano | Mês | Tipo | Status */}
              <div className="grid grid-cols-4 gap-1 items-end">
                <div>
                  <label className={lblCls}>Ano</label>
                  <Select value={ano} onValueChange={setAno}>
                    <SelectTrigger className={`${selCls} w-full bg-white border-[#C9D4E2]`}><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__todos__" className={itemCls}>Todos</SelectItem>
                      {anos.map(a => <SelectItem key={a} value={a} className={itemCls}>{a}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <label className={lblCls}>Mês</label>
                  <Popover open={mesPopoverOpen} onOpenChange={setMesPopoverOpen}>
                    <PopoverTrigger asChild>
                      <Button variant="outline" className="h-6 text-[10px] justify-between font-normal px-1.5 w-full bg-white border-[#C9D4E2]">
                        {mesLabel}
                        <ChevronsUpDown className="h-2.5 w-2.5 opacity-50" />
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-44 p-1.5" align="start">
                      <div className="flex justify-between mb-0.5">
                        <button className="text-[9px] text-primary hover:underline" onClick={() => setMesesSelecionados([])}>Todos</button>
                        <button className="text-[9px] text-primary hover:underline" onClick={() => setMesesSelecionados(MESES_LIST.map(m => m.value))}>Marcar todos</button>
                      </div>
                      <div className="grid grid-cols-3 gap-0.5">
                        {MESES_LIST.map(m => (
                          <label key={m.value} className="flex items-center gap-0.5 text-[10px] cursor-pointer hover:bg-muted rounded px-0.5 py-0.5">
                            <Checkbox checked={mesesSelecionados.includes(m.value)} onCheckedChange={() => toggleMes(m.value)} className="h-2.5 w-2.5" />
                            {m.label}
                          </label>
                        ))}
                      </div>
                    </PopoverContent>
                  </Popover>
                </div>
                <div>
                  <label className={lblCls}>Tipo</label>
                  <Select value={tipoOperacao} onValueChange={v => { setTipoOperacao(v); setContaOrigem('__all__'); setContaDestino('__all__'); setMacroLocked(false); }}>
                    <SelectTrigger className={`${selCls} bg-white border-[#C9D4E2]`}><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__all__" className={itemCls}>Todos</SelectItem>
                      <SelectItem value="1-Entradas" className={itemCls}>Entradas</SelectItem>
                      <SelectItem value="2-Saídas" className={itemCls}>Saídas</SelectItem>
                      <SelectItem value="3-Transferência" className={itemCls}>Transf.</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <label className={lblCls}>Status</label>
                  <Select value={statusTransacao} onValueChange={setStatusTransacao}>
                    <SelectTrigger className={`${selCls} bg-white border-[#C9D4E2]`}><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__all__" className={itemCls}>Todos</SelectItem>
                      <SelectItem value="realizado" className={itemCls}>{CENTRAL_STATUS_LABEL.realizado}</SelectItem>
                      <SelectItem value="agendado" className={itemCls}>Agendado</SelectItem>
                      <SelectItem value="programado" className={itemCls}>{CENTRAL_STATUS_LABEL.programado}</SelectItem>
                      <SelectItem value="meta" className={itemCls}>{CENTRAL_STATUS_LABEL.meta}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {/* MOBILE: Row 2 — Conta Origem | Conta Destino | Macro */}
              <div className="grid grid-cols-3 gap-1 items-end">
                <div>
                  <label className={lblCls}>Conta Origem</label>
                  <Select value={contaOrigem} onValueChange={setContaOrigem} disabled={isEntrada}>
                    <SelectTrigger className={`${selCls} bg-white border-[#C9D4E2] ${isEntrada ? 'opacity-40' : ''}`}><SelectValue placeholder="Todas" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__all__" className={itemCls}>Todas</SelectItem>
                      {sortedContas.map(c => <SelectItem key={c.id} value={c.id} className={itemCls}>{contaLabel(c)}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <label className={lblCls}>Conta Destino</label>
                  <Select value={contaDestino} onValueChange={setContaDestino} disabled={isSaida}>
                    <SelectTrigger className={`${selCls} bg-white border-[#C9D4E2] ${isSaida ? 'opacity-40' : ''}`}><SelectValue placeholder="Todas" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__all__" className={itemCls}>Todas</SelectItem>
                      {sortedContas.map(c => <SelectItem key={c.id} value={c.id} className={itemCls}>{contaLabel(c)}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <label className={lblCls}>Macro</label>
                  <SearchableSelect
                    value={macroFiltro}
                    onValueChange={v => { setMacroFiltro(v); setGrupoFiltro('__all__'); setCentroFiltro('__all__'); setSubcentroFiltro('__all__'); setMacroLocked(false); }}
                    options={macrosUnicos.map(m => ({ value: m, label: m }))}
                    disabled={macroLocked}
                    placeholder="Todos"
                  />
                </div>
              </div>

              {/* MOBILE: Row 3 — Produto | Fornecedor */}
              <div className="grid grid-cols-2 gap-1 items-end">
                <div>
                  <label className={lblCls}>Produto</label>
                  <Input
                    value={produtoFiltro}
                    onChange={e => setProdutoFiltro(e.target.value)}
                    placeholder="Buscar..."
                    className="h-6 !text-[9px] placeholder:!text-[9px] leading-tight px-1.5 bg-white border-[#C9D4E2]"
                    autoCorrect="off" autoCapitalize="none" spellCheck={false}
                  />
                </div>
                <div>
                  <label className={lblCls}>Fornecedor</label>
                  <SearchableSelect
                    value={fornecedorFiltro}
                    onValueChange={setFornecedorFiltro}
                    options={hook.fornecedores.map(f => ({ value: f.id, label: f.nome }))}
                    placeholder="Todos"
                  />
                </div>
              </div>

              {/* MOBILE: Collapsible advanced filters */}
              <Collapsible open={moreFiltersOpen} onOpenChange={setMoreFiltersOpen}>
                <CollapsibleTrigger asChild>
                  <Button variant="ghost" className="h-5 text-[9px] gap-1 px-1 text-muted-foreground w-full justify-center">
                    <SlidersHorizontal className="h-2.5 w-2.5" />
                    Mais filtros
                    {advancedFilterCount > 0 && (
                      <Badge variant="secondary" className="h-3.5 px-1 text-[8px] ml-0.5">{advancedFilterCount}</Badge>
                    )}
                  </Button>
                </CollapsibleTrigger>
                <CollapsibleContent className="space-y-1 pt-1">
                  <div className="grid grid-cols-3 gap-1 items-end">
                    <div>
                      <label className={lblCls}>Grupo</label>
                      <SearchableSelect
                        value={grupoFiltro}
                        onValueChange={v => { setGrupoFiltro(v); setCentroFiltro('__all__'); setSubcentroFiltro('__all__'); setMacroLocked(false); }}
                        options={gruposUnicos.map(g => ({ value: g, label: g }))}
                        disabled={macroLocked}
                        placeholder="Todos"
                      />
                    </div>
                    <div>
                      <label className={lblCls}>Centro</label>
                      <SearchableSelect
                        value={centroFiltro}
                        onValueChange={v => { setCentroFiltro(v); setSubcentroFiltro('__all__'); setMacroLocked(false); }}
                        options={centrosUnicos.map(c => ({ value: c, label: c }))}
                        disabled={macroLocked}
                        placeholder="Todos"
                      />
                    </div>
                    <div>
                      <label className={lblCls}>Subcentro</label>
                      <SearchableSelect
                        value={subcentroFiltro}
                        onValueChange={handleSubcentroChange}
                        options={subcentrosUnicos.map(s => ({ value: s, label: s }))}
                        placeholder="Todos"
                      />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-1 items-end">
                    <div>
                      <label className={lblCls}>Fazenda</label>
                      <Select value={fazendaId} onValueChange={setFazendaId}>
                        <SelectTrigger className={`${selCls} bg-white border-[#C9D4E2]`}><SelectValue placeholder="Selecione" /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="__all__" className={itemCls}>Todas</SelectItem>
                          {fazOperacionais.map(f => <SelectItem key={f.id} value={f.id} className={itemCls}>{f.nome}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <label className={lblCls}>Atividade</label>
                      <Select value={atividadeFiltro} onValueChange={setAtividadeFiltro}>
                        <SelectTrigger className={`${selCls} bg-white border-[#C9D4E2]`}><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="__all__" className={itemCls}>Todos</SelectItem>
                          <SelectItem value="pecuaria" className={itemCls}>Pecuária</SelectItem>
                          <SelectItem value="agricultura" className={itemCls}>Agricultura</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                </CollapsibleContent>
              </Collapsible>

              {/* MOBILE: Actions + Summary row */}
              <div className="flex items-center justify-between pt-0.5">
                <div className="flex gap-1 items-center">
                  {onBack && (
                    <Button size="sm" variant="outline" onClick={onBack} className="h-6 text-[9px] gap-0.5 px-1 text-muted-foreground">
                      <ChevronLeft className="h-3 w-3" />
                    </Button>
                  )}
                  <Button size="sm" variant="ghost" onClick={handleLimparFiltros} className="h-6 text-[9px] gap-0.5 px-1 text-muted-foreground">
                    <FilterX className="h-3 w-3" />
                  </Button>
                  <FinanceiroV2ExportMenu
                    lancamentos={sortedLancamentos}
                    fornecedores={hook.fornecedores}
                    ano={ano}
                    fazendaNome={fazOperacionais.find(f => f.id === fazendaId)?.nome}
                    totalCount={totalLancamentosFiltrados}
                  />
                  <Button
                    size="sm"
                    variant={mode === 'rapido' ? 'default' : 'outline'}
                    onClick={() => setMode(mode === 'rapido' ? 'list' : 'rapido')}
                    className="h-6 text-[9px] gap-0.5 px-1.5"
                  >
                    {mode === 'rapido' ? <List className="h-3 w-3" /> : <Zap className="h-3 w-3" />}
                  </Button>
                  {mode === 'list' && !mesFechadoAtivo && (
                    <Button size="sm" onClick={openNew} className="h-6 text-[9px] gap-0.5 px-1.5 bg-[#E7C873] text-foreground hover:bg-[#D9B95F]">
                      <Plus className="h-3 w-3" /> Novo
                    </Button>
                  )}
                </div>
                <div className="flex gap-1.5 text-[9px] items-center">
                  <span className="text-success font-bold">{formatMoeda(totalEntradas)}</span>
                  <span className="text-destructive font-bold">{formatMoeda(totalSaidas)}</span>
                  <span className="text-muted-foreground">{totalLancamentosFiltrados}</span>
                </div>
              </div>
            </>
          ) : (
            <>
              {/* DESKTOP: LINE 1 — Ano | Mês | Tipo | Status | Fazenda | Atividade */}
              <div className="grid grid-cols-[62px_77px_106px_106px_0.35fr_110px] gap-1.5 items-end">
                <div>
                  <label className={lblCls}>Ano</label>
                  <Select value={ano} onValueChange={setAno}>
                    <SelectTrigger className={`${selCls} w-full bg-white border-[#C9D4E2] hover:border-[#AFC2D8] focus:border-[#1E3A5F]`}><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__todos__" className={itemCls}>Todos</SelectItem>
                      {anos.map(a => <SelectItem key={a} value={a} className={itemCls}>{a}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <label className={lblCls}>Mês</label>
                  <Popover open={mesPopoverOpen} onOpenChange={setMesPopoverOpen}>
                    <PopoverTrigger asChild>
                      <Button variant="outline" className="h-6 text-[10px] justify-between font-normal px-1.5 w-full bg-white border-[#C9D4E2] hover:border-[#AFC2D8]">
                        {mesLabel}
                        <ChevronsUpDown className="h-2.5 w-2.5 opacity-50" />
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-44 p-1.5" align="start">
                      <div className="flex justify-between mb-0.5">
                        <button className="text-[9px] text-primary hover:underline" onClick={() => setMesesSelecionados([])}>Todos</button>
                        <button className="text-[9px] text-primary hover:underline" onClick={() => setMesesSelecionados(MESES_LIST.map(m => m.value))}>Marcar todos</button>
                      </div>
                      <div className="grid grid-cols-3 gap-0.5">
                        {MESES_LIST.map(m => (
                          <label key={m.value} className="flex items-center gap-0.5 text-[10px] cursor-pointer hover:bg-muted rounded px-0.5 py-0.5">
                            <Checkbox checked={mesesSelecionados.includes(m.value)} onCheckedChange={() => toggleMes(m.value)} className="h-2.5 w-2.5" />
                            {m.label}
                          </label>
                        ))}
                      </div>
                    </PopoverContent>
                  </Popover>
                </div>
                <div>
                  <label className={lblCls}>Tipo</label>
                  <Select value={tipoOperacao} onValueChange={v => { setTipoOperacao(v); setContaOrigem('__all__'); setContaDestino('__all__'); setMacroLocked(false); }}>
                    <SelectTrigger className={`${selCls} bg-white border-[#C9D4E2] hover:border-[#AFC2D8] focus:border-[#1E3A5F]`}><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__all__" className={itemCls}>Todos</SelectItem>
                      <SelectItem value="1-Entradas" className={itemCls}>Entradas</SelectItem>
                      <SelectItem value="2-Saídas" className={itemCls}>Saídas</SelectItem>
                      <SelectItem value="3-Transferência" className={itemCls}>Transferências</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <label className={lblCls}>Status</label>
                  <Select value={statusTransacao} onValueChange={setStatusTransacao}>
                    <SelectTrigger className={`${selCls} bg-white border-[#C9D4E2] hover:border-[#AFC2D8] focus:border-[#1E3A5F]`}><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__all__" className={itemCls}>Todos</SelectItem>
                      <SelectItem value="realizado" className={itemCls}>{CENTRAL_STATUS_LABEL.realizado}</SelectItem>
                      <SelectItem value="agendado" className={itemCls}>Agendado</SelectItem>
                      <SelectItem value="programado" className={itemCls}>{CENTRAL_STATUS_LABEL.programado}</SelectItem>
                      <SelectItem value="meta" className={itemCls}>{CENTRAL_STATUS_LABEL.meta}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <label className={lblCls}>Fazenda</label>
                  <Select value={fazendaId} onValueChange={setFazendaId}>
                    <SelectTrigger className={`${selCls} bg-white border-[#C9D4E2] hover:border-[#AFC2D8] focus:border-[#1E3A5F]`}><SelectValue placeholder="Selecione" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__all__" className={itemCls}>Todas</SelectItem>
                      {fazOperacionais.map(f => <SelectItem key={f.id} value={f.id} className={itemCls}>{f.nome}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <label className={lblCls}>Atividade</label>
                  <Select value={atividadeFiltro} onValueChange={setAtividadeFiltro}>
                    <SelectTrigger className={`${selCls} bg-white border-[#C9D4E2] hover:border-[#AFC2D8] focus:border-[#1E3A5F]`}><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__all__" className={itemCls}>Todos</SelectItem>
                      <SelectItem value="pecuaria" className={itemCls}>Pecuária</SelectItem>
                      <SelectItem value="agricultura" className={itemCls}>Agricultura</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {/* DESKTOP: LINE 2 — Conta Origem | Conta Destino | Macro | Grupo | Centro | Subcentro + Buttons */}
              <div className="flex items-end gap-1.5">
                <div className="grid grid-cols-[130px_130px_120px_120px_120px_120px] gap-1.5 items-end flex-1">
                  <div>
                    <label className={lblCls}>Conta Origem</label>
                    <Select value={contaOrigem} onValueChange={setContaOrigem} disabled={isEntrada}>
                      <SelectTrigger className={`${selCls} bg-white border-[#C9D4E2] hover:border-[#AFC2D8] focus:border-[#1E3A5F] ${isEntrada ? 'opacity-40' : ''}`}><SelectValue placeholder="Todas" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__all__" className={itemCls}>Todas</SelectItem>
                        {sortedContas.map(c => <SelectItem key={c.id} value={c.id} className={itemCls}>{contaLabel(c)}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <label className={lblCls}>Conta Destino</label>
                    <Select value={contaDestino} onValueChange={setContaDestino} disabled={isSaida}>
                      <SelectTrigger className={`${selCls} bg-white border-[#C9D4E2] hover:border-[#AFC2D8] focus:border-[#1E3A5F] ${isSaida ? 'opacity-40' : ''}`}><SelectValue placeholder="Todas" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__all__" className={itemCls}>Todas</SelectItem>
                        {sortedContas.map(c => <SelectItem key={c.id} value={c.id} className={itemCls}>{contaLabel(c)}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <label className={lblCls}>Macro</label>
                    <SearchableSelect
                      value={macroFiltro}
                      onValueChange={v => { setMacroFiltro(v); setGrupoFiltro('__all__'); setCentroFiltro('__all__'); setSubcentroFiltro('__all__'); setMacroLocked(false); }}
                      options={macrosUnicos.map(m => ({ value: m, label: m }))}
                      disabled={macroLocked}
                      placeholder="Buscar macro..."
                    />
                  </div>
                  <div>
                    <label className={lblCls}>Grupo</label>
                    <SearchableSelect
                      value={grupoFiltro}
                      onValueChange={v => { setGrupoFiltro(v); setCentroFiltro('__all__'); setSubcentroFiltro('__all__'); setMacroLocked(false); }}
                      options={gruposUnicos.map(g => ({ value: g, label: g }))}
                      disabled={macroLocked}
                      placeholder="Buscar grupo..."
                    />
                  </div>
                  <div>
                    <label className={lblCls}>Centro</label>
                    <SearchableSelect
                      value={centroFiltro}
                      onValueChange={v => { setCentroFiltro(v); setSubcentroFiltro('__all__'); setMacroLocked(false); }}
                      options={centrosUnicos.map(c => ({ value: c, label: c }))}
                      disabled={macroLocked}
                      placeholder="Buscar centro..."
                    />
                  </div>
                  <div>
                    <label className={lblCls}>Subcentro</label>
                    <SearchableSelect
                      value={subcentroFiltro}
                      onValueChange={handleSubcentroChange}
                      options={subcentrosUnicos.map(s => ({ value: s, label: s }))}
                      placeholder="Buscar subcentro..."
                    />
                  </div>
                </div>
                <div className="flex gap-1 items-end pb-[1px]">
                  {onBack && (
                    <Button size="sm" variant="outline" onClick={onBack} className="h-6 text-[10px] gap-0.5 px-1.5 text-muted-foreground">
                      <ChevronLeft className="h-3 w-3" /> Voltar
                    </Button>
                  )}
                  <Button size="sm" variant="ghost" onClick={handleLimparFiltros} className="h-6 text-[10px] gap-0.5 px-1.5 text-muted-foreground">
                    <FilterX className="h-3 w-3" /> Limpar
                  </Button>
                  <FinanceiroV2ExportMenu
                    lancamentos={sortedLancamentos}
                    fornecedores={hook.fornecedores}
                    ano={ano}
                    fazendaNome={fazOperacionais.find(f => f.id === fazendaId)?.nome}
                    totalCount={totalLancamentosFiltrados}
                  />
                  <Button
                    size="sm"
                    variant={mode === 'rapido' ? 'default' : 'outline'}
                    onClick={() => setMode(mode === 'rapido' ? 'list' : 'rapido')}
                    className="h-6 text-[10px] gap-0.5 px-2"
                  >
                    {mode === 'rapido' ? <List className="h-3 w-3" /> : <Zap className="h-3 w-3" />}
                    {mode === 'rapido' ? 'Lista' : 'Rápido'}
                  </Button>
                  {mode === 'list' && !mesFechadoAtivo && (
                    <Button size="sm" onClick={openNew} className="h-6 text-[10px] gap-0.5 px-2 bg-[#E7C873] text-foreground hover:bg-[#D9B95F]">
                      <Plus className="h-3 w-3" /> Novo
                    </Button>
                  )}
                </div>
              </div>

              {/* DESKTOP: LINE 3 — Produto | Fornecedor + Summary */}
              <div className="flex items-end gap-1.5">
                <div className="grid grid-cols-[200px_300px] gap-1.5 items-end">
                  <div>
                    <label className={lblCls}>Produto</label>
                    <Input
                      value={produtoFiltro}
                      onChange={e => setProdutoFiltro(e.target.value)}
                      placeholder="Buscar..."
                      className="h-6 !text-[8px] placeholder:!text-[8px] leading-tight px-1.5 bg-white border-[#C9D4E2] hover:border-[#AFC2D8] focus-visible:ring-[#1E3A5F]"
                      autoCorrect="off" autoCapitalize="none" spellCheck={false}
                    />
                  </div>
                  <div>
                    <label className={lblCls}>Fornecedor</label>
                    <SearchableSelect
                      value={fornecedorFiltro}
                      onValueChange={setFornecedorFiltro}
                      options={hook.fornecedores.map(f => ({ value: f.id, label: f.nome }))}
                      placeholder="Buscar fornecedor..."
                    />
                  </div>
                </div>
                <div className="flex gap-2 text-[10px] items-center ml-auto pb-[1px]">
                  <span className="text-success font-bold">Entradas: {formatMoeda(totalEntradas)}</span>
                  <span className="text-destructive font-bold">Saídas: {formatMoeda(totalSaidas)}</span>
                  <span className="text-muted-foreground">{totalLancamentosFiltrados} lanç.</span>
                </div>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* Fechamento mensal banner */}
      {singleMonthSelected && fazendaId !== '__all__' && (
        <FechamentoMensalBanner
          anoMes={singleMonthSelected}
          status={singleMonthStatus as 'aberto' | 'fechado'}
          podFechar={fechamentoHook.podFechar}
          podReabrir={fechamentoHook.podReabrir}
          onFechar={() => fechamentoHook.fecharMes(fazendaId, singleMonthSelected)}
          onReabrir={() => fechamentoHook.reabrirMes(fazendaId, singleMonthSelected)}
        />
      )}

      {(!queryFazendaId && fazendaId !== '__all__') && (
        <div className="text-center text-muted-foreground py-6 text-[10px]">
          Selecione uma fazenda e um ano para carregar os lançamentos.
        </div>
      )}

      {hook.loading && (
        <div className="text-center text-muted-foreground py-4 text-[10px] animate-pulse">Carregando...</div>
      )}

      {mode === 'rapido' && !mesFechadoAtivo && (fazendaId === '__all__' || fazendaId) && (
        <ModoRapidoGrid
          fazendaId={fazendaId !== '__all__' ? fazendaId : fazOperacionais[0]?.id || ''}
          contas={hook.contasBancarias}
          classificacoes={hook.classificacoes}
          onSaveBatch={hook.criarLancamentosEmLote}
          onDone={() => hook.loadLancamentos(filtros, 0)}
        />
      )}

      {mode === 'list' && !hook.loading && ano && (
        <>
          <CorrecaoTransferenciasBanner
            contas={hook.contasBancarias}
            onFixed={() => hook.loadLancamentos(filtros, hook.page)}
          />
           <div ref={scrollContainerRef} className="rounded-lg border border-[hsl(var(--border))] overflow-auto relative pr-3" style={{ maxHeight: 'calc(100vh - 260px - var(--bottom-nav-safe, 64px))' }}>
            <table className="table-financeiro w-full caption-bottom text-sm border-collapse" style={{ tableLayout: 'fixed' }}>
              <colgroup>
                <col style={{ width: 28 }} />
                <col style={{ width: 62 }} />
                <col style={{ width: 62 }} />
                <col />
                <col style={{ width: 200 }} />
                <col style={{ width: 120 }} />
                <col style={{ width: 110 }} />
                <col style={{ width: 90 }} />
                <col style={{ width: 68 }} />
                <col style={{ width: 40 }} />
              </colgroup>
              <thead className="[&_tr]:border-b sticky top-0 z-20 bg-primary">
                <tr className="border-b !h-auto">
                  <th className="px-1 py-[3px] text-center align-middle bg-primary sticky left-0 z-30">
                    <Checkbox checked={allSelected} onCheckedChange={toggleSelectAll} className="h-3 w-3 border-primary-foreground data-[state=checked]:bg-primary-foreground data-[state=checked]:text-primary" />
                  </th>
                  <th className="px-0.5 py-[3px] text-center align-middle text-[8px] uppercase leading-tight font-semibold text-primary-foreground cursor-pointer select-none sticky left-[28px] z-30 bg-primary" onClick={() => toggleSort('data')}>Comp.<SortIndicator field="data" /></th>
                  <th className="px-0.5 py-[3px] text-center align-middle text-[8px] uppercase leading-tight font-semibold text-primary-foreground cursor-pointer select-none sticky left-[90px] z-30 bg-primary" onClick={() => toggleSort('pgto')}>Pgto<SortIndicator field="pgto" /></th>
                  <th className="px-1 py-[3px] text-center align-middle text-[8px] uppercase leading-tight font-semibold text-primary-foreground cursor-pointer select-none" onClick={() => toggleSort('produto')}>Produto<SortIndicator field="produto" /></th>
                  <th className="px-1 py-[3px] text-center align-middle text-[8px] uppercase leading-tight font-semibold text-primary-foreground cursor-pointer select-none" onClick={() => toggleSort('fornecedor')}>Fornecedor<SortIndicator field="fornecedor" /></th>
                  <th className="px-1 py-[3px] text-center align-middle text-[8px] uppercase leading-tight font-semibold text-primary-foreground cursor-pointer select-none" onClick={() => toggleSort('centro')}>Centro<SortIndicator field="centro" /></th>
                  <th className="px-1 py-[3px] text-center align-middle text-[8px] uppercase leading-tight font-semibold text-primary-foreground cursor-pointer select-none" onClick={() => toggleSort('valor')}>Valor<SortIndicator field="valor" /></th>
                  <th className="px-1 py-[3px] text-center align-middle text-[8px] uppercase leading-tight font-semibold text-primary-foreground">Doc.</th>
                  <th className="px-1 py-[3px] text-center align-middle text-[8px] uppercase leading-tight font-semibold text-primary-foreground cursor-pointer select-none" onClick={() => toggleSort('status')}>Status<SortIndicator field="status" /></th>
                  <th className="px-1 py-[3px] text-center align-middle text-[8px] uppercase leading-tight font-semibold text-primary-foreground"></th>
                </tr>
              </thead>
              <tbody className="[&_tr:last-child]:border-0">
                {totalLancamentosFiltrados === 0 ? (
                  <tr className="border-b">
                    <td colSpan={10} className="text-center text-muted-foreground py-4 text-[10px]">
                      Nenhum lançamento encontrado.
                    </td>
                  </tr>
                ) : (
                  sortedLancamentos.map(l => {
                    const fornNome = fornecedoresMap.get(l.favorecido_id || '');
                    const stKey = (l.status_transacao || '').toLowerCase();
                    const stLabel = STATUS_LABELS[stKey] || l.status_transacao || '-';
                    const stColor = STATUS_TEXT_COLORS[stKey] || 'text-muted-foreground';
                    const isHistoricoReadOnly = l.origem_lancamento === 'importacao_historica';
                    const isImported = !!l.lote_importacao_id;
                    const rowMesFechado = fazendaId !== '__all__' && fechamentoHook.isMesFechado(l.fazenda_id, l.ano_mes);
                    const canEditRow = !isHistoricoReadOnly && !rowMesFechado;

                    return (
                      <tr key={l.id} className={`border-b italic !h-auto hover:bg-muted/50 transition-colors ${selectedIds.has(l.id) ? 'bg-primary/5' : ''}`}>
                        <td className="px-1 py-1 align-middle text-center sticky left-0 z-10 bg-background">
                          <Checkbox checked={selectedIds.has(l.id)} onCheckedChange={() => toggleSelect(l.id)} className="h-3 w-3" />
                        </td>
                        <td className="font-mono px-0.5 py-1 align-middle text-[12px] font-medium leading-tight sticky left-[28px] z-10 bg-background text-center">{fmtDate(l.data_competencia)}</td>
                        <td className="font-mono px-0.5 py-1 align-middle text-[12px] font-medium leading-tight sticky left-[90px] z-10 bg-background text-center">{fmtDate(l.data_pagamento)}</td>
                        <td className="truncate px-2 py-1 align-middle text-[12px] font-medium leading-tight" title={l.descricao || ''}>{l.descricao || '-'}</td>
                        <td className="truncate px-2 py-1 align-middle text-[12px] font-medium leading-tight" title={fornNome || ''}>
                          {fornNome || (!l.favorecido_id ? '-' : <span className="text-warning">n/c</span>)}
                        </td>
                        <td className="truncate px-2 py-1 align-middle text-[12px] font-medium leading-tight" title={l.centro_custo || ''}>{l.centro_custo || '-'}</td>
                        <td className={`text-right font-semibold whitespace-nowrap px-2 py-1 align-middle text-[12px] leading-tight ${l.sinal > 0 ? 'text-success' : 'text-destructive'}`}>
                          {fmtValor(l.valor, l.sinal)}
                        </td>
                        <td className="font-mono text-muted-foreground text-center px-1 py-1 align-middle text-[10px] leading-tight truncate" title={formatNF(l)}>{formatNF(l)}</td>
                        <td className={`text-center px-1 py-1 align-middle text-[12px] leading-tight ${stColor}`}>{stLabel}</td>
                        <td className="!py-0 px-0 w-[40px] align-middle">
                          <div className="flex items-center justify-center gap-0.5">
                            <Button variant="ghost" size="icon" className="h-5 w-5 rounded-sm" onClick={() => openEdit(l)} disabled={!canEditRow} title={rowMesFechado ? 'Mês fechado' : isHistoricoReadOnly ? 'Histórico antigo: somente leitura' : 'Editar'}>
                              <Pencil className="h-2.5 w-2.5" />
                            </Button>
                            <Button variant="ghost" size="icon" className="h-5 w-5 rounded-sm" onClick={() => handleDuplicate(l)} disabled={rowMesFechado} title={rowMesFechado ? 'Mês fechado' : 'Duplicar'}>
                              <Copy className="h-2.5 w-2.5" />
                            </Button>
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          {/* Bulk action bar */}
          {someSelected && (
            <div className="flex items-center gap-2 px-2 py-1.5 bg-destructive/10 border border-destructive/30 rounded-lg">
              <span className="text-[11px] font-semibold">{selectedIds.size} selecionado{selectedIds.size !== 1 ? 's' : ''}</span>
              <Button size="sm" variant="destructive" className="h-6 text-[10px] gap-1 px-2" onClick={() => setConfirmDeleteOpen(true)}>
                <Trash2 className="h-3 w-3" /> Excluir selecionados
              </Button>
              <Button size="sm" variant="ghost" className="h-6 text-[10px] gap-1 px-2" onClick={() => setSelectedIds(new Set())}>
                <X className="h-3 w-3" /> Cancelar seleção
              </Button>
            </div>
          )}

          {/* Total count + cleanup button */}
          <div className="flex items-center justify-between px-1 py-1">
            <span className="text-[10px] text-muted-foreground">
              {totalLancamentosFiltrados} lançamento{totalLancamentosFiltrados !== 1 ? 's' : ''} encontrado{totalLancamentosFiltrados !== 1 ? 's' : ''}
            </span>
            {realizadosImportadosCount > 0 && (
              <Button
                size="sm"
                variant="destructive"
                className="h-6 text-[10px] gap-1 px-2"
                onClick={() => setConfirmCleanupOpen(true)}
              >
                <Trash2 className="h-3 w-3" /> Excluir realizados importados ({realizadosImportadosCount})
              </Button>
            )}
            <Button
              size="sm"
              variant="destructive"
              className="h-6 text-[10px] gap-1 px-2"
              onClick={() => setConfirmMigracaoOpen(true)}
            >
              <Trash2 className="h-3 w-3" /> Cancelar migração 2025
            </Button>
          </div>
        </>
      )}

      <LancamentoV2Dialog
        open={dialogOpen}
        onClose={() => { setDialogOpen(false); setEditingLanc(null); }}
        onSave={handleSave}
        onDelete={editingLanc?.lote_importacao_id ? undefined : handleDelete}
        lancamento={editingLanc}
        fazendas={fazendas}
        contas={hook.contasBancarias}
        classificacoes={hook.classificacoes}
        fornecedores={hook.fornecedores}
        defaultFazendaId={fazendaId !== '__all__' ? fazendaId : fazOperacionais[0]?.id || ''}
        onCriarFornecedor={hook.criarFornecedor}
      />

      {/* Bulk delete confirmation */}
      <AlertDialog open={confirmDeleteOpen} onOpenChange={setConfirmDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir lançamentos em massa</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2 text-sm">
                <p><strong>{selectedIds.size}</strong> lançamento{selectedIds.size !== 1 ? 's' : ''} selecionado{selectedIds.size !== 1 ? 's' : ''}.</p>
                {bloqueadosInfo.importados.length > 0 && (
                  <p className="text-destructive font-semibold">
                    ⚠ {bloqueadosInfo.importados.length} lançamento{bloqueadosInfo.importados.length !== 1 ? 's' : ''} importado{bloqueadosInfo.importados.length !== 1 ? 's' : ''} não {bloqueadosInfo.importados.length !== 1 ? 'podem' : 'pode'} ser excluído{bloqueadosInfo.importados.length !== 1 ? 's' : ''}.
                  </p>
                )}
                <p><strong>{bloqueadosInfo.deletaveis.length}</strong> lançamento{bloqueadosInfo.deletaveis.length !== 1 ? 's serão' : ' será'} excluído{bloqueadosInfo.deletaveis.length !== 1 ? 's' : ''} permanentemente.</p>
                <p className="text-[11px] text-muted-foreground">Origens: {bloqueadosInfo.origens.join(', ')}</p>
                <p className="text-destructive font-bold text-xs mt-2">Essa ação não pode ser desfeita.</p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={bulkDeleting}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleBulkDelete}
              disabled={bulkDeleting || bloqueadosInfo.deletaveis.length === 0}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {bulkDeleting ? 'Excluindo...' : `Excluir ${bloqueadosInfo.deletaveis.length} lançamento${bloqueadosInfo.deletaveis.length !== 1 ? 's' : ''}`}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Cleanup imported realizado confirmation */}
      <AlertDialog open={confirmCleanupOpen} onOpenChange={(open) => { setConfirmCleanupOpen(open); if (!open) setCleanupConfirmText(''); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="text-destructive">⚠ Excluir realizados importados</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-3 text-sm">
                <p>Você está prestes a <strong className="text-destructive">cancelar permanentemente</strong> todos os lançamentos que atendem aos critérios:</p>
                <ul className="list-disc pl-4 space-y-1 text-[12px]">
                  <li>Status: <strong>Realizado</strong></li>
                  <li>Origem: <strong>Importação</strong> (possuem lote de importação)</li>
                  <li>Dentro dos filtros atualmente aplicados</li>
                </ul>
                <p className="text-[12px] text-muted-foreground">Metas, programados e contratos <strong>não serão afetados</strong>.</p>
                <p className="font-bold text-destructive">{realizadosImportadosCount} lançamento{realizadosImportadosCount !== 1 ? 's serão' : ' será'} removido{realizadosImportadosCount !== 1 ? 's' : ''}.</p>
                <div className="pt-2 border-t">
                  <label className="text-[11px] font-semibold block mb-1">Digite <span className="font-mono text-destructive">CONFIRMAR</span> para prosseguir:</label>
                  <Input
                    value={cleanupConfirmText}
                    onChange={(e) => setCleanupConfirmText(e.target.value)}
                    placeholder="CONFIRMAR"
                    className="h-8 text-sm"
                    autoFocus
                  />
                </div>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={cleanupDeleting}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleCleanupRealizados}
              disabled={cleanupDeleting || cleanupConfirmText !== 'CONFIRMAR'}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {cleanupDeleting ? 'Excluindo...' : `Excluir ${realizadosImportadosCount} realizado${realizadosImportadosCount !== 1 ? 's' : ''}`}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Cancel migration 2025 confirmation */}
      <AlertDialog open={confirmMigracaoOpen} onOpenChange={(open) => { setConfirmMigracaoOpen(open); if (!open) setMigracaoConfirmText(''); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="text-destructive">🔴 Cancelar registros de migração 2025</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-3 text-sm">
                <p>Você está prestes a <strong className="text-destructive">cancelar permanentemente</strong> todos os registros de migração do ano 2025.</p>
                <ul className="list-disc pl-4 space-y-1 text-[12px]">
                  <li>Origem: <strong>migracao</strong></li>
                  <li>Status: <strong>realizado</strong></li>
                  <li>Período: <strong>Jan/2025 a Dez/2025</strong></li>
                  <li>Total estimado: <strong>6.088 registros</strong></li>
                </ul>
                <div className="bg-green-50 dark:bg-green-950/30 border border-green-200 dark:border-green-800 rounded p-2 text-[12px]">
                  <p className="font-semibold text-green-700 dark:text-green-400">✅ Serão preservados:</p>
                  <ul className="list-disc pl-4 mt-1 space-y-0.5">
                    <li>46 registros de origem <strong>manual</strong></li>
                    <li>4 registros de origem <strong>movimentação de rebanho</strong></li>
                    <li>1 registro <strong>meta</strong> de migração</li>
                  </ul>
                </div>
                <div className="pt-2 border-t">
                  <label className="text-[11px] font-semibold block mb-1">Digite <span className="font-mono text-destructive">CONFIRMAR</span> para prosseguir:</label>
                  <Input
                    value={migracaoConfirmText}
                    onChange={(e) => setMigracaoConfirmText(e.target.value)}
                    placeholder="CONFIRMAR"
                    className="h-8 text-sm"
                    autoFocus
                  />
                </div>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={migracaoDeleting}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleCancelarMigracao2025}
              disabled={migracaoDeleting || migracaoConfirmText !== 'CONFIRMAR'}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {migracaoDeleting ? 'Cancelando...' : 'Cancelar migração 2025'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

    </div>
  );
}
