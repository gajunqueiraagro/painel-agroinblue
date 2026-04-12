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
import { buildMovSummary, STATUS_REALIZADOS, type MovimentoResumo } from '@/lib/financeiro/conciliacaoCalc';
import { buildSaldosAnosDisponiveis, buildUnifiedSaldos } from '@/lib/financeiro/saldosBancarios';

/* ── types ── */
interface SaldoBancario {
  id: string;
  ano_mes: string;
  conta_bancaria_id: string;
  conta_bancaria_id_v2: string | null;
  fazenda_id: string;
  saldo_inicial: number;
  saldo_final: number;
  fechado: boolean;
  status_mes: string;          // aberto | fechado | travado
  origem_saldo: string | null;
  origem_saldo_inicial: string; // automatico | manual | calculado_legado
  observacao: string | null;
  fonte: 'v2' | 'legado';
  conta_label: string;
  tipo_conta: string | null;
  legacy_conta_banco: string | null;
}

interface ContaRef {
  id: string;
  nome_conta: string;
  nome_exibicao: string | null;
  tipo_conta: string | null;
  codigo_conta: string | null;
}




function prevAnoMes(am: string) {
  const [y, m] = am.split('-').map(Number);
  if (m === 1) return `${y - 1}-12`;
  return `${y}-${String(m - 1).padStart(2, '0')}`;
}

function nextAnoMes(am: string) {
  const [y, m] = am.split('-').map(Number);
  if (m === 12) return `${y + 1}-01`;
  return `${y}-${String(m + 1).padStart(2, '0')}`;
}

