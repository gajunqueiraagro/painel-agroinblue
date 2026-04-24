import { useState, useEffect, useCallback, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useCliente } from '@/contexts/ClienteContext';
import { usePermissions } from '@/hooks/usePermissions';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { formatMoeda } from '@/lib/calculos/formatters';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import {
  CheckCircle2, AlertTriangle, XCircle, Pencil, ArrowLeft,
  ArrowUp, ArrowDown, ArrowUpDown, Plus,
} from 'lucide-react';
import { toast } from 'sonner';
import { format, parseISO } from 'date-fns';
import {
  STATUS_REALIZADOS,
  belongsToConta,
  calcConciliacaoMensal,
  type ConciliacaoLancamentoBase,
  type ConciliacaoStatus,
} from '@/lib/financeiro/conciliacaoCalc';
import { buildUnifiedSaldos, type ContaSaldoRef, type SaldoV2SourceRow, type SaldoLegacySourceRow } from '@/lib/financeiro/saldosBancarios';

/* ── Extended status type (adds 'parcial' to existing) ── */
type MesStatusExt = ConciliacaoStatus | 'parcial';

/* ── Types ── */
interface ContaRef {
  id: string;
  nome_conta: string;
  nome_exibicao: string | null;
  tipo_conta: string | null;
  codigo_conta: string | null;
}

interface SaldoRow {
  id: string;
  ano_mes: string;
  conta_bancaria_id: string;
  saldo_inicial: number;
  saldo_final: number;
  status_mes: string;
  origem_saldo_inicial: string;
}

interface LancamentoResumo {
  id: string;
  tipo_operacao: string;
  valor: number;
  sinal: number;
  data_competencia: string;
  data_pagamento: string | null;
  descricao: string | null;
  status_transacao: string | null;
  favorecido_id: string | null;
  numero_documento: string | null;
  conta_bancaria_id: string | null;
  conta_destino_id: string | null;
  ano_mes: string;
  subcentro: string | null;
}

interface FornecedorRef { id: string; nome: string; }

interface MesCard {
  mes: string;
  label: string;
  anoMes: string;
  saldoInicial: number;
  entradasTerceiros: number;
  transferenciasRecebidas: number;
  totalEntradas: number;
  saidasTerceiros: number;
  transferenciasEnviadas: number;
  totalSaidas: number;
  saldoCalculado: number;
  saldoExtrato: number | null;
  diferenca: number;
  status: MesStatusExt;
  saldoRow: SaldoRow | null;
  lancamentos: LancamentoResumo[];
}

interface PerContaSaldo {
  conta: ContaRef;
  sis: number;
  ext: number | null;
  dif: number;
  status: MesStatusExt;
  saldoRow: SaldoRow | null;
}

/* ── Constants ── */
const MESES_LABELS = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'];

/** Inline colors — avoids CSS class conflicts with host */
const STATUS_COR: Record<string, {bg:string;border:string;txt:string}> = {
  realizado:      {bg:'#EAF3DE', border:'#66BB6A', txt:'#2E7D32'},
  parcial:        {bg:'#FFF8E1', border:'#FFB300', txt:'#E65100'},
  nao_conciliado: {bg:'#FCEBEB', border:'#E57373', txt:'#A32D2D'},
  pendente:       {bg:'#F5F5F5', border:'#BDBDBD', txt:'#757575'},
};

const STATUS_META: Record<string, {label:string; Icon: typeof CheckCircle2; sub:string}> = {
  realizado:      {label:'Conciliado',     Icon:CheckCircle2,  sub:''},
  parcial:        {label:'Parcial',         Icon:AlertTriangle, sub:'Saldo global ok, contas individuais divergem'},
  nao_conciliado: {label:'Não Conciliado',  Icon:XCircle,       sub:'Divergência no saldo'},
  pendente:       {label:'Pendente',        Icon:AlertTriangle, sub:'Informe o saldo do extrato'},
};

const CONTA_GROUP_ORDER: Record<string, number> = { cc: 0, inv: 1, cartao: 2 };

/* ── Helpers ── */
function fmtDate(d: string | null) {
  if (!d) return '-';
  try { return format(parseISO(d), 'dd/MM/yy'); } catch { return d; }
}

function sortContas(contas: ContaRef[]): ContaRef[] {
  return [...contas].sort((a, b) => {
    const gA = CONTA_GROUP_ORDER[(a.tipo_conta||'').toLowerCase()] ?? 99;
    const gB = CONTA_GROUP_ORDER[(b.tipo_conta||'').toLowerCase()] ?? 99;
    if (gA !== gB) return gA - gB;
    return (a.nome_conta||'').localeCompare(b.nome_conta||'','pt-BR');
  });
}

function getContaLabel(c: ContaRef): string { return c.nome_exibicao || c.nome_conta; }

function classifyLanc(l: LancamentoResumo, contaId: string): 'entrada'|'saida'|'transf_entrada'|'transf_saida' {
  const t = (l.tipo_operacao||'').toLowerCase().replace(/[\s\-–—]/g,'');
  const isT = t.startsWith('3') || t.includes('transfer');
  if (isT) return (contaId !== '__all__' && l.conta_destino_id === contaId) ? 'transf_entrada' : 'transf_saida';
  if (t.startsWith('1') || t.includes('entrada')) return 'entrada';
  return 'saida';
}

const r2 = (n: number) => Math.round(n * 100) / 100;

