/**
 * Hook de status/pendências do painel de conferência mensal.
 * 4 pendências na ordem oficial:
 *   1. Conciliação do Financeiro
 *   2. Fechamento de Pastos (exige conciliação de categorias = 0 divergência)
 *   3. Conciliação de Categorias
 *   4. Valor do Rebanho
 *
 * Suporte a modo global (todas as fazendas).
 */
import { useState, useEffect, useCallback, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useFazenda } from '@/contexts/FazendaContext';
import { useCliente } from '@/contexts/ClienteContext';
import type { Lancamento, SaldoInicial } from '@/types/cattle';
// FONTE OFICIAL: vw_zoot_categoria_mensal (sem calcSaldoPorCategoriaLegado)
import {
  statusFinanceiro as calcStatusFinanceiro,
  statusCategorias as calcStatusCategorias,
  statusPastos as calcStatusPastos,
  statusValor as calcStatusValor,
  type StatusCor,
} from '@/lib/calculos/statusMensal';

export type StatusItem = 'aberto' | 'parcial' | 'fechado';
export type StatusGeral = 'aberto' | 'parcial' | 'fechado';

export interface Pendencia {
  id: string;
  label: string;
  descricao: string;
  status: StatusItem;
  resolverTab?: string;
}

export interface PastosFazendaStatus {
  fazendaId: string;
  fazendaNome: string;
  totalPastos: number;
  fechados: number;
  rascunho: number;
  naoIniciados: number;
  status: StatusItem;
}

export interface StatusZootecnicoResult {
  status: StatusGeral;
  pendencias: Pendencia[];
  contadores: { aberto: number; parcial: number; fechado: number };
  loading: boolean;
  pastosPorFazenda: PastosFazendaStatus[];
}

