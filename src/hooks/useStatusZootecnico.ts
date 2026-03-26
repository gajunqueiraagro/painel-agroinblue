/**
 * Hook de status/pendências do painel Zootécnico.
 * 3 pendências: Conciliação Pastos, Valor Rebanho, Conciliação Categorias.
 * Suporte a modo global (todas as fazendas).
 */
import { useState, useEffect, useCallback, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
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

export interface StatusZootecnicoResult {
  status: StatusGeral;
  pendencias: Pendencia[];
  contadores: { aberto: number; parcial: number; fechado: number };
  loading: boolean;
}

export function useStatusZootecnico(
  fazendaId: string | undefined,
  ano: number,
  mes: number,
  lancamentos: Lancamento[],
  saldosIniciais: SaldoInicial[],
): StatusZootecnicoResult {
  const [loading, setLoading] = useState(true);

  const [pastosAtivos, setPastosAtivos] = useState(0);
  const [pastosFechados, setPastosFechados] = useState(0);
  const [pastosRascunho, setPastosRascunho] = useState(0);
  const [pastosNaoIniciados, setPastosNaoIniciados] = useState(0);
  const [itensTotais, setItensTotais] = useState(0);
  const [precosDefinidos, setPrecosDefinidos] = useState(0);
  const [categoriasComSaldo, setCategoriasComSaldo] = useState(0);
  const [catsDivergentes, setCatsDivergentes] = useState(0);
  const [difTotalCabecas, setDifTotalCabecas] = useState(0);
  const [saldoTotalSistema, setSaldoTotalSistema] = useState(0);
  const [semPecuaria, setSemPecuaria] = useState(false);

  const anoMes = `${ano}-${String(mes).padStart(2, '0')}`;
  const isGlobal = !fazendaId || fazendaId === '__global__';

  const load = useCallback(async () => {
    if (!fazendaId) { setLoading(false); return; }
    if (!isGlobal) {
      const { data: fazData } = await supabase.from('fazendas').select('tem_pecuaria').eq('id', fazendaId).single();
      if (fazData && fazData.tem_pecuaria === false) {
        setPastosAtivos(0); setPastosFechados(0);
        setPastosRascunho(0); setPastosNaoIniciados(0);
        setItensTotais(0);
        setPrecosDefinidos(0); setCategoriasComSaldo(0);
        setCatsDivergentes(0); setDifTotalCabecas(0);
        setSaldoTotalSistema(0); setSemPecuaria(true);
        setLoading(false);
        return;
      }
    }
    setLoading(true);
    setSemPecuaria(false);
    try {
      let fazendaIdsPecuaria: string[] = [];
      if (isGlobal) {
        const { data: allFazendas } = await supabase.from('fazendas').select('id, tem_pecuaria');
        fazendaIdsPecuaria = (allFazendas || []).filter(f => f.tem_pecuaria !== false).map(f => f.id);
        if (fazendaIdsPecuaria.length === 0) {
          setPastosAtivos(0); setPastosFechados(0);
          setPastosRascunho(0); setPastosNaoIniciados(0);
          setItensTotais(0);
          setPrecosDefinidos(0); setCategoriasComSaldo(0);
          setCatsDivergentes(0); setDifTotalCabecas(0);
          setSaldoTotalSistema(0); setSemPecuaria(true);
          setLoading(false);
          return;
        }
      }

      const fqPec = (q: any) => isGlobal ? q.in('fazenda_id', fazendaIdsPecuaria) : q.eq('fazenda_id', fazendaId);

      // 1. Pastos ativos com conciliação
      const { data: pastosData } = await fqPec(supabase.from('pastos').select('id').eq('ativo', true).eq('entra_conciliacao', true));
      const totalPastos = (pastosData || []).length;
      setPastosAtivos(totalPastos);

      // 2. Fechamento de pastos — detailed status
      const { data: fpData } = await fqPec(supabase.from('fechamento_pastos').select('id, status, pasto_id').eq('ano_mes', anoMes));
      const fps = fpData || [];
      const fechados = fps.filter(f => f.status === 'fechado').length;
      const rascunhos = fps.filter(f => f.status !== 'fechado').length;
      const pastosComFechamento = new Set(fps.map(f => f.pasto_id));
      const naoIniciados = totalPastos - pastosComFechamento.size;
      setPastosFechados(fechados);
      setPastosRascunho(rascunhos);
      setPastosNaoIniciados(naoIniciados);

      // Itens for categorias comparison
      const fechIds = fps.map(f => f.id);
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
        itens.forEach(i => {
          pastosMap.set(i.categoria_id, (pastosMap.get(i.categoria_id) || 0) + i.quantidade);
        });

        const { data: catsData } = await supabase.from('categorias_rebanho').select('id, codigo');
        const idToCodigo = new Map((catsData || []).map(c => [c.id, c.codigo]));
        
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
  }, [fazendaId, anoMes, ano, mes, saldosIniciais, lancamentos, isGlobal]);

  useEffect(() => { load(); }, [load]);

  const result = useMemo(() => {
    const pendencias: Pendencia[] = [];

    if (semPecuaria) {
      const desc = 'Sem operação pecuária';
      const ids = ['pastos', 'valor', 'categorias'];
      const labels: Record<string, string> = {
        pastos: 'Conciliação de Pastos', valor: 'Valor do Rebanho', categorias: 'Conciliação de Categorias',
      };
      ids.forEach(id => pendencias.push({ id, label: labels[id], descricao: desc, status: 'fechado' }));
      return { status: 'fechado' as StatusGeral, pendencias, contadores: { aberto: 0, parcial: 0, fechado: 3 }, loading };
    }

    // 1. Conciliação de Pastos — detailed
    let statusPastos: StatusItem = 'aberto';
    let descPastos = '';
    if (pastosAtivos === 0) {
      statusPastos = 'aberto';
      descPastos = 'Nenhum pasto cadastrado';
    } else if (pastosFechados === pastosAtivos) {
      statusPastos = 'fechado';
      descPastos = `${pastosAtivos} fechado(s)`;
    } else {
      const parts: string[] = [];
      if (pastosFechados > 0) parts.push(`${pastosFechados} fechado(s)`);
      if (pastosRascunho > 0) parts.push(`${pastosRascunho} em rascunho`);
      if (pastosNaoIniciados > 0) parts.push(`${pastosNaoIniciados} não iniciado(s)`);
      descPastos = parts.join(' · ');
      statusPastos = pastosFechados > 0 ? 'parcial' : 'aberto';
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

    return { status, pendencias, contadores, loading };
  }, [semPecuaria, pastosAtivos, pastosFechados, pastosRascunho, pastosNaoIniciados, precosDefinidos, categoriasComSaldo, catsDivergentes, difTotalCabecas, saldoTotalSistema, itensTotais, loading]);

  return result;
}
