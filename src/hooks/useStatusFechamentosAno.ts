/**
 * Hook: useStatusFechamentosAno
 *
 * Orquestrador da visão anual. Aplica as MESMAS funções determinísticas
 * e produz a MESMA estrutura Pendencia[] do useStatusZootecnico,
 * garantindo espelhamento perfeito entre Central e Status do Mês.
 */
import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useCliente } from '@/contexts/ClienteContext';
import type { Lancamento, SaldoInicial } from '@/types/cattle';
import type { Pendencia, StatusGeral } from '@/hooks/useStatusZootecnico';
import {
  statusFinanceiro as calcStatusFinanceiro,
  statusCategorias as calcStatusCategorias,
  statusPastos as calcStatusPastos,
  statusValor as calcStatusValor,
} from '@/lib/calculos/statusMensal';

export type StatusMes = 'oficial' | 'provisorio' | 'bloqueado' | 'nao_iniciado';

export interface MesStatus {
  mes: string; // '01'..'12'
  statusMes: StatusMes;
  statusGeral: StatusGeral;
  pendencias: Pendencia[];
  contadores: { aberto: number; parcial: number; fechado: number };
}

export function useStatusFechamentosAno(
  fazendaId: string | undefined,
  ano: string,
  lancamentos: Lancamento[] = [],
  saldosIniciais: SaldoInicial[] = [],
) {
  const { clienteAtual } = useCliente();
  const [data, setData] = useState<MesStatus[]>([]);
  const [loading, setLoading] = useState(false);

  const refetch = useCallback(async () => {
    if (!fazendaId || fazendaId === '__global__') {
      setData([]);
      return;
    }

    setLoading(true);

    try {
      const anoInicio = `${ano}-01`;
      const anoFim = `${ano}-12`;

      // ── Batch data fetch (same tables as useStatusZootecnico) ──
      const [pastosRes, fpRes, vrRes, finFechRes, finLancRes, catsRes, zootViewRes] = await Promise.all([
        supabase
          .from('pastos')
          .select('id, data_inicio')
          .eq('fazenda_id', fazendaId)
          .eq('ativo', true)
          .eq('entra_conciliacao', true),
        supabase
          .from('fechamento_pastos')
          .select('id, status, pasto_id, ano_mes, updated_at')
          .eq('fazenda_id', fazendaId)
          .gte('ano_mes', anoInicio)
          .lte('ano_mes', anoFim),
        supabase
          .from('valor_rebanho_mensal')
          .select('ano_mes, categoria')
          .eq('fazenda_id', fazendaId)
          .gte('ano_mes', anoInicio)
          .lte('ano_mes', anoFim),
        clienteAtual?.id
          ? supabase
              .from('financeiro_fechamentos')
              .select('status_fechamento, ano_mes')
              .eq('cliente_id', clienteAtual.id)
              .eq('fazenda_id', fazendaId)
              .gte('ano_mes', anoInicio)
              .lte('ano_mes', anoFim)
          : Promise.resolve({ data: [] }),
        clienteAtual?.id
          ? supabase
              .from('financeiro_lancamentos_v2')
              .select('ano_mes')
              .eq('cliente_id', clienteAtual.id)
              .eq('fazenda_id', fazendaId)
              .eq('cancelado', false)
              .gte('ano_mes', anoInicio)
              .lte('ano_mes', anoFim)
          : Promise.resolve({ data: [] }),
        supabase.from('categorias_rebanho').select('id, codigo'),
        // FONTE OFICIAL: vw_zoot_categoria_mensal para saldos
        supabase
          .from('vw_zoot_categoria_mensal' as any)
          .select('mes, categoria_codigo, saldo_final')
          .eq('fazenda_id', fazendaId)
          .eq('ano', Number(ano))
          .eq('cenario', 'realizado'),
      ]);

      const fpData = fpRes.data || [];
      const fpIds = fpData.map((f) => f.id);
      let itensData: Array<{ fechamento_id: string; quantidade: number; categoria_id: string }> = [];

      if (fpIds.length > 0) {
        const { data: itens } = await supabase
          .from('fechamento_pasto_itens')
          .select('fechamento_id, quantidade, categoria_id')
          .in('fechamento_id', fpIds)
          .gt('quantidade', 0);
        itensData = itens || [];
      }

      const activePastoIds = new Set((pastosRes.data || []).map((p) => p.id));
      const totalPastos = activePastoIds.size;
      const idToCodigo = new Map((catsRes.data || []).map((c) => [c.id, c.codigo]));

      // Build saldo map from official view per month
      const zootRows = ((zootViewRes.data || []) as unknown as Array<{ mes: number; categoria_codigo: string; saldo_final: number }>);
      const saldoOficialPorMes = new Map<number, Map<string, number>>();
      zootRows.forEach((r) => {
        if (!saldoOficialPorMes.has(r.mes)) saldoOficialPorMes.set(r.mes, new Map());
        const m = saldoOficialPorMes.get(r.mes)!;
        m.set(r.categoria_codigo, (m.get(r.categoria_codigo) || 0) + r.saldo_final);
      });

      // Group itens by fechamento
      const itensByFechamento = new Map<string, Array<{ quantidade: number; categoria_id: string }>>();
      itensData.forEach((item) => {
        const list = itensByFechamento.get(item.fechamento_id) || [];
        list.push(item);
        itensByFechamento.set(item.fechamento_id, list);
      });

      // Group fechamento_pastos by month
      const fechamentosByMes = new Map<string, typeof fpData>();
      fpData.forEach((fp) => {
        const list = fechamentosByMes.get(fp.ano_mes) || [];
        list.push(fp);
        fechamentosByMes.set(fp.ano_mes, list);
      });

      // Group valor_rebanho by month
      const valorByMes = new Map<string, number>();
      (vrRes.data || []).forEach((item) => {
        valorByMes.set(item.ano_mes, (valorByMes.get(item.ano_mes) || 0) + 1);
      });

      // Group financeiro_fechamentos by month
      const finFechByMes = new Map<string, Array<{ status_fechamento: string }>>();
      ((finFechRes as { data?: Array<{ status_fechamento: string; ano_mes: string }> }).data || []).forEach((item) => {
        const list = finFechByMes.get(item.ano_mes) || [];
        list.push({ status_fechamento: item.status_fechamento });
        finFechByMes.set(item.ano_mes, list);
      });

      // Set of months with financeiro lancamentos
      const finLancMes = new Set(
        (((finLancRes as { data?: Array<{ ano_mes: string }> }).data) || []).map((item) => item.ano_mes),
      );

      // ── Process each month (same logic as useStatusZootecnico) ──
      const meses: MesStatus[] = Array.from({ length: 12 }, (_, index) => {
        const mesNumero = index + 1;
        const mes = String(mesNumero).padStart(2, '0');
        const anoMes = `${ano}-${mes}`;
        const fechamentosMes = fechamentosByMes.get(anoMes) || [];

        // Deduplicate: most recent fechamento per active pasto (same as useStatusZootecnico)
        const fechamentoMaisRecentePorPasto = new Map<string, { id: string; status: string; updated_at: string | null }>();
        fechamentosMes.forEach((f) => {
          if (!activePastoIds.has(f.pasto_id)) return;
          const atual = fechamentoMaisRecentePorPasto.get(f.pasto_id);
          const tsAtual = atual?.updated_at || '';
          const tsNovo = f.updated_at || '';
          if (!atual || tsNovo >= tsAtual) {
            fechamentoMaisRecentePorPasto.set(f.pasto_id, { id: f.id, status: f.status, updated_at: f.updated_at });
          }
        });

        const fechamentosValidos = Array.from(fechamentoMaisRecentePorPasto.values());
        const fechIds = fechamentosValidos.map((f) => f.id);
        const pastosFechados = fechamentosValidos.filter((f) => f.status === 'fechado').length;
        const pastosComRegistro = fechamentosValidos.length;
        const pastosRascunho = Math.max(pastosComRegistro - pastosFechados, 0);
        const pastosNaoIniciados = Math.max(totalPastos - pastosComRegistro, 0);

        // Saldo oficial — FONTE ÚNICA: vw_zoot_categoria_mensal
        const saldoMap = saldoOficialPorMes.get(mesNumero) || new Map<string, number>();
        const catsComSaldo = Array.from(saldoMap.entries()).filter(([, q]) => q > 0);
        const categoriasComSaldo = catsComSaldo.length;

        // Alocado nos pastos
        const itensMes = fechIds.flatMap((id) => itensByFechamento.get(id) || []);
        const temItensPastos = itensMes.length > 0;
        const alocadoPastos = new Map<string, number>();
        itensMes.forEach((item) => {
          const codigo = idToCodigo.get(item.categoria_id);
          if (codigo) {
            alocadoPastos.set(codigo, (alocadoPastos.get(codigo) || 0) + item.quantidade);
          }
        });

        // ── 1. Financeiro (IDENTICAL to useStatusZootecnico) ──
        const statusFin = calcStatusFinanceiro({
          fechamentos: finFechByMes.get(anoMes) || [],
          totalFazendasEsperadas: 1,
        });
        const finTemLancamentos = finLancMes.has(anoMes);

        let descFin = '';
        if (statusFin === 'fechado') descFin = 'Mês realizado';
        else if (statusFin === 'parcial') descFin = 'Parcialmente realizado';
        else if (finTemLancamentos) descFin = 'Pendente de conciliação';
        else descFin = 'Sem lançamentos no período';

        // ── 2. Categorias (IDENTICAL to useStatusZootecnico) ──
        const catsResult = calcStatusCategorias({
          saldoOficial: new Map(catsComSaldo),
          alocadoPastos,
          temItensPastos,
          pastosAtivos: totalPastos,
        });

        let descCats = '';
        if (catsResult.status === 'fechado') {
          descCats = catsResult.saldoTotalOficial === 0 && !temItensPastos ? 'Nada a conciliar' : 'Categorias conciliadas';
        } else if (catsResult.status === 'parcial') {
          descCats = `${catsResult.catsDivergentes} categoria(s) com compensação cruzada`;
        } else {
          descCats = temItensPastos || catsResult.saldoTotalOficial > 0
            ? `${catsResult.catsDivergentes} categoria(s) divergente(s) · ${catsResult.difTotalCabecas} cab`
            : 'Sem dados de pastos';
        }

        // ── 3. Pastos (IDENTICAL to useStatusZootecnico) ──
        const statusPastosCalc = calcStatusPastos({
          totalPastos,
          pastosFechados,
          pastosComRegistro,
          statusCategorias: catsResult.status,
        });

        let descPastos = '';
        if (totalPastos === 0) {
          descPastos = 'Nenhum pasto cadastrado';
        } else if (statusPastosCalc === 'fechado') {
          descPastos = `${pastosFechados} fechado(s) · realizado`;
        } else if (statusPastosCalc === 'parcial') {
          if (pastosFechados >= totalPastos) {
            descPastos = `Pastos fechados · ${catsResult.difTotalCabecas} cab divergente(s)`;
          } else {
            descPastos = `${pastosFechados}/${totalPastos} fechado(s)`;
          }
        } else {
          const parts: string[] = [];
          if (pastosRascunho > 0) parts.push(`${pastosRascunho} em rascunho`);
          if (pastosNaoIniciados > 0) parts.push(`${pastosNaoIniciados} não iniciado(s)`);
          descPastos = parts.length ? parts.join(' · ') : 'Sem fechamento no período';
        }

        // ── 4. Valor do Rebanho (IDENTICAL to useStatusZootecnico) ──
        const precosDefinidos = valorByMes.get(anoMes) || 0;
        const statusValorCalc = calcStatusValor({
          precosDefinidos,
          categoriasComSaldo,
        });

        let descValor = '';
        if (statusValorCalc === 'aberto') descValor = 'Nenhum preço definido';
        else if (statusValorCalc === 'parcial') descValor = `${precosDefinidos}/${categoriasComSaldo} categorias com preço`;
        else descValor = 'Preços completos';

        // ── 5. Econômico (DERIVADO dos pilares operacionais — reflete a base, não decide) ──
        const pilaresOperacionais = [statusPastosCalc, catsResult.status, statusValorCalc];
        const statusEcon = pilaresOperacionais.every((s) => s === 'fechado')
          ? 'fechado'
          : pilaresOperacionais.every((s) => s === 'aberto')
            ? 'aberto'
            : 'parcial';
        const descEcon = statusEcon === 'fechado'
          ? 'Base validada'
          : statusEcon === 'parcial'
            ? 'Aguardando fechamento das bases'
            : 'Bases não fechadas';

        /**
         * ORDEM OFICIAL DOS PILARES (padronizada em todas as telas):
         *   1. Pastos  2. Rebanho conciliado  3. Valor do rebanho
         *   4. Financeiro caixa (INFORMATIVO)  5. Resultado final (DERIVADO)
         */
        const pendencias: Pendencia[] = [
          { id: 'pastos', label: 'Fechamento de Pastos', descricao: descPastos, status: statusPastosCalc, resolverTab: 'fechamento' },
          { id: 'categorias', label: 'Conciliação de Categorias', descricao: descCats, status: catsResult.status, resolverTab: 'fechamento' },
          { id: 'valor', label: 'Valor do Rebanho', descricao: descValor, status: statusValorCalc, resolverTab: 'valor_rebanho' },
          { id: 'financeiro', label: 'Conciliação do Financeiro', descricao: descFin, status: statusFin, resolverTab: 'fin_caixa' },
          { id: 'economico', label: 'Econômico', descricao: descEcon, status: statusEcon },
        ];

        // ── Contadores ──
        const contadores = { aberto: 0, parcial: 0, fechado: 0 };
        pendencias.forEach((p) => contadores[p.status]++);

        // ── STATUS GERAL DO MÊS ──
        // REGRA DE PRODUTO (IDENTICAL to useStatusZootecnico):
        //   • Apenas os 3 PILARES OPERACIONAIS: Pastos, Categorias, Valor
        //   • Financeiro = informativo. Econômico = derivado. Nenhum trava.
        let statusGeral: StatusGeral = 'parcial';
        if (pilaresOperacionais.every((s) => s === 'fechado')) statusGeral = 'fechado';
        else if (pilaresOperacionais.every((s) => s === 'aberto')) statusGeral = 'aberto';

        // ── StatusMes (UI classification derived from statusGeral) ──
        const hasAnyStarted =
          finTemLancamentos ||
          pastosComRegistro > 0 ||
          precosDefinidos > 0 ||
          pendencias.some((p) => p.status === 'parcial' || p.status === 'fechado');

        let statusMes: StatusMes = 'provisorio';
        if (statusGeral === 'fechado') statusMes = 'oficial';
        else if (!hasAnyStarted) statusMes = 'nao_iniciado';
        else if (catsResult.status === 'aberto' && catsResult.catsDivergentes > 0) statusMes = 'bloqueado';

        return {
          mes,
          statusMes,
          statusGeral,
          pendencias,
          contadores,
        };
      });

      setData(meses);
    } catch {
      setData([]);
    } finally {
      setLoading(false);
    }
  }, [fazendaId, ano, clienteAtual?.id, lancamentos, saldosIniciais]);

  useEffect(() => {
    refetch();
  }, [refetch]);

  return { meses: data, loading, refetch };
}
