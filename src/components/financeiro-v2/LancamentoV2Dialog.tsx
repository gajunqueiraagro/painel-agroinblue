import { useState, useEffect, useMemo, useRef } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Plus, Search, Check, ChevronsUpDown } from 'lucide-react';
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

  const handleValorBlur = () => {
    const num = parseBRL(valorDisplay);
    setValorDisplay(toBRL(num));
  };

  const handleNotaFiscalChange = (raw: string) => {
    const digits = raw.replace(/\D/g, '');
    if (digits.length <= 9) setNotaFiscal(digits);
  };

  const notaFiscalDisplay = notaFiscal ? formatNotaFiscal(notaFiscal) : '';

  // Contas are GLOBAL (not per-fazenda) — show all active client accounts
  const contasDisponiveis = contas;

  const fornecedoresList = useMemo(() =>
    fornecedores.filter(f => f.fazenda_id === fazendaId || !f.fazenda_id),
  [fornecedores, fazendaId]);

  const fazOperacionais = fazendas.filter(f => f.id !== '__global__');

  // Validation
  const valorNum = parseBRL(valorDisplay);
  const contaOrigemValid = isTransferencia || !isEntrada ? !!contaOrigemId && contaOrigemId !== '__none__' : true;
  const contaDestinoValid = isTransferencia || isEntrada ? !!contaDestinoId && contaDestinoId !== '__none__' : true;
  const contaSimpleValid = !isTransferencia
    ? (isEntrada ? contaDestinoValid : contaOrigemValid)
    : (contaOrigemValid && contaDestinoValid);

  const canSave = !!fazendaId && !!dataCompetencia && !!descricao && !!favorecidoId && favorecidoId !== '__none_forn__'
    && !!subcentro && !!tipoOperacao && !!statusTransacao && valorNum > 0
    && contaSimpleValid;

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
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-base">{isEdit ? 'Editar Lançamento' : 'Novo Lançamento'}</DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            {/* Fazenda */}
            <div>
              <Label className="text-xs font-semibold">Fazenda *</Label>
              <Select value={fazendaId} onValueChange={v => { setFazendaId(v); setContaOrigemId(''); setContaDestinoId(''); }}>
                <SelectTrigger className="h-9"><SelectValue placeholder="Selecione" /></SelectTrigger>
                <SelectContent>
                  {fazOperacionais.map(f => (
                    <SelectItem key={f.id} value={f.id}>{f.nome}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* BLOCO 1 — Datas */}
            <div>
              <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-1.5">Datas</p>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs">Data Competência *</Label>
                  <Input type="date" value={dataCompetencia} onChange={e => setDataCompetencia(e.target.value)} className="h-9" />
                </div>
                <div>
                  <Label className="text-xs">Data Pagamento</Label>
                  <Input type="date" value={dataPagamento} onChange={e => handleDataPagamentoChange(e.target.value)} className="h-9" />
                </div>
              </div>
            </div>

            {/* BLOCO 2 — Identificação */}
            <div>
              <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-1.5">Identificação</p>
              <div className="space-y-2">
                <div>
                  <Label className="text-xs">Produto *</Label>
                  <Input value={descricao} onChange={e => setDescricao(e.target.value)} className="h-9" placeholder="Descrição do produto" />
                </div>
                <div>
                  <Label className="text-xs">Fornecedor *</Label>
                  <div className="flex gap-1.5">
                    <Select value={favorecidoId || '__none_forn__'} onValueChange={v => setFavorecidoId(v === '__none_forn__' ? '' : v)}>
                      <SelectTrigger className="h-9 flex-1"><SelectValue placeholder="Selecione o fornecedor" /></SelectTrigger>
                      <SelectContent className="max-h-60">
                        <SelectItem value="__none_forn__">Selecione...</SelectItem>
                        {fornecedoresList.map(f => (
                          <SelectItem key={f.id} value={f.id}>{f.nome}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Button type="button" variant="outline" size="icon" className="h-9 w-9 shrink-0" onClick={() => setFornecedorDialogOpen(true)} title="Novo fornecedor">
                      <Plus className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </div>
            </div>

            {/* BLOCO 3 — Financeiro básico */}
            <div>
              <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-1.5">Financeiro</p>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs">Valor (R$) *</Label>
                  <Input
                    value={valorDisplay}
                    onChange={e => setValorDisplay(e.target.value)}
                    onBlur={handleValorBlur}
                    onFocus={e => e.target.select()}
                    className="h-9"
                    placeholder="0,00"
                    inputMode="decimal"
                  />
                </div>
                <div>
                  <Label className="text-xs">Status *</Label>
                  <Select value={statusTransacao} onValueChange={setStatusTransacao}>
                    <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {STATUS_OPTIONS.map(s => (
                        <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>

            {/* BLOCO 4 — Conta bancária */}
            <div>
              <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-1.5">Conta Bancária</p>
              <div className="space-y-2">
                <div>
                  <Label className="text-xs">Tipo Operação *</Label>
                  <Select value={tipoOperacao} onValueChange={v => { setTipoOperacao(v); setContaOrigemId(''); setContaDestinoId(''); setSubcentro(''); setMacroCusto(''); setCentroCusto(''); setSubcentroSearch(''); }}>
                    <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {TIPOS_OPERACAO.map(t => (
                        <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {(!isEntrada || isTransferencia) && (
                  <div>
                    <Label className="text-xs">Conta de Origem *</Label>
                    <Select value={contaOrigemId || '__none__'} onValueChange={setContaOrigemId}>
                      <SelectTrigger className="h-9"><SelectValue placeholder="Selecione" /></SelectTrigger>
                      <SelectContent className="max-h-60">
                        <SelectItem value="__none__">Selecione...</SelectItem>
                        {contasDisponiveis.map(c => (
                          <SelectItem key={c.id} value={c.id}>{c.nome_conta}{c.banco ? ` (${c.banco})` : ''}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}

                {(isEntrada || isTransferencia) && (
                  <div>
                    <Label className="text-xs">Conta de Destino *</Label>
                    <Select value={contaDestinoId || '__none__'} onValueChange={setContaDestinoId}>
                      <SelectTrigger className="h-9"><SelectValue placeholder="Selecione" /></SelectTrigger>
                      <SelectContent className="max-h-60">
                        <SelectItem value="__none__">Selecione...</SelectItem>
                        {contasDisponiveis.map(c => (
                          <SelectItem key={c.id} value={c.id}>{c.nome_conta}{c.banco ? ` (${c.banco})` : ''}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}

                {/* DEBUG contas */}
                <div className="p-1.5 bg-yellow-50 border border-yellow-200 rounded text-[10px] text-yellow-800">
                  <strong>🔍 DEBUG Contas:</strong> {contasDisponiveis.length} carregada(s) (total: {contas.length})
                  {contasDisponiveis.length > 0 && (
                    <span> · {contasDisponiveis.map(c => c.nome_conta).join(' | ')}</span>
                  )}
                  {contasDisponiveis.length === 0 && (
                    <span className="text-red-600"> · NENHUMA CONTA p/ fazenda {fazendaId || '(nenhuma)'}</span>
                  )}
                </div>
              </div>
            </div>

            {/* BLOCO 5 — Classificação */}
            <div>
              <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-1.5">Classificação</p>
              <div className="space-y-2">
                <div>
                  <Label className="text-xs">Subcentro *</Label>
                  <Popover open={subcentroOpen} onOpenChange={setSubcentroOpen}>
                    <PopoverTrigger asChild>
                      <Button
                        variant="outline"
                        role="combobox"
                        aria-expanded={subcentroOpen}
                        className="w-full h-9 justify-between font-normal text-sm"
                      >
                        {subcentro ? shortLabel(subcentro) : 'Selecione o subcentro...'}
                        <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
                      <div className="flex items-center border-b px-3 py-2">
                        <Search className="mr-2 h-4 w-4 shrink-0 opacity-50" />
                        <input
                          ref={searchInputRef}
                          className="flex h-7 w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground"
                          placeholder="Buscar subcentro..."
                          value={subcentroSearch}
                          onChange={e => setSubcentroSearch(e.target.value)}
                          autoFocus
                        />
                      </div>
                      <div className="max-h-48 overflow-y-auto p-1">
                        {filteredSubcentros.length === 0 && (
                          <p className="text-sm text-muted-foreground p-2 text-center">Nenhum resultado</p>
                        )}
                        {filteredSubcentros.map((c, i) => (
                          <button
                            key={`${c.subcentro}-${i}`}
                            className={cn(
                              "relative flex w-full cursor-pointer select-none items-center rounded-sm px-2 py-1.5 text-sm outline-none hover:bg-accent hover:text-accent-foreground",
                              subcentro === c.subcentro && "bg-accent"
                            )}
                            onClick={() => handleSubcentroSelect(c.subcentro)}
                          >
                            <Check className={cn("mr-2 h-4 w-4", subcentro === c.subcentro ? "opacity-100" : "opacity-0")} />
                            <span className="truncate">{shortLabel(c.subcentro)}</span>
                          </button>
                        ))}
                      </div>
                    </PopoverContent>
                  </Popover>
                  {/* DEBUG subcentro */}
                  <div className="mt-1 p-1.5 bg-yellow-50 border border-yellow-200 rounded text-[10px] text-yellow-800">
                    <strong>🔍 DEBUG Subcentro:</strong> {classMap.size} total | {filteredSubcentros.length} p/ tipo "{tipoOperacao}"
                    {filteredSubcentros.length > 0 && (
                      <span> · {filteredSubcentros.slice(0, 3).map(c => shortLabel(c.subcentro)).join(' | ')}</span>
                    )}
                    {filteredSubcentros.length === 0 && (
                      <span className="text-red-600"> · NENHUM p/ este tipo</span>
                    )}
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label className="text-xs text-muted-foreground">Macro Custo (auto)</Label>
                    <Input value={macroCusto} readOnly disabled className="h-9 bg-muted/50" />
                  </div>
                  <div>
                    <Label className="text-xs text-muted-foreground">Centro Custo (auto)</Label>
                    <Input value={centroCusto} readOnly disabled className="h-9 bg-muted/50" />
                  </div>
                </div>
              </div>
            </div>

            {/* BLOCO 6 — Documento */}
            <div>
              <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-1.5">Documento</p>
              <div>
                <Label className="text-xs">Nota Fiscal</Label>
                <Input
                  value={notaFiscalDisplay}
                  onChange={e => handleNotaFiscalChange(e.target.value)}
                  className="h-9 font-mono"
                  placeholder="000.000.000"
                  maxLength={11}
                />
              </div>
            </div>

            {/* BLOCO 7 — Complemento */}
            <div>
              <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-1.5">Complemento</p>
              <div>
                <Label className="text-xs">Observação</Label>
                <Textarea value={observacao} onChange={e => setObservacao(e.target.value)} rows={2} placeholder="Observações adicionais" />
              </div>
            </div>

            <div className="flex gap-2">
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
