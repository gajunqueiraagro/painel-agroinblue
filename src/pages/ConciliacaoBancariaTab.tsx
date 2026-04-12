import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useCliente } from '@/contexts/ClienteContext';
import { usePermissions } from '@/hooks/usePermissions';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { formatMoeda } from '@/lib/calculos/formatters';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import {
  CheckCircle2, AlertTriangle, XCircle, Pencil, ExternalLink, ArrowLeft,
  ArrowUp, ArrowDown, ArrowUpDown,
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
import { isTransferenciaTipo } from '@/lib/financeiro/v2Transferencia';
import { buildUnifiedSaldos, type ContaSaldoRef, type SaldoV2SourceRow, type SaldoLegacySourceRow } from '@/lib/financeiro/saldosBancarios';

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
}

interface FornecedorRef {
  id: string;
  nome: string;
}

interface MesCard {
  mes: string; // '01'..'12'
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
  status: ConciliacaoStatus;
  saldoRow: SaldoRow | null;
  lancamentos: LancamentoResumo[];
}

function fmtDate(d: string | null) {
  if (!d) return '-';
  try { return format(parseISO(d), 'dd/MM/yy'); } catch { return d; }
}

function normalizeTipoOperacao(tipo: string | null | undefined) {
  return (tipo || '').toLowerCase().replace(/[\s\-–—]/g, '');
}

function isEntradaTipo(tipo: string | null | undefined) {
  const normalized = normalizeTipoOperacao(tipo);
  return normalized.startsWith('1') || normalized.includes('entrada');
}

const MESES_LABELS = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];

const CONTA_GROUP_ORDER: Record<string, number> = { cc: 0, inv: 1, cartao: 2 };

function sortContas(contas: ContaRef[]): ContaRef[] {
  return [...contas].sort((a, b) => {
    const tA = (a.tipo_conta || '').toLowerCase();
    const tB = (b.tipo_conta || '').toLowerCase();
    const gA = CONTA_GROUP_ORDER[tA] ?? 99;
    const gB = CONTA_GROUP_ORDER[tB] ?? 99;
    if (gA !== gB) return gA - gB;
    return (a.nome_conta || '').localeCompare(b.nome_conta || '', 'pt-BR');
  });
}

function contaLabel(c: ContaRef): string {
  return c.nome_exibicao || c.nome_conta;
}

// Use shared getConciliacaoStatus from conciliacaoCalc

const STATUS_CONFIG = {
  realizado: { label: 'Conciliado', color: 'bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300', icon: CheckCircle2, iconColor: 'text-green-600' },
  nao_conciliado: { label: 'Não Conciliado', color: 'bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300', icon: XCircle, iconColor: 'text-red-600' },
  pendente: { label: 'Pendente', color: 'bg-muted text-muted-foreground', icon: AlertTriangle, iconColor: 'text-muted-foreground' },
};

interface ConciliacaoProps {
  onNavigateToLancamentos?: (ano: string, mes: number) => void;
  onBack?: () => void;
  initialAno?: string;
  initialConta?: string;
  initialMes?: string;
}

