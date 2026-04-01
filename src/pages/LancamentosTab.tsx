import { useState, useMemo, useCallback } from 'react';
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
import { Separator } from '@/components/ui/separator';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { format, parseISO, addDays } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { ChevronRight, ChevronDown, ArrowLeft, AlertTriangle, LogIn, LogOut, RefreshCw, Clock } from 'lucide-react';
import { LancamentoDetalhe } from '@/components/LancamentoDetalhe';
import { ReclassificacaoForm } from '@/components/ReclassificacaoForm';
import { useFazenda } from '@/contexts/FazendaContext';
import { toast } from 'sonner';

interface Props {
  lancamentos: Lancamento[];
  onAdicionar: (l: Omit<Lancamento, 'id'>) => void;
  onEditar: (id: string, dados: Partial<Omit<Lancamento, 'id'>>) => void;
  onRemover: (id: string) => void;
  abaInicial?: Aba;
  onBackToConciliacao?: () => void;
  dataInicial?: string;
  backLabel?: string;
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

const STATUS_DESCRIPTIONS: Record<StatusOperacional, string> = {
  conciliado: 'Movimentação realizada e já considerada no rebanho real.',
  confirmado: 'Movimentação definida, mas ainda não efetivada. Altere para conciliado quando ocorrer.',
  previsto: 'Movimentação planejada. Entra apenas na meta/previsão.',
};

function getCamposFazenda(tipo: TipoMovimentacao, nomeFazenda: string) {
  switch (tipo) {
    case 'nascimento':
      return { origem: { show: false }, destino: { show: true, auto: true, value: nomeFazenda, label: 'Fazenda Destino' } };
    case 'compra':
      return { origem: { show: true, auto: false, label: 'Origem' }, destino: { show: true, auto: true, value: nomeFazenda, label: 'Fazenda Destino' } };
    case 'transferencia_entrada':
      return { origem: { show: true, auto: false, label: 'Origem', useSelect: true }, destino: { show: true, auto: true, value: nomeFazenda, label: 'Fazenda Destino' } };
    case 'abate':
      return { origem: { show: true, auto: true, value: nomeFazenda, label: 'Fazenda Origem' }, destino: { show: true, auto: false, label: 'Destino' } };
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

export function LancamentosTab({ lancamentos, onAdicionar, onEditar, onRemover, abaInicial, onBackToConciliacao, dataInicial, backLabel }: Props) {
  const { fazendaAtual, fazendas, isGlobal } = useFazenda();
  const nomeFazenda = fazendaAtual?.nome || '';
  const isAdministrativo = fazendaAtual?.tem_pecuaria === false;
  const bloqueado = isGlobal || isAdministrativo;

  const outrasFazendas = useMemo(() => {
    return fazendas.filter(f => f.id !== fazendaAtual?.id && f.id !== '__global__' && f.tem_pecuaria !== false);
  }, [fazendas, fazendaAtual]);

  const [aba, setAba] = useState<Aba>(abaInicial || 'entrada');
  const [tipo, setTipo] = useState<TipoMovimentacao>('nascimento');
  const [categoria, setCategoria] = useState<Categoria>('bois');
  const [quantidade, setQuantidade] = useState('');
  const [data, setData] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [fazendaOrigem, setFazendaOrigem] = useState('');
  const [fazendaDestino, setFazendaDestino] = useState('');
  const [pesoKg, setPesoKg] = useState(abaInicial === 'entrada' || !abaInicial ? '30' : '');
  const [observacao, setObservacao] = useState('');
  const [detalheId, setDetalheId] = useState<string | null>(null);
  const [anoFiltro, setAnoFiltro] = useState(String(new Date().getFullYear()));
  const [mesFiltro, setMesFiltro] = useState('todos');
  const [financeiroOpen, setFinanceiroOpen] = useState(false);
  const [statusOp, setStatusOp] = useState<StatusOperacional>('conciliado');

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

  const [dataVenda, setDataVenda] = useState('');
  const [dataEmbarque, setDataEmbarque] = useState('');
  const [dataAbate, setDataAbate] = useState('');

  const [formaPagamento, setFormaPagamento] = useState<'avista' | 'parcelado'>('avista');
  const [parcelas, setParcelas] = useState<Parcela[]>([]);
  const [qtdParcelas, setQtdParcelas] = useState('2');

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
    const carcaca = Number(pesoCarcacaKg) || 0;
    let pesoArroba = 0;
    if (isAbate) { pesoArroba = carcaca > 0 ? carcaca / 15 : 0; }
    else { pesoArroba = peso > 0 ? peso / 30 : 0; }
    const totalArrobas = pesoArroba * qtd;
    const totalKg = peso * qtd;
    let valorBruto = 0;
    if (usaPrecoArroba) { valorBruto = totalArrobas * (Number(precoArroba) || 0); }
    else if (usaPrecoKg) { valorBruto = totalKg * (Number(precoKg) || 0); }
    const totalBonus = isAbate
      ? (Number(bonusPrecoce) || 0) + (Number(bonusQualidade) || 0) + (Number(bonusListaTrace) || 0)
      : (Number(bonus) || 0);
    const totalDescontos = isAbate
      ? (Number(descontoQualidade) || 0) + (Number(descontoFunrural) || 0) + (Number(outrosDescontos) || 0)
      : (Number(descontos) || 0);
    const comissaoVal = valorBruto * (Number(comissaoPct) || 0) / 100;
    const freteVal = Number(frete) || 0;
    const outrasDespVal = Number(outrasDespesas) || 0;
    const valorLiquido = valorBruto + totalBonus - totalDescontos - comissaoVal - freteVal - outrasDespVal;
    const liqArroba = totalArrobas > 0 ? valorLiquido / totalArrobas : 0;
    const liqCabeca = qtd > 0 ? valorLiquido / qtd : 0;
    const liqKg = totalKg > 0 ? valorLiquido / totalKg : 0;
    return { pesoArroba, totalArrobas, totalKg, valorBruto, totalBonus, totalDescontos, comissaoVal, freteVal, outrasDespVal, valorLiquido, liqArroba, liqCabeca, liqKg };
  }, [quantidade, pesoKg, pesoCarcacaKg, precoArroba, precoKg, bonusPrecoce, bonusQualidade, bonusListaTrace, descontoQualidade, descontoFunrural, outrosDescontos, bonus, descontos, comissaoPct, frete, outrasDespesas, isAbate, usaPrecoArroba, usaPrecoKg]);

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
    setDataVenda(''); setDataEmbarque(''); setDataAbate('');
    setFormaPagamento('avista'); setParcelas([]); setQtdParcelas('2');
    setMotivoMorte(''); setMotivoMorteCustom('');
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!quantidade || Number(quantidade) <= 0) return;

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