/* ── Pure function to build month cards for any contaId ── */
function buildMonthCards(
  ano: string,
  targetContaId: string,
  saldos: SaldoRow[],
  lancamentos: LancamentoResumo[],
  contas: ContaRef[],
): MesCard[] {
  const cards: MesCard[] = [];
  const prevFinal = new Map<string, number>();
  const prevDec = `${Number(ano)-1}-12`;
  saldos.filter(r => r.ano_mes === prevDec).forEach(s => {
    prevFinal.set(s.conta_bancaria_id, r2((prevFinal.get(s.conta_bancaria_id)||0) + s.saldo_final));
  });

  for (let m = 1; m <= 12; m++) {
    const mesStr = String(m).padStart(2,'0');
    const anoMes = `${ano}-${mesStr}`;
    const isAll = targetContaId === '__all__';
    const saldoRows = saldos.filter(s => s.ano_mes === anoMes);
    const mesLancs = lancamentos.filter(l => l.ano_mes === anoMes && belongsToConta(l, targetContaId));

    if (!isAll) {
      const official = calcConciliacaoMensal({
        contaId: targetContaId, anoMes, saldoRows,
        lancamentos: lancamentos as ConciliacaoLancamentoBase[],
        fallbackSaldoInicial: prevFinal.get(targetContaId) || 0,
      });
      cards.push({
        mes: mesStr, label: MESES_LABELS[m-1], anoMes,
        saldoInicial: official.saldoInicial,
        entradasTerceiros: official.entradasTerceiros,
        transferenciasRecebidas: official.transferenciasRecebidas,
        totalEntradas: official.totalEntradas,
        saidasTerceiros: official.saidasTerceiros,
        transferenciasEnviadas: official.transferenciasEnviadas,
        totalSaidas: official.totalSaidas,
        saldoCalculado: official.saldoCalculado,
        saldoExtrato: official.saldoExtrato,
        diferenca: official.diferenca,
        status: official.status as MesStatusExt,
        saldoRow: saldoRows.find(s => s.conta_bancaria_id === targetContaId) || null,
        lancamentos: mesLancs,
      });
      if (saldoRows.length > 0) saldoRows.forEach(s => prevFinal.set(s.conta_bancaria_id, s.saldo_final));
      else prevFinal.set(targetContaId, official.saldoCalculado);
      continue;
    }

    /* All accounts */
    const saldoInicial = saldoRows.length > 0
      ? r2(saldoRows.reduce((s,r) => s + (r.saldo_inicial||0), 0))
      : r2(Array.from(prevFinal.values()).reduce((s,v) => s+v, 0));

    const perAcct = contas.map(c => calcConciliacaoMensal({
      contaId: c.id, anoMes, saldoRows,
      lancamentos: lancamentos as ConciliacaoLancamentoBase[],
      fallbackSaldoInicial: prevFinal.get(c.id) || 0,
    }));

    const entradasTerceiros = r2(perAcct.reduce((s,r) => s + r.entradasTerceiros, 0));
    const saidasTerceiros   = r2(perAcct.reduce((s,r) => s + r.saidasTerceiros, 0));
    const saldoCalculado    = r2(perAcct.reduce((s,r) => s + r.saldoCalculado, 0));
    const saldoExtrato = saldoRows.length > 0 ? r2(saldoRows.reduce((s,r) => s + (r.saldo_final||0), 0)) : null;
    const diferenca = saldoExtrato !== null ? r2(saldoExtrato - saldoCalculado) : 0;

    /* Extended status: realizado / parcial / nao_conciliado / pendente */
    const accsWithSaldo = contas.filter(c => saldoRows.some(s => s.conta_bancaria_id === c.id));
    let status: MesStatusExt;
    if (accsWithSaldo.length === 0) {
      status = 'pendente';
    } else {
      const globalOk = saldoExtrato !== null && Math.round(diferenca * 100) === 0;
      const perStatuses = contas.map(c => calcConciliacaoMensal({
        contaId: c.id, anoMes, saldoRows,
        lancamentos: lancamentos as ConciliacaoLancamentoBase[],
        fallbackSaldoInicial: prevFinal.get(c.id) || 0,
      }).status);
      const allOk  = perStatuses.every(s => s === 'realizado');
      const anyBad = perStatuses.some(s => s === 'nao_conciliado');
      if (allOk)              status = 'realizado';
      else if (globalOk && anyBad) status = 'parcial';
      else if (anyBad)        status = 'nao_conciliado';
      else                    status = 'pendente';
    }

    cards.push({
      mes: mesStr, label: MESES_LABELS[m-1], anoMes,
      saldoInicial, entradasTerceiros, transferenciasRecebidas: 0,
      totalEntradas: entradasTerceiros, saidasTerceiros, transferenciasEnviadas: 0,
      totalSaidas: saidasTerceiros, saldoCalculado, saldoExtrato, diferenca, status,
      saldoRow: null, lancamentos: mesLancs,
    });

    if (saldoRows.length > 0) saldoRows.forEach(s => prevFinal.set(s.conta_bancaria_id, r2(s.saldo_final||0)));
  }
  return cards;
}

/* ── Props ── */
interface ConciliacaoProps {
  onNavigateToLancamentos?: (ano: string, mes: number) => void;
  onBack?: () => void;
  initialAno?: string;
  initialMes?: string;
}

