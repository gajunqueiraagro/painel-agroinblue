import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Search, Check, ChevronsUpDown, Plus, AlertCircle } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import type { Contrato, ContratoForm } from '@/hooks/useContratos';
import type { ContaBancariaV2, ClassificacaoItem, FornecedorV2 } from '@/hooks/useFinanceiroV2';
import type { Fazenda } from '@/contexts/FazendaContext';

interface Props {
  open: boolean;
  onClose: () => void;
  onSave: (form: ContratoForm, id?: string, atualizarFuturos?: boolean) => Promise<boolean>;
  contrato?: Contrato | null;
  fazendas: Fazenda[];
  contas: ContaBancariaV2[];
  classificacoes: ClassificacaoItem[];
  fornecedores: FornecedorV2[];
  defaultFazendaId?: string;
}

function toBRL(v: number): string {
  return v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function parseBRL(s: string): number {
  const n = parseFloat(s.replace(/\./g, '').replace(',', '.'));
  return isNaN(n) ? 0 : n;
}

export function ContratoDialog({
  open, onClose, onSave, contrato, fazendas, contas, classificacoes, fornecedores, defaultFazendaId,
}: Props) {
  const isEdit = !!contrato;

  const [saving, setSaving] = useState(false);
  const [produto, setProduto] = useState('');
  const [fornecedorId, setFornecedorId] = useState('');
  const [valorDisplay, setValorDisplay] = useState('0,00');
  const [frequencia, setFrequencia] = useState('mensal');
  const [dataInicio, setDataInicio] = useState('');
  const [dataFim, setDataFim] = useState('');
  const [diaPagamento, setDiaPagamento] = useState(1);
  const [formaPgto, setFormaPgto] = useState('');
  const [dadosPagamento, setDadosPagamento] = useState('');
  const [contaBancariaId, setContaBancariaId] = useState('');
  const [subcentro, setSubcentro] = useState('');
  const [centroCusto, setCentroCusto] = useState('');
  const [macroCusto, setMacroCusto] = useState('');
  const [observacao, setObservacao] = useState('');
  const [fazendaId, setFazendaId] = useState('');
  const [status, setStatus] = useState('ativo');

  // Fornecedor popover
  const [fornecedorOpen, setFornecedorOpen] = useState(false);
  const [fornecedorSearch, setFornecedorSearch] = useState('');
  const [fornecedorHighlight, setFornecedorHighlight] = useState(0);
  const fornecedorItemRefs = useRef<(HTMLButtonElement | null)[]>([]);

  // Subcentro popover
  const [subcentroOpen, setSubcentroOpen] = useState(false);
  const [subcentroSearch, setSubcentroSearch] = useState('');
  const [subcentroHighlight, setSubcentroHighlight] = useState(0);
  const subcentroItemRefs = useRef<(HTMLButtonElement | null)[]>([]);

  const classMap = useMemo(() => {
    const m = new Map<string, ClassificacaoItem>();
    for (const c of classificacoes) {
      if (c.subcentro && !m.has(c.subcentro)) m.set(c.subcentro, c);
    }
    return m;
  }, [classificacoes]);

  const filteredSubcentros = useMemo(() => {
    const unique = Array.from(classMap.values()).filter(c => c.tipo_operacao === '2-Saídas');
    if (!subcentroSearch.trim()) return unique;
    const term = subcentroSearch.toLowerCase();
    return unique.filter(c => c.subcentro.toLowerCase().includes(term));
  }, [classMap, subcentroSearch]);

  const fornecedoresList = useMemo(() => fornecedores.filter(f => f.ativo !== false), [fornecedores]);
  const filteredFornecedores = useMemo(() => {
    if (!fornecedorSearch.trim()) return fornecedoresList;
    const q = fornecedorSearch.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
    return fornecedoresList.filter(f => f.nome.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().includes(q));
  }, [fornecedoresList, fornecedorSearch]);

  const selectedFornecedorNome = useMemo(() => {
    if (!fornecedorId) return '';
    return fornecedores.find(f => f.id === fornecedorId)?.nome || '';
  }, [fornecedorId, fornecedores]);

  useEffect(() => {
    if (contrato) {
      setProduto(contrato.produto || '');
      setFornecedorId(contrato.fornecedor_id || '');
      setValorDisplay(toBRL(contrato.valor));
      setFrequencia(contrato.frequencia);
      setDataInicio(contrato.data_inicio);
      setDataFim(contrato.data_fim || '');
      setDiaPagamento(contrato.dia_pagamento);
      setFormaPgto(contrato.forma_pagamento || '');
      setDadosPagamento(contrato.dados_pagamento || '');
      setContaBancariaId(contrato.conta_bancaria_id || '');
      setSubcentro(contrato.subcentro || '');
      setCentroCusto(contrato.centro_custo || '');
      setMacroCusto(contrato.macro_custo || '');
      setObservacao(contrato.observacao || '');
      setFazendaId(contrato.fazenda_id);
      setStatus(contrato.status);
    } else {
      const today = new Date().toISOString().slice(0, 10);
      setProduto('');
      setFornecedorId('');
      setValorDisplay('0,00');
      setFrequencia('mensal');
      setDataInicio(today);
      setDataFim('');
      setDiaPagamento(1);
      setFormaPgto('');
      setDadosPagamento('');
      setContaBancariaId('');
      setSubcentro('');
      setCentroCusto('');
      setMacroCusto('');
      setObservacao('');
      setFazendaId(defaultFazendaId || '');
      setStatus('ativo');
    }
    setFornecedorSearch('');
    setSubcentroSearch('');
  }, [open, contrato, defaultFazendaId]);

  const handleValorChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const digits = e.target.value.replace(/\D/g, '');
    if (!digits) { setValorDisplay('0,00'); return; }
    const num = parseInt(digits, 10) / 100;
    setValorDisplay(num.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
  };

  const handleSubcentroSelect = (value: string) => {
    setSubcentro(value);
    setSubcentroOpen(false);
    setSubcentroSearch('');
    const cls = classMap.get(value);
    if (cls) { setMacroCusto(cls.macro_custo); setCentroCusto(cls.centro_custo); }
  };

  const handleFornecedorSelect = (fId: string) => {
    setFornecedorId(fId);
    setFornecedorOpen(false);
    setFornecedorSearch('');
    const f = fornecedores.find(x => x.id === fId);
    if (f?.tipo_recebimento) {
      setFormaPgto(f.tipo_recebimento);
      const lines: string[] = [];
      if (f.tipo_recebimento === 'PIX' && f.pix_chave) {
        lines.push(`PIX | Tipo: ${f.pix_tipo_chave || '-'}`);
        lines.push(`Chave: ${f.pix_chave}`);
      } else if (f.banco) {
        if (f.banco) lines.push(`Banco: ${f.banco}`);
        if (f.agencia) lines.push(`Agência: ${f.agencia}`);
        if (f.conta) lines.push(`Conta: ${f.conta}`);
      }
      setDadosPagamento(lines.join('\n'));
    }
  };

  const valorNum = parseBRL(valorDisplay);
  const fazOperacionais = fazendas.filter(f => f.id !== '__global__');

  const canSave = !!fazendaId && !!dataInicio && valorNum > 0 && !!produto;

  const handleSubmit = async () => {
    if (!canSave) return;
    setSaving(true);

    const form: ContratoForm = {
      fazenda_id: fazendaId,
      fornecedor_id: fornecedorId || null,
      produto,
      valor: valorNum,
      frequencia,
      data_inicio: dataInicio,
      data_fim: dataFim || null,
      dia_pagamento: diaPagamento,
      forma_pagamento: formaPgto || null,
      dados_pagamento: dadosPagamento || null,
      conta_bancaria_id: contaBancariaId && contaBancariaId !== '__none__' ? contaBancariaId : null,
      subcentro: subcentro || null,
      centro_custo: centroCusto || null,
      macro_custo: macroCusto || null,
      observacao: observacao || null,
      status,
    };

    let atualizarFuturos = false;
    if (isEdit) {
      atualizarFuturos = confirm('Deseja atualizar os lançamentos futuros com base nas alterações?');
    }

    const ok = await onSave(form, contrato?.id, atualizarFuturos);
    setSaving(false);
    if (ok) onClose();
  };

  return (
    <Dialog open={open} onOpenChange={v => { if (!v) onClose(); }}>
      <DialogContent className="max-w-lg max-h-[90vh] flex flex-col p-0 bg-white dark:bg-card rounded-2xl shadow-2xl border-0 overflow-hidden">
        <DialogHeader className="px-5 pt-5 pb-3 border-b border-border/40">
          <DialogTitle className="text-base font-semibold">{isEdit ? 'Editar Contrato' : 'Novo Contrato'}</DialogTitle>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
          {/* Produto */}
          <section>
            <p className="text-[9px] font-bold text-muted-foreground uppercase tracking-widest mb-2">Identificação</p>
            <div className="space-y-3">
              <div>
                <Label className="text-xs">Produto *</Label>
                <Input value={produto} onChange={e => setProduto(e.target.value)} className="h-9 bg-[#f5f6f8] dark:bg-muted border-border/50" placeholder="Ex: Aluguel de pasto, Energia..." />
              </div>

              {/* Fornecedor */}
              <div>
                <Label className="text-xs">Fornecedor</Label>
                <Popover open={fornecedorOpen} onOpenChange={v => { setFornecedorOpen(v); if (!v) setFornecedorSearch(''); }}>
                  <PopoverTrigger asChild>
                    <Button variant="outline" role="combobox" className="w-full h-9 justify-between font-normal text-sm bg-[#f5f6f8] dark:bg-muted border-border/50">
                      <span className="truncate">{selectedFornecedorNome || 'Selecione o fornecedor...'}</span>
                      <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
                    <div className="flex items-center border-b px-3 py-2">
                      <Search className="mr-2 h-4 w-4 shrink-0 opacity-50" />
                      <input className="flex h-7 w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground" placeholder="Buscar fornecedor..." value={fornecedorSearch} onChange={e => setFornecedorSearch(e.target.value)} autoFocus />
                    </div>
                    <div className="max-h-48 overflow-y-auto p-1">
                      {filteredFornecedores.map((f, idx) => (
                        <button key={f.id} ref={el => { fornecedorItemRefs.current[idx] = el; }} className={cn("relative flex w-full cursor-pointer select-none items-center rounded-sm px-2 py-1.5 text-sm outline-none", idx === fornecedorHighlight ? "bg-accent text-accent-foreground" : "hover:bg-accent hover:text-accent-foreground")} onClick={() => handleFornecedorSelect(f.id)} onMouseEnter={() => setFornecedorHighlight(idx)}>
                          <Check className={cn("mr-2 h-4 w-4", fornecedorId === f.id ? "opacity-100" : "opacity-0")} />
                          <span className="truncate">{f.nome}</span>
                        </button>
                      ))}
                      {filteredFornecedores.length === 0 && <p className="p-2 text-center text-sm text-muted-foreground">Nenhum encontrado</p>}
                    </div>
                  </PopoverContent>
                </Popover>
              </div>
            </div>
          </section>

          <hr className="border-border/30" />

          {/* Financeiro */}
          <section>
            <p className="text-[9px] font-bold text-muted-foreground uppercase tracking-widest mb-2">Financeiro</p>
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs">Valor (R$) *</Label>
                  <Input value={valorDisplay} onChange={handleValorChange} onFocus={e => e.target.select()} className="h-9 bg-[#f5f6f8] dark:bg-muted border-border/50" inputMode="numeric" />
                </div>
                <div>
                  <Label className="text-xs">Frequência</Label>
                  <Select value={frequencia} onValueChange={setFrequencia}>
                    <SelectTrigger className="h-9 bg-[#f5f6f8] dark:bg-muted border-border/50"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="mensal">Mensal</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <Label className="text-xs">Início *</Label>
                  <Input type="date" value={dataInicio} onChange={e => setDataInicio(e.target.value)} className="h-9 bg-[#f5f6f8] dark:bg-muted border-border/50" />
                </div>
                <div>
                  <Label className="text-xs">Fim (opc.)</Label>
                  <Input type="date" value={dataFim} onChange={e => setDataFim(e.target.value)} className="h-9 bg-[#f5f6f8] dark:bg-muted border-border/50" />
                </div>
                <div>
                  <Label className="text-xs">Dia Pgto</Label>
                  <Input type="number" min={1} max={31} value={diaPagamento} onChange={e => setDiaPagamento(Math.max(1, Math.min(31, parseInt(e.target.value) || 1)))} className="h-9 bg-[#f5f6f8] dark:bg-muted border-border/50" />
                </div>
              </div>
            </div>
          </section>

          <hr className="border-border/30" />

          {/* Pagamento */}
          <section>
            <p className="text-[9px] font-bold text-muted-foreground uppercase tracking-widest mb-2">Pagamento</p>
            <div className="space-y-3">
              <div>
                <Label className="text-xs">Forma de Pagamento</Label>
                <Select value={formaPgto || '__none__'} onValueChange={v => setFormaPgto(v === '__none__' ? '' : v)}>
                  <SelectTrigger className="h-9 bg-[#f5f6f8] dark:bg-muted border-border/50"><SelectValue placeholder="Selecione" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">Nenhuma</SelectItem>
                    <SelectItem value="PIX">PIX</SelectItem>
                    <SelectItem value="Boleto">Boleto</SelectItem>
                    <SelectItem value="Transferência">Transferência</SelectItem>
                    <SelectItem value="Débito Automático">Débito Automático</SelectItem>
                    <SelectItem value="Outro">Outro</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs">Dados para Pagamento</Label>
                <Textarea value={dadosPagamento} onChange={e => setDadosPagamento(e.target.value)} rows={2} placeholder="Chave PIX, dados bancários..." className="bg-[#f5f6f8] dark:bg-muted border-border/50 text-xs" />
              </div>
              <div>
                <Label className="text-xs">Conta Bancária</Label>
                <Select value={contaBancariaId || '__none__'} onValueChange={v => setContaBancariaId(v === '__none__' ? '' : v)}>
                  <SelectTrigger className="h-9 bg-[#f5f6f8] dark:bg-muted border-border/50"><SelectValue placeholder="Selecione" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">Nenhuma</SelectItem>
                    {contas.map(c => <SelectItem key={c.id} value={c.id}>{c.nome_exibicao || c.nome_conta}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </section>

          <hr className="border-border/30" />

          {/* Classificação */}
          <section>
            <p className="text-[9px] font-bold text-muted-foreground uppercase tracking-widest mb-2">Classificação</p>
            <div className="space-y-2">
              <div>
                <Label className="text-xs">Fazenda *</Label>
                <Select value={fazendaId} onValueChange={setFazendaId}>
                  <SelectTrigger className="h-9 bg-[#f5f6f8] dark:bg-muted border-border/50"><SelectValue placeholder="Selecione" /></SelectTrigger>
                  <SelectContent>
                    {fazOperacionais.map(f => <SelectItem key={f.id} value={f.id}>{f.nome}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs">Subcentro</Label>
                <Popover open={subcentroOpen} onOpenChange={v => { setSubcentroOpen(v); if (!v) { setSubcentroSearch(''); setSubcentroHighlight(0); } }}>
                  <PopoverTrigger asChild>
                    <Button variant="outline" role="combobox" className="w-full h-9 justify-between font-normal text-sm bg-[#f5f6f8] dark:bg-muted border-border/50">
                      <span className="truncate">{subcentro || 'Selecione...'}</span>
                      <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
                    <div className="flex items-center border-b px-3 py-2">
                      <Search className="mr-2 h-4 w-4 shrink-0 opacity-50" />
                      <input className="flex h-7 w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground" placeholder="Buscar subcentro..." value={subcentroSearch} onChange={e => { setSubcentroSearch(e.target.value); setSubcentroHighlight(0); }} autoFocus />
                    </div>
                    <div className="max-h-48 overflow-y-auto p-1">
                      {filteredSubcentros.map((sc, idx) => (
                        <button key={sc.subcentro || idx} ref={el => { subcentroItemRefs.current[idx] = el; }} className={cn("relative flex w-full cursor-pointer select-none items-center rounded-sm px-2 py-1.5 text-sm outline-none", idx === subcentroHighlight ? "bg-accent text-accent-foreground" : "hover:bg-accent/50")} onClick={() => handleSubcentroSelect(sc.subcentro || '')} onMouseEnter={() => setSubcentroHighlight(idx)}>
                          <Check className={cn("mr-2 h-4 w-4", subcentro === sc.subcentro ? "opacity-100" : "opacity-0")} />
                          <span className="truncate">{sc.subcentro}</span>
                        </button>
                      ))}
                      {filteredSubcentros.length === 0 && <p className="p-2 text-center text-sm text-muted-foreground">Nenhum encontrado</p>}
                    </div>
                  </PopoverContent>
                </Popover>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs text-muted-foreground">Macro (auto)</Label>
                  <Input value={macroCusto} readOnly disabled className="h-9 bg-muted/80 border-border/30 text-muted-foreground cursor-default" />
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">Centro (auto)</Label>
                  <Input value={centroCusto} readOnly disabled className="h-9 bg-muted/80 border-border/30 text-muted-foreground cursor-default" />
                </div>
              </div>
            </div>
          </section>

          <hr className="border-border/30" />

          <section>
            <p className="text-[9px] font-bold text-muted-foreground uppercase tracking-widest mb-2">Complemento</p>
            <Textarea value={observacao} onChange={e => setObservacao(e.target.value)} rows={2} placeholder="Observações" className="bg-[#f5f6f8] dark:bg-muted border-border/50" />
          </section>
        </div>

        <div className="px-5 py-3 border-t border-border/40 bg-white dark:bg-card flex items-center gap-2">
          <Button variant="outline" onClick={onClose} className="px-4">Cancelar</Button>
          <Button onClick={handleSubmit} disabled={saving || !canSave} className="flex-1">
            {saving ? 'Salvando...' : isEdit ? 'Salvar Alterações' : 'Criar Contrato'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
