import { useState, useEffect, useMemo, useRef } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Plus, Search, Check, ChevronsUpDown, AlertCircle } from 'lucide-react';
import type { LancamentoV2, LancamentoV2Form, ContaBancariaV2, ClassificacaoItem, FornecedorV2 } from '@/hooks/useFinanceiroV2';
import type { Fazenda } from '@/contexts/FazendaContext';
import { NovoFornecedorDialog } from './NovoFornecedorDialog';
import { cn } from '@/lib/utils';

interface Props {
  open: boolean;
  onClose: () => void;
  onSave: (form: LancamentoV2Form, id?: string) => Promise<boolean>;
  onDelete?: (id: string) => Promise<boolean>;
  lancamento?: LancamentoV2 | null;
  fazendas: Fazenda[];
  contas: ContaBancariaV2[];
  classificacoes: ClassificacaoItem[];
  fornecedores: FornecedorV2[];
  defaultFazendaId?: string;
  onCriarFornecedor: (nome: string, fazendaId: string, cpfCnpj?: string) => Promise<FornecedorV2 | null>;
}

const TIPOS_OPERACAO = [
  { value: '1-Entradas', label: 'Entradas' },
  { value: '2-Saídas', label: 'Saídas' },
  { value: '3-Transferência', label: 'Transferências' },
];

const STATUS_OPTIONS = [
  { value: 'previsto', label: 'Previsto' },
  { value: 'agendado', label: 'Agendado' },
  { value: 'confirmado', label: 'Confirmado' },
  { value: 'conciliado', label: 'Conciliado' },
];

function deriveStatus(dataPagamento: string): string {
  if (!dataPagamento) return 'previsto';
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const d = new Date(dataPagamento + 'T00:00:00');
  if (d > today) return 'agendado';
  return 'confirmado';
}

function formatNotaFiscal(raw: string): string {
  const digits = raw.replace(/\D/g, '').slice(0, 9);
  const padded = digits.padStart(9, '0');
  return `${padded.slice(0, 3)}.${padded.slice(3, 6)}.${padded.slice(6, 9)}`;
}