export function ConciliacaoBancariaTab({ onNavigateToLancamentos, onBack, initialAno, initialMes }: ConciliacaoProps = {}) {
  const { clienteAtual } = useCliente();
  const perm = usePermissions();
  const isAdmin = perm.perfil === 'admin_agroinblue' || perm.perfil === 'gestor_cliente';
  const isFinanceiro = perm.perfil === 'financeiro';
  const clienteId = clienteAtual?.id;

  const currentYear  = new Date().getFullYear();
  const currentMonth = new Date().getMonth() + 1;
  const [anos, setAnos] = useState<string[]>([String(currentYear)]);

  useEffect(() => {
    if (!clienteId) return;
    Promise.all([
      supabase.from('financeiro_saldos_bancarios_v2').select('ano_mes').eq('cliente_id',clienteId).limit(10000),
      supabase.from('financeiro_saldos_bancarios').select('ano_mes').eq('cliente_id',clienteId).limit(10000),
      supabase.from('financeiro_lancamentos_v2').select('ano_mes').eq('cliente_id',clienteId)
              .eq('cancelado',false).not('sem_movimentacao_caixa','is',true).limit(10000),
    ]).then(([sR,lR,lancR]) => {
      const set = new Set<string>([String(currentYear)]);
      ([...(sR.data||[]),...(lR.data||[]),...(lancR.data||[])]).forEach((r:any) => {
        if (r.ano_mes) set.add(r.ano_mes.substring(0,4));
      });
      setAnos(Array.from(set).sort((a,b)=>b.localeCompare(a)));
    });
  }, [clienteId, currentYear]);

  const [ano, setAno] = useState(initialAno || String(currentYear));
  const [selectedConta, setSelectedConta] = useState<string>('__all__');
  const [contas, setContas] = useState<ContaRef[]>([]);
  const [fornecedores, setFornecedores] = useState<FornecedorRef[]>([]);
  const [saldos, setSaldos] = useState<SaldoRow[]>([]);
  const [lancamentos, setLancamentos] = useState<LancamentoResumo[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedMes, setSelectedMes] = useState<string>(initialMes || String(currentMonth).padStart(2,'0'));

  /* Modal */
  const [showLancModal, setShowLancModal]     = useState(false);
  const [filtroModal, setFiltroModal]         = useState<'todos'|'entradas'|'saidas'>('todos');
  const [lancSort, setLancSort]               = useState<{col:'data'|'descricao'|'fornecedor'|'valor';dir:'asc'|'desc'}>({col:'data',dir:'asc'});

  /* Edit saldo */
  const [editingSaldo, setEditingSaldo] = useState<{anoMes:string;contaId:string;current:number}|null>(null);
  const [editValue, setEditValue]       = useState('');

  useEffect(() => {
    if (!clienteId) return;
    supabase.from('financeiro_contas_bancarias')
      .select('id,nome_conta,nome_exibicao,tipo_conta,codigo_conta')
      .eq('cliente_id',clienteId).eq('ativa',true).order('ordem_exibicao')
      .then(({data}) => setContas(sortContas((data as ContaRef[])||[])));
    supabase.from('financeiro_fornecedores')
      .select('id,nome').eq('cliente_id',clienteId).eq('ativo',true)
      .then(({data}) => setFornecedores((data as FornecedorRef[])||[]));
  }, [clienteId]);

  const loadData = useCallback(async () => {
    if (!clienteId) return;
    setLoading(true);
    const prevDec    = `${Number(ano)-1}-12`;
    const anoMesMin  = `${ano}-01`;
    const anoMesMax  = `${ano}-12`;

    const [{data:sData},{data:legData}] = await Promise.all([
      supabase.from('financeiro_saldos_bancarios_v2')
        .select('id,ano_mes,conta_bancaria_id,fazenda_id,saldo_inicial,saldo_final,fechado,status_mes,origem_saldo,origem_saldo_inicial,observacao')
        .eq('cliente_id',clienteId).gte('ano_mes',prevDec).lte('ano_mes',anoMesMax),
      supabase.from('financeiro_saldos_bancarios')
        .select('id,ano_mes,conta_banco,fazenda_id,saldo_final')
        .eq('cliente_id',clienteId).gte('ano_mes',prevDec).lte('ano_mes',anoMesMax),
    ]);

    const contasRef: ContaSaldoRef[] = contas.map(c => ({
      id:c.id, nome_conta:c.nome_conta, nome_exibicao:c.nome_exibicao,
      tipo_conta:c.tipo_conta, codigo_conta:c.codigo_conta,
    }));
    const unified = buildUnifiedSaldos({
      v2Saldos:(sData as SaldoV2SourceRow[])||[],
      legacySaldos:(legData as SaldoLegacySourceRow[])||[],
      contas:contasRef, movSummary:{},
    });
    setSaldos(unified.map(u => ({
      id:u.id, ano_mes:u.ano_mes,
      conta_bancaria_id: u.conta_bancaria_id_v2 || u.conta_bancaria_id,
      saldo_inicial:u.saldo_inicial, saldo_final:u.saldo_final,
      status_mes:u.status_mes, origem_saldo_inicial:u.origem_saldo_inicial,
    })));

    const allLanc: LancamentoResumo[] = [];
    let from = 0;
    const batchSize = 1000;
    while (true) {
      const {data:lData} = await supabase
        .from('financeiro_lancamentos_v2')
        .select('id,tipo_operacao,valor,sinal,data_competencia,data_pagamento,descricao,status_transacao,favorecido_id,numero_documento,conta_bancaria_id,conta_destino_id,ano_mes,subcentro')
        .eq('cliente_id',clienteId).eq('cancelado',false)
        .not('sem_movimentacao_caixa','is',true)
        .in('status_transacao',[...STATUS_REALIZADOS])
        .gte('ano_mes',anoMesMin).lte('ano_mes',anoMesMax)
        .order('ano_mes').order('data_competencia')
        .range(from, from+batchSize-1);
      if (!lData || lData.length === 0) break;
      allLanc.push(...(lData as LancamentoResumo[]).filter(l => belongsToConta(l,'__all__')));
      if (lData.length < batchSize) break;
      from += batchSize;
    }
    setLancamentos(allLanc);
    setLoading(false);
  }, [clienteId, ano, contas]);

  useEffect(() => { loadData(); }, [loadData]);

  /* ── Month cards: two versions ── */
  // Month BAR always shows global status (all accounts)
  const monthBarCards = useMemo(
    () => buildMonthCards(ano, '__all__', saldos, lancamentos, contas),
    [ano, saldos, lancamentos, contas]
  );
  // Detail cards: filtered by selectedConta
  const mesCards = useMemo(
    () => buildMonthCards(ano, selectedConta, saldos, lancamentos, contas),
    [ano, selectedConta, saldos, lancamentos, contas]
  );
  const selectedCard = useMemo(() => mesCards.find(c => c.mes === selectedMes)||null, [mesCards, selectedMes]);

  /* ── Per-account saldo data for current month ── */
  const perContaSaldos = useMemo((): PerContaSaldo[] => {
    const anoMes = `${ano}-${selectedMes}`;
    return sortContas(contas).map(c => {
      const saldoRow = saldos.find(s => s.ano_mes===anoMes && s.conta_bancaria_id===c.id)||null;
      const official = calcConciliacaoMensal({
        contaId:c.id, anoMes, saldoRows:saldos,
        lancamentos: lancamentos as ConciliacaoLancamentoBase[],
        fallbackSaldoInicial: saldoRow?.saldo_inicial ?? 0,
      });
      return {
        conta:c, sis:official.saldoCalculado,
        ext:official.saldoExtrato, dif:official.diferenca,
        status:official.status as MesStatusExt, saldoRow,
      };
    });
  }, [ano, selectedMes, saldos, lancamentos, contas]);

  const totalSaldos = useMemo(() => ({
    sis: r2(perContaSaldos.reduce((s,c)=>s+c.sis,0)),
    ext: perContaSaldos.every(c=>c.ext===null) ? null : r2(perContaSaldos.reduce((s,c)=>s+(c.ext||0),0)),
    dif: r2(perContaSaldos.reduce((s,c)=>s+c.dif,0)),
  }), [perContaSaldos]);

  /* ── Lançamentos for modal ── */
  const fornecedorMap = useMemo(() => new Map(fornecedores.map(f=>[f.id,f.nome])), [fornecedores]);

  const entradas = useMemo(() => (selectedCard?.lancamentos||[]).filter(l=>classifyLanc(l,selectedConta)==='entrada'), [selectedCard, selectedConta]);
  const saidas   = useMemo(() => (selectedCard?.lancamentos||[]).filter(l=>classifyLanc(l,selectedConta)==='saida'),   [selectedCard, selectedConta]);

  const lancFiltrados = useMemo(() => {
    const all = selectedCard?.lancamentos || [];
    if (filtroModal==='entradas') return all.filter(l=>classifyLanc(l,selectedConta)==='entrada');
    if (filtroModal==='saidas')   return all.filter(l=>classifyLanc(l,selectedConta)==='saida');
    return all;
  }, [selectedCard, filtroModal, selectedConta]);

  const lancSorted = useMemo(() => [...lancFiltrados].sort((a,b) => {
    const dir = lancSort.dir==='asc' ? 1 : -1;
    switch (lancSort.col) {
      case 'data': return dir*(a.data_pagamento||a.data_competencia||'').localeCompare(b.data_pagamento||b.data_competencia||'');
      case 'descricao': return dir*(a.descricao||'').localeCompare(b.descricao||'','pt-BR');
      case 'fornecedor': {
        const fa = a.favorecido_id ? fornecedorMap.get(a.favorecido_id)||'' : '';
        const fb = b.favorecido_id ? fornecedorMap.get(b.favorecido_id)||'' : '';
        return dir*fa.localeCompare(fb,'pt-BR');
      }
      case 'valor': {
        const va = classifyLanc(a,selectedConta)==='entrada' ? a.valor : -a.valor;
        const vb = classifyLanc(b,selectedConta)==='entrada' ? b.valor : -b.valor;
        return dir*(va-vb);
      }
      default: return 0;
    }
  }), [lancFiltrados, lancSort, fornecedorMap, selectedConta]);

  const totalEntradasModal = useMemo(() => entradas.reduce((s,l)=>s+l.valor,0), [entradas]);
  const totalSaidasModal   = useMemo(() => saidas.reduce((s,l)=>s+l.valor,0),   [saidas]);

  /* ── Handlers ── */
  const handleEditSaldo = (anoMes: string, cId: string, current: number) => {
    setEditingSaldo({anoMes, contaId:cId, current});
    setEditValue(current.toFixed(2).replace('.',','));
  };

  const handleSaveSaldo = async () => {
    if (!editingSaldo || !clienteId) return;
    const val = parseFloat(editValue.replace(/\./g,'').replace(',','.'));
    if (isNaN(val)) { toast.error('Valor inválido'); return; }
    const existing = saldos.find(s => s.ano_mes===editingSaldo.anoMes && s.conta_bancaria_id===editingSaldo.contaId);
    if (existing) {
      const {error} = await supabase.from('financeiro_saldos_bancarios_v2')
        .update({saldo_final:val, updated_at:new Date().toISOString()}).eq('id',existing.id);
      if (error) { toast.error('Erro ao salvar'); return; }
    } else {
      const {data:cd} = await supabase.from('financeiro_contas_bancarias')
        .select('fazenda_id').eq('id',editingSaldo.contaId).single();
      if (!cd) { toast.error('Erro ao buscar fazenda'); return; }
      const {error} = await supabase.from('financeiro_saldos_bancarios_v2').insert({
        cliente_id:clienteId, fazenda_id:cd.fazenda_id,
        conta_bancaria_id:editingSaldo.contaId, ano_mes:editingSaldo.anoMes,
        saldo_inicial:0, saldo_final:val,
        origem_saldo_inicial:'manual', status_mes:'aberto',
      });
      if (error) { toast.error('Erro ao criar saldo'); return; }
    }
    toast.success('Saldo do extrato atualizado');
    setEditingSaldo(null);
    loadData();
  };

  const canEditSaldoFinal = (anoMes: string): boolean => {
    if (isAdmin) return true;
    const [y,mn] = anoMes.split('-').map(Number);
    return y===currentYear && mn===currentMonth && isFinanceiro;
  };

  /* ── Derived display values ── */
  const cardStatus = selectedCard?.status ?? 'pendente';
  const cor        = STATUS_COR[cardStatus] || STATUS_COR.pendente;
  const meta       = STATUS_META[cardStatus] || STATUS_META.pendente;
  const StatusIcon = meta.Icon;

  const contaAtual = selectedConta === '__all__'
    ? 'Todas as contas'
    : getContaLabel(contas.find(c=>c.id===selectedConta) || {id:'',nome_conta:selectedConta,nome_exibicao:null,tipo_conta:null,codigo_conta:null});

  const anoMesSel = `${ano}-${selectedMes}`;
  const contasCC    = perContaSaldos.filter(c=>(c.conta.tipo_conta||'').toLowerCase()==='cc');
  const contasINV   = perContaSaldos.filter(c=>(c.conta.tipo_conta||'').toLowerCase()==='inv');
  const contasCartao= perContaSaldos.filter(c=>(c.conta.tipo_conta||'').toLowerCase()==='cartao');

  /* ── Render ── */
  return (
    <div className="animate-fade-in pb-20">
      <div className="p-3 space-y-2 sticky top-0 z-20 bg-background">

        {/* ════ HEADER: year dropdown + 12 month cards ════ */}
        <div className="flex items-center gap-2">
          {onBack && (
            <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0" onClick={onBack}>
              <ArrowLeft className="h-4 w-4" />
            </Button>
          )}
          <Select value={ano} onValueChange={setAno}>
            <SelectTrigger className="h-7 text-xs w-[68px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              {anos.map(a => <SelectItem key={a} value={a} className="text-xs">{a}</SelectItem>)}
            </SelectContent>
          </Select>

          {/* 12 month cards — color = global status of ALL accounts */}
          <div className="flex flex-1 gap-0.5">
            {monthBarCards.map(c => {
              const cc    = STATUS_COR[c.status] || STATUS_COR.pendente;
              const isSel = selectedMes === c.mes;
              return (
                <button
                  key={c.mes}
                  onClick={() => setSelectedMes(c.mes)}
                  style={{
                    flex:1, textAlign:'center', padding:'5px 3px',
                    fontSize:'10px', borderRadius:'8px',
                    border:`1.5px solid ${cc.border}`,
                    cursor:'pointer', background:cc.bg, color:cc.txt,
                    fontWeight: isSel ? 700 : 500,
                    ...(isSel ? {
                      outline:'2.5px solid #185FA5', outlineOffset:'2px',
                      transform:'scale(1.09)', position:'relative', zIndex:1,
                    } : {}),
                  }}
                  title={STATUS_META[c.status]?.label || c.status}
                >
                  {c.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* Subtitle */}
        {selectedCard && (
          <div className="flex items-center gap-2">
            <span className="text-sm font-bold">{selectedCard.label}/{ano}</span>
            <span style={{
              background:cor.bg, color:cor.txt, border:`1px solid ${cor.border}`,
              fontSize:'10px', fontWeight:500, padding:'2px 8px', borderRadius:'20px',
            }}>
              {cardStatus==='realizado'?'✅':cardStatus==='parcial'?'⚠':cardStatus==='nao_conciliado'?'❌':'⏳'} {meta.label}
            </span>
            {meta.sub && <span className="text-[10px] text-muted-foreground">{meta.sub}</span>}
            <div className="flex-1" />
            {onNavigateToLancamentos && (
              <Button size="sm" variant="outline" className="h-6 text-[10px] gap-1 px-2.5"
                onClick={() => onNavigateToLancamentos(ano, parseInt(selectedMes))}>
                ↗ Lançamentos
              </Button>
            )}
          </div>
        )}

        {loading && <div className="text-center text-xs text-muted-foreground py-8">Carregando...</div>}

        {!loading && selectedCard && (
          <div className="space-y-2">
            {/* ════ 3 CARDS: [Resumo span-2] [Status] [Saldos por conta span-2] ════ */}
            <div className="grid gap-2" style={{gridTemplateColumns:'2fr 0.75fr 2.6fr', alignItems:'start'}}>

              {/* ── COL 1: Resumo das movimentações ── */}
              <div className="rounded-lg border overflow-hidden bg-card">
                <div className="px-3 py-1.5 border-b bg-muted/30 flex items-center justify-between">
                  <span className="text-[9px] font-medium uppercase tracking-wider text-muted-foreground">📊 Resumo das movimentações</span>
                  <span style={{fontSize:'10px',fontWeight:500,color:'#185FA5',background:'#E6F1FB',padding:'2px 8px',borderRadius:'12px'}}>
                    {contaAtual}
                  </span>
                </div>
                <div className="px-3 pt-1.5 flex justify-between">
                  <span className="text-[10px] text-muted-foreground">Saldo inicial</span>
                  <span className="text-[11px] font-medium text-muted-foreground tabular-nums">{formatMoeda(selectedCard.saldoInicial)}</span>
                </div>
                <div className="mx-3 my-1 h-px bg-border" />
                <div className="px-3 flex justify-between">
                  <span className="text-[10px] text-muted-foreground">Entradas</span>
                  <span className="text-[11px] font-semibold text-green-700 tabular-nums">{formatMoeda(selectedCard.totalEntradas)}</span>
                </div>
                {selectedConta !== '__all__' && (
                  <div className="px-5 space-y-0.5 pb-0.5">
                    <div className="flex justify-between text-[9px] text-muted-foreground">
                      <span>↳ terceiros</span><span className="tabular-nums">{formatMoeda(selectedCard.entradasTerceiros)}</span>
                    </div>
                    <div className="flex justify-between text-[9px] text-muted-foreground">
                      <span>↳ transferências</span><span className="tabular-nums">{formatMoeda(selectedCard.transferenciasRecebidas)}</span>
                    </div>
                  </div>
                )}
                <div className="px-3 flex justify-between">
                  <span className="text-[10px] text-muted-foreground">Saídas</span>
                  <span className="text-[11px] font-semibold text-red-700 tabular-nums">{formatMoeda(selectedCard.totalSaidas)}</span>
                </div>
                {selectedConta !== '__all__' && (
                  <div className="px-5 space-y-0.5 pb-0.5">
                    <div className="flex justify-between text-[9px] text-muted-foreground">
                      <span>↳ terceiros</span><span className="tabular-nums">{formatMoeda(selectedCard.saidasTerceiros)}</span>
                    </div>
                    <div className="flex justify-between text-[9px] text-muted-foreground">
                      <span>↳ transferências</span><span className="tabular-nums">{formatMoeda(selectedCard.transferenciasEnviadas)}</span>
                    </div>
                  </div>
                )}
                <div className="mx-3 my-1 h-px bg-border" />
                <div className="px-3 flex justify-between">
                  <span className="text-[10px] text-muted-foreground">Saldo no sistema</span>
                  <span className={`text-[11px] font-bold tabular-nums ${selectedCard.saldoCalculado>=0?'text-green-700':'text-red-700'}`}>
                    {formatMoeda(selectedCard.saldoCalculado)}
                  </span>
                </div>
                <div className="mx-3 my-1 h-px bg-border" />
                {/* NEW: Saldo extrato */}
                <div className="px-3 py-1 bg-muted/20 flex justify-between">
                  <span className="text-[10px] text-muted-foreground">Saldo extrato</span>
                  <span className="text-[11px] font-medium tabular-nums">
                    {selectedCard.saldoExtrato !== null ? formatMoeda(selectedCard.saldoExtrato) : '—'}
                  </span>
                </div>
                {/* NEW: Diferença */}
                <div className="px-3 py-1 bg-muted/20 flex justify-between mb-1">
                  <span className="text-[10px] text-muted-foreground">Diferença</span>
                  <span className={`text-[11px] font-bold tabular-nums ${Math.round(selectedCard.diferenca*100)===0?'text-green-600':'text-red-600'}`}>
                    {formatMoeda(selectedCard.diferenca)}
                  </span>
                </div>
              </div>

              {/* ── COL 2: Status ── */}
              <div className="rounded-lg overflow-hidden flex flex-col" style={{border:`1px solid ${cor.border}`}}>
                <div className="px-3 py-1.5 border-b text-[9px] font-medium uppercase tracking-wider text-muted-foreground"
                     style={{borderColor:cor.border}}>
                  ⚖ Status
                </div>
                <div className="flex-1 flex flex-col items-center justify-center gap-1.5 p-3 text-center"
                     style={{background:cor.bg}}>
                  <StatusIcon className="h-7 w-7" style={{color:cor.txt}} />
                  <div className="text-[11px] font-bold" style={{color:cor.txt}}>{meta.label}</div>
                  {meta.sub && (
                    <div className="text-[9px] leading-tight" style={{color:cor.txt, maxWidth:'90px'}}>{meta.sub}</div>
                  )}
                  {cardStatus === 'parcial' && (
                    <div className="mt-1 w-full border-t pt-1.5 space-y-0.5" style={{borderColor:`${cor.border}80`}}>
                      <div className="flex justify-between text-[9px]" style={{color:cor.txt}}>
                        <span>Global</span><span>✓ ok</span>
                      </div>
                      <div className="flex justify-between text-[9px]" style={{color:cor.txt}}>
                        <span>Por conta</span><span>✗ diverge</span>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* ── COL 3: Saldos por conta ── */}
              <div className="rounded-lg border bg-card" style={{display:'flex',flexDirection:'column',overflowY:'auto',maxHeight:'calc(100vh - 230px)'}}>
                <div className="px-3 py-1.5 border-b bg-muted/30 flex items-center justify-between shrink-0 sticky top-0 z-10 bg-card">
                  <span className="text-[9px] font-medium uppercase tracking-wider text-muted-foreground">🏦 Saldos por conta</span>
                  <div className="flex items-center gap-2">
                    {selectedConta !== '__all__' && (
                      <button onClick={() => setSelectedConta('__all__')}
                        className="text-[9px] text-muted-foreground border border-border rounded px-1.5 py-0.5 bg-transparent hover:bg-muted cursor-pointer">
                        ← Todas
                      </button>
                    )}
                    <button
                      onClick={() => {
                        const cId = selectedConta !== '__all__' ? selectedConta : (contas[0]?.id || '');
                        if (cId) handleEditSaldo(anoMesSel, cId, 0);
                      }}
                      className="text-[9px] text-blue-600 border border-blue-300 rounded px-1.5 py-0.5 bg-transparent hover:bg-blue-50 cursor-pointer flex items-center gap-0.5">
                      <Plus className="h-2.5 w-2.5" /> Cadastrar
                    </button>
                  </div>
                </div>

                {/* Table header */}
                <table className="w-full border-collapse" style={{fontSize:'10px'}}>
                  <thead>
                    <tr className="border-b">
                      <th className="py-1 px-2 text-left text-[9px] font-medium text-muted-foreground">Conta</th>
                      <th className="py-1 px-2 text-right text-[9px] font-medium text-muted-foreground">Sistema</th>
                      <th className="py-1 px-2 text-right text-[9px] font-medium text-muted-foreground">Extrato</th>
                      <th className="py-1 px-2 text-right text-[9px] font-medium text-muted-foreground">Diferença</th>
                      <th className="py-1 px-1 w-7" />
                    </tr>
                  </thead>
                  <tbody>
                    {/* Total row */}
                    <tr
                      className="border-b cursor-pointer hover:bg-muted/30 transition-colors"
                      style={{background: selectedConta==='__all__' ? '#E3F2FD' : 'var(--color-background-secondary,#F9FAFB)'}}
                      onClick={() => setSelectedConta('__all__')}
                    >
                      <td className="py-1 px-2 font-medium text-[10px]">Total — todas as contas</td>
                      <td className={`py-1 px-2 text-right font-medium text-[10px] ${totalSaldos.sis<0?'text-red-700':''}`}>{formatMoeda(totalSaldos.sis)}</td>
                      <td className="py-1 px-2 text-right font-medium text-[10px]">{totalSaldos.ext===null?'—':formatMoeda(totalSaldos.ext)}</td>
                      <td className={`py-1 px-2 text-right font-medium text-[10px] ${totalSaldos.dif<0?'text-red-700':totalSaldos.dif===0?'text-green-700':''}`}>
                        {formatMoeda(totalSaldos.dif)}
                      </td>
                      <td />
                    </tr>
                  </tbody>
                </table>

                {/* CC group */}
                {contasCC.length > 0 && <>
                  <div className="px-2 py-0.5 text-[8px] font-medium uppercase tracking-wider text-muted-foreground bg-muted/30">Conta corrente</div>
                  <table className="w-full border-collapse" style={{fontSize:'10px'}}>
                    <tbody>{contasCC.map(s=>(
                      <SaldoContaRow key={s.conta.id} data={s}
                        isActive={selectedConta===s.conta.id}
                        isDimmed={selectedConta!=='__all__'&&selectedConta!==s.conta.id}
                        onClick={()=>setSelectedConta(s.conta.id)}
                        onEdit={()=>handleEditSaldo(anoMesSel,s.conta.id,s.ext??0)}
                        canEdit={canEditSaldoFinal(anoMesSel)} />
                    ))}</tbody>
                  </table>
                </>}

                {/* INV group */}
                {contasINV.length > 0 && <>
                  <div className="px-2 py-0.5 text-[8px] font-medium uppercase tracking-wider text-muted-foreground bg-muted/30">Investimento</div>
                  <table className="w-full border-collapse" style={{fontSize:'10px'}}>
                    <tbody>{contasINV.map(s=>(
                      <SaldoContaRow key={s.conta.id} data={s}
                        isActive={selectedConta===s.conta.id}
                        isDimmed={selectedConta!=='__all__'&&selectedConta!==s.conta.id}
                        onClick={()=>setSelectedConta(s.conta.id)}
                        onEdit={()=>handleEditSaldo(anoMesSel,s.conta.id,s.ext??0)}
                        canEdit={canEditSaldoFinal(anoMesSel)} />
                    ))}</tbody>
                  </table>
                </>}

                {/* Cartao group */}
                {contasCartao.length > 0 && <>
                  <div className="px-2 py-0.5 text-[8px] font-medium uppercase tracking-wider text-muted-foreground bg-muted/30">Cartão</div>
                  <table className="w-full border-collapse" style={{fontSize:'10px'}}>
                    <tbody>{contasCartao.map(s=>(
                      <SaldoContaRow key={s.conta.id} data={s}
                        isActive={selectedConta===s.conta.id}
                        isDimmed={selectedConta!=='__all__'&&selectedConta!==s.conta.id}
                        onClick={()=>setSelectedConta(s.conta.id)}
                        onEdit={()=>handleEditSaldo(anoMesSel,s.conta.id,s.ext??0)}
                        canEdit={canEditSaldoFinal(anoMesSel)} />
                    ))}</tbody>
                  </table>
                </>}

                <div className="px-2 py-1 text-[9px] text-muted-foreground">
                  Clique para filtrar · ● verde=ok · ● vermelho=diverge · ○ cinza=sem extrato
                </div>
              </div>
            </div>

            {/* ════ FILTER BADGES → open lançamentos modal ════ */}
            <div className="flex items-center gap-1 flex-wrap">
              <button onClick={()=>{setFiltroModal('todos');setShowLancModal(true);}}
                className="px-2 py-0.5 rounded text-[9px] font-bold bg-blue-100 text-blue-800 hover:bg-blue-200 cursor-pointer">
                Todos ({selectedCard.lancamentos.length})
              </button>
              <button onClick={()=>{setFiltroModal('entradas');setShowLancModal(true);}}
                className="px-2 py-0.5 rounded text-[9px] font-bold bg-green-100 text-green-800 hover:bg-green-200 cursor-pointer">
                Entradas ({entradas.length})
              </button>
              <button onClick={()=>{setFiltroModal('saidas');setShowLancModal(true);}}
                className="px-2 py-0.5 rounded text-[9px] font-bold bg-red-100 text-red-800 hover:bg-red-200 cursor-pointer">
                Saídas ({saidas.length})
              </button>
            </div>
          </div>
        )}
      </div>

      {/* ════ LANÇAMENTOS MODAL ════ */}
      <Dialog open={showLancModal} onOpenChange={setShowLancModal}>
        <DialogContent className="max-w-4xl p-0 gap-0 flex flex-col" style={{maxHeight:'85vh'}}>
          <div className="px-4 py-3 border-b flex items-center gap-2 flex-shrink-0">
            <Button variant="ghost" size="icon" className="h-6 w-6 shrink-0" onClick={()=>setShowLancModal(false)}>
              <ArrowLeft className="h-4 w-4" />
            </Button>
            <span className="text-sm font-medium flex-1 min-w-0 truncate">
              Lançamentos — {selectedCard?.label}/{ano} — {contaAtual}
            </span>
            <div className="flex gap-1.5 flex-shrink-0">
              <span className="text-[10px] bg-green-100 text-green-700 px-2 py-0.5 rounded-full tabular-nums">+ {formatMoeda(totalEntradasModal)}</span>
              <span className="text-[10px] bg-red-100 text-red-700 px-2 py-0.5 rounded-full tabular-nums">- {formatMoeda(totalSaidasModal)}</span>
            </div>
          </div>
          {/* Filter badges */}
          <div className="px-4 py-1.5 border-b flex gap-1.5 flex-shrink-0">
            {([
              {key:'todos'   as const, label:`Todos (${selectedCard?.lancamentos.length||0})`, base:'bg-blue-100 text-blue-800',   active:'bg-blue-600 text-white'},
              {key:'entradas'as const, label:`Entradas (${entradas.length})`,  base:'bg-green-100 text-green-800', active:'bg-green-600 text-white'},
              {key:'saidas'  as const, label:`Saídas (${saidas.length})`,      base:'bg-red-100 text-red-800',     active:'bg-red-600 text-white'},
            ]).map(({key,label,base,active})=>(
              <button key={key} onClick={()=>setFiltroModal(key)}
                className={`px-2 py-0.5 rounded text-[9px] font-bold cursor-pointer transition-all ${filtroModal===key?active:base}`}>
                {label}
              </button>
            ))}
          </div>
          <div className="overflow-y-auto flex-1">
            <Table>
              <TableHeader>
                <TableRow className="bg-blue-600 hover:bg-blue-600">
                  {([
                    {key:'data'      as const, label:'Data pgto',  cls:'w-[72px]', right:false},
                    {key:'descricao' as const, label:'Descrição',   cls:'',         right:false},
                    {key:'fornecedor'as const, label:'Fornecedor',  cls:'w-[120px]',right:false},
                    {key:'valor'     as const, label:'Valor',       cls:'w-[90px]', right:true},
                  ]).map(h=>{
                    const active = lancSort.col===h.key;
                    const Icon = active ? (lancSort.dir==='asc' ? ArrowUp : ArrowDown) : ArrowUpDown;
                    return (
                      <TableHead key={h.key}
                        className={`text-[9px] text-white font-semibold cursor-pointer select-none ${h.cls} ${h.right?'text-right':''}`}
                        onClick={()=>setLancSort(p=>p.col===h.key?{col:h.key,dir:p.dir==='asc'?'desc':'asc'}:{col:h.key,dir:'asc'})}>
                        <span className="inline-flex items-center gap-0.5">
                          {h.label}<Icon className={`h-2.5 w-2.5 ${active?'opacity-100':'opacity-50'}`} />
                        </span>
                      </TableHead>
                    );
                  })}
                  <TableHead className="text-[9px] text-white font-semibold w-[100px]">Grupo</TableHead>
                  <TableHead className="w-[32px]" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {lancSorted.slice(0,200).map((l,idx)=>{
                  const cls     = classifyLanc(l,selectedConta);
                  const isEntr  = cls==='entrada'||cls==='transf_entrada';
                  const fornNome = l.favorecido_id ? fornecedorMap.get(l.favorecido_id)||'' : '';
                  return (
                    <TableRow key={idx} className={idx%2===1?'bg-muted/20':''}>
                      <TableCell className="text-[9px] py-0.5">{fmtDate(l.data_pagamento||l.data_competencia)}</TableCell>
                      <TableCell className="text-[9px] py-0.5 truncate max-w-[180px]">{l.descricao||'-'}</TableCell>
                      <TableCell className="text-[9px] py-0.5 truncate max-w-[110px] text-muted-foreground">{fornNome||<span className="italic">n/c</span>}</TableCell>
                      <TableCell className={`text-[9px] py-0.5 text-right font-medium tabular-nums ${isEntr?'text-green-700':'text-red-700'}`}>
                        {formatMoeda(isEntr ? Math.abs(l.valor) : -Math.abs(l.valor))}
                      </TableCell>
                      <TableCell className="text-[9px] py-0.5 text-muted-foreground truncate max-w-[90px]">{l.subcentro||'-'}</TableCell>
                      <TableCell className="py-0.5 text-center">
                        <button
                          className="border border-border rounded px-1 py-0.5 hover:bg-muted cursor-pointer"
                          onClick={()=>{
                            setShowLancModal(false);
                            if (onNavigateToLancamentos) onNavigateToLancamentos(ano,parseInt(selectedMes));
                          }}>
                          <Pencil className="h-2.5 w-2.5" />
                        </button>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
            {lancSorted.length > 200 && (
              <p className="text-[9px] text-center text-muted-foreground py-1">+{lancSorted.length-200} lançamentos</p>
            )}
          </div>
          <div className="px-4 py-2 border-t text-[9px] text-muted-foreground text-center flex-shrink-0">
            Colunas ordenáveis ↕ · ✏ abre lançamentos do mês
          </div>
        </DialogContent>
      </Dialog>

      {/* ════ EDIT SALDO DIALOG ════ */}
      <Dialog open={!!editingSaldo} onOpenChange={open=>!open&&setEditingSaldo(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-sm">Saldo Real no Extrato</DialogTitle>
            <DialogDescription className="text-xs">
              {editingSaldo?.anoMes} —{' '}
              {editingSaldo?.contaId
                ? getContaLabel(contas.find(c=>c.id===editingSaldo.contaId)||{id:'',nome_conta:editingSaldo.contaId,nome_exibicao:null,tipo_conta:null,codigo_conta:null})
                : ''}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <label className="text-xs font-medium">Valor (R$)</label>
            <Input value={editValue} onChange={e=>setEditValue(e.target.value)}
              className="h-8 text-sm" placeholder="0,00" autoFocus
              onKeyDown={e=>e.key==='Enter'&&handleSaveSaldo()} />
          </div>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={()=>setEditingSaldo(null)}>Cancelar</Button>
            <Button size="sm" onClick={handleSaveSaldo}>Salvar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/* ── Sub-component: SaldoContaRow ── */
interface SaldoContaRowProps {
  data: PerContaSaldo;
  isActive: boolean;
  isDimmed: boolean;
  onClick: () => void;
  onEdit: () => void;
  canEdit: boolean;
}

function SaldoContaRow({data, isActive, isDimmed, onClick, onEdit, canEdit}: SaldoContaRowProps) {
  const {conta, sis, ext, dif, status} = data;
  const dotColor = status==='realizado' ? '#2E7D32' : status==='nao_conciliado' ? '#C62828' : '#90A4AE';
  return (
    <tr
      className="border-b last:border-b-0 cursor-pointer hover:bg-muted/20 transition-all"
      style={{opacity:isDimmed?0.3:1, background:isActive?'#E3F2FD':undefined}}
      onClick={onClick}
    >
      <td className="py-1 px-2" style={{display:'flex',alignItems:'center',gap:'4px'}}>
        <span style={{width:8,height:8,borderRadius:'50%',background:dotColor,display:'inline-block',flexShrink:0}} />
        <span className="text-[10px] truncate" style={{maxWidth:'140px'}}>{getContaLabel(conta)}</span>
      </td>
      <td className={`py-1 px-2 text-right text-[10px] tabular-nums ${sis<0?'text-red-700':''}`}>{formatMoeda(sis)}</td>
      <td className="py-1 px-2 text-right text-[10px] tabular-nums">{ext===null?'—':formatMoeda(ext)}</td>
      <td className={`py-1 px-2 text-right text-[10px] font-medium tabular-nums ${dif<0?'text-red-700':dif===0?'text-green-700':''}`}>
        {formatMoeda(dif)}
      </td>
      <td className="py-1 px-1 text-center">
        {canEdit && (
          <button className="border border-border rounded px-1 py-0.5 hover:bg-muted cursor-pointer"
            onClick={e=>{e.stopPropagation();onEdit();}}>
            <Pencil className="h-2.5 w-2.5" />
          </button>
        )}
      </td>
    </tr>
  );
}
