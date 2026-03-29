import { useState, useEffect, useMemo } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Plus } from 'lucide-react';
import type { LancamentoV2, LancamentoV2Form, ContaBancariaV2, ClassificacaoItem, FornecedorV2 } from '@/hooks/useFinanceiroV2';
import type { Fazenda } from '@/contexts/FazendaContext';
import { NovoFornecedorDialog } from './NovoFornecedorDialog';

interface Props {
  open: boolean;
  onClose: () => void;
  onSave: (form: LancamentoV2Form, id?: string) => Promise<boolean>;
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
  { value: '3-Transferências', label: 'Transferências' },
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

export function LancamentoV2Dialog({
  open, onClose, onSave, lancamento, fazendas, contas, classificacoes,
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
  const [valor, setValor] = useState('');
  const [contaOrigemId, setContaOrigemId] = useState('');
  const [contaDestinoId, setContaDestinoId] = useState('');
  const [notaFiscal, setNotaFiscal] = useState('');
  const [observacao, setObservacao] = useState('');

  const isTransferencia = tipoOperacao === '3-Transferências';
  const isEntrada = tipoOperacao === '1-Entradas';

  const classMap = useMemo(() => {
    const m = new Map<string, ClassificacaoItem>();
    for (const c of classificacoes) {
      if (c.subcentro && !m.has(c.subcentro)) m.set(c.subcentro, c);
    }
    return m;
  }, [classificacoes]);

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
      setValor(String(lancamento.valor));
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
      setStatusTransacao('previsto');
      setValor('');
      setContaOrigemId('');
      setContaDestinoId('');
      setNotaFiscal('');
      setObservacao('');
    }
  }, [lancamento, defaultFazendaId]);

  const handleSubcentroChange = (value: string) => {
    if (value === '__none_sub__') {
      setSubcentro('');
      return;
    }
    setSubcentro(value);
    const cls = classMap.get(value);
    if (cls) {
      setMacroCusto(cls.macro_custo);
      setCentroCusto(cls.centro_custo);
      setTipoOperacao(cls.tipo_operacao);
    }
  };

  const handleDataPagamentoChange = (val: string) => {
    setDataPagamento(val);
    if (statusTransacao !== 'conciliado') {
      setStatusTransacao(deriveStatus(val));
    }
  };

  const handleNotaFiscalChange = (raw: string) => {
    const digits = raw.replace(/\D/g, '');
    if (digits.length <= 9) setNotaFiscal(digits);
  };

  const notaFiscalDisplay = notaFiscal ? formatNotaFiscal(notaFiscal) : '';

  // Contas: show all contas for the fazenda OR contas without fazenda_id
  const contasFazenda = useMemo(() =>
    contas.filter(c => c.fazenda_id === fazendaId || !c.fazenda_id),
  [contas, fazendaId]);

  const fornecedoresList = useMemo(() => {
    // Show fornecedores for the current fazenda + global ones
    return fornecedores.filter(f => f.fazenda_id === fazendaId || !f.fazenda_id);
  }, [fornecedores, fazendaId]);

  const fazOperacionais = fazendas.filter(f => f.id !== '__global__');

  // Validation
  const contaOrigemValid = isTransferencia || !isEntrada ? !!contaOrigemId && contaOrigemId !== '__none__' : true;
  const contaDestinoValid = isTransferencia || isEntrada ? !!contaDestinoId && contaDestinoId !== '__none__' : true;
  const contaSimpleValid = !isTransferencia
    ? (isEntrada ? contaDestinoValid : contaOrigemValid)
    : (contaOrigemValid && contaDestinoValid);

  const canSave = !!fazendaId && !!dataCompetencia && !!descricao && !!favorecidoId && favorecidoId !== '__none_forn__'
    && !!subcentro && !!tipoOperacao && !!statusTransacao && !!valor && parseFloat(valor) > 0
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
      valor: Math.abs(parseFloat(valor)),
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

  // Debug info
  const debugSubcentros = classificacoes.slice(0, 5).map(c => c.subcentro);
  const debugContas = contasFazenda.map(c => c.nome_conta);

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
                  <Label className="text-xs">Descrição *</Label>
                  <Input value={descricao} onChange={e => setDescricao(e.target.value)} className="h-9" placeholder="Descrição do lançamento" />
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

            {/* BLOCO 3 — Classificação */}
            <div>
              <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-1.5">Classificação</p>
              <div className="space-y-2">
                <div>
                  <Label className="text-xs">Subcentro *</Label>
                  <Select value={subcentro || '__none_sub__'} onValueChange={handleSubcentroChange}>
                    <SelectTrigger className="h-9"><SelectValue placeholder="Selecione o subcentro" /></SelectTrigger>
                    <SelectContent className="max-h-60">
                      <SelectItem value="__none_sub__">Selecione...</SelectItem>
                      {classificacoes.map((c, i) => (
                        <SelectItem key={`${c.subcentro}-${i}`} value={c.subcentro}>{c.subcentro}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {/* DEBUG — remover após validação */}
                  <div className="mt-1 p-1.5 bg-yellow-50 border border-yellow-200 rounded text-[10px] text-yellow-800">
                    <strong>🔍 DEBUG Subcentro:</strong> {classificacoes.length} carregado(s)
                    {debugSubcentros.length > 0 && (
                      <span> · Primeiros: {debugSubcentros.join(' | ')}</span>
                    )}
                    {classificacoes.length === 0 && (
                      <span className="text-red-600"> · NENHUM SUBCENTRO ENCONTRADO — verificar financeiro_plano_contas</span>
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

            {/* BLOCO 4 — Operação */}
            <div>
              <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-1.5">Operação</p>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs">Tipo Operação *</Label>
                  <Select value={tipoOperacao} onValueChange={v => { setTipoOperacao(v); setContaOrigemId(''); setContaDestinoId(''); }}>
                    <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {TIPOS_OPERACAO.map(t => (
                        <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
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

            {/* BLOCO 5 — Valor e Conta */}
            <div>
              <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-1.5">Valor e Conta</p>
              <div className="space-y-2">
                <div>
                  <Label className="text-xs">Valor (R$) *</Label>
                  <Input type="number" min="0" step="0.01" value={valor} onChange={e => setValor(e.target.value)} className="h-9" placeholder="0,00" />
                </div>

                {(!isEntrada || isTransferencia) && (
                  <div>
                    <Label className="text-xs">Conta de Origem *</Label>
                    <Select value={contaOrigemId || '__none__'} onValueChange={setContaOrigemId}>
                      <SelectTrigger className="h-9"><SelectValue placeholder="Selecione" /></SelectTrigger>
                      <SelectContent className="max-h-60">
                        <SelectItem value="__none__">Selecione...</SelectItem>
                        {contasFazenda.map(c => (
                          <SelectItem key={c.id} value={c.id}>{c.nome_conta}</SelectItem>
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
                        {contasFazenda.map(c => (
                          <SelectItem key={c.id} value={c.id}>{c.nome_conta}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}

                {/* DEBUG — remover após validação */}
                <div className="p-1.5 bg-yellow-50 border border-yellow-200 rounded text-[10px] text-yellow-800">
                  <strong>🔍 DEBUG Contas:</strong> {contasFazenda.length} carregada(s) (total global: {contas.length})
                  {contasFazenda.length > 0 && (
                    <span> · {debugContas.join(' | ')}</span>
                  )}
                  {contasFazenda.length === 0 && (
                    <span className="text-red-600"> · NENHUMA CONTA — verificar financeiro_contas_bancarias para fazenda {fazendaId || '(nenhuma)'}</span>
                  )}
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

            <Button onClick={handleSubmit} disabled={saving || !canSave} className="w-full">
              {saving ? 'Salvando...' : isEdit ? 'Salvar Alterações' : 'Criar Lançamento'}
            </Button>
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
