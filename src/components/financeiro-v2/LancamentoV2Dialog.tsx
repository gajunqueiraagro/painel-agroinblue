import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { normalizeStatusTransacao } from '@/lib/financeiro/v2Transferencia';
import { useCliente } from '@/contexts/ClienteContext';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Plus, Search, Check, ChevronsUpDown, AlertCircle, Copy, KeyRound, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';
import type { LancamentoV2, LancamentoV2Form, ContaBancariaV2, ClassificacaoItem, FornecedorV2 } from '@/hooks/useFinanceiroV2';
import type { Fazenda } from '@/contexts/FazendaContext';
import { NovoFornecedorDialog } from './NovoFornecedorDialog';
import { formatMoeda } from '@/lib/calculos/formatters';
import { STATUS_LABEL } from '@/lib/statusOperacional';
import { cn } from '@/lib/utils';

interface Props {
  open: boolean;
  onClose: () => void;
  onSave: (form: LancamentoV2Form, id?: string) => Promise<boolean>;
  onDelete?: (id: string) => Promise<boolean>;
  lancamento?: LancamentoV2 | null;
  fazendas: Fazenda[];
  contas: ContaBancariaV2[];
  classificacoes: ClassificacaoItem[];
  fornecedores: FornecedorV2[];
  defaultFazendaId?: string;
  onCriarFornecedor: (nome: string, fazendaId: string, cpfCnpj?: string) => Promise<FornecedorV2 | null>;
}

const TIPOS_OPERACAO = [
  { value: '1-Entradas', label: 'Entradas' },
  { value: '2-Saídas', label: 'Saídas' },
  { value: '3-Transferência', label: 'Transferências' },
];

const STATUS_OPTIONS = [
  { value: 'previsto', label: STATUS_LABEL.previsto },
  { value: 'agendado', label: 'Agendado' },
  { value: 'confirmado', label: STATUS_LABEL.confirmado },
  { value: 'conciliado', label: STATUS_LABEL.conciliado },
];

function deriveStatus(dataPagamento: string): string {
  if (!dataPagamento) return 'previsto';
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const d = new Date(dataPagamento + 'T00:00:00');
  if (d > today) return 'agendado';
  return 'confirmado';
}

function formatNotaFiscal(raw: string): string {
  const digits = raw.replace(/\D/g, '').slice(0, 9);
  const padded = digits.padStart(9, '0');
  return `${padded.slice(0, 3)}.${padded.slice(3, 6)}.${padded.slice(6, 9)}`;
}