function currentAnoMes(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

/* ANOS is built dynamically per client – see anosDisponiveis state */
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
interface SaldosProps {
  onNavigateToConciliacao?: (ano: string, mes: string, contaId: string) => void;
}

export function FinV2SaldosTab({ onNavigateToConciliacao }: SaldosProps = {}) {
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

  const [anosDisponiveis, setAnosDisponiveis] = useState<string[]>([String(new Date().getFullYear())]);
  const [filtroAno, setFiltroAno] = useState(String(new Date().getFullYear()));
  const [filtroMes, setFiltroMes] = useState('__all__');

  // Load dynamic years from V2 + legado + lançamentos
  useEffect(() => {
    if (!clienteAtual?.id) return;
    Promise.all([
      supabase
        .from('financeiro_saldos_bancarios_v2')
        .select('ano_mes')
        .eq('cliente_id', clienteAtual.id),
      supabase
        .from('financeiro_saldos_bancarios')
        .select('ano_mes')
        .eq('cliente_id', clienteAtual.id),
      supabase
        .from('financeiro_lancamentos_v2')
        .select('ano_mes')
        .eq('cliente_id', clienteAtual.id)
        .eq('cancelado', false),
    ]).then(([v2Res, legacyRes, lancRes]) => {
      setAnosDisponiveis(buildSaldosAnosDisponiveis({
        saldosV2: (v2Res.data as Array<{ ano_mes: string | null }> | null) || [],
        saldosLegacy: (legacyRes.data as Array<{ ano_mes: string | null }> | null) || [],
        lancamentos: (lancRes.data as Array<{ ano_mes: string | null }> | null) || [],
      }));
    });
  }, [clienteAtual?.id]);

  const [dialogAno, setDialogAno] = useState(String(new Date().getFullYear()));
  const [dialogMes, setDialogMes] = useState(String(new Date().getMonth() + 1).padStart(2, '0'));
  const anoMes = `${dialogAno}-${dialogMes}`;
  const [contaId, setContaId] = useState('');
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

    try {
      const [{ data: v2Data }, { data: legacyData }, { data: cData }, { data: movData }] = await Promise.all([
        supabase
          .from('financeiro_saldos_bancarios_v2')
          .select('*')
          .eq('cliente_id', clienteAtual.id)
          .order('ano_mes', { ascending: false }),
        supabase
          .from('financeiro_saldos_bancarios')
          .select('id, ano_mes, conta_banco, fazenda_id, saldo_final')
          .eq('cliente_id', clienteAtual.id)
          .order('ano_mes', { ascending: false }),
        supabase
          .from('financeiro_contas_bancarias')
          .select('id, nome_conta, nome_exibicao, tipo_conta, codigo_conta')
          .eq('cliente_id', clienteAtual.id)
          .eq('ativa', true),
        supabase
          .from('financeiro_lancamentos_v2')
          .select('conta_bancaria_id, conta_destino_id, ano_mes, valor, sinal, tipo_operacao')
          .eq('cliente_id', clienteAtual.id)
          .eq('cancelado', false)
          .in('status_transacao', [...STATUS_REALIZADOS]),
      ]);

      const contasData = (cData as ContaRef[]) || [];
      const movSummaryData = buildMovSummary((movData as MovimentoResumo[]) || []);
      const unifiedAll = buildUnifiedSaldos({
        v2Saldos: (v2Data as any[]) || [],
        legacySaldos: (legacyData as any[]) || [],
        contas: contasData,
        movSummary: movSummaryData,
      }) as SaldoBancario[];

      const filtered = unifiedAll.filter((saldo) => {
        if (filtroMes === '__all__') {
          return saldo.ano_mes >= `${filtroAno}-01` && saldo.ano_mes <= `${filtroAno}-12`;
        }
        return saldo.ano_mes === `${filtroAno}-${filtroMes}`;
      });

      setSaldos(filtered);
      setContas(contasData);
      setAllSaldos(unifiedAll);
      setMovSummary(movSummaryData);
    } finally {
      setLoading(false);
    }
  }, [clienteAtual?.id, filtroAno, filtroMes]);

  useEffect(() => { load(); }, [load]);

  const contaMap = useMemo(() => {
    const m = new Map<string, ContaRef>();
    contas.forEach(c => m.set(c.id, c));
    return m;
  }, [contas]);

  const contaNome = (saldo: Pick<SaldoBancario, 'conta_bancaria_id' | 'conta_label'>) => {
    const conta = contaMap.get(saldo.conta_bancaria_id);
    return saldo.conta_label || conta?.nome_exibicao || conta?.nome_conta || '-';
  };

  const contaTipo = (saldo: Pick<SaldoBancario, 'conta_bancaria_id' | 'tipo_conta'>): string => {
    return saldo.tipo_conta || contaMap.get(saldo.conta_bancaria_id)?.tipo_conta || 'cc';
  };

  const resolveContaPersistId = (saldo: SaldoBancario | null | undefined): string | null => {
    if (!saldo) return null;
    if (saldo.fonte === 'v2') return saldo.conta_bancaria_id;
    return saldo.conta_bancaria_id_v2;
  };

  const hasPersistableConta = (saldo: SaldoBancario | null | undefined) => Boolean(resolveContaPersistId(saldo));

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
    const diff = Math.round((expected - s.saldo_final) * 100) / 100;
    return diff !== 0 ? Math.abs(diff) : null;
  }, [movSummary]);

  /* ── permission helpers ── */
  const canEditSaldoFinal = (s: SaldoBancario): boolean => {
    if (!hasPersistableConta(s)) return false;
    if (s.status_mes === 'travado') return isAdmin;
    if (s.status_mes === 'fechado') return isAdmin;
    if (s.ano_mes < curAM) return isAdmin;
    return isAdmin || isFinanceiro;
  };

  const canEditSaldoInicial = (s: SaldoBancario): boolean => {
    if (!hasPersistableConta(s)) return false;
    const prevFinal = findPrevSaldoFinal(s.conta_bancaria_id, s.ano_mes);
    if (prevFinal !== null) return false;
    return isAdmin;
  };

  const getEditBlockReason = (s: SaldoBancario): string | null => {
    if (!hasPersistableConta(s)) return 'Registro legado sem conta bancária correspondente no cadastro atual';
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
      const tipo = contaTipo(s);
      if (!byTipo[tipo]) byTipo[tipo] = [];
      byTipo[tipo].push(s);
    }
    const orderedTypes = Object.keys(byTipo).sort((a, b) => (TIPO_ORDER[a] ?? 99) - (TIPO_ORDER[b] ?? 99));
    for (const tipo of orderedTypes) {
      const items = byTipo[tipo].sort((a, b) => {
        const na = contaNome(a);
        const nb = contaNome(b);
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
  }, [contaId, dialogAno, dialogMes, dialogOpen, allSaldos]);

  const openNew = () => {
    setEditing(null);
    setDialogAno(filtroAno);
    setDialogMes(String(new Date().getMonth() + 1).padStart(2, '0'));
    setContaId(contas[0]?.id || '');
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
    setDialogAno(s.ano_mes.slice(0, 4));
    setDialogMes(s.ano_mes.slice(5, 7));
    setContaId(s.conta_bancaria_id);
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

  const persistSaldoV2 = async ({
    targetSaldo,
    saldoPayload,
  }: {
    targetSaldo?: SaldoBancario | null;
    saldoPayload: {
      ano_mes: string;
      fazenda_id: string;
      conta_bancaria_id?: string | null;
      saldo_inicial: number;
      saldo_final: number;
      origem_saldo: string | null;
      origem_saldo_inicial: string;
      status_mes?: string;
      observacao?: string | null;
    };
  }) => {
    if (!clienteAtual?.id) {
      return { id: null, created: false, error: new Error('Cliente não selecionado') };
    }

    const contaPersistId = targetSaldo ? resolveContaPersistId(targetSaldo) : (saldoPayload.conta_bancaria_id || null);
    if (!contaPersistId) {
      return { id: null, created: false, error: new Error('Registro legado sem conta correspondente no cadastro atual') };
    }

    const payload = {
      cliente_id: clienteAtual.id,
      fazenda_id: saldoPayload.fazenda_id,
      conta_bancaria_id: contaPersistId,
      ano_mes: saldoPayload.ano_mes,
      saldo_inicial: saldoPayload.saldo_inicial,
      saldo_final: saldoPayload.saldo_final,
      origem_saldo: saldoPayload.origem_saldo,
      origem_saldo_inicial: saldoPayload.origem_saldo_inicial,
      status_mes: saldoPayload.status_mes || 'aberto',
      observacao: saldoPayload.observacao || null,
      updated_by: user?.id || null,
    };

    if (targetSaldo?.fonte === 'v2') {
      const { error } = await supabase
        .from('financeiro_saldos_bancarios_v2')
        .update(payload)
        .eq('id', targetSaldo.id);
      return { id: targetSaldo.id, created: false, error };
    }

    const { data: existingRow, error: lookupError } = await supabase
      .from('financeiro_saldos_bancarios_v2')
      .select('id')
      .eq('cliente_id', clienteAtual.id)
      .eq('fazenda_id', saldoPayload.fazenda_id)
      .eq('conta_bancaria_id', contaPersistId)
      .eq('ano_mes', saldoPayload.ano_mes)
      .maybeSingle();

    if (lookupError) {
      return { id: null, created: false, error: lookupError };
    }

    if (existingRow?.id) {
      const { error } = await supabase
        .from('financeiro_saldos_bancarios_v2')
        .update(payload)
        .eq('id', existingRow.id);
      return { id: existingRow.id, created: false, error };
    }

    const { data: inserted, error } = await supabase
      .from('financeiro_saldos_bancarios_v2')
      .insert({ ...payload, created_by: user?.id || null })
      .select('id')
      .single();

    return { id: inserted?.id ?? null, created: true, error };
  };

  /* ── save ── */
  const save = async () => {
    if (!clienteAtual?.id || !anoMes || !contaId) {
      toast.error('Preencha todos os campos');
      return;
    }

    // For new records, derive fazenda from the selected conta via a lookup
    // For new records, derive fazenda from the selected conta via a lookup
    const resolveFazendaId = async (): Promise<string | null> => {
      if (editing) return editing.fazenda_id;
      const { data } = await supabase
        .from('financeiro_contas_bancarias')
        .select('fazenda_id')
        .eq('id', contaId)
        .single();
      return data?.fazenda_id || fazendaAtual?.id || fazendas[0]?.id || null;
    };
    const fazendaId = await resolveFazendaId();
    if (!fazendaId) {
      toast.error('Não foi possível determinar a fazenda da conta');
      return;
    }

    // Duplicate guard for new records
    if (!editing) {
      const existing = allSaldos.find(s =>
        (s.conta_bancaria_id === contaId || s.conta_bancaria_id_v2 === contaId) && s.ano_mes === anoMes
      );
      if (existing) {
        toast.error(`Já existe saldo para esta conta em ${anoMes}. Edite o registro existente.`);
        return;
      }
    }

    if (editing && !hasPersistableConta(editing)) {
      toast.error('Registro legado sem conta bancária correspondente no cadastro atual');
      return;
    }

    const saldoInicialVal = parseBRL(saldoInicial);
    const saldoFinalVal = parseBRL(saldoFinal);
    const origemInicialFinal = autoSaldoInicial !== null ? 'automatico' : 'manual';

    const payload = {
      ano_mes: anoMes,
      fazenda_id: fazendaId,
      conta_bancaria_id: editing ? resolveContaPersistId(editing) : contaId,
      saldo_inicial: saldoInicialVal,
      saldo_final: saldoFinalVal,
      origem_saldo: origem,
      origem_saldo_inicial: origemInicialFinal,
      status_mes: editing?.status_mes || 'aberto',
      observacao: editing?.observacao || null,
    };

    if (editing) {
      if (!canEditSaldoFinal(editing) && !canEditSaldoInicial(editing)) {
        toast.error(getEditBlockReason(editing) || 'Sem permissão para editar este mês');
        return;
      }

      const { id: savedId, created, error } = await persistSaldoV2({
        targetSaldo: editing,
        saldoPayload: payload,
      });
      if (error || !savedId) {
        toast.error('Erro ao atualizar saldo');
        return;
      }

      if (editing.fonte === 'legado' && created) {
        await logAudit(savedId, 'migracao_legado');
      }
      if (editing.saldo_final !== saldoFinalVal) {
        await logAudit(savedId, 'alteracao', 'saldo_final', String(editing.saldo_final), String(saldoFinalVal));
      }
      if (editing.saldo_inicial !== saldoInicialVal) {
        await logAudit(savedId, 'alteracao', 'saldo_inicial', String(editing.saldo_inicial), String(saldoInicialVal));
      }

      toast.success(editing.fonte === 'legado' ? 'Saldo histórico sincronizado na base atual' : 'Saldo atualizado');

      const nextAm = nextAnoMes(anoMes);
      const nextSaldo = allSaldos.find(s => s.conta_bancaria_id === (editing.conta_bancaria_id_v2 || editing.conta_bancaria_id) && s.ano_mes === nextAm);
      if (nextSaldo && Math.round((nextSaldo.saldo_inicial - saldoFinalVal) * 100) !== 0) {
        const { id: nextId, error: nextError } = await persistSaldoV2({
          targetSaldo: nextSaldo,
          saldoPayload: {
            ano_mes: nextSaldo.ano_mes,
            fazenda_id: nextSaldo.fazenda_id,
            conta_bancaria_id: resolveContaPersistId(nextSaldo),
            saldo_inicial: saldoFinalVal,
            saldo_final: nextSaldo.saldo_final,
            origem_saldo: nextSaldo.origem_saldo,
            origem_saldo_inicial: 'automatico',
            status_mes: nextSaldo.status_mes,
            observacao: nextSaldo.observacao,
          },
        });
        if (!nextError && nextId) {
          await logAudit(nextId, 'propagacao_automatica', 'saldo_inicial', String(nextSaldo.saldo_inicial), String(saldoFinalVal));
        }
      }
    } else {
      const { id: savedId, error } = await persistSaldoV2({ saldoPayload: payload });
      if (error || !savedId) {
        toast.error('Erro ao criar');
        console.error(error);
        return;
      }
      await logAudit(savedId, 'criacao');
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
      const { id: savedId, error } = await persistSaldoV2({
        targetSaldo: nextSaldo,
        saldoPayload: {
          ano_mes: nextSaldo.ano_mes,
          fazenda_id: nextSaldo.fazenda_id,
          conta_bancaria_id: resolveContaPersistId(nextSaldo),
          saldo_inicial: newValue,
          saldo_final: nextSaldo.saldo_final,
          origem_saldo: nextSaldo.origem_saldo,
          origem_saldo_inicial: 'automatico',
          status_mes: nextSaldo.status_mes,
          observacao: nextSaldo.observacao,
        },
      });

      if (error || !savedId) {
        toast.error('Erro ao atualizar saldo inicial do próximo mês');
      } else {
        await logAudit(savedId, 'propagacao_aceita', 'saldo_inicial', String(nextSaldo.saldo_inicial), String(newValue));
        toast.success('Saldo inicial do próximo mês atualizado');
        load();
      }
    }
    setPropagateConfirm(null);
  };

  /* ── status change ── */
  const handleStatusChange = async () => {
    if (!statusAction || !clienteAtual?.id) return;
    const { saldo, newStatus } = statusAction;

    if (!hasPersistableConta(saldo)) {
      toast.error('Registro legado sem conta bancária correspondente no cadastro atual');
      return;
    }

    const { id: savedId, error } = await persistSaldoV2({
      targetSaldo: saldo,
      saldoPayload: {
        ano_mes: saldo.ano_mes,
        fazenda_id: saldo.fazenda_id,
        conta_bancaria_id: resolveContaPersistId(saldo),
        saldo_inicial: saldo.saldo_inicial,
        saldo_final: saldo.saldo_final,
        origem_saldo: saldo.origem_saldo,
        origem_saldo_inicial: saldo.origem_saldo_inicial,
        status_mes: newStatus,
        observacao: saldo.observacao,
      },
    });

    if (error || !savedId) {
      toast.error('Erro ao alterar status');
      return;
    }

    await logAudit(savedId, `status_${newStatus}`, 'status_mes', saldo.status_mes, newStatus);
    toast.success(`Mês ${STATUS_LABELS[newStatus] || newStatus}`);
    setStatusAction(null);
    load();
  };

  const mesLabel = (am: string) => {
    const m = MESES.find(x => x.v === am.slice(5));
    return m ? `${m.l}/${am.slice(2, 4)}` : am;
  };

  // saldoInicial is always locked when previous month exists

  /* ── render ── */
  return (
    <TooltipProvider>
      <div className="w-full p-4 pb-20 space-y-3 animate-fade-in">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div className="space-y-1">
            <h2 className="text-lg font-bold text-foreground">Saldos Bancários Mensais</h2>
            <p className="text-xs text-muted-foreground">
              Leitura consolidada da base atual + histórico legado. A importação financeira grava lançamentos, não saldos bancários.
            </p>
          </div>
          <Button size="sm" onClick={openNew}><Plus className="h-4 w-4 mr-1" /> Novo</Button>
        </div>

        {/* Filters + Summary + Table Header — all sticky */}
        <div className="sticky top-0 z-20 bg-background pb-0">
          <div className="py-2 flex items-center gap-3 flex-wrap">
            <Select value={filtroAno} onValueChange={setFiltroAno}>
              <SelectTrigger className="w-24 h-8 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                {anosDisponiveis.map(a => <SelectItem key={a} value={a}>{a}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={filtroMes} onValueChange={setFiltroMes}>
              <SelectTrigger className="w-24 h-8 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                {MESES.map(m => <SelectItem key={m.v} value={m.v}>{m.l}</SelectItem>)}
              </SelectContent>
            </Select>

            {!loading && saldos.length > 0 && filtroMes !== '__all__' && (
              <div className="flex items-center gap-2">
                {grouped.map(g => (
                  <div key={g.tipo} className="border border-border rounded-md px-3 py-1">
                    <p className="text-[10px] text-muted-foreground leading-tight">{g.label}</p>
                    <p className={`text-xl font-semibold tabular-nums leading-tight ${g.totalFinal >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                      {formatMoeda(g.totalFinal)}
                    </p>
                  </div>
                ))}
                <div className="border border-border rounded-md px-3 py-1">
                  <p className="text-[10px] text-muted-foreground font-semibold leading-tight">Total Geral</p>
                  <p className={`text-xl font-bold tabular-nums leading-tight ${totalGeral >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                    {formatMoeda(totalGeral)}
                  </p>
                </div>
              </div>
            )}
          </div>
        </div>

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
                  <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground py-6">Não há saldos bancários cadastrados para {filtroAno}. Os lançamentos importados continuam válidos, mas a importação financeira não cria saldos mensais automaticamente.</TableCell></TableRow>
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
                      const isAuto = s.origem_saldo_inicial !== 'manual';
                      const editable = canEditSaldoFinal(s);
                      const blockReason = getEditBlockReason(s);
                      const contaPersistId = resolveContaPersistId(s);
                      const prevFinal = findPrevSaldoFinal(s.conta_bancaria_id, s.ano_mes);
                      const saldoInicialEfetivo = prevFinal !== null ? prevFinal : s.saldo_inicial;
                      const chainBroken = prevFinal !== null && Math.round((prevFinal - s.saldo_inicial) * 100) !== 0;

                      return (
                        <TableRow key={s.id} className={`text-[11px] ${inconsistency || chainBroken ? 'bg-red-50/50 dark:bg-red-950/20' : ''}`}>
                          <TableCell className="py-1">{mesLabel(s.ano_mes)}</TableCell>
                          <TableCell className="py-1">
                            <div className="flex flex-col leading-tight">
                              <span>{contaNome(s)}</span>
                              {s.fonte === 'legado' && (
                                <span className={`text-[9px] ${contaPersistId ? 'text-muted-foreground' : 'text-amber-600'}`}>
                                  {contaPersistId ? 'Histórico legado' : 'Histórico legado sem vínculo com conta atual'}
                                </span>
                              )}
                            </div>
                          </TableCell>
                          <TableCell className="text-right tabular-nums py-1">
                            <div className="flex items-center justify-end gap-1">
                              {prevFinal !== null ? (
                                <Link2 className="h-3 w-3 text-emerald-500 shrink-0" />
                              ) : null}
                              {formatMoeda(saldoInicialEfetivo)}
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
                                {s.origem_saldo_inicial === 'automatico' && 'Saldo inicial herdado automaticamente do mês anterior'}
                                {s.origem_saldo_inicial === 'calculado_legado' && 'Saldo inicial inferido a partir do histórico legado e da movimentação do mês'}
                                {s.origem_saldo_inicial === 'manual' && 'Saldo inicial definido manualmente'}
                              </TooltipContent>
                            </Tooltip>
                          </TableCell>
                          <TableCell className="py-1">
                            {(() => {
                              if (!contaPersistId) {
                                return <Badge variant="outline" className="text-[9px] px-1.5 py-0">Conta não vinculada</Badge>;
                              }

                              const key = `${contaPersistId}|${s.ano_mes}`;
                              const mov = movSummary[key];
                              const saldoCalculado = s.saldo_inicial + (mov ? mov.entradas - mov.saidas : 0);
                              const diff = Math.round((s.saldo_final - saldoCalculado) * 100) / 100;
                              const isConciliado = diff === 0;

                              return (
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <button
                                      type="button"
                                      className="cursor-pointer"
                                      onClick={() => {
                                        if (onNavigateToConciliacao) {
                                          const [y, m] = s.ano_mes.split('-');
                                          onNavigateToConciliacao(y, m, contaPersistId);
                                        }
                                      }}
                                    >
                                      <Badge className={`text-[9px] px-1.5 py-0 font-medium border-0 ${
                                        isConciliado
                                          ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300'
                                          : 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300'
                                      }`}>
                                        {isConciliado ? '✅ Conciliado' : '❌ Não conciliado'}
                                      </Badge>
                                    </button>
                                  </TooltipTrigger>
                                  <TooltipContent className="text-[10px]">
                                    {isConciliado
                                      ? 'Saldo extrato = Saldo calculado'
                                      : `Diferença: ${formatMoeda(diff)}`}
                                    <br /><span className="text-muted-foreground">Clique para ver conciliação</span>
                                  </TooltipContent>
                                </Tooltip>
                              );
                            })()}
                          </TableCell>
                          <TableCell className="py-1">
                            <div className="flex items-center gap-0.5">
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

                              {isAdmin && hasPersistableConta(s) && (
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
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <Label className="text-xs">Ano *</Label>
                  <Select value={dialogAno} onValueChange={setDialogAno} disabled={!!editing}>
                    <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {Array.from({ length: 10 }, (_, i) => String(new Date().getFullYear() - 5 + i)).map(a => (
                        <SelectItem key={a} value={a}>{a}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-xs">Mês *</Label>
                  <Select value={dialogMes} onValueChange={setDialogMes} disabled={!!editing}>
                    <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {MESES.filter(m => m.v !== '__all__').map(m => (
                        <SelectItem key={m.v} value={m.v}>{m.l}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-xs">Conta *</Label>
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

              {/* Saldo Inicial — always automatic except first month (admin only) */}
              <div className="space-y-1">
                <div className="flex items-center justify-between">
                  <Label className="text-xs">Saldo Inicial</Label>
                  {autoSaldoInicial !== null && (
                    <span className="text-[10px] text-emerald-600 flex items-center gap-1">
                      <Link2 className="h-3 w-3" /> Automático
                    </span>
                  )}
                </div>
                <Input
                  value={saldoInicial}
                  onChange={e => setSaldoInicial(e.target.value)}
                  className="h-9"
                  disabled={autoSaldoInicial !== null || (editing ? !canEditSaldoInicial(editing) : !isAdmin)}
                />
                {autoSaldoInicial !== null && (
                  <p className="text-[10px] text-emerald-600 flex items-center gap-1">
                    <Link2 className="h-3 w-3" />
                    Herdado do mês anterior ({formatMoeda(autoSaldoInicial)}) — não editável
                  </p>
                )}
                {autoSaldoInicial === null && isAdmin && (
                  <p className="text-[10px] text-amber-600 flex items-center gap-1">
                    <ShieldCheck className="h-3 w-3" />
                    Primeiro mês da conta — defina o saldo inicial (somente administrador)
                  </p>
                )}
                {autoSaldoInicial === null && !isAdmin && (
                  <p className="text-[10px] text-red-500 flex items-center gap-1">
                    <ShieldAlert className="h-3 w-3" />
                    Saldo inicial só pode ser definido pelo administrador
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
