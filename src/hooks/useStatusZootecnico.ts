/**
 * Hook de status/pendências do painel Zootécnico.
 * 5 pendências: Conciliação Pastos, Fechamento Rebanho, Peso Médio, Valor Rebanho, Conciliação Categorias.
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

  // Raw data
  const [pastosAtivos, setPastosAtivos] = useState(0);
  const [pastosFechados, setPastosFechados] = useState(0);
  const [rebanhoFechamentos, setRebanhoFechamentos] = useState<{ total: number; fechados: number }>({ total: 0, fechados: 0 });
  const [itensComPeso, setItensComPeso] = useState(0);
  const [itensTotais, setItensTotais] = useState(0);
  const [precosDefinidos, setPrecosDefinidos] = useState(0);
  const [categoriasComSaldo, setCategoriasComSaldo] = useState(0);
  const [catsDivergentes, setCatsDivergentes] = useState(0);
  const [difTotalCabecas, setDifTotalCabecas] = useState(0);
  const [saldoTotalSistema, setSaldoTotalSistema] = useState(0);

  const anoMes = `${ano}-${String(mes).padStart(2, '0')}`;
  const isGlobal = !fazendaId || fazendaId === '__global__';

  const load = useCallback(async () => {
    if (!fazendaId) { setLoading(false); return; }
    setLoading(true);
    try {
      // Build fazenda filter helper
      const fq = (q: any) => isGlobal ? q : q.eq('fazenda_id', fazendaId);

      // 1. Pastos ativos com conciliação
      const pastosQuery = isGlobal
        ? supabase.from('pastos').select('id').eq('ativo', true).eq('entra_conciliacao', true)
        : supabase.from('pastos').select('id').eq('ativo', true).eq('entra_conciliacao', true).eq('fazenda_id', fazendaId);
      const { data: pastosData } = await pastosQuery;
      const totalPastos = (pastosData || []).length;
      setPastosAtivos(totalPastos);

      // 2. Fechamento de pastos
      const fpQuery = isGlobal
        ? supabase.from('fechamento_pastos').select('id, status, pasto_id').eq('ano_mes', anoMes)
        : supabase.from('fechamento_pastos').select('id, status, pasto_id').eq('ano_mes', anoMes).eq('fazenda_id', fazendaId);
      const { data: fpData } = await fpQuery;
      const fps = fpData || [];
      const fechados = fps.filter(f => f.status === 'fechado').length;
      setPastosFechados(fechados);

      // 3. Fechamento de rebanho (valor_rebanho_fechamento)
      const vrfQuery = isGlobal
        ? supabase.from('valor_rebanho_fechamento').select('status, fazenda_id').eq('ano_mes', anoMes)
        : supabase.from('valor_rebanho_fechamento').select('status, fazenda_id').eq('ano_mes', anoMes).eq('fazenda_id', fazendaId);
      const { data: vrfData } = await vrfQuery;
      
      if (isGlobal) {
        // Count distinct fazendas that have membership
        const { data: allFazendas } = await supabase.from('fazendas').select('id');
        const totalFazendas = (allFazendas || []).length;
        const fechadasCount = (vrfData || []).filter(v => v.status === 'fechado').length;
        setRebanhoFechamentos({ total: totalFazendas, fechados: fechadasCount });
      } else {
        const isFechado = (vrfData || []).some(v => v.status === 'fechado');
        setRebanhoFechamentos({ total: 1, fechados: isFechado ? 1 : 0 });
      }

      // 4. Peso médio (fechamento_pasto_itens com quantidade > 0)
      const fechIds = fps.map(f => f.id);
      if (fechIds.length > 0) {
        const { data: itensData } = await supabase
          .from('fechamento_pasto_itens')
          .select('peso_medio_kg, quantidade, categoria_id')
          .in('fechamento_id', fechIds)
          .gt('quantidade', 0);
        const itens = itensData || [];
        setItensTotais(itens.length);
        setItensComPeso(itens.filter(i => i.peso_medio_kg && i.peso_medio_kg > 0).length);

        // 6. Conciliação de categorias
        const saldoMap = calcSaldoPorCategoriaLegado(saldosIniciais, lancamentos, ano, mes);
        const catsComSaldo = Array.from(saldoMap.entries()).filter(([, q]) => q > 0);
        setCategoriasComSaldo(catsComSaldo.length);
        const totalSist = catsComSaldo.reduce((s, [, q]) => s + q, 0);
        setSaldoTotalSistema(totalSist);

        // Aggregate pastos by categoria_id
        const pastosMap = new Map<string, number>();
        itens.forEach(i => {
          pastosMap.set(i.categoria_id, (pastosMap.get(i.categoria_id) || 0) + i.quantidade);
        });

        // We need to compare by categoria code, but itens use categoria_id (UUID)
        // Fetch categorias to map
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
        // Also check categories in pastos but not in sistema
        pastosMapByCodigo.forEach((qtdP, cat) => {
          if (!saldoMap.has(cat) || (saldoMap.get(cat) || 0) <= 0) {
            if (qtdP > 0) { divCount++; difTotal += qtdP; }
          }
        });
        setCatsDivergentes(divCount);
        setDifTotalCabecas(difTotal);
      } else {
        setItensTotais(0);
        setItensComPeso(0);
        const saldoMap = calcSaldoPorCategoriaLegado(saldosIniciais, lancamentos, ano, mes);
        const catsComSaldo = Array.from(saldoMap.entries()).filter(([, q]) => q > 0);
        setCategoriasComSaldo(catsComSaldo.length);
        setSaldoTotalSistema(catsComSaldo.reduce((s, [, q]) => s + q, 0));
        setCatsDivergentes(catsComSaldo.length);
        setDifTotalCabecas(catsComSaldo.reduce((s, [, q]) => s + q, 0));
      }

      // 5. Valor do rebanho (precos)
      const vrQuery = isGlobal
        ? supabase.from('valor_rebanho_mensal').select('categoria').eq('ano_mes', anoMes)
        : supabase.from('valor_rebanho_mensal').select('categoria').eq('ano_mes', anoMes).eq('fazenda_id', fazendaId);
      const { data: vrData } = await vrQuery;
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

    // 1. Conciliação de Pastos
    let statusPastos: StatusItem = 'aberto';
    let descPastos = '';
    if (pastosAtivos === 0) {
      statusPastos = 'aberto';
      descPastos = 'Nenhum pasto cadastrado';
    } else if (pastosFechados === 0) {
      statusPastos = 'aberto';
      descPastos = `0/${pastosAtivos} pastos fechados`;
    } else if (pastosFechados < pastosAtivos) {
      statusPastos = 'parcial';
      descPastos = `${pastosFechados}/${pastosAtivos} pastos fechados`;
    } else {
      statusPastos = 'fechado';
      descPastos = `${pastosAtivos}/${pastosAtivos} pastos conciliados`;
    }
    pendencias.push({ id: 'pastos', label: 'Conciliação de Pastos', descricao: descPastos, status: statusPastos, resolverTab: 'conciliacao' });

    // 2. Fechamento de Rebanho
    let statusRebanho: StatusItem = 'aberto';
    let descRebanho = '';
    if (rebanhoFechamentos.total === 0) {
      statusRebanho = 'aberto';
      descRebanho = 'Sem fazendas';
    } else if (rebanhoFechamentos.fechados === 0) {
      statusRebanho = 'aberto';
      descRebanho = 'Mês ainda não fechado';
    } else if (rebanhoFechamentos.fechados < rebanhoFechamentos.total) {
      statusRebanho = 'parcial';
      descRebanho = `${rebanhoFechamentos.fechados}/${rebanhoFechamentos.total} fazendas fechadas`;
    } else {
      statusRebanho = 'fechado';
      descRebanho = 'Mês fechado';
    }
    pendencias.push({ id: 'rebanho', label: 'Fechamento de Rebanho', descricao: descRebanho, status: statusRebanho, resolverTab: 'fluxo_anual' });

    // 3. Peso Médio
    let statusPeso: StatusItem = 'aberto';
    let descPeso = '';
    if (itensTotais === 0) {
      statusPeso = 'aberto';
      descPeso = 'Peso médio não informado';
    } else if (itensComPeso === 0) {
      statusPeso = 'aberto';
      descPeso = 'Peso médio não informado';
    } else if (itensComPeso < itensTotais) {
      statusPeso = 'parcial';
      descPeso = `Peso médio parcial (${itensComPeso}/${itensTotais})`;
    } else {
      statusPeso = 'fechado';
      descPeso = 'Peso médio completo';
    }
    pendencias.push({ id: 'peso', label: 'Peso Médio', descricao: descPeso, status: statusPeso, resolverTab: 'conciliacao' });

    // 4. Valor do Rebanho
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

    // 5. Conciliação de Categorias
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
    pendencias.push({ id: 'categorias', label: 'Conciliação de Categorias', descricao: descCats, status: statusCats, resolverTab: 'conciliacao' });

    // Contadores
    const contadores = { aberto: 0, parcial: 0, fechado: 0 };
    pendencias.forEach(p => contadores[p.status]++);

    // Status geral
    let status: StatusGeral = 'parcial';
    if (contadores.fechado === 5) status = 'fechado';
    else if (contadores.aberto === 5) status = 'aberto';

    return { status, pendencias, contadores, loading };
  }, [pastosAtivos, pastosFechados, rebanhoFechamentos, itensComPeso, itensTotais, precosDefinidos, categoriasComSaldo, catsDivergentes, difTotalCabecas, saldoTotalSistema, loading]);

  return result;
}