    onAdicionar({
      data, tipo, quantidade: Number(quantidade), categoria,
      fazendaOrigem: origemFinal, fazendaDestino: destinoFinal,
      pesoMedioKg: pesoKg ? Number(pesoKg) : undefined,
      pesoMedioArrobas: pesoKg ? kgToArrobas(Number(pesoKg)) : undefined,
      observacao: observacao || undefined,
      pesoCarcacaKg: numOrUndef(pesoCarcacaKg),
      precoArroba: numOrUndef(precoArroba) || undefined,
      bonusPrecoce: numOrUndef(bonusPrecoce),
      bonusQualidade: numOrUndef(bonusQualidade),
      bonusListaTrace: numOrUndef(bonusListaTrace),
      descontoQualidade: numOrUndef(descontoQualidade),
      descontoFunrural: numOrUndef(descontoFunrural),
      outrosDescontos: numOrUndef(outrosDescontos),
      acrescimos: numOrUndef(bonus),
      deducoes: numOrUndef(descontos),
      valorTotal: valorTotalFinal,
      notaFiscal: notaFiscal || undefined,
      tipoPeso,
      statusOperacional: statusOp,
    });

    setQuantidade('');
    setPesoKg(tipo === 'nascimento' ? '30' : '');
    setFazendaOrigem(''); setFazendaDestino('');
    resetFinancialFields();
    toast.success('Lançamento registrado!');
  };

  const tiposDisponiveis = aba === 'entrada' ? TIPOS_ENTRADA : TIPOS_SAIDA;

  const previstoInputClass = isPrevisto ? 'border-orange-400 text-orange-800 dark:text-orange-300' : '';
  const previstoLabelClass = isPrevisto ? 'text-orange-700 dark:text-orange-400' : '';

  const showExtraDates = (isConfirmado || isConciliado) && (isAbate || isVenda || isTransferencia);
  const showFormaPagamento = (isConfirmado || isConciliado) && (isAbate || isVenda || isCompra || isTransferencia);
  const showComissaoFreteDespesas = isConciliado && (isAbate || isVenda || isCompra || isTransferencia);
  const showComissaoPrevConf = (isConfirmado) && (isCompra);

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
  const renderSidebar = () => (
    <div className="w-44 shrink-0 space-y-px">
      {ABA_CONFIG.map(a => {
        const isActive = aba === a.id;
        const subtypes = a.id === 'entrada' ? TIPOS_ENTRADA : a.id === 'saida' ? TIPOS_SAIDA : null;
        return (
          <div key={a.id}>
            <button
              onClick={() => { setAba(a.id); if (a.id === 'entrada') setTipo('nascimento'); if (a.id === 'saida') setTipo('abate'); }}
              className={`w-full flex items-center gap-2 px-2.5 py-1.5 rounded text-[11px] font-bold transition-all ${
                isActive ? 'bg-primary text-primary-foreground shadow-sm' : 'text-muted-foreground hover:bg-muted/60'
              }`}
            >
              {a.icon}
              <span>{a.label}</span>
            </button>
            {isActive && subtypes && (
              <div className="ml-3.5 mt-px mb-px border-l-2 border-primary/30 pl-1.5 space-y-px">
                {subtypes.map(t => (
                  <button
                    key={t.value}
                    type="button"
                    onClick={() => { setTipo(t.value); setFazendaOrigem(''); setFazendaDestino(''); setMotivoMorte(''); setMotivoMorteCustom(''); resetFinancialFields(); setPesoKg(t.value === 'nascimento' ? '30' : ''); }}
                    className={`w-full flex items-center gap-1 px-2 py-1 rounded text-[10px] font-semibold transition-all ${
                      tipo === t.value ? 'bg-primary/15 text-foreground border border-primary/40' : 'text-muted-foreground hover:bg-muted/40 border border-transparent'
                    }`}
                  >
                    <span className="text-xs">{t.icon}</span> {t.label}
                  </button>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );

  // ===== FINANCIAL DETAILS PANEL (right column) =====
  const renderFinancialPanel = () => (
    <div className="w-72 shrink-0 bg-card rounded-md border shadow-sm p-3 space-y-2 self-start">
      <h3 className="text-[11px] font-bold uppercase text-muted-foreground tracking-wide">Detalhes Financeiros</h3>
      <Separator />

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
            {(isAbate || isTransferencia) && (
              <div>
                <Label className="text-[11px]">Data Abate</Label>
                <Input type="date" value={dataAbate} onChange={e => setDataAbate(e.target.value)} className="h-8 text-[12px]" />
              </div>
            )}
          </div>
          <Separator />
        </div>
      )}

      {/* Abate-specific */}
      {isAbate && (
        <>
          <div>
            <Label className="text-[11px]">Peso Carcaça (kg)</Label>
            <Input type="number" value={pesoCarcacaKg} onChange={e => setPesoCarcacaKg(e.target.value)} placeholder="0" className={`h-8 text-[12px] ${previstoInputClass}`} />
          </div>
          <div>
            <Label className="text-[11px]">Tipo de Peso Negociado</Label>
            <Select value={tipoPeso} onValueChange={(v: 'vivo' | 'morto') => setTipoPeso(v)}>
              <SelectTrigger className="h-8 text-[12px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="vivo" className="text-[12px]">Peso Vivo</SelectItem>
                <SelectItem value="morto" className="text-[12px]">Peso Morto</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </>
      )}

      <div>
        <Label className="text-[11px]">Nota Fiscal</Label>
        <Input value={notaFiscal} onChange={e => setNotaFiscal(e.target.value)} placeholder="Nº da nota" className="h-8 text-[12px]" />
      </div>

      <Separator />
      <h4 className="text-[10px] font-bold text-muted-foreground uppercase">Valor da Operação</h4>

      {usaPrecoArroba && (
        <div>
          <Label className={`text-[11px] ${previstoLabelClass}`}>R$/@ (preço base)</Label>
          <Input type="number" value={precoArroba} onChange={e => setPrecoArroba(e.target.value)} placeholder="0,00" className={`h-8 text-[12px] ${previstoInputClass}`} />
        </div>
      )}
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
            <strong className={isPrevisto ? 'text-orange-800 dark:text-orange-300' : ''}>R$ {fmt(calc.valorBruto)}</strong>
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
              Parcelado
            </button>
          </div>
          {formaPagamento === 'parcelado' && (
            <div className="space-y-1.5">
              <div>
                <Label className="text-[11px]">Quantidade de parcelas</Label>
                <Input type="number" min="2" max="48" value={qtdParcelas} onChange={e => handleQtdParcelasChange(e.target.value)} className="h-8 text-[12px]" />
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
                  Soma parcelas: R$ {fmt(parcelas.reduce((s, p) => s + p.valor, 0))}
                </div>
              )}
            </div>
          )}
        </>
      )}

      {/* Bonus/Descontos */}
      {isAbate ? (
        <>
          <Separator />
          <h4 className="text-[10px] font-bold text-muted-foreground uppercase">Bônus (R$)</h4>
          <div className="space-y-1.5">
            <div><Label className="text-[11px]">Precoce</Label><Input type="number" value={bonusPrecoce} onChange={e => setBonusPrecoce(e.target.value)} placeholder="0" className={`h-8 text-[12px] ${previstoInputClass}`} /></div>
            <div><Label className="text-[11px]">Qualidade</Label><Input type="number" value={bonusQualidade} onChange={e => setBonusQualidade(e.target.value)} placeholder="0" className={`h-8 text-[12px] ${previstoInputClass}`} /></div>
            <div><Label className="text-[11px]">Lista Trace</Label><Input type="number" value={bonusListaTrace} onChange={e => setBonusListaTrace(e.target.value)} placeholder="0" className={`h-8 text-[12px] ${previstoInputClass}`} /></div>
          </div>
          <h4 className="text-[10px] font-bold text-muted-foreground uppercase">Descontos (R$)</h4>
          <div className="space-y-1.5">
            <div><Label className="text-[11px]">Qualidade</Label><Input type="number" value={descontoQualidade} onChange={e => setDescontoQualidade(e.target.value)} placeholder="0" className={`h-8 text-[12px] ${previstoInputClass}`} /></div>
            <div><Label className="text-[11px]">Funrural</Label><Input type="number" value={descontoFunrural} onChange={e => setDescontoFunrural(e.target.value)} placeholder="0" className={`h-8 text-[12px] ${previstoInputClass}`} /></div>
            <div><Label className="text-[11px]">Outros</Label><Input type="number" value={outrosDescontos} onChange={e => setOutrosDescontos(e.target.value)} placeholder="0" className={`h-8 text-[12px] ${previstoInputClass}`} /></div>
          </div>
        </>
      ) : (
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
              const totalBon = isAbate ? (Number(bonusPrecoce) || 0) + (Number(bonusQualidade) || 0) + (Number(bonusListaTrace) || 0) : (Number(bonus) || 0);
              const totalDesc = isAbate ? (Number(descontoQualidade) || 0) + (Number(descontoFunrural) || 0) + (Number(outrosDescontos) || 0) : (Number(descontos) || 0);
              const freteVal = Number(frete) || 0;
              const outVal = Number(outrasDespesas) || 0;
              const brutoNecessario = vt - totalBon + totalDesc + freteVal + outVal;
              if (usaPrecoArroba && calc.totalArrobas > 0) { setPrecoArroba(String((brutoNecessario / calc.totalArrobas).toFixed(4))); }
              else if (usaPrecoKg && calc.totalKg > 0) { setPrecoKg(String((brutoNecessario / calc.totalKg).toFixed(4))); }
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
            <span className={isPrevisto ? 'text-orange-800 dark:text-orange-300' : 'text-primary'}>R$ {fmt(calc.valorLiquido)}</span>
          </div>
          {calc.liqArroba > 0 && (
            <div className="flex justify-between text-[11px] mt-0.5">
              <span className="text-muted-foreground">R$/líq @</span>
              <strong>R$ {fmt(calc.liqArroba)}</strong>
            </div>
          )}
          {calc.liqCabeca > 0 && (
            <div className="flex justify-between text-[11px] mt-0.5">
              <span className="text-muted-foreground">Líq/Cabeça</span>
              <strong>R$ {fmt(calc.liqCabeca)}</strong>
            </div>
          )}
          {calc.liqKg > 0 && (
            <div className="flex justify-between text-[11px] mt-0.5">
              <span className="text-muted-foreground">R$/Kg líq</span>
              <strong>R$ {fmt(calc.liqKg)}</strong>
            </div>
          )}
        </div>
      )}
    </div>
  );

  // ===== MAIN FORM (center) =====
  const renderForm = () => (
    <form onSubmit={handleSubmit} className="flex-1 bg-card rounded-md p-4 shadow-sm border space-y-3 self-start">

      {/* STATUS — selection + dynamic explanation */}
      <div className="space-y-1.5">
        <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wide">Status</span>
        {/* Row 1: selection cards */}
        <div className="grid grid-cols-3 gap-1.5">
          {([
            { value: 'conciliado' as StatusOperacional, label: 'Conciliado', dot: 'bg-blue-500', activeBorder: 'border-blue-400', activeBg: 'bg-blue-50 dark:bg-blue-950/30' },
            { value: 'previsto' as StatusOperacional, label: 'Previsto', dot: 'bg-orange-500', activeBorder: 'border-orange-400', activeBg: 'bg-orange-50 dark:bg-orange-950/30' },
            { value: 'confirmado' as StatusOperacional, label: 'Confirmado*', dot: 'bg-green-500', activeBorder: 'border-green-400', activeBg: 'bg-green-50 dark:bg-green-950/30' },
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
          statusOp === 'conciliado' ? 'bg-blue-50 dark:bg-blue-950/20 border-blue-300 dark:border-blue-800 text-blue-800 dark:text-blue-300'
          : statusOp === 'previsto' ? 'bg-orange-50 dark:bg-orange-950/20 border-orange-300 dark:border-orange-800 text-orange-800 dark:text-orange-300'
          : 'bg-green-50 dark:bg-green-950/20 border-green-300 dark:border-green-800 text-green-800 dark:text-green-300'
        }`}>
          {statusOp === 'conciliado' && 'Movimentação realizada e já considerada no rebanho real.'}
          {statusOp === 'previsto' && 'Movimentação planejada. Entra apenas na meta/previsão.'}
          {statusOp === 'confirmado' && 'Movimentação definida, mas ainda não efetivada no rebanho. Quando ocorrer de fato, alterar para conciliado.'}
        </div>
      </div>

      <Separator />

      {/* Row 1: Data | Qtd | Peso | Categoria */}
      <div className="grid grid-cols-12 gap-2">
        <div className="col-span-3">
          <Label className={`font-bold text-[11px] ${previstoLabelClass}`}>Data</Label>
          <Input type="date" value={data} onChange={e => setData(e.target.value)} className={`mt-0.5 h-8 text-[12px] ${previstoInputClass}`} />
        </div>
        <div className="col-span-2">
          <Label className={`font-bold text-[11px] ${previstoLabelClass}`}>Qtd. Cab.</Label>
          <Input type="number" value={quantidade} onChange={e => setQuantidade(e.target.value)} placeholder="0" min="1" className={`mt-0.5 h-8 text-[12px] text-center font-bold ${previstoInputClass}`} />
        </div>
        <div className="col-span-3">
          <Label className={`font-bold text-[11px] ${previstoLabelClass}`}>Peso (kg)</Label>
          <Input type="number" value={pesoKg} onChange={e => setPesoKg(e.target.value)} placeholder="0" className={`mt-0.5 h-8 text-[12px] ${previstoInputClass}`} />
          {pesoKg && Number(pesoKg) > 0 && (
            <p className="text-[9px] text-muted-foreground mt-0.5">≈ {kgToArrobas(Number(pesoKg))} @</p>
          )}
        </div>
        <div className="col-span-4">
          <Label className="font-bold text-[11px]">Categoria</Label>
          <Select value={categoria} onValueChange={v => setCategoria(v as Categoria)}>
            <SelectTrigger className="mt-0.5 h-8 text-[12px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              {categoriasDisponiveis.map(c => <SelectItem key={c.value} value={c.value} className="text-[12px]">{c.label}</SelectItem>)}
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

      {/* Row 2: Fazenda Origem / Destino */}
      {(campos.origem.show || campos.destino?.show) && (
        <div className="grid grid-cols-2 gap-2">
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
        </div>
      )}

      {/* Row 3: Observação */}
      <div>
        <Label className="font-bold text-[11px]">Observação</Label>
        <Input value={observacao} onChange={e => setObservacao(e.target.value)} placeholder="Observação opcional" className="mt-0.5 h-8 text-[12px]" />
      </div>

      <Button type="submit" className="w-full h-9 text-[12px] font-bold" size="sm">
        {aba === 'entrada' ? 'Registrar Entrada' : 'Registrar Saída'}
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
                    {l.valorTotal ? ` • R$${l.valorTotal.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}` : ''}
                  </p>
                </div>
                <div className="flex flex-col items-end gap-0.5 shrink-0">
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

      {/* === 3-COLUMN DESKTOP LAYOUT === */}
      <div className="flex gap-3 items-start">
        {/* Left: Navigation sidebar */}
        {renderSidebar()}

        {/* Center: Form or Historico */}
        {aba === 'reclassificacao' ? (
          <div className="flex-1 self-start">
            <ReclassificacaoForm onAdicionar={onAdicionar} dataInicial={dataInicial} />
          </div>
        ) : aba === 'historico' ? (
          renderHistorico()
        ) : (
          <>
            {renderForm()}
            {/* Right: Financial details */}
            {renderFinancialPanel()}
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
        />
      )}
    </div>
  );
}