/** Format number to BRL string with 2 decimals */
function toBRL(v: number): string {
  return v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/** Parse BRL string back to number */
function parseBRL(s: string): number {
  const cleaned = s.replace(/\./g, '').replace(',', '.');
  const n = parseFloat(cleaned);
  return isNaN(n) ? 0 : n;
}

export function LancamentoV2Dialog({
  open, onClose, onSave, onDelete, lancamento, fazendas, contas, classificacoes,
  fornecedores, defaultFazendaId, onCriarFornecedor,
}: Props) {
  const isEdit = !!lancamento;
  const [saving, setSaving] = useState(false);
  const [fornecedorDialogOpen, setFornecedorDialogOpen] = useState(false);

  // Fornecedor search state
  const [fornecedorOpen, setFornecedorOpen] = useState(false);
  const [fornecedorSearch, setFornecedorSearch] = useState('');
  const fornecedorInputRef = useRef<HTMLInputElement>(null);

  // Installment state
  const [formaPagamento, setFormaPagamento] = useState<'avista' | 'parcelada'>('avista');
  const [numParcelas, setNumParcelas] = useState(2);

  const [fazendaId, setFazendaId] = useState('');
  const [dataCompetencia, setDataCompetencia] = useState('');
  const [dataPagamento, setDataPagamento] = useState('');
  const [descricao, setDescricao] = useState('');
  const [favorecidoId, setFavorecidoId] = useState('');
  const [subcentro, setSubcentro] = useState('');
  const [macroCusto, setMacroCusto] = useState('');
  const [centroCusto, setCentroCusto] = useState('');
  const [tipoOperacao, setTipoOperacao] = useState('2-Saídas');
  const [statusTransacao, setStatusTransacao] = useState('previsto');
  const [valorDisplay, setValorDisplay] = useState('0,00');
  const [contaOrigemId, setContaOrigemId] = useState('');
  const [contaDestinoId, setContaDestinoId] = useState('');
  const [notaFiscal, setNotaFiscal] = useState('');
  const [observacao, setObservacao] = useState('');

  // Subcentro search
  const [subcentroOpen, setSubcentroOpen] = useState(false);
  const [subcentroSearch, setSubcentroSearch] = useState('');
  const searchInputRef = useRef<HTMLInputElement>(null);

  const isTransferencia = tipoOperacao === '3-Transferência';
  const isEntrada = tipoOperacao === '1-Entradas';

  /** Build a short friendly label from the raw subcentro name */
  function shortLabel(raw: string): string {
    // Remove long prefix paths, keep last meaningful segment
    const parts = raw.split('/').map(p => p.trim()).filter(Boolean);
    if (parts.length <= 1) return raw;
    // For PEC/ADM/CONTABILIDADE/JURIDICO/CONSULTORIA → ADM / Contab./Jurídico
    // Keep first as scope abbreviation, last as name
    const scope = parts[0]; // PEC, AGRI, etc.
    const name = parts.slice(1).join(' / ');
    // Capitalize nicely
    const formatted = name.split(' / ').map(p =>
      p.charAt(0).toUpperCase() + p.slice(1).toLowerCase()
    ).join(' / ');
    return `${scope} / ${formatted}`;
  }

  const classMap = useMemo(() => {
    const m = new Map<string, ClassificacaoItem>();
    for (const c of classificacoes) {
      if (c.subcentro && !m.has(c.subcentro)) m.set(c.subcentro, c);
    }
    return m;
  }, [classificacoes]);

  /** Subcentros filtered by tipo_operacao then by search text */
  const filteredSubcentros = useMemo(() => {
    const unique = Array.from(classMap.values());
    // 1. Filter by tipo_operacao match
    const byTipo = unique.filter(c => {
      if (!tipoOperacao) return true;
      // Match prefix: '1-Entradas' matches '1-Entradas', '2-Saídas' matches '2-Saídas'
      // For transfers, show transfer-specific subcentros
      return c.tipo_operacao === tipoOperacao;
    });
    // 2. Apply text search
    if (!subcentroSearch.trim()) return byTipo;
    const term = subcentroSearch.toLowerCase();
    return byTipo.filter(c => c.subcentro.toLowerCase().includes(term));
  }, [classMap, subcentroSearch, tipoOperacao]);

  useEffect(() => {
    if (lancamento) {
      setFazendaId(lancamento.fazenda_id);
      setDataCompetencia(lancamento.data_competencia);
      setDataPagamento(lancamento.data_pagamento || '');
      setDescricao(lancamento.descricao || '');
      setFavorecidoId(lancamento.favorecido_id || '');
      setSubcentro(lancamento.subcentro || '');
      setMacroCusto(lancamento.macro_custo || '');
      setCentroCusto(lancamento.centro_custo || '');
      setTipoOperacao(lancamento.tipo_operacao);
      setStatusTransacao(lancamento.status_transacao || 'previsto');
      setValorDisplay(toBRL(lancamento.valor));
      setContaOrigemId(lancamento.conta_bancaria_id || '');
      setContaDestinoId('');
      setNotaFiscal(lancamento.nota_fiscal || '');
      setObservacao(lancamento.observacao || '');
    } else {
      setFazendaId(defaultFazendaId || '');
      setDataCompetencia('');
      setDataPagamento('');
      setDescricao('');
      setFavorecidoId('');
      setSubcentro('');
      setMacroCusto('');
      setCentroCusto('');
      setTipoOperacao('2-Saídas');
      setSubcentro('');
      setMacroCusto('');
      setCentroCusto('');
      setStatusTransacao('previsto');
      setValorDisplay('0,00');
      setContaOrigemId('');
      setContaDestinoId('');
      setNotaFiscal('');
      setObservacao('');
      setFormaPagamento('avista');
      setNumParcelas(2);
    }
    setSubcentroSearch('');
  }, [lancamento, defaultFazendaId]);

  const handleSubcentroSelect = (value: string) => {
    setSubcentro(value);
    setSubcentroOpen(false);
    setSubcentroSearch('');
    const cls = classMap.get(value);
    if (cls) {
      setMacroCusto(cls.macro_custo);
      setCentroCusto(cls.centro_custo);
      // Don't override tipoOperacao — subcentro is already filtered by it
    }
  };

  const handleDataPagamentoChange = (val: string) => {
    setDataPagamento(val);
    if (statusTransacao !== 'conciliado') {
      setStatusTransacao(deriveStatus(val));
    }
  };

  const handleValorChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const digits = e.target.value.replace(/\D/g, '');
    if (!digits) { setValorDisplay('0,00'); return; }
    const num = parseInt(digits, 10) / 100;
    setValorDisplay(num.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
  };

  const handleNotaFiscalChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    // Extract only digits from whatever was typed/pasted
    const digits = e.target.value.replace(/\D/g, '').slice(0, 9);
    setNotaFiscal(digits);
  };

  const notaFiscalDisplay = notaFiscal ? formatNotaFiscal(notaFiscal) : '';

  // Contas are GLOBAL (not per-fazenda) — show all active client accounts
  const contasDisponiveis = contas;

  const fornecedoresList = useMemo(() =>
    fornecedores.filter(f => f.ativo !== false && (f.fazenda_id === fazendaId || !f.fazenda_id)),
  [fornecedores, fazendaId]);

  /** Normalize text for accent-insensitive search */
  function normalizeSearch(s: string): string {
    return s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  }

  const filteredFornecedores = useMemo(() => {
    if (!fornecedorSearch.trim()) return fornecedoresList;
    const q = normalizeSearch(fornecedorSearch);
    return fornecedoresList.filter(f => normalizeSearch(f.nome).includes(q));
  }, [fornecedoresList, fornecedorSearch]);

  const selectedFornecedorNome = useMemo(() => {
    if (!favorecidoId) return '';
    return fornecedores.find(f => f.id === favorecidoId)?.nome || '';
  }, [favorecidoId, fornecedores]);

  const fazOperacionais = fazendas.filter(f => f.id !== '__global__');

  // Validation
  const valorNum = parseBRL(valorDisplay);
  const contaOrigemValid = isTransferencia || !isEntrada ? !!contaOrigemId && contaOrigemId !== '__none__' : true;
  const contaDestinoValid = isTransferencia || isEntrada ? !!contaDestinoId && contaDestinoId !== '__none__' : true;
  const contaSimpleValid = !isTransferencia
    ? (isEntrada ? contaDestinoValid : contaOrigemValid)
    : (contaOrigemValid && contaDestinoValid);

  const parceladaValid = formaPagamento === 'avista' || (numParcelas >= 2 && numParcelas <= 24);
  const canSave = !!fazendaId && !!dataCompetencia && !!dataPagamento && !!descricao && !!favorecidoId && favorecidoId !== '__none_forn__'
    && !!subcentro && !!tipoOperacao && !!statusTransacao && valorNum > 0
    && contaSimpleValid && parceladaValid;

  /** Add N days to a date string (YYYY-MM-DD) */
  function addDays(dateStr: string, days: number): string {
    const d = new Date(dateStr + 'T00:00:00');
    d.setDate(d.getDate() + days);
    return d.toISOString().slice(0, 10);
  }

  const handleSubmit = async () => {
    if (!canSave) return;
    setSaving(true);

    let contaBancariaId: string | null = null;
    if (isTransferencia) {
      contaBancariaId = contaOrigemId && contaOrigemId !== '__none__' ? contaOrigemId : null;
    } else if (isEntrada) {
      contaBancariaId = contaDestinoId && contaDestinoId !== '__none__' ? contaDestinoId : null;
    } else {
      contaBancariaId = contaOrigemId && contaOrigemId !== '__none__' ? contaOrigemId : null;
    }

    // --- Installment logic (only for new, not edit) ---
    if (!isEdit && formaPagamento === 'parcelada' && numParcelas >= 2) {
      const totalVal = Math.abs(valorNum);
      const baseVal = Math.floor((totalVal / numParcelas) * 100) / 100;
      const lastVal = Math.round((totalVal - baseVal * (numParcelas - 1)) * 100) / 100;

      let allOk = true;
      for (let i = 0; i < numParcelas; i++) {
        const parcelaNum = i + 1;
        const parcelaVal = parcelaNum === numParcelas ? lastVal : baseVal;
        const parcelaPgto = addDays(dataPagamento, i * 30);
        const parcelaDesc = `${descricao} - Parcela ${parcelaNum}/${numParcelas}`;

        const form: LancamentoV2Form = {
          fazenda_id: fazendaId,
          conta_bancaria_id: contaBancariaId,
          data_competencia: dataCompetencia,
          data_pagamento: parcelaPgto,
          valor: parcelaVal,
          tipo_operacao: tipoOperacao,
          status_transacao: 'confirmado',
          descricao: parcelaDesc,
          macro_custo: macroCusto,
          centro_custo: centroCusto,
          subcentro,
          observacao,
          nota_fiscal: notaFiscal || null,
          favorecido_id: favorecidoId && favorecidoId !== '__none_forn__' ? favorecidoId : null,
        };

        const ok = await onSave(form);
        if (!ok) { allOk = false; break; }
      }

      setSaving(false);
      if (allOk) onClose();
      return;
    }

    // --- Single (à vista) ---
    const form: LancamentoV2Form = {
      fazenda_id: fazendaId,
      conta_bancaria_id: contaBancariaId,
      data_competencia: dataCompetencia,
      data_pagamento: dataPagamento || null,
      valor: Math.abs(valorNum),
      tipo_operacao: tipoOperacao,
      status_transacao: statusTransacao,
      descricao,
      macro_custo: macroCusto,
      centro_custo: centroCusto,
      subcentro,
      observacao,
      nota_fiscal: notaFiscal || null,
      favorecido_id: favorecidoId && favorecidoId !== '__none_forn__' ? favorecidoId : null,
    };

    const ok = await onSave(form, lancamento?.id);
    setSaving(false);
    if (ok) onClose();
  };

  const handleFornecedorCriado = (f: FornecedorV2) => {
    setFavorecidoId(f.id);
    setFornecedorDialogOpen(false);
  };

  return (
    <>
      <Dialog open={open} onOpenChange={v => { if (!v) onClose(); }}>
        <DialogContent className="max-w-lg max-h-[90vh] flex flex-col p-0 bg-white dark:bg-card rounded-2xl shadow-2xl border-0 overflow-hidden">
          {/* Header */}
          <DialogHeader className="px-5 pt-5 pb-3 border-b border-border/40">
            <DialogTitle className="text-base font-semibold">{isEdit ? 'Editar Lançamento' : 'Novo Lançamento'}</DialogTitle>
          </DialogHeader>

          {/* Scrollable body */}
          <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">

            {/* ── DATAS ── */}
            <section>
              <p className="text-[9px] font-bold text-muted-foreground uppercase tracking-widest mb-2">Datas</p>
              {isEdit && lancamento?.status_transacao && (() => {
                const stKey = lancamento.status_transacao.toLowerCase();
                const stLabel = STATUS_OPTIONS.find(s => s.value === stKey)?.label || lancamento.status_transacao;
                const colorMap: Record<string, string> = {
                  previsto: 'text-orange-500',
                  agendado: 'text-emerald-400',
                  confirmado: 'text-sky-500',
                  conciliado: 'text-green-700 dark:text-green-400',
                };
                return (
                  <p className={`text-center text-sm font-bold mb-2 ${colorMap[stKey] || 'text-muted-foreground'}`}>
                    {stLabel}
                  </p>
                );
              })()}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs">Data Competência *</Label>
                  <Input type="date" value={dataCompetencia} onChange={e => setDataCompetencia(e.target.value)} className="h-9 bg-[#f5f6f8] dark:bg-muted border-border/50" />
                </div>
                <div>
                  <Label className="text-xs">Data Pagamento *</Label>
                  <Input type="date" value={dataPagamento} onChange={e => handleDataPagamentoChange(e.target.value)} className="h-9 bg-[#f5f6f8] dark:bg-muted border-border/50" />
                </div>
              </div>
            </section>

            <hr className="border-border/30" />

            {/* ── IDENTIFICAÇÃO ── */}
            <section>
              <p className="text-[9px] font-bold text-muted-foreground uppercase tracking-widest mb-2">Identificação</p>
              <div className="space-y-3">
                <div>
                  <Label className="text-xs">Produto *</Label>
                  <Input value={descricao} onChange={e => setDescricao(e.target.value)} className="h-9 bg-[#f5f6f8] dark:bg-muted border-border/50" placeholder="Descrição do produto" />
                </div>
                <div>
                  <Label className="text-xs">Fornecedor *</Label>
                  <div className="flex gap-1.5">
                    <Popover open={fornecedorOpen} onOpenChange={v => { setFornecedorOpen(v); if (!v) setFornecedorSearch(''); }}>
                      <PopoverTrigger asChild>
                        <Button variant="outline" role="combobox" aria-expanded={fornecedorOpen} className="flex-1 h-9 justify-between font-normal text-sm bg-[#f5f6f8] dark:bg-muted border-border/50">
                          <span className="truncate">{selectedFornecedorNome || 'Selecione o fornecedor...'}</span>
                          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
                        <div className="flex items-center border-b px-3 py-2">
                          <Search className="mr-2 h-4 w-4 shrink-0 opacity-50" />
                          <input ref={fornecedorInputRef} className="flex h-7 w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground" placeholder="Buscar fornecedor..." value={fornecedorSearch} onChange={e => setFornecedorSearch(e.target.value)} autoFocus />
                        </div>
                        <div className="max-h-48 overflow-y-auto p-1">
                          {filteredFornecedores.length === 0 && (
                            <div className="p-2 text-center space-y-1">
                              <div className="flex items-center justify-center gap-1 text-sm text-muted-foreground">
                                <AlertCircle className="h-3.5 w-3.5" />
                                <span>Fornecedor não encontrado na base</span>
                              </div>
                              <Button size="sm" variant="outline" className="text-xs h-7" onClick={() => { setFornecedorOpen(false); setFornecedorDialogOpen(true); }}>
                                <Plus className="h-3 w-3 mr-1" />Cadastrar novo
                              </Button>
                            </div>
                          )}
                          {filteredFornecedores.map(f => (
                            <button key={f.id} className={cn("relative flex w-full cursor-pointer select-none items-center rounded-sm px-2 py-1.5 text-sm outline-none hover:bg-accent hover:text-accent-foreground", favorecidoId === f.id && "bg-accent")} onClick={() => { setFavorecidoId(f.id); setFornecedorOpen(false); setFornecedorSearch(''); }}>
                              <Check className={cn("mr-2 h-4 w-4", favorecidoId === f.id ? "opacity-100" : "opacity-0")} />
                              <span className="truncate">{f.nome}</span>
                            </button>
                          ))}
                        </div>
                      </PopoverContent>
                    </Popover>
                    <Button type="button" variant="outline" size="icon" className="h-9 w-9 shrink-0" onClick={() => setFornecedorDialogOpen(true)} title="Novo fornecedor">
                      <Plus className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </div>
            </section>

            <hr className="border-border/30" />

            {/* ── FINANCEIRO ── */}
            <section>
              <p className="text-[9px] font-bold text-muted-foreground uppercase tracking-widest mb-2">Financeiro</p>
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label className="text-xs">Valor (R$) *</Label>
                    <Input value={valorDisplay} onChange={handleValorChange} onFocus={e => e.target.select()} className="h-9 bg-[#f5f6f8] dark:bg-muted border-border/50" placeholder="0,00" inputMode="numeric" />
                  </div>
                  <div>
                    <Label className="text-xs">Status *</Label>
                    <Select value={statusTransacao} onValueChange={setStatusTransacao}>
                      <SelectTrigger className="h-9 bg-[#f5f6f8] dark:bg-muted border-border/50"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {STATUS_OPTIONS.map(s => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                {/* Forma de Pagamento — only for new */}
                {!isEdit && (
                  <div className="space-y-2">
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <Label className="text-xs">Forma de Pagamento</Label>
                        <Select value={formaPagamento} onValueChange={(v: 'avista' | 'parcelada') => setFormaPagamento(v)}>
                          <SelectTrigger className="h-9 bg-[#f5f6f8] dark:bg-muted border-border/50"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="avista">À vista</SelectItem>
                            <SelectItem value="parcelada">Parcelada</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      {formaPagamento === 'parcelada' && (
                        <div>
                          <Label className="text-xs">Nº de Parcelas *</Label>
                          <Input
                            type="number"
                            min={2}
                            max={24}
                            value={numParcelas}
                            onChange={e => setNumParcelas(Math.max(2, Math.min(24, parseInt(e.target.value) || 2)))}
                            className="h-9 bg-[#f5f6f8] dark:bg-muted border-border/50"
                          />
                        </div>
                      )}
                    </div>
                    {formaPagamento === 'parcelada' && valorNum > 0 && (
                      <div className="rounded-md bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 p-2.5 text-xs text-blue-700 dark:text-blue-300 space-y-1">
                        <p className="font-semibold">Resumo do parcelamento:</p>
                        <p>{numParcelas}x de R$ {toBRL(Math.floor((Math.abs(valorNum) / numParcelas) * 100) / 100)}</p>
                        {Math.round((Math.abs(valorNum) - Math.floor((Math.abs(valorNum) / numParcelas) * 100) / 100 * (numParcelas - 1)) * 100) / 100 !== Math.floor((Math.abs(valorNum) / numParcelas) * 100) / 100 && (
                          <p className="text-[10px] opacity-75">Última parcela ajustada: R$ {toBRL(Math.round((Math.abs(valorNum) - Math.floor((Math.abs(valorNum) / numParcelas) * 100) / 100 * (numParcelas - 1)) * 100) / 100)}</p>
                        )}
                        <p className="text-[10px] opacity-75">Intervalo: 30 dias entre parcelas • Status: Confirmado</p>
                      </div>
                    )}
                  </div>
                )}

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label className="text-xs">Fazenda *</Label>
                    <Select value={fazendaId} onValueChange={v => { setFazendaId(v); setContaOrigemId(''); setContaDestinoId(''); }}>
                      <SelectTrigger className="h-9 bg-[#f5f6f8] dark:bg-muted border-border/50"><SelectValue placeholder="Selecione" /></SelectTrigger>
                      <SelectContent>
                        {fazOperacionais.map(f => <SelectItem key={f.id} value={f.id}>{f.nome}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label className="text-xs">Nota Fiscal</Label>
                    <Input value={notaFiscalDisplay} onChange={handleNotaFiscalChange} inputMode="numeric" className="h-9 font-mono bg-[#f5f6f8] dark:bg-muted border-border/50" placeholder="000.000.000" />
                  </div>
                </div>
              </div>
            </section>

            <hr className="border-border/30" />

            {/* ── CONTA BANCÁRIA ── */}
            <section>
              <p className="text-[9px] font-bold text-muted-foreground uppercase tracking-widest mb-2">Conta Bancária</p>
              <div className="space-y-2">
                <div>
                  <Label className="text-xs">Tipo Operação *</Label>
                  <Select value={tipoOperacao} onValueChange={v => { setTipoOperacao(v); setContaOrigemId(''); setContaDestinoId(''); setSubcentro(''); setMacroCusto(''); setCentroCusto(''); setSubcentroSearch(''); }}>
                    <SelectTrigger className="h-9 bg-[#f5f6f8] dark:bg-muted border-border/50"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {TIPOS_OPERACAO.map(t => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                {isTransferencia ? (
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <Label className="text-xs">Conta Origem</Label>
                      <Select value={contaOrigemId} onValueChange={setContaOrigemId}>
                        <SelectTrigger className="h-9 bg-[#f5f6f8] dark:bg-muted border-border/50"><SelectValue placeholder="Selecione" /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="__none__">Nenhuma</SelectItem>
                          {contas.map(c => <SelectItem key={c.id} value={c.id}>{c.nome_exibicao || c.nome_conta}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label className="text-xs">Conta Destino</Label>
                      <Select value={contaDestinoId} onValueChange={setContaDestinoId}>
                        <SelectTrigger className="h-9 bg-[#f5f6f8] dark:bg-muted border-border/50"><SelectValue placeholder="Selecione" /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="__none__">Nenhuma</SelectItem>
                          {contas.map(c => <SelectItem key={c.id} value={c.id}>{c.nome_exibicao || c.nome_conta}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                ) : isEntrada ? (
                  <div>
                    <Label className="text-xs">Conta Destino</Label>
                    <Select value={contaDestinoId} onValueChange={setContaDestinoId}>
                      <SelectTrigger className="h-9 bg-[#f5f6f8] dark:bg-muted border-border/50"><SelectValue placeholder="Selecione" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__none__">Nenhuma</SelectItem>
                        {contas.map(c => <SelectItem key={c.id} value={c.id}>{c.nome_exibicao || c.nome_conta}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                ) : (
                  <div>
                    <Label className="text-xs">Conta Origem</Label>
                    <Select value={contaOrigemId} onValueChange={setContaOrigemId}>
                      <SelectTrigger className="h-9 bg-[#f5f6f8] dark:bg-muted border-border/50"><SelectValue placeholder="Selecione" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__none__">Nenhuma</SelectItem>
                        {contas.map(c => <SelectItem key={c.id} value={c.id}>{c.nome_exibicao || c.nome_conta}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                )}
              </div>
            </section>

            <hr className="border-border/30" />

            {/* ── CLASSIFICAÇÃO ── */}
            <section>
              <p className="text-[9px] font-bold text-muted-foreground uppercase tracking-widest mb-2">Classificação</p>
              <div className="space-y-2">
                <div>
                  <Label className="text-xs">Subcentro *</Label>
                  <Popover open={subcentroOpen} onOpenChange={v => { setSubcentroOpen(v); if (!v) setSubcentroSearch(''); }}>
                    <PopoverTrigger asChild>
                      <Button variant="outline" role="combobox" aria-expanded={subcentroOpen} className="w-full h-9 justify-between font-normal text-sm bg-[#f5f6f8] dark:bg-muted border-border/50">
                        <span className="truncate">{subcentro || 'Selecione o subcentro...'}</span>
                        <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
                      <div className="flex items-center border-b px-3 py-2">
                        <Search className="mr-2 h-4 w-4 shrink-0 opacity-50" />
                        <input ref={searchInputRef} className="flex h-7 w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground" placeholder="Buscar subcentro..." value={subcentroSearch} onChange={e => setSubcentroSearch(e.target.value)} autoFocus />
                      </div>
                      <div className="max-h-48 overflow-y-auto p-1">
                        {filteredSubcentros.length === 0 && <p className="p-2 text-center text-sm text-muted-foreground">Nenhum subcentro encontrado</p>}
                        {filteredSubcentros.map((sc, idx) => (
                          <button key={sc.subcentro || idx} className={cn("relative flex w-full cursor-pointer select-none items-center rounded-sm px-2 py-1.5 text-sm outline-none hover:bg-accent hover:text-accent-foreground", subcentro === sc.subcentro && "bg-accent")} onClick={() => { setSubcentro(sc.subcentro || ''); setMacroCusto(sc.macro_custo || ''); setCentroCusto(sc.centro_custo || ''); setSubcentroOpen(false); setSubcentroSearch(''); }}>
                            <Check className={cn("mr-2 h-4 w-4", subcentro === sc.subcentro ? "opacity-100" : "opacity-0")} />
                            <span className="truncate">{sc.subcentro}</span>
                          </button>
                        ))}
                      </div>
                    </PopoverContent>
                  </Popover>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label className="text-xs text-muted-foreground">Macro Custo (auto)</Label>
                    <Input value={macroCusto} readOnly disabled className="h-9 bg-muted/80 dark:bg-muted border-border/30 text-muted-foreground cursor-default" />
                  </div>
                  <div>
                    <Label className="text-xs text-muted-foreground">Centro Custo (auto)</Label>
                    <Input value={centroCusto} readOnly disabled className="h-9 bg-muted/80 dark:bg-muted border-border/30 text-muted-foreground cursor-default" />
                  </div>
                </div>
              </div>
            </section>

            <hr className="border-border/30" />

            {/* ── COMPLEMENTO ── */}
            <section>
              <p className="text-[9px] font-bold text-muted-foreground uppercase tracking-widest mb-2">Complemento</p>
              <div>
                <Label className="text-xs">Observação</Label>
                <Textarea value={observacao} onChange={e => setObservacao(e.target.value)} rows={2} placeholder="Observações adicionais" className="bg-[#f5f6f8] dark:bg-muted border-border/50" />
              </div>
            </section>
          </div>

          {/* Sticky footer */}
          <div className="px-5 py-3 border-t border-border/40 bg-white dark:bg-card flex items-center gap-2">
            <Button variant="outline" onClick={onClose} className="px-4">Cancelar</Button>
            <Button onClick={handleSubmit} disabled={saving || !canSave} className="flex-1">
              {saving ? 'Salvando...' : isEdit ? 'Salvar Alterações' : 'Criar Lançamento'}
            </Button>
            {isEdit && onDelete && (
              <Button
                variant="destructive"
                onClick={async () => {
                  if (!confirm('Tem certeza que deseja excluir este lançamento?')) return;
                  const ok = await onDelete(lancamento!.id);
                  if (ok) onClose();
                }}
                className="px-4"
              >
                Excluir
              </Button>
            )}
          </div>
        </DialogContent>
      </Dialog>

      <NovoFornecedorDialog
        open={fornecedorDialogOpen}
        onClose={() => setFornecedorDialogOpen(false)}
        onSave={async (nome, cpfCnpj) => {
          if (!fazendaId) return;
          const f = await onCriarFornecedor(nome, fazendaId, cpfCnpj);
          if (f) handleFornecedorCriado(f);
        }}
      />
    </>
  );
}
