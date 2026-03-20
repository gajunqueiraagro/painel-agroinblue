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
import { useLancamentos } from '@/hooks/useLancamentos';

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
  const { lancamentos, saldosIniciais, adicionarLancamento, editarLancamento, removerLancamento, setSaldoInicial } = useLancamentos();

  return (
    <div className="min-h-screen bg-background">
      <Header
        title={TITLES[activeTab]}
        rightAction={
          activeTab === 'resumo' ? (
            <div className="flex items-center gap-2">
              <ExportMenu lancamentos={lancamentos} saldosIniciais={saldosIniciais} />
              <SaldoInicialForm saldosIniciais={saldosIniciais} onSetSaldo={setSaldoInicial} />
            </div>
          ) : undefined
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
