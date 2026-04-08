import { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import { MetaLancamentoPanel, useMetaValidacaoBloqueios, type EvolucaoSugestao } from '@/components/MetaLancamentoPanel';
import { EvolucaoAssistidaDialog } from '@/components/EvolucaoAssistidaDialog';
import { useIsMobile } from '@/hooks/use-mobile';
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
import { useStatusPilares } from '@/hooks/useStatusPilares';
import { ReabrirP1Dialog } from '@/components/ReabrirP1Dialog';
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
import { ReclassificacaoFormFields, useReclassificacaoState } from '@/components/ReclassificacaoForm';
import { ReclassificacaoResumoPanel } from '@/components/ReclassificacaoResumoPanel';
import { CompraDetalhesDialog, CompraDetalhes, EMPTY_COMPRA_DETALHES } from '@/components/compra/CompraDetalhesDialog';
import { CompraResumoPanel } from '@/components/compra/CompraResumoPanel';
import { gerarFinanceiroCompra } from '@/components/compra/gerarFinanceiroCompra';
import { AbateDetalhesDialog, AbateDetalhes, EMPTY_ABATE_DETALHES } from '@/components/abate/AbateDetalhesDialog';
import { AbateResumoPanel } from '@/components/abate/AbateResumoPanel';
import { TransferenciaDetalhesDialog, TransferenciaDetalhes, EMPTY_TRANSFERENCIA_DETALHES } from '@/components/transferencia/TransferenciaDetalhesDialog';
import { TransferenciaResumoPanel } from '@/components/transferencia/TransferenciaResumoPanel';
import { buildTransferenciaCalculation, buildTransferenciaSnapshot } from '@/lib/calculos/transferencia';
import { buildAbateCalculation, type AbateCalculation } from '@/lib/calculos/abate';
import { buildVendaCalculation, buildVendaSnapshot, type VendaCalculation } from '@/lib/calculos/venda';
import { VendaDetalhesDialog, VendaDetalhes, EMPTY_VENDA_DETALHES } from '@/components/venda/VendaDetalhesDialog';
import { VendaResumoPanel } from '@/components/venda/VendaResumoPanel';
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
  /** Venda para abrir em modo edição automaticamente */
  vendaParaEditar?: Lancamento | null;
  /** Compra para abrir em modo edição automaticamente */
  compraParaEditar?: Lancamento | null;
  /** Transferência para abrir em modo edição automaticamente */
  transferenciaParaEditar?: Lancamento | null;
  /** Callback to return to the origin tab after edit cancel/save */
  onReturnFromEdit?: () => void;
  /** Initial year filter for historico view */
  initialAnoFiltro?: string;
  /** Initial month filter for historico view */
  initialMesFiltro?: string;
}

type Aba = 'entrada' | 'saida' | 'reclassificacao' | 'historico';
import { STATUS_LABEL, STATUS_OPTIONS_ZOOTECNICO, META_VISUAL, getStatusBadge, type StatusOperacional } from '@/lib/statusOperacional';
import { usePermissions } from '@/hooks/usePermissions';

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

const STATUS_DESCRIPTIONS_DEFAULT: Partial<Record<StatusOperacional | 'meta', string>> = {
  meta: META_VISUAL.description,
  programado: 'Operação definida, ainda não executada.',
  realizado: 'Operação concluída. Impacta rebanho e financeiro.',
};

const STATUS_DESCRIPTIONS_ABATE: Partial<Record<StatusOperacional | 'meta', string>> = {
  meta: META_VISUAL.description,
  programado: 'Venda fechada e animais escalados, mas o abate ainda não ocorreu. Os dados ainda são previsões operacionais e financeiras.',
  realizado: 'Abate concluído com dados reais de carcaça, bônus e descontos. Os valores refletem o resultado efetivo da operação.',
};

