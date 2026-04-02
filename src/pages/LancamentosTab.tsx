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
import { Plus } from 'lucide-react';
import { Separator } from '@/components/ui/separator';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { format, parseISO, addDays } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { ChevronRight, ChevronDown, ArrowLeft, AlertTriangle, LogIn, LogOut, RefreshCw, Clock, Info } from 'lucide-react';
import { LancamentoDetalhe } from '@/components/LancamentoDetalhe';
import { ReclassificacaoForm } from '@/components/ReclassificacaoForm';
import { CompraDetalhesDialog, CompraDetalhes, EMPTY_COMPRA_DETALHES } from '@/components/compra/CompraDetalhesDialog';
import { CompraResumoPanel } from '@/components/compra/CompraResumoPanel';
import { gerarFinanceiroCompra } from '@/components/compra/gerarFinanceiroCompra';
import { AbateDetalhesDialog, AbateDetalhes, EMPTY_ABATE_DETALHES } from '@/components/abate/AbateDetalhesDialog';
import { AbateResumoPanel } from '@/components/abate/AbateResumoPanel';
import { AbateExportDialog } from '@/components/AbateExportMenu';
import { AbateFinanceiroPanel, AbateFinanceiroPanelRef } from '@/components/AbateFinanceiroPanel';
import { SearchableSelect } from '@/components/ui/searchable-select';
import { NovoFornecedorDialog } from '@/components/financeiro-v2/NovoFornecedorDialog';
import { supabase } from '@/integrations/supabase/client';
import { VendaFinanceiroPanel, VendaFinanceiroPanelRef } from '@/components/VendaFinanceiroPanel';
import { ConsumoFinanceiroPanel, ConsumoFinanceiroPanelRef } from '@/components/ConsumoFinanceiroPanel';
import { ConfirmacaoRegistroDialog } from '@/components/ConfirmacaoRegistroDialog';
import { useFazenda } from '@/contexts/FazendaContext';
import { useCliente } from '@/contexts/ClienteContext';
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
import { STATUS_LABEL, STATUS_OPTIONS, getStatusBadge, type StatusOperacional } from '@/lib/statusOperacional';

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
  previsto: 'Planejamento (meta). Alimenta o fluxo de caixa previsto, sem impacto no financeiro real.',
  confirmado: 'Operação já definida, ainda não executada. Quando concluída, alterar para Realizado.',
  conciliado: 'Operação já realizada. Impacta rebanho e financeiro real.',
};