export function ConciliacaoBancariaTab({ onNavigateToLancamentos, onBack, initialAno, initialConta, initialMes }: ConciliacaoProps = {}) {
  const { clienteAtual } = useCliente();
  const perm = usePermissions();
  const isAdmin = perm.perfil === 'admin_agroinblue' || perm.perfil === 'gestor_cliente';
  const isFinanceiro = perm.perfil === 'financeiro';
  const clienteId = clienteAtual?.id;

  const currentYear = new Date().getFullYear();
  const currentMonth = new Date().getMonth() + 1;
  const [anos, setAnos] = useState<string[]>([String(currentYear)]);

  // Load dynamic years from saldos + lancamentos (use high limit to avoid 1000-row cap)
  useEffect(() => {
    if (!clienteId) return;
    Promise.all([
      supabase.from('financeiro_saldos_bancarios_v2').select('ano_mes').eq('cliente_id', clienteId).limit(10000),
      supabase.from('financeiro_saldos_bancarios').select('ano_mes').eq('cliente_id', clienteId).limit(10000),
      supabase.from('financeiro_lancamentos_v2').select('ano_mes').eq('cliente_id', clienteId).eq('cancelado', false).limit(10000),
    ]).then(([sRes, legRes, lRes]) => {
      const set = new Set<string>();
      set.add(String(currentYear));
      (sRes.data || []).forEach((r: any) => { if (r.ano_mes) set.add(r.ano_mes.substring(0, 4)); });
      (legRes.data || []).forEach((r: any) => { if (r.ano_mes) set.add(r.ano_mes.substring(0, 4)); });
      (lRes.data || []).forEach((r: any) => { if (r.ano_mes) set.add(r.ano_mes.substring(0, 4)); });
      setAnos(Array.from(set).sort((a, b) => b.localeCompare(a)));
    });
  }, [clienteId, currentYear]);

  const [ano, setAno] = useState(initialAno || String(currentYear));
  const [contaId, setContaId] = useState<string>(initialConta || '__all__');
  const [contas, setContas] = useState<ContaRef[]>([]);
  const [fornecedores, setFornecedores] = useState<FornecedorRef[]>([]);
  const [saldos, setSaldos] = useState<SaldoRow[]>([]);
  const [lancamentos, setLancamentos] = useState<LancamentoResumo[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedMes, setSelectedMes] = useState<string>(initialMes || String(currentMonth).padStart(2, '0'));
  const [filtroTipoLanc, setFiltroTipoLanc] = useState<'todos' | 'entradas' | 'saidas' | 'transf_entrada' | 'transf_saida'>('todos');
  const [lancSort, setLancSort] = useState<{ col: 'data' | 'descricao' | 'fornecedor' | 'valor'; dir: 'asc' | 'desc' }>({ col: 'data', dir: 'asc' });
  const [editingSaldo, setEditingSaldo] = useState<{ anoMes: string; contaId: string; current: number } | null>(null);
  const [editValue, setEditValue] = useState('');
  

  useEffect(() => {
    if (!clienteId) return;
    supabase
      .from('financeiro_contas_bancarias')
      .select('id, nome_conta, nome_exibicao, tipo_conta, codigo_conta')
      .eq('cliente_id', clienteId)
      .eq('ativa', true)
      .order('ordem_exibicao')
      .then(({ data }) => {
        const sorted = sortContas((data as ContaRef[]) || []);
        setContas(sorted);
      });
    supabase
      .from('financeiro_fornecedores')
      .select('id, nome')
      .eq('cliente_id', clienteId)
      .eq('ativo', true)
      .then(({ data }) => {
        setFornecedores((data as FornecedorRef[]) || []);
      });
  }, [clienteId]);

  const loadData = useCallback(async () => {
    if (!clienteId) return;
    setLoading(true);

    const anoMesMin = `${ano}-01`;
    const anoMesMax = `${ano}-12`;
    // Also load December of previous year for saldo_inicial chaining into Jan
    const prevDec = `${Number(ano) - 1}-12`;

    // Load V2 saldos
    let sQuery = supabase
      .from('financeiro_saldos_bancarios_v2')
      .select('id, ano_mes, conta_bancaria_id, fazenda_id, saldo_inicial, saldo_final, fechado, status_mes, origem_saldo, origem_saldo_inicial, observacao')
      .eq('cliente_id', clienteId)
      .gte('ano_mes', prevDec)
      .lte('ano_mes', anoMesMax);
    if (contaId !== '__all__') sQuery = sQuery.eq('conta_bancaria_id', contaId);

    // Load legacy saldos
    let legQuery = supabase
      .from('financeiro_saldos_bancarios')
      .select('id, ano_mes, conta_banco, fazenda_id, saldo_final')
      .eq('cliente_id', clienteId)
      .gte('ano_mes', prevDec)
      .lte('ano_mes', anoMesMax);

    const [{ data: sData }, { data: legData }] = await Promise.all([sQuery, legQuery]);

    // Unify using buildUnifiedSaldos so legacy saldos chain correctly
    const contasRef: ContaSaldoRef[] = contas.map(c => ({
      id: c.id,
      nome_conta: c.nome_conta,
      nome_exibicao: c.nome_exibicao,
      tipo_conta: c.tipo_conta,
      codigo_conta: c.codigo_conta,
    }));

    const unified = buildUnifiedSaldos({
      v2Saldos: (sData as SaldoV2SourceRow[]) || [],
      legacySaldos: (legData as SaldoLegacySourceRow[]) || [],
      contas: contasRef,
      movSummary: {},
    });

    // Map unified rows to SaldoRow shape for the existing card logic
    const mappedSaldos: SaldoRow[] = unified
      .filter(u => contaId === '__all__' || u.conta_bancaria_id === contaId || u.conta_bancaria_id_v2 === contaId)
      .map(u => ({
        id: u.id,
        ano_mes: u.ano_mes,
        conta_bancaria_id: u.conta_bancaria_id_v2 || u.conta_bancaria_id,
        saldo_inicial: u.saldo_inicial,
        saldo_final: u.saldo_final,
        status_mes: u.status_mes,
        origem_saldo_inicial: u.origem_saldo_inicial,
      }));

    setSaldos(mappedSaldos);

    const batchSize = 1000;
    const allLanc: LancamentoResumo[] = [];
    let from = 0;
    while (true) {
      let lQuery = supabase
        .from('financeiro_lancamentos_v2')
        .select('id, tipo_operacao, valor, sinal, data_competencia, data_pagamento, descricao, status_transacao, favorecido_id, numero_documento, conta_bancaria_id, conta_destino_id, ano_mes')
        .eq('cliente_id', clienteId)
        .eq('cancelado', false)
        .in('status_transacao', [...STATUS_REALIZADOS])
        .gte('ano_mes', anoMesMin)
        .lte('ano_mes', anoMesMax);
      if (contaId !== '__all__') {
        lQuery = lQuery.or(`conta_bancaria_id.eq.${contaId},conta_destino_id.eq.${contaId}`);
      }
      lQuery = lQuery.order('ano_mes').order('data_competencia').range(from, from + batchSize - 1);
      const { data: lData } = await lQuery;
      if (!lData || lData.length === 0) break;
      allLanc.push(...((lData as LancamentoResumo[]).filter(l => belongsToConta(l, contaId))));
      if (lData.length < batchSize) break;
      from += batchSize;
    }
    setLancamentos(allLanc);
    setLoading(false);
  }, [clienteId, ano, contaId, contas]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const mesCards: MesCard[] = useMemo(() => {
    /** Round to 2 decimal places — single source of monetary rounding */
    const r2 = (n: number) => Math.round(n * 100) / 100;

    const cards: MesCard[] = [];
    // Track previous month's saldo_final per conta for chaining
    // Initialize from December of previous year if available
    const prevFinalByAccount = new Map<string, number>();
    const prevDec = `${Number(ano) - 1}-12`;
    for (const s of saldos.filter(row => row.ano_mes === prevDec)) {
      prevFinalByAccount.set(s.conta_bancaria_id, r2((prevFinalByAccount.get(s.conta_bancaria_id) || 0) + s.saldo_final));
    }

    for (let m = 1; m <= 12; m++) {
      const mesStr = String(m).padStart(2, '0');
      const anoMes = `${ano}-${mesStr}`;
      const isAllContas = contaId === '__all__';

      const saldoRows = saldos.filter(s => s.ano_mes === anoMes);
      const saldoRow = contaId !== '__all__' ? saldoRows[0] || null : null;
      const mesLancs = lancamentos.filter(l => l.ano_mes === anoMes && belongsToConta(l, contaId));

      if (!isAllContas) {
        const official = calcConciliacaoMensal({
          contaId,
          anoMes,
          saldoRows,
          lancamentos: lancamentos as ConciliacaoLancamentoBase[],
          fallbackSaldoInicial: prevFinalByAccount.get(contaId) || 0,
        });

        cards.push({
          mes: mesStr,
          label: MESES_LABELS[m - 1],
          anoMes,
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
          status: official.status,
          saldoRow,
          lancamentos: mesLancs,
        });

        if (saldoRows.length > 0) {
          for (const s of saldoRows) {
            prevFinalByAccount.set(s.conta_bancaria_id, s.saldo_final);
          }
        } else {
          prevFinalByAccount.set(contaId, official.saldoCalculado);
        }

        continue;
      }

      // Saldo inicial: prefer registered value, then chain from previous month
      let saldoInicial: number;
      if (saldoRows.length > 0) {
        saldoInicial = r2(saldoRows.reduce((sum, s) => sum + (s.saldo_inicial || 0), 0));
      } else if (contaId !== '__all__') {
        saldoInicial = prevFinalByAccount.get(contaId) || 0;
      } else {
        // All accounts: sum all tracked previous finals
        saldoInicial = r2(Array.from(prevFinalByAccount.values()).reduce((s, v) => s + v, 0));
      }

      let entradasTerceiros = 0;
      let transferenciasRecebidas = 0;
      let saidasTerceiros = 0;
      let transferenciasEnviadas = 0;

      for (const l of mesLancs) {
        const valor = r2(Math.abs(l.valor));
        const isTransf = isTransferenciaTipo(l.tipo_operacao || '');

        if (isTransf) {
          if (isAllContas) continue;
          if (l.conta_destino_id === contaId) {
            transferenciasRecebidas = r2(transferenciasRecebidas + valor);
          } else if (l.conta_bancaria_id === contaId) {
            transferenciasEnviadas = r2(transferenciasEnviadas + valor);
          }
        } else {
          if (isAllContas) {
            if (isEntradaTipo(l.tipo_operacao)) {
              entradasTerceiros = r2(entradasTerceiros + valor);
            } else {
              saidasTerceiros = r2(saidasTerceiros + valor);
            }
          } else {
            if (l.conta_destino_id === contaId) {
              entradasTerceiros = r2(entradasTerceiros + valor);
            } else if (l.conta_bancaria_id === contaId) {
              saidasTerceiros = r2(saidasTerceiros + valor);
            }
          }
        }
      }

      const totalEntradas = r2(entradasTerceiros + transferenciasRecebidas);
      const totalSaidas = r2(saidasTerceiros + transferenciasEnviadas);
      const saldoCalculado = r2(saldoInicial + totalEntradas - totalSaidas);

      const saldoExtrato = saldoRows.length > 0
        ? r2(saldoRows.reduce((sum, s) => sum + (s.saldo_final || 0), 0))
        : null;

      const diferenca = saldoExtrato !== null
        ? r2(saldoExtrato - saldoCalculado)
        : 0;

      let status: MesCard['status'];
      if (isAllContas && contas.length > 0) {
        const accountsWithSaldo = contas.filter(conta =>
          saldos.some(s => s.ano_mes === anoMes && s.conta_bancaria_id === conta.id)
        );
        if (accountsWithSaldo.length === 0) {
          status = 'pendente';
        } else {
          const perAccountStatuses = accountsWithSaldo.map(conta => {
            const official = calcConciliacaoMensal({
              contaId: conta.id,
              anoMes,
              saldoRows: saldos,
              lancamentos: lancamentos as ConciliacaoLancamentoBase[],
              fallbackSaldoInicial: prevFinalByAccount.get(conta.id) || 0,
            });
            return official.status === 'realizado' ? 'realizado' as const : 'nao_conciliado' as const;
          });
          status = perAccountStatuses.some(s => s === 'nao_conciliado') ? 'nao_conciliado' : 'realizado';
        }
      }

      cards.push({
        mes: mesStr,
        label: MESES_LABELS[m - 1],
        anoMes,
        saldoInicial,
        entradasTerceiros,
        transferenciasRecebidas,
        totalEntradas,
        saidasTerceiros,
        transferenciasEnviadas,
        totalSaidas,
        saldoCalculado,
        saldoExtrato,
        diferenca,
        status,
        saldoRow,
        lancamentos: mesLancs,
      });

      // Update chain tracking for next month
      if (saldoRows.length > 0) {
        for (const s of saldoRows) {
          prevFinalByAccount.set(s.conta_bancaria_id, r2(s.saldo_final || 0));
        }
      } else if (contaId !== '__all__') {
        prevFinalByAccount.set(contaId, saldoCalculado);
      }
    }

    return cards;
  }, [ano, contaId, saldos, lancamentos, contas]);


  const summary = useMemo(() => {
    const totalEntradas = mesCards.reduce((s, c) => s + c.totalEntradas, 0);
    const totalSaidas = mesCards.reduce((s, c) => s + c.totalSaidas, 0);
    const conciliados = mesCards.filter(c => c.status === 'realizado').length;
    const pendentes = mesCards.filter(c => c.status === 'pendente').length;
    const naoConc = mesCards.filter(c => c.status === 'nao_conciliado').length;
    return { totalEntradas, totalSaidas, saldo: totalEntradas - totalSaidas, conciliados, pendentes, naoConc };
  }, [mesCards]);

  const handleEditSaldo = (anoMes: string, cId: string, current: number) => {
    setEditingSaldo({ anoMes, contaId: cId, current });
    setEditValue(current.toFixed(2).replace('.', ','));
  };

  const handleSaveSaldo = async () => {
    if (!editingSaldo || !clienteId) return;
    const val = parseFloat(editValue.replace(/\./g, '').replace(',', '.'));
    if (isNaN(val)) { toast.error('Valor inválido'); return; }

    const existing = saldos.find(
      s => s.ano_mes === editingSaldo.anoMes && s.conta_bancaria_id === editingSaldo.contaId
    );

    if (existing) {
      const { error } = await supabase
        .from('financeiro_saldos_bancarios_v2')
        .update({ saldo_final: val, updated_at: new Date().toISOString() })
        .eq('id', existing.id);
      if (error) { toast.error('Erro ao salvar'); return; }
    } else {
      const conta = contas.find(c => c.id === editingSaldo.contaId);
      if (!conta) { toast.error('Conta não encontrada'); return; }
      const { data: contaData } = await supabase
        .from('financeiro_contas_bancarias')
        .select('fazenda_id')
        .eq('id', editingSaldo.contaId)
        .single();
      if (!contaData) { toast.error('Erro ao buscar fazenda da conta'); return; }

      const { error } = await supabase
        .from('financeiro_saldos_bancarios_v2')
        .insert({
          cliente_id: clienteId,
          fazenda_id: contaData.fazenda_id,
          conta_bancaria_id: editingSaldo.contaId,
          ano_mes: editingSaldo.anoMes,
          saldo_inicial: 0,
          saldo_final: val,
          origem_saldo_inicial: 'manual',
          status_mes: 'aberto',
        });
      if (error) { toast.error('Erro ao criar saldo'); return; }
    }

    toast.success('Saldo do extrato atualizado');
    setEditingSaldo(null);
    loadData();
  };

  const canEditSaldoFinal = (anoMes: string): boolean => {
    if (isAdmin) return true;
    const [y, m] = anoMes.split('-').map(Number);
    const isCurrent = y === currentYear && m === currentMonth;
    return isCurrent && isFinanceiro;
  };

  const selectedCard = useMemo(() => mesCards.find(c => c.mes === selectedMes) || null, [mesCards, selectedMes]);

  return (
    <div className="animate-fade-in pb-20">
      <div className="p-3 space-y-2">
        {/* Header: filtros + meses */}
        <div className="flex items-center gap-2">
          {onBack && (
            <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0" onClick={onBack}>
              <ArrowLeft className="h-4 w-4" />
            </Button>
          )}
          <Select value={ano} onValueChange={setAno}>
            <SelectTrigger className="h-7 text-xs w-[72px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              {anos.map(a => <SelectItem key={a} value={a} className="text-xs">{a}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={contaId} onValueChange={setContaId}>
            <SelectTrigger className="h-7 text-xs w-[220px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="__all__" className="text-xs">Todas as contas</SelectItem>
              {contas.map(c => (
                <SelectItem key={c.id} value={c.id} className="text-xs">{contaLabel(c)}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <div className="flex flex-1 gap-0.5 rounded-md overflow-hidden ml-2">
            {mesCards.map(c => {
              const cfg = STATUS_CONFIG[c.status as keyof typeof STATUS_CONFIG] ?? STATUS_CONFIG.pendente;
              const isSelected = selectedMes === c.mes;
              return (
                <button
                  key={c.mes}
                  onClick={() => setSelectedMes(c.mes)}
                  className={`flex-1 py-1.5 text-center text-[9px] font-bold transition-all ${cfg.color} hover:opacity-80 ${isSelected ? 'ring-2 ring-primary scale-105 z-10' : 'opacity-70'}`}
                  title={`${c.label}: ${cfg.label}`}
                >
                  {c.label}
                </button>
              );
            })}
          </div>
        </div>

        {loading ? (
          <div className="text-center text-xs text-muted-foreground py-8">Carregando...</div>
        ) : selectedCard && (() => {
          const card = selectedCard;
          const cfg = STATUS_CONFIG[card.status as keyof typeof STATUS_CONFIG] ?? STATUS_CONFIG.pendente;
          const StatusIcon = cfg.icon;
          const diffAbs = Math.abs(card.diferenca);
          const isConciliado = card.status === 'realizado';
          const isPendente = card.status === 'pendente';

          return (
            <div className="space-y-2">
              {/* Título do mês + botão lançamentos */}
              <div className="flex items-center gap-2">
                <StatusIcon className={`h-4 w-4 ${cfg.iconColor}`} />
                <span className="text-sm font-bold">{card.label}/{ano}</span>
                <Badge variant="outline" className={`text-[9px] px-1.5 py-0 ${cfg.color}`}>
                  {cfg.label}
                </Badge>
                {onNavigateToLancamentos && (
                  <Button
                    size="sm"
                    className="h-6 text-[10px] gap-1 px-2.5 bg-primary text-primary-foreground hover:bg-primary/90 font-semibold shadow-sm"
                    onClick={() => onNavigateToLancamentos(ano, parseInt(selectedMes))}
                  >
                    <ExternalLink className="h-3.5 w-3.5" /> Lançamentos
                  </Button>
                )}
              </div>

              {/* ═══ 3 COLUNAS ═══ */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-2">

                {/* ── COL 1: Conciliação ── */}
                <div className="rounded-md p-3 space-y-2">
                  <p className="text-[10px] font-bold text-foreground uppercase tracking-wider">Conciliação</p>

                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <p className="text-[10px] text-muted-foreground">Saldo Extrato</p>
                      <p className="text-xs font-medium tabular-nums text-muted-foreground/70">
                          {card.saldoExtrato !== null ? formatMoeda(card.saldoExtrato) : '—'}
                        </p>
                    </div>

                    <div className="flex items-center justify-between">
                      <p className="text-[10px] text-muted-foreground">Saldo no Sistema</p>
                      <p className="text-xs font-medium tabular-nums">{formatMoeda(card.saldoCalculado)}</p>
                    </div>

                    <div className="border-t pt-1.5 flex items-center justify-between">
                      <p className="text-[10px] text-muted-foreground">Diferença para Conciliar</p>
                      <p className={`text-xs font-bold tabular-nums ${Math.round(card.diferenca * 100) === 0 ? 'text-green-600' : 'text-red-600'}`}>
                        {formatMoeda(card.diferenca)}
                      </p>
                    </div>
                  </div>
                </div>

                {/* ── COL 2: Movimento Financeiro ── */}
                <div className="space-y-0">
                  <div className="px-2 py-0.5 flex items-center justify-between">
                    <p className="text-[9px] text-muted-foreground uppercase tracking-wider font-medium">Saldo Inicial</p>
                    <p className="text-[9px] text-muted-foreground tabular-nums">{formatMoeda(card.saldoInicial)}</p>
                  </div>

                  <div className="px-2.5 py-1">
                    <div className="flex items-baseline justify-between">
                      <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Entradas</p>
                      <p className="text-sm font-bold tabular-nums text-green-600">{formatMoeda(card.totalEntradas)}</p>
                    </div>
                    {contaId !== '__all__' && (
                      <div className="mt-0.5 space-y-0.5 border-t pt-0.5">
                        <p className="text-[9px] text-muted-foreground flex justify-between">
                          <span>Terceiros</span><span className="tabular-nums">{formatMoeda(card.entradasTerceiros)}</span>
                        </p>
                        <p className="text-[9px] text-muted-foreground flex justify-between">
                          <span>Transferências</span><span className="tabular-nums">{formatMoeda(card.transferenciasRecebidas)}</span>
                        </p>
                      </div>
                    )}
                  </div>

                  <div className="px-2.5 py-1">
                    <div className="flex items-baseline justify-between">
                      <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Saídas</p>
                      <p className="text-sm font-bold tabular-nums text-red-600">{formatMoeda(card.totalSaidas)}</p>
                    </div>
                    {contaId !== '__all__' && (
                      <div className="mt-0.5 space-y-0.5 border-t pt-0.5">
                        <p className="text-[9px] text-muted-foreground flex justify-between">
                          <span>Terceiros</span><span className="tabular-nums">{formatMoeda(card.saidasTerceiros)}</span>
                        </p>
                        <p className="text-[9px] text-muted-foreground flex justify-between">
                          <span>Transferências</span><span className="tabular-nums">{formatMoeda(card.transferenciasEnviadas)}</span>
                        </p>
                      </div>
                    )}
                  </div>

                  <div className="px-2.5 pt-0.5 border-t">
                    <div className="flex items-center justify-between">
                      <p className="text-[9px] text-muted-foreground uppercase tracking-wider font-medium">Saldo no Sistema</p>
                      <p className={`text-xs font-bold tabular-nums ${card.saldoCalculado >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                        {formatMoeda(card.saldoCalculado)}
                      </p>
                    </div>
                  </div>
                </div>

                {/* ── COL 3: Status da Conciliação (sem borda, mais leve) ── */}
                <div className={`rounded-lg p-4 flex flex-col items-center justify-center text-center space-y-2 ${
                  isConciliado
                    ? 'bg-green-50/60 dark:bg-green-950/20'
                    : isPendente
                      ? 'bg-muted/30'
                      : 'bg-red-50/60 dark:bg-red-950/20'
                }`}>
                  <StatusIcon className={`h-8 w-8 ${cfg.iconColor}`} />
                  <p className={`text-sm font-extrabold ${
                    isConciliado ? 'text-green-700 dark:text-green-300'
                      : isPendente ? 'text-muted-foreground'
                        : 'text-red-700 dark:text-red-300'
                  }`}>
                    {isConciliado ? '✅ Conciliado' : isPendente ? '⏳ Pendente' : '❌ Não Conciliado'}
                  </p>
                  {!isPendente && (
                    <p className={`text-xs font-bold tabular-nums ${Math.round(card.diferenca * 100) === 0 ? 'text-green-600' : 'text-red-600'}`}>
                      Diferença: {formatMoeda(card.diferenca)}
                    </p>
                  )}
                  {isPendente && (
                    <p className="text-[10px] text-muted-foreground">Informe o saldo do extrato</p>
                  )}
                  {!isConciliado && !isPendente && onNavigateToLancamentos && (
                    <Button
                      size="sm"
                      className="mt-1 h-7 text-[11px] gap-1.5 px-3 bg-cta text-cta-foreground hover:bg-cta-hover font-semibold shadow-sm"
                      onClick={() => onNavigateToLancamentos(ano, parseInt(selectedMes))}
                    >
                      <ExternalLink className="h-3.5 w-3.5" /> Conciliar
                    </Button>
                  )}
                </div>
              </div>

              {/* ═══ LANÇAMENTOS ═══ */}
              {card.lancamentos.length > 0 && (() => {
                const classifyLanc = (l: LancamentoResumo) => {
                  const tipo = (l.tipo_operacao || '').toLowerCase().replace(/[\s\-–—]/g, '');
                  const isTransf = tipo.startsWith('3') || tipo.includes('transfer');

                  if (isTransf) {
                    const isDestino = contaId !== '__all__' && l.conta_destino_id === contaId;
                    return isDestino ? 'transf_entrada' : 'transf_saida';
                  }
                  if (tipo.startsWith('1') || tipo.includes('entrada')) return 'entrada';
                  return 'saida';
                };

                const entradas = card.lancamentos.filter(l => classifyLanc(l) === 'entrada');
                const saidas = card.lancamentos.filter(l => classifyLanc(l) === 'saida');
                const transfEntrada = card.lancamentos.filter(l => classifyLanc(l) === 'transf_entrada');
                const transfSaida = card.lancamentos.filter(l => classifyLanc(l) === 'transf_saida');

                const lancFiltrados = (() => {
                  switch (filtroTipoLanc) {
                    case 'entradas': return entradas;
                    case 'saidas': return saidas;
                    case 'transf_entrada': return transfEntrada;
                    case 'transf_saida': return transfSaida;
                    default: return card.lancamentos;
                  }
                })()
                  .slice()
                  .sort((a, b) => {
                    const dA = a.data_pagamento || a.data_competencia || '';
                    const dB = b.data_pagamento || b.data_competencia || '';
                    return dA.localeCompare(dB);
                  });

                const fornecedorMap = new Map(fornecedores.map(f => [f.id, f.nome]));

                return (
                  <div>
                    <div className="flex items-center gap-1 mb-1 flex-wrap">
                      <button
                        onClick={() => setFiltroTipoLanc('todos')}
                        className={`px-2 py-0.5 rounded text-[9px] font-bold transition-all ${filtroTipoLanc === 'todos' ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground hover:bg-muted/80'}`}
                      >
                        Todos ({card.lancamentos.length})
                      </button>
                      <button
                        onClick={() => setFiltroTipoLanc(filtroTipoLanc === 'entradas' ? 'todos' : 'entradas')}
                        className={`px-2 py-0.5 rounded text-[9px] font-bold transition-all ${filtroTipoLanc === 'entradas' ? 'bg-green-600 text-white' : 'bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300 hover:opacity-80'}`}
                      >
                        Entradas ({entradas.length})
                      </button>
                      <button
                        onClick={() => setFiltroTipoLanc(filtroTipoLanc === 'saidas' ? 'todos' : 'saidas')}
                        className={`px-2 py-0.5 rounded text-[9px] font-bold transition-all ${filtroTipoLanc === 'saidas' ? 'bg-red-600 text-white' : 'bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300 hover:opacity-80'}`}
                      >
                        Saídas ({saidas.length})
                      </button>
                      {contaId !== '__all__' && (
                        <>
                          <button
                            onClick={() => setFiltroTipoLanc(filtroTipoLanc === 'transf_entrada' ? 'todos' : 'transf_entrada')}
                            className={`px-2 py-0.5 rounded text-[9px] font-bold transition-all ${filtroTipoLanc === 'transf_entrada' ? 'bg-blue-600 text-white' : 'bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300 hover:opacity-80'}`}
                          >
                            Transf. Ent. ({transfEntrada.length})
                          </button>
                          <button
                            onClick={() => setFiltroTipoLanc(filtroTipoLanc === 'transf_saida' ? 'todos' : 'transf_saida')}
                            className={`px-2 py-0.5 rounded text-[9px] font-bold transition-all ${filtroTipoLanc === 'transf_saida' ? 'bg-orange-600 text-white' : 'bg-orange-100 text-orange-800 dark:bg-orange-900/40 dark:text-orange-300 hover:opacity-80'}`}
                          >
                            Transf. Saída ({transfSaida.length})
                          </button>
                        </>
                      )}
                    </div>
                    <div className="max-h-[300px] overflow-y-auto rounded border">
                      <Table>
                        <TableHeader>
                          <TableRow className="bg-blue-600 hover:bg-blue-600">
                            {([
                              { key: 'data' as const, label: 'Data', cls: 'w-[50px]', align: '' },
                              { key: 'descricao' as const, label: 'Descrição', cls: '', align: '' },
                              { key: 'fornecedor' as const, label: 'Fornecedor', cls: '', align: '' },
                              { key: 'valor' as const, label: 'Valor', cls: 'w-[130px]', align: 'text-right' },
                            ]).map(h => {
                              const active = lancSort.col === h.key;
                              const Icon = active ? (lancSort.dir === 'asc' ? ArrowUp : ArrowDown) : ArrowUpDown;
                              return (
                                <TableHead
                                  key={h.key}
                                  className={`text-[9px] text-white font-semibold cursor-pointer select-none ${h.cls} ${h.align}`}
                                  onClick={() => setLancSort(prev => prev.col === h.key ? { col: h.key, dir: prev.dir === 'asc' ? 'desc' : 'asc' } : { col: h.key, dir: 'asc' })}
                                >
                                  <span className="inline-flex items-center gap-0.5">
                                    {h.label}
                                    <Icon className={`h-2.5 w-2.5 ${active ? 'opacity-100' : 'opacity-50'}`} />
                                  </span>
                                </TableHead>
                              );
                            })}
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {(() => {
                            const sorted = [...lancFiltrados].sort((a, b) => {
                              const dir = lancSort.dir === 'asc' ? 1 : -1;
                              switch (lancSort.col) {
                                case 'data': return dir * (a.data_pagamento || a.data_competencia || '').localeCompare(b.data_pagamento || b.data_competencia || '');
                                case 'descricao': return dir * (a.descricao || '').localeCompare(b.descricao || '', 'pt-BR');
                                case 'fornecedor': {
                                  const fa = a.favorecido_id ? fornecedorMap.get(a.favorecido_id) || '' : '';
                                  const fb = b.favorecido_id ? fornecedorMap.get(b.favorecido_id) || '' : '';
                                  return dir * fa.localeCompare(fb, 'pt-BR');
                                }
                                case 'valor': {
                                  const clsA = classifyLanc(a);
                                  const clsB = classifyLanc(b);
                                  const va = (clsA === 'entrada' || clsA === 'transf_entrada') ? Math.abs(a.valor) : -Math.abs(a.valor);
                                  const vb = (clsB === 'entrada' || clsB === 'transf_entrada') ? Math.abs(b.valor) : -Math.abs(b.valor);
                                  return dir * (va - vb);
                                }
                                default: return 0;
                              }
                            });
                            return sorted.slice(0, 50).map((l, idx) => {
                              const cls = classifyLanc(l);
                              const isEntrada = cls === 'entrada' || cls === 'transf_entrada';
                              const fornNome = l.favorecido_id ? fornecedorMap.get(l.favorecido_id) || '' : '';
                              return (
                                <TableRow key={idx}>
                                  <TableCell className="text-[9px] py-0.5">{fmtDate(l.data_pagamento || l.data_competencia)}</TableCell>
                                  <TableCell className="text-[9px] py-0.5 truncate max-w-[150px]">{l.descricao || '-'}</TableCell>
                                  <TableCell className="text-[9px] py-0.5 truncate max-w-[120px]">{fornNome || <span className="italic text-muted-foreground">n/c</span>}</TableCell>
                                  <TableCell className={`text-[9px] py-0.5 text-right font-medium tabular-nums whitespace-nowrap ${isEntrada ? 'text-green-700' : 'text-red-700'}`}>
                                    {formatMoeda(isEntrada ? Math.abs(l.valor) : -Math.abs(l.valor))}
                                  </TableCell>
                                </TableRow>
                              );
                            });
                          })()}
                        </TableBody>
                      </Table>
                      {lancFiltrados.length > 50 && (
                        <p className="text-[9px] text-center text-muted-foreground py-1">
                          +{lancFiltrados.length - 50} lançamentos
                        </p>
                      )}
                    </div>
                  </div>
                );
              })()}

              {card.lancamentos.length === 0 && (
                <p className="text-[10px] text-muted-foreground text-center py-2">Nenhum lançamento neste mês</p>
              )}
            </div>
          );
        })()}
      </div>

      <Dialog open={!!editingSaldo} onOpenChange={(open) => !open && setEditingSaldo(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-sm">Saldo Real no Extrato</DialogTitle>
            <DialogDescription className="text-xs">
              Informe o saldo real conforme extrato bancário para {editingSaldo?.anoMes}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <label className="text-xs font-medium">Valor (R$)</label>
            <Input
              value={editValue}
              onChange={(e) => setEditValue(e.target.value)}
              className="h-8 text-sm"
              placeholder="0,00"
              autoFocus
              onKeyDown={(e) => e.key === 'Enter' && handleSaveSaldo()}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setEditingSaldo(null)}>Cancelar</Button>
            <Button size="sm" onClick={handleSaveSaldo}>Salvar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
