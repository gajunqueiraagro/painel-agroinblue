import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useCliente } from '@/contexts/ClienteContext';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { AlertTriangle, Check, ChevronLeft, ChevronRight } from 'lucide-react';
import { toast } from 'sonner';
import type { ContaBancariaV2 } from '@/hooks/useFinanceiroV2';
import { formatMoeda } from '@/lib/calculos/formatters';

interface TransferenciaPendente {
  id: string;
  descricao: string | null;
  valor: number;
  data_pagamento: string | null;
  data_competencia: string;
  conta_bancaria_id: string | null;
  ano_mes: string;
  fazenda_id: string;
}

interface Props {
  open: boolean;
  onClose: () => void;
  contas: ContaBancariaV2[];
  onFixed: () => void;
}

function contaLabel(c: ContaBancariaV2): string {
  return (c as any).nome_exibicao || c.nome_conta;
}

export function CorrecaoTransferenciasDialog({ open, onClose, contas, onFixed }: Props) {
  const { clienteAtual } = useCliente();
  const clienteId = clienteAtual?.id;

  const [pendentes, setPendentes] = useState<TransferenciaPendente[]>([]);
  const [loading, setLoading] = useState(false);
  const [currentIdx, setCurrentIdx] = useState(0);
  const [selectedDestino, setSelectedDestino] = useState<string>('');
  const [saving, setSaving] = useState(false);

  const loadPendentes = useCallback(async () => {
    if (!clienteId) return;
    setLoading(true);
    const { data, error } = await supabase
      .from('financeiro_lancamentos_v2')
      .select('id, descricao, valor, data_pagamento, data_competencia, conta_bancaria_id, ano_mes, fazenda_id')
      .eq('cliente_id', clienteId)
      .eq('tipo_operacao', '3-Transferência')
      .eq('cancelado', false)
      .is('conta_destino_id', null)
      .order('data_pagamento', { ascending: true, nullsFirst: false })
      .order('data_competencia', { ascending: true });

    setPendentes((data as TransferenciaPendente[]) || []);
    setCurrentIdx(0);
    setSelectedDestino('');
    setLoading(false);
    if (error) console.error(error);
  }, [clienteId]);

  useEffect(() => {
    if (open) loadPendentes();
  }, [open, loadPendentes]);

  const current = pendentes[currentIdx] || null;

  const contasDisponiveis = contas.filter(c => 
    current && c.id !== current.conta_bancaria_id
  );

  const contaOrigemNome = current
    ? contas.find(c => c.id === current.conta_bancaria_id)
    : null;

  const handleSalvar = async () => {
    if (!current || !selectedDestino) return;
    setSaving(true);

    const { error } = await supabase
      .from('financeiro_lancamentos_v2')
      .update({ conta_destino_id: selectedDestino } as any)
      .eq('id', current.id);

    setSaving(false);

    if (error) {
      toast.error('Erro ao atualizar: ' + error.message);
      return;
    }

    toast.success('Conta destino atualizada');
    const newPendentes = pendentes.filter((_, i) => i !== currentIdx);
    setPendentes(newPendentes);
    if (currentIdx >= newPendentes.length) setCurrentIdx(Math.max(0, newPendentes.length - 1));
    setSelectedDestino('');
    onFixed();
  };

  const handlePular = () => {
    if (currentIdx < pendentes.length - 1) {
      setCurrentIdx(prev => prev + 1);
      setSelectedDestino('');
    }
  };

  const handleVoltar = () => {
    if (currentIdx > 0) {
      setCurrentIdx(prev => prev - 1);
      setSelectedDestino('');
    }
  };

  return (
    <Dialog open={open} onOpenChange={v => { if (!v) onClose(); }}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-amber-500" />
            Corrigir Transferências sem Destino
          </DialogTitle>
        </DialogHeader>

        {loading ? (
          <p className="text-sm text-muted-foreground py-4">Carregando...</p>
        ) : pendentes.length === 0 ? (
          <div className="flex flex-col items-center gap-3 py-6">
            <Check className="h-10 w-10 text-emerald-500" />
            <p className="text-sm font-medium">Todas as transferências possuem conta destino.</p>
          </div>
        ) : current ? (
          <div className="space-y-4">
            {/* Progress */}
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>{currentIdx + 1} de {pendentes.length} pendentes</span>
              <Badge variant="outline" className="text-amber-600 border-amber-300">
                {pendentes.length} sem destino
              </Badge>
            </div>

            {/* Card do lançamento */}
            <div className="rounded-md border p-3 space-y-2 bg-muted/30">
              <div className="flex justify-between text-sm">
                <span className="font-medium">{current.descricao || '(Sem descrição)'}</span>
                <span className="font-bold">{formatMoeda(current.valor)}</span>
              </div>
              <div className="flex gap-4 text-xs text-muted-foreground">
                <span>Data: {current.data_pagamento || current.data_competencia}</span>
                <span>Mês: {current.ano_mes}</span>
              </div>
              <div className="text-xs">
                <span className="text-muted-foreground">Conta Origem: </span>
                <span className="font-medium">
                  {contaOrigemNome ? contaLabel(contaOrigemNome) : 'Não definida'}
                </span>
              </div>
            </div>

            {/* Seleção do destino */}
            <div className="space-y-1">
              <label className="text-sm font-medium text-[hsl(var(--primary))]">
                Conta Destino *
              </label>
              <Select value={selectedDestino} onValueChange={setSelectedDestino}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecione a conta destino" />
                </SelectTrigger>
                <SelectContent>
                  {contasDisponiveis.map(c => (
                    <SelectItem key={c.id} value={c.id}>
                      {contaLabel(c)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Actions */}
            <div className="flex items-center justify-between pt-2">
              <div className="flex gap-1">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleVoltar}
                  disabled={currentIdx === 0}
                >
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handlePular}
                  disabled={currentIdx >= pendentes.length - 1}
                >
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={handlePular}>
                  Pular
                </Button>
                <Button
                  size="sm"
                  onClick={handleSalvar}
                  disabled={!selectedDestino || saving}
                >
                  {saving ? 'Salvando...' : 'Salvar Destino'}
                </Button>
              </div>
            </div>
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
