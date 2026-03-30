import { useState, useEffect, useCallback, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useCliente } from '@/contexts/ClienteContext';
import { usePermissions } from '@/hooks/usePermissions';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import {
  CheckCircle2, AlertTriangle, XCircle, Pencil,
} from 'lucide-react';
import { toast } from 'sonner';
import { format, parseISO } from 'date-fns';

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
  tipo_operacao: string;
  valor: number;
  sinal: number;
  data_competencia: string;
  data_pagamento: string | null;
  descricao: string | null;
  status_transacao: string | null;
  favorecido_id: string | null;
  nota_fiscal: string | null;
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
  status: 'conciliado' | 'atencao' | 'nao_conciliado' | 'pendente';
  saldoRow: SaldoRow | null;
  lancamentos: LancamentoResumo[];
}

/* ── Helpers ── */
function fmtBRL(v: number): string {
  return v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function fmtDate(d: string | null) {
  if (!d) return '-';
  try { return format(parseISO(d), 'dd/MM/yy'); } catch { return d; }
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

function getStatus(diferenca: number, saldoExtrato: number | null): MesCard['status'] {
  if (saldoExtrato === null) return 'pendente';
  const abs = Math.abs(diferenca);
  if (abs < 0.01) return 'conciliado';
  if (abs <= 100) return 'atencao';
  return 'nao_conciliado';
}

const STATUS_CONFIG = {
  conciliado: { label: 'Conciliado', color: 'bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300', icon: CheckCircle2, iconColor: 'text-green-600' },
  atencao: { label: 'Atenção', color: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/40 dark:text-yellow-300', icon: AlertTriangle, iconColor: 'text-yellow-600' },
  nao_conciliado: { label: 'Não Conciliado', color: 'bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300', icon: XCircle, iconColor: 'text-red-600' },
  pendente: { label: 'Pendente', color: 'bg-muted text-muted-foreground', icon: AlertTriangle, iconColor: 'text-muted-foreground' },
};

/* ── Component ── */
export function ConciliacaoBancariaTab() {
  const { clienteAtual } = useCliente();
  const perm = usePermissions();
  const isAdmin = perm.perfil === 'admin_agroinblue' || perm.perfil === 'gestor_cliente';
  const isFinanceiro = perm.perfil === 'financeiro';
  const clienteId = clienteAtual?.id;

  const currentYear = new Date().getFullYear();
  const currentMonth = new Date().getMonth() + 1;
  const anos = useMemo(() => {
    const arr: string[] = [];
    for (let y = currentYear; y >= currentYear - 3; y--) arr.push(String(y));
    return arr;
  }, [currentYear]);

  const [ano, setAno] = useState(String(currentYear));
  const [contaId, setContaId] = useState<string>('__all__');
  const [contas, setContas] = useState<ContaRef[]>([]);
  const [saldos, setSaldos] = useState<SaldoRow[]>([]);
  const [lancamentos, setLancamentos] = useState<LancamentoResumo[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedMes, setSelectedMes] = useState<string>(String(currentMonth).padStart(2, '0'));
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
  }, [clienteId]);

  const loadData = useCallback(async () => {
    if (!clienteId) return;
    setLoading(true);

    const anoMesMin = `${ano}-01`;
    const anoMesMax = `${ano}-12`;

    let sQuery = supabase
      .from('financeiro_saldos_bancarios_v2')
      .select('id, ano_mes, conta_bancaria_id, saldo_inicial, saldo_final, status_mes, origem_saldo_inicial')
      .eq('cliente_id', clienteId)
      .gte('ano_mes', anoMesMin)
      .lte('ano_mes', anoMesMax);
    if (contaId !== '__all__') sQuery = sQuery.eq('conta_bancaria_id', contaId);
    const { data: sData } = await sQuery;
    setSaldos((sData as SaldoRow[]) || []);

    const batchSize = 1000;
    const allLanc: LancamentoResumo[] = [];
    let from = 0;
    while (true) {
      let lQuery = supabase
        .from('financeiro_lancamentos_v2')
        .select('tipo_operacao, valor, sinal, data_competencia, data_pagamento, descricao, status_transacao, favorecido_id, nota_fiscal')
        .eq('cliente_id', clienteId)
        .gte('ano_mes', anoMesMin)
        .lte('ano_mes', anoMesMax);
      if (contaId !== '__all__') lQuery = lQuery.eq('conta_bancaria_id', contaId);
      lQuery = lQuery.order('data_competencia').range(from, from + batchSize - 1);
      const { data: lData } = await lQuery;
      if (!lData || lData.length === 0) break;
      allLanc.push(...(lData as LancamentoResumo[]));
      if (lData.length < batchSize) break;
      from += batchSize;
    }
    setLancamentos(allLanc);
    setLoading(false);
  }, [clienteId, ano, contaId]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const mesCards: MesCard[] = useMemo(() => {
    const cards: MesCard[] = [];
    let saldoAcumulado = 0;

    for (let m = 1; m <= 12; m++) {
      const mesStr = String(m).padStart(2, '0');
      const anoMes = `${ano}-${mesStr}`;

      const saldoRows = saldos.filter(s => s.ano_mes === anoMes);
      const saldoRow = contaId !== '__all__' ? saldoRows[0] || null : null;

      const saldoInicial = saldoRows.reduce((sum, s) => sum + (s.saldo_inicial || 0), 0);

      const mesLancs = lancamentos.filter(l => {
        const d = l.data_pagamento || l.data_competencia;
        return d && d.substring(0, 7) === anoMes;
      });

      let entradasTerceiros = 0;
      let transferenciasRecebidas = 0;
      let saidasTerceiros = 0;
      let transferenciasEnviadas = 0;

      for (const l of mesLancs) {
        const tipo = (l.tipo_operacao || '').toLowerCase().replace(/[\s\-–—]/g, '');
        const valor = Math.abs(l.valor);

        if (tipo.startsWith('1') || tipo.includes('entrada')) {
          if (tipo.includes('transfer')) {
            transferenciasRecebidas += valor;
          } else {
            entradasTerceiros += valor;
          }
        } else if (tipo.startsWith('2') || tipo.includes('saida') || tipo.includes('saída')) {
          if (tipo.includes('transfer')) {
            transferenciasEnviadas += valor;
          } else {
            saidasTerceiros += valor;
          }
        } else if (tipo.startsWith('3') || tipo.includes('transfer')) {
          if (l.sinal >= 0) {
            transferenciasRecebidas += valor;
          } else {
            transferenciasEnviadas += valor;
          }
        }
      }

      const totalEntradas = entradasTerceiros + transferenciasRecebidas;
      const totalSaidas = saidasTerceiros + transferenciasEnviadas;
      const saldoCalculado = saldoInicial + totalEntradas - totalSaidas;

      const saldoExtrato = saldoRows.length > 0
        ? saldoRows.reduce((sum, s) => sum + (s.saldo_final || 0), 0)
        : null;

      const diferenca = saldoExtrato !== null ? saldoExtrato - saldoCalculado : 0;
      const status = getStatus(diferenca, saldoExtrato);

      saldoAcumulado += (totalEntradas - totalSaidas);

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
    }

    return cards;
  }, [ano, contaId, saldos, lancamentos]);

  const summary = useMemo(() => {
    const totalEntradas = mesCards.reduce((s, c) => s + c.totalEntradas, 0);
    const totalSaidas = mesCards.reduce((s, c) => s + c.totalSaidas, 0);
    const conciliados = mesCards.filter(c => c.status === 'conciliado').length;
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
        {/* Filtros compactos inline */}
        <div className="flex items-center gap-2">
          <Select value={ano} onValueChange={setAno}>
            <SelectTrigger className="h-7 text-xs w-[72px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              {anos.map(a => <SelectItem key={a} value={a} className="text-xs">{a}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={contaId} onValueChange={setContaId}>
            <SelectTrigger className="h-7 text-xs flex-1"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="__all__" className="text-xs">Todas as contas</SelectItem>
              {contas.map(c => (
                <SelectItem key={c.id} value={c.id} className="text-xs">{contaLabel(c)}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Barra de meses com status */}
        <div className="flex gap-0.5 rounded-md overflow-hidden">
          {mesCards.map(c => {
            const cfg = STATUS_CONFIG[c.status];
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

        {loading ? (
          <div className="text-center text-xs text-muted-foreground py-8">Carregando...</div>
        ) : selectedCard && (() => {
          const card = selectedCard;
          const cfg = STATUS_CONFIG[card.status];
          const StatusIcon = cfg.icon;
          return (
            <div className="space-y-2">
              {/* Header do mês */}
              <div className="flex items-center gap-2">
                <StatusIcon className={`h-4 w-4 ${cfg.iconColor}`} />
                <span className="text-sm font-bold">{card.label}/{ano}</span>
                <Badge variant="outline" className={`text-[9px] px-1.5 py-0 ${cfg.color}`}>
                  {cfg.label}
                </Badge>
                <div className="ml-auto text-right">
                  <p className="text-[9px] text-muted-foreground">Saldo Calculado</p>
                  <p className={`text-xs font-bold ${card.saldoCalculado >= 0 ? 'text-foreground' : 'text-red-600'}`}>
                    R$ {fmtBRL(card.saldoCalculado)}
                  </p>
                </div>
              </div>

              {/* Blocos de dados */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                <div className="bg-background rounded-md p-2 border">
                  <p className="text-[9px] text-muted-foreground uppercase font-medium">Saldo Inicial</p>
                  <p className="text-xs font-bold">R$ {fmtBRL(card.saldoInicial)}</p>
                </div>

                <div className="bg-background rounded-md p-2 border">
                  <p className="text-[9px] text-muted-foreground uppercase font-medium">Entradas</p>
                  <p className="text-xs font-bold text-green-700 dark:text-green-400">R$ {fmtBRL(card.totalEntradas)}</p>
                  <div className="mt-1 space-y-0.5">
                    <p className="text-[8px] text-muted-foreground flex justify-between">
                      <span>Terceiros</span><span>R$ {fmtBRL(card.entradasTerceiros)}</span>
                    </p>
                    <p className="text-[8px] text-muted-foreground flex justify-between">
                      <span>Transferências</span><span>R$ {fmtBRL(card.transferenciasRecebidas)}</span>
                    </p>
                  </div>
                </div>

                <div className="bg-background rounded-md p-2 border">
                  <p className="text-[9px] text-muted-foreground uppercase font-medium">Saídas</p>
                  <p className="text-xs font-bold text-red-700 dark:text-red-400">R$ {fmtBRL(card.totalSaidas)}</p>
                  <div className="mt-1 space-y-0.5">
                    <p className="text-[8px] text-muted-foreground flex justify-between">
                      <span>Terceiros</span><span>R$ {fmtBRL(card.saidasTerceiros)}</span>
                    </p>
                    <p className="text-[8px] text-muted-foreground flex justify-between">
                      <span>Transferências</span><span>R$ {fmtBRL(card.transferenciasEnviadas)}</span>
                    </p>
                  </div>
                </div>

                <div className="bg-background rounded-md p-2 border">
                  <p className="text-[9px] text-muted-foreground uppercase font-medium">Saldo Final Calculado</p>
                  <p className={`text-xs font-bold ${card.saldoCalculado >= 0 ? 'text-foreground' : 'text-red-600'}`}>
                    R$ {fmtBRL(card.saldoCalculado)}
                  </p>
                </div>
              </div>

              {/* Conciliação */}
              <div className="bg-background rounded-md p-2.5 border space-y-2">
                <p className="text-[10px] font-bold text-foreground uppercase tracking-wider">Conciliação</p>
                <div className="grid grid-cols-3 gap-2">
                  <div>
                    <p className="text-[9px] text-muted-foreground">Saldo Extrato</p>
                    <div className="flex items-center gap-1">
                      <p className="text-xs font-bold">
                        {card.saldoExtrato !== null ? `R$ ${fmtBRL(card.saldoExtrato)}` : '—'}
                      </p>
                      {contaId !== '__all__' && canEditSaldoFinal(card.anoMes) && (
                        <button
                          onClick={() => handleEditSaldo(card.anoMes, contaId, card.saldoExtrato || 0)}
                          className="p-0.5 hover:bg-muted rounded"
                        >
                          <Pencil className="h-3 w-3 text-muted-foreground" />
                        </button>
                      )}
                    </div>
                  </div>
                  <div>
                    <p className="text-[9px] text-muted-foreground">Saldo Calculado</p>
                    <p className="text-xs font-bold">R$ {fmtBRL(card.saldoCalculado)}</p>
                  </div>
                  <div>
                    <p className="text-[9px] text-muted-foreground">Diferença</p>
                    <p className={`text-xs font-bold ${Math.abs(card.diferenca) < 0.01 ? 'text-green-600' : 'text-red-600'}`}>
                      R$ {fmtBRL(card.diferenca)}
                    </p>
                  </div>
                </div>
              </div>

              {/* Lançamentos */}
              {card.lancamentos.length > 0 && (
                <div>
                  <p className="text-[10px] font-bold text-foreground uppercase tracking-wider mb-1">
                    Lançamentos ({card.lancamentos.length})
                  </p>
                  <div className="max-h-[300px] overflow-y-auto rounded border">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="text-[9px] w-[50px]">Data</TableHead>
                          <TableHead className="text-[9px]">Descrição</TableHead>
                          <TableHead className="text-[9px] w-[50px]">Tipo</TableHead>
                          <TableHead className="text-[9px] text-right w-[90px]">Valor</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {card.lancamentos.slice(0, 50).map((l, idx) => {
                          const tipo = (l.tipo_operacao || '').substring(0, 1);
                          const isEntrada = tipo === '1';
                          return (
                            <TableRow key={idx}>
                              <TableCell className="text-[9px] py-0.5">{fmtDate(l.data_pagamento || l.data_competencia)}</TableCell>
                              <TableCell className="text-[9px] py-0.5 truncate max-w-[120px]">{l.descricao || '-'}</TableCell>
                              <TableCell className="text-[9px] py-0.5 text-center">
                                <span className={isEntrada ? 'text-green-600' : 'text-red-600'}>
                                  {tipo === '1' ? 'E' : tipo === '2' ? 'S' : 'T'}
                                </span>
                              </TableCell>
                              <TableCell className={`text-[9px] py-0.5 text-right font-medium tabular-nums ${isEntrada ? 'text-green-700' : 'text-red-700'}`}>
                                {isEntrada ? '' : '- '}R$ {fmtBRL(Math.abs(l.valor))}
                              </TableCell>
                            </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
                    {card.lancamentos.length > 50 && (
                      <p className="text-[9px] text-center text-muted-foreground py-1">
                        +{card.lancamentos.length - 50} lançamentos
                      </p>
                    )}
                  </div>
                </div>
              )}

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
