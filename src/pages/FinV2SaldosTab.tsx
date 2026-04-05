import { useState, useEffect, useCallback, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useCliente } from '@/contexts/ClienteContext';
import { useFazenda } from '@/contexts/FazendaContext';
import { useAuth } from '@/contexts/AuthContext';
import { usePermissions } from '@/hooks/usePermissions';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { formatMoeda } from '@/lib/calculos/formatters';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  Plus, Pencil, AlertTriangle, Link2, PenLine, Lock, Unlock, ShieldCheck,
  LockKeyhole, ShieldAlert,
} from 'lucide-react';
import { toast } from 'sonner';

/* ── types ── */
interface SaldoBancario {
  id: string;
  ano_mes: string;
  conta_bancaria_id: string;
  fazenda_id: string;
  saldo_inicial: number;
  saldo_final: number;
  fechado: boolean;
  status_mes: string;          // aberto | fechado | travado
  origem_saldo: string | null;
  origem_saldo_inicial: string; // automatico | manual
  observacao: string | null;
}

interface ContaRef {
  id: string;
  nome_conta: string;
  nome_exibicao: string | null;
  tipo_conta: string | null;
  codigo_conta: string | null;
}




function prevAnoMes(am: string): string {
  const [y, m] = am.split('-').map(Number);
  if (m === 1) return `${y - 1}-12`;
  return `${y}-${String(m - 1).padStart(2, '0')}`;
}

function nextAnoMes(am: string): string {
  const [y, m] = am.split('-').map(Number);
  if (m === 12) return `${y + 1}-01`;
  return `${y}-${String(m + 1).padStart(2, '0')}`;
}

