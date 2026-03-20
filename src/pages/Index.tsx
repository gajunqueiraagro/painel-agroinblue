import { useState } from 'react';
import { BottomNav, TabId } from '@/components/BottomNav';
import { Header } from '@/components/Header';
import { ResumoTab } from './ResumoTab';
import { MovimentacaoTab } from './MovimentacaoTab';
import { LancamentosTab } from './LancamentosTab';
import { EvolucaoTab } from './EvolucaoTab';
import { EvolucaoCategoriaTab } from './EvolucaoCategoriaTab';
import { FluxoAnualTab } from './FluxoAnualTab';

import { SaldoInicialForm } from '@/components/SaldoInicialForm';
import { ExportMenu } from '@/components/ExportMenu';
import { FazendaSelector } from '@/components/FazendaSelector';
import { useLancamentos } from '@/hooks/useLancamentos';
import { useFazenda } from '@/contexts/FazendaContext';

const TITLES: Record<TabId, string> = {
  resumo: 'Controle de Rebanho',
  movimentacao: 'Fluxo Mensal',
  lancamentos: 'Lançamentos',
  evolucao: 'Categorias por Mês',
  evolucao_categoria: 'Evolução por Categoria',
  fluxo_anual: 'Fluxo Anual',
};

const Index = () => {
  const [activeTab, setActiveTab] = useState<TabId>('resumo');
  const { fazendaAtual, fazendas } = useFazenda();
  const { lancamentos, saldosIniciais, adicionarLancamento, editarLancamento, removerLancamento } = useLancamentos();

  return (
    <div className="min-h-screen bg-background">
      <Header
        title={fazendaAtual?.nome || TITLES[activeTab]}
        rightAction={
          <div className="flex items-center gap-2">
            {activeTab === 'resumo' && (
              <ExportMenu lancamentos={lancamentos} saldosIniciais={saldosIniciais} />
            )}
            {fazendas.length > 1 && <FazendaSelector />}
          </div>
        }
      />

      {activeTab === 'resumo' && <ResumoTab lancamentos={lancamentos} saldosIniciais={saldosIniciais} />}
      {activeTab === 'movimentacao' && <MovimentacaoTab lancamentos={lancamentos} saldosIniciais={saldosIniciais} />}
      {activeTab === 'lancamentos' && (
        <LancamentosTab
          lancamentos={lancamentos}
          onAdicionar={adicionarLancamento}
          onEditar={editarLancamento}
          onRemover={removerLancamento}
        />
      )}
      {activeTab === 'evolucao' && <EvolucaoTab lancamentos={lancamentos} saldosIniciais={saldosIniciais} />}
      {activeTab === 'evolucao_categoria' && <EvolucaoCategoriaTab lancamentos={lancamentos} saldosIniciais={saldosIniciais} />}
      {activeTab === 'fluxo_anual' && <FluxoAnualTab lancamentos={lancamentos} saldosIniciais={saldosIniciais} />}

      <BottomNav activeTab={activeTab} onTabChange={setActiveTab} />
    </div>
  );
};

export default Index;
