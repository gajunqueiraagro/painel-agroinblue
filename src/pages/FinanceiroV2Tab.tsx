import { useState, useEffect, useCallback, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Plus, Pencil, Copy, ChevronLeft, ChevronRight, Zap, List, ChevronsUpDown } from 'lucide-react';
import { useFazenda } from '@/contexts/FazendaContext';
import { useFinanceiroV2, type LancamentoV2, type FiltrosV2 } from '@/hooks/useFinanceiroV2';
import { LancamentoV2Dialog } from '@/components/financeiro-v2/LancamentoV2Dialog';
import { ModoRapidoGrid } from '@/components/financeiro-v2/ModoRapidoGrid';
import { format, parseISO } from 'date-fns';

const MESES_LIST = [
  { value: '01', label: 'Jan' },
  { value: '02', label: 'Fev' },
  { value: '03', label: 'Mar' },
  { value: '04', label: 'Abr' },
  { value: '05', label: 'Mai' },
  { value: '06', label: 'Jun' },
  { value: '07', label: 'Jul' },
  { value: '08', label: 'Ago' },
  { value: '09', label: 'Set' },
  { value: '10', label: 'Out' },
  { value: '11', label: 'Nov' },
  { value: '12', label: 'Dez' },
];

const STATUS_COLORS: Record<string, string> = {
  previsto: 'bg-warning/20 text-warning border-warning/30',
  agendado: 'bg-blue-500/20 text-blue-600 border-blue-500/30',
  confirmado: 'bg-primary/20 text-primary border-primary/30',
  conciliado: 'bg-success/20 text-success border-success/30',
};