function currentAnoMes(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

const ANOS = ['2023', '2024', '2025', '2026', '2027'];
const MESES = [
  { v: '__all__', l: 'Todos' },
  { v: '01', l: 'Jan' }, { v: '02', l: 'Fev' }, { v: '03', l: 'Mar' },
  { v: '04', l: 'Abr' }, { v: '05', l: 'Mai' }, { v: '06', l: 'Jun' },
  { v: '07', l: 'Jul' }, { v: '08', l: 'Ago' }, { v: '09', l: 'Set' },
  { v: '10', l: 'Out' }, { v: '11', l: 'Nov' }, { v: '12', l: 'Dez' },
];

const TIPO_ORDER: Record<string, number> = { cc: 0, inv: 1, cartao: 2 };
const TIPO_LABELS: Record<string, string> = { cc: 'Conta Corrente', inv: 'Conta Investimento', cartao: 'Cartão de Crédito' };

const STATUS_LABELS: Record<string, string> = { aberto: 'Aberto', fechado: 'Fechado', travado: 'Travado' };
const STATUS_COLORS: Record<string, string> = {
  aberto: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300',
  fechado: 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300',
  travado: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300',
};

/* ── component ── */
export function FinV2SaldosTab() {
  const { clienteAtual } = useCliente();
  const { fazendas, fazendaAtual } = useFazenda();
  const { user } = useAuth();
  const { perfil, isManager } = usePermissions();
  const isAdmin = perfil === 'admin_agroinblue' || perfil === 'gestor_cliente';
  const isFinanceiro = perfil === 'financeiro';
  const curAM = currentAnoMes();

  const [saldos, setSaldos] = useState<SaldoBancario[]>([]);
  const [allSaldos, setAllSaldos] = useState<SaldoBancario[]>([]);
  const [contas, setContas] = useState<ContaRef[]>([]);
  const [loading, setLoading] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<SaldoBancario | null>(null);

  const [filtroAno, setFiltroAno] = useState(String(new Date().getFullYear()));
  const [filtroMes, setFiltroMes] = useState('__all__');

  const [anoMes, setAnoMes] = useState('');
  const [contaId, setContaId] = useState('');
  const [fazendaId, setFazendaId] = useState('');
  const [saldoInicial, setSaldoInicial] = useState('0,00');
  const [saldoFinal, setSaldoFinal] = useState('0,00');
  const [origem, setOrigem] = useState('manual');
  const [overrideInicial, setOverrideInicial] = useState(false);
  const [autoSaldoInicial, setAutoSaldoInicial] = useState<number | null>(null);

  // Status management
  const [statusAction, setStatusAction] = useState<{ saldo: SaldoBancario; newStatus: string } | null>(null);

  // Propagation confirm
  const [propagateConfirm, setPropagateConfirm] = useState<{
    nextSaldo: SaldoBancario;
    newValue: number;
  } | null>(null);

  const [movSummary, setMovSummary] = useState<Record<string, { entradas: number; saidas: number }>>({});

  /* ── data loading ── */
  const load = useCallback(async () => {
    if (!clienteAtual?.id) return;
    setLoading(true);

    let sQuery = supabase
      .from('financeiro_saldos_bancarios_v2')
      .select('*')
      .eq('cliente_id', clienteAtual.id)
      .order('ano_mes', { ascending: false });

    if (filtroMes === '__all__') {
      sQuery = sQuery.gte('ano_mes', `${filtroAno}-01`).lte('ano_mes', `${filtroAno}-12`);
    } else {
      sQuery = sQuery.eq('ano_mes', `${filtroAno}-${filtroMes}`);
    }

    const [{ data: sData }, { data: cData }, { data: allData }] = await Promise.all([
      sQuery,
      supabase
        .from('financeiro_contas_bancarias')
        .select('id, nome_conta, nome_exibicao, tipo_conta, codigo_conta')
        .eq('cliente_id', clienteAtual.id)
        .eq('ativa', true),
      supabase
        .from('financeiro_saldos_bancarios_v2')
        .select('*')
        .eq('cliente_id', clienteAtual.id)
        .order('ano_mes', { ascending: false }),
    ]);
    setSaldos((sData as SaldoBancario[]) || []);
    setContas((cData as ContaRef[]) || []);
    setAllSaldos((allData as SaldoBancario[]) || []);

    const { data: movData } = await supabase
      .from('financeiro_lancamentos_v2')
      .select('conta_bancaria_id, conta_destino_id, ano_mes, valor, sinal, tipo_operacao')
      .eq('cliente_id', clienteAtual.id)
      .eq('cancelado', false)
      .not('conta_bancaria_id', 'is', null);

    if (movData) {
      const summary: Record<string, { entradas: number; saidas: number }> = {};
      for (const l of movData as any[]) {
        const key = `${l.conta_bancaria_id}|${l.ano_mes}`;
        if (!summary[key]) summary[key] = { entradas: 0, saidas: 0 };

        // Transfer with destination: always debit origin, credit destination
        if (l.tipo_operacao === '3-Transferência' && l.conta_destino_id) {
          summary[key].saidas += Number(l.valor);
          const destKey = `${l.conta_destino_id}|${l.ano_mes}`;
          if (!summary[destKey]) summary[destKey] = { entradas: 0, saidas: 0 };
          summary[destKey].entradas += Number(l.valor);
        } else {
          // Normal flow: positive = entry, negative = exit
          if (l.sinal > 0) summary[key].entradas += Number(l.valor);
          else summary[key].saidas += Number(l.valor);
        }
      }
      setMovSummary(summary);
    }
    setLoading(false);
  }, [clienteAtual?.id, filtroAno, filtroMes]);

  useEffect(() => { load(); }, [load]);

  const contaMap = useMemo(() => {
    const m = new Map<string, ContaRef>();
    contas.forEach(c => m.set(c.id, c));
    return m;
  }, [contas]);

  const contaNome = (id: string) => {
    const c = contaMap.get(id);
    return c?.nome_exibicao || c?.nome_conta || '-';
  };
  const contaTipo = (id: string): string => contaMap.get(id)?.tipo_conta || 'cc';

  const findPrevSaldoFinal = useCallback((cId: string, am: string): number | null => {
    const prev = prevAnoMes(am);
    const found = allSaldos.find(s => s.conta_bancaria_id === cId && s.ano_mes === prev);
    return found ? found.saldo_final : null;
  }, [allSaldos]);

  const getInconsistency = useCallback((s: SaldoBancario): number | null => {
    const key = `${s.conta_bancaria_id}|${s.ano_mes}`;
    const mov = movSummary[key];
    if (!mov) return null;
    const expected = s.saldo_inicial + mov.entradas - mov.saidas;
    const diff = Math.abs(expected - s.saldo_final);
    return diff > 0.01 ? diff : null;
  }, [movSummary]);

  /* ── permission helpers ── */
  const canEditSaldoFinal = (s: SaldoBancario): boolean => {
    if (s.status_mes === 'travado') return isAdmin;
    if (s.status_mes === 'fechado') return isAdmin;
    if (s.ano_mes < curAM) return isAdmin;
    // Current month, aberto
    return isAdmin || isFinanceiro;
  };

  const canEditSaldoInicial = (s: SaldoBancario): boolean => {
    // Saldo inicial is ONLY editable for the first month of the account (no previous saldo exists)
    // AND only by admin
    const prevFinal = findPrevSaldoFinal(s.conta_bancaria_id, s.ano_mes);
    if (prevFinal !== null) return false; // Chain exists — never editable
    return isAdmin; // First month — admin only
  };

  const getEditBlockReason = (s: SaldoBancario): string | null => {
    if (s.status_mes === 'travado') return 'Mês travado — somente administrador';
    if (s.status_mes === 'fechado') return 'Mês fechado — somente administrador';
    if (s.ano_mes < curAM && !isAdmin) return 'Edição bloqueada para meses anteriores';
    return null;
  };

  /* ── grouping ── */
  const grouped = useMemo(() => {
    const groups: { tipo: string; label: string; items: SaldoBancario[]; totalFinal: number }[] = [];
    const byTipo: Record<string, SaldoBancario[]> = {};
    for (const s of saldos) {
      const tipo = contaTipo(s.conta_bancaria_id);
      if (!byTipo[tipo]) byTipo[tipo] = [];
      byTipo[tipo].push(s);
    }
    const orderedTypes = Object.keys(byTipo).sort((a, b) => (TIPO_ORDER[a] ?? 99) - (TIPO_ORDER[b] ?? 99));
    for (const tipo of orderedTypes) {
      const items = byTipo[tipo].sort((a, b) => {
        const na = contaNome(a.conta_bancaria_id);
        const nb = contaNome(b.conta_bancaria_id);
        return na.localeCompare(nb) || a.ano_mes.localeCompare(b.ano_mes);
      });
      groups.push({
        tipo,
        label: TIPO_LABELS[tipo] || tipo,
        items,
        totalFinal: items.reduce((sum, s) => sum + s.saldo_final, 0),
      });
    }
    return groups;
  }, [saldos, contaMap]);

  const totalGeral = useMemo(() => grouped.reduce((s, g) => s + g.totalFinal, 0), [grouped]);

  const parseBRL = (s: string) => parseFloat(s.replace(/\./g, '').replace(',', '.')) || 0;
  const toBRL = (v: number) => v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  /* ── dialog auto-fill ── */
  useEffect(() => {
    if (!dialogOpen || !contaId || !anoMes) return;
    const prevFinal = findPrevSaldoFinal(contaId, anoMes);
    setAutoSaldoInicial(prevFinal);
    // Always auto-fill from previous month — no override allowed
    if (prevFinal !== null) {
      setSaldoInicial(toBRL(prevFinal));
      setOverrideInicial(false);
    }
  }, [contaId, anoMes, dialogOpen, allSaldos]);

  const openNew = () => {
    setEditing(null);
    const m = String(new Date().getMonth() + 1).padStart(2, '0');
    setAnoMes(`${filtroAno}-${m}`);
    setContaId(contas[0]?.id || '');
    setFazendaId(fazendaAtual?.id || fazendas[0]?.id || '');
    setSaldoInicial('0,00');
    setSaldoFinal('0,00');
    setOrigem('manual');
    setOverrideInicial(false);
    setAutoSaldoInicial(null);
    setDialogOpen(true);
  };

  const openEdit = (s: SaldoBancario) => {
    const blockReason = getEditBlockReason(s);
    const canFinal = canEditSaldoFinal(s);
    const canInicial = canEditSaldoInicial(s);

    if (!canFinal && !canInicial) {
      toast.error(blockReason || 'Sem permissão para editar');
      return;
    }

    setEditing(s);
    setAnoMes(s.ano_mes);
    setContaId(s.conta_bancaria_id);
    setFazendaId(s.fazenda_id);
    setSaldoInicial(toBRL(s.saldo_inicial));
    setSaldoFinal(toBRL(s.saldo_final));
    setOrigem(s.origem_saldo || 'manual');
    const prevFinal = findPrevSaldoFinal(s.conta_bancaria_id, s.ano_mes);
    setAutoSaldoInicial(prevFinal);
    setOverrideInicial(s.origem_saldo_inicial === 'manual' && prevFinal !== null);
    setDialogOpen(true);
  };

  /* ── audit helper ── */
  const logAudit = async (saldoId: string, acao: string, campo?: string, anterior?: string, novo?: string) => {
    if (!clienteAtual?.id) return;
    await supabase.from('financeiro_saldos_audit').insert({
      saldo_id: saldoId,
      cliente_id: clienteAtual.id,
      acao,
      campo_alterado: campo || null,
      valor_anterior: anterior || null,
      valor_novo: novo || null,
      usuario_id: user?.id || null,
    });
  };

  /* ── save ── */
  const save = async () => {
    if (!clienteAtual?.id || !anoMes || !contaId || !fazendaId) {
      toast.error('Preencha todos os campos');
      return;
    }

    const saldoInicialVal = parseBRL(saldoInicial);
    const saldoFinalVal = parseBRL(saldoFinal);
    // Saldo inicial is always automatic when previous month exists
    const origemInicialFinal = autoSaldoInicial !== null ? 'automatico' : 'manual';

    const payload: any = {
      cliente_id: clienteAtual.id,
      fazenda_id: fazendaId,
      conta_bancaria_id: contaId,
      ano_mes: anoMes,
      saldo_inicial: saldoInicialVal,
      saldo_final: saldoFinalVal,
      origem_saldo: origem,
      origem_saldo_inicial: origemInicialFinal,
      updated_by: user?.id || null,
    };

    if (editing) {
      // Check permission
      if (!canEditSaldoFinal(editing)) {
        toast.error('Sem permissão para editar este mês');
        return;
      }

      const { error } = await supabase.from('financeiro_saldos_bancarios_v2').update(payload).eq('id', editing.id);
      if (error) { toast.error('Erro ao atualizar'); return; }

      // Audit
      if (editing.saldo_final !== saldoFinalVal) {
        await logAudit(editing.id, 'alteracao', 'saldo_final', String(editing.saldo_final), String(saldoFinalVal));
      }
      if (editing.saldo_inicial !== saldoInicialVal) {
        await logAudit(editing.id, 'alteracao', 'saldo_inicial', String(editing.saldo_inicial), String(saldoInicialVal));
      }

      toast.success('Saldo atualizado');

      // Propagate to next month
      const nextAm = nextAnoMes(anoMes);
      const nextSaldo = allSaldos.find(s => s.conta_bancaria_id === contaId && s.ano_mes === nextAm);
      if (nextSaldo) {
        if (nextSaldo.origem_saldo_inicial === 'automatico') {
          await supabase
            .from('financeiro_saldos_bancarios_v2')
            .update({ saldo_inicial: saldoFinalVal })
            .eq('id', nextSaldo.id);
          await logAudit(nextSaldo.id, 'propagacao_automatica', 'saldo_inicial', String(nextSaldo.saldo_inicial), String(saldoFinalVal));
        } else if (Math.abs(nextSaldo.saldo_inicial - saldoFinalVal) > 0.01) {
          // Manual next month — ask user
          setPropagateConfirm({ nextSaldo, newValue: saldoFinalVal });
        }
      }
    } else {
      payload.created_by = user?.id || null;
      const { data: inserted, error } = await supabase
        .from('financeiro_saldos_bancarios_v2')
        .insert(payload)
        .select('id')
        .single();
      if (error) { toast.error('Erro ao criar'); console.error(error); return; }
      if (inserted) {
        await logAudit(inserted.id, 'criacao');
      }
      toast.success('Saldo registrado');
    }
    setDialogOpen(false);
    load();
  };

  /* ── propagation confirm ── */
  const handlePropagate = async (update: boolean) => {
    if (!propagateConfirm) return;
    const { nextSaldo, newValue } = propagateConfirm;
    if (update) {
      await supabase
        .from('financeiro_saldos_bancarios_v2')
        .update({ saldo_inicial: newValue, origem_saldo_inicial: 'automatico' })
        .eq('id', nextSaldo.id);
      await logAudit(nextSaldo.id, 'propagacao_aceita', 'saldo_inicial', String(nextSaldo.saldo_inicial), String(newValue));
      toast.success('Saldo inicial do próximo mês atualizado');
      load();
    }
    setPropagateConfirm(null);
  };

  /* ── status change ── */
  const handleStatusChange = async () => {
    if (!statusAction || !clienteAtual?.id) return;
    const { saldo, newStatus } = statusAction;
    const { error } = await supabase
      .from('financeiro_saldos_bancarios_v2')
      .update({ status_mes: newStatus, updated_by: user?.id })
      .eq('id', saldo.id);
    if (error) { toast.error('Erro ao alterar status'); return; }
    await logAudit(saldo.id, `status_${newStatus}`, 'status_mes', saldo.status_mes, newStatus);
    toast.success(`Mês ${STATUS_LABELS[newStatus] || newStatus}`);
    setStatusAction(null);
    load();
  };

  const mesLabel = (am: string) => {
    const m = MESES.find(x => x.v === am.slice(5));
    return m ? `${m.l}/${am.slice(2, 4)}` : am;
  };

  const saldoInicialIsAuto = autoSaldoInicial !== null && !overrideInicial;

  /* ── render ── */
  return (
    <TooltipProvider>
      <div className="w-full p-4 pb-20 space-y-3 animate-fade-in">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold text-foreground">Saldos Bancários Mensais</h2>
          <Button size="sm" onClick={openNew}><Plus className="h-4 w-4 mr-1" /> Novo</Button>
        </div>

        {/* Filters */}
        <div className="flex gap-2">
          <Select value={filtroAno} onValueChange={setFiltroAno}>
            <SelectTrigger className="w-24 h-8 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              {ANOS.map(a => <SelectItem key={a} value={a}>{a}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={filtroMes} onValueChange={setFiltroMes}>
            <SelectTrigger className="w-24 h-8 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              {MESES.map(m => <SelectItem key={m.v} value={m.v}>{m.l}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>

        {/* Summary cards */}
        {!loading && saldos.length > 0 && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {grouped.map(g => (
              <Card key={g.tipo}>
                <CardContent className="p-2">
                  <p className="text-[10px] text-muted-foreground">{g.label}</p>
                  <p className={`text-sm font-semibold tabular-nums ${g.totalFinal >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                    {formatMoeda(g.totalFinal)}
                  </p>
                </CardContent>
              </Card>
            ))}
            <Card>
              <CardContent className="p-2">
                <p className="text-[10px] text-muted-foreground font-semibold">Total Geral</p>
                <p className={`text-sm font-bold tabular-nums ${totalGeral >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                  {formatMoeda(totalGeral)}
                </p>
              </CardContent>
            </Card>
          </div>
        )}

        {/* Table */}
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-[10px]">Mês</TableHead>
                  <TableHead className="text-[10px]">Conta</TableHead>
                  <TableHead className="text-right text-[10px]">Saldo Inicial</TableHead>
                  <TableHead className="text-right text-[10px]">Saldo Final</TableHead>
                  <TableHead className="text-center text-[10px]">Orig.</TableHead>
                  <TableHead className="text-[10px]">Conciliação</TableHead>
                  <TableHead className="w-20 text-[10px]">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading && (
                  <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground py-6">Carregando...</TableCell></TableRow>
                )}
                {!loading && saldos.length === 0 && (
                  <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground py-6">Nenhum saldo registrado</TableCell></TableRow>
                )}
                {!loading && grouped.map(g => (
                  <>{/* group header */}
                    <TableRow key={`grp-${g.tipo}`} className="bg-muted/40 border-t">
                      <TableCell colSpan={7} className="font-semibold text-[12px] py-1.5 text-foreground/80">
                        {g.label}
                      </TableCell>
                    </TableRow>
                    {g.items.map(s => {
                      const inconsistency = getInconsistency(s);
                      const isAuto = s.origem_saldo_inicial === 'automatico';
                      const editable = canEditSaldoFinal(s);
                      const blockReason = getEditBlockReason(s);

                      return (
                        <TableRow key={s.id} className={`text-[11px] ${inconsistency ? 'bg-red-50/50 dark:bg-red-950/20' : ''}`}>
                          <TableCell className="py-1">{mesLabel(s.ano_mes)}</TableCell>
                          <TableCell className="py-1">{contaNome(s.conta_bancaria_id)}</TableCell>
                          <TableCell className="text-right tabular-nums py-1">
                            <div className="flex items-center justify-end gap-1">
                              {isAuto && <Link2 className="h-3 w-3 text-emerald-500 shrink-0" />}
                              {formatMoeda(s.saldo_inicial)}
                            </div>
                          </TableCell>
                          <TableCell className="text-right tabular-nums font-semibold py-1">
                            {formatMoeda(s.saldo_final)}
                          </TableCell>
                          <TableCell className="text-center py-1">
                            <Tooltip>
                              <TooltipTrigger>
                                {isAuto ? (
                                  <Link2 className="h-3 w-3 text-emerald-500 inline-block" />
                                ) : (
                                  <PenLine className="h-3 w-3 text-muted-foreground inline-block" />
                                )}
                              </TooltipTrigger>
                              <TooltipContent className="text-[10px]">
                                {isAuto ? 'Saldo inicial herdado automaticamente' : 'Saldo inicial definido manualmente'}
                              </TooltipContent>
                            </Tooltip>
                          </TableCell>
                          <TableCell className="py-1">
                            {(() => {
                              const key = `${s.conta_bancaria_id}|${s.ano_mes}`;
                              const mov = movSummary[key];
                              const saldoCalculado = s.saldo_inicial + (mov ? mov.entradas - mov.saidas : 0);
                              const diff = Math.abs(s.saldo_final - saldoCalculado);
                              const isConciliado = diff < 0.01;

                              return (
                                <Tooltip>
                                  <TooltipTrigger>
                                    <Badge className={`text-[9px] px-1.5 py-0 font-medium border-0 ${
                                      isConciliado
                                        ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300'
                                        : 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300'
                                    }`}>
                                      {isConciliado ? '✅ Conciliado' : '❌ Não conciliado'}
                                    </Badge>
                                  </TooltipTrigger>
                                  <TooltipContent className="text-[10px]">
                                    {isConciliado
                                      ? 'Saldo extrato = Saldo calculado'
                                      : `Diferença: ${formatMoeda(diff)}`}
                                  </TooltipContent>
                                </Tooltip>
                              );
                            })()}
                          </TableCell>
                          <TableCell className="py-1">
                            <div className="flex items-center gap-0.5">
                              {/* Edit button */}
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <span>
                                    <Button
                                      variant="ghost"
                                      size="icon"
                                      className="h-6 w-6"
                                      onClick={() => openEdit(s)}
                                      disabled={!editable && !canEditSaldoInicial(s)}
                                    >
                                      <Pencil className="h-3 w-3" />
                                    </Button>
                                  </span>
                                </TooltipTrigger>
                                {blockReason && !editable && (
                                  <TooltipContent className="text-[10px]">{blockReason}</TooltipContent>
                                )}
                              </Tooltip>

                              {/* Admin status actions */}
                              {isAdmin && (
                                <>
                                  {s.status_mes === 'aberto' && (
                                    <Tooltip>
                                      <TooltipTrigger asChild>
                                        <Button variant="ghost" size="icon" className="h-6 w-6"
                                          onClick={() => setStatusAction({ saldo: s, newStatus: 'fechado' })}>
                                          <Lock className="h-3 w-3 text-amber-600" />
                                        </Button>
                                      </TooltipTrigger>
                                      <TooltipContent className="text-[10px]">Fechar mês</TooltipContent>
                                    </Tooltip>
                                  )}
                                  {s.status_mes === 'fechado' && (
                                    <>
                                      <Tooltip>
                                        <TooltipTrigger asChild>
                                          <Button variant="ghost" size="icon" className="h-6 w-6"
                                            onClick={() => setStatusAction({ saldo: s, newStatus: 'aberto' })}>
                                            <Unlock className="h-3 w-3 text-emerald-600" />
                                          </Button>
                                        </TooltipTrigger>
                                        <TooltipContent className="text-[10px]">Reabrir mês</TooltipContent>
                                      </Tooltip>
                                      <Tooltip>
                                        <TooltipTrigger asChild>
                                          <Button variant="ghost" size="icon" className="h-6 w-6"
                                            onClick={() => setStatusAction({ saldo: s, newStatus: 'travado' })}>
                                            <LockKeyhole className="h-3 w-3 text-red-600" />
                                          </Button>
                                        </TooltipTrigger>
                                        <TooltipContent className="text-[10px]">Travar mês</TooltipContent>
                                      </Tooltip>
                                    </>
                                  )}
                                  {s.status_mes === 'travado' && (
                                    <Tooltip>
                                      <TooltipTrigger asChild>
                                        <Button variant="ghost" size="icon" className="h-6 w-6"
                                          onClick={() => setStatusAction({ saldo: s, newStatus: 'fechado' })}>
                                          <Unlock className="h-3 w-3 text-amber-600" />
                                        </Button>
                                      </TooltipTrigger>
                                      <TooltipContent className="text-[10px]">Destravar mês</TooltipContent>
                                    </Tooltip>
                                  )}
                                </>
                              )}
                            </div>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        {/* Edit/Create Dialog */}
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>{editing ? 'Editar Saldo' : 'Novo Saldo Mensal'}</DialogTitle>
              {editing && (
                <DialogDescription className="text-[11px]">
                  {getEditBlockReason(editing) && (
                    <span className="text-amber-600 flex items-center gap-1">
                      <ShieldAlert className="h-3 w-3" />
                      {getEditBlockReason(editing)}
                    </span>
                  )}
                </DialogDescription>
              )}
            </DialogHeader>
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs">Ano-Mês *</Label>
                  <Input
                    value={anoMes}
                    onChange={e => setAnoMes(e.target.value)}
                    placeholder="2026-03"
                    className="h-9"
                    disabled={!!editing}
                  />
                </div>
                <div>
                  <Label className="text-xs">Conta Bancária *</Label>
                  <Select value={contaId} onValueChange={setContaId} disabled={!!editing}>
                    <SelectTrigger className="h-9"><SelectValue placeholder="Selecione" /></SelectTrigger>
                    <SelectContent>
                      {contas.map(c => (
                        <SelectItem key={c.id} value={c.id}>{c.nome_exibicao || c.nome_conta}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div>
                <Label className="text-xs">Fazenda *</Label>
                <Select value={fazendaId} onValueChange={setFazendaId} disabled={!!editing}>
                  <SelectTrigger className="h-9"><SelectValue placeholder="Selecione" /></SelectTrigger>
                  <SelectContent>
                    {fazendas.map(f => (
                      <SelectItem key={f.id} value={f.id}>{f.nome}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Saldo Inicial */}
              <div className="space-y-1">
                <div className="flex items-center justify-between">
                  <Label className="text-xs">Saldo Inicial</Label>
                  {autoSaldoInicial !== null && (editing ? canEditSaldoInicial(editing) || isAdmin : true) && (
                    <div className="flex items-center gap-1.5">
                      <span className="text-[10px] text-muted-foreground">Editar manual</span>
                      <Switch
                        checked={overrideInicial}
                        onCheckedChange={(v) => {
                          setOverrideInicial(v);
                          if (!v && autoSaldoInicial !== null) {
                            setSaldoInicial(toBRL(autoSaldoInicial));
                          }
                        }}
                        className="scale-75"
                      />
                    </div>
                  )}
                </div>
                <Input
                  value={saldoInicial}
                  onChange={e => setSaldoInicial(e.target.value)}
                  className="h-9"
                  disabled={saldoInicialIsAuto}
                />
                {autoSaldoInicial !== null && !overrideInicial && (
                  <p className="text-[10px] text-emerald-600 flex items-center gap-1">
                    <Link2 className="h-3 w-3" />
                    Saldo inicial herdado automaticamente do mês anterior ({formatMoeda(autoSaldoInicial)})
                  </p>
                )}
                {autoSaldoInicial !== null && overrideInicial && (
                  <p className="text-[10px] text-amber-600 flex items-center gap-1">
                    <PenLine className="h-3 w-3" />
                    Saldo inicial definido manualmente (override)
                  </p>
                )}
                {autoSaldoInicial === null && (
                  <p className="text-[10px] text-muted-foreground">
                    Sem histórico anterior — preencha manualmente (início da série).
                  </p>
                )}
              </div>

              {/* Saldo Final */}
              <div className="space-y-1">
                <Label className="text-xs">Saldo Final</Label>
                <Input
                  value={saldoFinal}
                  onChange={e => setSaldoFinal(e.target.value)}
                  className="h-9"
                  disabled={editing ? !canEditSaldoFinal(editing) : false}
                />
                {editing && !canEditSaldoFinal(editing) && (
                  <p className="text-[10px] text-red-500 flex items-center gap-1">
                    <ShieldAlert className="h-3 w-3" />
                    Edição bloqueada — {getEditBlockReason(editing) || 'sem permissão'}
                  </p>
                )}
              </div>

              <div>
                <Label className="text-xs">Origem do saldo</Label>
                <Select value={origem} onValueChange={setOrigem}>
                  <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="manual">Manual</SelectItem>
                    <SelectItem value="extrato">Extrato</SelectItem>
                    <SelectItem value="calculado">Calculado</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" size="sm" onClick={() => setDialogOpen(false)}>Cancelar</Button>
              <Button size="sm" onClick={save}>{editing ? 'Salvar' : 'Registrar'}</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Status change confirmation */}
        <AlertDialog open={!!statusAction} onOpenChange={() => setStatusAction(null)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle className="text-base">
                {statusAction?.newStatus === 'fechado' && 'Fechar mês'}
                {statusAction?.newStatus === 'travado' && 'Travar mês'}
                {statusAction?.newStatus === 'aberto' && (statusAction.saldo.status_mes === 'travado' ? 'Destravar mês' : 'Reabrir mês')}
              </AlertDialogTitle>
              <AlertDialogDescription className="text-sm">
                {statusAction?.newStatus === 'fechado' && (
                  <>O mês <strong>{statusAction?.saldo && mesLabel(statusAction.saldo.ano_mes)}</strong> será fechado. O perfil financeiro não poderá mais editar os saldos deste mês.</>
                )}
                {statusAction?.newStatus === 'travado' && (
                  <>O mês será <strong>travado</strong>. Nenhuma alteração será possível até que seja destravado pelo administrador.</>
                )}
                {statusAction?.newStatus === 'aberto' && (
                  <>O mês será reaberto para edição.</>
                )}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancelar</AlertDialogCancel>
              <AlertDialogAction onClick={handleStatusChange}>Confirmar</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        {/* Propagation confirmation */}
        <AlertDialog open={!!propagateConfirm} onOpenChange={() => setPropagateConfirm(null)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle className="text-base">Atualizar saldo inicial do próximo mês?</AlertDialogTitle>
              <AlertDialogDescription className="text-sm">
                Agora existe um saldo final diferente no mês anterior. Deseja atualizar o saldo inicial automaticamente com o valor de <strong>{propagateConfirm ? formatMoeda(propagateConfirm.newValue) : ''}</strong>?
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel onClick={() => handlePropagate(false)}>Manter valor manual</AlertDialogCancel>
              <AlertDialogAction onClick={() => handlePropagate(true)}>Atualizar automaticamente</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </TooltipProvider>
  );
}
