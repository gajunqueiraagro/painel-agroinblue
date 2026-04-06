/**
 * Tela de consolidação Meta — hub + duas views dedicadas.
 */
import { useState } from 'react';
import { CATEGORIAS, type Lancamento, type SaldoInicial } from '@/types/cattle';
import { useMetaConsolidacao } from '@/hooks/useMetaConsolidacao';
import type { MetaGmdRow } from '@/hooks/useMetaGmd';
import { ConsolidacaoHub } from '@/components/meta-consolidacao/ConsolidacaoHub';
import { ConsolidacaoCategoriaView } from '@/components/meta-consolidacao/ConsolidacaoCategoriaView';
import { ConsolidacaoMesView } from '@/components/meta-consolidacao/ConsolidacaoMesView';

interface Props {
  saldosIniciais: SaldoInicial[];
  metaLancamentos: Lancamento[];
  gmdRows: MetaGmdRow[];
  ano: number;
  onBack: () => void;
  onNavigateToLancamentos?: (ano: string, mes: string, categoria?: string) => void;
  onNavigateToReclass?: (mes?: string) => void;
}

type Screen = 'hub' | 'categoria' | 'mes';

export function MetaConsolidacaoTab({ saldosIniciais, metaLancamentos, gmdRows, ano, onBack, onNavigateToLancamentos, onNavigateToReclass }: Props) {
  const data = useMetaConsolidacao(saldosIniciais, metaLancamentos, gmdRows, ano);
  const [screen, setScreen] = useState<Screen>('hub');

  if (screen === 'categoria') {
    return <ConsolidacaoCategoriaView data={data} ano={ano} metaLancamentos={metaLancamentos} onBack={() => setScreen('hub')} onNavigateToLancamentos={onNavigateToLancamentos} onNavigateToReclass={onNavigateToReclass} />;
  }

  if (screen === 'mes') {
    return <ConsolidacaoMesView data={data} ano={ano} metaLancamentos={metaLancamentos} onBack={() => setScreen('hub')} onNavigateToLancamentos={onNavigateToLancamentos} onNavigateToReclass={onNavigateToReclass} />;
  }

  return (
    <ConsolidacaoHub
      ano={ano}
      onBack={onBack}
      onSelectCategoria={() => setScreen('categoria')}
      onSelectMes={() => setScreen('mes')}
    />
  );
}
