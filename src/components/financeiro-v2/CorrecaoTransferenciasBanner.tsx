import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useCliente } from '@/contexts/ClienteContext';
import { AlertTriangle } from 'lucide-react';
import { CorrecaoTransferenciasDialog } from '@/components/financeiro-v2/CorrecaoTransferenciasDialog';
import type { ContaBancariaV2 } from '@/hooks/useFinanceiroV2';

interface Props {
  contas: ContaBancariaV2[];
  onFixed: () => void;
}

/**
 * UI-MESES-PADRAO-01 (Gabriel 11:25, FILA 11:33) — a REGRA DA CASA: pendência como esta é um AVISO PEQUENO na faixa dos totais (o mesmo
 * chip âmbar dos `avisos-do-filtro`, P94) e o conserto abre em MODAL próprio — nunca um bloco dentro da tela empurrando a tabela.
 * O modal é o que já existia (`CorrecaoTransferenciasDialog`: "1 de N · conta destino · ‹ › · Pular · Salvar"); aqui só se CONTA.
 */
export function CorrecaoTransferenciasBanner({ contas, onFixed }: Props) {
  const { clienteAtual } = useCliente();
  const clienteId = clienteAtual?.id;
  const [qtde, setQtde] = useState(0);
  const [aberto, setAberto] = useState(false);

  const contar = useCallback(async () => {
    if (!clienteId) return;
    const { count, error } = await supabase
      .from('financeiro_lancamentos_v2')
      .select('id', { count: 'exact', head: true })
      .eq('cliente_id', clienteId)
      .eq('tipo_operacao', '3-Transferências')
      .eq('cancelado', false)
      .is('conta_destino_id', null);
    if (error) { console.error(error); return; }
    setQtde(count ?? 0);
  }, [clienteId]);

  useEffect(() => { void contar(); }, [contar]);

  if (qtde === 0) return null;
  return (
    <>
      <button type="button" onClick={() => setAberto(true)} data-testid="aviso-transferencias"
        title="Transferências sem a conta destino: clique para corrigir uma a uma"
        className="inline-flex h-4 shrink-0 items-center gap-0.5 whitespace-nowrap rounded border border-amber-400 bg-amber-50 px-1 text-[9.5px] text-amber-900">
        <AlertTriangle className="h-2.5 w-2.5" /> {qtde} {qtde === 1 ? 'transferência sem destino' : 'transferências sem destino'}
      </button>
      <CorrecaoTransferenciasDialog open={aberto} onClose={() => { setAberto(false); void contar(); }} contas={contas}
        onFixed={() => { void contar(); onFixed(); }} />
    </>
  );
}
