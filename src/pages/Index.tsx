import { useState } from 'react';
import { BottomNav, TabId } from '@/components/BottomNav';
import { Header } from '@/components/Header';
import { ResumoTab } from './ResumoTab';
import { MovimentacaoTab } from './MovimentacaoTab';
import { LancamentosTab } from './LancamentosTab';
import { EvolucaoTab } from './EvolucaoTab';
import { EvolucaoCategoriaTab } from './EvolucaoCategoriaTab';
import { FluxoAnualTab } from './FluxoAnualTab';
import { FinanceiroTab } from './FinanceiroTab';
import { AcessosTab } from './AcessosTab';
import { AnaliseTab } from './AnaliseTab';
import { AnaliseEntradasTab } from './AnaliseEntradasTab';
import { AnaliseSaidasTab } from './AnaliseSaidasTab';

import { SaldoInicialForm } from '@/components/SaldoInicialForm';
import { ExportMenu } from '@/components/ExportMenu';
import { FazendaSelector } from '@/components/FazendaSelector';
import { useLancamentos } from '@/hooks/useLancamentos';
import { useFazenda } from '@/contexts/FazendaContext';
import { useAuth } from '@/contexts/AuthContext';

const TITLES: Record<TabId, string> = {
  resumo: 'Controle de Rebanho',
  movimentacao: 'Fluxo Mensal',
  lancamentos: 'Lançamentos',
  financeiro: 'Financeiro',
  evolucao: 'Categorias por Mês',
  evolucao_categoria: 'Evolução por Categoria',
  fluxo_anual: 'Fluxo Anual',
  acessos: 'Acessos',
  analise: 'Análise Gráfica',
  analise_entradas: 'Análise de Entradas',
  analise_saidas: 'Análise de Saídas',
};

const Index = () => {
  const [activeTab, setActiveTab] = useState<TabId>('resumo');
  const { user } = useAuth();
  const { fazendaAtual, fazendas } = useFazenda();
  const { lancamentos, saldosIniciais, adicionarLancamento, editarLancamento, removerLancamento, setSaldoInicial } = useLancamentos();

  const papel = fazendaAtual?.papel;
  const isDono = fazendaAtual?.owner_id === user?.id;
  const isDonoOuGerente = isDono || papel === 'gerente';

  return (
    <div className="min-h-screen bg-background">
      <Header
        title={fazendaAtual?.nome || TITLES[activeTab]}
        rightAction={
          <div className="flex items-center gap-2">
            {activeTab === 'resumo' && (
              <>
                <ExportMenu lancamentos={lancamentos} saldosIniciais={saldosIniciais} />
                {isDonoOuGerente && <SaldoInicialForm saldosIniciais={saldosIniciais} onSetSaldo={setSaldoInicial} />}
              </>
            )}
            {fazendas.length > 1 && <FazendaSelector />}
          </div>
        }
      />

      {activeTab === 'resumo' && <ResumoTab lancamentos={lancamentos} saldosIniciais={saldosIniciais} onTabChange={setActiveTab} />}
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
      {activeTab === 'financeiro' && <FinanceiroTab lancamentos={lancamentos} onEditar={editarLancamento} onRemover={removerLancamento} />}
      {activeTab === 'acessos' && <AcessosTab />}
      {activeTab === 'analise' && <AnaliseTab lancamentos={lancamentos} saldosIniciais={saldosIniciais} onTabChange={setActiveTab} />}
      {activeTab === 'analise_entradas' && <AnaliseEntradasTab lancamentos={lancamentos} saldosIniciais={saldosIniciais} onTabChange={setActiveTab} />}
      {activeTab === 'analise_saidas' && <AnaliseSaidasTab lancamentos={lancamentos} saldosIniciais={saldosIniciais} onTabChange={setActiveTab} />}

      <BottomNav activeTab={activeTab} onTabChange={setActiveTab} />
    </div>
  );
};

export default Index;
