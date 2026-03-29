import { useState, useEffect, useCallback, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Plus, Pencil, Copy, ChevronLeft, ChevronRight, Zap, List, ChevronsUpDown, FilterX } from 'lucide-react';
import { useFazenda } from '@/contexts/FazendaContext';
import { useFinanceiroV2, type LancamentoV2, type FiltrosV2 } from '@/hooks/useFinanceiroV2';
import { LancamentoV2Dialog } from '@/components/financeiro-v2/LancamentoV2Dialog';
import { ModoRapidoGrid } from '@/components/financeiro-v2/ModoRapidoGrid';
import { format, parseISO } from 'date-fns';

const MESES_LIST = [
  { value: '01', label: 'Jan' }, { value: '02', label: 'Fev' },
  { value: '03', label: 'Mar' }, { value: '04', label: 'Abr' },
  { value: '05', label: 'Mai' }, { value: '06', label: 'Jun' },
  { value: '07', label: 'Jul' }, { value: '08', label: 'Ago' },
  { value: '09', label: 'Set' }, { value: '10', label: 'Out' },
  { value: '11', label: 'Nov' }, { value: '12', label: 'Dez' },
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

  const defaultFazendaId = fazendaAtual?.id !== '__global__' ? fazendaAtual?.id || '__all__' : '__all__';

  const getDefaults = () => ({
    fazendaId: defaultFazendaId,
    ano: filtroAnoInicial || String(currentYear),
    mesesSelecionados: filtroMesInicial ? [String(filtroMesInicial).padStart(2, '0')] : [] as string[],
    statusTransacao: '__all__',
    tipoOperacao: '__all__',
    contaOrigem: '__all__',
    contaDestino: '__all__',
    macroFiltro: '__all__',
    centroFiltro: '__all__',
    subcentroFiltro: '__all__',
    produtoFiltro: '',
    fornecedorFiltro: '',
    atividadeFiltro: '__all__',
  });

  const defaults = getDefaults();
  const [fazendaId, setFazendaId] = useState(defaults.fazendaId);
  const [ano, setAno] = useState(defaults.ano);
  const [mesesSelecionados, setMesesSelecionados] = useState<string[]>(defaults.mesesSelecionados);
  const [statusTransacao, setStatusTransacao] = useState(defaults.statusTransacao);
  const [tipoOperacao, setTipoOperacao] = useState(defaults.tipoOperacao);
  const [contaOrigem, setContaOrigem] = useState(defaults.contaOrigem);
  const [contaDestino, setContaDestino] = useState(defaults.contaDestino);
  const [macroFiltro, setMacroFiltro] = useState(defaults.macroFiltro);
  const [centroFiltro, setCentroFiltro] = useState(defaults.centroFiltro);
  const [subcentroFiltro, setSubcentroFiltro] = useState(defaults.subcentroFiltro);
  const [produtoFiltro, setProdutoFiltro] = useState(defaults.produtoFiltro);
  const [fornecedorFiltro, setFornecedorFiltro] = useState(defaults.fornecedorFiltro);
  const [atividadeFiltro, setAtividadeFiltro] = useState(defaults.atividadeFiltro);
  const [mesPopoverOpen, setMesPopoverOpen] = useState(false);
  // Track if macro/centro were auto-filled by subcentro
  const [macroLocked, setMacroLocked] = useState(false);

  const [mode, setMode] = useState<'list' | 'rapido'>('list');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingLanc, setEditingLanc] = useState<LancamentoV2 | null>(null);

  const fazOperacionais = useMemo(() => fazendas.filter(f => f.id !== '__global__'), [fazendas]);

  const isEntrada = tipoOperacao === '1-Entradas';
  const isSaida = tipoOperacao === '2-Saídas';
  const isTransf = tipoOperacao === '3-Transferência';

  // Classification helpers
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

  // Subcentro selection: auto-fill macro + centro
  const handleSubcentroChange = (val: string) => {
    setSubcentroFiltro(val);
    if (val !== '__all__') {
      const match = hook.classificacoes.find(c => c.subcentro === val);
      if (match) {
        setMacroFiltro(match.macro_custo || '__all__');
        setCentroFiltro(match.centro_custo || '__all__');
        setMacroLocked(true);
      }
    } else {
      // Clear: unlock macro/centro
      if (macroLocked) {
        setMacroFiltro('__all__');
        setCentroFiltro('__all__');
        setMacroLocked(false);
      }
    }
  };

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
    fazenda_id: fazendaId !== '__all__' ? fazendaId : undefined,
    ano,
    mes: mesesSelecionados.length === 0 ? 'todos' : undefined,
    meses: mesesSelecionados.length > 0 ? mesesSelecionados : undefined,
    conta_bancaria_id: contaOrigem !== '__all__' ? contaOrigem : (contaDestino !== '__all__' ? contaDestino : undefined),
    tipo_operacao: tipoOperacao !== '__all__' ? tipoOperacao : undefined,
    status_transacao: statusTransacao !== '__all__' ? statusTransacao : undefined,
    macro_custo: macroFiltro !== '__all__' ? macroFiltro : undefined,
    centro_custo: centroFiltro !== '__all__' ? centroFiltro : undefined,
    subcentro: subcentroFiltro !== '__all__' ? subcentroFiltro : undefined,
  }), [fazendaId, ano, mesesSelecionados, contaOrigem, contaDestino, tipoOperacao, statusTransacao, macroFiltro, centroFiltro, subcentroFiltro]);

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

  // Derive atividade from subcentro
  const getAtividade = (subcentro: string | null): string => {
    if (!subcentro) return 'outros';
    const s = subcentro.toUpperCase();
    if (s.startsWith('PEC/') || s.startsWith('PEC ')) return 'pecuaria';
    if (s.startsWith('AGRI/') || s.startsWith('AGRI ')) return 'agricultura';
    return 'outros';
  };

  const filteredLancamentos = useMemo(() => {
    let items = hook.lancamentos;
    if (produtoFiltro.trim()) {
      const q = produtoFiltro.toLowerCase();
      items = items.filter(l => l.descricao?.toLowerCase().includes(q));
    }
    if (fornecedorFiltro.trim()) {
      const q = fornecedorFiltro.toLowerCase();
      items = items.filter(l => {
        const nome = hook.fornecedores.find(f => f.id === l.favorecido_id)?.nome || '';
        return nome.toLowerCase().includes(q);
      });
    }
    if (atividadeFiltro !== '__all__') {
      items = items.filter(l => getAtividade(l.subcentro) === atividadeFiltro);
    }
    return items;
  }, [hook.lancamentos, produtoFiltro, fornecedorFiltro, atividadeFiltro, hook.fornecedores]);

  const totalEntradas = filteredLancamentos.filter(l => l.sinal > 0).reduce((s, l) => s + l.valor, 0);
  const totalSaidas = filteredLancamentos.filter(l => l.sinal < 0).reduce((s, l) => s + l.valor, 0);

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

  const handleLimparFiltros = () => {
    const d = getDefaults();
    setAno(d.ano);
    setMesesSelecionados([]);
    setStatusTransacao('__all__');
    setFazendaId(d.fazendaId);
    setTipoOperacao('__all__');
    setContaOrigem('__all__');
    setContaDestino('__all__');
    setMacroFiltro('__all__');
    setCentroFiltro('__all__');
    setSubcentroFiltro('__all__');
    setProdutoFiltro('');
    setFornecedorFiltro('');
    setAtividadeFiltro('__all__');
    setMacroLocked(false);
  };

  // Determine which fazenda_id to pass to loadLancamentos
  const queryFazendaId = fazendaId !== '__all__' ? fazendaId : undefined;

  // Compact select class
  const selCls = "h-6 text-[10px]";
  const itemCls = "text-[10px] py-0.5";
  const lblCls = "text-[9px] text-muted-foreground font-medium leading-none mb-0.5 block";

  return (
    <div className="space-y-1 pb-20">
      {/* FILTERS */}
      <Card>
        <CardContent className="p-1.5 space-y-1">
          {/* LINE 1: Ano | Mês | Status | Fazenda | Atividade */}
          <div className="grid grid-cols-5 gap-1">
            <div>
              <label className={lblCls}>Ano</label>
              <Select value={ano} onValueChange={setAno}>
                <SelectTrigger className={selCls}><SelectValue /></SelectTrigger>
                <SelectContent>{anos.map(a => <SelectItem key={a} value={a} className={itemCls}>{a}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div>
              <label className={lblCls}>Mês</label>
              <Popover open={mesPopoverOpen} onOpenChange={setMesPopoverOpen}>
                <PopoverTrigger asChild>
                  <Button variant="outline" className="w-full h-6 text-[10px] justify-between font-normal px-1.5">
                    {mesLabel}
                    <ChevronsUpDown className="h-2.5 w-2.5 opacity-50" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-44 p-1.5" align="start">
                  <div className="flex justify-between mb-0.5">
                    <button className="text-[9px] text-primary hover:underline" onClick={() => setMesesSelecionados([])}>Todos</button>
                    <button className="text-[9px] text-primary hover:underline" onClick={() => setMesesSelecionados(MESES_LIST.map(m => m.value))}>Marcar todos</button>
                  </div>
                  <div className="grid grid-cols-3 gap-0.5">
                    {MESES_LIST.map(m => (
                      <label key={m.value} className="flex items-center gap-0.5 text-[10px] cursor-pointer hover:bg-muted rounded px-0.5 py-0.5">
                        <Checkbox checked={mesesSelecionados.includes(m.value)} onCheckedChange={() => toggleMes(m.value)} className="h-2.5 w-2.5" />
                        {m.label}
                      </label>
                    ))}
                  </div>
                </PopoverContent>
              </Popover>
            </div>
            <div>
              <label className={lblCls}>Status</label>
              <Select value={statusTransacao} onValueChange={setStatusTransacao}>
                <SelectTrigger className={selCls}><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__all__" className={itemCls}>Todos</SelectItem>
                  <SelectItem value="previsto" className={itemCls}>Previsto</SelectItem>
                  <SelectItem value="agendado" className={itemCls}>Agendado</SelectItem>
                  <SelectItem value="confirmado" className={itemCls}>Confirmado</SelectItem>
                  <SelectItem value="conciliado" className={itemCls}>Conciliado</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className={lblCls}>Fazenda</label>
              <Select value={fazendaId} onValueChange={setFazendaId}>
                <SelectTrigger className={selCls}><SelectValue placeholder="Selecione" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__all__" className={itemCls}>Todas</SelectItem>
                  {fazOperacionais.map(f => <SelectItem key={f.id} value={f.id} className={itemCls}>{f.nome}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className={lblCls}>Atividade</label>
              <Select value={atividadeFiltro} onValueChange={setAtividadeFiltro}>
                <SelectTrigger className={selCls}><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__all__" className={itemCls}>Todos</SelectItem>
                  <SelectItem value="pecuaria" className={itemCls}>Pecuária</SelectItem>
                  <SelectItem value="agricultura" className={itemCls}>Agricultura</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* LINE 2: Tipo | Conta Origem | Conta Destino */}
          <div className="grid grid-cols-3 gap-1">
            <div>
              <label className={lblCls}>Tipo</label>
              <Select value={tipoOperacao} onValueChange={v => { setTipoOperacao(v); setContaOrigem('__all__'); setContaDestino('__all__'); }}>
                <SelectTrigger className={selCls}><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__all__" className={itemCls}>Todos</SelectItem>
                  <SelectItem value="1-Entradas" className={itemCls}>Entradas</SelectItem>
                  <SelectItem value="2-Saídas" className={itemCls}>Saídas</SelectItem>
                  <SelectItem value="3-Transferência" className={itemCls}>Transferências</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className={lblCls}>Conta Origem</label>
              <Select value={contaOrigem} onValueChange={setContaOrigem} disabled={isEntrada}>
                <SelectTrigger className={`${selCls} ${isEntrada ? 'opacity-40' : ''}`}><SelectValue placeholder="Todas" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__all__" className={itemCls}>Todas</SelectItem>
                  {hook.contasBancarias.map(c => <SelectItem key={c.id} value={c.id} className={itemCls}>{c.nome_conta}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className={lblCls}>Conta Destino</label>
              <Select value={contaDestino} onValueChange={setContaDestino} disabled={isSaida}>
                <SelectTrigger className={`${selCls} ${isSaida ? 'opacity-40' : ''}`}><SelectValue placeholder="Todas" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__all__" className={itemCls}>Todas</SelectItem>
                  {hook.contasBancarias.map(c => <SelectItem key={c.id} value={c.id} className={itemCls}>{c.nome_conta}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* LINE 3: Macro | Centro | Subcentro | Produto | Fornecedor */}
          <div className="grid grid-cols-5 gap-1">
            <div>
              <label className={lblCls}>Macro</label>
              <Select value={macroFiltro} onValueChange={v => { setMacroFiltro(v); setCentroFiltro('__all__'); setSubcentroFiltro('__all__'); setMacroLocked(false); }} disabled={macroLocked}>
                <SelectTrigger className={`${selCls} ${macroLocked ? 'opacity-50' : ''}`}><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__all__" className={itemCls}>Todos</SelectItem>
                  {macrosUnicos.map(m => <SelectItem key={m} value={m} className={itemCls}>{m}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className={lblCls}>Centro</label>
              <Select value={centroFiltro} onValueChange={v => { setCentroFiltro(v); setSubcentroFiltro('__all__'); setMacroLocked(false); }} disabled={macroLocked}>
                <SelectTrigger className={`${selCls} ${macroLocked ? 'opacity-50' : ''}`}><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__all__" className={itemCls}>Todos</SelectItem>
                  {centrosUnicos.map(c => <SelectItem key={c} value={c} className={itemCls}>{c}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className={lblCls}>Subcentro</label>
              <Select value={subcentroFiltro} onValueChange={handleSubcentroChange}>
                <SelectTrigger className={selCls}><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__all__" className={itemCls}>Todos</SelectItem>
                  {subcentrosUnicos.map(s => <SelectItem key={s} value={s} className={itemCls}>{s}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className={lblCls}>Produto</label>
              <Input
                value={produtoFiltro}
                onChange={e => setProdutoFiltro(e.target.value)}
                placeholder="Buscar..."
                className="h-6 text-[10px] px-1.5"
              />
            </div>
            <div>
              <label className={lblCls}>Fornecedor</label>
              <Input
                value={fornecedorFiltro}
                onChange={e => setFornecedorFiltro(e.target.value)}
                placeholder="Buscar..."
                className="h-6 text-[10px] px-1.5"
              />
            </div>
          </div>

          {/* Summary + actions */}
          <div className="flex items-center justify-between">
            <div className="flex gap-2 text-[10px]">
              <span className="text-success font-bold">Ent: R$ {fmtBRL(totalEntradas)}</span>
              <span className="text-destructive font-bold">Saí: R$ {fmtBRL(totalSaidas)}</span>
              <span className="text-muted-foreground">{hook.total} lanç.</span>
            </div>
            <div className="flex gap-1">
              <Button size="sm" variant="ghost" onClick={handleLimparFiltros} className="h-6 text-[10px] gap-0.5 px-1.5 text-muted-foreground">
                <FilterX className="h-3 w-3" /> Limpar
              </Button>
              <Button
                size="sm"
                variant={mode === 'rapido' ? 'default' : 'outline'}
                onClick={() => setMode(mode === 'rapido' ? 'list' : 'rapido')}
                className="h-6 text-[10px] gap-0.5 px-2"
              >
                {mode === 'rapido' ? <List className="h-3 w-3" /> : <Zap className="h-3 w-3" />}
                {mode === 'rapido' ? 'Lista' : 'Rápido'}
              </Button>
              {mode === 'list' && (
                <Button size="sm" onClick={openNew} className="h-6 text-[10px] gap-0.5 px-2">
                  <Plus className="h-3 w-3" /> Novo
                </Button>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {(!queryFazendaId && fazendaId !== '__all__') && (
        <div className="text-center text-muted-foreground py-6 text-[10px]">
          Selecione uma fazenda e um ano para carregar os lançamentos.
        </div>
      )}

      {hook.loading && (
        <div className="text-center text-muted-foreground py-4 text-[10px] animate-pulse">Carregando...</div>
      )}

      {mode === 'rapido' && (fazendaId === '__all__' || fazendaId) && (
        <ModoRapidoGrid
          fazendaId={fazendaId !== '__all__' ? fazendaId : fazOperacionais[0]?.id || ''}
          contas={hook.contasBancarias}
          classificacoes={hook.classificacoes}
          onSaveBatch={hook.criarLancamentosEmLote}
          onDone={() => hook.loadLancamentos(filtros, 0)}
        />
      )}

      {mode === 'list' && !hook.loading && ano && (
        <>
          <div className="rounded-lg border overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="h-4">
                  <TableHead className="text-[9px] py-1 px-1 font-semibold">Comp.</TableHead>
                  <TableHead className="text-[9px] py-1 px-1 font-semibold">Pgto</TableHead>
                  <TableHead className="text-[9px] py-1 px-1 font-semibold">Produto</TableHead>
                  <TableHead className="text-[9px] py-1 px-1 font-semibold">Fornecedor</TableHead>
                  <TableHead className="text-[9px] py-1 px-1 font-semibold text-right">Valor</TableHead>
                  <TableHead className="text-[9px] py-1 px-1 font-semibold">NF</TableHead>
                  <TableHead className="text-[9px] py-1 px-1 font-semibold">St</TableHead>
                  <TableHead className="text-[9px] py-1 px-1 font-semibold w-[32px]"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredLancamentos.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={8} className="text-center text-muted-foreground py-4 text-[10px]">
                      Nenhum lançamento encontrado.
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredLancamentos.map(l => {
                    const fornNome = hook.fornecedores.find(f => f.id === l.favorecido_id)?.nome;
                    const statusShort = l.status_transacao ? l.status_transacao.substring(0, 4) : '-';

                    return (
                      <TableRow key={l.id} className="text-[10px] leading-tight italic">
                        <TableCell className="font-mono py-[1px] px-[4px]">{fmtDate(l.data_competencia)}</TableCell>
                        <TableCell className="font-mono py-[1px] px-[4px]">{fmtDate(l.data_pagamento)}</TableCell>
                        <TableCell className="max-w-[140px] truncate py-[1px] px-[4px]" title={l.descricao || ''}>{l.descricao || '-'}</TableCell>
                        <TableCell className="max-w-[100px] truncate py-[1px] px-[4px]" title={fornNome || ''}>
                          {fornNome || (!l.favorecido_id ? '-' : <span className="text-warning">n/c</span>)}
                        </TableCell>
                        <TableCell className={`text-right font-semibold py-[1px] px-[4px] ${l.sinal > 0 ? 'text-success' : 'text-destructive'}`}>
                          {fmtValor(l.valor, l.sinal)}
                        </TableCell>
                        <TableCell className="font-mono py-[1px] px-[4px] text-muted-foreground">{l.nota_fiscal || '-'}</TableCell>
                        <TableCell className="py-[1px] px-[4px] text-muted-foreground">{statusShort}</TableCell>
                        <TableCell className="py-0 px-0">
                          <div className="flex gap-0">
                            <Button variant="ghost" size="icon" className="h-3.5 w-3.5" onClick={() => openEdit(l)}>
                              <Pencil className="h-2 w-2" />
                            </Button>
                            <Button variant="ghost" size="icon" className="h-3.5 w-3.5" onClick={() => handleDuplicate(l)}>
                              <Copy className="h-2 w-2" />
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
              <Button variant="outline" size="sm" className="h-6" disabled={hook.page === 0} onClick={() => handlePageChange(hook.page - 1)}>
                <ChevronLeft className="h-3 w-3" />
              </Button>
              <span className="text-[10px] text-muted-foreground">Pág {hook.page + 1}/{hook.totalPages}</span>
              <Button variant="outline" size="sm" className="h-6" disabled={hook.page >= hook.totalPages - 1} onClick={() => handlePageChange(hook.page + 1)}>
                <ChevronRight className="h-3 w-3" />
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
        defaultFazendaId={fazendaId !== '__all__' ? fazendaId : fazOperacionais[0]?.id || ''}
        onCriarFornecedor={hook.criarFornecedor}
      />
    </div>
  );
}
