import { useState, useEffect, useCallback, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Plus, Pencil, Trash2, Copy, ChevronLeft, ChevronRight, Zap, List } from 'lucide-react';
import { useFazenda } from '@/contexts/FazendaContext';
import { useFinanceiroV2, type LancamentoV2, type FiltrosV2 } from '@/hooks/useFinanceiroV2';
import { LancamentoV2Dialog } from '@/components/financeiro-v2/LancamentoV2Dialog';
import { ModoRapidoGrid } from '@/components/financeiro-v2/ModoRapidoGrid';
import { format, parseISO } from 'date-fns';

const MESES = [
  { value: 'todos', label: 'Todos' },
  { value: '01', label: 'Janeiro' },
  { value: '02', label: 'Fevereiro' },
  { value: '03', label: 'Março' },
  { value: '04', label: 'Abril' },
  { value: '05', label: 'Maio' },
  { value: '06', label: 'Junho' },
  { value: '07', label: 'Julho' },
  { value: '08', label: 'Agosto' },
  { value: '09', label: 'Setembro' },
  { value: '10', label: 'Outubro' },
  { value: '11', label: 'Novembro' },
  { value: '12', label: 'Dezembro' },
];

const STATUS_COLORS: Record<string, string> = {
  pendente: 'bg-warning/20 text-warning border-warning/30',
  confirmado: 'bg-primary/20 text-primary border-primary/30',
  conciliado: 'bg-success/20 text-success border-success/30',
};

function fmtValor(v: number, sinal: number) {
  const abs = Math.abs(v);
  const formatted = abs.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return sinal >= 0 ? `R$ ${formatted}` : `- R$ ${formatted}`;
}

function fmtDate(d: string | null) {
  if (!d) return '-';
  try { return format(parseISO(d), 'dd/MM/yyyy'); } catch { return d; }
}

interface Props {
  onBack?: () => void;
  filtroAnoInicial?: string;
  filtroMesInicial?: number;
}

