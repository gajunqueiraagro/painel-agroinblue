/**
 * Hook: useStatusFechamentosAno
 *
 * Usa a mesma metodologia determinística do Status do Mês
 * para consolidar os 12 meses do ano em uma visão anual.
 */
import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useCliente } from '@/contexts/ClienteContext';
import type { Lancamento, SaldoInicial } from '@/types/cattle';
import { calcSaldoPorCategoriaLegado } from '@/lib/calculos/zootecnicos';
import {
  statusFinanceiro as calcStatusFinanceiro,
  statusCategorias as calcStatusCategorias,
  statusPastos as calcStatusPastos,
  statusValor as calcStatusValor,
  type StatusCor,
} from '@/lib/calculos/statusMensal';

export type StatusMes = 'oficial' | 'provisorio' | 'bloqueado' | 'nao_iniciado';

export interface MesAcao {
  id: 'categorias' | 'pastos' | 'valor' | 'financeiro' | 'economico';
  label: string;
  descricao: string;
  status: StatusCor;
  resolverTab?: string;
}

export interface MesStatus {
  mes: string; // '01'..'12'
  status: StatusMes;
  motivo?: string;
  divergencias?: number;
  detalheFechados?: number;
  detalheTotal?: number;
  descricao?: string;
  proximaAcao?: string | null;
  contadores?: {
    aberto: number;
    parcial: number;
    fechado: number;
  };
  etapas?: {
    financeiro: StatusCor;
    pastos: StatusCor;
    categorias: StatusCor;
    valor: StatusCor;
    economico: StatusCor;
  };
  acoes?: MesAcao[];
}

interface AcaoInterna extends MesAcao {
  prioridade: number;
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