function fmtBRL(v: number): string {
  return v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function fmtValor(v: number, sinal: number) {
  const formatted = fmtBRL(Math.abs(v));
  return sinal >= 0 ? `R$ ${formatted}` : `- R$ ${formatted}`;
}

function fmtDate(d: string | null) {
  if (!d) return '-';
  try { return format(parseISO(d), 'dd/MM/yy'); } catch { return d; }
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

  const defaultFazendaId = fazendaAtual?.id !== '__global__' ? fazendaAtual?.id || '' : '';
  const [fazendaId, setFazendaId] = useState(defaultFazendaId);
  const [ano, setAno] = useState(filtroAnoInicial || String(currentYear));
  const [mesesSelecionados, setMesesSelecionados] = useState<string[]>(
    filtroMesInicial ? [String(filtroMesInicial).padStart(2, '0')] : []
  );
  const [contaBancariaId, setContaBancariaId] = useState('__all__');
  const [tipoOperacao, setTipoOperacao] = useState('__all__');
  const [statusTransacao, setStatusTransacao] = useState('__all__');
  const [macroFiltro, setMacroFiltro] = useState('__all__');
  const [centroFiltro, setCentroFiltro] = useState('__all__');
  const [subcentroFiltro, setSubcentroFiltro] = useState('__all__');
  const [mesPopoverOpen, setMesPopoverOpen] = useState(false);

  const [mode, setMode] = useState<'list' | 'rapido'>('list');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingLanc, setEditingLanc] = useState<LancamentoV2 | null>(null);

  const fazOperacionais = useMemo(() => fazendas.filter(f => f.id !== '__global__'), [fazendas]);

  // Unique macros/centros/subcentros from classificacoes for filters
  const macrosUnicos = useMemo(() => {
    const set = new Set(hook.classificacoes.map(c => c.macro_custo).filter(Boolean));
    return Array.from(set).sort();
  }, [hook.classificacoes]);

  const centrosUnicos = useMemo(() => {
    let items = hook.classificacoes;
    if (macroFiltro !== '__all__') items = items.filter(c => c.macro_custo === macroFiltro);
    const set = new Set(items.map(c => c.centro_custo).filter(Boolean));
    return Array.from(set).sort();
  }, [hook.classificacoes, macroFiltro]);

  const subcentrosUnicos = useMemo(() => {
    let items = hook.classificacoes;
    if (macroFiltro !== '__all__') items = items.filter(c => c.macro_custo === macroFiltro);
    if (centroFiltro !== '__all__') items = items.filter(c => c.centro_custo === centroFiltro);
    const set = new Set(items.map(c => c.subcentro).filter(Boolean));
    return Array.from(set).sort();
  }, [hook.classificacoes, macroFiltro, centroFiltro]);

  useEffect(() => {
    hook.loadContas();
    hook.loadClassificacoes();
    hook.loadFornecedores();
  }, [hook.loadContas, hook.loadClassificacoes, hook.loadFornecedores]);

  useEffect(() => {
    if (fazendaAtual && fazendaAtual.id !== '__global__') {
      setFazendaId(fazendaAtual.id);
    }
  }, [fazendaAtual]);

  const filtros: FiltrosV2 = useMemo(() => ({
    fazenda_id: fazendaId,
    ano,
    mes: mesesSelecionados.length === 0 ? 'todos' : undefined,
    meses: mesesSelecionados.length > 0 ? mesesSelecionados : undefined,
    conta_bancaria_id: contaBancariaId !== '__all__' ? contaBancariaId : undefined,
    tipo_operacao: tipoOperacao !== '__all__' ? tipoOperacao : undefined,
    status_transacao: statusTransacao !== '__all__' ? statusTransacao : undefined,
    macro_custo: macroFiltro !== '__all__' ? macroFiltro : undefined,
    centro_custo: centroFiltro !== '__all__' ? centroFiltro : undefined,
    subcentro: subcentroFiltro !== '__all__' ? subcentroFiltro : undefined,
  }), [fazendaId, ano, mesesSelecionados, contaBancariaId, tipoOperacao, statusTransacao, macroFiltro, centroFiltro, subcentroFiltro]);

  useEffect(() => {
    hook.loadLancamentos(filtros, 0);
  }, [filtros]); // eslint-disable-line react-hooks/exhaustive-deps

  const handlePageChange = (p: number) => hook.loadLancamentos(filtros, p);

  const handleSave = async (form: any, id?: string) => {
    let ok: boolean;
    if (id) ok = await hook.editarLancamento(id, form);
    else ok = await hook.criarLancamento(form);
    if (ok) hook.loadLancamentos(filtros, hook.page);
    return ok;
  };

  const handleDelete = async (id: string) => {
    const ok = await hook.excluirLancamento(id);
    if (ok) hook.loadLancamentos(filtros, hook.page);
    return ok;
  };

  const handleDuplicate = async (lanc: LancamentoV2) => {
    const ok = await hook.duplicarLancamento(lanc);
    if (ok) hook.loadLancamentos(filtros, hook.page);
  };

  const openNew = () => { setEditingLanc(null); setDialogOpen(true); };
  const openEdit = (l: LancamentoV2) => { setEditingLanc(l); setDialogOpen(true); };

  const totalEntradas = hook.lancamentos.filter(l => l.sinal > 0).reduce((s, l) => s + l.valor, 0);
  const totalSaidas = hook.lancamentos.filter(l => l.sinal < 0).reduce((s, l) => s + l.valor, 0);

  const toggleMes = (val: string) => {
    setMesesSelecionados(prev =>
      prev.includes(val) ? prev.filter(m => m !== val) : [...prev, val]
    );
  };

  const mesLabel = mesesSelecionados.length === 0
    ? 'Todos'
    : mesesSelecionados.length <= 3
      ? mesesSelecionados.map(m => MESES_LIST.find(x => x.value === m)?.label).join(', ')
      : `${mesesSelecionados.length} meses`;

  // Dynamic conta label based on tipo
  const isEntrada = tipoOperacao === '1-Entradas';
  const isSaida = tipoOperacao === '2-Saídas';
  const isTransf = tipoOperacao === '3-Transferência';
  const contaLabel = isEntrada ? 'Conta Destino' : isSaida ? 'Conta Origem' : 'Conta';

  return (
    <div className="space-y-2 pb-20">
      {/* FILTERS */}
      <Card>
        <CardContent className="p-2 space-y-1.5">
          {/* LINE 1: Ano, Mês (multi), Status */}
          <div className="grid grid-cols-3 gap-1.5">
            <div>
              <label className="text-[10px] text-muted-foreground font-medium leading-none">Ano</label>
              <Select value={ano} onValueChange={setAno}>
                <SelectTrigger className="h-7 text-[11px]"><SelectValue /></SelectTrigger>
                <SelectContent>{anos.map(a => <SelectItem key={a} value={a} className="text-xs py-1">{a}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-[10px] text-muted-foreground font-medium leading-none">Mês</label>
              <Popover open={mesPopoverOpen} onOpenChange={setMesPopoverOpen}>
                <PopoverTrigger asChild>
                  <Button variant="outline" className="w-full h-7 text-[11px] justify-between font-normal px-2">
                    {mesLabel}
                    <ChevronsUpDown className="h-3 w-3 opacity-50" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-48 p-2" align="start">
                  <div className="flex justify-between mb-1">
                    <button className="text-[10px] text-primary hover:underline" onClick={() => setMesesSelecionados([])}>
                      Todos
                    </button>
                    <button className="text-[10px] text-primary hover:underline" onClick={() => setMesesSelecionados(MESES_LIST.map(m => m.value))}>
                      Marcar todos
                    </button>
                  </div>
                  <div className="grid grid-cols-3 gap-1">
                    {MESES_LIST.map(m => (
                      <label key={m.value} className="flex items-center gap-1 text-[11px] cursor-pointer hover:bg-muted rounded px-1 py-0.5">
                        <Checkbox
                          checked={mesesSelecionados.includes(m.value)}
                          onCheckedChange={() => toggleMes(m.value)}
                          className="h-3 w-3"
                        />
                        {m.label}
                      </label>
                    ))}
                  </div>
                </PopoverContent>
              </Popover>
            </div>
            <div>
              <label className="text-[10px] text-muted-foreground font-medium leading-none">Status</label>
              <Select value={statusTransacao} onValueChange={setStatusTransacao}>
                <SelectTrigger className="h-7 text-[11px]"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__all__" className="text-xs py-1">Todos</SelectItem>
                  <SelectItem value="previsto" className="text-xs py-1">Previsto</SelectItem>
                  <SelectItem value="agendado" className="text-xs py-1">Agendado</SelectItem>
                  <SelectItem value="confirmado" className="text-xs py-1">Confirmado</SelectItem>
                  <SelectItem value="conciliado" className="text-xs py-1">Conciliado</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* LINE 2: Fazenda, Tipo */}
          <div className="grid grid-cols-2 gap-1.5">
            <div>
              <label className="text-[10px] text-muted-foreground font-medium leading-none">Fazenda</label>
              <Select value={fazendaId} onValueChange={v => { setFazendaId(v); setContaBancariaId('__all__'); }}>
                <SelectTrigger className="h-7 text-[11px]"><SelectValue placeholder="Selecione" /></SelectTrigger>
                <SelectContent>
                  {fazOperacionais.map(f => <SelectItem key={f.id} value={f.id} className="text-xs py-1">{f.nome}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-[10px] text-muted-foreground font-medium leading-none">Tipo</label>
              <Select value={tipoOperacao} onValueChange={setTipoOperacao}>
                <SelectTrigger className="h-7 text-[11px]"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__all__" className="text-xs py-1">Todos</SelectItem>
                  <SelectItem value="1-Entradas" className="text-xs py-1">Entradas</SelectItem>
                  <SelectItem value="2-Saídas" className="text-xs py-1">Saídas</SelectItem>
                  <SelectItem value="3-Transferência" className="text-xs py-1">Transferências</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* LINE 3: Conta (dynamic) */}
          <div className={`grid ${isTransf ? 'grid-cols-2' : 'grid-cols-1'} gap-1.5`}>
            <div>
              <label className="text-[10px] text-muted-foreground font-medium leading-none">
                {isTransf ? 'Conta Origem' : contaLabel}
              </label>
              <Select value={contaBancariaId} onValueChange={setContaBancariaId}>
                <SelectTrigger className="h-7 text-[11px]"><SelectValue placeholder="Todas" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__all__" className="text-xs py-1">Todas</SelectItem>
                  {hook.contasBancarias.map(c => (
                    <SelectItem key={c.id} value={c.id} className="text-xs py-1">{c.nome_conta}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {isTransf && (
              <div>
                <label className="text-[10px] text-muted-foreground font-medium leading-none">Conta Destino</label>
                <Select value="__all__" disabled>
                  <SelectTrigger className="h-7 text-[11px]"><SelectValue placeholder="Todas" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__all__" className="text-xs py-1">Todas</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>

          {/* LINE 4: Macro, Centro, Subcentro */}
          <div className="grid grid-cols-3 gap-1.5">
            <div>
              <label className="text-[10px] text-muted-foreground font-medium leading-none">Macro</label>
              <Select value={macroFiltro} onValueChange={v => { setMacroFiltro(v); setCentroFiltro('__all__'); setSubcentroFiltro('__all__'); }}>
                <SelectTrigger className="h-7 text-[11px]"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__all__" className="text-xs py-1">Todos</SelectItem>
                  {macrosUnicos.map(m => <SelectItem key={m} value={m} className="text-xs py-1">{m}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-[10px] text-muted-foreground font-medium leading-none">Centro</label>
              <Select value={centroFiltro} onValueChange={v => { setCentroFiltro(v); setSubcentroFiltro('__all__'); }}>
                <SelectTrigger className="h-7 text-[11px]"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__all__" className="text-xs py-1">Todos</SelectItem>
                  {centrosUnicos.map(c => <SelectItem key={c} value={c} className="text-xs py-1">{c}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-[10px] text-muted-foreground font-medium leading-none">Subcentro</label>
              <Select value={subcentroFiltro} onValueChange={setSubcentroFiltro}>
                <SelectTrigger className="h-7 text-[11px]"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__all__" className="text-xs py-1">Todos</SelectItem>
                  {subcentrosUnicos.map(s => <SelectItem key={s} value={s} className="text-xs py-1">{s}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Summary + actions bar */}
          <div className="flex items-center justify-between pt-0.5">
            <div className="flex gap-3 text-[11px]">
              <span className="text-success font-bold">Ent: R$ {fmtBRL(totalEntradas)}</span>
              <span className="text-destructive font-bold">Saí: R$ {fmtBRL(totalSaidas)}</span>
              <span className="text-muted-foreground">{hook.total} lanç.</span>
            </div>
            <div className="flex gap-1">
              <Button
                size="sm"
                variant={mode === 'rapido' ? 'default' : 'outline'}
                onClick={() => setMode(mode === 'rapido' ? 'list' : 'rapido')}
                className="h-7 text-[11px] gap-1 px-2"
              >
                {mode === 'rapido' ? <List className="h-3 w-3" /> : <Zap className="h-3 w-3" />}
                {mode === 'rapido' ? 'Lista' : 'Rápido'}
              </Button>
              {mode === 'list' && (
                <Button size="sm" onClick={openNew} className="h-7 text-[11px] gap-1 px-2">
                  <Plus className="h-3 w-3" /> Novo
                </Button>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {(!fazendaId || !ano) && (
        <div className="text-center text-muted-foreground py-8 text-xs">
          Selecione uma fazenda e um ano para carregar os lançamentos.
        </div>
      )}

      {hook.loading && (
        <div className="text-center text-muted-foreground py-6 text-xs animate-pulse">Carregando...</div>
      )}

      {mode === 'rapido' && fazendaId && (
        <ModoRapidoGrid
          fazendaId={fazendaId}
          contas={hook.contasBancarias}
          classificacoes={hook.classificacoes}
          onSaveBatch={hook.criarLancamentosEmLote}
          onDone={() => hook.loadLancamentos(filtros, 0)}
        />
      )}

      {mode === 'list' && !hook.loading && fazendaId && ano && (
        <>
          <div className="rounded-lg border overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[68px]">Dt Comp</TableHead>
                  <TableHead className="w-[68px]">Dt Pgto</TableHead>
                  <TableHead>Produto</TableHead>
                  <TableHead className="w-[90px]">Fornecedor</TableHead>
                  <TableHead className="w-[95px] text-right">Valor</TableHead>
                  <TableHead className="w-[70px]">Fazenda</TableHead>
                  <TableHead className="w-[55px]">Tipo</TableHead>
                  <TableHead className="w-[80px]">Conta</TableHead>
                  <TableHead className="w-[60px]">Macro</TableHead>
                  <TableHead className="w-[80px]">Subcentro</TableHead>
                  <TableHead className="w-[75px]">NF</TableHead>
                  <TableHead className="w-[50px]">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {hook.lancamentos.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={12} className="text-center text-muted-foreground py-6 text-xs">
                      Nenhum lançamento encontrado.
                    </TableCell>
                  </TableRow>
                ) : (
                  hook.lancamentos.map(l => {
                    const contaNome = hook.contasBancarias.find(c => c.id === l.conta_bancaria_id)?.nome_conta || '-';
                    const tipoLabel = l.tipo_operacao?.replace(/^\d-/, '').substring(0, 5) || '-';
                    const fazNome = fazendas.find(f => f.id === l.fazenda_id)?.nome || '-';
                    const fornNome = hook.fornecedores.find(f => f.id === l.favorecido_id)?.nome || '-';

                    return (
                      <TableRow key={l.id} className="text-[11px]">
                        <TableCell className="font-mono py-1.5 px-2">{fmtDate(l.data_competencia)}</TableCell>
                        <TableCell className="font-mono py-1.5 px-2">{fmtDate(l.data_pagamento)}</TableCell>
                        <TableCell className="max-w-[140px] truncate py-1.5 px-2" title={l.descricao || ''}>{l.descricao || '-'}</TableCell>
                        <TableCell className="max-w-[90px] truncate py-1.5 px-2" title={fornNome}>{fornNome}</TableCell>
                        <TableCell className={`text-right font-bold py-1.5 px-2 ${l.sinal > 0 ? 'text-success' : 'text-destructive'}`}>
                          {fmtValor(l.valor, l.sinal)}
                        </TableCell>
                        <TableCell className="truncate max-w-[70px] py-1.5 px-2" title={fazNome}>{fazNome}</TableCell>
                        <TableCell className="py-1.5 px-2">{tipoLabel}</TableCell>
                        <TableCell className="truncate max-w-[80px] py-1.5 px-2" title={contaNome}>{contaNome}</TableCell>
                        <TableCell className="truncate max-w-[60px] py-1.5 px-2 text-muted-foreground">{l.macro_custo || '-'}</TableCell>
                        <TableCell className="truncate max-w-[80px] py-1.5 px-2 text-muted-foreground">{l.subcentro || '-'}</TableCell>
                        <TableCell className="font-mono py-1.5 px-2 text-muted-foreground">{l.nota_fiscal || '-'}</TableCell>
                        <TableCell className="py-1.5 px-2">
                          <div className="flex gap-0.5">
                            <Button variant="ghost" size="icon" className="h-5 w-5" onClick={() => openEdit(l)}>
                              <Pencil className="h-3 w-3" />
                            </Button>
                            <Button variant="ghost" size="icon" className="h-5 w-5" onClick={() => handleDuplicate(l)}>
                              <Copy className="h-3 w-3" />
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

          {hook.totalPages > 1 && (
            <div className="flex items-center justify-center gap-2">
              <Button variant="outline" size="sm" className="h-7" disabled={hook.page === 0} onClick={() => handlePageChange(hook.page - 1)}>
                <ChevronLeft className="h-3.5 w-3.5" />
              </Button>
              <span className="text-[11px] text-muted-foreground">Pág {hook.page + 1}/{hook.totalPages}</span>
              <Button variant="outline" size="sm" className="h-7" disabled={hook.page >= hook.totalPages - 1} onClick={() => handlePageChange(hook.page + 1)}>
                <ChevronRight className="h-3.5 w-3.5" />
              </Button>
            </div>
          )}
        </>
      )}

      <LancamentoV2Dialog
        open={dialogOpen}
        onClose={() => { setDialogOpen(false); setEditingLanc(null); }}
        onSave={handleSave}
        onDelete={handleDelete}
        lancamento={editingLanc}
        fazendas={fazendas}
        contas={hook.contasBancarias}
        classificacoes={hook.classificacoes}
        fornecedores={hook.fornecedores}
        defaultFazendaId={fazendaId}
        onCriarFornecedor={hook.criarFornecedor}
      />
    </div>
  );
}
