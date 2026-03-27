import { useState } from 'react';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Lancamento, SaldoInicial } from '@/types/cattle';
import { FinanceiroTab, type SubAba } from './FinanceiroTab';
import { EvolucaoCategoriaTab } from './EvolucaoCategoriaTab';

interface Props {
  lancamentos: Lancamento[];
  saldosIniciais: SaldoInicial[];
  onEditar?: (id: string, dados: Partial<Omit<Lancamento, 'id'>>) => void;
  onRemover?: (id: string) => void;
}

/**
 * Tela de Movimentações do Rebanho com duas abas:
 * - Por Tipo: movimentações agrupadas por tipo (Nascimentos, Compras, Vendas, etc.)
 * - Por Categoria: movimentações agrupadas por categoria com totais por período
 */
export function MovimentacaoTab({ lancamentos, saldosIniciais, onEditar, onRemover }: Props) {
  const [activeTab, setActiveTab] = useState('por_tipo');

  return (
    <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
      <TabsList className="w-full grid grid-cols-2 mx-4 mt-2" style={{ maxWidth: 'calc(100% - 2rem)' }}>
        <TabsTrigger value="por_tipo" className="text-xs font-bold">Por Tipo</TabsTrigger>
        <TabsTrigger value="por_categoria" className="text-xs font-bold">Por Categoria</TabsTrigger>
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
    </Tabs>
  );
}
