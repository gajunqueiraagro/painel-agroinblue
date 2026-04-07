import { useState, useMemo, useEffect } from 'react';
import { Lancamento, SaldoInicial, CATEGORIAS, Categoria, isEntrada, isReclassificacao } from '@/types/cattle';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { filtrarPorCenario } from '@/lib/statusOperacional';
import { parseISO, format } from 'date-fns';
import { supabase } from '@/integrations/supabase/client';
import { useFazenda } from '@/contexts/FazendaContext';

import { CheckCircle, AlertTriangle, Clock, RefreshCw, DollarSign } from 'lucide-react';

interface Props {
  lancamentos: Lancamento[];
  saldosIniciais: SaldoInicial[];
  initialAno?: string;
  initialMes?: string;
  initialCenario?: 'realizado' | 'previsto' | 'meta';
  onNavigateToReclass?: (filtro?: { ano: string; mes: number }) => void;
}


const COLUNAS_MOV = [
  { tipo: 'nascimento', label: 'Nasc.', entrada: true },
  { tipo: 'compra', label: 'Compras', entrada: true },
  { tipo: 'transferencia_entrada', label: 'Transf.E', entrada: true },
  { tipo: 'reclassificacao_entrada', label: 'Recl.E', entrada: true },
  { tipo: 'abate', label: 'Abates', entrada: false },
  { tipo: 'venda', label: 'Vendas', entrada: false },
  { tipo: 'transferencia_saida', label: 'Transf.S', entrada: false },
  { tipo: 'consumo', label: 'Consumo', entrada: false },
  { tipo: 'morte', label: 'Mortes', entrada: false },
  { tipo: 'reclassificacao_saida', label: 'Recl.S', entrada: false },
];

