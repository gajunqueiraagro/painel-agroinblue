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
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Plus, Pencil, ChevronDown, MoreHorizontal, Power, PowerOff, Trash2, Eye, EyeOff } from 'lucide-react';
import { toast } from 'sonner';

interface BancoRef {
  codigo_banco: string;
  nome_banco: string;
  nome_curto: string;
}

interface ContaBancaria {
  id: string;
  nome_conta: string;
  banco: string | null;
  numero_conta: string | null;
  agencia: string | null;
  tipo_conta: string | null;
  codigo_conta: string | null;
  nome_exibicao: string | null;
  conta_digito: string | null;
  fazenda_id: string;
  ativa: boolean;
  ordem_exibicao: number;
  mes_inicio: string | null;
  saldo_inicial_oficial: number | null;
}

const TIPO_ORDER: Record<string, number> = { cc: 0, inv: 1, cartao: 2 };
const TIPO_LABEL: Record<string, string> = { cc: 'Conta Corrente', inv: 'Investimentos', cartao: 'Cartão de Crédito' };
const BADGE_LABEL: Record<string, string> = { cc: 'CC', inv: 'INV', cartao: 'CARTÃO' };
const BADGE_CLASS: Record<string, string> = {
  cc: 'bg-blue-100 text-blue-700 border-blue-200',
  inv: 'bg-purple-100 text-purple-700 border-purple-200',
  cartao: 'bg-orange-100 text-orange-700 border-orange-200',
};

function parseNum(code: string | null) {
  if (!code) return 0;
  const parts = code.split('-');
  return parseInt(parts[parts.length - 1] || '0', 10);
}

/** Build display label: "Nome (Ag-Conta)" when bank details exist */
export function contaDisplayLabel(c: { nome_exibicao?: string | null; nome_conta: string; agencia?: string | null; numero_conta?: string | null; conta_digito?: string | null }): string {
  const nome = c.nome_exibicao || c.nome_conta;
  const parts: string[] = [];
  if (c.agencia) parts.push(c.agencia);
  if (c.numero_conta) {
    parts.push(c.conta_digito ? `${c.numero_conta}-${c.conta_digito}` : c.numero_conta);
  }
  if (parts.length > 0) return `${nome} (${parts.join(' ')})`;
  return nome;
}

