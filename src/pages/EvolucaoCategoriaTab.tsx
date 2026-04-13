import { useState, useMemo, useEffect } from 'react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useFazenda } from '@/contexts/FazendaContext';
import { useRebanhoOficial } from '@/hooks/useRebanhoOficial';
import { useAnosDisponiveis } from '@/hooks/useAnosDisponiveis';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useCliente } from '@/contexts/ClienteContext';
import { RefreshCw, Info, AlertCircle } from 'lucide-react';

interface Props {
  initialAno?: string;
  initialMes?: string;
  initialCenario?: 'realizado' | 'meta';
  onNavigateToReclass?: (filtro?: { ano: string; mes: number }) => void;
}

const MESES_CURTOS = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];

type ModoVisualizacao = 'cabeca' | 'kg_medio' | 'kg_total';

export function EvolucaoCategoriaTab({ initialAno, initialMes, initialCenario, onNavigateToReclass }: Props) {
  const { fazendaAtual } = useFazenda();
  const fazendaId = fazendaAtual?.id;

  const today = new Date();
  const currentYear = today.getFullYear();
  const currentMonth = today.getMonth() + 1;
  const [anoFiltro, setAnoFiltro] = useState(initialAno || String(currentYear));
  const [mesFiltro, setMesFiltro] = useState(initialMes || String(currentMonth).padStart(2, '0'));
  const [statusFiltro, setStatusFiltro] = useState<'realizado' | 'meta'>(
    initialCenario === 'meta' ? 'meta' : 'realizado'
  );
  const [modo, setModo] = useState<ModoVisualizacao>('cabeca');

  useEffect(() => { if (initialAno) setAnoFiltro(initialAno); }, [initialAno]);
  useEffect(() => { if (initialMes) setMesFiltro(initialMes); }, [initialMes]);
  useEffect(() => { if (initialCenario) setStatusFiltro(initialCenario === 'meta' ? 'meta' : 'realizado'); }, [initialCenario]);

  const ano = Number(anoFiltro);
  const mesNum = Number(mesFiltro);
  const isFutureMonth = statusFiltro === 'realizado' && (ano > currentYear || (ano === currentYear && mesNum > currentMonth));

  const { rawCategorias: viewData, loading: isLoading, categorias: todasCategorias } = useRebanhoOficial({ ano, cenario: statusFiltro });
  const { data: anosDisponiveis = [String(currentYear)] } = useAnosDisponiveis();

  const allCatCodes = useMemo(() => {
    return todasCategorias.map(c => ({ codigo: c.codigo, nome: c.nome, ordem: c.ordem }));
  }, [todasCategorias]);

  const dadosMes = useMemo(() => {
    const mesData = viewData.filter(d => d.mes === mesNum);
    const byCode = new Map(mesData.map(d => [d.categoria_codigo, d]));

    const result = allCatCodes.map(cat => {
      const existing = byCode.get(cat.codigo);
      if (existing) return existing;
      return {
        fazenda_id: fazendaId || '',
        cliente_id: '',
        ano,
        mes: mesNum,
        cenario: statusFiltro,
        ano_mes: `${ano}-${mesFiltro}`,
        categoria_id: '',
        categoria_codigo: cat.codigo,
        categoria_nome: cat.nome,
        ordem_exibicao: cat.ordem,
        saldo_inicial: 0,
        entradas_externas: 0,
        saidas_externas: 0,
        evol_cat_entrada: 0,
        evol_cat_saida: 0,
        saldo_final: 0,
        peso_total_inicial: 0,
        peso_total_final: 0,
        peso_medio_inicial: null as number | null,
        peso_medio_final: null as number | null,
        peso_entradas_externas: 0,
        peso_saidas_externas: 0,
        peso_evol_cat_entrada: 0,
        peso_evol_cat_saida: 0,
        dias_mes: 0,
        gmd: null as number | null,
        producao_biologica: 0,
        fonte_oficial_mes: 'projecao' as const,
      };
    });

    return result.sort((a, b) => a.ordem_exibicao - b.ordem_exibicao);
  }, [viewData, mesNum, allCatCodes, fazendaId, ano, statusFiltro, mesFiltro]);

  // Check if pastos are closed for this month via fechamento_pastos table
  const { clienteAtual } = useCliente();
  const anoMesKey = `${ano}-${String(mesNum).padStart(2, '0')}`;
  const { data: pastosFechadosCount = 0 } = useQuery({
    queryKey: ['fechamento-pastos-status', fazendaId, clienteAtual?.id, anoMesKey],
    queryFn: async () => {
      if (!fazendaId || !clienteAtual?.id) return 0;
      const { count } = await supabase
        .from('fechamento_pastos')
        .select('id', { count: 'exact', head: true })
        .eq('fazenda_id', fazendaId)
        .eq('cliente_id', clienteAtual.id)
        .eq('ano_mes', anoMesKey)
        .eq('status', 'fechado');
      return count ?? 0;
    },
    enabled: !!fazendaId && !!clienteAtual?.id,
  });
  const pastosFechados = pastosFechadosCount > 0;

  const totais = useMemo(() => {
    const si = dadosMes.reduce((s, d) => s + d.saldo_inicial, 0);
    const entExt = dadosMes.reduce((s, d) => s + d.entradas_externas, 0);
    const saiExt = dadosMes.reduce((s, d) => s + d.saidas_externas, 0);
    const evolIn = dadosMes.reduce((s, d) => s + d.evol_cat_entrada, 0);
    const evolOut = dadosMes.reduce((s, d) => s + d.evol_cat_saida, 0);
    const sf = dadosMes.reduce((s, d) => s + d.saldo_final, 0);
    const pesoTotalIni = dadosMes.reduce((s, d) => s + d.peso_total_inicial, 0);
    const pesoTotalFin = dadosMes.reduce((s, d) => s + d.peso_total_final, 0);
    const prodBio = dadosMes.reduce((s, d) => s + d.producao_biologica, 0);
    const diasMes = dadosMes.length > 0 ? dadosMes[0].dias_mes : 0;
    const cabMedias = (si + sf) / 2;
    const pesoMedioIni = si > 0 ? pesoTotalIni / si : null;
    const pesoMedioFin = sf > 0 ? pesoTotalFin / sf : null;
    const gmd = cabMedias > 0 && diasMes > 0 ? prodBio / cabMedias / diasMes : null;

    return { si, entExt, saiExt, evolIn, evolOut, sf, pesoTotalIni, pesoTotalFin, pesoMedioIni, pesoMedioFin, prodBio, diasMes, cabMedias, gmd };
  }, [dadosMes]);

  const isRealizado = statusFiltro === 'realizado';
  const fmtNum = (v: number) => v === 0 ? '–' : v.toLocaleString('pt-BR');
  const fmtPeso = (v: number | null) => (v === null || v <= 0) ? '–' : v.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
  const fmtKgTotal = (v: number) => v === 0 ? '–' : v.toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
  const fmtGmd = (v: number | null) => {
    if (v === null) return '–';
    return v.toLocaleString('pt-BR', { minimumFractionDigits: 3, maximumFractionDigits: 3 });
  };
  const fmtProdBio = (v: number) => v === 0 ? '–' : v.toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
  const negClass = (v: number | null) => v !== null && v < 0 ? 'text-red-400' : '';

  // Value getters based on modo
  const getVal = (d: typeof dadosMes[0], field: 'saldo_inicial' | 'entradas_externas' | 'saidas_externas' | 'evol_cat_saida' | 'evol_cat_entrada' | 'saldo_final') => {
    if (modo === 'cabeca') return fmtNum(d[field]);
    if (modo === 'kg_medio') {
      const cabField = d[field];
      if (cabField === 0) return '–';
      // For kg_medio, we need peso / cab for each field
      const pesoMap: Record<string, number> = {
        saldo_inicial: d.peso_total_inicial,
        entradas_externas: d.peso_entradas_externas,
        saidas_externas: d.peso_saidas_externas,
        evol_cat_saida: d.peso_evol_cat_saida,
        evol_cat_entrada: d.peso_evol_cat_entrada,
        saldo_final: d.peso_total_final,
      };
      const peso = pesoMap[field] || 0;
      return cabField > 0 ? fmtPeso(peso / cabField) : '–';
    }
    // kg_total
    const pesoMap: Record<string, number> = {
      saldo_inicial: d.peso_total_inicial,
      entradas_externas: d.peso_entradas_externas,
      saidas_externas: d.peso_saidas_externas,
      evol_cat_saida: d.peso_evol_cat_saida,
      evol_cat_entrada: d.peso_evol_cat_entrada,
      saldo_final: d.peso_total_final,
    };
    return fmtKgTotal(pesoMap[field] || 0);
  };

  const getTotalVal = (field: 'si' | 'entExt' | 'saiExt' | 'evolOut' | 'evolIn' | 'sf') => {
    if (modo === 'cabeca') return fmtNum(totais[field]);
    const pesoMap: Record<string, number> = {
      si: totais.pesoTotalIni,
      entExt: dadosMes.reduce((s, d) => s + d.peso_entradas_externas, 0),
      saiExt: dadosMes.reduce((s, d) => s + d.peso_saidas_externas, 0),
      evolOut: dadosMes.reduce((s, d) => s + d.peso_evol_cat_saida, 0),
      evolIn: dadosMes.reduce((s, d) => s + d.peso_evol_cat_entrada, 0),
      sf: totais.pesoTotalFin,
    };
    const cabMap: Record<string, number> = {
      si: totais.si, entExt: totais.entExt, saiExt: totais.saiExt,
      evolOut: totais.evolOut, evolIn: totais.evolIn, sf: totais.sf,
    };
    if (modo === 'kg_medio') {
      const cab = cabMap[field];
      return cab > 0 ? fmtPeso(pesoMap[field] / cab) : '–';
    }
    return fmtKgTotal(pesoMap[field]);
  };

  const modoSuffix = modo === 'cabeca' ? '' : modo === 'kg_medio' ? ' (kg/cab)' : ' (kg total)';

  return (
    <div className="p-3 w-full space-y-2 animate-fade-in pb-20">
      {/* Header: Ano + régua de meses */}
      <div className="flex items-center gap-2">
        <Select value={anoFiltro} onValueChange={setAnoFiltro}>
          <SelectTrigger className="h-7 text-xs font-bold w-20 shrink-0">
            <SelectValue placeholder="Ano" />
          </SelectTrigger>
          <SelectContent>
            {anosDisponiveis.map(a => (
              <SelectItem key={a} value={a} className="text-sm">{a}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <div className="flex items-center gap-0.5 flex-1">
          {MESES_CURTOS.map((label, i) => {
            const mesVal = String(i + 1).padStart(2, '0');
            const isActive = mesFiltro === mesVal;
            return (
              <button
                key={mesVal}
                onClick={() => setMesFiltro(mesVal)}
                className={`flex-1 py-1.5 rounded-md text-[11px] font-semibold transition-all ${
                  isActive
                    ? 'bg-primary text-primary-foreground shadow-sm'
                    : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                }`}
              >
                {label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Filtros: Realizado/Meta + Modo + Reclass */}
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2">
          <div className="flex gap-0.5 bg-muted rounded-md p-0.5">
            {([
              { value: 'realizado' as const, label: 'Realizado' },
              { value: 'meta' as const, label: 'Meta' },
            ]).map(opt => (
              <button
                key={opt.value}
                type="button"
                onClick={() => setStatusFiltro(opt.value)}
                className={`px-2 py-0.5 rounded text-[10px] font-bold transition-all ${
                  statusFiltro === opt.value
                    ? opt.value === 'realizado'
                      ? 'bg-green-700 text-white shadow-sm'
                      : 'bg-orange-500 text-white shadow-sm'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>

          <div className="flex gap-0.5 bg-muted rounded-md p-0.5">
            {([
              { value: 'cabeca' as ModoVisualizacao, label: 'Cabeça' },
              { value: 'kg_medio' as ModoVisualizacao, label: 'Kg Médio' },
              { value: 'kg_total' as ModoVisualizacao, label: 'Kg Total' },
            ]).map(opt => (
              <button
                key={opt.value}
                type="button"
                onClick={() => setModo(opt.value)}
                className={`px-2 py-0.5 rounded text-[10px] font-bold transition-all ${
                  modo === opt.value
                    ? 'bg-foreground text-background shadow-sm'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        {onNavigateToReclass && (
          <button
            onClick={() => onNavigateToReclass({ ano: anoFiltro, mes: Number(mesFiltro) })}
            className="flex items-center gap-1.5 px-2.5 py-1 rounded-md border text-[10px] font-semibold bg-primary/10 border-primary/30 text-primary hover:bg-primary/20 transition-colors ml-auto"
          >
            <RefreshCw className="h-3.5 w-3.5" />
            Reclass.
          </button>
        )}
      </div>

      {/* Tabela principal — compacta, ~70% largura */}
      <div className="max-w-[70%]">
        <div className="bg-card rounded-md shadow-sm border overflow-x-auto">
          {isLoading ? (
            <div className="p-6 text-center text-muted-foreground text-xs">Carregando dados oficiais...</div>
          ) : (
            <table className="w-full text-[9px] border-collapse">
              <thead>
                <tr className={`border-b ${isRealizado ? 'bg-primary/10' : 'bg-orange-500/10'}`}>
                  <th className={`text-left px-1 py-1 font-bold sticky left-0 z-10 ${isRealizado ? 'bg-primary/10 text-primary' : 'bg-orange-500/10 text-orange-700'}`} style={{ width: 90 }}>
                    Categoria
                  </th>
                  <th className="px-0.5 py-1 font-bold text-right text-foreground bg-foreground/5" style={{ width: 46 }}>Saldo Ini.</th>
                  <th className="px-0.5 py-1 font-bold text-right text-muted-foreground" style={{ width: 42 }}>Kg/cab Ini.</th>
                  <th className="px-0.5 py-1 font-bold text-right text-green-700" style={{ width: 38 }}>Entr. Ext.</th>
                  <th className="px-0.5 py-1 font-bold text-right text-destructive" style={{ width: 38 }}>Saídas Ext.</th>
                  <th className="px-0.5 py-1 font-bold text-right text-destructive" style={{ width: 38 }}>Evol. Saída</th>
                  <th className="px-0.5 py-1 font-bold text-right text-green-700" style={{ width: 38 }}>Evol. Entr.</th>
                  <th className={`px-0.5 py-1 font-bold text-right bg-foreground/5 ${isRealizado ? 'text-primary' : 'text-orange-700'}`} style={{ width: 46 }}>Saldo Fin.</th>
                  <th className="px-0.5 py-1 font-bold text-right text-muted-foreground" style={{ width: 42 }}>
                    Kg/cab Fin.
                    {!pastosFechados && <span className="block text-[7px] font-normal text-orange-500">s/ fech.</span>}
                  </th>
                  <th className="px-0.5 py-1 font-bold text-right text-blue-700" style={{ width: 42 }}>Prod. Bio</th>
                  <th className="px-0.5 py-1 font-bold text-right text-muted-foreground" style={{ width: 24 }}>Dias</th>
                  <th className="px-0.5 py-1 font-bold text-right text-blue-700" style={{ width: 42 }}>GMD</th>
                </tr>
              </thead>
              <tbody>
                {dadosMes.map((d, i) => {
                  const isFemea = d.categoria_codigo.includes('_f') || d.categoria_codigo === 'vacas';
                  const isSeparator = i > 0 && isFemea && !dadosMes[i - 1]?.categoria_codigo.includes('_f') && dadosMes[i - 1]?.categoria_codigo !== 'vacas';
                  const rowBg = i % 2 === 0 ? '' : 'bg-muted/30';
                  const stickyBg = isRealizado
                    ? (i % 2 === 0 ? 'bg-primary/5' : 'bg-primary/8')
                    : (i % 2 === 0 ? 'bg-orange-500/5' : 'bg-orange-500/8');

                  const showPesoFin = pastosFechados || d.fonte_oficial_mes === 'fechamento';

                  return (
                    <tr key={d.categoria_codigo + i} className={`${rowBg} ${isSeparator ? 'border-t border-border' : ''}`}>
                      <td className={`px-1 py-0.5 font-semibold text-foreground sticky left-0 z-10 text-[9px] ${stickyBg}`} style={{ width: 90 }}>
                        {d.categoria_nome}
                      </td>
                      <td className={`px-0.5 py-0.5 text-right font-semibold bg-foreground/[0.03] ${isFutureMonth ? 'text-transparent' : 'text-foreground'}`}>
                        {isFutureMonth ? '' : getVal(d, 'saldo_inicial')}
                      </td>
                      <td className="px-0.5 py-0.5 text-right text-muted-foreground">
                        {fmtPeso(d.peso_medio_inicial)}
                      </td>
                      <td className={`px-0.5 py-0.5 text-right font-medium ${d.entradas_externas > 0 ? 'text-green-700' : 'text-muted-foreground/30'}`}>
                        {getVal(d, 'entradas_externas')}
                      </td>
                      <td className={`px-0.5 py-0.5 text-right font-medium ${d.saidas_externas > 0 ? 'text-destructive' : 'text-muted-foreground/30'}`}>
                        {getVal(d, 'saidas_externas')}
                      </td>
                      <td className={`px-0.5 py-0.5 text-right font-medium ${d.evol_cat_saida > 0 ? 'text-destructive' : 'text-muted-foreground/30'}`}>
                        {getVal(d, 'evol_cat_saida')}
                      </td>
                      <td className={`px-0.5 py-0.5 text-right font-medium ${d.evol_cat_entrada > 0 ? 'text-green-700' : 'text-muted-foreground/30'}`}>
                        {getVal(d, 'evol_cat_entrada')}
                      </td>
                      <td className={`px-0.5 py-0.5 text-right font-bold bg-foreground/[0.03] ${isFutureMonth ? 'text-transparent' : isRealizado ? 'text-primary' : 'text-orange-700'}`}>
                        {isFutureMonth ? '' : getVal(d, 'saldo_final')}
                      </td>
                      <td className="px-0.5 py-0.5 text-right text-muted-foreground">
                        {showPesoFin ? fmtPeso(d.peso_medio_final) : '–'}
                      </td>
                      <td className={`px-0.5 py-0.5 text-right font-medium ${negClass(d.producao_biologica) || (d.producao_biologica > 0 ? 'text-blue-700' : 'text-muted-foreground/30')}`}>
                        {fmtProdBio(d.producao_biologica)}
                      </td>
                      <td className="px-0.5 py-0.5 text-right text-muted-foreground">
                        {d.dias_mes || '–'}
                      </td>
                      <td className={`px-0.5 py-0.5 text-right font-medium ${negClass(d.gmd) || (d.gmd && d.gmd > 0 ? 'text-blue-700' : 'text-muted-foreground/30')}`}>
                        {fmtGmd(d.gmd)}
                      </td>
                    </tr>
                  );
                })}
                {/* Linha TOTAL */}
                <tr className={`border-t font-bold ${isRealizado ? 'bg-primary/10' : 'bg-orange-500/10'} text-[9px]`}>
                  <td className={`px-1 py-1 text-foreground sticky left-0 z-10 ${isRealizado ? 'bg-primary/10' : 'bg-orange-500/10'}`}>TOTAL</td>
                  <td className="px-0.5 py-1 text-right text-foreground bg-foreground/[0.03]">{isFutureMonth ? '' : getTotalVal('si')}</td>
                  <td className="px-0.5 py-1 text-right text-muted-foreground">{fmtPeso(totais.pesoMedioIni)}</td>
                  <td className="px-0.5 py-1 text-right text-green-700">{getTotalVal('entExt')}</td>
                  <td className="px-0.5 py-1 text-right text-destructive">{getTotalVal('saiExt')}</td>
                  <td className="px-0.5 py-1 text-right text-destructive">{getTotalVal('evolOut')}</td>
                  <td className="px-0.5 py-1 text-right text-green-700">{getTotalVal('evolIn')}</td>
                  <td className={`px-0.5 py-1 text-right bg-foreground/[0.03] ${isRealizado ? 'text-primary' : 'text-orange-700'}`}>{isFutureMonth ? '' : getTotalVal('sf')}</td>
                  <td className="px-0.5 py-1 text-right text-muted-foreground">{pastosFechados ? fmtPeso(totais.pesoMedioFin) : '–'}</td>
                  <td className={`px-0.5 py-1 text-right ${negClass(totais.prodBio) || 'text-blue-700'}`}>{fmtProdBio(totais.prodBio)}</td>
                  <td className="px-0.5 py-1 text-right text-muted-foreground">{totais.diasMes || '–'}</td>
                  <td className={`px-0.5 py-1 text-right ${negClass(totais.gmd) || 'text-blue-700'}`}>{fmtGmd(totais.gmd)}</td>
                </tr>
              </tbody>
            </table>
          )}
        </div>

        {/* Aviso pastos não fechados */}
        {!isLoading && !pastosFechados && !isFutureMonth && (
          <div className="flex items-center gap-1.5 text-[9px] text-orange-600 bg-orange-50 dark:bg-orange-500/10 rounded px-2 py-1 border border-orange-200 dark:border-orange-500/20 mt-1.5">
            <AlertCircle className="h-3 w-3 shrink-0" />
            Kg/cab Fin. indisponível — pastos não fechados para {MESES_CURTOS[mesNum - 1]}/{anoFiltro}.
          </div>
        )}
      </div>

      {/* Bloco explicativo — Como o GMD foi calculado */}
      {!isLoading && !isFutureMonth && totais.diasMes > 0 && (
        <div className="bg-card rounded-lg shadow-sm border p-4 space-y-3">
          <div className="flex items-center gap-2 text-sm font-bold text-foreground">
            <Info className="h-4 w-4 text-blue-600" />
            Como o GMD foi calculado — {MESES_CURTOS[mesNum - 1]}/{anoFiltro}
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-x-6 gap-y-2 text-xs">
            <div>
              <span className="text-muted-foreground">Saldo Inicial</span>
              <p className="font-bold text-foreground">{totais.si.toLocaleString('pt-BR')} cab</p>
            </div>
            <div>
              <span className="text-muted-foreground">Saldo Final</span>
              <p className="font-bold text-foreground">{totais.sf.toLocaleString('pt-BR')} cab</p>
            </div>
            <div>
              <span className="text-muted-foreground">Cabeças Médias</span>
              <p className="font-bold text-foreground">{totais.cabMedias.toLocaleString('pt-BR', { maximumFractionDigits: 1 })} cab</p>
            </div>
            <div>
              <span className="text-muted-foreground">Dias do Mês</span>
              <p className="font-bold text-foreground">{totais.diasMes}</p>
            </div>
            <div>
              <span className="text-muted-foreground">Peso Total Inicial</span>
              <p className="font-bold text-foreground">{totais.pesoTotalIni.toLocaleString('pt-BR', { maximumFractionDigits: 0 })} kg</p>
            </div>
            <div>
              <span className="text-muted-foreground">Peso Total Final</span>
              <p className="font-bold text-foreground">{totais.pesoTotalFin.toLocaleString('pt-BR', { maximumFractionDigits: 0 })} kg</p>
            </div>
            <div>
              <span className="text-muted-foreground">Produção Biológica</span>
              <p className="font-bold text-blue-700">{totais.prodBio.toLocaleString('pt-BR', { maximumFractionDigits: 0 })} kg</p>
            </div>
            <div>
              <span className="text-muted-foreground">GMD Final</span>
              <p className="font-extrabold text-blue-700 text-sm">
                {totais.gmd !== null ? `${totais.gmd.toLocaleString('pt-BR', { minimumFractionDigits: 3, maximumFractionDigits: 3 })} kg/cab/dia` : '–'}
              </p>
            </div>
          </div>

          <div className="border-t border-border pt-2 text-[10px] text-muted-foreground space-y-1">
            <p className="font-semibold">Fórmula:</p>
            <p>Produção Biológica = Peso Final − Peso Inicial − Peso Entradas + Peso Saídas</p>
            <p>GMD = Produção Biológica ÷ Cabeças Médias ÷ Dias do Mês</p>
            {totais.cabMedias > 0 && totais.gmd !== null && (
              <p className="mt-1 font-medium text-foreground/70">
                GMD = {totais.prodBio.toLocaleString('pt-BR', { maximumFractionDigits: 0 })} ÷ {totais.cabMedias.toLocaleString('pt-BR', { maximumFractionDigits: 1 })} ÷ {totais.diasMes} = <span className="font-bold text-blue-700">{totais.gmd.toLocaleString('pt-BR', { minimumFractionDigits: 3, maximumFractionDigits: 3 })} kg/cab/dia</span>
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
