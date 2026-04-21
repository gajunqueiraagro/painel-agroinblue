import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { supabase } from '@/integrations/supabase/client';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { format } from 'date-fns';

interface Parcela {
  id: string;
  numero_parcela: number;
  valor_principal: number;
  valor_juros: number;
  data_vencimento: string;
}

interface Financiamento {
  id: string;
  cliente_id: string;
  fazenda_id: string | null;
  descricao: string;
  total_parcelas: number;
  plano_conta_parcela_id: string | null;
  conta_bancaria_id: string | null;
}

interface Props {
  parcela: Parcela | null;
  financiamento: Financiamento;
  onClose: () => void;
}

export default function ModalBaixaParcela({ parcela, financiamento, onClose }: Props) {
  const qc = useQueryClient();
  const [saving, setSaving] = useState(false);

  const [dataPagamento, setDataPagamento] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [principal, setPrincipal] = useState(0);
  const [juros, setJuros] = useState(0);
  const [contaBancariaId, setContaBancariaId] = useState(financiamento.conta_bancaria_id ?? '');
  const [observacao, setObservacao] = useState('');

  // Reset form when parcela changes
  const [lastParcelaId, setLastParcelaId] = useState<string | null>(null);
  if (parcela && parcela.id !== lastParcelaId) {
    setLastParcelaId(parcela.id);
    setPrincipal(Number(parcela.valor_principal));
    setJuros(Number(parcela.valor_juros));
    setDataPagamento(format(new Date(), 'yyyy-MM-dd'));
    setContaBancariaId(financiamento.conta_bancaria_id ?? '');
    setObservacao('');
  }

  const { data: contas = [] } = useQuery({
    queryKey: ['baixa-contas', financiamento.cliente_id],
    enabled: !!parcela,
    queryFn: async () => {
      const { data } = await supabase
        .from('financeiro_contas_bancarias')
        .select('id, nome_conta, nome_exibicao')
        .eq('cliente_id', financiamento.cliente_id)
        .eq('ativa', true)
        .order('ordem_exibicao');
      return data ?? [];
    },
  });

  const valorTotal = principal + juros;

  const handleConfirm = async () => {
    if (!parcela) return;

    if (!financiamento.plano_conta_parcela_id) {
      toast.error('Conta de amortização não configurada. Edite o financiamento antes de registrar pagamento.');
      return;
    }
    if (!contaBancariaId) {
      toast.error('Selecione a conta bancária.');
      return;
    }
    if (!dataPagamento) {
      toast.error('Informe a data de pagamento.');
      return;
    }

    setSaving(true);

    // Passo 1: Inserir lançamento
    const anoMes = dataPagamento.slice(0, 7); // yyyy-MM
    const descLanc = `Parcela ${parcela.numero_parcela}/${financiamento.total_parcelas}: ${financiamento.descricao}`;

    const { data: lanc, error: errLanc } = await supabase
      .from('financeiro_lancamentos_v2')
      .insert({
        cliente_id: financiamento.cliente_id,
        fazenda_id: financiamento.fazenda_id,
        conta_bancaria_id: contaBancariaId,
        tipo_operacao: '2-Saídas',
        sinal: -1,
        valor: valorTotal,
        data_competencia: dataPagamento,
        ano_mes: anoMes,
        origem_lancamento: 'financiamento',
        origem_tipo: 'financiamento_parcela',
        plano_conta_id: financiamento.plano_conta_parcela_id,
        descricao: descLanc,
        status_transacao: 'realizado',
        cancelado: false,
      })
      .select('id')
      .single();

    if (errLanc || !lanc) {
      toast.error('Erro ao criar lançamento: ' + (errLanc?.message ?? 'sem retorno'));
      setSaving(false);
      return;
    }

    // Passo 2: Atualizar parcela
    const { error: errParcela } = await supabase
      .from('financiamento_parcelas')
      .update({
        status: 'pago',
        data_pagamento: dataPagamento,
        valor_principal: principal,
        valor_juros: juros,
        lancamento_id: lanc.id,
        updated_at: new Date().toISOString(),
      })
      .eq('id', parcela.id);

    if (errParcela) {
      toast.error(
        'Lançamento criado, mas a parcela não foi atualizada. Verifique manualmente. Erro: ' +
          errParcela.message
      );
      setSaving(false);
      return;
    }

    toast.success('Parcela registrada com sucesso!');
    qc.invalidateQueries({ queryKey: ['financiamento-parcelas', financiamento.id] });
    qc.invalidateQueries({ queryKey: ['financiamentos-lista', financiamento.cliente_id] });
    qc.invalidateQueries({ queryKey: ['financiamento-detalhe', financiamento.id] });
    setSaving(false);
    onClose();
  };

  return (
    <Dialog open={!!parcela} onOpenChange={open => { if (!open) onClose(); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="text-sm">
            Registrar pagamento — Parcela {parcela?.numero_parcela}/{financiamento.total_parcelas}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-3">
          <div>
            <Label className="text-xs">Data do pagamento</Label>
            <Input type="date" value={dataPagamento} onChange={e => setDataPagamento(e.target.value)} />
          </div>

          <div className="grid grid-cols-3 gap-2">
            <div>
              <Label className="text-xs">Principal</Label>
              <Input
                type="number"
                step="0.01"
                value={principal}
                onChange={e => setPrincipal(Number(e.target.value))}
              />
            </div>
            <div>
              <Label className="text-xs">Juros</Label>
              <Input
                type="number"
                step="0.01"
                value={juros}
                onChange={e => setJuros(Number(e.target.value))}
              />
            </div>
            <div>
              <Label className="text-xs">Total</Label>
              <Input
                type="number"
                value={valorTotal.toFixed(2)}
                readOnly
                className="bg-muted"
              />
            </div>
          </div>

          <div>
            <Label className="text-xs">Conta bancária</Label>
            <Select value={contaBancariaId} onValueChange={setContaBancariaId}>
              <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
              <SelectContent>
                {contas.map(c => (
                  <SelectItem key={c.id} value={c.id}>{c.nome_exibicao || c.nome_conta}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label className="text-xs">Observação</Label>
            <Textarea
              value={observacao}
              onChange={e => setObservacao(e.target.value)}
              rows={2}
              placeholder="Opcional"
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={saving}>Cancelar</Button>
          <Button onClick={handleConfirm} disabled={saving}>
            {saving ? 'Salvando…' : 'Confirmar pagamento'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