export function useStatusZootecnico(
  fazendaId: string | undefined,
  ano: number,
  mes: number,
  lancamentos: Lancamento[],
  saldosIniciais: SaldoInicial[],
): StatusZootecnicoResult {
  const { fazendas: contextFazendas } = useFazenda();
  const { clienteAtual } = useCliente();
  const [loading, setLoading] = useState(true);

  const [pastosAtivos, setPastosAtivos] = useState(0);
  const [pastosFechados, setPastosFechados] = useState(0);
  const [pastosRascunho, setPastosRascunho] = useState(0);
  const [pastosNaoIniciados, setPastosNaoIniciados] = useState(0);
  const [pastosPorFazenda, setPastosPorFazenda] = useState<PastosFazendaStatus[]>([]);
  const [precosDefinidos, setPrecosDefinidos] = useState(0);
  const [categoriasComSaldo, setCategoriasComSaldo] = useState(0);
  const [semPecuaria, setSemPecuaria] = useState(false);

  // Categorias status — computed via calcStatusCategorias (single source of truth)
  const [categoriasStatusResult, setCategoriasStatusResult] = useState<{
    status: StatusCor; catsDivergentes: number; difTotalCabecas: number; difTotalLiquida: number;
    saldoTotalOficial: number; totalAlocadoPastos: number; descricao: string;
  }>({ status: 'aberto', catsDivergentes: 0, difTotalCabecas: 0, difTotalLiquida: 0, saldoTotalOficial: 0, totalAlocadoPastos: 0, descricao: '' });

  // Financeiro state
  const [finFechamentoStatus, setFinFechamentoStatus] = useState<string | null>(null); // 'fechado' | 'aberto' | null
  const [finTemLancamentos, setFinTemLancamentos] = useState(false);

  const anoMes = `${ano}-${String(mes).padStart(2, '0')}`;
  const isGlobal = !fazendaId || fazendaId === '__global__';

  const resetZooState = useCallback(() => {
    setPastosAtivos(0);
    setPastosFechados(0);
    setPastosRascunho(0);
    setPastosNaoIniciados(0);
    setPastosPorFazenda([]);
    setPrecosDefinidos(0);
    setCategoriasComSaldo(0);
    setCategoriasStatusResult({ status: 'aberto', catsDivergentes: 0, difTotalCabecas: 0, difTotalLiquida: 0, saldoTotalOficial: 0, totalAlocadoPastos: 0, descricao: '' });
    setFinFechamentoStatus(null);
    setFinTemLancamentos(false);
  }, []);

  const load = useCallback(async () => {
    if (!fazendaId) { setLoading(false); return; }

    const fazendasPecuariaContexto = contextFazendas.filter(f => f.id !== '__global__' && f.tem_pecuaria !== false);
    const fazendaNomeById = new Map(fazendasPecuariaContexto.map(f => [f.id, f.nome]));
    const todasFazendas = contextFazendas.filter(f => f.id !== '__global__');

    let fazendaIdsPecuaria: string[] = [];
    if (isGlobal) {
      fazendaIdsPecuaria = fazendasPecuariaContexto.map(f => f.id);
    } else if (fazendaId !== '__global__') {
      const fazendaSelecionada = contextFazendas.find(f => f.id === fazendaId);
      if (fazendaSelecionada?.tem_pecuaria === false) {
        resetZooState();
        setSemPecuaria(true);
        setLoading(false);
        return;
      }
      fazendaIdsPecuaria = [fazendaId];
      if (fazendaSelecionada) fazendaNomeById.set(fazendaSelecionada.id, fazendaSelecionada.nome);
    }

    if (fazendaIdsPecuaria.length === 0) {
      resetZooState();
      setSemPecuaria(true);
      setLoading(false);
      return;
    }

    setLoading(true);
    setSemPecuaria(false);

    try {
      const fqPec = (q: any) => q.in('fazenda_id', fazendaIdsPecuaria);

      // Determine fazenda IDs for financeiro (all farms, not just pecuária)
      const fazendaIdsFin = isGlobal ? todasFazendas.map(f => f.id) : [fazendaId!];

      // Parallel fetches
      const [pastosResult, fpResult, vrResult, finFechResult, finLancResult] = await Promise.all([
        // 1. Pastos ativos com conciliação
        fqPec(supabase.from('pastos').select('id, fazenda_id').eq('ativo', true).eq('entra_conciliacao', true)),
        // 2. Fechamento de pastos no período
        fqPec(supabase.from('fechamento_pastos').select('id, status, pasto_id, fazenda_id, updated_at').eq('ano_mes', anoMes)),
        // 3. Valor rebanho
        fqPec(supabase.from('valor_rebanho_mensal').select('categoria').eq('ano_mes', anoMes)),
        // 4. Financeiro fechamentos
        clienteAtual?.id
          ? supabase.from('financeiro_fechamentos')
              .select('status_fechamento, fazenda_id')
              .eq('cliente_id', clienteAtual.id)
              .eq('ano_mes', anoMes)
              .in('fazenda_id', fazendaIdsFin)
          : Promise.resolve({ data: [] }),
        // 5. Financeiro lancamentos count for the month
        clienteAtual?.id
          ? supabase.from('financeiro_lancamentos_v2')
              .select('id', { count: 'exact', head: true })
              .eq('cliente_id', clienteAtual.id)
              .eq('cancelado', false)
              .in('fazenda_id', fazendaIdsFin)
              .eq('ano_mes', anoMes)
          : Promise.resolve({ data: [], count: 0 }),
      ]);

      const pastosData = pastosResult.data || [];
      const fpData = fpResult.data || [];

      // --- Financeiro conciliation ---
      const finFechData = finFechResult.data || [];
      const finLancCount = (finLancResult as any).count || 0;
      setFinTemLancamentos(finLancCount > 0);

      if (finFechData.length === 0) {
        setFinFechamentoStatus(null); // no record
      } else {
        // Global: all fazendas must be fechado
        const allFechado = finFechData.every((f: any) => f.status_fechamento === 'fechado');
        const someFechado = finFechData.some((f: any) => f.status_fechamento === 'fechado');
        if (allFechado && (isGlobal ? finFechData.length >= fazendaIdsFin.length : true)) {
          setFinFechamentoStatus('fechado');
        } else if (someFechado) {
          setFinFechamentoStatus('parcial');
        } else {
          setFinFechamentoStatus('aberto');
        }
      }

      // --- Pastos processing ---
      const pastosAtivosByFaz = new Map<string, Set<string>>();
      pastosData.forEach((p: any) => {
        if (!pastosAtivosByFaz.has(p.fazenda_id)) pastosAtivosByFaz.set(p.fazenda_id, new Set());
        pastosAtivosByFaz.get(p.fazenda_id)!.add(p.id);
      });

      // Deduplicação: 1 registro efetivo por pasto (mais recente)
      const fechamentoMaisRecentePorPasto = new Map<string, { status: string; updated_at: string | null }>();
      fpData.forEach((f: any) => {
        const key = `${f.fazenda_id}:${f.pasto_id}`;
        const atual = fechamentoMaisRecentePorPasto.get(key);
        const tsAtual = atual?.updated_at || '';
        const tsNovo = f.updated_at || '';
        if (!atual || tsNovo >= tsAtual) {
          fechamentoMaisRecentePorPasto.set(key, { status: f.status, updated_at: f.updated_at });
        }
      });

      const fechamentoPorFaz = new Map<string, Map<string, string>>();
      fechamentoMaisRecentePorPasto.forEach((v, key) => {
        const [fId, pastoId] = key.split(':');
        if (!fechamentoPorFaz.has(fId)) fechamentoPorFaz.set(fId, new Map());
        fechamentoPorFaz.get(fId)!.set(pastoId, v.status);
      });

      const detalhesPastos: PastosFazendaStatus[] = fazendaIdsPecuaria.map(fId => {
        const ativos = pastosAtivosByFaz.get(fId) || new Set<string>();
        const fechamentos = fechamentoPorFaz.get(fId) || new Map<string, string>();

        const total = ativos.size;
        let fechados = 0;
        let comFechamento = 0;

        ativos.forEach(pastoId => {
          const st = fechamentos.get(pastoId);
          if (!st) return;
          comFechamento++;
          if (st === 'fechado') fechados++;
        });

        const rascunho = Math.max(comFechamento - fechados, 0);
        const naoIniciados = Math.max(total - comFechamento, 0);

        let status: StatusItem = 'aberto';
        if (total > 0) {
          if (fechados === total) status = 'fechado';
          else if (fechados > 0) status = 'parcial';
          else status = 'aberto';
        }

        return {
          fazendaId: fId,
          fazendaNome: fazendaNomeById.get(fId) || fId,
          totalPastos: total,
          fechados,
          rascunho,
          naoIniciados,
          status,
        };
      });

      detalhesPastos.sort((a, b) => a.fazendaNome.localeCompare(b.fazendaNome, 'pt-BR'));
      setPastosPorFazenda(detalhesPastos);
      setPastosAtivos(detalhesPastos.reduce((s, f) => s + f.totalPastos, 0));
      setPastosFechados(detalhesPastos.reduce((s, f) => s + f.fechados, 0));
      setPastosRascunho(detalhesPastos.reduce((s, f) => s + f.rascunho, 0));
      setPastosNaoIniciados(detalhesPastos.reduce((s, f) => s + f.naoIniciados, 0));

      // --- Categorias comparison (FONTE OFICIAL: vw_zoot_categoria_mensal) ---
      // Deduplicate: keep only the most recent fechamento per pasto ATIVO
      const activePastoIds = new Set(pastosData.map((p: any) => p.id));
      const dedupFechByPasto = new Map<string, { id: string; updated_at: string }>();
      fpData.forEach((f: any) => {
        if (!activePastoIds.has(f.pasto_id)) return;
        const existing = dedupFechByPasto.get(f.pasto_id);
        if (!existing || (f.updated_at || '') >= (existing.updated_at || '')) {
          dedupFechByPasto.set(f.pasto_id, { id: f.id, updated_at: f.updated_at || '' });
        }
      });
      const fechIds = Array.from(dedupFechByPasto.values()).map(v => v.id);

      // FONTE OFICIAL: buscar saldo final por categoria da view validada
      let viewQuery = supabase
        .from('vw_zoot_categoria_mensal' as any)
        .select('categoria_codigo, saldo_final')
        .eq('ano', ano)
        .eq('mes', mes)
        .eq('cenario', 'realizado');

      if (isGlobal) {
        if (clienteAtual?.id) viewQuery = viewQuery.eq('cliente_id', clienteAtual.id);
      } else {
        viewQuery = viewQuery.eq('fazenda_id', fazendaId);
      }

      const { data: viewRows } = await viewQuery;
      const saldoMap = new Map<string, number>();
      (viewRows || []).forEach((r: any) => {
        const current = saldoMap.get(r.categoria_codigo) || 0;
        saldoMap.set(r.categoria_codigo, current + (Number(r.saldo_final) || 0));
      });
      const catsComSaldo = Array.from(saldoMap.entries()).filter(([, q]) => q > 0);
      setCategoriasComSaldo(catsComSaldo.length);

      let alocadoPastosCodigo = new Map<string, number>();
      let temItensPastos = false;

      if (fechIds.length > 0) {
        const { data: itensData } = await supabase
          .from('fechamento_pasto_itens')
          .select('quantidade, categoria_id')
          .in('fechamento_id', fechIds)
          .gt('quantidade', 0);
        const itens = itensData || [];
        temItensPastos = itens.length > 0;

        if (itens.length > 0) {
          const { data: catsData } = await supabase.from('categorias_rebanho').select('id, codigo');
          const idToCodigo = new Map((catsData || []).map((c: any) => [c.id, c.codigo]));

          itens.forEach((i: any) => {
            const codigo = idToCodigo.get(i.categoria_id);
            if (codigo) alocadoPastosCodigo.set(codigo, (alocadoPastosCodigo.get(codigo) || 0) + i.quantidade);
          });
        }
      }

      console.log(`[STATUS-ZOO] anoMes=${anoMes} fazenda=${fazendaId}`);
      console.log('[STATUS-ZOO] SALDO OFICIAL (view)', Array.from(saldoMap.entries()));
      console.log('[STATUS-ZOO] ALOCADO PASTOS (fechamento)', Array.from(alocadoPastosCodigo.entries()));

      // Use calcStatusCategorias — THE official rule
      const catsResult = calcStatusCategorias({
        saldoOficial: new Map(catsComSaldo),
        alocadoPastos: alocadoPastosCodigo,
        temItensPastos,
        pastosAtivos: pastosData.length,
      });

      // Build description
      let descCatsComputed = '';
      if (catsResult.status === 'fechado') {
        descCatsComputed = catsResult.saldoTotalOficial === 0 && !temItensPastos ? 'Nada a conciliar' : 'Categorias conciliadas';
      } else if (catsResult.status === 'parcial') {
        descCatsComputed = `${catsResult.catsDivergentes} categoria(s) com compensação cruzada`;
      } else {
        descCatsComputed = temItensPastos || catsResult.saldoTotalOficial > 0
          ? `${catsResult.catsDivergentes} categoria(s) divergente(s) · ${catsResult.difTotalCabecas} cab`
          : 'Sem dados de pastos';
      }

      setCategoriasStatusResult({
        status: catsResult.status,
        catsDivergentes: catsResult.catsDivergentes,
        difTotalCabecas: catsResult.difTotalCabecas,
        difTotalLiquida: catsResult.difTotalLiquida,
        saldoTotalOficial: catsResult.saldoTotalOficial,
        totalAlocadoPastos: catsResult.totalAlocadoPastos,
        descricao: descCatsComputed,
      });

      // Valor do rebanho (precos)
      setPrecosDefinidos((vrResult.data || []).length);
    } catch (e) {
      console.error('useStatusZootecnico error:', e);
    } finally {
      setLoading(false);
    }
  }, [fazendaId, anoMes, ano, mes, saldosIniciais, lancamentos, isGlobal, contextFazendas, clienteAtual, resetZooState]);

  useEffect(() => { load(); }, [load]);

  const result = useMemo(() => {
    const pendencias: Pendencia[] = [];

    if (semPecuaria) {
      const desc = 'Sem operação pecuária';
      const ids = ['financeiro', 'pastos', 'categorias', 'valor'];
      const labels: Record<string, string> = {
        financeiro: 'Conciliação do Financeiro',
        pastos: 'Fechamento de Pastos',
        categorias: 'Conciliação de Categorias',
        valor: 'Valor do Rebanho',
      };
      ids.forEach(id => pendencias.push({
        id, label: labels[id], descricao: desc,
        status: id === 'financeiro' ? 'aberto' : 'fechado',
        resolverTab: id === 'financeiro' ? 'fin_caixa' : undefined,
      }));
      return {
        status: 'parcial' as StatusGeral,
        pendencias,
        contadores: { aberto: 1, parcial: 0, fechado: 3 },
        loading,
        pastosPorFazenda: [],
      };
    }

    // ── Compute all statuses first, then build in STANDARD ORDER ──

    // Financeiro
    const finFechArr = finFechamentoStatus === 'fechado'
      ? [{ status_fechamento: 'fechado' }]
      : finFechamentoStatus === 'parcial'
        ? [{ status_fechamento: 'fechado' }, { status_fechamento: 'aberto' }]
        : finFechamentoStatus === 'aberto'
          ? [{ status_fechamento: 'aberto' }]
          : [];
    const statusFin: StatusItem = calcStatusFinanceiro({
      fechamentos: finFechArr,
      totalFazendasEsperadas: 1,
    });
    let descFin = '';
    if (statusFin === 'fechado') descFin = 'Mês realizado';
    else if (statusFin === 'parcial') descFin = 'Parcialmente realizado';
    else if (finTemLancamentos) descFin = 'Pendente de conciliação';
    else descFin = 'Sem lançamentos no período';

    // Categorias
    const statusCats: StatusItem = categoriasStatusResult.status;
    const descCats = categoriasStatusResult.descricao;

    // Pastos
    const fazendasComPastos = pastosPorFazenda.filter(f => f.totalPastos > 0);
    const totalPastosGeral = fazendasComPastos.reduce((s, f) => s + f.totalPastos, 0);
    const totalFechados = fazendasComPastos.reduce((s, f) => s + f.fechados, 0);
    const totalComRegistro = totalFechados + fazendasComPastos.reduce((s, f) => s + f.rascunho, 0);

    const statusPastosCalc: StatusItem = calcStatusPastos({
      totalPastos: totalPastosGeral,
      pastosFechados: totalFechados,
      pastosComRegistro: totalComRegistro,
      statusCategorias: statusCats,
    });
    let descPastos = '';
    if (totalPastosGeral === 0) {
      descPastos = 'Nenhum pasto cadastrado';
    } else if (statusPastosCalc === 'fechado') {
      descPastos = isGlobal
        ? `${fazendasComPastos.filter(f => f.status === 'fechado').length}/${fazendasComPastos.length} fazenda(s) · realizado`
        : `${pastosFechados} fechado(s) · realizado`;
    } else if (statusPastosCalc === 'parcial') {
      if (totalFechados >= totalPastosGeral) {
        descPastos = `Pastos fechados · ${categoriasStatusResult.difTotalCabecas} cab divergente(s)`;
      } else {
        descPastos = isGlobal
          ? `${fazendasComPastos.filter(f => f.status === 'fechado').length}/${fazendasComPastos.length} fazenda(s) fechada(s)`
          : `${pastosFechados}/${totalPastosGeral} fechado(s)`;
      }
    } else {
      if (isGlobal) {
        descPastos = `0/${fazendasComPastos.length} fazenda(s) fechada(s)`;
      } else {
        const parts: string[] = [];
        if (pastosRascunho > 0) parts.push(`${pastosRascunho} em rascunho`);
        if (pastosNaoIniciados > 0) parts.push(`${pastosNaoIniciados} não iniciado(s)`);
        descPastos = parts.length ? parts.join(' · ') : 'Sem fechamento no período';
      }
    }

    // Valor do Rebanho
    const statusValorCalc: StatusItem = calcStatusValor({
      precosDefinidos,
      categoriasComSaldo,
    });
    let descValor = '';
    if (statusValorCalc === 'aberto') descValor = 'Nenhum preço definido';
    else if (statusValorCalc === 'parcial') descValor = `${precosDefinidos}/${categoriasComSaldo} categorias com preço`;
    else descValor = 'Preços completos';

    /**
     * ORDEM OFICIAL DOS PILARES (padronizada em todas as telas):
     *   1. Pastos  2. Rebanho conciliado  3. Valor do rebanho
     *   4. Financeiro caixa (INFORMATIVO)  5. Resultado final (DERIVADO)
     */
    pendencias.push({ id: 'pastos', label: 'Fechamento de Pastos', descricao: descPastos, status: statusPastosCalc, resolverTab: 'fechamento' });
    pendencias.push({ id: 'categorias', label: 'Conciliação de Categorias', descricao: descCats, status: statusCats, resolverTab: 'fechamento' });
    pendencias.push({ id: 'valor', label: 'Valor do Rebanho', descricao: descValor, status: statusValorCalc, resolverTab: 'valor_rebanho' });
    pendencias.push({ id: 'financeiro', label: 'Conciliação do Financeiro', descricao: descFin, status: statusFin, resolverTab: 'fin_caixa' });

    // ── 5. Econômico (DERIVADO dos pilares operacionais — reflete a base, não decide) ──
    // Econômico = síntese de Pastos + Categorias + Valor. Não inclui Financeiro.
    const pilaresOperacionais = [statusPastosCalc, statusCats, statusValorCalc];
    const statusEcon: StatusItem = pilaresOperacionais.every(s => s === 'fechado') ? 'fechado'
      : pilaresOperacionais.every(s => s === 'aberto') ? 'aberto' : 'parcial';
    const descEcon = statusEcon === 'fechado' ? 'Base validada'
      : statusEcon === 'parcial' ? 'Aguardando fechamento das bases' : 'Bases não fechadas';
    pendencias.push({ id: 'economico', label: 'Econômico', descricao: descEcon, status: statusEcon });

    // Contadores (todos os 5 itens, para exibição na checklist)
    const contadores = { aberto: 0, parcial: 0, fechado: 0 };
    pendencias.forEach(p => contadores[p.status]++);

    // ── STATUS GERAL DO MÊS ──
    // REGRA DE PRODUTO:
    //   • Apenas os 3 PILARES OPERACIONAIS definem o status geral:
    //     1. Pastos  2. Categorias (Rebanho conciliado)  3. Valor do Rebanho
    //   • Financeiro é INFORMATIVO — aparece na checklist mas NÃO trava fechamento.
    //   • Econômico é DERIVADO dos 3 pilares — não entra de novo no critério
    //     para evitar contagem dupla.
    let status: StatusGeral = 'parcial';
    if (pilaresOperacionais.every(s => s === 'fechado')) status = 'fechado';
    else if (pilaresOperacionais.every(s => s === 'aberto')) status = 'aberto';

    return { status, pendencias, contadores, loading, pastosPorFazenda };
  }, [
    semPecuaria,
    finFechamentoStatus,
    finTemLancamentos,
    pastosPorFazenda,
    pastosFechados,
    pastosRascunho,
    pastosNaoIniciados,
    precosDefinidos,
    categoriasComSaldo,
    categoriasStatusResult,
    loading,
    isGlobal,
  ]);

  return result;
}