function getStatusDescription(tipo: TipoMovimentacao, status: StatusOperacional | 'meta'): string {
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

type FornecedorOption = {
  id: string;
  nome: string;
  nomeNormalizado?: string | null;
  aliases?: string[] | null;
};

function normalizeFornecedorText(value?: string | null) {
  return (value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9 ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

function matchFornecedor(options: FornecedorOption[], params: { id?: string | null; nome?: string | null }) {
  if (!options.length) return undefined;

  if (params.id) {
    const byId = options.find(option => option.id === params.id);
    if (byId) return byId;
  }

  const normalizedNome = normalizeFornecedorText(params.nome);
  if (!normalizedNome) return undefined;

  return options.find(option => {
    const optionNome = normalizeFornecedorText(option.nome);
    const optionNormalizado = normalizeFornecedorText(option.nomeNormalizado);
    const aliases = (option.aliases || []).map(alias => normalizeFornecedorText(alias));

    return (
      optionNome === normalizedNome ||
      optionNormalizado === normalizedNome ||
      aliases.includes(normalizedNome) ||
      optionNome.includes(normalizedNome) ||
      normalizedNome.includes(optionNome) ||
      (optionNormalizado && optionNormalizado.includes(normalizedNome)) ||
      (optionNormalizado && normalizedNome.includes(optionNormalizado))
    );
  });
}

export function LancamentosTab({ lancamentos, onAdicionar, onEditar, onRemover, onCountFinanceiros, abaInicial, onBackToConciliacao, dataInicial, backLabel, abateParaEditar, vendaParaEditar, compraParaEditar, transferenciaParaEditar, onReturnFromEdit, initialAnoFiltro, initialMesFiltro }: Props) {
  const { fazendaAtual, fazendas, isGlobal } = useFazenda();
  const isMobile = useIsMobile();
  const { clienteAtual } = useCliente();
  const nomeFazenda = fazendaAtual?.nome || '';
  const isAdministrativo = fazendaAtual?.tem_pecuaria === false;
  const bloqueado = isGlobal || isAdministrativo;

  // ─── Governança P1: bloquear mês fechado ───
  // We'll compute anoMes from the form's current `data` field (set on line ~195)
  // But we need the state first, so the hook call uses a derived value below.

  const outrasFazendas = useMemo(() => {
    return fazendas.filter(f => f.id !== fazendaAtual?.id && f.id !== '__global__' && f.tem_pecuaria !== false);
  }, [fazendas, fazendaAtual]);

  const [aba, setAba] = useState<Aba>(abaInicial || (initialAnoFiltro ? 'historico' : 'entrada'));
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
  const [anoFiltro, setAnoFiltro] = useState(initialAnoFiltro || String(new Date().getFullYear()));
  const [mesFiltro, setMesFiltro] = useState(initialMesFiltro || 'todos');

  // ─── P1 governance: derive anoMes from form date ───
  const formAnoMes = useMemo(() => {
    if (!data) return undefined;
    return data.slice(0, 7); // 'yyyy-MM'
  }, [data]);
  const { status: statusPilaresForm, refetch: refetchPilares } = useStatusPilares(fazendaAtual?.id, formAnoMes);
  const p1Oficial = statusPilaresForm.p1_mapa_pastos.status === 'oficial';
  const [showReabrirP1, setShowReabrirP1] = useState(false);

  const internalEditOrigin = useRef<{ aba: Aba; anoFiltro: string; mesFiltro: string } | null>(null);
  const [financeiroOpen, setFinanceiroOpen] = useState(false);
  const [statusOp, setStatusOp] = useState<StatusOperacional | 'meta'>('realizado');
  const { canEditMeta } = usePermissions();
  const [confirmDialogOpen, setConfirmDialogOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const reclassState = useReclassificacaoState({ onAdicionar, dataInicial, lancamentos, ano: Number(anoFiltro) });
  const [compraDetalhes, setCompraDetalhes] = useState<CompraDetalhes | null>(null);
  const [compraDialogOpen, setCompraDialogOpen] = useState(false);
  const [abateDetalhes, setAbateDetalhes] = useState<AbateDetalhes | null>(null);
  const [abateDialogOpen, setAbateDialogOpen] = useState(false);
   const [vendaDetalhes, setVendaDetalhes] = useState<VendaDetalhes | null>(null);
   const [vendaDialogOpen, setVendaDialogOpen] = useState(false);
   const [transferenciaDetalhes, setTransferenciaDetalhes] = useState<TransferenciaDetalhes | null>(null);
   const [transferenciaDialogOpen, setTransferenciaDialogOpen] = useState(false);

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
  const [boitelDataForResumo, setBoitelDataForResumo] = useState<import('@/components/BoitelPlanningDialog').BoitelData | null>(null);
  const [rendCarcaca, setRendCarcaca] = useState('');
  const [funruralPct, setFunruralPct] = useState('');
  const [funruralReais, setFunruralReais] = useState('');

  const [dataVenda, setDataVenda] = useState('');
  const [dataEmbarque, setDataEmbarque] = useState('');
  const [dataAbate, setDataAbate] = useState('');
  const [tipoVenda, setTipoVenda] = useState('');

  // Abate fornecedor (frigorífico) state
  const [abateFornecedorId, setAbateFornecedorId] = useState('');
  const [abateFornecedores, setAbateFornecedores] = useState<FornecedorOption[]>([]);
  const [novoFornecedorAbateOpen, setNovoFornecedorAbateOpen] = useState(false);

  // Ref to store pending fornecedor match params — survives across renders
  const pendingFornecedorMatch = useRef<{ tipo: 'abate' | 'venda' | 'compra'; id?: string | null; nome?: string | null; lancamentoId?: string } | null>(null);

  // Compra fornecedor state
  const [compraFornecedorId, setCompraFornecedorId] = useState('');
  const [novoFornecedorCompraOpen, setNovoFornecedorCompraOpen] = useState(false);

  // Venda destino fornecedor state
  const [vendaDestinoFornecedorId, setVendaDestinoFornecedorId] = useState('');
  const [novoFornecedorVendaOpen, setNovoFornecedorVendaOpen] = useState(false);

  const [formaPagamento, setFormaPagamento] = useState<'avista' | 'parcelado'>('avista');
  const [parcelas, setParcelas] = useState<Parcela[]>([]);
  const [qtdParcelas, setQtdParcelas] = useState('1');

  const qtdInput = useIntegerInput(quantidade, setQuantidade);
  const pesoInput = useDecimalInput(pesoKg, setPesoKg, 2);

  const isCenarioMeta = statusOp === 'meta';
  /** StatusOperacional efetivo para passar a componentes que não conhecem 'meta' */
  const effectiveStatusOp: StatusOperacional = isCenarioMeta ? 'programado' : statusOp as StatusOperacional;
  const isMeta = isCenarioMeta; // Meta usa estilo laranja

  // ── Bloqueio META: mesma lógica do painel inteligente ──
  const metaBloqueio = useMetaValidacaoBloqueios(
    data ? Number(data.slice(0, 4)) : new Date().getFullYear(),
    data ? Number(data.slice(5, 7)) : new Date().getMonth() + 1,
    (categoria || '') as Categoria | '',
    tipo,
    Number(quantidade) || 0,
    Number(pesoKg) || 0,
    clienteAtual?.id,
  );
  const isConfirmado = statusOp === 'programado';
  const isConciliado = statusOp === 'realizado';
  const isAbate = tipo === 'abate';
  const isNascimento = tipo === 'nascimento';
  const isMorte = tipo === 'morte';
  const isCompra = tipo === 'compra';
  const isVenda = tipo === 'venda';
  const isConsumo = tipo === 'consumo';
  const isTransferencia = tipo === 'transferencia_entrada' || tipo === 'transferencia_saida';
  const isTransferenciaSaida = tipo === 'transferencia_saida';
  const hasFinancialImpact = !isNascimento && !isMorte && !isTransferencia;

  const usaPrecoArroba = isAbate;
  const usaPrecoKg = !isAbate && !isNascimento;

  const categoriasDisponiveis = useMemo(() => {
    if (isNascimento) return CATEGORIAS.filter(c => c.value === 'mamotes_m' || c.value === 'mamotes_f');
    return CATEGORIAS;
  }, [isNascimento]);

  // Import buildAbateCalculation for the abate-specific unified calc
  const abateCalc = useMemo((): AbateCalculation | null => {
    if (!isAbate || !abateDetalhes) return null;
    return buildAbateCalculation({
      quantidade: Number(quantidade) || 0,
      pesoKg: Number(pesoKg) || 0,
      pesoCarcacaKg: abateDetalhes.pesoCarcacaKgManual || undefined,
      rendCarcaca: abateDetalhes.rendCarcaca || undefined,
      precoArroba: abateDetalhes.precoArroba || undefined,
      funruralPct: abateDetalhes.funruralPct || undefined,
      funruralReais: abateDetalhes.funruralReais || undefined,
      bonusPrecoce: abateDetalhes.bonusPrecoce || undefined,
      bonusPrecoceReais: abateDetalhes.bonusPrecoceReais || undefined,
      bonusQualidade: abateDetalhes.bonusQualidade || undefined,
      bonusQualidadeReais: abateDetalhes.bonusQualidadeReais || undefined,
      bonusListaTrace: abateDetalhes.bonusListaTrace || undefined,
      bonusListaTraceReais: abateDetalhes.bonusListaTraceReais || undefined,
      descontoQualidade: abateDetalhes.descontoQualidade || undefined,
      descontoQualidadeReais: abateDetalhes.descontoQualidadeReais || undefined,
      outrosDescontos: abateDetalhes.outrosDescontos || undefined,
      outrosDescontosArroba: abateDetalhes.outrosDescontosArroba || undefined,
      formaReceb: abateDetalhes.formaReceb,
      qtdParcelas: abateDetalhes.qtdParcelas || undefined,
      parcelas: abateDetalhes.parcelas,
    });
  }, [isAbate, abateDetalhes, quantidade, pesoKg]);

  // Transferência Saída — unified calc (single source of truth)
  const transferenciaCalc = useMemo(() => {
    if (!isTransferenciaSaida) return null;
    return buildTransferenciaCalculation({
      quantidade: Number(quantidade) || 0,
      pesoKg: Number(pesoKg) || 0,
      categoria,
      fazendaOrigem: nomeFazenda || fazendaOrigem,
      fazendaDestino,
      data,
      statusOperacional: isCenarioMeta ? null : effectiveStatusOp,
      observacao,
      precoReferenciaArroba: transferenciaDetalhes?.precoReferenciaArroba || undefined,
      precoReferenciaCabeca: transferenciaDetalhes?.precoReferenciaCabeca || undefined,
    });
  }, [isTransferenciaSaida, quantidade, pesoKg, categoria, fazendaOrigem, fazendaDestino, data, statusOp, observacao, transferenciaDetalhes, nomeFazenda]);

  // Venda em Pé — unified calc (single source of truth)
  const vendaCalc = useMemo((): VendaCalculation | null => {
    if (!isVenda || !vendaDetalhes) return null;
    const tipoPrecoEngine = vendaDetalhes.tipoPreco === 'por_total' ? 'por_cab' as const
      : vendaDetalhes.tipoPreco === 'por_cab' ? 'por_cab' as const
      : vendaDetalhes.tipoPreco === 'por_kg' ? 'por_kg' as const
      : 'por_kg' as const;
    return buildVendaCalculation({
      quantidade: Number(quantidade) || 0,
      pesoKg: Number(pesoKg) || 0,
      categoria,
      fazendaOrigem: nomeFazenda || fazendaOrigem,
      compradorNome: abateFornecedores.find(f => f.id === vendaDestinoFornecedorId)?.nome || '',
      data,
      statusOperacional: isCenarioMeta ? null : effectiveStatusOp,
      observacao,
      tipoPreco: tipoPrecoEngine,
      precoInput: vendaDetalhes.precoInput || vendaPrecoInput,
      tipoVenda: vendaDetalhes.tipoVenda,
      frete: vendaDetalhes.frete,
      comissaoPct: vendaDetalhes.comissaoPct,
      outrosCustos: vendaDetalhes.outrosCustos,
      funruralPct: vendaDetalhes.funruralPct,
      funruralReais: vendaDetalhes.funruralReais,
      notaFiscal: vendaDetalhes.notaFiscal,
      formaReceb: vendaDetalhes.formaReceb,
      qtdParcelas: vendaDetalhes.qtdParcelas,
      parcelas: vendaDetalhes.parcelas,
    });
  }, [isVenda, vendaDetalhes, quantidade, pesoKg, categoria, fazendaOrigem, data, statusOp, observacao, vendaPrecoInput, nomeFazenda, abateFornecedores, vendaDestinoFornecedorId]);

  const calc = useMemo(() => {
    const qtd = Number(quantidade) || 0;
    const peso = Number(pesoKg) || 0;

    // For abate, use the official abateCalc
    if (isAbate && abateCalc) {
      return {
        pesoArroba: abateCalc.pesoArrobaCab,
        totalArrobas: abateCalc.totalArrobas,
        totalKg: abateCalc.totalKg,
        valorBruto: abateCalc.valorBase,
        totalBonus: abateCalc.totalBonus,
        totalDescontos: abateCalc.funruralTotal + abateCalc.totalDescontos,
        comissaoVal: 0, freteVal: 0, outrasDespVal: 0,
        valorLiquido: abateCalc.valorLiquido,
        liqArroba: abateCalc.liqArroba,
        liqCabeca: abateCalc.liqCabeca,
        liqKg: abateCalc.liqKg,
        carcacaCalc: abateCalc.carcacaCalc,
        bonusPrecoceTotal: abateCalc.bonusPrecoceTotal,
        bonusQualidadeTotal: abateCalc.bonusQualidadeTotal,
        bonusListaTraceTotal: abateCalc.bonusListaTraceTotal,
        descQualidadeTotal: abateCalc.descQualidadeTotal,
        descFunruralTotal: abateCalc.funruralTotal,
        descOutrosTotal: abateCalc.descOutrosTotal,
      };
    }

    // Non-abate path (unchanged)
    const abRendCarcaca = Number(rendCarcaca) || 0;
    const abPrecoArroba = Number(precoArroba) || 0;
    const abBonusPrecoce = Number(bonusPrecoce) || 0;
    const abBonusQualidade = Number(bonusQualidade) || 0;
    const abBonusListaTrace = Number(bonusListaTrace) || 0;
    const abDescQualidade = Number(descontoQualidade) || 0;
    const abFunruralPct = Number(funruralPct) || 0;
    const abFunruralReais = Number(funruralReais) || 0;
    const abOutrosDescontos = Number(outrosDescontos) || 0;

    // For venda with modal detalhes (normal venda only), source from vendaDetalhes
    const isVendaNormal = isVenda && vendaDetalhes && (vendaDetalhes.tipoVenda === 'desmama' || vendaDetalhes.tipoVenda === 'gado_adulto');

    const rend = abRendCarcaca;
    const carcacaCalc = rend > 0 ? peso * rend / 100 : Number(pesoCarcacaKg) || 0;
    let pesoArroba = peso > 0 ? peso / 30 : 0;
    const totalArrobas = pesoArroba * qtd;
    const totalKg = peso * qtd;
    let valorBruto = 0;
    if (isVenda) {
      const vi = Number(vendaPrecoInput) || 0;
      if (vendaTipoPreco === 'por_kg') { valorBruto = totalKg * vi; }
      else if (vendaTipoPreco === 'por_cab') { valorBruto = qtd * vi; }
      else if (vendaTipoPreco === 'por_total') { valorBruto = vi; }
    }
    else if (usaPrecoKg) { valorBruto = totalKg * (Number(precoKg) || 0); }
    const bonusPrecoceTotal = 0;
    const bonusQualidadeTotal = 0;
    const bonusListaTraceTotal = 0;
    const descQualidadeTotal = Number(descontoQualidade) || 0;
    const funruralReaisVal = abFunruralReais;
    const descFunruralTotal = isVenda
      ? (funruralReaisVal > 0 ? funruralReaisVal : valorBruto * abFunruralPct / 100)
      : 0;
    const descOutrosTotal = isVenda ? abOutrosDescontos : 0;
    const totalBonus = Number(bonus) || 0;
    const totalDescontos = isVenda
      ? descQualidadeTotal + descFunruralTotal + descOutrosTotal
      : (Number(descontos) || 0);
    const comissaoVal = valorBruto * (Number(comissaoPct) || 0) / 100;
    const freteVal = Number(frete) || 0;
    const outrasDespVal = Number(outrasDespesas) || 0;
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
  }, [quantidade, pesoKg, pesoCarcacaKg, rendCarcaca, precoArroba, precoKg, bonusPrecoce, bonusQualidade, bonusListaTrace, descontoQualidade, funruralPct, funruralReais, outrosDescontos, bonus, descontos, comissaoPct, frete, outrasDespesas, isAbate, isVenda, usaPrecoArroba, usaPrecoKg, vendaTipoPreco, vendaPrecoInput, vendaDetalhes, abateDetalhes, abateCalc]);

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
    setVendaDetalhes(null);
    setBoitelDataForResumo(null);
    pendingFornecedorMatch.current = null;
  };

  const resetAllFields = () => {
    setQuantidade('');
    setCategoria('');
    setPesoKg('');
    setFazendaOrigem('');
    setFazendaDestino('');
    setData('');
    setStatusOp('realizado');
    setLastSavedLancamentoId(null);
    setEditingAbateId(null);
    setDetalheId(null);
    setFinanceiroOpen(false);
    setCompraDetalhes(null);
    setCompraDialogOpen(false);
    setAbateDetalhes(null);
    setAbateDialogOpen(false);
    setTransferenciaDetalhes(null);
    setTransferenciaDialogOpen(false);
    resetFinancialFields();
    vendaFinanceiroRef.current?.resetForm();
    consumoFinanceiroRef.current?.resetForm();
  };

  const handleCancelEdit = useCallback(() => {
    setEditingAbateId(null);
    setQuantidade(''); setCategoria(''); setPesoKg('');
    setFazendaOrigem(''); setFazendaDestino('');
    setData(format(new Date(), 'yyyy-MM-dd'));
    setObservacao(''); setStatusOp('realizado');
    resetFinancialFields();
    // Restore internal origin context if editing from within the same tab
    const ctx = internalEditOrigin.current;
    if (ctx) {
      setAba(ctx.aba);
      setAnoFiltro(ctx.anoFiltro);
      setMesFiltro(ctx.mesFiltro);
      internalEditOrigin.current = null;
    }
    if (onReturnFromEdit) onReturnFromEdit();
  }, [onReturnFromEdit]);

  // Helper: restore edit origin context (internal or external)
  const restoreEditOrigin = useCallback(() => {
    const ctx = internalEditOrigin.current;
    if (ctx) {
      setAba(ctx.aba);
      setAnoFiltro(ctx.anoFiltro);
      setMesFiltro(ctx.mesFiltro);
      internalEditOrigin.current = null;
    }
    onReturnFromEdit?.();
  }, [onReturnFromEdit]);

  const loadAbateForEdit = useCallback((l: Lancamento) => {
    // Save current context before switching to edit mode
    if (!onReturnFromEdit) {
      internalEditOrigin.current = { aba, anoFiltro, mesFiltro };
    }
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
    setStatusOp(l.cenario === 'meta' ? 'meta' : ((l.statusOperacional as StatusOperacional) || 'realizado'));
    setNotaFiscal(l.notaFiscal || '');

    // 3. Check for snapshot first (PRIORITY 1)
    const snap = l.detalhesSnapshot;
    if (snap && snap.type === 'abate') {
      // Direct restore from snapshot
      setTipoPeso(snap.tipoPeso || 'vivo');
      setDataVenda(snap.dataVenda || '');
      setDataEmbarque(snap.dataEmbarque || '');
      setDataAbate(snap.dataAbate || l.data || '');
      setTipoVenda(snap.tipoVenda || '');
      setPrecoArroba(snap.precoArroba || '');
      setRendCarcaca(snap.rendCarcaca || '');
      setBonusPrecoce(snap.bonusPrecoce || '');
      setBonusQualidade(snap.bonusQualidade || '');
      setBonusListaTrace(snap.bonusListaTrace || '');
      setDescontoQualidade(snap.descontoQualidade || '');
      setFunruralPct(snap.funruralPct || '');
      setFunruralReais(snap.funruralReais || '');
      setOutrosDescontos(snap.outrosDescontos || '');

      setAbateDetalhes({
        dataVenda: snap.dataVenda || '',
        dataEmbarque: snap.dataEmbarque || '',
        dataAbate: snap.dataAbate || l.data || '',
        tipoVenda: snap.tipoVenda || '',
        tipoPeso: snap.tipoPeso || 'vivo',
        rendCarcaca: snap.rendCarcaca || '',
        precoArroba: snap.precoArroba || '',
        bonusPrecoce: snap.bonusPrecoce || '',
        bonusQualidade: snap.bonusQualidade || '',
        bonusListaTrace: snap.bonusListaTrace || '',
        descontoQualidade: snap.descontoQualidade || '',
        funruralPct: snap.funruralPct || '',
        funruralReais: snap.funruralReais || '',
        outrosDescontos: snap.outrosDescontos || '',
        notaFiscal: snap.notaFiscal || '',
        formaReceb: snap.formaReceb || 'avista',
        qtdParcelas: snap.qtdParcelas || '1',
        parcelas: snap.parcelas || [],
      });
    } else {
      // FALLBACK: reconstruct from lancamento fields
      setTipoPeso(l.tipoPeso || 'vivo');
      setDataVenda(l.dataVenda || '');
      setDataEmbarque(l.dataEmbarque || '');
      setDataAbate(l.dataAbate || l.data || '');
      setTipoVenda(l.tipoVenda || '');
      setPrecoArroba(l.precoArroba ? String(l.precoArroba) : '');
      setPesoCarcacaKg(l.pesoCarcacaKg ? String(l.pesoCarcacaKg) : '');

      if (l.pesoCarcacaKg && l.pesoMedioKg && l.pesoMedioKg > 0) {
        setRendCarcaca(String(((l.pesoCarcacaKg / l.pesoMedioKg) * 100).toFixed(2)));
      } else {
        setRendCarcaca('');
      }

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
    }

    // Store pending fornecedor match in ref (will be applied by effect when list is ready)
    pendingFornecedorMatch.current = {
      tipo: 'abate',
      id: snap?.fornecedorId,
      nome: snap?.fornecedorNome || l.fazendaDestino,
      lancamentoId: l.id,
    };

    // Try immediate match if fornecedores already loaded
    const matchedFornecedor = matchFornecedor(abateFornecedores, {
      id: snap?.fornecedorId,
      nome: snap?.fornecedorNome || l.fazendaDestino,
    });

    if (matchedFornecedor) {
      setAbateFornecedorId(matchedFornecedor.id);
      pendingFornecedorMatch.current = null;
    }

    // 8. Set editing mode
    setEditingAbateId(l.id);
    setDetalheId(null);
    setLastSavedLancamentoId(null);
  }, [abateFornecedores, aba, anoFiltro, mesFiltro, onReturnFromEdit]);

  // Auto-load abate for editing when navigated from another tab
  useEffect(() => {
    if (abateParaEditar && abateFornecedores.length > 0) {
      loadAbateForEdit(abateParaEditar);
    }
  }, [abateParaEditar, abateFornecedores]);

  // CRITICAL: Apply pending fornecedor match whenever fornecedores list changes
  useEffect(() => {
    if (abateFornecedores.length === 0) return;

    const pending = pendingFornecedorMatch.current;
    if (!pending) return;

    const matched = matchFornecedor(abateFornecedores, { id: pending.id, nome: pending.nome });
    if (matched) {
      if (pending.tipo === 'abate') setAbateFornecedorId(matched.id);
      else if (pending.tipo === 'venda') setVendaDestinoFornecedorId(matched.id);
      else if (pending.tipo === 'compra') setCompraFornecedorId(matched.id);
      pendingFornecedorMatch.current = null;
      return;
    }

    // If no match in cached list, try direct DB lookup
    if (pending.id) {
      supabase
        .from('financeiro_fornecedores')
        .select('id, nome, nome_normalizado, aliases')
        .eq('id', pending.id)
        .maybeSingle()
        .then(({ data: forn }) => {
          if (forn) {
            setAbateFornecedores(prev => {
              if (prev.some(f => f.id === forn.id)) return prev;
              return [...prev, { id: forn.id, nome: forn.nome, nomeNormalizado: forn.nome_normalizado, aliases: forn.aliases as string[] | null }].sort((a, b) => a.nome.localeCompare(b.nome));
            });
            if (pending.tipo === 'abate') setAbateFornecedorId(forn.id);
            else if (pending.tipo === 'venda') setVendaDestinoFornecedorId(forn.id);
            else if (pending.tipo === 'compra') setCompraFornecedorId(forn.id);
            pendingFornecedorMatch.current = null;
          }
        });
    }

    // Also try via financeiro vinculado
    if (pending.lancamentoId) {
      supabase
        .from('financeiro_lancamentos_v2')
        .select('favorecido_id')
        .eq('movimentacao_rebanho_id', pending.lancamentoId)
        .not('favorecido_id', 'is', null)
        .limit(1)
        .then(({ data: finRecs }) => {
          if (!finRecs?.[0]?.favorecido_id) return;
          const favId = finRecs[0].favorecido_id;
          const matchedFin = matchFornecedor(abateFornecedores, { id: favId, nome: pending.nome });
          if (matchedFin) {
            if (pending.tipo === 'abate') setAbateFornecedorId(matchedFin.id);
            else if (pending.tipo === 'venda') setVendaDestinoFornecedorId(matchedFin.id);
            else if (pending.tipo === 'compra') setCompraFornecedorId(matchedFin.id);
            pendingFornecedorMatch.current = null;
          } else {
            supabase
              .from('financeiro_fornecedores')
              .select('id, nome, nome_normalizado, aliases')
              .eq('id', favId)
              .maybeSingle()
              .then(({ data: forn }) => {
                if (forn) {
                  setAbateFornecedores(prev => {
                    if (prev.some(f => f.id === forn.id)) return prev;
                    return [...prev, { id: forn.id, nome: forn.nome, nomeNormalizado: forn.nome_normalizado, aliases: forn.aliases as string[] | null }].sort((a, b) => a.nome.localeCompare(b.nome));
                  });
                  if (pending.tipo === 'abate') setAbateFornecedorId(forn.id);
                  else if (pending.tipo === 'venda') setVendaDestinoFornecedorId(forn.id);
                  else if (pending.tipo === 'compra') setCompraFornecedorId(forn.id);
                  pendingFornecedorMatch.current = null;
                }
              });
          }
        });
    }
  }, [abateFornecedores]);

  // Load venda into form for editing
  const loadVendaForEdit = useCallback(async (l: Lancamento) => {
    // Save current context before switching to edit mode
    if (!onReturnFromEdit) {
      internalEditOrigin.current = { aba, anoFiltro, mesFiltro };
    }
    // 1. Set tab & type
    setAba('saida');
    setTipo('venda');

    // 2. Zootechnical data
    setData(l.data);
    setCategoria(l.categoria);
    setQuantidade(String(l.quantidade));
    setPesoKg(l.pesoMedioKg ? String(l.pesoMedioKg) : '');
    setFazendaOrigem(l.fazendaOrigem || '');
    setFazendaDestino(l.fazendaDestino || '');
    setObservacao(l.observacao || '');
    setStatusOp(l.cenario === 'meta' ? 'meta' : ((l.statusOperacional as StatusOperacional) || 'realizado'));
    setNotaFiscal(l.notaFiscal || '');

    // 3. Fornecedor: use pendingFornecedorMatch ref for robust loading
    const snap = l.detalhesSnapshot;
    const isBoitelSnap = snap?.type === 'venda_boitel';
    const snapVendaFornId = (snap?.type === 'venda' || isBoitelSnap) ? snap.fornecedorId : undefined;
    const snapVendaFornNome = (snap?.type === 'venda' || isBoitelSnap) ? snap.fornecedorNome : undefined;

    pendingFornecedorMatch.current = {
      tipo: 'venda',
      id: snapVendaFornId,
      nome: snapVendaFornNome || l.fazendaDestino,
      lancamentoId: l.id,
    };

    const matchedVendaForn = matchFornecedor(abateFornecedores, {
      id: snapVendaFornId,
      nome: snapVendaFornNome || l.fazendaDestino,
    });
    if (matchedVendaForn) {
      setVendaDestinoFornecedorId(matchedVendaForn.id);
      pendingFornecedorMatch.current = null;
    }

    // 4. Check for snapshot first (PRIORITY 1)
    const vendaSnap = l.detalhesSnapshot;
    if (vendaSnap && vendaSnap.type === 'venda_boitel') {
      setTipoPeso('boitel');
      // Store snapshot boitelData for rehydration via initialBoitelData prop
      if (vendaSnap.boitelSnapshot) {
        setBoitelDataForResumo(vendaSnap.boitelSnapshot as any);
      }
      console.log('[Venda Edit] Rehydrating Boitel from snapshot', vendaSnap);
    } else if (vendaSnap && vendaSnap.type === 'venda') {
      const tv = vendaSnap.tipoVenda || 'gado_adulto';
      setTipoPeso(tv);

      const vendaDet: VendaDetalhes = {
        tipoVenda: (tv === 'desmama' || tv === 'gado_adulto') ? tv as 'desmama' | 'gado_adulto' : 'gado_adulto',
        tipoPreco: vendaSnap.tipoPreco || 'por_kg',
        precoInput: vendaSnap.precoInput || '',
        frete: vendaSnap.frete || '',
        comissaoPct: vendaSnap.comissaoPct || '',
        outrosCustos: vendaSnap.outrosCustos || '',
        funruralPct: vendaSnap.funruralPct || '',
        funruralReais: vendaSnap.funruralReais || '',
        notaFiscal: vendaSnap.notaFiscal || '',
        formaReceb: vendaSnap.formaReceb || 'avista',
        qtdParcelas: vendaSnap.qtdParcelas || '1',
        parcelas: vendaSnap.parcelas || [],
      };

      setVendaDetalhes(vendaDet);
      setVendaTipoPreco(vendaDet.tipoPreco);
      setVendaPrecoInput(vendaDet.precoInput);
      setFunruralPct(vendaDet.funruralPct);
      setFunruralReais(vendaDet.funruralReais);
      setFrete(vendaDet.frete);
      setComissaoPct(vendaDet.comissaoPct);
      setOutrosDescontos(vendaDet.outrosCustos);
    } else {
      // FALLBACK: reconstruct from lancamento + financial records
      const tv = l.tipoVenda || 'gado_adulto';
      setTipoPeso(tv);

      let tipoPreco: 'por_kg' | 'por_cab' | 'por_total' = 'por_kg';
      if (l.tipoPeso === 'por_kg' || l.tipoPeso === 'por_cab' || l.tipoPeso === 'por_total') {
        tipoPreco = l.tipoPeso as 'por_kg' | 'por_cab' | 'por_total';
      }
      const precoInput = l.precoArroba ? String(l.precoArroba) : '';

      let freteVal = '';
      let comissaoVal = '';
      let formaReceb: 'avista' | 'prazo' = 'avista';
      let parcelasArr: { data: string; valor: number }[] = [];

      try {
        const { data: finRecs } = await supabase
          .from('financeiro_lancamentos_v2')
          .select('origem_tipo, valor, data_pagamento, descricao, sinal')
          .eq('movimentacao_rebanho_id', l.id)
          .eq('cancelado', false)
          .order('data_pagamento', { ascending: true });

        if (finRecs && finRecs.length > 0) {
          const freteRec = finRecs.find(r => r.origem_tipo === 'venda:frete');
          if (freteRec) freteVal = String(freteRec.valor);

          const comissaoRec = finRecs.find(r => r.origem_tipo === 'venda:comissao');
          const parcelaRecs = finRecs.filter(r => r.origem_tipo === 'venda:parcela');
          if (parcelaRecs.length > 1) {
            formaReceb = 'prazo';
            parcelasArr = parcelaRecs.map(p => ({ data: p.data_pagamento || l.data, valor: p.valor }));
          } else if (parcelaRecs.length === 1) {
            const p = parcelaRecs[0];
            if (p.data_pagamento && p.data_pagamento !== l.data) {
              formaReceb = 'prazo';
              parcelasArr = [{ data: p.data_pagamento, valor: p.valor }];
            }
          }
          if (comissaoRec) {
            const totalBruto = parcelaRecs.reduce((s, r) => s + r.valor, 0);
            if (totalBruto > 0) comissaoVal = String(((comissaoRec.valor / totalBruto) * 100).toFixed(2));
          }
        }
      } catch (err) {
        console.warn('Erro ao carregar financeiro da venda para edição:', err);
      }

      const vendaDet: VendaDetalhes = {
        tipoVenda: (tv === 'desmama' || tv === 'gado_adulto') ? tv as 'desmama' | 'gado_adulto' : 'gado_adulto',
        tipoPreco,
        precoInput,
        frete: freteVal,
        comissaoPct: comissaoVal,
        outrosCustos: l.outrosDescontos ? String(l.outrosDescontos) : '',
        funruralPct: '',
        funruralReais: '',
        notaFiscal: l.notaFiscal || '',
        formaReceb,
        qtdParcelas: parcelasArr.length > 0 ? String(parcelasArr.length) : '1',
        parcelas: parcelasArr,
      };

      // Reverse-calc funrural
      if (l.descontoFunrural && l.descontoFunrural > 0) {
        const qtd = l.quantidade || 0;
        const peso = l.pesoMedioKg || 0;
        const totalKgCalc = qtd * peso;
        const storedPreco = l.precoArroba || 0;
        let estimatedBruto = 0;
        if (tipoPreco === 'por_kg') estimatedBruto = totalKgCalc * storedPreco;
        else if (tipoPreco === 'por_cab') estimatedBruto = qtd * storedPreco;
        else if (tipoPreco === 'por_total') estimatedBruto = storedPreco;
        if (estimatedBruto > 0) {
          const pct = (l.descontoFunrural / estimatedBruto) * 100;
          if (pct > 0.5 && pct < 10) vendaDet.funruralPct = String(pct.toFixed(2));
          else vendaDet.funruralReais = String(l.descontoFunrural);
        } else {
          vendaDet.funruralReais = String(l.descontoFunrural);
        }
      }

      setVendaDetalhes(vendaDet);
      setVendaTipoPreco(vendaDet.tipoPreco);
      setVendaPrecoInput(vendaDet.precoInput);
      setFunruralPct(vendaDet.funruralPct);
      setFunruralReais(vendaDet.funruralReais);
      setFrete(vendaDet.frete);
      setComissaoPct(vendaDet.comissaoPct);
      setOutrosDescontos(vendaDet.outrosCustos);
      setDescontoQualidade(l.descontoQualidade ? String(l.descontoQualidade) : '');
    }

    // 10. Set editing mode
    setEditingAbateId(l.id);
    setDetalheId(null);
    setLastSavedLancamentoId(null);
  }, [abateFornecedores, clienteAtual, fazendaAtual, aba, anoFiltro, mesFiltro, onReturnFromEdit]);

  // Auto-load venda for editing when navigated from another tab
  useEffect(() => {
    if (vendaParaEditar && abateFornecedores.length > 0) {
      loadVendaForEdit(vendaParaEditar);
    }
  }, [vendaParaEditar, abateFornecedores]);

  // Load compra into form for editing
  const loadCompraForEdit = useCallback(async (l: Lancamento) => {
    // Save current context before switching to edit mode
    if (!onReturnFromEdit) {
      internalEditOrigin.current = { aba, anoFiltro, mesFiltro };
    }
    setAba('entrada');
    setTipo('compra');
    setData(l.data);
    setCategoria(l.categoria);
    setQuantidade(String(l.quantidade));
    setPesoKg(l.pesoMedioKg ? String(l.pesoMedioKg) : '');
    setFazendaOrigem(l.fazendaOrigem || '');
    setFazendaDestino(l.fazendaDestino || '');
    setObservacao(l.observacao || '');
    setStatusOp(l.cenario === 'meta' ? 'meta' : ((l.statusOperacional as StatusOperacional) || 'realizado'));
    setNotaFiscal(l.notaFiscal || '');

    // Fornecedor: use pendingFornecedorMatch ref for robust loading
    const compraSnap = l.detalhesSnapshot;
    const snapCompraFornId = compraSnap?.type === 'compra' ? compraSnap.fornecedorId : undefined;
    const snapCompraFornNome = compraSnap?.type === 'compra' ? compraSnap.fornecedorNome : undefined;

    pendingFornecedorMatch.current = {
      tipo: 'compra',
      id: snapCompraFornId,
      nome: snapCompraFornNome || l.fazendaOrigem,
      lancamentoId: l.id,
    };

    const matchedCompraForn = matchFornecedor(abateFornecedores, {
      id: snapCompraFornId,
      nome: snapCompraFornNome || l.fazendaOrigem,
    });
    if (matchedCompraForn) {
      setCompraFornecedorId(matchedCompraForn.id);
      pendingFornecedorMatch.current = null;
    }

    // PRIORITY 1: snapshot
    if (compraSnap && compraSnap.type === 'compra') {
      const det: CompraDetalhes = {
        tipoPreco: compraSnap.tipoPreco || 'por_kg',
        precoKg: compraSnap.precoKg || '',
        precoCab: compraSnap.precoCab || '',
        valorTotal: compraSnap.valorTotal || '',
        frete: compraSnap.frete || '',
        comissaoPct: compraSnap.comissaoPct || '',
        formaPag: compraSnap.formaPag || 'avista',
        qtdParcelas: compraSnap.qtdParcelas || '1',
        parcelas: compraSnap.parcelas || [],
        notaFiscal: compraSnap.notaFiscal || '',
      };
      setCompraDetalhes(det);
    } else {
      // FALLBACK: reconstruct from lancamento + financeiros
      let tipoPreco: 'por_kg' | 'por_cab' | 'por_total' = 'por_kg';
      let precoKgVal = '';
      let precoCabVal = '';
      let valorTotalVal = '';
      let freteVal = '';
      let comissaoVal = '';
      let formaPag: 'avista' | 'prazo' = 'avista';
      let parcelasArr: { data: string; valor: number }[] = [];

      // Infer price type from stored data
      if (l.precoArroba) {
        // Try to infer
        const qtd = l.quantidade || 0;
        const peso = l.pesoMedioKg || 0;
        const totalKg = qtd * peso;
        const stored = l.precoArroba;
        // If close to per-kg value
        if (totalKg > 0 && l.valorTotal && Math.abs(totalKg * stored - (l.valorTotal || 0)) < 1) {
          tipoPreco = 'por_kg';
          precoKgVal = String(stored);
        } else if (qtd > 0 && l.valorTotal && Math.abs(qtd * stored - (l.valorTotal || 0)) < 1) {
          tipoPreco = 'por_cab';
          precoCabVal = String(stored);
        } else {
          tipoPreco = 'por_kg';
          precoKgVal = String(stored);
        }
      }

      try {
        const { data: finRecs } = await supabase
          .from('financeiro_lancamentos_v2')
          .select('origem_tipo, valor, data_pagamento')
          .eq('movimentacao_rebanho_id', l.id)
          .eq('cancelado', false)
          .order('data_pagamento', { ascending: true });

        if (finRecs && finRecs.length > 0) {
          const freteRec = finRecs.find(r => r.origem_tipo === 'compra:frete');
          if (freteRec) freteVal = String(freteRec.valor);

          const comissaoRec = finRecs.find(r => r.origem_tipo === 'compra:comissao');
          const parcelaRecs = finRecs.filter(r => r.origem_tipo === 'compra:parcela');
          if (parcelaRecs.length > 1) {
            formaPag = 'prazo';
            parcelasArr = parcelaRecs.map(p => ({ data: p.data_pagamento || l.data, valor: p.valor }));
          }
          if (comissaoRec) {
            const totalBruto = parcelaRecs.reduce((s, r) => s + r.valor, 0);
            if (totalBruto > 0) comissaoVal = String(((comissaoRec.valor / totalBruto) * 100).toFixed(2));
          }
        }
      } catch (err) {
        console.warn('Erro ao carregar financeiro da compra para edição:', err);
      }

      setCompraDetalhes({
        tipoPreco,
        precoKg: precoKgVal,
        precoCab: precoCabVal,
        valorTotal: valorTotalVal,
        frete: freteVal,
        comissaoPct: comissaoVal,
        formaPag,
        qtdParcelas: parcelasArr.length > 0 ? String(parcelasArr.length) : '1',
        parcelas: parcelasArr,
        notaFiscal: l.notaFiscal || '',
      });
    }

    setEditingAbateId(l.id);
    setDetalheId(null);
    setLastSavedLancamentoId(null);
  }, [abateFornecedores, aba, anoFiltro, mesFiltro, onReturnFromEdit]);

  // ── Transferência Saída — load for edit ──
  const loadTransferenciaForEdit = useCallback((l: Lancamento) => {
    if (!onReturnFromEdit) {
      internalEditOrigin.current = { aba, anoFiltro, mesFiltro };
    }
    setAba('saida');
    setTipo('transferencia_saida');

    setData(l.data);
    setCategoria(l.categoria);
    setQuantidade(String(l.quantidade));
    setPesoKg(l.pesoMedioKg ? String(l.pesoMedioKg) : '');
    setFazendaOrigem(l.fazendaOrigem || '');
    setFazendaDestino(l.fazendaDestino || '');
    setObservacao(l.observacao || '');
    setStatusOp(l.cenario === 'meta' ? 'meta' : ((l.statusOperacional as StatusOperacional) || 'realizado'));

    // Hydrate from snapshot
    const snap = l.detalhesSnapshot;
    if (snap && (snap._tipo === 'transferencia_saida' || snap.type === 'transferencia_saida')) {
      setTransferenciaDetalhes({
        precoReferenciaArroba: snap.precoReferenciaArroba ? String(snap.precoReferenciaArroba) : '',
        precoReferenciaCabeca: snap.precoReferenciaCabeca ? String(snap.precoReferenciaCabeca) : '',
        observacaoEconomica: snap.observacaoEconomica || '',
      });
    } else {
      setTransferenciaDetalhes(null);
    }

    setEditingAbateId(l.id);
    setDetalheId(null);
    setLastSavedLancamentoId(null);
  }, [aba, anoFiltro, mesFiltro, onReturnFromEdit]);

  // Auto-load compra for editing when navigated from another tab
  useEffect(() => {
    if (compraParaEditar && abateFornecedores.length > 0) {
      loadCompraForEdit(compraParaEditar);
    }
  }, [compraParaEditar, abateFornecedores]);

  // Auto-load transferência for editing when navigated from another tab
  useEffect(() => {
    if (transferenciaParaEditar) {
      loadTransferenciaForEdit(transferenciaParaEditar);
    }
  }, [transferenciaParaEditar]);

  useEffect(() => {
    if (!clienteAtual?.id) {
      setAbateFornecedores([]);
      return;
    }

    let cancelled = false;

    supabase
      .from('financeiro_fornecedores')
      .select('id, nome, nome_normalizado, aliases')
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

        setAbateFornecedores(((data as any[]) || []).map(item => ({
          id: item.id,
          nome: item.nome,
          nomeNormalizado: item.nome_normalizado ?? null,
          aliases: item.aliases ?? null,
        })));
      });

    return () => {
      cancelled = true;
    };
  }, [clienteAtual?.id]);

  // Validate form and open confirmation dialog
  const handleRequestRegister = () => {
    // ── P1 governance block ──
    if (p1Oficial) {
      toast.error('Este mês está fechado no Mapa de Pastos (P1 oficial). Reabra o período para registrar lançamentos.');
      return;
    }
    if (!quantidade || Number(quantidade) <= 0) { toast.error('Informe a quantidade'); return; }
    if (!categoria) { toast.error('Selecione a categoria'); return; }
    if (!data) { toast.error('Informe a data'); return; }

    // ── META: bloqueio via painel inteligente (mesma lógica exata) ──
    if (isCenarioMeta && metaBloqueio.hasBloqueio) {
      toast.error(metaBloqueio.primeiroBloqueio || 'Bloqueio detectado pelo painel inteligente META.');
      return;
    }

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
      if ((statusOp === 'programado' || statusOp === 'realizado') && valorBase <= 0) {
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

    // For Boitel venda, use saldoReceber (financial cash value) as the grid TOTAL
    const isBoitelVenda = isVenda && tipoPeso === 'boitel';
    const boitelSaldo = boitelDataForResumo?._saldoReceber || boitelDataForResumo?._lucroTotal || 0;
    const valorTotalFinal = isBoitelVenda
      ? (boitelSaldo > 0 ? boitelSaldo : undefined)
      : (calc.valorLiquido > 0 ? calc.valorLiquido : undefined);

    const abateDataVenda = isAbate ? (abateDetalhes?.dataVenda || dataVenda || format(new Date(), 'yyyy-MM-dd')) : (dataVenda || undefined);
    const abateDataEmbarque = isAbate && data ? format(addDays(parseISO(data), -1), 'yyyy-MM-dd') : (dataEmbarque || undefined);
    const abateDataAbate = isAbate ? data : (dataAbate || undefined);
    const abTipoPeso = isAbate && abateDetalhes ? abateDetalhes.tipoPeso : tipoPeso;
    const abTipoVenda = isAbate && abateDetalhes ? abateDetalhes.tipoVenda : tipoVenda;
    const abNotaFiscal = isAbate && abateDetalhes ? abateDetalhes.notaFiscal : notaFiscal;

    // For venda: save precoInput to precoArroba, tipoPreco to tipoPeso, tipoVenda to tipoVenda
    const vendaPrecoArrobaFinal = isBoitelVenda && boitelDataForResumo
      ? (boitelDataForResumo.precoVendaArroba || undefined)
      : isVenda && vendaDetalhes
        ? (Number(vendaPrecoInput) || undefined)
        : (isAbate && abateDetalhes ? (Number(abateDetalhes.precoArroba) || undefined) : (numOrUndef(precoArroba) || undefined));
    const tipoPesoFinal = isVenda ? vendaTipoPreco : abTipoPeso;
    const tipoVendaFinal = isVenda ? tipoPeso : abTipoVenda; // tipoPeso state holds desmama/gado_adulto/boitel for venda

    const lancamentoDados: Partial<Omit<Lancamento, 'id'>> = {
      data, tipo, quantidade: Number(quantidade), categoria: categoria as Categoria,
      fazendaOrigem: origemFinal, fazendaDestino: destinoFinal,
      pesoMedioKg: pesoKg ? Number(pesoKg) : undefined,
      pesoMedioArrobas: pesoKg ? kgToArrobas(Number(pesoKg)) : undefined,
      observacao: observacao || undefined,
      pesoCarcacaKg: isAbate ? (calc.carcacaCalc > 0 ? calc.carcacaCalc : undefined) : numOrUndef(pesoCarcacaKg),
      precoArroba: vendaPrecoArrobaFinal,
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
      tipoPeso: tipoPesoFinal,
      statusOperacional: isCenarioMeta ? null : effectiveStatusOp,
      dataVenda: abateDataVenda || undefined,
      dataEmbarque: abateDataEmbarque || undefined,
      dataAbate: abateDataAbate || undefined,
      tipoVenda: tipoVendaFinal || undefined,
      detalhesSnapshot: (() => {
        if (isCompra && compraDetalhes) {
          const fornNome = abateFornecedores.find(f => f.id === compraFornecedorId)?.nome;
          return { type: 'compra', ...compraDetalhes, fornecedorId: compraFornecedorId || undefined, fornecedorNome: fornNome || undefined };
        }
        if (isAbate && abateDetalhes) {
          const fornNome = abateFornecedores.find(f => f.id === abateFornecedorId)?.nome;
          return {
            type: 'abate', ...abateDetalhes,
            fornecedorId: abateFornecedorId || undefined,
            fornecedorNome: fornNome || undefined,
            calculation: abateCalc || abateDetalhes.calculation || undefined,
          };
        }
        if (isVenda && tipoPeso === 'boitel') {
          // Boitel: full snapshot including ALL boitelData fields for rehydration
          const recebSnap = vendaFinanceiroRef.current?.getRecebimentoSnapshot?.();
          const bd = vendaFinanceiroRef.current?.getBoitelData?.();
          return {
            type: 'venda_boitel',
            tipoVenda: 'boitel',
            quantidade: Number(quantidade) || 0,
            pesoKg: Number(pesoKg) || 0,
            categoria,
            data,
            statusOperacional: isCenarioMeta ? null : effectiveStatusOp,
            formaReceb: recebSnap?.formaReceb || 'avista',
            parcelas: recebSnap?.parcelas || [],
            fornecedorId: vendaDestinoFornecedorId || undefined,
            fornecedorNome: abateFornecedores.find(f => f.id === vendaDestinoFornecedorId)?.nome || undefined,
            // Full boitel data for rehydration
            boitelSnapshot: bd ? {
              qtdCabecas: bd.qtdCabecas,
              pesoInicial: bd.pesoInicial,
              fazendaOrigem: bd.fazendaOrigem,
              nomeBoitel: bd.nomeBoitel,
              lote: bd.lote,
              numeroContrato: bd.numeroContrato,
              dataEnvio: bd.dataEnvio,
              quebraViagem: bd.quebraViagem,
              custoOportunidade: bd.custoOportunidade,
              dias: bd.dias,
              gmd: bd.gmd,
              rendimentoEntrada: bd.rendimentoEntrada,
              rendimento: bd.rendimento,
              modalidadeCusto: bd.modalidadeCusto,
              custoDiaria: bd.custoDiaria,
              custoArroba: bd.custoArroba,
              percentualParceria: bd.percentualParceria,
              custosExtrasParceria: bd.custosExtrasParceria,
              custoFrete: bd.custoFrete,
              outrosCustos: bd.outrosCustos,
              custoNutricao: bd.custoNutricao,
              custoSanidade: bd.custoSanidade,
              custoNfAbate: bd.custoNfAbate,
              precoVendaArroba: bd.precoVendaArroba,
              despesasAbate: bd.despesasAbate,
              formaReceb: bd.formaReceb,
              qtdParcelas: bd.qtdParcelas,
              parcelas: bd.parcelas,
              possuiAdiantamento: bd.possuiAdiantamento,
              dataAdiantamento: bd.dataAdiantamento,
              pctAdiantamentoDiarias: bd.pctAdiantamentoDiarias,
              valorAdiantamentoDiarias: bd.valorAdiantamentoDiarias,
              valorAdiantamentoSanitario: bd.valorAdiantamentoSanitario,
              valorAdiantamentoOutros: bd.valorAdiantamentoOutros,
              valorTotalAntecipado: bd.valorTotalAntecipado,
              adiantamentoObservacao: bd.adiantamentoObservacao,
              _faturamentoBruto: bd._faturamentoBruto,
              _faturamentoLiquido: bd._faturamentoLiquido,
              _receitaProdutor: bd._receitaProdutor,
              _custoTotal: bd._custoTotal,
              _lucroTotal: bd._lucroTotal,
              _boitelId: bd._boitelId,
            } : undefined,
          };
        }
        if (isVenda && vendaDetalhes) {
          const fornNome = abateFornecedores.find(f => f.id === vendaDestinoFornecedorId)?.nome;
          const vc = vendaCalc || vendaDetalhes.calculation;
          return {
            ...buildVendaSnapshot(vc || buildVendaCalculation({
              quantidade: Number(quantidade) || 0, pesoKg: Number(pesoKg) || 0, categoria,
              fazendaOrigem: nomeFazenda || fazendaOrigem, compradorNome: fornNome || '',
              data, statusOperacional: isCenarioMeta ? null : effectiveStatusOp, tipoPreco: 'por_kg', precoInput: vendaPrecoInput,
            })),
            type: 'venda',
            ...vendaDetalhes,
            tipoPreco: vendaTipoPreco, precoInput: vendaPrecoInput,
            fornecedorId: vendaDestinoFornecedorId || undefined, fornecedorNome: fornNome || undefined,
          };
        }
        if (isTransferenciaSaida && transferenciaCalc) {
          return {
            type: 'transferencia_saida',
            ...buildTransferenciaSnapshot(transferenciaCalc),
            ...(transferenciaDetalhes ? { observacaoEconomica: transferenciaDetalhes.observacaoEconomica } : {}),
          };
        }
        return undefined;
      })(),
    };

    setSubmitting(true);
    try {
      if (editingAbateId) {
        onEditar(editingAbateId, lancamentoDados);
        if (isAbate && (isConciliado || isConfirmado || isMeta)) {
          // Auto-generate/update financeiro for abate
          if (abateFinanceiroRef.current) {
            await abateFinanceiroRef.current.generateFinanceiro(editingAbateId);
          }
          setEditingAbateId(null);
          setLastSavedLancamentoId(null);
          setQuantidade(''); setCategoria(''); setPesoKg('');
          setFazendaOrigem(''); setFazendaDestino('');
          setData(format(new Date(), 'yyyy-MM-dd'));
          setObservacao(''); setStatusOp('realizado');
          resetFinancialFields();
          toast.success('Abate atualizado com financeiro!');
          restoreEditOrigin();
        } else if (isVenda && (calc.valorLiquido > 0 || tipoPeso === 'boitel')) {
          // Auto-generate/update financeiro for venda
          if (vendaFinanceiroRef.current) {
            await vendaFinanceiroRef.current.generateFinanceiro(editingAbateId);
          }
          vendaFinanceiroRef.current?.resetForm();
          setEditingAbateId(null);
          setLastSavedLancamentoId(null);
          setQuantidade(''); setCategoria(''); setPesoKg('');
          setFazendaOrigem(''); setFazendaDestino('');
          setData(format(new Date(), 'yyyy-MM-dd'));
          setObservacao(''); setStatusOp('realizado');
          resetFinancialFields();
          toast.success('Venda atualizada com financeiro!');
          restoreEditOrigin();
        } else if (isCompra && compraDetalhes && fazendaAtual && clienteAtual) {
          // Re-generate financeiro for compra edit
          await gerarFinanceiroCompra({
            compraDetalhes,
            lancamentoId: editingAbateId,
            clienteId: clienteAtual.id,
            fazendaId: fazendaAtual.id,
            quantidade: Number(quantidade) || 0,
            pesoKg: Number(pesoKg) || 0,
            data,
            categoria,
            statusOp: effectiveStatusOp,
            fazendaOrigem,
            fornecedorId: compraFornecedorId,
          });
          setEditingAbateId(null);
          setLastSavedLancamentoId(null);
          setQuantidade(''); setCategoria(''); setPesoKg('');
          setFazendaOrigem(''); setFazendaDestino('');
          setData(format(new Date(), 'yyyy-MM-dd'));
          setObservacao(''); setStatusOp('realizado');
          resetFinancialFields();
          setCompraDetalhes(null);
          toast.success('Compra atualizada com financeiro!');
          restoreEditOrigin();
        } else {
          setEditingAbateId(null);
          setLastSavedLancamentoId(null);
          setQuantidade(''); setCategoria(''); setPesoKg('');
          setFazendaOrigem(''); setFazendaDestino('');
          setData(format(new Date(), 'yyyy-MM-dd'));
          setObservacao(''); setStatusOp('realizado');
          resetFinancialFields();
          toast.success('Registro atualizado com sucesso!');
          restoreEditOrigin();
        }
      } else {
        console.log('[Save Flow] Payload final:', { tipo, tipoPeso, isVenda, isAbate, isCompra, snapshot: lancamentoDados.detalhesSnapshot ? JSON.stringify(lancamentoDados.detalhesSnapshot).slice(0, 200) : 'none' });
        const returnedId = await onAdicionar(lancamentoDados as Omit<Lancamento, 'id'>);
        console.log('[Save Flow] Lançamento salvo, returnedId:', returnedId);

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
              statusOp: effectiveStatusOp,
              fazendaOrigem,
              fornecedorId: compraFornecedorId,
            });
          }
          setCompraDetalhes(null);
          setLastSavedLancamentoId(null);
          setQuantidade(''); setCategoria(''); setPesoKg('');
          setFazendaOrigem(''); setFazendaDestino('');
          setData(format(new Date(), 'yyyy-MM-dd'));
          setObservacao(''); setStatusOp('realizado');
          resetFinancialFields();
          toast.success('Compra registrada com sucesso!');
        } else if (isAbate && (isConciliado || isConfirmado || isMeta) && returnedId) {
          // Auto-generate financeiro for abate (like Compras)
          if (abateFinanceiroRef.current) {
            await abateFinanceiroRef.current.generateFinanceiro(returnedId);
          }
          setLastSavedLancamentoId(null);
          setQuantidade(''); setCategoria(''); setPesoKg('');
          setFazendaOrigem(''); setFazendaDestino('');
          setData(format(new Date(), 'yyyy-MM-dd'));
          setObservacao(''); setStatusOp('realizado');
          resetFinancialFields();
          toast.success('Abate registrado com financeiro!');
        } else if (isVenda && returnedId) {
          const isBoitel = tipoPeso === 'boitel';
          console.log('[Save Flow] Venda detectada', { isBoitel, valorLiquido: calc.valorLiquido, temRef: !!vendaFinanceiroRef.current });
          if (vendaFinanceiroRef.current && (calc.valorLiquido > 0 || isBoitel)) {
            const finResult = await vendaFinanceiroRef.current.generateFinanceiro(returnedId);
            console.log('[Save Flow] generateFinanceiro resultado:', finResult);
          }
          vendaFinanceiroRef.current?.resetForm();
          setLastSavedLancamentoId(null);
          setQuantidade(''); setCategoria(''); setPesoKg('');
          setFazendaOrigem(''); setFazendaDestino('');
          setData(format(new Date(), 'yyyy-MM-dd'));
          setObservacao(''); setStatusOp('realizado');
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
          setObservacao(''); setStatusOp('realizado');
          resetFinancialFields();
          toast.success('Consumo registrado com sucesso!');
        } else if (returnedId) {
          setLastSavedLancamentoId(null);
          setQuantidade(''); setCategoria('');
          setPesoKg(tipo === 'nascimento' ? '30' : '');
          setFazendaOrigem(''); setFazendaDestino('');
          setData(format(new Date(), 'yyyy-MM-dd'));
          setObservacao(''); setStatusOp('realizado');
          resetFinancialFields();
          toast.success('Lançamento registrado!');
        } else if (!returnedId) {
          toast.error('Erro ao salvar lançamento. Verifique os dados e tente novamente.');
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
      result.comercializacao = abateDetalhes?.tipoVenda || tipoVenda;
      result.tipoAbate = abateDetalhes?.tipoPeso || tipoPeso;
      // Use official abateCalc — single source of truth
      const ac = abateCalc;
      if (ac) {
        result.rendCarcaca = ac.rendCalc;
        result.totalArrobas = ac.totalArrobas;
        result.precoBase = ac.precoArroba;
        result.precoBaseLabel = 'R$/@';
        result.totalBruto = ac.valorBruto;
        result.totalBonus = ac.totalBonus;
        result.totalDescontos = ac.totalDescontos;
        result.valorLiquido = ac.valorLiquido;
        result.funruralTotal = ac.funruralTotal;
        result.valorBase = ac.valorBase;
        result.liqArroba = ac.liqArroba;
        result.liqCabeca = ac.liqCabeca;
        result.liqKg = ac.liqKg;
      } else {
        result.rendCarcaca = Number(rendCarcaca) || 0;
        result.totalArrobas = calc.totalArrobas;
        result.precoBase = Number(precoArroba) || 0;
        result.precoBaseLabel = 'R$/@';
        result.totalBruto = calc.valorBruto;
        result.totalBonus = calc.totalBonus;
        result.totalDescontos = calc.totalDescontos;
        result.valorLiquido = calc.valorLiquido;
      }
      result.dataVenda = abateDetalhes?.dataVenda || dataVenda || format(new Date(), 'yyyy-MM-dd');
      // Use parcelas from abateDetalhes (official source)
      if (abateDetalhes?.formaReceb === 'prazo' && abateDetalhes.parcelas.length > 0) {
        result.formaPagamento = `A prazo (${abateDetalhes.parcelas.length}x)`;
        result.parcelas = abateDetalhes.parcelas;
      } else if (formaPagamento === 'parcelado' && parcelas.length > 0) {
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
    } else if (isVenda && tipoPeso === 'boitel' && boitelDataForResumo) {
      // ── BOITEL-specific confirmation ──
      const bd = boitelDataForResumo;
      const saldoReceber = bd._saldoReceber || 0;
      result.tipoOperacao = 'Boitel';
      result.fornecedorOuFrigorifico = bd.nomeBoitel || '';
      result.totalBruto = bd._faturamentoBruto || 0;
      result.totalDescontos = bd._custoTotal || 0;
      result.valorLiquido = saldoReceber; // Financial: what actually enters cash
      result.formaPagamento = bd.formaReceb === 'prazo' ? `A prazo (${bd.qtdParcelas}x)` : 'À vista';
      if (bd.formaReceb === 'prazo' && bd.parcelas?.length > 0) {
        result.parcelas = bd.parcelas;
      }
      // Boitel-specific extras for the dialog
      result.boitelDias = bd.dias;
      result.boitelGmd = bd.gmd;
      result.boitelReceitaProdutor = bd._receitaProdutor || 0;
      result.boitelAdiantamento = bd.possuiAdiantamento ? bd.valorTotalAntecipado : 0;
      result.boitelFrete = bd.custoFrete || 0;
      result.boitelResultadoLiquido = bd._lucroTotal || 0; // Economic result (informational)
      result.liqCabeca = bd.qtdCabecas > 0 ? saldoReceber / bd.qtdCabecas : 0;
      result.liqKg = bd.pesoInicial > 0 && bd.qtdCabecas > 0 ? (saldoReceber / bd.qtdCabecas) / bd.pesoInicial : 0;
    } else if (isVenda && vendaCalc) {
      const vc = vendaCalc;
      const tipoPrecoLabel = vendaDetalhes?.tipoPreco === 'por_kg' ? 'R$/kg' : vendaDetalhes?.tipoPreco === 'por_cab' ? 'R$/cab' : 'R$/@';
      result.precoBase = vc.precoInput;
      result.precoBaseLabel = tipoPrecoLabel;
      result.totalBruto = vc.valorBruto;
      result.totalArrobas = vc.totalArrobas;
      result.totalDescontos = vc.totalDespesas + vc.totalDeducoes;
      result.valorLiquido = vc.valorLiquido;
      result.fornecedorOuFrigorifico = vc.compradorNome;
      if (vc.formaReceb === 'prazo' && vc.parcelas.length > 0) {
        result.formaPagamento = `A prazo (${vc.parcelas.length}x)`;
        result.parcelas = vc.parcelas;
      } else {
        result.formaPagamento = 'À vista';
      }
    } else if (isTransferenciaSaida) {
      const tc = transferenciaCalc;
      if (tc && tc.temPrecoReferencia) {
        result.precoBase = tc.precoReferenciaArroba;
        result.precoBaseLabel = 'R$/@ (ref. econômica)';
        result.totalBruto = tc.valorEconomicoLote;
        result.valorLiquido = tc.valorEconomicoLote;
        result.totalArrobas = tc.totalArrobas;
      }
    } else {
      result.precoBase = Number(precoKg) || 0;
      result.precoBaseLabel = 'R$/kg';
      result.totalBruto = calc.valorBruto;
      result.totalBonus = Number(bonus) || 0;
      result.totalDescontos = Number(descontos) || 0;
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

  const metaInputClass = isCenarioMeta ? 'border-orange-400 text-orange-800 dark:text-orange-300' : '';
  const metaLabelClass = isCenarioMeta ? 'text-orange-700 dark:text-orange-400' : '';

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
  const isEditing = !!editingAbateId;
  const renderSidebar = () => {
    const parentCls = (active: boolean) =>
      `w-full flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-[13px] font-bold transition-all ${
        isEditing && !active ? 'opacity-20 cursor-not-allowed pointer-events-none grayscale text-muted-foreground/50 shadow-none' :
        active ? 'bg-primary text-primary-foreground shadow-sm' : 'text-muted-foreground hover:bg-muted/60'
      }`;
    const childCls = (active: boolean) =>
      `w-full flex items-center gap-1.5 px-2 py-1 rounded-md text-[12px] font-semibold transition-all text-left ${
        isEditing && !active ? 'opacity-20 cursor-not-allowed pointer-events-none grayscale text-muted-foreground/50 shadow-none border-transparent' :
        active ? 'bg-primary/15 text-foreground border border-primary/40' : 'text-muted-foreground hover:bg-muted/40 border border-transparent'
      }`;
    const childWrap = "ml-3 mt-0.5 border-l-2 border-primary/30 pl-1.5 space-y-0.5";

    const handleNavClick = (cb: () => void) => {
      if (isEditing) return; // Block navigation during edit
      cb();
    };

    return (
      <div className="shrink-0 space-y-2">
        {/* Entradas */}
        <div>
          <button onClick={() => handleNavClick(() => { setAba('entrada'); setTipo('nascimento'); resetAllFields(); })} className={parentCls(aba === 'entrada')} disabled={isEditing && aba !== 'entrada'}>
            <LogIn className="h-3.5 w-3.5" /> Entradas
          </button>
          <div className={childWrap}>
            {TIPOS_ENTRADA.map(t => (
              <button key={t.value} type="button"
                onClick={() => handleNavClick(() => { setAba('entrada'); setTipo(t.value); resetAllFields(); })}
                className={childCls(aba === 'entrada' && tipo === t.value)}
                disabled={isEditing && !(aba === 'entrada' && tipo === t.value)}>
                <span className="text-[12px]">{t.icon}</span> {t.label}
              </button>
            ))}
          </div>
        </div>

        {/* Saídas */}
        <div>
          <button onClick={() => handleNavClick(() => { setAba('saida'); setTipo('abate'); resetAllFields(); })} className={parentCls(aba === 'saida')} disabled={isEditing && aba !== 'saida'}>
            <LogOut className="h-3.5 w-3.5" /> Saídas
          </button>
          <div className={childWrap}>
            {TIPOS_SAIDA.map(t => (
              <button key={t.value} type="button"
                onClick={() => handleNavClick(() => { setAba('saida'); setTipo(t.value); resetAllFields(); })}
                className={childCls(aba === 'saida' && tipo === t.value)}
                disabled={isEditing && !(aba === 'saida' && tipo === t.value)}>
                <span className="text-[12px]">{t.icon}</span> {t.label}
              </button>
            ))}
          </div>
        </div>

        {/* Evoluir Categoria Animal */}
        <button onClick={() => handleNavClick(() => setAba('reclassificacao'))} className={parentCls(aba === 'reclassificacao')} disabled={isEditing && aba !== 'reclassificacao'}>
          <RefreshCw className="h-3.5 w-3.5" /> Evoluir Categoria
        </button>

        {/* Histórico */}
        <button onClick={() => handleNavClick(() => setAba('historico'))} className={parentCls(aba === 'historico')} disabled={isEditing && aba !== 'historico'}>
          <Clock className="h-3.5 w-3.5" /> Histórico
        </button>
      </div>
    );
  };



  // ===== FINANCIAL DETAILS PANEL (right column — non-abate) =====
  const renderFinancialPanel = () => {

    // Transferência entrada: simple info panel (no economic layer)
    if (tipo === 'transferencia_entrada') {
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
          statusOp={effectiveStatusOp}
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
          onBoitelDataChange={setBoitelDataForResumo}
          initialBoitelData={boitelDataForResumo}
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
          statusOp={effectiveStatusOp}
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
          <Label className={`text-[11px] ${metaLabelClass}`}>R$/kg (preço base)</Label>
          <Input type="number" value={precoKg} onChange={e => setPrecoKg(e.target.value)} placeholder="0,00" className={`h-8 text-[12px] ${metaInputClass}`} />
        </div>
      )}

      {calc.valorBruto > 0 && (
        <div className={`rounded-md p-2 text-[12px] ${isMeta ? 'bg-orange-100 dark:bg-orange-950/30' : 'bg-muted/30'}`}>
          <div className="flex justify-between">
            <span className={isMeta ? 'text-orange-700 dark:text-orange-400' : 'text-muted-foreground'}>Valor total bruto</span>
            <strong className={isMeta ? 'text-orange-800 dark:text-orange-300' : ''}>{formatMoeda(calc.valorBruto)}</strong>
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
            <div><Label className="text-[11px]">Bônus</Label><Input type="number" value={bonus} onChange={e => setBonus(e.target.value)} placeholder="0" className={`h-8 text-[12px] ${metaInputClass}`} /></div>
            <div><Label className="text-[11px]">Descontos</Label><Input type="number" value={descontos} onChange={e => setDescontos(e.target.value)} placeholder="0" className={`h-8 text-[12px] ${metaInputClass}`} /></div>
          </div>
        </>
      )}

      {/* Valor líquido override */}
      <Separator />
      <div>
        <Label className={`text-[11px] font-semibold ${metaLabelClass || 'text-foreground'}`}>Valor total líquido (R$)</Label>
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
          className={`h-8 text-[12px] font-bold ${metaInputClass}`}
        />
        <p className="text-[10px] text-muted-foreground mt-0.5">Retro-calcula o preço base automaticamente</p>
      </div>

      {/* Comissão/Frete/Despesas */}
      {(showComissaoFreteDespesas || showComissaoPrevConf) && (
        <>
          <Separator />
          <h4 className="text-[10px] font-bold text-muted-foreground uppercase">Despesas Operacionais</h4>
          <div className="space-y-1.5">
            <div><Label className="text-[11px]">Comissão (%)</Label><Input type="number" value={comissaoPct} onChange={e => setComissaoPct(e.target.value)} placeholder="0" className={`h-8 text-[12px] ${metaInputClass}`} /></div>
            <div><Label className="text-[11px]">Frete (R$)</Label><Input type="number" value={frete} onChange={e => setFrete(e.target.value)} placeholder="0" className={`h-8 text-[12px] ${metaInputClass}`} /></div>
            <div><Label className="text-[11px]">Outras (R$)</Label><Input type="number" value={outrasDespesas} onChange={e => setOutrasDespesas(e.target.value)} placeholder="0" className={`h-8 text-[12px] ${metaInputClass}`} /></div>
          </div>
        </>
      )}

      {/* Final value */}
      {calc.valorBruto > 0 && (
        <div className={`rounded-md p-2 ${isMeta ? 'bg-orange-200/50 dark:bg-orange-950/50' : 'bg-primary/10'}`}>
          <div className="flex justify-between text-[12px] font-bold">
            <span className={isMeta ? 'text-orange-800 dark:text-orange-300' : ''}>Valor líquido final</span>
            <span className={isMeta ? 'text-orange-800 dark:text-orange-300' : 'text-primary'}>{formatMoeda(calc.valorLiquido)}</span>
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
          Editando {tipo === 'venda' ? 'venda' : tipo === 'abate' ? 'abate' : 'registro'} #{editingAbateId.slice(0, 8)}
        </div>
      )}

      {/* Título da movimentação */}
      <div className="flex items-center gap-2">
        <span className="text-base">{currentTipoIcon}</span>
        <h2 className="text-[15px] font-semibold text-foreground">{editingAbateId ? (tipo === 'venda' ? 'Editar Venda' : tipo === 'abate' ? 'Editar Abate' : 'Editar Registro') : currentTipoLabel}</h2>
      </div>

      {/* STATUS — inline label + cards (Zootécnico: Realizado, Programado, META) */}
      <div className="space-y-1">
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wide shrink-0">Status</span>
          <div className="grid grid-cols-3 gap-1 flex-1">
            {([
              { value: 'realizado' as const, label: STATUS_LABEL.realizado, dot: 'bg-green-600', activeBorder: 'border-green-400', activeBg: 'bg-green-50 dark:bg-green-950/30' },
              { value: 'programado' as const, label: STATUS_LABEL.programado, dot: 'bg-blue-500', activeBorder: 'border-blue-400', activeBg: 'bg-blue-50 dark:bg-blue-950/30' },
              { value: 'meta' as const, label: META_VISUAL.label, dot: META_VISUAL.dot, activeBorder: META_VISUAL.activeBorder, activeBg: META_VISUAL.activeBg },
            ]).map(s => {
              const selected = statusOp === s.value;
              const disabled = s.value === 'meta' && !canEditMeta;
              return (
                <button
                  key={s.value}
                  type="button"
                  onClick={() => !disabled && setStatusOp(s.value)}
                  disabled={disabled}
                  className={`flex items-center justify-center gap-1 h-6 rounded-md border transition-all ${
                    disabled ? 'opacity-40 cursor-not-allowed border-border bg-muted/10' :
                    selected ? `${s.activeBg} ${s.activeBorder}` : 'border-border bg-muted/10 hover:bg-muted/30'
                  }`}
                  title={disabled ? 'Somente consultores podem criar registros META' : undefined}
                >
                  <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${selected ? s.dot : 'border border-muted-foreground/40 bg-transparent'}`} />
                  <span className={`text-[10px] font-bold ${selected ? 'text-foreground' : 'text-muted-foreground'}`}>{s.label}</span>
                </button>
              );
            })}
          </div>
        </div>
        <div className={`rounded-md border px-2 py-1 text-[9px] leading-snug ${
          statusOp === 'realizado' ? 'bg-green-50 dark:bg-green-950/20 border-green-300 dark:border-green-800 text-green-800 dark:text-green-300'
          : statusOp === 'meta' ? 'bg-orange-50 dark:bg-orange-950/20 border-orange-300 dark:border-orange-800 text-orange-800 dark:text-orange-300'
          : 'bg-blue-50 dark:bg-blue-950/20 border-blue-300 dark:border-blue-800 text-blue-800 dark:text-blue-300'
        }`}>
           {getStatusDescription(tipo, statusOp)}
        </div>
      </div>

      <Separator />

      {/* Row 1: Data | Qtd | Peso | Categoria | Obs */}
      <div className="grid grid-cols-[1.2fr_0.8fr_1fr_1.5fr_2.5fr] gap-2 items-end">
        <div>
          <Label className={`font-bold text-[11px] ${metaLabelClass}`}>{isAbate ? 'Data Abate' : 'Data'}</Label>
          <Input tabIndex={1} type="date" value={data} onChange={e => setData(e.target.value)} className={`mt-0.5 h-7 text-[11px] ${metaInputClass}`} />
        </div>
        <div>
          <Label className={`font-bold text-[11px] whitespace-nowrap ${metaLabelClass}`}>Qtd. Cab.</Label>
          <Input tabIndex={2} type="text" inputMode="numeric" value={qtdInput.displayValue} onChange={qtdInput.onChange} onBlur={qtdInput.onBlur} onFocus={qtdInput.onFocus} placeholder="0" className={`mt-0.5 h-7 text-[11px] text-right font-bold tabular-nums ${metaInputClass}`} />
        </div>
        <div>
          <Label className={`font-bold text-[11px] ${metaLabelClass}`}>Peso (kg)</Label>
          <Input tabIndex={3} type="text" inputMode="decimal" value={pesoInput.displayValue} onChange={pesoInput.onChange} onBlur={pesoInput.onBlur} onFocus={pesoInput.onFocus} placeholder="0,00" className={`mt-0.5 h-7 text-[11px] text-right tabular-nums ${metaInputClass}`} />
        </div>
        <div>
          <Label className="font-bold text-[11px]">Categoria</Label>
          <Select value={categoria} onValueChange={v => setCategoria(v as Categoria)}>
            <SelectTrigger tabIndex={4} className="mt-0.5 h-7 text-[11px]"><SelectValue placeholder="Selecione..." /></SelectTrigger>
            <SelectContent className="max-h-52 overflow-y-auto">
              {categoriasDisponiveis.map(c => <SelectItem key={c.value} value={c.value} className="text-[11px] py-1.5">{c.label}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label className="font-bold text-[11px]">Obs.</Label>
          <Input tabIndex={5} value={observacao} onChange={e => setObservacao(e.target.value)} placeholder="Opcional" className="mt-0.5 h-7 text-[11px]" />
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

      {/* Row 2: Origem + Fornecedor/Destino principal (prioridade visual) + extras */}
      {(campos.origem.show || campos.destino?.show) && (
        <div className={`grid gap-2 ${
          isVenda ? 'grid-cols-[minmax(0,1fr)_minmax(0,2fr)_8rem]' :
          campos.origem.show ? 'grid-cols-[minmax(0,1fr)_minmax(0,2fr)]' :
          'grid-cols-[minmax(0,2fr)_minmax(0,1fr)]'
        }`}>
          {campos.origem.show && (
            <div>
              <Label className="font-bold text-[11px]">{campos.origem.label}</Label>
              {campos.origem.auto ? (
                <Input value={campos.origem.value} readOnly className="mt-0.5 h-7 text-[11px] bg-muted cursor-not-allowed" />
              ) : (campos.origem as any).useSelect && outrasFazendas.length > 0 ? (
                <Select value={fazendaOrigem} onValueChange={setFazendaOrigem}>
                  <SelectTrigger className="mt-0.5 h-7 text-[11px]"><SelectValue placeholder="Selecione" /></SelectTrigger>
                  <SelectContent>{outrasFazendas.map(f => <SelectItem key={f.id} value={f.nome} className="text-[11px]">{f.nome}</SelectItem>)}</SelectContent>
                </Select>
              ) : (
                <Input value={fazendaOrigem} onChange={e => setFazendaOrigem(e.target.value)} placeholder="Ex: Faz. Boa Vista" className="mt-0.5 h-7 text-[11px]" />
              )}
            </div>
          )}
          {/* Abate: Frigorífico (Fornecedor) — campo principal */}
          {isAbate && (
            <div className="min-w-0">
              <Label className="font-bold text-[11px]">Frigorífico (Fornecedor) *</Label>
              <div className="flex items-center gap-1 mt-0.5">
                <div className="min-w-0 flex-1">
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
                <Button type="button" variant="outline" size="icon" className="relative z-10 h-7 w-7 shrink-0" aria-label="Novo frigorífico" onClick={() => setNovoFornecedorAbateOpen(true)}>
                  <Plus className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
          )}
          {/* Compra: Fornecedor — campo principal */}
          {isCompra && (
            <div className="min-w-0">
              <Label className="font-bold text-[11px]">Fornecedor *</Label>
              <div className="flex items-center gap-1 mt-0.5">
                <div className="min-w-0 flex-1">
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
                <Button type="button" variant="outline" size="icon" className="h-7 w-7 shrink-0" onClick={() => setNovoFornecedorCompraOpen(true)}>
                  <Plus className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
          )}
          {/* Venda: Destino (Comprador) — campo principal */}
          {isVenda && campos.destino?.show && (
            <div className="min-w-0">
              <Label className="font-bold text-[11px]">Destino (Comprador)</Label>
              <div className="flex items-center gap-1 mt-0.5">
                <div className="min-w-0 flex-1">
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
                <Button type="button" variant="outline" size="icon" className="h-7 w-7 shrink-0" onClick={() => setNovoFornecedorVendaOpen(true)}>
                  <Plus className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
          )}
          {/* Venda: Tipo de Venda */}
          {isVenda && (
            <div>
              <Label className="font-bold text-[11px]">Tipo Venda</Label>
              <Select
                value={tipoPeso}
                onValueChange={(v) => {
                  setTipoPeso(v);
                  if (v === 'desmama' || v === 'gado_adulto') {
                    setVendaDetalhes(prev => prev ? { ...prev, tipoVenda: v as 'desmama' | 'gado_adulto' } : prev);
                  }
                }}
              >
                <SelectTrigger className="mt-0.5 h-7 text-[11px]"><SelectValue placeholder="Selecione" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="desmama" className="text-[11px]">Desmama</SelectItem>
                  <SelectItem value="gado_adulto" className="text-[11px]">Gado Adulto</SelectItem>
                  <SelectItem value="boitel" className="text-[11px]">Boitel</SelectItem>
                </SelectContent>
              </Select>
            </div>
          )}
          {/* Outros tipos: campo destino genérico */}
          {!isAbate && !isCompra && !isVenda && campos.destino?.show && (
            <div className="min-w-0">
              <Label className="font-bold text-[11px]">{campos.destino.label}</Label>
              {campos.destino.auto ? (
                <Input value={campos.destino.value} readOnly className="mt-0.5 h-7 text-[11px] bg-muted cursor-not-allowed" />
              ) : (campos.destino as any).useSelect && outrasFazendas.length > 0 ? (
                <Select value={fazendaDestino} onValueChange={setFazendaDestino}>
                  <SelectTrigger className="mt-0.5 h-7 text-[11px]"><SelectValue placeholder="Selecione" /></SelectTrigger>
                  <SelectContent>{outrasFazendas.map(f => <SelectItem key={f.id} value={f.nome} className="text-[11px]">{f.nome}</SelectItem>)}</SelectContent>
                </Select>
              ) : (
                <Input value={fazendaDestino} onChange={e => setFazendaDestino(e.target.value)} placeholder={campos.destino.placeholder || 'Ex: Faz. Santa Cruz'} className="mt-0.5 h-7 text-[11px]" />
              )}
            </div>
          )}
        </div>
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
                  {l.tipo === 'abate' && (l.statusOperacional === 'programado' || l.statusOperacional === 'realizado') && (
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
      {onBackToConciliacao && aba !== 'reclassificacao' && (
        <button onClick={onBackToConciliacao} className="w-full flex items-center justify-center gap-1 text-[12px] font-bold text-primary bg-primary/10 rounded-md py-1.5 transition-colors hover:bg-primary/20 mb-2">
          <ArrowLeft className="h-3.5 w-3.5" /> {backLabel || 'Retornar à Conciliação de Categoria'}
        </button>
      )}

      {/* ── P1 governance banner ── */}
      {p1Oficial && aba !== 'historico' && (
        <div className="bg-destructive/10 border border-destructive/30 rounded-md px-3 py-2 mb-2 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-destructive shrink-0" />
            <div className="text-[11px]">
              <span className="font-bold text-destructive">Mês fechado (P1 oficial).</span>{' '}
              <span className="text-muted-foreground">Reabra o período para alterar campos estruturais ou registrar novos lançamentos.</span>
            </div>
          </div>
          <Button variant="outline" size="sm" className="text-[10px] h-6 shrink-0 ml-2" onClick={() => setShowReabrirP1(true)}>
            Reabrir
          </Button>
        </div>
      )}

      {/* ── Mobile nav strip ── */}
      {isMobile && (
        <div className="flex gap-1 overflow-x-auto pb-2 mb-1 -mx-1 px-1">
          {[
            { aba: 'entrada' as Aba, label: 'Entradas', icon: <LogIn className="h-3 w-3" /> },
            { aba: 'saida' as Aba, label: 'Saídas', icon: <LogOut className="h-3 w-3" /> },
            { aba: 'reclassificacao' as Aba, label: 'Evoluir', icon: <RefreshCw className="h-3 w-3" /> },
            { aba: 'historico' as Aba, label: 'Histórico', icon: <Clock className="h-3 w-3" /> },
          ].map(nav => (
            <button
              key={nav.aba}
              onClick={() => {
                if (isEditing && aba !== nav.aba) return;
                setAba(nav.aba);
                if (nav.aba === 'entrada') setTipo('nascimento');
                if (nav.aba === 'saida') setTipo('abate');
              }}
              disabled={isEditing && aba !== nav.aba}
              className={`flex items-center gap-1 px-2.5 py-1.5 rounded-md text-[11px] font-bold whitespace-nowrap transition-all shrink-0 ${
                aba === nav.aba
                  ? 'bg-primary text-primary-foreground shadow-sm'
                  : 'text-muted-foreground bg-muted/30 hover:bg-muted/60'
              } ${isEditing && aba !== nav.aba ? 'opacity-20 pointer-events-none' : ''}`}
            >
              {nav.icon} {nav.label}
            </button>
          ))}
        </div>
      )}

      {/* ── Mobile sub-nav for entrada/saida types ── */}
      {isMobile && (aba === 'entrada' || aba === 'saida') && (
        <div className="flex gap-1 overflow-x-auto pb-2 -mx-1 px-1">
          {(aba === 'entrada' ? TIPOS_ENTRADA : TIPOS_SAIDA).map(t => (
            <button
              key={t.value}
              onClick={() => { setTipo(t.value); resetAllFields(); }}
              disabled={isEditing && tipo !== t.value}
              className={`flex items-center gap-1 px-2 py-1 rounded-md text-[10px] font-semibold whitespace-nowrap transition-all shrink-0 border ${
                tipo === t.value
                  ? 'bg-primary/15 text-foreground border-primary/40'
                  : 'text-muted-foreground border-transparent hover:bg-muted/40'
              } ${isEditing && tipo !== t.value ? 'opacity-20 pointer-events-none' : ''}`}
            >
              <span className="text-[11px]">{t.icon}</span> {t.label}
            </button>
          ))}
        </div>
      )}

      <div className={isMobile
        ? 'flex flex-col gap-3'
        : 'grid grid-cols-[11rem_minmax(0,1fr)_20rem] gap-3 items-start overflow-visible'
      }>
        {/* Left: Navigation sidebar (desktop only) */}
        {!isMobile && renderSidebar()}

        {/* Center: Form or Historico */}
        {aba === 'reclassificacao' ? (
          <>
            <ReclassificacaoFormFields
              state={reclassState}
            />
            <ReclassificacaoResumoPanel
              quantidade={Number(reclassState.quantidade) || 0}
              pesoKg={Number(reclassState.pesoKg) || 0}
              origemLabel={reclassState.origemLabel}
              destinoLabel={reclassState.destinoLabel}
              pesoMedioOrigem={reclassState.origemInfo?.pesoMedioKg ?? null}
              statusOp={reclassState.statusOp}
              onRequestRegister={reclassState.handleSubmit}
              submitting={false}
              canRegister={!!(Number(reclassState.quantidade) > 0 && reclassState.categoriaOrigem !== reclassState.categoriaDestino)}
              onBack={onBackToConciliacao}
              backLabel={backLabel}
            />
          </>
        ) : aba === 'historico' ? (
          <div className={isMobile ? '' : 'col-span-2 self-start'}>{renderHistorico()}</div>
        ) : (
          <>
             {renderForm()}
            <div className="space-y-3">
              {/* META Intelligent Panel */}
              {isCenarioMeta && (
                <MetaLancamentoPanel
                  ano={data ? Number(data.slice(0, 4)) : new Date().getFullYear()}
                  mes={data ? Number(data.slice(5, 7)) : new Date().getMonth() + 1}
                  categoria={categoria as any}
                  tipo={tipo}
                  quantidade={Number(quantidade) || 0}
                  pesoKg={Number(pesoKg) || 0}
                  clienteId={clienteAtual?.id}
                  onSugestaoEvolucao={(info: EvolucaoSugestao) => {
                    toast.info(
                      `Sugestão: ${info.categoriaAtual} → ${info.categoriaDestino}. Peso médio atual: ${info.pesoMedioAtual.toFixed(1)} kg (mín. evolução: ${info.pesoEvolucao} kg). Crie a movimentação de reclassificação manualmente.`,
                      { duration: 8000 }
                    );
                  }}
                />
              )}
              {/* Existing right panel */}
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
                  onCancelEdit={editingAbateId ? handleCancelEdit : undefined}
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
                  onCancelEdit={editingAbateId ? handleCancelEdit : undefined}
                  calculation={abateCalc}
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
                  statusOp={effectiveStatusOp}
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
                    statusOperacional={effectiveStatusOp}
                  />
                </div>
              </>
            ) : isVenda ? (
              <>
                <VendaResumoPanel
                  quantidade={Number(quantidade) || 0}
                  pesoKg={Number(pesoKg) || 0}
                  categoria={categoria}
                  compradorNome={abateFornecedores.find(f => f.id === vendaDestinoFornecedorId)?.nome || ''}
                  detalhes={vendaDetalhes}
                  detalhesPreenchidos={!!vendaDetalhes || (tipoPeso === 'boitel' && !!boitelDataForResumo)}
                  canOpenModal={!!(data && quantidade && Number(quantidade) > 0 && pesoKg && Number(pesoKg) > 0 && categoria && vendaDestinoFornecedorId)}
                  onOpenModal={() => {
                    if (tipoPeso === 'boitel') {
                      vendaFinanceiroRef.current?.openBoitelDialog();
                    } else {
                      setVendaDialogOpen(true);
                    }
                  }}
                  onRequestRegister={handleRequestRegister}
                  submitting={submitting}
                  registerLabel={editingAbateId ? 'Salvar Alterações' : 'Registrar Venda'}
                  onCancelEdit={editingAbateId ? handleCancelEdit : undefined}
                  calculation={vendaCalc}
                  isBoitel={tipoPeso === 'boitel'}
                  boitelData={boitelDataForResumo}
                />
                <VendaDetalhesDialog
                  open={vendaDialogOpen}
                  onClose={() => setVendaDialogOpen(false)}
                  onSave={(det) => {
                    setVendaDetalhes(det);
                    setNotaFiscal(det.notaFiscal);
                    setVendaTipoPreco(det.tipoPreco);
                    setVendaPrecoInput(det.precoInput);
                    setTipoPeso(det.tipoVenda);
                    setFrete(det.frete);
                    setComissaoPct(det.comissaoPct);
                    setOutrosDescontos(det.outrosCustos);
                    setFunruralPct(det.funruralPct);
                    setFunruralReais(det.funruralReais);
                    setVendaDialogOpen(false);
                  }}
                  initialData={vendaDetalhes || EMPTY_VENDA_DETALHES}
                  quantidade={Number(quantidade) || 0}
                  pesoKg={Number(pesoKg) || 0}
                  categoria={categoria}
                  dataVenda={data}
                  compradorNome={abateFornecedores.find(f => f.id === vendaDestinoFornecedorId)?.nome || ''}
                  statusOperacional={effectiveStatusOp}
                />
                {/* Hidden panel for financeiro generation */}
                <div className="hidden">
                  <VendaFinanceiroPanel
                    key={`venda-hidden-${tipo}`}
                    ref={vendaFinanceiroRef}
                    quantidade={Number(quantidade) || 0}
                    pesoKg={Number(pesoKg) || 0}
                    categoria={categoria}
                    data={data}
                    destino={fazendaDestino}
                    fornecedorId={vendaDestinoFornecedorId}
                    onFornecedorIdChange={() => {}}
                    fornecedores={abateFornecedores}
                    onCreateFornecedor={async () => {}}
                    notaFiscal={notaFiscal}
                    onNotaFiscalChange={setNotaFiscal}
                    statusOp={effectiveStatusOp}
                    lancamentoId={lastSavedLancamentoId || undefined}
                    tipoPeso={tipoPeso}
                    onTipoPesoChange={() => {}}
                    vendaTipoPreco={vendaTipoPreco}
                    onVendaTipoPrecoChange={() => {}}
                    vendaPrecoInput={vendaPrecoInput}
                    onVendaPrecoInputChange={() => {}}
                    valorBruto={calc.valorBruto}
                    totalBonus={calc.totalBonus}
                    totalDescontos={calc.totalDescontos}
                    valorLiquido={calc.valorLiquido}
                    funruralPct={funruralPct}
                    onFunruralPctChange={() => {}}
                    descontoQualidade={descontoQualidade}
                    onDescontoQualidadeChange={() => {}}
                    outrosDescontos={outrosDescontos}
                    onOutrosDescontosChange={() => {}}
                    descFunruralTotal={calc.descFunruralTotal}
                    descQualidadeTotal={calc.descQualidadeTotal}
                    frete={frete}
                    onFreteChange={() => {}}
                    comissao={comissaoPct}
                    onComissaoChange={() => {}}
                    funruralReais={funruralReais}
                    onFunruralReaisChange={() => {}}
                    comissaoVal={calc.comissaoVal}
                    freteVal={calc.freteVal}
                    onRequestRegister={() => {}}
                    submitting={false}
                    onBoitelDataChange={setBoitelDataForResumo}
                    initialBoitelData={boitelDataForResumo}
                  />
                </div>
              </>
            ) : isTransferenciaSaida ? (
              <>
                <TransferenciaResumoPanel
                  quantidade={Number(quantidade) || 0}
                  pesoKg={Number(pesoKg) || 0}
                  categoria={categoria}
                  fazendaOrigem={nomeFazenda || fazendaOrigem}
                  fazendaDestino={fazendaDestino}
                  detalhes={transferenciaDetalhes}
                  detalhesPreenchidos={!!transferenciaDetalhes}
                  canOpenModal={!!(data && quantidade && Number(quantidade) > 0 && pesoKg && Number(pesoKg) > 0 && categoria && fazendaDestino)}
                  onOpenModal={() => setTransferenciaDialogOpen(true)}
                  onRequestRegister={handleRequestRegister}
                  submitting={submitting}
                  registerLabel={editingAbateId ? 'Salvar Alterações' : 'Registrar Transferência'}
                  onCancelEdit={editingAbateId ? handleCancelEdit : undefined}
                  calculation={transferenciaCalc}
                />
                <TransferenciaDetalhesDialog
                  open={transferenciaDialogOpen}
                  onClose={() => setTransferenciaDialogOpen(false)}
                  onSave={(det) => {
                    setTransferenciaDetalhes(det);
                    setTransferenciaDialogOpen(false);
                  }}
                  initialData={transferenciaDetalhes || EMPTY_TRANSFERENCIA_DETALHES}
                  quantidade={Number(quantidade) || 0}
                  pesoKg={Number(pesoKg) || 0}
                  categoria={categoria}
                  fazendaOrigem={nomeFazenda || fazendaOrigem}
                  fazendaDestino={fazendaDestino}
                  data={data}
                  statusOp={effectiveStatusOp}
                  observacao={observacao}
                />
              </>
            ) : (
              renderFinancialPanel()
            )}
            </div>
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
          onEditarVenda={loadVendaForEdit}
          onEditarCompra={loadCompraForEdit}
          onEditarTransferencia={loadTransferenciaForEdit}
          fazendaId={fazendaAtual?.id}
        />
      )}

      {/* Confirmation dialog */}
      <ConfirmacaoRegistroDialog
        open={confirmDialogOpen}
        onClose={() => setConfirmDialogOpen(false)}
        onConfirm={() => handleSubmit()}
        submitting={submitting}
        operacionais={{
          status: isCenarioMeta ? 'meta' : effectiveStatusOp,
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

      {/* Reabertura P1 dialog */}
      {fazendaAtual?.id && formAnoMes && (
        <ReabrirP1Dialog
          open={showReabrirP1}
          onOpenChange={setShowReabrirP1}
          fazendaId={fazendaAtual.id}
          anoMes={formAnoMes}
          onReaberto={refetchPilares}
        />
      )}
    </div>
  );
}
