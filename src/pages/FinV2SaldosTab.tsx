import { useState, useEffect, useCallback, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useCliente } from '@/contexts/ClienteContext';
import { useFazenda } from '@/contexts/FazendaContext';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Plus, Pencil, AlertTriangle, Link2, PenLine } from 'lucide-react';
import { toast } from 'sonner';

interface SaldoBancario {
  id: string;
  ano_mes: string;
  conta_bancaria_id: string;
  fazenda_id: string;
  saldo_inicial: number;
  saldo_final: number;
  fechado: boolean;
  origem_saldo: string | null;
  observacao: string | null;
}

interface ContaRef {
  id: string;
  nome_conta: string;
  nome_exibicao: string | null;
  tipo_conta: string | null;
  codigo_conta: string | null;
}

function fmtBRL(v: number): string {
  return v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
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

const ANOS = ['2023', '2024', '2025', '2026'];
const MESES = [
  { v: '__all__', l: 'Todos' },
  { v: '01', l: 'Jan' }, { v: '02', l: 'Fev' }, { v: '03', l: 'Mar' },
  { v: '04', l: 'Abr' }, { v: '05', l: 'Mai' }, { v: '06', l: 'Jun' },
  { v: '07', l: 'Jul' }, { v: '08', l: 'Ago' }, { v: '09', l: 'Set' },
  { v: '10', l: 'Out' }, { v: '11', l: 'Nov' }, { v: '12', l: 'Dez' },
];

const TIPO_ORDER: Record<string, number> = { cc: 0, inv: 1, cartao: 2 };
const TIPO_LABELS: Record<string, string> = { cc: 'Conta Corrente', inv: 'Conta Investimento', cartao: 'Cartão de Crédito' };

export function FinV2SaldosTab() {
  const { clienteAtual } = useCliente();
  const { fazendas, fazendaAtual } = useFazenda();
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

  // Movimentações summary per conta/mes
  const [movSummary, setMovSummary] = useState<Record<string, { entradas: number; saidas: number }>>({});

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

    // Also load ALL saldos for auto-initial lookups (previous months)
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

    // Load movement summary for consistency check
    const { data: movData } = await supabase
      .from('financeiro_lancamentos_v2')
      .select('conta_bancaria_id, ano_mes, valor, sinal')
      .eq('cliente_id', clienteAtual.id)
      .not('conta_bancaria_id', 'is', null);

    if (movData) {
      const summary: Record<string, { entradas: number; saidas: number }> = {};
      for (const l of movData) {
        const key = `${l.conta_bancaria_id}|${l.ano_mes}`;
        if (!summary[key]) summary[key] = { entradas: 0, saidas: 0 };
        if (l.sinal > 0) summary[key].entradas += Number(l.valor);
        else summary[key].saidas += Number(l.valor);
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

  // Find previous month saldo_final for a given conta+anoMes
  const findPrevSaldoFinal = useCallback((cId: string, am: string): number | null => {
    const prev = prevAnoMes(am);
    const found = allSaldos.find(s => s.conta_bancaria_id === cId && s.ano_mes === prev);
    return found ? found.saldo_final : null;
  }, [allSaldos]);

  // Consistency check: saldo_inicial + entradas - saidas vs saldo_final
  const getInconsistency = useCallback((s: SaldoBancario): number | null => {
    const key = `${s.conta_bancaria_id}|${s.ano_mes}`;
    const mov = movSummary[key];
    if (!mov) return null;
    const expected = s.saldo_inicial + mov.entradas - mov.saidas;
    const diff = Math.abs(expected - s.saldo_final);
    return diff > 0.01 ? diff : null;
  }, [movSummary]);

  // Group saldos by conta type
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

  // When conta or anoMes changes in dialog, auto-fill saldo inicial
  useEffect(() => {
    if (!dialogOpen || !contaId || !anoMes) return;
    const prevFinal = findPrevSaldoFinal(contaId, anoMes);
    setAutoSaldoInicial(prevFinal);
    if (prevFinal !== null && !editing && !overrideInicial) {
      setSaldoInicial(toBRL(prevFinal));
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
    setEditing(s);
    setAnoMes(s.ano_mes);
    setContaId(s.conta_bancaria_id);
    setFazendaId(s.fazenda_id);
    setSaldoInicial(toBRL(s.saldo_inicial));
    setSaldoFinal(toBRL(s.saldo_final));
    setOrigem(s.origem_saldo || 'manual');
    const prevFinal = findPrevSaldoFinal(s.conta_bancaria_id, s.ano_mes);
    setAutoSaldoInicial(prevFinal);
    setOverrideInicial(prevFinal !== null && Math.abs(prevFinal - s.saldo_inicial) > 0.01);
    setDialogOpen(true);
  };

  const save = async () => {
    if (!clienteAtual?.id || !anoMes || !contaId || !fazendaId) {
      toast.error('Preencha todos os campos');
      return;
    }

    const saldoInicialVal = parseBRL(saldoInicial);
    const saldoFinalVal = parseBRL(saldoFinal);
    const origemFinal = autoSaldoInicial !== null && !overrideInicial ? 'automatico' : origem;

    const payload = {
      cliente_id: clienteAtual.id,
      fazenda_id: fazendaId,
      conta_bancaria_id: contaId,
      ano_mes: anoMes,
      saldo_inicial: saldoInicialVal,
      saldo_final: saldoFinalVal,
      origem_saldo: origemFinal,
    };

    if (editing) {
      const { error } = await supabase.from('financeiro_saldos_bancarios_v2').update(payload).eq('id', editing.id);
      if (error) { toast.error('Erro ao atualizar'); return; }
      toast.success('Saldo atualizado');

      // Propagate: update next month's saldo_inicial if it exists and is automatic
      const nextAm = nextAnoMes(anoMes);
      const nextSaldo = allSaldos.find(s => s.conta_bancaria_id === contaId && s.ano_mes === nextAm);
      if (nextSaldo && nextSaldo.origem_saldo === 'automatico') {
        await supabase
          .from('financeiro_saldos_bancarios_v2')
          .update({ saldo_inicial: saldoFinalVal })
          .eq('id', nextSaldo.id);
      }
    } else {
      const { error } = await supabase.from('financeiro_saldos_bancarios_v2').insert(payload);
      if (error) { toast.error('Erro ao criar'); console.error(error); return; }
      toast.success('Saldo registrado');
    }
    setDialogOpen(false);
    load();
  };

  const mesLabel = (am: string) => {
    const m = MESES.find(x => x.v === am.slice(5));
    return m ? `${m.l}/${am.slice(2, 4)}` : am;
  };

  const saldoInicialIsAuto = autoSaldoInicial !== null && !overrideInicial;

  return (
    <TooltipProvider>
      <div className="max-w-4xl mx-auto p-4 pb-20 space-y-3 animate-fade-in">
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
                    R$ {fmtBRL(g.totalFinal)}
                  </p>
                </CardContent>
              </Card>
            ))}
            <Card>
              <CardContent className="p-2">
                <p className="text-[10px] text-muted-foreground font-semibold">Total Geral</p>
                <p className={`text-sm font-bold tabular-nums ${totalGeral >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                  R$ {fmtBRL(totalGeral)}
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
                  <TableHead>Mês</TableHead>
                  <TableHead>Conta</TableHead>
                  <TableHead className="text-right">Saldo Inicial</TableHead>
                  <TableHead className="text-right">Saldo Final</TableHead>
                  <TableHead className="text-center">Orig.</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="w-8" />
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
                  <>
                    <TableRow key={`grp-${g.tipo}`} className="bg-muted/40 border-t">
                      <TableCell colSpan={7} className="font-semibold text-[13px] py-1.5 text-foreground/80">
                        {g.label}
                      </TableCell>
                    </TableRow>
                    {g.items.map(s => {
                      const inconsistency = getInconsistency(s);
                      const isAuto = s.origem_saldo === 'automatico';
                      return (
                        <TableRow key={s.id} className={inconsistency ? 'bg-red-50/50 dark:bg-red-950/20' : ''}>
                          <TableCell>{mesLabel(s.ano_mes)}</TableCell>
                          <TableCell>{contaNome(s.conta_bancaria_id)}</TableCell>
                          <TableCell className="text-right tabular-nums">
                            R$ {fmtBRL(s.saldo_inicial)}
                          </TableCell>
                          <TableCell className="text-right tabular-nums font-semibold">
                            R$ {fmtBRL(s.saldo_final)}
                          </TableCell>
                          <TableCell className="text-center">
                            <Tooltip>
                              <TooltipTrigger>
                                {isAuto ? (
                                  <Link2 className="h-3 w-3 text-emerald-500 inline-block" />
                                ) : (
                                  <PenLine className="h-3 w-3 text-muted-foreground inline-block" />
                                )}
                              </TooltipTrigger>
                              <TooltipContent className="text-[10px]">
                                {isAuto ? 'Saldo inicial automático (mês anterior)' : 'Saldo inicial manual'}
                              </TooltipContent>
                            </Tooltip>
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-1">
                              <Badge variant={s.fechado ? 'default' : 'outline'} className="text-[10px] px-1 py-0">
                                {s.fechado ? 'Fechado' : 'Aberto'}
                              </Badge>
                              {inconsistency && (
                                <Tooltip>
                                  <TooltipTrigger>
                                    <AlertTriangle className="h-3 w-3 text-amber-500" />
                                  </TooltipTrigger>
                                  <TooltipContent className="text-[10px] max-w-[200px]">
                                    Inconsistência: diferença de R$ {fmtBRL(inconsistency)} entre saldo calculado e registrado
                                  </TooltipContent>
                                </Tooltip>
                              )}
                            </div>
                          </TableCell>
                          <TableCell>
                            <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => openEdit(s)}>
                              <Pencil className="h-3 w-3" />
                            </Button>
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

        {/* Dialog */}
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>{editing ? 'Editar Saldo' : 'Novo Saldo Mensal'}</DialogTitle>
            </DialogHeader>
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs">Ano-Mês *</Label>
                  <Input value={anoMes} onChange={e => setAnoMes(e.target.value)} placeholder="2025-01" className="h-9" />
                </div>
                <div>
                  <Label className="text-xs">Conta Bancária *</Label>
                  <Select value={contaId} onValueChange={setContaId}>
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
                <Select value={fazendaId} onValueChange={setFazendaId}>
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
                  {autoSaldoInicial !== null && (
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
                    Preenchido automaticamente a partir do mês anterior (R$ {fmtBRL(autoSaldoInicial)})
                  </p>
                )}
                {autoSaldoInicial === null && (
                  <p className="text-[10px] text-muted-foreground">
                    Sem histórico anterior — preencha manualmente (início da série).
                  </p>
                )}
              </div>

              <div>
                <Label className="text-xs">Saldo Final</Label>
                <Input value={saldoFinal} onChange={e => setSaldoFinal(e.target.value)} className="h-9" />
              </div>
              <div>
                <Label className="text-xs">Origem</Label>
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
      </div>
    </TooltipProvider>
  );
}