export function EvolucaoCategoriaTab({ lancamentos, saldosIniciais, initialAno, initialMes, initialCenario, onNavigateToReclass }: Props) {
  const { fazendaAtual } = useFazenda();
  const fazendaId = fazendaAtual?.id;

  const anosDisponiveis = useMemo(() => {
    const anos = new Set<number>();
    anos.add(new Date().getFullYear());
    lancamentos.forEach(l => {
      try { anos.add(Number(format(parseISO(l.data), 'yyyy'))); } catch {}
    });
    saldosIniciais.forEach(s => anos.add(s.ano));
    const minAno = Math.min(...Array.from(anos));
    const maxAno = Math.max(...Array.from(anos));
    const result: string[] = [];
    for (let y = maxAno; y >= minAno; y--) {
      result.push(String(y));
    }
    return result;
  }, [lancamentos, saldosIniciais]);

  const [anoFiltro, setAnoFiltro] = useState(initialAno || String(new Date().getFullYear()));
  const [mesFiltro, setMesFiltro] = useState(initialMes || format(new Date(), 'MM'));
  const [statusFiltro, setStatusFiltro] = useState<'realizado' | 'meta'>(initialCenario === 'previsto' || initialCenario === 'meta' ? 'meta' : 'realizado');
  const [pesosDb, setPesosDb] = useState<Record<string, number>>({});
  const [conciliacaoStatus, setConciliacaoStatus] = useState<'aberto' | 'fechado' | 'parcial' | null>(null);
  const [rebanhoStatus, setRebanhoStatus] = useState<'aberto' | 'fechado' | null>(null);
  const [precosRebanho, setPrecosRebanho] = useState<Record<string, number>>({});

  // Fetch conciliação status for the selected month/fazenda
  useEffect(() => {
    const anoMes = `${anoFiltro}-${mesFiltro}`;
    if (!fazendaId || fazendaId === '__global__') {
      setConciliacaoStatus(null);
      return;
    }

    (async () => {
      try {
        const { data: pastos } = await supabase
          .from('pastos')
          .select('id')
          .eq('fazenda_id', fazendaId)
          .eq('ativo', true)
          .eq('entra_conciliacao', true);

        const totalPastos = (pastos || []).length;
        if (totalPastos === 0) {
          setConciliacaoStatus(null);
          return;
        }

        const { data: fechamentos } = await supabase
          .from('fechamento_pastos')
          .select('pasto_id, status')
          .eq('fazenda_id', fazendaId)
          .eq('ano_mes', anoMes);

        const fechados = (fechamentos || []).filter(f => f.status === 'fechado' || f.status === 'realizado').length;

        if (fechados === 0) setConciliacaoStatus('aberto');
        else if (fechados >= totalPastos) setConciliacaoStatus('fechado');
        else setConciliacaoStatus('parcial');
      } catch {
        setConciliacaoStatus(null);
      }
    })();
  }, [fazendaId, anoFiltro, mesFiltro]);

  // Fetch valor rebanho fechamento status
  useEffect(() => {
    const anoMes = `${anoFiltro}-${mesFiltro}`;
    if (!fazendaId || fazendaId === '__global__') {
      setRebanhoStatus(null);
      return;
    }
    (async () => {
      try {
        const { data } = await supabase
          .from('valor_rebanho_fechamento')
          .select('status')
          .eq('fazenda_id', fazendaId)
          .eq('ano_mes', anoMes)
          .maybeSingle();
        setRebanhoStatus(data?.status === 'fechado' ? 'fechado' : 'aberto');
      } catch {
        setRebanhoStatus(null);
      }
    })();
  }, [fazendaId, anoFiltro, mesFiltro]);

  // Fetch preços do valor do rebanho para o mês
  useEffect(() => {
    const anoMes = `${anoFiltro}-${mesFiltro}`;
    if (!fazendaId || fazendaId === '__global__') {
      setPrecosRebanho({});
      return;
    }
    (async () => {
      try {
        const { data } = await supabase
          .from('valor_rebanho_mensal')
          .select('categoria, preco_kg')
          .eq('fazenda_id', fazendaId)
          .eq('ano_mes', anoMes);
        const map: Record<string, number> = {};
        (data || []).forEach((r: any) => { if (r.preco_kg > 0) map[r.categoria] = r.preco_kg; });
        setPrecosRebanho(map);
      } catch {
        setPrecosRebanho({});
      }
    })();
  }, [fazendaId, anoFiltro, mesFiltro]);


  // Fetch pesos from fechamento_pastos + fechamento_pasto_itens
  useEffect(() => {
    const anoMes = `${anoFiltro}-${mesFiltro}`;
    if (!fazendaId || fazendaId === '__global__') {
      setPesosDb({});
      return;
    }

    (async () => {
      try {
        const { data: fechamentos } = await supabase
          .from('fechamento_pastos')
          .select('id')
          .eq('fazenda_id', fazendaId)
          .eq('ano_mes', anoMes);

        const fechIds = (fechamentos || []).map(f => f.id);

        const { data: catData } = await supabase
          .from('categorias_rebanho')
          .select('id, codigo');
        const catMap: Record<string, string> = {};
        (catData || []).forEach(c => { catMap[c.id] = c.codigo; });

        const pesosPorCat: Record<string, { somaQtdPeso: number; somaQtd: number }> = {};

        if (fechIds.length > 0) {
          const { data: itens } = await supabase
            .from('fechamento_pasto_itens')
            .select('categoria_id, peso_medio_kg, quantidade')
            .in('fechamento_id', fechIds);

          (itens || []).forEach((item) => {
            const codigo = catMap[item.categoria_id];
            if (!codigo) return;
            if (!item.peso_medio_kg || item.peso_medio_kg <= 0) return;
            if (!pesosPorCat[codigo]) pesosPorCat[codigo] = { somaQtdPeso: 0, somaQtd: 0 };
            pesosPorCat[codigo].somaQtdPeso += item.quantidade * item.peso_medio_kg;
            pesosPorCat[codigo].somaQtd += item.quantidade;
          });
        }

        const result: Record<string, number> = {};
        for (const [cod, v] of Object.entries(pesosPorCat)) {
          if (v.somaQtd > 0) result[cod] = v.somaQtdPeso / v.somaQtd;
        }

        // Fallback: if no fechamento data, use saldosIniciais peso_medio_kg
        if (Object.keys(result).length === 0) {
          saldosIniciais
            .filter(s => s.ano === Number(anoFiltro) && s.pesoMedioKg && s.pesoMedioKg > 0)
            .forEach(s => { result[s.categoria] = s.pesoMedioKg!; });
        }

        setPesosDb(result);
      } catch {
        const result: Record<string, number> = {};
        saldosIniciais
          .filter(s => s.ano === Number(anoFiltro) && s.pesoMedioKg && s.pesoMedioKg > 0)
          .forEach(s => { result[s.categoria] = s.pesoMedioKg!; });
        setPesosDb(result);
      }
    })();
  }, [fazendaId, anoFiltro, mesFiltro, saldosIniciais]);

  const lancFiltrados = useMemo(() => {
    const cenario = statusFiltro === 'realizado' ? 'realizado' : 'meta';
    return filtrarPorCenario(lancamentos, cenario);
  }, [lancamentos, statusFiltro]);

  const dados = useMemo(() => {
    const mesKey = `${anoFiltro}-${mesFiltro}`;

    const filtrados = lancFiltrados.filter(l => {
      try {
        return format(parseISO(l.data), 'yyyy-MM') === mesKey;
      } catch { return false; }
    });

    const anteriores = lancFiltrados.filter(l => {
      try {
        return format(parseISO(l.data), 'yyyy-MM') < mesKey;
      } catch { return false; }
    });

    return CATEGORIAS.map(cat => {
      const saldoAno = saldosIniciais
        .filter(s => s.ano === Number(anoFiltro) && s.categoria === cat.value)
        .reduce((sum, s) => sum + s.quantidade, 0);

      const anterioresAno = anteriores.filter(l => {
        try {
          return format(parseISO(l.data), 'yyyy') === anoFiltro;
        } catch { return false; }
      });

      const entradasAnt = anterioresAno
        .filter(l => l.categoria === cat.value && isEntrada(l.tipo))
        .reduce((s, l) => s + l.quantidade, 0);
      const saidasAnt = anterioresAno
        .filter(l => l.categoria === cat.value && !isEntrada(l.tipo) && !isReclassificacao(l.tipo))
        .reduce((s, l) => s + l.quantidade, 0);
      const reclassEntAnt = anterioresAno
        .filter(l => l.tipo === 'reclassificacao' && l.categoriaDestino === cat.value)
        .reduce((s, l) => s + l.quantidade, 0);
      const reclassSaiAnt = anterioresAno
        .filter(l => l.tipo === 'reclassificacao' && l.categoria === cat.value)
        .reduce((s, l) => s + l.quantidade, 0);

      const saldoInicioMes = saldoAno + entradasAnt - saidasAnt + reclassEntAnt - reclassSaiAnt;

      const getQtd = (tipo: string) => {
        if (tipo === 'reclassificacao_entrada') {
          return filtrados
            .filter(l => l.tipo === 'reclassificacao' && l.categoriaDestino === cat.value)
            .reduce((s, l) => s + l.quantidade, 0);
        }
        if (tipo === 'reclassificacao_saida') {
          return filtrados
            .filter(l => l.tipo === 'reclassificacao' && l.categoria === cat.value)
            .reduce((s, l) => s + l.quantidade, 0);
        }
        return filtrados
          .filter(l => l.tipo === tipo && l.categoria === cat.value)
          .reduce((s, l) => s + l.quantidade, 0);
      };

      const movs = COLUNAS_MOV.map(col => getQtd(col.tipo));

      const totalEntradas = movs.slice(0, 4).reduce((a, b) => a + b, 0);
      const totalSaidas = movs.slice(4).reduce((a, b) => a + b, 0);
      const saldoFinal = saldoInicioMes + totalEntradas - totalSaidas;

      const pesoMedio = pesosDb[cat.value] || null;

      return { ...cat, saldoInicioMes, movs, saldoFinal, pesoMedio };
    });
  }, [lancFiltrados, saldosIniciais, anoFiltro, mesFiltro, pesosDb]);

  const totais = useMemo(() => {
    const saldoIni = dados.reduce((s, d) => s + d.saldoInicioMes, 0);
    const movs = COLUNAS_MOV.map((_, i) => dados.reduce((s, d) => s + d.movs[i], 0));
    const saldoFin = dados.reduce((s, d) => s + d.saldoFinal, 0);

    // Weighted average peso
    const somaPeso = dados.reduce((s, d) => s + (d.pesoMedio && d.saldoFinal > 0 ? d.saldoFinal * d.pesoMedio : 0), 0);
    const somaQtd = dados.reduce((s, d) => s + (d.pesoMedio && d.saldoFinal > 0 ? d.saldoFinal : 0), 0);
    const pesoMedio = somaQtd > 0 ? somaPeso / somaQtd : null;

    return { saldoIni, movs, saldoFin, pesoMedio };
  }, [dados]);

  const valorRebanhoTotal = useMemo(() => {
    let total = 0;
    dados.forEach(d => {
      const preco = precosRebanho[d.value];
      if (preco && d.pesoMedio && d.saldoFinal > 0) {
        total += d.saldoFinal * d.pesoMedio * preco;
      }
    });
    return total;
  }, [dados, precosRebanho]);

  const isRealizado = statusFiltro === 'realizado';

  const formatPeso = (v: number | null) => {
    if (v === null || v === undefined || v <= 0) return '—';
    return v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  };

  const MESES_CURTOS = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'];

  return (
    <div className="p-3 w-full space-y-1 animate-fade-in pb-20">
      {/* Status badges — alinhados à direita, na mesma altura do título do parent */}
      <div className="flex items-center justify-end gap-2 -mt-7">
        {isRealizado && conciliacaoStatus && (
          <div className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md border text-[10px] font-semibold ${
            conciliacaoStatus === 'fechado'
              ? 'bg-green-50 border-green-300 text-green-800'
              : conciliacaoStatus === 'parcial'
                ? 'bg-orange-50 border-orange-300 text-orange-800'
                : 'bg-muted border-border text-muted-foreground'
          }`}>
            {conciliacaoStatus === 'fechado' ? (
              <CheckCircle className="h-3.5 w-3.5" />
            ) : conciliacaoStatus === 'parcial' ? (
              <AlertTriangle className="h-3.5 w-3.5" />
            ) : (
              <Clock className="h-3.5 w-3.5" />
            )}
            Pasto: {conciliacaoStatus === 'fechado' ? 'Fechado' : conciliacaoStatus === 'parcial' ? 'Parcial' : 'Aberto'}
          </div>
        )}
        {isRealizado && rebanhoStatus && (
          <div className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md border text-[10px] font-semibold ${
            rebanhoStatus === 'fechado'
              ? 'bg-green-50 border-green-300 text-green-800'
              : 'bg-muted border-border text-muted-foreground'
          }`}>
            {rebanhoStatus === 'fechado' ? (
              <CheckCircle className="h-3.5 w-3.5" />
            ) : (
              <Clock className="h-3.5 w-3.5" />
            )}
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
            { value: 'previsto' as const, label: 'Previsto' },
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
          <table className="text-[10px]" style={{ tableLayout: 'fixed', width: 706 }}>
            <colgroup>
              <col style={{ width: 75 }} />
              <col style={{ width: 46 }} />
              {COLUNAS_MOV.map(col => (
                <col key={col.tipo} style={{ width: 48 }} />
              ))}
              <col style={{ width: 53 }} />
              <col style={{ width: 52 }} />
            </colgroup>
            <thead>
              <tr className={`border-b ${isRealizado ? 'bg-primary/15' : 'bg-orange-500/15'}`}>
                <th className={`text-left px-1.5 py-1 font-bold sticky left-0 ${isRealizado ? 'bg-primary/15 text-primary' : 'bg-orange-500/15 text-orange-700'}`}>
                  Categoria
                </th>
                <th className={`px-1.5 py-1 font-bold text-center ${isRealizado ? 'bg-primary/15 text-foreground' : 'bg-orange-500/15 text-foreground'}`}>
                  Saldo Ini.
                </th>
                {COLUNAS_MOV.map(col => (
                  <th key={col.tipo} className={`px-1.5 py-1 font-bold text-center ${col.entrada ? 'text-success' : 'text-destructive'}`}>
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
              {dados.map((cat, i) => {
                const isSeparator = cat.value === 'mamotes_f';
                const catBg = isRealizado
                  ? (i % 2 === 0 ? 'bg-primary/5' : 'bg-primary/10')
                  : (i % 2 === 0 ? 'bg-orange-500/5' : 'bg-orange-500/10');
                return (
                  <tr key={cat.value} className={`${i % 2 === 0 ? '' : 'bg-muted/30'} ${isSeparator ? 'border-t-2 border-border' : ''}`}>
                    <td className={`px-1.5 py-0.5 font-bold text-foreground sticky left-0 ${catBg}`}>
                      {cat.label}
                    </td>
                    <td className={`px-1.5 py-0.5 text-center font-semibold ${isRealizado ? 'bg-primary/5' : 'bg-orange-500/5'} ${cat.saldoInicioMes === 0 ? 'text-transparent' : 'text-foreground'}`}>
                      {cat.saldoInicioMes}
                    </td>
                    {cat.movs.map((val, j) => (
                      <td key={j} className={`px-1.5 py-0.5 text-center font-semibold ${val > 0 ? (COLUNAS_MOV[j].entrada ? 'text-success' : 'text-destructive') : 'text-transparent'}`}>
                        {val || '–'}
                      </td>
                    ))}
                    <td className={`px-1.5 py-0.5 text-center font-extrabold ${isRealizado ? 'bg-primary/5' : 'bg-orange-500/5'} ${cat.saldoFinal === 0 ? 'text-transparent' : 'text-foreground'}`}>
                      {cat.saldoFinal}
                    </td>
                    <td className={`px-1.5 py-0.5 text-center italic text-[9px] ${isRealizado ? 'bg-primary/5' : 'bg-orange-500/5'} ${!cat.pesoMedio || cat.pesoMedio <= 0 ? 'text-transparent' : 'text-foreground'}`}>
                      {formatPeso(cat.pesoMedio)}
                    </td>
                  </tr>
                );
              })}
              <tr className={`border-t-2 ${isRealizado ? 'bg-primary/15' : 'bg-orange-500/15'}`}>
                <td className={`px-1.5 py-1 font-extrabold text-foreground sticky left-0 ${isRealizado ? 'bg-primary/15' : 'bg-orange-500/15'}`}>TOTAL</td>
                <td className="px-1.5 py-1 text-center font-extrabold text-foreground">{totais.saldoIni}</td>
                {totais.movs.map((val, j) => (
                  <td key={j} className={`px-1.5 py-1 text-center font-extrabold ${val > 0 ? (COLUNAS_MOV[j].entrada ? 'text-success' : 'text-destructive') : 'text-transparent'}`}>
                    {val || '–'}
                  </td>
                ))}
                <td className="px-1.5 py-1 text-center font-extrabold text-foreground">{totais.saldoFin}</td>
                <td className={`px-1.5 py-1 text-center italic text-[9px] font-semibold ${!totais.pesoMedio || totais.pesoMedio <= 0 ? 'text-transparent' : 'text-foreground'}`}>
                  {formatPeso(totais.pesoMedio)}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
    </div>
  );
}
