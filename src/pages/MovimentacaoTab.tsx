import { useState } from 'react';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Lancamento, SaldoInicial } from '@/types/cattle';
import { FinanceiroTab, type SubAba } from './FinanceiroTab';
import { EvolucaoCategoriaTab } from './EvolucaoCategoriaTab';
import { FluxoAnualTab } from './FluxoAnualTab';

interface Props {
  lancamentos: Lancamento[];
  saldosIniciais: SaldoInicial[];
  onEditar?: (id: string, dados: Partial<Omit<Lancamento, 'id'>>) => void;
  onRemover?: (id: string) => void;
  onNavigateToMovimentacao?: (subAba: SubAba) => void;
}

/**
 * Tela de Movimentações do Rebanho com três abas:
 * - Por Tipo: movimentações agrupadas por tipo (Nascimentos, Compras, Vendas, etc.)
 * - Por Categoria: movimentações agrupadas por categoria com totais por período
 * - Fluxo Anual: linhas por mês, colunas por tipo de movimentação
 */
export function MovimentacaoTab({ lancamentos, saldosIniciais, onEditar, onRemover, onNavigateToMovimentacao }: Props) {
  const [activeTab, setActiveTab] = useState('por_tipo');

  return (
    <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
      <TabsList className="w-full grid grid-cols-3 mx-4 mt-2" style={{ maxWidth: 'calc(100% - 2rem)' }}>
        <TabsTrigger value="por_tipo" className="text-[11px] font-bold px-1">Por Tipo</TabsTrigger>
        <TabsTrigger value="por_categoria" className="text-[11px] font-bold px-1">Por Categoria</TabsTrigger>
        <TabsTrigger value="fluxo_anual" className="text-[11px] font-bold px-1">Evol. Rebanho</TabsTrigger>
      </TabsList>

      <TabsContent value="por_tipo">
        <FinanceiroTab
          lancamentos={lancamentos}
          onEditar={onEditar || (() => {})}
          onRemover={onRemover || (() => {})}
          modoMovimentacao
        />
      </TabsContent>

      <TabsContent value="por_categoria">
        <EvolucaoCategoriaTab
          lancamentos={lancamentos}
          saldosIniciais={saldosIniciais}
        />
      </TabsContent>

      <TabsContent value="fluxo_anual">
        <FluxoAnualTab
          lancamentos={lancamentos}
          saldosIniciais={saldosIniciais}
          onNavigateToMovimentacao={onNavigateToMovimentacao}
        />
      </TabsContent>
    </Tabs>
  );
}
