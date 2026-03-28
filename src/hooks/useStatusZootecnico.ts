/**
 * Hook de status/pendências do painel Zootécnico.
 * 3 pendências: Conciliação Pastos, Valor Rebanho, Conciliação Categorias.
 * Suporte a modo global (todas as fazendas).
 */
import { useState, useEffect, useCallback, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useFazenda } from '@/contexts/FazendaContext';
import type { Lancamento, SaldoInicial } from '@/types/cattle';
import { calcSaldoPorCategoriaLegado } from '@/lib/calculos/zootecnicos';

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
  const [loading, setLoading] = useState(true);

  const [pastosAtivos, setPastosAtivos] = useState(0);
  const [pastosFechados, setPastosFechados] = useState(0);
  const [pastosRascunho, setPastosRascunho] = useState(0);
  const [pastosNaoIniciados, setPastosNaoIniciados] = useState(0);
  const [pastosPorFazenda, setPastosPorFazenda] = useState<PastosFazendaStatus[]>([]);
  const [itensTotais, setItensTotais] = useState(0);
  const [precosDefinidos, setPrecosDefinidos] = useState(0);
  const [categoriasComSaldo, setCategoriasComSaldo] = useState(0);
  const [catsDivergentes, setCatsDivergentes] = useState(0);
  const [difTotalCabecas, setDifTotalCabecas] = useState(0);
  const [saldoTotalSistema, setSaldoTotalSistema] = useState(0);
  const [semPecuaria, setSemPecuaria] = useState(false);

  const anoMes = `${ano}-${String(mes).padStart(2, '0')}`;
  const isGlobal = !fazendaId || fazendaId === '__global__';

  const resetZooState = useCallback(() => {
    setPastosAtivos(0);
    setPastosFechados(0);
    setPastosRascunho(0);
    setPastosNaoIniciados(0);
    setPastosPorFazenda([]);
    setItensTotais(0);
    setPrecosDefinidos(0);
    setCategoriasComSaldo(0);
    setCatsDivergentes(0);
    setDifTotalCabecas(0);
    setSaldoTotalSistema(0);
  }, []);

  const load = useCallback(async () => {
    if (!fazendaId) { setLoading(false); return; }

    const fazendasPecuariaContexto = contextFazendas.filter(f => f.id !== '__global__' && f.tem_pecuaria !== false);
    const fazendaNomeById = new Map(fazendasPecuariaContexto.map(f => [f.id, f.nome]));

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

      // 1. Pastos ativos com conciliação
      const { data: pastosData } = await fqPec(
        supabase.from('pastos').select('id, fazenda_id').eq('ativo', true).eq('entra_conciliacao', true),
      );

      // 2. Fechamento de pastos no período
      const { data: fpData } = await fqPec(
        supabase.from('fechamento_pastos').select('id, status, pasto_id, fazenda_id, updated_at').eq('ano_mes', anoMes),
      );

      const pastosAtivosByFaz = new Map<string, Set<string>>();
      (pastosData || []).forEach((p: any) => {
        if (!pastosAtivosByFaz.has(p.fazenda_id)) pastosAtivosByFaz.set(p.fazenda_id, new Set());
        pastosAtivosByFaz.get(p.fazenda_id)!.add(p.id);
      });

      // Deduplicação estrutural: 1 registro efetivo por pasto no período (mais recente)
      const fechamentoMaisRecentePorPasto = new Map<string, { status: string; updated_at: string | null }>();
      (fpData || []).forEach((f: any) => {
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

      // Itens for categorias comparison (mantém lógica atual)
      const fps = fpData || [];
      const fechIds = fps.map((f: any) => f.id);
      if (fechIds.length > 0) {
        const { data: itensData } = await supabase
          .from('fechamento_pasto_itens')
          .select('peso_medio_kg, quantidade, categoria_id')
          .in('fechamento_id', fechIds)
          .gt('quantidade', 0);
        const itens = itensData || [];
        setItensTotais(itens.length);

        // Conciliação de categorias
        const saldoMap = calcSaldoPorCategoriaLegado(saldosIniciais, lancamentos, ano, mes);
        const catsComSaldo = Array.from(saldoMap.entries()).filter(([, q]) => q > 0);
        setCategoriasComSaldo(catsComSaldo.length);
        const totalSist = catsComSaldo.reduce((s, [, q]) => s + q, 0);
        setSaldoTotalSistema(totalSist);

        const pastosMap = new Map<string, number>();
        itens.forEach((i: any) => {
          pastosMap.set(i.categoria_id, (pastosMap.get(i.categoria_id) || 0) + i.quantidade);
        });

        const { data: catsData } = await supabase.from('categorias_rebanho').select('id, codigo');
        const idToCodigo = new Map((catsData || []).map((c: any) => [c.id, c.codigo]));

        const pastosMapByCodigo = new Map<string, number>();
        pastosMap.forEach((qtd, catId) => {
          const codigo = idToCodigo.get(catId);
          if (codigo) pastosMapByCodigo.set(codigo, (pastosMapByCodigo.get(codigo) || 0) + qtd);
        });

        let divCount = 0;
        let difTotal = 0;
        catsComSaldo.forEach(([cat, qtdSist]) => {
          const qtdPastos = pastosMapByCodigo.get(cat) || 0;
          const dif = Math.abs(qtdPastos - qtdSist);
          if (dif > 0) { divCount++; difTotal += dif; }
        });
        pastosMapByCodigo.forEach((qtdP, cat) => {
          if (!saldoMap.has(cat) || (saldoMap.get(cat) || 0) <= 0) {
            if (qtdP > 0) { divCount++; difTotal += qtdP; }
          }
        });
        setCatsDivergentes(divCount);
        setDifTotalCabecas(difTotal);
      } else {
        setItensTotais(0);
        const saldoMap = calcSaldoPorCategoriaLegado(saldosIniciais, lancamentos, ano, mes);
        const catsComSaldo = Array.from(saldoMap.entries()).filter(([, q]) => q > 0);
        setCategoriasComSaldo(catsComSaldo.length);
        setSaldoTotalSistema(catsComSaldo.reduce((s, [, q]) => s + q, 0));
        setCatsDivergentes(catsComSaldo.length);
        setDifTotalCabecas(catsComSaldo.reduce((s, [, q]) => s + q, 0));
      }

      // Valor do rebanho (precos)
      const { data: vrData } = await fqPec(supabase.from('valor_rebanho_mensal').select('categoria').eq('ano_mes', anoMes));
      setPrecosDefinidos((vrData || []).length);
    } catch (e) {
      console.error('useStatusZootecnico error:', e);
    } finally {
      setLoading(false);
    }
  }, [fazendaId, anoMes, ano, mes, saldosIniciais, lancamentos, isGlobal, contextFazendas, resetZooState]);

  useEffect(() => { load(); }, [load]);

  const result = useMemo(() => {
    const pendencias: Pendencia[] = [];

    if (semPecuaria) {
      const desc = 'Sem operação pecuária';
      const ids = ['pastos', 'valor', 'categorias'];
      const labels: Record<string, string> = {
        pastos: 'Fechamento de Pastos', valor: 'Valor do Rebanho', categorias: 'Conciliação de Categorias',
      };
      ids.forEach(id => pendencias.push({ id, label: labels[id], descricao: desc, status: 'fechado' }));
      return {
        status: 'fechado' as StatusGeral,
        pendencias,
        contadores: { aberto: 0, parcial: 0, fechado: 3 },
        loading,
        pastosPorFazenda: [],
      };
    }

    // 1. Conciliação de Pastos — agora consolidada por fazenda (mesma regra do Global)
    let statusPastos: StatusItem = 'aberto';
    let descPastos = '';

    const fazendasComPastos = pastosPorFazenda.filter(f => f.totalPastos > 0);
    const fazendasFechadas = fazendasComPastos.filter(f => f.status === 'fechado').length;

    if (fazendasComPastos.length === 0) {
      statusPastos = 'aberto';
      descPastos = 'Nenhum pasto cadastrado';
    } else if (fazendasFechadas === fazendasComPastos.length) {
      statusPastos = 'fechado';
      if (isGlobal) {
        descPastos = `${fazendasFechadas}/${fazendasComPastos.length} fazenda(s) fechada(s)`;
      } else {
        descPastos = `${pastosFechados} fechado(s)`;
      }
    } else if (fazendasFechadas === 0) {
      statusPastos = 'aberto';
      if (isGlobal) {
        descPastos = `0/${fazendasComPastos.length} fazenda(s) fechada(s)`;
      } else {
        const parts: string[] = [];
        if (pastosRascunho > 0) parts.push(`${pastosRascunho} em rascunho`);
        if (pastosNaoIniciados > 0) parts.push(`${pastosNaoIniciados} não iniciado(s)`);
        descPastos = parts.length ? parts.join(' · ') : 'Sem fechamento no período';
      }
    } else {
      statusPastos = 'parcial';
      descPastos = `${fazendasFechadas}/${fazendasComPastos.length} fazenda(s) fechada(s)`;
    }

    pendencias.push({ id: 'pastos', label: 'Conciliação de Pastos', descricao: descPastos, status: statusPastos, resolverTab: 'fechamento' });

    // 2. Valor do Rebanho
    let statusValor: StatusItem = 'aberto';
    let descValor = '';
    if (precosDefinidos === 0) {
      statusValor = 'aberto';
      descValor = 'Nenhum preço definido';
    } else if (categoriasComSaldo > 0 && precosDefinidos < categoriasComSaldo) {
      statusValor = 'parcial';
      descValor = `${precosDefinidos}/${categoriasComSaldo} categorias com preço`;
    } else {
      statusValor = 'fechado';
      descValor = 'Preços completos';
    }
    pendencias.push({ id: 'valor', label: 'Valor do Rebanho', descricao: descValor, status: statusValor, resolverTab: 'valor_rebanho' });

    // 3. Conciliação de Categorias
    let statusCats: StatusItem = 'aberto';
    let descCats = '';
    if (itensTotais === 0 && categoriasComSaldo > 0) {
      statusCats = 'aberto';
      descCats = 'Sem dados de pastos';
    } else if (catsDivergentes === 0) {
      statusCats = 'fechado';
      descCats = 'Categorias conciliadas';
    } else {
      const pctDiv = saldoTotalSistema > 0 ? difTotalCabecas / saldoTotalSistema : 1;
      statusCats = pctDiv > 0.05 ? 'aberto' : 'parcial';
      descCats = `${catsDivergentes} categoria(s) divergente(s) · ${difTotalCabecas} cab`;
    }
    pendencias.push({ id: 'categorias', label: 'Conciliação de Categorias', descricao: descCats, status: statusCats, resolverTab: 'conciliacao_categoria' });

    // Contadores
    const contadores = { aberto: 0, parcial: 0, fechado: 0 };
    pendencias.forEach(p => contadores[p.status]++);

    // Status geral
    let status: StatusGeral = 'parcial';
    if (contadores.fechado === 3) status = 'fechado';
    else if (contadores.aberto === 3) status = 'aberto';

    return { status, pendencias, contadores, loading, pastosPorFazenda };
  }, [
    semPecuaria,
    pastosPorFazenda,
    pastosFechados,
    pastosRascunho,
    pastosNaoIniciados,
    precosDefinidos,
    categoriasComSaldo,
    catsDivergentes,
    difTotalCabecas,
    saldoTotalSistema,
    itensTotais,
    loading,
    isGlobal,
  ]);

  return result;
}
