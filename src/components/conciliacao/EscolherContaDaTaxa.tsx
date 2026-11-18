/**
 * CONC-DESCONCILIAR-EDSON-01 (FILA 18/11 09:22) — a conta da "outra despesa sem nota (taxa)" no Casar com o banco: o seletor de sempre
 * (`EscolherConta`, com busca e a barra de atividade), só as contas de SAÍDA, pelo carregador de sempre (`useFinanceiroV2`).
 * Montado só quando o operador escolhe "taxa": o modal não carrega o plano à toa.
 */
import { useEffect, useMemo } from 'react';
import { EscolherConta } from '@/components/shared/EscolherConta';
import { useFinanceiroV2 } from '@/hooks/useFinanceiroV2';

export function EscolherContaDaTaxa({ onEscolher }: { onEscolher: (conta: { id: string; subcentro: string }) => void }) {
  const { classificacoes, loadClassificacoes } = useFinanceiroV2();
  useEffect(() => { void loadClassificacoes(); }, [loadClassificacoes]);
  const saidas = useMemo(() => classificacoes.filter((c) => !!c.id && c.tipo_operacao.startsWith('2')), [classificacoes]);
  return (
    <div className="min-w-0 flex-1" data-testid="conta-da-taxa">
      <EscolherConta valor="" classificacoes={saidas} tipoOperacao="" label="Conta da taxa"
        onEscolher={(c) => onEscolher({ id: c.id, subcentro: c.subcentro ?? '' })} />
    </div>
  );
}
