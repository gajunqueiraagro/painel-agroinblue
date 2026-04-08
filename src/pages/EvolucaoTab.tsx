import { useState, useMemo } from 'react';
import { Lancamento, SaldoInicial, CATEGORIAS, isEntrada, isReclassificacao, Categoria } from '@/types/cattle';
import { format, parseISO } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useRebanhoOficial } from '@/hooks/useRebanhoOficial';

interface Props {
  lancamentos: Lancamento[];
  saldosIniciais: SaldoInicial[];
}

export function EvolucaoTab({ lancamentos, saldosIniciais }: Props) {
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

  const [anoFiltro, setAnoFiltro] = useState(String(new Date().getFullYear()));

  // FONTE OFICIAL: useRebanhoOficial para saldos por categoria
  const rebanhoOf = useRebanhoOficial({ ano: Number(anoFiltro), cenario: 'realizado' });

  const { meses, dados } = useMemo(() => {
    const lancFiltrados = lancamentos.filter(l => {
      try { return format(parseISO(l.data), 'yyyy') === anoFiltro; } catch { return false; }
    });

    if (lancFiltrados.length === 0 && saldosIniciais.filter(s => String(s.ano) === anoFiltro).length === 0)
      return { meses: [], dados: {} };

    const mesesSet = new Set<string>();
    lancFiltrados.forEach(l => {
      try { mesesSet.add(format(parseISO(l.data), 'yyyy-MM')); } catch {}
    });

    // Also add months from official view data
    for (let m = 1; m <= 12; m++) {
      const faz = rebanhoOf.getFazendaMes(m);
      if (faz && (faz.cabecasInicio > 0 || faz.cabecasFinal > 0)) {
        mesesSet.add(`${anoFiltro}-${String(m).padStart(2, '0')}`);
      }
    }

    const mesesArr = Array.from(mesesSet).sort();
    if (mesesArr.length === 0) return { meses: [], dados: {} };

    const primeiroAno = Number(anoFiltro);

    const dados: Record<Categoria, { saldoInicial: number; meses: Record<string, number> }> = {} as any;
    CATEGORIAS.forEach(c => {
      // FONTE OFICIAL: saldo inicial do ano = saldo inicial de janeiro da view
      const saldoIniView = rebanhoOf.getSaldoInicialMap(1);
      const saldoIni = saldoIniView.get(c.value) ??
        saldosIniciais.filter(s => s.ano === primeiroAno && s.categoria === c.value).reduce((sum, s) => sum + s.quantidade, 0);

      dados[c.value] = { saldoInicial: saldoIni, meses: {} };

      mesesArr.forEach(mes => {
        const mesNum = Number(mes.split('-')[1]);
        // FONTE OFICIAL: saldo final da view (se disponível)
        const saldoView = rebanhoOf.getSaldoMap(mesNum);
        const saldoOficial = saldoView.get(c.value);
        if (saldoOficial !== undefined) {
          dados[c.value].meses[mes] = saldoOficial;
          return;
        }

        // Fallback: cálculo por movimentação (mês sem fechamento)
        const prevMesIdx = mesesArr.indexOf(mes) - 1;
        const prevSaldo = prevMesIdx >= 0 ? (dados[c.value].meses[mesesArr[prevMesIdx]] ?? saldoIni) : saldoIni;
        const entradasMes = lancFiltrados.filter(l => {
          try { return format(parseISO(l.data), 'yyyy-MM') === mes && l.categoria === c.value && isEntrada(l.tipo); } catch { return false; }
        }).reduce((s, l) => s + l.quantidade, 0);
        const saidasMes = lancFiltrados.filter(l => {
          try { return format(parseISO(l.data), 'yyyy-MM') === mes && l.categoria === c.value && !isEntrada(l.tipo) && !isReclassificacao(l.tipo); } catch { return false; }
        }).reduce((s, l) => s + l.quantidade, 0);
        const reclassEntMes = lancFiltrados.filter(l => {
          try { return format(parseISO(l.data), 'yyyy-MM') === mes && l.tipo === 'reclassificacao' && l.categoriaDestino === c.value; } catch { return false; }
        }).reduce((s, l) => s + l.quantidade, 0);
        const reclassSaiMes = lancFiltrados.filter(l => {
          try { return format(parseISO(l.data), 'yyyy-MM') === mes && l.tipo === 'reclassificacao' && l.categoria === c.value; } catch { return false; }
        }).reduce((s, l) => s + l.quantidade, 0);
        dados[c.value].meses[mes] = prevSaldo + entradasMes - saidasMes + reclassEntMes - reclassSaiMes;
      });
    });

    return { meses: mesesArr, dados };
  }, [lancamentos, saldosIniciais, anoFiltro, rebanhoOf.loading, rebanhoOf.getSaldoMap, rebanhoOf.getSaldoInicialMap, rebanhoOf.getFazendaMes]);

  if (meses.length === 0) {
    return (
      <div className="p-4 w-full animate-fade-in pb-20">
        <div className="text-center py-10">
          <p className="text-muted-foreground text-lg font-semibold">Nenhum dado ainda</p>
          <p className="text-muted-foreground text-sm mt-1">Faça lançamentos para ver a evolução</p>
        </div>
      </div>
    );
  }

  const totalSaldoInicial = CATEGORIAS.reduce((s, c) => s + (dados[c.value]?.saldoInicial || 0), 0);

  return (
    <div className="w-full px-4 animate-fade-in pb-20">
      {/* Filtro de ano - sticky */}
      <div className="sticky top-0 z-20 bg-background border-b border-border/50 shadow-sm px-4 py-2">
        <div className="w-40">
          <Select value={anoFiltro} onValueChange={setAnoFiltro}>
            <SelectTrigger className="touch-target text-base font-bold">
              <SelectValue placeholder="Ano" />
            </SelectTrigger>
            <SelectContent>
              {anosDisponiveis.map(a => (
                <SelectItem key={a} value={a} className="text-base">{a}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="p-4 space-y-4">

      <div className="bg-card rounded-lg shadow-sm border overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-primary/10">
              <th className="text-left px-3 py-2 font-bold text-foreground sticky left-0 bg-primary/10 min-w-[100px]">
                Categoria
              </th>
              <th className="px-3 py-2 font-bold text-foreground text-center min-w-[70px] bg-primary/20">
                Saldo Ini.
              </th>
              {meses.map(m => (
                <th key={m} className="px-3 py-2 font-bold text-foreground text-center whitespace-nowrap min-w-[70px]">
                  {format(parseISO(m + '-01'), 'MMM/yy', { locale: ptBR })}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {CATEGORIAS.map((cat, i) => (
              <tr key={cat.value} className={i % 2 === 0 ? '' : 'bg-muted/30'}>
                <td className={`px-3 py-2 font-bold text-foreground sticky left-0 ${i % 2 === 0 ? 'bg-card' : 'bg-muted/30'}`}>
                  {cat.label}
                </td>
                <td className="px-3 py-2 text-center font-semibold text-foreground bg-primary/5">
                  {dados[cat.value]?.saldoInicial || 0}
                </td>
                {meses.map(m => (
                  <td key={m} className="px-3 py-2 text-center font-semibold text-foreground">
                    {dados[cat.value]?.meses[m] || 0}
                  </td>
                ))}
              </tr>
            ))}
            {/* Total row */}
            <tr className="border-t-2 bg-primary/10">
              <td className="px-3 py-2 font-extrabold text-foreground sticky left-0 bg-primary/10">TOTAL</td>
              <td className="px-3 py-2 text-center font-extrabold text-foreground">{totalSaldoInicial}</td>
              {meses.map(m => {
                const total = CATEGORIAS.reduce((s, c) => s + (dados[c.value]?.meses[m] || 0), 0);
                return (
                  <td key={m} className="px-3 py-2 text-center font-extrabold text-foreground">{total}</td>
                );
              })}
            </tr>
          </tbody>
        </table>
      </div>
      </div>
    </div>
  );
}
