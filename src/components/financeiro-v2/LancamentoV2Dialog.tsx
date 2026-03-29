import { useState, useEffect, useMemo } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import type { LancamentoV2, LancamentoV2Form, ContaBancariaV2, ClassificacaoItem } from '@/hooks/useFinanceiroV2';
import type { Fazenda } from '@/contexts/FazendaContext';

interface Props {
  open: boolean;
  onClose: () => void;
  onSave: (form: LancamentoV2Form, id?: string) => Promise<boolean>;
  lancamento?: LancamentoV2 | null;
  fazendas: Fazenda[];
  contas: ContaBancariaV2[];
  classificacoes: ClassificacaoItem[];
  defaultFazendaId?: string;
}

const TIPOS_OPERACAO = [
  { value: '1-Entradas', label: '1-Entradas' },
  { value: '2-Saídas', label: '2-Saídas' },
  { value: '3-Transferências', label: '3-Transferências' },
];

const STATUS_OPTIONS = [
  { value: 'pendente', label: 'Pendente' },
  { value: 'confirmado', label: 'Confirmado' },
  { value: 'conciliado', label: 'Conciliado' },
];

export function LancamentoV2Dialog({ open, onClose, onSave, lancamento, fazendas, contas, classificacoes, defaultFazendaId }: Props) {
  const isEdit = !!lancamento;
  const [saving, setSaving] = useState(false);

  const [fazendaId, setFazendaId] = useState('');
  const [contaBancariaId, setContaBancariaId] = useState('');
  const [dataCompetencia, setDataCompetencia] = useState('');
  const [dataPagamento, setDataPagamento] = useState('');
  const [tipoOperacao, setTipoOperacao] = useState('2-Saídas');
  const [statusTransacao, setStatusTransacao] = useState('pendente');
  const [valor, setValor] = useState('');
  const [descricao, setDescricao] = useState('');
  const [macroCusto, setMacroCusto] = useState('');
  const [centroCusto, setCentroCusto] = useState('');
  const [subcentro, setSubcentro] = useState('');
  const [observacao, setObservacao] = useState('');

  // Build lookup map for subcentro → classification
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
      setContaBancariaId(lancamento.conta_bancaria_id || '');
      setDataCompetencia(lancamento.data_competencia);
      setDataPagamento(lancamento.data_pagamento || '');
      setTipoOperacao(lancamento.tipo_operacao);
      setStatusTransacao(lancamento.status_transacao || 'pendente');
      setValor(String(lancamento.valor));
      setDescricao(lancamento.descricao || '');
      setMacroCusto(lancamento.macro_custo || '');
      setCentroCusto(lancamento.centro_custo || '');
      setSubcentro(lancamento.subcentro || '');
      setObservacao(lancamento.observacao || '');
    } else {
      setFazendaId(defaultFazendaId || '');
      setContaBancariaId('');
      setDataCompetencia('');
      setDataPagamento('');
      setTipoOperacao('2-Saídas');
      setStatusTransacao('pendente');
      setValor('');
      setDescricao('');
      setMacroCusto('');
      setCentroCusto('');
      setSubcentro('');
      setObservacao('');
    }
  }, [lancamento, defaultFazendaId]);

  const handleSubcentroChange = (value: string) => {
    setSubcentro(value);
    const cls = classMap.get(value);
    if (cls) {
      setMacroCusto(cls.macro_custo);
      setCentroCusto(cls.centro_custo);
      setTipoOperacao(cls.tipo_operacao);
    }
  };

  const contasFiltradas = contas.filter(c => c.fazenda_id === fazendaId);

  const handleSubmit = async () => {
    if (!fazendaId || !dataCompetencia || !valor || !subcentro) return;

    setSaving(true);
    const form: LancamentoV2Form = {
      fazenda_id: fazendaId,
      conta_bancaria_id: contaBancariaId && contaBancariaId !== '__none__' ? contaBancariaId : null,
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
    };

    const ok = await onSave(form, lancamento?.id);
    setSaving(false);
    if (ok) onClose();
  };

  const fazOperacionais = fazendas.filter(f => f.id !== '__global__');

  return (
    <Dialog open={open} onOpenChange={v => { if (!v) onClose(); }}>
      <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-base">{isEdit ? 'Editar Lançamento' : 'Novo Lançamento'}</DialogTitle>
        </DialogHeader>

        <div className="space-y-3">
          {/* Fazenda */}
          <div>
            <Label className="text-xs">Fazenda</Label>
            <Select value={fazendaId} onValueChange={v => { setFazendaId(v); setContaBancariaId(''); }}>
              <SelectTrigger className="h-9"><SelectValue placeholder="Selecione" /></SelectTrigger>
              <SelectContent>
                {fazOperacionais.map(f => (
                  <SelectItem key={f.id} value={f.id}>{f.nome}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Dates */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">Data Competência *</Label>
              <Input type="date" value={dataCompetencia} onChange={e => setDataCompetencia(e.target.value)} className="h-9" />
            </div>
            <div>
              <Label className="text-xs">Data Pagamento</Label>
              <Input type="date" value={dataPagamento} onChange={e => setDataPagamento(e.target.value)} className="h-9" />
            </div>
          </div>

          {/* Tipo + Status */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">Tipo Operação</Label>
              <Select value={tipoOperacao} onValueChange={setTipoOperacao}>
                <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {TIPOS_OPERACAO.map(t => (
                    <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Status</Label>
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

          {/* Conta + Valor */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">Conta Bancária</Label>
              <Select value={contaBancariaId || '__none__'} onValueChange={setContaBancariaId}>
                <SelectTrigger className="h-9"><SelectValue placeholder="Selecione" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">Nenhuma</SelectItem>
                  {contasFiltradas.map(c => (
                    <SelectItem key={c.id} value={c.id}>{c.nome_conta}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Valor (R$) *</Label>
              <Input type="number" min="0" step="0.01" value={valor} onChange={e => setValor(e.target.value)} className="h-9" placeholder="0,00" />
            </div>
          </div>

          {/* Descricao */}
          <div>
            <Label className="text-xs">Descrição</Label>
            <Input value={descricao} onChange={e => setDescricao(e.target.value)} className="h-9" placeholder="Descrição do lançamento" />
          </div>

          {/* Subcentro (select obrigatório) */}
          <div>
            <Label className="text-xs">Subcentro *</Label>
            <Select value={subcentro || '__none_sub__'} onValueChange={v => handleSubcentroChange(v === '__none_sub__' ? '' : v)}>
              <SelectTrigger className="h-9"><SelectValue placeholder="Selecione o subcentro" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__none_sub__">Selecione...</SelectItem>
                {classificacoes.map(c => (
                  <SelectItem key={c.subcentro} value={c.subcentro}>{c.subcentro}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Macro Custo + Centro Custo (readonly, auto-preenchidos) */}
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

          {/* Observação */}
          <div>
            <Label className="text-xs">Observação</Label>
            <Textarea value={observacao} onChange={e => setObservacao(e.target.value)} rows={2} placeholder="Observações adicionais" />
          </div>

          <Button onClick={handleSubmit} disabled={saving || !fazendaId || !dataCompetencia || !valor || !subcentro} className="w-full">
            {saving ? 'Salvando...' : isEdit ? 'Salvar Alterações' : 'Criar Lançamento'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