/** Format number to BRL string with 2 decimals */
function toBRL(v: number): string {
  return v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/** Parse BRL string back to number */
function parseBRL(s: string): number {
  const cleaned = s.replace(/\./g, '').replace(',', '.');
  const n = parseFloat(cleaned);
  return isNaN(n) ? 0 : n;
}

/** Add N days to a date string (YYYY-MM-DD) */
function addDays(dateStr: string, days: number): string {
  const d = new Date(dateStr + 'T00:00:00');
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

/** Add N months to a date string, clamping to valid day */
function addMonths(dateStr: string, months: number): string {
  const d = new Date(dateStr + 'T00:00:00');
  const targetMonth = d.getMonth() + months;
  const day = d.getDate();
  d.setMonth(targetMonth, 1);
  const lastDay = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
  d.setDate(Math.min(day, lastDay));
  return d.toISOString().slice(0, 10);
}

/** Get month label in pt-BR */
function getMonthLabel(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString('pt-BR', { month: 'short', year: 'numeric' });
}

interface ParcelaRow {
  dataPagamento: string;
  valorDisplay: string;
}

interface RecorrenciaRow {
  mesLabel: string;
  dataCompetencia: string;
  dataPagamento: string;
  valorDisplay: string;
}

/** Generate initial parcela rows from total value and start date */
function generateParcelas(totalVal: number, numParcelas: number, dataPgtoInicial: string): ParcelaRow[] {
  const abs = Math.abs(totalVal);
  const baseVal = Math.floor((abs / numParcelas) * 100) / 100;
  const lastVal = Math.round((abs - baseVal * (numParcelas - 1)) * 100) / 100;

  const rows: ParcelaRow[] = [];
  for (let i = 0; i < numParcelas; i++) {
    const val = i === numParcelas - 1 ? lastVal : baseVal;
    rows.push({
      dataPagamento: dataPgtoInicial ? addDays(dataPgtoInicial, i * 30) : '',
      valorDisplay: toBRL(val),
    });
  }
  return rows;
}

/** Generate recurrence rows from competencia until December of the same year */
function generateRecorrencias(dataComp: string, dataPgto: string, valor: number): RecorrenciaRow[] {
  if (!dataComp) return [];
  const d = new Date(dataComp + 'T00:00:00');
  const year = d.getFullYear();
  const startMonth = d.getMonth(); // 0-based
  const rows: RecorrenciaRow[] = [];
  const abs = Math.abs(valor);
  for (let m = startMonth; m <= 11; m++) {
    const offset = m - startMonth;
    const comp = addMonths(dataComp, offset);
    const pgto = dataPgto ? addMonths(dataPgto, offset) : comp;
    rows.push({
      mesLabel: getMonthLabel(comp),
      dataCompetencia: comp,
      dataPagamento: pgto,
      valorDisplay: toBRL(abs),
    });
  }
  return rows;
}

export function LancamentoV2Dialog({
  open, onClose, onSave, onDelete, lancamento, fazendas, contas, classificacoes,
  fornecedores, defaultFazendaId, onCriarFornecedor,
}: Props) {
  const { clienteAtual } = useCliente();
  const isEdit = !!lancamento;
  // Store the editing ID in a ref so it can't become stale during async save
  const editingIdRef = useRef<string | null>(null);
  useEffect(() => {
    editingIdRef.current = lancamento?.id ?? null;
  }, [lancamento]);
  const [saving, setSaving] = useState(false);
  const [fornecedorDialogOpen, setFornecedorDialogOpen] = useState(false);

  // Fornecedor search state
  const [fornecedorOpen, setFornecedorOpen] = useState(false);
  const [fornecedorSearch, setFornecedorSearch] = useState('');
  const [fornecedorHighlight, setFornecedorHighlight] = useState(0);
  const fornecedorInputRef = useRef<HTMLInputElement>(null);
  const fornecedorItemRefs = useRef<(HTMLButtonElement | null)[]>([]);

  // Installment state
  const [formaPagamentoParc, setFormaPagamentoParc] = useState<'avista' | 'parcelada'>('avista');
  const [numParcelas, setNumParcelas] = useState(2);
  const [parcelaRows, setParcelaRows] = useState<ParcelaRow[]>([]);

  // Frequency state
  const [frequencia, setFrequencia] = useState<'pontual' | 'recorrente'>('pontual');
  const [recorrenciaRows, setRecorrenciaRows] = useState<RecorrenciaRow[]>([]);
  const [recorrenciaEditada, setRecorrenciaEditada] = useState(false);

  const [fazendaId, setFazendaId] = useState('');
  const [dataCompetencia, setDataCompetencia] = useState('');
  const [dataPagamento, setDataPagamento] = useState('');
  const [descricao, setDescricao] = useState('');
  const [favorecidoId, setFavorecidoId] = useState('');
  const [subcentro, setSubcentro] = useState('');
  const [macroCusto, setMacroCusto] = useState('');
  const [centroCusto, setCentroCusto] = useState('');
  const [tipoOperacao, setTipoOperacao] = useState('2-Saídas');
  const [statusTransacao, setStatusTransacao] = useState('previsto');
  const [valorDisplay, setValorDisplay] = useState('0,00');
  const [contaOrigemId, setContaOrigemId] = useState('');
  const [contaDestinoId, setContaDestinoId] = useState('');
  const [notaFiscal, setNotaFiscal] = useState('');
  const [observacao, setObservacao] = useState('');

  // Payment method fields
  const [formaPgto, setFormaPgto] = useState('');
  const [dadosPagamento, setDadosPagamento] = useState('');

  // Product suggestions state
  const [produtoSugestoes, setProdutoSugestoes] = useState<string[]>([]);
  const [produtoOpen, setProdutoOpen] = useState(false);
  const [produtoHighlight, setProdutoHighlight] = useState(-1);
  const produtoItemRefs = useRef<(HTMLDivElement | null)[]>([]);
  const produtoWrapperRef = useRef<HTMLDivElement>(null);

  // Subcentro search
  const [subcentroOpen, setSubcentroOpen] = useState(false);
  const [subcentroSearch, setSubcentroSearch] = useState('');
  const [subcentroHighlight, setSubcentroHighlight] = useState(0);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const subcentroItemRefs = useRef<(HTMLButtonElement | null)[]>([]);

  const isTransferencia = tipoOperacao === '3-Transferência';
  const isEntrada = tipoOperacao === '1-Entradas';

  const classMap = useMemo(() => {
    const m = new Map<string, ClassificacaoItem>();
    for (const c of classificacoes) {
      if (c.subcentro && !m.has(c.subcentro)) m.set(c.subcentro, c);
    }
    return m;
  }, [classificacoes]);

  /** Subcentros filtered by tipo_operacao then by search text */
  const filteredSubcentros = useMemo(() => {
    const unique = Array.from(classMap.values());
    const byTipo = unique.filter(c => {
      if (!tipoOperacao) return true;
      return c.tipo_operacao === tipoOperacao;
    });
    if (!subcentroSearch.trim()) return byTipo;
    const term = subcentroSearch.toLowerCase();
    return byTipo.filter(c => c.subcentro.toLowerCase().includes(term));
  }, [classMap, subcentroSearch, tipoOperacao]);

  useEffect(() => {
    if (lancamento) {
      setFazendaId(lancamento.fazenda_id);
      setDataCompetencia(lancamento.data_competencia);
      setDataPagamento(lancamento.data_pagamento || '');
      setDescricao(lancamento.descricao || '');
      setFavorecidoId(lancamento.favorecido_id || '');
      setSubcentro(lancamento.subcentro || '');
      setMacroCusto(lancamento.macro_custo || '');
      setCentroCusto(lancamento.centro_custo || '');
      setTipoOperacao(lancamento.tipo_operacao);
      setStatusTransacao(normalizeStatusTransacao(lancamento.status_transacao));
      setValorDisplay(toBRL(lancamento.valor));
      // For transfers: origin = conta_bancaria_id, destination = conta_destino_id
      // For entries: destination = conta_bancaria_id
      // For exits: origin = conta_bancaria_id
      if (lancamento.tipo_operacao === '3-Transferência') {
        setContaOrigemId(lancamento.conta_bancaria_id || '');
        const destId = lancamento.conta_destino_id || '';
        console.log('[FinV2] DIALOG INIT transfer destino =', destId, 'from lancamento.conta_destino_id =', lancamento.conta_destino_id);
        setContaDestinoId(destId);
      } else if (lancamento.tipo_operacao === '1-Entradas') {
        setContaOrigemId('');
        setContaDestinoId(lancamento.conta_bancaria_id || '');
      } else {
        setContaOrigemId(lancamento.conta_bancaria_id || '');
        setContaDestinoId('');
      }
      setNotaFiscal(lancamento.nota_fiscal || '');
      setObservacao(lancamento.observacao || '');
      setFormaPgto(lancamento.forma_pagamento || '');
      setDadosPagamento(lancamento.dados_pagamento || '');
      // CRITICAL: reset parcela/recorrência when editing — prevents stale state from previous "new" dialog
      setFormaPagamentoParc('avista');
      setNumParcelas(2);
      setParcelaRows([]);
      setFrequencia('pontual');
      setRecorrenciaRows([]);
      setRecorrenciaEditada(false);
    } else {
      const today = new Date().toISOString().slice(0, 10);
      setFazendaId(defaultFazendaId || '');
      setDataCompetencia(today);
      setDataPagamento(today);
      setStatusTransacao(deriveStatus(today));
      setDescricao('');
      setFavorecidoId('');
      setSubcentro('');
      setMacroCusto('');
      setCentroCusto('');
      setTipoOperacao('2-Saídas');
      setStatusTransacao('previsto');
      setValorDisplay('0,00');
      setContaOrigemId('');
      setContaDestinoId('');
      setNotaFiscal('');
      setObservacao('');
      setFormaPagamentoParc('avista');
      setNumParcelas(2);
      setParcelaRows([]);
      setFormaPgto('');
      setDadosPagamento('');
      setFrequencia('pontual');
      setRecorrenciaRows([]);
      setRecorrenciaEditada(false);
    }
    setSubcentroSearch('');
    setFornecedorSearch('');
  }, [open, lancamento, defaultFazendaId]);

  // Fetch distinct product names for suggestions
  useEffect(() => {
    if (!open || !clienteAtual?.id) return;
    (async () => {
      const { data } = await supabase
        .from('financeiro_lancamentos_v2')
        .select('descricao')
        .eq('cliente_id', clienteAtual.id)
        .not('descricao', 'is', null)
        .order('descricao');
      if (data) {
        const unique = [...new Set(data.map(r => r.descricao).filter(Boolean) as string[])];
        setProdutoSugestoes(unique);
      }
    })();
  }, [open, clienteAtual?.id]);

  // Filter product suggestions by current input
  const filteredProdutos = useMemo(() => {
    if (!descricao.trim() || descricao.trim().length < 2) return [];
    const norm = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
    const term = norm(descricao);
    return produtoSugestoes
      .filter(p => norm(p).includes(term) && p !== descricao)
      .slice(0, 8);
  }, [descricao, produtoSugestoes]);

  // Close product suggestions on click outside
  useEffect(() => {
    if (!produtoOpen) return;
    const handler = (e: MouseEvent) => {
      if (produtoWrapperRef.current && !produtoWrapperRef.current.contains(e.target as Node)) {
        setProdutoOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [produtoOpen]);

  const handleProdutoKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      setProdutoOpen(false);
      return;
    }
    if (e.key === 'Tab') {
      setProdutoOpen(false);
      return; // let Tab proceed naturally
    }
    if (!produtoOpen || filteredProdutos.length === 0) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setProdutoHighlight(prev => {
        const next = Math.min(prev + 1, filteredProdutos.length - 1);
        produtoItemRefs.current[next]?.scrollIntoView({ block: 'nearest' });
        return next;
      });
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setProdutoHighlight(prev => {
        const next = Math.max(prev - 1, 0);
        produtoItemRefs.current[next]?.scrollIntoView({ block: 'nearest' });
        return next;
      });
    } else if (e.key === 'Enter') {
      if (produtoHighlight >= 0 && filteredProdutos[produtoHighlight]) {
        e.preventDefault();
        setDescricao(filteredProdutos[produtoHighlight]);
        setProdutoOpen(false);
      }
      // If no highlight (-1), let Enter pass through naturally
    }
  };

  // Regenerate parcela rows when key inputs change
  const valorNum = parseBRL(valorDisplay);

  const regenerateParcelas = useCallback(() => {
    if (formaPagamentoParc === 'parcelada' && numParcelas >= 2 && valorNum > 0) {
      setParcelaRows(generateParcelas(valorNum, numParcelas, dataPagamento));
    }
  }, [formaPagamentoParc, numParcelas, valorNum, dataPagamento]);

  // Auto-regenerate when switching to parcelada or changing num parcelas / valor / data
  useEffect(() => {
    if (formaPagamentoParc === 'parcelada' && numParcelas >= 2) {
      regenerateParcelas();
    } else {
      setParcelaRows([]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [formaPagamentoParc, numParcelas, valorNum, dataPagamento]);

  // Auto-generate recurrence rows
  useEffect(() => {
    if (frequencia === 'recorrente' && !recorrenciaEditada) {
      setRecorrenciaRows(generateRecorrencias(dataCompetencia, dataPagamento, valorNum));
    } else if (frequencia === 'pontual') {
      setRecorrenciaRows([]);
      setRecorrenciaEditada(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [frequencia, dataCompetencia, dataPagamento, valorNum]);

  const handleRecalcularRecorrencia = () => {
    if (recorrenciaEditada) {
      if (!confirm('Deseja recalcular as recorrências? As edições serão perdidas.')) return;
    }
    setRecorrenciaRows(generateRecorrencias(dataCompetencia, dataPagamento, valorNum));
    setRecorrenciaEditada(false);
  };

  const handleRecorrenciaCompChange = (idx: number, val: string) => {
    setRecorrenciaRows(prev => prev.map((r, i) => i === idx ? { ...r, dataCompetencia: val } : r));
    setRecorrenciaEditada(true);
  };

  const handleRecorrenciaPgtoChange = (idx: number, val: string) => {
    setRecorrenciaRows(prev => prev.map((r, i) => i === idx ? { ...r, dataPagamento: val } : r));
    setRecorrenciaEditada(true);
  };

  const handleRecorrenciaValorChange = (idx: number, e: React.ChangeEvent<HTMLInputElement>) => {
    const digits = e.target.value.replace(/\D/g, '');
    if (!digits) {
      setRecorrenciaRows(prev => prev.map((r, i) => i === idx ? { ...r, valorDisplay: '0,00' } : r));
      setRecorrenciaEditada(true);
      return;
    }
    const num = parseInt(digits, 10) / 100;
    const display = num.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    setRecorrenciaRows(prev => prev.map((r, i) => i === idx ? { ...r, valorDisplay: display } : r));
    setRecorrenciaEditada(true);
  };

  /** Build payment text from supplier data */
  const buildDadosPagamento = useCallback((f: FornecedorV2, metodo?: string): string => {
    const tipo = metodo || f.tipo_recebimento || '';
    const lines: string[] = [];
    if (tipo === 'PIX' && f.pix_chave) {
      lines.push(`PIX | Tipo: ${f.pix_tipo_chave || '-'}`);
      lines.push(`Chave: ${f.pix_chave}`);
      if (f.nome_favorecido) lines.push(`Favorecido: ${f.nome_favorecido}`);
    } else if (tipo === 'Transferência' || tipo === 'Transferência Bancária') {
      if (f.banco) lines.push(`Banco: ${f.banco}`);
      if (f.agencia) lines.push(`Agência: ${f.agencia}`);
      if (f.conta) lines.push(`Conta: ${f.conta}`);
      if (f.tipo_conta) lines.push(`Tipo: ${f.tipo_conta}`);
      if (f.cpf_cnpj_pagamento) lines.push(`CPF/CNPJ: ${f.cpf_cnpj_pagamento}`);
      if (f.nome_favorecido) lines.push(`Favorecido: ${f.nome_favorecido}`);
    }
    if (f.observacao_pagamento) lines.push(f.observacao_pagamento);
    return lines.join('\n');
  }, []);

  /** Auto-fill payment data when supplier changes */
  const handleFornecedorSelect = useCallback((fId: string) => {
    setFavorecidoId(fId);
    setFornecedorOpen(false);
    setFornecedorSearch('');
    const f = fornecedores.find(x => x.id === fId);
    if (f && f.tipo_recebimento) {
      setFormaPgto(f.tipo_recebimento);
      setDadosPagamento(buildDadosPagamento(f, f.tipo_recebimento));
    }
  }, [fornecedores, buildDadosPagamento]);

  /** Re-fill payment data when payment method changes */
  const handleFormaPgtoChange = useCallback((metodo: string) => {
    setFormaPgto(metodo === '__none_fp__' ? '' : metodo);
    const f = fornecedores.find(x => x.id === favorecidoId);
    if (f && metodo && metodo !== '__none_fp__') {
      setDadosPagamento(buildDadosPagamento(f, metodo));
    }
  }, [fornecedores, favorecidoId, buildDadosPagamento]);

  const handleSubcentroSelect = (value: string) => {
    setSubcentro(value);
    setSubcentroOpen(false);
    setSubcentroSearch('');
    const cls = classMap.get(value);
    if (cls) {
      setMacroCusto(cls.macro_custo);
      setCentroCusto(cls.centro_custo);
    }
  };

  const handleSubcentroKeyDown = (e: React.KeyboardEvent) => {
    if (filteredSubcentros.length === 0) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSubcentroHighlight(prev => {
        const next = Math.min(prev + 1, filteredSubcentros.length - 1);
        subcentroItemRefs.current[next]?.scrollIntoView({ block: 'nearest' });
        return next;
      });
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSubcentroHighlight(prev => {
        const next = Math.max(prev - 1, 0);
        subcentroItemRefs.current[next]?.scrollIntoView({ block: 'nearest' });
        return next;
      });
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const sc = filteredSubcentros[subcentroHighlight];
      if (sc) handleSubcentroSelect(sc.subcentro || '');
    } else if (e.key === 'Tab') {
      const sc = filteredSubcentros[subcentroHighlight];
      if (sc) handleSubcentroSelect(sc.subcentro || '');
    } else if (e.key === 'Escape') {
      setSubcentroOpen(false);
    }
  };

  const handleDataPagamentoChange = (val: string) => {
    setDataPagamento(val);
    if (statusTransacao !== 'conciliado') {
      setStatusTransacao(deriveStatus(val));
    }
  };

  const handleValorChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const digits = e.target.value.replace(/\D/g, '');
    if (!digits) { setValorDisplay('0,00'); return; }
    const num = parseInt(digits, 10) / 100;
    setValorDisplay(num.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
  };

  const handleNotaFiscalChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const digits = e.target.value.replace(/\D/g, '');
    const trimmed = digits.replace(/^0+/, '').slice(0, 9);
    setNotaFiscal(trimmed);
  };

  const handleParcelaValorChange = (idx: number, e: React.ChangeEvent<HTMLInputElement>) => {
    const digits = e.target.value.replace(/\D/g, '');
    if (!digits) {
      setParcelaRows(prev => prev.map((r, i) => i === idx ? { ...r, valorDisplay: '0,00' } : r));
      return;
    }
    const num = parseInt(digits, 10) / 100;
    const display = num.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    setParcelaRows(prev => prev.map((r, i) => i === idx ? { ...r, valorDisplay: display } : r));
  };

  const handleParcelaDateChange = (idx: number, val: string) => {
    setParcelaRows(prev => prev.map((r, i) => i === idx ? { ...r, dataPagamento: val } : r));
  };

  const notaFiscalDisplay = notaFiscal ? formatNotaFiscal(notaFiscal) : '';

  const contasDisponiveis = contas;

  const fornecedoresList = useMemo(() =>
    fornecedores.filter(f => f.ativo !== false),
  [fornecedores]);

  function normalizeSearch(s: string): string {
    return s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  }

  const filteredFornecedores = useMemo(() => {
    if (!fornecedorSearch.trim()) return fornecedoresList;
    const q = normalizeSearch(fornecedorSearch);
    return fornecedoresList.filter(f => normalizeSearch(f.nome).includes(q));
  }, [fornecedoresList, fornecedorSearch]);

  useEffect(() => {
    setFornecedorHighlight(0);
  }, [fornecedorSearch]);

  useEffect(() => {
    const el = fornecedorItemRefs.current[fornecedorHighlight];
    if (el) el.scrollIntoView({ block: 'nearest' });
  }, [fornecedorHighlight]);

  const handleFornecedorKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setFornecedorHighlight(prev => Math.min(prev + 1, filteredFornecedores.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setFornecedorHighlight(prev => Math.max(prev - 1, 0));
    } else if (e.key === 'Enter' || e.key === 'Tab') {
      if (filteredFornecedores[fornecedorHighlight]) {
        e.preventDefault();
        handleFornecedorSelect(filteredFornecedores[fornecedorHighlight].id);
      }
    } else if (e.key === 'Escape') {
      setFornecedorOpen(false);
    }
  };

  const selectedFornecedorNome = useMemo(() => {
    if (!favorecidoId) return '';
    return fornecedores.find(f => f.id === favorecidoId)?.nome || '';
  }, [favorecidoId, fornecedores]);

  const fazOperacionais = fazendas.filter(f => f.id !== '__global__');

  // Validation
  const contaOrigemValid = isTransferencia || !isEntrada ? !!contaOrigemId && contaOrigemId !== '__none__' : true;
  const contaDestinoValid = isTransferencia || isEntrada ? !!contaDestinoId && contaDestinoId !== '__none__' : true;
  const contaSimpleValid = !isTransferencia
    ? (isEntrada ? contaDestinoValid : contaOrigemValid)
    : (contaOrigemValid && contaDestinoValid);

  const parceladaValid = formaPagamentoParc === 'avista' || (numParcelas >= 2 && numParcelas <= 24 && parcelaRows.length === numParcelas);
  const recorrenteValid = frequencia === 'pontual' || recorrenciaRows.length > 0;
  const canSave = !!fazendaId && !!dataCompetencia && !!dataPagamento && !!descricao && !!favorecidoId && favorecidoId !== '__none_forn__'
    && !!subcentro && !!tipoOperacao && !!statusTransacao && valorNum > 0
    && contaSimpleValid && parceladaValid && recorrenteValid;

  const handleSubmit = async () => {
    if (!canSave) return;
    // Extra validation for transfers
    if (isTransferencia) {
      if (!contaOrigemId || contaOrigemId === '__none__' || !contaDestinoId || contaDestinoId === '__none__') {
        toast.error('Transferência exige conta de origem e conta de destino.');
        return;
      }
      if (contaOrigemId === contaDestinoId) {
        toast.error('Conta de origem e destino devem ser diferentes.');
        return;
      }
    }
    setSaving(true);

    // Capture the editing ID from the stable ref — prevents stale closure issues
    const currentEditId = editingIdRef.current;
    const currentIsEdit = !!currentEditId;

    let contaBancariaId: string | null = null;
    if (isTransferencia) {
      contaBancariaId = contaOrigemId && contaOrigemId !== '__none__' ? contaOrigemId : null;
    } else if (isEntrada) {
      contaBancariaId = contaDestinoId && contaDestinoId !== '__none__' ? contaDestinoId : null;
    } else {
      contaBancariaId = contaOrigemId && contaOrigemId !== '__none__' ? contaOrigemId : null;
    }

    // --- Recurrence logic (ONLY for new lancamentos, NEVER for edit) ---
    if (!currentIsEdit && frequencia === 'recorrente' && recorrenciaRows.length > 0) {
      let allOk = true;
      for (let i = 0; i < recorrenciaRows.length; i++) {
        const row = recorrenciaRows[i];
        const recVal = parseBRL(row.valorDisplay);
        const form: LancamentoV2Form = {
          fazenda_id: fazendaId,
          conta_bancaria_id: contaBancariaId,
          data_competencia: row.dataCompetencia,
          data_pagamento: row.dataPagamento || null,
          valor: recVal,
          tipo_operacao: tipoOperacao,
          status_transacao: deriveStatus(row.dataPagamento),
          descricao,
          macro_custo: macroCusto,
          centro_custo: centroCusto,
          subcentro,
          observacao,
          nota_fiscal: notaFiscal || null,
          favorecido_id: favorecidoId && favorecidoId !== '__none_forn__' ? favorecidoId : null,
          forma_pagamento: formaPgto || null,
          dados_pagamento: dadosPagamento || null,
        };
        const ok = await onSave(form);
        if (!ok) { allOk = false; break; }
      }
      setSaving(false);
      if (allOk) onClose();
      return;
    }

    // --- Installment logic (ONLY for new lancamentos, NEVER for edit) ---
    if (!currentIsEdit && formaPagamentoParc === 'parcelada' && numParcelas >= 2 && parcelaRows.length === numParcelas) {
      let allOk = true;
      for (let i = 0; i < numParcelas; i++) {
        const row = parcelaRows[i];
        const parcelaVal = parseBRL(row.valorDisplay);
        const parcelaDesc = `${descricao} - Parcela ${i + 1}/${numParcelas}`;

        const form: LancamentoV2Form = {
          fazenda_id: fazendaId,
          conta_bancaria_id: contaBancariaId,
          data_competencia: dataCompetencia,
          data_pagamento: row.dataPagamento || dataPagamento,
          valor: parcelaVal,
          tipo_operacao: tipoOperacao,
          status_transacao: 'confirmado',
          descricao: parcelaDesc,
          macro_custo: macroCusto,
          centro_custo: centroCusto,
          subcentro,
          observacao,
          nota_fiscal: notaFiscal || null,
          favorecido_id: favorecidoId && favorecidoId !== '__none_forn__' ? favorecidoId : null,
          forma_pagamento: formaPgto || null,
          dados_pagamento: dadosPagamento || null,
        };

        const ok = await onSave(form);
        if (!ok) { allOk = false; break; }
      }

      setSaving(false);
      if (allOk) onClose();
      return;
    }

    // --- Single save (à vista) or EDIT ---
    const form: LancamentoV2Form = {
      fazenda_id: fazendaId,
      conta_bancaria_id: contaBancariaId,
      conta_destino_id: isTransferencia && contaDestinoId && contaDestinoId !== '__none__' ? contaDestinoId : null,
      data_competencia: dataCompetencia,
      data_pagamento: dataPagamento || null,
      valor: Math.abs(valorNum),
      tipo_operacao: tipoOperacao,
      status_transacao: statusTransacao,
      descricao,
      macro_custo: macroCusto,
      centro_custo: centroCusto,
      subcentro,
      observacao,
      nota_fiscal: notaFiscal || null,
      favorecido_id: favorecidoId && favorecidoId !== '__none_forn__' ? favorecidoId : null,
      forma_pagamento: formaPgto || null,
      dados_pagamento: dadosPagamento || null,
    };

      console.log('[FinV2] SUBMIT STATE', {
        mode: currentIsEdit ? 'UPDATE' : 'INSERT',
        id: currentEditId,
        isTransferencia,
        contaDestinoId,
        contaOrigemId,
        'form.conta_destino_id': form.conta_destino_id,
        'form.conta_bancaria_id': form.conta_bancaria_id,
        tipoOperacao,
      });

    // CRITICAL: pass the stable ID for edits — ensures UPDATE, never INSERT
    const ok = await onSave(form, currentEditId || undefined);
    setSaving(false);
    if (ok) onClose();
  };

  const handleFornecedorCriado = (f: FornecedorV2) => {
    setFavorecidoId(f.id);
    setFornecedorDialogOpen(false);
  };

  // Sum of parcelas for display
  const parcelasTotal = parcelaRows.reduce((acc, r) => acc + parseBRL(r.valorDisplay), 0);
  const recorrenciaTotal = recorrenciaRows.reduce((acc, r) => acc + parseBRL(r.valorDisplay), 0);

  // Determine button label
  const getSubmitLabel = () => {
    if (saving) return 'Salvando...';
    if (isEdit) return 'Salvar Alterações';
    if (frequencia === 'recorrente' && recorrenciaRows.length > 0) return `Criar ${recorrenciaRows.length} Lançamentos`;
    if (formaPagamentoParc === 'parcelada') return `Criar ${numParcelas} Parcelas`;
    return 'Criar Lançamento';
  };

  const firstFieldRef = useRef<HTMLButtonElement>(null);

  // Auto-focus first field on open
  useEffect(() => {
    if (open) {
      setTimeout(() => firstFieldRef.current?.focus(), 100);
    }
  }, [open]);

  const sectionClass = "rounded-md bg-muted/30 dark:bg-muted/15 border border-border/30 px-3 py-2 space-y-1.5";
  const sectionTitle = "text-[9px] font-bold text-muted-foreground/80 uppercase tracking-[0.12em] mb-0.5";
  const fieldBg = "bg-background dark:bg-muted border-border/40";

  return (
    <>
      <Dialog open={open} onOpenChange={v => { if (!v) onClose(); }}>
        <DialogContent className="max-w-3xl max-h-[92vh] flex flex-col p-0 bg-[#f4f5f7] dark:bg-[hsl(var(--card))] rounded-xl shadow-2xl border border-border/50 overflow-hidden">
          {/* Header */}
          <DialogHeader className="px-5 pt-4 pb-2.5 border-b border-border/40 bg-[hsl(var(--muted))] dark:bg-[hsl(var(--muted)/0.6)]">
            <DialogTitle className="text-[13px] font-bold tracking-tight">{isEdit ? 'Editar Lançamento' : 'Novo Lançamento'}</DialogTitle>
          </DialogHeader>

          {/* Scrollable body */}
          <div className="flex-1 overflow-y-auto px-5 py-3 space-y-2">

            {/* ── BLOCO 1 — Tipo e Datas ── */}
            <section className={sectionClass}>
              <p className={sectionTitle}>Tipo e Datas</p>
              <div className="grid grid-cols-4 gap-2">
                <div>
                  <Label className="text-[10px]">Tipo Operação *</Label>
                  <Select value={tipoOperacao} onValueChange={v => { setTipoOperacao(v); setContaOrigemId(''); setContaDestinoId(''); setSubcentro(''); setMacroCusto(''); setCentroCusto(''); setSubcentroSearch(''); }}>
                    <SelectTrigger ref={firstFieldRef} tabIndex={1} className={cn("h-9", fieldBg)}><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {TIPOS_OPERACAO.map(t => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-[10px]">Data Competência *</Label>
                  <Input tabIndex={2} type="date" value={dataCompetencia} onChange={e => setDataCompetencia(e.target.value)} className={cn("h-8", fieldBg)} />
                </div>
                <div>
                  <Label className="text-[10px]">Data Pagamento *</Label>
                  <Input tabIndex={3} type="date" value={dataPagamento} onChange={e => handleDataPagamentoChange(e.target.value)} className={cn("h-8", fieldBg)} />
                </div>
                <div>
                  <Label className="text-[10px]">Status *</Label>
                  <Select value={statusTransacao} onValueChange={setStatusTransacao}>
                    <SelectTrigger tabIndex={4} className={cn("h-8", fieldBg)}><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {STATUS_OPTIONS.map(s => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </section>

            {/* ── BLOCO 2 — Identificação ── */}
            <section className={sectionClass}>
              <p className={sectionTitle}>Identificação</p>
              <div className="grid grid-cols-2 gap-2">
                {/* Produto */}
                <div ref={produtoWrapperRef} className="relative col-span-2">
                  <Label className="text-[10px]">Produto / Descrição *</Label>
                  <Input
                    tabIndex={5}
                    value={descricao}
                    onChange={e => {
                      setDescricao(e.target.value);
                      setProdutoOpen(true);
                      setProdutoHighlight(-1);
                    }}
                    onFocus={() => { if (descricao.trim().length >= 2) setProdutoOpen(true); }}
                    onKeyDown={handleProdutoKeyDown}
                    className={cn("h-8", fieldBg)}
                    placeholder="Descrição do produto"
                    autoComplete="off"
                  />
                  {produtoOpen && filteredProdutos.length > 0 && (
                    <div className="absolute z-50 left-0 right-0 top-full mt-1 rounded-md border border-border bg-popover shadow-md max-h-48 overflow-y-auto">
                      {filteredProdutos.map((p, i) => (
                        <div
                          key={p}
                          ref={el => { produtoItemRefs.current[i] = el; }}
                          className={cn(
                            'px-3 py-1.5 text-sm cursor-pointer',
                            i === produtoHighlight ? 'bg-accent text-accent-foreground' : 'hover:bg-accent/50'
                          )}
                          onMouseDown={e => {
                            e.preventDefault();
                            setDescricao(p);
                            setProdutoOpen(false);
                          }}
                          onMouseEnter={() => setProdutoHighlight(i)}
                        >
                          {p}
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Fornecedor */}
                <div>
                  <Label className="text-[10px]">Fornecedor *</Label>
                  <div className="flex gap-1">
                    <Popover open={fornecedorOpen} onOpenChange={v => { setFornecedorOpen(v); if (!v) setFornecedorSearch(''); }}>
                      <PopoverTrigger asChild>
                        <Button tabIndex={6} variant="outline" role="combobox" aria-expanded={fornecedorOpen} className={cn("flex-1 h-8 justify-between font-normal text-xs", fieldBg)}>
                          <span className="truncate">{selectedFornecedorNome || 'Selecione fornecedor...'}</span>
                          <ChevronsUpDown className="ml-2 h-3.5 w-3.5 shrink-0 opacity-50" />
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
                        <div className="flex items-center border-b px-3 py-2">
                          <Search className="mr-2 h-4 w-4 shrink-0 opacity-50" />
                          <input
                            ref={fornecedorInputRef}
                            className="flex h-7 w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground"
                            placeholder="Buscar fornecedor..."
                            value={fornecedorSearch}
                            onChange={e => setFornecedorSearch(e.target.value)}
                            onKeyDown={handleFornecedorKeyDown}
                            autoFocus
                          />
                        </div>
                        <div className="max-h-48 overflow-y-auto p-1">
                          {filteredFornecedores.length === 0 && <p className="p-2 text-center text-sm text-muted-foreground">Nenhum fornecedor encontrado</p>}
                          {filteredFornecedores.map((f, idx) => (
                            <button
                              key={f.id}
                              ref={el => { fornecedorItemRefs.current[idx] = el; }}
                              className={cn(
                                "relative flex w-full cursor-pointer select-none items-center rounded-sm px-2 py-1.5 text-sm outline-none",
                                idx === fornecedorHighlight ? "bg-accent text-accent-foreground" : "hover:bg-accent/50",
                                favorecidoId === f.id && idx !== fornecedorHighlight && "bg-accent/30"
                              )}
                              onClick={() => handleFornecedorSelect(f.id)}
                              onMouseEnter={() => setFornecedorHighlight(idx)}
                            >
                              <Check className={cn("mr-2 h-4 w-4", favorecidoId === f.id ? "opacity-100" : "opacity-0")} />
                              <span className="truncate">{f.nome}</span>
                            </button>
                          ))}
                        </div>
                      </PopoverContent>
                    </Popover>
                    <Button variant="outline" size="icon" className="h-8 w-8 shrink-0" onClick={() => setFornecedorDialogOpen(true)} title="Novo Fornecedor">
                      <Plus className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>

                {/* Fazenda */}
                <div>
                  <Label className="text-[10px]">Fazenda *</Label>
                  <Select value={fazendaId} onValueChange={v => { setFazendaId(v); setContaOrigemId(''); setContaDestinoId(''); }}>
                    <SelectTrigger tabIndex={7} className={cn("h-8", fieldBg)}><SelectValue placeholder="Selecione" /></SelectTrigger>
                    <SelectContent>
                      {fazOperacionais.map(f => <SelectItem key={f.id} value={f.id}>{f.nome}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>

                {/* Conta Bancária */}
                {isTransferencia ? (
                  <>
                    <div>
                      <Label className="text-[10px]">Conta Origem *</Label>
                      <Select value={contaOrigemId} onValueChange={setContaOrigemId}>
                        <SelectTrigger tabIndex={8} className={cn("h-8", fieldBg)}><SelectValue placeholder="Selecione" /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="__none__">Nenhuma</SelectItem>
                          {contas.map(c => <SelectItem key={c.id} value={c.id}>{c.nome_exibicao || c.nome_conta}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label className="text-[10px]">Conta Destino *</Label>
                      <Select value={contaDestinoId} onValueChange={setContaDestinoId}>
                        <SelectTrigger tabIndex={9} className={cn("h-8", fieldBg)}><SelectValue placeholder="Selecione" /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="__none__">Nenhuma</SelectItem>
                          {contas.map(c => <SelectItem key={c.id} value={c.id}>{c.nome_exibicao || c.nome_conta}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                  </>
                ) : isEntrada ? (
                  <div>
                    <Label className="text-[10px]">Conta Destino *</Label>
                    <Select value={contaDestinoId} onValueChange={setContaDestinoId}>
                      <SelectTrigger tabIndex={8} className={cn("h-8", fieldBg)}><SelectValue placeholder="Selecione" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__none__">Nenhuma</SelectItem>
                        {contas.map(c => <SelectItem key={c.id} value={c.id}>{c.nome_exibicao || c.nome_conta}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                ) : (
                  <div>
                    <Label className="text-[10px]">Conta Origem *</Label>
                    <Select value={contaOrigemId} onValueChange={setContaOrigemId}>
                      <SelectTrigger tabIndex={8} className={cn("h-8", fieldBg)}><SelectValue placeholder="Selecione" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__none__">Nenhuma</SelectItem>
                        {contas.map(c => <SelectItem key={c.id} value={c.id}>{c.nome_exibicao || c.nome_conta}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                )}
              </div>
            </section>

            {/* ── BLOCO 3 — Valor e Classificação ── */}
            <section className={sectionClass}>
              <p className={sectionTitle}>Valor e Classificação</p>
              <div className="grid grid-cols-[140px_1fr] gap-2">
                <div>
                  <Label className="text-[10px]">Valor (R$) *</Label>
                  <Input tabIndex={10} value={valorDisplay} onChange={handleValorChange} onFocus={e => e.target.select()} className={cn("h-8 text-right font-mono", fieldBg)} placeholder="0,00" inputMode="numeric" />
                </div>
                <div>
                  <Label className="text-[10px]">Subcentro *</Label>
                  <Popover open={subcentroOpen} onOpenChange={v => { setSubcentroOpen(v); if (!v) { setSubcentroSearch(''); setSubcentroHighlight(0); } }}>
                    <PopoverTrigger asChild>
                      <Button tabIndex={11} variant="outline" role="combobox" aria-expanded={subcentroOpen} className={cn("w-full h-8 justify-between font-normal text-xs", fieldBg)}>
                        <span className="truncate">{subcentro || 'Selecione o subcentro...'}</span>
                        <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
                      <div className="flex items-center border-b px-3 py-2">
                        <Search className="mr-2 h-4 w-4 shrink-0 opacity-50" />
                        <input
                          ref={searchInputRef}
                          className="flex h-7 w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground"
                          placeholder="Buscar subcentro..."
                          value={subcentroSearch}
                          onChange={e => { setSubcentroSearch(e.target.value); setSubcentroHighlight(0); }}
                          onKeyDown={handleSubcentroKeyDown}
                          autoFocus
                        />
                      </div>
                      <div className="max-h-48 overflow-y-auto p-1">
                        {filteredSubcentros.length === 0 && <p className="p-2 text-center text-sm text-muted-foreground">Nenhum subcentro encontrado</p>}
                        {filteredSubcentros.map((sc, idx) => (
                          <button
                            key={sc.subcentro || idx}
                            ref={el => { subcentroItemRefs.current[idx] = el; }}
                            className={cn(
                              "relative flex w-full cursor-pointer select-none items-center rounded-sm px-2 py-1.5 text-sm outline-none",
                              idx === subcentroHighlight ? "bg-accent text-accent-foreground" : "hover:bg-accent/50",
                              subcentro === sc.subcentro && idx !== subcentroHighlight && "bg-accent/30"
                            )}
                            onClick={() => handleSubcentroSelect(sc.subcentro || '')}
                            onMouseEnter={() => setSubcentroHighlight(idx)}
                          >
                            <Check className={cn("mr-2 h-4 w-4", subcentro === sc.subcentro ? "opacity-100" : "opacity-0")} />
                            <span className="truncate">{sc.subcentro}</span>
                          </button>
                        ))}
                      </div>
                    </PopoverContent>
                  </Popover>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <Label className="text-[10px] text-muted-foreground">Centro Custo (auto)</Label>
                  <Input value={centroCusto} readOnly disabled className="h-8 bg-muted/60 dark:bg-muted border-border/20 text-muted-foreground cursor-default text-xs" />
                </div>
                <div>
                  <Label className="text-[10px] text-muted-foreground">Macro Custo (auto)</Label>
                  <Input value={macroCusto} readOnly disabled className="h-8 bg-muted/60 dark:bg-muted border-border/20 text-muted-foreground cursor-default text-xs" />
                </div>
              </div>

              {/* Frequency + Installment — only for new */}
              {!isEdit && (
                <div className="space-y-1.5 pt-0.5">
                  <div className="grid grid-cols-3 gap-2">
                    <div>
                      <Label className="text-[10px]">Frequência</Label>
                      <Select value={frequencia} onValueChange={(v: 'pontual' | 'recorrente') => setFrequencia(v)}>
                        <SelectTrigger className={cn("h-9", fieldBg)}><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="pontual">Pontual</SelectItem>
                          <SelectItem value="recorrente">Recorrente</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    {frequencia === 'pontual' && (
                      <div>
                        <Label className="text-xs">Modalidade</Label>
                        <Select value={formaPagamentoParc} onValueChange={(v: 'avista' | 'parcelada') => setFormaPagamentoParc(v)}>
                          <SelectTrigger className={cn("h-9", fieldBg)}><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="avista">À vista</SelectItem>
                            <SelectItem value="parcelada">Parcelada</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    )}
                    {frequencia === 'pontual' && formaPagamentoParc === 'parcelada' && (
                      <div>
                        <Label className="text-xs">Nº de Parcelas *</Label>
                        <Input
                          type="number"
                          min={2}
                          max={24}
                          value={numParcelas}
                          onChange={e => setNumParcelas(Math.max(2, Math.min(24, parseInt(e.target.value) || 2)))}
                          className={cn("h-9", fieldBg)}
                        />
                      </div>
                    )}
                  </div>

                  {/* Parcela grid */}
                  {frequencia === 'pontual' && formaPagamentoParc === 'parcelada' && parcelaRows.length > 0 && (
                    <div className="rounded-lg border border-border/30 bg-background dark:bg-muted/20 overflow-hidden">
                      <div className="grid grid-cols-[48px_1fr_1fr] gap-1 px-3 py-1.5 bg-muted/40 text-[10px] font-bold text-muted-foreground uppercase tracking-wider">
                        <span>Parc.</span>
                        <span>Vencimento</span>
                        <span>Valor (R$)</span>
                      </div>
                      <div className="divide-y divide-border/20">
                        {parcelaRows.map((row, idx) => (
                          <div key={idx} className="grid grid-cols-[48px_1fr_1fr] gap-1 px-3 py-1.5 items-center">
                            <span className="text-xs font-semibold text-muted-foreground">{idx + 1}/{numParcelas}</span>
                            <Input type="date" value={row.dataPagamento} onChange={e => handleParcelaDateChange(idx, e.target.value)} className="h-7 text-xs bg-background dark:bg-card border-border/30" />
                            <Input value={row.valorDisplay} onChange={e => handleParcelaValorChange(idx, e)} onFocus={e => e.target.select()} inputMode="numeric" className="h-7 text-xs bg-background dark:bg-card border-border/30 text-right font-mono" />
                          </div>
                        ))}
                      </div>
                      <div className="px-3 py-1.5 bg-muted/40 flex justify-between items-center text-xs">
                        <span className="text-muted-foreground font-medium">Total parcelas:</span>
                        <span className={cn("font-bold font-mono", Math.abs(parcelasTotal - Math.abs(valorNum)) < 0.01 ? "text-green-600 dark:text-green-400" : "text-destructive")}>
                          {formatMoeda(parcelasTotal)}
                        </span>
                      </div>
                      {Math.abs(parcelasTotal - Math.abs(valorNum)) >= 0.01 && (
                        <div className="px-3 py-1 bg-destructive/10 text-destructive text-[10px] flex items-center gap-1">
                          <AlertCircle className="h-3 w-3" />
                          A soma das parcelas difere do valor total ({formatMoeda(Math.abs(valorNum))})
                        </div>
                      )}
                    </div>
                  )}

                  {/* Recurrence grid */}
                  {frequencia === 'recorrente' && recorrenciaRows.length > 0 && (
                    <div className="rounded-lg border border-border/30 bg-background dark:bg-muted/20 overflow-hidden">
                      <div className="grid grid-cols-[60px_1fr_1fr_100px] gap-1 px-3 py-1.5 bg-muted/40 text-[10px] font-bold text-muted-foreground uppercase tracking-wider">
                        <span>Mês</span>
                        <span>Competência</span>
                        <span>Pagamento</span>
                        <span className="text-right">Valor (R$)</span>
                      </div>
                      <div className="divide-y divide-border/20 max-h-52 overflow-y-auto">
                        {recorrenciaRows.map((row, idx) => (
                          <div key={idx} className="grid grid-cols-[60px_1fr_1fr_100px] gap-1 px-3 py-1.5 items-center">
                            <span className="text-[10px] font-semibold text-muted-foreground capitalize">{row.mesLabel}</span>
                            <Input type="date" value={row.dataCompetencia} onChange={e => handleRecorrenciaCompChange(idx, e.target.value)} className="h-7 text-xs bg-background dark:bg-card border-border/30" />
                            <Input type="date" value={row.dataPagamento} onChange={e => handleRecorrenciaPgtoChange(idx, e.target.value)} className="h-7 text-xs bg-background dark:bg-card border-border/30" />
                            <Input value={row.valorDisplay} onChange={e => handleRecorrenciaValorChange(idx, e)} onFocus={e => e.target.select()} inputMode="numeric" className="h-7 text-xs bg-background dark:bg-card border-border/30 text-right font-mono" />
                          </div>
                        ))}
                      </div>
                      <div className="px-3 py-1.5 bg-muted/40 flex justify-between items-center text-xs">
                        <div className="flex items-center gap-2">
                          <span className="text-muted-foreground font-medium">Total ({recorrenciaRows.length}x):</span>
                          <Button type="button" variant="ghost" size="sm" className="h-6 px-2 text-[10px] gap-1" onClick={handleRecalcularRecorrencia}>
                            <RefreshCw className="h-3 w-3" /> Recalcular
                          </Button>
                        </div>
                        <span className="font-bold font-mono text-foreground">
                          {formatMoeda(recorrenciaTotal)}
                        </span>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </section>

            {/* ── BLOCO 4 — Complementares ── */}
            <section className={sectionClass}>
              <p className={sectionTitle}>Complementares</p>
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <Label className="text-xs">Nota Fiscal</Label>
                  <Input tabIndex={12} value={notaFiscalDisplay} onChange={handleNotaFiscalChange} inputMode="numeric" className={cn("h-9 font-mono", fieldBg)} placeholder="000.000.000" />
                </div>
                <div>
                  <Label className="text-xs">Forma de Pagamento</Label>
                  <Select value={formaPgto || '__none_fp__'} onValueChange={handleFormaPgtoChange}>
                    <SelectTrigger tabIndex={13} className={cn("h-9", fieldBg)}><SelectValue placeholder="Selecione" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none_fp__">Nenhuma</SelectItem>
                      <SelectItem value="PIX">PIX</SelectItem>
                      <SelectItem value="Cartão">Cartão</SelectItem>
                      <SelectItem value="Boleto">Boleto</SelectItem>
                      <SelectItem value="Débito Automático">Débito Automático</SelectItem>
                      <SelectItem value="Débito">Débito</SelectItem>
                      <SelectItem value="Transferência">Transferência</SelectItem>
                      <SelectItem value="Dinheiro">Dinheiro</SelectItem>
                      <SelectItem value="Outro">Outro</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <div className="flex items-center justify-between mb-0.5">
                    <Label className="text-xs">Dados Pagamento</Label>
                    <div className="flex gap-1">
                      {formaPgto === 'PIX' && dadosPagamento && (() => {
                        const chaveMatch = dadosPagamento.match(/Chave:\s*(.+)/i);
                        return chaveMatch ? (
                          <Button type="button" variant="ghost" size="sm" className="h-5 px-1.5 text-[9px] gap-0.5 text-primary hover:text-primary"
                            onClick={() => { navigator.clipboard.writeText(chaveMatch[1].trim()); toast.success('Chave PIX copiada'); }}>
                            <KeyRound className="h-2.5 w-2.5" /> PIX
                          </Button>
                        ) : null;
                      })()}
                      {dadosPagamento && (
                        <Button type="button" variant="ghost" size="sm" className="h-5 px-1.5 text-[9px] gap-0.5 text-muted-foreground hover:text-foreground"
                          onClick={() => { navigator.clipboard.writeText(dadosPagamento); toast.success('Dados copiados'); }}>
                          <Copy className="h-2.5 w-2.5" /> Copiar
                        </Button>
                      )}
                    </div>
                  </div>
                  <Textarea tabIndex={14} value={dadosPagamento} onChange={e => setDadosPagamento(e.target.value)} rows={1} placeholder="Chave PIX, dados bancários..." className={cn("text-xs resize-none", fieldBg)} />
                </div>
              </div>
              <div>
                <Label className="text-xs">Observação</Label>
                <Textarea tabIndex={15} value={observacao} onChange={e => setObservacao(e.target.value)} rows={2} placeholder="Observações adicionais" className={cn("text-xs", fieldBg)} />
              </div>
            </section>
          </div>

          {/* Sticky footer */}
          <div className="px-6 py-3 border-t border-border/30 bg-background dark:bg-card flex items-center gap-2">
            <Button variant="outline" onClick={onClose} className="px-5" tabIndex={16}>Cancelar</Button>
            <div className="flex-1" />
            {isEdit && onDelete && (
              <Button
                variant="destructive"
                size="sm"
                onClick={async () => {
                  if (!confirm('Tem certeza que deseja excluir este lançamento?')) return;
                  const ok = await onDelete(lancamento!.id);
                  if (ok) onClose();
                }}
                className="px-4"
              >
                Excluir
              </Button>
            )}
            <Button tabIndex={17} onClick={handleSubmit} disabled={saving || !canSave} className="px-8 font-semibold">
              {getSubmitLabel()}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <NovoFornecedorDialog
        open={fornecedorDialogOpen}
        onClose={() => setFornecedorDialogOpen(false)}
        onSave={async (nome, cpfCnpj) => {
          if (!fazendaId) return;
          const f = await onCriarFornecedor(nome, fazendaId, cpfCnpj);
          if (f) handleFornecedorCriado(f);
        }}
      />
    </>
  );
}