const STATUS_DESCRIPTIONS_ABATE: Record<StatusOperacional, string> = {
  previsto: 'Planejamento (meta). Gera lançamentos previstos que alimentam o fluxo de caixa previsto.',
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
      return { origem: { show: false }, destino: { show: true, auto: true, value: nomeFazenda, label: 'Fazenda Destino' } };
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
  const { clienteAtual } = useCliente();
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
  // compraFinanceiroRef removed — compra now uses modal + direct generation
  const abateFinanceiroRef = useRef<AbateFinanceiroPanelRef>(null);
  const vendaFinanceiroRef = useRef<VendaFinanceiroPanelRef>(null);
  const consumoFinanceiroRef = useRef<ConsumoFinanceiroPanelRef>(null);
  const [anoFiltro, setAnoFiltro] = useState(String(new Date().getFullYear()));
  const [mesFiltro, setMesFiltro] = useState('todos');
  const [financeiroOpen, setFinanceiroOpen] = useState(false);
  const [statusOp, setStatusOp] = useState<StatusOperacional>('conciliado');
  const [confirmDialogOpen, setConfirmDialogOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [compraDetalhes, setCompraDetalhes] = useState<CompraDetalhes | null>(null);
  const [compraDialogOpen, setCompraDialogOpen] = useState(false);
  const [abateDetalhes, setAbateDetalhes] = useState<AbateDetalhes | null>(null);
  const [abateDialogOpen, setAbateDialogOpen] = useState(false);

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
  const [tipoPeso, setTipoPeso] = useState<string>('vivo');
  const [vendaTipoPreco, setVendaTipoPreco] = useState<string>('por_kg');
  const [vendaPrecoInput, setVendaPrecoInput] = useState('');
  const [rendCarcaca, setRendCarcaca] = useState('');
  const [funruralPct, setFunruralPct] = useState('');
  const [funruralReais, setFunruralReais] = useState('');

  const [dataVenda, setDataVenda] = useState('');
  const [dataEmbarque, setDataEmbarque] = useState('');
  const [dataAbate, setDataAbate] = useState('');
  const [tipoVenda, setTipoVenda] = useState('');

  // Abate fornecedor (frigorífico) state
  const [abateFornecedorId, setAbateFornecedorId] = useState('');
  const [abateFornecedores, setAbateFornecedores] = useState<{ id: string; nome: string }[]>([]);
  const [novoFornecedorAbateOpen, setNovoFornecedorAbateOpen] = useState(false);

  // Compra fornecedor state
  const [compraFornecedorId, setCompraFornecedorId] = useState('');
  const [novoFornecedorCompraOpen, setNovoFornecedorCompraOpen] = useState(false);

  // Venda destino fornecedor state
  const [vendaDestinoFornecedorId, setVendaDestinoFornecedorId] = useState('');
  const [novoFornecedorVendaOpen, setNovoFornecedorVendaOpen] = useState(false);

  const [formaPagamento, setFormaPagamento] = useState<'avista' | 'parcelado'>('avista');
  const [parcelas, setParcelas] = useState<Parcela[]>([]);
  const [qtdParcelas, setQtdParcelas] = useState('1');

  useEffect(() => {
    if (tipo === 'abate') {
      console.log('[ABATE_DEBUG] novoFornecedorAbateOpen=', novoFornecedorAbateOpen);
    }
  }, [novoFornecedorAbateOpen, tipo]);

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
  const isConsumo = tipo === 'consumo';
  const isTransferencia = tipo === 'transferencia_entrada' || tipo === 'transferencia_saida';
  const hasFinancialImpact = !isNascimento && !isMorte && !isTransferencia;

  const usaPrecoArroba = isAbate;
  const usaPrecoKg = !isAbate && !isNascimento;

  const categoriasDisponiveis = useMemo(() => {
    if (isNascimento) return CATEGORIAS.filter(c => c.value === 'mamotes_m' || c.value === 'mamotes_f');
    return CATEGORIAS;
  }, [isNascimento]);

  const calc = useMemo(() => {
    const qtd = Number(quantidade) || 0;
    const peso = Number(pesoKg) || 0;
    // For abate with modal detalhes, source from abateDetalhes
    const abRendCarcaca = isAbate && abateDetalhes ? Number(abateDetalhes.rendCarcaca) || 0 : Number(rendCarcaca) || 0;
    const abPrecoArroba = isAbate && abateDetalhes ? Number(abateDetalhes.precoArroba) || 0 : Number(precoArroba) || 0;
    const abBonusPrecoce = isAbate && abateDetalhes ? Number(abateDetalhes.bonusPrecoce) || 0 : Number(bonusPrecoce) || 0;
    const abBonusQualidade = isAbate && abateDetalhes ? Number(abateDetalhes.bonusQualidade) || 0 : Number(bonusQualidade) || 0;
    const abBonusListaTrace = isAbate && abateDetalhes ? Number(abateDetalhes.bonusListaTrace) || 0 : Number(bonusListaTrace) || 0;
    const abDescQualidade = isAbate && abateDetalhes ? Number(abateDetalhes.descontoQualidade) || 0 : Number(descontoQualidade) || 0;
    const abFunruralPct = isAbate && abateDetalhes ? Number(abateDetalhes.funruralPct) || 0 : Number(funruralPct) || 0;
    const abFunruralReais = isAbate && abateDetalhes ? Number(abateDetalhes.funruralReais) || 0 : Number(funruralReais) || 0;
    const abOutrosDescontos = isAbate && abateDetalhes ? Number(abateDetalhes.outrosDescontos) || 0 : Number(outrosDescontos) || 0;

    const rend = abRendCarcaca;
    const carcacaCalc = isAbate && rend > 0 ? peso * rend / 100 : Number(pesoCarcacaKg) || 0;
    let pesoArroba = 0;
    if (isAbate) { pesoArroba = carcacaCalc > 0 ? carcacaCalc / 15 : 0; }
    else { pesoArroba = peso > 0 ? peso / 30 : 0; }
    const totalArrobas = pesoArroba * qtd;
    const totalKg = peso * qtd;
    let valorBruto = 0;
    if (usaPrecoArroba) { valorBruto = totalArrobas * abPrecoArroba; }
    else if (isVenda) {
      const vi = Number(vendaPrecoInput) || 0;
      if (vendaTipoPreco === 'por_kg') { valorBruto = totalKg * vi; }
      else if (vendaTipoPreco === 'por_cab') { valorBruto = qtd * vi; }
      else if (vendaTipoPreco === 'por_total') { valorBruto = vi; }
    }
    else if (usaPrecoKg) { valorBruto = totalKg * (Number(precoKg) || 0); }
    const bonusPrecoceTotal = isAbate ? abBonusPrecoce * totalArrobas : 0;
    const bonusQualidadeTotal = isAbate ? abBonusQualidade * totalArrobas : 0;
    const bonusListaTraceTotal = isAbate ? abBonusListaTrace * totalArrobas : 0;
    const descQualidadeTotal = isAbate ? abDescQualidade * totalArrobas : (Number(descontoQualidade) || 0);
    const funruralReaisVal = abFunruralReais;
    const descFunruralTotal = (isAbate || isVenda)
      ? (funruralReaisVal > 0 ? funruralReaisVal : valorBruto * abFunruralPct / 100)
      : 0;
    const descOutrosTotal = (isAbate || isVenda) ? abOutrosDescontos : 0;
    const totalBonus = isAbate
      ? bonusPrecoceTotal + bonusQualidadeTotal + bonusListaTraceTotal
      : (Number(bonus) || 0);
    const totalDescontos = (isAbate || isVenda)
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
  }, [quantidade, pesoKg, pesoCarcacaKg, rendCarcaca, precoArroba, precoKg, bonusPrecoce, bonusQualidade, bonusListaTrace, descontoQualidade, funruralPct, funruralReais, outrosDescontos, bonus, descontos, comissaoPct, frete, outrasDespesas, isAbate, isVenda, usaPrecoArroba, usaPrecoKg, vendaTipoPreco, vendaPrecoInput]);

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
    setVendaTipoPreco('por_kg'); setVendaPrecoInput('');
    setDataVenda(''); setDataEmbarque(''); setDataAbate(''); setTipoVenda('');
    setAbateFornecedorId('');
    setCompraFornecedorId('');
    setVendaDestinoFornecedorId('');
    setFormaPagamento('avista'); setParcelas([]); setQtdParcelas('1');
    setMotivoMorte(''); setMotivoMorteCustom('');
    setRendCarcaca(''); setFunruralPct(''); setFunruralReais('');
  };

  const resetAllFields = () => {
    setQuantidade('');
    setCategoria('');
    setPesoKg('');
    setFazendaOrigem('');
    setFazendaDestino('');
    setData('');
    setStatusOp('conciliado');
    setLastSavedLancamentoId(null);
    setEditingAbateId(null);
    setDetalheId(null);
    setFinanceiroOpen(false);
    setCompraDetalhes(null);
    setCompraDialogOpen(false);
    setAbateDetalhes(null);
    setAbateDialogOpen(false);
    resetFinancialFields();
    vendaFinanceiroRef.current?.resetForm();
    consumoFinanceiroRef.current?.resetForm();
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

    // 7. Build abateDetalhes for new modal flow
    const rendCalc = l.pesoCarcacaKg && l.pesoMedioKg && l.pesoMedioKg > 0
      ? String(((l.pesoCarcacaKg / l.pesoMedioKg) * 100).toFixed(2)) : '';
    const funruralPctCalc = (() => {
      if (l.descontoFunrural && l.descontoFunrural > 0 && totalArrobas > 0 && l.precoArroba) {
        const vb = totalArrobas * l.precoArroba;
        return vb > 0 ? String(((l.descontoFunrural / vb) * 100).toFixed(2)) : '';
      }
      return '';
    })();

    setAbateDetalhes({
      dataVenda: l.dataVenda || '',
      dataEmbarque: l.dataEmbarque || '',
      dataAbate: l.dataAbate || l.data || '',
      tipoVenda: l.tipoVenda || '',
      tipoPeso: l.tipoPeso || 'vivo',
      rendCarcaca: rendCalc,
      precoArroba: l.precoArroba ? String(l.precoArroba) : '',
      bonusPrecoce: toArroba(l.bonusPrecoce),
      bonusQualidade: toArroba(l.bonusQualidade),
      bonusListaTrace: toArroba(l.bonusListaTrace),
      descontoQualidade: toArroba(l.descontoQualidade),
      funruralPct: funruralPctCalc,
      funruralReais: '',
      outrosDescontos: l.outrosDescontos ? String(l.outrosDescontos) : '',
      notaFiscal: l.notaFiscal || '',
      formaReceb: 'avista',
      qtdParcelas: '1',
      parcelas: [],
    });

    // 8. Set editing mode
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

  useEffect(() => {
    if (!clienteAtual?.id) {
      setAbateFornecedores([]);
      return;
    }

    let cancelled = false;

    supabase
      .from('financeiro_fornecedores')
      .select('id, nome')
      .eq('cliente_id', clienteAtual.id)
      .eq('ativo', true)
      .order('nome')
      .then(({ data, error }) => {
        if (cancelled) return;
        if (error) {
          console.error('Erro ao carregar fornecedores ativos', error);
          setAbateFornecedores([]);
          return;
        }

        setAbateFornecedores((data as { id: string; nome: string }[]) || []);
      });

    return () => {
      cancelled = true;
    };
  }, [clienteAtual?.id]);

  // Validate form and open confirmation dialog
  const handleRequestRegister = () => {
    if (!quantidade || Number(quantidade) <= 0) { toast.error('Informe a quantidade'); return; }
    if (!categoria) { toast.error('Selecione a categoria'); return; }
    if (!data) { toast.error('Informe a data'); return; }

    if (isAbate) {
      if (!abateFornecedorId) { toast.error('Selecione o Frigorífico (Fornecedor) para continuar'); return; }
      if (!abateDetalhes) { toast.error('Clique em "Completar Abate" para preencher os detalhes financeiros'); return; }
    }
    if (aba === 'saida' && !isAbate && !isMorte) {
      if (campos.destino?.show && !campos.destino.auto && !fazendaDestino) { toast.error('Informe o Destino'); return; }
    }
    if (!pesoKg || Number(pesoKg) <= 0) { toast.error('Informe o Peso (kg)'); return; }

    if (isCompra) {
      if (!compraFornecedorId) { toast.error('Selecione o fornecedor para continuar'); return; }
      if (!compraDetalhes) { toast.error('Clique em "Completar Compra" para preencher os detalhes financeiros'); return; }
      const valorBase = (() => {
        const totalKg = (Number(quantidade) || 0) * (Number(pesoKg) || 0);
        if (compraDetalhes.tipoPreco === 'por_kg') return totalKg * (Number(compraDetalhes.precoKg) || 0);
        if (compraDetalhes.tipoPreco === 'por_cab') return (Number(quantidade) || 0) * (Number(compraDetalhes.precoCab) || 0);
        return Number(compraDetalhes.valorTotal) || 0;
      })();
      if ((statusOp === 'confirmado' || statusOp === 'conciliado') && valorBase <= 0) {
        toast.error('Preencha o preço base antes de registrar a compra.');
        return;
      }
    }

    setConfirmDialogOpen(true);
  };

  const handleSubmit = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();

    const origemFinal = campos.origem.show
      ? (campos.origem.auto ? campos.origem.value : fazendaOrigem) || undefined
      : undefined;
    let destinoFinal = campos.destino?.show
      ? (campos.destino.auto ? campos.destino.value : fazendaDestino) || undefined
      : undefined;

    // For abate, use fornecedor name as destino
    if (isAbate && abateFornecedorId) {
      const forn = abateFornecedores.find(f => f.id === abateFornecedorId);
      if (forn) destinoFinal = forn.nome;
    }

    if (isMorte) {
      destinoFinal = motivoMorte === '__custom__' ? motivoMorteCustom : motivoMorte || undefined;
    }

    const valorTotalFinal = calc.valorLiquido > 0 ? calc.valorLiquido : undefined;

    const abateDataVenda = isAbate ? (abateDetalhes?.dataVenda || dataVenda || format(new Date(), 'yyyy-MM-dd')) : (dataVenda || undefined);
    const abateDataEmbarque = isAbate && data ? format(addDays(parseISO(data), -1), 'yyyy-MM-dd') : (dataEmbarque || undefined);
    const abateDataAbate = isAbate ? data : (dataAbate || undefined);
    const abTipoPeso = isAbate && abateDetalhes ? abateDetalhes.tipoPeso : tipoPeso;
    const abTipoVenda = isAbate && abateDetalhes ? abateDetalhes.tipoVenda : tipoVenda;
    const abNotaFiscal = isAbate && abateDetalhes ? abateDetalhes.notaFiscal : notaFiscal;

    const lancamentoDados: Partial<Omit<Lancamento, 'id'>> = {
      data, tipo, quantidade: Number(quantidade), categoria: categoria as Categoria,
      fazendaOrigem: origemFinal, fazendaDestino: destinoFinal,
      pesoMedioKg: pesoKg ? Number(pesoKg) : undefined,
      pesoMedioArrobas: pesoKg ? kgToArrobas(Number(pesoKg)) : undefined,
      observacao: observacao || undefined,
      pesoCarcacaKg: isAbate ? (calc.carcacaCalc > 0 ? calc.carcacaCalc : undefined) : numOrUndef(pesoCarcacaKg),
      precoArroba: isAbate && abateDetalhes ? (Number(abateDetalhes.precoArroba) || undefined) : (numOrUndef(precoArroba) || undefined),
      bonusPrecoce: isAbate ? (calc.bonusPrecoceTotal > 0 ? calc.bonusPrecoceTotal : undefined) : numOrUndef(bonusPrecoce),
      bonusQualidade: isAbate ? (calc.bonusQualidadeTotal > 0 ? calc.bonusQualidadeTotal : undefined) : numOrUndef(bonusQualidade),
      bonusListaTrace: isAbate ? (calc.bonusListaTraceTotal > 0 ? calc.bonusListaTraceTotal : undefined) : numOrUndef(bonusListaTrace),
      descontoQualidade: (isAbate || isVenda) ? (calc.descQualidadeTotal > 0 ? calc.descQualidadeTotal : undefined) : numOrUndef(descontoQualidade),
      descontoFunrural: (isAbate || isVenda) ? (calc.descFunruralTotal > 0 ? calc.descFunruralTotal : undefined) : numOrUndef(descontoFunrural),
      outrosDescontos: (isAbate || isVenda) ? (calc.descOutrosTotal > 0 ? calc.descOutrosTotal : undefined) : numOrUndef(outrosDescontos),
      acrescimos: numOrUndef(bonus),
      deducoes: numOrUndef(descontos),
      valorTotal: valorTotalFinal,
      notaFiscal: abNotaFiscal || undefined,
      tipoPeso: abTipoPeso,
      statusOperacional: statusOp,
      dataVenda: abateDataVenda || undefined,
      dataEmbarque: abateDataEmbarque || undefined,
      dataAbate: abateDataAbate || undefined,
      tipoVenda: abTipoVenda || undefined,
    };

    setSubmitting(true);
    try {
      if (editingAbateId) {
        onEditar(editingAbateId, lancamentoDados);
        if (isAbate && (isConciliado || isConfirmado || isPrevisto)) {
          // Auto-generate/update financeiro for abate
          if (abateFinanceiroRef.current) {
            await abateFinanceiroRef.current.generateFinanceiro(editingAbateId);
          }
          setEditingAbateId(null);
          setLastSavedLancamentoId(null);
          setQuantidade(''); setCategoria(''); setPesoKg('');
          setFazendaOrigem(''); setFazendaDestino('');
          setData(format(new Date(), 'yyyy-MM-dd'));
          setObservacao(''); setStatusOp('conciliado');
          resetFinancialFields();
          toast.success('Abate atualizado com financeiro!');
        } else {
          setEditingAbateId(null);
          setLastSavedLancamentoId(null);
          setQuantidade(''); setCategoria(''); setPesoKg('');
          setFazendaOrigem(''); setFazendaDestino('');
          setData(format(new Date(), 'yyyy-MM-dd'));
          setObservacao(''); setStatusOp('conciliado');
          resetFinancialFields();
          toast.success('Registro atualizado com sucesso!');
        }
      } else {
        const returnedId = await onAdicionar(lancamentoDados as Omit<Lancamento, 'id'>);

        if (isCompra && returnedId) {
          if (compraDetalhes && fazendaAtual && clienteAtual) {
            await gerarFinanceiroCompra({
              compraDetalhes,
              lancamentoId: returnedId,
              clienteId: clienteAtual.id,
              fazendaId: fazendaAtual.id,
              quantidade: Number(quantidade) || 0,
              pesoKg: Number(pesoKg) || 0,
              data,
              categoria,
              statusOp,
              fazendaOrigem,
              fornecedorId: compraFornecedorId,
            });
          }
          setCompraDetalhes(null);
          setLastSavedLancamentoId(null);
          setQuantidade(''); setCategoria(''); setPesoKg('');
          setFazendaOrigem(''); setFazendaDestino('');
          setData(format(new Date(), 'yyyy-MM-dd'));
          setObservacao(''); setStatusOp('conciliado');
          resetFinancialFields();
          toast.success('Compra registrada com sucesso!');
        } else if (isAbate && (isConciliado || isConfirmado || isPrevisto) && returnedId) {
          // Auto-generate financeiro for abate (like Compras)
          if (abateFinanceiroRef.current) {
            await abateFinanceiroRef.current.generateFinanceiro(returnedId);
          }
          setLastSavedLancamentoId(null);
          setQuantidade(''); setCategoria(''); setPesoKg('');
          setFazendaOrigem(''); setFazendaDestino('');
          setData(format(new Date(), 'yyyy-MM-dd'));
          setObservacao(''); setStatusOp('conciliado');
          resetFinancialFields();
          toast.success('Abate registrado com financeiro!');
        } else if (isVenda && returnedId) {
          if (vendaFinanceiroRef.current && calc.valorLiquido > 0) {
            await vendaFinanceiroRef.current.generateFinanceiro(returnedId);
          }
          vendaFinanceiroRef.current?.resetForm();
          setLastSavedLancamentoId(null);
          setQuantidade(''); setCategoria(''); setPesoKg('');
          setFazendaOrigem(''); setFazendaDestino('');
          setData(format(new Date(), 'yyyy-MM-dd'));
          setObservacao(''); setStatusOp('conciliado');
          resetFinancialFields();
          toast.success('Venda registrada com sucesso!');
        } else if (isConsumo && returnedId) {
          if (consumoFinanceiroRef.current && calc.valorLiquido > 0) {
            await consumoFinanceiroRef.current.generateFinanceiro(returnedId);
          }
          consumoFinanceiroRef.current?.resetForm();
          setLastSavedLancamentoId(null);
          setQuantidade(''); setCategoria(''); setPesoKg('');
          setFazendaOrigem(''); setFazendaDestino('');
          setData(format(new Date(), 'yyyy-MM-dd'));
          setObservacao(''); setStatusOp('conciliado');
          resetFinancialFields();
          toast.success('Consumo registrado com sucesso!');
        } else {
          setLastSavedLancamentoId(null);
          setQuantidade(''); setCategoria('');
          setPesoKg(tipo === 'nascimento' ? '30' : '');
          setFazendaOrigem(''); setFazendaDestino('');
          setData(format(new Date(), 'yyyy-MM-dd'));
          setObservacao(''); setStatusOp('conciliado');
          resetFinancialFields();
          toast.success('Lançamento registrado!');
        }
      }
    } finally {
      setSubmitting(false);
      setConfirmDialogOpen(false);
    }
  };

  // Build confirmation dialog data
  const getOperationLabel = () => {
    if (isCompra) return 'Compra';
    if (isAbate) return 'Abate';
    if (isVenda) return 'Venda em Pé';
    const cfg = [...TIPOS_ENTRADA, ...TIPOS_SAIDA].find(t => t.value === tipo);
    return cfg?.label || tipo;
  };

  const getConfirmacaoFinanceiros = () => {
    const label = getOperationLabel();
    const result: any = { tipoOperacao: label };
    
    if (isAbate) {
      const forn = abateFornecedores.find(f => f.id === abateFornecedorId);
      result.fornecedorOuFrigorifico = forn?.nome || '';
      result.comercializacao = tipoVenda;
      result.tipoAbate = tipoPeso;
      result.rendCarcaca = Number(rendCarcaca) || 0;
      result.totalArrobas = calc.totalArrobas;
      result.precoBase = Number(precoArroba) || 0;
      result.precoBaseLabel = 'R$/@';
      result.totalBruto = calc.valorBruto;
      result.totalBonus = calc.totalBonus;
      result.totalDescontos = calc.totalDescontos;
      result.valorLiquido = calc.valorLiquido;
      result.dataVenda = dataVenda || format(new Date(), 'yyyy-MM-dd');
      if (formaPagamento === 'parcelado' && parcelas.length > 0) {
        result.formaPagamento = `A prazo (${parcelas.length}x)`;
        result.parcelas = parcelas;
      } else {
        result.formaPagamento = 'À vista';
      }
    } else if (isCompra && compraDetalhes) {
      const totalKgC = (Number(quantidade) || 0) * (Number(pesoKg) || 0);
      let valorBase = 0;
      if (compraDetalhes.tipoPreco === 'por_kg') valorBase = totalKgC * (Number(compraDetalhes.precoKg) || 0);
      else if (compraDetalhes.tipoPreco === 'por_cab') valorBase = (Number(quantidade) || 0) * (Number(compraDetalhes.precoCab) || 0);
      else valorBase = Number(compraDetalhes.valorTotal) || 0;
      const tipoPrecoLabel = compraDetalhes.tipoPreco === 'por_kg' ? 'R$/kg' : compraDetalhes.tipoPreco === 'por_cab' ? 'R$/cab' : 'Total';
      result.precoBase = valorBase;
      result.precoBaseLabel = tipoPrecoLabel;
      result.totalBruto = valorBase;
      result.valorLiquido = valorBase;
      result.fornecedorOuFrigorifico = abateFornecedores.find(f => f.id === compraFornecedorId)?.nome || '';
      if (compraDetalhes.formaPag === 'prazo' && compraDetalhes.parcelas.length > 0) {
        result.formaPagamento = `A prazo (${compraDetalhes.parcelas.length}x)`;
        result.parcelas = compraDetalhes.parcelas;
      } else {
        result.formaPagamento = 'À vista';
      }
    } else {
      result.precoBase = Number(precoKg) || 0;
      result.precoBaseLabel = 'R$/kg';
      result.totalBruto = calc.valorBruto;
      result.totalBonus = isVenda ? 0 : (Number(bonus) || 0);
      result.totalDescontos = isVenda ? calc.totalDescontos : (Number(descontos) || 0);
      result.valorLiquido = calc.valorLiquido;
      if (formaPagamento === 'parcelado' && parcelas.length > 0) {
        result.formaPagamento = `A prazo (${parcelas.length}x)`;
        result.parcelas = parcelas;
      } else {
        result.formaPagamento = 'À vista';
      }
    }
    return result;
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
              <button key={a.id} onClick={() => { const t = a.id === 'entrada' ? 'nascimento' : 'abate'; setAba(a.id); setTipo(t as TipoMovimentacao); resetAllFields(); }}
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
          <button onClick={() => { setAba('entrada'); setTipo('nascimento'); resetAllFields(); }} className={parentCls(aba === 'entrada')}>
            <LogIn className="h-3.5 w-3.5" /> Entradas
          </button>
          <div className={childWrap}>
            {TIPOS_ENTRADA.map(t => (
              <button key={t.value} type="button"
                onClick={() => { setAba('entrada'); setTipo(t.value); resetAllFields(); }}
                className={childCls(aba === 'entrada' && tipo === t.value)}>
                <span className="text-[12px]">{t.icon}</span> {t.label}
              </button>
            ))}
          </div>
        </div>

        {/* Saídas */}
        <div>
          <button onClick={() => { setAba('saida'); setTipo('abate'); resetAllFields(); }} className={parentCls(aba === 'saida')}>
            <LogOut className="h-3.5 w-3.5" /> Saídas
          </button>
          <div className={childWrap}>
            {TIPOS_SAIDA.map(t => (
              <button key={t.value} type="button"
                onClick={() => { setAba('saida'); setTipo(t.value); resetAllFields(); }}
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



  // ===== FINANCIAL DETAILS PANEL (right column — non-abate) =====
  const renderFinancialPanel = () => {

    // Transferência: no financial impact
    if (isTransferencia) {
      return (
        <div className="bg-card rounded-md border shadow-sm p-3 space-y-2 self-start">
           <h3 className="text-[14px] font-semibold text-foreground">Detalhes Financeiros</h3>
          <Separator />
          <div className="flex gap-2 items-start py-1">
            <Info className="h-4 w-4 text-muted-foreground shrink-0 mt-0.5" />
            <div className="text-[11px] text-muted-foreground leading-relaxed">
              <p className="font-semibold mb-1">Transferência não gera lançamento financeiro.</p>
              <ul className="space-y-0.5 list-disc list-inside text-[10px]">
                <li>Movimentação interna entre fazendas</li>
                <li>Não impacta fluxo de caixa</li>
              </ul>
            </div>
          </div>
          <Separator />
          <Button type="button" className="w-full h-10 text-[13px] font-bold" onClick={handleRequestRegister} disabled={submitting}>
            Registrar Transferência
          </Button>
        </div>
      );
    }

    // Morte: no financial impact
    if (isMorte) {
      return (
        <div className="bg-card rounded-md border shadow-sm p-3 space-y-2 self-start">
           <h3 className="text-[14px] font-semibold text-foreground">Detalhes Financeiros</h3>
          <Separator />
          <div className="flex gap-2 items-start py-1">
            <Info className="h-4 w-4 text-muted-foreground shrink-0 mt-0.5" />
            <div className="text-[11px] text-muted-foreground leading-relaxed">
              <p className="font-semibold mb-1">Morte não gera lançamento financeiro.</p>
              <ul className="space-y-0.5 list-disc list-inside text-[10px]">
                <li>Impacta apenas o estoque de rebanho</li>
                <li>Não possui valor monetário associado</li>
              </ul>
            </div>
          </div>
          <Separator />
          <Button type="button" className="w-full h-10 text-[13px] font-bold" onClick={handleRequestRegister} disabled={submitting}>
            Registrar Morte
          </Button>
        </div>
      );
    }

    // Venda: use dedicated VendaFinanceiroPanel
    if (isVenda) {
      return (
        <VendaFinanceiroPanel
          key={`venda-${tipo}`}
          ref={vendaFinanceiroRef}
          quantidade={Number(quantidade) || 0}
          pesoKg={Number(pesoKg) || 0}
          categoria={categoria}
          data={data}
          destino={fazendaDestino}
          fornecedorId={vendaDestinoFornecedorId}
          onFornecedorIdChange={(id) => {
            setVendaDestinoFornecedorId(id);
            const nome = abateFornecedores.find(f => f.id === id)?.nome || '';
            setFazendaDestino(nome);
          }}
          fornecedores={abateFornecedores}
          onCreateFornecedor={async (nome, cpfCnpj) => {
            if (!clienteAtual || !fazendaAtual) return;
            const { data: rec, error } = await supabase
              .from('financeiro_fornecedores')
              .insert({ cliente_id: clienteAtual.id, fazenda_id: fazendaAtual.id, nome, cpf_cnpj: cpfCnpj || null })
              .select('id, nome')
              .single();
            if (error) { toast.error('Erro ao salvar fornecedor'); return; }
            if (rec) {
              setAbateFornecedores(prev => [...prev, rec].sort((a, b) => a.nome.localeCompare(b.nome)));
              setVendaDestinoFornecedorId(rec.id);
              setFazendaDestino(rec.nome);
              toast.success(`Fornecedor "${rec.nome}" criado e selecionado`);
            }
          }}
          notaFiscal={notaFiscal}
          onNotaFiscalChange={setNotaFiscal}
          statusOp={statusOp}
          lancamentoId={lastSavedLancamentoId || undefined}
          tipoPeso={tipoPeso}
          onTipoPesoChange={setTipoPeso}
          vendaTipoPreco={vendaTipoPreco}
          onVendaTipoPrecoChange={setVendaTipoPreco}
          vendaPrecoInput={vendaPrecoInput}
          onVendaPrecoInputChange={setVendaPrecoInput}
          valorBruto={calc.valorBruto}
          totalBonus={calc.totalBonus}
          totalDescontos={calc.totalDescontos}
          valorLiquido={calc.valorLiquido}
          funruralPct={funruralPct}
          onFunruralPctChange={setFunruralPct}
          descontoQualidade={descontoQualidade}
          onDescontoQualidadeChange={setDescontoQualidade}
          outrosDescontos={outrosDescontos}
          onOutrosDescontosChange={setOutrosDescontos}
          descFunruralTotal={calc.descFunruralTotal}
          descQualidadeTotal={calc.descQualidadeTotal}
          frete={frete}
          onFreteChange={setFrete}
          comissao={comissaoPct}
          onComissaoChange={setComissaoPct}
          funruralReais={funruralReais}
          onFunruralReaisChange={setFunruralReais}
          comissaoVal={calc.comissaoVal}
          freteVal={calc.freteVal}
          onRequestRegister={handleRequestRegister}
          registerLabel={editingAbateId ? 'Salvar Alterações' : 'Registrar Venda'}
          submitting={submitting}
        />
      );
    }

    // Consumo: use dedicated ConsumoFinanceiroPanel
    if (isConsumo) {
      return (
        <ConsumoFinanceiroPanel
          key={`consumo-${tipo}`}
          ref={consumoFinanceiroRef}
          quantidade={Number(quantidade) || 0}
          pesoKg={Number(pesoKg) || 0}
          categoria={categoria}
          data={data}
          notaFiscal={notaFiscal}
          onNotaFiscalChange={setNotaFiscal}
          statusOp={statusOp}
          lancamentoId={lastSavedLancamentoId || undefined}
          valorBruto={calc.valorBruto}
          valorLiquido={calc.valorLiquido}
          onRequestRegister={handleRequestRegister}
          registerLabel={editingAbateId ? 'Salvar Alterações' : 'Registrar Consumo'}
          submitting={submitting}
        />
      );
    }

    return (
    <div className="bg-card rounded-md border shadow-sm p-3 space-y-2 self-start">
      <h3 className="text-[14px] font-semibold text-foreground">Detalhes Financeiros</h3>
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

      {!isVenda && (
        <div>
          <Label className="text-[11px]">Nota Fiscal</Label>
          <Input value={notaFiscal} onChange={e => setNotaFiscal(e.target.value)} placeholder="Nº da nota" className="h-8 text-[12px]" />
        </div>
      )}

      {!isVenda && (
      <>
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

      {/* Bonus/Descontos — only for non-Venda (Venda descontos are in VendaFinanceiroPanel) */}
      {!isVenda && (
        <>
          <Separator />
          <h4 className="text-[10px] font-bold text-muted-foreground uppercase">Ajustes (R$)</h4>
          <div className="space-y-1.5">
            <div><Label className="text-[11px]">Bônus</Label><Input type="number" value={bonus} onChange={e => setBonus(e.target.value)} placeholder="0" className={`h-8 text-[12px] ${previstoInputClass}`} /></div>
            <div><Label className="text-[11px]">Descontos</Label><Input type="number" value={descontos} onChange={e => setDescontos(e.target.value)} placeholder="0" className={`h-8 text-[12px] ${previstoInputClass}`} /></div>
          </div>
        </>
      )}

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
      </>
      )}

      {/* Unified register button for non-abate operations */}
      {!(aba === 'entrada' && tipo === 'nascimento') && (
        <>
          <Separator />
          <Button
            type="button"
            className="w-full h-10 text-[13px] font-bold"
            onClick={handleRequestRegister}
            disabled={submitting}
          >
            {editingAbateId ? 'Salvar Alterações' : `Registrar ${getOperationLabel()}`}
          </Button>
        </>
      )}
      {/* Nascimento — simpler, still needs a button */}
      {aba === 'entrada' && tipo === 'nascimento' && (
        <>
          <Separator />
          <Button
            type="button"
            className="w-full h-10 text-[13px] font-bold"
            onClick={handleRequestRegister}
            disabled={submitting}
          >
            Registrar Nascimento
          </Button>
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
    <div className={`flex-1 bg-card rounded-md p-3 shadow-sm border space-y-2 self-start overflow-visible ${editingAbateId ? 'ring-2 ring-primary' : ''}`}>

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

      {/* STATUS — inline label + cards + explanation below */}
      <div className="space-y-1">
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wide shrink-0">Status</span>
          <div className="grid grid-cols-3 gap-1 flex-1">
            {([
              { value: 'conciliado' as StatusOperacional, label: STATUS_LABEL.conciliado, dot: 'bg-green-600', activeBorder: 'border-green-400', activeBg: 'bg-green-50 dark:bg-green-950/30' },
              { value: 'confirmado' as StatusOperacional, label: STATUS_LABEL.confirmado, dot: 'bg-blue-500', activeBorder: 'border-blue-400', activeBg: 'bg-blue-50 dark:bg-blue-950/30' },
              { value: 'previsto' as StatusOperacional, label: STATUS_LABEL.previsto, dot: 'bg-orange-500', activeBorder: 'border-orange-400', activeBg: 'bg-orange-50 dark:bg-orange-950/30' },
            ]).map(s => {
              const selected = statusOp === s.value;
              return (
                <button
                  key={s.value}
                  type="button"
                  onClick={() => setStatusOp(s.value)}
                  className={`flex items-center justify-center gap-1 h-6 rounded-md border transition-all ${
                    selected ? `${s.activeBg} ${s.activeBorder}` : 'border-border bg-muted/10 hover:bg-muted/30'
                  }`}
                >
                  <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${selected ? s.dot : 'border border-muted-foreground/40 bg-transparent'}`} />
                  <span className={`text-[10px] font-bold ${selected ? 'text-foreground' : 'text-muted-foreground'}`}>{s.label}</span>
                </button>
              );
            })}
          </div>
        </div>
        <div className={`rounded-md border px-2 py-1 text-[9px] leading-snug ${
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
          <Input tabIndex={1} type="date" value={data} onChange={e => setData(e.target.value)} className={`mt-0.5 h-8 text-[12px] ${previstoInputClass}`} />
        </div>
        <div className="col-span-2">
          <Label className={`font-bold text-[11px] ${previstoLabelClass}`}>Qtd. Cab.</Label>
          <Input tabIndex={2} type="text" inputMode="numeric" value={qtdInput.displayValue} onChange={qtdInput.onChange} onBlur={qtdInput.onBlur} onFocus={qtdInput.onFocus} placeholder="0" className={`mt-0.5 h-8 text-[12px] text-center font-bold ${previstoInputClass}`} />
        </div>
        <div className="col-span-3">
          <Label className={`font-bold text-[11px] ${previstoLabelClass}`}>Peso (kg)</Label>
          <Input tabIndex={3} type="text" inputMode="decimal" value={pesoInput.displayValue} onChange={pesoInput.onChange} onBlur={pesoInput.onBlur} onFocus={pesoInput.onFocus} placeholder="0,00" className={`mt-0.5 h-8 text-[12px] ${previstoInputClass}`} />
        </div>
        <div className="col-span-4">
          <Label className="font-bold text-[11px]">Categoria</Label>
          <Select value={categoria} onValueChange={v => setCategoria(v as Categoria)}>
            <SelectTrigger tabIndex={4} className="mt-0.5 h-8 text-[12px]"><SelectValue placeholder="Selecione..." /></SelectTrigger>
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
        <div className={`grid gap-2 ${campos.origem.show && campos.destino?.show ? 'grid-cols-3' : 'grid-cols-2'}`}>
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
          {/* For abate: custom Frigorífico select with SearchableSelect + novo fornecedor */}
          {isAbate && (
            <div>
              <Label className="font-bold text-[11px]">Frigorífico (Fornecedor) *</Label>
              <div className="flex items-center gap-1 mt-0.5">
                <div className="flex-1">
                  <SearchableSelect
                    value={abateFornecedorId || '__all__'}
                    onValueChange={(v) => setAbateFornecedorId(v === '__all__' ? '' : v)}
                    options={abateFornecedores.map(f => ({ value: f.id, label: f.nome }))}
                    placeholder="Selecione ou cadastre o frigorífico"
                    allLabel="Nenhum selecionado"
                    allValue="__all__"
                    className="[&_button]:h-7 [&_button]:text-[11px] [&_button]:px-2"
                  />
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  className="h-8 w-8 shrink-0"
                  onClick={() => {
                    console.log('[ABATE_DEBUG] click + frigorifico');
                    setNovoFornecedorAbateOpen(true);
                  }}
                >
                  <Plus className="h-4 w-4" />
                </Button>
              </div>
            </div>
          )}
          {/* For compra: fornecedor select same pattern as abate */}
          {isCompra && (
            <div>
              <Label className="font-bold text-[11px]">Fornecedor *</Label>
              <div className="flex items-center gap-1 mt-0.5">
                <div className="flex-1">
                  <SearchableSelect
                    value={compraFornecedorId || '__all__'}
                    onValueChange={(v) => setCompraFornecedorId(v === '__all__' ? '' : v)}
                    options={abateFornecedores.map(f => ({ value: f.id, label: f.nome }))}
                    placeholder="Selecione ou cadastre o fornecedor"
                    allLabel="Nenhum selecionado"
                    allValue="__all__"
                    className="[&_button]:h-7 [&_button]:text-[11px] [&_button]:px-2"
                  />
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  className="h-8 w-8 shrink-0"
                  onClick={() => setNovoFornecedorCompraOpen(true)}
                >
                  <Plus className="h-4 w-4" />
                </Button>
              </div>
            </div>
          )}
          {/* For venda: use SearchableSelect for Destino (comprador) */}
          {isVenda && campos.destino?.show && (
            <div>
              <Label className="font-bold text-[11px]">Destino (Comprador)</Label>
              <div className="flex items-center gap-1 mt-0.5">
                <div className="flex-1">
                  <SearchableSelect
                    value={vendaDestinoFornecedorId || '__all__'}
                    onValueChange={(v) => {
                      const id = v === '__all__' ? '' : v;
                      setVendaDestinoFornecedorId(id);
                      const nome = abateFornecedores.find(f => f.id === id)?.nome || '';
                      setFazendaDestino(nome);
                    }}
                    options={abateFornecedores.map(f => ({ value: f.id, label: f.nome }))}
                    placeholder="Selecione o comprador"
                    allLabel="Nenhum selecionado"
                    allValue="__all__"
                    className="[&_button]:h-7 [&_button]:text-[11px] [&_button]:px-2"
                  />
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  className="h-8 w-8 shrink-0"
                  onClick={() => setNovoFornecedorVendaOpen(true)}
                >
                  <Plus className="h-4 w-4" />
                </Button>
              </div>
            </div>
          )}
          {/* For non-abate, non-compra, non-venda types: keep original destino field */}
          {!isAbate && !isCompra && !isVenda && campos.destino?.show && (
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
    </div>
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
      <div className="grid grid-cols-[11rem_minmax(0,0.9fr)_21rem] gap-3 items-start overflow-visible">
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
              <>
                <CompraResumoPanel
                  quantidade={Number(quantidade) || 0}
                  pesoKg={Number(pesoKg) || 0}
                  categoria={categoria}
                  fornecedorNome={abateFornecedores.find(f => f.id === compraFornecedorId)?.nome || ''}
                  detalhes={compraDetalhes}
                  detalhesPreenchidos={!!compraDetalhes}
                  canOpenModal={!!(data && quantidade && Number(quantidade) > 0 && pesoKg && Number(pesoKg) > 0 && categoria)}
                  onOpenModal={() => setCompraDialogOpen(true)}
                  onRequestRegister={handleRequestRegister}
                  submitting={submitting}
                  registerLabel={editingAbateId ? 'Salvar Alterações' : 'Registrar Compra'}
                />
                <CompraDetalhesDialog
                  open={compraDialogOpen}
                  onClose={() => setCompraDialogOpen(false)}
                  onSave={(det) => {
                    setCompraDetalhes(det);
                    setNotaFiscal(det.notaFiscal);
                    setCompraDialogOpen(false);
                  }}
                  initialData={compraDetalhes || EMPTY_COMPRA_DETALHES}
                  quantidade={Number(quantidade) || 0}
                  pesoKg={Number(pesoKg) || 0}
                  dataCompra={data}
                />
              </>
            ) : isAbate ? (
              <>
                <AbateResumoPanel
                  quantidade={Number(quantidade) || 0}
                  pesoKg={Number(pesoKg) || 0}
                  categoria={categoria}
                  frigorificoNome={abateFornecedores.find(f => f.id === abateFornecedorId)?.nome || ''}
                  detalhes={abateDetalhes}
                  detalhesPreenchidos={!!abateDetalhes}
                  canOpenModal={!!(data && quantidade && Number(quantidade) > 0 && pesoKg && Number(pesoKg) > 0 && categoria && abateFornecedorId)}
                  onOpenModal={() => setAbateDialogOpen(true)}
                  onRequestRegister={handleRequestRegister}
                  submitting={submitting}
                  registerLabel={editingAbateId ? 'Salvar Alterações do Abate' : 'Registrar Abate'}
                />
                <AbateDetalhesDialog
                  open={abateDialogOpen}
                  onClose={() => setAbateDialogOpen(false)}
                  onSave={(det) => {
                    setAbateDetalhes(det);
                    setNotaFiscal(det.notaFiscal);
                    setPrecoArroba(det.precoArroba);
                    setRendCarcaca(det.rendCarcaca);
                    setTipoPeso(det.tipoPeso);
                    setTipoVenda(det.tipoVenda);
                    setBonusPrecoce(det.bonusPrecoce);
                    setBonusQualidade(det.bonusQualidade);
                    setBonusListaTrace(det.bonusListaTrace);
                    setDescontoQualidade(det.descontoQualidade);
                    setFunruralPct(det.funruralPct);
                    setFunruralReais(det.funruralReais);
                    setOutrosDescontos(det.outrosDescontos);
                    setDataVenda(det.dataVenda);
                    setAbateDialogOpen(false);
                  }}
                  initialData={abateDetalhes || EMPTY_ABATE_DETALHES}
                  quantidade={Number(quantidade) || 0}
                  pesoKg={Number(pesoKg) || 0}
                  categoria={categoria}
                  dataAbate={data}
                  statusOp={statusOp}
                />
                {/* Hidden panel for financeiro generation */}
                <div className="hidden">
                  <AbateFinanceiroPanel
                    ref={abateFinanceiroRef}
                    quantidade={Number(quantidade) || 0}
                    categoria={categoria}
                    data={data}
                    valorLiquido={calc.valorLiquido}
                    totalDescontos={calc.totalDescontos}
                    frigorifico={abateFornecedores.find(f => f.id === abateFornecedorId)?.nome || ''}
                    fornecedorId={abateFornecedorId || undefined}
                    notaFiscal={notaFiscal}
                    onNotaFiscalChange={setNotaFiscal}
                    lancamentoId={editingAbateId || lastSavedLancamentoId || undefined}
                    mode={editingAbateId ? 'update' : 'create'}
                    onFinanceiroUpdated={() => {}}
                    statusOperacional={statusOp}
                  />
                </div>
              </>
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

      {/* Confirmation dialog */}
      <ConfirmacaoRegistroDialog
        open={confirmDialogOpen}
        onClose={() => setConfirmDialogOpen(false)}
        onConfirm={() => handleSubmit()}
        submitting={submitting}
        operacionais={{
          status: statusOp,
          data,
          quantidade: Number(quantidade) || 0,
          categoria,
          pesoKg: Number(pesoKg) || 0,
          fazendaOrigem: campos.origem.show ? (campos.origem.auto ? campos.origem.value : fazendaOrigem) : undefined,
          fazendaDestino: isAbate ? (abateFornecedores.find(f => f.id === abateFornecedorId)?.nome || '') : (campos.destino?.show ? (campos.destino?.auto ? campos.destino?.value : fazendaDestino) : undefined),
          observacao,
        }}
        financeiros={getConfirmacaoFinanceiros()}
      />

      {/* Novo Fornecedor (Frigorífico) dialog for abate */}
      <NovoFornecedorDialog
        open={novoFornecedorAbateOpen}
        onClose={() => setNovoFornecedorAbateOpen(false)}
        onSave={async (nome, cpfCnpj) => {
          if (!clienteAtual || !fazendaAtual) return;
          const { data: rec, error } = await supabase
            .from('financeiro_fornecedores')
            .insert({ cliente_id: clienteAtual.id, fazenda_id: fazendaAtual.id, nome, cpf_cnpj: cpfCnpj || null })
            .select('id, nome')
            .single();
          if (error) { toast.error('Erro ao salvar fornecedor'); return; }
          if (rec) {
            setAbateFornecedores(prev => [...prev, rec].sort((a, b) => a.nome.localeCompare(b.nome)));
            setAbateFornecedorId(rec.id);
            toast.success(`Fornecedor "${rec.nome}" criado e selecionado`);
          }
          setNovoFornecedorAbateOpen(false);
        }}
      />

      {/* Novo Fornecedor dialog for compra */}
      <NovoFornecedorDialog
        open={novoFornecedorCompraOpen}
        onClose={() => setNovoFornecedorCompraOpen(false)}
        onSave={async (nome, cpfCnpj) => {
          if (!clienteAtual || !fazendaAtual) return;
          const { data: rec, error } = await supabase
            .from('financeiro_fornecedores')
            .insert({ cliente_id: clienteAtual.id, fazenda_id: fazendaAtual.id, nome, cpf_cnpj: cpfCnpj || null })
            .select('id, nome')
            .single();
          if (error) { toast.error('Erro ao salvar fornecedor'); return; }
          if (rec) {
            setAbateFornecedores(prev => [...prev, rec].sort((a, b) => a.nome.localeCompare(b.nome)));
            setCompraFornecedorId(rec.id);
            toast.success(`Fornecedor "${rec.nome}" criado e selecionado`);
          }
          setNovoFornecedorCompraOpen(false);
        }}
      />

      {/* Novo Fornecedor dialog for venda destino */}
      <NovoFornecedorDialog
        open={novoFornecedorVendaOpen}
        onClose={() => setNovoFornecedorVendaOpen(false)}
        onSave={async (nome, cpfCnpj) => {
          if (!clienteAtual || !fazendaAtual) return;
          const { data: rec, error } = await supabase
            .from('financeiro_fornecedores')
            .insert({ cliente_id: clienteAtual.id, fazenda_id: fazendaAtual.id, nome, cpf_cnpj: cpfCnpj || null })
            .select('id, nome')
            .single();
          if (error) { toast.error('Erro ao salvar fornecedor'); return; }
          if (rec) {
            setAbateFornecedores(prev => [...prev, rec].sort((a, b) => a.nome.localeCompare(b.nome)));
            setVendaDestinoFornecedorId(rec.id);
            setFazendaDestino(rec.nome);
            toast.success(`Fornecedor "${rec.nome}" criado e selecionado`);
          }
          setNovoFornecedorVendaOpen(false);
        }}
      />
    </div>
  );
}