export function FinanceiroV2Tab({ onBack, filtroAnoInicial, filtroMesInicial }: Props) {
  const { fazendas, fazendaAtual } = useFazenda();
  const hook = useFinanceiroV2();

  const currentYear = new Date().getFullYear();
  const anos = useMemo(() => {
    const arr: string[] = [];
    for (let y = currentYear; y >= currentYear - 5; y--) arr.push(String(y));
    return arr;
  }, [currentYear]);

  // Filters
  const defaultFazendaId = fazendaAtual?.id !== '__global__' ? fazendaAtual?.id || '' : '';
  const [fazendaId, setFazendaId] = useState(defaultFazendaId);
  const [ano, setAno] = useState(filtroAnoInicial || String(currentYear));
  const [mes, setMes] = useState(filtroMesInicial ? String(filtroMesInicial).padStart(2, '0') : 'todos');
  const [contaBancariaId, setContaBancariaId] = useState('__all__');
  const [tipoOperacao, setTipoOperacao] = useState('__all__');
  const [statusTransacao, setStatusTransacao] = useState('__all__');

  // Mode: 'list' (default) or 'rapido' (Excel grid)
  const [mode, setMode] = useState<'list' | 'rapido'>('list');

  // Dialog state
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingLanc, setEditingLanc] = useState<LancamentoV2 | null>(null);

  const fazOperacionais = useMemo(() => fazendas.filter(f => f.id !== '__global__'), [fazendas]);
  const contasFiltradas = useMemo(() =>
    fazendaId ? hook.contasBancarias.filter(c => c.fazenda_id === fazendaId) : hook.contasBancarias
  , [fazendaId, hook.contasBancarias]);

  // Load contas + classificacoes on mount
  useEffect(() => { hook.loadContas(); hook.loadClassificacoes(); }, [hook.loadContas, hook.loadClassificacoes]);

  // Auto-set fazenda from context
  useEffect(() => {
    if (fazendaAtual && fazendaAtual.id !== '__global__') {
      setFazendaId(fazendaAtual.id);
    }
  }, [fazendaAtual]);

  const filtros: FiltrosV2 = useMemo(() => ({
    fazenda_id: fazendaId,
    ano,
    mes,
    conta_bancaria_id: contaBancariaId !== '__all__' ? contaBancariaId : undefined,
    tipo_operacao: tipoOperacao !== '__all__' ? tipoOperacao : undefined,
    status_transacao: statusTransacao !== '__all__' ? statusTransacao : undefined,
  }), [fazendaId, ano, mes, contaBancariaId, tipoOperacao, statusTransacao]);

  // Load on filter change
  useEffect(() => {
    hook.loadLancamentos(filtros, 0);
  }, [filtros]); // eslint-disable-line react-hooks/exhaustive-deps

  const handlePageChange = (p: number) => {
    hook.loadLancamentos(filtros, p);
  };

  const handleSave = async (form: any, id?: string) => {
    let ok: boolean;
    if (id) {
      ok = await hook.editarLancamento(id, form);
    } else {
      ok = await hook.criarLancamento(form);
    }
    if (ok) hook.loadLancamentos(filtros, hook.page);
    return ok;
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Excluir este lançamento?')) return;
    const ok = await hook.excluirLancamento(id);
    if (ok) hook.loadLancamentos(filtros, hook.page);
  };

  const handleDuplicate = async (lanc: LancamentoV2) => {
    const ok = await hook.duplicarLancamento(lanc);
    if (ok) hook.loadLancamentos(filtros, hook.page);
  };

  const openNew = () => { setEditingLanc(null); setDialogOpen(true); };
  const openEdit = (l: LancamentoV2) => { setEditingLanc(l); setDialogOpen(true); };

  // Totals
  const totalEntradas = hook.lancamentos.filter(l => l.sinal > 0).reduce((s, l) => s + l.valor, 0);
  const totalSaidas = hook.lancamentos.filter(l => l.sinal < 0).reduce((s, l) => s + l.valor, 0);

  return (
    <div className="space-y-4 pb-20">
      {/* Filters */}
      <Card>
        <CardContent className="p-3 space-y-3">
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            <div>
              <label className="text-xs text-muted-foreground font-medium">Fazenda</label>
              <Select value={fazendaId} onValueChange={v => { setFazendaId(v); setContaBancariaId(''); }}>
                <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Selecione" /></SelectTrigger>
                <SelectContent>
                  {fazOperacionais.map(f => (
                    <SelectItem key={f.id} value={f.id}>{f.nome}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-xs text-muted-foreground font-medium">Ano</label>
              <Select value={ano} onValueChange={setAno}>
                <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {anos.map(a => <SelectItem key={a} value={a}>{a}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-xs text-muted-foreground font-medium">Mês</label>
              <Select value={mes} onValueChange={setMes}>
                <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {MESES.map(m => <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-xs text-muted-foreground font-medium">Conta</label>
              <Select value={contaBancariaId} onValueChange={setContaBancariaId}>
                <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Todas" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__all__">Todas</SelectItem>
                  {contasFiltradas.map(c => (
                    <SelectItem key={c.id} value={c.id}>{c.nome_conta}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-xs text-muted-foreground font-medium">Tipo</label>
              <Select value={tipoOperacao} onValueChange={setTipoOperacao}>
                <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Todos" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__all__">Todos</SelectItem>
                  <SelectItem value="1-Entradas">Entradas</SelectItem>
                  <SelectItem value="2-Saídas">Saídas</SelectItem>
                  <SelectItem value="3-Transferências">Transferências</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-xs text-muted-foreground font-medium">Status</label>
              <Select value={statusTransacao} onValueChange={setStatusTransacao}>
                <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Todos" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__all__">Todos</SelectItem>
                  <SelectItem value="pendente">Pendente</SelectItem>
                  <SelectItem value="confirmado">Confirmado</SelectItem>
                  <SelectItem value="conciliado">Conciliado</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="flex items-center justify-between">
            <div className="flex gap-3 text-xs">
              <span className="text-success font-bold">
                Entradas: R$ {totalEntradas.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
              </span>
              <span className="text-destructive font-bold">
                Saídas: R$ {totalSaidas.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
              </span>
              <span className="text-muted-foreground">
                {hook.total} lançamentos
              </span>
            </div>
            <div className="flex gap-1.5">
              <Button
                size="sm"
                variant={mode === 'rapido' ? 'default' : 'outline'}
                onClick={() => setMode(mode === 'rapido' ? 'list' : 'rapido')}
                className="h-8 text-xs gap-1"
              >
                {mode === 'rapido' ? <List className="h-3.5 w-3.5" /> : <Zap className="h-3.5 w-3.5" />}
                {mode === 'rapido' ? 'Listagem' : 'Modo Rápido'}
              </Button>
              {mode === 'list' && (
                <Button size="sm" onClick={openNew} className="h-8 text-xs gap-1">
                  <Plus className="h-3.5 w-3.5" /> Novo
                </Button>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* No filter warning */}
      {(!fazendaId || !ano) && (
        <div className="text-center text-muted-foreground py-12 text-sm">
          Selecione uma fazenda e um ano para carregar os lançamentos.
        </div>
      )}

      {/* Loading */}
      {hook.loading && (
        <div className="text-center text-muted-foreground py-8 text-sm animate-pulse">
          Carregando...
        </div>
      )}

      {/* Modo Rápido */}
      {mode === 'rapido' && fazendaId && (
        <ModoRapidoGrid
          fazendaId={fazendaId}
          contas={hook.contasBancarias}
          classificacoes={hook.classificacoes}
          onSaveBatch={hook.criarLancamentosEmLote}
          onDone={() => hook.loadLancamentos(filtros, 0)}
        />
      )}

      {/* Table (list mode) */}
      {mode === 'list' && !hook.loading && fazendaId && ano && (
        <>
          <div className="rounded-lg border overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="text-xs">
                  <TableHead className="w-[90px]">Data Pgto</TableHead>
                  <TableHead>Descrição</TableHead>
                  <TableHead className="w-[100px]">Conta</TableHead>
                  <TableHead className="w-[110px] text-right">Valor</TableHead>
                  <TableHead className="w-[80px]">Tipo</TableHead>
                  <TableHead className="w-[80px]">Status</TableHead>
                  <TableHead className="w-[100px]">Classificação</TableHead>
                  <TableHead className="w-[90px]">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {hook.lancamentos.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={8} className="text-center text-muted-foreground py-8 text-sm">
                      Nenhum lançamento encontrado para o período selecionado.
                    </TableCell>
                  </TableRow>
                ) : (
                  hook.lancamentos.map(l => {
                    const contaNome = hook.contasBancarias.find(c => c.id === l.conta_bancaria_id)?.nome_conta || '-';
                    const tipoLabel = l.tipo_operacao?.replace(/^\d-/, '') || '-';
                    const statusLabel = l.status_transacao || 'pendente';
                    const classificacao = [l.macro_custo, l.centro_custo, l.subcentro].filter(Boolean).join(' › ');

                    return (
                      <TableRow key={l.id} className="text-xs">
                        <TableCell className="font-mono">{fmtDate(l.data_pagamento)}</TableCell>
                        <TableCell className="max-w-[200px] truncate" title={l.descricao || ''}>
                          {l.descricao || '-'}
                        </TableCell>
                        <TableCell className="truncate max-w-[100px]" title={contaNome}>{contaNome}</TableCell>
                        <TableCell className={`text-right font-bold ${l.sinal > 0 ? 'text-success' : 'text-destructive'}`}>
                          {fmtValor(l.valor, l.sinal)}
                        </TableCell>
                        <TableCell>{tipoLabel}</TableCell>
                        <TableCell>
                          <Badge variant="outline" className={`text-[10px] px-1.5 py-0 ${STATUS_COLORS[statusLabel] || ''}`}>
                            {statusLabel}
                          </Badge>
                        </TableCell>
                        <TableCell className="truncate max-w-[100px] text-muted-foreground" title={classificacao}>
                          {classificacao || '-'}
                        </TableCell>
                        <TableCell>
                          <div className="flex gap-1">
                            <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => openEdit(l)}>
                              <Pencil className="h-3 w-3" />
                            </Button>
                            <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => handleDuplicate(l)}>
                              <Copy className="h-3 w-3" />
                            </Button>
                            <Button variant="ghost" size="icon" className="h-6 w-6 text-destructive" onClick={() => handleDelete(l.id)}>
                              <Trash2 className="h-3 w-3" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </div>

          {/* Pagination */}
          {hook.totalPages > 1 && (
            <div className="flex items-center justify-center gap-2">
              <Button variant="outline" size="sm" disabled={hook.page === 0} onClick={() => handlePageChange(hook.page - 1)}>
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <span className="text-xs text-muted-foreground">
                Página {hook.page + 1} de {hook.totalPages}
              </span>
              <Button variant="outline" size="sm" disabled={hook.page >= hook.totalPages - 1} onClick={() => handlePageChange(hook.page + 1)}>
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          )}
        </>
      )}

      {/* Dialog */}
      <LancamentoV2Dialog
        open={dialogOpen}
        onClose={() => { setDialogOpen(false); setEditingLanc(null); }}
        onSave={handleSave}
        lancamento={editingLanc}
        fazendas={fazendas}
        contas={hook.contasBancarias}
        defaultFazendaId={fazendaId}
      />
    </div>
  );
}