      const [pastosRes, fpRes, vrRes, finFechRes, finLancRes, catsRes] = await Promise.all([
        supabase
          .from('pastos')
          .select('id')
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

      const itensByFechamento = new Map<string, Array<{ quantidade: number; categoria_id: string }>>();
      itensData.forEach((item) => {
        const list = itensByFechamento.get(item.fechamento_id) || [];
        list.push(item);
        itensByFechamento.set(item.fechamento_id, list);
      });

      const fechamentosByMes = new Map<string, typeof fpData>();
      fpData.forEach((fp) => {
        const list = fechamentosByMes.get(fp.ano_mes) || [];
        list.push(fp);
        fechamentosByMes.set(fp.ano_mes, list);
      });

      const valorByMes = new Map<string, number>();
      (vrRes.data || []).forEach((item) => {
        valorByMes.set(item.ano_mes, (valorByMes.get(item.ano_mes) || 0) + 1);
      });

      const finFechByMes = new Map<string, Array<{ status_fechamento: string }>>();
      ((finFechRes as { data?: Array<{ status_fechamento: string; ano_mes: string }> }).data || []).forEach((item) => {
        const list = finFechByMes.get(item.ano_mes) || [];
        list.push({ status_fechamento: item.status_fechamento });
        finFechByMes.set(item.ano_mes, list);
      });

      const finLancMes = new Set(
        (((finLancRes as { data?: Array<{ ano_mes: string }> }).data) || []).map((item) => item.ano_mes),
      );

      const meses: MesStatus[] = Array.from({ length: 12 }, (_, index) => {
        const mesNumero = index + 1;
        const mes = String(mesNumero).padStart(2, '0');
        const anoMes = `${ano}-${mes}`;
        const fechamentosMes = fechamentosByMes.get(anoMes) || [];

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

        const saldoMap = calcSaldoPorCategoriaLegado(saldosIniciais, lancamentos, Number(ano), mesNumero);
        const catsComSaldo = Array.from(saldoMap.entries()).filter(([, q]) => q > 0);
        const categoriasComSaldo = catsComSaldo.length;

        const itensMes = fechIds.flatMap((id) => itensByFechamento.get(id) || []);
        const temItensPastos = itensMes.length > 0;
        const alocadoPastos = new Map<string, number>();
        itensMes.forEach((item) => {
          const codigo = idToCodigo.get(item.categoria_id);
          if (codigo) {
            alocadoPastos.set(codigo, (alocadoPastos.get(codigo) || 0) + item.quantidade);
          }
        });

        const catsResult = calcStatusCategorias({
          saldoOficial: new Map(catsComSaldo),
          alocadoPastos,
          temItensPastos,
          pastosAtivos: totalPastos,
        });

        const statusFinanceiro = calcStatusFinanceiro({
          fechamentos: finFechByMes.get(anoMes) || [],
          totalFazendasEsperadas: 1,
        });
        const finTemLancamentos = finLancMes.has(anoMes);

        const statusPastos = calcStatusPastos({
          totalPastos,
          pastosFechados,
          pastosComRegistro,
          statusCategorias: catsResult.status,
        });

        const precosDefinidos = valorByMes.get(anoMes) || 0;
        const statusValor = calcStatusValor({
          precosDefinidos,
          categoriasComSaldo,
        });

        const baseStatuses: StatusCor[] = [statusFinanceiro, statusPastos, catsResult.status, statusValor];
        const statusEconomico: StatusCor = baseStatuses.every((s) => s === 'fechado')
          ? 'fechado'
          : baseStatuses.every((s) => s === 'aberto')
            ? 'aberto'
            : 'parcial';

        let descFin = '';
        if (statusFinanceiro === 'fechado') descFin = 'Mês realizado';
        else if (statusFinanceiro === 'parcial') descFin = 'Parcialmente realizado';
        else if (finTemLancamentos) descFin = 'Pendente de conciliação';
        else descFin = 'Sem lançamentos no período';

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

        let descPastos = '';
        if (totalPastos === 0) {
          descPastos = 'Nenhum pasto cadastrado';
        } else if (statusPastos === 'fechado') {
          descPastos = `${pastosFechados} fechado(s) · realizado`;
        } else if (statusPastos === 'parcial') {
          if (pastosFechados >= totalPastos) {
            descPastos = `Pastos fechados · ${catsResult.difTotalCabecas} cab divergente(s)`;
          } else {
            descPastos = `${pastosFechados}/${totalPastos} fechado(s)`;
          }
        } else {
          const partes: string[] = [];
          const rascunho = Math.max(pastosComRegistro - pastosFechados, 0);
          const naoIniciados = Math.max(totalPastos - pastosComRegistro, 0);
          if (rascunho > 0) partes.push(`${rascunho} em rascunho`);
          if (naoIniciados > 0) partes.push(`${naoIniciados} não iniciado(s)`);
          descPastos = partes.length ? partes.join(' · ') : 'Sem fechamento no período';
        }

        let descValor = '';
        if (statusValor === 'aberto') descValor = 'Nenhum preço definido';
        else if (statusValor === 'parcial') descValor = `${precosDefinidos}/${categoriasComSaldo} categorias com preço`;
        else descValor = 'Preços completos';

        const descEconomico = statusEconomico === 'fechado'
          ? 'Base validada'
          : statusEconomico === 'parcial'
            ? 'Aguardando fechamento das bases'
            : 'Bases não fechadas';

        const acoes: AcaoInterna[] = [];
        if (catsResult.status !== 'fechado') {
          acoes.push({
            id: 'categorias',
            label: 'Rebanho conciliado',
            descricao: descCats,
            status: catsResult.status,
            resolverTab: 'fechamento',
            prioridade: catsResult.status === 'aberto' ? 0 : 1,
          });
        }
        if (statusPastos !== 'fechado') {
          acoes.push({
            id: 'pastos',
            label: 'Pastos',
            descricao: descPastos,
            status: statusPastos,
            resolverTab: 'fechamento',
            prioridade: statusPastos === 'aberto' ? 2 : 3,
          });
        }
        if (statusValor !== 'fechado') {
          acoes.push({
            id: 'valor',
            label: 'Valor do rebanho',
            descricao: descValor,
            status: statusValor,
            resolverTab: 'valor_rebanho',
            prioridade: statusValor === 'aberto' ? 4 : 5,
          });
        }
        if (statusFinanceiro !== 'fechado') {
          acoes.push({
            id: 'financeiro',
            label: 'Financeiro caixa',
            descricao: descFin,
            status: statusFinanceiro,
            resolverTab: 'fin_caixa',
            prioridade: statusFinanceiro === 'aberto' ? 6 : 7,
          });
        }
        if (statusEconomico !== 'fechado') {
          acoes.push({
            id: 'economico',
            label: 'Resultado final',
            descricao: descEconomico,
            status: statusEconomico,
            prioridade: 8,
          });
        }
        acoes.sort((a, b) => a.prioridade - b.prioridade);

        const contadores = { aberto: 0, parcial: 0, fechado: 0 };
        [statusFinanceiro, statusPastos, catsResult.status, statusValor, statusEconomico].forEach((status) => {
          contadores[status]++;
        });

        const hasAnyStarted =
          finTemLancamentos ||
          pastosComRegistro > 0 ||
          precosDefinidos > 0 ||
          [statusFinanceiro, statusPastos, catsResult.status, statusValor, statusEconomico].some(
            (status) => status === 'parcial' || status === 'fechado',
          );

        let statusMes: StatusMes = 'provisorio';
        if (contadores.fechado === 5) statusMes = 'oficial';
        else if (!hasAnyStarted) statusMes = 'nao_iniciado';
        else if (catsResult.status === 'aberto' && catsResult.catsDivergentes > 0) statusMes = 'bloqueado';
        else statusMes = 'provisorio';

        let motivo: string | undefined;
        let proximaAcao: string | null = null;

        if (catsResult.status !== 'fechado') {
          motivo = 'divergencia_rebanho';
          proximaAcao = catsResult.catsDivergentes > 0 ? 'Corrigir divergência de rebanho' : 'Conciliar rebanho do mês';
        } else if (statusPastos !== 'fechado') {
          motivo = pastosComRegistro === 0 ? 'sem_pastos_fechados' : 'pastos_pendentes';
          proximaAcao = 'Fechar pastos do período';
        } else if (statusValor !== 'fechado') {
          motivo = 'valor_rebanho_pendente';
          proximaAcao = 'Informar valor do rebanho';
        } else if (statusFinanceiro !== 'fechado') {
          motivo = 'financeiro_pendente';
          proximaAcao = 'Finalizar financeiro do mês';
        } else if (statusEconomico !== 'fechado') {
          motivo = 'resultado_pendente';
          proximaAcao = 'Concluir resultado final';
        }

        return {
          mes,
          status: statusMes,
          motivo,
          divergencias: catsResult.catsDivergentes,
          detalheFechados: pastosFechados,
          detalheTotal: totalPastos,
          descricao:
            statusMes === 'oficial'
              ? 'Mês conciliado e validado'
              : statusMes === 'bloqueado'
                ? 'Pendências impedem o fechamento do mês'
                : statusMes === 'provisorio'
                  ? 'Fechamento parcial em andamento'
                  : 'Nenhuma etapa iniciada',
          proximaAcao,
          contadores,
          etapas: {
            financeiro: statusFinanceiro,
            pastos: statusPastos,
            categorias: catsResult.status,
            valor: statusValor,
            economico: statusEconomico,
          },
          acoes: acoes.map(({ prioridade, ...acao }) => acao),
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