export function FinV2ContasTab() {
  const { clienteAtual } = useCliente();
  const { fazendas } = useFazenda();
  const [contas, setContas] = useState<ContaBancaria[]>([]);
  const [bancos, setBancos] = useState<BancoRef[]>([]);
  const [contasComLancamento, setContasComLancamento] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<ContaBancaria | null>(null);
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [mostrarInativas, setMostrarInativas] = useState(false);

  // Confirm dialogs
  const [confirmDesativar, setConfirmDesativar] = useState<ContaBancaria | null>(null);
  const [confirmAtivar, setConfirmAtivar] = useState<ContaBancaria | null>(null);
  const [confirmExcluir, setConfirmExcluir] = useState<ContaBancaria | null>(null);

  // Form fields — principal
  const [nomeExibicao, setNomeExibicao] = useState('');
  const [tipoConta, setTipoConta] = useState('cc');
  const [banco, setBanco] = useState('');
  const [bancoOutro, setBancoOutro] = useState('');
  const [fazendaId, setFazendaId] = useState('');
  const [ativa, setAtiva] = useState(true);

  // Form fields — avançado
  const [codigoConta, setCodigoConta] = useState('');
  const [agencia, setAgencia] = useState('');
  const [numeroConta, setNumeroConta] = useState('');
  const [contaDigito, setContaDigito] = useState('');
  const [mesInicio, setMesInicio] = useState('2026-04');
  const [saldoInicialOficial, setSaldoInicialOficial] = useState('');

  const loadBancos = useCallback(async () => {
    const { data } = await supabase
      .from('bancos_referencia')
      .select('codigo_banco, nome_banco, nome_curto')
      .eq('ativo', true)
      .order('ordem_exibicao');
    setBancos((data as BancoRef[]) || []);
  }, []);

  const load = useCallback(async () => {
    if (!clienteAtual?.id) return;
    setLoading(true);

    const [contasRes, lancamentosRes] = await Promise.all([
      supabase
        .from('financeiro_contas_bancarias')
        .select('*')
        .eq('cliente_id', clienteAtual.id)
        .order('ordem_exibicao'),
      supabase
        .from('financeiro_lancamentos_v2')
        .select('conta_bancaria_id')
        .eq('cliente_id', clienteAtual.id)
        .eq('cancelado', false)
        .not('conta_bancaria_id', 'is', null),
    ]);

    setContas((contasRes.data as ContaBancaria[]) || []);

    // Build set of conta IDs that have lancamentos
    const ids = new Set<string>();
    (lancamentosRes.data || []).forEach((r: any) => {
      if (r.conta_bancaria_id) ids.add(r.conta_bancaria_id);
    });
    setContasComLancamento(ids);
    setLoading(false);
  }, [clienteAtual?.id]);

  useEffect(() => { loadBancos(); }, [loadBancos]);
  useEffect(() => { load(); }, [load]);

  const bancoOptions = useMemo(() =>
    bancos.map(b => ({
      value: b.nome_curto,
      label: `${b.nome_banco}`,
      searchText: `${b.nome_banco} ${b.nome_curto} ${b.codigo_banco}`.toLowerCase(),
    })),
  [bancos]);

  const contasFiltradas = useMemo(() => {
    if (mostrarInativas) return contas;
    return contas.filter(c => c.ativa);
  }, [contas, mostrarInativas]);

  const grouped = useMemo(() => {
    const groups: { tipo: string; label: string; items: ContaBancaria[] }[] = [
      { tipo: 'cc', label: TIPO_LABEL.cc, items: [] },
      { tipo: 'inv', label: TIPO_LABEL.inv, items: [] },
      { tipo: 'cartao', label: TIPO_LABEL.cartao, items: [] },
    ];
    const sorted = [...contasFiltradas].sort((a, b) => {
      const ga = TIPO_ORDER[a.tipo_conta || 'cc'] ?? 99;
      const gb = TIPO_ORDER[b.tipo_conta || 'cc'] ?? 99;
      if (ga !== gb) return ga - gb;
      return parseNum(a.codigo_conta) - parseNum(b.codigo_conta);
    });
    sorted.forEach(c => {
      const t = c.tipo_conta || 'cc';
      const g = groups.find(g => g.tipo === t);
      if (g) g.items.push(c);
      else groups[0].items.push(c);
    });
    return groups.filter(g => g.items.length > 0);
  }, [contasFiltradas]);

  const totalInativas = useMemo(() => contas.filter(c => !c.ativa).length, [contas]);

  const openNew = () => {
    setEditing(null);
    setNomeExibicao('');
    setTipoConta('cc');
    setBanco('');
    setBancoOutro('');
    setFazendaId(fazendas[0]?.id || '');
    setAtiva(true);
    setCodigoConta('');
    setAgencia('');
    setNumeroConta('');
    setContaDigito('');
    setAdvancedOpen(false);
    setMesInicio('2026-04');
    setSaldoInicialOficial('');
    setDialogOpen(true);
  };

  const openEdit = (c: ContaBancaria) => {
    setEditing(c);
    setNomeExibicao(c.nome_exibicao || c.nome_conta || '');
    setTipoConta(c.tipo_conta || 'cc');
    const knownBanco = bancos.find(b => b.nome_curto === c.banco);
    if (knownBanco) {
      setBanco(c.banco || '');
      setBancoOutro('');
    } else if (c.banco) {
      setBanco('Outros');
      setBancoOutro(c.banco);
    } else {
      setBanco('');
      setBancoOutro('');
    }
    setFazendaId(c.fazenda_id);
    setAtiva(c.ativa);
    setCodigoConta(c.codigo_conta || '');
    setAgencia(c.agencia || '');
    setNumeroConta(c.numero_conta || '');
    setContaDigito(c.conta_digito || '');
    setAdvancedOpen(!!(c.codigo_conta || c.agencia || c.numero_conta || c.conta_digito));
    setMesInicio(c.mes_inicio || '');
    setSaldoInicialOficial(c.saldo_inicial_oficial !== null && c.saldo_inicial_oficial !== undefined
      ? String(c.saldo_inicial_oficial).replace('.', ',') : '');
    setDialogOpen(true);
  };

  const save = async () => {
    if (isSaving) return;
    if (!clienteAtual?.id || !nomeExibicao.trim() || !fazendaId) {
      toast.error('Preencha o nome da conta e a fazenda');
      return;
    }
    // mes_inicio obrigatório em criar e editar
    if (!mesInicio.trim()) {
      toast.error('Informe o mês inicial da conta.');
      return;
    }
    setIsSaving(true);
    try {
      const displayName = nomeExibicao.trim();
      const payload = {
        cliente_id: clienteAtual.id,
        fazenda_id: fazendaId,
        nome_conta: displayName,
        nome_exibicao: displayName,
        banco: banco === 'Outros' ? (bancoOutro.trim() || 'Outros') : (banco || null),
        tipo_conta: tipoConta,
        codigo_conta: codigoConta.trim() || null,
        agencia: agencia.trim() || null,
        numero_conta: numeroConta.trim() || null,
        conta_digito: contaDigito.trim() || null,
        ativa,
        mes_inicio: mesInicio.trim() || null,
      };
      // Parse robusto: aceita "1000", "1000.50", "1.000,50"
      const rawSaldoInicial = saldoInicialOficial.replace(/\s/g, '');
      const normalizedSaldoInicial = rawSaldoInicial.includes(',')
        ? rawSaldoInicial.replace(/\./g, '').replace(',', '.')
        : rawSaldoInicial;
      const parsedSaldo = normalizedSaldoInicial ? parseFloat(normalizedSaldoInicial) : null;
      const payloadComSaldo = {
        ...payload,
        saldo_inicial_oficial: (parsedSaldo !== null && !isNaN(parsedSaldo)) ? parsedSaldo : null,
      };

      if (editing) {
        const { error } = await supabase.from('financeiro_contas_bancarias').update(payloadComSaldo).eq('id', editing.id);
        if (error) { toast.error('Erro ao atualizar'); return; }
        if (payloadComSaldo.saldo_inicial_oficial !== null && editing.saldo_inicial_oficial === null && payloadComSaldo.mes_inicio) {
          const saldo = payloadComSaldo.saldo_inicial_oficial;
          const { data: existRow } = await supabase
            .from('financeiro_saldos_bancarios_v2')
            .select('id, origem_saldo_inicial')
            .eq('conta_bancaria_id', editing.id)
            .eq('ano_mes', payloadComSaldo.mes_inicio)
            .maybeSingle();
          if (!existRow) {
            await supabase.from('financeiro_saldos_bancarios_v2').insert({
              cliente_id: clienteAtual.id, fazenda_id: editing.fazenda_id,
              conta_bancaria_id: editing.id, ano_mes: payloadComSaldo.mes_inicio,
              saldo_inicial: saldo, saldo_final: saldo,
              origem_saldo_inicial: 'manual', origem_saldo: 'manual',
              status_mes: 'aberto', fechado: false,
            });
          } else if (existRow.origem_saldo_inicial === 'manual') {
            await supabase.from('financeiro_saldos_bancarios_v2')
              .update({ saldo_inicial: saldo, saldo_final: saldo })
              .eq('id', existRow.id);
          }
        }
        toast.success('Conta atualizada');
      } else {
        const { data: insertedContas, error } = await supabase
          .from('financeiro_contas_bancarias').insert(payloadComSaldo).select('id,fazenda_id');
        if (error) { toast.error('Erro ao criar conta'); return; }
        const novaContaId = insertedContas?.[0]?.id;
        const novaFazendaId = insertedContas?.[0]?.fazenda_id;
        if (novaContaId && payloadComSaldo.mes_inicio) {
          const saldo = payloadComSaldo.saldo_inicial_oficial ?? 0;
          const { error: sErr } = await supabase.from('financeiro_saldos_bancarios_v2').insert({
            cliente_id: clienteAtual.id,
            fazenda_id: novaFazendaId,
            conta_bancaria_id: novaContaId,
            ano_mes: payloadComSaldo.mes_inicio,
            saldo_inicial: saldo,
            saldo_final: saldo,
            origem_saldo_inicial: 'manual',
            origem_saldo: 'manual',
            status_mes: 'aberto',
            fechado: false,
          });
          if (sErr) toast.error('Conta criada, mas erro ao salvar saldo inicial');
          else toast.success('Conta criada com saldo inicial');
        } else {
          toast.success('Conta criada');
        }
      }
      setDialogOpen(false);
      load();
    } finally {
      setIsSaving(false);
    }
  };

  const handleDesativar = async () => {
    if (!confirmDesativar) return;
    const { error } = await supabase
      .from('financeiro_contas_bancarias')
      .update({ ativa: false })
      .eq('id', confirmDesativar.id);
    if (error) { toast.error('Erro ao desativar conta'); }
    else { toast.success('Conta desativada'); }
    setConfirmDesativar(null);
    load();
  };

  const handleAtivar = async () => {
    if (!confirmAtivar) return;
    const { error } = await supabase
      .from('financeiro_contas_bancarias')
      .update({ ativa: true })
      .eq('id', confirmAtivar.id);
    if (error) { toast.error('Erro ao reativar conta'); }
    else { toast.success('Conta reativada'); }
    setConfirmAtivar(null);
    load();
  };

  const handleExcluir = async () => {
    if (!confirmExcluir) return;
    // Double-check no lancamentos
    const { count } = await supabase
      .from('financeiro_lancamentos_v2')
      .select('id', { count: 'exact', head: true })
      .eq('conta_bancaria_id', confirmExcluir.id)
      .eq('cancelado', false);
    if (count && count > 0) {
      toast.error('Não é possível excluir: existem lançamentos vinculados a esta conta.');
      setConfirmExcluir(null);
      return;
    }
    const { error } = await supabase
      .from('financeiro_contas_bancarias')
      .delete()
      .eq('id', confirmExcluir.id);
    if (error) { toast.error('Erro ao excluir conta'); }
    else { toast.success('Conta excluída permanentemente'); }
    setConfirmExcluir(null);
    load();
  };

  const fazendaNome = (id: string) => fazendas.find(f => f.id === id)?.nome || '-';
  const cellClass = "text-[12px] font-medium leading-tight py-1 px-2";

  const formatContaBancaria = (c: ContaBancaria) => {
    const parts: string[] = [];
    if (c.agencia) parts.push(c.agencia);
    if (c.numero_conta) {
      parts.push(c.conta_digito ? `${c.numero_conta}-${c.conta_digito}` : c.numero_conta);
    }
    return parts.length > 0 ? parts.join(' ') : '-';
  };

  return (
    <div className="w-full p-4 pb-20 space-y-4 animate-fade-in">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-bold text-foreground">Contas Bancárias</h2>
        <div className="flex items-center gap-2">
          {totalInativas > 0 && (
            <Button
              variant="ghost"
              size="sm"
              className="text-xs text-muted-foreground gap-1"
              onClick={() => setMostrarInativas(v => !v)}
            >
              {mostrarInativas ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
              {mostrarInativas ? 'Ocultar inativas' : `Mostrar inativas (${totalInativas})`}
            </Button>
          )}
          <Button size="sm" onClick={openNew}><Plus className="h-4 w-4 mr-1" /> Nova Conta</Button>
        </div>
      </div>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow className="border-b">
                <TableHead className="text-[11px] font-semibold uppercase tracking-wide py-1.5 px-2">Tipo</TableHead>
                <TableHead className="text-[11px] font-semibold uppercase tracking-wide py-1.5 px-2">Nome da Conta</TableHead>
                <TableHead className="text-[11px] font-semibold uppercase tracking-wide py-1.5 px-2">Banco</TableHead>
                <TableHead className="text-[11px] font-semibold uppercase tracking-wide py-1.5 px-2">Ag / Conta</TableHead>
                <TableHead className="text-[11px] font-semibold uppercase tracking-wide py-1.5 px-2">Fazenda</TableHead>
                <TableHead className="text-[11px] font-semibold uppercase tracking-wide py-1.5 px-2">Status</TableHead>
                <TableHead className="w-10 py-1.5 px-2" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading && (
                <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground py-8">Carregando...</TableCell></TableRow>
              )}
              {!loading && contasFiltradas.length === 0 && (
                <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground py-8">Nenhuma conta cadastrada</TableCell></TableRow>
              )}
              {!loading && grouped.map((group) => (
                <>
                  <TableRow key={`group-${group.tipo}`} className="bg-muted/40 hover:bg-muted/40">
                    <TableCell colSpan={7} className="text-[13px] font-semibold text-foreground/80 py-1.5 px-2 border-t">
                      {group.label}
                    </TableCell>
                  </TableRow>
                  {group.items.map(c => {
                    const temLancamentos = contasComLancamento.has(c.id);
                    return (
                      <TableRow key={c.id} className={`h-auto ${!c.ativa ? 'opacity-50' : ''}`}>
                        <TableCell className={cellClass}>
                          <Badge variant="outline" className={`text-[9px] font-bold px-1.5 py-0 leading-tight border ${BADGE_CLASS[c.tipo_conta || 'cc']}`}>
                            {BADGE_LABEL[c.tipo_conta || 'cc']}
                          </Badge>
                        </TableCell>
                        <TableCell className={cellClass}>
                          <span className="font-semibold">{c.nome_exibicao || c.nome_conta}</span>
                          {c.saldo_inicial_oficial === null && (
                            <span className="ml-1.5 text-[9px] font-semibold text-amber-700 border border-amber-300 bg-amber-50 rounded px-1 py-0 align-middle" title="Saldo inicial não definido para esta conta">⚠ Saldo inicial</span>
                          )}
                          {c.codigo_conta && (
                            <span className="ml-1.5 text-[10px] text-muted-foreground font-mono">({c.codigo_conta})</span>
                          )}
                        </TableCell>
                        <TableCell className={cellClass}>{c.banco || '-'}</TableCell>
                        <TableCell className={`${cellClass} font-mono text-[11px]`}>{formatContaBancaria(c)}</TableCell>
                        <TableCell className={cellClass}>{fazendaNome(c.fazenda_id)}</TableCell>
                        <TableCell className={cellClass}>
                          <Badge variant={c.ativa ? 'default' : 'secondary'} className="text-[9px] px-1.5 py-0 leading-tight">
                            {c.ativa ? 'Ativa' : 'Inativa'}
                          </Badge>
                        </TableCell>
                        <TableCell className="py-1 px-1">
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="icon" className="h-6 w-6">
                                <MoreHorizontal className="h-3.5 w-3.5" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" className="w-44">
                              <DropdownMenuItem onClick={() => openEdit(c)} className="gap-2 text-xs">
                                <Pencil className="h-3 w-3" /> Editar
                              </DropdownMenuItem>
                              {c.ativa ? (
                                <DropdownMenuItem onClick={() => setConfirmDesativar(c)} className="gap-2 text-xs text-amber-600">
                                  <PowerOff className="h-3 w-3" /> Desativar
                                </DropdownMenuItem>
                              ) : (
                                <DropdownMenuItem onClick={() => setConfirmAtivar(c)} className="gap-2 text-xs text-emerald-600">
                                  <Power className="h-3 w-3" /> Reativar
                                </DropdownMenuItem>
                              )}
                              {!temLancamentos && (
                                <DropdownMenuItem onClick={() => setConfirmExcluir(c)} className="gap-2 text-xs text-destructive">
                                  <Trash2 className="h-3 w-3" /> Excluir
                                </DropdownMenuItem>
                              )}
                            </DropdownMenuContent>
                          </DropdownMenu>
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

      {/* ─── Dialog Criar/Editar ─── */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{editing ? 'Editar Conta' : 'Nova Conta Bancária'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Nome da Conta *</Label>
              <Input value={nomeExibicao} onChange={e => setNomeExibicao(e.target.value)} placeholder="Ex: Itaú Personalité ADM" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Tipo de Conta *</Label>
                <Select value={tipoConta} onValueChange={setTipoConta}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="cc">Conta Corrente</SelectItem>
                    <SelectItem value="inv">Investimento</SelectItem>
                    <SelectItem value="cartao">Cartão de Crédito</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Banco</Label>
                <Select value={banco} onValueChange={(v) => { setBanco(v); if (v !== 'Outros') setBancoOutro(''); }}>
                  <SelectTrigger><SelectValue placeholder="Selecione o banco" /></SelectTrigger>
                  <SelectContent className="max-h-[220px]">
                    {bancos.map(b => (
                      <SelectItem key={b.codigo_banco} value={b.nome_curto}>
                        <span className="flex items-center gap-1.5">
                          <span className="text-[10px] text-muted-foreground font-mono w-7">{b.codigo_banco}</span>
                          <span>{b.nome_banco}</span>
                        </span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {banco === 'Outros' && (
                  <Input
                    className="mt-1.5"
                    value={bancoOutro}
                    onChange={e => setBancoOutro(e.target.value)}
                    placeholder="Digite o nome do banco"
                  />
                )}
              </div>
            </div>
            <div>
              <Label>Fazenda *</Label>
              <Select value={fazendaId} onValueChange={setFazendaId}>
                <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                <SelectContent>
                  {fazendas.map(f => (
                    <SelectItem key={f.id} value={f.id}>{f.nome}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center gap-2">
              <Switch checked={ativa} onCheckedChange={setAtiva} />
              <Label>Conta ativa</Label>
            </div>

            <Collapsible open={advancedOpen} onOpenChange={setAdvancedOpen}>
              <CollapsibleTrigger asChild>
                <Button variant="ghost" size="sm" className="w-full justify-between text-muted-foreground text-xs">
                  Dados bancários avançados
                  <ChevronDown className={`h-3.5 w-3.5 transition-transform ${advancedOpen ? 'rotate-180' : ''}`} />
                </Button>
              </CollapsibleTrigger>
              <CollapsibleContent className="space-y-3 pt-2">
                <div>
                  <Label>Código curto</Label>
                  <Input value={codigoConta} onChange={e => setCodigoConta(e.target.value)} placeholder="Ex: cc-001 (uso técnico/importação)" className="font-mono text-sm" />
                </div>
                <div className="grid grid-cols-3 gap-2">
                  <div>
                    <Label>Agência</Label>
                    <Input value={agencia} onChange={e => setAgencia(e.target.value)} placeholder="1234" />
                  </div>
                  <div>
                    <Label>Nº Conta</Label>
                    <Input value={numeroConta} onChange={e => setNumeroConta(e.target.value)} placeholder="56789" />
                  </div>
                  <div>
                    <Label>Dígito</Label>
                    <Input value={contaDigito} onChange={e => setContaDigito(e.target.value)} placeholder="0" maxLength={2} />
                  </div>
                </div>
              </CollapsibleContent>
            </Collapsible>
          </div>

          {(!editing || editing.saldo_inicial_oficial === null) && (
            <div className="border border-amber-200 bg-amber-50 rounded-md p-3 space-y-3">
              <p className="text-[11px] font-semibold text-amber-700">⚠ Saldo inicial da conta</p>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-[11px]">
                    Mês inicial <span className="text-red-500">*</span>
                  </Label>
                  <input
                    type="month"
                    value={mesInicio}
                    onChange={e => setMesInicio(e.target.value)}
                    className="w-full border rounded px-2 py-1 text-[11px] mt-0.5"
                    required
                  />
                  <p className="text-[9px] text-muted-foreground mt-0.5">Primeiro mês de operação</p>
                </div>
                <div>
                  <Label className="text-[11px]">
                    Saldo inicial (R$) <span className="text-red-500">*</span>
                  </Label>
                  <input
                    type="text"
                    inputMode="decimal"
                    value={saldoInicialOficial}
                    onChange={e => setSaldoInicialOficial(e.target.value)}
                    placeholder="0,00"
                    className="w-full border rounded px-2 py-1 text-[11px] mt-0.5 text-right font-mono"
                  />
                  <p className="text-[9px] text-muted-foreground mt-0.5">Saldo real no início do período</p>
                </div>
              </div>
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancelar</Button>
            <Button onClick={save} disabled={isSaving}>{isSaving ? 'Salvando...' : (editing ? 'Salvar' : 'Criar')}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ─── Confirmar Desativação ─── */}
      <AlertDialog open={!!confirmDesativar} onOpenChange={(open) => !open && setConfirmDesativar(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Desativar conta</AlertDialogTitle>
            <AlertDialogDescription>
              Essa conta será desativada e não poderá mais ser usada em novos lançamentos. Lançamentos existentes não serão afetados. Deseja continuar?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleDesativar}>Desativar</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* ─── Confirmar Reativação ─── */}
      <AlertDialog open={!!confirmAtivar} onOpenChange={(open) => !open && setConfirmAtivar(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Reativar conta</AlertDialogTitle>
            <AlertDialogDescription>
              Essa conta voltará a ficar disponível para novos lançamentos. Deseja continuar?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleAtivar}>Reativar</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* ─── Confirmar Exclusão ─── */}
      <AlertDialog open={!!confirmExcluir} onOpenChange={(open) => !open && setConfirmExcluir(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir conta permanentemente</AlertDialogTitle>
            <AlertDialogDescription>
              Essa conta será excluída permanentemente. Essa ação não pode ser desfeita. Deseja continuar?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleExcluir} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
