import { useState, useCallback } from 'react';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { useRedirecionarPecuaria } from '@/hooks/useRedirecionarPecuaria';
import { FinanceiroTab } from './FinanceiroTab';
import { FluxoAnualTab } from './FluxoAnualTab';
import { ValorRebanhoTab } from './ValorRebanhoTab';
import { EvolucaoCategoriaTab } from './EvolucaoCategoriaTab';
import { Lancamento, SaldoInicial } from '@/types/cattle';
import type { SubAba } from './FinanceiroTab';

interface Props {
  lancamentos: Lancamento[];
  saldosIniciais: SaldoInicial[];
  onNavigateToMovimentacao?: (subAba: SubAba, opts?: { ano?: string; mes?: string; label?: string; status?: string }) => void;
  onEditar?: (id: string, dados: Partial<Omit<Lancamento, 'id'>>) => void;
  onRemover?: (id: string) => void;
  filtroAnoInicial?: string;
  filtroMesInicial?: number;
  onNavigateToReclass?: (filtro?: { ano: string; mes: number; cenario?: 'realizado' | 'meta' }) => void;
  onEditarAbate?: (lancamento: Lancamento, context?: { subAba: SubAba; statusFiltro: string; anoFiltro: string; mesFiltro: string }) => void;
  onEditarVenda?: (lancamento: Lancamento, context?: { subAba: SubAba; statusFiltro: string; anoFiltro: string; mesFiltro: string }) => void;
  onEditarCompra?: (lancamento: Lancamento, context?: { subAba: SubAba; statusFiltro: string; anoFiltro: string; mesFiltro: string }) => void;
  onEditarMorte?: (lancamento: Lancamento, context?: { subAba: SubAba; statusFiltro: string; anoFiltro: string; mesFiltro: string }) => void;
  onEditarConsumo?: (lancamento: Lancamento, context?: { subAba: SubAba; statusFiltro: string; anoFiltro: string; mesFiltro: string }) => void;
}

export function EvolucaoRebanhoHubTab({ lancamentos, saldosIniciais, onNavigateToMovimentacao, onEditar, onRemover, filtroAnoInicial, filtroMesInicial, onNavigateToReclass, onEditarAbate, onEditarVenda, onEditarCompra, onEditarMorte, onEditarConsumo }: Props) {
  const { bloqueado } = useRedirecionarPecuaria();
  const [activeTab, setActiveTab] = useState('movimentacoes');

  // Filtros injetados na aba "Movimentações" (FinanceiroTab) ao clicar numa célula da Evol. Cat.
  const [movSubAba, setMovSubAba] = useState<SubAba | undefined>(undefined);
  const [movAno, setMovAno] = useState<string | undefined>(undefined);
  const [movMes, setMovMes] = useState<string | undefined>(undefined);
  const [movStatus, setMovStatus] = useState<string | undefined>(undefined);

  const handleNavigateToEvolCatLista = useCallback((filtro: { ano: string; mes: number; cenario: 'realizado' | 'meta' }) => {
    setMovSubAba('historico');
    setMovAno(filtro.ano);
    setMovMes(String(filtro.mes).padStart(2, '0'));
    setMovStatus(filtro.cenario);
    setActiveTab('movimentacoes');
  }, []);

  if (bloqueado) {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-3 text-muted-foreground">
        <span className="text-4xl">🐄</span>
        <p className="font-medium text-base">Esta fazenda não possui operação pecuária</p>
        <p className="text-sm">Selecione uma fazenda com pecuária para visualizar os dados zootécnicos.</p>
      </div>
    );
  }

  return (
    <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
      <TabsList className="w-full grid grid-cols-4 mx-4 mt-2" style={{ maxWidth: 'calc(100% - 2rem)' }}>
        <TabsTrigger value="movimentacoes" className="text-[11px] px-1">Movimentações</TabsTrigger>
        <TabsTrigger value="evolucao" className="text-[11px] px-1">Evol. Rebanho</TabsTrigger>
        <TabsTrigger value="categoria" className="text-[11px] px-1">Evol. Categ.</TabsTrigger>
        <TabsTrigger value="valor" className="text-[11px] px-1">Valor Reb.</TabsTrigger>
      </TabsList>

      <TabsContent value="movimentacoes">
        <FinanceiroTab
          lancamentos={lancamentos}
          onEditar={onEditar || (() => {})}
          onRemover={onRemover || (() => {})}
          modoMovimentacao
          subAbaInicial={movSubAba}
          filtroAnoInicial={movAno}
          filtroMesInicial={movMes}
          filtroStatusInicial={movStatus}
          onEditarAbate={onEditarAbate}
          onEditarVenda={onEditarVenda}
          onEditarCompra={onEditarCompra}
          onEditarMorte={onEditarMorte}
          onEditarConsumo={onEditarConsumo}
        />
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
        <EvolucaoCategoriaTab
          initialAno={filtroAnoInicial}
          initialMes={filtroMesInicial ? String(filtroMesInicial).padStart(2, '0') : undefined}
          onNavigateToReclass={onNavigateToReclass}
          onNavigateToEvolCatLista={handleNavigateToEvolCatLista}
        />
      </TabsContent>
    </Tabs>
  );
}
