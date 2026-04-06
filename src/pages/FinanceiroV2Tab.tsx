import { useState, useEffect, useCallback, useMemo } from 'react';
import { formatMoeda } from '@/lib/calculos/formatters';
import { STATUS_LABEL as CENTRAL_STATUS_LABEL } from '@/lib/statusOperacional';
import { SearchableSelect } from '@/components/ui/searchable-select';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Plus, Pencil, Copy, ChevronLeft, ChevronRight, Zap, List, ChevronsUpDown, FilterX, Download, AlertTriangle } from 'lucide-react';
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
function contaLabel(c: { nome_conta: string; nome_exibicao?: string | null }): string {
  return c.nome_exibicao || c.nome_conta;
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
  previsto: CENTRAL_STATUS_LABEL.previsto,
  agendado: 'Agendado',
  confirmado: CENTRAL_STATUS_LABEL.confirmado,
  conciliado: CENTRAL_STATUS_LABEL.conciliado,
};
const STATUS_TEXT_COLORS: Record<string, string> = {
  previsto: 'text-orange-500',
  agendado: 'text-emerald-400',
  confirmado: 'text-sky-500',
  conciliado: 'text-green-700 dark:text-green-400 font-bold',
};

function fmtValor(v: number, sinal: number) {
  return formatMoeda(Math.abs(v) * (sinal >= 0 ? 1 : -1));
}
function fmtDate(d: string | null) {
  if (!d) return '-';
  try { return format(parseISO(d), 'dd/MM/yy'); } catch { return d; }
}
function formatNF(nf: string | null | undefined): string {
  if (!nf) return '-';
  const digits = nf.replace(/\D/g, '');
  if (!digits) return '-';
  const padded = digits.padStart(9, '0').slice(-9);
  return `${padded.slice(0, 3)}.${padded.slice(3, 6)}.${padded.slice(6, 9)}`;
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
  

  // Sorting state
   type SortField = 'default' | 'data' | 'pgto' | 'valor' | 'produto' | 'fornecedor';
  type SortDir = 'asc' | 'desc';
   const [sortField, setSortField] = useState<SortField>('default');
   const [sortDir, setSortDir] = useState<SortDir>('asc');

  const fazOperacionais = useMemo(() => sortFazendas(fazendas.filter(f => f.id !== '__global__')), [fazendas]);

  const sortedContas = useMemo(() => sortContas(hook.contasBancarias), [hook.contasBancarias]);

  const isEntrada = tipoOperacao === '1-Entradas';
  const isSaida = tipoOperacao === '2-Saídas';
  const isTransf = tipoOperacao === '3-Transferência';

  // Classification helpers
  const macrosUnicos = useMemo(() => {
    const set = new Set(hook.classificacoes.map(c => c.macro_custo).filter(Boolean));
    return sortMacros(Array.from(set));
  }, [hook.classificacoes]);

  const centrosUnicos = useMemo(() => {
    let items = hook.classificacoes;
    if (macroFiltro !== '__all__') items = items.filter(c => c.macro_custo === macroFiltro);
    const set = new Set(items.map(c => c.centro_custo).filter(Boolean));
    return Array.from(set).sort();
  }, [hook.classificacoes, macroFiltro]);

  const subcentrosUnicos = useMemo(() => {
    let items = hook.classificacoes;
    if (macroFiltro !== '__all__') items = items.filter(c => c.macro_custo === macroFiltro);
    if (centroFiltro !== '__all__') items = items.filter(c => c.centro_custo === centroFiltro);
    const set = new Set(items.map(c => c.subcentro).filter(Boolean));
    return Array.from(set).sort();
  }, [hook.classificacoes, macroFiltro, centroFiltro]);

  // Subcentro selection: auto-fill macro + centro
  const handleSubcentroChange = (val: string) => {
    setSubcentroFiltro(val);
    if (val !== '__all__') {
      const match = hook.classificacoes.find(c => c.subcentro === val);
      if (match) {
        setMacroFiltro(match.macro_custo || '__all__');
        setCentroFiltro(match.centro_custo || '__all__');
        setMacroLocked(true);
      }
    } else {
      // Clear: unlock macro/centro
      if (macroLocked) {
        setMacroFiltro('__all__');
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
    ano,
    mes: mesesSelecionados.length === 0 ? 'todos' : undefined,
    meses: mesesSelecionados.length > 0 ? mesesSelecionados : undefined,
    conta_bancaria_id: contaOrigem !== '__all__' ? contaOrigem : undefined,
    conta_destino_id: contaDestino !== '__all__' ? contaDestino : undefined,
    tipo_operacao: tipoOperacao !== '__all__' ? tipoOperacao : undefined,
    status_transacao: statusTransacao !== '__all__' ? statusTransacao : undefined,
    macro_custo: macroFiltro !== '__all__' ? macroFiltro : undefined,
    centro_custo: centroFiltro !== '__all__' ? centroFiltro : undefined,
    subcentro: subcentroFiltro !== '__all__' ? subcentroFiltro : undefined,
  }), [fazendaId, ano, mesesSelecionados, contaOrigem, contaDestino, tipoOperacao, statusTransacao, macroFiltro, centroFiltro, subcentroFiltro]);

  useEffect(() => {
    hook.loadLancamentos(filtros, 0);
  }, [filtros]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    setCurrentPage(0);
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
      await hook.loadLancamentos(filtros, hook.page);
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
    if (ok) hook.loadLancamentos(filtros, hook.page);
    return ok;
  };
  const handleDuplicate = async (lanc: LancamentoV2) => {
    const ok = await hook.duplicarLancamento(lanc);
    if (ok) hook.loadLancamentos(filtros, hook.page);
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

  const filteredLancamentos = useMemo(() => {
    let items = hook.lancamentos;
    // Client-side filters already handled server-side via buildLancamentosQuery.
    // No additional client-side conta filtering needed.

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
    return items;
  }, [hook.lancamentos, contaOrigem, contaDestino, produtoFiltro, fornecedorFiltro, atividadeFiltro]);

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
        default:
          primary = 0;
      }

      if (primary !== 0) return primary;
      return compareDefaultOrder(a, b);
    });
    return items;
  }, [filteredLancamentos, sortField, sortDir, compareDefaultOrder, fornecedoresMap]);

  const totalLancamentosFiltrados = sortedLancamentos.length;
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
  const sortIcon = (field: Exclude<SortField, 'default'>) => {
    if (sortField === 'default') return field === 'pgto' ? ' ↑' : '';
    return sortField === field ? (sortDir === 'asc' ? ' ↑' : ' ↓') : '';
  };

  const totalEntradas = sortedLancamentos.filter(l => l.sinal > 0).reduce((s, l) => s + l.valor, 0);
  const totalSaidas = sortedLancamentos.filter(l => l.sinal < 0).reduce((s, l) => s + l.valor, 0);

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

  // Compact select class
  const selCls = "h-6 text-[10px]";
  const itemCls = "text-[10px] py-0.5";
  const lblCls = "text-[9px] font-semibold leading-none mb-0.5 block text-[hsl(213_52%_24%)]";

  return (
    <div className="space-y-1 pb-20" style={{ backgroundColor: '#F3F6FA' }}>
      {/* FILTERS */}
      <Card className="rounded-lg bg-white" style={{ border: '1px solid #D6DEE8', boxShadow: '0 2px 6px rgba(0,0,0,0.04)' }}>
        <CardContent className="p-2 space-y-1">
          {/* LINE 1: Ano | Mês | Tipo | Status | Fazenda | Atividade */}
          <div className="grid grid-cols-[62px_77px_106px_106px_0.35fr_110px] gap-1.5 items-end">
            <div>
              <label className={lblCls}>Ano</label>
              <Select value={ano} onValueChange={setAno}>
                <SelectTrigger className={`${selCls} w-full bg-white border-[#C9D4E2] hover:border-[#AFC2D8] focus:border-[#1E3A5F]`}><SelectValue /></SelectTrigger>
                <SelectContent>{anos.map(a => <SelectItem key={a} value={a} className={itemCls}>{a}</SelectItem>)}</SelectContent>
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
              <Select value={tipoOperacao} onValueChange={v => { setTipoOperacao(v); setContaOrigem('__all__'); setContaDestino('__all__'); }}>
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
                  <SelectItem value="previsto" className={itemCls}>{CENTRAL_STATUS_LABEL.previsto}</SelectItem>
                  <SelectItem value="agendado" className={itemCls}>Agendado</SelectItem>
                  <SelectItem value="confirmado" className={itemCls}>{CENTRAL_STATUS_LABEL.confirmado}</SelectItem>
                  <SelectItem value="conciliado" className={itemCls}>{CENTRAL_STATUS_LABEL.conciliado}</SelectItem>
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

          {/* LINE 2: Conta Origem | Conta Destino | Macro | Centro | Subcentro + Buttons */}
          <div className="flex items-end gap-1.5">
            <div className="grid grid-cols-[145px_145px_130px_130px_130px] gap-1.5 items-end flex-1">
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
                  onValueChange={v => { setMacroFiltro(v); setCentroFiltro('__all__'); setSubcentroFiltro('__all__'); setMacroLocked(false); }}
                  options={macrosUnicos.map(m => ({ value: m, label: m }))}
                  disabled={macroLocked}
                  placeholder="Buscar macro..."
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

          {/* LINE 3: Produto | Fornecedor + Summary */}
          <div className="flex items-end gap-1.5">
            <div className="grid grid-cols-[200px_300px] gap-1.5 items-end">
              <div>
                <label className={lblCls}>Produto</label>
                <Input
                  value={produtoFiltro}
                  onChange={e => setProdutoFiltro(e.target.value)}
                  placeholder="Buscar..."
                  className="h-6 !text-[8px] placeholder:!text-[8px] leading-tight px-1.5 bg-white border-[#C9D4E2] hover:border-[#AFC2D8] focus-visible:ring-[#1E3A5F]"
                  autoCorrect="off"
                  autoCapitalize="none"
                  spellCheck={false}
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
           <div className="rounded-lg border border-[hsl(var(--border))] overflow-auto relative" style={{ maxHeight: 'calc(100vh - 260px)' }}>
            <table className="table-financeiro w-full caption-bottom text-sm border-collapse" style={{ tableLayout: 'fixed' }}>
              <colgroup>
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
                  <th className="px-0.5 py-[3px] text-center align-middle text-[8px] uppercase leading-tight font-semibold text-primary-foreground cursor-pointer select-none sticky left-0 z-30 bg-primary" onClick={() => toggleSort('data')}>Comp.{sortIcon('data')}</th>
                  <th className="px-0.5 py-[3px] text-center align-middle text-[8px] uppercase leading-tight font-semibold text-primary-foreground cursor-pointer select-none sticky left-[62px] z-30 bg-primary" onClick={() => toggleSort('pgto')}>Pgto{sortIcon('pgto')}</th>
                  <th className="px-1 py-[3px] text-center align-middle text-[8px] uppercase leading-tight font-semibold text-primary-foreground cursor-pointer select-none" onClick={() => toggleSort('produto')}>Produto{sortIcon('produto')}</th>
                  <th className="px-1 py-[3px] text-center align-middle text-[8px] uppercase leading-tight font-semibold text-primary-foreground cursor-pointer select-none" onClick={() => toggleSort('fornecedor')}>Fornecedor{sortIcon('fornecedor')}</th>
                  <th className="px-1 py-[3px] text-center align-middle text-[8px] uppercase leading-tight font-semibold text-primary-foreground">Centro</th>
                  <th className="px-1 py-[3px] text-center align-middle text-[8px] uppercase leading-tight font-semibold text-primary-foreground cursor-pointer select-none" onClick={() => toggleSort('valor')}>Valor{sortIcon('valor')}</th>
                  <th className="px-1 py-[3px] text-center align-middle text-[8px] uppercase leading-tight font-semibold text-primary-foreground">NF</th>
                  <th className="px-1 py-[3px] text-center align-middle text-[8px] uppercase leading-tight font-semibold text-primary-foreground">Status</th>
                  <th className="px-1 py-[3px] text-center align-middle text-[8px] uppercase leading-tight font-semibold text-primary-foreground"></th>
                </tr>
              </thead>
              <tbody className="[&_tr:last-child]:border-0">
                {totalLancamentosFiltrados === 0 ? (
                  <tr className="border-b">
                    <td colSpan={9} className="text-center text-muted-foreground py-4 text-[10px]">
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
                      <tr key={l.id} className="border-b italic !h-auto hover:bg-muted/50 transition-colors">
                        <td className="font-mono px-0.5 py-1 align-middle text-[12px] font-medium leading-tight sticky left-0 z-10 bg-background text-center">{fmtDate(l.data_competencia)}</td>
                        <td className="font-mono px-0.5 py-1 align-middle text-[12px] font-medium leading-tight sticky left-[62px] z-10 bg-background text-center">{fmtDate(l.data_pagamento)}</td>
                        <td className="truncate px-2 py-1 align-middle text-[12px] font-medium leading-tight" title={l.descricao || ''}>{l.descricao || '-'}</td>
                        <td className="truncate px-2 py-1 align-middle text-[12px] font-medium leading-tight" title={fornNome || ''}>
                          {fornNome || (!l.favorecido_id ? '-' : <span className="text-warning">n/c</span>)}
                        </td>
                        <td className="truncate px-2 py-1 align-middle text-[12px] font-medium leading-tight" title={l.centro_custo || ''}>{l.centro_custo || '-'}</td>
                        <td className={`text-right font-semibold whitespace-nowrap px-2 py-1 align-middle text-[12px] leading-tight ${l.sinal > 0 ? 'text-success' : 'text-destructive'}`}>
                          {fmtValor(l.valor, l.sinal)}
                        </td>
                        <td className="font-mono text-muted-foreground text-center px-1 py-1 align-middle text-[12px] leading-tight">{formatNF(l.nota_fiscal)}</td>
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

          {/* Total count */}
          <div className="flex items-center px-1 py-1">
            <span className="text-[10px] text-muted-foreground">
              {totalLancamentosFiltrados} lançamento{totalLancamentosFiltrados !== 1 ? 's' : ''} encontrado{totalLancamentosFiltrados !== 1 ? 's' : ''}
            </span>
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

      <CorrecaoTransferenciasDialog
        open={correcaoOpen}
        onClose={() => setCorrecaoOpen(false)}
        contas={hook.contasBancarias}
        onFixed={() => hook.loadLancamentos(filtros, hook.page)}
      />
    </div>
  );
}
