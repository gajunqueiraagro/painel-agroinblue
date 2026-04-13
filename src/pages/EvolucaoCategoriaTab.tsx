import { useState, useMemo, useEffect } from 'react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useFazenda } from '@/contexts/FazendaContext';
import { useRebanhoOficial } from '@/hooks/useRebanhoOficial';
import { useAnosDisponiveis } from '@/hooks/useAnosDisponiveis';
import { RefreshCw, Info } from 'lucide-react';

interface Props {
  initialAno?: string;
  initialMes?: string;
  initialCenario?: 'realizado' | 'meta';
  onNavigateToReclass?: (filtro?: { ano: string; mes: number }) => void;
}

const MESES_CURTOS = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];

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

  useEffect(() => { if (initialAno) setAnoFiltro(initialAno); }, [initialAno]);
  useEffect(() => { if (initialMes) setMesFiltro(initialMes); }, [initialMes]);
  useEffect(() => { if (initialCenario) setStatusFiltro(initialCenario === 'meta' ? 'meta' : 'realizado'); }, [initialCenario]);

  const ano = Number(anoFiltro);
  const mesNum = Number(mesFiltro);
  const isFutureMonth = statusFiltro === 'realizado' && (ano > currentYear || (ano === currentYear && mesNum > currentMonth));

  // FONTE OFICIAL: useRebanhoOficial (camada única obrigatória)
  const { rawCategorias: viewData, loading: isLoading, categorias: todasCategorias } = useRebanhoOficial({ ano, cenario: statusFiltro });
  const { data: anosDisponiveis = [String(currentYear)] } = useAnosDisponiveis();

  // All categories from the year to always show all rows
  const allCatCodes = useMemo(() => {
    return todasCategorias.map(c => ({ codigo: c.codigo, nome: c.nome, ordem: c.ordem }));
  }, [todasCategorias]);

  // Data for selected month — ensure all categories present
  const dadosMes = useMemo(() => {
    const mesData = viewData.filter(d => d.mes === mesNum);
    const byCode = new Map(mesData.map(d => [d.categoria_codigo, d]));

    // Use allCatCodes to guarantee all categories show up
    const result = allCatCodes.map(cat => {
      const existing = byCode.get(cat.codigo);
      if (existing) return existing;
      // Create empty row for missing categories
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
        fonte_oficial_mes: 'projecao',
      };
    });

    return result.sort((a, b) => a.ordem_exibicao - b.ordem_exibicao);
  }, [viewData, mesNum, allCatCodes, fazendaId, ano, statusFiltro, mesFiltro]);

  // Totals
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
  const fmtGmd = (v: number | null) => (v === null || v <= 0) ? '–' : v.toLocaleString('pt-BR', { minimumFractionDigits: 3, maximumFractionDigits: 3 });
  const fmtProdBio = (v: number) => v === 0 ? '–' : v.toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: 0 });

  const themeColor = isRealizado ? 'primary' : 'orange-500';

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

      {/* Filtros: Realizado/Meta + Reclass */}
      <div className="flex items-center justify-between gap-2 flex-wrap">
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

      {/* Tabela principal */}
      <div className="bg-card rounded-lg shadow-sm border overflow-x-auto">
        {isLoading ? (
          <div className="p-8 text-center text-muted-foreground text-xs">Carregando dados oficiais...</div>
        ) : (
          <table className="w-full text-[10px]" style={{ minWidth: 900 }}>
            <thead>
              <tr className={`border-b ${isRealizado ? 'bg-primary/10' : 'bg-orange-500/10'}`}>
                <th className={`text-left px-2 py-1.5 font-bold sticky left-0 z-10 ${isRealizado ? 'bg-primary/10 text-primary' : 'bg-orange-500/10 text-orange-700'}`} style={{ minWidth: 100 }}>
                  Categoria
                </th>
                <th className="px-1.5 py-1.5 font-bold text-center text-foreground">Saldo Ini.</th>
                <th className="px-1.5 py-1.5 font-bold text-center text-muted-foreground">Kg/cab Ini.</th>
                <th className="px-1.5 py-1.5 font-bold text-center text-green-700">Entr. Ext.</th>
                <th className="px-1.5 py-1.5 font-bold text-center text-destructive">Saídas Ext.</th>
                <th className="px-1.5 py-1.5 font-bold text-center text-destructive">Evol. Saída</th>
                <th className="px-1.5 py-1.5 font-bold text-center text-green-700">Evol. Entrada</th>
                <th className={`px-1.5 py-1.5 font-bold text-center ${isRealizado ? 'text-primary' : 'text-orange-700'}`}>Saldo Fin.</th>
                <th className="px-1.5 py-1.5 font-bold text-center text-muted-foreground">Kg/cab Fin.</th>
                <th className="px-1.5 py-1.5 font-bold text-center text-blue-700">Prod. Bio</th>
                <th className="px-1.5 py-1.5 font-bold text-center text-muted-foreground">Dias</th>
                <th className="px-1.5 py-1.5 font-bold text-center text-blue-700">GMD</th>
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

                return (
                  <tr key={d.categoria_codigo + i} className={`${rowBg} ${isSeparator ? 'border-t-2 border-border' : ''}`}>
                    <td className={`px-2 py-1 font-bold text-foreground sticky left-0 z-10 ${stickyBg}`}>
                      {d.categoria_nome}
                    </td>
                    <td className={`px-1.5 py-1 text-center font-semibold ${isFutureMonth ? 'text-transparent' : 'text-foreground'}`}>
                      {isFutureMonth ? '' : fmtNum(d.saldo_inicial)}
                    </td>
                    <td className="px-1.5 py-1 text-center text-muted-foreground">
                      {fmtPeso(d.peso_medio_inicial)}
                    </td>
                    <td className={`px-1.5 py-1 text-center font-semibold ${d.entradas_externas > 0 ? 'text-green-700' : 'text-muted-foreground/30'}`}>
                      {fmtNum(d.entradas_externas)}
                    </td>
                    <td className={`px-1.5 py-1 text-center font-semibold ${d.saidas_externas > 0 ? 'text-destructive' : 'text-muted-foreground/30'}`}>
                      {fmtNum(d.saidas_externas)}
                    </td>
                    <td className={`px-1.5 py-1 text-center font-semibold ${d.evol_cat_saida > 0 ? 'text-destructive' : 'text-muted-foreground/30'}`}>
                      {fmtNum(d.evol_cat_saida)}
                    </td>
                    <td className={`px-1.5 py-1 text-center font-semibold ${d.evol_cat_entrada > 0 ? 'text-green-700' : 'text-muted-foreground/30'}`}>
                      {fmtNum(d.evol_cat_entrada)}
                    </td>
                    <td className={`px-1.5 py-1 text-center font-extrabold ${isFutureMonth ? 'text-transparent' : isRealizado ? 'text-primary' : 'text-orange-700'}`}>
                      {isFutureMonth ? '' : fmtNum(d.saldo_final)}
                    </td>
                    <td className="px-1.5 py-1 text-center text-muted-foreground">
                      {fmtPeso(d.peso_medio_final)}
                    </td>
                    <td className={`px-1.5 py-1 text-center ${d.producao_biologica > 0 ? 'text-blue-700 font-semibold' : 'text-muted-foreground/30'}`}>
                      {fmtProdBio(d.producao_biologica)}
                    </td>
                    <td className="px-1.5 py-1 text-center text-muted-foreground">
                      {d.dias_mes || '–'}
                    </td>
                    <td className={`px-1.5 py-1 text-center ${d.gmd && d.gmd > 0 ? 'text-blue-700 font-semibold' : 'text-muted-foreground/30'}`}>
                      {fmtGmd(d.gmd)}
                    </td>
                  </tr>
                );
              })}
              {/* Linha TOTAL */}
              <tr className={`border-t-2 font-extrabold ${isRealizado ? 'bg-primary/10' : 'bg-orange-500/10'}`}>
                <td className={`px-2 py-1.5 text-foreground sticky left-0 z-10 ${isRealizado ? 'bg-primary/10' : 'bg-orange-500/10'}`}>TOTAL</td>
                <td className="px-1.5 py-1.5 text-center text-foreground">{isFutureMonth ? '' : fmtNum(totais.si)}</td>
                <td className="px-1.5 py-1.5 text-center text-muted-foreground">{fmtPeso(totais.pesoMedioIni)}</td>
                <td className="px-1.5 py-1.5 text-center text-green-700">{fmtNum(totais.entExt)}</td>
                <td className="px-1.5 py-1.5 text-center text-destructive">{fmtNum(totais.saiExt)}</td>
                <td className="px-1.5 py-1.5 text-center text-destructive">{fmtNum(totais.evolOut)}</td>
                <td className="px-1.5 py-1.5 text-center text-green-700">{fmtNum(totais.evolIn)}</td>
                <td className={`px-1.5 py-1.5 text-center ${isRealizado ? 'text-primary' : 'text-orange-700'}`}>{isFutureMonth ? '' : fmtNum(totais.sf)}</td>
                <td className="px-1.5 py-1.5 text-center text-muted-foreground">{fmtPeso(totais.pesoMedioFin)}</td>
                <td className="px-1.5 py-1.5 text-center text-blue-700">{fmtProdBio(totais.prodBio)}</td>
                <td className="px-1.5 py-1.5 text-center text-muted-foreground">{totais.diasMes || '–'}</td>
                <td className="px-1.5 py-1.5 text-center text-blue-700">{fmtGmd(totais.gmd)}</td>
              </tr>
            </tbody>
          </table>
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
