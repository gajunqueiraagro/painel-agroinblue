import { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import { formatMoeda } from '@/lib/calculos/formatters';
import {
  Lancamento,
  CATEGORIAS,
  TIPOS_ENTRADA,
  TIPOS_SAIDA,
  TODOS_TIPOS,
  TipoMovimentacao,
  Categoria,
  isEntrada,
  isReclassificacao,
  kgToArrobas,
} from '@/types/cattle';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { ChevronDown as CollapseIcon } from 'lucide-react';
import { Separator } from '@/components/ui/separator';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { format, parseISO, addDays } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { ChevronRight, ChevronDown, ArrowLeft, AlertTriangle, LogIn, LogOut, RefreshCw, Clock, Info } from 'lucide-react';
import { LancamentoDetalhe } from '@/components/LancamentoDetalhe';
import { ReclassificacaoForm } from '@/components/ReclassificacaoForm';
import { CompraFinanceiroPanel, CompraFinanceiroPanelRef } from '@/components/CompraFinanceiroPanel';
import { AbateExportDialog } from '@/components/AbateExportMenu';
import { AbateFinanceiroPanel } from '@/components/AbateFinanceiroPanel';
import { ConfirmacaoRegistroDialog } from '@/components/ConfirmacaoRegistroDialog';
import { useFazenda } from '@/contexts/FazendaContext';
import { useIntegerInput, useDecimalInput } from '@/hooks/useFormattedNumber';
import { toast } from 'sonner';

interface Props {
  lancamentos: Lancamento[];
  onAdicionar: (l: Omit<Lancamento, 'id'>) => Promise<string | undefined> | void;
  onEditar: (id: string, dados: Partial<Omit<Lancamento, 'id'>>) => void;
  onRemover: (id: string) => void;
  onCountFinanceiros?: (id: string) => Promise<number>;
  abaInicial?: Aba;
  onBackToConciliacao?: () => void;
  dataInicial?: string;
  backLabel?: string;
  /** Abate para abrir em modo edição automaticamente */
  abateParaEditar?: Lancamento | null;
}

type Aba = 'entrada' | 'saida' | 'reclassificacao' | 'historico';
import { STATUS_OPTIONS, getStatusBadge, type StatusOperacional } from '@/lib/statusOperacional';

const MOTIVOS_MORTE = [
  'Raio', 'Picada de cobra', 'Doença respiratória', 'Tristeza parasitária',
  'Clostridiose', 'Intoxicação por planta', 'Acidente', 'Desidratação',
  'Parto distócico', 'Ataque de animal', 'Causa desconhecida',
];

interface Parcela { data: string; valor: number; }

const ABA_CONFIG: { id: Aba; label: string; icon: React.ReactNode }[] = [
  { id: 'entrada', label: 'Entradas', icon: <LogIn className="h-4 w-4" /> },
  { id: 'saida', label: 'Saídas', icon: <LogOut className="h-4 w-4" /> },
  { id: 'reclassificacao', label: 'Reclass.', icon: <RefreshCw className="h-4 w-4" /> },
  { id: 'historico', label: 'Histórico', icon: <Clock className="h-4 w-4" /> },
];

const STATUS_DESCRIPTIONS_DEFAULT: Record<StatusOperacional, string> = {
  previsto: 'Planejamento (meta). Não impacta o rebanho nem o financeiro real.',
  confirmado: 'Operação definida, mas ainda não realizada. Quando concluída, alterar para Realizado.',
  conciliado: 'Operação concluída. Impacta rebanho e financeiro real.',
};

const STATUS_DESCRIPTIONS_ABATE: Record<StatusOperacional, string> = {
  previsto: 'Planejamento (meta). Não impacta o rebanho nem o financeiro real.',
  confirmado: 'Venda fechada e animais escalados, mas o abate ainda não ocorreu. Os dados ainda são previsões operacionais e financeiras.',
  conciliado: 'Abate concluído com dados reais de carcaça, bônus e descontos. Os valores refletem o resultado efetivo da operação.',
};

function getStatusDescription(tipo: TipoMovimentacao, status: StatusOperacional): string {
  return tipo === 'abate' ? STATUS_DESCRIPTIONS_ABATE[status] : STATUS_DESCRIPTIONS_DEFAULT[status];
}

function getCamposFazenda(tipo: TipoMovimentacao, nomeFazenda: string) {
  switch (tipo) {
    case 'nascimento':
      return { origem: { show: false }, destino: { show: true, auto: true, value: nomeFazenda, label: 'Fazenda Destino' } };
    case 'compra':
      return { origem: { show: true, auto: false, label: 'Origem' }, destino: { show: true, auto: true, value: nomeFazenda, label: 'Fazenda Destino' } };
    case 'transferencia_entrada':
      return { origem: { show: true, auto: false, label: 'Origem', useSelect: true }, destino: { show: true, auto: true, value: nomeFazenda, label: 'Fazenda Destino' } };
    case 'abate':
      return { origem: { show: true, auto: true, value: nomeFazenda, label: 'Fazenda Origem' }, destino: { show: true, auto: false, label: 'Frigorífico' } };
    case 'venda':
      return { origem: { show: true, auto: true, value: nomeFazenda, label: 'Fazenda Origem' }, destino: { show: true, auto: false, label: 'Destino' } };
    case 'transferencia_saida':
      return { origem: { show: true, auto: true, value: nomeFazenda, label: 'Fazenda Origem' }, destino: { show: true, auto: false, label: 'Destino', useSelect: true } };
    case 'consumo':
      return { origem: { show: true, auto: true, value: nomeFazenda, label: 'Fazenda Origem' }, destino: { show: true, auto: false, label: 'Motivo', placeholder: 'Ex: Consumo interno' } };
    case 'morte':
      return { origem: { show: true, auto: true, value: nomeFazenda, label: 'Fazenda Origem' }, destino: { show: false } };
    default:
      return { origem: { show: true, auto: false, label: 'Origem' }, destino: { show: true, auto: false, label: 'Destino' } };
  }
}

function fmt(v?: number, decimals = 2) {
  if (v === undefined || v === null || isNaN(v) || v === 0) return '-';
  return v.toLocaleString('pt-BR', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}

export function LancamentosTab({ lancamentos, onAdicionar, onEditar, onRemover, onCountFinanceiros, abaInicial, onBackToConciliacao, dataInicial, backLabel, abateParaEditar }: Props) {
  const { fazendaAtual, fazendas, isGlobal } = useFazenda();
  const nomeFazenda = fazendaAtual?.nome || '';
  const isAdministrativo = fazendaAtual?.tem_pecuaria === false;
  const bloqueado = isGlobal || isAdministrativo;

  const outrasFazendas = useMemo(() => {
    return fazendas.filter(f => f.id !== fazendaAtual?.id && f.id !== '__global__' && f.tem_pecuaria !== false);
  }, [fazendas, fazendaAtual]);

  const [aba, setAba] = useState<Aba>(abaInicial || 'entrada');
  const [tipo, setTipo] = useState<TipoMovimentacao>('nascimento');
  const [categoria, setCategoria] = useState<Categoria | ''>('');
  const [quantidade, setQuantidade] = useState('');
  const [data, setData] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [fazendaOrigem, setFazendaOrigem] = useState('');
  const [fazendaDestino, setFazendaDestino] = useState('');
  const [pesoKg, setPesoKg] = useState(abaInicial === 'entrada' || !abaInicial ? '30' : '');
  const [observacao, setObservacao] = useState('');
  const [detalheId, setDetalheId] = useState<string | null>(null);
  const [lastSavedLancamentoId, setLastSavedLancamentoId] = useState<string | null>(null);
  const [editingAbateId, setEditingAbateId] = useState<string | null>(null);
  const compraFinanceiroRef = useRef<CompraFinanceiroPanelRef>(null);
  const [anoFiltro, setAnoFiltro] = useState(String(new Date().getFullYear()));
  const [mesFiltro, setMesFiltro] = useState('todos');
  const [financeiroOpen, setFinanceiroOpen] = useState(false);
  const [statusOp, setStatusOp] = useState<StatusOperacional>('conciliado');
  const [confirmDialogOpen, setConfirmDialogOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const [motivoMorte, setMotivoMorte] = useState('');
  const [motivoMorteCustom, setMotivoMorteCustom] = useState('');

  const [pesoCarcacaKg, setPesoCarcacaKg] = useState('');
  const [precoArroba, setPrecoArroba] = useState('');
  const [precoKg, setPrecoKg] = useState('');
  const [bonusPrecoce, setBonusPrecoce] = useState('');
  const [bonusQualidade, setBonusQualidade] = useState('');
  const [bonusListaTrace, setBonusListaTrace] = useState('');
  const [descontoQualidade, setDescontoQualidade] = useState('');
  const [descontoFunrural, setDescontoFunrural] = useState('');
  const [outrosDescontos, setOutrosDescontos] = useState('');
  const [bonus, setBonus] = useState('');
  const [descontos, setDescontos] = useState('');
  const [comissaoPct, setComissaoPct] = useState('');
  const [frete, setFrete] = useState('');
  const [outrasDespesas, setOutrasDespesas] = useState('');
  const [notaFiscal, setNotaFiscal] = useState('');
  const [tipoPeso, setTipoPeso] = useState<'vivo' | 'morto'>('vivo');
  const [rendCarcaca, setRendCarcaca] = useState('');
  const [funruralPct, setFunruralPct] = useState('');

  const [dataVenda, setDataVenda] = useState('');
  const [dataEmbarque, setDataEmbarque] = useState('');
  const [dataAbate, setDataAbate] = useState('');
  const [tipoVenda, setTipoVenda] = useState('');

  const [formaPagamento, setFormaPagamento] = useState<'avista' | 'parcelado'>('avista');
  const [parcelas, setParcelas] = useState<Parcela[]>([]);
  const [qtdParcelas, setQtdParcelas] = useState('1');

  const qtdInput = useIntegerInput(quantidade, setQuantidade);
  const pesoInput = useDecimalInput(pesoKg, setPesoKg, 2);

  const isPrevisto = statusOp === 'previsto';
  const isConfirmado = statusOp === 'confirmado';
  const isConciliado = statusOp === 'conciliado';
  const isAbate = tipo === 'abate';
  const isNascimento = tipo === 'nascimento';
  const isMorte = tipo === 'morte';
  const isCompra = tipo === 'compra';
  const isVenda = tipo === 'venda';
  const isTransferencia = tipo === 'transferencia_entrada' || tipo === 'transferencia_saida';

  const usaPrecoArroba = isAbate;
  const usaPrecoKg = !isAbate && !isNascimento;

  const categoriasDisponiveis = useMemo(() => {
    if (isNascimento) return CATEGORIAS.filter(c => c.value === 'mamotes_m' || c.value === 'mamotes_f');
    return CATEGORIAS;
  }, [isNascimento]);

  const calc = useMemo(() => {
    const qtd = Number(quantidade) || 0;
    const peso = Number(pesoKg) || 0;
    const rend = Number(rendCarcaca) || 0;
    const carcacaCalc = isAbate && rend > 0 ? peso * rend / 100 : Number(pesoCarcacaKg) || 0;
    let pesoArroba = 0;
    if (isAbate) { pesoArroba = carcacaCalc > 0 ? carcacaCalc / 15 : 0; }
    else { pesoArroba = peso > 0 ? peso / 30 : 0; }
    const totalArrobas = pesoArroba * qtd;
    const totalKg = peso * qtd;
    let valorBruto = 0;
    if (usaPrecoArroba) { valorBruto = totalArrobas * (Number(precoArroba) || 0); }
    else if (usaPrecoKg) { valorBruto = totalKg * (Number(precoKg) || 0); }
    // Abate: bonus/desconto inputs are R$/@ → multiply by totalArrobas
    const bonusPrecoceTotal = isAbate ? (Number(bonusPrecoce) || 0) * totalArrobas : 0;
    const bonusQualidadeTotal = isAbate ? (Number(bonusQualidade) || 0) * totalArrobas : 0;
    const bonusListaTraceTotal = isAbate ? (Number(bonusListaTrace) || 0) * totalArrobas : 0;
    const descQualidadeTotal = isAbate ? (Number(descontoQualidade) || 0) * totalArrobas : 0;
    const descFunruralTotal = isAbate ? valorBruto * (Number(funruralPct) || 0) / 100 : 0;
    const descOutrosTotal = isAbate ? (Number(outrosDescontos) || 0) : 0;
    const totalBonus = isAbate
      ? bonusPrecoceTotal + bonusQualidadeTotal + bonusListaTraceTotal
      : (Number(bonus) || 0);
    const totalDescontos = isAbate
      ? descQualidadeTotal + descFunruralTotal + descOutrosTotal
      : (Number(descontos) || 0);
    const comissaoVal = isAbate ? 0 : valorBruto * (Number(comissaoPct) || 0) / 100;
    const freteVal = isAbate ? 0 : Number(frete) || 0;
    const outrasDespVal = isAbate ? 0 : Number(outrasDespesas) || 0;
    const valorLiquido = valorBruto + totalBonus - totalDescontos - comissaoVal - freteVal - outrasDespVal;
    const liqArroba = totalArrobas > 0 ? valorLiquido / totalArrobas : 0;
    const liqCabeca = qtd > 0 ? valorLiquido / qtd : 0;
    const liqKg = totalKg > 0 ? valorLiquido / totalKg : 0;
    return {
      pesoArroba, totalArrobas, totalKg, valorBruto, totalBonus, totalDescontos,
      comissaoVal, freteVal, outrasDespVal, valorLiquido, liqArroba, liqCabeca, liqKg,
      carcacaCalc, bonusPrecoceTotal, bonusQualidadeTotal, bonusListaTraceTotal,
      descQualidadeTotal, descFunruralTotal, descOutrosTotal,
    };
  }, [quantidade, pesoKg, pesoCarcacaKg, rendCarcaca, precoArroba, precoKg, bonusPrecoce, bonusQualidade, bonusListaTrace, descontoQualidade, funruralPct, outrosDescontos, bonus, descontos, comissaoPct, frete, outrasDespesas, isAbate, usaPrecoArroba, usaPrecoKg]);

  const gerarParcelas = useCallback((numParcelas: number, baseDate: string, valorTotal: number) => {
    const p: Parcela[] = [];
    const valorParcela = valorTotal / numParcelas;
    for (let i = 0; i < numParcelas; i++) {
      const d = addDays(parseISO(baseDate || data), 30 * (i + 1));
      p.push({ data: format(d, 'yyyy-MM-dd'), valor: Math.round(valorParcela * 100) / 100 });
    }
    if (p.length > 0) {
      const sumOthers = p.slice(0, -1).reduce((s, x) => s + x.valor, 0);
      p[p.length - 1].valor = Math.round((valorTotal - sumOthers) * 100) / 100;
    }
    return p;
  }, [data]);

  const handleQtdParcelasChange = (v: string) => {
    setQtdParcelas(v);
    const n = Number(v);
    if (n > 0 && calc.valorBruto > 0) {
      setParcelas(gerarParcelas(n, dataVenda || data, calc.valorBruto));
    }
  };

  const anosDisponiveis = useMemo(() => {
    const anos = new Set<string>();
    anos.add(String(new Date().getFullYear()));
    lancamentos.forEach(l => { try { anos.add(format(parseISO(l.data), 'yyyy')); } catch {} });
    return Array.from(anos).sort().reverse();
  }, [lancamentos]);

  const MESES = [
    { value: 'todos', label: 'Todos' },
    { value: '01', label: 'Jan' }, { value: '02', label: 'Fev' },
    { value: '03', label: 'Mar' }, { value: '04', label: 'Abr' },
    { value: '05', label: 'Mai' }, { value: '06', label: 'Jun' },
    { value: '07', label: 'Jul' }, { value: '08', label: 'Ago' },
    { value: '09', label: 'Set' }, { value: '10', label: 'Out' },
    { value: '11', label: 'Nov' }, { value: '12', label: 'Dez' },
  ];

  const historicoFiltrado = useMemo(() => {
    return lancamentos.filter(l => {
      try {
        const d = parseISO(l.data);
        if (format(d, 'yyyy') !== anoFiltro) return false;
        if (mesFiltro !== 'todos' && format(d, 'MM') !== mesFiltro) return false;
        return true;
      } catch { return false; }
    });
  }, [lancamentos, anoFiltro, mesFiltro]);

  const lancamentoDetalhe = detalheId ? lancamentos.find(l => l.id === detalheId) : null;
  const campos = useMemo(() => getCamposFazenda(tipo, nomeFazenda), [tipo, nomeFazenda]);

  const numOrUndef = (v: string) => { const n = parseFloat(v); return isNaN(n) ? undefined : n; };

  const resetFinancialFields = () => {
    setPesoCarcacaKg(''); setPrecoArroba(''); setPrecoKg('');
    setBonusPrecoce(''); setBonusQualidade(''); setBonusListaTrace('');
    setDescontoQualidade(''); setDescontoFunrural(''); setOutrosDescontos('');
    setBonus(''); setDescontos(''); setComissaoPct(''); setFrete(''); setOutrasDespesas('');
    setNotaFiscal(''); setTipoPeso('vivo'); setObservacao('');
    setDataVenda(''); setDataEmbarque(''); setDataAbate(''); setTipoVenda('');
    setFormaPagamento('avista'); setParcelas([]); setQtdParcelas('1');
    setMotivoMorte(''); setMotivoMorteCustom('');
    setRendCarcaca(''); setFunruralPct('');
  };

  // Load abate into form for editing
  const loadAbateForEdit = useCallback((l: Lancamento) => {
    // 1. Set tab & type
    setAba('saida');
    setTipo('abate');

    // 2. Zootechnical data
    setData(l.data);
    setCategoria(l.categoria);
    setQuantidade(String(l.quantidade));
    setPesoKg(l.pesoMedioKg ? String(l.pesoMedioKg) : '');
    setFazendaOrigem(l.fazendaOrigem || '');
    setFazendaDestino(l.fazendaDestino || '');
    setObservacao(l.observacao || '');
    setStatusOp((l.statusOperacional as StatusOperacional) || 'conciliado');
    setTipoPeso(l.tipoPeso || 'vivo');
    setNotaFiscal(l.notaFiscal || '');

    // 3. Financial / commercial data
    setDataVenda(l.dataVenda || '');
    setDataEmbarque(l.dataEmbarque || '');
    setDataAbate(l.dataAbate || l.data || '');
    setTipoVenda(l.tipoVenda || '');
    setPrecoArroba(l.precoArroba ? String(l.precoArroba) : '');
    setPesoCarcacaKg(l.pesoCarcacaKg ? String(l.pesoCarcacaKg) : '');

    // 4. Reverse-calc rendimento from pesoCarcacaKg / pesoMedioKg
    if (l.pesoCarcacaKg && l.pesoMedioKg && l.pesoMedioKg > 0) {
      setRendCarcaca(String(((l.pesoCarcacaKg / l.pesoMedioKg) * 100).toFixed(2)));
    } else {
      setRendCarcaca('');
    }

    // 5. Bonus/desconto stored as totals → convert back to R$/@ for form inputs
    const rend = l.pesoCarcacaKg && l.pesoMedioKg ? l.pesoCarcacaKg / l.pesoMedioKg : 0;
    const arrobasCab = (l.pesoMedioKg ?? 0) * rend / 15;
    const totalArrobas = arrobasCab * l.quantidade;
    const toArroba = (total: number | undefined) => {
      if (!total || totalArrobas <= 0) return '';
      return String((total / totalArrobas).toFixed(2));
    };
    setBonusPrecoce(toArroba(l.bonusPrecoce));
    setBonusQualidade(toArroba(l.bonusQualidade));
    setBonusListaTrace(toArroba(l.bonusListaTrace));
    setDescontoQualidade(toArroba(l.descontoQualidade));
    setOutrosDescontos(l.outrosDescontos ? String(l.outrosDescontos) : '');

    // 6. Funrural: stored as total → reverse to percentage of valor bruto
    if (l.descontoFunrural && l.descontoFunrural > 0 && totalArrobas > 0 && l.precoArroba) {
      const valorBruto = totalArrobas * l.precoArroba;
      if (valorBruto > 0) {
        setFunruralPct(String(((l.descontoFunrural / valorBruto) * 100).toFixed(2)));
      } else {
        setFunruralPct('');
      }
    } else {
      setFunruralPct('');
    }

    // 7. Open financial panel and set editing mode
    setFinanceiroOpen(true);
    setEditingAbateId(l.id);
    setDetalheId(null);
    setLastSavedLancamentoId(null);
  }, []);

  // Auto-load abate for editing when navigated from another tab
  useEffect(() => {
    if (abateParaEditar) {
      loadAbateForEdit(abateParaEditar);
    }
  }, [abateParaEditar]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!quantidade || Number(quantidade) <= 0) { toast.error('Informe a quantidade'); return; }
    if (!categoria) { toast.error('Selecione a categoria'); return; }
    if (!data) { toast.error('Informe a data'); return; }

    // Abate: validate required fields
    if (isAbate) {
      if (!fazendaDestino) { toast.error('Informe o Frigorífico'); return; }
      if (isConfirmado || isConciliado) {
        if (!dataVenda && !format(new Date(), 'yyyy-MM-dd')) { toast.error('Informe a Data da Venda'); return; }
        if (!tipoVenda) { toast.error('Selecione a Comercialização'); return; }
        if (!tipoPeso) { toast.error('Selecione o Tipo de Abate'); return; }
        if (!rendCarcaca || Number(rendCarcaca) <= 0) { toast.error('Informe o Rendimento de Carcaça (%)'); return; }
        if (!precoArroba || Number(precoArroba) <= 0) { toast.error('Informe o R$/@ (preço base)'); return; }
      }
    }
    // Non-abate saídas: validate origin/destination
    if (aba === 'saida' && !isAbate && !isMorte) {
      if (campos.destino?.show && !campos.destino.auto && !fazendaDestino) { toast.error('Informe o Destino'); return; }
    }
    if (!pesoKg || Number(pesoKg) <= 0) { toast.error('Informe o Peso (kg)'); return; }

    // Compra: validate financial fields for confirmado/realizado
    if (isCompra && compraFinanceiroRef.current) {
      const finErrors = compraFinanceiroRef.current.getValidationErrors();
      const tipoPrecoVal = compraFinanceiroRef.current.getTipoPreco();
      const valorBaseVal = compraFinanceiroRef.current.getValorBase();
      const fornecedorVal = compraFinanceiroRef.current.getFornecedorId();

      if (isConfirmado || isConciliado) {
        if (!fornecedorVal) { toast.error('Selecione o fornecedor antes de registrar a compra.'); return; }
        if (valorBaseVal <= 0) { toast.error('Preencha o preço base antes de registrar a compra.'); return; }
      }
      if (finErrors.length > 0 && valorBaseVal > 0) {
        toast.error(finErrors[0]);
        return;
      }
    }

    const origemFinal = campos.origem.show
      ? (campos.origem.auto ? campos.origem.value : fazendaOrigem) || undefined
      : undefined;
    let destinoFinal = campos.destino?.show
      ? (campos.destino.auto ? campos.destino.value : fazendaDestino) || undefined
      : undefined;

    if (isMorte) {
      destinoFinal = motivoMorte === '__custom__' ? motivoMorteCustom : motivoMorte || undefined;
    }

    const valorTotalFinal = calc.valorLiquido > 0 ? calc.valorLiquido : undefined;

    // For abate: auto-compute dates and convert R$/@ to absolute values
    const abateDataVenda = isAbate ? (dataVenda || format(new Date(), 'yyyy-MM-dd')) : (dataVenda || undefined);
    const abateDataEmbarque = isAbate && data ? format(addDays(parseISO(data), -1), 'yyyy-MM-dd') : (dataEmbarque || undefined);
    const abateDataAbate = isAbate ? data : (dataAbate || undefined);

    const lancamentoDados: Partial<Omit<Lancamento, 'id'>> = {
      data, tipo, quantidade: Number(quantidade), categoria: categoria as Categoria,
      fazendaOrigem: origemFinal, fazendaDestino: destinoFinal,
      pesoMedioKg: pesoKg ? Number(pesoKg) : undefined,
      pesoMedioArrobas: pesoKg ? kgToArrobas(Number(pesoKg)) : undefined,
      observacao: observacao || undefined,
      pesoCarcacaKg: isAbate ? (calc.carcacaCalc > 0 ? calc.carcacaCalc : undefined) : numOrUndef(pesoCarcacaKg),
      precoArroba: numOrUndef(precoArroba) || undefined,
      bonusPrecoce: isAbate ? (calc.bonusPrecoceTotal > 0 ? calc.bonusPrecoceTotal : undefined) : numOrUndef(bonusPrecoce),
      bonusQualidade: isAbate ? (calc.bonusQualidadeTotal > 0 ? calc.bonusQualidadeTotal : undefined) : numOrUndef(bonusQualidade),
      bonusListaTrace: isAbate ? (calc.bonusListaTraceTotal > 0 ? calc.bonusListaTraceTotal : undefined) : numOrUndef(bonusListaTrace),
      descontoQualidade: isAbate ? (calc.descQualidadeTotal > 0 ? calc.descQualidadeTotal : undefined) : numOrUndef(descontoQualidade),
      descontoFunrural: isAbate ? (calc.descFunruralTotal > 0 ? calc.descFunruralTotal : undefined) : numOrUndef(descontoFunrural),
      outrosDescontos: isAbate ? (Number(outrosDescontos) || undefined) : numOrUndef(outrosDescontos),
      acrescimos: numOrUndef(bonus),
      deducoes: numOrUndef(descontos),
      valorTotal: valorTotalFinal,
      notaFiscal: isAbate && isConfirmado ? undefined : (notaFiscal || undefined),
      tipoPeso,
      statusOperacional: statusOp,
      dataVenda: abateDataVenda || undefined,
      dataEmbarque: abateDataEmbarque || undefined,
      dataAbate: abateDataAbate || undefined,
      tipoVenda: tipoVenda || undefined,
    };

    if (editingAbateId) {
      // UPDATE existing lancamento
      onEditar(editingAbateId, lancamentoDados);
      if (isAbate && (isConciliado || isConfirmado)) {
        // Keep form open so user can generate/update financial records
        setLastSavedLancamentoId(editingAbateId);
        setEditingAbateId(null);
        toast.success('Abate atualizado! Agora você pode gerar/atualizar os lançamentos financeiros.');
      } else {
        setEditingAbateId(null);
        setLastSavedLancamentoId(null);
        setQuantidade('');
        setCategoria('');
        setPesoKg('');
        setFazendaOrigem(''); setFazendaDestino('');
        setData(format(new Date(), 'yyyy-MM-dd'));
        setObservacao('');
        setStatusOp('conciliado');
        resetFinancialFields();
        toast.success('Abate atualizado com sucesso!');
      }
    } else {
      const returnedId = await onAdicionar(lancamentoDados as Omit<Lancamento, 'id'>);

      if (isCompra && returnedId) {
        // Auto-generate financial records
        if (compraFinanceiroRef.current && compraFinanceiroRef.current.getValorBase() > 0) {
          await compraFinanceiroRef.current.generateFinanceiro(returnedId);
        }
        // Reset compra financial panel
        compraFinanceiroRef.current?.resetForm();
        setLastSavedLancamentoId(null);
        setQuantidade('');
        setCategoria('');
        setPesoKg('');
        setFazendaOrigem(''); setFazendaDestino('');
        setData(format(new Date(), 'yyyy-MM-dd'));
        setObservacao('');
        setStatusOp('conciliado');
        resetFinancialFields();
        toast.success('Compra registrada com sucesso!');
      } else if (isAbate && (isConciliado || isConfirmado) && returnedId) {
        setLastSavedLancamentoId(returnedId);
        toast.success('Abate registrado! Agora você pode gerar os lançamentos financeiros.');
      } else {
        setLastSavedLancamentoId(null);
        setQuantidade('');
        setCategoria('');
        setPesoKg(tipo === 'nascimento' ? '30' : '');
        setFazendaOrigem(''); setFazendaDestino('');
        setData(format(new Date(), 'yyyy-MM-dd'));
        setObservacao('');
        setStatusOp('conciliado');
        resetFinancialFields();
        toast.success('Lançamento registrado!');
      }
    }
  };

  const tiposDisponiveis = aba === 'entrada' ? TIPOS_ENTRADA : TIPOS_SAIDA;

  const previstoInputClass = isPrevisto ? 'border-orange-400 text-orange-800 dark:text-orange-300' : '';
  const previstoLabelClass = isPrevisto ? 'text-orange-700 dark:text-orange-400' : '';

  const showExtraDates = !isAbate && (isConfirmado || isConciliado) && (isVenda || isTransferencia);
  const showFormaPagamento = !isAbate && (isConfirmado || isConciliado) && (isVenda || isCompra || isTransferencia);
  const showComissaoFreteDespesas = !isAbate && isConciliado && (isVenda || isCompra || isTransferencia);
  const showComissaoPrevConf = (isConfirmado) && (isCompra);

  // Auto-computed dates for abate
  const abateDataVendaAuto = dataVenda || format(new Date(), 'yyyy-MM-dd');
  const abateDataEmbarqueAuto = data ? format(addDays(parseISO(data), -1), 'yyyy-MM-dd') : '';
  const abateDataAbateAuto = data;

  // ===== BLOCKED VIEW =====
  if (bloqueado && (aba === 'entrada' || aba === 'saida' || aba === 'reclassificacao')) {
    return (
      <div className="p-3 animate-fade-in pb-20">
        {onBackToConciliacao && (
          <button onClick={onBackToConciliacao} className="w-full flex items-center justify-center gap-1 text-[12px] font-bold text-primary bg-primary/10 rounded-md py-1.5 transition-colors hover:bg-primary/20 mb-2">
            <ArrowLeft className="h-3.5 w-3.5" /> {backLabel || 'Retornar à Conciliação de Categoria'}
          </button>
        )}
        <div className="flex gap-3">
          {/* Sidebar nav */}
          <div className="w-48 shrink-0 space-y-1">
            {ABA_CONFIG.map(a => (
              <button key={a.id} onClick={() => { setAba(a.id); if (a.id === 'entrada') setTipo('nascimento'); if (a.id === 'saida') setTipo('abate'); }}
                className={`w-full flex items-center gap-2 px-3 py-2.5 rounded-md text-[12px] font-bold transition-all ${aba === a.id ? 'bg-primary text-primary-foreground shadow-sm' : 'text-muted-foreground hover:bg-muted/60'}`}>
                {a.icon} {a.label}
              </button>
            ))}
          </div>
          <div className="flex-1 bg-orange-50 dark:bg-orange-950/30 border border-orange-200 dark:border-orange-800 rounded-md p-4 text-center space-y-2">
            <AlertTriangle className="h-8 w-8 text-orange-500 mx-auto" />
            <h3 className="font-bold text-foreground text-sm">Lançamento bloqueado</h3>
            <p className="text-[12px] text-muted-foreground">
              {isGlobal
                ? 'Selecione uma fazenda específica para realizar lançamentos. O modo Global é apenas para consulta.'
                : 'Fazendas administrativas não permitem lançamentos zootécnicos.'}
            </p>
          </div>
        </div>
      </div>
    );
  }

  // ===== LEFT SIDEBAR NAV =====
  const renderSidebar = () => {
    const parentCls = (active: boolean) =>
      `w-full flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-[13px] font-bold transition-all ${
        active ? 'bg-primary text-primary-foreground shadow-sm' : 'text-muted-foreground hover:bg-muted/60'
      }`;
    const childCls = (active: boolean) =>
      `w-full flex items-center gap-1.5 px-2 py-1 rounded-md text-[12px] font-semibold transition-all ${
        active ? 'bg-primary/15 text-foreground border border-primary/40' : 'text-muted-foreground hover:bg-muted/40 border border-transparent'
      }`;
    const childWrap = "ml-3 mt-0.5 border-l-2 border-primary/30 pl-1.5 space-y-0.5";

    return (
      <div className="shrink-0 space-y-2">
        {/* Entradas */}
        <div>
          <button onClick={() => { setAba('entrada'); setTipo('nascimento'); }} className={parentCls(aba === 'entrada')}>
            <LogIn className="h-3.5 w-3.5" /> Entradas
          </button>
          <div className={childWrap}>
            {TIPOS_ENTRADA.map(t => (
              <button key={t.value} type="button"
                onClick={() => { setAba('entrada'); setTipo(t.value); setCategoria(''); setFazendaOrigem(''); setFazendaDestino(''); resetFinancialFields(); setPesoKg(t.value === 'nascimento' ? '30' : ''); setLastSavedLancamentoId(null); }}
                className={childCls(aba === 'entrada' && tipo === t.value)}>
                <span className="text-[12px]">{t.icon}</span> {t.label}
              </button>
            ))}
          </div>
        </div>

        {/* Saídas */}
        <div>
          <button onClick={() => { setAba('saida'); setTipo('abate'); }} className={parentCls(aba === 'saida')}>
            <LogOut className="h-3.5 w-3.5" /> Saídas
          </button>
          <div className={childWrap}>
            {TIPOS_SAIDA.map(t => (
              <button key={t.value} type="button"
                onClick={() => { setAba('saida'); setTipo(t.value); setCategoria(''); setFazendaOrigem(''); setFazendaDestino(''); setMotivoMorte(''); setMotivoMorteCustom(''); resetFinancialFields(); setPesoKg(''); setLastSavedLancamentoId(null); }}
                className={childCls(aba === 'saida' && tipo === t.value)}>
                <span className="text-[12px]">{t.icon}</span> {t.label}
              </button>
            ))}
          </div>
        </div>

        {/* Evoluir Categoria Animal */}
        <button onClick={() => setAba('reclassificacao')} className={parentCls(aba === 'reclassificacao')}>
          <RefreshCw className="h-3.5 w-3.5" /> Evoluir Categoria
        </button>

        {/* Histórico */}
        <button onClick={() => setAba('historico')} className={parentCls(aba === 'historico')}>
          <Clock className="h-3.5 w-3.5" /> Histórico
        </button>
      </div>
    );
  };

  // ===== ABATE FINANCIAL PANEL =====
  const renderAbateFinancialPanel = () => {
    const compactRow = (label: string, input: React.ReactNode, autoLabel?: string, autoValue?: string, autoColor?: string) => (
      <div className="space-y-0.5">
        <div className="flex items-center gap-2">
          <span className="text-[10px] text-muted-foreground whitespace-nowrap min-w-[90px]">{label}</span>
          <div className="flex-1">{input}</div>
        </div>
        {autoLabel && autoValue && autoValue !== '-' && (
          <p className={`text-[9px] pl-[98px] ${autoColor || 'text-muted-foreground'}`}>
            {autoLabel}: {autoValue}
          </p>
        )}
      </div>
    );

    return (
      <div className="bg-card rounded-md border shadow-sm p-3 space-y-2 self-start">
        <h3 className="text-[11px] font-bold uppercase text-muted-foreground tracking-wide">Detalhes Financeiros</h3>
        <Separator />

        {/* Datas da Operação — collapsible */}
        <Collapsible>
          <CollapsibleTrigger className="flex items-center justify-between w-full group">
            <h4 className="text-[10px] font-bold text-muted-foreground uppercase">Datas da Operação</h4>
            <CollapseIcon className="h-3.5 w-3.5 text-muted-foreground transition-transform group-data-[state=open]:rotate-180" />
          </CollapsibleTrigger>
          <CollapsibleContent className="space-y-1 pt-1">
            <div className="flex items-center gap-2">
              <span className="text-[10px] text-muted-foreground min-w-[90px]">Data da Venda</span>
              <Input type="date" value={dataVenda || format(new Date(), 'yyyy-MM-dd')} onChange={e => setDataVenda(e.target.value)} className="h-7 text-[11px] flex-1" />
            </div>
            <div className="flex items-center gap-2">
              <span className="text-[10px] text-muted-foreground min-w-[90px]">Data Embarque</span>
              <Input type="date" value={abateDataEmbarqueAuto} readOnly className="h-7 text-[11px] flex-1 bg-muted cursor-not-allowed" />
            </div>
            <div className="flex items-center gap-2">
              <span className="text-[10px] text-muted-foreground min-w-[90px]">Data Abate</span>
              <Input type="date" value={abateDataAbateAuto} readOnly className="h-7 text-[11px] flex-1 bg-muted cursor-not-allowed" />
            </div>
            {/* Comercialização (ex Tipo de Venda) */}
            <div className="flex items-center gap-2">
              <span className="text-[10px] text-muted-foreground min-w-[90px]">Comercialização</span>
              <Select value={tipoVenda} onValueChange={setTipoVenda}>
                <SelectTrigger className="h-7 text-[11px] flex-1"><SelectValue placeholder="Selecione..." /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="escala" className="text-[11px]">Escala</SelectItem>
                  <SelectItem value="a_termo" className="text-[11px]">A termo</SelectItem>
                  <SelectItem value="spot" className="text-[11px]">Spot</SelectItem>
                  <SelectItem value="outro" className="text-[11px]">Outro</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {/* Tipo de Abate (Base de Pagamento) */}
            <div className="flex items-center gap-2">
              <span className="text-[10px] text-muted-foreground min-w-[90px]">Tipo de Abate</span>
              <Select value={tipoPeso} onValueChange={(v: 'vivo' | 'morto') => setTipoPeso(v)}>
                <SelectTrigger className="h-7 text-[11px] flex-1"><SelectValue placeholder="Selecione..." /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="vivo" className="text-[11px]">Peso vivo</SelectItem>
                  <SelectItem value="morto" className="text-[11px]">Peso morto</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </CollapsibleContent>
        </Collapsible>

        <Separator />

        {/* Carcaça e Valor da Operação — collapsible */}
        <Collapsible>
          <CollapsibleTrigger className="flex items-center justify-between w-full group">
            <h4 className="text-[10px] font-bold text-muted-foreground uppercase">Carcaça e Valor da Operação</h4>
            <CollapseIcon className="h-3.5 w-3.5 text-muted-foreground transition-transform group-data-[state=open]:rotate-180" />
          </CollapsibleTrigger>
          <CollapsibleContent className="space-y-1 pt-1">
            {compactRow(
              'Rend. Carcaça (%)',
              <Input type="number" value={rendCarcaca} onChange={e => setRendCarcaca(e.target.value)} placeholder="0,0" className="h-7 text-[11px]" step="0.1" />,
            )}
            {calc.carcacaCalc > 0 && (
              <p className="text-[9px] text-muted-foreground pl-[98px]">Peso Carcaça: {fmt(calc.carcacaCalc)} kg</p>
            )}
            {calc.pesoArroba > 0 && (
              <p className="text-[9px] text-muted-foreground pl-[98px]">Arrobas: {fmt(calc.pesoArroba)} @ / cab</p>
            )}
            {calc.totalArrobas > 0 && (
              <p className="text-[9px] font-semibold text-muted-foreground pl-[98px]">Total Arrobas: {fmt(calc.totalArrobas)} @</p>
            )}
            <Separator className="my-1" />
            {compactRow(
              'R$/@ (preço base)',
              <Input type="number" value={precoArroba} onChange={e => setPrecoArroba(e.target.value)} placeholder="0,00" className="h-7 text-[11px]" />,
              'Valor Total Base',
              calc.valorBruto > 0 ? formatMoeda(calc.valorBruto) : undefined,
            )}
          </CollapsibleContent>
        </Collapsible>

        <Separator />

        {/* Bônus (R$/@) — collapsible */}
        <Collapsible>
          <CollapsibleTrigger className="flex items-center justify-between w-full group">
            <h4 className="text-[10px] font-bold text-muted-foreground uppercase">Bônus (R$/@)</h4>
            <CollapseIcon className="h-3.5 w-3.5 text-muted-foreground transition-transform group-data-[state=open]:rotate-180" />
          </CollapsibleTrigger>
          <CollapsibleContent className="space-y-1 pt-1">
            {compactRow(
              'Precoce R$/@',
              <Input type="number" value={bonusPrecoce} onChange={e => setBonusPrecoce(e.target.value)} placeholder="0,00" className="h-7 text-[11px]" />,
              'Precoce R$',
              calc.bonusPrecoceTotal > 0 ? formatMoeda(calc.bonusPrecoceTotal) : undefined,
            )}
            {compactRow(
              'Qualidade R$/@',
              <Input type="number" value={bonusQualidade} onChange={e => setBonusQualidade(e.target.value)} placeholder="0,00" className="h-7 text-[11px]" />,
              'Qualidade R$',
              calc.bonusQualidadeTotal > 0 ? formatMoeda(calc.bonusQualidadeTotal) : undefined,
            )}
            {compactRow(
              'Lista Trace R$/@',
              <Input type="number" value={bonusListaTrace} onChange={e => setBonusListaTrace(e.target.value)} placeholder="0,00" className="h-7 text-[11px]" />,
              'Lista Trace R$',
              calc.bonusListaTraceTotal > 0 ? formatMoeda(calc.bonusListaTraceTotal) : undefined,
            )}
          </CollapsibleContent>
        </Collapsible>

        <Separator />

        {/* Descontos — collapsible */}
        <Collapsible>
          <CollapsibleTrigger className="flex items-center justify-between w-full group">
            <h4 className="text-[10px] font-bold text-muted-foreground uppercase">Descontos</h4>
            <CollapseIcon className="h-3.5 w-3.5 text-muted-foreground transition-transform group-data-[state=open]:rotate-180" />
          </CollapsibleTrigger>
          <CollapsibleContent className="space-y-1 pt-1">
            {compactRow(
              'Qualidade R$/@',
              <Input type="number" value={descontoQualidade} onChange={e => setDescontoQualidade(e.target.value)} placeholder="0,00" className="h-7 text-[11px]" />,
              'Qualidade R$',
              calc.descQualidadeTotal > 0 ? `-${formatMoeda(calc.descQualidadeTotal)}` : undefined,
              'text-destructive',
            )}
            {compactRow(
              'Funrural %',
              <Input type="number" value={funruralPct} onChange={e => setFunruralPct(e.target.value)} placeholder="0,00" className="h-7 text-[11px]" step="0.01" />,
              'Funrural R$',
              calc.descFunruralTotal > 0 ? `-${formatMoeda(calc.descFunruralTotal)}` : undefined,
              'text-destructive',
            )}
            {compactRow(
              'Outros R$',
              <Input type="number" value={outrosDescontos} onChange={e => setOutrosDescontos(e.target.value)} placeholder="0,00" className="h-7 text-[11px]" />,
              'Outros R$',
              Number(outrosDescontos) > 0 ? `-${formatMoeda(Number(outrosDescontos))}` : undefined,
              'text-destructive',
            )}
          </CollapsibleContent>
        </Collapsible>

        <Separator />

        {/* Resultado Final — collapsible */}
        <Collapsible>
          <CollapsibleTrigger className="flex items-center justify-between w-full group">
            <h4 className="text-[10px] font-bold text-muted-foreground uppercase">Resultado Final</h4>
            <CollapseIcon className="h-3.5 w-3.5 text-muted-foreground transition-transform group-data-[state=open]:rotate-180" />
          </CollapsibleTrigger>
          <CollapsibleContent className="space-y-1 pt-1">
            <div className="flex justify-between items-center text-[12px]">
              <span className="text-muted-foreground font-semibold">Valor Líquido Total</span>
              <strong className={calc.valorLiquido > 0 ? 'text-primary' : 'text-muted-foreground'}>{calc.valorLiquido > 0 ? formatMoeda(calc.valorLiquido) : '-'}</strong>
            </div>
            {calc.liqArroba > 0 && (
              <div className="flex justify-between text-[10px]">
                <span className="text-muted-foreground">Líquido R$/@</span>
                <span className="font-semibold">{formatMoeda(calc.liqArroba)}</span>
              </div>
            )}

            {/* Resultado Esperado — summary block */}
            {calc.valorLiquido > 0 && Number(quantidade) > 0 && (
              <>
                <Separator className="my-1" />
                <h4 className="text-[10px] font-bold text-muted-foreground uppercase">Resultado Esperado</h4>
                <div className="bg-muted/30 rounded-md p-2 space-y-0.5 text-[10px]">
                  <div className="flex justify-between"><span className="text-muted-foreground">Total</span><span className="font-semibold">{fmt(Number(quantidade), 0)} {categoria ? CATEGORIAS.find(c => c.value === categoria)?.label?.toLowerCase() || 'cab.' : 'cab.'}</span></div>
                  <div className="flex justify-between"><span className="text-muted-foreground">Peso médio</span><span className="font-semibold">{fmt(Number(pesoKg))} kg</span></div>
                  {Number(rendCarcaca) > 0 && (
                    <div className="flex justify-between"><span className="text-muted-foreground">Rendimento</span><span className="font-semibold">{fmt(Number(rendCarcaca), 2)}%</span></div>
                  )}
                  {calc.pesoArroba > 0 && (
                    <div className="flex justify-between"><span className="text-muted-foreground">Arrobas</span><span className="font-semibold">{fmt(calc.pesoArroba)} @ / cab</span></div>
                  )}
                  {calc.totalArrobas > 0 && (
                    <div className="flex justify-between"><span className="text-muted-foreground">Total arrobas</span><span className="font-semibold">{fmt(calc.totalArrobas)} @</span></div>
                  )}
                  {Number(precoArroba) > 0 && (
                    <div className="flex justify-between"><span className="text-muted-foreground">Preço venda</span><span className="font-semibold">{formatMoeda(Number(precoArroba))}</span></div>
                  )}
                  <Separator className="my-1" />
                  <div className="flex justify-between"><span className="text-muted-foreground">Preço líquido R$/@</span><span className="font-semibold">{formatMoeda(calc.liqArroba)}</span></div>
                  <div className="flex justify-between font-bold text-[11px]"><span>Valor líquido total</span><span className="text-primary">{formatMoeda(calc.valorLiquido)}</span></div>
                  <Separator className="my-1" />
                  <div className="flex justify-between"><span className="text-muted-foreground">R$/@ líq</span><span className="font-semibold">{formatMoeda(calc.liqArroba)}</span></div>
                  <div className="flex justify-between"><span className="text-muted-foreground">R$/cab líq</span><span className="font-semibold">{formatMoeda(calc.liqCabeca)}</span></div>
                  <div className="flex justify-between"><span className="text-muted-foreground">R$/kg vivo líq</span><span className="font-semibold">{formatMoeda(calc.liqKg)}</span></div>
                </div>
              </>
            )}
          </CollapsibleContent>
        </Collapsible>

        {/* Informações de Pagamento - for Confirmado and Realizado */}
        {(isConfirmado || isConciliado) && (
          <AbateFinanceiroPanel
            quantidade={Number(quantidade) || 0}
            categoria={categoria}
            data={data}
            valorLiquido={calc.valorLiquido}
            frigorifico={fazendaDestino}
            notaFiscal={notaFiscal}
            onNotaFiscalChange={setNotaFiscal}
            lancamentoId={editingAbateId || lastSavedLancamentoId || undefined}
            mode={editingAbateId ? 'update' : 'create'}
            onFinanceiroUpdated={() => {}}
          />
        )}
      </div>
    );
  };

  // ===== FINANCIAL DETAILS PANEL (right column — non-abate) =====
  const renderFinancialPanel = () => {
    // For abate, use dedicated panel
    if (isAbate) return renderAbateFinancialPanel();

    return (
    <div className="bg-card rounded-md border shadow-sm p-3 space-y-2 self-start">
      <h3 className="text-[11px] font-bold uppercase text-muted-foreground tracking-wide">Detalhes Financeiros</h3>
      <Separator />

      {/* Nascimento: sem impacto financeiro */}
      {aba === 'entrada' && tipo === 'nascimento' ? (
        <div className="flex gap-2 items-start py-1">
          <Info className="h-4 w-4 text-muted-foreground shrink-0 mt-0.5" />
          <div className="text-[11px] text-muted-foreground leading-relaxed">
            <p className="font-semibold mb-1">Nascimento não possui impacto financeiro direto.</p>
            <ul className="space-y-0.5 list-disc list-inside text-[10px]">
              <li>Não gera entrada ou saída de caixa</li>
              <li>Não utiliza nota fiscal</li>
              <li>Não possui valor da operação</li>
              <li>Não possui ajustes financeiros</li>
            </ul>
          </div>
        </div>
      ) : (
      <>

      {/* Extra dates */}
      {showExtraDates && (
        <div className="space-y-1.5">
          <h4 className="text-[10px] font-bold text-muted-foreground uppercase">Datas da Operação</h4>
          <div className="space-y-1.5">
            <div>
              <Label className="text-[11px]">Data da Venda</Label>
              <Input type="date" value={dataVenda} onChange={e => setDataVenda(e.target.value)} className="h-8 text-[12px]" />
            </div>
            <div>
              <Label className="text-[11px]">Data Embarque</Label>
              <Input type="date" value={dataEmbarque} onChange={e => setDataEmbarque(e.target.value)} className="h-8 text-[12px]" />
            </div>
          </div>
          <Separator />
        </div>
      )}

      <div>
        <Label className="text-[11px]">Nota Fiscal</Label>
        <Input value={notaFiscal} onChange={e => setNotaFiscal(e.target.value)} placeholder="Nº da nota" className="h-8 text-[12px]" />
      </div>

      <Separator />
      <h4 className="text-[10px] font-bold text-muted-foreground uppercase">Valor da Operação</h4>

      {usaPrecoKg && (
        <div>
          <Label className={`text-[11px] ${previstoLabelClass}`}>R$/kg (preço base)</Label>
          <Input type="number" value={precoKg} onChange={e => setPrecoKg(e.target.value)} placeholder="0,00" className={`h-8 text-[12px] ${previstoInputClass}`} />
        </div>
      )}

      {calc.valorBruto > 0 && (
        <div className={`rounded-md p-2 text-[12px] ${isPrevisto ? 'bg-orange-100 dark:bg-orange-950/30' : 'bg-muted/30'}`}>
          <div className="flex justify-between">
            <span className={isPrevisto ? 'text-orange-700 dark:text-orange-400' : 'text-muted-foreground'}>Valor total bruto</span>
            <strong className={isPrevisto ? 'text-orange-800 dark:text-orange-300' : ''}>{formatMoeda(calc.valorBruto)}</strong>
          </div>
        </div>
      )}

      {/* Forma de Pagamento */}
      {showFormaPagamento && calc.valorBruto > 0 && (
        <>
          <Separator />
          <h4 className="text-[10px] font-bold text-muted-foreground uppercase">
            {isCompra ? 'Forma de Pagamento' : 'Forma de Recebimento'}
          </h4>
          <div className="grid grid-cols-2 gap-1.5">
            <button type="button" onClick={() => { setFormaPagamento('avista'); setParcelas([]); }}
              className={`h-8 rounded text-[12px] font-bold border-2 transition-all ${formaPagamento === 'avista' ? 'border-primary bg-primary/10' : 'border-border text-muted-foreground'}`}>
              À vista
            </button>
            <button type="button" onClick={() => { setFormaPagamento('parcelado'); handleQtdParcelasChange(qtdParcelas); }}
              className={`h-8 rounded text-[12px] font-bold border-2 transition-all ${formaPagamento === 'parcelado' ? 'border-primary bg-primary/10' : 'border-border text-muted-foreground'}`}>
              A prazo
            </button>
          </div>
          {formaPagamento === 'parcelado' && (
            <div className="space-y-1.5">
              <div>
                <Label className="text-[11px]">Quantidade de parcelas</Label>
                <Input type="number" min="1" max="48" value={qtdParcelas} onChange={e => handleQtdParcelasChange(e.target.value)} className="h-8 text-[12px]" />
              </div>
              {parcelas.map((p, i) => (
                <div key={i} className="grid grid-cols-2 gap-1.5 bg-muted/30 rounded p-1.5">
                  <div>
                    <Label className="text-[10px]">Parcela {i + 1} - Data</Label>
                    <Input type="date" value={p.data} onChange={e => { const np = [...parcelas]; np[i] = { ...np[i], data: e.target.value }; setParcelas(np); }} className="h-7 text-[11px]" />
                  </div>
                  <div>
                    <Label className="text-[10px]">Valor (R$)</Label>
                    <Input type="number" value={String(p.valor)} onChange={e => { const np = [...parcelas]; np[i] = { ...np[i], valor: Number(e.target.value) || 0 }; setParcelas(np); }} className="h-7 text-[11px]" />
                  </div>
                </div>
              ))}
              {parcelas.length > 0 && (
                <div className="text-[10px] text-muted-foreground text-right">
                  Soma parcelas: {formatMoeda(parcelas.reduce((s, p) => s + p.valor, 0))}
                </div>
              )}
            </div>
          )}
        </>
      )}

      {/* Bonus/Descontos (non-abate) */}
      <Separator />
      <h4 className="text-[10px] font-bold text-muted-foreground uppercase">Ajustes (R$)</h4>
      <div className="space-y-1.5">
        <div><Label className="text-[11px]">Bônus</Label><Input type="number" value={bonus} onChange={e => setBonus(e.target.value)} placeholder="0" className={`h-8 text-[12px] ${previstoInputClass}`} /></div>
        <div><Label className="text-[11px]">Descontos</Label><Input type="number" value={descontos} onChange={e => setDescontos(e.target.value)} placeholder="0" className={`h-8 text-[12px] ${previstoInputClass}`} /></div>
      </div>

      {/* Valor líquido override */}
      <Separator />
      <div>
        <Label className={`text-[11px] font-semibold ${previstoLabelClass || 'text-foreground'}`}>Valor total líquido (R$)</Label>
        <Input
          type="number"
          value={calc.valorLiquido > 0 ? String(Math.round(calc.valorLiquido * 100) / 100) : ''}
          onChange={e => {
            const vt = parseFloat(e.target.value);
            if (!isNaN(vt)) {
              const totalBon = (Number(bonus) || 0);
              const totalDesc = (Number(descontos) || 0);
              const freteVal = Number(frete) || 0;
              const outVal = Number(outrasDespesas) || 0;
              const brutoNecessario = vt - totalBon + totalDesc + freteVal + outVal;
              if (usaPrecoKg && calc.totalKg > 0) { setPrecoKg(String((brutoNecessario / calc.totalKg).toFixed(4))); }
            }
          }}
          placeholder="Informe o valor total líquido"
          className={`h-8 text-[12px] font-bold ${previstoInputClass}`}
        />
        <p className="text-[10px] text-muted-foreground mt-0.5">Retro-calcula o preço base automaticamente</p>
      </div>

      {/* Comissão/Frete/Despesas */}
      {(showComissaoFreteDespesas || showComissaoPrevConf) && (
        <>
          <Separator />
          <h4 className="text-[10px] font-bold text-muted-foreground uppercase">Despesas Operacionais</h4>
          <div className="space-y-1.5">
            <div><Label className="text-[11px]">Comissão (%)</Label><Input type="number" value={comissaoPct} onChange={e => setComissaoPct(e.target.value)} placeholder="0" className={`h-8 text-[12px] ${previstoInputClass}`} /></div>
            <div><Label className="text-[11px]">Frete (R$)</Label><Input type="number" value={frete} onChange={e => setFrete(e.target.value)} placeholder="0" className={`h-8 text-[12px] ${previstoInputClass}`} /></div>
            <div><Label className="text-[11px]">Outras (R$)</Label><Input type="number" value={outrasDespesas} onChange={e => setOutrasDespesas(e.target.value)} placeholder="0" className={`h-8 text-[12px] ${previstoInputClass}`} /></div>
          </div>
        </>
      )}

      {/* Final value */}
      {calc.valorBruto > 0 && (
        <div className={`rounded-md p-2 ${isPrevisto ? 'bg-orange-200/50 dark:bg-orange-950/50' : 'bg-primary/10'}`}>
          <div className="flex justify-between text-[12px] font-bold">
            <span className={isPrevisto ? 'text-orange-800 dark:text-orange-300' : ''}>Valor líquido final</span>
            <span className={isPrevisto ? 'text-orange-800 dark:text-orange-300' : 'text-primary'}>{formatMoeda(calc.valorLiquido)}</span>
          </div>
          {calc.liqCabeca > 0 && (
            <div className="flex justify-between text-[11px] mt-0.5">
              <span className="text-muted-foreground">Líq/Cabeça</span>
              <strong>{formatMoeda(calc.liqCabeca)}</strong>
            </div>
          )}
          {calc.liqKg > 0 && (
            <div className="flex justify-between text-[11px] mt-0.5">
              <span className="text-muted-foreground">R$/Kg líq</span>
              <strong>{formatMoeda(calc.liqKg)}</strong>
            </div>
          )}
        </div>
      )}
      </>
      )}
    </div>
    );
  };

  const currentTipoConfig = [...TIPOS_ENTRADA, ...TIPOS_SAIDA].find(t => t.value === tipo);
  const currentTipoLabel = currentTipoConfig?.label || tipo;
  const currentTipoIcon = currentTipoConfig?.icon || '';

  // ===== MAIN FORM (center) =====
  const renderForm = () => (
    <form onSubmit={handleSubmit} className={`flex-1 bg-card rounded-md p-3 shadow-sm border space-y-2 self-start ${editingAbateId ? 'ring-2 ring-primary' : ''}`}>

      {/* Editing banner */}
      {editingAbateId && (
        <div className="bg-primary/10 border border-primary/30 rounded-md px-3 py-1.5 text-[11px] font-bold text-primary">
          Editando abate #{editingAbateId.slice(0, 8)}
        </div>
      )}

      {/* Título da movimentação */}
      <div className="flex items-center gap-2">
        <span className="text-base">{currentTipoIcon}</span>
        <h2 className="text-[15px] font-semibold text-foreground">{editingAbateId ? 'Editar Abate' : currentTipoLabel}</h2>
      </div>

      {/* STATUS — selection + dynamic explanation */}
      <div className="space-y-1">
        <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wide">Status</span>
        {/* Row 1: selection cards */}
        <div className="grid grid-cols-3 gap-1.5">
          {([
            { value: 'conciliado' as StatusOperacional, label: 'Realizado', dot: 'bg-green-600', activeBorder: 'border-green-400', activeBg: 'bg-green-50 dark:bg-green-950/30' },
            { value: 'confirmado' as StatusOperacional, label: 'Confirmado', dot: 'bg-blue-500', activeBorder: 'border-blue-400', activeBg: 'bg-blue-50 dark:bg-blue-950/30' },
            { value: 'previsto' as StatusOperacional, label: 'Previsto', dot: 'bg-orange-500', activeBorder: 'border-orange-400', activeBg: 'bg-orange-50 dark:bg-orange-950/30' },
          ]).map(s => {
            const selected = statusOp === s.value;
            return (
              <button
                key={s.value}
                type="button"
                onClick={() => setStatusOp(s.value)}
                className={`flex items-center justify-center gap-1.5 h-8 rounded-md border transition-all ${
                  selected ? `${s.activeBg} ${s.activeBorder}` : 'border-border bg-muted/10 hover:bg-muted/30'
                }`}
              >
                <span className={`w-2 h-2 rounded-full shrink-0 ${selected ? s.dot : 'border border-muted-foreground/40 bg-transparent'}`} />
                <span className={`text-[11px] font-bold ${selected ? 'text-foreground' : 'text-muted-foreground'}`}>{s.label}</span>
              </button>
            );
          })}
        </div>
        {/* Row 2: dynamic explanation card */}
        <div className={`rounded-md border px-3 py-1.5 text-[10px] leading-snug ${
          statusOp === 'conciliado' ? 'bg-green-50 dark:bg-green-950/20 border-green-300 dark:border-green-800 text-green-800 dark:text-green-300'
          : statusOp === 'previsto' ? 'bg-orange-50 dark:bg-orange-950/20 border-orange-300 dark:border-orange-800 text-orange-800 dark:text-orange-300'
          : 'bg-blue-50 dark:bg-blue-950/20 border-blue-300 dark:border-blue-800 text-blue-800 dark:text-blue-300'
        }`}>
           {getStatusDescription(tipo, statusOp)}
        </div>
      </div>

      <Separator />

      {/* Row 1: Data | Qtd | Peso | Categoria */}
      <div className="grid grid-cols-12 gap-2">
        <div className="col-span-3">
          <Label className={`font-bold text-[11px] ${previstoLabelClass}`}>{isAbate ? 'Data do Abate' : 'Data'}</Label>
          <Input type="date" value={data} onChange={e => setData(e.target.value)} className={`mt-0.5 h-8 text-[12px] ${previstoInputClass}`} />
        </div>
        <div className="col-span-2">
          <Label className={`font-bold text-[11px] ${previstoLabelClass}`}>Qtd. Cab.</Label>
          <Input type="text" inputMode="numeric" value={qtdInput.displayValue} onChange={qtdInput.onChange} onBlur={qtdInput.onBlur} onFocus={qtdInput.onFocus} placeholder="0" className={`mt-0.5 h-8 text-[12px] text-center font-bold ${previstoInputClass}`} />
        </div>
        <div className="col-span-3">
          <Label className={`font-bold text-[11px] ${previstoLabelClass}`}>Peso (kg)</Label>
          <Input type="text" inputMode="decimal" value={pesoInput.displayValue} onChange={pesoInput.onChange} onBlur={pesoInput.onBlur} onFocus={pesoInput.onFocus} placeholder="0,00" className={`mt-0.5 h-8 text-[12px] ${previstoInputClass}`} />
          {pesoKg && Number(pesoKg) > 0 && !isAbate && !isNascimento && (
            <p className="text-[9px] text-muted-foreground mt-0.5">≈ {kgToArrobas(Number(pesoKg))} @</p>
          )}
        </div>
        <div className="col-span-4">
          <Label className="font-bold text-[11px]">Categoria</Label>
          <Select value={categoria} onValueChange={v => setCategoria(v as Categoria)}>
            <SelectTrigger className="mt-0.5 h-8 text-[12px]"><SelectValue placeholder="Selecione..." /></SelectTrigger>
            <SelectContent className="max-h-52 overflow-y-auto">
              {categoriasDisponiveis.map(c => <SelectItem key={c.value} value={c.value} className="text-[12px] py-1.5">{c.label}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Motivo da Morte */}
      {isMorte && (
        <div>
          <Label className="font-bold text-[11px]">Motivo da Morte</Label>
          <Select value={motivoMorte} onValueChange={setMotivoMorte}>
            <SelectTrigger className="mt-0.5 h-8 text-[12px]"><SelectValue placeholder="Selecione o motivo" /></SelectTrigger>
            <SelectContent>
              {MOTIVOS_MORTE.map(m => <SelectItem key={m} value={m} className="text-[12px]">{m}</SelectItem>)}
              <SelectItem value="__custom__" className="text-[12px]">Outro (digitar)</SelectItem>
            </SelectContent>
          </Select>
          {motivoMorte === '__custom__' && (
            <Input value={motivoMorteCustom} onChange={e => setMotivoMorteCustom(e.target.value)} placeholder="Digite o motivo" className="mt-1 h-8 text-[12px]" />
          )}
        </div>
      )}

      {/* Row 2: Fazenda Origem / Destino + Observação */}
      {(campos.origem.show || campos.destino?.show) ? (
        <div className={`grid gap-2 ${campos.destino?.show ? 'grid-cols-3' : 'grid-cols-2'}`}>
          {campos.origem.show && (
            <div>
              <Label className="font-bold text-[11px]">{campos.origem.label}</Label>
              {campos.origem.auto ? (
                <Input value={campos.origem.value} readOnly className="mt-0.5 h-8 text-[12px] bg-muted cursor-not-allowed" />
              ) : (campos.origem as any).useSelect && outrasFazendas.length > 0 ? (
                <Select value={fazendaOrigem} onValueChange={setFazendaOrigem}>
                  <SelectTrigger className="mt-0.5 h-8 text-[12px]"><SelectValue placeholder="Selecione" /></SelectTrigger>
                  <SelectContent>{outrasFazendas.map(f => <SelectItem key={f.id} value={f.nome} className="text-[12px]">{f.nome}</SelectItem>)}</SelectContent>
                </Select>
              ) : (
                <Input value={fazendaOrigem} onChange={e => setFazendaOrigem(e.target.value)} placeholder="Ex: Faz. Boa Vista" className="mt-0.5 h-8 text-[12px]" />
              )}
            </div>
          )}
          {campos.destino?.show && (
            <div>
              <Label className="font-bold text-[11px]">{campos.destino.label}</Label>
              {campos.destino.auto ? (
                <Input value={campos.destino.value} readOnly className="mt-0.5 h-8 text-[12px] bg-muted cursor-not-allowed" />
              ) : (campos.destino as any).useSelect && outrasFazendas.length > 0 ? (
                <Select value={fazendaDestino} onValueChange={setFazendaDestino}>
                  <SelectTrigger className="mt-0.5 h-8 text-[12px]"><SelectValue placeholder="Selecione" /></SelectTrigger>
                  <SelectContent>{outrasFazendas.map(f => <SelectItem key={f.id} value={f.nome} className="text-[12px]">{f.nome}</SelectItem>)}</SelectContent>
                </Select>
              ) : (
                <Input value={fazendaDestino} onChange={e => setFazendaDestino(e.target.value)} placeholder={campos.destino.placeholder || 'Ex: Faz. Santa Cruz'} className="mt-0.5 h-8 text-[12px]" />
              )}
            </div>
          )}
          <div>
            <Label className="font-bold text-[11px]">Observação</Label>
            <Input value={observacao} onChange={e => setObservacao(e.target.value)} placeholder="Opcional" className="mt-0.5 h-8 text-[12px]" />
          </div>
        </div>
      ) : (
        <div>
          <Label className="font-bold text-[11px]">Observação</Label>
          <Input value={observacao} onChange={e => setObservacao(e.target.value)} placeholder="Observação opcional" className="mt-0.5 h-8 text-[12px]" />
        </div>
      )}

      {editingAbateId && (
        <Button type="button" variant="outline" className="w-full h-9 text-[12px] font-bold mb-1" size="sm" onClick={() => {
          setEditingAbateId(null);
          setQuantidade(''); setCategoria(''); setPesoKg('');
          setFazendaOrigem(''); setFazendaDestino('');
          setData(format(new Date(), 'yyyy-MM-dd'));
          setObservacao(''); setStatusOp('conciliado');
          resetFinancialFields();
        }}>
          Cancelar Edição
        </Button>
      )}
      <Button type="submit" className="w-full h-9 text-[12px] font-bold" size="sm">
        {editingAbateId ? 'Salvar Alterações' : (aba === 'entrada' ? 'Registrar Entrada' : 'Registrar Saída')}
      </Button>
    </form>
  );

  // ===== HISTORICO VIEW =====
  const renderHistorico = () => (
    <div className="flex-1 self-start">
      <div className="sticky top-0 z-20 bg-background border-b border-border/50 shadow-sm px-3 py-1.5 rounded-t-md">
        <div className="flex gap-1.5">
          <Select value={anoFiltro} onValueChange={setAnoFiltro}>
            <SelectTrigger className="h-8 text-[12px] font-bold w-24"><SelectValue placeholder="Ano" /></SelectTrigger>
            <SelectContent>{anosDisponiveis.map(a => <SelectItem key={a} value={a} className="text-[12px]">{a}</SelectItem>)}</SelectContent>
          </Select>
          <Select value={mesFiltro} onValueChange={setMesFiltro}>
            <SelectTrigger className="h-8 text-[12px] font-bold flex-1"><SelectValue placeholder="Mês" /></SelectTrigger>
            <SelectContent>{MESES.map(m => <SelectItem key={m.value} value={m.value} className="text-[12px]">{m.label}</SelectItem>)}</SelectContent>
          </Select>
        </div>
      </div>
      <div className="space-y-1.5 pt-1.5">
        {historicoFiltrado.length === 0 ? (
          <p className="text-center text-muted-foreground py-8 text-[12px]">Nenhum lançamento no período</p>
        ) : (
          historicoFiltrado.slice(0, 50).map(l => {
            const entrada = isEntrada(l.tipo);
            const reclass = isReclassificacao(l.tipo);
            const catLabel = CATEGORIAS.find(c => c.value === l.categoria)?.label;
            const catDestinoLabel = l.categoriaDestino ? CATEGORIAS.find(c => c.value === l.categoriaDestino)?.label : null;
            const tipoLabel = TODOS_TIPOS.find(t => t.value === l.tipo);
            return (
              <button key={l.id} onClick={() => setDetalheId(l.id)}
                className="w-full bg-card rounded-md p-2 border shadow-sm flex items-center gap-2 text-left hover:bg-muted/50 transition-colors">
                <div className="text-lg">{tipoLabel?.icon}</div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${entrada ? 'bg-success/20 text-success' : reclass ? 'bg-accent/20 text-accent-foreground' : 'bg-destructive/20 text-destructive'}`}>
                      {entrada ? '+' : reclass ? '↔' : '-'}{l.quantidade}
                    </span>
                    <span className="text-[12px] font-bold text-foreground truncate">{tipoLabel?.label}</span>
                  </div>
                  <p className="text-[10px] text-muted-foreground mt-0.5">
                    {catLabel}{catDestinoLabel ? ` → ${catDestinoLabel}` : ''} • {format(parseISO(l.data), 'dd/MM/yyyy', { locale: ptBR })}
                    {l.pesoMedioKg ? ` • ${l.pesoMedioKg}kg` : ''}
                    {l.valorTotal ? ` • ${formatMoeda(l.valorTotal)}` : ''}
                  </p>
                </div>
                <div className="flex flex-col items-end gap-0.5 shrink-0">
                  {l.tipo === 'abate' && (l.statusOperacional === 'confirmado' || l.statusOperacional === 'conciliado') && (
                    <AbateExportDialog lancamento={l} fazendaNome={nomeFazenda} />
                  )}
                  {(() => {
                    const cfg = getStatusBadge(l);
                    return <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded ${cfg.cls}`}>{cfg.label}</span>;
                  })()}
                  <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
                </div>
              </button>
            );
          })
        )}
      </div>
    </div>
  );

  return (
    <div className="p-3 animate-fade-in pb-20">
      {onBackToConciliacao && (
        <button onClick={onBackToConciliacao} className="w-full flex items-center justify-center gap-1 text-[12px] font-bold text-primary bg-primary/10 rounded-md py-1.5 transition-colors hover:bg-primary/20 mb-2">
          <ArrowLeft className="h-3.5 w-3.5" /> {backLabel || 'Retornar à Conciliação de Categoria'}
        </button>
      )}

      {/* === 3-COLUMN DESKTOP GRID === */}
      <div className="grid grid-cols-[11rem_1fr_17rem] gap-3 items-start">
        {/* Left: Navigation sidebar */}
        {renderSidebar()}

        {/* Center: Form or Historico */}
        {aba === 'reclassificacao' ? (
          <div className="col-span-2 self-start">
            <ReclassificacaoForm onAdicionar={onAdicionar} dataInicial={dataInicial} />
          </div>
        ) : aba === 'historico' ? (
          <div className="col-span-2 self-start">{renderHistorico()}</div>
        ) : (
          <>
            {renderForm()}
            {isCompra ? (
              <CompraFinanceiroPanel
                ref={compraFinanceiroRef}
                quantidade={Number(quantidade) || 0}
                pesoKg={Number(pesoKg) || 0}
                data={data}
                categoria={categoria}
                statusOp={statusOp}
                fazendaOrigem={fazendaOrigem}
                notaFiscal={notaFiscal}
                onNotaFiscalChange={setNotaFiscal}
                lancamentoId={lastSavedLancamentoId || undefined}
              />
            ) : (
              renderFinancialPanel()
            )}
          </>
        )}
      </div>

      {lancamentoDetalhe && (
        <LancamentoDetalhe
          lancamento={lancamentoDetalhe}
          open={!!detalheId}
          onClose={() => setDetalheId(null)}
          onEditar={onEditar}
          onRemover={onRemover}
          onCountFinanceiros={onCountFinanceiros}
          onEditarAbate={loadAbateForEdit}
        />
      )}
    </div>
  );
}
