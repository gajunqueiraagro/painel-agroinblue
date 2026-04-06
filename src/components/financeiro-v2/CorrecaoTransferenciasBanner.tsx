import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useCliente } from '@/contexts/ClienteContext';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { AlertTriangle, Check, ChevronLeft, ChevronRight, Info, X } from 'lucide-react';
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
  contas: ContaBancariaV2[];
  onFixed: () => void;
}

function contaLabel(c: ContaBancariaV2): string {
  return (c as any).nome_exibicao || c.nome_conta;
}

export function CorrecaoTransferenciasBanner({ contas, onFixed }: Props) {
  const { clienteAtual } = useCliente();
  const clienteId = clienteAtual?.id;

  const [pendentes, setPendentes] = useState<TransferenciaPendente[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentIdx, setCurrentIdx] = useState(0);
  const [selectedDestino, setSelectedDestino] = useState<string>('');
  const [saving, setSaving] = useState(false);
  const [dismissed, setDismissed] = useState(false);

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

  useEffect(() => { loadPendentes(); }, [loadPendentes]);

  const current = pendentes[currentIdx] || null;
  const totalPendente = pendentes.length;

  // Don't render if no pending or dismissed or loading
  if (loading || totalPendente === 0 || dismissed) return null;

  const contasDisponiveis = contas.filter(c => current && c.id !== current.conta_bancaria_id);
  const contaOrigemNome = current ? contas.find(c => c.id === current.conta_bancaria_id) : null;

  const handleSalvar = async () => {
    if (!current || !selectedDestino) return;
    if (current.conta_bancaria_id && selectedDestino === current.conta_bancaria_id) {
      toast.error('Conta destino não pode ser igual à conta origem.');
      return;
    }
    setSaving(true);
    const { error } = await supabase
      .from('financeiro_lancamentos_v2')
      .update({ conta_destino_id: selectedDestino } as any)
      .eq('id', current.id);
    setSaving(false);
    if (error) { toast.error('Erro ao atualizar: ' + error.message); return; }
    toast.success('Conta destino atualizada');
    const newPendentes = pendentes.filter((_, i) => i !== currentIdx);
    setPendentes(newPendentes);
    if (currentIdx >= newPendentes.length) setCurrentIdx(Math.max(0, newPendentes.length - 1));
    setSelectedDestino('');
    onFixed();
  };

  const handlePular = () => {
    if (currentIdx < pendentes.length - 1) { setCurrentIdx(prev => prev + 1); setSelectedDestino(''); }
  };
  const handleVoltar = () => {
    if (currentIdx > 0) { setCurrentIdx(prev => prev - 1); setSelectedDestino(''); }
  };

  return (
    <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 space-y-2">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <AlertTriangle className="h-4 w-4 text-amber-600" />
          <span className="text-xs font-semibold text-amber-800">
            Corrigir Transferências sem Destino
          </span>
          <Badge variant="outline" className="text-[10px] text-amber-700 border-amber-400">
            {currentIdx + 1} de {totalPendente}
          </Badge>
        </div>
        <Button variant="ghost" size="sm" className="h-5 w-5 p-0 text-amber-600" onClick={() => setDismissed(true)}>
          <X className="h-3 w-3" />
        </Button>
      </div>

      {/* Info + form inline */}
      {current && (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[11px]">
          <span className="text-amber-800">
            <strong>{current.descricao || '(Sem descrição)'}</strong> · {formatMoeda(current.valor)} · {current.data_pagamento || current.data_competencia} · Mês: {current.ano_mes}
          </span>
          <span className="text-amber-700">
            Origem: <strong>{contaOrigemNome ? contaLabel(contaOrigemNome) : 'N/D'}</strong>
          </span>

          <div className="flex items-center gap-1.5 ml-auto">
            <Select value={selectedDestino} onValueChange={setSelectedDestino}>
              <SelectTrigger className="h-6 text-[10px] w-[180px] bg-white">
                <SelectValue placeholder="Conta destino" />
              </SelectTrigger>
              <SelectContent>
                {contasDisponiveis.map(c => (
                  <SelectItem key={c.id} value={c.id}>{contaLabel(c)}</SelectItem>
                ))}
              </SelectContent>
            </Select>

            <div className="flex gap-0.5">
              <Button variant="ghost" size="sm" className="h-6 w-6 p-0" onClick={handleVoltar} disabled={currentIdx === 0}>
                <ChevronLeft className="h-3 w-3" />
              </Button>
              <Button variant="ghost" size="sm" className="h-6 w-6 p-0" onClick={handlePular} disabled={currentIdx >= pendentes.length - 1}>
                <ChevronRight className="h-3 w-3" />
              </Button>
            </div>

            <Button variant="outline" size="sm" className="h-6 text-[10px] px-2" onClick={handlePular}>Pular</Button>
            <Button size="sm" className="h-6 text-[10px] px-2" onClick={handleSalvar} disabled={!selectedDestino || saving}>
              {saving ? 'Salvando...' : 'Salvar'}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
