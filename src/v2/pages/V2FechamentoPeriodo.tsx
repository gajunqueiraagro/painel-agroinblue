/**
 * V2FechamentoPeriodo.tsx — Tela cockpit Fechamento do Período (Marco 2.4 MVP).
 *
 * Orquestra:
 *  - Carrega lista de meses P1 fechados (cliente) para calcular default de período
 *  - Aplica filtro de período (input month start/end)
 *  - Chama useFechamentoPeriodoData para fetch + DTO
 *  - Renderiza 5 sub-páginas imprimíveis (Capa, EvolucaoOperacao,
 *    AnaliseZootecnica, FluxoCaixa, DesembolsoProducao, ResumoGlobal)
 *  - Botão "Gerar PDF" chama window.print()
 */

import { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useCliente } from '@/contexts/ClienteContext';
import { useFazenda } from '@/contexts/FazendaContext';
import { useFechamentoPeriodoData } from '@/v2/hooks/useFechamentoPeriodoData';
import { calcularDefaultPeriodo } from '@/v2/lib/calcularDefaultPeriodo';
import type { StatusPilarMensal } from '@/v2/types/fechamentoPeriodo';
import HeaderFiltro from './V2FechamentoPeriodo.parts/HeaderFiltro';
import Capa from './V2FechamentoPeriodo.parts/Capa';
import ResultadoDestaque from './V2FechamentoPeriodo.parts/ResultadoDestaque';
import Cap04_MargemPorArroba from './V2FechamentoPeriodo.parts/Cap04_MargemPorArroba';
import EvolucaoOperacao from './V2FechamentoPeriodo.parts/EvolucaoOperacao';
import AnaliseZootecnica from './V2FechamentoPeriodo.parts/AnaliseZootecnica';
import FluxoCaixa from './V2FechamentoPeriodo.parts/FluxoCaixa';
import DesembolsoProducao from './V2FechamentoPeriodo.parts/DesembolsoProducao';
import ResumoGlobal from './V2FechamentoPeriodo.parts/ResumoGlobal';
import './V2FechamentoPeriodo.parts/printStyles.css';

export default function V2FechamentoPeriodo() {
  const { clienteAtual } = useCliente();
  const { fazendaAtual, isGlobal, fazendasComPecuaria } = useFazenda();

  const clienteId = clienteAtual?.id;

  // Carrega lista de meses P1 fechados (cliente inteiro) para calcular default.
  // Paginação obrigatória: Supabase REST limita 1000 linhas por chamada e
  // fechamento_pastos pode ter milhares de linhas (1 por pasto × mês).
  const statusPilDefault = useQuery<StatusPilarMensal[]>({
    queryKey: ['default-period-pilares', clienteId],
    enabled: !!clienteId,
    queryFn: async () => {
      const todos: Array<{ fazenda_id: string; ano_mes: string }> = [];
      let offset = 0;
      const PAGE = 1000;
      while (true) {
        const { data, error } = await (supabase
          .from('fechamento_pastos')
          .select('fazenda_id, ano_mes') as any)
          .eq('cliente_id', clienteId!)
          .eq('status', 'fechado')
          .order('ano_mes', { ascending: false })
          .range(offset, offset + PAGE - 1);
        if (error) throw error;
        if (!data || data.length === 0) break;
        todos.push(...(data as Array<{ fazenda_id: string; ano_mes: string }>));
        if (data.length < PAGE) break;
        offset += PAGE;
        if (offset > 50000) break; // safeguard contra loop infinito
      }
      return todos.map(r => ({
        fazenda_id: r.fazenda_id,
        ano_mes: r.ano_mes,
        p1_oficial: true,
        p2_oficial: false,
      }));
    },
    staleTime: 5 * 60 * 1000,
  });

  const [periodo, setPeriodo] = useState({ periodoInicio: '', periodoFim: '' });

  useEffect(() => {
    if (periodo.periodoInicio) return;
    if (!statusPilDefault.data) return;
    const fids = (fazendasComPecuaria ?? []).map(f => f.id);
    const d = calcularDefaultPeriodo(statusPilDefault.data, fids);
    setPeriodo(d);
  }, [statusPilDefault.data, fazendasComPecuaria, periodo.periodoInicio]);

  const { dto, loading, error } = useFechamentoPeriodoData({
    periodoInicio: periodo.periodoInicio,
    periodoFim: periodo.periodoFim,
  });

  if (!periodo.periodoInicio) {
    return <div className="p-4 text-sm text-muted-foreground">Carregando filtros…</div>;
  }

  const nomeFazenda = isGlobal ? 'Global' : (fazendaAtual?.nome ?? '—');

  return (
    <div className="fechamento-container px-4 py-4">
      <HeaderFiltro
        periodoInicio={periodo.periodoInicio}
        periodoFim={periodo.periodoFim}
        onChange={(ini, fim) => setPeriodo({ periodoInicio: ini, periodoFim: fim })}
        onImprimir={() => window.print()}
        loading={loading}
      />

      {loading && (
        <div className="p-4 text-sm text-muted-foreground">Carregando dados do fechamento…</div>
      )}
      {error && (
        <div className="p-4 text-sm text-red-600">Erro: {String((error as Error)?.message ?? error)}</div>
      )}

      {dto && (
        <div className="fechamento-print-area">
          <Capa dto={dto} nomeCliente={clienteAtual?.nome} nomeFazenda={nomeFazenda} />
          <ResultadoDestaque dto={dto} />
          <Cap04_MargemPorArroba dto={dto} />
          <EvolucaoOperacao dto={dto} />
          <AnaliseZootecnica dto={dto} />
          <FluxoCaixa dto={dto} />
          <DesembolsoProducao dto={dto} />
          <ResumoGlobal dto={dto} />
        </div>
      )}
    </div>
  );
}
