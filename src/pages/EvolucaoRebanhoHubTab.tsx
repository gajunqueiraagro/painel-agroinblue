import { useState } from 'react';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { FinanceiroTab } from './FinanceiroTab';
import { FluxoAnualTab } from './FluxoAnualTab';
import { ValorRebanhoTab } from './ValorRebanhoTab';
import { EvolucaoCategoriaTab } from './EvolucaoCategoriaTab';
import { Lancamento, SaldoInicial } from '@/types/cattle';
import type { SubAba } from './FinanceiroTab';

interface Props {
  lancamentos: Lancamento[];
  saldosIniciais: SaldoInicial[];
  onNavigateToMovimentacao?: (subAba: SubAba) => void;
  onEditar?: (id: string, dados: Partial<Omit<Lancamento, 'id'>>) => void;
  onRemover?: (id: string) => void;
  filtroAnoInicial?: string;
  filtroMesInicial?: number;
  onNavigateToReclass?: (filtro?: { ano: string; mes: number }) => void;
}

export function EvolucaoRebanhoHubTab({ lancamentos, saldosIniciais, onNavigateToMovimentacao, onEditar, onRemover, filtroAnoInicial, filtroMesInicial, onNavigateToReclass }: Props) {
  const [activeTab, setActiveTab] = useState('movimentacoes');

  return (
    <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
      <TabsList className="w-full grid grid-cols-4 mx-4 mt-2" style={{ maxWidth: 'calc(100% - 2rem)' }}>
        <TabsTrigger value="movimentacoes" className="text-[11px] px-1">Movimentações</TabsTrigger>
        <TabsTrigger value="evolucao" className="text-[11px] px-1">Evol. Rebanho</TabsTrigger>
        <TabsTrigger value="categoria" className="text-[11px] px-1">Evol. Categ.</TabsTrigger>
        <TabsTrigger value="valor" className="text-[11px] px-1">Valor Reb.</TabsTrigger>
      </TabsList>

      <TabsContent value="movimentacoes">
        <FinanceiroTab lancamentos={lancamentos} onEditar={onEditar || (() => {})} onRemover={onRemover || (() => {})} modoMovimentacao />
      </TabsContent>

      <TabsContent value="evolucao">
        <FluxoAnualTab lancamentos={lancamentos} saldosIniciais={saldosIniciais} onNavigateToMovimentacao={onNavigateToMovimentacao} />
      </TabsContent>

      <TabsContent value="valor">
        <ValorRebanhoTab
          lancamentos={lancamentos}
          saldosIniciais={saldosIniciais}
          filtroAnoInicial={filtroAnoInicial}
          filtroMesInicial={filtroMesInicial}
        />
      </TabsContent>

      <TabsContent value="categoria">
        <EvolucaoCategoriaTab lancamentos={lancamentos} saldosIniciais={saldosIniciais} />
      </TabsContent>
    </Tabs>
  );
}
