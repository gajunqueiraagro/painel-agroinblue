import { useState, useMemo, useEffect } from 'react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { supabase } from '@/integrations/supabase/client';
import { useFazenda } from '@/contexts/FazendaContext';
import { useZootCategoriaMensal, type ZootCategoriaMensal } from '@/hooks/useZootCategoriaMensal';
import { CheckCircle, AlertTriangle, Clock, RefreshCw, DollarSign } from 'lucide-react';

interface Props {
  initialAno?: string;
  initialMes?: string;
  initialCenario?: 'realizado' | 'meta';
  onNavigateToReclass?: (filtro?: { ano: string; mes: number }) => void;
}

const COLUNAS_CONSOLIDADAS = [
  { key: 'entradas_externas', label: 'Entradas Externas', entrada: true },
  { key: 'evol_cat_entrada', label: 'Evol. Cat. Entrada', entrada: true },
  { key: 'saidas_externas', label: 'Saídas Externas', entrada: false },
  { key: 'evol_cat_saida', label: 'Evol. Cat. Saída', entrada: false },
];

export function EvolucaoCategoriaTab({ initialAno, initialMes, initialCenario, onNavigateToReclass }: Props) {
  const { fazendaAtual } = useFazenda();
  const fazendaId = fazendaAtual?.id;

  const today = new Date();
  const currentYear = today.getFullYear();
  const currentMonth = today.getMonth() + 1;
  const [anoFiltro, setAnoFiltro] = useState(initialAno || String(currentYear));
  const [mesFiltro, setMesFiltro] = useState(initialMes || String(new Date().getMonth() + 1).padStart(2, '0'));
  const [statusFiltro, setStatusFiltro] = useState<'realizado' | 'meta'>(
    initialCenario === 'meta' ? 'meta' : 'realizado'
  );
  const [conciliacaoStatus, setConciliacaoStatus] = useState<'aberto' | 'fechado' | 'parcial' | null>(null);
  const [rebanhoStatus, setRebanhoStatus] = useState<'aberto' | 'fechado' | null>(null);
  const [precosRebanho, setPrecosRebanho] = useState<Record<string, number>>({});

  const ano = Number(anoFiltro);
  const isFutureMonth = statusFiltro === 'realizado' && (ano > currentYear || (ano === currentYear && Number(mesFiltro) > currentMonth));
  // Fetch from unified view
  const { data: viewData = [], isLoading } = useZootCategoriaMensal({
    ano,
    cenario: statusFiltro,
  });

  // Filter to selected month
  const dadosMes = useMemo(() => {
    return viewData
      .filter(d => d.mes === Number(mesFiltro))
      .sort((a, b) => a.ordem_exibicao - b.ordem_exibicao);
  }, [viewData, mesFiltro]);

  // Totals
  const totais = useMemo(() => {
    const saldoIni = dadosMes.reduce((s, d) => s + d.saldo_inicial, 0);
    const entradasExt = dadosMes.reduce((s, d) => s + d.entradas_externas, 0);
    const saidasExt = dadosMes.reduce((s, d) => s + d.saidas_externas, 0);
    const evolEntrada = dadosMes.reduce((s, d) => s + d.evol_cat_entrada, 0);
    const evolSaida = dadosMes.reduce((s, d) => s + d.evol_cat_saida, 0);
    const saldoFin = dadosMes.reduce((s, d) => s + d.saldo_final, 0);

    const somaPeso = dadosMes.reduce((s, d) => s + (d.peso_medio_final && d.saldo_final > 0 ? d.saldo_final * d.peso_medio_final : 0), 0);
    const somaQtd = dadosMes.reduce((s, d) => s + (d.peso_medio_final && d.saldo_final > 0 ? d.saldo_final : 0), 0);
    const pesoMedio = somaQtd > 0 ? somaPeso / somaQtd : null;

    return { saldoIni, entradasExt, saidasExt, evolEntrada, evolSaida, saldoFin, pesoMedio };
  }, [dadosMes]);

  // Fetch conciliação status
  useEffect(() => {
    const anoMes = `${anoFiltro}-${mesFiltro}`;
    if (!fazendaId || fazendaId === '__global__') { setConciliacaoStatus(null); return; }
    (async () => {
      try {
        const { data: pastos } = await supabase.from('pastos').select('id').eq('fazenda_id', fazendaId).eq('ativo', true).eq('entra_conciliacao', true);
        const totalPastos = (pastos || []).length;
        if (totalPastos === 0) { setConciliacaoStatus(null); return; }
        const { data: fechamentos } = await supabase.from('fechamento_pastos').select('pasto_id, status').eq('fazenda_id', fazendaId).eq('ano_mes', anoMes);
        const fechados = (fechamentos || []).filter(f => f.status === 'fechado' || f.status === 'realizado').length;
        if (fechados === 0) setConciliacaoStatus('aberto');
        else if (fechados >= totalPastos) setConciliacaoStatus('fechado');
        else setConciliacaoStatus('parcial');
      } catch { setConciliacaoStatus(null); }
    })();
  }, [fazendaId, anoFiltro, mesFiltro]);

  // Fetch valor rebanho status
  useEffect(() => {
    const anoMes = `${anoFiltro}-${mesFiltro}`;
    if (!fazendaId || fazendaId === '__global__') { setRebanhoStatus(null); return; }
    (async () => {
      try {
        const { data } = await supabase.from('valor_rebanho_fechamento').select('status').eq('fazenda_id', fazendaId).eq('ano_mes', anoMes).maybeSingle();
        setRebanhoStatus(data?.status === 'fechado' ? 'fechado' : 'aberto');
      } catch { setRebanhoStatus(null); }
    })();
  }, [fazendaId, anoFiltro, mesFiltro]);

  // Fetch preços do valor do rebanho
  useEffect(() => {
    const anoMes = `${anoFiltro}-${mesFiltro}`;
    if (!fazendaId || fazendaId === '__global__') { setPrecosRebanho({}); return; }
    (async () => {
      try {
        const { data } = await supabase.from('valor_rebanho_mensal').select('categoria, preco_kg').eq('fazenda_id', fazendaId).eq('ano_mes', anoMes);
        const map: Record<string, number> = {};
        (data || []).forEach((r: any) => { if (r.preco_kg > 0) map[r.categoria] = r.preco_kg; });
        setPrecosRebanho(map);
      } catch { setPrecosRebanho({}); }
    })();
  }, [fazendaId, anoFiltro, mesFiltro]);

  const valorRebanhoTotal = useMemo(() => {
    let total = 0;
    dadosMes.forEach(d => {
      const preco = precosRebanho[d.categoria_codigo];
      if (preco && d.peso_medio_final && d.saldo_final > 0) {
        total += d.saldo_final * d.peso_medio_final * preco;
      }
    });
    return total;
  }, [dadosMes, precosRebanho]);

  const isRealizado = statusFiltro === 'realizado';
  const formatPeso = (v: number | null) => {
    if (v === null || v === undefined || v <= 0) return '—';
    return v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  };

  const MESES_CURTOS = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'];

  // Available years: current ± some range
  const anosDisponiveis = useMemo(() => {
    const anos = new Set<number>();
    anos.add(currentYear);
    viewData.forEach(d => anos.add(d.ano));
    return Array.from(anos).sort((a, b) => b - a).map(String);
  }, [viewData, currentYear]);

  return (
    <div className="p-3 w-full space-y-1 animate-fade-in pb-20">
      {/* Status badges */}
      <div className="flex items-center justify-end gap-2 -mt-7">
        {isRealizado && conciliacaoStatus && (
          <div className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md border text-[10px] font-semibold ${
            conciliacaoStatus === 'fechado'
              ? 'bg-green-50 border-green-300 text-green-800'
              : conciliacaoStatus === 'parcial'
                ? 'bg-orange-50 border-orange-300 text-orange-800'
                : 'bg-muted border-border text-muted-foreground'
          }`}>
            {conciliacaoStatus === 'fechado' ? <CheckCircle className="h-3.5 w-3.5" /> : conciliacaoStatus === 'parcial' ? <AlertTriangle className="h-3.5 w-3.5" /> : <Clock className="h-3.5 w-3.5" />}
            Pasto: {conciliacaoStatus === 'fechado' ? 'Fechado' : conciliacaoStatus === 'parcial' ? 'Parcial' : 'Aberto'}
          </div>
        )}
        {isRealizado && rebanhoStatus && (
          <div className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md border text-[10px] font-semibold ${
            rebanhoStatus === 'fechado' ? 'bg-green-50 border-green-300 text-green-800' : 'bg-muted border-border text-muted-foreground'
          }`}>
            {rebanhoStatus === 'fechado' ? <CheckCircle className="h-3.5 w-3.5" /> : <Clock className="h-3.5 w-3.5" />}
            Rebanho: {rebanhoStatus === 'fechado' ? 'Fechado' : 'Aberto'}
          </div>
        )}
        {valorRebanhoTotal > 0 && (
          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-md border text-[10px] font-semibold bg-blue-50 border-blue-300 text-blue-800">
            <DollarSign className="h-3.5 w-3.5" />
            Valor Rebanho: {valorRebanhoTotal.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 })}
          </div>
        )}
      </div>

      {/* Ano + régua de meses */}
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

      {/* Filtros secundários */}
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

      {/* Tabela */}
      <div className="bg-card rounded-lg shadow-sm border overflow-x-auto" style={{ maxWidth: 706 }}>
        {isLoading ? (
          <div className="p-8 text-center text-muted-foreground text-xs">Carregando dados oficiais...</div>
        ) : (
          <table className="text-[10px]" style={{ tableLayout: 'fixed', width: 706 }}>
            <colgroup>
              <col style={{ width: 85 }} />
              <col style={{ width: 55 }} />
              {COLUNAS_CONSOLIDADAS.map(col => (
                <col key={col.key} style={{ width: 65 }} />
              ))}
              <col style={{ width: 60 }} />
              <col style={{ width: 55 }} />
            </colgroup>
            <thead>
              <tr className={`border-b ${isRealizado ? 'bg-primary/15' : 'bg-orange-500/15'}`}>
                <th className={`text-left px-1.5 py-1 font-bold sticky left-0 ${isRealizado ? 'bg-primary/15 text-primary' : 'bg-orange-500/15 text-orange-700'}`}>
                  Categoria
                </th>
                <th className={`px-1.5 py-1 font-bold text-center ${isRealizado ? 'bg-primary/15 text-foreground' : 'bg-orange-500/15 text-foreground'}`}>
                  Saldo Ini.
                </th>
                {COLUNAS_CONSOLIDADAS.map(col => (
                  <th key={col.key} className={`px-1.5 py-1 font-bold text-center ${col.entrada ? 'text-success' : 'text-destructive'}`}>
                    {col.label}
                  </th>
                ))}
                <th className={`px-1.5 py-1 font-bold text-foreground text-center ${isRealizado ? 'bg-primary/15' : 'bg-orange-500/15'}`}>
                  Saldo Fin.
                </th>
                <th className={`px-1.5 py-1 font-bold text-foreground text-center ${isRealizado ? 'bg-primary/15' : 'bg-orange-500/15'}`}>
                  Peso (kg)
                </th>
              </tr>
            </thead>
            <tbody>
              {dadosMes.map((d, i) => {
                const isFemea = d.categoria_codigo.includes('_f') || d.categoria_codigo === 'vacas';
                const isSeparator = i > 0 && isFemea && !dadosMes[i - 1]?.categoria_codigo.includes('_f') && dadosMes[i - 1]?.categoria_codigo !== 'vacas';
                const catBg = isRealizado
                  ? (i % 2 === 0 ? 'bg-primary/5' : 'bg-primary/10')
                  : (i % 2 === 0 ? 'bg-orange-500/5' : 'bg-orange-500/10');

                const vals = [d.entradas_externas, d.evol_cat_entrada, d.saidas_externas, d.evol_cat_saida];

                return (
                  <tr key={d.categoria_id} className={`${i % 2 === 0 ? '' : 'bg-muted/30'} ${isSeparator ? 'border-t-2 border-border' : ''}`}>
                    <td className={`px-1.5 py-0.5 font-bold text-foreground sticky left-0 ${catBg}`}>
                      {d.categoria_nome}
                    </td>
                    <td className={`px-1.5 py-0.5 text-center font-semibold ${isRealizado ? 'bg-primary/5' : 'bg-orange-500/5'} ${d.saldo_inicial === 0 ? 'text-transparent' : 'text-foreground'}`}>
                      {d.saldo_inicial}
                    </td>
                    {vals.map((val, j) => (
                      <td key={j} className={`px-1.5 py-0.5 text-center font-semibold ${val > 0 ? (COLUNAS_CONSOLIDADAS[j].entrada ? 'text-success' : 'text-destructive') : 'text-transparent'}`}>
                        {val || '–'}
                      </td>
                    ))}
                    <td className={`px-1.5 py-0.5 text-center font-extrabold ${isRealizado ? 'bg-primary/5' : 'bg-orange-500/5'} ${d.saldo_final === 0 ? 'text-transparent' : 'text-foreground'}`}>
                      {d.saldo_final}
                    </td>
                    <td className={`px-1.5 py-0.5 text-center italic text-[9px] ${isRealizado ? 'bg-primary/5' : 'bg-orange-500/5'} ${!d.peso_medio_final || d.peso_medio_final <= 0 ? 'text-transparent' : 'text-foreground'}`}>
                      {formatPeso(d.peso_medio_final)}
                    </td>
                  </tr>
                );
              })}
              <tr className={`border-t-2 ${isRealizado ? 'bg-primary/15' : 'bg-orange-500/15'}`}>
                <td className={`px-1.5 py-1 font-extrabold text-foreground sticky left-0 ${isRealizado ? 'bg-primary/15' : 'bg-orange-500/15'}`}>TOTAL</td>
                <td className="px-1.5 py-1 text-center font-extrabold text-foreground">{totais.saldoIni}</td>
                <td className="px-1.5 py-1 text-center font-extrabold text-success">{totais.entradasExt || '–'}</td>
                <td className="px-1.5 py-1 text-center font-extrabold text-success">{totais.evolEntrada || '–'}</td>
                <td className="px-1.5 py-1 text-center font-extrabold text-destructive">{totais.saidasExt || '–'}</td>
                <td className="px-1.5 py-1 text-center font-extrabold text-destructive">{totais.evolSaida || '–'}</td>
                <td className="px-1.5 py-1 text-center font-extrabold text-foreground">{totais.saldoFin}</td>
                <td className={`px-1.5 py-1 text-center italic text-[9px] font-semibold ${!totais.pesoMedio || totais.pesoMedio <= 0 ? 'text-transparent' : 'text-foreground'}`}>
                  {formatPeso(totais.pesoMedio)}
                </td>
              </tr>
            </tbody>
          </table>
        )}
      </div>

      {/* Fonte */}
      <div className="text-[9px] text-muted-foreground/60 text-right pr-1">
        Fonte: vw_zoot_categoria_mensal (oficial)
        {dadosMes[0]?.fonte_oficial_mes && ` — ${dadosMes[0].fonte_oficial_mes}`}
      </div>
    </div>
  );
}
