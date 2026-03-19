import { useState } from 'react';
import { BottomNav, TabId } from '@/components/BottomNav';
import { Header } from '@/components/Header';
import { ResumoTab } from './ResumoTab';
import { MovimentacaoTab } from './MovimentacaoTab';
import { LancamentosTab } from './LancamentosTab';
import { EvolucaoTab } from './EvolucaoTab';
import { useLancamentos } from '@/hooks/useLancamentos';

const TITLES: Record<TabId, string> = {
  resumo: 'Controle de Rebanho',
  movimentacao: 'Fluxo Mensal',
  lancamentos: 'Lançamentos',
  evolucao: 'Evolução por Categoria',
};

const Index = () => {
  const [activeTab, setActiveTab] = useState<TabId>('resumo');
  const { lancamentos, adicionarLancamento, removerLancamento } = useLancamentos();

  return (
    <div className="min-h-screen bg-background">
      <Header title={TITLES[activeTab]} />

      {activeTab === 'resumo' && <ResumoTab lancamentos={lancamentos} />}
      {activeTab === 'movimentacao' && <MovimentacaoTab lancamentos={lancamentos} />}
      {activeTab === 'lancamentos' && (
        <LancamentosTab
          lancamentos={lancamentos}
          onAdicionar={adicionarLancamento}
          onRemover={removerLancamento}
        />
      )}
      {activeTab === 'evolucao' && <EvolucaoTab lancamentos={lancamentos} />}

      <BottomNav activeTab={activeTab} onTabChange={setActiveTab} />
    </div>
  );
};

export default Index;
